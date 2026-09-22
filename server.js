const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TRAVELPAYOUTS_API_TOKEN = process.env.TRAVELPAYOUTS_API_TOKEN || "";
const TRAVELPAYOUTS_WHITE_LABEL_ID = process.env.TRAVELPAYOUTS_WHITE_LABEL_ID || "21705";
const TRAVELPAYOUTS_WHITE_LABEL_URL = process.env.TRAVELPAYOUTS_WHITE_LABEL_URL || "https://aviakassahavo.onrender.com/";
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || "aviakassa_havo_meta_verify_2026";
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || "";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const AI_AUTO_REPLY = String(process.env.AI_AUTO_REPLY || "true").toLowerCase() !== "false";
const DEFAULT_FLIGHT_MARKUP_RUB = Number.isFinite(Number(process.env.FLIGHT_MARKUP_RUB)) ? Math.max(0, Number(process.env.FLIGHT_MARKUP_RUB)) : 500;
const publicDir = __dirname;
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const sessions = new Map();
let sessionEpoch = 1;
const loginAttempts = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;
const LOGIN_WINDOW = 10 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored || "").split(":");
    if (!salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
  } catch { return false; }
}
function issueSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { ...user, epoch: sessionEpoch, issuedAt: Date.now(), expires: Date.now() + SESSION_TTL });
  return token;
}
function getSession(req) {
  const h = String(req.headers.authorization || "");
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  const s = sessions.get(token);
  if (!s) return null;
  if (s.epoch !== sessionEpoch) { sessions.delete(token); return null; }
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  s.expires = Date.now() + SESSION_TTL;
  return s;
}
function authorized(req) { return getSession(req); }
function safe(v,max=300){ return String(v??"").trim().slice(0,max); }
function send(res, code, data, type="application/json", extraHeaders={}){
  res.writeHead(code, {"Content-Type": type, "Cache-Control":"no-store", ...extraHeaders});
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
function parseBody(req){
  return new Promise((resolve,reject)=>{
    let body="";
    req.on("data",c=>{body+=c; if(body.length>300000){req.destroy(); reject(new Error("BODY_TOO_LARGE"));}});
    req.on("end",()=>{try{resolve(JSON.parse(body||"{}"))}catch(e){reject(e)}});
    req.on("error",reject);
  });
}
function rateLimited(ip){
  const now=Date.now();
  const x=loginAttempts.get(ip);
  if(!x || now-x.started>LOGIN_WINDOW){loginAttempts.set(ip,{started:now,count:0});return false;}
  return x.count>=MAX_LOGIN_ATTEMPTS;
}
function countFailed(ip){
  const now=Date.now(), x=loginAttempts.get(ip);
  if(!x || now-x.started>LOGIN_WINDOW) loginAttempts.set(ip,{started:now,count:1});
  else x.count++;
}
function clearFailed(ip){ loginAttempts.delete(ip); }
function validDate(v){ return !v || /^\d{4}-\d{2}-\d{2}$/.test(String(v)); }
const ALL_PERMISSIONS = ["bookings_view","bookings_edit","export_excel","flights_manage","offers_manage","directions_manage"];
const DEFAULT_MANAGER_PERMISSIONS = ["bookings_view","bookings_edit","export_excel"];
function hasPermission(user, permission){ return user?.role === "admin" || Array.isArray(user?.permissions) && user.permissions.includes(permission); }
function revokeUserSessions(userId){ for(const [token,s] of sessions){ if(String(s.id||"")===String(userId||"")) sessions.delete(token); } }
function revokeAllSessions(){ sessionEpoch++; sessions.clear(); }
async function getFlightMarkup(){
  if(!pool) return DEFAULT_FLIGHT_MARKUP_RUB;
  try{
    const q=await pool.query("SELECT value FROM site_settings WHERE key=$1 LIMIT 1",["flight_markup_rub"]);
    if(q.rowCount){ const n=Number(q.rows[0].value); if(Number.isFinite(n) && n>=0) return n; }
  }catch(e){ console.error("markup read error:",e.message); }
  return DEFAULT_FLIGHT_MARKUP_RUB;
}
async function setFlightMarkup(value){
  const n=Number(value);
  if(!Number.isFinite(n) || n<0 || n>1000000) throw new Error("INVALID_MARKUP");
  if(!pool) throw new Error("DATABASE_NOT_CONFIGURED");
  await pool.query(`INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,["flight_markup_rub",String(Math.round(n))]);
  return Math.round(n);
}

async function initDb(){
  if(!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGSERIAL PRIMARY KEY,
      request_code VARCHAR(40) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      from_city TEXT NOT NULL,
      to_city TEXT NOT NULL,
      departure_date DATE NOT NULL,
      return_date DATE,
      passengers TEXT NOT NULL,
      baggage TEXT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'new',
      notes TEXT DEFAULT '',
      manager_id BIGINT
    );
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS manager_id BIGINT;
    CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings(created_at DESC);
    CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);

    CREATE TABLE IF NOT EXISTS managers (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      username VARCHAR(80) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'manager',
      permissions JSONB NOT NULL DEFAULT '["bookings_view","bookings_edit","export_excel"]'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE managers ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '["bookings_view","bookings_edit","export_excel"]'::jsonb;
    CREATE TABLE IF NOT EXISTS flights (
      id BIGSERIAL PRIMARY KEY,
      from_city TEXT NOT NULL,
      from_country TEXT NOT NULL,
      from_airport TEXT NOT NULL DEFAULT '',
      from_airport_code VARCHAR(10) NOT NULL DEFAULT '',
      to_city TEXT NOT NULL,
      to_country TEXT NOT NULL,
      to_airport TEXT NOT NULL DEFAULT '',
      to_airport_code VARCHAR(10) NOT NULL DEFAULT '',
      flight_date DATE NOT NULL,
      flight_time VARCHAR(20) NOT NULL,
      airline TEXT NOT NULL,
      baggage TEXT NOT NULL DEFAULT '',
      price TEXT NOT NULL DEFAULT '0',
      currency VARCHAR(10) NOT NULL DEFAULT 'TJS',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE flights ADD COLUMN IF NOT EXISTS from_airport TEXT NOT NULL DEFAULT '';
    ALTER TABLE flights ADD COLUMN IF NOT EXISTS from_airport_code VARCHAR(10) NOT NULL DEFAULT '';
    ALTER TABLE flights ADD COLUMN IF NOT EXISTS to_airport TEXT NOT NULL DEFAULT '';
    ALTER TABLE flights ADD COLUMN IF NOT EXISTS to_airport_code VARCHAR(10) NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS offers (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      discount TEXT DEFAULT '',
      valid_until DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS directions (
      id BIGSERIAL PRIMARY KEY,
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      code VARCHAR(10) DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(city,country)
    );
    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ai_leads (
      id BIGSERIAL PRIMARY KEY,
      instagram_user_id TEXT NOT NULL,
      username TEXT DEFAULT '',
      language VARCHAR(10) DEFAULT '',
      intent VARCHAR(40) DEFAULT 'general',
      name TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      from_city TEXT DEFAULT '',
      to_city TEXT DEFAULT '',
      departure_date DATE,
      return_date DATE,
      passengers VARCHAR(30) DEFAULT '',
      baggage TEXT DEFAULT '',
      last_message TEXT DEFAULT '',
      ai_reply TEXT DEFAULT '',
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      handoff BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(instagram_user_id)
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id BIGSERIAL PRIMARY KEY,
      instagram_user_id TEXT NOT NULL,
      message_id TEXT UNIQUE,
      direction VARCHAR(10) NOT NULL,
      message_text TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ai_messages_user_idx ON ai_messages(instagram_user_id, created_at DESC);
  `);
  // Price is stored as text so admin can enter symbols, currencies, and phrases.
  await pool.query(`ALTER TABLE flights ALTER COLUMN price TYPE TEXT USING regexp_replace(price::text, '\\.00$', ''), ALTER COLUMN price SET DEFAULT '0'`);
  // Keep the existing Render ADMIN_PASSWORD as the master admin account.
  if(ADMIN_PASSWORD){
    const existing=await pool.query(`SELECT id FROM managers WHERE username='admin' LIMIT 1`);
    if(!existing.rowCount) await pool.query(`INSERT INTO managers(name,username,password_hash,role) VALUES($1,$2,$3,$4)`,["Главный администратор","admin",hashPassword(ADMIN_PASSWORD),"admin"]);
  }
}

async function instagramGraph(pathname, options={}){
  if(!META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN_NOT_CONFIGURED");
  const url=`https://graph.instagram.com/${META_GRAPH_VERSION}${pathname}`;
  const headers={"Authorization":`Bearer ${META_ACCESS_TOKEN}`,...(options.headers||{})};
  const r=await fetch(url,{...options,headers});
  const text=await r.text();
  let data={}; try{data=JSON.parse(text)}catch{data={raw:text}};
  if(!r.ok) throw new Error(`META_${r.status}: ${data?.error?.message || text.slice(0,500)}`);
  return data;
}
async function sendInstagramText(recipientId,text){
  const clean=String(text||"").trim();
  if(!clean) return null;
  const bytes=Buffer.byteLength(clean,"utf8");
  const reply=bytes>950 ? clean.slice(0,900)+"…" : clean;
  return instagramGraph(`/me/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:{id:String(recipientId)},message:{text:reply}})});
}

const IATA_BY_CITY={
  "москва":"MOW","moscow":"MOW","мск":"MOW",
  "душанбе":"DYU","dushanbe":"DYU",
  "ташкент":"TAS","tashkent":"TAS",
  "самарканд":"SKD","samarkand":"SKD",
  "алматы":"ALA","almaty":"ALA",
  "астана":"NQZ","нур-султан":"NQZ","astana":"NQZ","nur-sultan":"NQZ",
  "бишкек":"FRU","bishkek":"FRU",
  "стамбул":"IST","istanbul":"IST",
  "дубай":"DXB","dubai":"DXB",
  "анталья":"AYT","antalya":"AYT",
  "екатеринбург":"SVX","yekaterinburg":"SVX",
  "новосибирск":"OVB","novosibirsk":"OVB",
  "санкт-петербург":"LED","петербург":"LED","saint petersburg":"LED","st petersburg":"LED",
  "казань":"KZN","kazan":"KZN",
  "уфа":"UFA","ufa":"UFA",
  "красноярск":"KJA","krasnoyarsk":"KJA",
  "сочи":"AER","sochi":"AER",
  "пермь":"PEE","perm":"PEE",
  "оренбург":"REN","orenburg":"REN"
};
function cityToIata(value){
  const v=String(value||"").trim().toLowerCase();
  if(/^[a-z]{3}$/i.test(v)) return v.toUpperCase();
  return IATA_BY_CITY[v]||"";
}
function normalizePassengers(value){
  const m=String(value||"").match(/[1-9]/);
  return m?m[0]:"1";
}
function buildWhiteLabelSearchUrl(ai){
  const origin=cityToIata(ai.from_city), destination=cityToIata(ai.to_city);
  const dep=String(ai.departure_date||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!origin||!destination||!dep) return "";
  let code=`${origin}${dep[3]}${dep[2]}${destination}`;
  const ret=String(ai.return_date||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(ret) code+=`${ret[3]}${ret[2]}`;
  code+=normalizePassengers(ai.passengers);
  const base=TRAVELPAYOUTS_WHITE_LABEL_URL.endsWith("/")?TRAVELPAYOUTS_WHITE_LABEL_URL:TRAVELPAYOUTS_WHITE_LABEL_URL+"/";
  return `${base}?flightSearch=${encodeURIComponent(code)}`;
}
async function sendInstagramFlightButton(recipientId,ai){
  const url=buildWhiteLabelSearchUrl(ai);
  if(!url) return null;
  const labels={ru:"✈️ Смотреть билеты",tj:"✈️ Дидани парвозҳо",en:"✈️ View flights"};
  const title={ru:"Ваш поиск готов ✈️",tj:"Ҷустуҷӯи шумо омода аст ✈️",en:"Your search is ready ✈️"};
  const subtitle={ru:"Нажмите кнопку — откроются актуальные рейсы и цены.",tj:"Тугмаро пахш кунед — парвозҳо ва нархҳои ҷорӣ кушода мешаванд.",en:"Tap the button to see current flights and prices."};
  const payload={recipient:{id:String(recipientId)},message:{attachment:{type:"template",payload:{template_type:"generic",elements:[{title:title[ai.language]||title.ru,subtitle:subtitle[ai.language]||subtitle.ru,buttons:[{type:"web_url",url,title:labels[ai.language]||labels.ru}]}]}}}};
  try{return await instagramGraph(`/me/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})}
  catch(e){console.error("Instagram flight button error:",e.message);return null;}
}
function extractInstagramMessages(body){
  const out=[];
  const entries=Array.isArray(body?.entry)?body.entry:[];
  for(const entry of entries){
    // Instagram Messaging webhooks can arrive in the entry.messaging format.
    // Some Meta webhook payloads can also use entry.changes[].value.
    const candidates=[];
    if(Array.isArray(entry?.messaging)) candidates.push(...entry.messaging);
    const changes=Array.isArray(entry?.changes)?entry.changes:[];
    for(const change of changes){
      if(change?.field!=="messages" && change?.field!=="messaging") continue;
      const v=change.value||{};
      if(Array.isArray(v.messages)) candidates.push(...v.messages);
      else candidates.push(v);
    }
    for(const item of candidates){
      const msg=item?.message||{};
      const sender=item?.sender?.id || msg?.sender?.id;
      const recipient=item?.recipient?.id || msg?.recipient?.id;
      const mid=msg?.mid || item?.mid || item?.message_id || "";
      const text=typeof msg?.text==="string"?msg.text.trim():"";
      const attachments=Array.isArray(msg?.attachments)?msg.attachments:[];
      if(sender && recipient && (text || attachments.length)) out.push({senderId:String(sender),recipientId:String(recipient),mid:String(mid||""),text,attachments,timestamp:item?.timestamp||Date.now()});
    }
  }
  return out;
}
async function getRecentAiHistory(instagramUserId){
  if(!pool) return [];
  const q=await pool.query(`SELECT direction,message_text FROM ai_messages WHERE instagram_user_id=$1 ORDER BY created_at DESC LIMIT 12`,[instagramUserId]);
  return q.rows.reverse();
}
async function upsertAiLead(data){
  if(!pool) return null;
  const date = data.departure_date && /^\d{4}-\d{2}-\d{2}$/.test(data.departure_date) ? data.departure_date : null;
  const ret = data.return_date && /^\d{4}-\d{2}-\d{2}$/.test(data.return_date) ? data.return_date : null;
  const q=await pool.query(`INSERT INTO ai_leads(instagram_user_id,username,language,intent,name,phone,from_city,to_city,departure_date,return_date,passengers,baggage,last_message,ai_reply,status,handoff,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()) ON CONFLICT(instagram_user_id) DO UPDATE SET username=EXCLUDED.username,language=EXCLUDED.language,intent=EXCLUDED.intent,name=CASE WHEN EXCLUDED.name<>'' THEN EXCLUDED.name ELSE ai_leads.name END,phone=CASE WHEN EXCLUDED.phone<>'' THEN EXCLUDED.phone ELSE ai_leads.phone END,from_city=CASE WHEN EXCLUDED.from_city<>'' THEN EXCLUDED.from_city ELSE ai_leads.from_city END,to_city=CASE WHEN EXCLUDED.to_city<>'' THEN EXCLUDED.to_city ELSE ai_leads.to_city END,departure_date=COALESCE(EXCLUDED.departure_date,ai_leads.departure_date),return_date=COALESCE(EXCLUDED.return_date,ai_leads.return_date),passengers=CASE WHEN EXCLUDED.passengers<>'' THEN EXCLUDED.passengers ELSE ai_leads.passengers END,baggage=CASE WHEN EXCLUDED.baggage<>'' THEN EXCLUDED.baggage ELSE ai_leads.baggage END,last_message=EXCLUDED.last_message,ai_reply=EXCLUDED.ai_reply,status=EXCLUDED.status,handoff=EXCLUDED.handoff,updated_at=NOW() RETURNING *`,[data.instagram_user_id,data.username||"",data.language||"",data.intent||"general",data.name||"",data.phone||"",data.from_city||"",data.to_city||"",date,ret,data.passengers||"",data.baggage||"",data.last_message||"",data.ai_reply||"",data.status||"new",!!data.handoff]);
  return q.rows[0];
}
async function saveAiMessage(userId,messageId,direction,text){
  if(!pool) return;
  try{await pool.query(`INSERT INTO ai_messages(instagram_user_id,message_id,direction,message_text) VALUES($1,$2,$3,$4) ON CONFLICT(message_id) DO NOTHING`,[userId,messageId||null,direction,text||""]);}catch(e){console.error("AI message save error:",e.message)}
}
async function telegramNotify(lead){
  if(!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const lines=["📩 Новый лид Instagram","",`Instagram ID: ${lead.instagram_user_id}`,lead.name?`Имя: ${lead.name}`:null,lead.phone?`Телефон: ${lead.phone}`:null,lead.from_city||lead.to_city?`Маршрут: ${lead.from_city||"?"} → ${lead.to_city||"?"}`:null,lead.departure_date?`Дата: ${lead.departure_date}`:null,lead.return_date?`Обратно: ${lead.return_date}`:null,lead.passengers?`Пассажиры: ${lead.passengers}`:null,lead.baggage?`Багаж: ${lead.baggage}`:null,`Статус: ${lead.status}`].filter(Boolean).join("\n");
  const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:TELEGRAM_CHAT_ID,text:lines})});
  if(!r.ok) console.error("Telegram notify failed:",await r.text());
}
async function transcribeInstagramAudio(attachment){
  if(!OPENAI_API_KEY) return "";
  const mediaUrl=attachment?.payload?.url || attachment?.url;
  if(!mediaUrl) return "";
  const mr=await fetch(mediaUrl,{headers:META_ACCESS_TOKEN?{"Authorization":`Bearer ${META_ACCESS_TOKEN}`}:{}});
  if(!mr.ok) throw new Error(`META_MEDIA_${mr.status}`);
  const buf=Buffer.from(await mr.arrayBuffer());
  if(buf.length>25*1024*1024) throw new Error("AUDIO_TOO_LARGE");
  const form=new FormData();
  const type=mr.headers.get("content-type")||"audio/ogg";
  const ext=type.includes("mpeg")?"mp3":type.includes("mp4")?"m4a":type.includes("webm")?"webm":"ogg";
  form.append("file",new Blob([buf],{type}),`instagram-voice.${ext}`);
  form.append("model",process.env.OPENAI_TRANSCRIBE_MODEL||"gpt-transcribe");
  const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{"Authorization":`Bearer ${OPENAI_API_KEY}`},body:form});
  const raw=await r.text();let data={};try{data=JSON.parse(raw)}catch{}
  if(!r.ok) throw new Error(`OPENAI_TRANSCRIBE_${r.status}: ${data?.error?.message||raw.slice(0,400)}`);
  return String(data.text||"").trim();
}
function detectInstagramLanguage(text){
  const t=String(text||"").toLowerCase();
  if(/[ӣқғҳҷӯ]/i.test(t) || /\b(аз|ба|рӯз|рузи|сентябр|октябр|ноябр|декабр|январ|феврал|март|апрел|май|июн|июл|август)\b/i.test(t)) return "tj";
  if(/\b(the|from|to|flight|ticket|tickets|september|october|november|december|january|february|march|april|may|june|july|august)\b/i.test(t)) return "en";
  return "ru";
}
function parseFlightDetails(text){
  const t=String(text||"").trim();
  const low=t.toLowerCase();
  const cities=Object.keys(IATA_BY_CITY).sort((a,b)=>b.length-a.length);
  const found=[];
  for(const city of cities){
    const re=new RegExp("(?:^|[^a-zа-яёӣқғҳҷӯ])"+city.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"(?:$|[^a-zа-яёӣқғҳҷӯ])","i");
    if(re.test(low) && !found.includes(city)) found.push(city);
  }
  let from_city="",to_city="";
  const route=low.match(/(?:из|from|аз)\s+(.+?)\s+(?:в|to|ба)\s+(.+?)(?:\s+(?:на|on|рӯзи|рузи|дата|date)\b|$)/i);
  if(route){ from_city=route[1].trim(); to_city=route[2].trim(); }
  if(!from_city && found.length>=2){ from_city=found[0]; to_city=found[1]; }
  else if(!to_city && found.length>=2){ to_city=found[1]; }
  const months={
    январ:1,января:1,january:1,
    феврал:2,февраля:2,february:2,
    март:3,march:3,
    апрел:4,апреля:4,april:4,
    май:5,may:5,
    июн:6,июня:6,june:6,
    июл:7,июля:7,july:7,
    август:8,августа:8,august:8,
    сентябр:9,сентября:9,september:9,
    октябр:10,октября:10,october:10,
    ноябр:11,ноября:11,november:11,
    декабр:12,декабря:12,december:12
  };
  let departure_date="";
  const dm=low.match(/\b([0-3]?\d)\s+(январ(?:я)?|феврал(?:я)?|март|апрел(?:я)?|май|июн(?:я)?|июл(?:я)?|август(?:а)?|сентябр(?:я)?|октябр(?:я)?|ноябр(?:я)?|декабр(?:я)?|january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if(dm){
    const day=String(Number(dm[1])).padStart(2,"0");
    const key=dm[2].toLowerCase();
    const monthKey=Object.keys(months).find(k=>key.startsWith(k));
    if(monthKey) departure_date=`${new Date().getFullYear()}-${String(months[monthKey]).padStart(2,"0")}-${day}`;
  }
  const numeric=low.match(/\b([0-3]?\d)[.\/-]([01]?\d)(?:[.\/-](20\d\d))?\b/);
  if(!departure_date && numeric){
    const y=numeric[3]||String(new Date().getFullYear());
    departure_date=`${y}-${String(Number(numeric[2])).padStart(2,"0")}-${String(Number(numeric[1])).padStart(2,"0")}`;
  }
  return {from_city,to_city,departure_date};
}
async function aiAnalyze(instagramUserId,text){
  const history=(await getRecentAiHistory(instagramUserId)).slice(-8);
  const detectedLanguage=detectInstagramLanguage(text);
  const parsed=parseFlightDetails(text);
  if(!OPENAI_API_KEY){
    return {language:detectedLanguage,intent:parsed.from_city&&parsed.to_city&&parsed.departure_date?"search":"general",reply:detectedLanguage==="tj"?"Лутфан шаҳрҳои парвоз, сана ва шумораи мусофиронро нависед.":detectedLanguage==="en"?"Please send the route, travel date, and number of passengers.":"Напишите маршрут, дату поездки и количество пассажиров.",name:"",phone:"",from_city:parsed.from_city,to_city:parsed.to_city,departure_date:parsed.departure_date,return_date:"",passengers:"",baggage:"",handoff:false};
  }
  const prompt=`Ты AI-менеджер авиабилетов Aviakassa_havo (Таджикистан).
ЯЗЫК ОТВЕТА: ${detectedLanguage}. Отвечай именно на языке текущего сообщения, а не на языке истории. Если язык таджикский — используй таджикский кириллицей.
Текущий запрос: ${JSON.stringify(text)}
Детерминированно распознано: from_city=${JSON.stringify(parsed.from_city)}, to_city=${JSON.stringify(parsed.to_city)}, departure_date=${JSON.stringify(parsed.departure_date)}.
Правила: если в текущем сообщении есть полный маршрут и дата, ОБЯЗАТЕЛЬНО intent=search, handoff=false. Не отправляй клиента к менеджеру в этом случае. Не придумывай цену, наличие, расписание или багаж. Скажи, что поиск готовится/открывается, а система добавит кнопку с актуальными рейсами. Если данных не хватает — задай один самый полезный вопрос. Если клиент явно просит менеджера или хочет купить/забронировать, можно handoff=true.
Верни ТОЛЬКО JSON без markdown: {"language":"ru|tj|en","intent":"general|search|purchase|support","reply":"...","name":"","phone":"","from_city":"","to_city":"","departure_date":"YYYY-MM-DD или пусто","return_date":"YYYY-MM-DD или пусто","passengers":"","baggage":"","handoff":false}. Сегодня ${new Date().toISOString().slice(0,10)}. История последних сообщений: ${JSON.stringify(history)}`;
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:OPENAI_MODEL,instructions:"Отвечай строго по инструкции и возвращай только JSON.",input:prompt,max_output_tokens:700,store:false})});
  const raw=await r.text(); let data={}; try{data=JSON.parse(raw)}catch{}
  if(!r.ok) throw new Error(`OPENAI_${r.status}: ${data?.error?.message||raw.slice(0,500)}`);
  const output=String(data.output_text||"").trim();
  const cleaned=output.replace(/^```json\s*/i,"").replace(/```$/i,"").trim();
  let result; try{result=JSON.parse(cleaned)}catch{result={language:detectedLanguage,intent:"general",reply:"",handoff:false};}
  result.language=detectedLanguage;
  if(parsed.from_city && !result.from_city) result.from_city=parsed.from_city;
  if(parsed.to_city && !result.to_city) result.to_city=parsed.to_city;
  if(parsed.departure_date && !result.departure_date) result.departure_date=parsed.departure_date;
  if(result.from_city && result.to_city && result.departure_date){
    result.intent="search";
    result.handoff=false;
    const replies={
      ru:`Понял ✈️ ${result.from_city} → ${result.to_city}, ${result.departure_date.split("-")[2]} сентября. Сейчас подготовлю поиск актуальных рейсов.`,
      tj:`Фаҳмо ✈️ ${result.from_city} → ${result.to_city}, ${result.departure_date.split("-")[2]} сентябр. Ҳоло ҷустуҷӯи парвозҳои ҷориро омода мекунам.`,
      en:`Got it ✈️ ${result.from_city} → ${result.to_city}, ${result.departure_date.split("-")[2]} September. I’ll prepare the search for current flights now.`
    };
    if(!result.reply || /передам|менеджер|маршрут и дату/i.test(String(result.reply))) result.reply=replies[detectedLanguage]||replies.ru;
  }
  if(!result.reply) result.reply=detectedLanguage==="tj"?"Лутфан масир ва санаи парвозро нависед.":detectedLanguage==="en"?"Please send the route and travel date.":"Напишите маршрут и дату поездки.";
  return {...result,reply:String(result.reply||"").trim()};
}
async function processInstagramMessage(m){
  console.log("Instagram message processing started",JSON.stringify({sender:m.senderId,mid:m.mid,text:m.text.slice(0,120)}));
  await saveAiMessage(m.senderId,m.mid,"in",m.text||"[Вложение]");
  let text=m.text||"";
  if(!text && m.attachments?.length){
    const audio=m.attachments.find(a=>String(a?.type||"").toLowerCase().includes("audio"));
    if(audio){try{text=await transcribeInstagramAudio(audio)}catch(e){console.error("Instagram voice transcription error:",e.message)}}
    if(!text) text="Клиент отправил голосовое сообщение. Попроси клиента написать текстом, что нужно забронировать.";
  }
  try{
    const ai=await aiAnalyze(m.senderId,text);
    const status=ai.handoff?"in_progress":"new";
    const lead=await upsertAiLead({instagram_user_id:m.senderId,username:"",language:ai.language,intent:ai.intent,name:ai.name,phone:ai.phone,from_city:ai.from_city,to_city:ai.to_city,departure_date:ai.departure_date,return_date:ai.return_date,passengers:ai.passengers,baggage:ai.baggage,last_message:m.text||"[Вложение]",ai_reply:ai.reply,status,handoff:ai.handoff});
    if(AI_AUTO_REPLY && ai.reply){const sent=await sendInstagramText(m.senderId,ai.reply);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}-${Math.random()}`,"out",ai.reply);}
    if(AI_AUTO_REPLY && (ai.intent==="search" || (ai.intent==="purchase" && ai.from_city && ai.to_city && ai.departure_date))){
      const buttonSent=await sendInstagramFlightButton(m.senderId,ai);
      if(buttonSent?.message_id) await saveAiMessage(m.senderId,buttonSent.message_id,"out","[Кнопка: просмотр актуальных билетов]");
    }
    if(lead && ai.handoff) await telegramNotify(lead);
    console.log("Instagram AI processed",JSON.stringify({sender:m.senderId,intent:ai.intent,handoff:!!ai.handoff}));
  }catch(e){
    console.error("Instagram AI processing error:",e.message);
    try{const fallback="Спасибо за сообщение! 👋 Я передам запрос менеджеру. Пожалуйста, напишите маршрут, дату поездки и количество пассажиров.";if(AI_AUTO_REPLY) {const sent=await sendInstagramText(m.senderId,fallback);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}-${Math.random()}`,"out",fallback);}}catch(sendErr){console.error("Instagram fallback reply error:",sendErr.message)}
  }
}
async function instagramWebhook(req,res,url){
  if(url.pathname !== "/api/instagram/webhook") return false;
  if(req.method === "GET"){
    const mode=safe(url.searchParams.get("hub.mode"),50),token=safe(url.searchParams.get("hub.verify_token"),300),challenge=safe(url.searchParams.get("hub.challenge"),1000);
    if(mode==="subscribe" && token===META_VERIFY_TOKEN && challenge) return send(res,200,challenge,"text/plain; charset=utf-8");
    return send(res,403,{ok:false,error:"WEBHOOK_VERIFICATION_FAILED"});
  }
  if(req.method === "POST"){
    try{
      const body=await parseBody(req);
      console.log("Instagram webhook event received",JSON.stringify(body).slice(0,5000));
      const messages=extractInstagramMessages(body);
      console.log("Instagram messages extracted",JSON.stringify({count:messages.length,items:messages.map(m=>({sender:m.senderId,mid:m.mid,text:m.text.slice(0,120)}))}));
      res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify({ok:true,received:messages.length}));
      for(const m of messages) processInstagramMessage(m).catch(e=>console.error("Instagram async processing error:",e.message));
      return true;
    }catch(e){console.error("Instagram webhook parse error:",e.message);return send(res,200,{ok:true});}
  }
  return send(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
}

async function instagramAuthCallback(req,res,url){
  if(req.method !== "GET") return false;
  if(url.pathname !== "/auth/instagram/callback") return false;

  // Meta redirects the browser here after Instagram Login.
  // The authorization code is intentionally not rendered or logged.
  const error = safe(url.searchParams.get("error"),120);
  const errorReason = safe(url.searchParams.get("error_reason"),300);
  if(error){
    const message = errorReason || error || "Instagram authorization was not completed.";
    return send(res,400,`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram — Aviakassa_havo</title></head><body style="font-family:Arial,sans-serif;max-width:680px;margin:60px auto;padding:24px"><h1>Instagram авторизация не завершена</h1><p>${message.replace(/[<>]/g,"")}</p></body></html>` ,"text/html; charset=utf-8");
  }

  const hasCode = Boolean(url.searchParams.get("code"));
  const hasState = Boolean(url.searchParams.get("state"));
  return send(res,200,`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram — Aviakassa_havo</title></head><body style="font-family:Arial,sans-serif;max-width:680px;margin:60px auto;padding:24px"><h1>Instagram авторизация</h1><p>${hasCode ? "Авторизационный ответ Instagram получен." : "Callback-адрес доступен."}</p><p style="color:#666">Aviakassa_havo</p></body></html>`,"text/html; charset=utf-8");
}

async function api(req,res,url){
  const ip=req.socket.remoteAddress||"unknown";
  if(req.method==="GET" && url.pathname==="/api/health") return send(res,200,{ok:true,database:!!pool});

  if(req.method==="POST" && url.pathname==="/api/bookings"){
    if(!pool) return send(res,503,{ok:false,error:"DATABASE_NOT_CONFIGURED"});
    const b=await parseBody(req);
    const fields={name:safe(b.name,100),phone:safe(b.phone,40),from:safe(b.from,150),to:safe(b.to,150),date:safe(b.date,20),returnDate:safe(b.returnDate,20),passengers:safe(b.passengers,30),baggage:safe(b.baggage,150)};
    if(!fields.name||!fields.phone||!fields.from||!fields.to||!fields.date||!validDate(fields.date)||!validDate(fields.returnDate)) return send(res,400,{ok:false,error:"MISSING_OR_INVALID_FIELDS"});
    const code="REQ-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomBytes(2).toString("hex").toUpperCase();
    const q=await pool.query(`INSERT INTO bookings(request_code,name,phone,from_city,to_city,departure_date,return_date,passengers,baggage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING request_code,created_at`,[code,fields.name,fields.phone,fields.from,fields.to,fields.date,fields.returnDate||null,fields.passengers,fields.baggage]);
    return send(res,201,{ok:true,requestCode:q.rows[0].request_code,createdAt:q.rows[0].created_at});
  }

  if(req.method==="POST" && url.pathname==="/api/admin/login"){
    if(rateLimited(ip)) return send(res,429,{ok:false,error:"TOO_MANY_ATTEMPTS"});
    const b=await parseBody(req), password=String(b.password||""), username=safe(b.username||"admin",80).toLowerCase()||"admin";
    let user=null;
    if(pool){
      const q=await pool.query(`SELECT id,name,username,password_hash,role,active,permissions FROM managers WHERE username=$1 LIMIT 1`,[username]);
      if(q.rowCount && q.rows[0].active && verifyPassword(password,q.rows[0].password_hash)) user={id:q.rows[0].id,name:q.rows[0].name,username:q.rows[0].username,role:q.rows[0].role,permissions:Array.isArray(q.rows[0].permissions)?q.rows[0].permissions:[]};
    }
    if(!user && username==="admin" && ADMIN_PASSWORD && password===ADMIN_PASSWORD) user={id:null,name:"Главный администратор",username:"admin",role:"admin",permissions:ALL_PERMISSIONS};
    if(!user){countFailed(ip);return send(res,401,{ok:false,error:"INVALID_PASSWORD"});}
    clearFailed(ip); return send(res,200,{ok:true,token:issueSession(user),user:{id:user.id,name:user.name,username:user.username,role:user.role,permissions:user.permissions||[]}});
  }
  if(req.method==="POST" && url.pathname==="/api/admin/logout"){
    const h=String(req.headers.authorization||""); if(h.startsWith("Bearer ")) sessions.delete(h.slice(7));
    return send(res,200,{ok:true});
  }

  if(url.pathname.startsWith("/api/admin/")){
    const user=authorized(req); if(!user) return send(res,401,{ok:false,error:"UNAUTHORIZED"});
    if(!pool) return send(res,503,{ok:false,error:"DATABASE_NOT_CONFIGURED"});

    if(req.method==="GET" && url.pathname==="/api/admin/me") return send(res,200,{ok:true,user:{id:user.id,name:user.name,username:user.username,role:user.role,permissions:user.permissions||[]}});
    if(req.method==="GET" && url.pathname==="/api/admin/ai-leads"){
      if(!hasPermission(user,"bookings_view")) return send(res,403,{ok:false,error:"FORBIDDEN"});
      const q=await pool.query(`SELECT * FROM ai_leads ORDER BY updated_at DESC LIMIT 500`); return send(res,200,{ok:true,leads:q.rows});
    }
    if(req.method==="PATCH" && url.pathname==="/api/admin/ai-leads"){
      if(!hasPermission(user,"bookings_edit")) return send(res,403,{ok:false,error:"FORBIDDEN"});
      const b=await parseBody(req),id=Number(b.id),status=safe(b.status,30);
      if(!Number.isInteger(id)||!['new','in_progress','booked','completed','cancelled'].includes(status)) return send(res,400,{ok:false,error:"INVALID_DATA"});
      await pool.query(`UPDATE ai_leads SET status=$1,updated_at=NOW() WHERE id=$2`,[status,id]); return send(res,200,{ok:true});
    }

    if(req.method==="GET" && url.pathname==="/api/admin/bookings"){
      if(!hasPermission(user,"bookings_view")) return send(res,403,{ok:false,error:"FORBIDDEN"});
      const qtext=safe(url.searchParams.get("q"),100), status=safe(url.searchParams.get("status"),40);
      const args=[], where=[];
      if(status){args.push(status);where.push(`b.status=$${args.length}`)}
      if(qtext){args.push(`%${qtext}%`);where.push(`(b.name ILIKE $${args.length} OR b.phone ILIKE $${args.length} OR b.from_city ILIKE $${args.length} OR b.to_city ILIKE $${args.length} OR b.request_code ILIKE $${args.length})`)}
      const q=await pool.query(`SELECT b.*,m.name AS manager_name FROM bookings b LEFT JOIN managers m ON m.id=b.manager_id ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY b.created_at DESC LIMIT 1000`,args);
      return send(res,200,{ok:true,bookings:q.rows});
    }
    if(req.method==="PATCH" && url.pathname==="/api/admin/bookings"){
      if(!hasPermission(user,"bookings_edit")) return send(res,403,{ok:false,error:"FORBIDDEN"});
      const b=await parseBody(req),id=Number(b.id),status=safe(b.status,40),notes=safe(b.notes,2000),managerId=b.managerId===null?null:(b.managerId!==undefined?Number(b.managerId):user.id||null);
      const allowed=["new","in_progress","options_sent","booked","completed","cancelled"];
      if(!Number.isInteger(id)||!allowed.includes(status)) return send(res,400,{ok:false,error:"INVALID_DATA"});
      await pool.query(`UPDATE bookings SET status=$1,notes=$2,manager_id=$3 WHERE id=$4`,[status,notes,Number.isInteger(managerId)?managerId:null,id]);
      return send(res,200,{ok:true});
    }
  if(req.method==="GET" && url.pathname==="/api/admin/analytics"){ const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"}); if(!hasPermission(user,"bookings_view"))return send(res,403,{ok:false,error:"FORBIDDEN"}); if(!pool)return send(res,503,{ok:false,error:"DATABASE_NOT_CONFIGURED"}); const q=await pool.query(`SELECT created_at::date AS day,COUNT(*)::int AS count FROM bookings WHERE created_at>=CURRENT_DATE-INTERVAL '29 days' GROUP BY created_at::date ORDER BY day`); const routes=await pool.query(`SELECT from_city,to_city,COUNT(*)::int AS count FROM bookings GROUP BY from_city,to_city ORDER BY count DESC LIMIT 10`); const statuses=await pool.query(`SELECT status,COUNT(*)::int AS count FROM bookings GROUP BY status ORDER BY count DESC`); return send(res,200,{ok:true,daily:q.rows,routes:routes.rows,statuses:statuses.rows}); }

    if(req.method==="GET" && url.pathname==="/api/admin/stats"){
      if(!hasPermission(user,"bookings_view")) return send(res,403,{ok:false,error:"FORBIDDEN"});
      const q=await pool.query(`SELECT COUNT(*) FILTER (WHERE created_at::date=CURRENT_DATE) AS today, COUNT(*) FILTER (WHERE created_at>=CURRENT_DATE-INTERVAL '6 days') AS week, COUNT(*) FILTER (WHERE created_at>=date_trunc('month',CURRENT_DATE)) AS month, COUNT(*) AS total FROM bookings`);
      return send(res,200,{ok:true,stats:q.rows[0]});
    }
    if(req.method==="GET" && url.pathname==="/api/admin/bookings.xlsx"){
      if(!hasPermission(user,"export_excel")) return send(res,403,{ok:false,error:"FORBIDDEN"});
      const qtext=safe(url.searchParams.get("q"),100), status=safe(url.searchParams.get("status"),40), args=[], where=[];
      if(status){args.push(status);where.push(`b.status=$${args.length}`)}
      if(qtext){args.push(`%${qtext}%`);where.push(`(b.name ILIKE $${args.length} OR b.phone ILIKE $${args.length} OR b.from_city ILIKE $${args.length} OR b.to_city ILIKE $${args.length} OR b.request_code ILIKE $${args.length})`)}
      const q=await pool.query(`SELECT b.id,b.request_code,b.created_at,b.name,b.phone,b.from_city,b.to_city,b.departure_date,b.return_date,b.passengers,b.baggage,b.status,b.notes,m.name AS manager_name FROM bookings b LEFT JOIN managers m ON m.id=b.manager_id ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY b.created_at DESC LIMIT 5000`,args);
      const rows=q.rows.map(r=>({"№":r.id,"Номер заявки":r.request_code,"Дата заявки":new Date(r.created_at).toLocaleString("ru-RU"),"Имя":r.name,"Телефон":r.phone,"Откуда":r.from_city,"Куда":r.to_city,"Дата вылета":r.departure_date,"Дата возвращения":r.return_date||"","Пассажиры":r.passengers,"Багаж":r.baggage,"Статус":r.status,"Заметка":r.notes||"","Менеджер":r.manager_name||""}));
      const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows.length?rows:[{"Сообщение":"Заявок нет"}]); XLSX.utils.book_append_sheet(wb,ws,"Заявки"); ws["!cols"]=[{wch:8},{wch:22},{wch:20},{wch:22},{wch:18},{wch:22},{wch:22},{wch:14},{wch:16},{wch:12},{wch:18},{wch:20},{wch:35},{wch:24}];
      const out=XLSX.write(wb,{type:"buffer",bookType:"xlsx"}); return send(res,200,out,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",{"Content-Disposition":"attachment; filename*=UTF-8''aviakassa-zayavki.xlsx"});
    }

    if(req.method==="GET" && url.pathname==="/api/admin/managers"){
      if(user.role!=="admin") return send(res,403,{ok:false,error:"ADMIN_ONLY"});
      const q=await pool.query(`SELECT id,name,username,role,active,permissions,created_at FROM managers ORDER BY created_at DESC`); return send(res,200,{ok:true,managers:q.rows});
    }
    if(req.method==="POST" && url.pathname==="/api/admin/managers"){
      if(user.role!=="admin") return send(res,403,{ok:false,error:"ADMIN_ONLY"});
      const b=await parseBody(req),name=safe(b.name,120),username=safe(b.username,80).toLowerCase(),password=String(b.password||"");
      if(!name||!username||password.length<10) return send(res,400,{ok:false,error:"NAME_USERNAME_AND_10_CHAR_PASSWORD_REQUIRED"});
      try{const q=await pool.query(`INSERT INTO managers(name,username,password_hash,role,permissions) VALUES($1,$2,$3,'manager',$4) RETURNING id,name,username,role,active,created_at`,[name,username,hashPassword(password),JSON.stringify(DEFAULT_MANAGER_PERMISSIONS)]);return send(res,201,{ok:true,manager:q.rows[0]});}catch(e){if(e.code==="23505")return send(res,409,{ok:false,error:"USERNAME_EXISTS"});throw e;}
    }
    if(req.method==="PATCH" && url.pathname==="/api/admin/managers"){
      if(user.role!=="admin") return send(res,403,{ok:false,error:"ADMIN_ONLY"});
      const b=await parseBody(req),id=Number(b.id); if(!Number.isInteger(id))return send(res,400,{ok:false,error:"INVALID_ID"});
      if(b.active!==undefined){ await pool.query(`UPDATE managers SET active=$1 WHERE id=$2`,[!!b.active,id]); revokeUserSessions(id); }
      if(b.password!==undefined){ if(String(b.password).length<10)return send(res,400,{ok:false,error:"PASSWORD_MIN_10"}); await pool.query(`UPDATE managers SET password_hash=$1 WHERE id=$2`,[hashPassword(String(b.password)),id]); revokeUserSessions(id); }
      if(b.permissions!==undefined){ const perms=Array.isArray(b.permissions)?b.permissions.filter(x=>ALL_PERMISSIONS.includes(x)):[]; await pool.query(`UPDATE managers SET permissions=$1::jsonb WHERE id=$2`,[JSON.stringify(perms),id]); revokeUserSessions(id); }
      return send(res,200,{ok:true});
    }

    if(req.method==="POST" && url.pathname==="/api/admin/password"){
      if(user.role!=="admin") return send(res,403,{ok:false,error:"ADMIN_ONLY"});
      const b=await parseBody(req),current=String(b.currentPassword||""),next=String(b.newPassword||"");
      if(next.length<10) return send(res,400,{ok:false,error:"PASSWORD_MIN_10"});
      let valid=false,adminId=user.id;
      if(pool){ const q=await pool.query(`SELECT id,password_hash FROM managers WHERE username='admin' AND role='admin' LIMIT 1`); if(q.rowCount){adminId=q.rows[0].id;valid=verifyPassword(current,q.rows[0].password_hash);} }
      if(!valid && !adminId && ADMIN_PASSWORD) valid=current===ADMIN_PASSWORD;
      if(!valid) return send(res,401,{ok:false,error:"CURRENT_PASSWORD_INVALID"});
      if(!pool || !adminId) return send(res,503,{ok:false,error:"ADMIN_DB_ACCOUNT_REQUIRED"});
      await pool.query(`UPDATE managers SET password_hash=$1 WHERE id=$2`,[hashPassword(next),adminId]);
      revokeAllSessions();
      return send(res,200,{ok:true});
    }
    if(req.method==="POST" && url.pathname==="/api/admin/logout-all"){
      if(user.role!=="admin") return send(res,403,{ok:false,error:"ADMIN_ONLY"});
      revokeAllSessions(); return send(res,200,{ok:true});
    }
    if(req.method==="POST" && url.pathname==="/api/admin/logout-my-sessions"){
      revokeUserSessions(user.id); return send(res,200,{ok:true});
    }

    if(req.method==="GET" && url.pathname==="/api/admin/booking-managers"){ const q=await pool.query("SELECT id,name,username,active FROM managers WHERE active=true ORDER BY name"); return send(res,200,{ok:true,managers:q.rows}); }
    if(req.method==="POST" && url.pathname==="/api/admin/assign-booking"){ if(!hasPermission(user,"bookings_edit"))return send(res,403,{ok:false,error:"FORBIDDEN"}); const b=await parseBody(req),id=Number(b.id),managerId=Number(b.managerId); if(!Number.isInteger(id)||!Number.isInteger(managerId))return send(res,400,{ok:false,error:"INVALID_ID"}); await pool.query("UPDATE bookings SET manager_id=$1 WHERE id=$2",[managerId,id]); return send(res,200,{ok:true}); }
    const crud = async (table, fields, required, body, id=null) => {
      if(id){
        for(const f of required){if(body[f]===undefined || body[f]===null || String(body[f]).trim()==="") throw Object.assign(new Error("REQUIRED"),{status:400});}
        const provided=fields.filter(f=>body[f]!==undefined);
        if(!provided.length) throw Object.assign(new Error("NO_FIELDS"),{status:400});
        const values=provided.map(f=>body[f]);
        const sets=provided.map((f,i)=>`${f}=$${i+1}`).join(",");
        await pool.query(`UPDATE ${table} SET ${sets} WHERE id=$${provided.length+1}`,[...values,id]);
      } else {
        const values=fields.map(f=>body[f]);
        for(const f of required){if(body[f]===undefined || body[f]===null || String(body[f]).trim()==="") throw Object.assign(new Error("REQUIRED"),{status:400});}
        const cols=fields.filter((f,i)=>body[f]!==undefined), vals=fields.filter((f,i)=>body[f]!==undefined).map(f=>body[f]);
        const ph=cols.map((_,i)=>`$${i+1}`).join(",");
        await pool.query(`INSERT INTO ${table}(${cols.join(",")}) VALUES(${ph})`,vals);
      }
    };
    const map={
      flights:{table:"flights",fields:["from_city","from_country","from_airport","from_airport_code","to_city","to_country","to_airport","to_airport_code","flight_date","flight_time","airline","baggage","price","currency","active"],required:["from_city","from_country","from_airport","from_airport_code","to_city","to_country","to_airport","to_airport_code","flight_date","flight_time","airline","baggage","price"]},
      offers:{table:"offers",fields:["title","description","discount","valid_until","active"],required:["title"]},
      directions:{table:"directions",fields:["city","country","code","active"],required:["city","country"]}
    };
    for(const [key,cfg] of Object.entries(map)){
      const perm = key==="flights" ? "flights_manage" : key==="offers" ? "offers_manage" : "directions_manage";
      if(!hasPermission(user,perm)) continue;
      if(req.method==="GET" && url.pathname===`/api/admin/${key}`){const q=await pool.query(`SELECT * FROM ${cfg.table} ORDER BY created_at DESC`);return send(res,200,{ok:true,[key]:q.rows});}
      if(req.method==="POST" && url.pathname===`/api/admin/${key}`){const b=await parseBody(req);try{await crud(cfg.table,cfg.fields,cfg.required,b);return send(res,201,{ok:true});}catch(e){return send(res,e.status||500,{ok:false,error:e.message});}}
      if(req.method==="PATCH" && url.pathname===`/api/admin/${key}`){const b=await parseBody(req),id=Number(b.id);if(!Number.isInteger(id))return send(res,400,{ok:false,error:"INVALID_ID"});try{await crud(cfg.table,cfg.fields,cfg.required,b,id);return send(res,200,{ok:true});}catch(e){return send(res,e.status||500,{ok:false,error:e.message});}}
      if(req.method==="DELETE" && url.pathname===`/api/admin/${key}`){const id=Number(url.searchParams.get("id"));if(!Number.isInteger(id))return send(res,400,{ok:false,error:"INVALID_ID"});await pool.query(`DELETE FROM ${cfg.table} WHERE id=$1`,[id]);return send(res,200,{ok:true});}
    }
  }

  if(req.method==="GET" && url.pathname==="/api/admin/markup"){
    const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"});
    if(user.role!=="admin")return send(res,403,{ok:false,error:"ADMIN_ONLY"});
    return send(res,200,{ok:true,markup_rub:await getFlightMarkup(),default_markup_rub:DEFAULT_FLIGHT_MARKUP_RUB});
  }
  if(req.method==="PATCH" && url.pathname==="/api/admin/markup"){
    const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"});
    if(user.role!=="admin")return send(res,403,{ok:false,error:"ADMIN_ONLY"});
    try{ const b=await parseBody(req); const markup=await setFlightMarkup(b.markup_rub); return send(res,200,{ok:true,markup_rub:markup}); }
    catch(e){ return send(res,e.message==="INVALID_MARKUP"?400:500,{ok:false,error:e.message}); }
  }

  if(req.method==="GET" && url.pathname==="/api/admin/supplier/status"){
    const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"}); if(user.role!=="admin")return send(res,403,{ok:false,error:"ADMIN_ONLY"});
    const configured=!!TRAVELPAYOUTS_WHITE_LABEL_ID;
    return send(res,200,{ok:true,configured,provider:"Travelpayouts White Label",whiteLabelId:TRAVELPAYOUTS_WHITE_LABEL_ID,apiTokenConfigured:!!TRAVELPAYOUTS_API_TOKEN,message:configured?"Travelpayouts White Label настроен.":"White Label ID не настроен."});
  }
  if(req.method==="POST" && url.pathname==="/api/admin/supplier/sync"){
    const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"}); if(user.role!=="admin")return send(res,403,{ok:false,error:"ADMIN_ONLY"});
    const configured=!!TRAVELPAYOUTS_WHITE_LABEL_ID;
    if(!configured)return send(res,503,{ok:false,error:"TRAVELPAYOUTS_WHITE_LABEL_NOT_SET",message:"White Label ID не настроен."});
    return send(res,200,{ok:true,provider:"Travelpayouts White Label",whiteLabelId:TRAVELPAYOUTS_WHITE_LABEL_ID,message:"White Label доступен. Поиск и результаты подключаются через виджет Travelpayouts."});
  }
  // Public lists for future site integrations.
  if(req.method==="GET" && url.pathname==="/api/directions" && pool){const q=await pool.query(`SELECT id,city,country,code FROM directions WHERE active=true ORDER BY city`);return send(res,200,{ok:true,directions:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/flights" && pool){const q=await pool.query(`SELECT * FROM flights WHERE active=true AND flight_date>=CURRENT_DATE ORDER BY flight_date,flight_time LIMIT 500`);return send(res,200,{ok:true,flights:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/offers" && pool){const q=await pool.query(`SELECT * FROM offers WHERE active=true AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY created_at DESC`);return send(res,200,{ok:true,offers:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/search-flights" && pool){
    const from=safe(url.searchParams.get("from"),120), to=safe(url.searchParams.get("to"),120), date=safe(url.searchParams.get("date"),20), airline=safe(url.searchParams.get("airline"),120), airport=safe(url.searchParams.get("airport"),20), direct=url.searchParams.get("direct");
    const args=[], where=["active=true","flight_date>=CURRENT_DATE"];
    if(from){args.push(`%${from}%`);where.push(`(from_city ILIKE $${args.length} OR from_airport ILIKE $${args.length} OR from_airport_code ILIKE $${args.length})`)}
    if(to){args.push(`%${to}%`);where.push(`(to_city ILIKE $${args.length} OR to_airport ILIKE $${args.length} OR to_airport_code ILIKE $${args.length})`)}
    if(date && validDate(date)){args.push(date);where.push(`flight_date=$${args.length}`)}
    if(airline){args.push(`%${airline}%`);where.push(`airline ILIKE $${args.length}`)}
    if(airport){args.push(`%${airport}%`);where.push(`(from_airport ILIKE $${args.length} OR to_airport ILIKE $${args.length} OR from_airport_code ILIKE $${args.length} OR to_airport_code ILIKE $${args.length})`)}
    const q=await pool.query(`SELECT * FROM flights WHERE ${where.join(" AND ")} ORDER BY flight_date,flight_time LIMIT 500`,args); return send(res,200,{ok:true,flights:q.rows});
  }

  if(req.method==="GET" && url.pathname==="/api/flight" && pool){ const id=Number(url.searchParams.get("id")); if(!Number.isInteger(id)) return send(res,400,{ok:false,error:"INVALID_ID"}); const q=await pool.query("SELECT * FROM flights WHERE id=$1 AND active=true",[id]); return send(res,q.rowCount?200:404,{ok:!!q.rowCount,flight:q.rows[0]||null}); }

  return false;
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8",".json":"application/json; charset=utf-8"};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    const instagramHandled = await instagramAuthCallback(req,res,u);
    if(instagramHandled!==false)return;
    const webhookHandled = await instagramWebhook(req,res,u);
    if(webhookHandled!==false)return;
    if(u.pathname.startsWith("/api/")){const handled=await api(req,res,u);if(handled!==false)return;}
    // Friendly admin URLs. Keep /admin.html working as well.
    if(u.pathname==="/admin" || u.pathname==="/admin/") u.pathname="/admin.html";
    let p=u.pathname==="/"?path.join(publicDir,"index.html"):path.join(publicDir,u.pathname.replace(/^\/+/,""));
    if(!p.startsWith(publicDir))return send(res,403,{error:"FORBIDDEN"});
    if(fs.existsSync(p)&&fs.statSync(p).isFile()){const ext=path.extname(p).toLowerCase();res.writeHead(200,{"Content-Type":mime[ext]||"application/octet-stream"});fs.createReadStream(p).pipe(res);return;}
    send(res,404,{error:"NOT_FOUND"});
  }catch(e){console.error(e);send(res,500,{error:"SERVER_ERROR"});}
});
initDb().then(()=>server.listen(PORT,()=>console.log("Aviakassa server on "+PORT))).catch(e=>{console.error("Database initialization failed; starting server without DB:",e.message);server.listen(PORT,()=>console.log("Aviakassa server on "+PORT+" (DB unavailable)"))});

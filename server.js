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
const TRAVELPAYOUTS_WHITE_LABEL_URL = process.env.TRAVELPAYOUTS_WHITE_LABEL_URL || "https://aviakassa-havo1.onrender.com/";
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
      trip_type VARCHAR(20) DEFAULT '',
      passengers VARCHAR(30) DEFAULT '',
      baggage TEXT DEFAULT '',
      last_message TEXT DEFAULT '',
      ai_reply TEXT DEFAULT '',
      status VARCHAR(30) NOT NULL DEFAULT 'new',
      handoff BOOLEAN NOT NULL DEFAULT FALSE,
      manager_waiting BOOLEAN NOT NULL DEFAULT FALSE,
      manager_last_notified_at TIMESTAMPTZ,
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
  await pool.query(`ALTER TABLE ai_leads ADD COLUMN IF NOT EXISTS manager_waiting BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE ai_leads ADD COLUMN IF NOT EXISTS trip_type VARCHAR(20) DEFAULT ''`);
  await pool.query(`ALTER TABLE ai_leads ADD COLUMN IF NOT EXISTS manager_last_notified_at TIMESTAMPTZ`);
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
  "москва":"MOW","москвы":"MOW","москву":"MOW","moscow":"MOW","мск":"MOW",
  "душанбе":"DYU","dushanbe":"DYU",
  "ташкент":"TAS","ташкента":"TAS","ташкенте":"TAS","tashkent":"TAS",
  "самарканд":"SKD","samarkand":"SKD",
  "алматы":"ALA","almaty":"ALA",
  "астана":"NQZ","нур-султан":"NQZ","astana":"NQZ","nur-sultan":"NQZ",
  "бишкек":"FRU","bishkek":"FRU",
  "стамбул":"IST","istanbul":"IST",
  "дубай":"DXB","dubai":"DXB",
  "анталья":"AYT","antalya":"AYT",
  "екатеринбург":"SVX","екатеринбурга":"SVX","екатеринбурге":"SVX","yekaterinburg":"SVX",
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
  const t=String(value||"").toLowerCase();
  const nums=[...t.matchAll(/\b([1-9]\d?)\b/g)].map(m=>Number(m[1])).filter(n=>n>0&&n<=20);
  if(nums.length>=2 && /ребен|дет|child|кӯдак/i.test(t)) return String(Math.min(20,nums.reduce((a,b)=>a+b,0)));
  return nums.length?String(Math.min(20,nums[0])):"1";
}
function normalizeIsoDate(value){
  const v=String(value||"").trim();
  const m=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return "";
  const y=Number(m[1]), mo=Number(m[2]), d=Number(m[3]);
  const dt=new Date(y,mo-1,d);
  return dt.getFullYear()===y && dt.getMonth()===mo-1 && dt.getDate()===d ? v : "";
}
function buildWhiteLabelSearchUrl(ai){
  const origin=cityToIata(ai.from_city), destination=cityToIata(ai.to_city);
  const dep=normalizeIsoDate(ai.departure_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!origin||!destination||!dep) return "";
  let code=`${origin}${dep[3]}${dep[2]}${destination}`;
  const ret=normalizeIsoDate(ai.return_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(ret) code+=`${ret[3]}${ret[2]}`;
  code+=normalizePassengers(ai.passengers);
  const base=TRAVELPAYOUTS_WHITE_LABEL_URL.endsWith("/")?TRAVELPAYOUTS_WHITE_LABEL_URL:TRAVELPAYOUTS_WHITE_LABEL_URL+"/";
  return `${base}?flightSearch=${encodeURIComponent(code)}`;
}
async function sendInstagramActionButtons(recipientId,ai){
  const lang=ai?.language||"ru";
  const labels={ru:"✈️ Смотреть билеты и цены",tj:"✈️ Дидани билетҳо ва нархҳо",en:"✈️ View flights & prices"};
  const managerLabels={ru:"👨‍💼 Связаться с менеджером",tj:"👨‍💼 Пайваст шудан бо менеджер",en:"👨‍💼 Contact manager"};
  const roundLabels={ru:"🔄 Туда и обратно",tj:"🔄 Рафту баргашт",en:"🔄 Round trip"};
  const title={ru:"Что хотите сделать?",tj:"Чӣ кор кардан мехоҳед?",en:"What would you like to do?"};
  const subtitle={ru:"После нажатия «Смотреть билеты и цены» поиск может занять 5–10 секунд. Пожалуйста, подождите.",tj:"Пас аз пахши «Дидани билетҳо ва нархҳо» ҷустуҷӯ 5–10 сония мегирад. Лутфан интизор шавед.",en:"After tapping «View flights & prices», the search may take 5–10 seconds. Please wait."};
  const buttons=[];
  const url=buildWhiteLabelSearchUrl(ai);
  const managerOnly=ai?.intent==="support" && ai?.handoff===true;
  const hasReturn=!!normalizeIsoDate(ai?.return_date);
  if(url && !managerOnly) buttons.push({type:"web_url",url,title:labels[lang]||labels.ru});
  if(!hasReturn && !managerOnly && url && ai?.trip_type!=="oneway") buttons.push({type:"postback",title:roundLabels[lang]||roundLabels.ru,payload:"CHOOSE_ROUNDTRIP"});
  buttons.push({type:"postback",title:managerLabels[lang]||managerLabels.ru,payload:"CONNECT_MANAGER"});
  const payload={recipient:{id:String(recipientId)},message:{attachment:{type:"template",payload:{template_type:"generic",elements:[{title:title[lang]||title.ru,subtitle:subtitle[lang]||subtitle.ru,buttons:buttons.slice(0,3)}]}}}};
  try{return await instagramGraph(`/me/messages`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})}
  catch(e){console.error("Instagram action buttons error:",e.message);return null;}
}
function extractInstagramMessages(body){
  const out=[];
  const entries=Array.isArray(body?.entry)?body.entry:[];
  for(const entry of entries){
    const businessId=String(entry?.id||"");
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
      const postbackPayload=typeof item?.postback?.payload==="string"?item.postback.payload:(typeof msg?.postback?.payload==="string"?msg.postback.payload:"");
      const postbackTitle=typeof item?.postback?.title==="string"?item.postback.title:(typeof msg?.postback?.title==="string"?msg.postback.title:"");
      const text=typeof msg?.text==="string"?msg.text.trim():"";
      const attachments=Array.isArray(msg?.attachments)?msg.attachments:[];
      // Never process messages sent by our own Instagram business account.
      // Meta can send outgoing messages back through the webhook (sometimes with is_echo=true).
      if(msg?.is_echo===true || item?.is_echo===true) continue;
      if(businessId && sender && String(sender)===businessId) continue;
      if(sender && recipient && (text || attachments.length || postbackPayload)) out.push({senderId:String(sender),recipientId:String(recipient),mid:String(mid||item?.postback?.mid||""),text,attachments,postbackPayload,postbackTitle,timestamp:item?.timestamp||Date.now()});
    }
  }
  return out;
}
async function getInstagramUserProfile(instagramUserId){
  const id=String(instagramUserId||"").trim();
  if(!id) return null;
  try{
    const data=await instagramGraph(`/${encodeURIComponent(id)}?fields=id,username,name`);
    return {id:String(data?.id||id),username:String(data?.username||""),name:String(data?.name||"")};
  }catch(e){
    console.warn("Instagram profile lookup failed:",e.message);
    return null;
  }
}
function instagramProfileUrl(username){
  const u=String(username||"").trim().replace(/^@/,"");
  return /^[A-Za-z0-9._]{1,30}$/.test(u) ? `https://www.instagram.com/${encodeURIComponent(u)}/` : "";
}
async function getRecentAiHistory(instagramUserId){
  if(!pool) return [];
  const q=await pool.query(`SELECT direction,message_text FROM ai_messages WHERE instagram_user_id=$1 ORDER BY created_at DESC LIMIT 12`,[instagramUserId]);
  return q.rows.reverse();
}
async function getExistingAiLead(instagramUserId){
  if(!pool) return null;
  try{
    const q=await pool.query(`SELECT language,from_city,to_city,departure_date,return_date,trip_type,passengers,baggage,handoff,manager_waiting,manager_last_notified_at FROM ai_leads WHERE instagram_user_id=$1 LIMIT 1`,[instagramUserId]);
    return q.rows[0]||null;
  }catch(e){ console.error("AI lead lookup error:",e.message); return null; }
}
async function upsertAiLead(data){
  if(!pool) return null;
  const date = data.departure_date && /^\d{4}-\d{2}-\d{2}$/.test(data.departure_date) ? data.departure_date : null;
  const ret = data.return_date && /^\d{4}-\d{2}-\d{2}$/.test(data.return_date) ? data.return_date : null;
  const q=await pool.query(`INSERT INTO ai_leads(instagram_user_id,username,language,intent,name,phone,from_city,to_city,departure_date,return_date,trip_type,passengers,baggage,last_message,ai_reply,status,handoff,manager_waiting,manager_last_notified_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW()) ON CONFLICT(instagram_user_id) DO UPDATE SET username=EXCLUDED.username,language=EXCLUDED.language,intent=EXCLUDED.intent,name=CASE WHEN EXCLUDED.name<>'' THEN EXCLUDED.name ELSE ai_leads.name END,phone=CASE WHEN EXCLUDED.phone<>'' THEN EXCLUDED.phone ELSE ai_leads.phone END,from_city=CASE WHEN EXCLUDED.from_city<>'' THEN EXCLUDED.from_city ELSE ai_leads.from_city END,to_city=CASE WHEN EXCLUDED.to_city<>'' THEN EXCLUDED.to_city ELSE ai_leads.to_city END,departure_date=COALESCE(EXCLUDED.departure_date,ai_leads.departure_date),return_date=CASE WHEN EXCLUDED.return_date IS NOT NULL THEN EXCLUDED.return_date ELSE ai_leads.return_date END,trip_type=CASE WHEN EXCLUDED.trip_type<>'' THEN EXCLUDED.trip_type ELSE ai_leads.trip_type END,passengers=CASE WHEN EXCLUDED.passengers<>'' THEN EXCLUDED.passengers ELSE ai_leads.passengers END,baggage=CASE WHEN EXCLUDED.baggage<>'' THEN EXCLUDED.baggage ELSE ai_leads.baggage END,last_message=EXCLUDED.last_message,ai_reply=EXCLUDED.ai_reply,status=EXCLUDED.status,handoff=EXCLUDED.handoff,manager_waiting=EXCLUDED.manager_waiting,manager_last_notified_at=CASE WHEN EXCLUDED.manager_waiting THEN COALESCE(EXCLUDED.manager_last_notified_at,ai_leads.manager_last_notified_at) ELSE NULL END,updated_at=NOW() RETURNING *`,[data.instagram_user_id,data.username||"",data.language||"",data.intent||"general",data.name||"",data.phone||"",data.from_city||"",data.to_city||"",date,ret,data.trip_type||"",data.passengers||"",data.baggage||"",data.last_message||"",data.ai_reply||"",data.status||"new",!!data.handoff,!!data.manager_waiting,data.manager_last_notified_at||null]);
  return q.rows[0];
}
async function saveAiMessage(userId,messageId,direction,text){
  if(!pool) return;
  try{await pool.query(`INSERT INTO ai_messages(instagram_user_id,message_id,direction,message_text) VALUES($1,$2,$3,$4) ON CONFLICT(message_id) DO NOTHING`,[userId,messageId||null,direction,text||""]);}catch(e){console.error("AI message save error:",e.message)}
}
async function telegramApi(method, payload){
  if(!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
  const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload||{})});
  const raw=await r.text(); let data={}; try{data=JSON.parse(raw)}catch{}
  if(!r.ok || data.ok===false) throw new Error(`TELEGRAM_${r.status}: ${data?.description||raw.slice(0,400)}`);
  return data;
}
function telegramLeadText(lead){
  const profileUrl=instagramProfileUrl(lead.username);
  return ["📩 Новый запрос от Instagram","",lead.username?`👤 Instagram: @${lead.username}`:`👤 Instagram ID: ${lead.instagram_user_id}`,profileUrl?`🔗 Профиль: ${profileUrl}`:null,lead.name?`Имя: ${lead.name}`:null,lead.phone?`Телефон: ${lead.phone}`:null,lead.from_city||lead.to_city?`✈️ Маршрут: ${lead.from_city||"?"} → ${lead.to_city||"?"}`:null,lead.departure_date?`📅 Дата: ${lead.departure_date}`:null,lead.return_date?`🔁 Обратно: ${lead.return_date}`:null,lead.trip_type?`🔄 Тип поездки: ${lead.trip_type==="roundtrip"?"туда и обратно":"только туда"}`:null,lead.passengers?`👥 Пассажиры: ${lead.passengers}`:null,lead.baggage?`🧳 Багаж: ${lead.baggage}`:null,`💬 Сообщение: ${lead.last_message||"—"}`,`🟡 Статус: ${lead.status}${lead.manager_waiting?"\n⏳ Ожидает ответа менеджера":""}`].filter(Boolean).join("\n");
}
async function telegramNotify(lead){
  if(!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try{
    const profileUrl=instagramProfileUrl(lead.username);
    const rows=[];
    if(profileUrl) rows.push([{text:"📷 Открыть Instagram клиента",url:profileUrl}]);
    if(lead.manager_waiting) rows.push([{text:"🔔 Напомнить менеджеру",callback_data:`REMIND|${lead.instagram_user_id}`}]);
    rows.push([{text:"✅ Взять заявку",callback_data:`TAKE|${lead.instagram_user_id}`}]);
    rows.push([{text:"❌ Закрыть заявку",callback_data:`CLOSE|${lead.instagram_user_id}`}]);
    await telegramApi("sendMessage",{chat_id:TELEGRAM_CHAT_ID,text:telegramLeadText(lead),reply_markup:{inline_keyboard:rows}});
  }catch(e){ console.error("Telegram notify failed:",e.message); }
}
async function handleTelegramCallback(body){
  const q=body?.callback_query;
  if(!q?.data) return false;
  const [action,userId]=String(q.data).split("|",2);
  if(!userId || !["TAKE","CLOSE","REMIND"].includes(action)) return false;
  if(String(q.message?.chat?.id||"")!==String(TELEGRAM_CHAT_ID||"")) return false;
  if(!pool){ await telegramApi("answerCallbackQuery",{callback_query_id:q.id,text:"База данных недоступна"}); return true; }
  if(action==="REMIND"){
    const rq=await pool.query(`SELECT * FROM ai_leads WHERE instagram_user_id=$1 LIMIT 1`,[userId]);
    if(!rq.rowCount){await telegramApi("answerCallbackQuery",{callback_query_id:q.id,text:"Заявка не найдена"});return true;}
    await telegramNotify(rq.rows[0]);
    await pool.query(`UPDATE ai_leads SET manager_last_notified_at=NOW(),updated_at=NOW() WHERE instagram_user_id=$1`,[userId]);
    await telegramApi("answerCallbackQuery",{callback_query_id:q.id,text:"Напоминание отправлено"}); return true;
  }
  const status=action==="TAKE"?"in_progress":"completed";
  const result=await pool.query(`UPDATE ai_leads SET status=$1,handoff=$2,manager_waiting=false,updated_at=NOW() WHERE instagram_user_id=$3 RETURNING *`,[status,action==="TAKE",userId]);
  if(!result.rowCount){ await telegramApi("answerCallbackQuery",{callback_query_id:q.id,text:"Заявка не найдена"}); return true; }
  const lead=result.rows[0];
  const statusText=action==="TAKE"?"🟢 Заявка взята менеджером":"⚪ Заявка закрыта";
  try{
    await telegramApi("answerCallbackQuery",{callback_query_id:q.id,text:action==="TAKE"?"Заявка взята":"Заявка закрыта"});
    if(q.message?.message_id){
      await telegramApi("editMessageText",{chat_id:q.message.chat.id,message_id:q.message.message_id,text:`${telegramLeadText(lead)}\n\n${statusText}`});
    }
  }catch(e){ console.error("Telegram callback update failed:",e.message); }
  return true;
}
async function telegramWebhook(req,res,url){
  if(url.pathname!=="/api/telegram/webhook") return false;
  if(req.method!=="POST") return send(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
  try{const body=await parseBody(req); await handleTelegramCallback(body); return send(res,200,{ok:true});}
  catch(e){console.error("Telegram webhook error:",e.message); return send(res,200,{ok:true});}
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
  const hasTajikWord=/(^|\s)(аз|ба|рузи|рӯзи|парвоз|рейс|билет|фиристед|фирист|салом|ташаккур|рахмат|сентябр|октябр|ноябр|декабр|январ|феврал|март|мар|апрел|май|июн|июл|август)(?=\s|$|[,.!?])/i.test(t);
  if(/[ӣқғҳҷӯ]/i.test(t) || hasTajikWord) return "tj";
  if(/(^|\s)(the|from|to|flight|flights|ticket|tickets|send|hello|hi|september|october|november|december|january|february|march|april|may|june|july|august)(?=\s|$|[,.!?])/i.test(t)) return "en";
  return "ru";
}
function detectManagerRequest(text){
  const t=String(text||"").toLowerCase().replace(/[ё]/g,"е").trim();
  if(!t) return false;
  const patterns=[
    /(?:соедин|свяж|подключ|позов|позвать|переключ).{0,40}(?:менеджер|оператор|сотрудник)/i,
    /(?:менеджер|оператор|сотрудник).{0,40}(?:соедин|свяж|подключ|позов|переключ)/i,
    /(?:мне|меня).{0,20}(?:к|с).{0,20}(?:менеджер|оператор)/i,
    /(?:маро|мани).{0,20}(?:бо|ба).{0,20}(?:менеджер|оператор).{0,30}(?:пайваст|васл|пайванд)/i,
    /(?:бо|ба).{0,20}(?:менеджер|оператор).{0,30}(?:пайваст|васл|пайванд)/i,
    /(?:connect|transfer|put|pass|send).{0,40}(?:me|us)?.{0,20}(?:to|with).{0,20}(?:a )?(?:manager|agent|operator)/i,
    /(?:manager|agent|operator).{0,30}(?:connect|transfer|talk|speak)/i
  ];
  return patterns.some(re=>re.test(t));
}
function detectManagerFollowup(text){
  const t=String(text||"").toLowerCase().replace(/[ё]/g,"е").trim();
  if(!t) return false;
  // Messages sent after the client was already handed to a manager.
  // These must never be interpreted as a new flight search.
  const patterns=[
    /(?:менеджер|оператор|сотрудник).{0,60}(?:не ответил|не отвечает|не ответила|не отвечает|не позвонил|не позвонила|не звонил|не связал|не связался|не связалась|молчит|ответа нет|до сих пор|пока нет|хол|ҷавоб надод|ҷавоб намедиҳад|тамос нагирифт|занги накард)/i,
    /(?:мне|нам|маро).{0,30}(?:не ответил|не позвонил|не связался|не звонит|никто не ответил|ответа нет)/i,
    /(?:до сих пор|пока|хол|то ҳол).{0,40}(?:нет ответа|не ответил|не ответила|не звонил|не позвонил|ҷавоб нест|ҷавоб надод)/i,
    /(?:когда|кай).{0,30}(?:ответит|позвонит|свяжется|ҷавоб медиҳад|тамос мегирад).{0,30}(?:менеджер|оператор)/i,
    /(?:manager|agent|operator).{0,60}(?:didn.?t reply|hasn.?t replied|didn.?t call|hasn.?t called|no response|still waiting)/i,
    /(?:still|yet).{0,30}(?:waiting|no response|no reply).{0,30}(?:manager|agent|operator)?/i
  ];
  return patterns.some(re=>re.test(t));
}
function managerFollowupReply(language){
  if(language==="tj") return "Фаҳмо 🙏 Узр барои интизорӣ. Менеджер ҳоло ба шумо ҷавоб надодааст. Ман дархости шуморо нигоҳ медорам. Лутфан каме интизор шавед — менеджер бо шумо тамос мегирад.";
  if(language==="en") return "I understand 🙏 Sorry for the wait. The manager has not replied yet. I’ll keep your request active. Please wait a little longer — the manager will contact you.";
  return "Понимаю 🙏 Извините за ожидание. Менеджер пока не ответил. Я сохраню вашу заявку активной. Пожалуйста, немного подождите — менеджер свяжется с вами.";
}
function managerReply(language){
  if(language==="tj") return "Албатта 👍 Ман дархости шуморо ба менеджер мефиристам. Лутфан каме интизор шавед — менеджер бо шумо тамос мегирад.";
  if(language==="en") return "Of course 👍 I’ll pass your request to a manager. Please wait a little — a manager will contact you.";
  return "Конечно 👍 Я передам ваш запрос менеджеру. Пожалуйста, немного подождите — менеджер свяжется с вами.";
}
function parseFlightDetails(text){
  const t=String(text||'').trim(), low=t.toLowerCase().replace(/[ё]/g,'е');
  const cityNames=Object.keys(IATA_BY_CITY);
  const found=[];
  for(const city of cityNames.sort((a,b)=>b.length-a.length)){
    const escaped=city.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp(`(?:^|[^a-zа-яёӣқғҳҷӯ])${escaped}(?=$|[^a-zа-яёӣқғҳҷӯ])`,'i');
    const m=re.exec(low);
    if(m && !found.some(x=>x.city===city)) found.push({city,index:m.index+(m[0].length-city.length)});
  }
  found.sort((a,b)=>a.index-b.index);
  let from_city='',to_city='';
  const route=low.match(/(?:из|from|аз)\s+(.+?)\s+(?:в|to|ба)\s+(.+?)(?=\s+(?:на|on|рӯзи|рузи|дата|date|обратно|return|баргашт)\b|$)/i);
  if(route){
    const routeCities=[];
    for(const city of cityNames){
      const idx=route[1].indexOf(city); if(idx>=0) routeCities.push({city,index:idx});
    }
    const destCities=[];
    for(const city of cityNames){
      const idx=route[2].indexOf(city); if(idx>=0) destCities.push({city,index:idx});
    }
    routeCities.sort((a,b)=>a.index-b.index); destCities.sort((a,b)=>a.index-b.index);
    if(routeCities[0]) from_city=routeCities[0].city;
    if(destCities[0]) to_city=destCities[0].city;
  }
  if(!IATA_BY_CITY[from_city] || !IATA_BY_CITY[to_city]){
    if(found.length>=2){ from_city=found[0].city; to_city=found[1].city; }
  }
  const normalizeCity=v=>{
    const x=String(v||'').trim().toLowerCase();
    if(IATA_BY_CITY[x]){
      const canonical={
        'москвы':'москва','москву':'москва','мск':'москва',
        'ташкента':'ташкент','ташкенте':'ташкент',
        'екатеринбурга':'екатеринбург','екатеринбурге':'екатеринбург',
        'петербург':'санкт-петербург'
      };
      return canonical[x]||x;
    }
    return cityNames.find(c=>x===c||x.startsWith(c+' '))||x;
  };
  from_city=normalizeCity(from_city); to_city=normalizeCity(to_city);

  const months={
    январь:1,января:1,январ:1,янв:1,january:1,
    февраль:2,февраля:2,феврал:2,фев:2,february:2,
    март:3,марта:3,мар:3,march:3,
    апрель:4,апреля:4,апрел:4,апр:4,april:4,
    май:5,мая:5,may:5,
    июнь:6,июня:6,июн:6,june:6,
    июль:7,июля:7,июл:7,july:7,
    август:8,августа:8,авг:8,august:8,
    сентябрь:9,сентября:9,сентябр:9,сент:9,september:9,
    октябрь:10,октября:10,октябр:10,окт:10,october:10,
    ноябрь:11,ноября:11,ноябр:11,нояб:11,november:11,
    декабрь:12,декабря:12,декабр:12,дек:12,december:12
  };
  const parseDate=(day,month,year)=>{
    const key=String(month||'').toLowerCase();
    const mk=Object.keys(months).find(k=>key===k||key.startsWith(k));
    if(!mk)return '';
    let y=year?Number(year):new Date().getFullYear(); if(String(year||'').length===2)y=2000+Number(year);
    const d=Number(day),mo=months[mk],dt=new Date(y,mo-1,d);
    return dt.getFullYear()===y&&dt.getMonth()===mo-1&&dt.getDate()===d?`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  };
  const returnContext=/(?:обратно|обратный|туда.?обратно|возврат|return|back|баргашт|бозгашт|санаи бозгашт|рӯзи бозгашт|рӯзи баргашт)/i.test(low);
  let dates=[];
  const dm=[...low.matchAll(/(?:^|\s)([0-3]?\d)\s+((?:январ(?:ь|я)?|янв|феврал(?:ь|я)?|фев|март|мар(?:та)?|апрел(?:ь|я)?|апр|май|июн(?:ь|я)?|июл(?:ь|я)?|август(?:а)?|авг|сентябр(?:ь|я)?|сент|октябр(?:ь|я)?|окт|ноябр(?:ь|я)?|нояб|декабр(?:ь|я)?|дек|january|february|march|april|may|june|july|august|september|october|november|december))(?:\s+(20\d{2}|\d{2}))?(?=\s|$|[,.!?])/gi)];
  for(const x of dm){const d=parseDate(x[1],x[2],x[3]);if(d)dates.push(d);}
  const numeric=[...low.matchAll(/\b([0-3]?\d)[.\/-]([01]?\d)(?:[.\/-](\d{2}|\d{4}))?\b/g)];
  for(const x of numeric){let y=x[3]||String(new Date().getFullYear());if(y.length===2)y=`20${y}`;const d=Number(x[1]),mo=Number(x[2]),dt=new Date(Number(y),mo-1,d);if(dt.getFullYear()===Number(y)&&dt.getMonth()===mo-1&&dt.getDate()===d)dates.push(`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`);}
  dates=[...new Set(dates)];
  let departure_date='',return_date='';
  if(dates.length>=2){departure_date=dates[0];return_date=dates[1];}
  else if(dates.length===1){if(returnContext)return_date=dates[0];else departure_date=dates[0];}

  let passengers='';
  const adult=low.match(/([1-9]\d?)\s*(?:взросл(?:ый|ых|ого|ые)?|adult(?:s)?|калонсол(?:он)?)/i);
  const pax=low.match(/([1-9]\d?)\s*(?:пассажир(?:а|ов)?|чел(?:овек)?|мусофир(?:он)?|нафар)/i);
  const child=low.match(/([1-9]\d?)\s*(?:ребен(?:ок|ка|ку|ка)?|дет(?:ей|и)?|child(?:ren)?|кӯдак(?:он)?|кудак(?:он)?)/i);
  const infant=low.match(/([1-9]\d?)\s*(?:младен(?:ец|цев)?|infant(?:s)?|навзод(?:он)?)/i);
  if(adult||child||infant){const parts=[];if(adult)parts.push(`${adult[1]} взрослых`);if(child)parts.push(`${child[1]} ${Number(child[1])===1?'ребёнок':'детей'}`);if(infant)parts.push(`${infant[1]} младенец`);passengers=parts.join(' + ');}
  else if(pax)passengers=`${pax[1]} пассажир${Number(pax[1])===1?'':'а'}`;
  const baggage=/без\s*(?:багажа|багаж)|танҳо\s+ручн|только\s+ручн|hand\s+luggage\s+only|бе\s*(?:багаж|бағоҷ)|танҳо\s+бағоҷи\s+дастӣ|ручная\s+кладь\s+только/i.test(low)?'Только ручная кладь':((low.match(/(\d{1,2})\s*(?:кг|kg)/i)?.[1])?`Багаж ${low.match(/(\d{1,2})\s*(?:кг|kg)/i)[1]} кг`:((/багаж|бағоҷ|luggage|baggage|чемодан/i.test(low))?'Нужен багаж':''));
  let trip_type='';
  if(return_date||/(?:туда.?обратно|round.?trip|return ticket|билет обратно|обратный билет|рафту баргашт|рафту бозгашт)/i.test(low))trip_type='roundtrip';
  if(/(?:только туда|one.?way|в одну сторону|танҳо рафтан|яктарафа)/i.test(low))trip_type='oneway';
  return {from_city,to_city,departure_date,return_date,trip_type,passengers,baggage};
}

function detectAlreadyProvided(text){
  const t=String(text||'').toLowerCase().replace(/[ё]/g,'е').trim();
  return /(?:я\s+(?:же\s+)?написал|я\s+уже\s+(?:писал|написал)|я\s+же\s+сказал|уже\s+писал|ведь\s+написал|я\s+это\s+уже\s+написал|ман\s+(?:аллакай|аллакай\s+)?навиштам|ман\s+навиштам|навиштам|навишта\s+будам|ман\s+гуфтам|already\s+(?:wrote|sent)|i\s+already\s+(?:wrote|sent)|i\s+said\s+that)/i.test(t);
}
function missingInfoReply(lang, lead){
  if(!lead?.from_city || !lead?.to_city) return lang==='tj'?'Лутфан шаҳрҳоро нависед: аз кадом шаҳр → ба кадом шаҳр.':lang==='en'?'Please send the route: from which city → to which city.':'Напишите маршрут: из какого города → в какой город.';
  if(!lead?.departure_date) return lang==='tj'?`Фаҳмо ✈️ ${lead.from_city} → ${lead.to_city}. Лутфан санаи парвозро нависед. 📅`:lang==='en'?`Got it ✈️ ${lead.from_city} → ${lead.to_city}. Please send the departure date. 📅`:`Понял ✈️ ${lead.from_city} → ${lead.to_city}. Напишите дату вылета. 📅`;
  if(!lead?.passengers) return lang==='tj'?`Фаҳмо ✈️ ${lead.from_city} → ${lead.to_city}. Чанд нафар сафар мекунанд? 👥`:lang==='en'?`Got it ✈️ ${lead.from_city} → ${lead.to_city}. How many passengers will travel? 👥`:`Понял ✈️ ${lead.from_city} → ${lead.to_city}. Сколько пассажиров будет? 👥`;
  if(!lead?.baggage) return lang==='tj'?'Маълумоти мусофиронро гирифтам. 🧳 Ба шумо бағоҷ лозим аст ё танҳо ручная кладь?':lang==='en'?'I have the passenger details. 🧳 Do you need checked baggage or hand luggage only?':'Данные о пассажирах получил. 🧳 Вам нужен багаж или только ручная кладь?';
  return '';
}

async function aiAnalyze(instagramUserId,text){
  const history=(await getRecentAiHistory(instagramUserId)).slice(-10),existingLead=await getExistingAiLead(instagramUserId),detectedLanguage=detectInstagramLanguage(text),parsed=parseFlightDetails(text),low=String(text||'').toLowerCase();
  const asksForFlights=/(рейс|рейсы|парвоз|парвозҳо|билет|билеты|flight|flights|ticket|tickets|фирист|отправ|send|дидани|смотреть)/i.test(low);
  const managerRequest=detectManagerRequest(text),managerFollowup=detectManagerFollowup(text),managerContext=!!existingLead?.manager_waiting,alreadyProvided=detectAlreadyProvided(text);
  if(managerRequest||managerFollowup||(managerContext&&/(?:менеджер|оператор|manager|agent|то ҳол|ҳоло|до сих пор|пока|waiting|ҷавоб|ответ|звон|позвон|тамос|contact)/i.test(low))){
    const isFollowup=managerFollowup||(!managerRequest&&managerContext);
    return {language:detectedLanguage,intent:'support',reply:isFollowup?managerFollowupReply(detectedLanguage):managerReply(detectedLanguage),name:'',phone:'',from_city:existingLead?.from_city||'',to_city:existingLead?.to_city||'',departure_date:existingLead?.departure_date?String(existingLead.departure_date).slice(0,10):'',return_date:existingLead?.return_date?String(existingLead.return_date).slice(0,10):'',trip_type:existingLead?.trip_type||'',passengers:existingLead?.passengers||'',baggage:existingLead?.baggage||'',handoff:true,manager_waiting:true};
  }
  const asksAboutReturn=/(обратно|туда.?обратно|возврат|баргашт|бозгашт|return|back)/i.test(low);
  if(!parsed.from_city&&existingLead?.from_city&&existingLead?.to_city){parsed.from_city=existingLead.from_city;parsed.to_city=existingLead.to_city;}
  if(!parsed.departure_date&&existingLead?.departure_date&&!asksAboutReturn)parsed.departure_date=String(existingLead.departure_date).slice(0,10);
  if(asksAboutReturn&&existingLead?.from_city&&existingLead?.to_city){parsed.from_city=existingLead.from_city;parsed.to_city=existingLead.to_city;parsed.departure_date=existingLead.departure_date?String(existingLead.departure_date).slice(0,10):parsed.departure_date;}
  if(!parsed.return_date&&existingLead?.return_date&&asksAboutReturn)parsed.return_date=String(existingLead.return_date).slice(0,10);
  if(!parsed.trip_type&&existingLead?.trip_type)parsed.trip_type=existingLead.trip_type;
  const passengers=parsed.passengers||existingLead?.passengers||'',baggage=parsed.baggage||existingLead?.baggage||'',trip_type=parsed.trip_type||existingLead?.trip_type||'';
  const merged={from_city:parsed.from_city||'',to_city:parsed.to_city||'',departure_date:parsed.departure_date||'',return_date:parsed.return_date||'',trip_type,passengers,baggage};

  // Deterministic flight-data flow: never let an LLM replace correctly parsed route/date/context.
  const greeting=/^(салом(?:\s+алейкум)?|ассалом\s+алейкум|ваалейкум\s+ассалом|привет|здравствуйте|hello|hi)[!.\s]*$/i.test(low);
  if(alreadyProvided && existingLead){
    const state={...merged,from_city:merged.from_city||existingLead.from_city||'',to_city:merged.to_city||existingLead.to_city||'',departure_date:merged.departure_date||String(existingLead.departure_date||'').slice(0,10),return_date:merged.return_date||String(existingLead.return_date||'').slice(0,10),passengers:merged.passengers||existingLead.passengers||'',baggage:merged.baggage||existingLead.baggage||'',trip_type:merged.trip_type||existingLead.trip_type||''};
    return {language:detectedLanguage,intent:'general',reply:missingInfoReply(detectedLanguage,state)|| (detectedLanguage==='tj'?'Ҳа, ман маълумоти шуморо дидам 👍 Ман онро аз нав пурсидан намехоҳам. Лутфан каме интизор шавед.':'Да, я вижу вашу заявку 👍 Не нужно повторять данные. Я использую уже указанную информацию.'),name:'',phone:'',...state,handoff:false,manager_waiting:false};
  }
  if(greeting && !merged.from_city && !merged.to_city && !merged.departure_date){
    return {language:detectedLanguage,intent:'general',reply:detectedLanguage==='tj'?'Салом! 👋 Ман ба шумо дар ҷустуҷӯи чиптаи ҳавопаймо кӯмак мекунам. Аз кадом шаҳр → ба кадом шаҳр ва санаи сафарро нависед.':detectedLanguage==='en'?'Hello! 👋 I can help you find a flight. Send the route and travel date.':'Здравствуйте! 👋 Я помогу найти авиабилет. Напишите маршрут и дату поездки.',name:'',phone:'',...merged,handoff:false,manager_waiting:false};
  }
  const missing=missingInfoReply(detectedLanguage,merged);
  if(missing){
    return {language:detectedLanguage,intent:'general',reply:missing,name:'',phone:'',...merged,handoff:false,manager_waiting:false};
  }
  if(merged.trip_type==='roundtrip' && !merged.return_date){
    return {language:detectedLanguage,intent:'general',reply:detectedLanguage==='tj'?`Фаҳмо ✈️ ${merged.from_city} → ${merged.to_city}, ${merged.departure_date}. Лутфан санаи бозгаштро нависед. 📅`:detectedLanguage==='en'?`Got it ✈️ ${merged.from_city} → ${merged.to_city}, ${merged.departure_date}. Please send the return date. 📅`:`Понял ✈️ ${merged.from_city} → ${merged.to_city}, ${merged.departure_date}. Напишите дату обратного рейса. 📅`,name:'',phone:'',...merged,handoff:false,manager_waiting:false};
  }
  if(asksAboutReturn && !merged.return_date){
    return {language:detectedLanguage,intent:'general',reply:detectedLanguage==='tj'?`Фаҳмо ✈️ ${merged.from_city} → ${merged.to_city}. Лутфан санаи бозгаштро нависед. 📅`:`Понял ✈️ ${merged.from_city} → ${merged.to_city}. Напишите дату обратного рейса. 📅`,name:'',phone:'',...merged,handoff:false,manager_waiting:false};
  }
  // Ready to search: deterministic confirmation. Actual live prices remain on White Label.
  const parts=merged.departure_date.split('-');
  const monthNames={ru:['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'],tj:['январ','феврал','март','апрел','май','июн','июл','август','сентябр','октябр','ноябр','декабр'],en:['January','February','March','April','May','June','July','August','September','October','November','December']};
  const day=parts[2],month=(monthNames[detectedLanguage]||monthNames.ru)[Number(parts[1])-1];
  let reply=detectedLanguage==='tj'?`Фаҳмо ✈️ ${merged.from_city} → ${merged.to_city}, ${day} ${month}. Ҳоло ҷустуҷӯи парвозҳои ҷорӣ ва нархҳоро омода мекунам.`:detectedLanguage==='en'?`Got it ✈️ ${merged.from_city} → ${merged.to_city}, ${day} ${month}. I’ll prepare the current flight and price search.`:`Понял ✈️ ${merged.from_city} → ${merged.to_city}, ${day} ${month}. Сейчас подготовлю поиск актуальных рейсов и цен.`;
  if(merged.return_date){const rp=merged.return_date.split('-');reply+=detectedLanguage==='tj'?` Бозгашт: ${rp[2]} ${monthNames.tj[Number(rp[1])-1]}.`:detectedLanguage==='en'?` Return: ${rp[2]} ${monthNames.en[Number(rp[1])-1]}.`:` Обратно: ${rp[2]} ${monthNames.ru[Number(rp[1])-1]}.`;}
  return {language:detectedLanguage,intent:'search',reply,name:'',phone:'',...merged,handoff:false,manager_waiting:false};
}
async function maybeRenotifyManager(lead,previousLead){
  if(!lead || !lead.manager_waiting || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  const last=previousLead?.manager_last_notified_at ? new Date(previousLead.manager_last_notified_at).getTime() : 0;
  if(last && Date.now()-last < 15*60*1000) return;
  try{
    const refreshed=await upsertAiLead({instagram_user_id:lead.instagram_user_id,username:lead.username,language:lead.language,intent:lead.intent,name:lead.name,phone:lead.phone,from_city:lead.from_city,to_city:lead.to_city,departure_date:lead.departure_date,return_date:lead.return_date,trip_type:lead.trip_type,passengers:lead.passengers,baggage:lead.baggage,last_message:lead.last_message,ai_reply:lead.ai_reply,status:lead.status,handoff:true,manager_waiting:true,manager_last_notified_at:new Date().toISOString()});
    await telegramNotify(refreshed||lead);
  }catch(e){console.error("Manager re-notify failed:",e.message)}
}
async function processInstagramManagerPostback(m){
  const existing=await getExistingAiLead(m.senderId);
  const language=existing?.language||detectInstagramLanguage(m.postbackTitle||"");
  const reply=managerReply(language);
  const profile=await getInstagramUserProfile(m.senderId);
  const lead=await upsertAiLead({instagram_user_id:m.senderId,username:profile?.username||"",language,intent:"support",name:profile?.name||"",phone:"",from_city:existing?.from_city||"",to_city:existing?.to_city||"",departure_date:existing?.departure_date?String(existing.departure_date).slice(0,10):"",return_date:existing?.return_date?String(existing.return_date).slice(0,10):"",trip_type:existing?.trip_type||"",passengers:existing?.passengers||"",baggage:existing?.baggage||"",last_message:"[Клиент нажал кнопку: менеджер]",ai_reply:reply,status:"in_progress",handoff:true,manager_waiting:true});
  if(AI_AUTO_REPLY){const sent=await sendInstagramText(m.senderId,reply);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}-${Math.random()}`,"out",reply);}
  if(lead) await telegramNotify(lead);
  console.log("Instagram manager postback processed",JSON.stringify({sender:m.senderId,handoff:true}));
}
async function processInstagramTripChoice(m){
  const existing=await getExistingAiLead(m.senderId);
  const language=existing?.language||detectInstagramLanguage(m.postbackTitle||"");
  const choice=m.postbackPayload==="CHOOSE_ROUNDTRIP"?"roundtrip":"oneway";
  if(!existing?.from_city||!existing?.to_city||!existing?.departure_date){
    const reply=language==="tj"?"Лутфан аввал масир ва санаи парвозро нависед.":language==="en"?"Please send the route and departure date first.":"Сначала укажите маршрут и дату вылета.";
    if(AI_AUTO_REPLY){const sent=await sendInstagramText(m.senderId,reply);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}`,"out",reply);}
    return;
  }
  if(choice==="roundtrip" && !existing.return_date){
    const reply=language==="tj"?`Фаҳмо ✈️ ${existing.from_city} → ${existing.to_city}.
Лутфан санаи бозгаштро нависед. 📅`:language==="en"?`Got it ✈️ ${existing.from_city} → ${existing.to_city}.
Please send the return date. 📅`:`Понял ✈️ ${existing.from_city} → ${existing.to_city}.
Напишите дату обратного рейса. 📅`;
    await upsertAiLead({instagram_user_id:m.senderId,language,intent:"search",from_city:existing.from_city,to_city:existing.to_city,departure_date:String(existing.departure_date).slice(0,10),return_date:"",trip_type:"roundtrip",passengers:existing.passengers||"",baggage:existing.baggage||"",last_message:"[Выбрано: туда и обратно]",ai_reply:reply,status:"new",handoff:false,manager_waiting:false});
    if(AI_AUTO_REPLY){const sent=await sendInstagramText(m.senderId,reply);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}`,"out",reply);}
    return;
  }
  const ai={language,intent:"search",handoff:false,from_city:existing.from_city,to_city:existing.to_city,departure_date:String(existing.departure_date).slice(0,10),return_date:existing.return_date?String(existing.return_date).slice(0,10):"",trip_type:"oneway",passengers:existing.passengers||"",baggage:existing.baggage||""};
  const reply=language==="tj"?`Фаҳмо ✈️ ${ai.from_city} → ${ai.to_city}. Ҷустуҷӯи парвозҳои ҷориро кушоед:`:language==="en"?`Got it ✈️ ${ai.from_city} → ${ai.to_city}. Open the current flight search:`:`Понял ✈️ ${ai.from_city} → ${ai.to_city}. Откройте поиск актуальных рейсов:`;
  await upsertAiLead({instagram_user_id:m.senderId,language,intent:"search",from_city:ai.from_city,to_city:ai.to_city,departure_date:ai.departure_date,return_date:"",trip_type:"oneway",passengers:ai.passengers,baggage:ai.baggage,last_message:"[Выбрано: только туда]",ai_reply:reply,status:"new",handoff:false,manager_waiting:false});
  if(AI_AUTO_REPLY){const sent=await sendInstagramText(m.senderId,reply);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}`,"out",reply);await sendInstagramActionButtons(m.senderId,ai);}
}
async function processInstagramMessage(m){
  console.log("Instagram message processing started",JSON.stringify({sender:m.senderId,mid:m.mid,text:m.text.slice(0,120),postback:m.postbackPayload||""}));
  await saveAiMessage(m.senderId,m.mid,"in",m.text||m.postbackTitle||"[Вложение]");
  if(m.postbackPayload==="CONNECT_MANAGER") return processInstagramManagerPostback(m);
  if(m.postbackPayload==="CHOOSE_ONEWAY" || m.postbackPayload==="CHOOSE_ROUNDTRIP") return processInstagramTripChoice(m);
  let text=m.text||"";
  if(!text && m.attachments?.length){
    const audio=m.attachments.find(a=>String(a?.type||"").toLowerCase().includes("audio"));
    if(audio){try{text=await transcribeInstagramAudio(audio)}catch(e){console.error("Instagram voice transcription error:",e.message)}}
    if(!text) text="Клиент отправил голосовое сообщение. Попроси клиента написать текстом, что нужно забронировать.";
  }
  try{
    const ai=await aiAnalyze(m.senderId,text);
    const status=ai.handoff?"in_progress":"new";
    const profile=await getInstagramUserProfile(m.senderId);
    const previousLead=await getExistingAiLead(m.senderId);
    const lead=await upsertAiLead({instagram_user_id:m.senderId,username:profile?.username||"",language:ai.language,intent:ai.intent,name:ai.name||profile?.name||"",phone:ai.phone,from_city:ai.from_city,to_city:ai.to_city,departure_date:ai.departure_date,return_date:ai.return_date,trip_type:ai.trip_type,passengers:ai.passengers,baggage:ai.baggage,last_message:m.text||"[Вложение]",ai_reply:ai.reply,status,handoff:ai.handoff,manager_waiting:!!ai.manager_waiting});
    if(AI_AUTO_REPLY && ai.reply){const sent=await sendInstagramText(m.senderId,ai.reply);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}-${Math.random()}`,"out",ai.reply);}
    if(AI_AUTO_REPLY){
      const buttonSent=await sendInstagramActionButtons(m.senderId,ai);
      if(buttonSent?.message_id) await saveAiMessage(m.senderId,buttonSent.message_id,"out",ai.from_city&&ai.to_city&&ai.departure_date?"[Кнопки: просмотр актуальных билетов + менеджер]":"[Кнопка: менеджер]");
    }
    if(lead && ai.handoff && (!previousLead?.manager_waiting || ai.intent!=="support")) await telegramNotify(lead);
    if(lead && ai.intent==="support" && ai.manager_waiting) await maybeRenotifyManager(lead,previousLead);
    console.log("Instagram AI processed",JSON.stringify({sender:m.senderId,intent:ai.intent,handoff:!!ai.handoff}));
  }catch(e){
    console.error("Instagram AI processing error:",e.message);
    try{const fallback=detectInstagramLanguage(m.text)==="tj"?"Салом! 👋 Лутфан масир ва санаи сафарро нависед, ман кӯмак мекунам.":detectInstagramLanguage(m.text)==="en"?"Hello! 👋 Please send the route and travel date, and I’ll help you.":"Здравствуйте! 👋 Напишите маршрут и дату поездки, и я помогу вам.";if(AI_AUTO_REPLY) {const sent=await sendInstagramText(m.senderId,fallback);await saveAiMessage(m.senderId,sent?.message_id||`out-${Date.now()}-${Math.random()}`,"out",fallback);}}catch(sendErr){console.error("Instagram fallback reply error:",sendErr.message)}
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
    if(req.method==="GET" && url.pathname==="/api/admin/ai-stats") {
      if(!hasPermission(user,"bookings_view")) return send(res,403,{ok:false,error:"FORBIDDEN"});
      const q=await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='new')::int AS new_count, COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress, COUNT(*) FILTER (WHERE intent='purchase')::int AS purchase, COUNT(*) FILTER (WHERE handoff=true)::int AS handoff, COUNT(*) FILTER (WHERE manager_waiting=true)::int AS waiting_manager, COUNT(*) FILTER (WHERE created_at::date=CURRENT_DATE)::int AS today FROM ai_leads`);
      const d=await pool.query(`SELECT created_at::date AS day, COUNT(*)::int AS count FROM ai_leads WHERE created_at>=CURRENT_DATE-INTERVAL '29 days' GROUP BY created_at::date ORDER BY day`);
      const r=await pool.query(`SELECT COALESCE(from_city,'') AS from_city, COALESCE(to_city,'') AS to_city, COUNT(*)::int AS count FROM ai_leads WHERE from_city<>'' OR to_city<>'' GROUP BY from_city,to_city ORDER BY count DESC LIMIT 10`);
      return send(res,200,{ok:true,stats:q.rows[0],daily:d.rows,routes:r.rows});
    }
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
    const telegramHandled = await telegramWebhook(req,res,u);
    if(telegramHandled!==false)return;
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
async function configureTelegramWebhook(){
  const base=String(process.env.TELEGRAM_WEBHOOK_URL||"").trim();
  if(!TELEGRAM_BOT_TOKEN || !base) return;
  try{const data=await telegramApi("setWebhook",{url:base}); console.log("Telegram webhook configured",JSON.stringify({url:base,ok:data.ok}));}
  catch(e){console.error("Telegram webhook setup failed:",e.message);}
}
initDb().then(async()=>{await configureTelegramWebhook();server.listen(PORT,()=>console.log("Aviakassa server on "+PORT))}).catch(async e=>{console.error("Database initialization failed; starting server without DB:",e.message);await configureTelegramWebhook();server.listen(PORT,()=>console.log("Aviakassa server on "+PORT+" (DB unavailable)"))});

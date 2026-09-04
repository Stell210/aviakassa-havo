const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const TRAVELPORT_CLIENT_ID = process.env.TRAVELPORT_CLIENT_ID || "";
const TRAVELPORT_CLIENT_SECRET = process.env.TRAVELPORT_CLIENT_SECRET || "";
const TRAVELPORT_USERNAME = process.env.TRAVELPORT_USERNAME || "";
const TRAVELPORT_PASSWORD = process.env.TRAVELPORT_PASSWORD || "";
const TRAVELPORT_PCC = process.env.TRAVELPORT_PCC || "";
const TRAVELPORT_AUTH_URL = process.env.TRAVELPORT_AUTH_URL || "https://auth.pp.travelport.com/oauth/token";
const TRAVELPORT_API_URL = process.env.TRAVELPORT_API_URL || "https://api.pp.travelport.net/11/air/catalog/search/catalogproductofferings";
const TRAVELPORT_CONTENT_SOURCES = String(process.env.TRAVELPORT_CONTENT_SOURCES || "GDS").split(",").map(x=>x.trim().toUpperCase()).filter(Boolean);
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
  `);
  // Price is stored as text so admin can enter symbols, currencies, and phrases.
  await pool.query(`ALTER TABLE flights ALTER COLUMN price TYPE TEXT USING regexp_replace(price::text, '\\.00$', ''), ALTER COLUMN price SET DEFAULT '0'`);
  // Keep the existing Render ADMIN_PASSWORD as the master admin account.
  if(ADMIN_PASSWORD){
    const existing=await pool.query(`SELECT id FROM managers WHERE username='admin' LIMIT 1`);
    if(!existing.rowCount) await pool.query(`INSERT INTO managers(name,username,password_hash,role) VALUES($1,$2,$3,$4)`,["Главный администратор","admin",hashPassword(ADMIN_PASSWORD),"admin"]);
  }
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
    const configured=!!(TRAVELPORT_CLIENT_ID&&TRAVELPORT_CLIENT_SECRET&&TRAVELPORT_USERNAME&&TRAVELPORT_PASSWORD&&TRAVELPORT_PCC);
    return send(res,200,{ok:true,configured,provider:"Travelport TripServices",message:configured?"Travelport credentials настроены в Render.":"Добавьте TRAVELPORT_CLIENT_ID, TRAVELPORT_CLIENT_SECRET, TRAVELPORT_USERNAME, TRAVELPORT_PASSWORD и TRAVELPORT_PCC в Render Environment."});
  }
  if(req.method==="POST" && url.pathname==="/api/admin/supplier/sync"){
    const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"}); if(user.role!=="admin")return send(res,403,{ok:false,error:"ADMIN_ONLY"});
    const configured=!!(TRAVELPORT_CLIENT_ID&&TRAVELPORT_CLIENT_SECRET&&TRAVELPORT_USERNAME&&TRAVELPORT_PASSWORD&&TRAVELPORT_PCC);
    if(!configured)return send(res,503,{ok:false,error:"TRAVELPORT_CREDENTIALS_NOT_SET"});
    return send(res,200,{ok:true,provider:"Travelport TripServices",message:"Travelport настроен. Поиск выполняется через /api/live-search-flights."});
  }
  // Public lists for future site integrations.
  if(req.method==="GET" && url.pathname==="/api/directions" && pool){const q=await pool.query(`SELECT id,city,country,code FROM directions WHERE active=true ORDER BY city`);return send(res,200,{ok:true,directions:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/flights" && pool){const q=await pool.query(`SELECT * FROM flights WHERE active=true AND flight_date>=CURRENT_DATE ORDER BY flight_date,flight_time LIMIT 500`);return send(res,200,{ok:true,flights:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/offers" && pool){const q=await pool.query(`SELECT * FROM offers WHERE active=true AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY created_at DESC`);return send(res,200,{ok:true,offers:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/live-search-flights"){
    const from=safe(url.searchParams.get("from"),120);
    const to=safe(url.searchParams.get("to"),120);
    const date=safe(url.searchParams.get("date"),20);
    const currency=(safe(url.searchParams.get("currency"),8)||"rub").toUpperCase();
    const requestedAirline=safe(url.searchParams.get("airline"),120);
    const directParam=url.searchParams.get("direct");

    const cityIata = {
      "душанбе":"DYU","dushanbe":"DYU","москва":"MOW","moscow":"MOW",
      "санкт-петербург":"LED","saint petersburg":"LED","казань":"KZN","kazan":"KZN",
      "екатеринбург":"SVX","yekaterinburg":"SVX","новосибирск":"OVB","novosibirsk":"OVB",
      "самара":"KUF","samara":"KUF","уфа":"UFA","ufa":"UFA","красноярск":"KJA","krasnoyarsk":"KJA",
      "ростов-на-дону":"ROV","rostov-on-don":"ROV","тюмень":"TJM","tyumen":"TJM","сургут":"SGC","surgut":"SGC",
      "минеральные воды":"MRV","mineralnye vody":"MRV","дубай":"DXB","dubai":"DXB","стамбул":"IST","istanbul":"IST",
      "пекин":"PEK","beijing":"PEK","алматы":"ALA","almaty":"ALA","астана":"NQZ","astana":"NQZ",
      "ташкент":"TAS","tashkent":"TAS","самарканд":"SKD","samarkand":"SKD","бишкек":"FRU","bishkek":"FRU",
      "баку":"GYD","baku":"GYD","тегеран":"IKA","tehran":"IKA","дели":"DEL","delhi":"DEL",
      "абу-даби":"AUH","abu dhabi":"AUH","доха":"DOH","doha":"DOH","анталья":"AYT","antalya":"AYT",
      "тбилиси":"TBS","tbilisi":"TBS"
    };
    function extractIata(value){
      const raw=String(value||"").trim();
      const paren=raw.match(/\(([A-Za-z]{3})\)/); if(paren) return paren[1].toUpperCase();
      if(/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
      const city=raw.split(",")[0].trim().toLowerCase(); return cityIata[city] || null;
    }
    function asArray(v){ return Array.isArray(v)?v:(v?[v]:[]); }
    function firstDefined(...vals){ return vals.find(v=>v!==undefined&&v!==null&&v!==""); }
    function deepFindAll(node,predicate,out=[]){
      if(!node || typeof node!=="object") return out;
      if(predicate(node)) out.push(node);
      if(Array.isArray(node)){ for(const x of node) deepFindAll(x,predicate,out); }
      else for(const v of Object.values(node)) deepFindAll(v,predicate,out);
      return out;
    }
    function durationMinutes(v){
      if(typeof v==="number") return v;
      const s=String(v||""); const m=s.match(/P(?:0D)?T(?:(\d+)H)?(?:(\d+)M)?/i); if(m)return Number(m[1]||0)*60+Number(m[2]||0);
      return Number(s)||0;
    }
    function isoDuration(v){ return durationMinutes(v); }
    function findCurrency(price){ return firstDefined(price?.CurrencyCode?.value,price?.currencyCode,price?.currency); }
    function findTotal(price){ return Number(firstDefined(price?.TotalPrice,price?.Total,price?.Amount?.Total,price?.Amount?.value,price?.value)); }
    function normalizeBrandText(brand){
      if(!brand) return "";
      const attrs=asArray(brand.BrandAttribute);
      const add=asArray(brand.AdditionalBrandAttribute);
      const all=[...attrs,...add];
      const checked=all.filter(a=>/CheckedBag|CarryOn|PersonalItem/i.test(String(a?.classification||a?.Classification||"")));
      return checked.map(a=>`${a.classification||a.Classification}: ${a.inclusion||a.Inclusion}`).join("; ");
    }

    if(!date || !validDate(date)) return send(res,400,{ok:false,error:"INVALID_DATE"});
    const origin=extractIata(from), destination=extractIata(to);
    if(!origin || !destination) return send(res,400,{ok:false,error:"UNKNOWN_CITY_IATA",message:"Не удалось определить IATA-код города. Используйте город из списка или аэропорт с кодом IATA."});
    if(!TRAVELPORT_PCC) {
      console.error(`[Travelport] CONFIG ERROR: TRAVELPORT_PCC is not set | ${origin} -> ${destination} | ${date}`);
      return send(res,503,{ok:false,error:"TRAVELPORT_PCC_NOT_SET"});
    }
    if(!(TRAVELPORT_CLIENT_ID&&TRAVELPORT_CLIENT_SECRET&&TRAVELPORT_USERNAME&&TRAVELPORT_PASSWORD)) {
      console.error(`[Travelport] CONFIG ERROR: credentials incomplete | ${origin} -> ${destination} | ${date}`);
      return send(res,503,{ok:false,error:"TRAVELPORT_CREDENTIALS_NOT_SET"});
    }

    console.log(`[Travelport] SEARCH START | ${origin} -> ${destination} | date=${date} | airline=${requestedAirline||"ALL"} | direct=${directParam||"ALL"}`);

    try{
      if(!global.__travelportToken || global.__travelportToken.expiresAt < Date.now()+60000){
        const authBody=JSON.stringify({username:TRAVELPORT_USERNAME,password:TRAVELPORT_PASSWORD,client_id:TRAVELPORT_CLIENT_ID,client_secret:TRAVELPORT_CLIENT_SECRET,grant_type:"password"});
        const ar=await fetch(TRAVELPORT_AUTH_URL,{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:authBody});
        const aj=await ar.json().catch(()=>({}));
        console.log(`[Travelport] AUTH | HTTP ${ar.status} | token=${aj?.access_token?"OK":"MISSING"}`);
        if(!ar.ok || !aj.access_token) {
          console.error(`[Travelport] AUTH ERROR | HTTP ${ar.status} | ${aj?.error_description||aj?.error||"NO_TOKEN"}`);
          return send(res,502,{ok:false,error:"TRAVELPORT_AUTH_ERROR",details:aj?.error_description||aj?.error||`HTTP_${ar.status}`});
        }
        global.__travelportToken={value:aj.access_token,expiresAt:Date.now()+Math.max(300,Number(aj.expires_in||86400)-120)*1000};
      }
      const body={
        "@type":"CatalogProductOfferingsQueryRequest",
        "CatalogProductOfferingsRequest":{
          "@type":"CatalogProductOfferingsRequestAir",
          "maxNumberOfUpsellsToReturn":4,
          "offersPerPage":50,
          "contentSourceList":["GDS"],
          "PassengerCriteria":[{"@type":"PassengerCriteria","number":1,"passengerTypeCode":"ADT"}],
          "SearchCriteriaFlight":[{"@type":"SearchCriteriaFlight","departureDate":date,"From":{"value":origin},"To":{"value":destination}}]
        }
      };
      if(requestedAirline){
        const map={"аэрофлот":"SU","aeroflot":"SU","s7 airlines":"S7","s7":"S7","уральские авиалинии":"U6","ural airlines":"U6","ютийр":"UT","utair":"UT","somon air":"SZ","somonair":"SZ","узбекистан эйрвейс":"HY","uzbekistan airways":"HY","turkish airlines":"TK","emirates":"EK","flydubai":"FZ","победа":"DP","pобеда":"DP"};
        const code=/^[A-Za-z0-9]{2,3}$/.test(requestedAirline)?requestedAirline.toUpperCase():map[requestedAirline.toLowerCase()];
        if(code) body.CatalogProductOfferingsRequest.SearchModifiersAir={"@type":"SearchModifiersAir","CarrierPreference":[{"@type":"CarrierPreference","preferenceType":"Permitted","carriers":[code]}]};
      }
      const tpHeaders={"Accept-Encoding":"gzip, deflate","Authorization":`Bearer ${global.__travelportToken.value}`,"Content-Type":"application/json","TVP-PCC-Core":TRAVELPORT_PCC,"Accept":"application/json","Accept-Version":"11","Content-Version":"11","Cache-Control":"no-cache","TraceId":`Aviakassa_${origin}_${destination}`};
      console.log(`[Travelport] API REQUEST | endpoint=${TRAVELPORT_API_URL} | PCC=${TRAVELPORT_PCC} | sources=${body.CatalogProductOfferingsRequest.contentSourceList.join(",")}`);
      let rr=await fetch(TRAVELPORT_API_URL,{method:"POST",headers:tpHeaders,body:JSON.stringify(body)});
      const e2e=rr.headers.get("E2ETrackingID")||rr.headers.get("e2etrackingid")||null;
      const contentType=rr.headers.get("content-type")||"";
      let raw=await rr.json().catch(()=>null);
      if(!raw) {
        const text=await rr.text().catch(()=>"");
        raw={__nonJson:text.slice(0,1000)};
      }
      console.log(`[Travelport] API RESPONSE | HTTP ${rr.status} | E2E=${e2e||"none"} | content-type=${contentType||"unknown"}`);
      // NDC is available only for customers provisioned for NDC. If a trial account
      // rejects an aggregated GDS+NDC request, retry safely with GDS only.
      if(!rr.ok && body.CatalogProductOfferingsRequest.contentSourceList.includes("NDC")){
        body.CatalogProductOfferingsRequest.contentSourceList=["GDS"];
        rr=await fetch(TRAVELPORT_API_URL,{method:"POST",headers:tpHeaders,body:JSON.stringify(body)});
        raw=await rr.json().catch(()=>({}));
      }
      if(!rr.ok) {
        const details=raw?.Result?.Error||raw?.error||raw?.Result?.Warning||raw?.__nonJson||`HTTP_${rr.status}`;
        console.error(`[Travelport] API ERROR | HTTP ${rr.status} | ${JSON.stringify(details).slice(0,4000)}`);
        return send(res,502,{ok:false,error:"TRAVELPORT_API_ERROR",details,diagnostics:{httpStatus:rr.status,e2eTrackingId:e2e,contentSources:body.CatalogProductOfferingsRequest.contentSourceList}});
      }

      const root=raw?.CatalogProductOfferingsResponse||raw;
      const resultBlock=root?.Result||{};
      if(Array.isArray(resultBlock?.Error) && resultBlock.Error.length){
        console.error(`[Travelport] SEARCH ERROR | HTTP ${rr.status} | ${JSON.stringify(resultBlock.Error).slice(0,6000)}`);
        return send(res,502,{ok:false,error:"TRAVELPORT_SEARCH_ERROR",details:resultBlock.Error,warnings:resultBlock.Warning||[],diagnostics:{httpStatus:rr.status,e2eTrackingId:e2e,transactionId:root?.transactionId||null,traceId:root?.traceId||null,contentSources:body.CatalogProductOfferingsRequest.contentSourceList}});
      }

      const cpo=root?.CatalogProductOfferings||{};
      const offers=asArray(cpo?.CatalogProductOffering);
      const references=asArray(root?.ReferenceList);
      console.log(`[Travelport] SEARCH DATA | offers=${offers.length} | referenceLists=${references.length} | status=${resultBlock?.status||"unknown"} | transaction=${root?.transactionId||"none"} | trace=${root?.traceId||"none"}`);
      if(!offers.length) console.warn(`[Travelport] ZERO OFFERS | ${origin} -> ${destination} | ${date} | warnings=${JSON.stringify(resultBlock?.Warning||[]).slice(0,4000)}`);
      const flightRefs={}; const productRefs={}; const brands={}; const terms={};
      for(const rl of references){
        for(const f of asArray(rl?.Flight)) if(f?.id) flightRefs[f.id]=f;
        for(const p of asArray(rl?.Product)) if(p?.id) productRefs[p.id]=p;
        for(const b of asArray(rl?.Brand)) if(b?.id) brands[b.id]=b;
        for(const t of asArray(rl?.TermsAndConditions)) if(t?.id) terms[t.id]=t;
      }
      const markup=await getFlightMarkup();
      const airlineNames={SU:"Аэрофлот",S7:"S7 Airlines",U6:"Уральские авиалинии",UT:"ЮТэйр",SZ:"Somon Air",DP:"Победа",TK:"Turkish Airlines",EK:"Emirates",FZ:"flydubai",HY:"Uzbekistan Airways",KC:"Air Astana",A4:"Азимут",WZ:"Red Wings","5N":"Smartavia",I8:"ИрАэро",N4:"Nordwind Airlines",R3:"Якутия",YC:"Ямал",EO:"Pegas Fly",ZF:"Azur Air",FV:"Россия",B2:"Белавиа",J2:"Azerbaijan Airlines",CZ:"China Southern",MU:"China Eastern",CA:"Air China",QR:"Qatar Airways",GF:"Gulf Air",WY:"Oman Air",G9:"Air Arabia",XY:"flynas",RJ:"Royal Jordanian",MS:"EgyptAir",EY:"Etihad Airways",PC:"Pegasus Airlines",JU:"Air Serbia",LO:"LOT",LH:"Lufthansa",AF:"Air France",KL:"KLM",OS:"Austrian Airlines",AY:"Finnair",AZ:"ITA Airways",LX:"SWISS",BA:"British Airways",IB:"Iberia"};
      const flights=[];
      for(const offer of offers){
        const pbo=asArray(offer?.ProductBrandOptions);
        for(const opt of pbo){
          const refs=asArray(opt?.flightRefs);
          const pOffer=asArray(opt?.ProductBrandOffering)[0]; if(!pOffer) continue;
          const priceObj=pOffer?.BestCombinablePrice||pOffer?.Price||{};
          const basePrice=findTotal(priceObj); if(!Number.isFinite(basePrice)||basePrice<=0) continue;
          const currencyCode=findCurrency(priceObj)||currency;
          const flightList=refs.map(id=>flightRefs[id]).filter(Boolean);
          const productList=asArray(pOffer?.Product).map(x=>productRefs[x?.productRef]).filter(Boolean);
          const productFlights=productList.flatMap(p=>asArray(p?.FlightRef||p?.FlightRefs)).map(x=>typeof x==="string"?flightRefs[x]:flightRefs[x?.FlightRef||x?.value]).filter(Boolean);
          const flightObjects=flightList.length?flightList:productFlights;
          // Travelport keeps the actual departure/arrival/marketing details inside
          // ReferenceListFlight -> Flight -> FlightSegment. The previous version
          // treated the Flight object itself as a segment, which caused valid
          // offers to be returned without usable times/airports and then filtered
          // out by the frontend.
          const allSegs=flightObjects.flatMap(f=>asArray(f?.FlightSegment||f?.Segment||f));
          const first=allSegs[0]||{}; const last=allSegs[allSegs.length-1]||{};
          const firstFlight=flightObjects[0]||{};
          const marketing=first?.MarketingCarrier?.airlineCode||first?.MarketingCarrier?.code||first?.carrier||first?.carrierCode||first?.AirSegment?.MarketingCarrier?.code||firstFlight?.carrier||firstFlight?.MarketingCarrier?.airlineCode||firstFlight?.carrierCode;
          const flightNumber=first?.FlightNumber||first?.flightNumber||first?.number||first?.AirSegment?.FlightNumber||firstFlight?.flightNumber||firstFlight?.FlightNumber;
          const dep=first?.Departure?.dateTime||first?.Departure?.DateTime||first?.departureDateTime||first?.departureTime||first?.AirSegment?.Departure?.dateTime;
          const arr=last?.Arrival?.dateTime||last?.Arrival?.DateTime||last?.arrivalDateTime||last?.arrivalTime||last?.AirSegment?.Arrival?.dateTime;
          const fromCode=first?.Departure?.location||first?.Departure?.airport||first?.Departure?.value||first?.departure||offer?.Departure||origin;
          const toCode=last?.Arrival?.location||last?.Arrival?.airport||last?.Arrival?.value||last?.arrival||offer?.Arrival||destination;
          const intermediate=allSegs.slice(0,-1).map(s=>s?.Arrival?.location||s?.Arrival?.airport||s?.Arrival?.value).filter(Boolean).filter((v,i,a)=>i===0||v!==a[i-1]);
          const termsRef=pOffer?.TermsAndConditions?.termsAndConditionsRef; const tc=terms[termsRef]||{};
          const brandRef=pOffer?.Brand?.BrandRef; const brand=brands[brandRef]||{};
          const attrs=normalizeBrandText(brand);
          const baggageParts=[]; for(const b of asArray(tc?.BaggageAllowance)){ if(b?.BaggageAllowanceType||b?.BaggageType||b?.Quantity||b?.Weight) baggageParts.push(JSON.stringify(b)); }
          const direct=allSegs.length<=1;
          const duration=dep&&arr?Math.max(0,Math.round((new Date(arr)-new Date(dep))/60000)):durationMinutes(first?.duration||first?.FlightTime);
          const id=`tp-${offer?.id||"offer"}-${brandRef||"base"}-${flightNumber||Math.random().toString(36).slice(2,8)}`;
          flights.push({id,source:"travelport-tripservices",from_iata:origin,to_iata:destination,from_airport_code:fromCode,to_airport_code:toCode,airline_code:marketing||null,airline:airlineNames[marketing]||marketing||brand?.name||"Авиакомпания",flight_number:flightNumber||null,departure_at:dep||null,arrival_at:arr||null,return_at:null,transfers:Math.max(0,allSegs.length-1),duration_to:duration,transfer_airports:intermediate,transfer_cities:[],price:basePrice+markup,currency:currencyCode,source_price:basePrice,markup,baggage:attrs||baggageParts.join(";")||null,hand_baggage:null,baggage_note:attrs?null:"Условия багажа уточняются",link:null,content_source:pOffer?.ContentSource||null,brand:brand?.name||null,raw_offer_id:offer?.id||null});
        }
      }
      const unique=new Map(); for(const f of flights){ const k=[f.airline_code,f.flight_number,f.departure_at,f.price,f.from_airport_code,f.to_airport_code].join("|"); if(!unique.has(k)) unique.set(k,f); }
      let result=[...unique.values()];
      if(requestedAirline){ const q=requestedAirline.toLowerCase(); result=result.filter(f=>String(f.airline||"").toLowerCase()===q || String(f.airline_code||"").toLowerCase()===q); }
      if(directParam==="true") result=result.filter(f=>Number(f.transfers||0)===0);
      if(directParam==="false") { /* all offers */ }
      result.sort((a,b)=>Number(a.price)-Number(b.price));
      console.log(`[Travelport] SEARCH DONE | offers=${offers.length} | parsed=${flights.length} | unique=${result.length} | ${origin} -> ${destination} | ${date}`);
      return send(res,200,{ok:true,source:"Travelport TripServices",requested:{origin,destination,date,currency,airline:requestedAirline||null,direct:directParam},flights:result,warnings:root?.Result?.Warning||[],diagnostics:{contentSources:body.CatalogProductOfferingsRequest.contentSourceList,offersReceived:offers.length,parsedFlights:flights.length,uniqueFlights:result.length,e2eTrackingId:e2e,transactionId:root?.transactionId||null,traceId:root?.traceId||null}});
    }catch(e){
      console.error(`[Travelport] REQUEST FAILED | ${origin} -> ${destination} | ${date} | ${e?.name||"Error"}: ${e?.message||e}`);
      return send(res,502,{ok:false,error:"TRAVELPORT_REQUEST_FAILED",message:e.message,diagnostics:{origin,destination,date}});
    }
  }

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

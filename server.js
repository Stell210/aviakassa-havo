const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const AVIASALES_API_TOKEN = process.env.AVIASALES_API_TOKEN || "";
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

  if(req.method==="GET" && url.pathname==="/api/admin/supplier/status"){ const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"}); if(user.role!=="admin")return send(res,403,{ok:false,error:"ADMIN_ONLY"}); return send(res,200,{ok:true,configured:!!AVIASALES_API_TOKEN,provider:"Aviasales Data API",message:AVIASALES_API_TOKEN?"Aviasales API token настроен в Render.":"Добавьте AVIASALES_API_TOKEN в Render Environment."}); }
  if(req.method==="POST" && url.pathname==="/api/admin/supplier/sync"){ const user=authorized(req); if(!user)return send(res,401,{ok:false,error:"UNAUTHORIZED"}); if(user.role!=="admin")return send(res,403,{ok:false,error:"ADMIN_ONLY"}); if(!AVIASALES_API_TOKEN)return send(res,503,{ok:false,error:"AVIASALES_API_TOKEN_NOT_SET",message:"Добавьте AVIASALES_API_TOKEN в Render Environment."}); return send(res,200,{ok:true,provider:"Aviasales Data API",message:"Aviasales API token настроен. Поиск рейсов выполняется через внутренний маршрут /api/live-search-flights."}); }
  // Public lists for future site integrations.
  if(req.method==="GET" && url.pathname==="/api/directions" && pool){const q=await pool.query(`SELECT id,city,country,code FROM directions WHERE active=true ORDER BY city`);return send(res,200,{ok:true,directions:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/flights" && pool){const q=await pool.query(`SELECT * FROM flights WHERE active=true AND flight_date>=CURRENT_DATE ORDER BY flight_date,flight_time LIMIT 500`);return send(res,200,{ok:true,flights:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/offers" && pool){const q=await pool.query(`SELECT * FROM offers WHERE active=true AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY created_at DESC`);return send(res,200,{ok:true,offers:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/live-search-flights"){
    const from=safe(url.searchParams.get("from"),120);
    const to=safe(url.searchParams.get("to"),120);
    const date=safe(url.searchParams.get("date"),20);
    const direct=url.searchParams.get("direct") !== "false";
    const currency=(safe(url.searchParams.get("currency"),8)||"rub").toLowerCase();

    const cityIata = {
      "душанбе":"DYU","dushanbe":"DYU",
      "москва":"MOW","moscow":"MOW",
      "санкт-петербург":"LED","saint petersburg":"LED",
      "казань":"KZN","kazan":"KZN",
      "екатеринбург":"SVX","yekaterinburg":"SVX",
      "новосибирск":"OVB","novosibirsk":"OVB",
      "самара":"KUF","samara":"KUF",
      "уфа":"UFA","ufa":"UFA",
      "красноярск":"KJA","krasnoyarsk":"KJA",
      "ростов-на-дону":"ROV","rostov-on-don":"ROV",
      "тюмень":"TJM","tyumen":"TJM",
      "сургут":"SGC","surgut":"SGC",
      "минеральные воды":"MRV","mineralnye vody":"MRV",
      "дубай":"DXB","dubai":"DXB",
      "стамбул":"IST","istanbul":"IST",
      "пекин":"PEK","beijing":"PEK",
      "алматы":"ALA","almaty":"ALA",
      "астана":"NQZ","astana":"NQZ",
      "ташкент":"TAS","tashkent":"TAS",
      "самарканд":"SKD","samarkand":"SKD",
      "бишкек":"FRU","bishkek":"FRU",
      "баку":"GYD","baku":"GYD",
      "тегеран":"IKA","tehran":"IKA",
      "дели":"DEL","delhi":"DEL",
      "абу-даби":"AUH","abu dhabi":"AUH",
      "доха":"DOH","doha":"DOH",
      "анталья":"AYT","antalya":"AYT",
      "тбилиси":"TBS","tbilisi":"TBS"
    };
    function extractIata(value){
      const raw=String(value||"").trim();
      const paren=raw.match(/\(([A-Za-z]{3})\)/);
      if(paren) return paren[1].toUpperCase();
      if(/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
      const city=raw.split(",")[0].trim().toLowerCase();
      return cityIata[city] || null;
    }
    if(!AVIASALES_API_TOKEN) return send(res,503,{ok:false,error:"AVIASALES_API_TOKEN_NOT_SET"});
    if(!date || !validDate(date)) return send(res,400,{ok:false,error:"INVALID_DATE"});
    const origin=extractIata(from), destination=extractIata(to);
    if(!origin || !destination) return send(res,400,{ok:false,error:"UNKNOWN_CITY_IATA",message:"Не удалось определить IATA-код города. Используйте город из списка или аэропорт с кодом IATA."});

    const params=new URLSearchParams({
      origin,destination,departure_at:date,one_way:"true",direct:String(direct),
      currency,limit:"100",page:"1",sorting:"price",market:"ru",token:AVIASALES_API_TOKEN
    });
    try{
      const rr=await fetch("https://api.travelpayouts.com/aviasales/v3/prices_for_dates?"+params.toString(),{
        headers:{"X-Access-Token":AVIASALES_API_TOKEN,"Accept":"application/json"}
      });
      const raw=await rr.json();
      if(!rr.ok || raw?.success===false) return send(res,502,{ok:false,error:"AVIASALES_API_ERROR",details:raw?.error||`HTTP_${rr.status}`});
      const airlineNames={SU:"Aeroflot",S7:"S7 Airlines",U6:"Ural Airlines",UT:"Utair",SZ:"Somon Air",DP:"Pobeda",TK:"Turkish Airlines",EK:"Emirates",FZ:"flydubai",HY:"Uzbekistan Airways",KC:"Air Astana",A4:"Azimuth",WZ:"Red Wings"};
      const markup=await getFlightMarkup();
    const flights=(Array.isArray(raw?.data)?raw.data:[]).map(x=>{
        const base=Number(x.price);
        const departure=x.departure_at||null;
        const duration=Number(x.duration_to||x.duration||0);
        return {
          id:`avs-${x.airline||"XX"}-${x.flight_number||""}-${x.departure_at||""}`,
          source:"aviasales-data-api",
          from_iata:x.origin||origin,to_iata:x.destination||destination,
          from_airport_code:x.origin_airport||null,to_airport_code:x.destination_airport||null,
          airline_code:x.airline||null,airline:airlineNames[x.airline]||x.airline||"Авиакомпания",
          flight_number:x.flight_number||null,
          departure_at:departure,return_at:x.return_at||null,
          transfers:Number(x.transfers||0),duration_to:duration,
          // Data API обычно не передаёт город(а) пересадки отдельным полем.
          // Сохраняем возможные поля, если поставщик их вернёт.
          transfer_airports:Array.isArray(x.transfer_airports)?x.transfer_airports:(Array.isArray(x.stopovers)?x.stopovers:(Array.isArray(x.via)?x.via:[])),
          transfer_cities:Array.isArray(x.transfer_cities)?x.transfer_cities:(Array.isArray(x.via_cities)?x.via_cities:[]),
          price:base+markup,currency:(x.currency||currency).toUpperCase(),
          source_price:base,markup,
          baggage:null,hand_baggage:null,baggage_note:"Условия багажа уточняются",
          link:x.link||null
        };
      }).filter(x=>x.price>=500);
      return send(res,200,{ok:true,source:"Aviasales Data API",requested:{origin,destination,date,direct,currency},flights});
    }catch(e){
      console.error("Aviasales search error:",e.message);
      return send(res,502,{ok:false,error:"AVIASALES_REQUEST_FAILED"});
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

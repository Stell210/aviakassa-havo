const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const XLSX = require("xlsx");

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const publicDir = __dirname;
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

const sessions = new Map();
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
  sessions.set(token, { ...user, expires: Date.now() + SESSION_TTL });
  return token;
}
function getSession(req) {
  const h = String(req.headers.authorization || "");
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  const s = sessions.get(token);
  if (!s) return null;
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
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS flights (
      id BIGSERIAL PRIMARY KEY,
      from_city TEXT NOT NULL,
      from_country TEXT NOT NULL,
      to_city TEXT NOT NULL,
      to_country TEXT NOT NULL,
      flight_date DATE NOT NULL,
      flight_time VARCHAR(20) NOT NULL,
      airline TEXT NOT NULL,
      baggage TEXT NOT NULL DEFAULT '',
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency VARCHAR(10) NOT NULL DEFAULT 'TJS',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
  `);
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
    const b=await parseBody(req), password=String(b.password||""), username=safe(b.username||"admin",80)||"admin";
    let user=null;
    if(username==="admin" && ADMIN_PASSWORD && password===ADMIN_PASSWORD) user={id:null,name:"Главный администратор",username:"admin",role:"admin"};
    if(!user && pool){
      const q=await pool.query(`SELECT id,name,username,password_hash,role,active FROM managers WHERE username=$1 LIMIT 1`,[username]);
      if(q.rowCount && q.rows[0].active && verifyPassword(password,q.rows[0].password_hash)) user={id:q.rows[0].id,name:q.rows[0].name,username:q.rows[0].username,role:q.rows[0].role};
    }
    if(!user){countFailed(ip);return send(res,401,{ok:false,error:"INVALID_PASSWORD"});}
    clearFailed(ip); return send(res,200,{ok:true,token:issueSession(user),user:{name:user.name,username:user.username,role:user.role}});
  }
  if(req.method==="POST" && url.pathname==="/api/admin/logout"){
    const h=String(req.headers.authorization||""); if(h.startsWith("Bearer ")) sessions.delete(h.slice(7));
    return send(res,200,{ok:true});
  }

  if(url.pathname.startsWith("/api/admin/")){
    const user=authorized(req); if(!user) return send(res,401,{ok:false,error:"UNAUTHORIZED"});
    if(!pool) return send(res,503,{ok:false,error:"DATABASE_NOT_CONFIGURED"});

    if(req.method==="GET" && url.pathname==="/api/admin/me") return send(res,200,{ok:true,user:{id:user.id,name:user.name,username:user.username,role:user.role}});

    if(req.method==="GET" && url.pathname==="/api/admin/bookings"){
      const qtext=safe(url.searchParams.get("q"),100), status=safe(url.searchParams.get("status"),40);
      const args=[], where=[];
      if(status){args.push(status);where.push(`b.status=$${args.length}`)}
      if(qtext){args.push(`%${qtext}%`);where.push(`(b.name ILIKE $${args.length} OR b.phone ILIKE $${args.length} OR b.from_city ILIKE $${args.length} OR b.to_city ILIKE $${args.length} OR b.request_code ILIKE $${args.length})`)}
      const q=await pool.query(`SELECT b.*,m.name AS manager_name FROM bookings b LEFT JOIN managers m ON m.id=b.manager_id ${where.length?"WHERE "+where.join(" AND "):""} ORDER BY b.created_at DESC LIMIT 1000`,args);
      return send(res,200,{ok:true,bookings:q.rows});
    }
    if(req.method==="PATCH" && url.pathname==="/api/admin/bookings"){
      const b=await parseBody(req),id=Number(b.id),status=safe(b.status,40),notes=safe(b.notes,2000);
      const allowed=["new","in_progress","options_sent","booked","completed","cancelled"];
      if(!Number.isInteger(id)||!allowed.includes(status)) return send(res,400,{ok:false,error:"INVALID_DATA"});
      await pool.query(`UPDATE bookings SET status=$1,notes=$2,manager_id=$3 WHERE id=$4`,[status,notes,user.id||null,id]);
      return send(res,200,{ok:true});
    }
    if(req.method==="GET" && url.pathname==="/api/admin/stats"){
      const q=await pool.query(`SELECT COUNT(*) FILTER (WHERE created_at::date=CURRENT_DATE) AS today, COUNT(*) FILTER (WHERE created_at>=CURRENT_DATE-INTERVAL '6 days') AS week, COUNT(*) FILTER (WHERE created_at>=date_trunc('month',CURRENT_DATE)) AS month, COUNT(*) AS total FROM bookings`);
      return send(res,200,{ok:true,stats:q.rows[0]});
    }
    if(req.method==="GET" && url.pathname==="/api/admin/bookings.xlsx"){
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
      const q=await pool.query(`SELECT id,name,username,role,active,created_at FROM managers ORDER BY created_at DESC`); return send(res,200,{ok:true,managers:q.rows});
    }
    if(req.method==="POST" && url.pathname==="/api/admin/managers"){
      if(user.role!=="admin") return send(res,403,{ok:false,error:"ADMIN_ONLY"});
      const b=await parseBody(req),name=safe(b.name,120),username=safe(b.username,80).toLowerCase(),password=String(b.password||"");
      if(!name||!username||password.length<10) return send(res,400,{ok:false,error:"NAME_USERNAME_AND_10_CHAR_PASSWORD_REQUIRED"});
      try{const q=await pool.query(`INSERT INTO managers(name,username,password_hash,role) VALUES($1,$2,$3,'manager') RETURNING id,name,username,role,active,created_at`,[name,username,hashPassword(password)]);return send(res,201,{ok:true,manager:q.rows[0]});}catch(e){if(e.code==="23505")return send(res,409,{ok:false,error:"USERNAME_EXISTS"});throw e;}
    }
    if(req.method==="PATCH" && url.pathname==="/api/admin/managers"){
      if(user.role!=="admin") return send(res,403,{ok:false,error:"ADMIN_ONLY"});
      const b=await parseBody(req),id=Number(b.id); if(!Number.isInteger(id))return send(res,400,{ok:false,error:"INVALID_ID"});
      if(b.active!==undefined) await pool.query(`UPDATE managers SET active=$1 WHERE id=$2`,[!!b.active,id]);
      if(b.password!==undefined && String(b.password).length>=10) await pool.query(`UPDATE managers SET password_hash=$1 WHERE id=$2`,[hashPassword(String(b.password)),id]);
      return send(res,200,{ok:true});
    }

    const crud = async (table, fields, required, body, id=null) => {
      const values=fields.map(f=>body[f]);
      for(const f of required){if(body[f]===undefined || body[f]===null || String(body[f]).trim()==="") throw Object.assign(new Error("REQUIRED"),{status:400});}
      if(id){
        const sets=fields.map((f,i)=>`${f}=$${i+1}`).join(","); await pool.query(`UPDATE ${table} SET ${sets} WHERE id=$${fields.length+1}`,[...values,id]);
      } else {const cols=fields.join(","),ph=fields.map((_,i)=>`$${i+1}`).join(",");await pool.query(`INSERT INTO ${table}(${cols}) VALUES(${ph})`,values);}
    };
    const map={
      flights:{table:"flights",fields:["from_city","from_country","to_city","to_country","flight_date","flight_time","airline","baggage","price","currency","active"],required:["from_city","from_country","to_city","to_country","flight_date","flight_time","airline","baggage","price"]},
      offers:{table:"offers",fields:["title","description","discount","valid_until","active"],required:["title"]},
      directions:{table:"directions",fields:["city","country","code","active"],required:["city","country"]}
    };
    for(const [key,cfg] of Object.entries(map)){
      if(req.method==="GET" && url.pathname===`/api/admin/${key}`){const q=await pool.query(`SELECT * FROM ${cfg.table} ORDER BY created_at DESC`);return send(res,200,{ok:true,[key]:q.rows});}
      if(req.method==="POST" && url.pathname===`/api/admin/${key}`){const b=await parseBody(req);try{await crud(cfg.table,cfg.fields,cfg.required,b);return send(res,201,{ok:true});}catch(e){return send(res,e.status||500,{ok:false,error:e.message});}}
      if(req.method==="PATCH" && url.pathname===`/api/admin/${key}`){const b=await parseBody(req),id=Number(b.id);if(!Number.isInteger(id))return send(res,400,{ok:false,error:"INVALID_ID"});try{await crud(cfg.table,cfg.fields,cfg.required,b,id);return send(res,200,{ok:true});}catch(e){return send(res,e.status||500,{ok:false,error:e.message});}}
      if(req.method==="DELETE" && url.pathname===`/api/admin/${key}`){const id=Number(url.searchParams.get("id"));if(!Number.isInteger(id))return send(res,400,{ok:false,error:"INVALID_ID"});await pool.query(`DELETE FROM ${cfg.table} WHERE id=$1`,[id]);return send(res,200,{ok:true});}
    }
  }

  // Public lists for future site integrations.
  if(req.method==="GET" && url.pathname==="/api/directions" && pool){const q=await pool.query(`SELECT id,city,country,code FROM directions WHERE active=true ORDER BY city`);return send(res,200,{ok:true,directions:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/flights" && pool){const q=await pool.query(`SELECT * FROM flights WHERE active=true AND flight_date>=CURRENT_DATE ORDER BY flight_date,flight_time LIMIT 500`);return send(res,200,{ok:true,flights:q.rows});}
  if(req.method==="GET" && url.pathname==="/api/offers" && pool){const q=await pool.query(`SELECT * FROM offers WHERE active=true AND (valid_until IS NULL OR valid_until>=CURRENT_DATE) ORDER BY created_at DESC`);return send(res,200,{ok:true,offers:q.rows});}
  return false;
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8",".json":"application/json; charset=utf-8"};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    if(u.pathname.startsWith("/api/")){const handled=await api(req,res,u);if(handled!==false)return;}
    let p=u.pathname==="/"?path.join(publicDir,"index.html"):path.join(publicDir,u.pathname.replace(/^\/+/,""));
    if(!p.startsWith(publicDir))return send(res,403,{error:"FORBIDDEN"});
    if(fs.existsSync(p)&&fs.statSync(p).isFile()){const ext=path.extname(p).toLowerCase();res.writeHead(200,{"Content-Type":mime[ext]||"application/octet-stream"});fs.createReadStream(p).pipe(res);return;}
    send(res,404,{error:"NOT_FOUND"});
  }catch(e){console.error(e);send(res,500,{error:"SERVER_ERROR"});}
});
initDb().then(()=>server.listen(PORT,()=>console.log("Aviakassa server on "+PORT))).catch(e=>{console.error(e);process.exit(1)});

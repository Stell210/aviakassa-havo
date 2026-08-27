const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const publicDir = __dirname;

const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

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
      notes TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings(created_at DESC);
    CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
  `);
}

function send(res, code, data, type="application/json"){
  res.writeHead(code, {"Content-Type": type, "Cache-Control":"no-store"});
  res.end(type==="application/json" ? JSON.stringify(data) : data);
}
function parseBody(req){
  return new Promise((resolve,reject)=>{
    let body="";
    req.on("data",c=>{body+=c; if(body.length>100000) req.destroy();});
    req.on("end",()=>{try{resolve(JSON.parse(body||"{}"))}catch(e){reject(e)}});
    req.on("error",reject);
  });
}
function token(){
  return crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex");
}
function authorized(req){
  return ADMIN_PASSWORD && req.headers.authorization === "Bearer "+token();
}
function safe(v,max=300){ return String(v??"").trim().slice(0,max); }

async function api(req,res,url){
  if(req.method==="GET" && url.pathname==="/api/health"){
    return send(res,200,{ok:true,database:!!pool});
  }

  if(req.method==="POST" && url.pathname==="/api/bookings"){
    if(!pool) return send(res,503,{ok:false,error:"DATABASE_NOT_CONFIGURED"});
    const b=await parseBody(req);
    const fields={
      name:safe(b.name,100), phone:safe(b.phone,40), from:safe(b.from,100),
      to:safe(b.to,100), date:safe(b.date,20), returnDate:safe(b.returnDate,20),
      passengers:safe(b.passengers,30), baggage:safe(b.baggage,150)
    };
    if(!fields.name||!fields.phone||!fields.from||!fields.to||!fields.date)
      return send(res,400,{ok:false,error:"MISSING_REQUIRED_FIELDS"});
    const code="REQ-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomBytes(2).toString("hex").toUpperCase();
    const q=await pool.query(
      `INSERT INTO bookings(request_code,name,phone,from_city,to_city,departure_date,return_date,passengers,baggage)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING request_code,created_at`,
      [code,fields.name,fields.phone,fields.from,fields.to,fields.date,fields.returnDate||null,fields.passengers,fields.baggage]
    );
    return send(res,201,{ok:true,requestCode:q.rows[0].request_code,createdAt:q.rows[0].created_at});
  }

  if(req.method==="POST" && url.pathname==="/api/admin/login"){
    const b=await parseBody(req);
    if(!ADMIN_PASSWORD || !crypto.timingSafeEqual(Buffer.from(String(b.password||"")),Buffer.from(ADMIN_PASSWORD)))
      return send(res,401,{ok:false,error:"INVALID_PASSWORD"});
    return send(res,200,{ok:true,token:token()});
  }

  if(url.pathname==="/api/admin/bookings"){
    if(!authorized(req)) return send(res,401,{ok:false,error:"UNAUTHORIZED"});
    if(req.method==="GET"){
      const q=await pool.query(`SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500`);
      return send(res,200,{ok:true,bookings:q.rows});
    }
    if(req.method==="PATCH"){
      const b=await parseBody(req);
      const id=Number(b.id), status=safe(b.status,40), notes=safe(b.notes,1000);
      const allowed=["new","in_progress","options_sent","booked","completed","cancelled"];
      if(!Number.isInteger(id)||!allowed.includes(status)) return send(res,400,{ok:false,error:"INVALID_DATA"});
      await pool.query(`UPDATE bookings SET status=$1, notes=$2 WHERE id=$3`,[status,notes,id]);
      return send(res,200,{ok:true});
    }
  }
  return false;
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".svg":"image/svg+xml",".txt":"text/plain; charset=utf-8"};
const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    if(u.pathname.startsWith("/api/")){
      const handled=await api(req,res,u);
      if(handled!==false) return;
    }
    let p=u.pathname==="/"?path.join(publicDir,"index.html"):path.join(publicDir,u.pathname.replace(/^\/+/,""));
    if(!p.startsWith(publicDir)) return send(res,403,{error:"FORBIDDEN"});
    if(fs.existsSync(p)&&fs.statSync(p).isFile()){
      const ext=path.extname(p).toLowerCase();
      res.writeHead(200,{"Content-Type":mime[ext]||"application/octet-stream"});
      fs.createReadStream(p).pipe(res); return;
    }
    send(res,404,{error:"NOT_FOUND"});
  }catch(e){console.error(e); send(res,500,{error:"SERVER_ERROR"});}
});
initDb().then(()=>server.listen(PORT,()=>console.log("Aviakassa server on "+PORT))).catch(e=>{console.error(e);process.exit(1)});

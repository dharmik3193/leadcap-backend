const mysql=require("mysql2/promise");
const bcrypt=require("bcryptjs");
const env=require("./config/env");

async function main(){
  const {ADMIN_EMAIL,ADMIN_PASSWORD,ADMIN_NAME="Master Admin"}=process.env;
  if(!ADMIN_EMAIL||!ADMIN_PASSWORD)throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set.");
  const db=await mysql.createPool({host:env.db.host,user:env.db.user,password:env.db.password,database:env.db.database});
  try{
    const [existing]=await db.query("SELECT id FROM users WHERE email=? LIMIT 1",[ADMIN_EMAIL.trim().toLowerCase()]);
    if(existing.length){console.log("Admin already exists.");return;}
    const hash=await bcrypt.hash(ADMIN_PASSWORD,12);
    await db.query("INSERT INTO users (company_id,name,email,password_hash,role) VALUES (NULL,?,?,?,'admin')",[ADMIN_NAME,ADMIN_EMAIL.trim().toLowerCase(),hash]);
    console.log("Master Admin created successfully.");
  }finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

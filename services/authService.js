const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const db=require("../config/db");
const env=require("../config/env");
const HttpError=require("../utils/httpError");

exports.login=async({email,password})=>{
  if(!email||!password) throw new HttpError(400,"Email and password are required.");
  const [rows]=await db.query(
    `SELECT id,company_id,name,email,password_hash,role,status,profile_pic_url FROM users WHERE email=? LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  if(!rows.length) throw new HttpError(400,"Invalid Credentials");
  const user=rows[0];
  if(user.status==="suspended") throw new HttpError(403,"This profile account is currently suspended.");
  if(!await bcrypt.compare(password,user.password_hash)) throw new HttpError(400,"Invalid Credentials");
  const token=jwt.sign({id:user.id,email:user.email,role:user.role,company_id:user.company_id},env.jwtSecret,{expiresIn:env.jwtExpiresIn});
  return {message:"Login successful",token,user:{id:user.id,name:user.name,role:user.role,profilePic:user.profile_pic_url}};
};

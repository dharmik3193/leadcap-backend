const jwt=require("jsonwebtoken");
const db=require("../config/db");
const env=require("../config/env");

const authenticateToken=async(req,res,next)=>{
  const header=req.headers.authorization;
  const token=header&&header.startsWith("Bearer ")?header.slice(7):null;
  if(!token) return res.status(401).json({message:"Access Denied: Token Missing"});
  try{
    const decoded=jwt.verify(token,env.jwtSecret);
    const [users]=await db.query(
      "SELECT id,company_id,role,status FROM users WHERE id=? LIMIT 1",[decoded.id]
    );
    if(!users.length||users[0].status==="suspended")
      return res.status(403).json({message:"Access Restricted: This profile account is currently suspended."});
    const user=users[0];
    if(user.company_id){
      const [companies]=await db.query("SELECT status FROM companies WHERE id=? LIMIT 1",[user.company_id]);
      if(companies.length&&companies[0].status==="suspended")
        return res.status(403).json({message:"Access Restricted: Your parent company organization environment is suspended."});
    }
    req.user={...decoded,id:user.id,company_id:user.company_id,role:user.role};
    next();
  }catch(err){
    if(err.name==="TokenExpiredError"||err.name==="JsonWebTokenError")
      return res.status(403).json({message:"Session Expired or Invalid"});
    next(err);
  }
};
const requireRoles=(...roles)=>(req,res,next)=>{
  if(!roles.includes(req.user.role)) return res.status(403).json({message:`Forbidden: Restricted to ${roles.join(" or ")}`});
  next();
};
module.exports={authenticateToken,requireRoles};

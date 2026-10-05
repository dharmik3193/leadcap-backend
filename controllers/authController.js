const auth=require("../services/authService");
exports.login=async(req,res,next)=>{try{res.json(await auth.login(req.body));}catch(e){next(e);}};

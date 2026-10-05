const express=require("express");const c=require("../controllers/authController");const r=express.Router();
r.post("/login",c.login);module.exports=r;

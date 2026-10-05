const express=require("express");const c=require("../controllers/webhookController");const r=express.Router();
r.get("/meta/:companyId",c.verifyWebhook);r.post("/meta/:companyId",c.receiveMetaLead);module.exports=r;

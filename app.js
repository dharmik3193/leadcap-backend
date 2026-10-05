const express=require("express");
const cors=require("cors");
const path=require("path");
const env=require("./config/env");
const authRoutes=require("./routes/authRoutes");
const companyRoutes=require("./routes/companyRoutes");
const webhookRoutes=require("./routes/webhookRoutes");
const errorMiddleware=require("./middlewares/errorMiddleware");

const app=express();
app.disable("x-powered-by");
// app.use(cors({origin:env.corsOrigin==="*" ? true : env.corsOrigin.split(",").map(x=>x.trim())}));
app.use(cors());
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:false}));
app.use("/uploads",express.static(path.join(__dirname,"uploads")));

app.get("/health",(req,res)=>res.json({status:"ok",service:"leadcap-api",environment:env.nodeEnv,timestamp:new Date().toISOString()}));
app.use("/api/auth",authRoutes);
app.use("/api/company",companyRoutes);
app.use("/api/webhook",webhookRoutes);
app.use((req,res)=>res.status(404).json({message:"Route not found."}));
app.use(errorMiddleware);

app.listen(env.port,()=>console.log(`LeadCap API running on port ${env.port}`));

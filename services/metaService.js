const crypto=require("crypto");
const env=require("../config/env");
const db=require("../config/db");
const {LEAD_STATUS_TO_META_EVENT}=require("../constants/metaEvents");

const sha256=v=>crypto.createHash("sha256").update(v).digest("hex");
const email=v=>String(v||"").trim().toLowerCase();
const phone=v=>String(v||"").replace(/[^\d+]/g,"");
const compact=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined&&v!==null&&v!==""&&!(Array.isArray(v)&&!v.length)));

const graphRequest=async(path,options={})=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),env.meta.apiTimeoutMs);
  try{
    const response=await fetch(`https://graph.facebook.com/${env.meta.graphApiVersion}/${path}`,{
      ...options,signal:controller.signal,headers:{"Content-Type":"application/json",...(options.headers||{})}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.error){const e=new Error(data?.error?.message||`Meta API failed (${response.status})`);e.meta=data?.error||data;e.status=response.status;throw e;}
    return data;
  }finally{clearTimeout(timer);}
};

exports.getConfig=async(companyId)=>{
  const [rows]=await db.query(`SELECT company_id,page_access_token,pixel_id,verify_token FROM meta_configs WHERE company_id=? LIMIT 1`,[companyId]);
  return rows[0]||null;
};
exports.getFormName=async(formId,token)=>{
  try{const data=await graphRequest(`${formId}?fields=name&access_token=${encodeURIComponent(token)}`);return data.name||"Unknown Form";}
  catch(e){console.error("Meta form lookup failed:",e.message);return "Unknown Form";}
};
exports.getLeadDetails=async(leadId,token)=>
  graphRequest(`${leadId}?fields=field_data,created_time,form_id&access_token=${encodeURIComponent(token)}`);

exports.sendLeadStageEvent=async({lead,companyId,newStatus,stageChangedAt})=>{
  const eventName=LEAD_STATUS_TO_META_EVENT[newStatus];
  if(!eventName) return {sent:false,skipped:true,reason:"No Meta event configured for this status."};
  if(!lead.meta_lead_id) return {sent:false,skipped:true,reason:"Lead has no Meta lead ID."};
  const config=await exports.getConfig(companyId);
  if(!config?.pixel_id||!config?.page_access_token)
    return {sent:false,skipped:true,reason:"Meta CAPI configuration is incomplete."};

  const eventId=`crm:${lead.id}:${eventName}:v1`;
  const user_data=compact({
    lead_id:String(lead.meta_lead_id),
    em:email(lead.lead_email)?[sha256(email(lead.lead_email))]:undefined,
    ph:phone(lead.lead_phone)?[sha256(phone(lead.lead_phone))]:undefined
  });
  const payload={data:[{
    event_name:eventName,
    event_time:Math.floor(new Date(stageChangedAt||Date.now()).getTime()/1000),
    action_source:"system_generated",
    event_source:"crm",
    event_id:eventId,
    user_data,
    custom_data:compact({crm_lead_id:String(lead.id),crm_status:newStatus})
  }]};
  const response=await graphRequest(`${config.pixel_id}/events?access_token=${encodeURIComponent(config.page_access_token)}`,{method:"POST",body:JSON.stringify(payload)});
  return {sent:true,skipped:false,eventId,eventName,response};
};

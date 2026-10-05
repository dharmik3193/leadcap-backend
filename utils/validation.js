const HttpError=require("./httpError");
exports.parsePositiveInt=(value,fallback,max=100)=>{
  const n=Number.parseInt(value,10);
  return !Number.isFinite(n)||n<1?fallback:Math.min(n,max);
};
exports.requireFields=(body,fields)=>{
  const missing=fields.filter(k=>body[k]===undefined||body[k]===null||String(body[k]).trim()==="");
  if(missing.length) throw new HttpError(400,`Missing required field${missing.length>1?"s":""}: ${missing.join(", ")}`);
};

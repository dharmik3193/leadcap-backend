const LEAD_STATUSES=Object.freeze(["unallocated","allocated","contacted","qualified","converted","lost"]);
module.exports={LEAD_STATUSES,LEAD_STATUS_SET:new Set(LEAD_STATUSES)};

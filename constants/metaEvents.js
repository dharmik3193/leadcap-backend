// Keep event names stable after production campaigns start learning from them.
const LEAD_STATUS_TO_META_EVENT=Object.freeze({
  unallocated:null,
  allocated:"AllocatedLead",
  contacted:"ContactedLead",
  qualified:"QualifiedLead",
  converted:"ConvertedLead",
  lost:"LostLead"
});
module.exports={LEAD_STATUS_TO_META_EVENT};

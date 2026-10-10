const companies=require("../services/companyService");
const leads=require("../services/leadService");
const meta = require("../services/metaService");
exports.getCompaniesList=async(req,res,next)=>{try{res.json(await companies.getCompaniesList());}catch(e){next(e);}};
exports.getMetricsSummary=async(req,res,next)=>{try{res.json(await companies.getMetricsSummary());}catch(e){next(e);}};
exports.createCompany=async(req,res,next)=>{try{res.json(await companies.createCompany(req.body));}catch(e){next(e);}};
exports.createEmployee=async(req,res,next)=>{try{res.json(await companies.createEmployee({...req.body,companyId:req.user.company_id}));}catch(e){next(e);}};
exports.updateEmployee = async (req, res, next) => {
  try {
    const result = await companies.updateEmployee({
      employeeId: req.params.employeeId,
      companyId: req.user.company_id,
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      status: req.body.status,
    });

    res.json(result);
  } catch (e) {
    next(e);
  }
};
exports.getMetaConfig=async(req,res,next)=>{try{const id=req.user.role==="admin"?req.query.companyId:req.user.company_id;if(!id)return res.status(400).json({message:"Company ID missing"});res.json(await companies.getMetaConfig(id));}catch(e){next(e);}};
exports.updateMetaConfig=async(req,res,next)=>{try{const id=req.user.role==="admin"?req.body.companyId:req.user.company_id;if(!id)return res.status(400).json({message:"Company ID missing"});res.json(await companies.updateMetaConfig({companyId:id,pageAccessToken:req.body.pageAccessToken,pixelId:req.body.pixelId,verifyToken:req.body.verifyToken}));}catch(e){next(e);}};
exports.getManagerDashboardData=async(req,res,next)=>{try{res.json(await companies.getManagerEmployees(req.user.company_id));}catch(e){next(e);}};
exports.toggleCompanyStatus=async(req,res,next)=>{try{res.json(await companies.toggleCompanyStatus(req.body));}catch(e){next(e);}};
exports.toggleEmployeeStatus=async(req,res,next)=>{try{res.json(await companies.toggleEmployeeStatus({...req.body,companyId:req.user.company_id}));}catch(e){next(e);}};
exports.deleteEmployee=async(req,res,next)=>{try{res.json(await companies.deleteEmployee({employeeId:req.params.employeeId,companyId:req.user.company_id}));}catch(e){next(e);}};
exports.getCompanyPipelines=async(req,res,next)=>{try{res.json(await companies.getCompanyPipelines(req.user.company_id));}catch(e){next(e);}};
exports.allocateLeadAgent=async(req,res,next)=>{try{res.json(await leads.allocateLead({leadId:req.body.leadId,agentId:req.body.agentId,companyId:req.user.company_id}));}catch(e){next(e);}};
exports.getEmployeeLeads=async(req,res,next)=>{try{res.json((await leads.getLeads(req.user,req.query)).data);}catch(e){next(e);}};
exports.updateLeadStatus=async(req,res,next)=>{try{res.json(await leads.updateLeadStatus({leadId:req.body.leadId,userId:req.user.id,companyId:req.user.company_id,role:req.user.role,status:req.body.status,nextFollowupDate:req.body.next_followup_date,notes:req.body.last_interaction_notes}));}catch(e){next(e);}};
exports.getFollowupSequence=async(req,res,next)=>{try{res.json(await leads.getFollowupSequence(req.params.leadId,req.user));}catch(e){next(e);}};
exports.getLeadsDashboard=async(req,res,next)=>{try{const r=await leads.getLeads(req.user,req.query);res.json(Object.keys(req.query||{}).length?r:r.data);}catch(e){next(e);}};

exports.getLeadAssignmentRules = async (req, res, next) => {
  try {
    const data = await companies.getLeadAssignmentRules(
      req.user.company_id
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
};

exports.saveLeadAssignmentRule = async (req, res, next) => {
  try {
    const data = await companies.saveLeadAssignmentRule({
      companyId: req.user.company_id,
      formId: req.body.formId,
      formName: req.body.formName,
      employeeIds: req.body.employeeIds,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
};

exports.deleteLeadAssignmentRule = async (req, res, next) => {
  try {
    const data = await companies.deleteLeadAssignmentRule({
      companyId: req.user.company_id,
      formId: req.params.formId,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
};

exports.getMetaLeadForms = async (req, res, next) => {
  try {
    const data = await companies.getMetaLeadForms(
      req.user.company_id
    );

    res.json(data);
  } catch (error) {
    next(error);
  }
};

exports.getManagerMetaLeadForms = async (req, res, next) => {
  try {
    const companyId = req.user.company_id;

    if (!companyId) {
      return res.status(400).json({
        message: "Company ID missing.",
      });
    }

    const result = await meta.getLeadForms(companyId);
    return res.json(result);
  } catch (error) {
    console.error(
      "Manager Meta Forms error:",
      error.meta?.message || error.message
    );
    next(error);
  }
};

exports.getEmployeeDashboard = async (req, res, next) => {
  try {
    const data = await leads.getEmployeeDashboard({
      userId: req.user.id,
      companyId: req.user.company_id,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
};

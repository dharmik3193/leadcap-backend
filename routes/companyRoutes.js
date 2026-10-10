const express = require("express"); const c = require("../controllers/companyController"); const { authenticateToken, requireRoles } = require("../middlewares/authMiddleware"); const r = express.Router();
r.post("/create-company", authenticateToken, requireRoles("admin"), c.createCompany);
r.post("/create-employee", authenticateToken, requireRoles("manager"), c.createEmployee);
r.put(
  "/manager/employees/:employeeId",
  authenticateToken,
  requireRoles("manager"),
  c.updateEmployee
);
r.get("/companies-list", authenticateToken, requireRoles("admin"), c.getCompaniesList);
r.get("/metrics-summary", authenticateToken, requireRoles("admin"), c.getMetricsSummary);
r.get("/meta-config", authenticateToken, requireRoles("admin"), c.getMetaConfig);
r.post("/meta-config", authenticateToken, requireRoles("admin"), c.updateMetaConfig);
r.get("/manager/employees-list", authenticateToken, requireRoles("manager"), c.getManagerDashboardData);
r.post("/admin/toggle-company", authenticateToken, requireRoles("admin"), c.toggleCompanyStatus);
r.post("/manager/toggle-employee", authenticateToken, requireRoles("manager"), c.toggleEmployeeStatus);
r.delete("/manager/employees/:employeeId", authenticateToken, requireRoles("manager"), c.deleteEmployee);
r.get("/manager/pipelines", authenticateToken, requireRoles("manager"), c.getCompanyPipelines);
r.post("/manager/allocate-lead", authenticateToken, requireRoles("manager"), c.allocateLeadAgent);
r.get("/employee/my-leads", authenticateToken, requireRoles("employee"), c.getEmployeeLeads);
r.post("/employee/update-lead-status", authenticateToken, requireRoles("employee", "manager"), c.updateLeadStatus);
r.get("/leads-dashboard", authenticateToken, c.getLeadsDashboard);
r.get("/lead-sequence/:leadId", authenticateToken, c.getFollowupSequence);
r.get(
  "/manager/lead-assignment-rules",
  authenticateToken,
  requireRoles("manager"),
  c.getLeadAssignmentRules
);

r.put(
  "/manager/lead-assignment-rules",
  authenticateToken,
  requireRoles("manager"),
  c.saveLeadAssignmentRule
);

r.delete(
  "/manager/lead-assignment-rules/:formId",
  authenticateToken,
  requireRoles("manager"),
  c.deleteLeadAssignmentRule
);

r.get(
  "/employee/dashboard",
  authenticateToken,
  requireRoles("employee"),
  c.getEmployeeDashboard
);

r.get(
  "/manager/meta-lead-forms",
  authenticateToken,
  requireRoles("manager"),
  c.getManagerMetaLeadForms
);

module.exports = r;

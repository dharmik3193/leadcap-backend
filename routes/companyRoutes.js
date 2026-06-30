const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { authenticateToken, requireRoles } = require('../middlewares/authMiddleware');

// Route permissions definition
router.post('/create-company', authenticateToken, requireRoles('admin'), companyController.createCompany);
router.post('/create-employee', authenticateToken, requireRoles('manager'), companyController.createEmployee);
router.get('/companies-list', authenticateToken, requireRoles('admin'), companyController.getCompaniesList);

// 3. Get total metrics counters for dashboard widgets (Admin Only)
router.get('/metrics-summary', authenticateToken, requireRoles('admin'), companyController.getMetricsSummary);
router.get('/meta-config', authenticateToken, requireRoles('admin'), companyController.getMetaConfig);
router.post('/meta-config', authenticateToken, requireRoles('admin'), companyController.updateMetaConfig);
router.get('/manager/employees-list', authenticateToken, requireRoles('manager'), companyController.getManagerDashboardData);
router.post('/admin/toggle-company', authenticateToken, requireRoles('admin'), companyController.toggleCompanyStatus);
router.post('/manager/toggle-employee', authenticateToken, requireRoles('manager'), companyController.toggleEmployeeStatus);
router.get('/manager/pipelines', authenticateToken, requireRoles('manager'), companyController.getCompanyPipelines);
router.post('/manager/allocate-lead', authenticateToken, requireRoles('manager'), companyController.allocateLeadAgent);

module.exports = router;
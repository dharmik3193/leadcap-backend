const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Client-wise dynamic webhook routing mapping
router.get('/meta/:companyId', webhookController.verifyWebhook);
router.post('/meta/:companyId', webhookController.receiveMetaLead);

module.exports = router;
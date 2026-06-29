// routes/leads.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
require('dotenv').config();

// ============================================
// WEBHOOK ENDPOINTS (for Meta to send leads)
// ============================================

// Meta webhook verification endpoint
// This is called by Meta when you set up the webhook
router.get('/leads', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      console.log('✓ Webhook verified');
      res.status(200).send(challenge);
    } else {
      console.log('✗ Webhook verification failed - invalid token');
      res.sendStatus(403);
    }
  } else {
    console.log('✗ Webhook verification failed - missing parameters');
    res.sendStatus(400);
  }
});

// Meta webhook POST endpoint
// This is where Meta sends new leads
router.post('/leads', async (req, res) => {
  try {
    console.log('\n📨 Webhook received from Meta');
    
    // Always respond quickly to Meta (within 20 seconds)
    res.status(200).json({ success: true });

    // Process leads asynchronously
    if (req.body.entry) {
      for (const entry of req.body.entry) {
        if (entry.changes) {
          for (const change of entry.changes) {
            await processMetaLead(change.value);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// ============================================
// API ENDPOINTS (for your frontend/dashboard)
// ============================================

// Get all leads
router.get('/api/leads', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const leads = await db.getAllLeads(limit, offset);
    const total = await db.getLeadCount();

    res.json({
      success: true,
      data: leads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single lead by ID
router.get('/api/leads/:id', async (req, res) => {
  try {
    const lead = await db.getLeadById(req.params.id);
    
    if (!lead) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    // Parse JSON data if it exists
    if (lead.full_data) {
      lead.full_data = JSON.parse(lead.full_data);
    }

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search leads
router.get('/api/leads/search/:query', async (req, res) => {
  try {
    const results = await db.searchLeads(req.params.query);
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error searching leads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HELPER FUNCTION
// ============================================

// Process incoming Meta lead data
async function processMetaLead(leadData) {
  try {
    console.log('Processing lead:', leadData.leadgen_id);

    // Check if lead already exists
    const existingLead = await db.getLeadByMetaId(leadData.leadgen_id);
    if (existingLead) {
      console.log('Lead already exists:', leadData.leadgen_id);
      return;
    }

    // Extract field data from Meta format
    const fieldMap = {};
    if (leadData.field_data && Array.isArray(leadData.field_data)) {
      for (const field of leadData.field_data) {
        fieldMap[field.name] = field.value;
      }
    }

    // Map Meta field names to database columns
    // Adjust these based on your Meta form fields
    const leadObject = {
      meta_lead_id: leadData.leadgen_id,
      form_id: leadData.form_id || 'unknown',
      first_name: fieldMap.first_name || null,
      last_name: fieldMap.last_name || null,
      email: fieldMap.email || fieldMap.email_address || null,
      phone: fieldMap.phone_number || fieldMap.phone || null,
      address: fieldMap.address_street || fieldMap.street_address || null,
      city: fieldMap.city || null,
      state: fieldMap.state || fieldMap.province || null,
      zip_code: fieldMap.zip_code || fieldMap.postal_code || null,
      country: fieldMap.country || null,
      company: fieldMap.company || fieldMap.company_name || null,
      full_data: leadData, // Store entire object as backup
    };

    // Save to database
    await db.saveLead(leadObject);
    console.log('✓ Lead saved successfully:', leadData.leadgen_id);

    // Optional: Send confirmation email or webhook
    // await sendConfirmationEmail(leadObject.email);
    // await notifySlack(leadObject);

  } catch (error) {
    console.error('Error processing lead:', error);
  }
}

// Optional: Manual lead creation endpoint (for testing)
router.post('/api/leads/manual', async (req, res) => {
  try {
    // Validate input
    if (!req.body.email && !req.body.phone) {
      return res.status(400).json({
        success: false,
        error: 'Email or phone is required',
      });
    }

    const leadId = `manual_${Date.now()}`;
    const leadObject = {
      meta_lead_id: leadId,
      form_id: 'manual_entry',
      first_name: req.body.first_name || null,
      last_name: req.body.last_name || null,
      email: req.body.email || null,
      phone: req.body.phone || null,
      address: req.body.address || null,
      city: req.body.city || null,
      state: req.body.state || null,
      zip_code: req.body.zip_code || null,
      country: req.body.country || null,
      company: req.body.company || null,
      full_data: req.body,
    };

    await db.saveLead(leadObject);
    res.json({ success: true, message: 'Lead created', data: leadObject });
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
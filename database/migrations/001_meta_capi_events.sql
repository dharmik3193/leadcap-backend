CREATE TABLE IF NOT EXISTS meta_capi_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  meta_lead_id VARCHAR(191) NOT NULL,
  status VARCHAR(50) NOT NULL,
  event_name VARCHAR(100) NULL,
  event_id VARCHAR(255) NOT NULL,
  stage_changed_at DATETIME NOT NULL,
  delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  response_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uq_meta_capi_event(lead_id,event_name,event_id),
  KEY idx_meta_capi_company_status(company_id,delivery_status),
  KEY idx_meta_capi_retry(delivery_status,retry_count),
  KEY idx_meta_capi_meta_lead(meta_lead_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Required for webhook idempotency if absent:
-- ALTER TABLE meta_leads ADD UNIQUE KEY uq_meta_lead_id(meta_lead_id);

-- Recommended indexes for server-side lead queries:
-- CREATE INDEX idx_meta_leads_company_created ON meta_leads(company_id,created_at);
-- CREATE INDEX idx_meta_leads_company_status ON meta_leads(company_id,status);
-- CREATE INDEX idx_meta_leads_company_assigned ON meta_leads(company_id,assigned_to);
-- CREATE INDEX idx_meta_leads_followup ON meta_leads(company_id,next_followup_date);

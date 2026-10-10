const db = require("../config/db");
const { LEAD_STATUS_SET } = require("../constants/leadStatuses");
const metaService = require("./metaService");
const HttpError = require("../utils/httpError");
const { parsePositiveInt } = require("../utils/validation");

const scopeFor = user => user.role === "admin" ? { sql: "", params: [] } : user.role === "manager"
  ? { sql: "l.company_id=?", params: [user.company_id] }
  : { sql: "l.company_id=? AND l.assigned_to=?", params: [user.company_id, user.id] };

exports.getLeads = async (user, query = {}) => {
  const page = parsePositiveInt(query.page, 1, 1000000), limit = parsePositiveInt(query.limit, 20, 100), offset = (page - 1) * limit;
  const scope = scopeFor(user), conditions = scope.sql ? [scope.sql] : [], params = [...scope.params];
  if (query.search) { const s = `%${query.search.trim()}%`; conditions.push("(l.lead_name LIKE ? OR l.lead_email LIKE ? OR l.lead_phone LIKE ? OR l.form_name LIKE ?)"); params.push(s, s, s, s); }
  if (query.formName) { conditions.push("l.form_name=?"); params.push(query.formName); }
  if (query.status) { if (!LEAD_STATUS_SET.has(query.status)) throw new HttpError(400, "Invalid lead status."); conditions.push("l.status=?"); params.push(query.status); }
  if (query.todayFollowup === "true") conditions.push("DATE(l.next_followup_date)=CURDATE()");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [[count]] = await db.query(`SELECT COUNT(*) total FROM meta_leads l ${where}`, params);
  const [rows] = await db.query(
    `SELECT l.*,u.name assigned_agent_name FROM meta_leads l LEFT JOIN users u ON l.assigned_to=u.id ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = Number(count.total || 0);
  return { data: rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

exports.allocateLead = async ({ leadId, agentId, companyId }) => {
  const [agents] = await db.query(`SELECT id FROM users WHERE id=? AND company_id=? AND role='employee' AND status!='suspended' LIMIT 1`, [agentId, companyId]);
  if (!agents.length) throw new HttpError(400, "Employee does not belong to this company.");
  const [result] = await db.query(`UPDATE meta_leads SET assigned_to=?,status='allocated' WHERE id=? AND company_id=?`, [agentId, leadId, companyId]);
  if (!result.affectedRows) throw new HttpError(404, "Lead not found.");
  return { message: "Lead successfully routed to designated sales agent." };
};

// Auto-assign new leads round-robin by Meta Form ID.
exports.autoAssignLead = async ({ leadId, companyId, formId }) => {
  if (!leadId || !companyId || !formId) {
    return { assigned: false, reason: "Missing required details." };
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rules] = await connection.query(
      `SELECT r.employee_id
       FROM lead_form_assignment_rules r
       JOIN users u
         ON u.id = r.employee_id
        AND u.company_id = r.company_id
       WHERE r.company_id = ?
         AND r.form_id = ?
         AND u.role = 'employee'
         AND u.status = 'active'
       ORDER BY r.sort_order ASC, r.id ASC`,
      [companyId, String(formId)]
    );

    const employeeIds = [
      ...new Set(rules.map((row) => Number(row.employee_id))),
    ];

    if (!employeeIds.length) {
      await connection.commit();
      return { assigned: false, reason: "No active rule for this form." };
    }

    await connection.query(
      `INSERT IGNORE INTO lead_form_assignment_state
       (company_id, form_id, last_assigned_employee_id)
       VALUES (?, ?, NULL)`,
      [companyId, String(formId)]
    );

    const [stateRows] = await connection.query(
      `SELECT last_assigned_employee_id
       FROM lead_form_assignment_state
       WHERE company_id = ? AND form_id = ?
       FOR UPDATE`,
      [companyId, String(formId)]
    );

    const lastId =
      stateRows[0]?.last_assigned_employee_id == null
        ? null
        : Number(stateRows[0].last_assigned_employee_id);

    const lastIndex = employeeIds.indexOf(lastId);
    const nextIndex = (lastIndex + 1) % employeeIds.length;
    const nextEmployeeId = employeeIds[nextIndex];

    const [leadRows] = await connection.query(
      `SELECT assigned_to
       FROM meta_leads
       WHERE id = ? AND company_id = ?
       LIMIT 1
       FOR UPDATE`,
      [leadId, companyId]
    );

    if (!leadRows.length || leadRows[0].assigned_to != null) {
      await connection.commit();
      return { assigned: false, reason: "Lead missing or already assigned." };
    }

    const [updated] = await connection.query(
      `UPDATE meta_leads
       SET assigned_to = ?, status = 'allocated'
       WHERE id = ? AND company_id = ? AND assigned_to IS NULL`,
      [nextEmployeeId, leadId, companyId]
    );

    if (!updated.affectedRows) {
      await connection.commit();
      return { assigned: false, reason: "Lead was already assigned." };
    }

    await connection.query(
      `UPDATE lead_form_assignment_state
       SET last_assigned_employee_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = ? AND form_id = ?`,
      [nextEmployeeId, companyId, String(formId)]
    );

    await connection.commit();

    return { assigned: true, employeeId: nextEmployeeId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.updateLeadStatus = async ({ leadId, userId, companyId, role, status, nextFollowupDate, notes }) => {
  if (!LEAD_STATUS_SET.has(status)) throw new HttpError(400, "Invalid lead status.");
  const [rows] = await db.query(`SELECT id,meta_lead_id,lead_email,lead_phone,lead_name,assigned_to,status,next_followup_date,last_interaction_notes FROM meta_leads WHERE id=? AND company_id=? LIMIT 1`, [leadId, companyId]);
  if (!rows.length) throw new HttpError(404, "Lead target scope not found.");
  const lead = rows[0];
  if (role === "employee" && Number(lead.assigned_to) !== Number(userId)) throw new HttpError(403, "You can only update leads assigned to you.");
  const statusChanged = status !== lead.status;
  const connection = await db.getConnection();
  const stageChangedAt = new Date();
  try {
    await connection.beginTransaction();
    const fields = [], values = [];
    if (statusChanged) { fields.push("status=?"); values.push(status); }
    if (nextFollowupDate !== undefined) { fields.push("next_followup_date=?"); values.push(nextFollowupDate || null); }
    if (notes !== undefined) { fields.push("last_interaction_notes=?"); values.push(notes || null); }
    if (!fields.length) { await connection.commit(); return { message: "No changes were required.", metaSync: { sent: false, skipped: true } }; }
    values.push(leadId, companyId); if (role === "employee") values.push(userId);
    await connection.query(`UPDATE meta_leads SET ${fields.join(",")} WHERE id=? AND company_id=? ${role === "employee" ? "AND assigned_to=?" : ""}`, values);
    if (notes && notes !== lead.last_interaction_notes) {
      await connection.query(`INSERT INTO lead_followup_logs (lead_id,agent_id,notes,followup_date,created_at) VALUES (?,?,?,?,NOW())`, [leadId, userId, notes, nextFollowupDate || lead.next_followup_date || null]);
    }
    await connection.commit();
  } catch (e) { await connection.rollback(); throw e; } finally { connection.release(); }
  let metaSync = { sent: false, skipped: true, reason: "Lead status did not change." };
  if (statusChanged) {
    try {
      metaSync = await metaService.sendLeadStageEvent({ lead, companyId, newStatus: status, stageChangedAt });
      if (metaSync.sent) await db.query(
        `INSERT INTO meta_capi_events (lead_id,company_id,meta_lead_id,status,event_name,event_id,stage_changed_at,delivery_status,response_json,retry_count,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'sent',?,0,NOW(),NOW())
         ON DUPLICATE KEY UPDATE delivery_status='sent',response_json=VALUES(response_json),updated_at=NOW()`,
        [leadId, companyId, lead.meta_lead_id, status, metaSync.eventName, metaSync.eventId, stageChangedAt, JSON.stringify(metaSync.response || {})]
      );
    } catch (e) {
      console.error("Meta CAPI sync failed:", e.message);
      try {
        await db.query(
          `INSERT INTO meta_capi_events (lead_id,company_id,meta_lead_id,status,event_name,event_id,stage_changed_at,delivery_status,response_json,retry_count,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'failed',?,1,NOW(),NOW())
         ON DUPLICATE KEY UPDATE delivery_status='failed',retry_count=retry_count+1,response_json=VALUES(response_json),updated_at=NOW()`,
          [leadId, companyId, lead.meta_lead_id, status, metaSync.eventName || null, metaSync.eventId || `crm:${leadId}:${status}:v1`, stageChangedAt, JSON.stringify(e.meta || { message: e.message })]
        );
      } catch (ledgerError) { console.error("CAPI ledger failed:", ledgerError.message); }
      metaSync = { sent: false, skipped: false, failed: true, reason: "CRM status updated, but Meta CAPI sync failed." };
    }
  }
  return { message: "CRM Pipeline metrics and logs synchronized successfully.", metaSync };
};

exports.getFollowupSequence = async (leadId, user) => {
  const scope = scopeFor(user), conditions = ["l.id=?"], params = [leadId];
  if (scope.sql) { conditions.push(scope.sql); params.push(...scope.params); }
  const [leads] = await db.query(`SELECT l.id FROM meta_leads l WHERE ${conditions.join(" AND ")} LIMIT 1`, params);
  if (!leads.length) throw new HttpError(404, "Lead not found.");
  const [logs] = await db.query(`SELECT f.*,u.name agent_name FROM lead_followup_logs f JOIN users u ON f.agent_id=u.id WHERE f.lead_id=? ORDER BY f.created_at DESC`, [leadId]);
  return logs;
};

exports.getEmployeeDashboard = async ({ userId, companyId }) => {
  const [rows] = await db.query(
    `SELECT
      COUNT(*) AS total,
      SUM(status = 'allocated') AS allocated,
      SUM(status = 'contacted') AS contacted,
      SUM(status = 'qualified') AS qualified,
      SUM(status = 'converted') AS converted,
      SUM(status = 'lost') AS lost,
      SUM(
        next_followup_date IS NOT NULL
        AND DATE(next_followup_date) = CURDATE()
      ) AS followupsToday,
      SUM(
        next_followup_date IS NOT NULL
        AND DATE(next_followup_date) < CURDATE()
        AND status NOT IN ('converted', 'lost')
      ) AS overdueFollowups
    FROM meta_leads
    WHERE company_id = ? AND assigned_to = ?`,
    [companyId, userId]
  );

  const stats = rows[0];
  const total = Number(stats.total || 0);
  const converted = Number(stats.converted || 0);

  const [recentLeads] = await db.query(
    `SELECT *
     FROM meta_leads
     WHERE company_id = ? AND assigned_to = ?
     ORDER BY created_at DESC
     LIMIT 6`,
    [companyId, userId]
  );

  const [followups] = await db.query(
    `SELECT *
     FROM meta_leads
     WHERE company_id = ?
       AND assigned_to = ?
       AND next_followup_date IS NOT NULL
       AND DATE(next_followup_date) <= CURDATE()
       AND status NOT IN ('converted', 'lost')
     ORDER BY next_followup_date ASC
     LIMIT 8`,
    [companyId, userId]
  );

  return {
    stats: {
      total,
      allocated: Number(stats.allocated || 0),
      contacted: Number(stats.contacted || 0),
      qualified: Number(stats.qualified || 0),
      converted,
      lost: Number(stats.lost || 0),
      followupsToday: Number(stats.followupsToday || 0),
      overdueFollowups: Number(stats.overdueFollowups || 0),
      conversionRate: total
        ? Math.round((converted / total) * 100)
        : 0,
    },
    recentLeads,
    followups,
  };
};

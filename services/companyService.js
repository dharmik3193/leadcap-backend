const bcrypt = require("bcryptjs");
const db = require("../config/db");
const HttpError = require("../utils/httpError");

exports.getCompaniesList = async () => {
  const [rows] = await db.query(`SELECT c.id,c.company_name,c.created_at,u.name manager_name,u.email manager_email,mc.pixel_id,mc.page_access_token,mc.verify_token,c.status company_status,c.company_logo_url company_logo,c.created_at onboarded_at
    FROM companies c LEFT JOIN users u ON c.id=u.company_id AND u.role='manager' LEFT JOIN meta_configs mc ON c.id=mc.company_id ORDER BY c.created_at DESC`);
  return rows;
};
exports.getMetricsSummary = async () => {
  const [[cc], [lc], [recent]] = await Promise.all([
    db.query("SELECT COUNT(*) total FROM companies"),
    db.query("SELECT COUNT(*) total FROM meta_leads"),
    db.query(`SELECT c.id,c.company_name,c.created_at,CASE WHEN mc.pixel_id IS NOT NULL AND mc.page_access_token IS NOT NULL THEN 'Active' ELSE 'Pending Config' END status FROM companies c LEFT JOIN meta_configs mc ON c.id=mc.company_id ORDER BY c.created_at DESC LIMIT 5`)
  ]);
  return { companiesCount: cc[0].total, totalLeads: lc[0].total, recentCompanies: recent };
};
exports.createCompany = async ({ companyName, managerName, managerEmail, managerPassword }) => {
  if (!companyName || !managerName || !managerEmail || !managerPassword) throw new HttpError(400, "Company and manager details are required.");
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [r] = await c.query("INSERT INTO companies (company_name) VALUES (?)", [companyName.trim()]);
    await c.query("INSERT INTO meta_configs (company_id) VALUES (?)", [r.insertId]);
    const hash = await bcrypt.hash(managerPassword, 10);
    await c.query("INSERT INTO users (company_id,name,email,password_hash,role) VALUES (?,?,?,?, 'manager')", [r.insertId, managerName.trim(), managerEmail.trim().toLowerCase(), hash]);
    await c.commit();
    return { message: `Company '${companyName}' successfully onboarded.`, companyId: r.insertId };
  } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
};
exports.createEmployee = async ({ companyId, name, email, password }) => {
  if (!name || !email || !password) throw new HttpError(400, "Name, email and password are required.");
  await db.query("INSERT INTO users (company_id,name,email,password_hash,role) VALUES (?,?,?,?, 'employee')", [companyId, name.trim(), email.trim().toLowerCase(), await bcrypt.hash(password, 10)]);
  return { message: `Employee '${name}' successfully added.` };
};
exports.updateEmployee = async ({
  employeeId,
  companyId,
  name,
  email,
  password,
  status,
}) => {
  if (!employeeId) {
    throw new HttpError(400, "Employee ID is required.");
  }

  if (!name || !email) {
    throw new HttpError(400, "Name and email are required.");
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [employees] = await connection.query(
      `SELECT id, name, email, status
       FROM users
       WHERE id=? AND company_id=? AND role='employee'
       LIMIT 1`,
      [employeeId, companyId]
    );

    if (!employees.length) {
      throw new HttpError(404, "Employee not found.");
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail) {
      throw new HttpError(400, "Name and email are required.");
    }

    // Check whether another employee in the same company
    // is already using this email.
    const [existingEmail] = await connection.query(
      `SELECT id
       FROM users
       WHERE email=?
         AND company_id=?
         AND id<>?
       LIMIT 1`,
      [normalizedEmail, companyId, employeeId]
    );

    if (existingEmail.length) {
      throw new HttpError(
        409,
        "Another employee is already using this email."
      );
    }

    const allowedStatuses = ["active", "suspended"];

    if (status && !allowedStatuses.includes(status)) {
      throw new HttpError(400, "Invalid employee status.");
    }

    let query;
    let params;

    // Password is optional during edit.
    // If password is empty/not provided, existing password remains unchanged.
    if (password && password.trim()) {
      const passwordHash = await bcrypt.hash(password.trim(), 10);

      query = `
        UPDATE users
        SET name=?,
            email=?,
            password_hash=?,
            status=COALESCE(?, status)
        WHERE id=?
          AND company_id=?
          AND role='employee'
      `;

      params = [
        normalizedName,
        normalizedEmail,
        passwordHash,
        status || null,
        employeeId,
        companyId,
      ];
    } else {
      query = `
        UPDATE users
        SET name=?,
            email=?,
            status=COALESCE(?, status)
        WHERE id=?
          AND company_id=?
          AND role='employee'
      `;

      params = [
        normalizedName,
        normalizedEmail,
        status || null,
        employeeId,
        companyId,
      ];
    }

    const [result] = await connection.query(query, params);

    if (!result.affectedRows) {
      throw new HttpError(404, "Employee not found.");
    }

    await connection.commit();

    return {
      message: `Employee '${normalizedName}' updated successfully.`,
      employee: {
        id: Number(employeeId),
        name: normalizedName,
        email: normalizedEmail,
        status: status || employees[0].status,
      },
    };
  } catch (error) {
    await connection.rollback();

    if (error instanceof HttpError) {
      throw error;
    }

    throw error;
  } finally {
    connection.release();
  }
};
exports.getMetaConfig = async (companyId) => {
  const [rows] = await db.query("SELECT page_access_token,pixel_id,verify_token FROM meta_configs WHERE company_id=? LIMIT 1", [companyId]);
  if (!rows.length) throw new HttpError(404, "Meta configuration not found for this company.");
  return rows[0];
};
exports.updateMetaConfig = async ({ companyId, pageAccessToken, pixelId, verifyToken }) => {
  await db.query(`INSERT INTO meta_configs (company_id,page_access_token,pixel_id,verify_token) VALUES (?,?,?,?)
    ON DUPLICATE KEY UPDATE page_access_token=VALUES(page_access_token),pixel_id=VALUES(pixel_id),verify_token=VALUES(verify_token)`,
    [companyId, pageAccessToken, pixelId, verifyToken]);
  return { message: "Meta configurations successfully updated!" };
};
exports.getManagerEmployees = async (companyId) => {
  const [[employees], [leadCount]] = await Promise.all([
    db.query("SELECT id,name,email,role,status,created_at FROM users WHERE company_id=? AND role='employee' ORDER BY created_at DESC", [companyId]),
    db.query("SELECT COUNT(*) total FROM meta_leads WHERE company_id=?", [companyId])
  ]);
  return { employees, totalLeads: leadCount[0].total };
};
exports.toggleCompanyStatus = async ({ companyId, status }) => {
  if (!["active", "suspended"].includes(status)) throw new HttpError(400, "Invalid company status.");
  const [r] = await db.query("UPDATE companies SET status=? WHERE id=?", [status, companyId]);
  if (!r.affectedRows) throw new HttpError(404, "Company not found.");
  return { message: `Company environment status updated to ${status} successfully.` };
};
exports.toggleEmployeeStatus = async ({ employeeId, status, companyId }) => {
  if (!["active", "suspended"].includes(status)) throw new HttpError(400, "Invalid employee status.");
  const [r] = await db.query("UPDATE users SET status=? WHERE id=? AND company_id=? AND role='employee'", [status, employeeId, companyId]);
  if (!r.affectedRows) throw new HttpError(404, "Employee not found.");
  return { message: `Employee workspace operational capability updated to ${status}.` };
};

exports.deleteEmployee = async ({ employeeId, companyId }) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [employees] = await connection.query(
      "SELECT id,name FROM users WHERE id=? AND company_id=? AND role='employee' LIMIT 1",
      [employeeId, companyId]
    );

    if (!employees.length) throw new HttpError(404, "Employee not found.");

    // Preserve CRM leads when the employee is permanently removed.
    // Assigned leads return to the unallocated pipeline instead of being deleted.
    await connection.query(
      "UPDATE meta_leads SET assigned_to=NULL, status='unallocated' WHERE assigned_to=? AND company_id=?",
      [employeeId, companyId]
    );

    // Keep the employee deletion transactional. If another FK/history record
    // prevents the delete, the transaction rolls back instead of losing data.
    const [result] = await connection.query(
      "DELETE FROM users WHERE id=? AND company_id=? AND role='employee'",
      [employeeId, companyId]
    );

    if (!result.affectedRows) throw new HttpError(404, "Employee not found.");

    await connection.commit();
    return { message: `Employee '${employees[0].name}' deleted successfully.`, employeeId: Number(employeeId) };
  } catch (error) {
    await connection.rollback();
    if (error instanceof HttpError) throw error;

    // Do not silently delete partial data when DB relationships prevent a hard delete.
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED')
      throw new HttpError(409, "Employee cannot be permanently deleted because historical records still reference this employee.");

    throw error;
  } finally {
    connection.release();
  }
};
exports.getCompanyPipelines = async (companyId) => {
  const [rows] = await db.query(`SELECT l.id,l.lead_name,l.lead_email,l.lead_phone,l.status,l.created_at,u.name assigned_agent_name,l.assigned_to
    FROM meta_leads l LEFT JOIN users u ON l.assigned_to=u.id WHERE l.company_id=? ORDER BY l.created_at DESC`, [companyId]);
  return rows;
};


// Get form-wise auto-assignment rules for this manager's company.
exports.getLeadAssignmentRules = async (companyId) => {
  const [rows] = await db.query(
    `SELECT r.form_id, r.form_name, r.employee_id, r.sort_order,
            u.name AS employee_name,
            u.email AS employee_email,
            u.status AS employee_status
     FROM lead_form_assignment_rules r
     LEFT JOIN users u
       ON u.id = r.employee_id
      AND u.company_id = r.company_id
      AND u.role = 'employee'
     WHERE r.company_id = ?
     ORDER BY r.form_name, r.sort_order, r.id`,
    [companyId]
  );

  const groups = new Map();

  for (const row of rows) {
    if (!groups.has(row.form_id)) {
      groups.set(row.form_id, {
        formId: row.form_id,
        formName: row.form_name,
        employees: [],
      });
    }

    if (row.employee_id && row.employee_name) {
      groups.get(row.form_id).employees.push({
        id: Number(row.employee_id),
        name: row.employee_name,
        email: row.employee_email,
        status: row.employee_status,
      });
    }
  }

  return Array.from(groups.values());
};

exports.saveLeadAssignmentRule = async ({
  companyId,
  formId,
  formName,
  employeeIds,
}) => {
  const normalizedFormId = String(formId || "").trim();
  const normalizedFormName = String(formName || "").trim();

  const ids = [
    ...new Set(
      (Array.isArray(employeeIds) ? employeeIds : [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];

  if (!normalizedFormId || normalizedFormId.length > 100) {
    throw new HttpError(400, "Valid Meta Form ID is required.");
  }

  if (!normalizedFormName || normalizedFormName.length > 255) {
    throw new HttpError(400, "Valid form name is required.");
  }

  if (!ids.length) {
    throw new HttpError(400, "Select at least one employee.");
  }

  const placeholders = ids.map(() => "?").join(",");

  const [employees] = await db.query(
    `SELECT id
     FROM users
     WHERE company_id = ?
       AND role = 'employee'
       AND status = 'active'
       AND id IN (${placeholders})`,
    [companyId, ...ids]
  );

  if (employees.length !== ids.length) {
    throw new HttpError(
      400,
      "Selected employees must be active and belong to your company."
    );
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `DELETE FROM lead_form_assignment_rules
       WHERE company_id = ? AND form_id = ?`,
      [companyId, normalizedFormId]
    );

    for (let i = 0; i < ids.length; i += 1) {
      await connection.query(
        `INSERT INTO lead_form_assignment_rules
         (company_id, form_id, form_name, employee_id, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, normalizedFormId, normalizedFormName, ids[i], i + 1]
      );
    }

    await connection.commit();

    return {
      message: "Auto-assignment rule saved successfully.",
      formId: normalizedFormId,
      formName: normalizedFormName,
      employeeIds: ids,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.deleteLeadAssignmentRule = async ({ companyId, formId }) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `DELETE FROM lead_form_assignment_rules
       WHERE company_id = ? AND form_id = ?`,
      [companyId, String(formId)]
    );

    await connection.query(
      `DELETE FROM lead_form_assignment_state
       WHERE company_id = ? AND form_id = ?`,
      [companyId, String(formId)]
    );

    await connection.commit();

    return { message: "Assignment rule deleted successfully." };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// server/services/companyService.js

exports.getMetaLeadForms = async (companyId) => {
  const config = await exports.getMetaConfig(companyId);
  const accessToken = config?.page_access_token;
  console.log(accessToken, "accessToken");

  const configuredPageId = config?.pageId || config?.page_id;
  console.log(configuredPageId, "configuredPageId");
  console.log(config, "configuredPageId");

  if (!accessToken) {
    throw new HttpError(400, "Meta access token is missing.");
  }

  const graphVersion = require("../config/env").meta.graphApiVersion;

  const graphGet = async (url) => {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      throw new HttpError(
        400,
        data?.error?.message || "Meta API request failed."
      );
    }

    return data;
  };

  let pageId = configuredPageId;

  // If no Page ID is configured, find Pages available to this token.
  if (!pageId) {
    const pages = await graphGet(
      `https://graph.facebook.com/${graphVersion}/me/accounts` +
      `?fields=id,name,access_token&limit=100` +
      `&access_token=${encodeURIComponent(accessToken)}`
    );

    if (!pages.data?.length) {
      throw new HttpError(
        400,
        "No accessible Facebook Pages found. Check token and permissions."
      );
    }

    // Use the first available Page only as a fallback.
    pageId = pages.data[0].id;
  }

  const forms = await graphGet(
    `https://graph.facebook.com/${graphVersion}/${pageId}/leadgen_forms` +
    `?fields=id,name,status&limit=100` +
    `&access_token=${encodeURIComponent(accessToken)}`
  );

  return {
    pageId: String(pageId),
    forms: (forms.data || []).map((form) => ({
      id: String(form.id),
      name: form.name || "Untitled Form",
      status: form.status || "UNKNOWN",
    })),
  };
};
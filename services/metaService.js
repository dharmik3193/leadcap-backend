const crypto = require("crypto");
const env = require("../config/env");
const db = require("../config/db");
const { LEAD_STATUS_TO_META_EVENT } = require("../constants/metaEvents");

const sha256 = v => crypto.createHash("sha256").update(v).digest("hex");
const email = v => String(v || "").trim().toLowerCase();
const phone = v => String(v || "").replace(/[^\d+]/g, "");
const compact = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)));

const graphRequest = async (path, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.meta.apiTimeoutMs);
  try {
    const response = await fetch(`https://graph.facebook.com/${env.meta.graphApiVersion}/${path}`, {
      ...options, signal: controller.signal, headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) { const e = new Error(data?.error?.message || `Meta API failed (${response.status})`); e.meta = data?.error || data; e.status = response.status; throw e; }
    return data;
  } finally { clearTimeout(timer); }
};

exports.getConfig = async (companyId) => {
  const [rows] = await db.query(
    `SELECT
      company_id,
      page_access_token,
      ad_account_id,
      pixel_id,
      verify_token
     FROM meta_configs
     WHERE company_id = ?
     LIMIT 1`,
    [companyId]
  );

  return rows[0] || null;
};





exports.getLeadForms = async (companyId) => {
  const config = await exports.getConfig(companyId);

  if (!config?.page_access_token) {
    const error = new Error(
      "Meta access token missing in company configuration."
    );
    error.status = 400;
    throw error;
  }

  const token = config.page_access_token;
  let pages = [];

  // First, try the saved token as a User Access Token.
  try {
    const accounts = await graphRequest(
      `me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(token)}`
    );

    pages = (accounts.data || []).filter(
      (page) => page.id && page.access_token
    );
  } catch (error) {
    // A Page Access Token may not be able to list /me/accounts.
    // In that case, try resolving /me directly as a Page.
  }

  // If no managed Pages were returned, try the token as a Page token.
  if (!pages.length) {
    const page = await graphRequest(
      `me?fields=id,name&access_token=${encodeURIComponent(token)}`
    );

    if (!page?.id) {
      throw new Error(
        "Could not identify a Facebook Page using the saved Meta token."
      );
    }

    pages = [{
      id: page.id,
      name: page.name || "Facebook Page",
      access_token: token,
    }];
  }

  // Fetch forms for every accessible Page using that Page's token.
  const results = await Promise.all(
    pages.map(async (page) => {
      const response = await graphRequest(
        `${page.id}/leadgen_forms?fields=id,name,status&limit=100&access_token=${encodeURIComponent(page.access_token)}`
      );

      return (response.data || []).map((form) => ({
        id: form.id,
        name: form.name || "Untitled Form",
        status: form.status || "",
        pageId: page.id,
        pageName: page.name || "Facebook Page",
      }));
    })
  );

  const forms = results.flat();

  return {
    forms,
    pages: pages.map(({ id, name }) => ({
      id,
      name: name || "Facebook Page",
    })),
  };
};





exports.getFormName = async (formId, token) => {
  try { const data = await graphRequest(`${formId}?fields=name&access_token=${encodeURIComponent(token)}`); return data.name || "Unknown Form"; }
  catch (e) { console.error("Meta form lookup failed:", e.message); return "Unknown Form"; }
};
exports.getLeadDetails = async (leadId, token) =>
  graphRequest(`${leadId}?fields=field_data,created_time,form_id&access_token=${encodeURIComponent(token)}`);

exports.sendLeadStageEvent = async ({ lead, companyId, newStatus, stageChangedAt }) => {
  const eventName = LEAD_STATUS_TO_META_EVENT[newStatus];
  if (!eventName) return { sent: false, skipped: true, reason: "No Meta event configured for this status." };
  if (!lead.meta_lead_id) return { sent: false, skipped: true, reason: "Lead has no Meta lead ID." };
  const config = await exports.getConfig(companyId);
  if (!config?.pixel_id || !config?.page_access_token)
    return { sent: false, skipped: true, reason: "Meta CAPI configuration is incomplete." };

  const eventId = `crm:${lead.id}:${eventName}:v1`;
  const user_data = compact({
    lead_id: String(lead.meta_lead_id),
    em: email(lead.lead_email) ? [sha256(email(lead.lead_email))] : undefined,
    ph: phone(lead.lead_phone) ? [sha256(phone(lead.lead_phone))] : undefined
  });
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(new Date(stageChangedAt || Date.now()).getTime() / 1000),
      action_source: "system_generated",
      event_source: "crm",
      event_id: eventId,
      user_data,
      custom_data: compact({ crm_lead_id: String(lead.id), crm_status: newStatus })
    }]
  };
  const response = await graphRequest(`${config.pixel_id}/events?access_token=${encodeURIComponent(config.page_access_token)}`, { method: "POST", body: JSON.stringify(payload) });
  return { sent: true, skipped: false, eventId, eventName, response };
};



exports.getAdPerformance = async ({
  companyId,
  since,
  until,
}) => {
  const validDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
      return false;
    }

    const date = new Date(`${value}T00:00:00Z`);

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  };

  if (!validDate(since) || !validDate(until) || since > until) {
    const error = new Error(
      "Valid since and until dates are required (YYYY-MM-DD)."
    );
    error.status = 400;
    throw error;
  }

  const config = await exports.getConfig(companyId);

  if (!config?.page_access_token || !config?.ad_account_id) {
    const error = new Error(
      "Meta access token or Ad Account ID is missing in company configuration."
    );
    error.status = 400;
    throw error;
  }

  const rawAccountId = String(config.ad_account_id).trim();
  const accountId = rawAccountId.startsWith("act_")
    ? rawAccountId
    : `act_${rawAccountId}`;

  const token = config.page_access_token;

  const fetchInsights = async ({ level, timeIncrement }) => {
    const params = new URLSearchParams({
      access_token: token,
      level,
      time_increment: String(timeIncrement),
      limit: "500",
      fields: [
        "account_currency",
        "campaign_id",
        "campaign_name",
        "date_start",
        "date_stop",
        "spend",
        "impressions",
        "reach",
        "clicks",
        "inline_link_clicks",
        "ctr",
        "cpc",
        "cpm",
        "actions",
        "cost_per_action_type",
      ].join(","),
      time_range: JSON.stringify({ since, until }),
    });

    const result = await graphRequest(
      `${accountId}/insights?${params.toString()}`
    );

    return result.data || [];
  };

  const [dailyRows, campaignRows] = await Promise.all([
    fetchInsights({ level: "account", timeIncrement: 1 }),
    fetchInsights({ level: "campaign", timeIncrement: "all_days" }),
  ]);

  const daily = dailyRows.map((row) => {
    const spend = Number(row.spend || 0);
    const leads = (row.actions || [])
      .filter((action) =>
        ["lead", "onsite_conversion.lead_grouped"].includes(
          action.action_type
        )
      )
      .reduce((total, action) => total + Number(action.value || 0), 0);

    return {
      date: row.date_start,
      spend,
      impressions: Number(row.impressions || 0),
      reach: Number(row.reach || 0),
      clicks: Number(row.clicks || 0),
      linkClicks: Number(row.inline_link_clicks || 0),
      leads,
      costPerLead: leads > 0 ? spend / leads : null,
      currency: row.account_currency || null,
    };
  });

  const campaigns = campaignRows.map((row) => {
    const spend = Number(row.spend || 0);
    const leads = (row.actions || [])
      .filter((action) =>
        ["lead", "onsite_conversion.lead_grouped"].includes(
          action.action_type
        )
      )
      .reduce((total, action) => total + Number(action.value || 0), 0);

    return {
      campaignId: row.campaign_id,
      campaignName: row.campaign_name || "Unnamed campaign",
      spend,
      impressions: Number(row.impressions || 0),
      reach: Number(row.reach || 0),
      clicks: Number(row.clicks || 0),
      leads,
      costPerLead: leads > 0 ? spend / leads : null,
      currency: row.account_currency || null,
    };
  });

  const totals = daily.reduce(
    (result, row) => ({
      spend: result.spend + row.spend,
      impressions: result.impressions + row.impressions,
      reach: result.reach + row.reach,
      clicks: result.clicks + row.clicks,
      linkClicks: result.linkClicks + row.linkClicks,
      leads: result.leads + row.leads,
    }),
    {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      linkClicks: 0,
      leads: 0,
    }
  );

  return {
    companyId: Number(companyId),
    dateRange: { since, until },
    currency: daily.find((row) => row.currency)?.currency || null,
    totals: {
      ...totals,
      costPerLead:
        totals.leads > 0 ? totals.spend / totals.leads : null,
    },
    daily,
    campaigns,
  };
};

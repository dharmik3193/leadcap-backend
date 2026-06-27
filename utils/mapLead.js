/**
 * Convert Facebook field_data array into a clean object
 */

function normalizeKey(key) {
    return key
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_")
        .replace(/[^\w\u0A80-\u0AFF]/g, "");
}

function mapLead(fbLead) {

    const lead = {
        full_name: null,
        phone: null,
        email: null,
        city: null,
        state: null,
        country: null,
        company: null,
        job_title: null,
        custom_fields: {}
    };

    if (!fbLead.field_data) {
        return lead;
    }

    fbLead.field_data.forEach(field => {

        const key = normalizeKey(field.name);

        let value = null;

        if (Array.isArray(field.values)) {

            if (field.values.length === 1) {
                value = field.values[0];
            } else {
                value = field.values.join(", ");
            }

        } else {

            value = field.values;

        }

        switch (key) {

            case "full_name":
            case "name":
                lead.full_name = value;
                break;

            case "phone_number":
            case "phone":
            case "mobile_number":
            case "mobile":
                lead.phone = value;
                break;

            case "email":
            case "email_address":
                lead.email = value;
                break;

            case "city":
                lead.city = value;
                break;

            case "state":
                lead.state = value;
                break;

            case "country":
                lead.country = value;
                break;

            case "company_name":
            case "company":
                lead.company = value;
                break;

            case "job_title":
                lead.job_title = value;
                break;

            default:
                // Save every unknown/custom field
                lead.custom_fields[field.name] = value;
                break;

        }

    });

    return lead;
}

module.exports = mapLead;
const axios = require("axios");

/**
 * Fetch lead details from Facebook Graph API
 * @param {string} leadId
 * @returns {Object}
 */
const getLeadById = async (leadId) => {
    try {

        const response = await axios.get(
            `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION}/${leadId}`,
            {
                params: {
                    fields: "id,created_time,field_data",
                    access_token: process.env.FB_PAGE_ACCESS_TOKEN
                }
            }
        );

        return response.data;

    } catch (error) {

        console.error("❌ Facebook Graph API Error");

        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }

        throw error;
    }
};

module.exports = {
    getLeadById
};
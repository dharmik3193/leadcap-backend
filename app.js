require("dotenv").config();

const express = require("express");
const cors = require("cors");

const pool = require("./config/db");

const webhookRoutes = require("./routes/webhookRoutes");
const leadRoutes = require("./routes/leadRoutes");

const app = express();

app.use(cors());

app.use(express.json());

app.use("/webhook", webhookRoutes);

app.use("/api/leads", leadRoutes);

app.get("/", async (req, res) => {

    try {

        const [rows] = await pool.query("SELECT NOW() currentTime");

        res.json({

            success: true,

            message: "LeadCap Backend Running",

            database: "Connected",

            serverTime: rows[0].currentTime

        });

    } catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

    console.log(`Server Running On ${PORT}`);

});
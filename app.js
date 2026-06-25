require("dotenv").config();

const express = require("express");
const cors = require("cors");

const pool = require("./config/db");
const leadRoutes = require("./routes/leadRoutes");
const webhookRoutes = require("./routes/webhookRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/leads", leadRoutes);
app.use("/webhook", webhookRoutes);

app.get("/", async (req, res) => {

    try {

        const [rows] = await pool.query("SELECT NOW() AS serverTime");

        res.json({
            success: true,
            message: "Facebook Lead CRM API Running 🚀",
            database: "Connected",
            serverTime: rows[0].serverTime
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server Running On Port ${PORT}`);
});
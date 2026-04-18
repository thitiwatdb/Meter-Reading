const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require('path');
const { ensureDir, UPLOAD_DIR } = require('./utils/uploadBase64');
const IMAGES_DIR = path.join(__dirname, '../images');
dotenv.config();

const db = require('./config/db');
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const buildingsRoutes = require("./routes/buildingsRoutes")
const roomsRoutes = require("./routes/roomsRoutes")
const bookingsRoutes = require("./routes/bookingsRoutes")
const onlineBookingRoutes = require("./routes/onlineBookingRoutes")
const tenanciesRoutes = require("./routes/tenanciesRoutes")
const metersRoutes = require("./routes/metersRoutes")
const maintenanceRoutes = require("./routes/maintenanceRoutes")
const billingRoutes = require("./routes/billingRoutes")
const paymentsRoutes = require("./routes/paymentsRoutes")
const dashboardRoutes = require("./routes/dashboardRoutes")
const uploadRoutes = require("./routes/uploadRoutes")
const settingsRoutes = require("./routes/settingsRoutes")
const { startScheduler } = require('./jobs/holdExpiry')
const { startMonthlyBillingScheduler } = require('./jobs/monthlyBilling')
const activityRoutes = require("./routes/activityRoutes")
const notificationsRoutes = require("./routes/notificationsRoutes")

const app = express();
app.use(cors());
app.use(express.json({ limit: process.env.JSON_LIMIT || "20mb" }));
app.use(express.urlencoded({ limit: process.env.JSON_LIMIT || "20mb", extended: true }));
ensureDir();
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/images', express.static(IMAGES_DIR));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes)
app.use("/api/buildings", buildingsRoutes)
app.use("/api/rooms", roomsRoutes)
app.use("/api/bookings", bookingsRoutes)
app.use("/api/online-booking", onlineBookingRoutes)
app.use("/api/tenancies", tenanciesRoutes)
app.use("/api/meters", metersRoutes)
app.use("/api/maintenance", maintenanceRoutes)
app.use("/api/billing", billingRoutes)
app.use("/api/payments", paymentsRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/uploads", uploadRoutes)
app.use("/api/settings", settingsRoutes)
app.use("/api/activity", activityRoutes)
app.use("/api/notifications", notificationsRoutes)

db.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('Database test query failed:', err);
  } else {
    console.log('Database time:', result.rows[0]);
  }
});

app.use((req,res) => res.status(404).json({message: "Not found"}));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
  startMonthlyBillingScheduler();
});

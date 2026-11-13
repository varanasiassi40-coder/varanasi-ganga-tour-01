    const express = require("express");
    const Database = require("better-sqlite3");
    const path = require("path");
    const fs = require("fs");

    const app = express();
    const PORT = process.env.PORT || 3000;

    // =====================================
    // 1. DATABASE CONNECTION
    // =====================================

    const dbPath = path.join(__dirname, "bookings.db");

    let db;

    try {
        db = new Database(dbPath);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");

        console.log("SQLite Database Connected Successfully");

    } catch (error) {
        console.error("Database Connection Error:", error.message);
        process.exit(1);
    }

    // =====================================
    // 2. CREATE BOOKING TABLE
    // =====================================

    db.exec(`
        CREATE TABLE IF NOT EXISTS website_bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            booking_type TEXT DEFAULT '',
            persons INTEGER DEFAULT 1,
            pickup_point TEXT DEFAULT '',
            drop_point TEXT DEFAULT '',
            booking_date TEXT NOT NULL,
            special_request TEXT DEFAULT '',
            total REAL DEFAULT 0,
            booking_data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("Booking Table Ready");

    // =====================================
    // 3. MIDDLEWARE
    // =====================================

    app.use(express.json({ limit: "2mb" }));

    app.use(express.urlencoded({
        extended: true,
        limit: "2mb"
    }));

    // =====================================
    // 4. WEBSITE FOLDER SETUP
    // =====================================

    const publicFolder = path.join(__dirname, "public");

    const websiteFolder = fs.existsSync(
        path.join(publicFolder, "index.html")
    )
        ? publicFolder
        : __dirname;

    // =====================================
    // 5. PROTECT IMPORTANT FILES
    // =====================================

    app.use((req, res, next) => {

        const blockedFiles = [
            "server.js",
            "package.json",
            "package-lock.json",
            "bookings.db",
            "bookings.db-wal",
            "bookings.db-shm",
            ".env"
        ];

        const requestedFile = path.basename(req.path);

        if (
            blockedFiles.includes(requestedFile) ||
            req.path.startsWith("/node_modules/")
        ) {
            return res.status(404).send("Not Found");
        }

        next();
    });

    // =====================================
    // 6. SERVE HTML, CSS, JS AND IMAGES
    // =====================================

    app.use(express.static(websiteFolder));

    // =====================================
    // 7. HOME PAGE
    // =====================================

    app.get("/", (req, res) => {

        const indexPath = path.join(
            websiteFolder,
            "index.html"
        );

        if (!fs.existsSync(indexPath)) {
            return res.status(404).send(
                "index.html not found. Check your website folder."
            );
        }

        res.sendFile(indexPath);
    });

    // =====================================
    // 8. HEALTH CHECK
    // =====================================

    app.get("/api/health", (req, res) => {

        try {
            db.prepare("SELECT 1").get();

            res.status(200).json({
                success: true,
                message: "Varanasi Ganga Tours Server Running",
                database: "Connected"
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                message: "Database Error"
            });
        }
    });

    // =====================================
    // 9. BOOKING DATABASE QUERY
    // =====================================

    const insertBooking = db.prepare(`
        INSERT INTO website_bookings (
            name,
            phone,
            booking_type,
            persons,
            pickup_point,
            drop_point,
            booking_date,
            special_request,
            total,
            booking_data
        )
        VALUES (
            @name,
            @phone,
            @booking_type,
            @persons,
            @pickup_point,
            @drop_point,
            @booking_date,
            @special_request,
            @total,
            @booking_data
        )
    `);

    // =====================================
    // 10. BOOKING API
    // =====================================

    app.post("/api/booking", (req, res) => {

        try {

            const data = req.body || {};

            // Get form values

            const name = String(data.name || "").trim();

            const phone = String(data.phone || "").trim();

            const bookingType = String(
                data.bookingType ||
                data.booking_type ||
                data.package ||
                ""
            ).trim();

            const persons = Number(data.persons || 1);

            const pickupPoint = String(
                data.pickupPoint ||
                data.pickup_point ||
                ""
            ).trim();

            const dropPoint = String(
                data.dropPoint ||
                data.drop_point ||
                ""
            ).trim();

            const bookingDate = String(
                data.date ||
                data.bookingDate ||
                data.booking_date ||
                ""
            ).trim();

            const specialRequest = String(
                data.specialRequest ||
                data.special_request ||
                ""
            ).trim();

            const rawTotal = String(
                data.total ?? data.estimatedTotal ?? 0
            ).replace(/[^\d.-]/g, "");

            const total = Number(rawTotal || 0);

            // Required field validation

            if (!name || !phone || !bookingDate) {

                return res.status(400).json({
                    success: false,
                    message: "Please fill all required fields."
                });
            }

            // Name validation

            if (name.length > 100) {

                return res.status(400).json({
                    success: false,
                    message: "Name is too long."
                });
            }

            // Phone validation

            if (!/^[6-9][0-9]{9}$/.test(phone)) {

                return res.status(400).json({
                    success: false,
                    message: "Enter a valid 10 digit mobile number."
                });
            }

            // Persons validation

            if (
                !Number.isInteger(persons) ||
                persons < 1 ||
                persons > 100
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid number of persons."
                });
            }

            // Total validation

            if (!Number.isFinite(total) || total < 0) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid booking amount."
                });
            }

            // Date validation

            if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {

                return res.status(400).json({
                    success: false,
                    message: "Please select a valid booking date."
                });
            }

            const [year, month, day] =
                bookingDate.split("-").map(Number);

            const checkDate = new Date(
                year,
                month - 1,
                day
            );

            if (
                checkDate.getFullYear() !== year ||
                checkDate.getMonth() !== month - 1 ||
                checkDate.getDate() !== day
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid booking date."
                });
            }

            // Length validation

            if (
                bookingType.length > 150 ||
                pickupPoint.length > 150 ||
                dropPoint.length > 150 ||
                specialRequest.length > 1000
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Some booking details are too long."
                });
            }

            // Save booking

            const result = insertBooking.run({

                name: name,

                phone: phone,

                booking_type: bookingType,

                persons: persons,

                pickup_point: pickupPoint,

                drop_point: dropPoint,

                booking_date: bookingDate,

                special_request: specialRequest,

                total: total,

                booking_data: JSON.stringify(data)

            });

            console.log(
                "New Booking Saved. Booking ID:",
                result.lastInsertRowid
            );

            return res.status(201).json({

                success: true,

                ok: true,

                message: "Booking saved successfully!",

                bookingId: result.lastInsertRowid

            });

        } catch (error) {

            console.error("Booking Save Error:", error);

            return res.status(500).json({

                success: false,

                message: "Server error. Booking could not be saved."

            });
        }

    });

    // =====================================
    // 11. UNKNOWN API ROUTES
    // =====================================

    app.use("/api", (req, res) => {

        res.status(404).json({

            success: false,

            message: "API route not found"

        });

    });

    // =====================================
    // 12. ERROR HANDLER
    // =====================================

    app.use((error, req, res, next) => {

        console.error("Server Error:", error);

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({

            success: false,

            message: "Internal Server Error"

        });

    });

    // =====================================
    // 13. START SERVER
    // =====================================

    const server = app.listen(PORT, "0.0.0.0", () => {

        console.log("");
        console.log("=================================");
        console.log(" VARANASI GANGA TOURS SERVER");
        console.log("=================================");
        console.log(`Website: http://localhost:${PORT}`);
        console.log(`Health: http://localhost:${PORT}/api/health`);
        console.log("Database: Connected");
        console.log("Booking API: Ready");
        console.log("=================================");

    });

    server.on("error", (error) => {

        console.error("Server Startup Error:", error.message);

    });
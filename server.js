const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "bookings.json");
const SETTINGS_FILE = path.join(__dirname, "schedule.json");


// =====================================================
// SZOLGÁLTATÁSOK
// =====================================================

const SERVICES = [
    "Classic Cut",
    "Skin Fade",
    "Hair + Beard",
    "Premium Cut"
];


// =====================================================
// ALAPÉRTELMEZETT MUNKANAPOK
// =====================================================

const DEFAULT_SCHEDULE = {
    monday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    tuesday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    wednesday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    thursday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    },

    friday: {
        enabled: true,
        start: "09:00",
        end: "19:00"
    }
};


// =====================================================
// NAPOK
// =====================================================

const DAY_NAMES = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
];


// =====================================================
// EXPRESS
// =====================================================

app.use(
    express.json({
        limit: "50kb"
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// =====================================================
// FOGLALÁSOK BETÖLTÉSE
// =====================================================

function getBookings() {

    if (!fs.existsSync(DATA_FILE)) {

        fs.writeFileSync(
            DATA_FILE,
            "[]",
            "utf8"
        );

    }

    try {

        const data =
            fs.readFileSync(
                DATA_FILE,
                "utf8"
            );

        const bookings =
            JSON.parse(data);

        if (!Array.isArray(bookings)) {
            return [];
        }

        return bookings;

    } catch (error) {

        console.error(
            "HIBA A BOOKINGS.JSON OLVASÁSAKOR:",
            error
        );

        return [];
    }
}


// =====================================================
// FOGLALÁSOK MENTÉSE
// =====================================================

function saveBookings(bookings) {

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(
            bookings,
            null,
            2
        ),
        "utf8"
    );
}


// =====================================================
// MUNKAREND BETÖLTÉSE
// =====================================================

function getSchedule() {

    if (!fs.existsSync(SETTINGS_FILE)) {

        fs.writeFileSync(
            SETTINGS_FILE,
            JSON.stringify(
                DEFAULT_SCHEDULE,
                null,
                2
            ),
            "utf8"
        );

    }

    try {

        const data =
            fs.readFileSync(
                SETTINGS_FILE,
                "utf8"
            );

        const schedule =
            JSON.parse(data);

        return {
            ...DEFAULT_SCHEDULE,
            ...schedule
        };

    } catch (error) {

        console.error(
            "SCHEDULE BETÖLTÉSI HIBA:",
            error
        );

        return DEFAULT_SCHEDULE;
    }
}


// =====================================================
// MUNKAREND MENTÉSE
// =====================================================

function saveSchedule(schedule) {

    fs.writeFileSync(
        SETTINGS_FILE,
        JSON.stringify(
            schedule,
            null,
            2
        ),
        "utf8"
    );
}


// =====================================================
// HTML BIZTONSÁG
// =====================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// =====================================================
// EMAIL
// =====================================================

function createTransporter() {

    return nodemailer.createTransport({

        service: "gmail",

        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }

    });
}


// =====================================================
// ADMIN SESSIONÖK
// =====================================================

const adminSessions = new Set();


// =====================================================
// ADMIN TOKEN
// =====================================================

function getAdminToken(req) {

    const cookieHeader =
        req.headers.cookie;

    if (!cookieHeader) {
        return null;
    }

    const cookies =
        cookieHeader
            .split(";")
            .map(
                cookie =>
                    cookie.trim()
            );

    const adminCookie =
        cookies.find(
            cookie =>
                cookie.startsWith(
                    "admin_token="
                )
        );

    if (!adminCookie) {
        return null;
    }

    return adminCookie.substring(
        "admin_token=".length
    );
}


// =====================================================
// ADMIN ELLENŐRZÉS
// =====================================================

function requireAdmin(
    req,
    res,
    next
) {

    const token =
        getAdminToken(req);

    if (
        !token ||
        !adminSessions.has(token)
    ) {

        return res.status(401).json({

            success: false,

            error:
                "Nincs jogosultság."

        });

    }

    next();
}


// =====================================================
// DÁTUM NAPJÁNAK MEGHATÁROZÁSA
// =====================================================

function getDayName(dateString) {

    const date =
        new Date(
            `${dateString}T12:00:00`
        );

    if (isNaN(date.getTime())) {
        return null;
    }

    return DAY_NAMES[
        date.getDay()
    ];
}


// =====================================================
// IDŐPONTOK GENERÁLÁSA
// =====================================================

function generateTimeSlots(
    start,
    end
) {

    const slots = [];

    const [startHour, startMinute] =
        start.split(":").map(Number);

    const [endHour, endMinute] =
        end.split(":").map(Number);

    let current =
        startHour * 60 +
        startMinute;

    const finish =
        endHour * 60 +
        endMinute;

    while (current < finish) {

        const hour =
            Math.floor(
                current / 60
            );

        const minute =
            current % 60;

        const formatted =
            `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

        slots.push(formatted);

        current += 30;
    }

    return slots;
}


// =====================================================
// IDŐPONTOK EGY ADOTT NAPRA
// =====================================================

function getAvailableScheduleTimes(date) {

    const dayName =
        getDayName(date);

    if (!dayName) {
        return [];
    }

    const schedule =
        getSchedule();

    const day =
        schedule[dayName];

    if (!day || !day.enabled) {
        return [];
    }

    return generateTimeSlots(
        day.start,
        day.end
    );
}


// =====================================================
// MUNKAREND LEKÉRÉSE
// =====================================================

app.get(
    "/api/schedule",
    (req, res) => {

        const schedule =
            getSchedule();

        res.json({

            success: true,

            schedule

        });

    }
);


// =====================================================
// ADMIN MUNKAREND LEKÉRÉSE
// =====================================================

app.get(
    "/api/admin/schedule",
    requireAdmin,
    (req, res) => {

        res.json({

            success: true,

            schedule:
                getSchedule()

        });

    }
);


// =====================================================
// ADMIN MUNKAREND MENTÉSE
// =====================================================

app.post(
    "/api/admin/schedule",
    requireAdmin,
    (req, res) => {

        try {

            const incoming =
                req.body;

            const days = [
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday"
            ];

            const newSchedule = {};

            for (const dayName of days) {

                const day =
                    incoming[dayName];

                if (!day) {

                    return res.status(400).json({

                        success: false,

                        error:
                            `Hiányzó beállítás: ${dayName}`

                    });

                }

                const enabled =
                    day.enabled === true;

                const start =
                    String(
                        day.start || ""
                    );

                const end =
                    String(
                        day.end || ""
                    );

                if (enabled) {

                    if (
                        !/^\d{2}:\d{2}$/.test(start) ||
                        !/^\d{2}:\d{2}$/.test(end)
                    ) {

                        return res.status(400).json({

                            success: false,

                            error:
                                "Érvénytelen időpont."

                        });

                    }

                    const startMinutes =
                        Number(start.substring(0, 2)) * 60 +
                        Number(start.substring(3, 5));

                    const endMinutes =
                        Number(end.substring(0, 2)) * 60 +
                        Number(end.substring(3, 5));

                    if (
                        startMinutes < 0 ||
                        startMinutes > 1439 ||
                        endMinutes < 0 ||
                        endMinutes > 1439 ||
                        startMinutes >= endMinutes
                    ) {

                        return res.status(400).json({

                            success: false,

                            error:
                                "A kezdési időnek korábbinak kell lennie a befejezési időnél."

                        });

                    }

                }

                newSchedule[dayName] = {

                    enabled,

                    start,

                    end

                };

            }

            saveSchedule(
                newSchedule
            );

            res.json({

                success: true,

                message:
                    "Munkarend sikeresen mentve.",

                schedule:
                    newSchedule

            });

        }

        catch (error) {

            console.error(
                "SCHEDULE MENTÉSI HIBA:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Nem sikerült menteni a munkarendet."

            });

        }

    }
);


// =====================================================
// FOGLALT IDŐPONTOK
// =====================================================

app.get(
    "/api/booked",
    (req, res) => {

        const date =
            req.query.date;

        if (!date) {

            return res.status(400).json({

                success: false,

                error:
                    "Hiányzik a dátum."

            });

        }

        const allowedTimes =
            getAvailableScheduleTimes(
                date
            );

        const bookings =
            getBookings();

        const bookedTimes =
            bookings
                .filter(
                    booking =>
                        booking.date === date
                )
                .map(
                    booking =>
                        booking.time
                );

        const availableTimes =
            allowedTimes.filter(
                time =>
                    !bookedTimes.includes(time)
            );

        res.json({

            success: true,

            bookedTimes,

            availableTimes,

            dayWorking:
                allowedTimes.length > 0

        });

    }
);


// =====================================================
// ÚJ FOGLALÁS
// =====================================================

app.post(
    "/api/book",
    async (req, res) => {

        try {

            const {
                name,
                phone,
                email,
                service,
                date,
                time,
                note
            } = req.body;


            if (
                !name ||
                !phone ||
                !email ||
                !service ||
                !date ||
                !time
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Tölts ki minden kötelező mezőt!"

                });

            }


            if (
                !SERVICES.includes(service)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Érvénytelen szolgáltatás."

                });

            }


            const allowedTimes =
                getAvailableScheduleTimes(
                    date
                );


            if (
                !allowedTimes.includes(time)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Erre a napra ez az időpont nem foglalható."

                });

            }


            const bookings =
                getBookings();


            const alreadyBooked =
                bookings.some(
                    booking =>
                        booking.date === date &&
                        booking.time === time
                );


            if (alreadyBooked) {

                return res.status(409).json({

                    success: false,

                    error:
                        "Ez az időpont már foglalt!"

                });

            }


            const booking = {

                id:
                    Date.now(),

                name:
                    name.trim(),

                phone:
                    phone.trim(),

                email:
                    email.trim(),

                service,

                date,

                time,

                note:
                    note
                        ? note.trim()
                        : "",

                createdAt:
                    new Date().toISOString()

            };


            bookings.push(
                booking
            );

            saveBookings(
                bookings
            );


            const transporter =
                createTransporter();


            // =================================================
            // BARBER EMAIL
            // =================================================

            try {

                await transporter.sendMail({

                    from:
                        process.env.EMAIL_USER,

                    to:
                        process.env.EMAIL_TO,

                    subject:
                        "✂️ Új CSIMPIKE CUTZ foglalás",

                    html: `

                        <div style="
                            font-family:Arial,sans-serif;
                            max-width:600px;
                            margin:30px auto;
                            padding:30px;
                            background:#111;
                            color:white;
                            border-radius:18px;
                        ">

                            <h1 style="color:#d4af37;">
                                CSIMPIKE CUTZ
                            </h1>

                            <p style="color:#aaa;">
                                Új időpontfoglalás érkezett.
                            </p>

                            <hr style="
                                border:none;
                                border-top:1px solid #333;
                                margin:25px 0;
                            ">

                            <p>
                                <strong>Vendég:</strong><br>
                                ${escapeHtml(name)}
                            </p>

                            <p>
                                <strong>Telefon:</strong><br>
                                ${escapeHtml(phone)}
                            </p>

                            <p>
                                <strong>E-mail:</strong><br>
                                ${escapeHtml(email)}
                            </p>

                            <p>
                                <strong>Szolgáltatás:</strong><br>
                                <span style="
                                    color:#d4af37;
                                    font-size:20px;
                                    font-weight:bold;
                                ">
                                    ${escapeHtml(service)}
                                </span>
                            </p>

                            <p>
                                <strong>Dátum:</strong><br>
                                ${escapeHtml(date)}
                            </p>

                            <p>
                                <strong>Időpont:</strong><br>
                                <span style="
                                    color:#d4af37;
                                    font-size:25px;
                                    font-weight:bold;
                                ">
                                    ${escapeHtml(time)}
                                </span>
                            </p>

                            <p>
                                <strong>Megjegyzés:</strong><br>
                                ${escapeHtml(
                                    note ||
                                    "Nincs megjegyzés"
                                )}
                            </p>

                            <hr style="
                                border:none;
                                border-top:1px solid #333;
                                margin:25px 0;
                            ">

                            <p style="color:#999;">
                                Barber: Csimpike
                            </p>

                        </div>

                    `

                });

            }

            catch (emailError) {

                console.error(
                    "BARBER EMAIL HIBA:",
                    emailError
                );

            }


            // =================================================
            // VENDÉG EMAIL
            // =================================================

            try {

                await transporter.sendMail({

                    from:
                        process.env.EMAIL_USER,

                    to:
                        email.trim(),

                    subject:
                        "✂️ CSIMPIKE CUTZ – Foglalás visszaigazolása",

                    html: `

                        <div style="
                            font-family:Arial,sans-serif;
                            max-width:600px;
                            margin:30px auto;
                            padding:35px;
                            background:#111;
                            color:white;
                            border-radius:18px;
                        ">

                            <h1 style="
                                color:#d4af37;
                            ">
                                CSIMPIKE CUTZ
                            </h1>

                            <p style="
                                color:#999;
                            ">
                                PREMIUM BARBER SHOP
                            </p>

                            <h2>
                                Szia ${escapeHtml(name)}!
                            </h2>

                            <p style="
                                color:#ccc;
                                line-height:1.7;
                            ">
                                A foglalásodat sikeresen rögzítettük.
                                Várunk szeretettel a CSIMPIKE CUTZ-ban!
                            </p>

                            <hr style="
                                border:none;
                                border-top:1px solid #333;
                                margin:25px 0;
                            ">

                            <div style="
                                background:#181818;
                                padding:22px;
                                border-radius:12px;
                            ">

                                <p>
                                    <strong>Szolgáltatás:</strong><br>
                                    <span style="
                                        color:#d4af37;
                                        font-size:18px;
                                        font-weight:bold;
                                    ">
                                        ${escapeHtml(service)}
                                    </span>
                                </p>

                                <p>
                                    <strong>Dátum:</strong><br>
                                    ${escapeHtml(date)}
                                </p>

                                <p>
                                    <strong>Időpont:</strong><br>
                                    <span style="
                                        color:#d4af37;
                                        font-size:24px;
                                        font-weight:bold;
                                    ">
                                        ${escapeHtml(time)}
                                    </span>
                                </p>

                                <p>
                                    <strong>Megjegyzés:</strong><br>
                                    ${escapeHtml(
                                        note ||
                                        "Nincs megjegyzés"
                                    )}
                                </p>

                            </div>

                            <p style="
                                color:#999;
                                margin-top:30px;
                            ">
                                CSIMPIKE CUTZ
                            </p>

                        </div>

                    `

                });

            }

            catch (customerEmailError) {

                console.error(
                    "VENDÉG EMAIL HIBA:",
                    customerEmailError
                );

            }


            res.json({

                success: true,

                message:
                    "Sikeres foglalás!"

            });

        }

        catch (error) {

            console.error(
                "FOGLALÁSI HIBA:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Hiba történt a foglalás közben."

            });

        }

    }
);


// =====================================================
// ADMIN LOGIN
// =====================================================

app.post(
    "/api/admin/login",
    (req, res) => {

        const {
            password
        } = req.body;

        if (
            !password ||
            password !==
                process.env.ADMIN_PASSWORD
        ) {

            return res.status(401).json({

                success: false,

                error:
                    "Hibás admin jelszó."

            });

        }


        const token =
            crypto
                .randomBytes(32)
                .toString("hex");


        adminSessions.add(
            token
        );


        res.setHeader(
            "Set-Cookie",
            [
                `admin_token=${token}`,
                "HttpOnly",
                "Path=/",
                "SameSite=Lax",
                "Max-Age=86400"
            ].join("; ")
        );


        res.setHeader(
            "Cache-Control",
            "no-store"
        );


        res.json({

            success: true

        });

    }
);


// =====================================================
// ADMIN LOGOUT
// =====================================================

app.post(
    "/api/admin/logout",
    requireAdmin,
    (req, res) => {

        const token =
            getAdminToken(req);

        if (token) {

            adminSessions.delete(
                token
            );

        }

        res.setHeader(
            "Set-Cookie",
            [
                "admin_token=",
                "HttpOnly",
                "Path=/",
                "SameSite=Lax",
                "Max-Age=0"
            ].join("; ")
        );

        res.json({

            success: true

        });

    }
);


// =====================================================
// ADMIN FOGLALÁSOK
// =====================================================

app.get(
    "/api/admin/bookings",
    requireAdmin,
    (req, res) => {

        const bookings =
            getBookings();

        bookings.sort(
            (a, b) => {

                const first =
                    `${a.date} ${a.time}`;

                const second =
                    `${b.date} ${b.time}`;

                return first.localeCompare(
                    second
                );

            }
        );

        res.json({

            success: true,

            bookings

        });

    }
);


// =====================================================
// FOGLALÁS TÖRLÉSE
// =====================================================

app.delete(
    "/api/admin/bookings/:id",
    requireAdmin,
    async (req, res) => {

        try {

            const id =
                Number(
                    req.params.id
                );

            if (
                !Number.isFinite(id)
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Érvénytelen foglalás ID."

                });

            }

            const bookings =
                getBookings();

            const booking =
                bookings.find(
                    item =>
                        Number(item.id) === id
                );

            if (!booking) {

                return res.status(404).json({

                    success: false,

                    error:
                        "A foglalás nem található."

                });

            }


            const transporter =
                createTransporter();


            try {

                await transporter.sendMail({

                    from:
                        process.env.EMAIL_USER,

                    to:
                        booking.email,

                    subject:
                        "✂️ CSIMPIKE CUTZ – Időpont lemondása",

                    html: `

                        <div style="
                            font-family:Arial,sans-serif;
                            max-width:600px;
                            margin:30px auto;
                            padding:35px;
                            background:#111;
                            color:white;
                            border-radius:18px;
                        ">

                            <h1 style="
                                color:#d4af37;
                            ">
                                CSIMPIKE CUTZ
                            </h1>

                            <p style="
                                color:#999;
                            ">
                                PREMIUM BARBER SHOP
                            </p>

                            <h2>
                                Szia ${escapeHtml(booking.name)}!
                            </h2>

                            <p style="
                                color:#ccc;
                                line-height:1.7;
                            ">
                                Sajnáljuk, de az alábbi időpontodat
                                sajnos nem tudjuk elvállalni.
                            </p>

                            <div style="
                                background:#181818;
                                padding:22px;
                                border-radius:12px;
                                margin-top:25px;
                            ">

                                <p>
                                    <strong>Szolgáltatás:</strong><br>
                                    ${escapeHtml(
                                        booking.service ||
                                        "Nincs megadva"
                                    )}
                                </p>

                                <p>
                                    <strong>Dátum:</strong><br>
                                    ${escapeHtml(
                                        booking.date
                                    )}
                                </p>

                                <p>
                                    <strong>Időpont:</strong><br>
                                    <span style="
                                        color:#d4af37;
                                        font-size:24px;
                                        font-weight:bold;
                                    ">
                                        ${escapeHtml(
                                            booking.time
                                        )}
                                    </span>
                                </p>

                            </div>

                            <p style="
                                color:#ccc;
                                line-height:1.7;
                                margin-top:30px;
                            ">
                                A foglalást töröltük.
                                Kérjük, válassz egy másik szabad időpontot.
                            </p>

                            <p style="
                                color:#d4af37;
                                font-weight:bold;
                                margin-top:30px;
                            ">
                                CSIMPIKE CUTZ
                            </p>

                        </div>

                    `

                });

            }

            catch (emailError) {

                console.error(
                    "LEMONDÁSI EMAIL HIBA:",
                    emailError
                );

                return res.status(500).json({

                    success: false,

                    error:
                        "A foglalást nem töröltem, mert a vendég értesítő e-mailjét nem sikerült elküldeni."

                });

            }


            const updatedBookings =
                bookings.filter(
                    item =>
                        Number(item.id) !== id
                );

            saveBookings(
                updatedBookings
            );


            res.json({

                success: true,

                message:
                    "Foglalás törölve, a vendég értesítve."

            });

        }

        catch (error) {

            console.error(
                "TÖRLÉSI HIBA:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Hiba történt a foglalás törlése közben."

            });

        }

    }
);


// =====================================================
// ADMIN STATUS
// =====================================================

app.get(
    "/api/admin/status",
    (req, res) => {

        const token =
            getAdminToken(req);

        res.json({

            success: true,

            loggedIn:
                !!token &&
                adminSessions.has(token)

        });

    }
);


// =====================================================
// SZERVER
// =====================================================

app.listen(
    PORT,
    () => {

        console.log("");
        console.log("========================================");
        console.log("        CSIMPIKE CUTZ ONLINE");
        console.log("========================================");
        console.log("");
        console.log(
            `http://localhost:${PORT}`
        );
        console.log("");
        console.log("Admin:");
        console.log(
            `http://localhost:${PORT}/admin.html`
        );
        console.log("");
        console.log("Szerver elindult.");
        console.log("");

    }
);
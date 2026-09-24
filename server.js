const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "bookings.json");


// =====================================================
// IDŐPONTOK
// =====================================================

const TIME_SLOTS = [
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00"
];


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
// EXPRESS BEÁLLÍTÁSOK
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
// FOGLALÁSOK BEOLVASÁSA
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
// EMAIL TRANSPORTER
// =====================================================

function createTransporter() {

    return nodemailer.createTransport({

        service: "gmail",

        auth: {

            user:
                process.env.EMAIL_USER,

            pass:
                process.env.EMAIL_PASS

        }

    });

}


// =====================================================
// ADMIN SESSIONÖK
// =====================================================

const adminSessions =
    new Set();


// =====================================================
// ADMIN TOKEN KINYERÉSE
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
// ADMIN JOGOSULTSÁG ELLENŐRZÉSE
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

        res.json({

            success: true,

            bookedTimes

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


            // -----------------------------------------
            // KÖTELEZŐ MEZŐK
            // -----------------------------------------

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


            // -----------------------------------------
            // SZOLGÁLTATÁS ELLENŐRZÉSE
            // -----------------------------------------

            if (
                !SERVICES.includes(
                    service
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Érvénytelen szolgáltatás."

                });

            }


            // -----------------------------------------
            // IDŐPONT ELLENŐRZÉSE
            // -----------------------------------------

            if (
                !TIME_SLOTS.includes(
                    time
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Ez az időpont nem létezik."

                });

            }


            // -----------------------------------------
            // FOGLALÁSOK
            // -----------------------------------------

            const bookings =
                getBookings();


            // -----------------------------------------
            // DUPLA FOGLALÁS ELLENŐRZÉSE
            // -----------------------------------------

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


            // -----------------------------------------
            // ÚJ FOGLALÁS
            // -----------------------------------------

            const booking = {

                id:
                    Date.now(),

                name:
                    name.trim(),

                phone:
                    phone.trim(),

                email:
                    email.trim(),

                service:
                    service,

                date:
                    date,

                time:
                    time,

                note:
                    note
                        ? note.trim()
                        : "",

                createdAt:
                    new Date().toISOString()

            };


            // -----------------------------------------
            // MENTÉS
            // -----------------------------------------

            bookings.push(
                booking
            );

            saveBookings(
                bookings
            );


            // -----------------------------------------
            // EMAIL
            // -----------------------------------------

            const transporter =
                createTransporter();


            // =================================================
            // EMAIL A BARBERNEK
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
                            font-family: Arial, sans-serif;
                            max-width: 600px;
                            margin: 30px auto;
                            padding: 30px;
                            background: #111;
                            color: white;
                            border-radius: 18px;
                        ">

                            <h1 style="
                                color: #d4af37;
                            ">
                                CSIMPIKE CUTZ
                            </h1>

                            <p style="
                                color: #aaa;
                            ">
                                Új időpontfoglalás érkezett.
                            </p>

                            <hr style="
                                border: none;
                                border-top: 1px solid #333;
                                margin: 25px 0;
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
                                    color: #d4af37;
                                    font-size: 20px;
                                    font-weight: bold;
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
                                    color: #d4af37;
                                    font-size: 25px;
                                    font-weight: bold;
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
                                border: none;
                                border-top: 1px solid #333;
                                margin: 25px 0;
                            ">

                            <p style="
                                color: #999;
                            ">
                                Barber: Csimpike
                            </p>

                        </div>

                    `

                });

            } catch (emailError) {

                console.error(
                    "BARBER EMAIL HIBA:",
                    emailError
                );

            }


            // =================================================
            // VISSZAIGAZOLÓ EMAIL A VENDÉGNEK
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
                            font-family: Arial, sans-serif;
                            max-width: 600px;
                            margin: 30px auto;
                            padding: 35px;
                            background: #111;
                            color: white;
                            border-radius: 18px;
                        ">

                            <h1 style="
                                color: #d4af37;
                                font-size: 30px;
                            ">
                                CSIMPIKE CUTZ
                            </h1>

                            <p style="
                                color: #999;
                            ">
                                PREMIUM BARBER SHOP
                            </p>

                            <h2>
                                Szia ${escapeHtml(name)}!
                            </h2>

                            <p style="
                                color: #ccc;
                                line-height: 1.7;
                            ">
                                A foglalásodat sikeresen rögzítettük.
                                Várunk szeretettel a CSIMPIKE CUTZ-ban!
                            </p>

                            <hr style="
                                border: none;
                                border-top: 1px solid #333;
                                margin: 25px 0;
                            ">

                            <div style="
                                background: #181818;
                                padding: 22px;
                                border-radius: 12px;
                            ">

                                <p>
                                    <strong>Szolgáltatás:</strong><br>

                                    <span style="
                                        color: #d4af37;
                                        font-size: 18px;
                                        font-weight: bold;
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
                                        color: #d4af37;
                                        font-size: 24px;
                                        font-weight: bold;
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
                                color: #999;
                                margin-top: 30px;
                                line-height: 1.6;
                            ">
                                Ha bármilyen kérdésed van,
                                keress minket a megadott elérhetőségen.
                            </p>

                            <p style="
                                color: #d4af37;
                                font-weight: bold;
                            ">
                                CSIMPIKE CUTZ
                            </p>

                        </div>

                    `

                });

            } catch (customerEmailError) {

                console.error(
                    "VENDÉG EMAIL HIBA:",
                    customerEmailError
                );

            }


            // -----------------------------------------
            // SIKERES VÁLASZ
            // -----------------------------------------

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


        // -----------------------------------------
        // ÚJ SESSION TOKEN
        // -----------------------------------------

        const token =
            crypto
                .randomBytes(32)
                .toString("hex");


        adminSessions.add(
            token
        );


        // -----------------------------------------
        // COOKIE
        // -----------------------------------------

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
// + VENDÉG LEMONDÓ EMAIL
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


            // -----------------------------------------
            // FOGLALÁS KERESÉSE
            // -----------------------------------------

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


            // =================================================
            // LEMONDÓ EMAIL A VENDÉGNEK
            // =================================================

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
                            font-family: Arial, sans-serif;
                            max-width: 600px;
                            margin: 30px auto;
                            padding: 35px;
                            background: #111;
                            color: white;
                            border-radius: 18px;
                        ">

                            <h1 style="
                                color: #d4af37;
                                font-size: 30px;
                                margin-bottom: 5px;
                            ">
                                CSIMPIKE CUTZ
                            </h1>

                            <p style="
                                color: #999;
                                margin-bottom: 30px;
                            ">
                                PREMIUM BARBER SHOP
                            </p>


                            <h2>
                                Szia ${escapeHtml(booking.name)}!
                            </h2>


                            <p style="
                                color: #ccc;
                                line-height: 1.7;
                            ">
                                Sajnáljuk, de az alábbi időpontodat
                                sajnos nem tudjuk elvállalni.
                            </p>


                            <div style="
                                background: #181818;
                                padding: 22px;
                                border-radius: 12px;
                                margin-top: 25px;
                            ">

                                <p>
                                    <strong>Szolgáltatás:</strong><br>

                                    <span style="
                                        color: #d4af37;
                                        font-size: 18px;
                                        font-weight: bold;
                                    ">
                                        ${escapeHtml(
                                            booking.service ||
                                            "Nincs megadva"
                                        )}
                                    </span>
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
                                        color: #d4af37;
                                        font-size: 24px;
                                        font-weight: bold;
                                    ">
                                        ${escapeHtml(
                                            booking.time
                                        )}
                                    </span>
                                </p>

                            </div>


                            <p style="
                                color: #ccc;
                                line-height: 1.7;
                                margin-top: 30px;
                            ">
                                A foglalást töröltük.
                                Kérjük, válassz egy másik szabad időpontot
                                a CSIMPIKE CUTZ időpontfoglaló oldalán.
                            </p>


                            <p style="
                                color: #d4af37;
                                font-weight: bold;
                                margin-top: 30px;
                            ">
                                CSIMPIKE CUTZ
                            </p>

                        </div>

                    `

                });

            } catch (emailError) {

                console.error(
                    "LEMONDÁSI EMAIL HIBA:",
                    emailError
                );


                // -----------------------------------------
                // HA NEM MENT KI AZ EMAIL,
                // NEM TÖRÖLJÜK A FOGLALÁST
                // -----------------------------------------

                return res.status(500).json({

                    success: false,

                    error:
                        "A foglalást nem töröltem, mert a vendég értesítő e-mailjét nem sikerült elküldeni."

                });

            }


            // =================================================
            // FOGLALÁS TÖRLÉSE
            // =================================================

            const updatedBookings =
                bookings.filter(
                    item =>
                        Number(item.id) !== id
                );


            saveBookings(
                updatedBookings
            );


            // =================================================
            // SIKER
            // =================================================

            res.json({

                success: true,

                message:
                    "Foglalás törölve, a vendég értesítve."

            });

        }

        catch (error) {

            console.error(
                "FOGLALÁS TÖRLÉSI HIBA:",
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
// ADMIN ÁLLAPOT ELLENŐRZÉS
// =====================================================

app.get(
    "/api/admin/status",
    (req, res) => {

        const token =
            getAdminToken(req);


        const loggedIn =
            !!token &&
            adminSessions.has(
                token
            );


        res.json({

            success: true,

            loggedIn

        });

    }
);


// =====================================================
// SZERVER INDÍTÁSA
// =====================================================

app.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "========================================"
        );

        console.log(
            "        CSIMPIKE CUTZ ONLINE"
        );

        console.log(
            "========================================"
        );

        console.log("");

        console.log(
            `http://localhost:${PORT}`
        );

        console.log("");

        console.log(
            "Admin:"
        );

        console.log(
            `http://localhost:${PORT}/admin.html`
        );

        console.log("");

        console.log(
            "Szerver elindult."
        );

        console.log("");

    }
);
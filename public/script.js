const dateInput =
    document.getElementById("date");

const timeSelect =
    document.getElementById("time");

const form =
    document.getElementById("bookingForm");

const message =
    document.getElementById("message");


// =====================================================
// MAI DÁTUM
// =====================================================

const today =
    new Date()
        .toISOString()
        .split("T")[0];

dateInput.min = today;


// =====================================================
// MUNKAREND
// =====================================================

let schedule = {};


// =====================================================
// MUNKAREND BETÖLTÉSE
// =====================================================

async function loadSchedule() {

    try {

        const response =
            await fetch(
                "/api/schedule"
            );

        const data =
            await response.json();

        if (data.success) {

            schedule =
                data.schedule || {};

        }

    }

    catch (error) {

        console.error(
            "Munkarend hiba:",
            error
        );

    }
}


// =====================================================
// DÁTUM NAPJÁNAK MEGHATÁROZÁSA
// =====================================================

function getDayName(dateString) {

    const date =
        new Date(
            `${dateString}T12:00:00`
        );

    const days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday"
    ];

    return days[
        date.getDay()
    ];
}


// =====================================================
// DÁTUM KIVÁLASZTÁSA
// =====================================================

dateInput.addEventListener(
    "change",
    loadAvailableTimes
);


// =====================================================
// IDŐPONTOK
// =====================================================

async function loadAvailableTimes() {

    const date =
        dateInput.value;


    if (!date) {

        timeSelect.innerHTML = `
            <option value="">
                Válassz dátumot
            </option>
        `;

        return;

    }


    const dayName =
        getDayName(date);


    // ==============================================
    // HÉTVÉGE
    // ==============================================

    if (
        dayName === "saturday" ||
        dayName === "sunday"
    ) {

        timeSelect.innerHTML = `
            <option value="">
                Hétvégén nincs nyitvatartás
            </option>
        `;

        return;

    }


    // ==============================================
    // NAP ELLENŐRZÉSE
    // ==============================================

    const selectedDay =
        schedule[dayName];


    if (
        !selectedDay ||
        !selectedDay.enabled
    ) {

        timeSelect.innerHTML = `
            <option value="">
                Ezen a napon nincs nyitvatartás
            </option>
        `;

        return;

    }


    timeSelect.innerHTML = `
        <option value="">
            Időpontok betöltése...
        </option>
    `;


    try {

        const response =
            await fetch(
                `/api/booked?date=${encodeURIComponent(date)}`
            );


        const data =
            await response.json();


        if (!response.ok) {

            timeSelect.innerHTML = `
                <option value="">
                    Nem sikerült betölteni az időpontokat
                </option>
            `;

            return;

        }


        timeSelect.innerHTML = "";


        const available =
            data.availableTimes || [];


        if (available.length === 0) {

            timeSelect.innerHTML = `
                <option value="">
                    Erre a napra nincs szabad időpont
                </option>
            `;

            return;

        }


        const defaultOption =
            document.createElement(
                "option"
            );

        defaultOption.value = "";

        defaultOption.textContent =
            "Válassz időpontot";

        timeSelect.appendChild(
            defaultOption
        );


        available.forEach(
            time => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    time;

                option.textContent =
                    time;

                timeSelect.appendChild(
                    option
                );

            }
        );

    }

    catch (error) {

        console.error(error);

        timeSelect.innerHTML = `
            <option value="">
                Hiba történt
            </option>
        `;

    }

}


// =====================================================
// FOGLALÁS
// =====================================================

form.addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();


        message.style.color =
            "#aaa";

        message.textContent =
            "Foglalás feldolgozása...";


        const data = {

            name:
                document.getElementById(
                    "name"
                ).value,

            phone:
                document.getElementById(
                    "phone"
                ).value,

            email:
                document.getElementById(
                    "email"
                ).value,

            service:
                document.getElementById(
                    "service"
                ).value,

            date:
                document.getElementById(
                    "date"
                ).value,

            time:
                document.getElementById(
                    "time"
                ).value,

            note:
                document.getElementById(
                    "note"
                ).value

        };


        try {

            const response =
                await fetch(
                    "/api/book",
                    {

                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify(data)

                    }
                );


            const result =
                await response.json();


            if (!response.ok) {

                message.style.color =
                    "#ff5555";

                message.textContent =
                    result.error ||
                    "Hiba történt.";

                // Ha közben más lefoglalta,
                // frissítsük az időpontokat
                if (
                    response.status === 409
                ) {

                    await loadAvailableTimes();

                }

                return;

            }


            message.style.color =
                "#d4af37";


            message.innerHTML = `
                ✅ <strong>Sikeres foglalás!</strong><br>
                ${data.date} — ${data.time}<br>
                Hamarosan visszaigazolást kapsz e-mailben.
            `;


            form.reset();


            timeSelect.innerHTML = `
                <option value="">
                    Válassz dátumot
                </option>
            `;


        }

        catch (error) {

            console.error(error);

            message.style.color =
                "#ff5555";

            message.textContent =
                "Nem sikerült kapcsolódni a szerverhez.";

        }

    }
);


// =====================================================
// INDÍTÁS
// =====================================================

loadSchedule();
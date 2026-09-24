const dateInput =
    document.getElementById("date");

const timeSelect =
    document.getElementById("time");

const form =
    document.getElementById("bookingForm");

const message =
    document.getElementById("message");


/*
========================================
MAI DÁTUM
========================================
*/

const today =
    new Date().toISOString().split("T")[0];

dateInput.min = today;


/*
========================================
DÁTUM KIVÁLASZTÁSA
========================================
*/

dateInput.addEventListener(
    "change",
    loadAvailableTimes
);


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


    timeSelect.innerHTML = `
        <option>
            Időpontok betöltése...
        </option>
    `;


    try {

        const response =
            await fetch(
                `/api/booked?date=${date}`
            );


        const data =
            await response.json();


        const allTimes = [

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


        timeSelect.innerHTML = "";


        const available =
            allTimes.filter(
                time =>
                    !data.bookedTimes.includes(time)
            );


        if (available.length === 0) {

            timeSelect.innerHTML = `
                <option value="">
                    Erre a napra nincs szabad időpont
                </option>
            `;

            return;

        }


        const defaultOption =
            document.createElement("option");

        defaultOption.value = "";

        defaultOption.textContent =
            "Válassz időpontot";

        timeSelect.appendChild(
            defaultOption
        );


        available.forEach(time => {

            const option =
                document.createElement("option");

            option.value = time;

            option.textContent = time;

            timeSelect.appendChild(
                option
            );

        });


    } catch (error) {

        console.error(error);

        timeSelect.innerHTML = `
            <option value="">
                Hiba történt
            </option>
        `;

    }

}


/*
========================================
FOGLALÁS
========================================
*/

form.addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();


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

                return;

            }


            message.style.color =
                "#d4af37";


            message.innerHTML = `
                ✅ <strong>Sikeres foglalás!</strong><br>
                ${data.date} — ${data.time}<br>
                Hamarosan visszaigazolást kapsz.
            `;


            form.reset();


            timeSelect.innerHTML = `
                <option value="">
                    Válassz időpontot
                </option>
            `;


        } catch (error) {

            console.error(error);

            message.style.color =
                "#ff5555";

            message.textContent =
                "Nem sikerült kapcsolódni a szerverhez.";

        }

    }
);
/* =====================================================
   SUPABASE CONFIGURATION
===================================================== */

const SUPABASE_URL =
    "https://peektwdnoqxemqrqlqnw.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_h4_UcxfpPCpBgYuZ-GrGLw_KxbpUQ7P";


const db = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


/* =====================================================
   GLOBAL
===================================================== */

let monthlyChart = null;


/* =====================================================
   DOM
===================================================== */

const form =
    document.getElementById("readingForm");

const message =
    document.getElementById("message");

const readingsTable =
    document.getElementById("readingsTable");


/* =====================================================
   INITIALIZATION
===================================================== */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        setCurrentDate();

        loadReadings();

    }
);


/* =====================================================
   CURRENT DATE
===================================================== */

function setCurrentDate() {

    const today =
        new Date();

    document.getElementById(
        "currentDate"
    ).textContent =
        today.toLocaleDateString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );
		
	const yesterday =
        new Date(new Date().setDate(new Date().getDate() - 1));

    document.getElementById(
        "readingDate"
    ).value =
        formatDate(today);

}


/* =====================================================
   DATE FORMAT
===================================================== */

function formatDate(date) {

    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");


    const day =
        String(
            date.getDate()
        ).padStart(2, "0");


    return `${year}-${month}-${day}`;

}


/* =====================================================
   SAVE READING
===================================================== */

form.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();		

        const readingDate =
            document.getElementById(
                "readingDate"
            ).value;


        const solarProduction =
            Number(
                document.getElementById(
                    "solarProductionInput"
                ).value
            );


        const importReading =
            Number(
                document.getElementById(
                    "gridImportReading"
                ).value
            );


        const exportReading =
            Number(
                document.getElementById(
                    "gridExportReading"
                ).value
            );


        if (
            !readingDate ||
            Number.isNaN(solarProduction) ||
            Number.isNaN(importReading) ||
            Number.isNaN(exportReading)
        ) {

            showError(
                "Please enter all values."
            );

            return;

        }


        /* ---------------------------------------------
           Previous reading
        --------------------------------------------- */

        const {
            data: previousRows,
            error: previousError
        } = await db

            .from("dailyreadings")

            .select("*")

            .lt(
                "reading_date",
                readingDate
            )

            .order(
                "reading_date",
                {
                    ascending: false
                }
            )

            .limit(1);
			
			
		const selectedDate = new Date(`${readingDate}T00:00:00`);

		const firstDayOfMonth = new Date(
			selectedDate.getFullYear(),
			selectedDate.getMonth(),
			1
		);

		const firstDayOfMonthString = formatDate(firstDayOfMonth);

		const { 
			data: previousMonthRows, 
			error: previousMonthError
		} = await db
			
			.from("dailyreadings")
			
			.select("reading_date, grid_import_reading, grid_export_reading, closing_units")
			
			.lt("reading_date", firstDayOfMonthString)
			
			.order("reading_date", { ascending: false })
			
			.limit(1);



        if (previousError || previousMonthError) {

            console.error(
                previousError ? previousError : previousMonthError
            );

            showError(
                "Could not get previous reading: "
            );

            return;

        }
		
		


        let gridImport = null;

        let gridExport = null;

		let gridImportNet = null;
        
		let gridExportNet = null;

        let consumption = null;
		
		let closingUnits = null;


        /* ---------------------------------------------
           Calculate daily values
        --------------------------------------------- */

        if (
            previousRows &&
            previousRows.length > 0
        ) {

            const previous =
                previousRows[0];


            gridImport =
                round(
                    importReading -
                    Number(
                        previous.grid_import_reading
                    )
                );


            gridExport =
                round(
                    exportReading -
                    Number(
                        previous.grid_export_reading
                    )
                );


            if (
                gridImport < 0 ||
                gridExport < 0
            ) {

                showError(
                    "Today's meter reading cannot be lower than the previous reading."
                );

                return;

            }
			
		}

		if (
            previousMonthRows &&
            previousMonthRows.length > 0
        ) {
			
			const previousMonthLastRow = previousMonthRows[0];
			
			gridImportNet = round(
                    importReading -
                    Number(
                        previousMonthLastRow.grid_import_reading
                    )
                );
			
			gridExportNet = round(
                    exportReading -
                    Number(
                        previousMonthLastRow.grid_export_reading
                    )
                );
				
			const previousClosingUnits = Number(previousMonthLastRow.closing_units) || 0;
			
			closingUnits = round(
							Math.max(
										0,
										previousClosingUnits +
										gridExportNet -
										gridImportNet
									)
							);

        }


        /* ---------------------------------------------
           Save
        --------------------------------------------- */

        const {
            error: saveError
        } = await db

            .from("dailyreadings")

            .upsert(
                {
                    reading_date:
                        readingDate,

                    solar_production:
                        solarProduction,

                    grid_import_reading:
                        importReading,

                    grid_export_reading:
                        exportReading,

                    grid_import:
                        gridImport,

                    grid_export:
                        gridExport,

					import_so_far:
                        gridImportNet,

                    export_so_far:
                        gridExportNet,
						
                    closing_units:
                        closingUnits
                },
                {
                    onConflict:
                        "reading_date"
                }
            );


        if (saveError) {

            console.error(
                saveError
            );

            showError(
                "Save failed: " +
                saveError.message
            );

            return;

        }


        showSuccess(
            "Reading saved successfully."
        );


        form.reset();


        document.getElementById(
            "readingDate"
        ).value =
            readingDate;


        await loadReadings();

    }
);


/* =====================================================
   LOAD READINGS
===================================================== */

async function loadReadings() {

    const {
        data,
        error
    } = await db

        .from("dailyreadings")

        .select("*")
		
		.eq("is_visible", true)

        .order(
            "reading_date",
            {
                ascending: false
            }
        );


    if (error) {

        console.error(error);

        showError(
            "Could not load readings: " +
            error.message
        );

        return;

    }


    renderTable(data);


    if (
        data &&
        data.length > 0
    ) {

        updateDashboard(
            data[0]
        );

        updateMonthlyAnalysis(
            data
        );

    }

}


/* =====================================================
   RENDER TABLE
===================================================== */

function renderTable(data) {

    readingsTable.innerHTML = "";


    data.forEach(
        row => {

            const tr =
                document.createElement(
                    "tr"
                );


            tr.innerHTML = `

                <td>
                    ${formatDisplayDate(
                        row.reading_date
                    )}
                </td>

                <td>
                    ${formatNumber(
                        row.solar_production
                    )}
                </td>

                <td>
                    ${formatNumber(
                        row.grid_import_reading
                    )}
                </td>

                <td>
                    ${formatNumber(
                        row.grid_export_reading
                    )}
                </td>

                <td>
                    ${formatNullable(
                        row.grid_import
                    )}
                </td>

                <td>
                    ${formatNullable(
                        row.grid_export
                    )}
                </td>

                <td>
                    ${formatNullable(
                        row.import_so_far
                    )}
                </td>

                <td>
                    ${formatNullable(
                        row.export_so_far
                    )}
                </td>
				
				 <td>
                    ${formatNullable(
                        row.closing_units
                    )}
                </td>
				
            `;


            readingsTable.appendChild(tr);

        }
    );

}


/* =====================================================
   DASHBOARD
===================================================== */

function updateDashboard(row) {

    const solar =
        Number(
            row.solar_production
        );


    const consumption =
        row.import_so_far !== null
            ? Number(row.import_so_far)
            : null;


    const gridImport =
        row.grid_import !== null
            ? Number(row.grid_import)
            : null;


    const gridExport =
        row.grid_export !== null
            ? Number(row.grid_export)
            : null;


    /* ---------------------------------------------
       Summary
    --------------------------------------------- */

    setText(
        "solarProduction",
        formatNumber(solar)
    );


    setText(
        "consumption",
        formatNullable(consumption)
    );


    setText(
        "gridImport",
        formatNullable(gridImport)
    );


    setText(
        "gridExport",
        formatNullable(gridExport)
    );


    /* ---------------------------------------------
       Energy Flow
    --------------------------------------------- */

    setText(
        "flowSolar",
        `${formatNumber(solar)} kWh`
    );


    let solarUsedAtHome = null;


    if (gridExport !== null) {

        solarUsedAtHome =
            Math.max(
                0,
                round(
                    solar -
                    gridExport
                )
            );

    }


    setText(
        "flowHome",

        solarUsedAtHome !== null
            ? `${formatNumber(
                solarUsedAtHome
            )} kWh`
            : "-"
    );


    setText(
        "flowExport",

        gridExport !== null
            ? `${formatNumber(
                gridExport
            )} kWh`
            : "-"
    );


    setText(
        "flowConsumption",

        consumption !== null
            ? `${formatNumber(
                consumption
            )} kWh`
            : "-"
    );


    setText(
        "flowImport",

        gridImport !== null
            ? `${formatNumber(
                gridImport
            )} kWh`
            : "-"
    );

}


/* =====================================================
   MONTHLY ANALYSIS
===================================================== */

function updateMonthlyAnalysis(data) {

    updateCurrentMonth(
        data
    );

}

/* =====================================================
   CURRENT MONTH
===================================================== */

function updateCurrentMonth(
    data
) {

    const now =
        new Date();


    const currentYear =
        now.getFullYear();


    const currentMonth =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");


    const currentMonthKey =
        `${currentYear}-${currentMonth}`;


    const rows =
        data.filter(
            row =>
                row.reading_date.startsWith(
                    currentMonthKey
                )
        );


    if (rows.length === 0) {

        clearMonthlyStats();

        return;

    }


    let solar = 0;

    let gridImport =  Number(
                rows[0].import_so_far || 0
            );

    let gridExport = Number(
                rows[0].export_so_far || 0
            );


    rows.forEach(row => {

        solar +=
            Number(
                row.solar_production || 0
            );

    });


    const daysWithConsumption = rows.length;//new Date().getDate()-1;


    const averageSolar =
        rows.length > 0
            ? solar / rows.length
            : 0;


    setText(
        "monthSolar",
        formatNumber(solar)
    );


    setText(
        "monthImport",
        daysWithConsumption > 0
            ? formatNumber(gridImport)
            : "-"
    );


    setText(
        "monthExport",
        daysWithConsumption > 0
            ? formatNumber(gridExport)
            : "-"
    );

	
	 setText(
        "monthAvgImport",
        daysWithConsumption > 0
            ? formatNumber(gridImport/daysWithConsumption)
            : "-"
    );
	
	 setText(
        "monthAvgExport",
        daysWithConsumption > 0
            ? formatNumber(gridExport/daysWithConsumption)
            : "-"
    );

    setText(
        "monthAvgSolar",
        formatNumber(
            averageSolar
        )
    );


    /* ---------------------------------------------
       Forecast
    --------------------------------------------- */

    generateForecast(
        rows
    );

}


/* =====================================================
   FORECAST
===================================================== */

function generateForecast(
    rows
) {

    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        now.getMonth();


    const daysInMonth =
        new Date(
            year,
            month + 1,
            0
        ).getDate();


    const daysRecorded =
        rows.length;


    const daysRemaining =
        Math.max(
            0,
            daysInMonth -
            daysRecorded
        );


    let solar = 0;

    let gridImport = 0;

    let gridExport = 0;


    let validConsumptionDays = daysRecorded;//new Date().getDate()-1;


    rows.forEach(row => {

        solar +=
            Number(
                row.solar_production || 0
            );
			

    });
	
      if (rows.length > 0) {

          
            gridImport =
                Number(
                    rows[0].import_so_far || 0
                );

            gridExport +=
                Number(
                     rows[0].export_so_far || 0
                );


        }



    if (daysRecorded === 0) {

        return;

    }


    /*
       Average daily solar.
    */

    const avgSolar =
        solar /
        daysRecorded;


    /*
       Average daily values where
       meter-difference data exists.
    */

    const avgImport =
        validConsumptionDays > 0
            ? gridImport /
              validConsumptionDays
            : 0;


    const avgExport =
        validConsumptionDays > 0
            ? gridExport /
              validConsumptionDays
            : 0;


    /*
       Project the complete month.
    */

    const forecastSolar =
        avgSolar *
        daysInMonth;


    const forecastImport =
        avgImport *
        daysInMonth;


    const forecastExport =
        avgExport *
        daysInMonth;


	const forecastConsumption =
        forecastImport -
        forecastExport;


    setText(
        "forecastSolar",
        formatNumber(
            forecastSolar
        )
    );


    setText(
        "forecastConsumption",

        validConsumptionDays > 0
            ? formatNumber(
                forecastConsumption
            )
            : "-"
    );


    setText(
        "forecastImport",

        validConsumptionDays > 0
            ? formatNumber(
                forecastImport
            )
            : "-"
    );


    setText(
        "forecastExport",

        validConsumptionDays > 0
            ? formatNumber(
                forecastExport
            )
            : "-"
    );


    const monthName =
        now.toLocaleDateString(
            "en-IN",
            {
                month: "long"
            }
        );

	const estimatedBillInfo = calculateApproxBill(forecastImport, forecastExport)

    setText(
        "forecastDescription",

        `Estimated ${monthName} bill based on ${formatNumber(forecastImport)} import and ${formatNumber(forecastExport)} export is: ₹${formatNumber(estimatedBillInfo.totalEstimatedBill)} [Energy Charges: ${formatNumber(estimatedBillInfo.energyCharge)}, Electricity Duty: ${formatNumber(estimatedBillInfo.electricityDuty)}, Fixed Charge: ${formatNumber(estimatedBillInfo.fixedCharge)}]`
    );

}


/* =====================================================
   Bill Calculation
===================================================== */

function calculateApproxBill(importUnits, exportUnits) {

    importUnits = Number(importUnits) || 0;
    exportUnits = Number(exportUnits) || 0;

    // --------------------------------------------------------
    // Net billable units
    // --------------------------------------------------------

    const netUnits = Math.max(
        0,
        importUnits - exportUnits
    );


    // --------------------------------------------------------
    // Energy Charges - FY 2026-27
    // LV-1.2 Domestic
    // --------------------------------------------------------

    let remaining = netUnits;
    let energyCharge = 0;

    // First 50 units
    const slab1 = Math.min(remaining, 50);

    energyCharge += slab1 * 4.71;
    remaining -= slab1;


    // 51 - 150
    if (remaining > 0) {

        const slab2 = Math.min(
            remaining,
            100
        );

        energyCharge += slab2 * 5.67;
        remaining -= slab2;
    }


    // 151 - 300
    if (remaining > 0) {

        const slab3 = Math.min(
            remaining,
            150
        );

        energyCharge += slab3 * 7.05;
        remaining -= slab3;
    }


    // Above 300
    if (remaining > 0) {

        energyCharge +=
            remaining * 7.24;
    }


    // --------------------------------------------------------
    // Fixed Charge
    //
    // Up to 50 units       = ₹81
    // 51-150 units         = ₹134
    // Above 150 units:
    // every 15 units or part thereof = 0.1 kW
    // Urban = ₹30 per 0.1 kW
    // --------------------------------------------------------

    let fixedCharge = 0;

    if (importUnits <= 50) {

        fixedCharge = 81;

    } else if (importUnits <= 150) {

        fixedCharge = 134;

    } else {

        const fixedChargeUnits =
            Math.ceil(importUnits / 15);

        fixedCharge =
            fixedChargeUnits * 30;
    }


    // --------------------------------------------------------
    // Electricity Duty
    //
    // Up to 100 units = 9%
    // Above 100 units = 12%
    //
    // Applied to energy charges
    // --------------------------------------------------------

    const dutyRate =
        netUnits <= 100
            ? 0.09
            : 0.12;

    const electricityDuty =
        energyCharge * dutyRate;


    // --------------------------------------------------------
    // Total
    // --------------------------------------------------------

    const total =
        energyCharge +
        fixedCharge +
        electricityDuty;


    return {

        energyCharge: round(
            energyCharge
        ),

        fixedCharge: round(
            fixedCharge
        ),

        electricityDuty: round(
            electricityDuty
        ),

        totalEstimatedBill: round(
            total
        )
    };
}


/* =====================================================
   CLEAR MONTHLY STATS
===================================================== */

function clearMonthlyStats() {

    const ids = [

        "monthSolar",
        "monthConsumption",
        "monthImport",
        "monthExport",
        "monthCoverage",
        "monthAvgSolar",
        "forecastSolar",
        "forecastConsumption",
        "forecastImport",
        "forecastExport"

    ];


    ids.forEach(
        id =>
            setText(
                id,
                "--"
            )
    );

}


/* =====================================================
   FORMAT MONTH
===================================================== */

function formatMonthLabel(
    monthKey
) {

    const date =
        new Date(
            `${monthKey}-01T00:00:00`
        );


    return date.toLocaleDateString(
        "en-IN",
        {
            month: "short",
            year: "numeric"
        }
    );

}


/* =====================================================
   MESSAGE
===================================================== */

function showSuccess(
    text
) {

    message.className =
        "mt-3 message-success";

    message.textContent =
        text;

}


function showError(
    text
) {

    message.className =
        "mt-3 message-error";

    message.textContent =
        text;

}


/* =====================================================
   HELPERS
===================================================== */

function setText(
    elementId,
    value
) {

    const element =
        document.getElementById(
            elementId
        );


    if (element) {

        element.textContent =
            value;

    }

}


function round(value) {

    return Math.round(
        value * 100
    ) / 100;

}


function formatNumber(value) {

    if (
        value === null ||
        value === undefined ||
        Number.isNaN(
            Number(value)
        )
    ) {

        return "-";

    }


    return Number(value)
        .toFixed(2);

}


function formatNullable(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return "-";

    }


    return formatNumber(
        value
    );

}


function formatDisplayDate(
    dateString
) {

    if (!dateString) {

        return "-";

    }


    const date =
        new Date(
            `${dateString}T00:00:00`
        );


    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}

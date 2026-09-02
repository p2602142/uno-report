import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";


/* =========================================================
   FIREBASE
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyA_0BTgJcF8Q4HSNEJbOxQH3fMXtFVsMks",
  authDomain: "sale-performance-report.firebaseapp.com",
  projectId: "sale-performance-report",
  storageBucket: "sale-performance-report.firebasestorage.app",
  messagingSenderId: "936685375762",
  appId: "1:936685375762:web:235f96930f74d898d163cb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentSettings = {
  dailyTargetSatang: 2300000,
  monthlyTargetSatang: 50000000
};

let activeDeleteDate = null;
let editingDate = null;

let allSales = [];
let dailyFiltered = [];
let dailyPage = 1;

let trendChart = null;
let mixChart = null;
let targetChart = null;

let reportTrendChart = null;
let reportPieChart = null;


/* =========================================================
   PAYMENT CHANNELS
========================================================= */

const channels = [
  "cash",
  "creditCard",
  "qrPayment",
  "promptPay",
  "trueMoney",
  "bankTransfer",
  "linePay",
  "alipay",
  "lineMan",
  "grab"
];

const channelLabels = {
  cash: "Cash",
  creditCard: "Credit Card",
  qrPayment: "QR Payment",
  promptPay: "PromptPay",
  trueMoney: "TrueMoney",
  bankTransfer: "Bank Transfer",
  linePay: "Line Pay",
  alipay: "Alipay",
  lineMan: "Line Man",
  grab: "Grab"
};


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const toSatang = value =>
  Math.round((parseFloat(value) || 0) * 100);

const toTHB = value =>
  (value || 0) / 100;

const money = value =>
  "฿" +
  toTHB(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

const dateFmt = date => {
  if (!date) return "—";

  const [year, month, day] = date.split("-");

  return `${day}/${month}/${year}`;
};

const daysInMonth = (year, month) =>
  new Date(year, month, 0).getDate();


/* =========================================================
   PAGE NAVIGATION
========================================================= */

function setActivePage(id) {

  document
    .querySelectorAll(".page")
    .forEach(page => {
      page.classList.toggle(
        "hidden",
        page.id !== id
      );
    });

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.page === id
      );
    });


  if (id === "page-dashboard") {
    loadDashboard();
  }

  if (id === "page-daily") {
    loadDailySales();
  }

  if (id === "page-history") {
    loadHistory();
  }

  if (id === "page-reports") {
    loadReports();
  }
}


document
  .querySelectorAll(".nav-btn")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => setActivePage(button.dataset.page)
    );
  });


/* =========================================================
   AUTH
========================================================= */

onAuthStateChanged(auth, async user => {

  if (user) {

    currentUser = user;

    if ($("user-display")) {
      $("user-display").textContent =
        user.email || "Manager";
    }

    if ($("setting-manager-email")) {
      $("setting-manager-email").value =
        user.email || "";
    }

    $("login-section")?.classList.add("hidden");
    $("app-section")?.classList.remove("hidden");

    await loadSettings();

    loadDashboard();

  } else {

    $("login-section")?.classList.remove("hidden");
    $("app-section")?.classList.add("hidden");
  }
});


/* =========================================================
   LOGIN
========================================================= */

$("login-form")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    $("login-error")?.classList.add("hidden");

    if ($("btn-login")) {
      $("btn-login").disabled = true;
    }

    try {

      await signInWithEmailAndPassword(
        auth,
        $("login-email").value,
        $("login-password").value
      );

    } catch (error) {

      if ($("login-error")) {

        $("login-error").textContent =
          "เข้าสู่ระบบไม่สำเร็จ: " +
          error.message;

        $("login-error").classList.remove("hidden");
      }

    } finally {

      if ($("btn-login")) {
        $("btn-login").disabled = false;
      }
    }
  }
);


/* =========================================================
   LOGOUT
========================================================= */

if ($("btn-logout")) {

  $("btn-logout").onclick = () => {
    signOut(auth);
  };

}


/* =========================================================
   SETTINGS
========================================================= */

async function loadSettings() {

  try {

    const snapshot =
      await getDoc(
        doc(db, "settings", "app")
      );

    if (snapshot.exists()) {

      const data = snapshot.data();

      currentSettings.dailyTargetSatang =
        data.dailyTargetSatang ||
        2300000;

      currentSettings.monthlyTargetSatang =
        data.monthlyTargetSatang ||
        50000000;
    }


    if ($("setting-daily-target")) {

      $("setting-daily-target").value =
        toTHB(
          currentSettings.dailyTargetSatang
        );
    }


    if ($("setting-monthly-target")) {

      $("setting-monthly-target").value =
        toTHB(
          currentSettings.monthlyTargetSatang
        );
    }

  } catch (error) {

    console.error(
      "Load settings error:",
      error
    );
  }
}


$("btn-save-settings")?.addEventListener(
  "click",
  async () => {

    currentSettings.dailyTargetSatang =
      toSatang(
        $("setting-daily-target").value
      );

    currentSettings.monthlyTargetSatang =
      toSatang(
        $("setting-monthly-target").value
      );


    try {

      await setDoc(
        doc(db, "settings", "app"),
        {
          ...currentSettings,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.uid
        }
      );

      alert(
        "บันทึก Target เรียบร้อยแล้ว"
      );

      loadDashboard();

    } catch (error) {

      alert(
        "ไม่สามารถบันทึก Settings: " +
        error.message
      );
    }
  }
);


/* =========================================================
   FIRESTORE SALES
========================================================= */

async function getSales(from, to) {

  const snapshot =
    await getDocs(
      query(
        collection(db, "sales"),
        where("date", ">=", from),
        where("date", "<=", to)
      )
    );


  const rows = [];

  snapshot.forEach(document => {

    rows.push({
      ...document.data(),
      _id: document.id
    });

  });


  return rows.sort(
    (a, b) =>
      String(b.date).localeCompare(
        String(a.date)
      )
  );
}


async function getMonthSales() {

  const now = new Date();

  const year = now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  return getSales(
    `${year}-${month}-01`,
    `${year}-${month}-${daysInMonth(
      year,
      now.getMonth() + 1
    )}`
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  try {

    const rows =
      await getMonthSales();

    const now = new Date();

    const today =
      now.toISOString().split("T")[0];

    const year =
      now.getFullYear();

    const month =
      now.getMonth() + 1;

    const total =
      rows.reduce(
        (sum, row) =>
          sum + (row.totalSalesSatang || 0),
        0
      );


    const todayRow =
      rows.find(
        row => row.date === today
      );


    const todaySales =
      todayRow?.totalSalesSatang || 0;


    const recordDays =
      rows.length;


    const dayOfMonth =
      now.getDate();


    const monthDays =
      daysInMonth(
        year,
        month
      );


    const avg =
      recordDays
        ? Math.round(
            total / recordDays
          )
        : 0;


    const projection =
      dayOfMonth
        ? Math.round(
            (total / dayOfMonth) *
            monthDays
          )
        : 0;


    const remaining =
      Math.max(
        0,
        currentSettings.monthlyTargetSatang -
        total
      );


    const best =
      rows
        .slice()
        .sort(
          (a, b) =>
            (b.totalSalesSatang || 0) -
            (a.totalSalesSatang || 0)
        )[0];


    let voids = 0;

    const channelTotals = {};


    rows.forEach(row => {

      voids += row.voidBill || 0;

      channels.forEach(channel => {

        channelTotals[channel] =
          (channelTotals[channel] || 0) +
          (row.payments?.[channel] || 0);

      });

    });


    if ($("dash-period")) {

      $("dash-period").textContent =
        new Intl.DateTimeFormat(
          "th-TH",
          {
            month: "long",
            year: "numeric"
          }
        ).format(now);
    }


    if ($("dash-today-sales")) {
      $("dash-today-sales").textContent =
        money(todaySales);
    }


    if ($("dash-mtd-sales")) {
      $("dash-mtd-sales").textContent =
        money(total);
    }


    if ($("dash-remaining")) {
      $("dash-remaining").textContent =
        money(remaining);
    }


    if ($("dash-avg-day")) {
      $("dash-avg-day").textContent =
        money(avg);
    }


    if ($("dash-record-days")) {
      $("dash-record-days").textContent =
        `${recordDays} recorded days`;
    }


    if ($("dash-projection")) {
      $("dash-projection").textContent =
        money(projection);
    }


    if ($("dash-void-bills")) {
      $("dash-void-bills").textContent =
        voids.toLocaleString();
    }


    if ($("dash-best-day")) {

      $("dash-best-day").textContent =
        best
          ? `Best: ${dateFmt(best.date)} · ${money(best.totalSalesSatang)}`
          : "Best day —";
    }


    const todayAchievement =
      currentSettings.dailyTargetSatang
        ? todaySales /
          currentSettings.dailyTargetSatang *
          100
        : 0;


    const monthAchievement =
      currentSettings.monthlyTargetSatang
        ? total /
          currentSettings.monthlyTargetSatang *
          100
        : 0;


    if ($("dash-today-target")) {

      $("dash-today-target").textContent =
        `${todayAchievement.toFixed(1)}% Target`;
    }


    if ($("dash-mtd-target")) {

      $("dash-mtd-target").textContent =
        `${monthAchievement.toFixed(1)}% Target`;
    }


    if ($("dash-target-actual")) {

      $("dash-target-actual").textContent =
        money(total);
    }


    if ($("dash-target-value")) {

      $("dash-target-value").textContent =
        money(
          currentSettings.monthlyTargetSatang
        );
    }


    if ($("dash-projection-status")) {

      const onTrack =
        projection >=
        currentSettings.monthlyTargetSatang;


      $("dash-projection-status").textContent =
        onTrack
          ? "On track"
          : "Below target";


      $("dash-projection-status").className =
        `pill mt-2 ${
          onTrack
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700"
        }`;
    }


    renderDashboardCharts(
      rows,
      channelTotals,
      total
    );


    renderDashboardAlerts(
      rows,
      todaySales,
      voids,
      projection
    );


    renderRecent(rows);

  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );
  }
}


/* =========================================================
   DASHBOARD CHARTS
========================================================= */

function renderDashboardCharts(
  rows,
  channelsTotal,
  total
) {

  const now = new Date();

  const days =
    daysInMonth(
      now.getFullYear(),
      now.getMonth() + 1
    );


  const labels =
    Array.from(
      { length: days },
      (_, index) =>
        String(index + 1).padStart(2, "0")
    );


  const map =
    Object.fromEntries(
      rows.map(row => [
        row.date,
        toTHB(row.totalSalesSatang)
      ])
    );


  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");


  const data =
    labels.map(day =>
      map[
        `${year}-${month}-${day}`
      ] || 0
    );


  /* Trend */

  trendChart?.destroy();


  if ($("chart-sales-trend")) {

    trendChart =
      new Chart(
        $("chart-sales-trend"),
        {
          type: "line",

          data: {
            labels,

            datasets: [

              {
                label: "Actual",
                data,

                borderColor: "#111827",
                backgroundColor:
                  "rgba(17,24,39,.05)",

                fill: true,
                tension: 0.3,
                pointRadius: 2
              },

              {
                label: "Daily Target",

                data:
                  labels.map(
                    () =>
                      toTHB(
                        currentSettings
                          .dailyTargetSatang
                      )
                  ),

                borderColor: "#94a3b8",

                borderDash: [5, 5],

                pointRadius: 0,

                tension: 0
              }

            ]
          },

          options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

              legend: {
                display: true,
                position: "bottom",

                labels: {
                  font: {
                    size: 10
                  }
                }
              }
            },

            scales: {

              y: {

                beginAtZero: true,

                ticks: {
                  callback: value =>
                    "฿" +
                    Number(value)
                      .toLocaleString()
                }
              }
            }
          }
        }
      );
  }


  /* Target */

  targetChart?.destroy();


  if ($("chart-target")) {

    targetChart =
      new Chart(
        $("chart-target"),
        {
          type: "doughnut",

          data: {

            labels: [
              "Actual",
              "Remaining"
            ],

            datasets: [

              {
                data: [

                  toTHB(total),

                  Math.max(
                    0,
                    toTHB(
                      currentSettings
                        .monthlyTargetSatang -
                      total
                    )
                  )

                ],

                backgroundColor: [
                  "#111827",
                  "#e5e7eb"
                ],

                borderWidth: 0
              }

            ]
          },

          options: {

            cutout: "72%",

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

              legend: {
                position: "bottom",

                labels: {
                  font: {
                    size: 10
                  }
                }
              }
            }
          }
        }
      );
  }


  /* Payment Mix */

  mixChart?.destroy();


  const entries =
    Object.entries(channelsTotal)
      .filter(([, value]) => value > 0);


  if ($("chart-payment-mix")) {

    mixChart =
      new Chart(
        $("chart-payment-mix"),
        {
          type: "doughnut",

          data: {

            labels:
              entries.map(
                ([key]) =>
                  channelLabels[key] || key
              ),

            datasets: [

              {
                data:
                  entries.map(
                    ([, value]) =>
                      toTHB(value)
                  ),

                backgroundColor: [
                  "#111827",
                  "#334155",
                  "#475569",
                  "#64748b",
                  "#0f766e",
                  "#15803d",
                  "#a16207",
                  "#b45309",
                  "#7c3aed",
                  "#be123c"
                ],

                borderWidth: 1
              }

            ]
          },

          options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

              legend: {
                position: "bottom",

                labels: {
                  font: {
                    size: 9
                  },

                  boxWidth: 10
                }
              }
            }
          }
        }
      );
  }


  const sum =
    entries.reduce(
      (total, [, value]) =>
        total + value,
      0
    );


  if ($("dash-payment-summary")) {

    $("dash-payment-summary").innerHTML =

      entries
        .slice()
        .sort(
          (a, b) => b[1] - a[1]
        )
        .slice(0, 5)

        .map(
          ([key, value]) => `
            <div class="flex justify-between text-xs">

              <span class="text-slate-500">
                ${esc(
                  channelLabels[key] || key
                )}
              </span>

              <strong>

                ${money(value)}

                <span class="text-slate-400 font-normal">

                  ${
                    sum
                      ? (
                          value /
                          sum *
                          100
                        ).toFixed(1)
                      : 0
                  }%

                </span>

              </strong>

            </div>
          `
        )
        .join("")

      ||

      `<div class="text-xs text-slate-400">
        ยังไม่มีข้อมูล
      </div>`;
  }
}


/* =========================================================
   DASHBOARD ALERTS
========================================================= */

function renderDashboardAlerts(
  rows,
  today,
  voids,
  projection
) {

  const alerts = [];


  if (today === 0) {

    alerts.push([
      "warning",
      "ยังไม่มีการบันทึกยอดขายของวันนี้"
    ]);
  }


  if (
    today > 0 &&
    today < currentSettings.dailyTargetSatang
  ) {

    alerts.push([
      "warning",
      `ยอดวันนี้ต่ำกว่า Daily Target ${money(
        currentSettings.dailyTargetSatang -
        today
      )}`
    ]);
  }


  if (
    projection <
    currentSettings.monthlyTargetSatang
  ) {

    alerts.push([
      "warning",
      "Projection สิ้นเดือนยังต่ำกว่า Monthly Target"
    ]);
  }


  if (voids > 0) {

    alerts.push([
      "danger",
      `พบ Void Bills สะสม ${voids.toLocaleString()} บิล`
    ]);
  }


  if (!alerts.length) {

    alerts.push([
      "success",
      "ผลการดำเนินงานอยู่ในเกณฑ์ปกติ ไม่มีรายการที่ต้องติดตาม"
    ]);
  }


  if ($("dash-alerts")) {

    $("dash-alerts").innerHTML =

      alerts
        .map(
          ([type, message]) => `

            <div class="flex items-center gap-3 p-3 rounded-xl ${
              type === "danger"
                ? "bg-rose-50 text-rose-700"
                : type === "warning"
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }">

              <div class="flex-1 text-xs font-semibold">
                ${esc(message)}
              </div>

            </div>

          `
        )
        .join("");
  }
}


/* =========================================================
   RECENT SALES
========================================================= */

function renderRecent(rows) {

  if (!$("recent-sales-body")) {
    return;
  }


  const recent =
    rows
      .slice()
      .sort(
        (a, b) =>
          String(b.date)
            .localeCompare(
              String(a.date)
            )
      )
      .slice(0, 5);


  $("recent-sales-body").innerHTML =

    recent
      .map(
        row => `

          <tr>

            <td class="p-3 font-semibold">
              ${dateFmt(row.date)}
            </td>

            <td class="p-3 text-right font-extrabold">
              ${money(row.totalSalesSatang)}
            </td>

            <td class="p-3 text-right">
              ${
                currentSettings.dailyTargetSatang
                  ? (
                      row.totalSalesSatang /
                      currentSettings.dailyTargetSatang *
                      100
                    ).toFixed(1)
                  : 0
              }%
            </td>

            <td class="p-3 text-center">

              <span class="pill ${
                row.totalSalesSatang >=
                currentSettings.dailyTargetSatang
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }">

                ${
                  row.totalSalesSatang >=
                  currentSettings.dailyTargetSatang
                    ? "Above Target"
                    : "Below Target"
                }

              </span>

            </td>

          </tr>

        `
      )
      .join("")

    ||

    `
      <tr>
        <td
          colspan="4"
          class="p-6 text-center text-slate-400"
        >
          ยังไม่มีข้อมูล
        </td>
      </tr>
    `;
}


/* =========================================================
   SALE FORM
========================================================= */

function openSaleForm(
  date = "",
  row = null
) {

  editingDate = row ? date : null;


  if ($("sale-modal-title")) {

    $("sale-modal-title").textContent =
      row
        ? "แก้ไขยอดขายประจำวัน"
        : "บันทึกยอดขายประจำวัน";
  }


  if ($("sale-date")) {

    $("sale-date").value =
      row?.date ||
      date ||
      new Date()
        .toISOString()
        .split("T")[0];
  }


  if ($("sale-total")) {

    $("sale-total").value =
      row
        ? toTHB(row.totalSalesSatang)
        : "";
  }


  channels.forEach(channel => {

    const input =
      $(channel);

    if (!input) return;

    input.value =
      row
        ? toTHB(
            row.payments?.[channel] || 0
          )
        : "";
  });


  if ($("sale-void")) {

    $("sale-void").value =
      row?.voidBill || 0;
  }


  $("modal-sale")?.classList.remove(
    "hidden"
  );
}


function closeSaleForm() {

  $("modal-sale")?.classList.add(
    "hidden"
  );

  editingDate = null;
}


$("btn-open-sale")?.addEventListener(
  "click",
  () => openSaleForm()
);


$("btn-close-sale")?.addEventListener(
  "click",
  closeSaleForm
);


$("btn-cancel-sale")?.addEventListener(
  "click",
  closeSaleForm
);


/* =========================================================
   SAVE DAILY SALE
========================================================= */

$("form-daily-sales")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();


    const date =
      $("sale-date").value;


    const totalSalesSatang =
      toSatang(
        $("sale-total").value
      );


    if (!date) {

      alert(
        "กรุณาเลือกวันที่"
      );

      return;
    }


    if (totalSalesSatang <= 0) {

      alert(
        "กรุณาระบุยอดขาย"
      );

      return;
    }


    const payments = {};


    channels.forEach(channel => {

      payments[channel] =
        toSatang(
          $(channel)?.value || 0
        );

    });


    const paymentTotal =
      Object.values(payments)
        .reduce(
          (sum, value) =>
            sum + value,
          0
        );


    if (
      paymentTotal !==
      totalSalesSatang
    ) {

      alert(
        `ยอด Payment รวม ${money(
          paymentTotal
        )} ไม่ตรงกับ Total Sales ${money(
          totalSalesSatang
        )}`
      );

      return;
    }


    const payload = {

      date,

      totalSalesSatang,

      payments,

      voidBill:
        parseInt(
          $("sale-void")?.value || 0,
          10
        ),

      updatedAt:
        serverTimestamp(),

      updatedBy:
        currentUser?.email ||
        currentUser?.uid ||
        "unknown"
    };


    try {

      const existing =
        await getDoc(
          doc(
            db,
            "sales",
            date
          )
        );


      if (!existing.exists()) {

        payload.createdAt =
          serverTimestamp();

        payload.createdBy =
          currentUser?.email ||
          currentUser?.uid ||
          "unknown";
      }


      await setDoc(
        doc(db, "sales", date),
        payload,
        {
          merge: true
        }
      );


      closeSaleForm();


      alert(
        `บันทึกข้อมูลวันที่ ${dateFmt(
          date
        )} เรียบร้อยแล้ว`
      );


      loadDashboard();
      loadDailySales();
      loadHistory();

    } catch (error) {

      alert(
        "เกิดข้อผิดพลาด: " +
        error.message
      );
    }
  }
);


/* =========================================================
   DAILY SALES
========================================================= */

async function loadDailySales() {

  try {

    allSales =
      await getSales(
        "2000-01-01",
        "2099-12-31"
      );

    applyDailyFilter();

  } catch (error) {

    console.error(
      "Daily sales error:",
      error
    );


    if ($("daily-table-body")) {

      $("daily-table-body").innerHTML = `

        <tr>

          <td
            colspan="15"
            class="p-6 text-center text-rose-500"
          >

            ${esc(error.message)}

          </td>

        </tr>

      `;
    }
  }
}


function applyDailyFilter() {

  const search =
    $("daily-search")
      ?.value
      .toLowerCase()
      .trim() || "";


  const month =
    $("daily-month")
      ?.value || "";


  dailyFiltered =
    allSales.filter(row => {

      const matchMonth =
        !month ||
        String(row.date)
          .startsWith(month);


      const matchSearch =
        !search ||
        String(row.date)
          .includes(search) ||
        String(row.updatedBy || "")
          .toLowerCase()
          .includes(search);


      return (
        matchMonth &&
        matchSearch
      );
    });


  dailyPage = 1;

  renderDailyTable();
}


$("daily-search")?.addEventListener(
  "input",
  applyDailyFilter
);


$("daily-month")?.addEventListener(
  "change",
  applyDailyFilter
);


/* =========================================================
   DAILY TABLE
========================================================= */

function renderDailyTable() {

  const pageSize = 10;


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        dailyFiltered.length /
        pageSize
      )
    );


  dailyPage =
    Math.min(
      dailyPage,
      totalPages
    );


  const rows =
    dailyFiltered.slice(
      (dailyPage - 1) *
        pageSize,

      dailyPage *
        pageSize
    );


  const body =
    $("daily-table-body");


  if (!body) return;


  body.innerHTML =

    rows
      .map(
        row => `

          <tr>

            <td class="p-3 font-bold">
              ${dateFmt(row.date)}
            </td>

            <td class="p-3 text-right font-extrabold">
              ${money(row.totalSalesSatang)}
            </td>

            ${

              channels
                .map(
                  channel => `

                    <td class="p-3 text-right">
                      ${money(
                        row.payments?.[
                          channel
                        ] || 0
                      )}
                    </td>

                  `
                )
                .join("")
            }

            <td
              class="p-3 text-center font-bold ${
                row.voidBill
                  ? "text-rose-600"
                  : ""
              }"
            >
              ${row.voidBill || 0}
            </td>


            <td class="p-3 text-[10px] text-slate-500">
              ${esc(
                row.updatedBy ||
                "N/A"
              )}
            </td>


            <td
              class="p-3 text-center whitespace-nowrap"
            >

              <button
                class="detail-btn text-indigo-600 font-bold mr-2"
                data-date="${row.date}"
              >
                View
              </button>

              <button
                class="edit-btn text-slate-700 font-bold mr-2"
                data-date="${row.date}"
              >
                Edit
              </button>

              <button
                class="delete-btn text-rose-600 font-bold"
                data-date="${row.date}"
              >
                Delete
              </button>

            </td>

          </tr>

        `
      )
      .join("")

    ||

    `

      <tr>

        <td
          colspan="15"
          class="p-8 text-center text-slate-400"
        >
          ไม่พบข้อมูล
        </td>

      </tr>

    `;


  if ($("daily-count")) {

    $("daily-count").textContent =
      `${dailyFiltered.length} records`;
  }


  if ($("daily-page-info")) {

    $("daily-page-info").textContent =
      `Page ${dailyPage} / ${totalPages}`;
  }


  if ($("daily-prev")) {

    $("daily-prev").disabled =
      dailyPage <= 1;
  }


  if ($("daily-next")) {

    $("daily-next").disabled =
      dailyPage >= totalPages;
  }


  body
    .querySelectorAll(".detail-btn")
    .forEach(button => {

      button.onclick = () => {

        const row =
          allSales.find(
            item =>
              item.date ===
              button.dataset.date
          );

        showDetail(row);
      };

    });


  body
    .querySelectorAll(".edit-btn")
    .forEach(button => {

      button.onclick = () => {

        const row =
          allSales.find(
            item =>
              item.date ===
              button.dataset.date
          );

        openSaleForm(
          row.date,
          row
        );
      };

    });


  body
    .querySelectorAll(".delete-btn")
    .forEach(button => {

      button.onclick = () => {

        triggerDeleteModal(
          button.dataset.date
        );

      };

    });
}


/* =========================================================
   PAGINATION
========================================================= */

$("daily-prev")?.addEventListener(
  "click",
  () => {

    dailyPage--;

    renderDailyTable();
  }
);


$("daily-next")?.addEventListener(
  "click",
  () => {

    dailyPage++;

    renderDailyTable();
  }
);


/* =========================================================
   DETAIL MODAL
========================================================= */

function showDetail(row) {

  if (!row) return;


  if ($("detail-title")) {

    $("detail-title").textContent =
      dateFmt(row.date);
  }


  const items = [

    [
      "Total Sales",
      money(row.totalSalesSatang)
    ],

    ...channels.map(
      channel => [
        channelLabels[channel],
        money(
          row.payments?.[
            channel
          ] || 0
        )
      ]
    ),

    [
      "Void Bills",
      (
        row.voidBill || 0
      ).toLocaleString()
    ],

    [
      "Updated By",
      row.updatedBy || "N/A"
    ]

  ];


  if ($("detail-content")) {

    $("detail-content").innerHTML =

      items
        .map(
          ([key, value]) => `

            <div class="bg-slate-50 rounded-xl p-3">

              <div class="text-[10px] text-slate-400">
                ${esc(key)}
              </div>

              <div class="text-sm font-extrabold mt-1">
                ${esc(value)}
              </div>

            </div>

          `
        )
        .join("");
  }


  $("modal-detail")?.classList.remove(
    "hidden"
  );
}


$("btn-close-detail")?.addEventListener(
  "click",
  () => {
    $("modal-detail")?.classList.add(
      "hidden"
    );
  }
);


/* =========================================================
   HISTORY
========================================================= */

async function loadHistory() {

  const tbody =
    $("table-history-body");


  if (!tbody) return;


  tbody.innerHTML = `

    <tr>

      <td
        colspan="5"
        class="p-6 text-center text-slate-400"
      >
        กำลังโหลด...
      </td>

    </tr>

  `;


  try {

    const rows =
      await getSales(
        "2000-01-01",
        "2099-12-31"
      );


    tbody.innerHTML =

      rows
        .map(
          row => `

            <tr>

              <td class="p-3 font-bold">
                ${dateFmt(row.date)}
              </td>

              <td class="p-3 text-right font-extrabold">
                ${money(row.totalSalesSatang)}
              </td>

              <td
                class="p-3 text-center font-bold ${
                  row.voidBill
                    ? "text-rose-600"
                    : ""
                }"
              >
                ${row.voidBill || 0}
              </td>

              <td class="p-3 text-[10px] text-slate-500">
                ${esc(
                  row.updatedBy ||
                  "N/A"
                )}
              </td>

              <td class="p-3 text-center">

                <button
                  class="hist-edit text-indigo-600 font-bold mr-3"
                  data-date="${row.date}"
                >
                  Edit
                </button>

                <button
                  class="hist-delete text-rose-600 font-bold"
                  data-date="${row.date}"
                >
                  Delete
                </button>

              </td>

            </tr>

          `
        )
        .join("")

      ||

      `

        <tr>

          <td
            colspan="5"
            class="p-6 text-center text-slate-400"
          >
            ไม่มีข้อมูล
          </td>

        </tr>

      `;


    tbody
      .querySelectorAll(".hist-edit")
      .forEach(button => {

        button.onclick = () => {

          const row =
            rows.find(
              item =>
                item.date ===
                button.dataset.date
            );

          openSaleForm(
            row.date,
            row
          );
        };

      });


    tbody
      .querySelectorAll(".hist-delete")
      .forEach(button => {

        button.onclick = () => {

          triggerDeleteModal(
            button.dataset.date
          );

        };

      });

  } catch (error) {

    tbody.innerHTML = `

      <tr>

        <td
          colspan="5"
          class="p-6 text-center text-rose-500"
        >
          ${esc(error.message)}
        </td>

      </tr>

    `;
  }
}


/* =========================================================
   DELETE
========================================================= */

function triggerDeleteModal(date) {

  activeDeleteDate = date;


  if ($("delete-date-target")) {

    $("delete-date-target").textContent =
      dateFmt(date);
  }


  $("modal-delete")?.classList.remove(
    "hidden"
  );
}


$("btn-cancel-delete")?.addEventListener(
  "click",
  () => {

    $("modal-delete")?.classList.add(
      "hidden"
    );

    activeDeleteDate = null;
  }
);


$("btn-confirm-delete")?.addEventListener(
  "click",
  async () => {

    if (!activeDeleteDate) {
      return;
    }


    try {

      await deleteDoc(
        doc(
          db,
          "sales",
          activeDeleteDate
        )
      );


      $("modal-delete")?.classList.add(
        "hidden"
      );


      alert(
        `ลบข้อมูลวันที่ ${dateFmt(
          activeDeleteDate
        )} เรียบร้อยแล้ว`
      );


      activeDeleteDate = null;


      loadDashboard();
      loadDailySales();
      loadHistory();

    } catch (error) {

      alert(
        "เกิดข้อผิดพลาด: " +
        error.message
      );
    }
  }
);


/* =========================================================
   REPORT DATE
========================================================= */

function defaultReportDates() {

  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    now.getMonth() + 1;


  if ($("report-from")) {

    $("report-from").value =
      `${year}-${String(month).padStart(
        2,
        "0"
      )}-01`;
  }


  if ($("report-to")) {

    $("report-to").value =
      `${year}-${String(month).padStart(
        2,
        "0"
      )}-${daysInMonth(
        year,
        month
      )}`;
  }
}


/* =========================================================
   REPORT
========================================================= */

async function loadReports() {

  if (
    $("report-from") &&
    !$("report-from").value
  ) {

    defaultReportDates();
  }


  try {

    const from =
      $("report-from").value;

    const to =
      $("report-to").value;


    const rows =
      await getSales(
        from,
        to
      );


    const total =
      rows.reduce(
        (sum, row) =>
          sum +
          (row.totalSalesSatang || 0),
        0
      );


    const voids =
      rows.reduce(
        (sum, row) =>
          sum +
          (row.voidBill || 0),
        0
      );


    const target =
      currentSettings.dailyTargetSatang *
      rows.length;


    const avg =
      rows.length
        ? Math.round(
            total /
            rows.length
          )
        : 0;


    const best =
      rows
        .slice()
        .sort(
          (a, b) =>
            (b.totalSalesSatang || 0) -
            (a.totalSalesSatang || 0)
        )[0];


    const achievement =
      target
        ? total /
          target *
          100
        : 0;


    if ($("report-total-sales")) {

      $("report-total-sales").textContent =
        money(total);
    }


    if ($("report-target")) {

      $("report-target").textContent =
        money(target);
    }


    if ($("report-achievement")) {

      $("report-achievement").textContent =
        achievement.toFixed(1) +
        "%";
    }


    if ($("report-avg")) {

      $("report-avg").textContent =
        money(avg);
    }


    if ($("report-best")) {

      $("report-best").textContent =
        best
          ? `${dateFmt(
              best.date
            )} · ${money(
              best.totalSalesSatang
            )}`
          : "—";
    }


    if ($("report-void")) {

      $("report-void").textContent =
        voids.toLocaleString();
    }


    const channelsTotal = {};


    rows.forEach(row => {

      channels.forEach(channel => {

        channelsTotal[channel] =
          (channelsTotal[channel] || 0) +
          (row.payments?.[
            channel
          ] || 0);

      });

    });


    renderReportCharts(
      rows,
      channelsTotal
    );


    renderRanking(rows);

    renderInsights(
      rows,
      total,
      target,
      voids,
      achievement
    );

  } catch (error) {

    console.error(
      "Reports error:",
      error
    );
  }
}


/* =========================================================
   REPORT BUTTONS
========================================================= */

$("btn-report-refresh")?.addEventListener(
  "click",
  loadReports
);


$("btn-print-report")?.addEventListener(
  "click",
  () => window.print()
);


defaultReportDates();


/* =========================================================
   REPORT CHARTS
========================================================= */

function renderReportCharts(
  rows,
  channelTotals
) {

  const sorted =
    rows
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(
            b.date
          )
      );


  const labels =
    sorted.map(
      row =>
        dateFmt(row.date)
    );


  const actual =
    sorted.map(
      row =>
        toTHB(
          row.totalSalesSatang
        )
    );


  reportTrendChart?.destroy();


  if ($("chart-report-trend")) {

    reportTrendChart =
      new Chart(
        $("chart-report-trend"),
        {
          type: "bar",

          data: {

            labels,

            datasets: [

              {
                label: "Actual",

                data: actual,

                backgroundColor:
                  "#111827",

                borderRadius: 5
              },

              {
                label: "Daily Target",

                data:
                  labels.map(
                    () =>
                      toTHB(
                        currentSettings
                          .dailyTargetSatang
                      )
                  ),

                type: "line",

                borderColor:
                  "#94a3b8",

                pointRadius: 2,

                tension: 0
              }

            ]
          },

          options: {

            responsive: true,

            maintainAspectRatio: false,

            scales: {

              y: {

                beginAtZero: true,

                ticks: {

                  callback: value =>
                    "฿" +
                    Number(value)
                      .toLocaleString()
                }
              }
            },

            plugins: {

              legend: {

                position: "bottom",

                labels: {
                  font: {
                    size: 10
                  }
                }
              }
            }
          }
        }
      );
  }


  /* Payment Pie */

  const entries =
    Object.entries(
      channelTotals
    ).filter(
      ([, value]) =>
        value > 0
    );


  reportPieChart?.destroy();


  if ($("chart-report-pie")) {

    reportPieChart =
      new Chart(
        $("chart-report-pie"),
        {
          type: "doughnut",

          data: {

            labels:
              entries.map(
                ([key]) =>
                  channelLabels[key]
              ),

            datasets: [

              {
                data:
                  entries.map(
                    ([, value]) =>
                      toTHB(value)
                  ),

                backgroundColor: [
                  "#111827",
                  "#334155",
                  "#475569",
                  "#64748b",
                  "#0f766e",
                  "#15803d",
                  "#a16207",
                  "#b45309",
                  "#7c3aed",
                  "#be123c"
                ]
              }

            ]
          },

          options: {

            responsive: true,

            maintainAspectRatio: false,

            plugins: {

              legend: {

                position: "bottom",

                labels: {

                  font: {
                    size: 9
                  },

                  boxWidth: 10
                }
              }
            }
          }
        }
      );
  }


  const sum =
    entries.reduce(
      (total, [, value]) =>
        total + value,
      0
    );


  if ($("report-payment-list")) {

    $("report-payment-list").innerHTML =

      entries
        .sort(
          (a, b) =>
            b[1] - a[1]
        )

        .map(
          ([key, value]) => `

            <div class="flex justify-between text-xs">

              <span class="text-slate-500">
                ${esc(
                  channelLabels[key]
                )}
              </span>

              <strong>

                ${money(value)}

                <span class="text-slate-400 font-normal">

                  ${
                    sum
                      ? (
                          value /
                          sum *
                          100
                        ).toFixed(1)
                      : 0
                  }%

                </span>

              </strong>

            </div>

          `
        )

        .join("")

      ||

      `
        <div class="text-xs text-slate-400">
          ไม่มีข้อมูล
        </div>
      `;
  }
}


/* =========================================================
   REPORT RANKING
========================================================= */

function renderRanking(rows) {

  const sorted =
    rows
      .slice()
      .sort(
        (a, b) =>
          (b.totalSalesSatang || 0) -
          (a.totalSalesSatang || 0)
      );


  if (!$("report-ranking-body")) {
    return;
  }


  $("report-ranking-body").innerHTML =

    sorted
      .map(
        (row, index) => {

          const achievement =
            currentSettings.dailyTargetSatang
              ? row.totalSalesSatang /
                currentSettings.dailyTargetSatang *
                100
              : 0;


          return `

            <tr>

              <td class="p-3 font-extrabold">
                #${index + 1}
              </td>

              <td class="p-3 font-semibold">
                ${dateFmt(row.date)}
              </td>

              <td class="p-3 text-right font-extrabold">
                ${money(
                  row.totalSalesSatang
                )}
              </td>

              <td class="p-3 text-right">
                ${achievement.toFixed(1)}%
              </td>

              <td class="p-3 text-center">

                <span class="pill ${
                  achievement >= 100
                    ? "bg-emerald-50 text-emerald-700"
                    : achievement >= 80
                    ? "bg-amber-50 text-amber-700"
                    : "bg-rose-50 text-rose-700"
                }">

                  ${
                    achievement >= 100
                      ? "Above Target"
                      : achievement >= 80
                      ? "Near Target"
                      : "Below Target"
                  }

                </span>

              </td>

            </tr>

          `;
        }
      )

      .join("")

    ||

    `
      <tr>

        <td
          colspan="5"
          class="p-6 text-center text-slate-400"
        >
          ไม่มีข้อมูล
        </td>

      </tr>
    `;
}


/* =========================================================
   REPORT INSIGHTS
========================================================= */

function renderInsights(
  rows,
  total,
  target,
  voids,
  achievement
) {

  const below =
    rows.filter(
      row =>
        (row.totalSalesSatang || 0) <
        currentSettings.dailyTargetSatang
    ).length;


  const top =
    rows
      .slice()
      .sort(
        (a, b) =>
          (b.totalSalesSatang || 0) -
          (a.totalSalesSatang || 0)
      )[0];


  const insights = [

    `Achievement ของช่วงที่เลือกอยู่ที่ <strong>${achievement.toFixed(
      1
    )}%</strong> เทียบกับ Target ${money(
      target
    )}`,

    `มี <strong>${below}</strong> วันที่ยอดขายต่ำกว่า Daily Target จากทั้งหมด ${rows.length} วันที่บันทึก`,

    `ยอดขายสูงสุดคือ <strong>${
      top
        ? dateFmt(top.date)
        : "—"
    }</strong> จำนวน ${
      top
        ? money(
            top.totalSalesSatang
          )
        : "฿0"
    }`,

    `พบ Void Bills รวม <strong>${voids.toLocaleString()}</strong> บิล`

  ];


  if ($("report-insights")) {

    $("report-insights").innerHTML =

      insights
        .map(
          (text, index) => `

            <div class="flex gap-3 p-3 bg-slate-50 rounded-xl">

              <span
                class="w-6 h-6 rounded-lg bg-white border flex items-center justify-center text-[10px] font-extrabold shrink-0"
              >
                ${index + 1}
              </span>

              <p class="text-xs text-slate-600 leading-relaxed">
                ${text}
              </p>

            </div>

          `
        )
        .join("");
  }
}


/* =========================================================
   DASHBOARD REFRESH
========================================================= */

$("btn-dash-refresh")?.addEventListener(
  "click",
  loadDashboard
);

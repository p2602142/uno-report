import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

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
   FIREBASE CONFIG & INIT
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
const db = getFirestore(app);

/* =========================================================
   STATE MANAGEMENT
========================================================= */

let monthTargets = {};
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
   PAYMENT CHANNELS & LABELS
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
   HELPERS & UTILS
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

async function getMonthlyTargetSatang(monthKey) {
  if (monthTargets[monthKey] !== undefined) {
    return monthTargets[monthKey];
  }
  try {
    const docSnap = await getDoc(doc(db, "targets", monthKey));
    if (docSnap.exists()) {
      monthTargets[monthKey] = docSnap.data().monthlyTargetSatang || 0;
    } else {
      monthTargets[monthKey] = 0;
    }
  } catch (e) {
    console.error("Fetch target error:", e);
    monthTargets[monthKey] = 0;
  }
  return monthTargets[monthKey];
}

/* =========================================================
   PAGE NAVIGATION
========================================================= */

function setActivePage(id) {
  document.querySelectorAll(".page").forEach(page => {
    if (page.id === id) {
      page.classList.remove("hidden");
    } else {
      page.classList.add("hidden");
    }
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    const isActive = button.dataset.page === id;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.classList.remove("text-neutral-500");
      button.classList.add("text-white", "bg-uno-red");
    } else {
      button.classList.remove("text-white", "bg-uno-red");
      button.classList.add("text-neutral-500");
    }
  });

  if (id === "page-dashboard") loadDashboard();
  if (id === "page-daily") loadDailySales();
  if (id === "page-history") loadHistory();
  if (id === "page-reports") loadReports();
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    const pageId = button.dataset.page;
    if (pageId) setActivePage(pageId);
  });
});

/* =========================================================
   FIRESTORE SALES DATA
========================================================= */

async function getSales(from, to) {
  const snapshot = await getDocs(
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

  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

async function getMonthSales() {
  const now = new Date();
  const year = now.getFullYear();
  const monthIdx = now.getMonth();
  const monthStr = String(monthIdx + 1).padStart(2, "0");

  return getSales(
    `${year}-${monthStr}-01`,
    `${year}-${monthStr}-${daysInMonth(year, monthIdx + 1)}`
  );
}

/* =========================================================
   DASHBOARD LOGIC
========================================================= */

async function loadDashboard() {
  try {
    const rows = await getMonthSales();
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const currentMonthKey = `${year}-${String(month).padStart(2, "0")}`;

    const monthlyTargetSatang = await getMonthlyTargetSatang(currentMonthKey);
    const totalDaysInMonth = daysInMonth(year, month);
    const dailyTargetSatang = totalDaysInMonth ? Math.round(monthlyTargetSatang / totalDaysInMonth) : 0;

    const total = rows.reduce((sum, row) => sum + (row.totalSalesSatang || 0), 0);
    const todayRow = rows.find(row => row.date === today);
    const todaySales = todayRow?.totalSalesSatang || 0;
    const recordDays = rows.length;
    const dayOfMonth = now.getDate();

    const avg = recordDays ? Math.round(total / recordDays) : 0;
    const projection = dayOfMonth ? Math.round((total / dayOfMonth) * totalDaysInMonth) : 0;

    const best = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0))[0];

    let voids = 0;
    const channelTotals = {};

    rows.forEach(row => {
      voids += row.voidBill || 0;
      channels.forEach(channel => {
        channelTotals[channel] = (channelTotals[channel] || 0) + (row.payments?.[channel] || 0);
      });
    });

    if ($("dash-period")) $("dash-period").textContent = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(now);
    if ($("dash-today-sales")) $("dash-today-sales").textContent = money(todaySales);
    if ($("dash-mtd-sales")) $("dash-mtd-sales").textContent = money(total);
    if ($("dash-avg-day")) $("dash-avg-day").textContent = money(avg);
    if ($("dash-record-days")) $("dash-record-days").textContent = `${recordDays} recorded days`;
    if ($("dash-projection")) $("dash-projection").textContent = money(projection);
    if ($("dash-void-bills")) $("dash-void-bills").textContent = voids.toLocaleString();

    if ($("dash-best-day")) {
      $("dash-best-day").textContent = best
        ? `Best: ${dateFmt(best.date)} · ${money(best.totalSalesSatang)}`
        : "Best day —";
    }

    const todayAchievement = dailyTargetSatang ? (todaySales / dailyTargetSatang) * 100 : 0;
    const monthAchievement = monthlyTargetSatang ? (total / monthlyTargetSatang) * 100 : 0;

    if ($("dash-today-target")) $("dash-today-target").textContent = `${todayAchievement.toFixed(1)}% Target`;
    if ($("dash-mtd-target")) $("dash-mtd-target").textContent = `${monthAchievement.toFixed(1)}% Target`;
    if ($("dash-target-actual")) $("dash-target-actual").textContent = money(total);
    if ($("dash-target-value")) $("dash-target-value").textContent = money(monthlyTargetSatang);

    if ($("dash-projection-status")) {
      const onTrack = projection >= monthlyTargetSatang;
      $("dash-projection-status").textContent = onTrack ? "On track" : "Below target";
      $("dash-projection-status").className = `pill ${onTrack ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-uno-red"}`;
    }

    renderDashboardCharts(rows, channelTotals, total, monthlyTargetSatang, dailyTargetSatang);
    renderDashboardAlerts(rows, todaySales, voids, projection, monthlyTargetSatang, dailyTargetSatang);
    renderRecent(rows, dailyTargetSatang);
  } catch (error) {
    console.error("Dashboard error:", error);
  }
}

/* =========================================================
   CHARTS & VISUALS (UNO! BRANDED)
========================================================= */

function renderDashboardCharts(rows, channelsTotal, total, monthlyTargetSatang, dailyTargetSatang) {
  const now = new Date();
  const days = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const labels = Array.from({ length: days }, (_, index) => String(index + 1).padStart(2, "0"));
  const map = Object.fromEntries(rows.map(row => [row.date, toTHB(row.totalSalesSatang)]));

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const data = labels.map(day => map[`${year}-${month}-${day}`] || 0);

  trendChart?.destroy();
  if ($("chart-sales-trend")) {
    trendChart = new Chart($("chart-sales-trend"), {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Actual Sales", data, borderColor: "#D93829", backgroundColor: "rgba(217, 56, 41, 0.08)", fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: "#D93829" },
          { label: "Daily Target", data: labels.map(() => toTHB(dailyTargetSatang)), borderColor: "#111111", borderDash: [4, 4], pointRadius: 0, tension: 0 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  targetChart?.destroy();
  if ($("chart-target")) {
    targetChart = new Chart($("chart-target"), {
      type: "doughnut",
      data: {
        labels: ["Actual", "Remaining"],
        datasets: [{
          data: [toTHB(total), Math.max(0, toTHB(monthlyTargetSatang - total))],
          backgroundColor: ["#D93829", "#E5E7EB"],
          borderWidth: 0
        }]
      },
      options: { cutout: "75%", responsive: true, maintainAspectRatio: false }
    });
  }

  mixChart?.destroy();
  const entries = Object.entries(channelsTotal).filter(([, value]) => value > 0);
  if ($("chart-payment-mix")) {
    mixChart = new Chart($("chart-payment-mix"), {
      type: "doughnut",
      data: {
        labels: entries.map(([key]) => channelLabels[key] || key),
        datasets: [{
          data: entries.map(([, value]) => toTHB(value)),
          backgroundColor: ["#D93829", "#111111", "#333333", "#555555", "#777777", "#999999", "#BBBBBB", "#DDDDDD", "#A02010", "#801005"],
          borderWidth: 1
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const sum = entries.reduce((tot, [, val]) => tot + val, 0);
  if ($("dash-payment-summary")) {
    $("dash-payment-summary").innerHTML = entries.sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, value]) => `
      <div class="flex justify-between text-xs">
        <span class="text-neutral-500">${esc(channelLabels[key] || key)}</span>
        <strong>${money(value)} <span class="text-neutral-400 font-normal">${sum ? ((value / sum) * 100).toFixed(1) : 0}%</span></strong>
      </div>
    `).join("") || `<div class="text-xs text-neutral-400">ยังไม่มีข้อมูล</div>`;
  }
}

function renderDashboardAlerts(rows, today, voids, projection, monthlyTargetSatang, dailyTargetSatang) {
  const alerts = [];
  if (today === 0) alerts.push(["warning", "ยังไม่มีการบันทึกยอดขายของวันนี้"]);
  if (today > 0 && today < dailyTargetSatang) alerts.push(["warning", `ยอดวันนี้ต่ำกว่า Daily Target ${money(dailyTargetSatang - today)}`]);
  if (projection < monthlyTargetSatang) alerts.push(["warning", "Projection สิ้นเดือนยังต่ำกว่า Monthly Target"]);
  if (voids > 0) alerts.push(["danger", `พบ Void Bills สะสม ${voids.toLocaleString()} บิล`]);
  if (!alerts.length) alerts.push(["success", "ผลการดำเนินงานอยู่ในเกณฑ์ปกติ"]);

  if ($("dash-alerts")) {
    $("dash-alerts").innerHTML = alerts.map(([type, message]) => `
      <div class="flex items-center gap-3 p-3 rounded-xl ${type === "danger" ? "bg-red-50 text-uno-red border border-red-100" : type === "warning" ? "bg-amber-50 text-amber-800 border border-amber-100" : "bg-emerald-50 text-emerald-800 border border-emerald-100"}">
        <div class="flex-1 text-xs font-semibold">${esc(message)}</div>
      </div>
    `).join("");
  }
}

function renderRecent(rows, dailyTargetSatang) {
  if (!$("recent-sales-body")) return;
  const recent = rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);

  $("recent-sales-body").innerHTML = recent.map(row => `
    <tr>
      <td class="p-2 font-semibold">${dateFmt(row.date)}</td>
      <td class="p-2 text-right font-bold">${money(row.totalSalesSatang)}</td>
      <td class="p-2 text-right">${dailyTargetSatang ? ((row.totalSalesSatang / dailyTargetSatang) * 100).toFixed(1) : 0}%</td>
      <td class="p-2 text-center">
        <span class="pill ${row.totalSalesSatang >= dailyTargetSatang ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-uno-red"}">
          ${row.totalSalesSatang >= dailyTargetSatang ? "Above" : "Below"}
        </span>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="4" class="p-4 text-center text-neutral-400">ยังไม่มีข้อมูล</td></tr>`;
}

/* =========================================================
   SALE MODAL & FORM LOGIC
========================================================= */

function updateFormValidation() {
  const total = parseFloat($("sale-total")?.value || 0);
  let paySum = 0;
  channels.forEach(ch => paySum += parseFloat($(ch)?.value || 0));

  if ($("val-sum")) $("val-sum").textContent = "฿" + paySum.toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const isMatch = Math.abs(total - paySum) < 0.01;
  
  if ($("val-status")) {
    $("val-status").textContent = isMatch ? "Total Sales ตรงกับ Sum Breakdown" : "Total Sales ไม่ตรงกับ Sum Breakdown";
    $("val-status").className = `font-bold ${isMatch ? "text-emerald-600" : "text-uno-red"}`;
  }
}

function openSaleForm(date = "", row = null) {
  editingDate = row ? date : null;
  if ($("sale-modal-title")) $("sale-modal-title").textContent = row ? "แก้ไขยอดขายประจำวัน" : "บันทึกยอดขายประจำวัน";
  if ($("sale-date")) $("sale-date").value = row?.date || date || new Date().toISOString().split("T")[0];
  if ($("sale-total")) $("sale-total").value = row ? toTHB(row.totalSalesSatang) : "";

  channels.forEach(channel => {
    const input = $(channel);
    if (input) input.value = row ? toTHB(row.payments?.[channel] || 0) : "0";
  });

  if ($("sale-void")) $("sale-void").value = row?.voidBill || 0;
  updateFormValidation();
  $("modal-sale")?.classList.remove("hidden");
}

function closeSaleForm() {
  $("modal-sale")?.classList.add("hidden");
  editingDate = null;
}

$("btn-open-sale")?.addEventListener("click", () => openSaleForm());
$("btn-close-sale")?.addEventListener("click", closeSaleForm);
$("btn-cancel-sale")?.addEventListener("click", closeSaleForm);

$("sale-total")?.addEventListener("input", updateFormValidation);
channels.forEach(ch => $(ch)?.addEventListener("input", updateFormValidation));

$("form-daily-sales")?.addEventListener("submit", async event => {
  event.preventDefault();
  const date = $("sale-date").value;
  const totalSalesSatang = toSatang($("sale-total").value);

  if (!date) return alert("กรุณาเลือกวันที่");
  if (totalSalesSatang <= 0) return alert("กรุณาระบุยอดขาย");

  const payments = {};
  channels.forEach(channel => payments[channel] = toSatang($(channel)?.value || 0));
  const paymentTotal = Object.values(payments).reduce((sum, value) => sum + value, 0);

  if (paymentTotal !== totalSalesSatang) {
    return alert(`ยอด Payment รวม ${money(paymentTotal)} ไม่ตรงกับ Total Sales ${money(totalSalesSatang)}`);
  }

  const payload = {
    date,
    totalSalesSatang,
    payments,
    voidBill: parseInt($("sale-void")?.value || 0, 10),
    updatedAt: serverTimestamp(),
    updatedBy: "System"
  };

  try {
    const existing = await getDoc(doc(db, "sales", date));
    if (!existing.exists()) {
      payload.createdAt = serverTimestamp();
      payload.createdBy = "System";
    }

    await setDoc(doc(db, "sales", date), payload, { merge: true });
    closeSaleForm();
    alert(`บันทึกข้อมูลวันที่ ${dateFmt(date)} เรียบร้อยแล้ว`);

    loadDashboard();
    loadDailySales();
    loadHistory();
  } catch (error) {
    alert("เกิดข้อผิดพลาด: " + error.message);
  }
});

/* =========================================================
   DAILY SALES & TARGETS
========================================================= */

async function updateDailyTargetUI() {
  const selectedMonth = $("daily-month")?.value || new Date().toISOString().slice(0, 7);
  if ($("daily-month") && !$("daily-month").value) {
    $("daily-month").value = selectedMonth;
  }

  const [y, m] = selectedMonth.split("-").map(Number);
  const totalDays = daysInMonth(y, m);

  const mTargetSatang = await getMonthlyTargetSatang(selectedMonth);
  const dTargetSatang = totalDays ? Math.round(mTargetSatang / totalDays) : 0;

  if ($("daily-target-month-label")) {
    const dObj = new Date(y, m - 1, 1);
    $("daily-target-month-label").textContent = `เป้าหมายเดือน ${dObj.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}`;
  }

  if ($("daily-monthly-target-input")) {
    $("daily-monthly-target-input").value = toTHB(mTargetSatang);
  }
  if ($("daily-calc-target")) {
    $("daily-calc-target").value = money(dTargetSatang);
  }
}

$("daily-monthly-target-input")?.addEventListener("input", () => {
  const selectedMonth = $("daily-month")?.value || new Date().toISOString().slice(0, 7);
  const [y, m] = selectedMonth.split("-").map(Number);
  const totalDays = daysInMonth(y, m);

  const valSatang = toSatang($("daily-monthly-target-input").value);
  const avgSatang = totalDays ? Math.round(valSatang / totalDays) : 0;

  if ($("daily-calc-target")) $("daily-calc-target").value = money(avgSatang);
});

$("btn-save-monthly-target")?.addEventListener("click", async () => {
  const selectedMonth = $("daily-month")?.value || new Date().toISOString().slice(0, 7);
  const monthlyTargetSatang = toSatang($("daily-monthly-target-input").value);

  try {
    await setDoc(doc(db, "targets", selectedMonth), {
      monthKey: selectedMonth,
      monthlyTargetSatang,
      updatedAt: serverTimestamp(),
      updatedBy: "System"
    });

    monthTargets[selectedMonth] = monthlyTargetSatang;
    alert(`บันทึก Target ประจำเดือน ${selectedMonth} เรียบร้อยแล้ว`);
    loadDashboard();
  } catch (error) {
    alert("ไม่สามารถบันทึก Target: " + error.message);
  }
});

async function loadDailySales() {
  try {
    allSales = await getSales("2000-01-01", "2099-12-31");
    await updateDailyTargetUI();
    applyDailyFilter();
  } catch (error) {
    console.error("Daily sales error:", error);
  }
}

function applyDailyFilter() {
  const search = $("daily-search")?.value.toLowerCase().trim() || "";
  const month = $("daily-month")?.value || "";

  dailyFiltered = allSales.filter(row => {
    const matchMonth = !month || String(row.date).startsWith(month);
    const matchSearch = !search || String(row.date).includes(search) || String(row.updatedBy || "").toLowerCase().includes(search);
    return matchMonth && matchSearch;
  });

  dailyPage = 1;
  renderDailyTable();
}

$("daily-search")?.addEventListener("input", applyDailyFilter);
$("daily-month")?.addEventListener("change", async () => {
  await updateDailyTargetUI();
  applyDailyFilter();
});

function renderDailyTable() {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(dailyFiltered.length / pageSize));
  dailyPage = Math.min(dailyPage, totalPages);

  const rows = dailyFiltered.slice((dailyPage - 1) * pageSize, dailyPage * pageSize);
  const body = $("daily-table-body");
  if (!body) return;

  body.innerHTML = rows.map(row => `
    <tr>
      <td class="p-3 font-bold text-uno-charcoal">${dateFmt(row.date)}</td>
      <td class="p-3 text-right font-extrabold text-uno-red">${money(row.totalSalesSatang)}</td>
      ${channels.map(ch => `<td class="p-3 text-right">${money(row.payments?.[ch] || 0)}</td>`).join("")}
      <td class="p-3 text-center font-bold ${row.voidBill ? "text-uno-red" : ""}">${row.voidBill || 0}</td>
      <td class="p-3 text-[10px] text-neutral-500">${esc(row.updatedBy || "N/A")}</td>
      <td class="p-3 text-center whitespace-nowrap">
        <button class="detail-btn text-uno-charcoal font-bold mr-2 hover:underline" data-date="${row.date}">View</button>
        <button class="edit-btn text-neutral-600 font-bold mr-2 hover:underline" data-date="${row.date}">Edit</button>
        <button class="delete-btn text-uno-red font-bold hover:underline" data-date="${row.date}">Delete</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="15" class="p-8 text-center text-neutral-400">ไม่พบข้อมูล</td></tr>`;

  if ($("daily-count")) $("daily-count").textContent = `${dailyFiltered.length} records`;
  if ($("daily-page-info")) $("daily-page-info").textContent = `Page ${dailyPage} / ${totalPages}`;
  if ($("daily-prev")) $("daily-prev").disabled = dailyPage <= 1;
  if ($("daily-next")) $("daily-next").disabled = dailyPage >= totalPages;

  body.querySelectorAll(".detail-btn").forEach(b => b.onclick = () => showDetail(allSales.find(i => i.date === b.dataset.date)));
  body.querySelectorAll(".edit-btn").forEach(b => b.onclick = () => {
    const row = allSales.find(i => i.date === b.dataset.date);
    openSaleForm(row.date, row);
  });
  body.querySelectorAll(".delete-btn").forEach(b => b.onclick = () => triggerDeleteModal(b.dataset.date));
}

$("daily-prev")?.addEventListener("click", () => { dailyPage--; renderDailyTable(); });
$("daily-next")?.addEventListener("click", () => { dailyPage++; renderDailyTable(); });

/* =========================================================
   DETAIL MODAL
========================================================= */

function showDetail(row) {
  if (!row) return;
  if ($("detail-title")) $("detail-title").textContent = dateFmt(row.date);

  const items = [
    ["Total Sales", money(row.totalSalesSatang)],
    ...channels.map(ch => [channelLabels[ch], money(row.payments?.[ch] || 0)]),
    ["Void Bills", (row.voidBill || 0).toLocaleString()],
    ["Updated By", row.updatedBy || "N/A"]
  ];

  if ($("detail-content")) {
    $("detail-content").innerHTML = items.map(([key, value]) => `
      <div class="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
        <div class="text-[10px] text-neutral-500">${esc(key)}</div>
        <div class="text-sm font-extrabold mt-1 text-uno-charcoal">${esc(value)}</div>
      </div>
    `).join("");
  }
  $("modal-detail")?.classList.remove("hidden");
}

$("btn-close-detail")?.addEventListener("click", () => $("modal-detail")?.classList.add("hidden"));

/* =========================================================
   HISTORY & DELETE
========================================================= */

async function loadHistory() {
  const tbody = $("table-history-body");
  if (!tbody) return;

  try {
    const rows = await getSales("2000-01-01", "2099-12-31");
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td class="p-3.5 font-bold text-uno-charcoal">${dateFmt(row.date)}</td>
        <td class="p-3.5 text-right font-extrabold text-uno-red">${money(row.totalSalesSatang)}</td>
        <td class="p-3.5 text-center font-bold ${row.voidBill ? "text-uno-red" : ""}">${row.voidBill || 0}</td>
        <td class="p-3.5 text-[10px] text-neutral-500">${esc(row.updatedBy || "N/A")}</td>
        <td class="p-3.5 text-center">
          <button class="hist-edit text-uno-charcoal font-bold mr-3 hover:underline" data-date="${row.date}">Edit</button>
          <button class="hist-delete text-uno-red font-bold hover:underline" data-date="${row.date}">Delete</button>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5" class="p-6 text-center text-neutral-400">ไม่มีข้อมูล</td></tr>`;

    tbody.querySelectorAll(".hist-edit").forEach(b => b.onclick = () => {
      const row = rows.find(i => i.date === b.dataset.date);
      openSaleForm(row.date, row);
    });
    tbody.querySelectorAll(".hist-delete").forEach(b => b.onclick = () => triggerDeleteModal(b.dataset.date));
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-uno-red">${esc(error.message)}</td></tr>`;
  }
}

function triggerDeleteModal(date) {
  activeDeleteDate = date;
  if ($("delete-date-target")) $("delete-date-target").textContent = dateFmt(date);
  $("modal-delete")?.classList.remove("hidden");
}

$("btn-cancel-delete")?.addEventListener("click", () => {
  $("modal-delete")?.classList.add("hidden");
  activeDeleteDate = null;
});

$("btn-confirm-delete")?.addEventListener("click", async () => {
  if (!activeDeleteDate) return;
  try {
    await deleteDoc(doc(db, "sales", activeDeleteDate));
    $("modal-delete")?.classList.add("hidden");
    alert(`ลบข้อมูลวันที่ ${dateFmt(activeDeleteDate)} เรียบร้อยแล้ว`);
    activeDeleteDate = null;
    loadDashboard();
    loadDailySales();
    loadHistory();
  } catch (error) {
    alert("เกิดข้อผิดพลาด: " + error.message);
  }
});

/* =========================================================
   REPORTS LOGIC
========================================================= */

function defaultReportDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");

  if ($("report-from")) $("report-from").value = `${year}-${monthStr}-01`;
  if ($("report-to")) $("report-to").value = `${year}-${monthStr}-${daysInMonth(year, month)}`;
}

async function loadReports() {
  if ($("report-from") && !$("report-from").value) defaultReportDates();

  try {
    const from = $("report-from").value;
    const to = $("report-to").value;
    const rows = await getSales(from, to);

    const fromMonth = from.slice(0, 7);
    const mTargetSatang = await getMonthlyTargetSatang(fromMonth);
    const [y, m] = fromMonth.split("-").map(Number);
    const dTargetSatang = daysInMonth(y, m) ? Math.round(mTargetSatang / daysInMonth(y, m)) : 0;

    const total = rows.reduce((sum, row) => sum + (row.totalSalesSatang || 0), 0);
    const voids = rows.reduce((sum, row) => sum + (row.voidBill || 0), 0);
    const target = dTargetSatang * rows.length;
    const avg = rows.length ? Math.round(total / rows.length) : 0;
    const best = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0))[0];
    const achievement = target ? (total / target) * 100 : 0;

    if ($("report-total-sales")) $("report-total-sales").textContent = money(total);
    if ($("report-target")) $("report-target").textContent = money(target);
    if ($("report-achievement")) $("report-achievement").textContent = achievement.toFixed(1) + "%";
    if ($("report-avg")) $("report-avg").textContent = money(avg);
    if ($("report-best")) $("report-best").textContent = best ? `${dateFmt(best.date)} · ${money(best.totalSalesSatang)}` : "—";
    if ($("report-void")) $("report-void").textContent = voids.toLocaleString();

    const channelsTotal = {};
    rows.forEach(row => {
      channels.forEach(ch => channelsTotal[ch] = (channelsTotal[ch] || 0) + (row.payments?.[ch] || 0));
    });

    renderReportCharts(rows, channelsTotal, dTargetSatang);
    renderRanking(rows, dTargetSatang);
    renderInsights(rows, total, target, voids, achievement, dTargetSatang);
  } catch (error) {
    console.error("Reports error:", error);
  }
}

function renderReportCharts(rows, channelTotals, dTargetSatang) {
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const labels = sorted.map(row => dateFmt(row.date));
  const actual = sorted.map(row => toTHB(row.totalSalesSatang));

  reportTrendChart?.destroy();
  if ($("chart-report-trend")) {
    reportTrendChart = new Chart($("chart-report-trend"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Actual", data: actual, backgroundColor: "#D93829", borderRadius: 4 },
          { label: "Daily Target", data: labels.map(() => toTHB(dTargetSatang)), type: "line", borderColor: "#111111", pointRadius: 2, tension: 0 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const entries = Object.entries(channelTotals).filter(([, value]) => value > 0);
  reportPieChart?.destroy();

  if ($("chart-report-pie")) {
    reportPieChart = new Chart($("chart-report-pie"), {
      type: "doughnut",
      data: {
        labels: entries.map(([key]) => channelLabels[key] || key),
        datasets: [{
          data: entries.map(([, value]) => toTHB(value)),
          backgroundColor: ["#D93829", "#111111", "#333333", "#555555", "#777777", "#999999", "#BBBBBB", "#DDDDDD", "#A02010", "#801005"]
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const sum = entries.reduce((tot, [, val]) => tot + val, 0);
  if ($("report-payment-list")) {
    $("report-payment-list").innerHTML = entries.sort((a, b) => b[1] - a[1]).map(([key, value]) => `
      <div class="flex justify-between text-xs">
        <span class="text-neutral-500">${esc(channelLabels[key] || key)}</span>
        <strong>${money(value)} <span class="text-neutral-400 font-normal">${sum ? ((value / sum) * 100).toFixed(1) : 0}%</span></strong>
      </div>
    `).join("") || `<div class="text-xs text-neutral-400">ไม่มีข้อมูล</div>`;
  }
}

function renderRanking(rows, dTargetSatang) {
  const sorted = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0));
  if (!$("report-ranking-body")) return;

  $("report-ranking-body").innerHTML = sorted.map((row, index) => {
    const achievement = dTargetSatang ? (row.totalSalesSatang / dTargetSatang) * 100 : 0;
    return `
      <tr>
        <td class="p-2 font-extrabold text-uno-charcoal">#${index + 1}</td>
        <td class="p-2 font-semibold">${dateFmt(row.date)}</td>
        <td class="p-2 text-right font-extrabold text-uno-red">${money(row.totalSalesSatang)}</td>
        <td class="p-2 text-right">${achievement.toFixed(1)}%</td>
        <td class="p-2 text-center">
          <span class="pill ${achievement >= 100 ? "bg-emerald-50 text-emerald-700" : achievement >= 80 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-uno-red"}">
            ${achievement >= 100 ? "Above Target" : achievement >= 80 ? "Near Target" : "Below Target"}
          </span>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5" class="p-6 text-center text-neutral-400">ไม่มีข้อมูล</td></tr>`;
}

function renderInsights(rows, total, target, voids, achievement, dTargetSatang) {
  const below = rows.filter(row => (row.totalSalesSatang || 0) < dTargetSatang).length;
  const top = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0))[0];

  const insights = [
    `Achievement ของช่วงที่เลือกอยู่ที่ <strong>${achievement.toFixed(1)}%</strong> เทียบกับ Target ${money(target)}`,
    `มี <strong>${below}</strong> วันที่ยอดขายต่ำกว่า Daily Target จากทั้งหมด ${rows.length} วันที่บันทึก`,
    `ยอดขายสูงสุดคือ <strong>${top ? dateFmt(top.date) : "—"}</strong> จำนวน ${top ? money(top.totalSalesSatang) : "฿0.00"}`,
    `พบ Void Bills รวม <strong>${voids.toLocaleString()}</strong> บิล`
  ];

  if ($("report-insights")) {
    $("report-insights").innerHTML = insights.map((text, index) => `
      <div class="flex gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
        <span class="w-6 h-6 rounded-lg bg-uno-red text-white flex items-center justify-center text-[10px] font-extrabold shrink-0">${index + 1}</span>
        <p class="text-xs text-neutral-600 leading-relaxed">${text}</p>
      </div>
    `).join("");
  }
}

$("btn-report-refresh")?.addEventListener("click", loadReports);
$("btn-print-report")?.addEventListener("click", () => window.print());
$("btn-dash-refresh")?.addEventListener("click", loadDashboard);
$("btn-admin-clear-cache")?.addEventListener("click", () => {
  monthTargets = {};
  loadDashboard();
  alert("ทำการรีเฟรชข้อมูลสำเร็จ");
});

// เริ่มต้นโหลดข้อมูล
defaultReportDates();
loadDashboard();
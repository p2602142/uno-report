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
const auth = getAuth(app);
const db = getFirestore(app);

/* =========================================================
   STATE MANAGEMENT
========================================================= */

let currentUser = null;
let monthTargets = {};
let activeDeleteDate = null;
let editingDate = null;

let dailyFiltered = [];
let dailyPage = 1;
const PAGE_SIZE = 10;

let trendChart = null;
let mixChart = null;
let targetChart = null;
let reportTrendChart = null;
let reportPieChart = null;

/* =========================================================
   CONSTANTS & LABELS
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
   HYBRID DATA MAPPER & CONVERTER
   (รองรับทั้งกรณี DB เดิมเก็บเป็น "บาท" หรือ "สตางค์")
========================================================= */

const $ = id => document.getElementById(id);

// แปลงจาก Form Input เป็น Satang เมื่อจะบันทึกลง Database
const inputToSatang = value => Math.round((parseFloat(value) || 0) * 100);

// อ่านค่าจาก DB และแปลงเป็นหน่วย THB Baht แบบปลอดภัย
const parseTHB = value => {
  const num = parseFloat(value) || 0;
  if (num > 1000000) return num / 100; // หากค่าเกินล้าน แสดงว่าเป็น Satang
  return num; // หากค่าน้อยกว่า แสดงว่าเป็น Baht
};

const parseSatang = value => Math.round(parseTHB(value) * 100);

const money = valueInBahtOrSatang => {
  const baht = parseTHB(valueInBahtOrSatang);
  return "฿" + baht.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

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

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

function showLoading(show = true) {
  const loader = $("global-loading");
  if (loader) {
    if (show) loader.classList.remove("hidden");
    else loader.classList.add("hidden");
  }
}

function showToast(message, type = "info") {
  const container = $("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  const bg =
    type === "success"
      ? "bg-emerald-600"
      : type === "error"
      ? "bg-uno-red"
      : "bg-neutral-800";

  toast.className = `${bg} text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg transition-all duration-300 opacity-0 transform translate-y-2 pointer-events-auto flex items-center justify-between gap-2`;
  toast.innerHTML = `<span>${esc(message)}</span><button class="opacity-70 hover:opacity-100 font-bold ml-2">✕</button>`;

  toast.querySelector("button").onclick = () => toast.remove();
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("opacity-0", "translate-y-2");
  }, 10);

  setTimeout(() => {
    toast.classList.add("opacity-0", "translate-y-2");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Normalizer ช่วยแปลง Field Structure เดิมของ DB ให้กลายเป็น Standard Object
function normalizeDocument(raw) {
  const total = raw.totalSalesSatang ?? raw.totalSales ?? raw.total_sales ?? 0;
  const voidBill = raw.voidBill ?? raw.void_bill ?? raw.voidCount ?? 0;
  
  const payments = {};
  channels.forEach(ch => {
    payments[ch] = parseSatang(raw.payments?.[ch] ?? raw[ch] ?? 0);
  });

  return {
    date: raw.date || raw._id,
    totalSalesSatang: parseSatang(total),
    totalSalesBaht: parseTHB(total),
    payments,
    voidBill: parseInt(voidBill, 10) || 0,
    updatedBy: raw.updatedBy || raw.createdBy || "System",
    updatedAt: raw.updatedAt || null
  };
}

async function getMonthlyTargetSatang(monthKey) {
  if (monthTargets[monthKey] !== undefined) {
    return monthTargets[monthKey];
  }
  try {
    const docSnap = await getDoc(doc(db, "targets", monthKey));
    if (docSnap.exists()) {
      const data = docSnap.data();
      const val = data.monthlyTargetSatang ?? data.monthlyTarget ?? data.target ?? 0;
      monthTargets[monthKey] = parseSatang(val);
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
    page.classList.toggle("hidden", page.id !== id);
  });

  document.querySelectorAll(".nav-btn").forEach(button => {
    const isActive = button.dataset.page === id;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.classList.remove("text-neutral-300");
      button.classList.add("text-white", "bg-uno-red");
    } else {
      button.classList.remove("text-white", "bg-uno-red");
      button.classList.add("text-neutral-300");
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
   AUTHENTICATION
========================================================= */

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    if ($("user-display")) $("user-display").textContent = user.email || "Manager";
    if ($("admin-display-email")) $("admin-display-email").textContent = user.email || "Manager";

    $("login-section")?.classList.add("hidden");
    $("app-section")?.classList.remove("hidden");

    loadDashboard();
  } else {
    $("login-section")?.classList.remove("hidden");
    $("app-section")?.classList.add("hidden");
  }
});

$("login-form")?.addEventListener("submit", async event => {
  event.preventDefault();
  $("login-error")?.classList.add("hidden");
  if ($("btn-login")) $("btn-login").disabled = true;

  try {
    showLoading(true);
    await signInWithEmailAndPassword(
      auth,
      $("login-email").value,
      $("login-password").value
    );
    showToast("เข้าสู่ระบบสำเร็จ", "success");
  } catch (error) {
    if ($("login-error")) {
      $("login-error").textContent = "เข้าสู่ระบบไม่สำเร็จ: " + error.message;
      $("login-error").classList.remove("hidden");
    }
    showToast("เข้าสู่ระบบไม่สำเร็จ", "error");
  } finally {
    showLoading(false);
    if ($("btn-login")) $("btn-login").disabled = false;
  }
});

if ($("btn-logout")) {
  $("btn-logout").onclick = async () => {
    await signOut(auth);
    showToast("ออกจากระบบแล้ว", "info");
  };
}

/* =========================================================
   FIRESTORE SALES DATA SERVICES
========================================================= */

async function getSales(from, to) {
  try {
    const snapshot = await getDocs(
      query(
        collection(db, "sales"),
        where("date", ">=", from),
        where("date", "<=", to)
      )
    );

    const rows = [];
    snapshot.forEach(docSnap => {
      rows.push(normalizeDocument({ ...docSnap.data(), _id: docSnap.id }));
    });

    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  } catch (err) {
    console.error("Fetch sales error:", err);
    showToast("ไม่สามารถโหลดข้อมูลยอดขายได้", "error");
    return [];
  }
}

async function getMonthSales(year, month) {
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;
  const monthStr = String(targetMonth).padStart(2, "0");

  return getSales(
    `${targetYear}-${monthStr}-01`,
    `${targetYear}-${monthStr}-${daysInMonth(targetYear, targetMonth)}`
  );
}

/* =========================================================
   DASHBOARD LOGIC
========================================================= */

async function loadDashboard() {
  showLoading(true);
  try {
    const now = new Date();
    const rows = await getMonthSales();
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
  } finally {
    showLoading(false);
  }
}

$("btn-dash-refresh")?.addEventListener("click", () => {
  loadDashboard();
  showToast("อัปเดตข้อมูลแดชบอร์ดแล้ว", "info");
});

/* =========================================================
   CHARTS RENDERING
========================================================= */

function renderDashboardCharts(rows, channelsTotal, total, monthlyTargetSatang, dailyTargetSatang) {
  const now = new Date();
  const days = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const labels = Array.from({ length: days }, (_, index) => String(index + 1).padStart(2, "0"));
  const map = Object.fromEntries(rows.map(row => [row.date, parseTHB(row.totalSalesSatang)]));

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
          { label: "Daily Target", data: labels.map(() => parseTHB(dailyTargetSatang)), borderColor: "#111111", borderDash: [4, 4], pointRadius: 0, tension: 0 }
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
          data: [parseTHB(total), Math.max(0, parseTHB(monthlyTargetSatang - total))],
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
          data: entries.map(([, value]) => parseTHB(value)),
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

function openSaleForm(date = "", rawDoc = null) {
  const row = rawDoc ? normalizeDocument(rawDoc) : null;
  editingDate = row ? date : null;

  if ($("sale-modal-title")) $("sale-modal-title").textContent = row ? "แก้ไขยอดขายประจำวัน" : "บันทึกยอดขายประจำวัน";
  if ($("sale-date")) $("sale-date").value = row?.date || date || new Date().toISOString().split("T")[0];
  if ($("sale-total")) $("sale-total").value = row ? row.totalSalesBaht : "";

  channels.forEach(channel => {
    const input = $(channel);
    if (input) input.value = row ? parseTHB(row.payments?.[channel] || 0) : "0";
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
  const totalSalesSatang = inputToSatang($("sale-total").value);

  if (!date) return showToast("กรุณาเลือกวันที่", "error");
  if (totalSalesSatang <= 0) return showToast("กรุณาระบุยอดขายให้ถูกต้อง", "error");

  const payments = {};
  channels.forEach(channel => payments[channel] = inputToSatang($(channel)?.value || 0));
  const paymentTotal = Object.values(payments).reduce((sum, value) => sum + value, 0);

  if (Math.abs(paymentTotal - totalSalesSatang) > 1) {
    return showToast(`ยอด Breakdown (${money(paymentTotal)}) ไม่ตรงกับ Total Sales (${money(totalSalesSatang)})`, "error");
  }

  const payload = {
    date,
    totalSalesSatang,
    payments,
    voidBill: parseInt($("sale-void")?.value || 0, 10),
    updatedAt: serverTimestamp(),
    updatedBy: currentUser?.email || currentUser?.uid || "unknown"
  };

  try {
    showLoading(true);
    const docRef = doc(db, "sales", date);
    const existing = await getDoc(docRef);

    if (!existing.exists()) {
      payload.createdAt = serverTimestamp();
      payload.createdBy = currentUser?.email || currentUser?.uid || "unknown";
    }

    await setDoc(docRef, payload, { merge: true });
    closeSaleForm();
    showToast(`บันทึกข้อมูลวันที่ ${dateFmt(date)} เรียบร้อยแล้ว`, "success");

    loadDashboard();
    loadDailySales();
    loadHistory();
  } catch (error) {
    showToast("เกิดข้อผิดพลาดในการบันทึก: " + error.message, "error");
  } finally {
    showLoading(false);
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
    $("daily-monthly-target-input").value = parseTHB(mTargetSatang);
  }
  if ($("daily-calc-target")) {
    $("daily-calc-target").value = money(dTargetSatang);
  }
}

$("btn-save-monthly-target")?.addEventListener("click", async () => {
  const selectedMonth = $("daily-month")?.value || new Date().toISOString().slice(0, 7);
  const inputValue = parseFloat($("daily-monthly-target-input")?.value || 0);

  if (isNaN(inputValue) || inputValue < 0) {
    return showToast("กรุณาระบุ Monthly Target ให้ถูกต้อง", "error");
  }

  const monthlyTargetSatang = inputToSatang(inputValue);

  try {
    showLoading(true);
    await setDoc(
      doc(db, "targets", selectedMonth),
      {
        monthlyTargetSatang,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || "unknown"
      },
      { merge: true }
    );

    monthTargets[selectedMonth] = monthlyTargetSatang;
    showToast(`อัปเดตเป้าหมายเดือน ${selectedMonth} สำเร็จ`, "success");

    await updateDailyTargetUI();
    loadDailySales();
    loadDashboard();
  } catch (error) {
    showToast("เกิดข้อผิดพลาดในการตั้ง Target: " + error.message, "error");
  } finally {
    showLoading(false);
  }
});

async function loadDailySales() {
  showLoading(true);
  try {
    await updateDailyTargetUI();
    const selectedMonth = $("daily-month")?.value || new Date().toISOString().slice(0, 7);
    const [y, m] = selectedMonth.split("-").map(Number);

    const rows = await getMonthSales(y, m);
    const search = ($("daily-search")?.value || "").toLowerCase().trim();

    dailyFiltered = rows.filter(row => {
      const matchSearch =
        !search ||
        row.date.includes(search) ||
        (row.updatedBy || "").toLowerCase().includes(search);
      return matchSearch;
    });

    renderDailyTable();
  } catch (err) {
    console.error("Daily sales error:", err);
  } finally {
    showLoading(false);
  }
}

function renderDailyTable() {
  if (!$("daily-table-body")) return;

  const totalPages = Math.ceil(dailyFiltered.length / PAGE_SIZE) || 1;
  if (dailyPage > totalPages) dailyPage = totalPages;
  if (dailyPage < 1) dailyPage = 1;

  const start = (dailyPage - 1) * PAGE_SIZE;
  const pageRows = dailyFiltered.slice(start, start + PAGE_SIZE);

  if ($("daily-count")) $("daily-count").textContent = `${dailyFiltered.length} records`;
  if ($("daily-page-info")) $("daily-page-info").textContent = `Page ${dailyPage} / ${totalPages}`;

  if ($("daily-prev")) $("daily-prev").disabled = dailyPage <= 1;
  if ($("daily-next")) $("daily-next").disabled = dailyPage >= totalPages;

  $("daily-table-body").innerHTML = pageRows.map(row => `
    <tr class="hover:bg-slate-50 border-b border-neutral-100">
      <td class="p-3 font-semibold text-uno-charcoal">${dateFmt(row.date)}</td>
      <td class="p-3 text-right font-bold text-uno-red">${money(row.totalSalesSatang)}</td>
      <td class="p-3 text-right">${money(row.payments?.cash)}</td>
      <td class="p-3 text-right">${money(row.payments?.creditCard)}</td>
      <td class="p-3 text-right">${money(row.payments?.qrPayment)}</td>
      <td class="p-3 text-right">${money(row.payments?.promptPay)}</td>
      <td class="p-3 text-right">${money(row.payments?.trueMoney)}</td>
      <td class="p-3 text-right">${money(row.payments?.bankTransfer)}</td>
      <td class="p-3 text-right">${money(row.payments?.linePay)}</td>
      <td class="p-3 text-right">${money(row.payments?.alipay)}</td>
      <td class="p-3 text-right">${money(row.payments?.lineMan)}</td>
      <td class="p-3 text-right">${money(row.payments?.grab)}</td>
      <td class="p-3 text-center">${row.voidBill || 0}</td>
      <td class="p-3 text-neutral-500">${esc(row.updatedBy || "-")}</td>
      <td class="p-3 text-center space-x-1">
        <button class="btn-edit-row px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold rounded-lg text-[10px]" data-date="${row.date}">Edit</button>
        <button class="btn-delete-row px-2 py-1 bg-red-50 hover:bg-red-100 text-uno-red font-bold rounded-lg text-[10px]" data-date="${row.date}">Delete</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="15" class="p-6 text-center text-neutral-400">ไม่พบข้อมูลบันทึกยอดขาย</td></tr>`;

  // Attach dynamic handlers
  document.querySelectorAll(".btn-edit-row").forEach(btn => {
    btn.onclick = async () => {
      const d = btn.dataset.date;
      const docSnap = await getDoc(doc(db, "sales", d));
      if (docSnap.exists()) openSaleForm(d, docSnap.data());
    };
  });

  document.querySelectorAll(".btn-delete-row").forEach(btn => {
    btn.onclick = () => {
      activeDeleteDate = btn.dataset.date;
      if ($("delete-date-target")) $("delete-date-target").textContent = dateFmt(activeDeleteDate);
      $("modal-delete")?.classList.remove("hidden");
    };
  });
}

$("daily-month")?.addEventListener("change", () => loadDailySales());
$("daily-search")?.addEventListener("input", () => {
  dailyPage = 1;
  loadDailySales();
});

$("daily-prev")?.addEventListener("click", () => {
  if (dailyPage > 1) {
    dailyPage--;
    renderDailyTable();
  }
});

$("daily-next")?.addEventListener("click", () => {
  dailyPage++;
  renderDailyTable();
});

$("btn-cancel-delete")?.addEventListener("click", () => {
  $("modal-delete")?.classList.add("hidden");
  activeDeleteDate = null;
});

$("btn-confirm-delete")?.addEventListener("click", async () => {
  if (!activeDeleteDate) return;
  try {
    showLoading(true);
    await deleteDoc(doc(db, "sales", activeDeleteDate));
    $("modal-delete")?.classList.add("hidden");
    showToast(`ลบข้อมูลวันที่ ${dateFmt(activeDeleteDate)} แล้ว`, "success");
    activeDeleteDate = null;

    loadDailySales();
    loadDashboard();
  } catch (error) {
    showToast("เกิดข้อผิดพลาดในการลบข้อมูล: " + error.message, "error");
  } finally {
    showLoading(false);
  }
});

/* =========================================================
   HISTORY PAGE LOGIC
========================================================= */

async function loadHistory() {
  showLoading(true);
  try {
    const now = new Date();
    const rows = await getMonthSales(now.getFullYear(), now.getMonth() + 1);

    if ($("history-table-body")) {
      $("history-table-body").innerHTML = rows.map(row => {
        const lastUpdated = row.updatedAt?.toDate ? row.updatedAt.toDate().toLocaleString("th-TH") : "—";
        return `
          <tr class="hover:bg-slate-50 border-b border-neutral-100">
            <td class="p-3.5 font-bold text-uno-charcoal">${dateFmt(row.date)}</td>
            <td class="p-3.5 text-right font-bold text-uno-red">${money(row.totalSalesSatang)}</td>
            <td class="p-3.5 text-center">${row.voidBill || 0}</td>
            <td class="p-3.5 text-neutral-600">${esc(row.updatedBy || "-")}</td>
            <td class="p-3.5 text-neutral-400 text-[11px]">${lastUpdated}</td>
          </tr>
        `;
      }).join("") || `<tr><td colspan="5" class="p-6 text-center text-neutral-400">ยังไม่มีประวัติการบันทึก</td></tr>`;
    }
  } catch (err) {
    console.error("History error:", err);
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   REPORTS PAGE LOGIC
========================================================= */

async function loadReports() {
  const now = new Date();
  const year = now.getFullYear();
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");

  const defaultFrom = `${year}-${monthStr}-01`;
  const defaultTo = `${year}-${monthStr}-${daysInMonth(year, now.getMonth() + 1)}`;

  if ($("report-from") && !$("report-from").value) $("report-from").value = defaultFrom;
  if ($("report-to") && !$("report-to").value) $("report-to").value = defaultTo;

  const from = $("report-from").value;
  const to = $("report-to").value;

  showLoading(true);
  try {
    const rows = await getSales(from, to);
    const monthKey = from.slice(0, 7);
    const mTargetSatang = await getMonthlyTargetSatang(monthKey);
    const daysCount = daysInMonth(parseInt(monthKey.split("-")[0]), parseInt(monthKey.split("-")[1]));

    let total = 0;
    let voids = 0;
    const channelTotals = {};

    rows.forEach(row => {
      total += row.totalSalesSatang || 0;
      voids += row.voidBill || 0;
      channels.forEach(ch => {
        channelTotals[ch] = (channelTotals[ch] || 0) + (row.payments?.[ch] || 0);
      });
    });

    // Report Charts Render
    reportTrendChart?.destroy();
    if ($("chart-report-trend")) {
      reportTrendChart = new Chart($("chart-report-trend"), {
        type: "bar",
        data: {
          labels: rows.map(r => dateFmt(r.date)),
          datasets: [{
            label: "Total Sales",
            data: rows.map(r => parseTHB(r.totalSalesSatang)),
            backgroundColor: "#D93829",
            borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    reportPieChart?.destroy();
    const entries = Object.entries(channelTotals).filter(([, val]) => val > 0);
    if ($("chart-report-pie")) {
      reportPieChart = new Chart($("chart-report-pie"), {
        type: "pie",
        data: {
          labels: entries.map(([k]) => channelLabels[k] || k),
          datasets: [{
            data: entries.map(([, v]) => parseTHB(v)),
            backgroundColor: ["#D93829", "#111111", "#333333", "#555555", "#777777", "#999999", "#BBBBBB", "#DDDDDD", "#A02010", "#801005"]
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    if ($("report-insights")) {
      $("report-insights").innerHTML = `
        <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
          <span class="text-neutral-400 block text-[10px] font-bold uppercase">Total Sales Recorded</span>
          <strong class="text-sm font-black text-uno-red">${money(total)}</strong>
        </div>
        <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
          <span class="text-neutral-400 block text-[10px] font-bold uppercase">Average Sales / Day</span>
          <strong class="text-sm font-black text-uno-charcoal">${money(rows.length ? Math.round(total / rows.length) : 0)}</strong>
        </div>
        <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
          <span class="text-neutral-400 block text-[10px] font-bold uppercase">Total Voids Count</span>
          <strong class="text-sm font-black text-uno-red">${voids.toLocaleString()}</strong>
        </div>
        <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
          <span class="text-neutral-400 block text-[10px] font-bold uppercase">Total Recorded Days</span>
          <strong class="text-sm font-black text-uno-charcoal">${rows.length} Days</strong>
        </div>
      `;
    }
  } catch (err) {
    console.error("Reports error:", err);
  } finally {
    showLoading(false);
  }
}

$("btn-report-refresh")?.addEventListener("click", () => loadReports());

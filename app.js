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
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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
const auth = getAuth(app);
let currentUser = null;

function getLoggedInUserIdentifier() {
  if (currentUser) {
    return currentUser.email || currentUser.displayName || currentUser.uid;
  }
  return "UN1021 Staff";
}

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

const channelCategories = {
  cash: "Counter",
  creditCard: "Counter",
  qrPayment: "Counter",
  promptPay: "Counter",
  trueMoney: "Counter",
  bankTransfer: "Counter",
  linePay: "Counter",
  alipay: "Counter",
  lineMan: "Delivery",
  grab: "Delivery"
};

/* =========================================================
   HELPERS & UTILS
========================================================= */

const $ = id => document.getElementById(id);

const toSatang = value =>
  Math.round((parseFloat(value) || 0) * 100);

const toTHB = value =>
  (value || 0) / 100;

// Production standard: 1 decimal place across the entire system
const money = value =>
  "฿" +
  toTHB(value).toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

const num1 = value =>
  (value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
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
   PRODUCTION TOAST NOTIFICATIONS
========================================================= */

function showToast(message, type = "success") {
  const container = $("toast-container");
  if (!container) {
    console.log(`[${type}] ${message}`);
    return;
  }
  const toast = document.createElement("div");
  const borderCol = type === "danger" || type === "error" 
    ? "border-l-4 border-uno-red" 
    : type === "warning"
    ? "border-l-4 border-amber-500"
    : "border-l-4 border-emerald-500";

  toast.className = `toast px-4 py-3 rounded-xl shadow-xl bg-neutral-900 text-white border border-neutral-800 flex items-center justify-between gap-3 text-xs font-medium pointer-events-auto transition-all duration-300 ${borderCol}`;
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full ${type === 'danger' || type === 'error' ? 'bg-uno-red' : type === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'}"></span>
      <span>${esc(message)}</span>
    </div>
    <button class="text-neutral-400 hover:text-white text-sm font-bold ml-2 transition">✕</button>
  `;
  const closeBtn = toast.querySelector("button");
  const removeToast = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    setTimeout(() => toast.remove(), 250);
  };
  closeBtn.onclick = removeToast;
  container.appendChild(toast);
  setTimeout(removeToast, 4000);
}

/* =========================================================
   LIVE CLOCK & SYSTEM MONITOR
========================================================= */

function initLiveClock() {
  const el = $("header-clock");
  if (!el) return;
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  update();
  setInterval(update, 1000);
}

async function getMonthlyTargetSatang(monthKey) {
  if (monthTargets[monthKey] !== undefined) {
    return monthTargets[monthKey];
  }
  if (!auth.currentUser) {
    return 0;
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
   CENTRAL BUSINESS LOGIC: TARGET, STATUS & PAYMENT-MIX
========================================================= */

/**
 * Central Daily Target Calculation: unified formula across all 3 components.
 */
function calculateDailyTargetFromMonthly(monthlyTargetSatang, monthKeyOrDate) {
  if (!monthlyTargetSatang || !monthKeyOrDate) return 0;
  const ym = String(monthKeyOrDate).slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return 0;
  const dim = daysInMonth(y, m);
  return dim ? Math.round(monthlyTargetSatang / dim) : 0;
}

/**
 * Unified Daily Target Resolver: fetches from cache/Firestore or calculates directly.
 */
async function getDailyTargetSatang(monthKeyOrDate, explicitMonthlyTargetSatang = null) {
  if (!monthKeyOrDate) return 0;
  const ym = String(monthKeyOrDate).slice(0, 7);
  let mTarget = explicitMonthlyTargetSatang;
  if (mTarget === null || mTarget === undefined) {
    mTarget = await getMonthlyTargetSatang(ym);
  }
  return calculateDailyTargetFromMonthly(mTarget, ym);
}

/**
 * Central Achievement Status Function: 3-tier system used identically in Dashboard, Store Report, and Daily Sales.
 * - Above Target: >= 100%
 * - Near Target:  80% - 99.9%
 * - Below Target: < 80%
 */
function getAchievementStatus(salesSatang, targetSatang) {
  const target = Math.max(0, targetSatang || 0);
  const sales = Math.max(0, salesSatang || 0);
  const rate = target > 0 ? (sales / target) * 100 : (sales > 0 ? 100 : 0);

  if (rate >= 100) {
    return {
      rate,
      status: "above",
      label: "Above Target",
      shortLabel: "Above",
      pillClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      textClass: "text-emerald-600"
    };
  }
  if (rate >= 80) {
    return {
      rate,
      status: "near",
      label: "Near Target",
      shortLabel: "Near",
      pillClass: "bg-amber-50 text-amber-800 border border-amber-200",
      textClass: "text-amber-600"
    };
  }
  return {
    rate,
    status: "below",
    label: "Below Target",
    shortLabel: "Below",
    pillClass: "bg-red-50 text-uno-red border border-red-200",
    textClass: "text-uno-red"
  };
}

/**
 * Unified Payment-Mix Summary Logic: shared standard calculation across Dashboard & Store Report.
 */
function calculatePaymentMixSummary(rowsOrTotals, explicitTotalSales = null) {
  const channelTotals = {};
  channels.forEach(ch => { channelTotals[ch] = 0; });

  if (Array.isArray(rowsOrTotals)) {
    rowsOrTotals.forEach(row => {
      channels.forEach(ch => {
        channelTotals[ch] += (row.payments?.[ch] || 0);
      });
    });
  } else if (rowsOrTotals && typeof rowsOrTotals === "object") {
    channels.forEach(ch => {
      channelTotals[ch] = rowsOrTotals[ch] || 0;
    });
  }

  const entries = Object.entries(channelTotals).filter(([, val]) => val > 0);
  const totalFromChannels = Object.values(channelTotals).reduce((sum, val) => sum + val, 0);
  const totalSales = explicitTotalSales !== null ? explicitTotalSales : totalFromChannels;

  const inStoreTotal = (channelTotals.cash || 0) +
    (channelTotals.creditCard || 0) +
    (channelTotals.qrPayment || 0) +
    (channelTotals.promptPay || 0) +
    (channelTotals.trueMoney || 0) +
    (channelTotals.bankTransfer || 0) +
    (channelTotals.linePay || 0) +
    (channelTotals.alipay || 0);

  const grabSatang = channelTotals.grab || 0;
  const lineManSatang = channelTotals.lineMan || 0;
  const deliveryTotal = grabSatang + lineManSatang;
  const deliveryGpSatang = Math.round(deliveryTotal * 0.30);
  const netDeliverySatang = deliveryTotal - deliveryGpSatang;

  const cashTotal = channelTotals.cash || 0;
  const cashlessTotal = totalSales - cashTotal;

  const inStoreShare = totalSales > 0 ? (inStoreTotal / totalSales) * 100 : 0;
  const deliveryShare = totalSales > 0 ? (deliveryTotal / totalSales) * 100 : 0;
  const cashlessShare = totalSales > 0 ? (cashlessTotal / totalSales) * 100 : 0;
  const cashShare = totalSales > 0 ? (cashTotal / totalSales) * 100 : 0;

  const rankedChannels = entries
    .map(([key, value]) => ({
      id: key,
      key,
      name: channelLabels[key] || key,
      category: channelCategories[key] || "Counter",
      amount: value,
      share: totalFromChannels > 0 ? (value / totalFromChannels) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    channelTotals,
    totalSales,
    totalFromChannels,
    inStoreTotal,
    inStoreShare,
    deliveryTotal,
    deliveryShare,
    grabSatang,
    lineManSatang,
    deliveryGpSatang,
    netDeliverySatang,
    cashTotal,
    cashShare,
    cashlessTotal,
    cashlessShare,
    rankedChannels,
    entries
  };
}

/**
 * Central Payment-Mix HTML Renderer.
 */
function renderPaymentMixHTML(rankedChannels, totalAmount, maxItems = null, isBordered = false) {
  const items = maxItems ? rankedChannels.slice(0, maxItems) : rankedChannels;
  if (!items.length) {
    return `<div class="text-xs text-neutral-400 py-2 text-center">ไม่มีข้อมูลยอดขาย</div>`;
  }
  return items.map(item => `
    <div class="flex justify-between items-center text-xs ${isBordered ? "py-1 border-b border-neutral-50 last:border-0" : "py-0.5"}">
      <span class="text-neutral-500">${esc(item.name)}</span>
      <strong class="text-uno-charcoal">${money(item.amount)} <span class="text-neutral-400 font-normal ml-1">(${totalAmount ? ((item.amount / totalAmount) * 100).toFixed(1) : 0}%)</span></strong>
    </div>
  `).join("");
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
      button.classList.remove("text-neutral-300");
      button.classList.add("text-white", "bg-uno-red");
    } else {
      button.classList.remove("text-white", "bg-uno-red");
      button.classList.add("text-neutral-300");
    }
  });

  if (!auth.currentUser) {
    return;
  }

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
   ERROR STATE HANDLERS
========================================================= */

function isAuthPermissionError(error) {
  const msg = error?.message || String(error || "");
  const code = error?.code || "";
  return (
    code === "permission-denied" ||
    msg.includes("Missing or insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

function showDashboardError(error) {
  const banner = $("dash-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-uno-red">
        <div class="flex items-center gap-2.5">
          <svg class="w-5 h-5 shrink-0 text-uno-red" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <div>
            <div class="text-xs font-bold">${isAuthErr ? "จำเป็นต้องเข้าสู่ระบบ (Authentication Required)" : "ไม่สามารถดึงข้อมูลแดชบอร์ดจาก Firestore ได้"}</div>
            <div class="text-[11px] text-red-700 mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อเข้าถึงและจัดการข้อมูลยอดขายสาขา UN1021-CNV" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-dash" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h7a3 3 0 013 3v1"></path></svg>
            <span>เข้าสู่ระบบ (Sign In)</span>
          </button>
        ` : `
          <button id="btn-retry-dash" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>ลองใหม่อีกครั้ง (Retry)</span>
          </button>
        `}
      </div>
    `;
    banner.classList.remove("hidden");
    $("btn-retry-dash")?.addEventListener("click", () => {
      banner.classList.add("hidden");
      loadDashboard();
    });
    $("btn-login-prompt-dash")?.addEventListener("click", () => {
      $("auth-modal")?.classList.remove("hidden");
    });
  }
  showToast(isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อเข้าใช้งานแดชบอร์ด" : "โหลดข้อมูล Dashboard ล้มเหลว: " + (error?.message || error), "danger");
}

function showDailyError(error) {
  const banner = $("daily-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-uno-red">
        <div class="flex items-center gap-2.5">
          <svg class="w-5 h-5 shrink-0 text-uno-red" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <div>
            <div class="text-xs font-bold">${isAuthErr ? "จำเป็นต้องเข้าสู่ระบบ (Authentication Required)" : "ไม่สามารถดึงข้อมูลยอดขายประจำวันได้"}</div>
            <div class="text-[11px] text-red-700 mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อบันทึกและแก้ไขยอดขายสาขา" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-daily" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
            <span>เข้าสู่ระบบ (Sign In)</span>
          </button>
        ` : `
          <button id="btn-retry-daily" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>ลองใหม่อีกครั้ง (Retry)</span>
          </button>
        `}
      </div>
    `;
    banner.classList.remove("hidden");
    $("btn-retry-daily")?.addEventListener("click", () => {
      banner.classList.add("hidden");
      loadDailySales();
    });
    $("btn-login-prompt-daily")?.addEventListener("click", () => {
      $("auth-modal")?.classList.remove("hidden");
    });
  }
  const body = $("daily-table-body");
  if (body) {
    body.innerHTML = `<tr><td colspan="16" class="p-8 text-center text-uno-red font-bold">⚠️ ${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูข้อมูลยอดขาย" : "ไม่สามารถโหลดข้อมูลได้: " + esc(error?.message || "ระบบขัดข้อง")}</td></tr>`;
  }
  showToast(isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูยอดขายประจำวัน" : "โหลดยอดขายรายวันล้มเหลว: " + (error?.message || error), "danger");
}

function showHistoryError(error) {
  const banner = $("history-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-uno-red">
        <div class="flex items-center gap-2.5">
          <svg class="w-5 h-5 shrink-0 text-uno-red" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <div>
            <div class="text-xs font-bold">${isAuthErr ? "จำเป็นต้องเข้าสู่ระบบ (Authentication Required)" : "ไม่สามารถดึงประวัติยอดขายได้"}</div>
            <div class="text-[11px] text-red-700 mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูประวัติยอดขายสาขา" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-hist" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h7a3 3 0 013 3v1"></path></svg>
            <span>เข้าสู่ระบบ (Sign In)</span>
          </button>
        ` : `
          <button id="btn-retry-history" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>ลองใหม่อีกครั้ง (Retry)</span>
          </button>
        `}
      </div>
    `;
    banner.classList.remove("hidden");
    $("btn-retry-history")?.addEventListener("click", () => {
      banner.classList.add("hidden");
      loadHistory();
    });
    $("btn-login-prompt-hist")?.addEventListener("click", () => {
      $("auth-modal")?.classList.remove("hidden");
    });
  }
  const body = $("table-history-body");
  if (body) {
    body.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-uno-red font-bold">⚠️ ${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูประวัติ Audit Log" : "ไม่สามารถโหลดข้อมูลได้: " + esc(error?.message || "ระบบขัดข้อง")}</td></tr>`;
  }
  showToast(isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูประวัติยอดขาย" : "โหลดประวัติยอดขายล้มเหลว: " + (error?.message || error), "danger");
}

function showReportError(error) {
  const banner = $("report-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-uno-red">
        <div class="flex items-center gap-2.5">
          <svg class="w-5 h-5 shrink-0 text-uno-red" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          <div>
            <div class="text-xs font-bold">${isAuthErr ? "จำเป็นต้องเข้าสู่ระบบ (Authentication Required)" : "ไม่สามารถดึงข้อมูลรายงานสาขาได้"}</div>
            <div class="text-[11px] text-red-700 mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อสร้างและดูรายงานสาขา" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-report" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
            <span>เข้าสู่ระบบ (Sign In)</span>
          </button>
        ` : `
          <button id="btn-retry-report" class="px-3.5 py-1.5 bg-uno-red hover:bg-red-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            <span>ลองใหม่อีกครั้ง (Retry)</span>
          </button>
        `}
      </div>
    `;
    banner.classList.remove("hidden");
    $("btn-retry-report")?.addEventListener("click", () => {
      banner.classList.add("hidden");
      loadReports();
    });
    $("btn-login-prompt-report")?.addEventListener("click", () => {
      $("auth-modal")?.classList.remove("hidden");
    });
  }
  showToast(isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูรายงานสาขา" : "โหลดรายงานล้มเหลว: " + (error?.message || error), "danger");
}

/* =========================================================
   DASHBOARD LOGIC
========================================================= */

async function loadDashboard() {
  if (!auth.currentUser) {
    return;
  }
  const errBanner = $("dash-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  try {
    const rows = await getMonthSales();
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const currentMonthKey = `${year}-${String(month).padStart(2, "0")}`;

    const monthlyTargetSatang = await getMonthlyTargetSatang(currentMonthKey);
    const totalDaysInMonth = daysInMonth(year, month);
    const dailyTargetSatang = await getDailyTargetSatang(currentMonthKey, monthlyTargetSatang);

    const total = rows.reduce((sum, row) => sum + (row.totalSalesSatang || 0), 0);
    const todayRow = rows.find(row => row.date === today);
    const todaySales = todayRow?.totalSalesSatang || 0;
    const recordDays = rows.length;
    const dayOfMonth = now.getDate();

    const avg = recordDays ? Math.round(total / recordDays) : 0;
    const projection = dayOfMonth ? Math.round((total / dayOfMonth) * totalDaysInMonth) : 0;

    const best = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0))[0];

    const voids = rows.reduce((sum, row) => sum + (row.voidBill || 0), 0);
    const voidAmountSatang = rows.reduce((sum, row) => sum + (row.voidAmountSatang || 0), 0);
    const payMix = calculatePaymentMixSummary(rows, total);

    if ($("dash-period")) $("dash-period").textContent = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(now);
    if ($("dash-today-sales")) $("dash-today-sales").textContent = money(todaySales);
    if ($("dash-mtd-sales")) $("dash-mtd-sales").textContent = money(total);
    if ($("dash-avg-day")) $("dash-avg-day").textContent = money(avg);
    if ($("dash-record-days")) $("dash-record-days").textContent = `${recordDays} recorded days`;
    if ($("dash-projection")) $("dash-projection").textContent = money(projection);
    if ($("dash-void-bills")) $("dash-void-bills").textContent = voids.toLocaleString();
    if ($("dash-void-amount")) $("dash-void-amount").textContent = money(voidAmountSatang);

    if ($("dash-best-day")) {
      $("dash-best-day").textContent = best
        ? `Best: ${dateFmt(best.date)} · ${money(best.totalSalesSatang)}`
        : "Best day —";
    }

    const todayAchObj = getAchievementStatus(todaySales, dailyTargetSatang);
    const monthAchObj = getAchievementStatus(total, monthlyTargetSatang);

    if ($("dash-today-target")) $("dash-today-target").textContent = `${todayAchObj.rate.toFixed(1)}% Target (${todayAchObj.label})`;
    if ($("dash-mtd-target")) $("dash-mtd-target").textContent = `${monthAchObj.rate.toFixed(1)}% Target (${monthAchObj.label})`;
    if ($("dash-target-actual")) $("dash-target-actual").textContent = money(total);
    if ($("dash-target-value")) $("dash-target-value").textContent = money(monthlyTargetSatang);

    if ($("dash-projection-status")) {
      const onTrack = projection >= monthlyTargetSatang;
      $("dash-projection-status").textContent = onTrack ? "On track" : "Below target";
      $("dash-projection-status").className = `pill ${onTrack ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-uno-red border border-red-200"}`;
    }

    // Monthly Target Pace Tracker
    const daysLeftInMonth = Math.max(0, totalDaysInMonth - dayOfMonth);
    const remainingTargetSatang = Math.max(0, monthlyTargetSatang - total);
    const paceNeededPerDaySatang = daysLeftInMonth > 0 ? Math.round(remainingTargetSatang / daysLeftInMonth) : 0;

    if ($("dash-pace-days-left")) $("dash-pace-days-left").textContent = `${daysLeftInMonth} วัน`;
    if ($("dash-pace-needed-day")) $("dash-pace-needed-day").textContent = money(paceNeededPerDaySatang);
    if ($("dash-pace-remaining")) $("dash-pace-remaining").textContent = money(remainingTargetSatang);
    if ($("dash-pace-pct")) $("dash-pace-pct").textContent = `${monthAchObj.rate.toFixed(1)}%`;
    if ($("dash-pace-bar")) {
      $("dash-pace-bar").style.width = `${Math.min(100, Math.max(0, monthAchObj.rate))}%`;
    }

    // Delivery GP Estimator
    if ($("dash-gross-delivery")) $("dash-gross-delivery").textContent = money(payMix.deliveryTotal);
    if ($("dash-net-delivery")) $("dash-net-delivery").textContent = money(payMix.netDeliverySatang);
    if ($("dash-gp-fee")) $("dash-gp-fee").textContent = money(payMix.deliveryGpSatang);
    if ($("dash-gp-pct")) $("dash-gp-pct").textContent = `${payMix.deliveryShare.toFixed(1)}% ของยอดขายรวม`;

    renderDashboardCharts(rows, payMix, total, monthlyTargetSatang, dailyTargetSatang);
    renderDashboardAlerts(rows, todaySales, voids, voidAmountSatang, projection, monthlyTargetSatang, dailyTargetSatang);
    renderRecent(rows, dailyTargetSatang);
  } catch (error) {
    console.error("Dashboard error:", error);
    showDashboardError(error);
  }
}

/* =========================================================
   CHARTS & VISUALS
========================================================= */

function renderDashboardCharts(rows, payMix, total, monthlyTargetSatang, dailyTargetSatang) {
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
  const entries = payMix.entries;
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

  if ($("dash-payment-summary")) {
    $("dash-payment-summary").innerHTML = renderPaymentMixHTML(payMix.rankedChannels, payMix.totalFromChannels, 5, false);
  }
}

function renderDashboardAlerts(rows, today, voids, voidAmountSatang, projection, monthlyTargetSatang, dailyTargetSatang) {
  const alerts = [];
  if (today === 0) alerts.push(["warning", "ยังไม่มีการบันทึกยอดขายของวันนี้"]);
  if (today > 0 && today < dailyTargetSatang) alerts.push(["warning", `ยอดวันนี้ต่ำกว่า Daily Target ${money(dailyTargetSatang - today)}`]);
  if (projection < monthlyTargetSatang) alerts.push(["warning", "Projection สิ้นเดือนยังต่ำกว่า Monthly Target"]);
  if (voids > 0) alerts.push(["danger", `พบ Void Bills สะสม ${voids.toLocaleString()} บิล (มูลค่าความเสียหาย ${money(voidAmountSatang)})`]);
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

  $("recent-sales-body").innerHTML = recent.map(row => {
    const ach = getAchievementStatus(row.totalSalesSatang, dailyTargetSatang);
    return `
      <tr>
        <td class="p-2 font-semibold">${dateFmt(row.date)}</td>
        <td class="p-2 text-right font-bold">${money(row.totalSalesSatang)}</td>
        <td class="p-2 text-right font-bold ${ach.textClass}">${ach.rate.toFixed(1)}%</td>
        <td class="p-2 text-center">
          <span class="pill ${ach.pillClass}">
            ${ach.shortLabel}
          </span>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" class="p-4 text-center text-neutral-400">ยังไม่มีข้อมูล</td></tr>`;
}

/* =========================================================
   SALE MODAL & FORM LOGIC
========================================================= */

function updateFormValidation() {
  const totalRaw = parseFloat($("sale-total")?.value || 0);
  const voidRaw = parseInt($("sale-void")?.value || 0, 10);
  const voidAmountRaw = parseFloat($("sale-void-amount")?.value || 0);
  let hasNegative = totalRaw < 0 || voidRaw < 0 || voidAmountRaw < 0;

  let paySum = 0;
  channels.forEach(ch => {
    const val = parseFloat($(ch)?.value || 0);
    if (val < 0) hasNegative = true;
    paySum += Math.max(0, val);
  });

  if ($("val-sum")) $("val-sum").textContent = "฿" + paySum.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const isMatch = Math.abs(totalRaw - paySum) < 0.05 && totalRaw > 0;
  
  if ($("val-status")) {
    if (hasNegative) {
      $("val-status").textContent = "⚠️ ห้ามระบุค่าติดลบในยอดขาย, บิล Void หรือมูลค่า Void";
      $("val-status").className = "font-bold text-uno-red";
    } else if (isMatch) {
      $("val-status").textContent = "Total Sales ตรงกับ Sum Breakdown";
      $("val-status").className = "font-bold text-emerald-600";
    } else {
      $("val-status").textContent = "Total Sales ไม่ตรงกับ Sum Breakdown";
      $("val-status").className = "font-bold text-uno-red";
    }
  }
}

function preventNegativeInput(inputEl) {
  if (!inputEl) return;
  inputEl.addEventListener("keydown", e => {
    if (e.key === "-" || e.key === "e" || e.key === "E") {
      e.preventDefault();
    }
  });
  inputEl.addEventListener("input", () => {
    if (parseFloat(inputEl.value) < 0) {
      inputEl.value = "0";
    }
    updateFormValidation();
  });
}

function openSaleForm(date = "", row = null) {
  editingDate = row ? date : null;
  if ($("sale-modal-title")) $("sale-modal-title").textContent = row ? "แก้ไขยอดขายประจำวัน" : "บันทึกยอดขายประจำวัน";
  if ($("sale-date")) $("sale-date").value = row?.date || date || new Date().toISOString().split("T")[0];
  if ($("sale-total")) $("sale-total").value = row ? toTHB(row.totalSalesSatang).toFixed(1) : "";

  channels.forEach(channel => {
    const input = $(channel);
    if (input) input.value = row ? toTHB(row.payments?.[channel] || 0).toFixed(1) : "0";
  });

  if ($("sale-void")) $("sale-void").value = row?.voidBill || 0;
  if ($("sale-void-amount")) $("sale-void-amount").value = row ? toTHB(row.voidAmountSatang || 0).toFixed(1) : "0";
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

preventNegativeInput($("sale-total"));
preventNegativeInput($("sale-void"));
preventNegativeInput($("sale-void-amount"));
channels.forEach(ch => preventNegativeInput($(ch)));

$("sale-total")?.addEventListener("input", updateFormValidation);
$("sale-void")?.addEventListener("input", updateFormValidation);
$("sale-void-amount")?.addEventListener("input", updateFormValidation);
channels.forEach(ch => $(ch)?.addEventListener("input", updateFormValidation));

// Auto-sum Breakdown to Total Sales
$("btn-auto-sum")?.addEventListener("click", () => {
  let paySum = 0;
  channels.forEach(ch => {
    const val = parseFloat($(ch)?.value || 0);
    paySum += Math.max(0, val);
  });
  if ($("sale-total")) {
    $("sale-total").value = paySum.toFixed(1);
    updateFormValidation();
    showToast(`คำนวณยอดรวมอัตโนมัติ: ฿${paySum.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`);
  }
});

// Clear/Reset Breakdown inputs
$("btn-clear-breakdown")?.addEventListener("click", () => {
  channels.forEach(ch => {
    if ($(ch)) $(ch).value = "0";
  });
  updateFormValidation();
});

$("form-daily-sales")?.addEventListener("submit", async event => {
  event.preventDefault();
  const date = $("sale-date").value;
  const saleTotalVal = parseFloat($("sale-total")?.value || 0);

  if (!date) return showToast("กรุณาเลือกวันที่", "warning");
  if (isNaN(saleTotalVal) || saleTotalVal <= 0) return showToast("กรุณาระบุยอดขาย Total Sales เป็นค่าบวก (มากกว่า 0)", "warning");

  const voidBill = parseInt($("sale-void")?.value || 0, 10);
  if (isNaN(voidBill) || voidBill < 0) {
    return showToast("จำนวนบิล Void ต้องไม่ติดลบ (ตั้งแต่ 0 ขึ้นไป)", "danger");
  }

  const voidAmountVal = parseFloat($("sale-void-amount")?.value || 0);
  if (isNaN(voidAmountVal) || voidAmountVal < 0) {
    return showToast("มูลค่าความเสียหายจากการ Void ต้องไม่ติดลบ (ตั้งแต่ 0 ขึ้นไป)", "danger");
  }
  const voidAmountSatang = toSatang(voidAmountVal);

  const payments = {};
  for (const channel of channels) {
    const val = parseFloat($(channel)?.value || 0);
    if (isNaN(val) || val < 0) {
      return showToast(`ช่องทางชำระเงิน ${channelLabels[channel] || channel} ต้องไม่ติดลบ`, "danger");
    }
    payments[channel] = toSatang(val);
  }

  const totalSalesSatang = toSatang(saleTotalVal);
  const paymentTotal = Object.values(payments).reduce((sum, value) => sum + value, 0);

  if (Math.abs(paymentTotal - totalSalesSatang) > 5) {
    return showToast(`ยอด Payment รวม ${money(paymentTotal)} ไม่ตรงกับ Total Sales ${money(totalSalesSatang)}`, "danger");
  }

  const currentUserIdentifier = getLoggedInUserIdentifier();
  const payload = {
    date,
    totalSalesSatang,
    payments,
    voidBill,
    voidAmountSatang,
    updatedAt: serverTimestamp(),
    updatedBy: currentUserIdentifier
  };

  try {
    const saleDocRef = doc(db, "sales", date);
    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(saleDocRef);
      if (!sfDoc.exists()) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = currentUserIdentifier;
        transaction.set(saleDocRef, payload);
      } else {
        const existingData = sfDoc.data() || {};
        payload.createdAt = existingData.createdAt || serverTimestamp();
        payload.createdBy = existingData.createdBy || currentUserIdentifier;
        transaction.set(saleDocRef, payload, { merge: true });
      }
    });

    closeSaleForm();
    showToast(`บันทึกข้อมูลวันที่ ${dateFmt(date)} เรียบร้อยแล้ว`, "success");

    loadDashboard();
    loadDailySales();
    loadHistory();
  } catch (error) {
    console.error("Save sale transaction error:", error);
    showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + error.message, "danger");
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

  const mTargetSatang = await getMonthlyTargetSatang(selectedMonth);
  const dTargetSatang = await getDailyTargetSatang(selectedMonth, mTargetSatang);

  if ($("daily-target-month-label")) {
    const [y, m] = selectedMonth.split("-").map(Number);
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
  const valSatang = toSatang($("daily-monthly-target-input").value);
  const avgSatang = calculateDailyTargetFromMonthly(valSatang, selectedMonth);

  if ($("daily-calc-target")) $("daily-calc-target").value = money(avgSatang);
});

preventNegativeInput($("daily-monthly-target-input"));

$("btn-save-monthly-target")?.addEventListener("click", async () => {
  const selectedMonth = $("daily-month")?.value || new Date().toISOString().slice(0, 7);
  const rawTarget = parseFloat($("daily-monthly-target-input")?.value || 0);
  if (isNaN(rawTarget) || rawTarget < 0) {
    return showToast("เป้าหมาย Monthly Target ต้องไม่ติดลบ (ตั้งแต่ 0 ขึ้นไป)", "danger");
  }

  const monthlyTargetSatang = toSatang(rawTarget);

  try {
    const targetRef = doc(db, "targets", selectedMonth);
    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(targetRef);
      const payload = {
        monthKey: selectedMonth,
        monthlyTargetSatang,
        updatedAt: serverTimestamp(),
        updatedBy: getLoggedInUserIdentifier()
      };
      if (!sfDoc.exists()) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = getLoggedInUserIdentifier();
        transaction.set(targetRef, payload);
      } else {
        const existing = sfDoc.data() || {};
        payload.createdAt = existing.createdAt || serverTimestamp();
        payload.createdBy = existing.createdBy || getLoggedInUserIdentifier();
        transaction.set(targetRef, payload, { merge: true });
      }
    });

    monthTargets[selectedMonth] = monthlyTargetSatang;
    showToast(`บันทึก Target ประจำเดือน ${selectedMonth} (${money(monthlyTargetSatang)}) เรียบร้อยแล้ว`, "success");
    loadDashboard();
  } catch (error) {
    console.error("Save target transaction error:", error);
    showToast("ไม่สามารถบันทึก Target: " + error.message, "danger");
  }
});

async function loadDailySales() {
  if (!auth.currentUser) {
    return;
  }
  const errBanner = $("daily-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  try {
    allSales = await getSales("2000-01-01", "2099-12-31");
    await updateDailyTargetUI();
    applyDailyFilter();
  } catch (error) {
    console.error("Daily sales error:", error);
    showDailyError(error);
  }
}

let currentDailyStatusFilter = "all";

function applyDailyFilter() {
  const search = $("daily-search")?.value.toLowerCase().trim() || "";
  const month = $("daily-month")?.value || "";

  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const mTarget = monthTargets[targetMonth] || 0;
  const dTarget = calculateDailyTargetFromMonthly(mTarget, targetMonth);

  dailyFiltered = allSales.filter(row => {
    const matchMonth = !month || String(row.date).startsWith(month);
    const matchSearch = !search || String(row.date).includes(search) || String(row.updatedBy || "").toLowerCase().includes(search);

    let matchStatus = true;
    const ach = getAchievementStatus(row.totalSalesSatang || 0, dTarget);
    if (currentDailyStatusFilter === "above") {
      matchStatus = ach.status === "above";
    } else if (currentDailyStatusFilter === "near") {
      matchStatus = ach.status === "near";
    } else if (currentDailyStatusFilter === "below") {
      matchStatus = ach.status === "below";
    } else if (currentDailyStatusFilter === "voids") {
      matchStatus = (row.voidBill || 0) > 0;
    }

    return matchMonth && matchSearch && matchStatus;
  });

  dailyPage = 1;
  renderDailyTable();
}

$("daily-search")?.addEventListener("input", applyDailyFilter);
$("daily-month")?.addEventListener("change", async () => {
  await updateDailyTargetUI();
  applyDailyFilter();
});

// Daily Quick Filter Chips
document.querySelectorAll(".daily-filter-btn, .daily-filter-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".daily-filter-btn, .daily-filter-chip").forEach(c => {
      c.classList.remove("active", "bg-uno-charcoal", "text-white");
      c.classList.add("bg-neutral-100", "text-neutral-700");
    });
    chip.classList.add("active", "bg-uno-charcoal", "text-white");
    chip.classList.remove("bg-neutral-100", "text-neutral-700");
    currentDailyStatusFilter = chip.dataset.filter || "all";
    applyDailyFilter();
  });
});

// Quick Date buttons
$("btn-daily-today")?.addEventListener("click", () => {
  const today = new Date().toISOString().split("T")[0];
  if ($("daily-month")) $("daily-month").value = today.slice(0, 7);
  if ($("daily-search")) $("daily-search").value = today;
  applyDailyFilter();
  showToast(`กรองข้อมูลเฉพาะวันนี้: ${dateFmt(today)}`, "success");
});

$("btn-daily-yesterday")?.addEventListener("click", () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yest = d.toISOString().split("T")[0];
  if ($("daily-month")) $("daily-month").value = yest.slice(0, 7);
  if ($("daily-search")) $("daily-search").value = yest;
  applyDailyFilter();
  showToast(`กรองข้อมูลเฉพาะเมื่อวาน: ${dateFmt(yest)}`, "success");
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
      <td class="p-3 text-right font-bold text-uno-red">${money(row.voidAmountSatang || 0)}</td>
      <td class="p-3 text-[10px] text-neutral-500">${esc(row.updatedBy || "N/A")}</td>
      <td class="p-3 text-center whitespace-nowrap">
        <button class="detail-btn text-uno-charcoal font-bold mr-2 hover:underline" data-date="${row.date}">View</button>
        <button class="edit-btn text-neutral-600 font-bold mr-2 hover:underline" data-date="${row.date}">Edit</button>
        <button class="delete-btn text-uno-red font-bold hover:underline" data-date="${row.date}">Delete</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="16" class="p-8 text-center text-neutral-400">ไม่พบข้อมูล</td></tr>`;

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
    ["Void Amount", money(row.voidAmountSatang || 0)],
    ["Created By", row.createdBy || "N/A"],
    ["Created At", row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString("th-TH") : "N/A"],
    ["Last Updated By", row.updatedBy || "N/A"],
    ["Last Updated At", row.updatedAt?.toDate ? row.updatedAt.toDate().toLocaleString("th-TH") : "N/A"]
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
   HISTORY / AUDIT LOG
========================================================= */

async function loadHistory() {
  if (!auth.currentUser) {
    return;
  }
  const tbody = $("table-history-body");
  if (!tbody) return;

  const errBanner = $("history-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  try {
    const rows = await getSales("2000-01-01", "2099-12-31");
    tbody.innerHTML = rows.map(row => {
      const createdStr = row.createdAt?.toDate ? row.createdAt.toDate().toLocaleString("th-TH") : (row.date ? dateFmt(row.date) : "N/A");
      const updatedStr = row.updatedAt?.toDate ? row.updatedAt.toDate().toLocaleString("th-TH") : "N/A";
      const createdBy = row.createdBy || row.updatedBy || "N/A";
      const updatedBy = row.updatedBy || "N/A";

      return `
        <tr>
          <td class="p-3.5 font-bold text-uno-charcoal">${dateFmt(row.date)}</td>
          <td class="p-3.5 text-right font-extrabold text-uno-red">${money(row.totalSalesSatang)}</td>
          <td class="p-3.5 text-center font-bold ${row.voidBill ? "text-uno-red" : ""}">${row.voidBill || 0}</td>
          <td class="p-3.5 text-right font-bold text-uno-red">${money(row.voidAmountSatang || 0)}</td>
          <td class="p-3.5 text-[11px] text-neutral-600 font-medium">
            <div class="font-bold text-neutral-800">${esc(createdBy)}</div>
            <div class="text-[10px] text-neutral-400">${esc(createdStr)}</div>
          </td>
          <td class="p-3.5 text-[11px] text-neutral-600 font-medium">
            <div class="font-bold text-neutral-800">${esc(updatedBy)}</div>
            <div class="text-[10px] text-neutral-400">${esc(updatedStr)}</div>
          </td>
          <td class="p-3.5 text-center">
            <button class="hist-edit text-uno-charcoal font-bold mr-3 hover:underline" data-date="${row.date}">Edit</button>
            <button class="hist-delete text-uno-red font-bold hover:underline" data-date="${row.date}">Delete</button>
          </td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="7" class="p-6 text-center text-neutral-400">ไม่มีข้อมูล Audit Log</td></tr>`;

    tbody.querySelectorAll(".hist-edit").forEach(b => b.onclick = () => {
      const row = rows.find(i => i.date === b.dataset.date);
      openSaleForm(row.date, row);
    });
    tbody.querySelectorAll(".hist-delete").forEach(b => b.onclick = () => triggerDeleteModal(b.dataset.date));
  } catch (error) {
    console.error("History Audit Log error:", error);
    showHistoryError(error);
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
    showToast(`ลบข้อมูลวันที่ ${dateFmt(activeDeleteDate)} เรียบร้อยแล้ว`, "success");
    activeDeleteDate = null;
    loadDashboard();
    loadDailySales();
    loadHistory();
  } catch (error) {
    showToast("เกิดข้อผิดพลาด: " + error.message, "danger");
  }
});

/* =========================================================
   REPORTS LOGIC
========================================================= */

let currentReportRows = [];
let reportTargetLookup = {};

const dayNamesThai = ["SUN.", "MON", "TUE", "WES", "THU", "FRI", "SAT"];
const getDayName = dateStr => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dayNamesThai[dt.getDay()] || "";
};

function defaultReportDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");

  if ($("report-from")) $("report-from").value = `${year}-${monthStr}-01`;
  if ($("report-to")) $("report-to").value = `${year}-${monthStr}-${daysInMonth(year, month)}`;
}

function applyReportPreset(preset) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const pad = n => String(n).padStart(2, "0");

  let from = "";
  let to = "";

  if (preset === "today") {
    const todayStr = `${year}-${pad(month)}-${pad(now.getDate())}`;
    from = todayStr;
    to = todayStr;
  } else if (preset === "week") {
    const dayOfWeek = now.getDay();
    const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    from = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    to = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
  } else if (preset === "month") {
    from = `${year}-${pad(month)}-01`;
    to = `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
  } else if (preset === "last-month") {
    const lastMonthDate = new Date(year, month - 2, 1);
    const lYear = lastMonthDate.getFullYear();
    const lMonth = lastMonthDate.getMonth() + 1;
    from = `${lYear}-${pad(lMonth)}-01`;
    to = `${lYear}-${pad(lMonth)}-${pad(daysInMonth(lYear, lMonth))}`;
  } else if (preset === "all") {
    from = "2020-01-01";
    to = "2030-12-31";
  }

  if ($("report-from")) $("report-from").value = from;
  if ($("report-to")) $("report-to").value = to;

  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });

  loadReports();
}

async function loadReports() {
  if (!auth.currentUser) {
    return;
  }
  if ($("report-from") && !$("report-from").value) defaultReportDates();

  const errBanner = $("report-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  try {
    const from = $("report-from").value;
    const to = $("report-to").value;
    const rows = await getSales(from, to);
    currentReportRows = rows;

    const uniqueMonths = [...new Set(rows.map(r => r.date.slice(0, 7)))];
    if (from && uniqueMonths.length === 0) {
      uniqueMonths.push(from.slice(0, 7));
    }
    for (const ym of uniqueMonths) {
      if (reportTargetLookup[ym] === undefined) {
        reportTargetLookup[ym] = await getDailyTargetSatang(ym);
      }
    }

    rows.forEach(r => {
      const ym = r.date.slice(0, 7);
      r.dailyTargetSatang = reportTargetLookup[ym] || 0;
    });

    const total = rows.reduce((sum, row) => sum + (row.totalSalesSatang || 0), 0);
    const target = rows.reduce((sum, row) => sum + (row.dailyTargetSatang || 0), 0);
    const voids = rows.reduce((sum, row) => sum + (row.voidBill || 0), 0);
    const voidAmountSatang = rows.reduce((sum, row) => sum + (row.voidAmountSatang || 0), 0);
    const avg = rows.length ? Math.round(total / rows.length) : 0;
    const achievementObj = getAchievementStatus(total, target);
    const achievement = achievementObj.rate;

    const sortedBySales = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0));
    const best = sortedBySales[0];
    const lowest = sortedBySales[sortedBySales.length - 1];

    const hitCount = rows.filter(r => getAchievementStatus(r.totalSalesSatang || 0, r.dailyTargetSatang || 0).status === "above").length;
    const hitRate = rows.length ? ((hitCount / rows.length) * 100).toFixed(1) : "0.0";

    const payMix = calculatePaymentMixSummary(rows, total);

    if ($("report-period-label")) {
      $("report-period-label").textContent = `${dateFmt(from)} – ${dateFmt(to)}`;
    }
    if ($("report-recorded-days")) {
      $("report-recorded-days").textContent = `${rows.length} วันทำการ`;
    }
    if ($("report-store-status")) {
      $("report-store-status").className = `pill ${achievementObj.pillClass} text-[11px] font-extrabold`;
      $("report-store-status").textContent = `${achievementObj.label} (${achievement.toFixed(1)}%)`;
    }
    if ($("report-generated-at")) {
      const now = new Date();
      $("report-generated-at").textContent = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    if ($("report-total-sales")) $("report-total-sales").textContent = money(total);
    if ($("report-target")) $("report-target").textContent = money(target);
    if ($("report-achievement")) {
      $("report-achievement").textContent = achievement.toFixed(1) + "%";
      $("report-achievement").className = `text-xs sm:text-sm font-black truncate block mt-0.5 ${achievementObj.textClass}`;
    }
    if ($("report-avg")) $("report-avg").textContent = money(avg);
    if ($("report-best")) $("report-best").textContent = best ? `${dateFmt(best.date)} (${money(best.totalSalesSatang)})` : "—";
    if ($("report-lowest")) $("report-lowest").textContent = lowest ? `${dateFmt(lowest.date)} (${money(lowest.totalSalesSatang)})` : "—";
    if ($("report-void")) $("report-void").textContent = `${voids.toLocaleString()} บิล (${money(voidAmountSatang)})`;
    if ($("report-hit-rate")) $("report-hit-rate").textContent = `${hitCount}/${rows.length} (${hitRate}%)`;

    if ($("report-instore-sales")) $("report-instore-sales").textContent = money(payMix.inStoreTotal);
    if ($("report-instore-share")) $("report-instore-share").textContent = total ? `${payMix.inStoreShare.toFixed(1)}% ของยอดขายรวม` : "0% ของยอดขายรวม";

    if ($("report-delivery-sales")) $("report-delivery-sales").textContent = money(payMix.deliveryTotal);
    if ($("report-delivery-share")) $("report-delivery-share").textContent = total ? `${payMix.deliveryShare.toFixed(1)}% ของยอดขายรวม` : "0% ของยอดขายรวม";
    if ($("report-grab-val")) $("report-grab-val").textContent = money(payMix.grabSatang);
    if ($("report-lineman-val")) $("report-lineman-val").textContent = money(payMix.lineManSatang);

    if ($("report-cashless-share")) $("report-cashless-share").textContent = `${payMix.cashlessShare.toFixed(1)}%`;
    if ($("report-cashless-sales")) $("report-cashless-sales").textContent = money(payMix.cashlessTotal);
    if ($("report-cash-sales")) $("report-cash-sales").textContent = money(payMix.cashTotal);
    if ($("report-cash-share")) $("report-cash-share").textContent = `${payMix.cashShare.toFixed(1)}%`;

    renderReportCharts(rows, payMix);
    renderRanking(rows);
    renderReportChannelsTable(payMix.rankedChannels, total, rows.length);
    renderInsights(rows, total, target, voids, voidAmountSatang, achievement, hitCount);
    renderReportLedger();
  } catch (error) {
    console.error("Reports error:", error);
    showReportError(error);
  }
}

function renderReportCharts(rows, payMix) {
  const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
  const labels = sorted.map(row => dateFmt(row.date));
  const actual = sorted.map(row => toTHB(row.totalSalesSatang));
  const targets = sorted.map(row => toTHB(row.dailyTargetSatang || 0));

  reportTrendChart?.destroy();
  if ($("chart-report-trend")) {
    reportTrendChart = new Chart($("chart-report-trend"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "ยอดขายจริง (Actual)", data: actual, backgroundColor: "#D93829", borderRadius: 6, maxBarThickness: 32 },
          { label: "เป้าหมายรายวัน (Target)", data: targets, type: "line", borderColor: "#111111", borderWidth: 2, pointRadius: 3, pointBackgroundColor: "#111111", tension: 0.1 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 12, font: { size: 11, family: "Sarabun" } } }
        }
      }
    });
  }

  const entries = payMix.entries;
  reportPieChart?.destroy();

  if ($("chart-report-pie")) {
    reportPieChart = new Chart($("chart-report-pie"), {
      type: "doughnut",
      data: {
        labels: entries.map(([key]) => channelLabels[key] || key),
        datasets: [{
          data: entries.map(([, value]) => toTHB(value)),
          backgroundColor: ["#D93829", "#111111", "#2563EB", "#059669", "#D97706", "#7C3AED", "#DB2777", "#4B5563", "#06B6D4", "#F97316"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  if ($("report-payment-list")) {
    $("report-payment-list").innerHTML = renderPaymentMixHTML(payMix.rankedChannels, payMix.totalFromChannels, null, true);
  }
}

function renderReportChannelsTable(rankedChannels, totalSalesSatang, daysCount) {
  if (!$("report-channels-table-body")) return;

  $("report-channels-table-body").innerHTML = rankedChannels.map((item, index) => {
    const share = totalSalesSatang ? ((item.amount / totalSalesSatang) * 100).toFixed(1) : "0.0";
    const avgPerDay = daysCount ? Math.round(item.amount / daysCount) : 0;
    const isDelivery = item.category === "Delivery";

    return `
      <tr class="hover:bg-neutral-50/70 transition">
        <td class="p-3 text-center font-extrabold text-uno-charcoal">#${index + 1}</td>
        <td class="p-3 font-semibold text-neutral-800">
          ${esc(item.name)}
        </td>
        <td class="p-3">
          <span class="pill ${isDelivery ? "bg-red-50 text-uno-red border border-red-200" : "bg-neutral-100 text-neutral-700"}">
            ${isDelivery ? "Delivery" : "Counter"}
          </span>
        </td>
        <td class="p-3 text-right font-extrabold text-uno-charcoal">${money(item.amount)}</td>
        <td class="p-3 text-right font-bold ${parseFloat(share) > 0 ? "text-neutral-800" : "text-neutral-400"}">
          ${share}%
        </td>
        <td class="p-3 text-right text-neutral-600">${money(avgPerDay)}</td>
      </tr>
    `;
  }).join("");
}

function renderRanking(rows) {
  const sorted = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0));
  if (!$("report-ranking-body")) return;

  $("report-ranking-body").innerHTML = sorted.map((row, index) => {
    const ach = getAchievementStatus(row.totalSalesSatang, row.dailyTargetSatang || 0);
    return `
      <tr class="hover:bg-neutral-50/70 transition">
        <td class="p-2 font-extrabold text-uno-charcoal">#${index + 1}</td>
        <td class="p-2 font-semibold">${dateFmt(row.date)} <span class="text-[10px] text-neutral-400 font-normal">(${getDayName(row.date)})</span></td>
        <td class="p-2 text-right font-extrabold text-uno-red">${money(row.totalSalesSatang)}</td>
        <td class="p-2 text-right font-bold ${ach.textClass}">${ach.rate.toFixed(1)}%</td>
        <td class="p-2 text-center">
          <span class="pill ${ach.pillClass}">
            ${ach.label}
          </span>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="5" class="p-6 text-center text-neutral-400">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>`;
}

function renderInsights(rows, total, target, voids, voidAmountSatang, achievement, hitCount) {
  if (!$("report-insights")) return;
  const top = rows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0))[0];
  const lowest = rows.slice().sort((a, b) => (a.totalSalesSatang || 0) - (b.totalSalesSatang || 0))[0];

  const insights = [
    `ผลการดำเนินงานโดยรวมบรรลุ <strong>${achievement.toFixed(1)}%</strong> ของเป้าหมายสะสม (${money(total)} จากเป้า ${money(target)})`,
    `ทำยอดทะลุเป้าหมายรายวันได้ <strong>${hitCount} วัน</strong> จากทั้งหมด ${rows.length} วันทำการ (${rows.length ? ((hitCount / rows.length) * 100).toFixed(0) : 0}%)`,
    `ยอดขายสูงสุดเกิดขึ้นเมื่อ <strong>${top ? `${dateFmt(top.date)} (${getDayName(top.date)})` : "—"}</strong> ด้วยยอดขาย <strong>${top ? money(top.totalSalesSatang) : "฿0.00"}</strong>`,
    `ยอดขายต่ำสุดประจำรอบคือ <strong>${lowest ? `${dateFmt(lowest.date)} (${getDayName(lowest.date)})` : "—"}</strong> (${lowest ? money(lowest.totalSalesSatang) : "฿0.00"})`,
    `พบรายการยกเลิกบิล (Void Bills) รวมทั้งสิ้น <strong>${voids.toLocaleString()} รายการ</strong> คิดเป็นมูลค่าความเสียหาย <strong>${money(voidAmountSatang)}</strong>`
  ];

  $("report-insights").innerHTML = insights.map((text, index) => `
    <div class="flex gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100">
      <span class="w-6 h-6 rounded-lg bg-uno-red text-white flex items-center justify-center text-[10px] font-extrabold shrink-0 mt-0.5">${index + 1}</span>
      <p class="text-xs text-neutral-600 leading-relaxed">${text}</p>
    </div>
  `).join("");
}

function renderReportLedger() {
  if (!$("report-ledger-tbody")) return;

  const search = ($("report-ledger-search")?.value || "").toLowerCase().trim();
  const sortMode = $("report-ledger-sort")?.value || "date-desc";

  let filtered = currentReportRows.filter(row => {
    if (!search) return true;
    const dateFormatted = dateFmt(row.date).toLowerCase();
    const rawDate = (row.date || "").toLowerCase();
    const updatedBy = (row.updatedBy || "").toLowerCase();
    return dateFormatted.includes(search) || rawDate.includes(search) || updatedBy.includes(search);
  });

  filtered.sort((a, b) => {
    if (sortMode === "date-desc") return b.date.localeCompare(a.date);
    if (sortMode === "date-asc") return a.date.localeCompare(b.date);
    if (sortMode === "sales-desc") return (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0);
    if (sortMode === "sales-asc") return (a.totalSalesSatang || 0) - (b.totalSalesSatang || 0);
    return 0;
  });

  if ($("report-ledger-count")) {
    $("report-ledger-count").textContent = `${filtered.length} วัน`;
  }

  $("report-ledger-tbody").innerHTML = filtered.map(row => {
    const ach = getAchievementStatus(row.totalSalesSatang || 0, row.dailyTargetSatang || 0);

    return `
      <tr class="hover:bg-neutral-50/70 transition">
        <td class="p-3 font-semibold text-neutral-900">${dateFmt(row.date)}</td>
        <td class="p-3 font-medium text-neutral-500">${getDayName(row.date)}</td>
        <td class="p-3 text-right font-black text-uno-red">${money(row.totalSalesSatang)}</td>
        <td class="p-3 text-right">${money(row.payments?.cash || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.creditCard || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.qrPayment || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.promptPay || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.trueMoney || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.bankTransfer || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.linePay || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.alipay || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.lineMan || 0)}</td>
        <td class="p-3 text-right">${money(row.payments?.grab || 0)}</td>
        <td class="p-3 text-center ${row.voidBill ? "font-bold text-uno-red" : "text-neutral-400"}">${row.voidBill || 0}</td>
        <td class="p-3 text-right font-bold text-uno-red">${money(row.voidAmountSatang || 0)}</td>
        <td class="p-3 text-right font-bold ${ach.textClass}">${ach.rate.toFixed(1)}%</td>
        <td class="p-3 text-center">
          <span class="pill ${ach.pillClass}">
            ${ach.shortLabel}
          </span>
        </td>
        <td class="p-3 text-left font-medium text-neutral-500">${esc(row.updatedBy || "-")}</td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="18" class="p-8 text-center text-neutral-400">ไม่พบรายการข้อมูลที่ตรงกับเงื่อนไข</td></tr>`;

  if ($("report-ledger-tfoot")) {
    const sumTotal = filtered.reduce((acc, r) => acc + (r.totalSalesSatang || 0), 0);
    const sumTarget = filtered.reduce((acc, r) => acc + (r.dailyTargetSatang || 0), 0);
    const sumVoids = filtered.reduce((acc, r) => acc + (r.voidBill || 0), 0);
    const sumVoidAmount = filtered.reduce((acc, r) => acc + (r.voidAmountSatang || 0), 0);
    const totalAch = getAchievementStatus(sumTotal, sumTarget);

    const sumChannels = {};
    channels.forEach(ch => {
      sumChannels[ch] = filtered.reduce((acc, r) => acc + (r.payments?.[ch] || 0), 0);
    });

    $("report-ledger-tfoot").innerHTML = `
      <tr>
        <td class="p-3 font-extrabold text-uno-charcoal">รวมทั้งหมด (TOTAL)</td>
        <td class="p-3 text-neutral-500">${filtered.length} วัน</td>
        <td class="p-3 text-right font-black text-uno-red">${money(sumTotal)}</td>
        <td class="p-3 text-right">${money(sumChannels.cash)}</td>
        <td class="p-3 text-right">${money(sumChannels.creditCard)}</td>
        <td class="p-3 text-right">${money(sumChannels.qrPayment)}</td>
        <td class="p-3 text-right">${money(sumChannels.promptPay)}</td>
        <td class="p-3 text-right">${money(sumChannels.trueMoney)}</td>
        <td class="p-3 text-right">${money(sumChannels.bankTransfer)}</td>
        <td class="p-3 text-right">${money(sumChannels.linePay)}</td>
        <td class="p-3 text-right">${money(sumChannels.alipay)}</td>
        <td class="p-3 text-right">${money(sumChannels.lineMan)}</td>
        <td class="p-3 text-right">${money(sumChannels.grab)}</td>
        <td class="p-3 text-center font-bold text-uno-red">${sumVoids.toLocaleString()}</td>
        <td class="p-3 text-right font-extrabold text-uno-red">${money(sumVoidAmount)}</td>
        <td class="p-3 text-right font-black ${totalAch.textClass}">${totalAch.rate.toFixed(1)}%</td>
        <td class="p-3 text-center"><span class="pill ${totalAch.pillClass}">${totalAch.shortLabel}</span></td>
        <td class="p-3 text-left text-neutral-400">—</td>
      </tr>
    `;
  }
}

function exportReportCSV() {
  if (!currentReportRows || currentReportRows.length === 0) {
    showToast("ไม่มีข้อมูลที่จะส่งออกเป็น CSV", "warning");
    return;
  }

  const from = $("report-from")?.value || "";
  const to = $("report-to")?.value || "";

  const headers = [
    "วันที่ (Date)",
    "วัน (Day)",
    "ยอดขายรวม (Total Sales THB)",
    "เงินสด (Cash)",
    "บัตรเครดิต (Credit Card)",
    "QR Payment",
    "PromptPay",
    "TrueMoney",
    "โอนเงิน (Bank Transfer)",
    "Line Pay",
    "Alipay",
    "Line Man",
    "Grab",
    "Void Bills",
    "Void Amount (THB)",
    "เป้าหมายรายวัน (Daily Target THB)",
    "% เทียบเป้าหมาย (% Achievement)",
    "สถานะ (Status)",
    "ผู้บันทึกล่าสุด (Updated By)"
  ];

  const sorted = currentReportRows.slice().sort((a, b) => a.date.localeCompare(b.date));

  const rowsData = sorted.map(r => {
    const ach = getAchievementStatus(r.totalSalesSatang, r.dailyTargetSatang || 0);
    return [
      r.date,
      getDayName(r.date),
      toTHB(r.totalSalesSatang).toFixed(1),
      toTHB(r.payments?.cash || 0).toFixed(1),
      toTHB(r.payments?.creditCard || 0).toFixed(1),
      toTHB(r.payments?.qrPayment || 0).toFixed(1),
      toTHB(r.payments?.promptPay || 0).toFixed(1),
      toTHB(r.payments?.trueMoney || 0).toFixed(1),
      toTHB(r.payments?.bankTransfer || 0).toFixed(1),
      toTHB(r.payments?.linePay || 0).toFixed(1),
      toTHB(r.payments?.alipay || 0).toFixed(1),
      toTHB(r.payments?.lineMan || 0).toFixed(1),
      toTHB(r.payments?.grab || 0).toFixed(1),
      r.voidBill || 0,
      toTHB(r.voidAmountSatang || 0).toFixed(1),
      toTHB(r.dailyTargetSatang || 0).toFixed(1),
      `${ach.rate.toFixed(1)}%`,
      ach.label,
      `"${(r.updatedBy || "").replace(/"/g, '""')}"`
    ].join(",");
  });

  const totalSales = sorted.reduce((sum, r) => sum + (r.totalSalesSatang || 0), 0);
  const totalTarget = sorted.reduce((sum, r) => sum + (r.dailyTargetSatang || 0), 0);
  const totalVoids = sorted.reduce((sum, r) => sum + (r.voidBill || 0), 0);
  const totalVoidAmount = sorted.reduce((sum, r) => sum + (r.voidAmountSatang || 0), 0);
  const totalAch = getAchievementStatus(totalSales, totalTarget);

  const sumChannels = {};
  channels.forEach(ch => {
    sumChannels[ch] = sorted.reduce((sum, r) => sum + (r.payments?.[ch] || 0), 0);
  });

  const summaryRow = [
    "TOTAL",
    `${sorted.length} Days`,
    toTHB(totalSales).toFixed(1),
    toTHB(sumChannels.cash).toFixed(1),
    toTHB(sumChannels.creditCard).toFixed(1),
    toTHB(sumChannels.qrPayment).toFixed(1),
    toTHB(sumChannels.promptPay).toFixed(1),
    toTHB(sumChannels.trueMoney).toFixed(1),
    toTHB(sumChannels.bankTransfer).toFixed(1),
    toTHB(sumChannels.linePay).toFixed(1),
    toTHB(sumChannels.alipay).toFixed(1),
    toTHB(sumChannels.lineMan).toFixed(1),
    toTHB(sumChannels.grab).toFixed(1),
    totalVoids,
    toTHB(totalVoidAmount).toFixed(1),
    toTHB(totalTarget).toFixed(1),
    `${totalAch.rate.toFixed(1)}%`,
    totalAch.label,
    ""
  ].join(",");

  const csvContent = "\uFEFF" + [
    `# UNO! COFFEE COMPANY - Branch UN1021-CNV (Central Village)`,
    `# Store Performance Report: ${from} to ${to}`,
    `# Export Date: ${new Date().toISOString()}`,
    "",
    headers.join(","),
    ...rowsData,
    summaryRow
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `UNO_Store_Report_UN1021-CNV_${from}_to_${to}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`ส่งออกรายงาน CSV เรียบร้อยแล้ว (${sorted.length} วันทำการ)`, "success");
}

document.querySelectorAll(".preset-btn").forEach(btn => {
  btn.addEventListener("click", () => applyReportPreset(btn.dataset.preset));
});

$("btn-report-csv")?.addEventListener("click", exportReportCSV);
$("report-ledger-search")?.addEventListener("input", renderReportLedger);
$("report-ledger-sort")?.addEventListener("change", renderReportLedger);

$("btn-report-refresh")?.addEventListener("click", () => {
  loadReports();
  showToast("รีเฟรชข้อมูลรายงานเรียบร้อยแล้ว", "success");
});

$("btn-print-report")?.addEventListener("click", () => window.print());

$("btn-dash-refresh")?.addEventListener("click", () => {
  loadDashboard();
  showToast("อัปเดตข้อมูล Dashboard สำเร็จ", "success");
});

$("btn-admin-clear-cache")?.addEventListener("click", () => {
  monthTargets = {};
  reportTargetLookup = {};
  loadDashboard();
  showToast("ทำการซิงค์และล้างแคชข้อมูลเรียบร้อยแล้ว", "success");
});

// Admin Quick Target Presets
document.querySelectorAll(".btn-target-preset").forEach(btn => {
  btn.addEventListener("click", async () => {
    const targetVal = parseFloat(btn.dataset.target || 0);
    const selectedMonth = $("daily-month")?.value || new Date().toISOString().slice(0, 7);
    const targetSatang = Math.round(targetVal * 100);

    try {
      const targetRef = doc(db, "targets", selectedMonth);
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(targetRef);
        const payload = {
          monthKey: selectedMonth,
          monthlyTargetSatang: targetSatang,
          updatedAt: serverTimestamp(),
          updatedBy: getLoggedInUserIdentifier()
        };
        if (!sfDoc.exists()) {
          payload.createdAt = serverTimestamp();
          payload.createdBy = getLoggedInUserIdentifier();
          transaction.set(targetRef, payload);
        } else {
          const existing = sfDoc.data() || {};
          payload.createdAt = existing.createdAt || serverTimestamp();
          payload.createdBy = existing.createdBy || getLoggedInUserIdentifier();
          transaction.set(targetRef, payload, { merge: true });
        }
      });

      monthTargets[selectedMonth] = targetSatang;
      if ($("daily-monthly-target-input")) {
        $("daily-monthly-target-input").value = toTHB(targetSatang).toFixed(1);
      }
      const [y, m] = selectedMonth.split("-").map(Number);
      const totalDays = daysInMonth(y, m);
      if ($("daily-calc-target")) {
        $("daily-calc-target").value = money(totalDays ? Math.round(targetSatang / totalDays) : 0);
      }
      showToast(`ตั้งค่าเป้าหมายด่วนเดือน ${selectedMonth}: ${money(targetSatang)} เรียบร้อยแล้ว`, "success");
      loadDashboard();
    } catch (e) {
      showToast("บันทึก Target ไม่สำเร็จ: " + e.message, "danger");
    }
  });
});

// Admin JSON Backup & Export
$("btn-admin-backup")?.addEventListener("click", async () => {
  try {
    showToast("กำลังสร้างไฟล์สำรองข้อมูล JSON...", "warning");
    const allData = await getSales("2000-01-01", "2099-12-31");
    const exportObj = {
      brand: "UNO! COFFEE COMPANY",
      branchCode: "UN1021-CNV",
      branchName: "Central Village",
      exportedAt: new Date().toISOString(),
      totalRecords: allData.length,
      monthlyTargets: monthTargets,
      sales: allData
    };
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObj, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonStr);
    downloadAnchor.setAttribute("download", `UNO_Coffee_Backup_UN1021-CNV_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast(`สำรองข้อมูล JSON สำเร็จ (${allData.length} รายการ)`, "success");
  } catch (err) {
    showToast("เกิดข้อผิดพลาดในการสำรองข้อมูล: " + err.message, "danger");
  }
});

/* =========================================================
   AUTHENTICATION MANAGEMENT (FIREBASE AUTH)
========================================================= */

let authMode = "login"; // "login" | "register"

function updateAuthModeUI() {
  const isLogin = authMode === "login";
  if ($("auth-form-title")) {
    $("auth-form-title").textContent = isLogin ? "เข้าสู่ระบบเพื่อจัดการยอดขาย" : "สร้างบัญชีผู้ดูแลระบบ (First Admin)";
  }
  if ($("auth-form-desc")) {
    $("auth-form-desc").textContent = isLogin
      ? "ระบุอีเมลและรหัสผ่านเพื่อเข้าใช้งานระบบ POS Portal"
      : "สร้างบัญชีผู้ใช้งานใหม่สำหรับควบคุมและจัดการยอดขายสาขา";
  }
  if ($("btn-auth-text")) {
    $("btn-auth-text").textContent = isLogin ? "เข้าสู่ระบบ (Sign In)" : "สร้างบัญชีและเข้าสู่ระบบ (Create Account)";
  }
  if ($("auth-toggle-label")) {
    $("auth-toggle-label").textContent = isLogin ? "ยังไม่มีบัญชีในระบบ?" : "มีบัญชีอยู่แล้ว?";
  }
  if ($("btn-auth-toggle-mode")) {
    $("btn-auth-toggle-mode").textContent = isLogin ? "สร้างบัญชีผู้ใช้ใหม่ (Register)" : "เข้าสู่ระบบ (Sign In)";
  }
  if ($("auth-error-msg")) {
    $("auth-error-msg").classList.add("hidden");
    $("auth-error-msg").textContent = "";
  }
}

function showAuthError(message) {
  const errBox = $("auth-error-msg");
  if (errBox) {
    errBox.textContent = message;
    errBox.classList.remove("hidden");
  }
}

function initAuth() {
  $("btn-auth-toggle-mode")?.addEventListener("click", () => {
    authMode = authMode === "login" ? "register" : "login";
    updateAuthModeUI();
  });

  $("form-auth")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("auth-email")?.value.trim() || "";
    const password = $("auth-password")?.value || "";
    const submitBtn = $("btn-auth-submit");

    if (!email || !password) {
      showAuthError("กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน");
      return;
    }

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("opacity-70");
      }
      if ($("auth-error-msg")) $("auth-error-msg").classList.add("hidden");

      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        showToast(`เข้าสู่ระบบสำเร็จ: ${email}`, "success");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast(`สร้างบัญชีและเข้าสู่ระบบสำเร็จ: ${email}`, "success");
      }
    } catch (err) {
      console.error("Auth error:", err);
      let msg = err.message;
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        msg = "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้สร้างบัญชีผู้ใช้ใน Firebase Auth";
      } else if (err.code === "auth/email-already-in-use") {
        msg = "อีเมลนี้มีอยู่ในระบบแล้ว กรุณากด 'เข้าสู่ระบบ (Sign In)'";
      } else if (err.code === "auth/weak-password") {
        msg = "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
      } else if (err.code === "auth/invalid-email") {
        msg = "รูปแบบอีเมลไม่ถูกต้อง";
      }
      showAuthError(msg);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-70");
      }
    }
  });

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      showToast("ออกจากระบบเรียบร้อยแล้ว", "warning");
    } catch (err) {
      showToast("เกิดข้อผิดพลาดในการออกจากระบบ: " + err.message, "danger");
    }
  };

  $("btn-header-signout")?.addEventListener("click", handleSignOut);
  $("btn-admin-signout")?.addEventListener("click", handleSignOut);
  $("btn-header-signin")?.addEventListener("click", () => {
    $("auth-modal")?.classList.remove("hidden");
  });

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const authModal = $("auth-modal");
    const headerUserBadge = $("header-user-badge");
    const headerSignInBtn = $("btn-header-signin");

    if (user) {
      if (authModal) authModal.classList.add("hidden");
      if (headerUserBadge) headerUserBadge.classList.remove("hidden");
      if (headerSignInBtn) headerSignInBtn.classList.add("hidden");

      const displayEmail = user.email || "User";
      if ($("header-user-email")) $("header-user-email").textContent = displayEmail;
      if ($("header-user-initial")) $("header-user-initial").textContent = displayEmail[0].toUpperCase();
      if ($("admin-user-email")) $("admin-user-email").textContent = displayEmail;

      const activePage = document.querySelector(".page:not(.hidden)");
      const pageId = activePage?.id || "page-dashboard";
      if (pageId === "page-dashboard") loadDashboard().catch(err => console.error("Auth dashboard load error:", err));
      else if (pageId === "page-daily") loadDailySales().catch(err => console.error("Auth daily sales load error:", err));
      else if (pageId === "page-history") loadHistory().catch(err => console.error("Auth history load error:", err));
      else if (pageId === "page-reports") loadReports().catch(err => console.error("Auth reports load error:", err));
    } else {
      if (authModal) authModal.classList.remove("hidden");
      if (headerUserBadge) headerUserBadge.classList.add("hidden");
      if (headerSignInBtn) headerSignInBtn.classList.remove("hidden");
      if ($("admin-user-email")) $("admin-user-email").textContent = "ยังไม่ได้เข้าสู่ระบบ";
    }
  });
}

/* =========================================================
   INITIALIZATION
========================================================= */

initAuth();
initLiveClock();
defaultReportDates();
setActivePage("page-dashboard");

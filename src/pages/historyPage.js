import { getSalesFromFirestore } from "../repositories/salesRepository.js";
import { getMonthlyTargetSatangFromFirestore } from "../repositories/targetRepository.js";
import { calculateDailyTargetFromMonthly, getAchievementStatus } from "../core/salesCalculations.js";
import { channels, channelLabels, channelCategories } from "../config/constants.js";
import { isAuthPermissionError } from "../core/validation.js";
import { openSaleForm, triggerDeleteModal } from "./dailyPage.js";
import { $, money, esc } from "../utils/currency.js";
import { dateFmt, getDayName } from "../utils/date.js";
import { exportSalesToCSV } from "../utils/export.js";
import { showToast } from "../components/toast.js";
import { getCurrentUser } from "../auth/auth.js";

// State
let allSalesRows = [];
let filteredSalesRows = [];
let targetsCache = {};
let activeDrawerRecord = null;
let currentPage = 1;
const PAGE_SIZE = 20;

// Filter and Sort states
let currentSearch = "";
let currentDateFrom = "";
let currentDateTo = "";
let currentStatusFilter = "all";
let currentSort = "date-desc";

function showHistoryError(error) {
  const banner = $("history-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-white border border-[#C92F24]/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[#171717]">
        <div class="flex items-center gap-2.5">
          <span class="text-xs font-semibold text-[#C92F24]">!</span>
          <div>
            <div class="text-xs font-semibold text-[#171717]">${isAuthErr ? "Authentication Required" : "Cannot load historical sales ledger"}</div>
            <div class="text-xs text-[#737373] mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูประวัติยอดขายสาขา" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-hist" class="px-3 py-1.5 bg-[#171717] hover:bg-[#262626] text-white text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Sign In</span>
          </button>
        ` : `
          <button id="btn-retry-history" class="px-3 py-1.5 bg-white border border-[#E5E5E5] hover:bg-[#FAFAF9] text-[#171717] text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Retry</span>
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
    body.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-xs text-[#737373]">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูข้อมูล Historical Sales Ledger" : "ไม่สามารถโหลดข้อมูลได้: " + esc(error?.message || "ระบบขัดข้อง")}</td></tr>`;
  }
  showToast(isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูประวัติยอดขาย" : "โหลดประวัติยอดขายล้มเหลว: " + (error?.message || error), "danger");
}

/**
 * Filter and sort dataset
 */
function applyFiltersAndSort() {
  const query = currentSearch.trim().toLowerCase();

  filteredSalesRows = allSalesRows.filter(row => {
    // 1. Text Search: matches Date, Day, CreatedBy, UpdatedBy
    if (query) {
      const dateStr = String(row.date || "").toLowerCase();
      const formattedDate = dateFmt(row.date).toLowerCase();
      const dayName = getDayName(row.date).toLowerCase();
      const createdBy = String(row.createdBy || "").toLowerCase();
      const updatedBy = String(row.updatedBy || "").toLowerCase();

      const matchesQuery =
        dateStr.includes(query) ||
        formattedDate.includes(query) ||
        dayName.includes(query) ||
        createdBy.includes(query) ||
        updatedBy.includes(query);

      if (!matchesQuery) return false;
    }

    // 2. Date Range: From
    if (currentDateFrom && row.date < currentDateFrom) {
      return false;
    }

    // 3. Date Range: To
    if (currentDateTo && row.date > currentDateTo) {
      return false;
    }

    // 4. Status Filter
    if (currentStatusFilter !== "all") {
      if (currentStatusFilter === "has-void") {
        if (!row.voidBill || row.voidBill <= 0) return false;
      } else if (currentStatusFilter === "above") {
        if (row.achievementStatus?.status !== "above") return false;
      } else if (currentStatusFilter === "near") {
        if (row.achievementStatus?.status !== "near") return false;
      } else if (currentStatusFilter === "below") {
        if (row.achievementStatus?.status !== "below") return false;
      }
    }

    return true;
  });

  // Sorting
  filteredSalesRows.sort((a, b) => {
    switch (currentSort) {
      case "date-asc":
        return a.date.localeCompare(b.date);
      case "date-desc":
        return b.date.localeCompare(a.date);
      case "sales-desc":
        return (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0);
      case "sales-asc":
        return (a.totalSalesSatang || 0) - (b.totalSalesSatang || 0);
      case "ach-desc":
        return (b.achievementStatus?.rate || 0) - (a.achievementStatus?.rate || 0);
      case "ach-asc":
        return (a.achievementStatus?.rate || 0) - (b.achievementStatus?.rate || 0);
      case "void-desc":
        return (b.voidAmountSatang || 0) - (a.voidAmountSatang || 0);
      default:
        return b.date.localeCompare(a.date);
    }
  });

  currentPage = 1;
  renderLedger();
}

/**
 * Render the table, statistics, pagination, and empty state
 */
function renderLedger() {
  const tbody = $("table-history-body");
  if (!tbody) return;

  const totalCount = filteredSalesRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  // Mini Financial Metrics Strip
  let sumSalesSatang = 0;
  let sumTargetSatang = 0;
  let sumVoidBills = 0;
  let sumVoidSatang = 0;

  filteredSalesRows.forEach(r => {
    sumSalesSatang += (r.totalSalesSatang || 0);
    sumTargetSatang += (r.dailyTargetSatang || 0);
    sumVoidBills += (r.voidBill || 0);
    sumVoidSatang += (r.voidAmountSatang || 0);
  });

  if ($("records-stat-count")) $("records-stat-count").textContent = totalCount.toLocaleString("th-TH");
  if ($("records-stat-sales")) $("records-stat-sales").textContent = money(sumSalesSatang);
  if ($("records-stat-target")) $("records-stat-target").textContent = money(sumTargetSatang);
  if ($("records-stat-voids")) {
    $("records-stat-voids").textContent = `${sumVoidBills} บิล (${money(sumVoidSatang)})`;
  }
  if ($("records-table-badge")) {
    $("records-table-badge").textContent = `${totalCount} รายการ`;
  }

  // Pagination controls
  if ($("records-page-info")) {
    $("records-page-info").textContent = `${currentPage} / ${totalPages}`;
  }
  const prevBtn = $("records-prev-page");
  const nextBtn = $("records-next-page");
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

  // Slice rows for current page
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredSalesRows.slice(startIndex, startIndex + PAGE_SIZE);

  if (pageRows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="p-12 text-center text-xs text-[#737373]">
          <div class="flex flex-col items-center justify-center gap-2">
            <span class="text-sm font-semibold text-[#171717]">ไม่พบรายการยอดขายที่ตรงกับเงื่อนไขการค้นหา</span>
            <p class="text-[11px] text-[#A3A3A3]">ลองปรับเปลี่ยนคำค้นหา วันที่ หรือสถานะตัวกรอง</p>
            <button id="btn-records-empty-clear" type="button" class="mt-2 px-3 py-1.5 bg-white border border-[#E5E5E5] hover:bg-[#FAFAF9] text-[#171717] rounded-md text-xs font-medium cursor-pointer transition">
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        </td>
      </tr>
    `;
    $("btn-records-empty-clear")?.addEventListener("click", resetFilters);
    const tfoot = $("records-table-tfoot");
    if (tfoot) tfoot.innerHTML = "";
    return;
  }

  // Render rows
  tbody.innerHTML = pageRows.map(row => {
    const updatedStr = row.updatedAt?.toDate ? row.updatedAt.toDate().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "-";
    const updatedBy = row.updatedBy || row.createdBy || "-";
    const dayName = getDayName(row.date);
    const ach = row.achievementStatus || { rate: 0, status: "below", label: "No Target", pillClass: "bg-[#F5F5F4] text-[#737373]", textClass: "text-[#737373]" };

    const voidHtml = row.voidBill > 0
      ? `<span class="text-[#C92F24] font-medium font-mono">${row.voidBill} บิล <span class="text-[10px]">(${money(row.voidAmountSatang || 0)})</span></span>`
      : `<span class="text-[#A3A3A3] font-mono">0</span>`;

    const targetHtml = row.dailyTargetSatang > 0
      ? `<span class="font-mono text-[#737373]">${money(row.dailyTargetSatang)}</span>`
      : `<span class="text-[#A3A3A3] font-mono">—</span>`;

    const achPill = row.dailyTargetSatang > 0
      ? `<span class="pill ${ach.pillClass} font-mono">${ach.rate.toFixed(1)}%</span>`
      : `<span class="pill bg-[#F5F5F4] text-[#A3A3A3] font-mono">—</span>`;

    return `
      <tr class="ledger-row border-b border-[#E5E5E5] hover:bg-[#FAFAF9] transition cursor-pointer" data-date="${row.date}">
        <td class="p-3 text-xs font-semibold text-[#171717] whitespace-nowrap">
          <div class="flex items-center gap-1.5">
            <span>${dateFmt(row.date)}</span>
            <span class="text-[10px] text-[#737373] font-medium">(${dayName})</span>
          </div>
        </td>
        <td class="p-3 text-right text-xs font-bold font-mono text-[#171717] whitespace-nowrap">${money(row.totalSalesSatang)}</td>
        <td class="p-3 text-right text-xs whitespace-nowrap">${targetHtml}</td>
        <td class="p-3 text-center whitespace-nowrap">${achPill}</td>
        <td class="p-3 text-center text-xs whitespace-nowrap">${voidHtml}</td>
        <td class="p-3 text-center text-xs whitespace-nowrap">
          <span class="text-[11px] font-medium ${ach.textClass}">${ach.label}</span>
        </td>
        <td class="p-3 text-[11px] text-[#737373] whitespace-nowrap">
          <div class="font-medium text-[#171717] truncate max-w-[130px]">${esc(updatedBy)}</div>
          <div class="text-[10px] text-[#A3A3A3] font-mono">${esc(updatedStr)}</div>
        </td>
        <td class="p-3 text-center whitespace-nowrap">
          <button type="button" class="btn-row-detail px-2.5 py-1 text-xs font-medium text-[#171717] bg-white border border-[#E5E5E5] hover:bg-[#FAFAF9] rounded transition cursor-pointer" data-date="${row.date}">
            Detail ➔
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // Table summary footer for filtered dataset
  const tfoot = $("records-table-tfoot");
  if (tfoot) {
    const overallRate = sumTargetSatang > 0 ? (sumSalesSatang / sumTargetSatang) * 100 : 0;
    tfoot.innerHTML = `
      <tr>
        <td class="p-3 text-xs font-semibold text-[#171717]">รวม (${totalCount} วัน)</td>
        <td class="p-3 text-right text-xs font-bold font-mono text-[#171717]">${money(sumSalesSatang)}</td>
        <td class="p-3 text-right text-xs font-mono text-[#737373]">${money(sumTargetSatang)}</td>
        <td class="p-3 text-center">
          ${sumTargetSatang > 0 ? `<span class="pill bg-[#171717] text-white font-mono">${overallRate.toFixed(1)}%</span>` : "—"}
        </td>
        <td class="p-3 text-center text-xs font-mono ${sumVoidBills > 0 ? "text-[#C92F24]" : "text-[#737373]"}">
          ${sumVoidBills > 0 ? `${sumVoidBills} บิล (${money(sumVoidSatang)})` : "0"}
        </td>
        <td class="p-3 text-center text-[11px] text-[#737373]">-</td>
        <td class="p-3 text-[11px] text-[#737373]" colspan="2">Filtered Total Ledger</td>
      </tr>
    `;
  }

  // Row click event -> Open Detail Drawer
  tbody.querySelectorAll(".ledger-row").forEach(rowEl => {
    rowEl.addEventListener("click", e => {
      const date = rowEl.dataset.date;
      const targetRecord = allSalesRows.find(r => r.date === date);
      if (targetRecord) {
        openRecordDrawer(targetRecord);
      }
    });
  });
}

/**
 * Open the Historical Sales Record Detail Drawer
 */
function openRecordDrawer(record) {
  activeDrawerRecord = record;
  const drawer = $("records-drawer");
  if (!drawer) return;

  const dayName = getDayName(record.date);
  const ach = record.achievementStatus || { rate: 0, status: "below", label: "No Target", pillClass: "bg-[#F5F5F4] text-[#737373]" };

  // Header
  if ($("drawer-date-title")) $("drawer-date-title").textContent = dateFmt(record.date);
  if ($("drawer-day-subtitle")) $("drawer-day-subtitle").textContent = `วันที่บันทึก: ${record.date} (วัน${dayName})`;
  if ($("drawer-status-pill")) {
    const pill = $("drawer-status-pill");
    pill.className = `pill ${ach.pillClass}`;
    pill.textContent = ach.label;
  }

  // 1. Sales Summary
  const totalSatang = record.totalSalesSatang || 0;
  if ($("drawer-total-sales")) $("drawer-total-sales").textContent = money(totalSatang);

  let counterSatang = 0;
  let deliverySatang = 0;
  channels.forEach(ch => {
    const val = record.payments?.[ch] || 0;
    if (channelCategories[ch] === "Delivery") {
      deliverySatang += val;
    } else {
      counterSatang += val;
    }
  });

  if ($("drawer-counter-sales")) $("drawer-counter-sales").textContent = money(counterSatang);
  if ($("drawer-delivery-sales")) $("drawer-delivery-sales").textContent = money(deliverySatang);

  // 2. Target & Achievement
  const dailyTargetSatang = record.dailyTargetSatang || 0;
  const varianceSatang = totalSatang - dailyTargetSatang;

  if ($("drawer-daily-target")) {
    $("drawer-daily-target").textContent = dailyTargetSatang > 0 ? money(dailyTargetSatang) : "ไม่ได้ตั้งเป้า";
  }
  if ($("drawer-ach-rate")) {
    $("drawer-ach-rate").textContent = dailyTargetSatang > 0 ? `${ach.rate.toFixed(1)}%` : "—";
  }
  if ($("drawer-variance")) {
    const varEl = $("drawer-variance");
    if (dailyTargetSatang > 0) {
      const prefix = varianceSatang >= 0 ? "+" : "";
      varEl.textContent = `${prefix}${money(varianceSatang)}`;
      varEl.className = `font-mono text-xs font-semibold ${varianceSatang >= 0 ? "text-[#171717]" : "text-[#C92F24]"}`;
    } else {
      varEl.textContent = "—";
      varEl.className = "font-mono text-xs text-[#737373]";
    }
  }

  // 3. Payment Breakdown (10 channels)
  const paymentsList = $("drawer-payments-list");
  if (paymentsList) {
    paymentsList.innerHTML = channels.map(ch => {
      const amtSatang = record.payments?.[ch] || 0;
      const share = totalSatang > 0 ? ((amtSatang / totalSatang) * 100).toFixed(1) : "0.0";
      const cat = channelCategories[ch] || "Counter";
      const isZero = amtSatang <= 0;

      return `
        <div class="py-2 flex items-center justify-between ${isZero ? "opacity-40" : ""}">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full ${cat === "Delivery" ? "bg-[#171717]" : "bg-[#737373]"}"></span>
            <span class="font-medium text-[#171717]">${channelLabels[ch] || ch}</span>
            <span class="text-[10px] text-[#737373] bg-[#F5F5F4] px-1.5 py-0.5 rounded border border-[#E5E5E5]">${cat}</span>
          </div>
          <div class="text-right">
            <span class="font-mono font-semibold text-[#171717]">${money(amtSatang)}</span>
            <span class="text-[10px] text-[#737373] ml-1.5 font-mono">(${share}%)</span>
          </div>
        </div>
      `;
    }).join("");
  }

  // 4. Void Audit Detail
  const voidBill = record.voidBill || 0;
  const voidSatang = record.voidAmountSatang || 0;

  if ($("drawer-void-bills")) $("drawer-void-bills").textContent = `${voidBill} บิล`;
  if ($("drawer-void-amount")) {
    const vAmtEl = $("drawer-void-amount");
    vAmtEl.textContent = money(voidSatang);
    vAmtEl.className = `font-mono text-xs font-semibold ${voidBill > 0 ? "text-[#C92F24]" : "text-[#171717]"}`;
  }
  if ($("drawer-void-note")) {
    const noteEl = $("drawer-void-note");
    if (voidBill > 0) {
      noteEl.innerHTML = `<span class="text-[#C92F24] font-medium">⚠️ มีรายการ Void จำนวน ${voidBill} บิล</span> ตรวจสอบสลิปและเหตุผลการยกเลิก`;
    } else {
      noteEl.innerHTML = `<span class="text-[#737373]">✓ ไม่พบประวัติการยกเลิกบิลสำหรับวันที่นี้</span>`;
    }
  }

  // 5. Metadata
  const createdStr = record.createdAt?.toDate ? record.createdAt.toDate().toLocaleString("th-TH") : (record.date ? dateFmt(record.date) : "-");
  const updatedStr = record.updatedAt?.toDate ? record.updatedAt.toDate().toLocaleString("th-TH") : "-";

  if ($("drawer-created-by")) $("drawer-created-by").textContent = record.createdBy || record.updatedBy || "-";
  if ($("drawer-created-at")) $("drawer-created-at").textContent = createdStr;
  if ($("drawer-updated-by")) $("drawer-updated-by").textContent = record.updatedBy || "-";
  if ($("drawer-updated-at")) $("drawer-updated-at").textContent = updatedStr;

  drawer.classList.remove("hidden");
}

function closeRecordDrawer() {
  const drawer = $("records-drawer");
  if (drawer) drawer.classList.add("hidden");
  activeDrawerRecord = null;
}

function resetFilters() {
  currentSearch = "";
  currentDateFrom = "";
  currentDateTo = "";
  currentStatusFilter = "all";
  currentSort = "date-desc";

  if ($("records-search")) $("records-search").value = "";
  if ($("records-date-from")) $("records-date-from").value = "";
  if ($("records-date-to")) $("records-date-to").value = "";
  if ($("records-status-filter")) $("records-status-filter").value = "all";
  if ($("records-sort")) $("records-sort").value = "date-desc";

  applyFiltersAndSort();
}

/**
 * Initialize Records Page event listeners once at bootstrap
 */
export function initHistoryPage() {
  // Search input
  $("records-search")?.addEventListener("input", e => {
    currentSearch = e.target.value;
    applyFiltersAndSort();
  });

  // Date range filters
  $("records-date-from")?.addEventListener("change", e => {
    currentDateFrom = e.target.value;
    applyFiltersAndSort();
  });

  $("records-date-to")?.addEventListener("change", e => {
    currentDateTo = e.target.value;
    applyFiltersAndSort();
  });

  // Status filter
  $("records-status-filter")?.addEventListener("change", e => {
    currentStatusFilter = e.target.value;
    applyFiltersAndSort();
  });

  // Clear filters
  $("btn-records-clear-filter")?.addEventListener("click", resetFilters);

  // Sorting
  $("records-sort")?.addEventListener("change", e => {
    currentSort = e.target.value;
    applyFiltersAndSort();
  });

  // Pagination
  $("records-prev-page")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderLedger();
    }
  });

  $("records-next-page")?.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredSalesRows.length / PAGE_SIZE);
    if (currentPage < totalPages) {
      currentPage++;
      renderLedger();
    }
  });

  // Refresh
  $("btn-records-refresh")?.addEventListener("click", () => {
    showToast("กำลังรีเฟรชข้อมูล Records...", "info");
    loadHistory();
  });

  // Export CSV
  $("btn-records-export-csv")?.addEventListener("click", () => {
    if (!filteredSalesRows || filteredSalesRows.length === 0) {
      showToast("ไม่มีข้อมูลสำหรับส่งออก CSV", "warning");
      return;
    }
    const filename = `UNO_Historical_Ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    exportSalesToCSV(filteredSalesRows, filename);
  });

  // Detail Drawer Close events
  $("btn-close-records-drawer")?.addEventListener("click", closeRecordDrawer);
  $("drawer-btn-close")?.addEventListener("click", closeRecordDrawer);
  $("records-drawer-backdrop")?.addEventListener("click", closeRecordDrawer);

  // Drawer Action: Edit Record
  $("drawer-btn-edit")?.addEventListener("click", () => {
    if (activeDrawerRecord) {
      const targetRecord = activeDrawerRecord;
      closeRecordDrawer();
      openSaleForm(targetRecord.date, targetRecord);
    }
  });

  // Drawer Action: Delete Record
  $("drawer-btn-delete")?.addEventListener("click", () => {
    if (activeDrawerRecord) {
      const dateToDelete = activeDrawerRecord.date;
      closeRecordDrawer();
      triggerDeleteModal(dateToDelete);
    }
  });

  // Keyboard shortcut: Escape to close drawer
  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("records-drawer")?.classList.contains("hidden")) {
      closeRecordDrawer();
    }
  });
}

/**
 * Load Historical Ledger data from Firestore
 */
export async function loadHistory() {
  if (!getCurrentUser()) {
    return;
  }
  const tbody = $("table-history-body");
  if (!tbody) return;

  const errBanner = $("history-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="p-8 text-center text-xs text-[#737373]">กำลังโหลดข้อมูล Historical Sales Ledger...</td>
    </tr>
  `;

  try {
    const rawRows = await getSalesFromFirestore("2000-01-01", "2099-12-31");

    // Pre-fetch unique months targets
    const uniqueMonths = [...new Set(rawRows.map(r => r.date ? r.date.slice(0, 7) : "").filter(Boolean))];
    for (const ym of uniqueMonths) {
      if (targetsCache[ym] === undefined) {
        targetsCache[ym] = await getMonthlyTargetSatangFromFirestore(ym);
      }
    }

    // Enrich rows with daily target & achievement status
    allSalesRows = rawRows.map(row => {
      const ym = row.date ? row.date.slice(0, 7) : "";
      const monthlyTargetSatang = targetsCache[ym] || 0;
      const dailyTargetSatang = calculateDailyTargetFromMonthly(monthlyTargetSatang, row.date);
      const achievementStatus = getAchievementStatus(row.totalSalesSatang, dailyTargetSatang);
      const varianceSatang = (row.totalSalesSatang || 0) - dailyTargetSatang;

      return {
        ...row,
        dailyTargetSatang,
        achievementStatus,
        varianceSatang
      };
    });

    applyFiltersAndSort();
  } catch (error) {
    console.error("History Audit Log error:", error);
    showHistoryError(error);
  }
}

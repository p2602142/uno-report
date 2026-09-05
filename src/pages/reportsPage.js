import { getSalesFromFirestore } from "../repositories/salesRepository.js";
import { getMonthlyTargetSatangFromFirestore } from "../repositories/targetRepository.js";
import { calculateDailyTargetFromMonthly } from "../core/salesCalculations.js";
import { calculateStorePerformanceReport, generateInsightsList } from "../core/reportCalculations.js";
import { isAuthPermissionError } from "../core/validation.js";
import { renderReportCharts } from "../components/charts.js";
import { exportSalesToCSV } from "../utils/export.js";
import { channels, channelLabels } from "../config/constants.js";
import { $, money, toTHB, esc } from "../utils/currency.js";
import { dateFmt, daysInMonth, getDayName } from "../utils/date.js";
import { showToast } from "../components/toast.js";
import { getCurrentUser } from "../auth/auth.js";

let currentReportRows = [];
let reportFilteredRows = [];
let reportSortMode = "date-desc";
let reportLedgerPage = 1;
const LEDGER_PAGE_SIZE = 15;

function showReportError(error) {
  const banner = $("report-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-white border border-[#C92F24]/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[#171717]">
        <div class="flex items-center gap-2.5">
          <span class="w-6 h-6 rounded-full bg-[#C92F24]/10 text-[#C92F24] flex items-center justify-center font-bold text-xs">!</span>
          <div>
            <div class="text-xs font-semibold text-[#171717]">${isAuthErr ? "Authentication Required" : "Cannot load performance report"}</div>
            <div class="text-xs text-[#737373] mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อสร้างและดูรายงานสาขา" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-report" type="button" class="px-3 py-1.5 bg-[#171717] hover:bg-[#262626] text-white text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Sign In</span>
          </button>
        ` : `
          <button id="btn-retry-report" type="button" class="px-3 py-1.5 bg-white border border-[#E5E5E5] hover:bg-[#FAFAF9] text-[#171717] text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Retry</span>
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

export function defaultReportDates() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = String(month).padStart(2, "0");

  if ($("report-from")) $("report-from").value = `${year}-${monthStr}-01`;
  if ($("report-to")) $("report-to").value = `${year}-${monthStr}-${daysInMonth(year, month)}`;
}

export function applyReportPreset(preset) {
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

/**
 * Renders the full Daily Sales & Variance Ledger table with pagination, search, and sorting
 */
export function renderLedgerTable() {
  const tbody = $("report-ledger-tbody") || $("report-ledger-body");
  const tfoot = $("report-ledger-tfoot");
  if (!tbody) return;

  const searchTerm = ($("report-ledger-search") || $("ledger-search"))?.value?.toLowerCase()?.trim() || "";
  let filtered = currentReportRows.filter(r => {
    if (!searchTerm) return true;
    const dName = getDayName(r.date).toLowerCase();
    const dStr = String(r.date).toLowerCase();
    const uStr = (r.updatedBy || "").toLowerCase();
    return dStr.includes(searchTerm) || dName.includes(searchTerm) || uStr.includes(searchTerm);
  });

  // Sorting
  filtered.sort((a, b) => {
    switch (reportSortMode) {
      case "date-asc":
        return String(a.date).localeCompare(String(b.date));
      case "date-desc":
        return String(b.date).localeCompare(String(a.date));
      case "sales-asc":
        return (a.totalSalesSatang || 0) - (b.totalSalesSatang || 0);
      case "sales-desc":
        return (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0);
      case "variance-asc":
        return (a.varianceSatang || 0) - (b.varianceSatang || 0);
      case "variance-desc":
        return (b.varianceSatang || 0) - (a.varianceSatang || 0);
      default:
        return String(b.date).localeCompare(String(a.date));
    }
  });

  reportFilteredRows = filtered;

  const totalPages = Math.max(1, Math.ceil(filtered.length / LEDGER_PAGE_SIZE));
  reportLedgerPage = Math.min(Math.max(1, reportLedgerPage), totalPages);

  const startIdx = (reportLedgerPage - 1) * LEDGER_PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + LEDGER_PAGE_SIZE);

  const countEl = $("report-ledger-count") || $("ledger-record-count");
  if (countEl) {
    countEl.textContent = `${filtered.length} วันทำการ`;
  }
  const pageInfoEl = $("report-ledger-page-info") || $("ledger-page-info");
  if (pageInfoEl) {
    pageInfoEl.textContent = `${reportLedgerPage} / ${totalPages}`;
  }

  const prevBtn = $("report-ledger-prev") || $("ledger-prev");
  const nextBtn = $("report-ledger-next") || $("ledger-next");
  if (prevBtn) prevBtn.disabled = reportLedgerPage <= 1;
  if (nextBtn) nextBtn.disabled = reportLedgerPage >= totalPages;

  if (!pageRows.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="p-8 text-center text-[#737373] text-xs">ไม่พบรายการข้อมูลยอดขายในช่วงเวลานี้</td></tr>`;
    if (tfoot) tfoot.innerHTML = "";
    return;
  }

  tbody.innerHTML = pageRows.map(row => {
    const ach = row.achievement || { rate: 0, pillClass: "bg-[#F5F5F4] text-[#737373] border border-[#E5E5E5]", label: "—" };
    const isPositiveVar = (row.varianceSatang || 0) >= 0;
    const varianceColor = isPositiveVar ? "text-[#171717]" : "text-[#C92F24]";
    const varianceSign = isPositiveVar ? "+" : "";

    return `
      <tr class="hover:bg-[#FAFAF9] transition border-b border-[#E5E5E5] last:border-0 font-mono text-xs">
        <td class="p-2.5 sm:p-3 font-semibold text-[#171717] font-sans">${dateFmt(row.date)}</td>
        <td class="p-2.5 sm:p-3 text-[#737373] text-[11px] font-sans">${getDayName(row.date)}</td>
        <td class="p-2.5 sm:p-3 text-right font-bold text-[#171717]">${money(row.totalSalesSatang)}</td>
        <td class="p-2.5 sm:p-3 text-right text-[#737373]">${money(row.dailyTargetSatang || 0)}</td>
        <td class="p-2.5 sm:p-3 text-center">
          <span class="pill ${ach.pillClass} text-[10px]">${ach.rate.toFixed(1)}%</span>
        </td>
        <td class="p-2.5 sm:p-3 text-right font-semibold ${varianceColor}">
          ${varianceSign}${money(row.varianceSatang || 0)}
        </td>
        <td class="p-2.5 sm:p-3 text-center text-[11px]">
          ${row.voidBill ? `<span class="text-[#C92F24] font-semibold">${row.voidBill} บิล (${money(row.voidAmountSatang || 0)})</span>` : `<span class="text-[#A3A3A3] font-sans">0</span>`}
        </td>
        <td class="p-2.5 sm:p-3 text-right text-[#737373]">${money(row.cashSatang || 0)}</td>
        <td class="p-2.5 sm:p-3 text-right text-[#737373]">${money(row.qrPromptPaySatang || 0)}</td>
        <td class="p-2.5 sm:p-3 text-right text-[#737373]">${money(row.cardSatang || 0)}</td>
        <td class="p-2.5 sm:p-3 text-right text-[#737373]">${money(row.deliverySatang || 0)}</td>
        <td class="p-2.5 sm:p-3 text-center font-sans">
          <span class="pill ${ach.pillClass} text-[10px]">${ach.label}</span>
        </td>
        <td class="p-2.5 sm:p-3 text-[11px] text-[#737373] max-w-[120px] truncate font-sans" title="${esc(row.updatedBy || 'N/A')}">${esc(row.updatedBy || "N/A")}</td>
      </tr>
    `;
  }).join("");

  // Totals Row in TFoot across all filtered items
  if (tfoot) {
    const grandSales = filtered.reduce((s, r) => s + (r.totalSalesSatang || 0), 0);
    const grandTarget = filtered.reduce((s, r) => s + (r.dailyTargetSatang || 0), 0);
    const grandVariance = grandSales - grandTarget;
    const grandRate = grandTarget > 0 ? (grandSales / grandTarget) * 100 : 0;
    const grandVoids = filtered.reduce((s, r) => s + (r.voidBill || 0), 0);
    const grandVoidAmount = filtered.reduce((s, r) => s + (r.voidAmountSatang || 0), 0);
    const grandCash = filtered.reduce((s, r) => s + (r.cashSatang || 0), 0);
    const grandQR = filtered.reduce((s, r) => s + (r.qrPromptPaySatang || 0), 0);
    const grandCard = filtered.reduce((s, r) => s + (r.cardSatang || 0), 0);
    const grandDelivery = filtered.reduce((s, r) => s + (r.deliverySatang || 0), 0);
    const isPosVar = grandVariance >= 0;

    tfoot.innerHTML = `
      <tr class="font-mono text-xs border-t-2 border-[#171717] bg-[#FAFAF9]">
        <td class="p-2.5 sm:p-3 font-bold text-[#171717] font-sans" colspan="2">ยอดรวมทั้งหมด (${filtered.length} วัน)</td>
        <td class="p-2.5 sm:p-3 text-right font-bold text-[#171717]">${money(grandSales)}</td>
        <td class="p-2.5 sm:p-3 text-right font-semibold text-[#737373]">${money(grandTarget)}</td>
        <td class="p-2.5 sm:p-3 text-center font-bold text-[#171717] font-sans">${grandRate.toFixed(1)}%</td>
        <td class="p-2.5 sm:p-3 text-right font-bold ${isPosVar ? "text-[#171717]" : "text-[#C92F24]"}">
          ${isPosVar ? "+" : ""}${money(grandVariance)}
        </td>
        <td class="p-2.5 sm:p-3 text-center text-[11px] font-semibold text-[#171717]">
          ${grandVoids ? `${grandVoids} บิล (${money(grandVoidAmount)})` : "0"}
        </td>
        <td class="p-2.5 sm:p-3 text-right font-semibold text-[#171717]">${money(grandCash)}</td>
        <td class="p-2.5 sm:p-3 text-right font-semibold text-[#171717]">${money(grandQR)}</td>
        <td class="p-2.5 sm:p-3 text-right font-semibold text-[#171717]">${money(grandCard)}</td>
        <td class="p-2.5 sm:p-3 text-right font-semibold text-[#171717]">${money(grandDelivery)}</td>
        <td class="p-2.5 sm:p-3 text-center font-sans" colspan="2">Grand Total</td>
      </tr>
    `;
  }
}

/**
 * Main Controller: Loads data, executes financial calculations, updates all 7 report sections
 */
export async function loadReports() {
  if (!getCurrentUser()) {
    return;
  }
  if ($("report-from") && !$("report-from").value) defaultReportDates();

  const errBanner = $("report-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  // Show loading indicator in ledger
  const tbody = $("report-ledger-tbody") || $("report-ledger-body");
  if (tbody && !currentReportRows.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="p-8 text-center text-[#737373] text-xs">กำลังประมวลผลข้อมูลรายงานสรุปผลประกอบการ...</td></tr>`;
  }

  try {
    const from = $("report-from")?.value || "";
    const to = $("report-to")?.value || "";
    const rows = await getSalesFromFirestore(from, to);

    // Build daily targets lookup for all unique months in range
    const uniqueMonths = [...new Set(rows.map(r => r.date.slice(0, 7)))];
    if (from && uniqueMonths.length === 0) {
      uniqueMonths.push(from.slice(0, 7));
    }
    const targetLookup = {};
    for (const ym of uniqueMonths) {
      const mTarget = await getMonthlyTargetSatangFromFirestore(ym);
      targetLookup[ym] = calculateDailyTargetFromMonthly(mTarget, ym);
    }

    // Comprehensive Business Performance Calculations
    const report = calculateStorePerformanceReport(rows, targetLookup);
    currentReportRows = report.rows;

    const {
      total,
      target,
      varianceSatang,
      varianceTHB,
      voids,
      voidAmountSatang,
      voidAmountPercent,
      avgVoidPerBillSatang,
      avg,
      achievementObj,
      best,
      lowest,
      hitCount,
      hitRate,
      payMix,
      paymentGroups
    } = report;

    // 1. Header & Period Status Bar
    if ($("report-period-label")) {
      $("report-period-label").textContent = from && to ? `${dateFmt(from)} — ${dateFmt(to)}` : "ทุกช่วงเวลา";
    }
    if ($("report-recorded-days")) {
      $("report-recorded-days").textContent = `${rows.length} วันทำการ`;
    }
    if ($("report-store-status")) {
      $("report-store-status").textContent = achievementObj.label;
      $("report-store-status").className = `pill ${achievementObj.pillClass} font-semibold`;
    }
    if ($("report-generated-at")) {
      const now = new Date();
      $("report-generated-at").textContent = now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    }

    // 2. Executive Summary (6 Core Metrics)
    if ($("report-exec-total-sales")) $("report-exec-total-sales").textContent = money(total);
    if ($("report-exec-total-sub")) $("report-exec-total-sub").textContent = `${rows.length} วันทำการสะสม`;

    if ($("report-exec-target")) $("report-exec-target").textContent = money(target);
    if ($("report-exec-target-sub")) $("report-exec-target-sub").textContent = target > 0 ? `เฉลี่ย ฿${(toTHB(target) / (rows.length || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}/วัน` : "ไม่ได้ตั้งเป้าหมาย";

    if ($("report-exec-achievement")) $("report-exec-achievement").textContent = `${achievementObj.rate.toFixed(1)}%`;
    if ($("report-exec-achievement-pill")) {
      $("report-exec-achievement-pill").textContent = achievementObj.shortLabel || achievementObj.label;
      $("report-exec-achievement-pill").className = `pill ${achievementObj.pillClass} text-[10px] py-0 px-1.5`;
    }

    const isPositiveVar = varianceSatang >= 0;
    if ($("report-exec-variance")) {
      $("report-exec-variance").textContent = `${isPositiveVar ? "+" : ""}${money(varianceSatang)}`;
      $("report-exec-variance").className = `text-base sm:text-lg font-bold truncate block my-1 font-mono ${isPositiveVar ? "text-[#171717]" : "text-[#C92F24]"}`;
    }
    if ($("report-exec-variance-label")) {
      $("report-exec-variance-label").textContent = isPositiveVar ? "สูงกว่าเป้าหมายสะสม" : "ต่ำกว่าเป้าหมายสะสม";
    }

    if ($("report-exec-avg")) $("report-exec-avg").textContent = money(avg);
    if ($("report-exec-hit-rate")) {
      $("report-exec-hit-rate").textContent = `Hit Rate: ${hitCount}/${rows.length} วัน (${hitRate}%)`;
    }

    if ($("report-exec-void-amount")) $("report-exec-void-amount").textContent = money(voidAmountSatang);
    if ($("report-exec-void-count")) {
      $("report-exec-void-count").textContent = `${voids.toLocaleString()} บิล (${voidAmountPercent.toFixed(2)}% ของยอดรวม)`;
    }

    // 3. Sales Performance (Trend Chart & Benchmark Summary)
    renderReportCharts(
      {
        trendCanvas: $("chart-report-trend")
      },
      { rows: report.rows, payMix }
    );

    if ($("report-bench-runrate")) $("report-bench-runrate").textContent = `${money(avg)} / วัน`;
    if ($("report-bench-hitcount")) $("report-bench-hitcount").textContent = `${hitCount} จาก ${rows.length} วัน (${hitRate}%)`;
    if ($("report-bench-best")) $("report-bench-best").textContent = best ? money(best.totalSalesSatang) : "—";
    if ($("report-bench-best-date")) {
      $("report-bench-best-date").textContent = best ? `${dateFmt(best.date)} (${getDayName(best.date)})` : "-";
    }
    if ($("report-bench-lowest")) $("report-bench-lowest").textContent = lowest ? money(lowest.totalSalesSatang) : "—";
    if ($("report-bench-lowest-date")) {
      $("report-bench-lowest-date").textContent = lowest ? `${dateFmt(lowest.date)} (${getDayName(lowest.date)})` : "-";
    }
    if ($("report-bench-variance")) {
      $("report-bench-variance").textContent = `${isPositiveVar ? "+" : ""}${money(varianceSatang)}`;
      $("report-bench-variance").className = `font-semibold font-mono ${isPositiveVar ? "text-[#171717]" : "text-[#C92F24]"}`;
    }

    // 4. Payment Analysis (4 Primary Categories & Full Channel Table)
    if ($("report-pay-cash-amount")) $("report-pay-cash-amount").textContent = money(paymentGroups.cash.satang);
    if ($("report-pay-cash-pct")) $("report-pay-cash-pct").textContent = `${paymentGroups.cash.share.toFixed(1)}%`;

    if ($("report-pay-qr-amount")) $("report-pay-qr-amount").textContent = money(paymentGroups.qrPromptPay.satang);
    if ($("report-pay-qr-pct")) $("report-pay-qr-pct").textContent = `${paymentGroups.qrPromptPay.share.toFixed(1)}%`;

    if ($("report-pay-card-amount")) $("report-pay-card-amount").textContent = money(paymentGroups.card.satang);
    if ($("report-pay-card-pct")) $("report-pay-card-pct").textContent = `${paymentGroups.card.share.toFixed(1)}%`;

    if ($("report-pay-delivery-amount")) $("report-pay-delivery-amount").textContent = money(paymentGroups.delivery.satang);
    if ($("report-pay-delivery-pct")) $("report-pay-delivery-pct").textContent = `${paymentGroups.delivery.share.toFixed(1)}%`;

    // Channels breakdown ranking table
    const channelsTbody = $("report-channels-table-body") || $("report-channels-body");
    if (channelsTbody) {
      const rankedChannels = payMix.rankedChannels || [];
      if (!rankedChannels.length) {
        channelsTbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-[#737373] text-xs">ไม่มีรายการช่องทางการชำระเงิน</td></tr>`;
      } else {
        channelsTbody.innerHTML = rankedChannels.map((ch, idx) => {
          const avgPerDay = rows.length ? Math.round(ch.amount / rows.length) : 0;
          return `
            <tr class="hover:bg-[#FAFAF9] transition border-b border-[#E5E5E5] last:border-0 text-xs">
              <td class="p-2.5 sm:p-3 text-center text-[#737373] font-mono font-medium">${idx + 1}</td>
              <td class="p-2.5 sm:p-3 font-semibold text-[#171717]">${esc(ch.name)}</td>
              <td class="p-2.5 sm:p-3"><span class="pill bg-[#F5F5F4] text-[#737373] border border-[#E5E5E5] text-[10px]">${ch.category}</span></td>
              <td class="p-2.5 sm:p-3 text-right font-bold text-[#171717] font-mono">${money(ch.amount)}</td>
              <td class="p-2.5 sm:p-3 text-right text-[#737373] font-mono font-semibold">${ch.share.toFixed(1)}%</td>
              <td class="p-2.5 sm:p-3 text-right text-[#737373] font-mono">${money(avgPerDay)}</td>
            </tr>
          `;
        }).join("");
      }
    }

    // 5. Void Analysis (Financial Risk Audit)
    if ($("report-void-amount")) $("report-void-amount").textContent = money(voidAmountSatang);
    if ($("report-void-count")) $("report-void-count").textContent = `${voids.toLocaleString()} บิล`;
    if ($("report-void-rate")) $("report-void-rate").textContent = `${voidAmountPercent.toFixed(2)}%`;
    if ($("report-void-avg-bill")) $("report-void-avg-bill").textContent = money(avgVoidPerBillSatang);
    if ($("report-void-audit-note")) {
      if (voids > 0) {
        $("report-void-audit-note").innerHTML = `ตรวจพบการยกเลิกบิล <strong>${voids.toLocaleString()} รายการ</strong> รวมมูลค่าสูญเสีย <strong>${money(voidAmountSatang)}</strong> (${voidAmountPercent.toFixed(2)}% ของยอดขายรวม) กรุณาตรวจสอบเอกสารใบเสร็จ Void ประจำวัน`;
      } else {
        $("report-void-audit-note").textContent = `ไม่มีรายการยกเลิกบิล (Void) ในช่วงเวลานี้ ยอดขายและรายการแคชเชียร์สมบูรณ์ 100%`;
      }
    }

    // 6. Daily Detail (Ledger Table)
    reportLedgerPage = 1;
    renderLedgerTable();

    // 7. Management Insights
    const insightsListEl = $("report-insights-list") || $("report-insights");
    if (insightsListEl) {
      const insights = generateInsightsList({
        rows,
        total,
        target,
        varianceSatang,
        voids,
        voidAmountSatang,
        voidAmountPercent,
        achievementRate: achievementObj.rate,
        hitCount,
        best,
        lowest,
        paymentGroups,
        payMix
      });
      insightsListEl.innerHTML = insights.map(item => `
        <li class="py-2 flex items-start gap-2.5 text-xs text-[#171717] leading-relaxed">
          <span class="w-1.5 h-1.5 rounded-full bg-[#171717] shrink-0 mt-1.5"></span>
          <div>${item}</div>
        </li>
      `).join("");
    }

  } catch (error) {
    console.error("Store Business Report error:", error);
    showReportError(error);
  }
}

/**
 * Initializes DOM listeners and preset triggers for Report V2
 */
export function initReportsPage() {
  defaultReportDates();

  // Refresh & Apply buttons
  const applyBtn = $("btn-report-refresh") || $("btn-apply-report");
  applyBtn?.addEventListener("click", () => {
    document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
    loadReports();
  });

  // Export CSV
  const csvBtn = $("btn-report-csv") || $("btn-export-csv");
  csvBtn?.addEventListener("click", () => {
    const from = $("report-from")?.value || "start";
    const to = $("report-to")?.value || "end";
    exportSalesToCSV(currentReportRows, `UNO_Business_Report_V2_${from}_to_${to}.csv`);
  });

  // Print Report
  $("btn-print-report")?.addEventListener("click", () => {
    window.print();
  });

  // Date Range Presets
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      applyReportPreset(btn.dataset.preset);
    });
  });

  // Daily Detail Ledger Filters & Pagination
  const searchInput = $("report-ledger-search") || $("ledger-search");
  searchInput?.addEventListener("input", () => {
    reportLedgerPage = 1;
    renderLedgerTable();
  });

  const sortSelect = $("report-ledger-sort");
  sortSelect?.addEventListener("change", e => {
    reportSortMode = e.target.value;
    reportLedgerPage = 1;
    renderLedgerTable();
  });

  const prevBtn = $("report-ledger-prev") || $("ledger-prev");
  prevBtn?.addEventListener("click", () => {
    if (reportLedgerPage > 1) {
      reportLedgerPage--;
      renderLedgerTable();
    }
  });

  const nextBtn = $("report-ledger-next") || $("ledger-next");
  nextBtn?.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(reportFilteredRows.length / LEDGER_PAGE_SIZE));
    if (reportLedgerPage < totalPages) {
      reportLedgerPage++;
      renderLedgerTable();
    }
  });
}


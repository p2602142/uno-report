import {
  getSalesFromFirestore,
  getSaleByDateFromFirestore,
  saveSaleToFirestore,
  deleteSaleFromFirestore
} from "../repositories/salesRepository.js";
import { reconcileDailySales } from "../core/salesCalculations.js";
import { validateSaleSubmission, preventNegativeInput, isAuthPermissionError } from "../core/validation.js";
import { channels, channelLabels } from "../config/constants.js";
import { $, money, toTHB, toSatang, esc } from "../utils/currency.js";
import { dateFmt } from "../utils/date.js";
import { showToast } from "../components/toast.js";
import { getCurrentUser, getLoggedInUserIdentifier } from "../auth/auth.js";

// Page local state
let currentBusinessDate = new Date().toISOString().split("T")[0];
let currentRecord = null;
let recentSales = [];
let isSaving = false;
let isLoadingDate = false;
let editingDate = null; // for fallback modal if used
let activeDeleteDate = null; // for delete confirmation modal
let onDataChangeCallback = null;

export function setDailyDataChangeCallback(cb) {
  onDataChangeCallback = cb;
}

/**
 * Format THB currency for operational labels
 */
function formatTHBCurrency(num) {
  const val = isNaN(num) ? 0 : Number(num);
  return "฿" + val.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Show error banner on Daily Sales V2 page
 */
function showDailyError(error) {
  const banner = $("daily-v2-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-white border border-[#C92F24]/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[#171717]">
        <div class="flex items-center gap-2.5">
          <span class="text-xs font-semibold text-[#C92F24]">!</span>
          <div>
            <div class="text-xs font-semibold text-[#171717]">${isAuthErr ? "Authentication Required" : "Cannot load sales data"}</div>
            <div class="text-xs text-[#737373] mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบด้วยบัญชีพนักงานเพื่อบันทึกและตรวจสอบยอดขาย" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-daily-v2" class="px-3 py-1.5 bg-[#171717] hover:bg-[#262626] text-white text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Sign In</span>
          </button>
        ` : `
          <button id="btn-retry-daily-v2" class="px-3 py-1.5 bg-white border border-[#E5E5E5] hover:bg-[#FAFAF9] text-[#171717] text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Retry</span>
          </button>
        `}
      </div>
    `;
    banner.classList.remove("hidden");
    $("btn-retry-daily-v2")?.addEventListener("click", () => {
      banner.classList.add("hidden");
      loadDailySales();
    });
    $("btn-login-prompt-daily-v2")?.addEventListener("click", () => {
      $("auth-modal")?.classList.remove("hidden");
    });
  }
}

/**
 * Show success banner on Daily Sales V2 page
 */
function showDailySuccess(message) {
  const banner = $("daily-v2-success-banner");
  if (!banner) return;
  banner.innerHTML = `
    <div class="p-3 bg-white border border-[#E5E5E5] rounded-lg flex items-center justify-between gap-3 text-[#171717] transition-all duration-150">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-[#171717]">✓</span>
        <span class="text-xs font-medium text-[#171717]">${esc(message)}</span>
      </div>
      <button type="button" id="btn-close-daily-success" class="text-[#737373] hover:text-[#171717] text-xs p-1 cursor-pointer">✕</button>
    </div>
  `;
  banner.classList.remove("hidden");
  $("btn-close-daily-success")?.addEventListener("click", () => {
    banner.classList.add("hidden");
  });
}

/**
 * Real-time operational validation & reconciliation calculations for Daily Sales V2
 */
export function updateDailyReconciliation() {
  const totalRaw = parseFloat($("daily-v2-total")?.value);
  const totalVal = isNaN(totalRaw) ? 0 : totalRaw;
  const voidBillRaw = parseInt($("daily-v2-void-bill")?.value, 10);
  const voidBill = isNaN(voidBillRaw) ? 0 : voidBillRaw;
  const voidAmountRaw = parseFloat($("daily-v2-void-amount")?.value);
  const voidAmount = isNaN(voidAmountRaw) ? 0 : voidAmountRaw;

  // Check for negative numbers
  let hasNegative = totalRaw < 0 || voidBill < 0 || voidAmount < 0;

  // Breakdown summation & category subtotals
  let counterSum = 0;
  let deliverySum = 0;
  let paySum = 0;

  channels.forEach(ch => {
    const input = $(`daily-v2-${ch}`);
    const rawVal = parseFloat(input?.value);
    const val = isNaN(rawVal) ? 0 : rawVal;
    if (rawVal < 0) hasNegative = true;

    if (ch === "lineMan" || ch === "grab") {
      deliverySum += val;
    } else {
      counterSum += val;
    }
    paySum += val;
  });

  // Display Total in Thai Baht words/formatted text
  if ($("daily-v2-total-text")) {
    $("daily-v2-total-text").textContent = formatTHBCurrency(totalVal);
  }

  // Update breakdown sum and category subtotals
  if ($("daily-v2-breakdown-sum")) {
    $("daily-v2-breakdown-sum").textContent = formatTHBCurrency(paySum);
  }
  if ($("daily-v2-counter-subtotal")) {
    $("daily-v2-counter-subtotal").textContent = `Subtotal: ${formatTHBCurrency(counterSum)}`;
  }
  if ($("daily-v2-delivery-subtotal")) {
    $("daily-v2-delivery-subtotal").textContent = `Subtotal: ${formatTHBCurrency(deliverySum)}`;
  }

  // Audit calculations
  const totalSatang = toSatang(totalVal);
  const breakdownSatang = toSatang(paySum);
  const recon = reconcileDailySales(totalSatang, breakdownSatang);

  // Update Audit numbers
  if ($("daily-v2-audit-total")) $("daily-v2-audit-total").textContent = formatTHBCurrency(totalVal);
  if ($("daily-v2-audit-breakdown")) $("daily-v2-audit-breakdown").textContent = formatTHBCurrency(paySum);
  if ($("daily-v2-recon-diff")) $("daily-v2-recon-diff").textContent = formatTHBCurrency(recon.differenceTHB);

  const reconBox = $("daily-v2-recon-box");
  const reconIcon = $("daily-v2-recon-icon");
  const reconTitle = $("daily-v2-recon-title");
  const reconDesc = $("daily-v2-recon-desc");
  const reconStatus = $("daily-v2-audit-status");
  const fixMismatchBtn = $("btn-daily-v2-fix-mismatch");
  const submitBtn = $("btn-daily-v2-submit");
  const validationMsg = $("daily-v2-validation-msg");
  const validationText = $("daily-v2-validation-text");

  let isValid = true;
  let validationError = "";

  if (hasNegative) {
    isValid = false;
    validationError = "⚠️ ห้ามระบุค่าติดลบในยอดขาย หรือช่องทางชำระเงิน";
  } else if (!recon.isBalanced) {
    isValid = false;
    const diffFormatted = formatTHBCurrency(recon.differenceTHB);
    if (totalVal > paySum) {
      validationError = `ยอดขายรวม มากกว่า ผลรวมช่องทางชำระเงิน ${diffFormatted} (กรุณาปรับยอดให้ตรงกัน)`;
    } else {
      validationError = `ยอดขายรวม น้อยกว่า ผลรวมช่องทางชำระเงิน ${diffFormatted} (กรุณาปรับยอดให้ตรงกัน)`;
    }
  }

  // UI state for Balanced vs Mismatch
  if (recon.isBalanced && !hasNegative) {
    if (reconBox) {
      reconBox.className = "p-4 rounded-lg border transition-all duration-150 bg-white border-[#E5E5E5] text-[#171717] space-y-3";
    }
    if (reconIcon) {
      reconIcon.className = "w-6 h-6 rounded bg-[#F5F5F4] text-[#171717] flex items-center justify-center font-medium text-xs shrink-0 border border-[#E5E5E5]";
      reconIcon.textContent = "✓";
    }
    if (reconTitle) {
      reconTitle.textContent = "✓ Balanced";
      reconTitle.className = "text-xs sm:text-sm font-semibold text-[#171717]";
    }
    if (reconDesc) {
      reconDesc.textContent = `ยอดขายรวมตรงกับยอดแจกแจงชำระเงิน (${formatTHBCurrency(totalVal)})`;
      reconDesc.className = "text-xs text-[#737373]";
    }
    if (reconStatus) {
      reconStatus.textContent = "Balanced";
      reconStatus.className = "text-[#171717] font-medium";
    }
    if (fixMismatchBtn) fixMismatchBtn.classList.add("hidden");
  } else {
    if (reconBox) {
      reconBox.className = "p-4 rounded-lg border transition-all duration-150 bg-white border-[#C92F24]/30 text-[#171717] space-y-3";
    }
    if (reconIcon) {
      reconIcon.className = "w-6 h-6 rounded bg-[#FAFAF9] text-[#C92F24] flex items-center justify-center font-semibold text-xs shrink-0 border border-[#C92F24]/30";
      reconIcon.textContent = "!";
    }
    if (reconTitle) {
      reconTitle.textContent = "⚠ Payment mismatch";
      reconTitle.className = "text-xs sm:text-sm font-semibold text-[#C92F24]";
    }
    if (reconDesc) {
      reconDesc.textContent = validationError || `Difference: ${formatTHBCurrency(recon.differenceTHB)}`;
      reconDesc.className = "text-xs text-[#C92F24]";
    }
    if (reconStatus) {
      reconStatus.textContent = "Mismatch";
      reconStatus.className = "text-[#C92F24] font-medium";
    }
    if (fixMismatchBtn) fixMismatchBtn.classList.remove("hidden");
  }

  // Submission validation message banner
  if (validationMsg && validationText) {
    if (!isValid) {
      validationText.textContent = validationError;
      validationMsg.classList.remove("hidden");
    } else {
      validationMsg.classList.add("hidden");
    }
  }

  // Prevent accidental submission when critical validation fails
  if (submitBtn) {
    submitBtn.disabled = !isValid || isSaving || isLoadingDate;
  }

  return {
    isValid,
    validationError,
    recon,
    totalVal,
    paySum,
    counterSum,
    deliverySum
  };
}

/**
 * Load an existing record from Firestore for a given business date
 */
export async function loadRecordForDate(date) {
  if (!date) return;
  currentBusinessDate = date;

  const dateInput = $("daily-v2-date");
  if (dateInput && dateInput.value !== date) {
    dateInput.value = date;
  }

  const indicator = $("daily-v2-loading-indicator");
  if (indicator) indicator.classList.remove("hidden");
  isLoadingDate = true;

  try {
    const record = await getSaleByDateFromFirestore(date);
    currentRecord = record;

    const badge = $("daily-v2-record-badge");
    const meta = $("daily-v2-record-meta");
    const submitText = $("btn-daily-v2-submit-text");

    if (record) {
      // Step 2: Load existing record
      if ($("daily-v2-total")) {
        $("daily-v2-total").value = toTHB(record.totalSalesSatang).toFixed(1);
      }
      channels.forEach(ch => {
        const el = $(`daily-v2-${ch}`);
        if (el) {
          el.value = toTHB(record.payments?.[ch] || 0).toFixed(1);
        }
      });
      if ($("daily-v2-void-bill")) {
        $("daily-v2-void-bill").value = record.voidBill || 0;
      }
      if ($("daily-v2-void-amount")) {
        $("daily-v2-void-amount").value = toTHB(record.voidAmountSatang || 0).toFixed(1);
      }

      // Existing record indicator
      if (badge) {
        badge.className = "pill bg-[#F5F5F4] text-[#171717] border border-[#E5E5E5]";
        badge.innerHTML = `<span>Existing Record</span>`;
      }
      if (meta) {
        const updateTime = record.updatedAt?.toDate ? record.updatedAt.toDate().toLocaleString("th-TH") : "ไม่ระบุเวลา";
        meta.textContent = `Last updated: ${updateTime} by ${record.updatedBy || "Staff"}`;
      }
      if (submitText) {
        submitText.textContent = "Update record";
      }
    } else {
      // New record state
      clearDailyFormFields(false); // clear numbers without altering date
      if (badge) {
        badge.className = "pill bg-[#FAFAF9] text-[#737373] border border-[#E5E5E5]";
        badge.innerHTML = `<span>New Entry</span>`;
      }
      if (meta) {
        meta.textContent = `No sales recorded for ${dateFmt(date)}`;
      }
      if (submitText) {
        submitText.textContent = "Save record";
      }
    }

    updateDailyReconciliation();
  } catch (err) {
    console.error("Failed to load record for date:", date, err);
    showDailyError(err);
  } finally {
    isLoadingDate = false;
    if (indicator) indicator.classList.add("hidden");
    const submitBtn = $("btn-daily-v2-submit");
    if (submitBtn) {
      submitBtn.disabled = !updateDailyReconciliation().isValid;
    }
  }
}

/**
 * Clear form fields
 */
export function clearDailyFormFields(clearTotal = true) {
  if (clearTotal && $("daily-v2-total")) {
    $("daily-v2-total").value = "";
  }
  channels.forEach(ch => {
    const input = $(`daily-v2-${ch}`);
    if (input) input.value = "0";
  });
  if ($("daily-v2-void-bill")) $("daily-v2-void-bill").value = "0";
  if ($("daily-v2-void-amount")) $("daily-v2-void-amount").value = "0";
  updateDailyReconciliation();
}

/**
 * Duplicate previous day's numbers into current date
 */
export async function duplicatePreviousDay() {
  const currentDate = $("daily-v2-date")?.value || currentBusinessDate;
  if (!currentDate) return;

  const d = new Date(currentDate);
  d.setDate(d.getDate() - 1);
  const prevDateStr = d.toISOString().split("T")[0];

  const indicator = $("daily-v2-loading-indicator");
  if (indicator) indicator.classList.remove("hidden");

  try {
    const prevRecord = await getSaleByDateFromFirestore(prevDateStr);
    if (!prevRecord) {
      showToast(`ไม่พบข้อมูลยอดขายของวันก่อนหน้า (${dateFmt(prevDateStr)})`, "danger");
      return;
    }

    // Populate from previous day
    if ($("daily-v2-total")) {
      $("daily-v2-total").value = toTHB(prevRecord.totalSalesSatang).toFixed(1);
    }
    channels.forEach(ch => {
      const el = $(`daily-v2-${ch}`);
      if (el) {
        el.value = toTHB(prevRecord.payments?.[ch] || 0).toFixed(1);
      }
    });
    if ($("daily-v2-void-bill")) {
      $("daily-v2-void-bill").value = prevRecord.voidBill || 0;
    }
    if ($("daily-v2-void-amount")) {
      $("daily-v2-void-amount").value = toTHB(prevRecord.voidAmountSatang || 0).toFixed(1);
    }

    updateDailyReconciliation();
    showToast(`คัดลอกข้อมูลจากวันก่อนหน้า (${dateFmt(prevDateStr)}) เรียบร้อยแล้ว สามารถปรับแก้ตัวเลขก่อนบันทึก`, "success");
  } catch (err) {
    console.error("Duplicate previous day error:", err);
    showToast("เกิดข้อผิดพลาดในการคัดลอกข้อมูล: " + err.message, "danger");
  } finally {
    if (indicator) indicator.classList.add("hidden");
  }
}

/**
 * Render recent submissions table for quick load
 */
export function renderRecentTable(sales) {
  const body = $("daily-v2-recent-table-body");
  if (!body) return;

  const recent = (sales || []).slice(0, 7);
  if (!recent.length) {
    body.innerHTML = `<tr><td colspan="8" class="p-4 text-center text-neutral-400">ยังไม่มีประวัติการบันทึก</td></tr>`;
    return;
  }

  body.innerHTML = recent.map(row => {
    let counterSatang = 0;
    let deliverySatang = 0;
    channels.forEach(ch => {
      const val = row.payments?.[ch] || 0;
      if (ch === "lineMan" || ch === "grab") deliverySatang += val;
      else counterSatang += val;
    });

    const isCurrentActive = row.date === currentBusinessDate;

    return `
      <tr class="hover:bg-[#FAFAF9] cursor-pointer transition ${isCurrentActive ? "bg-[#FAFAF9] font-medium" : ""}" data-date="${row.date}">
        <td class="p-2 font-medium text-[#171717] flex items-center gap-1.5">
          ${isCurrentActive ? '<span class="w-1.5 h-1.5 rounded-full bg-[#171717]"></span>' : ''}
          <span>${dateFmt(row.date)}</span>
        </td>
        <td class="p-2 text-right font-semibold text-[#171717] font-mono">${money(row.totalSalesSatang)}</td>
        <td class="p-2 text-right text-[#737373] font-mono">${money(counterSatang)}</td>
        <td class="p-2 text-right text-[#737373] font-mono">${money(deliverySatang)}</td>
        <td class="p-2 text-center ${row.voidBill ? "text-[#C92F24] font-medium" : "text-[#737373]"}">${row.voidBill || 0}</td>
        <td class="p-2 text-right text-[#737373] font-mono">${money(row.voidAmountSatang || 0)}</td>
        <td class="p-2 text-xs text-[#737373]">${esc(row.updatedBy || "Staff")}</td>
        <td class="p-2 text-center">
          <button type="button" class="btn-load-recent px-2 py-0.5 text-xs text-[#171717] bg-[#FAFAF9] hover:bg-[#F5F5F4] border border-[#E5E5E5] rounded transition cursor-pointer" data-date="${row.date}">
            Load
          </button>
        </td>
      </tr>
    `;
  }).join("");

  body.querySelectorAll("tr[data-date]").forEach(tr => {
    tr.addEventListener("click", () => {
      const date = tr.dataset.date;
      if (date) loadRecordForDate(date);
    });
  });
}

/**
 * Main Daily Sales Page Loader called by router
 */
export async function loadDailySales() {
  if (!getCurrentUser()) {
    showDailyError({ message: "กรุณาเข้าสู่ระบบก่อนใช้งานระบบบันทึกยอดขาย" });
    return;
  }

  const errBanner = $("daily-v2-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  try {
    // 1. Fetch recent sales records
    recentSales = await getSalesFromFirestore("2020-01-01", "2099-12-31");
    renderRecentTable(recentSales);

    // 2. Set business date to today or existing selection
    const selectedDate = $("daily-v2-date")?.value || currentBusinessDate;
    await loadRecordForDate(selectedDate);
  } catch (error) {
    console.error("Daily Sales V2 loader error:", error);
    showDailyError(error);
  }
}

/**
 * Initialize event listeners for Daily Sales V2
 */
export function initDailyPage() {
  // Step 1: Business date picker & navigation helpers
  const dateInput = $("daily-v2-date");
  if (dateInput) {
    dateInput.value = currentBusinessDate;
    dateInput.addEventListener("change", e => {
      loadRecordForDate(e.target.value);
    });
  }

  // Stepper arrows
  $("btn-daily-v2-prev-day")?.addEventListener("click", () => {
    const curr = $("daily-v2-date")?.value || currentBusinessDate;
    const d = new Date(curr);
    d.setDate(d.getDate() - 1);
    const prev = d.toISOString().split("T")[0];
    loadRecordForDate(prev);
  });

  $("btn-daily-v2-next-day")?.addEventListener("click", () => {
    const curr = $("daily-v2-date")?.value || currentBusinessDate;
    const d = new Date(curr);
    d.setDate(d.getDate() + 1);
    const next = d.toISOString().split("T")[0];
    loadRecordForDate(next);
  });

  $("btn-daily-v2-today")?.addEventListener("click", () => {
    const today = new Date().toISOString().split("T")[0];
    loadRecordForDate(today);
  });

  $("btn-daily-v2-yesterday")?.addEventListener("click", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yest = d.toISOString().split("T")[0];
    loadRecordForDate(yest);
  });

  // Duplicate button
  $("btn-daily-v2-duplicate")?.addEventListener("click", duplicatePreviousDay);

  // Clear buttons
  $("btn-daily-v2-clear")?.addEventListener("click", () => {
    clearDailyFormFields(true);
    showToast("ล้างข้อมูลฟอร์มเรียบร้อยแล้ว", "info");
  });

  $("btn-daily-v2-clear-breakdown")?.addEventListener("click", () => {
    clearDailyFormFields(false);
  });

  $("btn-daily-v2-reset-record")?.addEventListener("click", () => {
    const curr = $("daily-v2-date")?.value || currentBusinessDate;
    loadRecordForDate(curr);
    showToast("โหลดข้อมูลเดิมจากระบบเรียบร้อย", "info");
  });

  // Step 3: Total sales inputs and prevention of negative inputs
  preventNegativeInput($("daily-v2-total"), updateDailyReconciliation);
  preventNegativeInput($("daily-v2-void-bill"), updateDailyReconciliation);
  preventNegativeInput($("daily-v2-void-amount"), updateDailyReconciliation);
  channels.forEach(ch => {
    preventNegativeInput($(`daily-v2-${ch}`), updateDailyReconciliation);
  });

  // Real-time recalculations on any input
  $("daily-v2-total")?.addEventListener("input", updateDailyReconciliation);
  $("daily-v2-void-bill")?.addEventListener("input", updateDailyReconciliation);
  $("daily-v2-void-amount")?.addEventListener("input", updateDailyReconciliation);
  channels.forEach(ch => {
    $(`daily-v2-${ch}`)?.addEventListener("input", updateDailyReconciliation);
  });

  // Auto-sum breakdown into Total Sales
  const autoSumFn = () => {
    let paySum = 0;
    channels.forEach(ch => {
      const val = parseFloat($(`daily-v2-${ch}`)?.value || 0);
      paySum += Math.max(0, isNaN(val) ? 0 : val);
    });
    if ($("daily-v2-total")) {
      $("daily-v2-total").value = paySum.toFixed(1);
      updateDailyReconciliation();
      showToast(`ดึงยอดรวมจากช่องทางชำระเงินอัตโนมัติ: ${formatTHBCurrency(paySum)}`, "success");
    }
  };

  $("btn-daily-v2-autosum")?.addEventListener("click", autoSumFn);
  $("btn-daily-v2-fix-mismatch")?.addEventListener("click", autoSumFn);

  // Form submission (Save / Update)
  $("form-daily-v2")?.addEventListener("submit", async e => {
    e.preventDefault();

    const date = $("daily-v2-date")?.value;
    const saleTotalVal = parseFloat($("daily-v2-total")?.value);
    const voidBill = parseInt($("daily-v2-void-bill")?.value, 10);
    const voidAmountVal = parseFloat($("daily-v2-void-amount")?.value);

    const channelValues = {};
    channels.forEach(ch => {
      channelValues[ch] = $(`daily-v2-${ch}`)?.value || 0;
    });

    const validationResult = validateSaleSubmission({
      date,
      saleTotalVal,
      voidBill,
      voidAmountVal,
      channelValues
    });

    if (!validationResult.valid) {
      showToast(validationResult.error, "danger");
      return;
    }

    const payload = validationResult.data;
    const currentUserIdentifier = getLoggedInUserIdentifier();

    const submitBtn = $("btn-daily-v2-submit");
    const submitText = $("btn-daily-v2-submit-text");
    isSaving = true;
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.textContent = "กำลังบันทึกข้อมูล...";

    try {
      await saveSaleToFirestore(payload, currentUserIdentifier);
      const isExisting = Boolean(currentRecord);
      const actionVerb = isExisting ? "อัปเดต" : "บันทึก";
      showDailySuccess(`✓ ${actionVerb}ยอดขายประจำวันที่ ${dateFmt(date)} สำเร็จเรียบร้อยแล้ว (${formatTHBCurrency(saleTotalVal)})`);
      showToast(`${actionVerb}ยอดขายวันที่ ${dateFmt(date)} สำเร็จเรียบร้อยแล้ว`, "success");

      // Reload record to update existing record indicator and recent table
      await loadDailySales();

      if (typeof onDataChangeCallback === "function") {
        onDataChangeCallback();
      }
    } catch (error) {
      console.error("Save daily sale error:", error);
      showToast("เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + error.message, "danger");
      showDailyError(error);
    } finally {
      isSaving = false;
      if (submitBtn) submitBtn.disabled = false;
      if (submitText) {
        submitText.textContent = currentRecord ? "อัปเดตยอดขาย (Update Record)" : "บันทึกยอดขาย (Save Record)";
      }
    }
  });

  // Modal handlers for legacy or auxiliary triggers
  $("btn-close-sale")?.addEventListener("click", () => $("modal-sale")?.classList.add("hidden"));
  $("btn-cancel-sale")?.addEventListener("click", () => $("modal-sale")?.classList.add("hidden"));
  $("btn-close-detail")?.addEventListener("click", () => $("modal-detail")?.classList.add("hidden"));

  // Delete confirmation modal handlers
  $("btn-cancel-delete")?.addEventListener("click", () => {
    $("modal-delete")?.classList.add("hidden");
    activeDeleteDate = null;
  });

  $("btn-confirm-delete")?.addEventListener("click", async () => {
    if (!activeDeleteDate) return;
    const dateToDelete = activeDeleteDate;
    try {
      await deleteSaleFromFirestore(dateToDelete);
      $("modal-delete")?.classList.add("hidden");
      showToast(`ลบข้อมูลวันที่ ${dateFmt(dateToDelete)} เรียบร้อยแล้ว`, "success");
      activeDeleteDate = null;
      await loadDailySales();
      if (typeof onDataChangeCallback === "function") {
        onDataChangeCallback();
      }
    } catch (error) {
      console.error("Delete error:", error);
      showToast("เกิดข้อผิดพลาดในการลบข้อมูล: " + error.message, "danger");
    }
  });
}

/**
 * Trigger delete modal for a given date
 */
export function triggerDeleteModal(date) {
  activeDeleteDate = date;
  if ($("delete-date-target")) $("delete-date-target").textContent = dateFmt(date);
  $("modal-delete")?.classList.remove("hidden");
}

/**
 * Fallback openSaleForm if opened via other pages like History
 */
export function openSaleForm(date = "", row = null) {
  // If row or date passed, navigate to Daily Sales and load date!
  if (date || row?.date) {
    const targetDate = date || row?.date;
    loadRecordForDate(targetDate);
    // Switch page if router available
    const dailyBtn = document.querySelector('.nav-btn[data-page="page-daily"]');
    if (dailyBtn) dailyBtn.click();
    return;
  }
  $("modal-sale")?.classList.remove("hidden");
}

export function closeSaleForm() {
  $("modal-sale")?.classList.add("hidden");
}

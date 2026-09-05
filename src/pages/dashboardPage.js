import { getSalesFromFirestore } from "../repositories/salesRepository.js";
import { getMonthlyTargetSatangFromFirestore } from "../repositories/targetRepository.js";
import { calculateDailyTargetFromMonthly, getAchievementStatus, calculatePaymentMixSummary, renderPaymentMixHTML } from "../core/salesCalculations.js";
import { isAuthPermissionError } from "../core/validation.js";
import { renderDashboardCharts } from "../components/charts.js";
import { showToast } from "../components/toast.js";
import { $, money, esc } from "../utils/currency.js";
import { dateFmt, daysInMonth } from "../utils/date.js";
import { getCurrentUser } from "../auth/auth.js";

function showDashboardError(error) {
  const banner = $("dash-error-banner");
  const isAuthErr = isAuthPermissionError(error);
  if (banner) {
    banner.innerHTML = `
      <div class="p-4 bg-white border border-[#C92F24]/30 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[#171717]">
        <div class="flex items-center gap-2.5">
          <span class="text-xs font-semibold text-[#C92F24]">!</span>
          <div>
            <div class="text-xs font-semibold text-[#171717]">${isAuthErr ? "Authentication Required" : "Cannot load dashboard"}</div>
            <div class="text-xs text-[#737373] mt-0.5">${isAuthErr ? "กรุณาเข้าสู่ระบบเพื่อดูข้อมูลแดชบอร์ดสาขา" : esc(error?.message || "ระบบขัดข้องหรือไม่มีการเชื่อมต่อ")}</div>
          </div>
        </div>
        ${isAuthErr ? `
          <button id="btn-login-prompt-dash" class="px-3 py-1.5 bg-[#171717] hover:bg-[#262626] text-white text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Sign In</span>
          </button>
        ` : `
          <button id="btn-retry-dash" class="px-3 py-1.5 bg-white border border-[#E5E5E5] hover:bg-[#FAFAF9] text-[#171717] text-xs font-medium rounded-md transition shrink-0 cursor-pointer">
            <span>Retry</span>
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

function renderDashboardAlerts(rows, today, voids, voidAmountSatang, projection, monthlyTargetSatang, dailyTargetSatang) {
  const alerts = [];
  if (today === 0) alerts.push(["warning", "ยังไม่มีการบันทึกยอดขายของวันนี้"]);
  if (today > 0 && today < dailyTargetSatang) alerts.push(["warning", `ยอดวันนี้ต่ำกว่า Daily Target ${money(dailyTargetSatang - today)}`]);
  if (projection < monthlyTargetSatang) alerts.push(["warning", "Projection สิ้นเดือนยังต่ำกว่า Monthly Target"]);
  if (voids > 0) alerts.push(["danger", `พบ Void Bills สะสม ${voids.toLocaleString()} บิล (มูลค่า ${money(voidAmountSatang)})`]);
  if (!alerts.length) alerts.push(["success", "ผลการดำเนินงานอยู่ในเกณฑ์ปกติ"]);

  if ($("dash-alerts")) {
    $("dash-alerts").innerHTML = alerts.map(([type, message]) => {
      const dot = type === "danger" ? "bg-[#C92F24]" : type === "warning" ? "bg-[#d97706]" : "bg-[#16a34a]";
      return `
        <div class="flex items-center gap-2 py-1.5 text-xs text-[#171717]">
          <span class="w-1.5 h-1.5 rounded-full ${dot} shrink-0"></span>
          <span class="text-[#737373] text-[11px] leading-relaxed">${esc(message)}</span>
        </div>
      `;
    }).join("");
  }
}

function renderRecent(rows, dailyTargetSatang) {
  if (!$("recent-sales-body")) return;
  const recent = rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);

  $("recent-sales-body").innerHTML = recent.map(row => {
    const ach = getAchievementStatus(row.totalSalesSatang, dailyTargetSatang);
    return `
      <tr class="border-b border-[#E5E5E5] last:border-0 hover:bg-[#FAFAF9] transition">
        <td class="py-2.5 text-xs font-medium text-[#171717]">${dateFmt(row.date)}</td>
        <td class="py-2.5 text-right text-xs font-semibold text-[#171717]">${money(row.totalSalesSatang)}</td>
        <td class="py-2.5 text-right text-xs ${ach.textClass}">${ach.rate.toFixed(1)}%</td>
        <td class="py-2.5 text-center">
          <span class="pill ${ach.pillClass}">
            ${ach.shortLabel}
          </span>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" class="p-4 text-center text-[#737373]">ยังไม่มีข้อมูล</td></tr>`;
}

export async function loadDashboard() {
  if (!getCurrentUser()) {
    return;
  }
  const errBanner = $("dash-error-banner");
  if (errBanner) errBanner.classList.add("hidden");

  try {
    const now = new Date();
    const year = now.getFullYear();
    const monthIdx = now.getMonth();
    const monthStr = String(monthIdx + 1).padStart(2, "0");
    const currentMonthKey = `${year}-${monthStr}`;
    const totalDaysInMonth = daysInMonth(year, monthIdx + 1);

    const rows = await getSalesFromFirestore(
      `${year}-${monthStr}-01`,
      `${year}-${monthStr}-${String(totalDaysInMonth).padStart(2, "0")}`
    );

    const today = now.toISOString().split("T")[0];
    const monthlyTargetSatang = await getMonthlyTargetSatangFromFirestore(currentMonthKey);
    const dailyTargetSatang = calculateDailyTargetFromMonthly(monthlyTargetSatang, currentMonthKey);

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

    // Also support any alternate pace elements if present in template
    if ($("dash-remaining-days")) $("dash-remaining-days").textContent = `${daysLeftInMonth} วัน`;
    if ($("dash-pace-needed")) $("dash-pace-needed").textContent = money(paceNeededPerDaySatang);
    if ($("dash-banner-target")) $("dash-banner-target").textContent = money(monthlyTargetSatang);

    // Delivery GP Estimator
    if ($("dash-gross-delivery")) $("dash-gross-delivery").textContent = money(payMix.deliveryTotal);
    if ($("dash-net-delivery")) $("dash-net-delivery").textContent = money(payMix.netDeliverySatang);
    if ($("dash-gp-fee")) $("dash-gp-fee").textContent = money(payMix.deliveryGpSatang);
    if ($("dash-gp-pct")) $("dash-gp-pct").textContent = `${payMix.deliveryShare.toFixed(1)}% ของยอดขายรวม`;

    renderDashboardCharts(
      {
        trendCanvas: $("chart-sales-trend"),
        targetCanvas: $("chart-target"),
        mixCanvas: $("chart-payment-mix")
      },
      { rows, payMix, total, monthlyTargetSatang, dailyTargetSatang }
    );

    if ($("dash-payment-summary")) {
      $("dash-payment-summary").innerHTML = renderPaymentMixHTML(payMix.rankedChannels, payMix.totalFromChannels, 5, false);
    }

    renderDashboardAlerts(rows, todaySales, voids, voidAmountSatang, projection, monthlyTargetSatang, dailyTargetSatang);
    renderRecent(rows, dailyTargetSatang);
  } catch (error) {
    console.error("Dashboard error:", error);
    showDashboardError(error);
  }
}

import { channels, channelLabels, channelCategories } from "../config/constants.js";
import { daysInMonth } from "../utils/date.js";
import { money, esc } from "../utils/currency.js";

/**
 * Pure calculation: compute daily run-rate target from monthly target.
 */
export function calculateDailyTargetFromMonthly(monthlyTargetSatang, monthKeyOrDate) {
  if (!monthlyTargetSatang || !monthKeyOrDate) return 0;
  const ym = String(monthKeyOrDate).slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return 0;
  const dim = daysInMonth(y, m);
  return dim ? Math.round(monthlyTargetSatang / dim) : 0;
}

/**
 * Central Achievement Status Function: 3-tier system used identically across views.
 * - Above Target: >= 100%
 * - Near Target:  80% - 99.9%
 * - Below Target: < 80%
 */
export function getAchievementStatus(salesSatang, targetSatang) {
  const target = Math.max(0, targetSatang || 0);
  const sales = Math.max(0, salesSatang || 0);
  const rate = target > 0 ? (sales / target) * 100 : (sales > 0 ? 100 : 0);

  if (rate >= 100) {
    return {
      rate,
      status: "above",
      label: "Above Target",
      shortLabel: "Above",
      pillClass: "bg-[#F5F5F4] text-[#171717] border border-[#E5E5E5]",
      textClass: "text-[#171717]"
    };
  }
  if (rate >= 80) {
    return {
      rate,
      status: "near",
      label: "Near Target",
      shortLabel: "Near",
      pillClass: "bg-[#F5F5F4] text-[#737373] border border-[#E5E5E5]",
      textClass: "text-[#737373]"
    };
  }
  return {
    rate,
    status: "below",
    label: "Below Target",
    shortLabel: "Below",
    pillClass: "bg-[#F5F5F4] text-[#737373] border border-[#E5E5E5]",
    textClass: "text-[#737373]"
  };
}

/**
 * Pure calculation: Payment Mix Summary.
 */
export function calculatePaymentMixSummary(rowsOrTotals, explicitTotalSales = null) {
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
 * Reconciliation calculation for Daily Sales V2:
 * Compares Total Sales vs Payment Breakdown Total.
 * Returns status, difference in Satang and THB, formatted text, and balance indicator.
 */
export function reconcileDailySales(totalSalesSatang, paymentBreakdownSatang) {
  const total = Math.round(totalSalesSatang || 0);
  const breakdown = Math.round(paymentBreakdownSatang || 0);
  const differenceSatang = total - breakdown;
  const absDiffSatang = Math.abs(differenceSatang);
  // Allowed tolerance in Satang (5 satang = 0.05 THB for minor floating point rounding)
  const isBalanced = absDiffSatang <= 5;
  const differenceTHB = absDiffSatang / 100;

  return {
    isBalanced,
    totalSalesSatang: total,
    breakdownTotalSatang: breakdown,
    differenceSatang,
    absDiffSatang,
    differenceTHB,
    status: isBalanced ? "balanced" : "mismatch",
    statusText: isBalanced ? "✓ Balanced" : "⚠ Payment mismatch",
    pillClass: isBalanced
      ? "bg-[#F5F5F4] text-[#171717] border border-[#E5E5E5]"
      : "bg-white text-[#C92F24] border border-[#C92F24]/30"
  };
}

/**
 * Reusable HTML generator for payment mix lists.
 */
export function renderPaymentMixHTML(rankedChannels, totalAmount, maxItems = null, isBordered = false) {
  const items = maxItems ? rankedChannels.slice(0, maxItems) : rankedChannels;
  if (!items.length) {
    return `<div class="text-xs text-[#A3A3A3] py-2 text-center">ไม่มีข้อมูลยอดขาย</div>`;
  }
  return items.map(item => `
    <div class="flex justify-between items-center text-xs ${isBordered ? "py-1 border-b border-[#E5E5E5] last:border-0" : "py-0.5"}">
      <span class="text-[#737373]">${esc(item.name)}</span>
      <strong class="text-[#171717] font-medium">${money(item.amount)} <span class="text-[#A3A3A3] font-normal ml-1">(${totalAmount ? ((item.amount / totalAmount) * 100).toFixed(1) : 0}%)</span></strong>
    </div>
  `).join("");
}

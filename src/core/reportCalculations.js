import { calculatePaymentMixSummary, getAchievementStatus } from "./salesCalculations.js";
import { dateFmt, getDayName } from "../utils/date.js";
import { money, toTHB } from "../utils/currency.js";

/**
 * Pure calculation: generate comprehensive business performance report model from sales rows and targets.
 */
export function calculateStorePerformanceReport(rows, targetSatangLookup = {}) {
  const enrichedRows = rows.map(r => {
    const ym = String(r.date).slice(0, 7);
    const dailyTargetSatang = targetSatangLookup[ym] || 0;
    const totalSalesSatang = r.totalSalesSatang || 0;
    const varianceSatang = totalSalesSatang - dailyTargetSatang;
    const achievement = getAchievementStatus(totalSalesSatang, dailyTargetSatang);

    // Payment groups for daily detail
    const cashSatang = r.payments?.cash || 0;
    const cardSatang = r.payments?.creditCard || 0;
    const qrPromptPaySatang = (r.payments?.promptPay || 0) + (r.payments?.qr || 0) + (r.payments?.trueMoney || 0) + (r.payments?.linePay || 0) + (r.payments?.alipay || 0) + (r.payments?.bankTransfer || 0);
    const deliverySatang = (r.payments?.lineMan || 0) + (r.payments?.grab || 0);

    return {
      ...r,
      dailyTargetSatang,
      varianceSatang,
      varianceTHB: toTHB(varianceSatang),
      achievement,
      cashSatang,
      cardSatang,
      qrPromptPaySatang,
      deliverySatang
    };
  });

  const total = enrichedRows.reduce((sum, row) => sum + (row.totalSalesSatang || 0), 0);
  const target = enrichedRows.reduce((sum, row) => sum + (row.dailyTargetSatang || 0), 0);
  const varianceSatang = total - target;
  const varianceTHB = toTHB(varianceSatang);

  const voids = enrichedRows.reduce((sum, row) => sum + (row.voidBill || 0), 0);
  const voidAmountSatang = enrichedRows.reduce((sum, row) => sum + (row.voidAmountSatang || 0), 0);
  const voidAmountPercent = total > 0 ? (voidAmountSatang / total) * 100 : 0;
  const avgVoidPerBillSatang = voids > 0 ? Math.round(voidAmountSatang / voids) : 0;

  const avg = enrichedRows.length ? Math.round(total / enrichedRows.length) : 0;
  const achievementObj = getAchievementStatus(total, target);

  const sortedBySales = enrichedRows.slice().sort((a, b) => (b.totalSalesSatang || 0) - (a.totalSalesSatang || 0));
  const best = sortedBySales[0] || null;
  const lowest = sortedBySales[sortedBySales.length - 1] || null;

  const hitCount = enrichedRows.filter(r => r.achievement.status === "above").length;
  const hitRate = enrichedRows.length ? ((hitCount / enrichedRows.length) * 100).toFixed(1) : "0.0";

  const payMix = calculatePaymentMixSummary(enrichedRows, total);

  // Grouped Payment Categories: Cash, QR/PromptPay, Card, Delivery
  const cashTotalSatang = enrichedRows.reduce((sum, r) => sum + (r.payments?.cash || 0), 0);
  const cardTotalSatang = enrichedRows.reduce((sum, r) => sum + (r.payments?.creditCard || 0), 0);
  const qrPromptPayTotalSatang = enrichedRows.reduce((sum, r) => {
    return sum + (r.payments?.promptPay || 0) + (r.payments?.qr || 0) + (r.payments?.trueMoney || 0) + (r.payments?.linePay || 0) + (r.payments?.alipay || 0) + (r.payments?.bankTransfer || 0);
  }, 0);
  const deliveryTotalSatang = enrichedRows.reduce((sum, r) => {
    return sum + (r.payments?.lineMan || 0) + (r.payments?.grab || 0);
  }, 0);

  const paymentGroups = {
    cash: {
      satang: cashTotalSatang,
      share: total > 0 ? (cashTotalSatang / total) * 100 : 0
    },
    qrPromptPay: {
      satang: qrPromptPayTotalSatang,
      share: total > 0 ? (qrPromptPayTotalSatang / total) * 100 : 0
    },
    card: {
      satang: cardTotalSatang,
      share: total > 0 ? (cardTotalSatang / total) * 100 : 0
    },
    delivery: {
      satang: deliveryTotalSatang,
      share: total > 0 ? (deliveryTotalSatang / total) * 100 : 0
    }
  };

  return {
    rows: enrichedRows,
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
    paymentGroups,
    sortedBySales
  };
}

/**
 * Generates audit & management insight statements for executives.
 */
export function generateInsightsList({ rows, total, target, varianceSatang, voids, voidAmountSatang, voidAmountPercent, achievementRate, hitCount, best, lowest, paymentGroups, payMix }) {
  const isPositiveVariance = (varianceSatang || 0) >= 0;
  const varianceFormatted = `${isPositiveVariance ? "+" : ""}${money(varianceSatang || 0)}`;

  const insights = [
    `ผลประกอบการรอบนี้ทำยอดขายรวม <strong>${money(total)}</strong> จากเป้าหมาย <strong>${money(target)}</strong> (Achievement <strong>${achievementRate.toFixed(1)}%</strong>, Variance <strong>${varianceFormatted}</strong>)`,
    `ยอดขายเฉลี่ยต่อวันอยู่ที่ <strong>${rows.length ? money(Math.round(total / rows.length)) : "฿0.00"}</strong> โดยสามารถทำยอดทะลุเป้าหมายรายวันได้ <strong>${hitCount} วัน</strong> จากทั้งหมด ${rows.length} วันทำการ (Hit Rate <strong>${rows.length ? ((hitCount / rows.length) * 100).toFixed(1) : 0}%</strong>)`,
    `วันที่มียอดขายสูงสุดคือ <strong>${best ? `${dateFmt(best.date)} (${getDayName(best.date)})` : "—"}</strong> ทำยอดได้ <strong>${best ? money(best.totalSalesSatang) : "฿0.00"}</strong> (${best?.dailyTargetSatang ? ((best.totalSalesSatang / best.dailyTargetSatang) * 100).toFixed(1) : 0}% ของเป้า)`,
    `วันที่มียอดขายต่ำสุดคือ <strong>${lowest ? `${dateFmt(lowest.date)} (${getDayName(lowest.date)})` : "—"}</strong> ทำยอดได้ <strong>${lowest ? money(lowest.totalSalesSatang) : "฿0.00"}</strong>`,
    `สัดส่วนการชำระเงินดิจิทัลไร้เงินสด (Cashless) คิดเป็น <strong>${payMix?.cashlessShare?.toFixed(1) || 0}%</strong> นำโดย <strong>${payMix?.topChannel?.name || "N/A"}</strong> (${payMix?.topChannel ? money(payMix.topChannel.amount) : "฿0.00"})`,
    `รายการยกเลิกบิล (Void Audit): พบ <strong>${voids.toLocaleString()} บิล</strong> รวมมูลค่าความเสียหาย <strong>${money(voidAmountSatang)}</strong> คิดเป็น <strong>${(voidAmountPercent || 0).toFixed(2)}%</strong> ของยอดขายรวม`
  ];

  return insights;
}

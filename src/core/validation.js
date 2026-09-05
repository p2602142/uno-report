import { channels, channelLabels } from "../config/constants.js";
import { toSatang } from "../utils/currency.js";
import { reconcileDailySales } from "./salesCalculations.js";

export function isAuthPermissionError(error) {
  const msg = error?.message || String(error || "");
  const code = error?.code || "";
  return (
    code === "permission-denied" ||
    msg.includes("Missing or insufficient permissions") ||
    msg.includes("permission-denied")
  );
}

export function preventNegativeInput(inputEl, onUpdate) {
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
    if (typeof onUpdate === "function") {
      onUpdate();
    }
  });
}

export function validateSaleSubmission({ date, saleTotalVal, voidBill, voidAmountVal, channelValues }) {
  if (!date) {
    return { valid: false, error: "กรุณาเลือกวันที่ (Business Date Required)" };
  }
  if (isNaN(saleTotalVal) || saleTotalVal < 0) {
    return { valid: false, error: "ยอดขาย Total Sales ต้องไม่ติดลบ (ระบุตัวเลขตั้งแต่ 0 ขึ้นไป)" };
  }
  if (isNaN(voidBill) || voidBill < 0) {
    return { valid: false, error: "จำนวนบิล Void ต้องไม่ติดลบ (ตั้งแต่ 0 ขึ้นไป)" };
  }
  if (isNaN(voidAmountVal) || voidAmountVal < 0) {
    return { valid: false, error: "มูลค่าความเสียหายจากการ Void ต้องไม่ติดลบ (ตั้งแต่ 0 ขึ้นไป)" };
  }

  const payments = {};
  for (const ch of channels) {
    const rawVal = channelValues[ch];
    const val = parseFloat(rawVal === "" || rawVal === undefined ? 0 : rawVal);
    if (isNaN(val) || val < 0) {
      return { valid: false, error: `ช่องทางชำระเงิน ${channelLabels[ch] || ch} ต้องไม่ติดลบ` };
    }
    payments[ch] = toSatang(val);
  }

  const totalSalesSatang = toSatang(saleTotalVal);
  const paymentTotal = Object.values(payments).reduce((sum, value) => sum + value, 0);

  const recon = reconcileDailySales(totalSalesSatang, paymentTotal);

  if (!recon.isBalanced) {
    return {
      valid: false,
      reconciliation: recon,
      error: `ยอดรวม Breakdown (฿${(paymentTotal / 100).toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}) ไม่ตรงกับ Total Sales (฿${(totalSalesSatang / 100).toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}) ผลต่าง: ฿${recon.differenceTHB.toLocaleString('th-TH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
    };
  }

  return {
    valid: true,
    reconciliation: recon,
    data: {
      date,
      totalSalesSatang,
      payments,
      voidBill,
      voidAmountSatang: toSatang(voidAmountVal)
    }
  };
}

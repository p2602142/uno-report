import assert from "node:assert";
import { reconcileDailySales } from "./src/core/salesCalculations.js";
import { validateSaleSubmission } from "./src/core/validation.js";
import { channels, channelLabels } from "./src/config/constants.js";
import { toSatang, toTHB } from "./src/utils/currency.js";

console.log("=== RUNNING DAILY SALES V2 OPERATIONAL UNIT TESTS ===");

// 1. Test Reconciliation - Balanced Case
{
  const totalSatang = 1250000; // 12,500.00 THB
  const breakdownSatang = 1250000;
  const result = reconcileDailySales(totalSatang, breakdownSatang);
  assert.strictEqual(result.isBalanced, true, "Should be balanced when total equals breakdown");
  assert.strictEqual(result.status, "balanced");
  assert.strictEqual(result.statusText, "✓ Balanced");
  assert.strictEqual(result.differenceSatang, 0);
  assert.strictEqual(result.differenceTHB, 0);
  console.log("✓ Test 1 Passed: Reconciliation Balanced (Equal Totals)");
}

// 2. Test Reconciliation - Payment Mismatch Case
{
  const totalSatang = 1500000; // 15,000.00 THB
  const breakdownSatang = 1350000; // 13,500.00 THB
  const result = reconcileDailySales(totalSatang, breakdownSatang);
  assert.strictEqual(result.isBalanced, false, "Should be mismatch when breakdown does not equal total");
  assert.strictEqual(result.status, "mismatch");
  assert.strictEqual(result.statusText, "⚠ Payment mismatch");
  assert.strictEqual(result.differenceSatang, 150000);
  assert.strictEqual(result.differenceTHB, 1500);
  console.log("✓ Test 2 Passed: Reconciliation Payment Mismatch (฿1,500 difference detected)");
}

// 3. Test Validation - Valid New Record Submission
{
  const validSubmission = {
    date: "2026-09-05",
    saleTotalVal: 10000.0,
    voidBill: 2,
    voidAmountVal: 150.0,
    channelValues: {
      cash: 2000.0,
      creditCard: 3000.0,
      qrPayment: 1500.0,
      promptPay: 1000.0,
      trueMoney: 500.0,
      bankTransfer: 500.0,
      linePay: 500.0,
      alipay: 0.0,
      lineMan: 500.0,
      grab: 500.0
    }
  };
  const res = validateSaleSubmission(validSubmission);
  assert.strictEqual(res.valid, true, "Valid submission must pass");
  assert.strictEqual(res.data.date, "2026-09-05");
  assert.strictEqual(res.data.totalSalesSatang, 1000000);
  assert.strictEqual(res.data.voidBill, 2);
  assert.strictEqual(res.data.voidAmountSatang, 15000);
  assert.strictEqual(res.data.payments.cash, 200000);
  console.log("✓ Test 3 Passed: Valid Daily Sales Submission & Satang Conversion");
}

// 4. Test Validation - Zero Values (Store closed or zero sales day)
{
  const zeroSubmission = {
    date: "2026-09-06",
    saleTotalVal: 0,
    voidBill: 0,
    voidAmountVal: 0,
    channelValues: {
      cash: 0,
      creditCard: 0,
      qrPayment: 0,
      promptPay: 0,
      trueMoney: 0,
      bankTransfer: 0,
      linePay: 0,
      alipay: 0,
      lineMan: 0,
      grab: 0
    }
  };
  const res = validateSaleSubmission(zeroSubmission);
  assert.strictEqual(res.valid, true, "Zero value entry must be allowed when balanced");
  assert.strictEqual(res.data.totalSalesSatang, 0);
  assert.strictEqual(res.data.voidBill, 0);
  assert.strictEqual(res.data.voidAmountSatang, 0);
  console.log("✓ Test 4 Passed: Zero Values Allowed When Balanced");
}

// 5. Test Validation - Invalid Values (Negative total sales)
{
  const negativeTotal = {
    date: "2026-09-07",
    saleTotalVal: -500,
    voidBill: 0,
    voidAmountVal: 0,
    channelValues: { cash: 0 }
  };
  const res = validateSaleSubmission(negativeTotal);
  assert.strictEqual(res.valid, false, "Negative Total Sales must be rejected");
  assert(res.error.includes("ต้องไม่ติดลบ"), "Should have clear negative value error message");
  console.log("✓ Test 5 Passed: Negative Total Sales Blocked");
}

// 6. Test Validation - Invalid Values (Negative payment channel)
{
  const negativeChannel = {
    date: "2026-09-07",
    saleTotalVal: 1000,
    voidBill: 0,
    voidAmountVal: 0,
    channelValues: {
      cash: -100,
      creditCard: 1100
    }
  };
  const res = validateSaleSubmission(negativeChannel);
  assert.strictEqual(res.valid, false, "Negative payment channel must be rejected");
  console.log("✓ Test 6 Passed: Negative Payment Channel Blocked");
}

// 7. Test Validation - Invalid Values (Negative void bills or void amount)
{
  const negativeVoid = {
    date: "2026-09-07",
    saleTotalVal: 1000,
    voidBill: -1,
    voidAmountVal: 0,
    channelValues: { cash: 1000 }
  };
  const res = validateSaleSubmission(negativeVoid);
  assert.strictEqual(res.valid, false, "Negative void bill count must be rejected");

  const negativeVoidAmt = {
    date: "2026-09-07",
    saleTotalVal: 1000,
    voidBill: 0,
    voidAmountVal: -50,
    channelValues: { cash: 1000 }
  };
  const res2 = validateSaleSubmission(negativeVoidAmt);
  assert.strictEqual(res2.valid, false, "Negative void amount must be rejected");
  console.log("✓ Test 7 Passed: Negative Void Bills and Void Amount Blocked");
}

// 8. Test Validation - Payment Mismatch Blocked
{
  const mismatchSubmission = {
    date: "2026-09-08",
    saleTotalVal: 5000,
    voidBill: 0,
    voidAmountVal: 0,
    channelValues: {
      cash: 4500 // 500 short
    }
  };
  const res = validateSaleSubmission(mismatchSubmission);
  assert.strictEqual(res.valid, false, "Mismatch between total and breakdown must be rejected");
  assert(res.error.includes("ไม่ตรงกับ Total Sales"), "Reconciliation error message expected");
  console.log("✓ Test 8 Passed: Accidental Submission Blocked on Payment Mismatch");
}

// 9. Verify All 10 Channels match constants and Firestore schema
{
  assert.strictEqual(channels.length, 10, "Must have exactly 10 payment channels");
  const expectedChannels = [
    "cash", "creditCard", "qrPayment", "promptPay", "trueMoney",
    "bankTransfer", "linePay", "alipay", "lineMan", "grab"
  ];
  expectedChannels.forEach(ch => {
    assert(channels.includes(ch), `Channel ${ch} must be present`);
    assert(typeof channelLabels[ch] === "string", `Label for ${ch} must exist`);
  });
  console.log("✓ Test 9 Passed: 10 Payment Channels Verified for Firestore Compatibility");
}

console.log("\n ALL 9 UNIT TESTS PASSED SUCCESSFULLY!");

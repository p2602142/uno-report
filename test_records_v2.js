import assert from "node:assert";
import {
  calculateDailyTargetFromMonthly,
  getAchievementStatus,
  calculatePaymentMixSummary
} from "./src/core/salesCalculations.js";
import { dateFmt, getDayName, daysInMonth } from "./src/utils/date.js";
import { money, toSatang, toTHB } from "./src/utils/currency.js";
import { channels, channelCategories } from "./src/config/constants.js";

console.log("=== RUNNING RECORDS V2 (HISTORICAL SALES LEDGER) UNIT TESTS ===");

// 1. Daily Target calculation from Monthly Target
{
  // September has 30 days
  const monthlyTargetSatang = 30000000; // 300,000 THB
  const dailyTargetSatang = calculateDailyTargetFromMonthly(monthlyTargetSatang, "2026-09-15");
  assert.strictEqual(dailyTargetSatang, 1000000, "Daily target for 30-day month should be 1/30th");
  console.log("✓ Test 1 Passed: Daily run-rate target calculation from monthly target");
}

// 2. Achievement Status Tiers
{
  // Above target: 120%
  const above = getAchievementStatus(1200000, 1000000);
  assert.strictEqual(above.status, "above");
  assert.strictEqual(above.label, "Above Target");
  assert.strictEqual(above.rate, 120);

  // Near target: 85%
  const near = getAchievementStatus(850000, 1000000);
  assert.strictEqual(near.status, "near");
  assert.strictEqual(near.label, "Near Target");
  assert.strictEqual(near.rate, 85);

  // Below target: 60%
  const below = getAchievementStatus(600000, 1000000);
  assert.strictEqual(below.status, "below");
  assert.strictEqual(below.label, "Below Target");
  assert.strictEqual(below.rate, 60);

  console.log("✓ Test 2 Passed: 3-tier Achievement Status (Above, Near, Below)");
}

// 3. Ledger Multi-Filter & Search Simulation
{
  const testRows = [
    {
      date: "2026-09-01",
      totalSalesSatang: 1200000,
      dailyTargetSatang: 1000000,
      achievementStatus: { status: "above", rate: 120 },
      voidBill: 0,
      voidAmountSatang: 0,
      createdBy: "manager@unocoffee.com",
      updatedBy: "manager@unocoffee.com"
    },
    {
      date: "2026-09-02",
      totalSalesSatang: 900000,
      dailyTargetSatang: 1000000,
      achievementStatus: { status: "near", rate: 90 },
      voidBill: 2,
      voidAmountSatang: 15000,
      createdBy: "staff1@unocoffee.com",
      updatedBy: "staff1@unocoffee.com"
    },
    {
      date: "2026-09-03",
      totalSalesSatang: 500000,
      dailyTargetSatang: 1000000,
      achievementStatus: { status: "below", rate: 50 },
      voidBill: 0,
      voidAmountSatang: 0,
      createdBy: "staff2@unocoffee.com",
      updatedBy: "staff2@unocoffee.com"
    }
  ];

  // Search by createdBy
  const searchResult = testRows.filter(r => r.createdBy.includes("manager"));
  assert.strictEqual(searchResult.length, 1);
  assert.strictEqual(searchResult[0].date, "2026-09-01");

  // Filter by status 'has-void'
  const voidResult = testRows.filter(r => r.voidBill > 0);
  assert.strictEqual(voidResult.length, 1);
  assert.strictEqual(voidResult[0].date, "2026-09-02");

  // Date range filter
  const rangeResult = testRows.filter(r => r.date >= "2026-09-02" && r.date <= "2026-09-03");
  assert.strictEqual(rangeResult.length, 2);

  console.log("✓ Test 3 Passed: Ledger search, status filtering, and date range filtering");
}

// 4. Ledger Sorting (Default: date-desc)
{
  const rows = [
    { date: "2026-09-01", totalSalesSatang: 1000000 },
    { date: "2026-09-05", totalSalesSatang: 1500000 },
    { date: "2026-09-03", totalSalesSatang: 800000 }
  ];

  // date-desc (latest -> oldest)
  const sortedDateDesc = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  assert.strictEqual(sortedDateDesc[0].date, "2026-09-05");
  assert.strictEqual(sortedDateDesc[1].date, "2026-09-03");
  assert.strictEqual(sortedDateDesc[2].date, "2026-09-01");

  // sales-desc (highest -> lowest)
  const sortedSalesDesc = [...rows].sort((a, b) => b.totalSalesSatang - a.totalSalesSatang);
  assert.strictEqual(sortedSalesDesc[0].totalSalesSatang, 1500000);
  assert.strictEqual(sortedSalesDesc[2].totalSalesSatang, 800000);

  console.log("✓ Test 4 Passed: Ledger sorting (date-desc and sales-desc)");
}

// 5. Drawer Detail Calculations: Counter vs Delivery channel split
{
  const record = {
    totalSalesSatang: 1000000,
    payments: {
      cash: 300000,
      creditCard: 200000,
      qrPayment: 100000,
      promptPay: 100000,
      trueMoney: 0,
      bankTransfer: 0,
      linePay: 0,
      alipay: 0,
      lineMan: 200000,
      grab: 100000
    }
  };

  let counterSatang = 0;
  let deliverySatang = 0;
  channels.forEach(ch => {
    const val = record.payments[ch] || 0;
    if (channelCategories[ch] === "Delivery") {
      deliverySatang += val;
    } else {
      counterSatang += val;
    }
  });

  assert.strictEqual(counterSatang, 700000, "Counter subtotal should equal sum of counter channels");
  assert.strictEqual(deliverySatang, 300000, "Delivery subtotal should equal sum of delivery channels");
  assert.strictEqual(counterSatang + deliverySatang, record.totalSalesSatang, "Sum must equal total sales");

  console.log("✓ Test 5 Passed: Detail Drawer counter & delivery category breakdown");
}

console.log(" ALL RECORDS V2 TESTS PASSED SUCCESSFULLY!");

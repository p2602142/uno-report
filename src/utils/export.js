import { channels, channelLabels } from "../config/constants.js";
import { toTHB } from "./currency.js";
import { getDayName } from "./date.js";
import { showToast } from "../components/toast.js";

/**
 * Exports sales rows to CSV format with UTF-8 BOM for Excel compatibility.
 */
export function exportSalesToCSV(rows, filename = "UNO_Sales_Report.csv") {
  if (!rows || !rows.length) {
    showToast("ไม่มีข้อมูลสำหรับส่งออก CSV", "warning");
    return;
  }

  const headers = [
    "Date",
    "Day",
    "Total Sales (THB)",
    ...channels.map(ch => `${channelLabels[ch]} (THB)`),
    "Void Bills",
    "Void Amount (THB)",
    "Last Updated By"
  ];

  const csvRows = [headers.join(",")];

  rows.forEach(r => {
    const rowData = [
      `"${r.date}"`,
      `"${getDayName(r.date)}"`,
      toTHB(r.totalSalesSatang).toFixed(1),
      ...channels.map(ch => toTHB(r.payments?.[ch] || 0).toFixed(1)),
      r.voidBill || 0,
      toTHB(r.voidAmountSatang || 0).toFixed(1),
      `"${(r.updatedBy || "").replace(/"/g, '""')}"`
    ];
    csvRows.push(rowData.join(","));
  });

  const csvContent = "\uFEFF" + csvRows.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`ส่งออกไฟล์ ${filename} สำเร็จ (${rows.length} รายการ)`, "success");
}

/**
 * Exports full raw database state to JSON for backup.
 */
export function exportDatabaseBackupJSON(sales, monthTargets, filename = "uno_sales_backup.json") {
  const exportPayload = {
    branchCode: "UN1021-CNV",
    exportedAt: new Date().toISOString(),
    totalRecords: sales.length,
    monthlyTargets: monthTargets,
    sales
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("ดาวน์โหลดไฟล์ JSON สำรองข้อมูลสำเร็จ", "success");
}

import { toTHB } from "../utils/currency.js";
import { daysInMonth } from "../utils/date.js";
import { channelLabels } from "../config/constants.js";

// Chart instances registry to prevent memory leaks and canvas conflicts
const charts = {
  dashTrend: null,
  dashTarget: null,
  dashMix: null,
  reportTrend: null,
  reportMix: null
};

export function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    charts[key] = null;
  }
}

export function destroyAllCharts() {
  Object.keys(charts).forEach(key => destroyChart(key));
}

export function renderDashboardCharts(canvasElements, { rows, payMix, total, monthlyTargetSatang, dailyTargetSatang }) {
  if (typeof Chart === "undefined") return;

  const now = new Date();
  const days = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const labels = Array.from({ length: days }, (_, index) => String(index + 1).padStart(2, "0"));
  const map = Object.fromEntries(rows.map(row => [row.date, toTHB(row.totalSalesSatang)]));

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const data = labels.map(day => map[`${year}-${month}-${day}`] || 0);

  // Minimal font configuration
  const baseFont = { family: "'Sarabun', 'Plus Jakarta Sans', sans-serif", size: 11 };

  // 1. Trend Line Chart (Minimal, crisp)
  if (canvasElements.trendCanvas) {
    destroyChart("dashTrend");
    charts.dashTrend = new Chart(canvasElements.trendCanvas, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Actual Sales",
            data,
            borderColor: "#171717",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            tension: 0.1,
            pointRadius: 2.5,
            pointHoverRadius: 4,
            pointBackgroundColor: "#171717"
          },
          {
            label: "Daily Target",
            data: labels.map(() => toTHB(dailyTargetSatang)),
            borderColor: "#A3A3A3",
            borderDash: [3, 3],
            borderWidth: 1,
            pointRadius: 0,
            tension: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              font: baseFont,
              color: "#737373"
            }
          },
          tooltip: {
            backgroundColor: "#FFFFFF",
            titleColor: "#171717",
            bodyColor: "#737373",
            borderColor: "#E5E5E5",
            borderWidth: 1,
            padding: 8,
            titleFont: { weight: "600", size: 11 },
            bodyFont: { size: 11 },
            displayColors: false
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: baseFont, color: "#A3A3A3" },
            border: { color: "#E5E5E5" }
          },
          y: {
            grid: { color: "#F5F5F4" },
            ticks: {
              font: baseFont,
              color: "#A3A3A3",
              callback: value => "฿" + (value >= 1000 ? (value / 1000).toFixed(0) + "k" : value)
            },
            border: { display: false }
          }
        }
      }
    });
  }

  // 2. Target Doughnut Chart (Clean monochrome + UNO accent)
  if (canvasElements.targetCanvas) {
    destroyChart("dashTarget");
    charts.dashTarget = new Chart(canvasElements.targetCanvas, {
      type: "doughnut",
      data: {
        labels: ["Actual", "Remaining"],
        datasets: [{
          data: [toTHB(total), Math.max(0, toTHB(monthlyTargetSatang - total))],
          backgroundColor: ["#171717", "#F5F5F4"],
          borderWidth: 0
        }]
      },
      options: {
        cutout: "80%",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#FFFFFF",
            titleColor: "#171717",
            bodyColor: "#737373",
            borderColor: "#E5E5E5",
            borderWidth: 1,
            padding: 8
          }
        }
      }
    });
  }

  // 3. Payment Mix Doughnut Chart (Restrained palette)
  if (canvasElements.mixCanvas) {
    destroyChart("dashMix");
    const entries = payMix.entries;
    charts.dashMix = new Chart(canvasElements.mixCanvas, {
      type: "doughnut",
      data: {
        labels: entries.map(([key]) => channelLabels[key] || key),
        datasets: [{
          data: entries.map(([, value]) => toTHB(value)),
          backgroundColor: ["#171717", "#404040", "#737373", "#A3A3A3", "#D4D4D4", "#C92F24", "#525252", "#E5E5E5"],
          borderWidth: 1,
          borderColor: "#FFFFFF"
        }]
      },
      options: {
        cutout: "75%",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#FFFFFF",
            titleColor: "#171717",
            bodyColor: "#737373",
            borderColor: "#E5E5E5",
            borderWidth: 1,
            padding: 8
          }
        }
      }
    });
  }
}

export function renderReportCharts(canvasElements, { rows, payMix }) {
  if (typeof Chart === "undefined") return;

  const sortedAsc = rows.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const labels = sortedAsc.map(r => r.date.slice(5)); // MM-DD
  const actualData = sortedAsc.map(r => toTHB(r.totalSalesSatang));
  const targetData = sortedAsc.map(r => toTHB(r.dailyTargetSatang || 0));
  const baseFont = { family: "'Sarabun', 'Plus Jakarta Sans', sans-serif", size: 11 };

  // 1. Report Trend Chart (Minimal Bar + Target line)
  if (canvasElements.trendCanvas) {
    destroyChart("reportTrend");
    charts.reportTrend = new Chart(canvasElements.trendCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "line",
            label: "Daily Target",
            data: targetData,
            borderColor: "#A3A3A3",
            borderDash: [3, 3],
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            tension: 0
          },
          {
            type: "bar",
            label: "Total Sales",
            data: actualData,
            backgroundColor: "#171717",
            hoverBackgroundColor: "#C92F24",
            borderRadius: 2,
            maxBarThickness: 16
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              font: baseFont,
              color: "#737373"
            }
          },
          tooltip: {
            backgroundColor: "#FFFFFF",
            titleColor: "#171717",
            bodyColor: "#737373",
            borderColor: "#E5E5E5",
            borderWidth: 1,
            padding: 8
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: baseFont, color: "#A3A3A3" },
            border: { color: "#E5E5E5" }
          },
          y: {
            grid: { color: "#F5F5F4" },
            ticks: {
              font: baseFont,
              color: "#A3A3A3",
              callback: value => "฿" + (value >= 1000 ? (value / 1000).toFixed(0) + "k" : value)
            },
            border: { display: false }
          }
        }
      }
    });
  }

  // 2. Report Mix Doughnut Chart
  if (canvasElements.pieCanvas) {
    destroyChart("reportMix");
    const entries = payMix.entries;
    charts.reportMix = new Chart(canvasElements.pieCanvas, {
      type: "doughnut",
      data: {
        labels: entries.map(([key]) => channelLabels[key] || key),
        datasets: [{
          data: entries.map(([, val]) => toTHB(val)),
          backgroundColor: ["#171717", "#404040", "#737373", "#A3A3A3", "#D4D4D4", "#C92F24", "#525252", "#E5E5E5"],
          borderWidth: 1,
          borderColor: "#FFFFFF"
        }]
      },
      options: {
        cutout: "75%",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#FFFFFF",
            titleColor: "#171717",
            bodyColor: "#737373",
            borderColor: "#E5E5E5",
            borderWidth: 1,
            padding: 8
          }
        }
      }
    });
  }
}

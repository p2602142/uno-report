/**
 * UNO! COFFEE — Sales Performance Portal (V2 Modular Orchestrator)
 * Store Branch: UN1021-CNV (Central Nortville)
 */

import { initAuth, getCurrentUser } from "./src/auth/auth.js";
import { initRouter, setActivePage, getCurrentPage } from "./src/pages/router.js";
import { initDailyPage, loadDailySales, setDailyDataChangeCallback } from "./src/pages/dailyPage.js";
import { loadDashboard } from "./src/pages/dashboardPage.js";
import { initHistoryPage, loadHistory } from "./src/pages/historyPage.js";
import { initReportsPage, loadReports } from "./src/pages/reportsPage.js";
import { initSettingsPage, setSettingsDataChangeCallback } from "./src/pages/settingsPage.js";
import { $ } from "./src/utils/currency.js";

// Live Clock in Header
function startClock() {
  const clockEl = $("live-clock");
  if (!clockEl) return;
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };
  update();
  setInterval(update, 1000);
}

// Refresh all active data after mutations
function refreshActiveViews() {
  const user = getCurrentUser();
  if (!user) return;
  const page = getCurrentPage();

  loadDashboard();
  loadDailySales();
  loadHistory();
  if (page === "reports") {
    loadReports();
  }
}

// Application Bootstrap
function bootstrap() {
  startClock();

  // Initialize modular controllers
  initDailyPage();
  initHistoryPage();
  initReportsPage();
  initSettingsPage();

  // Cross-page reload triggers on data mutation
  setDailyDataChangeCallback(refreshActiveViews);
  setSettingsDataChangeCallback(refreshActiveViews);

  // Router initialization
  initRouter(() => getCurrentUser());

  // Firebase Authentication lifecycle observer
  initAuth(user => {
    if (user) {
      // User is authenticated: populate active views
      const page = getCurrentPage();
      setActivePage(page || "dash", user);
    } else {
      // Guest mode: clear table renders or prompt login
      const dashBody = $("recent-sales-body");
      if (dashBody) {
        dashBody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-neutral-400">กรุณาเข้าสู่ระบบเพื่อดูข้อมูลยอดขาย</td></tr>`;
      }
      const dailyBody = $("daily-v2-recent-table-body") || $("daily-table-body");
      if (dailyBody) {
        dailyBody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-neutral-400">กรุณาเข้าสู่ระบบเพื่อดูข้อมูลยอดขาย</td></tr>`;
      }
      const histBody = $("table-history-body");
      if (histBody) {
        histBody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-neutral-400">กรุณาเข้าสู่ระบบเพื่อดูประวัติ Audit Log</td></tr>`;
      }
      const repBody = $("report-ledger-body");
      if (repBody) {
        repBody.innerHTML = `<tr><td colspan="18" class="p-8 text-center text-neutral-400">กรุณาเข้าสู่ระบบเพื่อดูรายงานสาขา</td></tr>`;
      }
    }
  });
}

// Run bootstrap when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}

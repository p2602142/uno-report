import { $ } from "../utils/currency.js";
import { loadDashboard } from "./dashboardPage.js";
import { loadDailySales } from "./dailyPage.js";
import { loadHistory } from "./historyPage.js";
import { loadReports } from "./reportsPage.js";

let currentPage = "page-dashboard";

export function getCurrentPage() {
  return currentPage;
}

const pageSections = [
  "page-dashboard",
  "page-daily",
  "page-history",
  "page-reports",
  "page-settings"
];

function normalizePageId(pageId) {
  if (!pageId) return "page-dashboard";
  if (pageId.startsWith("page-")) return pageId;
  if (pageId === "dash" || pageId === "dashboard") return "page-dashboard";
  if (pageId === "daily") return "page-daily";
  if (pageId === "record" || pageId === "history") return "page-history";
  if (pageId === "reports" || pageId === "report") return "page-reports";
  if (pageId === "settings" || pageId === "setting") return "page-settings";
  return `page-${pageId}`;
}

export function setActivePage(pageId, user = null) {
  const targetId = normalizePageId(pageId);
  currentPage = targetId;

  // Hide all pages, show target page
  pageSections.forEach(id => {
    const el = $(id);
    if (el) {
      if (id === targetId) {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    }
  });

  // Update navigation button active styles across desktop and mobile
  document.querySelectorAll(".nav-btn").forEach(btn => {
    const btnTarget = normalizePageId(btn.dataset.page);
    const isActive = btnTarget === targetId;

    btn.classList.toggle("active", isActive);
    if (isActive) {
      btn.classList.add("bg-[#F5F5F4]", "text-[#171717]", "font-semibold");
      btn.classList.remove("text-[#737373]", "bg-transparent", "bg-uno-red", "text-white", "text-neutral-300", "bg-neutral-900");
      // If there's an indicator bar inside
      const indicator = btn.querySelector(".nav-indicator");
      if (indicator) indicator.classList.remove("opacity-0");
    } else {
      btn.classList.remove("bg-[#F5F5F4]", "text-[#171717]", "font-semibold", "bg-uno-red", "text-white", "bg-neutral-900");
      btn.classList.add("text-[#737373]", "bg-transparent");
      const indicator = btn.querySelector(".nav-indicator");
      if (indicator) indicator.classList.add("opacity-0");
    }
  });

  // Call relevant page loader
  if (targetId === "page-dashboard") loadDashboard();
  if (targetId === "page-daily") loadDailySales();
  if (targetId === "page-history") loadHistory();
  if (targetId === "page-reports") loadReports();
}

export function initRouter(getUserCallback) {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      const user = typeof getUserCallback === "function" ? getUserCallback() : null;
      setActivePage(page, user);
    });
  });

  // Wire up Record daily sales button in header to switch to page-daily
  $("btn-open-sale")?.addEventListener("click", () => {
    const user = typeof getUserCallback === "function" ? getUserCallback() : null;
    setActivePage("page-daily", user);
  });
}


import { esc, $ } from "../utils/currency.js";

export function showToast(message, type = "success") {
  const container = $("toast-container");
  if (!container) {
    console.log(`[${type}] ${message}`);
    return;
  }
  const toast = document.createElement("div");
  const dotCol = type === "danger" || type === "error" 
    ? "bg-[#C92F24]" 
    : type === "warning"
    ? "bg-[#d97706]"
    : "bg-[#16a34a]";

  toast.className = "toast px-3.5 py-2.5 rounded-lg shadow-sm bg-white text-[#171717] border border-[#E5E5E5] flex items-center justify-between gap-3 text-xs font-medium pointer-events-auto transition-all duration-200";
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="w-1.5 h-1.5 rounded-full ${dotCol} shrink-0"></span>
      <span class="leading-tight">${esc(message)}</span>
    </div>
    <button class="text-[#A3A3A3] hover:text-[#171717] text-xs font-semibold ml-2 transition cursor-pointer" aria-label="Close">✕</button>
  `;
  const closeBtn = toast.querySelector("button");
  const removeToast = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-4px)";
    setTimeout(() => toast.remove(), 200);
  };
  if (closeBtn) closeBtn.onclick = removeToast;
  container.appendChild(toast);
  setTimeout(removeToast, 3500);
}


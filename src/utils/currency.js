export const $ = id => document.getElementById(id);

export const toSatang = value =>
  Math.round((parseFloat(value) || 0) * 100);

export const toTHB = value =>
  (value || 0) / 100;

// Production standard: 1 decimal place across the entire system
export const money = value =>
  "฿" +
  toTHB(value).toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

export const num1 = value =>
  (value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

export const esc = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

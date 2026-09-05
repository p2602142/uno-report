import { dayNamesThai } from "../config/constants.js";

export const dateFmt = date => {
  if (!date) return "—";
  const [year, month, day] = String(date).split("-");
  return `${day}/${month}/${year}`;
};

export const daysInMonth = (year, month) =>
  new Date(year, month, 0).getDate();

export const getDayName = dateStr => {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dayNamesThai[dt.getDay()] || "";
};

export const formatIsoDate = (d = new Date()) => {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatIsoMonth = (d = new Date()) => {
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

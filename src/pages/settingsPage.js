import { getMonthlyTargetSatangFromFirestore, saveMonthlyTargetToFirestore, getCachedMonthTargets, clearMonthTargetsCache } from "../repositories/targetRepository.js";
import { getSalesFromFirestore } from "../repositories/salesRepository.js";
import { exportDatabaseBackupJSON } from "../utils/export.js";
import { $, money, toSatang, toTHB } from "../utils/currency.js";
import { preventNegativeInput } from "../core/validation.js";
import { showToast } from "../components/toast.js";
import { getLoggedInUserIdentifier } from "../auth/auth.js";

let onSettingsDataChangeCallback = null;

export function setSettingsDataChangeCallback(cb) {
  onSettingsDataChangeCallback = cb;
}

export function initSettingsPage() {
  const settingsMonthInput = $("settings-month");
  if (settingsMonthInput && !settingsMonthInput.value) {
    settingsMonthInput.value = new Date().toISOString().slice(0, 7);
  }

  preventNegativeInput($("settings-target-input"));

  async function loadSettingsTarget() {
    const month = $("settings-month")?.value || new Date().toISOString().slice(0, 7);
    const targetSatang = await getMonthlyTargetSatangFromFirestore(month);
    if ($("settings-target-input")) {
      $("settings-target-input").value = toTHB(targetSatang);
    }
  }

  settingsMonthInput?.addEventListener("change", loadSettingsTarget);
  loadSettingsTarget();

  // Target preset buttons (e.g. 200,000, 250,000, 300,000)
  document.querySelectorAll(".target-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.value;
      if ($("settings-target-input")) {
        $("settings-target-input").value = val;
      }
    });
  });

  $("btn-save-settings-target")?.addEventListener("click", async () => {
    const month = $("settings-month")?.value || new Date().toISOString().slice(0, 7);
    const rawVal = parseFloat($("settings-target-input")?.value || 0);
    if (isNaN(rawVal) || rawVal < 0) {
      return showToast("Target ต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 0", "danger");
    }
    const targetSatang = toSatang(rawVal);
    try {
      await saveMonthlyTargetToFirestore(month, targetSatang, getLoggedInUserIdentifier());
      showToast(`บันทึกเป้าหมายเดือน ${month} (${money(targetSatang)}) เรียบร้อยแล้ว`, "success");
      if (typeof onSettingsDataChangeCallback === "function") {
        onSettingsDataChangeCallback();
      }
    } catch (err) {
      showToast("บันทึกเป้าหมายล้มเหลว: " + err.message, "danger");
    }
  });

  // Sync / clear cache
  $("btn-sync-cache")?.addEventListener("click", () => {
    clearMonthTargetsCache();
    showToast("ล้าง Cache ข้อมูลและซิงค์กับคลาวด์เรียบร้อยแล้ว", "success");
    if (typeof onSettingsDataChangeCallback === "function") {
      onSettingsDataChangeCallback();
    }
  });

  // Export JSON backup
  $("btn-export-backup-json")?.addEventListener("click", async () => {
    try {
      showToast("กำลังรวบรวมข้อมูลสำรอง...", "success");
      const sales = await getSalesFromFirestore("2000-01-01", "2099-12-31");
      const monthTargets = getCachedMonthTargets();
      exportDatabaseBackupJSON(sales, monthTargets);
    } catch (err) {
      showToast("ไม่สามารถสร้างไฟล์สำรอง: " + err.message, "danger");
    }
  });
}

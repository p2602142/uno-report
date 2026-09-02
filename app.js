/**
 * UNO! COFFEE COMPANY - Sales Performance Portal
 * Branch: UN1021-CNV (No Login Version)
 */

// ==========================================
// Global State Management
// ==========================================
const state = {
  currentBranch: 'UN1021-CNV',
  currentUser: 'Staff (UN1021-CNV)',
  currentPage: 'page-dashboard', // กำหนดให้เปิดหน้า Dashboard เป็นหน้าแรก
  salesData: [],
  monthlyTargets: {},
  pagination: {
    currentPage: 1,
    pageSize: 10,
    filteredData: []
  },
  charts: {},
  deleteTargetDate: null
};

// ==========================================
// Initial Sample Data (Seed Data)
// ==========================================
const initialSalesSeed = [
  {
    date: '2026-09-01',
    totalSales: 15450,
    cash: 3000,
    creditCard: 2450,
    qrPayment: 2000,
    promptPay: 3000,
    trueMoney: 1000,
    bankTransfer: 0,
    linePay: 1000,
    alipay: 0,
    lineMan: 1500,
    grab: 1500,
    voidBills: 2,
    updatedBy: 'Staff (UN1021-CNV)',
    lastUpdated: '2026-09-01 20:30'
  },
  {
    date: '2026-09-02',
    totalSales: 18200,
    cash: 4000,
    creditCard: 3200,
    qrPayment: 2500,
    promptPay: 3500,
    trueMoney: 1000,
    bankTransfer: 500,
    linePay: 500,
    alipay: 0,
    lineMan: 1500,
    grab: 1500,
    voidBills: 0,
    updatedBy: 'Staff (UN1021-CNV)',
    lastUpdated: '2026-09-02 20:45'
  }
];

// ==========================================
// App Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  initEventListeners();
  initCharts();
  
  // ตั้งค่าวันที่เริ่มต้นให้กับ Form / Inputs
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);
  
  document.getElementById('sale-date').value = today;
  document.getElementById('daily-month').value = currentMonth;
  document.getElementById('report-from').value = `${currentMonth}-01`;
  document.getElementById('report-to').value = today;

  // โหลดและแสดงผลข้อมูลหน้า Dashboard ทันที
  switchPage('page-dashboard');
  refreshAllData();
});

// ==========================================
// LocalStorage Handlers
// ==========================================
function initStorage() {
  const storedSales = localStorage.getItem('uno_sales_data');
  if (!storedSales) {
    localStorage.setItem('uno_sales_data', JSON.stringify(initialSalesSeed));
    state.salesData = [...initialSalesSeed];
  } else {
    state.salesData = JSON.parse(storedSales);
  }

  const storedTargets = localStorage.getItem('uno_targets_data');
  if (!storedTargets) {
    state.monthlyTargets = { '2026-09': 450000 };
    localStorage.setItem('uno_targets_data', JSON.stringify(state.monthlyTargets));
  } else {
    state.monthlyTargets = JSON.parse(storedTargets);
  }
}

function saveDataToStorage() {
  localStorage.setItem('uno_sales_data', JSON.stringify(state.salesData));
}

function saveTargetsToStorage() {
  localStorage.setItem('uno_targets_data', JSON.stringify(state.monthlyTargets));
}

// ==========================================
// Event Listeners Registration
// ==========================================
function initEventListeners() {
  // Navigation Tabs (Desktop & Mobile)
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetPage = e.currentTarget.getAttribute('data-page');
      switchPage(targetPage);
    });
  });

  // Modal Record Sale Controls
  document.getElementById('btn-open-sale').addEventListener('click', () => openSaleModal());
  document.getElementById('btn-close-sale').addEventListener('click', () => closeSaleModal());
  document.getElementById('btn-cancel-sale').addEventListener('click', () => closeSaleModal());
  document.getElementById('form-daily-sales').addEventListener('submit', handleSaleSubmit);

  // Auto Sum Calculation inside Sale Form
  const paymentInputs = ['cash', 'creditCard', 'qrPayment', 'promptPay', 'trueMoney', 'bankTransfer', 'linePay', 'alipay', 'lineMan', 'grab'];
  paymentInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calculatePaymentSum);
  });
  
  const saleTotalEl = document.getElementById('sale-total');
  if (saleTotalEl) saleTotalEl.addEventListener('input', calculatePaymentSum);

  // Daily Sales Page Actions & Search
  document.getElementById('daily-search').addEventListener('input', filterDailySales);
  document.getElementById('daily-month').addEventListener('change', filterDailySales);
  document.getElementById('btn-save-monthly-target').addEventListener('click', handleSaveMonthlyTarget);
  document.getElementById('daily-prev').addEventListener('click', () => changeDailyPage(-1));
  document.getElementById('daily-next').addEventListener('click', () => changeDailyPage(1));

  // Dashboard & Report Refresh Buttons
  document.getElementById('btn-dash-refresh').addEventListener('click', refreshAllData);
  document.getElementById('btn-report-refresh').addEventListener('click', updateReportSection);

  // Delete Modal Actions
  document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
  document.getElementById('btn-confirm-delete').addEventListener('click', handleConfirmDelete);

  // Admin Console - Reset Database
  const resetBtn = document.getElementById('btn-db-reset');
  if (resetBtn) resetBtn.addEventListener('click', handleDatabaseReset);
}

// ==========================================
// Navigation & Page Switching
// ==========================================
function switchPage(pageId) {
  state.currentPage = pageId;
  
  // Highlight Navigation Buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-page') === pageId) {
      btn.classList.add('active', 'bg-uno-red', 'text-white');
      btn.classList.remove('text-neutral-300');
    } else {
      btn.classList.remove('active', 'bg-uno-red', 'text-white');
      btn.classList.add('text-neutral-300');
    }
  });

  // Hide all pages & Show selected
  document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
  const activePage = document.getElementById(pageId);
  if (activePage) activePage.classList.remove('hidden');

  // Trigger page specific re-renders
  if (pageId === 'page-dashboard') updateDashboard();
  if (pageId === 'page-daily') updateDailySalesPage();
  if (pageId === 'page-history') updateHistoryTable();
  if (pageId === 'page-reports') updateReportSection();
}

// ==========================================
// Main Business Logic & UI Updates
// ==========================================
function refreshAllData() {
  updateDashboard();
  updateDailySalesPage();
  updateHistoryTable();
  updateReportSection();
}

function updateDashboard() {
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonth = todayStr.substring(0, 7);
  
  const periodEl = document.getElementById('dash-period');
  if (periodEl) periodEl.textContent = todayStr;

  // 1. Today Sales
  const todayRecord = state.salesData.find(d => d.date === todayStr);
  const todaySales = todayRecord ? todayRecord.totalSales : 0;
  document.getElementById('dash-today-sales').textContent = formatCurrency(todaySales);

  // 2. MTD Sales & Targets
  const monthRecords = state.salesData.filter(d => d.date.startsWith(currentMonth));
  const mtdSales = monthRecords.reduce((sum, r) => sum + r.totalSales, 0);
  const monthlyTarget = state.monthlyTargets[currentMonth] || 0;
  
  document.getElementById('dash-mtd-sales').textContent = formatCurrency(mtdSales);
  document.getElementById('dash-target-actual').textContent = formatCurrency(mtdSales);
  document.getElementById('dash-target-value').textContent = formatCurrency(monthlyTarget);

  const targetPercent = monthlyTarget > 0 ? ((mtdSales / monthlyTarget) * 100).toFixed(1) : 0;
  document.getElementById('dash-mtd-target').textContent = `${targetPercent}% Target`;

  // 3. Average per day
  const recordedDays = monthRecords.length;
  const avgDay = recordedDays > 0 ? mtdSales / recordedDays : 0;
  document.getElementById('dash-avg-day').textContent = formatCurrency(avgDay);
  document.getElementById('dash-record-days').textContent = `${recordedDays} recorded days`;

  // 4. Void Bills & Best Day
  const totalVoids = monthRecords.reduce((sum, r) => sum + (r.voidBills || 0), 0);
  document.getElementById('dash-void-bills').textContent = totalVoids;

  let bestDayText = 'Best day —';
  if (monthRecords.length > 0) {
    const bestRecord = [...monthRecords].sort((a, b) => b.totalSales - a.totalSales)[0];
    bestDayText = `Best day ${bestRecord.date.slice(8)}th (${formatCurrency(bestRecord.totalSales)})`;
  }
  document.getElementById('dash-best-day').textContent = bestDayText;

  // 5. Recent Sales Table
  const recentBody = document.getElementById('recent-sales-body');
  if (recentBody) {
    recentBody.innerHTML = '';
    const sortedSales = [...state.salesData].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    sortedSales.forEach(item => {
      const dailyTarget = monthlyTarget > 0 ? monthlyTarget / 30 : 0;
      const pct = dailyTarget > 0 ? ((item.totalSales / dailyTarget) * 100).toFixed(0) : 0;
      
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-neutral-50';
      tr.innerHTML = `
        <td class="py-2 font-bold">${item.date}</td>
        <td class="py-2 text-right font-black text-uno-charcoal">${formatCurrency(item.totalSales)}</td>
        <td class="py-2 text-right">${pct}%</td>
        <td class="py-2 text-center"><span class="pill ${pct >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${pct >= 100 ? 'Hit' : 'Near'}</span></td>
      `;
      recentBody.appendChild(tr);
    });
  }

  // 6. Update Charts
  updateDashboardCharts(monthRecords, mtdSales, monthlyTarget);
}

function updateDailySalesPage() {
  const currentMonth = document.getElementById('daily-month').value || new Date().toISOString().substring(0, 7);
  const targetLabel = document.getElementById('daily-target-month-label');
  if (targetLabel) targetLabel.textContent = `เป้าหมายประจำเดือน (${currentMonth})`;

  const targetVal = state.monthlyTargets[currentMonth] || 0;
  document.getElementById('daily-monthly-target-input').value = targetVal || '';
  document.getElementById('daily-calc-target').value = formatCurrency(targetVal > 0 ? targetVal / 30 : 0);

  filterDailySales();
}

function filterDailySales() {
  const searchTerm = document.getElementById('daily-search').value.toLowerCase();
  const monthFilter = document.getElementById('daily-month').value;

  let filtered = state.salesData.filter(item => {
    const matchSearch = item.date.includes(searchTerm) || (item.updatedBy && item.updatedBy.toLowerCase().includes(searchTerm));
    const matchMonth = monthFilter ? item.date.startsWith(monthFilter) : true;
    return matchSearch && matchMonth;
  });

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  state.pagination.filteredData = filtered;
  state.pagination.currentPage = 1;
  renderDailyTable();
}

function renderDailyTable() {
  const tbody = document.getElementById('daily-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const { currentPage, pageSize, filteredData } = state.pagination;
  const totalRecords = filteredData.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;

  document.getElementById('daily-count').textContent = `${totalRecords} records`;
  document.getElementById('daily-page-info').textContent = `Page ${currentPage} / ${totalPages}`;
  
  document.getElementById('daily-prev').disabled = currentPage <= 1;
  document.getElementById('daily-next').disabled = currentPage >= totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const pageData = filteredData.slice(startIdx, startIdx + pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" class="p-4 text-center text-neutral-400">ไม่พบข้อมูลยอดขาย</td></tr>`;
    return;
  }

  pageData.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-50 border-b border-neutral-100';
    tr.innerHTML = `
      <td class="p-3 font-bold text-uno-charcoal">${item.date}</td>
      <td class="p-3 text-right font-black text-uno-red">${formatCurrency(item.totalSales)}</td>
      <td class="p-3 text-right">${formatCurrency(item.cash || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.creditCard || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.qrPayment || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.promptPay || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.trueMoney || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.bankTransfer || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.linePay || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.alipay || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.lineMan || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.grab || 0)}</td>
      <td class="p-3 text-center font-bold text-amber-600">${item.voidBills || 0}</td>
      <td class="p-3 text-neutral-500">${item.updatedBy || '-'}</td>
      <td class="p-3 text-center">
        <div class="flex items-center justify-center gap-1">
          <button class="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded font-bold text-[10px]" onclick="openSaleModal('${item.date}')">แก้ไข</button>
          <button class="px-2 py-1 bg-red-50 hover:bg-red-100 text-uno-red rounded font-bold text-[10px]" onclick="openDeleteModal('${item.date}')">ลบ</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function changeDailyPage(direction) {
  state.pagination.currentPage += direction;
  renderDailyTable();
}

function updateHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const sorted = [...state.salesData].sort((a, b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-50';
    tr.innerHTML = `
      <td class="p-3.5 font-bold">${item.date}</td>
      <td class="p-3.5 text-right font-black text-uno-charcoal">${formatCurrency(item.totalSales)}</td>
      <td class="p-3.5 text-center font-bold text-amber-600">${item.voidBills || 0}</td>
      <td class="p-3.5">${item.updatedBy || 'System'}</td>
      <td class="p-3.5 text-neutral-400">${item.lastUpdated || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// Modal & Record Sale Actions
// ==========================================
window.openSaleModal = function(dateToEdit = null) {
  const modal = document.getElementById('modal-sale');
  const title = document.getElementById('sale-modal-title');
  const dateInput = document.getElementById('sale-date');

  if (dateToEdit) {
    title.textContent = `แก้ไขยอดขายวันที่ ${dateToEdit}`;
    const record = state.salesData.find(d => d.date === dateToEdit);
    if (record) {
      dateInput.value = record.date;
      dateInput.disabled = true;
      document.getElementById('sale-total').value = record.totalSales;
      document.getElementById('cash').value = record.cash || 0;
      document.getElementById('creditCard').value = record.creditCard || 0;
      document.getElementById('qrPayment').value = record.qrPayment || 0;
      document.getElementById('promptPay').value = record.promptPay || 0;
      document.getElementById('trueMoney').value = record.trueMoney || 0;
      document.getElementById('bankTransfer').value = record.bankTransfer || 0;
      document.getElementById('linePay').value = record.linePay || 0;
      document.getElementById('alipay').value = record.alipay || 0;
      document.getElementById('lineMan').value = record.lineMan || 0;
      document.getElementById('grab').value = record.grab || 0;
      document.getElementById('sale-void').value = record.voidBills || 0;
    }
  } else {
    title.textContent = 'บันทึกยอดขายประจำวัน';
    dateInput.disabled = false;
    document.getElementById('form-daily-sales').reset();
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  calculatePaymentSum();
  modal.classList.remove('hidden');
};

function closeSaleModal() {
  document.getElementById('modal-sale').classList.add('hidden');
}

function calculatePaymentSum() {
  const fields = ['cash', 'creditCard', 'qrPayment', 'promptPay', 'trueMoney', 'bankTransfer', 'linePay', 'alipay', 'lineMan', 'grab'];
  let sum = 0;
  fields.forEach(id => {
    sum += parseFloat(document.getElementById(id).value) || 0;
  });

  const totalInput = parseFloat(document.getElementById('sale-total').value) || 0;
  const sumDisplay = document.getElementById('val-sum');
  const statusDisplay = document.getElementById('val-status');

  if (sumDisplay) sumDisplay.textContent = formatCurrency(sum);

  if (statusDisplay) {
    if (Math.abs(sum - totalInput) < 0.01 && totalInput > 0) {
      statusDisplay.textContent = 'ยอดรวมตรงกัน';
      statusDisplay.className = 'font-bold text-emerald-600';
    } else {
      statusDisplay.textContent = 'ยอดชำระไม่ตรงกับ Total Sales';
      statusDisplay.className = 'font-bold text-uno-red';
    }
  }
}

function handleSaleSubmit(e) {
  e.preventDefault();
  
  const date = document.getElementById('sale-date').value;
  const totalSales = parseFloat(document.getElementById('sale-total').value) || 0;
  
  const newRecord = {
    date,
    totalSales,
    cash: parseFloat(document.getElementById('cash').value) || 0,
    creditCard: parseFloat(document.getElementById('creditCard').value) || 0,
    qrPayment: parseFloat(document.getElementById('qrPayment').value) || 0,
    promptPay: parseFloat(document.getElementById('promptPay').value) || 0,
    trueMoney: parseFloat(document.getElementById('trueMoney').value) || 0,
    bankTransfer: parseFloat(document.getElementById('bankTransfer').value) || 0,
    linePay: parseFloat(document.getElementById('linePay').value) || 0,
    alipay: parseFloat(document.getElementById('alipay').value) || 0,
    lineMan: parseFloat(document.getElementById('lineMan').value) || 0,
    grab: parseFloat(document.getElementById('grab').value) || 0,
    voidBills: parseInt(document.getElementById('sale-void').value) || 0,
    updatedBy: state.currentUser,
    lastUpdated: new Date().toLocaleString('th-TH')
  };

  const existingIdx = state.salesData.findIndex(d => d.date === date);
  if (existingIdx >= 0) {
    state.salesData[existingIdx] = newRecord;
  } else {
    state.salesData.push(newRecord);
  }

  saveDataToStorage();
  closeSaleModal();
  refreshAllData();
  showToast(`บันทึกยอดขายวันที่ ${date} สำเร็จ`);
}

// Delete Record Handling
window.openDeleteModal = function(date) {
  state.deleteTargetDate = date;
  document.getElementById('delete-date-target').textContent = date;
  document.getElementById('modal-delete').classList.remove('hidden');
};

function closeDeleteModal() {
  state.deleteTargetDate = null;
  document.getElementById('modal-delete').classList.add('hidden');
}

function handleConfirmDelete() {
  if (!state.deleteTargetDate) return;
  
  state.salesData = state.salesData.filter(d => d.date !== state.deleteTargetDate);
  saveDataToStorage();
  closeDeleteModal();
  refreshAllData();
  showToast('ลบข้อมูลยอดขายเรียบร้อยแล้ว');
}

// Target Manager Handling
function handleSaveMonthlyTarget() {
  const currentMonth = document.getElementById('daily-month').value || new Date().toISOString().substring(0, 7);
  const val = parseFloat(document.getElementById('daily-monthly-target-input').value) || 0;

  state.monthlyTargets[currentMonth] = val;
  saveTargetsToStorage();
  refreshAllData();
  showToast(`บันทึกเป้าหมายเดือน ${currentMonth} เรียบร้อยแล้ว`);
}

// Admin Reset
function handleDatabaseReset() {
  if (confirm('คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้น?')) {
    localStorage.removeItem('uno_sales_data');
    localStorage.removeItem('uno_targets_data');
    initStorage();
    refreshAllData();
    showToast('รีเซ็ตข้อมูลตัวอย่างสำเร็จ');
  }
}

// ==========================================
// Chart.js Implementations
// ==========================================
function initCharts() {
  const ctxTrend = document.getElementById('chart-sales-trend')?.getContext('2d');
  if (ctxTrend) {
    state.charts.salesTrend = new Chart(ctxTrend, {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Sales (THB)', data: [], borderColor: '#D93829', backgroundColor: 'rgba(217,56,41,0.08)', fill: true, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  const ctxTarget = document.getElementById('chart-target')?.getContext('2d');
  if (ctxTarget) {
    state.charts.target = new Chart(ctxTarget, {
      type: 'doughnut',
      data: { labels: ['Achieved', 'Remaining'], datasets: [{ data: [0, 100], backgroundColor: ['#D93829', '#e2e8f0'] }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });
  }

  const ctxPayment = document.getElementById('chart-payment-mix')?.getContext('2d');
  if (ctxPayment) {
    state.charts.paymentMix = new Chart(ctxPayment, {
      type: 'pie',
      data: { labels: ['Cash', 'Credit Card', 'QR / PromptPay', 'Delivery'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#111111', '#D93829', '#3b82f6', '#10b981'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  const ctxReportTrend = document.getElementById('chart-report-trend')?.getContext('2d');
  if (ctxReportTrend) {
    state.charts.reportTrend = new Chart(ctxReportTrend, {
      type: 'bar',
      data: { labels: [], datasets: [{ label: 'Sales', data: [], backgroundColor: '#D93829' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  const ctxReportPie = document.getElementById('chart-report-pie')?.getContext('2d');
  if (ctxReportPie) {
    state.charts.reportPie = new Chart(ctxReportPie, {
      type: 'doughnut',
      data: { labels: ['Cash', 'QR/Transfer', 'Cards', 'Delivery'], datasets: [{ data: [0,0,0,0], backgroundColor: ['#111111', '#3b82f6', '#D93829', '#10b981'] }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

function updateDashboardCharts(monthRecords, mtdSales, monthlyTarget) {
  const sorted = [...monthRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (state.charts.salesTrend) {
    state.charts.salesTrend.data.labels = sorted.map(r => r.date.slice(8));
    state.charts.salesTrend.data.datasets[0].data = sorted.map(r => r.totalSales);
    state.charts.salesTrend.update();
  }

  if (state.charts.target) {
    const remaining = Math.max(0, monthlyTarget - mtdSales);
    state.charts.target.data.datasets[0].data = [mtdSales, remaining];
    state.charts.target.update();
  }

  if (state.charts.paymentMix) {
    const cash = sorted.reduce((sum, r) => sum + (r.cash || 0), 0);
    const card = sorted.reduce((sum, r) => sum + (r.creditCard || 0), 0);
    const qr = sorted.reduce((sum, r) => sum + (r.qrPayment || 0) + (r.promptPay || 0), 0);
    const delivery = sorted.reduce((sum, r) => sum + (r.lineMan || 0) + (r.grab || 0), 0);

    state.charts.paymentMix.data.datasets[0].data = [cash, card, qr, delivery];
    state.charts.paymentMix.update();
  }
}

function updateReportSection() {
  const fromDate = document.getElementById('report-from').value;
  const toDate = document.getElementById('report-to').value;

  const filtered = state.salesData.filter(d => d.date >= fromDate && d.date <= toDate)
                                  .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (state.charts.reportTrend) {
    state.charts.reportTrend.data.labels = filtered.map(d => d.date);
    state.charts.reportTrend.data.datasets[0].data = filtered.map(d => d.totalSales);
    state.charts.reportTrend.update();
  }

  const total = filtered.reduce((s, r) => s + r.totalSales, 0);
  const cash = filtered.reduce((s, r) => s + (r.cash || 0), 0);
  const qr = filtered.reduce((s, r) => s + (r.qrPayment || 0) + (r.promptPay || 0) + (r.bankTransfer || 0), 0);
  const card = filtered.reduce((s, r) => s + (r.creditCard || 0), 0);
  const delivery = filtered.reduce((s, r) => s + (r.lineMan || 0) + (r.grab || 0), 0);

  if (state.charts.reportPie) {
    state.charts.reportPie.data.datasets[0].data = [cash, qr, card, delivery];
    state.charts.reportPie.update();
  }

  const insightsContainer = document.getElementById('report-insights');
  if (insightsContainer) {
    insightsContainer.innerHTML = `
      <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
        <span class="text-[10px] text-neutral-400 font-bold block">TOTAL REVENUE</span>
        <strong class="text-base font-black text-uno-red">${formatCurrency(total)}</strong>
      </div>
      <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
        <span class="text-[10px] text-neutral-400 font-bold block">RECORDED DAYS</span>
        <strong class="text-base font-black text-uno-charcoal">${filtered.length} Days</strong>
      </div>
      <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
        <span class="text-[10px] text-neutral-400 font-bold block">AVG DAILY REVENUE</span>
        <strong class="text-base font-black text-uno-charcoal">${formatCurrency(filtered.length > 0 ? total / filtered.length : 0)}</strong>
      </div>
      <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
        <span class="text-[10px] text-neutral-400 font-bold block">DELIVERY SHARE</span>
        <strong class="text-base font-black text-emerald-600">${total > 0 ? ((delivery / total) * 100).toFixed(1) : 0}%</strong>
      </div>
    `;
  }
}

// ==========================================
// Helper Utilities
// ==========================================
function formatCurrency(num) {
  return '฿' + Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'bg-uno-charcoal text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl flex items-center justify-between transition-all duration-300 pointer-events-auto';
  toast.innerHTML = `
    <span>${message}</span>
    <button class="ml-3 text-neutral-400 hover:text-white" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
  {
    date: '2026-09-01',
    totalSales: 15450,
    cash: 3000,
    creditCard: 2450,
    qrPayment: 2000,
    promptPay: 3000,
    trueMoney: 1000,
    bankTransfer: 0,
    linePay: 1000,
    alipay: 0,
    lineMan: 1500,
    grab: 1500,
    voidBills: 2,
    updatedBy: 'Staff (UN1021-CNV)',
    lastUpdated: '2026-09-01 20:30'
  },
  {
    date: '2026-09-02',
    totalSales: 18200,
    cash: 4000,
    creditCard: 3200,
    qrPayment: 2500,
    promptPay: 3500,
    trueMoney: 1000,
    bankTransfer: 500,
    linePay: 500,
    alipay: 0,
    lineMan: 1500,
    grab: 1500,
    voidBills: 0,
    updatedBy: 'Staff (UN1021-CNV)',
    lastUpdated: '2026-09-02 20:45'
  }
];

// ==========================================
// App Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initStorage();
  initEventListeners();
  initCharts();
  
  // ตั้งค่าวันที่เริ่มต้นให้กับ Form / Inputs
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);
  
  document.getElementById('sale-date').value = today;
  document.getElementById('daily-month').value = currentMonth;
  document.getElementById('report-from').value = `${currentMonth}-01`;
  document.getElementById('report-to').value = today;

  // โหลดและแสดงผลข้อมูล
  refreshAllData();
});

// ==========================================
// LocalStorage & Data Handlers
// ==========================================
function initStorage() {
  const storedSales = localStorage.getItem('uno_sales_data');
  if (!storedSales) {
    localStorage.setItem('uno_sales_data', JSON.stringify(initialSalesSeed));
    state.salesData = [...initialSalesSeed];
  } else {
    state.salesData = JSON.parse(storedSales);
  }

  const storedTargets = localStorage.getItem('uno_targets_data');
  if (!storedTargets) {
    state.monthlyTargets = { '2026-09': 450000 };
    localStorage.setItem('uno_targets_data', JSON.stringify(state.monthlyTargets));
  } else {
    state.monthlyTargets = JSON.parse(storedTargets);
  }
}

function saveDataToStorage() {
  localStorage.setItem('uno_sales_data', JSON.stringify(state.salesData));
}

function saveTargetsToStorage() {
  localStorage.setItem('uno_targets_data', JSON.stringify(state.monthlyTargets));
}

// ==========================================
// Event Listeners Registration
// ==========================================
function initEventListeners() {
  // Navigation Tabs (Desktop & Mobile)
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetPage = e.currentTarget.getAttribute('data-page');
      switchPage(targetPage);
    });
  });

  // Modal Record Sale Controls
  document.getElementById('btn-open-sale').addEventListener('click', () => openSaleModal());
  document.getElementById('btn-close-sale').addEventListener('click', () => closeSaleModal());
  document.getElementById('btn-cancel-sale').addEventListener('click', () => closeSaleModal());
  document.getElementById('form-daily-sales').addEventListener('submit', handleSaleSubmit);

  // Auto Sum Calculation inside Sale Form
  const paymentInputs = ['cash', 'creditCard', 'qrPayment', 'promptPay', 'trueMoney', 'bankTransfer', 'linePay', 'alipay', 'lineMan', 'grab'];
  paymentInputs.forEach(id => {
    document.getElementById(id).addEventListener('input', calculatePaymentSum);
  });
  document.getElementById('sale-total').addEventListener('input', calculatePaymentSum);

  // Daily Sales Page Actions & Search
  document.getElementById('daily-search').addEventListener('input', filterDailySales);
  document.getElementById('daily-month').addEventListener('change', filterDailySales);
  document.getElementById('btn-save-monthly-target').addEventListener('click', handleSaveMonthlyTarget);
  document.getElementById('daily-prev').addEventListener('click', () => changeDailyPage(-1));
  document.getElementById('daily-next').addEventListener('click', () => changeDailyPage(1));

  // Dashboard & Report Refresh Buttons
  document.getElementById('btn-dash-refresh').addEventListener('click', refreshAllData);
  document.getElementById('btn-report-refresh').addEventListener('click', updateReportSection);

  // Delete Modal Actions
  document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
  document.getElementById('btn-confirm-delete').addEventListener('click', handleConfirmDelete);

  // Admin Console - Reset Database
  document.getElementById('btn-db-reset').addEventListener('click', handleDatabaseReset);
}

// ==========================================
// Navigation & Page Switching
// ==========================================
function switchPage(pageId) {
  state.currentPage = pageId;
  
  // Highlight Navigation Buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-page') === pageId) {
      btn.classList.add('active', 'bg-uno-red', 'text-white');
      btn.classList.remove('text-neutral-300');
    } else {
      btn.classList.remove('active', 'bg-uno-red', 'text-white');
      btn.classList.add('text-neutral-300');
    }
  });

  // Hide all pages & Show selected
  document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
  const activePage = document.getElementById(pageId);
  if (activePage) activePage.classList.remove('hidden');

  // Trigger page specific re-renders
  if (pageId === 'page-dashboard') updateDashboard();
  if (pageId === 'page-daily') updateDailySalesPage();
  if (pageId === 'page-history') updateHistoryTable();
  if (pageId === 'page-reports') updateReportSection();
}

// ==========================================
// Main Business Logic & UI Updates
// ==========================================
function refreshAllData() {
  updateDashboard();
  updateDailySalesPage();
  updateHistoryTable();
  updateReportSection();
  showToast('อัปเดตข้อมูลเรียบร้อยแล้ว');
}

function updateDashboard() {
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonth = todayStr.substring(0, 7);
  
  document.getElementById('dash-period').textContent = todayStr;

  // 1. Today Sales
  const todayRecord = state.salesData.find(d => d.date === todayStr);
  const todaySales = todayRecord ? todayRecord.totalSales : 0;
  document.getElementById('dash-today-sales').textContent = formatCurrency(todaySales);

  // 2. MTD Sales & Targets
  const monthRecords = state.salesData.filter(d => d.date.startsWith(currentMonth));
  const mtdSales = monthRecords.reduce((sum, r) => sum + r.totalSales, 0);
  const monthlyTarget = state.monthlyTargets[currentMonth] || 0;
  
  document.getElementById('dash-mtd-sales').textContent = formatCurrency(mtdSales);
  document.getElementById('dash-target-actual').textContent = formatCurrency(mtdSales);
  document.getElementById('dash-target-value').textContent = formatCurrency(monthlyTarget);

  const targetPercent = monthlyTarget > 0 ? ((mtdSales / monthlyTarget) * 100).toFixed(1) : 0;
  document.getElementById('dash-mtd-target').textContent = `${targetPercent}% Target`;

  // 3. Average per day
  const recordedDays = monthRecords.length;
  const avgDay = recordedDays > 0 ? mtdSales / recordedDays : 0;
  document.getElementById('dash-avg-day').textContent = formatCurrency(avgDay);
  document.getElementById('dash-record-days').textContent = `${recordedDays} recorded days`;

  // 4. Void Bills & Best Day
  const totalVoids = monthRecords.reduce((sum, r) => sum + (r.voidBills || 0), 0);
  document.getElementById('dash-void-bills').textContent = totalVoids;

  let bestDayText = 'Best day —';
  if (monthRecords.length > 0) {
    const bestRecord = [...monthRecords].sort((a, b) => b.totalSales - a.totalSales)[0];
    bestDayText = `Best day ${bestRecord.date.slice(8)}th (${formatCurrency(bestRecord.totalSales)})`;
  }
  document.getElementById('dash-best-day').textContent = bestDayText;

  // 5. Recent Sales Table
  const recentBody = document.getElementById('recent-sales-body');
  recentBody.innerHTML = '';
  const sortedSales = [...state.salesData].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

  sortedSales.forEach(item => {
    const dailyTarget = monthlyTarget > 0 ? monthlyTarget / 30 : 0;
    const pct = dailyTarget > 0 ? ((item.totalSales / dailyTarget) * 100).toFixed(0) : 0;
    
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-50';
    tr.innerHTML = `
      <td class="py-2 font-bold">${item.date}</td>
      <td class="py-2 text-right font-black text-uno-charcoal">${formatCurrency(item.totalSales)}</td>
      <td class="py-2 text-right">${pct}%</td>
      <td class="py-2 text-center"><span class="pill ${pct >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${pct >= 100 ? 'Hit' : 'Near'}</span></td>
    `;
    recentBody.appendChild(tr);
  });

  // 6. Update Charts
  updateDashboardCharts(monthRecords, mtdSales, monthlyTarget);
}

function updateDailySalesPage() {
  const currentMonth = document.getElementById('daily-month').value || new Date().toISOString().substring(0, 7);
  document.getElementById('daily-target-month-label').textContent = `เป้าหมายประจำเดือน (${currentMonth})`;

  const targetVal = state.monthlyTargets[currentMonth] || 0;
  document.getElementById('daily-monthly-target-input').value = targetVal || '';
  document.getElementById('daily-calc-target').value = formatCurrency(targetVal > 0 ? targetVal / 30 : 0);

  filterDailySales();
}

function filterDailySales() {
  const searchTerm = document.getElementById('daily-search').value.toLowerCase();
  const monthFilter = document.getElementById('daily-month').value;

  let filtered = state.salesData.filter(item => {
    const matchSearch = item.date.includes(searchTerm) || (item.updatedBy && item.updatedBy.toLowerCase().includes(searchTerm));
    const matchMonth = monthFilter ? item.date.startsWith(monthFilter) : true;
    return matchSearch && matchMonth;
  });

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  state.pagination.filteredData = filtered;
  state.pagination.currentPage = 1;
  renderDailyTable();
}

function renderDailyTable() {
  const tbody = document.getElementById('daily-table-body');
  tbody.innerHTML = '';

  const { currentPage, pageSize, filteredData } = state.pagination;
  const totalRecords = filteredData.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;

  document.getElementById('daily-count').textContent = `${totalRecords} records`;
  document.getElementById('daily-page-info').textContent = `Page ${currentPage} / ${totalPages}`;
  
  document.getElementById('daily-prev').disabled = currentPage <= 1;
  document.getElementById('daily-next').disabled = currentPage >= totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const pageData = filteredData.slice(startIdx, startIdx + pageSize);

  if (pageData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" class="p-4 text-center text-neutral-400">ไม่พบข้อมูลยอดขาย</td></tr>`;
    return;
  }

  pageData.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-50 border-b border-neutral-100';
    tr.innerHTML = `
      <td class="p-3 font-bold text-uno-charcoal">${item.date}</td>
      <td class="p-3 text-right font-black text-uno-red">${formatCurrency(item.totalSales)}</td>
      <td class="p-3 text-right">${formatCurrency(item.cash || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.creditCard || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.qrPayment || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.promptPay || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.trueMoney || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.bankTransfer || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.linePay || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.alipay || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.lineMan || 0)}</td>
      <td class="p-3 text-right">${formatCurrency(item.grab || 0)}</td>
      <td class="p-3 text-center font-bold text-amber-600">${item.voidBills || 0}</td>
      <td class="p-3 text-neutral-500">${item.updatedBy || '-'}</td>
      <td class="p-3 text-center">
        <div class="flex items-center justify-center gap-1">
          <button class="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded font-bold text-[10px]" onclick="openSaleModal('${item.date}')">แก้ไข</button>
          <button class="px-2 py-1 bg-red-50 hover:bg-red-100 text-uno-red rounded font-bold text-[10px]" onclick="openDeleteModal('${item.date}')">ลบ</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function changeDailyPage(direction) {
  state.pagination.currentPage += direction;
  renderDailyTable();
}

function updateHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  tbody.innerHTML = '';

  const sorted = [...state.salesData].sort((a, b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-neutral-50';
    tr.innerHTML = `
      <td class="p-3.5 font-bold">${item.date}</td>
      <td class="p-3.5 text-right font-black text-uno-charcoal">${formatCurrency(item.totalSales)}</td>
      <td class="p-3.5 text-center font-bold text-amber-600">${item.voidBills || 0}</td>
      <td class="p-3.5">${item.updatedBy || 'System'}</td>
      <td class="p-3.5 text-neutral-400">${item.lastUpdated || '-'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// Modal & Record Sale Actions
// ==========================================
window.openSaleModal = function(dateToEdit = null) {
  const modal = document.getElementById('modal-sale');
  const title = document.getElementById('sale-modal-title');
  const dateInput = document.getElementById('sale-date');

  if (dateToEdit) {
    title.textContent = `แก้ไขยอดขายวันที่ ${dateToEdit}`;
    const record = state.salesData.find(d => d.date === dateToEdit);
    if (record) {
      dateInput.value = record.date;
      dateInput.disabled = true; // ห้ามแก้ วันที่ ที่เป็น Key
      document.getElementById('sale-total').value = record.totalSales;
      document.getElementById('cash').value = record.cash || 0;
      document.getElementById('creditCard').value = record.creditCard || 0;
      document.getElementById('qrPayment').value = record.qrPayment || 0;
      document.getElementById('promptPay').value = record.promptPay || 0;
      document.getElementById('trueMoney').value = record.trueMoney || 0;
      document.getElementById('bankTransfer').value = record.bankTransfer || 0;
      document.getElementById('linePay').value = record.linePay || 0;
      document.getElementById('alipay').value = record.alipay || 0;
      document.getElementById('lineMan').value = record.lineMan || 0;
      document.getElementById('grab').value = record.grab || 0;
      document.getElementById('sale-void').value = record.voidBills || 0;
    }
  } else {
    title.textContent = 'บันทึกยอดขายประจำวัน';
    dateInput.disabled = false;
    document.getElementById('form-daily-sales').reset();
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  calculatePaymentSum();
  modal.classList.remove('hidden');
};

function closeSaleModal() {
  document.getElementById('modal-sale').classList.add('hidden');
}

function calculatePaymentSum() {
  const fields = ['cash', 'creditCard', 'qrPayment', 'promptPay', 'trueMoney', 'bankTransfer', 'linePay', 'alipay', 'lineMan', 'grab'];
  let sum = 0;
  fields.forEach(id => {
    sum += parseFloat(document.getElementById(id).value) || 0;
  });

  const totalInput = parseFloat(document.getElementById('sale-total').value) || 0;
  const sumDisplay = document.getElementById('val-sum');
  const statusDisplay = document.getElementById('val-status');

  sumDisplay.textContent = formatCurrency(sum);

  if (Math.abs(sum - totalInput) < 0.01 && totalInput > 0) {
    statusDisplay.textContent = 'ยอดรวมตรงกัน';
    statusDisplay.className = 'font-bold text-emerald-600';
  } else {
    statusDisplay.textContent = 'ยอดชำระไม่ตรงกับ Total Sales';
    statusDisplay.className = 'font-bold text-uno-red';
  }
}

function handleSaleSubmit(e) {
  e.preventDefault();
  
  const date = document.getElementById('sale-date').value;
  const totalSales = parseFloat(document.getElementById('sale-total').value) || 0;
  
  const newRecord = {
    date,
    totalSales,
    cash: parseFloat(document.getElementById('cash').value) || 0,
    creditCard: parseFloat(document.getElementById('creditCard').value) || 0,
    qrPayment: parseFloat(document.getElementById('qrPayment').value) || 0,
    promptPay: parseFloat(document.getElementById('promptPay').value) || 0,
    trueMoney: parseFloat(document.getElementById('trueMoney').value) || 0,
    bankTransfer: parseFloat(document.getElementById('bankTransfer').value) || 0,
    linePay: parseFloat(document.getElementById('linePay').value) || 0,
    alipay: parseFloat(document.getElementById('alipay').value) || 0,
    lineMan: parseFloat(document.getElementById('lineMan').value) || 0,
    grab: parseFloat(document.getElementById('grab').value) || 0,
    voidBills: parseInt(document.getElementById('sale-void').value) || 0,
    updatedBy: state.currentUser,
    lastUpdated: new Date().toLocaleString('th-TH')
  };

  const existingIdx = state.salesData.findIndex(d => d.date === date);
  if (existingIdx >= 0) {
    state.salesData[existingIdx] = newRecord;
  } else {
    state.salesData.push(newRecord);
  }

  saveDataToStorage();
  closeSaleModal();
  refreshAllData();
  showToast(`บันทึกยอดขายวันที่ ${date} สำเร็จ`);
}

// Delete Record Handling
window.openDeleteModal = function(date) {
  state.deleteTargetDate = date;
  document.getElementById('delete-date-target').textContent = date;
  document.getElementById('modal-delete').classList.remove('hidden');
};

function closeDeleteModal() {
  state.deleteTargetDate = null;
  document.getElementById('modal-delete').classList.add('hidden');
}

function handleConfirmDelete() {
  if (!state.deleteTargetDate) return;
  
  state.salesData = state.salesData.filter(d => d.date !== state.deleteTargetDate);
  saveDataToStorage();
  closeDeleteModal();
  refreshAllData();
  showToast('ลบข้อมูลยอดขายเรียบร้อยแล้ว');
}

// Target Manager Handling
function handleSaveMonthlyTarget() {
  const currentMonth = document.getElementById('daily-month').value || new Date().toISOString().substring(0, 7);
  const val = parseFloat(document.getElementById('daily-monthly-target-input').value) || 0;

  state.monthlyTargets[currentMonth] = val;
  saveTargetsToStorage();
  refreshAllData();
  showToast(`บันทึกเป้าหมายเดือน ${currentMonth} เรียบร้อยแล้ว`);
}

// Admin Reset
function handleDatabaseReset() {
  if (confirm('คุณแน่ใจหรือไม่ว่าต้องการรีเซ็ตข้อมูลทั้งหมดกลับเป็นค่าเริ่มต้น?')) {
    localStorage.removeItem('uno_sales_data');
    localStorage.removeItem('uno_targets_data');
    initStorage();
    refreshAllData();
    showToast('รีเซ็ตข้อมูลตัวอย่างสำเร็จ');
  }
}

// ==========================================
// Chart.js Implementations
// ==========================================
function initCharts() {
  // 1. Dashboard Sales Trend Chart
  const ctxTrend = document.getElementById('chart-sales-trend').getContext('2d');
  state.charts.salesTrend = new Chart(ctxTrend, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Sales (THB)', data: [], borderColor: '#D93829', backgroundColor: 'rgba(217,56,41,0.08)', fill: true, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // 2. Dashboard Target Doughnut Chart
  const ctxTarget = document.getElementById('chart-target').getContext('2d');
  state.charts.target = new Chart(ctxTarget, {
    type: 'doughnut',
    data: { labels: ['Achieved', 'Remaining'], datasets: [{ data: [0, 100], backgroundColor: ['#D93829', '#e2e8f0'] }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
  });

  // 3. Dashboard Payment Mix Chart
  const ctxPayment = document.getElementById('chart-payment-mix').getContext('2d');
  state.charts.paymentMix = new Chart(ctxPayment, {
    type: 'pie',
    data: { labels: ['Cash', 'Credit Card', 'QR / PromptPay', 'Delivery'], datasets: [{ data: [0, 0, 0, 0], backgroundColor: ['#111111', '#D93829', '#3b82f6', '#10b981'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // 4. Report Trend Chart
  const ctxReportTrend = document.getElementById('chart-report-trend').getContext('2d');
  state.charts.reportTrend = new Chart(ctxReportTrend, {
    type: 'bar',
    data: { labels: [], datasets: [{ label: 'Sales', data: [], backgroundColor: '#D93829' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });

  // 5. Report Pie Chart
  const ctxReportPie = document.getElementById('chart-report-pie').getContext('2d');
  state.charts.reportPie = new Chart(ctxReportPie, {
    type: 'doughnut',
    data: { labels: ['Cash', 'QR/Transfer', 'Cards', 'Delivery'], datasets: [{ data: [0,0,0,0], backgroundColor: ['#111111', '#3b82f6', '#D93829', '#10b981'] }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function updateDashboardCharts(monthRecords, mtdSales, monthlyTarget) {
  // Update Line Chart
  const sorted = [...monthRecords].sort((a, b) => new Date(a.date) - new Date(b.date));
  state.charts.salesTrend.data.labels = sorted.map(r => r.date.slice(8));
  state.charts.salesTrend.data.datasets[0].data = sorted.map(r => r.totalSales);
  state.charts.salesTrend.update();

  // Update Doughnut Target
  const remaining = Math.max(0, monthlyTarget - mtdSales);
  state.charts.target.data.datasets[0].data = [mtdSales, remaining];
  state.charts.target.update();

  // Update Payment Mix
  const cash = sorted.reduce((sum, r) => sum + (r.cash || 0), 0);
  const card = sorted.reduce((sum, r) => sum + (r.creditCard || 0), 0);
  const qr = sorted.reduce((sum, r) => sum + (r.qrPayment || 0) + (r.promptPay || 0), 0);
  const delivery = sorted.reduce((sum, r) => sum + (r.lineMan || 0) + (r.grab || 0), 0);

  state.charts.paymentMix.data.datasets[0].data = [cash, card, qr, delivery];
  state.charts.paymentMix.update();
}

function updateReportSection() {
  const fromDate = document.getElementById('report-from').value;
  const toDate = document.getElementById('report-to').value;

  const filtered = state.salesData.filter(d => d.date >= fromDate && d.date <= toDate)
                                  .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Chart Updates
  state.charts.reportTrend.data.labels = filtered.map(d => d.date);
  state.charts.reportTrend.data.datasets[0].data = filtered.map(d => d.totalSales);
  state.charts.reportTrend.update();

  const total = filtered.reduce((s, r) => s + r.totalSales, 0);
  const cash = filtered.reduce((s, r) => s + (r.cash || 0), 0);
  const qr = filtered.reduce((s, r) => s + (r.qrPayment || 0) + (r.promptPay || 0) + (r.bankTransfer || 0), 0);
  const card = filtered.reduce((s, r) => s + (r.creditCard || 0), 0);
  const delivery = filtered.reduce((s, r) => s + (r.lineMan || 0) + (r.grab || 0), 0);

  state.charts.reportPie.data.datasets[0].data = [cash, qr, card, delivery];
  state.charts.reportPie.update();

  // Key Insights
  const insightsContainer = document.getElementById('report-insights');
  insightsContainer.innerHTML = `
    <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
      <span class="text-[10px] text-neutral-400 font-bold block">TOTAL REVENUE</span>
      <strong class="text-base font-black text-uno-red">${formatCurrency(total)}</strong>
    </div>
    <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
      <span class="text-[10px] text-neutral-400 font-bold block">RECORDED DAYS</span>
      <strong class="text-base font-black text-uno-charcoal">${filtered.length} Days</strong>
    </div>
    <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
      <span class="text-[10px] text-neutral-400 font-bold block">AVG DAILY REVENUE</span>
      <strong class="text-base font-black text-uno-charcoal">${formatCurrency(filtered.length > 0 ? total / filtered.length : 0)}</strong>
    </div>
    <div class="p-3 bg-neutral-50 rounded-xl border border-neutral-100">
      <span class="text-[10px] text-neutral-400 font-bold block">DELIVERY SHARE</span>
      <strong class="text-base font-black text-emerald-600">${total > 0 ? ((delivery / total) * 100).toFixed(1) : 0}%</strong>
    </div>
  `;
}

// ==========================================
// Helper Utilities
// ==========================================
function formatCurrency(num) {
  return '฿' + Number(num || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'bg-uno-charcoal text-white text-xs font-bold px-4 py-3 rounded-xl shadow-xl flex items-center justify-between transition-all duration-300 pointer-events-auto';
  toast.innerHTML = `
    <span>${message}</span>
    <button class="ml-3 text-neutral-400 hover:text-white" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

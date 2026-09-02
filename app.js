import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    deleteDoc,
    collection, 
    query, 
    where, 
    getDocs, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyA_0BTgJcF8Q4HSNEJbOxQH3fMXtFVsMks",
  authDomain: "sale-performance-report.firebaseapp.com",
  projectId: "sale-performance-report",
  storageBucket: "sale-performance-report.firebasestorage.app",
  messagingSenderId: "936685375762",
  appId: "1:936685375762:web:235f96930f74d898d163cb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State Management
let currentUser = null;
let currentSettings = { dailyTargetSatang: 2300000, monthlyTargetSatang: 50000000 };
let activeDeleteDate = null;
let trendChartInstance = null;
let mixChartInstance = null;
let reportChartInstance = null;

// Helper Utilities (Satang Format conversion: 1 THB = 100 Satang)
const toSatang = (amount) => Math.round((parseFloat(amount) || 0) * 100);
const toTHB = (satang) => (satang || 0) / 100;
const formatTHB = (satang) => "฿" + toTHB(satang).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const getEl = (id) => document.getElementById(id);

// --- Navigation SPA ---
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetPage = e.target.getAttribute('data-page');
        document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('text-slate-900', 'bg-slate-100');
            b.classList.add('text-slate-500');
        });

        getEl(targetPage)?.classList.remove('hidden');
        e.target.classList.add('text-slate-900', 'bg-slate-100');

        if (targetPage === 'page-dashboard') loadDashboard();
        if (targetPage === 'page-history') loadHistory();
        if (targetPage === 'page-reports') loadReports();
    });
});

// --- Auth Observer ---
onAuthStateChanged(auth, async (user) => {
    const loginSec = getEl('login-section');
    const appSec = getEl('app-section');

    if (user) {
        currentUser = user;
        getEl('user-display').textContent = user.email;
        getEl('setting-manager-email').value = user.email;
        loginSec.classList.add('hidden');
        appSec.classList.remove('hidden');

        await loadSettings();
        loadDashboard();
    } else {
        currentUser = null;
        loginSec.classList.remove('hidden');
        appSec.classList.add('hidden');
    }
});

// Login Handlers
getEl('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = getEl('login-email').value;
    const password = getEl('login-password').value;
    const errBox = getEl('login-error');
    errBox.classList.add('hidden');

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        errBox.textContent = "เข้าสู่ระบบไม่สำเร็จ: " + err.message;
        errBox.classList.remove('hidden');
    }
});

getEl('btn-logout')?.addEventListener('click', () => signOut(auth));

// --- Firestore Settings Management ---
async function loadSettings() {
    try {
        const docRef = doc(db, "settings", "app");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentSettings.dailyTargetSatang = data.dailyTargetSatang || 2300000;
            currentSettings.monthlyTargetSatang = data.monthlyTargetSatang || 50000000;
        }
        getEl('setting-daily-target').value = toTHB(currentSettings.dailyTargetSatang);
        getEl('setting-monthly-target').value = toTHB(currentSettings.monthlyTargetSatang);
    } catch (err) {
        console.error("Load Settings Failed:", err);
    }
}

getEl('btn-save-settings')?.addEventListener('click', async () => {
    const dailyVal = parseFloat(getEl('setting-daily-target').value) || 0;
    const monthlyVal = parseFloat(getEl('setting-monthly-target').value) || 0;

    currentSettings.dailyTargetSatang = toSatang(dailyVal);
    currentSettings.monthlyTargetSatang = toSatang(monthlyVal);

    try {
        await setDoc(doc(db, "settings", "app"), {
            dailyTargetSatang: currentSettings.dailyTargetSatang,
            monthlyTargetSatang: currentSettings.monthlyTargetSatang,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid
        });
        alert("บันทึก Target เรียบร้อยแล้ว!");
        loadDashboard();
    } catch (err) {
        alert("ไม่สามารถบันทึก Settings: " + err.message);
    }
});

// --- Daily Sales Validation & Form Handler ---
const totalInput = getEl('sale-total');
const payInputs = document.querySelectorAll('.pay-input');
const dateInput = getEl('sale-date');

dateInput.value = new Date().toISOString().split('T')[0];

function validateSum() {
    const totalSatang = toSatang(totalInput.value);
    let sumBreakdownSatang = 0;
    payInputs.forEach(i => sumBreakdownSatang += toSatang(i.value));

    getEl('val-sum').textContent = formatTHB(sumBreakdownSatang);
    const isValid = totalSatang === sumBreakdownSatang && totalSatang > 0;

    const statusEl = getEl('val-status');
    const saveBtn = getEl('btn-save-sale');

    if (isValid) {
        statusEl.textContent = "✓ ข้อมูลถูกต้อง (Total Sales ตรงกับ Breakdown)";
        statusEl.className = "font-bold text-emerald-600";
        saveBtn.disabled = false;
        saveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        statusEl.textContent = "✕ Total Sales 不ตรงกับ Sum Breakdown";
        statusEl.className = "font-bold text-rose-600";
        saveBtn.disabled = true;
        saveBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    return isValid;
}

totalInput?.addEventListener('input', validateSum);
payInputs.forEach(i => i.addEventListener('input', validateSum));

getEl('form-daily-sales')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateSum()) return;

    const dateStr = dateInput.value;
    const docRef = doc(db, "sales", dateStr);
    const isEdit = getEl('btn-cancel-edit').classList.contains('hidden') === false;

    const paymentsSatang = {};
    payInputs.forEach(i => {
        paymentsSatang[i.getAttribute('data-pay')] = toSatang(i.value);
    });

    const payload = {
        date: dateStr,
        totalSalesSatang: toSatang(totalInput.value),
        payments: paymentsSatang,
        voidBill: parseInt(getEl('sale-void').value, 10) || 0,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
    };

    if (!isEdit) {
        payload.createdAt = serverTimestamp();
        payload.createdBy = currentUser.uid;
    }

    try {
        await setDoc(docRef, payload, { merge: true });
        alert(`บันทึกข้อมูลวันที่ ${dateStr} เรียบร้อยแล้ว!`);
        resetForm();
    } catch (err) {
        alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
    }
});

function resetForm() {
    getEl('form-daily-sales').reset();
    dateInput.value = new Date().toISOString().split('T')[0];
    getEl('form-title').textContent = "บันทึกยอดขายประจำวัน";
    getEl('btn-cancel-edit').classList.add('hidden');
    validateSum();
}

getEl('btn-cancel-edit')?.addEventListener('click', resetForm);

// --- Dashboard Loading ---
async function loadDashboard() {
    const todayStr = new Date().toISOString().split('T')[0];
    const monthPrefix = todayStr.substring(0, 7);

    try {
        const qSnap = await getDocs(query(
            collection(db, "sales"),
            where("date", ">=", monthPrefix + "-01"),
            where("date", "<=", monthPrefix + "-31")
        ));

        let todaySalesSatang = 0;
        let mtdSalesSatang = 0;
        let mtdVoidBills = 0;
        let recordCount = 0;
        const channelTotals = {};

        qSnap.forEach(d => {
            const data = d.data();
            mtdSalesSatang += (data.totalSalesSatang || 0);
            mtdVoidBills += (data.voidBill || 0);
            recordCount++;

            if (data.date === todayStr) {
                todaySalesSatang = data.totalSalesSatang || 0;
            }

            if (data.payments) {
                for (const [k, v] of Object.entries(data.payments)) {
                    channelTotals[k] = (channelTotals[k] || 0) + v;
                }
            }
        });

        // UI Metrics
        getEl('dash-today-sales').textContent = formatTHB(todaySalesSatang);
        getEl('dash-mtd-sales').textContent = formatTHB(mtdSalesSatang);
        getEl('dash-avg-day').textContent = formatTHB(recordCount > 0 ? Math.round(mtdSalesSatang / recordCount) : 0);
        getEl('dash-void-bills').textContent = `${mtdVoidBills} Bills`;

        const todayAch = currentSettings.dailyTargetSatang > 0 ? ((todaySalesSatang / currentSettings.dailyTargetSatang) * 100).toFixed(1) : 0;
        const mtdAch = currentSettings.monthlyTargetSatang > 0 ? ((mtdSalesSatang / currentSettings.monthlyTargetSatang) * 100).toFixed(1) : 0;

        getEl('dash-today-target').textContent = `${todayAch}% Target`;
        getEl('dash-mtd-target').textContent = `${mtdAch}% Target`;

        renderDashboardCharts(qSnap, channelTotals);
    } catch (err) {
        console.error("Dashboard Error:", err);
    }
}

function renderDashboardCharts(qSnap, channelTotals) {
    // 1. Sales Trend
    const trendLabels = [];
    const trendData = [];
    qSnap.forEach(d => {
        trendLabels.push(d.data().date);
        trendData.push(toTHB(d.data().totalSalesSatang));
    });

    if (trendChartInstance) trendChartInstance.destroy();
    const ctx1 = getEl('chart-sales-trend')?.getContext('2d');
    if (ctx1) {
        trendChartInstance = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: trendLabels,
                datasets: [{ label: 'Sales (THB)', data: trendData, borderColor: '#0f172a', tension: 0.3, fill: false }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 2. Payment Mix
    if (mixChartInstance) mixChartInstance.destroy();
    const ctx2 = getEl('chart-payment-mix')?.getContext('2d');
    if (ctx2) {
        mixChartInstance = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: Object.keys(channelTotals),
                datasets: [{ data: Object.values(channelTotals).map(toTHB), backgroundColor: ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
}

// --- History Page & Edit / Delete Handlers ---
async function loadHistory() {
    const tbody = getEl('table-history-body');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">กำลังโหลด...</td></tr>';

    try {
        const qSnap = await getDocs(query(collection(db, "sales")));
        tbody.innerHTML = '';

        if (qSnap.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">ไม่มีข้อมูลบันทึก</td></tr>';
            return;
        }

        const docs = [];
        qSnap.forEach(d => docs.push(d.data()));
        docs.sort((a, b) => b.date.localeCompare(a.date));

        docs.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition';
            tr.innerHTML = `
                <td class="p-3.5 font-bold text-slate-800">${item.date}</td>
                <td class="p-3.5 text-right font-bold text-slate-900">${formatTHB(item.totalSalesSatang)}</td>
                <td class="p-3.5 text-center font-semibold text-rose-600">${item.voidBill || 0}</td>
                <td class="p-3.5 text-slate-500 text-[11px]">${item.updatedBy || 'N/A'}</td>
                <td class="p-3.5 text-center">
                    <button class="btn-edit text-xs font-semibold text-indigo-600 hover:underline mr-2" data-date="${item.date}">Edit</button>
                    <button class="btn-delete text-xs font-semibold text-rose-600 hover:underline" data-date="${item.date}">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Event Attachments
        document.querySelectorAll('.btn-edit').forEach(b => {
            b.addEventListener('click', (e) => editRecord(e.target.getAttribute('data-date')));
        });
        document.querySelectorAll('.btn-delete').forEach(b => {
            b.addEventListener('click', (e) => triggerDeleteModal(e.target.getAttribute('data-date')));
        });

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-500">Error: ${err.message}</td></tr>`;
    }
}

async function editRecord(dateStr) {
    try {
        const docSnap = await getDoc(doc(db, "sales", dateStr));
        if (!docSnap.exists()) return;
        const data = docSnap.data();

        document.querySelector('[data-page="page-daily"]').click();

        dateInput.value = data.date;
        totalInput.value = toTHB(data.totalSalesSatang);
        getEl('sale-void').value = data.voidBill || 0;

        if (data.payments) {
            payInputs.forEach(input => {
                const key = input.getAttribute('data-pay');
                input.value = toTHB(data.payments[key] || 0);
            });
        }

        getEl('form-title').textContent = `แก้ไขข้อมูลยอดขาย (${dateStr})`;
        getEl('btn-cancel-edit').classList.remove('hidden');
        validateSum();

    } catch (err) {
        alert("ไม่สามารถดึงข้อมูลเพื่อแก้ไขได้: " + err.message);
    }
}

// Modal Delete Handling
function triggerDeleteModal(dateStr) {
    activeDeleteDate = dateStr;
    getEl('delete-date-target').textContent = dateStr;
    getEl('modal-delete').classList.remove('hidden');
}

getEl('btn-cancel-delete')?.addEventListener('click', () => {
    activeDeleteDate = null;
    getEl('modal-delete').classList.add('hidden');
});

getEl('btn-confirm-delete')?.addEventListener('click', async () => {
    if (!activeDeleteDate) return;
    try {
        await deleteDoc(doc(db, "sales", activeDeleteDate));
        alert(`ลบข้อมูลวันที่ ${activeDeleteDate} เรียบร้อยแล้ว`);
        getEl('modal-delete').classList.add('hidden');
        activeDeleteDate = null;
        loadHistory();
    } catch (err) {
        alert("เกิดข้อผิดพลาดในการลบ: " + err.message);
    }
});

// --- Reports Page ---
async function loadReports() {
    const list = getEl('report-payment-list');
    list.innerHTML = '<li>กำลังประมวลผล...</li>';

    try {
        const qSnap = await getDocs(query(collection(db, "sales")));
        const totals = {};

        qSnap.forEach(d => {
            const p = d.data().payments;
            if (p) {
                for (const [k, v] of Object.entries(p)) {
                    totals[k] = (totals[k] || 0) + v;
                }
            }
        });

        list.innerHTML = '';
        for (const [k, v] of Object.entries(totals)) {
            const li = document.createElement('li');
            li.className = 'flex justify-between border-b border-slate-100 py-1.5';
            li.innerHTML = `<span class="text-slate-600 font-medium">${k}</span> <span class="font-bold text-slate-800">${formatTHB(v)}</span>`;
            list.appendChild(li);
        }

        if (reportChartInstance) reportChartInstance.destroy();
        const ctx = getEl('chart-report-pie')?.getContext('2d');
        if (ctx) {
            reportChartInstance = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: Object.keys(totals),
                    datasets: [{ data: Object.values(totals).map(toTHB), backgroundColor: ['#0f172a', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'] }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    } catch (err) {
        list.innerHTML = `<li class="text-rose-500">Error: ${err.message}</li>`;
    }
}
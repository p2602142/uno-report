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
    collection, 
    query, 
    where, 
    getDocs, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyA_0BTgJcF8Q4HSNEJbOxQH3fMXtFVsMks",
  authDomain: "sale-performance-report.firebaseapp.com",
  projectId: "sale-performance-report",
  storageBucket: "sale-performance-report.firebasestorage.app",
  messagingSenderId: "936685375762",
  appId: "1:936685375762:web:235f96930f74d898d163cb"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Helper Functions
const getEl = (id) => document.getElementById(id);

const setVisible = (element, isVisible) => {
    if (!element) return;
    if (isVisible) {
        element.classList.remove('hidden');
    } else {
        element.classList.add('hidden');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    
    // Set Default Date to Today
    const salesDateEl = getEl('sales-date');
    if (salesDateEl) {
        salesDateEl.value = new Date().toISOString().split('T')[0];
    }

    // Auth State
    onAuthStateChanged(auth, (user) => {
        const loginSection = getEl('login-section');
        const appSection = getEl('app-section');
        const userEmailEl = getEl('user-email');

        if (user) {
            setVisible(loginSection, false);
            setVisible(appSection, true);
            if (userEmailEl) userEmailEl.textContent = user.email;
        } else {
            setVisible(loginSection, true);
            setVisible(appSection, false);
        }
    });

    // Login Event
    const btnLogin = getEl('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = getEl('email')?.value.trim() || '';
            const password = getEl('password')?.value || '';
            const loginError = getEl('login-error');

            setVisible(loginError, false);

            if (!email || !password) {
                if (loginError) {
                    loginError.textContent = "กรุณากรอก Email และ Password";
                    setVisible(loginError, true);
                }
                return;
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (err) {
                if (loginError) {
                    loginError.textContent = "เข้าสู่ระบบไม่สำเร็จ: " + err.message;
                    setVisible(loginError, true);
                }
            }
        });
    }

    // Logout Event
    const btnLogout = getEl('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => signOut(auth));
    }

    // Save Daily Sales Event
    const salesForm = getEl('sales-form');
    if (salesForm) {
        salesForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const dateStr = getEl('sales-date')?.value;
            const totalSales = parseFloat(getEl('total-sales')?.value) || 0;
            const voidBills = parseInt(getEl('pay-void')?.value, 10) || 0;

            if (!dateStr) {
                alert("กรุณาเลือกวันที่ก่อนบันทึกข้อมูล");
                return;
            }

            // Payment List ตามฟอร์มของคุณ
            const payments = {
                "Cash": parseFloat(getEl('pay-cash')?.value) || 0,
                "Credit Card": parseFloat(getEl('pay-credit')?.value) || 0,
                "QR Payment": parseFloat(getEl('pay-qr')?.value) || 0,
                "PromptPay": parseFloat(getEl('pay-promptpay')?.value) || 0,
                "TrueMoney": parseFloat(getEl('pay-truemoney')?.value) || 0,
                "Bank Transfer": parseFloat(getEl('pay-banktransfer')?.value) || 0,
                "Line Pay": parseFloat(getEl('pay-linepay')?.value) || 0,
                "Alipay": parseFloat(getEl('pay-alipay')?.value) || 0,
                "Line Man": parseFloat(getEl('pay-lineman')?.value) || 0,
                "Grab": parseFloat(getEl('pay-grab')?.value) || 0
            };

            try {
                await setDoc(doc(db, "daily_sales", dateStr), {
                    sales_date: dateStr,
                    total_sales: totalSales,
                    void_bills: voidBills,
                    payments: payments,
                    updated_at: serverTimestamp()
                });
                alert(`บันทึกข้อมูลวันที่ ${dateStr} เรียบร้อยแล้ว!`);
            } catch (err) {
                alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
            }
        });
    }

    // Load Daily Report Event
    const btnLoadReport = getEl('btn-load-report');
    if (btnLoadReport) {
        btnLoadReport.addEventListener('click', async () => {
            const dateStr = getEl('sales-date')?.value;
            const reportView = getEl('report-view');
            
            if (!dateStr) {
                alert("กรุณาเลือกวันที่ก่อนดึงรายงาน");
                return;
            }

            try {
                const docRef = doc(db, "daily_sales", dateStr);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    alert(`ไม่พบข้อมูลยอดขายของวันที่ ${dateStr}`);
                    setVisible(reportView, false);
                    return;
                }

                const dailyData = docSnap.data();

                // คำนวณ MTD
                const firstDayOfMonthStr = dateStr.substring(0, 7) + "-01";
                const mtdQuery = query(
                    collection(db, "daily_sales"),
                    where("sales_date", ">=", firstDayOfMonthStr),
                    where("sales_date", "<=", dateStr)
                );

                const querySnapshot = await getDocs(mtdQuery);
                let mtdTotal = 0;
                querySnapshot.forEach((d) => {
                    mtdTotal += Number(d.data().total_sales) || 0;
                });

                // แสดงผลในหน้า UI
                const resDaily = getEl('res-daily');
                const resMtd = getEl('res-mtd');
                const resVoid = getEl('res-void');
                const resPayments = getEl('res-payments');
                const topChannel = getEl('top-channel');

                if (resDaily) {
                    resDaily.textContent = (dailyData.total_sales || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 }) + " THB";
                }

                if (resMtd) {
                    resMtd.textContent = mtdTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 }) + " THB";
                }

                if (resVoid) {
                    resVoid.textContent = (dailyData.void_bills || 0) + " BILL";
                }

                if (resPayments) {
                    resPayments.innerHTML = '';
                    let maxAmount = -1;
                    let topMethodName = '-';

                    if (dailyData.payments) {
                        for (const [method, amount] of Object.entries(dailyData.payments)) {
                            if (amount > maxAmount && amount > 0) {
                                maxAmount = amount;
                                topMethodName = method;
                            }

                            const li = document.createElement('li');
                            li.className = 'flex justify-between border-b border-slate-100 py-1.5';
                            li.innerHTML = `
                                <span class="font-medium text-slate-600">${method}</span>
                                <span class="font-semibold text-slate-800">${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB</span>
                            `;
                            resPayments.appendChild(li);
                        }
                    }

                    if (topChannel) topChannel.textContent = topMethodName;
                }

                setVisible(reportView, true);

            } catch (err) {
                alert("เกิดข้อผิดพลาดในการดึงรายงาน: " + err.message);
            }
        });
    }
});

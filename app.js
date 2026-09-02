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

// --- Firebase Configuration (อ้างอิงจาก Firebase Console ของคุณ) ---
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

// DOM Elements
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginError = document.getElementById('login-error');

// Set default date picker value to today (YYYY-MM-DD)
const today = new Date().toISOString().split('T')[0];
document.getElementById('sales-date').value = today;

// Listen for Authentication State Changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
    } else {
        loginSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
});

// User Login Event
document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    loginError.classList.add('hidden');

    if (!email || !password) {
        loginError.textContent = "กรุณากรอก Email และ Password";
        loginError.classList.remove('hidden');
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        loginError.textContent = "เข้าสู่ระบบไม่สำเร็จ: " + err.message;
        loginError.classList.remove('hidden');
    }
});

// User Logout Event
document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

// Save Daily Sales Event
document.getElementById('sales-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const dateStr = document.getElementById('sales-date').value;
    const totalSales = parseFloat(document.getElementById('total-sales').value) || 0;

    const payments = {
        "Cash": parseFloat(document.getElementById('pay-cash').value) || 0,
        "Credit Card": parseFloat(document.getElementById('pay-credit').value) || 0,
        "QR Payment": parseFloat(document.getElementById('pay-qr').value) || 0,
        "Line Man": parseFloat(document.getElementById('pay-lineman').value) || 0,
        "Grab": parseFloat(document.getElementById('pay-grab').value) || 0
    };

    try {
        await setDoc(doc(db, "daily_sales", dateStr), {
            sales_date: dateStr,
            total_sales: totalSales,
            payments: payments,
            updated_at: serverTimestamp()
        });
        alert(`บันทึกข้อมูลวันที่ ${dateStr} เรียบร้อยแล้ว!`);
    } catch (err) {
        alert("เกิดข้อผิดพลาดในการบันทึก: " + err.message);
    }
});

// Load Daily Report & Calculate MTD Event
document.getElementById('btn-load-report').addEventListener('click', async () => {
    const dateStr = document.getElementById('sales-date').value;
    
    if (!dateStr) {
        alert("กรุณาเลือกวันที่ก่อนดึงรายงาน");
        return;
    }

    try {
        // 1. Fetch Selected Date's Sales Summary
        const docRef = doc(db, "daily_sales", dateStr);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            alert(`ไม่พบข้อมูลยอดขายของวันที่ ${dateStr}`);
            document.getElementById('report-view').classList.add('hidden');
            return;
        }

        const dailyData = docSnap.data();

        // 2. Compute MTD (Sum total_sales from 1st of the month to selected date)
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

        // 3. Render Results to UI
        document.getElementById('res-daily').textContent = dailyData.total_sales.toLocaleString('th-TH', { minimumFractionDigits: 2 }) + " THB";
        document.getElementById('res-mtd').textContent = mtdTotal.toLocaleString('th-TH', { minimumFractionDigits: 2 }) + " THB";

        const payList = document.getElementById('res-payments');
        payList.innerHTML = '';
        
        if (dailyData.payments) {
            for (const [method, amount] of Object.entries(dailyData.payments)) {
                if (amount > 0) {
                    const li = document.createElement('li');
                    li.className = 'flex justify-between border-b border-gray-100 py-1';
                    li.innerHTML = `<span>${method}:</span> <span class="font-medium">${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB</span>`;
                    payList.appendChild(li);
                }
            }
        }

        document.getElementById('report-view').classList.remove('hidden');

    } catch (err) {
        alert("เกิดข้อผิดพลาดในการดึงรายงาน: " + err.message);
    }
});
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { auth } from "../config/firebase.js";
import { $ } from "../utils/currency.js";
import { showToast } from "../components/toast.js";

export function getCurrentUser() {
  return auth.currentUser;
}

export function getLoggedInUserIdentifier() {
  return auth.currentUser?.email || auth.currentUser?.uid || "staff@unocoffee.com";
}

export function updateAuthUI(user) {
  const userPill = $("current-user-pill");
  const userEmail = $("user-email");
  const btnAuth = $("btn-auth");

  if (user) {
    if (userPill) userPill.classList.remove("hidden");
    if (userEmail) userEmail.textContent = user.email || "Staff Logged In";
    if (btnAuth) {
      btnAuth.innerHTML = `
        <svg class="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h4a3 3 0 013 3v1"></path></svg>
        <span>Logout</span>
      `;
      btnAuth.title = "ออกจากระบบ";
    }
  } else {
    if (userPill) userPill.classList.add("hidden");
    if (userEmail) userEmail.textContent = "Guest Mode";
    if (btnAuth) {
      btnAuth.innerHTML = `
        <svg class="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 01-3-3h7a3 3 0 013 3v1"></path></svg>
        <span>Login</span>
      `;
      btnAuth.title = "เข้าสู่ระบบ";
    }
  }
}

export function initAuth(onStateChangedCallback) {
  onAuthStateChanged(auth, user => {
    updateAuthUI(user);
    if (typeof onStateChangedCallback === "function") {
      onStateChangedCallback(user);
    }
  });

  // Modal bindings
  $("btn-auth")?.addEventListener("click", () => {
    if (auth.currentUser) {
      signOut(auth)
        .then(() => showToast("ออกจากระบบเรียบร้อยแล้ว", "success"))
        .catch(err => showToast("เกิดข้อผิดพลาดในการออกจากระบบ: " + err.message, "danger"));
    } else {
      $("auth-modal")?.classList.remove("hidden");
    }
  });

  $("btn-close-auth")?.addEventListener("click", () => {
    $("auth-modal")?.classList.add("hidden");
  });

  $("form-auth")?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("auth-email")?.value?.trim();
    const password = $("auth-password")?.value;
    const submitBtn = $("btn-submit-auth");

    if (!email || !password) {
      return showToast("กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน", "warning");
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "กำลังดำเนินการ...";
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      showToast(`เข้าสู่ระบบสำเร็จ: ${email}`, "success");
      $("auth-modal")?.classList.add("hidden");
      $("auth-email").value = "";
      $("auth-password").value = "";
    } catch (err) {
      console.warn("Sign-in failed, trying register:", err);
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        try {
          await createUserWithEmailAndPassword(auth, email, password);
          showToast(`สร้างบัญชีและเข้าสู่ระบบสำเร็จ: ${email}`, "success");
          $("auth-modal")?.classList.add("hidden");
          $("auth-email").value = "";
          $("auth-password").value = "";
        } catch (regErr) {
          showToast("เข้าสู่ระบบไม่สำเร็จ: " + (regErr.message || regErr), "danger");
        }
      } else {
        showToast("เข้าสู่ระบบไม่สำเร็จ: " + (err.message || err), "danger");
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "เข้าสู่ระบบ / ลงทะเบียน";
      }
    }
  });
}

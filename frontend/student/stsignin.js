// ===========================
//  stsignin.js
// ===========================

const API_BASE = "http://localhost:5000/api";

const form = document.getElementById("loginForm");

// ── Show inline error ─────────────────────────────────
function showError(msg) {
  let err = document.getElementById("formError");
  if (!err) {
    err = document.createElement("div");
    err.id = "formError";
    err.style.cssText = `
      color: #ef4444;
      font-size: 13px;
      font-weight: 700;
      margin-top: -6px;
      margin-bottom: 4px;
      text-align: center;
    `;
    const btn = form.querySelector(".signin-btn");
    btn.insertAdjacentElement("beforebegin", err);
  }
  err.textContent = msg;
}

function clearError() {
  const err = document.getElementById("formError");
  if (err) err.textContent = "";
}

// ── Submit ────────────────────────────────────────────
form.addEventListener("submit", async function (e) {
  e.preventDefault();
  clearError();

  const admission_no = document.getElementById("admission_no").value.trim();
  const password     = document.getElementById("password").value;

  if (!admission_no || !password) {
    showError("Please enter your Admission Number and password.");
    return;
  }

  const btn = form.querySelector(".signin-btn");
  btn.textContent = "Signing in...";
  btn.disabled    = true;

  try {
    const res = await fetch(`${API_BASE}/auth/student-login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ admission_no, password }),
    });

    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem("student_auth_token", data.token); // ← was "authToken"
      window.location.href = "student-dashboard.html";
    } else {
      showError(data.message || "Login failed. Please try again.");
      btn.textContent = "Sign In";
      btn.disabled    = false;
    }

  } catch (err) {
    console.error("Login error:", err);
    showError("Cannot connect to server. Is it running on port 5000?");
    btn.textContent = "Sign In";
    btn.disabled    = false;
  }
});

// Password toggle
const togglePassword = document.getElementById("togglePassword");
const passwordInput  = document.getElementById("password");

togglePassword.addEventListener("click", function () {
  const type = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = type;
  this.textContent = type === "password" ? "👁️" : "🙈";
});
// ===========================
//  faculty-signin.js
// ===========================

const API_BASE = "http://localhost:5000/api";

const form    = document.getElementById("signinForm");
const idInput = document.getElementById("faculty_no");
const pwInput = document.getElementById("password");
const btn     = form.querySelector(".signin-btn");

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
    btn.insertAdjacentElement("beforebegin", err);
  }
  err.textContent = msg;
}

function clearError() {
  const err = document.getElementById("formError");
  if (err) err.textContent = "";
}

// ── Submit ────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const faculty_no = idInput.value.trim();
  const password   = pwInput.value;

  if (!faculty_no || !password) {
    showError("Please enter your Faculty No. and password.");
    return;
  }

  btn.textContent = "Signing in...";
  btn.disabled    = true;

  try {
    const res = await fetch(`${API_BASE}/auth/faculty-login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ faculty_no, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.message || "Invalid credentials. Please try again.");
      btn.textContent = "Sign In";
      btn.disabled    = false;
      return;
    }

    // ── Store token + role ────────────────────────────
    localStorage.setItem("authToken", data.token);
    localStorage.setItem("userRole",  "faculty");

    // ── Redirect to faculty dashboard ─────────────────
    window.location.href = "faculty-dashboard.html";

  } catch (err) {
    console.error("Login error:", err);
    showError("Server error. Please try again.");
    btn.textContent = "Sign In";
    btn.disabled    = false;
  }
});
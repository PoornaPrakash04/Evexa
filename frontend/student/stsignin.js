// ===========================
//  stsignin.js
// ===========================

const API_BASE = "https://evexa-production.up.railway.app/api";

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

  const identifier = document.getElementById("admission_no").value.trim();
  const password   = document.getElementById("password").value;

  if (!identifier || !password) {
    showError("Please enter your Admission Number and password.");
    return;
  }

  const btn = form.querySelector(".signin-btn");
  btn.textContent = "Signing in...";
  btn.disabled    = true;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ role: "STUDENT", identifier, password }),
    });

    // Guard: if the server returned HTML (e.g. a 404 page), don't try to parse it as JSON
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Unexpected server response (HTTP ${res.status}). Is the server running?`);
    }

    const data = await res.json();

    if (res.ok && data.accessToken) {
      localStorage.setItem("student_auth_token",    data.accessToken);
      localStorage.setItem("student_refresh_token", data.refreshToken);
      window.location.href = "student-dashboard.html";
    } else {
      showError(data.message || "Login failed. Please try again.");
      btn.textContent = "Sign In";
      btn.disabled    = false;
    }

  } catch (err) {
    console.error("Login error:", err);
    showError(err.message || "Cannot connect to server. Is it running on port 5000?");
    btn.textContent = "Sign In";
    btn.disabled    = false;
  }
});

// ── Password toggle ───────────────────────────────────
const togglePassword = document.getElementById("togglePassword");
const passwordInput  = document.getElementById("password");

togglePassword.addEventListener("click", function () {
  const type = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = type;
  this.textContent   = type === "password" ? "👁️" : "🙈";
});
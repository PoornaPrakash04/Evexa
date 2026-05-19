const API_BASE = "https://evexa-production.up.railway.app/api";

const form    = document.getElementById("signinForm");
const idInput = document.getElementById("faculty_no");
const pwInput = document.getElementById("password");
const btn     = form.querySelector(".signin-btn");

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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const identifier = idInput.value.trim();
  const password   = pwInput.value;

  if (!identifier || !password) {
    showError("Please enter your Faculty No. and password.");
    return;
  }

  btn.textContent = "Signing in...";
  btn.disabled    = true;

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "FACULTY", identifier, password }),
    });

    let data = {};
    const ct = response.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await response.json();
    }

    if (!response.ok) {
      showError(data.message || "Invalid credentials. Please try again.");
      btn.textContent = "Sign In";
      btn.disabled    = false;
      return;
    }
    if (!data.accessToken) {
  showError("Login failed. Please try again.");
  btn.textContent = "Sign In";
  btn.disabled    = false;
  return;
}

localStorage.setItem("faculty_auth_token",   data.accessToken);
localStorage.setItem("faculty_refresh_token", data.refreshToken);

// ── Fetch role then redirect ──────────────────────────────
const meRes = await fetch(`${API_BASE}/faculty/me`, {
  headers: { Authorization: `Bearer ${data.accessToken}` }
});

if (!meRes.ok) {
  // Clean up stored tokens — login effectively failed if we can't get the profile
  localStorage.removeItem("faculty_auth_token");
  localStorage.removeItem("faculty_refresh_token");
  showError("Failed to load faculty profile. Please try again.");
  btn.textContent = "Sign In";
  btn.disabled    = false;
  return;
}

const me = await meRes.json();

const roleRedirects = {
  4: "/faculty/faculty-coordinator/faculty-dashboard.html",
  6: "/faculty/hall-coordinator/hall-dashboard.html",
  1: "/faculty/hod/hod-dashboard.html",
  2: "/faculty/faculty-dashboard.html",
  3: "/faculty/staff-advisor/staff-advisor-dashboard.html",
  5: "/faculty/dean/dean-dashboard.html",
};

// Hall coordinator is a derived property — a STAFF member who manages venues
// should go to the hall dashboard regardless of their base role_id.
const destination = me.is_hall_coordinator
  ? "/faculty/hall-coordinator/hall-dashboard.html"
  : (roleRedirects[me.role_id] || "/faculty/faculty-dashboard.html");
window.location.href = destination;

  } catch (err) {
    console.error("Login error:", err);
    showError("Network error. Please try again.");
    btn.textContent = "Sign In";
    btn.disabled    = false;
  }
});

const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", () => {
  const type = pwInput.type === "password" ? "text" : "password";
  pwInput.type = type;
  togglePassword.textContent = type === "password" ? "👁️" : "🙈";
});
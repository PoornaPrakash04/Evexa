// admin-signin.js

document.getElementById("signinForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  const adminId  = document.getElementById("admin_id").value.trim();
  const password = document.getElementById("password").value;
  const btn      = this.querySelector(".signin-btn");

  if (!adminId || !password) {
    showError("Please fill in all fields.");
    return;
  }

  btn.textContent = "Signing in…";
  btn.disabled    = true;

  try {
    const res = await fetch("http://localhost:5000/api/admin/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: adminId, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      showError(data.message || "Invalid credentials.");
      return;
    }

  
    localStorage.setItem("adminToken", data.token);
    localStorage.setItem("adminName",  data.name || "Admin");
    window.location.href = "admin.html";

  } catch (err) {
    showError("Could not connect to server. Try again.");
  } finally {
    btn.textContent = "Sign In";
    btn.disabled    = false;
  }
});

function showError(msg) {
  let el = document.getElementById("errorMsg");
  if (!el) {
    el = document.createElement("p");
    el.id = "errorMsg";
    el.style.cssText = "color:#ef4444;font-size:13px;font-weight:700;text-align:center;margin-top:10px;";
    document.getElementById("signinForm").appendChild(el);
  }
  el.textContent = msg;
}
const togglePassword = document.getElementById("togglePassword");
const passwordInput  = document.getElementById("password");

togglePassword.addEventListener("click", function () {
  const type = passwordInput.type === "password" ? "text" : "password";
  passwordInput.type = type;
  this.textContent = type === "password" ? "👁️" : "🙈";
});
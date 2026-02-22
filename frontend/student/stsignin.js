// stsignin.js
async function studentLogin(event) {
  event.preventDefault(); // stops page reload

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const btn      = document.querySelector(".signin-btn");

  // Loading state
  btn.textContent = "Signing in...";
  btn.disabled = true;

  try {
    const res = await fetch("http://localhost:5000/api/auth/student-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok && data.token) {
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("userRole", "STUDENT");
      window.location.href = "student-dashboard.html";
    } else {
      alert(data.message || "Login failed");
      btn.textContent = "Sign In";
      btn.disabled = false;
    }
  } catch (err) {
    alert("Cannot connect to server. Is it running on port 5000?");
    btn.textContent = "Sign In";
    btn.disabled = false;
  }
}
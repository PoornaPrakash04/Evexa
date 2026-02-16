const form = document.getElementById("loginForm");

form.addEventListener("submit", async function (e) {
  e.preventDefault();
  
  console.log("=== LOGIN ATTEMPT ===");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  
  console.log("Email:", email);

  try {
    const response = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    console.log("Response status:", response.status);
    
    const data = await response.json();
    console.log("Response data:", data);

    if (response.ok && data.token) {
      console.log("✅ Token received:", data.token);
      
      // Save token
      localStorage.setItem("authToken", data.token);
      
      // Verify it was saved
      const saved = localStorage.getItem("authToken");
      console.log("✅ Token saved, verified:", saved);
      
      // Wait a bit then redirect
      setTimeout(() => {
        console.log("✅ Redirecting now...");
        window.location.href = "http://127.0.0.1:5501/frontend/orgfront.html";
      }, 500);
      
    } else {
      console.error("❌ Login failed:", data.message);
      alert(data.message || "Login failed");
    }
  } catch (error) {
    console.error("❌ Error:", error);
    alert("Network error: " + error.message);
  }
});

console.log("✅ Login script loaded");
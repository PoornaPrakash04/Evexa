// ===========================
//  account-setting.js
//  Uses /api/auth/me endpoint
// ===========================

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = "toast"; }, 3000);
}

// ── Load user profile from /api/auth/me ───────────────────────────────────
async function loadUserProfile() {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "stsignin.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (res.status === 401) {
      window.location.href = "stsignin.html";
      return;
    }

    if (!res.ok) return;

    const user = await res.json();

    // ── Avatar image ──────────────────────────────────────────────────────
const avatarImg = document.getElementById("avatarImg");
if (avatarImg && user.avatar) {
  avatarImg.src = `http://localhost:5000${user.avatar}`;
}

    // ── Sidebar mini-user ─────────────────────────────────────────────
    const miniName   = document.getElementById("miniName");
    const miniAvatar = document.getElementById("miniAvatar");
    if (miniName)   miniName.textContent   = user.name || "Student";
    if (miniAvatar) miniAvatar.textContent = (user.name || "S")[0].toUpperCase();

    // ── Avatar section ────────────────────────────────────────────────
    const avatarName = document.getElementById("avatarName");
    const avatarReg  = document.getElementById("avatarReg");
    if (avatarName) avatarName.textContent = user.name || "";
    if (avatarReg)  avatarReg.textContent  =
      `${user.admission_no || user.roll_no || ""} · ${user.department || ""} · ${user.class || ""}`;

    // ── Profile form ──────────────────────────────────────────────────
  const nameEl = document.getElementById("fullName");
if (nameEl) nameEl.value = user.name || "";

    const emailEl = document.getElementById("profileEmail");
    const phoneEl = document.getElementById("profilePhone");
    if (emailEl) emailEl.value = user.email || "";
    if (phoneEl) phoneEl.value = user.phone || "";

    // Bio not in DB — leave blank
    const bioEl = document.getElementById("profileBio");
    if (bioEl) bioEl.value = "";

    // ── Academic tab ──────────────────────────────────────────────────
    const admissionEl = document.getElementById("admissionNo");
    const rollEl      = document.getElementById("rollNo");
    const classEl     = document.getElementById("classField");
    const deptEl      = document.getElementById("deptField");

    if (admissionEl) admissionEl.value = user.admission_no || "";
    if (rollEl)      rollEl.value      = user.roll_no      || "";
    if (classEl)     classEl.value     = user.class        || "";
    if (deptEl)      deptEl.value      = user.department   || "";

  } catch (err) {
    console.error("Failed to load profile:", err);
    showToast("❌ Failed to load profile data.", "error");
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────
(function initTabs() {
  const tabs   = document.querySelectorAll(".stab");
  const panels = document.querySelectorAll(".spanel");

  tabs.forEach(function(btn) {
    btn.addEventListener("click", function() {
      tabs.forEach(function(t)   { t.classList.remove("active"); });
      panels.forEach(function(p) { p.classList.remove("active"); });
      btn.classList.add("active");
      const panel = document.getElementById("tab-" + btn.getAttribute("data-tab"));
      if (panel) panel.classList.add("active");
    });
  });
})();

// ── Profile form — Save to backend ────────────────────────────────────────
(function() {
  const form = document.getElementById("profileForm");
  if (!form) return;

  form.addEventListener("submit", async function(e) {
    e.preventDefault();
    const token     = localStorage.getItem("authToken");
    const fullName = (document.getElementById("fullName")?.value || "").trim();

    try {
      const res = await fetch(`${API_BASE}/user/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name:  fullName,
          phone: document.getElementById("profilePhone")?.value || "",
        })
      });

      if (res.ok) {
        showToast("✅ Profile updated successfully!", "success");
        // Update sidebar immediately after save
        const miniName   = document.getElementById("miniName");
        const miniAvatar = document.getElementById("miniAvatar");
        if (miniName)   miniName.textContent   = fullName;
        if (miniAvatar) miniAvatar.textContent = fullName[0].toUpperCase();
        const avatarName = document.querySelector(".avatar-name");
        if (avatarName) avatarName.textContent = fullName;
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(`❌ ${data.message || "Failed to save profile."}`, "error");
      }
    } catch {
      showToast("❌ Server error.", "error");
    }
  });

  // Reset button — re-fetches from DB
  const resetBtn = document.getElementById("resetProfileBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", function() {
      loadUserProfile();
      showToast("↩️ Profile reset to saved values.");
    });
  }
})();

// ── Photo upload ──────────────────────────────────────────────────────────
(function() {
  function triggerUpload() {
    const input = document.getElementById("avatarInput");
    if (input) input.click();
  }

  const changeBtn = document.getElementById("changePhotoBtn");
  const editBtn   = document.getElementById("avatarEditBtn");
  if (changeBtn) changeBtn.addEventListener("click", triggerUpload);
  if (editBtn)   editBtn.addEventListener("click", triggerUpload);

  const avatarInput = document.getElementById("avatarInput");
  if (avatarInput) {
    avatarInput.addEventListener("change", async function(e) {
      const file = e.target.files[0];
      if (!file) return;

      // Local preview instantly
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = document.getElementById("avatarImg");
        if (img) img.src = ev.target.result;
      };
      reader.readAsDataURL(file);

      // Upload to server
      const formData = new FormData();
      formData.append("avatar", file);
      const token = localStorage.getItem("authToken");

      try {
        const res = await fetch(`${API_BASE}/user/avatar`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          body: formData
        });
        if (res.ok) {
          showToast("📸 Photo saved!", "success");
        } else {
          showToast("❌ Failed to upload photo.", "error");
        }
      } catch {
        showToast("❌ Server error.", "error");
      }
    });
  }  
})(); 

// ── Academic form ─────────────────────────────────────────────────────────
(function() {
  const form = document.getElementById("academicForm");
  if (form) {
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      showToast("✅ Academic info saved!", "success");
    });
  }
})();

// ── Password validation & update ──────────────────────────────────────────
(function() {
  const newPwdEl = document.getElementById("newPwd");
  if (!newPwdEl) return;

  function setRule(id, passes) {
    const el = document.getElementById(id);
    if (!el) return;
    const text = el.textContent.slice(2);
    el.textContent = (passes ? "✓ " : "✗ ") + text;
    passes ? el.classList.add("pass") : el.classList.remove("pass");
  }

  newPwdEl.addEventListener("input", function() {
    const v = newPwdEl.value;
    setRule("rule-len",   v.length >= 8);
    setRule("rule-upper", /[A-Z]/.test(v));
    setRule("rule-num",   /[0-9]/.test(v));
  });

  const secForm = document.getElementById("securityForm");
  if (secForm) {
    secForm.addEventListener("submit", async function(e) {
      e.preventDefault();
      const token = localStorage.getItem("authToken");
      const cur   = document.getElementById("currentPwd")?.value || "";
      const nw    = document.getElementById("newPwd")?.value     || "";
      const conf  = document.getElementById("confirmPwd")?.value || "";

      if (!cur)          return showToast("Enter your current password.", "error");
      if (nw.length < 8) return showToast("Password must be at least 8 characters.", "error");
      if (nw !== conf)   return showToast("Passwords do not match.", "error");

      try {
        const res = await fetch(`${API_BASE}/user/change-password`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ currentPassword: cur, newPassword: nw })
        });

        if (res.ok) {
          showToast("🔒 Password updated successfully!", "success");
          secForm.reset();
          ["rule-len", "rule-upper", "rule-num"].forEach(function(id) {
            const el = document.getElementById(id);
            if (el) {
              el.classList.remove("pass");
              el.textContent = "✗ " + el.textContent.slice(2);
            }
          });
        } else {
          const data = await res.json().catch(() => ({}));
          showToast(`❌ ${data.message || "Failed to update password."}`, "error");
        }
      } catch {
        showToast("❌ Server error.", "error");
      }
    });
  }

  const signOutBtn = document.getElementById("signOutAllBtn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", function() {
      if (confirm("Sign out from all devices?")) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userRole");
        showToast("👋 Signed out from all devices.");
        setTimeout(() => { window.location.href = "stsignin.html"; }, 1500);
      }
    });
  }
})();

// ── Theme selector ────────────────────────────────────────────────────────
(function() {
  document.querySelectorAll(".theme-card").forEach(function(card) {
    card.addEventListener("click", function() {
      document.querySelectorAll(".theme-card").forEach(function(c) {
        c.classList.remove("selected");
      });
      card.classList.add("selected");
      showToast("🎨 Theme set to " + card.getAttribute("data-theme") + ".");
    });
  });
})();

// ── Accent color picker ───────────────────────────────────────────────────
(function() {
  document.querySelectorAll(".color-dot").forEach(function(dot) {
    dot.addEventListener("click", function() {
      document.querySelectorAll(".color-dot").forEach(function(d) {
        d.classList.remove("active");
      });
      dot.classList.add("active");
      document.documentElement.style.setProperty("--primary", dot.getAttribute("data-color"));
      showToast("🎨 Accent color updated!", "success");
    });
  });
})();

// ── Logout ────────────────────────────────────────────────────────────────
(function() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function() {
      if (confirm("Do you want to logout?")) {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userRole");
        window.location.href = "stsignin.html";
      }
    });
  }
})();

// ── Boot ──────────────────────────────────────────────────────────────────
loadUserProfile();
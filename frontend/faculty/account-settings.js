var API = "http://localhost:5000/api";

function applyTheme() {
  const saved = localStorage.getItem("evexa_theme");
  document.body.classList.toggle("dark", saved === "dark");
}

async function apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "faculty-signin.html";
    return null;
  }

  try {
    const res = await fetch(`${API}${endpoint}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {})
      }
    });

    if (res.status === 401) {
      localStorage.removeItem("authToken");
      window.location.href = "faculty-signin.html";
      return null;
    }

    if (!res.ok) {
      let msg = "Request failed";
      try {
        msg = await res.text();
      } catch (_) {}
      throw new Error(msg);
    }

    return await res.json();
  } catch (err) {
    console.error("apiFetch error:", err);
    return null;
  }
}

function goBack() {
  window.location.href = "faculty-dashboard.html";
}

function setMsg(text, isError = false) {
  const el = document.getElementById("formMsg");
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "msg error" : "msg";
}

function getInitials(name) {
  return (name || "FA")
    .split(" ")
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function updatePreviewName() {
  const nameInput = document.getElementById("name");
  const avatar = document.getElementById("profileAvatar");
  const preview = document.getElementById("profileNamePreview");

  if (!nameInput || !avatar || !preview) return;

  const name = nameInput.value.trim() || "Faculty Name";
  preview.textContent = name;
  avatar.textContent = getInitials(name);
}

async function loadProfile() {
  let profile = await apiFetch("/faculty/me");
  if (!profile) profile = await apiFetch("/auth/me");
  if (!profile) {
    setMsg("Failed to load profile.", true);
    return;
  }

  const facultyNoEl = document.getElementById("facultyNo");
  const departmentEl = document.getElementById("department");
  const nameEl = document.getElementById("name");
  const emailEl = document.getElementById("email");
  const phoneEl = document.getElementById("phone");
  const avatarEl = document.getElementById("profileAvatar");
  const previewEl = document.getElementById("profileNamePreview");

  if (facultyNoEl) facultyNoEl.value = profile.faculty_no || "";
  if (departmentEl) departmentEl.value = profile.department || "";
  if (nameEl) nameEl.value = profile.name || "";
  if (emailEl) emailEl.value = profile.email || "";
  if (phoneEl) phoneEl.value = profile.phone_no || profile.phone || "";

  if (avatarEl) avatarEl.textContent = getInitials(profile.name);
  if (previewEl) previewEl.textContent = profile.name || "Faculty Name";
}

async function saveProfile(e) {
  e.preventDefault();

  const name = document.getElementById("name")?.value.trim() || "";
  const email = document.getElementById("email")?.value.trim() || "";
  const department = document.getElementById("department")?.value.trim() || "";
  const phone = document.getElementById("phone")?.value.trim() || "";

  const currentPassword = document.getElementById("currentPassword")?.value.trim() || "";
  const newPassword = document.getElementById("newPassword")?.value.trim() || "";
  const confirmPassword = document.getElementById("confirmPassword")?.value.trim() || "";

  if (!name || !email || !department || !phone) {
    setMsg("Please fill all required fields.", true);
    return;
  }

  const wantsPasswordChange = currentPassword || newPassword || confirmPassword;

  if (wantsPasswordChange) {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMsg("Fill all password fields to change password.", true);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsg("New password and confirm password do not match.", true);
      return;
    }

    if (newPassword.length < 6) {
      setMsg("New password must be at least 6 characters.", true);
      return;
    }
  }

  const payload = {
    name,
    email,
    department,
    phone_no: phone
  };

  if (wantsPasswordChange) {
    payload.current_password = currentPassword;
    payload.new_password = newPassword;
  }

  const submitBtn = document.querySelector("#accountForm button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  setMsg("");

  const res = await apiFetch("/faculty/me", {
    method: "PUT",
    body: JSON.stringify(payload)
  });

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save Changes";
  }

  if (!res) {
    setMsg("Failed to update profile.", true);
    return;
  }

  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";

  updatePreviewName();
  setMsg("Profile updated successfully.");
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  loadProfile();

  document.getElementById("accountForm")?.addEventListener("submit", saveProfile);
  document.getElementById("name")?.addEventListener("input", updatePreviewName);
});
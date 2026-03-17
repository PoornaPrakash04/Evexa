/* ===========================
   orgexecom.js — Portal Mode
   =========================== */

const API = "http://localhost:5000/api";
const LOGIN_URL = "http://127.0.0.1:5501/frontend/organizer/ogsignin.html";

let execomMembersCache = [];
let organizerData = null;
let filtered = [];
let execomInited = false; // ✅ prevents double event binding

// ✅ Call this whenever you open the execom page
async function initExecomPage() {
  const grid = document.getElementById("execomGrid");
  if (!grid) return; // not on this page

  const token = localStorage.getItem("authToken");
  if (!token) return redirectToLogin();

  // ✅ Bind events only once
  if (!execomInited) {
    execomInited = true;

    // Back button inside execom page (portal)
    // Back button inside execom page (portal)
document.getElementById("backBtn")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  // 1) If this execom is inside the dashboard portal (SPA)
  if (typeof switchPage === "function") {
    switchPage("dashboard");
    return;
  }

  // 2) If user actually came from a previous page
  const ref = document.referrer;
  if (ref && ref !== location.href) {
    history.back();
    return;
  }

  // 3) Fallback: go to dashboard using a safe absolute path
  window.location.href = "http://127.0.0.1:5501/frontend/organizer/orgfront.html";
});
    document.getElementById("logoutBtn")?.addEventListener("click", logout);

    document.getElementById("addBtn")?.addEventListener("click", openAddExecomModal);
    document.getElementById("closeModalBtn")?.addEventListener("click", () => closeModal("execomEditModal"));
    document.getElementById("cancelBtn")?.addEventListener("click", () => closeModal("execomEditModal"));
    document.getElementById("execomEditForm")?.addEventListener("submit", submitExecomEdit);

    document.getElementById("searchBox")?.addEventListener("input", (e) => {
      const q = (e.target.value || "").toLowerCase().trim();
      filtered = execomMembersCache.filter(m =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.position || "").toLowerCase().includes(q)
      );
      renderExecom(filtered);
    });
  }

  // ✅ Load organizer only once (cached)
  if (!organizerData) {
    try {
      const me = await apiFetch("/auth/me");
      if (!me.ok) return redirectToLogin();
      organizerData = await me.json();

      // In portal you may not have #clubName — so check before setting
      const clubNameEl = document.getElementById("clubName");
      if (clubNameEl) {
        clubNameEl.textContent = organizerData.club ? `Club: ${organizerData.club}` : "Club not set";
      }
    } catch {
      return redirectToLogin();
    }
  }
 const club = organizerData?.club;
updateClubHero(club);
  await loadExecom();
}

// If you want it to auto-init when page loads (safe):
document.addEventListener("DOMContentLoaded", () => {
  // It will only run if execomGrid exists in DOM
  initExecomPage();
});

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("authToken");
  opts.headers = { "Authorization": `Bearer ${token}`, ...(opts.headers || {}) };
  return fetch(`${API}${path}`, opts);
}

function redirectToLogin() {
  localStorage.removeItem("authToken");
  window.location.href = LOGIN_URL;
}

function logout() {
  localStorage.removeItem("authToken");
  localStorage.removeItem("organizerData");
  localStorage.removeItem("currentPage");
  window.location.href = LOGIN_URL;
}

async function loadExecom() {
  const club = organizerData?.club;
  if (!club) {
    renderEmpty("No club found for this organizer");
    return;
  }

  try {
    const res = await apiFetch(`/execom/club/${encodeURIComponent(club)}`);
    if (!res.ok) {
      renderEmpty("Failed to load execom");
      return;
    }
    const members = await res.json();
    execomMembersCache = Array.isArray(members) ? members : [];
    filtered = [...execomMembersCache];
    renderExecom(filtered);
  } catch {
    renderEmpty("Execom load error");
  }
}

function renderEmpty(msg) {
  const grid = document.getElementById("execomGrid");
  if (!grid) return;
  grid.innerHTML = `
    <div style="grid-column:1/-1; padding:24px; border:1px dashed rgba(255,255,255,.12); border-radius:18px; opacity:.9;">
      <div style="font-size:18px; font-weight:900; font-family:Syne,sans-serif;">👥 Execom</div>
      <div style="margin-top:8px; color:rgba(238,240,255,.65);">${msg}</div>
    </div>
  `;
}

function initials(name = "?") {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";
}

function renderExecom(members) {
  const grid = document.getElementById("execomGrid");
  if (!grid) return;

  if (!members?.length) return renderEmpty("No members found");

  grid.innerHTML = members.map(m => `
    <div class="card">
      <div class="avatar">${initials(m.name)}</div>
      <div class="name">${escapeHtml(m.name || "—")}</div>
      <div class="pos">${escapeHtml(m.position || "—")}</div>
      <div class="cls">${escapeHtml(m.class || "N/A")}</div>

      <div class="actionsRow">
        <button class="small primary" data-edit="${m.id}">✏️ Edit</button>
        <button class="small danger" data-del="${m.id}">🗑️ Delete</button>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => openEditExecomModal(Number(btn.dataset.edit)));
  });

  grid.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => deleteExecomMember(Number(btn.dataset.del)));
  });
}

function openEditExecomModal(memberId) {
  const m = execomMembersCache.find(x => Number(x.id) === Number(memberId));
  if (!m) return showToast("❌ Member not found");

  document.getElementById("execomModalTitle").textContent = "✏️ Edit Member";
  document.getElementById("execomEditId").value = m.id || "";
  document.getElementById("execomEditName").value = m.name || "";
  document.getElementById("execomEditPosition").value = m.position || "";
  document.getElementById("execomEditClass").value = m.class || "";
  document.getElementById("execomEditEmail").value = m.email || "";
  document.getElementById("execomEditPhone").value = m.phone || "";

  openModal("execomEditModal");
}

function openAddExecomModal() {
  document.getElementById("execomModalTitle").textContent = "➕ Add Member";
  document.getElementById("execomEditForm").reset();
  document.getElementById("execomEditId").value = "";
  openModal("execomEditModal");
}

async function submitExecomEdit(e) {
  e.preventDefault();

  const id = document.getElementById("execomEditId").value.trim();
  const payload = {
    name: document.getElementById("execomEditName").value.trim(),
    position: document.getElementById("execomEditPosition").value.trim(),
    class: document.getElementById("execomEditClass").value.trim(),
    email: document.getElementById("execomEditEmail").value.trim(),
    phone: document.getElementById("execomEditPhone").value.trim(),
  };

  if (!payload.name || !payload.position) return showToast("⚠️ Name and Position are required");

  const url = id ? `/execom/${id}` : `/execom`;
  const method = id ? "PUT" : "POST";

  try {
    const res = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
  const text = await res.text().catch(() => "");
  console.error("Save failed:", res.status, text);

  let msg = `Failed (${res.status})`;
  try {
    const j = JSON.parse(text);
    msg = j.message || msg;
  } catch {}

  return showToast("❌ " + msg);
}

    showToast(id ? "✅ Member updated!" : "✅ Member added!");
    closeModal("execomEditModal");
    await loadExecom();
  } catch {
    showToast("❌ Network error");
  }
}

async function deleteExecomMember(id) {
  if (!confirm("Delete this member?")) return;

  try {
    const res = await apiFetch(`/execom/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return showToast("❌ " + (d.message || "Delete failed"));
    }
    showToast("🗑️ Member deleted");
    await loadExecom();
  } catch {
    showToast("❌ Network error");
  }
}

function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
  }, 2600);
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function updateClubHero(club) {
  const titleEl = document.getElementById("clubTitle");
  const descEl  = document.getElementById("clubDesc");
  const imgEl   = document.getElementById("clubImage");

  const CLUBS = {
    IEEE: {
      title: "IEEE",
      desc: "Institute of Electrical and Electronics Engineers student branch activities and events.",
      img: "images/ieee.jpg"
    },
    IEDC: {
      title: "IEDC",
      desc: "Innovation and Entrepreneurship Development Centre promoting startup culture and innovation.",
      img: "images/iedc.jpg"
    }
  };

  const c = CLUBS[club] || {
    title: club || "Club",
    desc: "Club details not configured yet.",
    img: "images/default-club.jpg"
  };

  if (titleEl) titleEl.textContent = c.title;
  if (descEl) descEl.textContent = c.desc;
  if (imgEl)  imgEl.src = c.img;
}
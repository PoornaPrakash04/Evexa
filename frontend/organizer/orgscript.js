/* ============================================================
   orgscript.js — EVEXA Organizer Portal (Backend-Connected)
   ============================================================ */

const API = "http://localhost:5000/api";
const LOGIN_URL = "http://127.0.0.1:5501/frontend/organizer/ogsignin.html";
let execomMembersCache = [];

if (window.__EVEXA_INITIALIZED__) {
  console.warn("EVEXA already initialized — skipping");
} else {
  window.__EVEXA_INITIALIZED__ = true;

  document.addEventListener("DOMContentLoaded", async () => {
    console.log("=== EVEXA DASHBOARD LOADING ===");

    const token = localStorage.getItem("authToken");
    if (!token) { redirectToLogin(); return; }

    try {
      const res = await apiFetch("/auth/me");
      if (!res.ok) { redirectToLogin(); return; }
      const organizer = await res.json();
      updateOrganizerProfile(organizer);
    } catch {
      redirectToLogin(); return;
    }

    setupSidebar();
    setupNotifications();
    setupDarkMode();
    setupProfile();
    setupQuickActions();
    setupSearchFilter();
    setupPressBounce();
    setupEventCalendarNav();

    await Promise.all([loadVenues()]);
    await loadAnnouncements();
    await loadEvents();

        const savedPage = "dashboard";
    localStorage.removeItem("currentPage");
    switchPage(savedPage);

    wireStaticButtons();
    console.log("✅ Dashboard ready");
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

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
  // Show confirmation modal
  const existing = document.getElementById("__logoutModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "__logoutModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('__logoutModal').remove()"
         style="position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9998;backdrop-filter:blur(6px);"></div>
    <div style="
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:9999;
      background:rgba(10,13,26,.97);
      border:1px solid rgba(236,72,153,.25);
      border-radius:24px;
      width:min(380px,90vw);
      padding:32px 28px;
      text-align:center;
      box-shadow:0 20px 60px rgba(0,0,0,.6), 0 0 40px rgba(236,72,153,.12);
      backdrop-filter:blur(20px);
      font-family:'Outfit',sans-serif;
    ">
      <!-- Hero stripe -->
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:24px 24px 0 0;background:linear-gradient(135deg,#ec4899,#f43f5e);box-shadow:0 0 20px rgba(236,72,153,.5);"></div>

      <div style="font-size:42px;margin-bottom:14px;">👋</div>

      <div style="font-size:19px;font-weight:800;color:#f0f2ff;margin-bottom:8px;letter-spacing:-.3px;">
        Logging out?
      </div>

      <div style="font-size:13px;color:rgba(240,242,255,.5);margin-bottom:28px;line-height:1.6;">
        Are you sure you want to logout from the organizer portal?
      </div>

      <div style="display:flex;gap:12px;">
        <button
          onclick="document.getElementById('__logoutModal').remove()"
          style="
            flex:1;padding:12px 0;border-radius:12px;
            border:1px solid rgba(255,255,255,.10);
            background:rgba(255,255,255,.06);
            color:rgba(240,242,255,.7);
            font-size:14px;font-weight:600;cursor:pointer;
            font-family:'Outfit',sans-serif;
            transition:all .15s;
          "
          onmouseover="this.style.background='rgba(255,255,255,.10)';this.style.color='#f0f2ff';"
          onmouseout="this.style.background='rgba(255,255,255,.06)';this.style.color='rgba(240,242,255,.7)';"
        >
          Cancel
        </button>
        <button
          onclick="
            localStorage.removeItem('authToken');
            localStorage.removeItem('organizerData');
            localStorage.removeItem('currentPage');
            window.__currentOrganizer = null;
            window.location.href = '${LOGIN_URL}';
          "
          style="
            flex:1;padding:12px 0;border-radius:12px;border:none;
            background:linear-gradient(135deg,#ec4899,#f43f5e);
            color:#fff;font-size:14px;font-weight:700;cursor:pointer;
            font-family:'Outfit',sans-serif;
            box-shadow:0 4px 16px rgba(236,72,153,.35);
            transition:all .15s;
          "
          onmouseover="this.style.boxShadow='0 8px 28px rgba(236,72,153,.5)';"
          onmouseout="this.style.boxShadow='0 4px 16px rgba(236,72,153,.35)';"
        >
          Yes, Logout
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on Escape
  const onKey = e => {
    if (e.key === "Escape") {
      modal.remove();
      document.removeEventListener("keydown", onKey);
    }
  };
  document.addEventListener("keydown", onKey);
}

function toYMD(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateYMD(ymd) {
  if (!ymd) return "N/A";
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatEventDate(value) { return formatDateYMD(toYMD(value)); }

function formatDate(d) {
  if (!d) return "N/A";
  const dt = new Date(d);
  return isNaN(dt) ? "Invalid" : dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(t) {
  if (!t) return "TBD";
  const [h, m] = t.split(":").map(Number);
  return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function formatMMDDYYYY(dt) {
  return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}/${dt.getFullYear()}`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────

function updateOrganizerProfile(organizer) {
  // Store on window — tab-scoped, never shared across tabs via localStorage
  window.__currentOrganizer = organizer;

  const name     = organizer.name || "Organizer";
  const roleText = organizer.club ? `${organizer.club} Organizer` : "Organizer";
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const seed     = name.replace(/ /g, "+");
  const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=6c63ff`;

  document.querySelectorAll(".profile-name").forEach(el => { el.textContent = name; });
  document.querySelectorAll(".profile-role").forEach(el => { el.textContent = roleText; });
  document.querySelectorAll(".profile-avatar").forEach(el => {
    if (el.tagName === "IMG") { el.src = avatarUrl; }
    else { el.textContent = initials; el.title = name; }
  });

  const fields = {
    pfClub: organizer.club, pfEmail: organizer.email, pfPhone: organizer.phone,
    pfRollNo: organizer.roll_no, pfAdmissionNo: organizer.admission_no, pfClass: organizer.class
  };
  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "N/A";
  });
}

function updateProfileStats() {
  const nums = document.querySelectorAll(".pstat-num");
  if (nums.length >= 2) {
    nums[0].textContent = events.length;
    nums[1].textContent = events.filter(e => ["Draft", "Pending"].includes(e.status)).length;
  }
}

function setupProfile() {
  const logoutBtn = document.getElementById("profileLogoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const sidebarUserBtn = document.getElementById("sidebarUserBtn");
  if (sidebarUserBtn) {
    sidebarUserBtn.addEventListener("click", () => switchPage("settings"));
    sidebarUserBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchPage("settings"); }
    });
  }
}

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

let events         = [];
let allEvents      = [];
let filteredEvents = [];

let venues          = [];
let currentVenue    = "";
const venueBookings = {};
let currentMonth    = new Date().getMonth();
let currentYear     = new Date().getFullYear();

let announcements = [];
let currentPage   = "dashboard";

const notificationsData = {
  history: [
    { text: "Your event 'IoT Workshop' was approved by admin.", time: "2 hours ago", color: "#43d9a2" },
    { text: "New registration for 'Tech Talks: AI Edition' — Priya Nair.", time: "5 hours ago", color: "#6c63ff" },
    { text: "Venue 'Seminar Hall A' confirmed for March 15.", time: "Yesterday", color: "#6c63ff" },
  ],
  schedule: [
    { text: "IoT Workshop 2025 starts tomorrow at 10:00 AM.", time: "Reminder", color: "#f4a261" },
    { text: "Registration closes for Tech Talks in 2 days.", time: "Upcoming", color: "#ff6584" },
  ],
  requests: [
    { text: "Robo Race 2025 venue request pending approval.", time: "March 5", color: "#f4a261", actions: true },
    { text: "Cultural Nite PA system request awaiting faculty approval.", time: "March 3", color: "#ff6584", actions: true },
    { text: "Python Bootcamp Lab booking request sent.", time: "Jan 15", color: "#43d9a2" },
  ]
};

// ─────────────────────────────────────────────────────────────
// SIDEBAR & NAVIGATION
// ─────────────────────────────────────────────────────────────

function setupSidebar() {
  const toggle      = document.getElementById("sidebarToggle");
  const sidebar     = document.getElementById("sidebar");
  const mainContent = document.getElementById("mainContent");
  const overlay     = document.getElementById("overlay");

  if (!toggle || !sidebar) { console.warn("Sidebar toggle or sidebar not found"); return; }

  toggle.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle("open");
      overlay?.classList.toggle("active");
    } else {
      sidebar.classList.toggle("collapsed");
      mainContent?.classList.toggle("expanded");
      document.body.classList.toggle("sidebar-hidden");
    }
  });

  overlay?.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
  });

  document.querySelectorAll(".nav-item[data-page]").forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      switchPage(item.dataset.page);
      if (window.innerWidth <= 768) {
        sidebar.classList.remove("open");
        overlay?.classList.remove("active");
      }
    });
  });
}

function switchPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  const page = document.getElementById(`page-${name}`) || document.getElementById("page-dashboard");
  const nav  = document.querySelector(`.nav-item[data-page="${name}"]`) ||
               document.querySelector(`.nav-item[data-page="dashboard"]`);

  page?.classList.add("active");
  nav?.classList.add("active");
  currentPage = name;
  localStorage.setItem("currentPage", name);

  // ── FIX 3: set topbar title even when no nav-item matches ──
  const titleEl = document.getElementById("topbarTitle");
  if (titleEl) {
    if (nav) {
      titleEl.textContent = nav.textContent.trim().replace(/\d+/g, "").trim();
    } else {
      const fallbackTitles = {
        "club-single": "Club Details",
        "settings":    "Profile & Settings",
      };
      titleEl.textContent = fallbackTitles[name] || "Dashboard";
    }
  }

  // ── Page-specific loaders ──
  if (name === "registrations")  loadEventParticipantsTable();
  if (name === "announcements")  loadAnnouncements();
  if (name === "venues")         loadVenues();
  if (name === "execom")         loadExecom();
  if (name === "clubs")          loadOrgClubs();
  if (name === "tickets")        setTimeout(initTicketScanner, 150);
  if (name === "certificates") {
    loadCertificateEvents();
    setupCertificateUpload();
    bindCertificateEventClick();
    checkCertStep2();
  }
}

// ─────────────────────────────────────────────────────────────
// LOAD EVENTS
// ─────────────────────────────────────────────────────────────

async function loadEvents() {
  console.log("🔄 Loading events…");
  try {
    const [myRes, allRes] = await Promise.all([
      apiFetch("/events/my"),
      apiFetch("/events/all")
    ]);
    events    = myRes.ok  ? await myRes.json()  : [];
    allEvents = allRes.ok ? await allRes.json() : [];
    events    = await hydrateRegistrationCounts(events);
    allEvents = await hydrateRegistrationCounts(allEvents);
    filteredEvents = [...allEvents];
    localStorage.setItem("evexa_events", JSON.stringify(allEvents));
    window.allEvents = allEvents;
    console.log(`✅ Events — mine: ${events.length}, all: ${allEvents.length}`);
  } catch (err) {
    console.error("❌ Event load error:", err);
    events = []; allEvents = []; filteredEvents = [];
  }

  renderDashEventList();
  renderDashApprovals();
  renderDashCertificates();
  renderEventsGrid();
  updateProfileStats();
  populateFilterDropdowns();
  renderEventCalendar();
}

async function hydrateRegistrationCounts(list) {
  if (!Array.isArray(list) || !list.length) return list;
  const results = await Promise.allSettled(
    list.map(e => apiFetch(`/registrations/count/${e.id}`))
  );
  const jsons = await Promise.all(
    results.map(async (r) => {
      if (r.status !== "fulfilled") return null;
      const res = r.value;
      if (!res.ok) return null;
      try { return await res.json(); } catch { return null; }
    })
  );
  jsons.forEach((data, idx) => {
    if (!data) return;
    const count = Number(data.count || 0);
    list[idx].registered_count = count;
    list[idx].registered = count;
  });
  return list;
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: EVENTS LIST
// ─────────────────────────────────────────────────────────────

function renderDashEventList() {
  const container = document.getElementById("dashEventList");
  if (!container) return;
  if (!events.length) {
    container.innerHTML = `<div class="empty-state"><span>📅</span><p>No events yet. Click "Add Event" to get started!</p></div>`;
    return;
  }
  container.innerHTML = events.slice(0, 4).map(e => {
    const now        = new Date();
    const eDate      = new Date(toYMD(e.date) + "T00:00:00");
    const isLive     = eDate.toDateString() === now.toDateString();
    const isPast     = eDate < now;
    const badgeClass = isLive ? "live" : isPast ? "past" : "upcoming";
    const badgeText  = isLive ? "🔴 Live" : isPast ? "Past" : "Upcoming";
    const thumbStyle = e.posterUrl ? `background:url(${e.posterUrl}) center/cover;` : `background:linear-gradient(135deg,#5b3ff8,#f04e6e);`;
    const capacity   = Number(e.capacity || 0);
    const registered = Number(e.registered_count ?? 0);
    return `
      <div class="event-row" data-id="${e.id}">
        <div class="event-thumb" style="${thumbStyle}">${e.posterUrl ? "" : "📅"}</div>
        <div class="event-info">
          <h4>${e.title}</h4>
          <p>${e.club || "IEEE"} · ${e.venue || "TBD"}</p>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>
        <div class="event-meta">
          <div class="reg">${registered} / ${capacity}</div>
          <div class="date">${formatDateYMD(toYMD(e.date))}${e.time ? ", " + formatTime(e.time) : ""}</div>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll(".event-row").forEach((row, i) => {
    row.addEventListener("click", () => { window.location.href = `org.html?id=${events[i].id}`; });
  });
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: PENDING APPROVALS
// ─────────────────────────────────────────────────────────────

function renderDashApprovals() {
  const list = document.getElementById("approvalList");
  if (!list) return;

  // FIX 2: define orgData locally — was missing from scope
  const orgData  = window.__currentOrganizer || {};
  const pending  = events.filter(e => e.status === "Draft" || e.status === "Pending");

  if (!pending.length) {
    list.innerHTML = `<div class="empty-state"><span>✅</span><p>No pending approvals</p></div>`;
    return;
  }

  list.innerHTML = pending.slice(0, 3).map(e => `
    <div class="approval-item">
      <div class="approval-avatar">${(e.title || "?")[0].toUpperCase()}</div>
      <div class="approval-info">
        <div class="aname">${e.title}</div>
        <div class="aevent">${e.club || orgData.club || "Club"} · ${formatDateYMD(toYMD(e.date))}</div>
      </div>
    </div>`).join("");
}

async function handleApproval(id, approve) {
  const row = document.querySelector(`.approval-item [data-id="${id}"]`)?.closest(".approval-item");
  try {
    const res = await apiFetch(`/events/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: approve ? "Approved" : "Rejected" })
    });
    if (res.ok) {
      if (row) { row.style.transition = "opacity .25s, transform .25s"; row.style.opacity = "0"; row.style.transform = "translateX(20px)"; setTimeout(() => row.remove(), 250); }
      showToast(approve ? "✅ Event approved" : "❌ Event rejected");
      addActivityItem(approve ? "Event <strong>approved</strong>" : "Event <strong>rejected</strong>", approve ? "emerald" : "rose");
      await loadEvents();
    } else { showToast("❌ Action failed — check API"); }
  } catch {
    if (row) { row.style.opacity = "0"; setTimeout(() => row.remove(), 250); }
    showToast(approve ? "✅ Approved (offline)" : "❌ Rejected (offline)");
  }
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: CERTIFICATES
// ─────────────────────────────────────────────────────────────

function renderDashCertificates() {
  const list   = document.getElementById("certList");
  const page   = document.getElementById("certPageList");
  const subset = events.slice(0, 3);
  const html   = !subset.length
    ? `<div class="empty-state"><span>📜</span><p>No events yet</p></div>`
    : subset.map(e => {
        const cap      = Number(e.capacity || 0);
        const certs    = Number(e.certs_issued || 0);
        const pct      = cap > 0 ? Math.round((certs / cap) * 100) : 0;
        const done     = certs >= cap && cap > 0;
        const color    = done ? "var(--emerald)" : certs > 0 ? "var(--violet)" : "var(--amber)";
        const label    = done ? "All done" : certs > 0 ? "In Progress" : "Pending";
        const btnLabel = done ? "Verify" : "Generate";
        const btnDisabled = new Date(e.date) > new Date() ? "disabled style='opacity:.4;'" : "";
        return `
          <div class="cert-item">
            <div class="cert-icon">${e.emoji || "📅"}</div>
            <div class="cert-info">
              <div class="cname">${e.title}</div>
              <div class="ccount">${certs} issued · ${label}</div>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color};"></div></div>
            </div>
            <button class="btn-ghost" ${btnDisabled} onclick="handleCertAction(${e.id},'${btnLabel}')">${btnLabel}</button>
          </div>`;
      }).join("");
  if (list) list.innerHTML = html;
  if (page) page.innerHTML = html;
}

async function handleCertAction(id, action) {
  if (action === "Generate") {
    showToast("📜 Generating certificates…");
    try { await apiFetch(`/events/${id}/certificates`, { method: "POST" }); showToast("✅ Certificates generated!"); await loadEvents(); }
    catch { showToast("⚠️ Generation triggered (check backend)"); }
  } else { showToast("✅ Certificates verified"); }
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: VENUE STATUS
// ─────────────────────────────────────────────────────────────

function renderDashVenueStatus(venueData) {
  const list = document.getElementById("venueStatusList");
  if (!list) return;
  if (!venueData.length) { list.innerHTML = `<div class="empty-state"><span>📍</span><p>No venues loaded</p></div>`; return; }
  const icons = ["🏛️", "🔬", "🧪", "🏢", "🎭"];
  list.innerHTML = venueData.slice(0, 3).map(v => {
    const isActive   = v.status === "active" || v.today;
    const isBooked   = v.status === "booked";
    const badgeClass = isActive ? "live" : isBooked ? "upcoming" : "";
    const badgeStyle = !isActive && !isBooked ? "background:var(--emerald-light);color:var(--emerald);" : "";
    const badgeText  = isActive ? "Active" : isBooked ? "Booked" : "Free";
    return `
      <div class="approval-item">
        <div style="font-size:22px;">${icons[Math.floor(Math.random() * icons.length)]}</div>
        <div class="approval-info">
          <div class="aname">${v.name}</div>
          <div class="aevent">Capacity: ${v.capacity || "—"}</div>
        </div>
        <span class="badge ${badgeClass}" style="${badgeStyle};font-size:10px;padding:2px 7px;">${badgeText}</span>
      </div>`;
  }).join("");
}

// ─────────────────────────────────────────────────────────────
// ACTIVITY FEED
// ─────────────────────────────────────────────────────────────

function addActivityItem(htmlText, color = "violet", timeText = "Just now") {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;
  feed.querySelector(".empty-state")?.remove();
  const item = document.createElement("div");
  item.className = "activity-item";
  item.style.opacity = "0"; item.style.transition = "opacity .3s";
  item.innerHTML = `<div class="act-dot ${color}"></div><div><div class="act-text">${htmlText}</div><div class="act-time">${timeText}</div></div>`;
  feed.insertAdjacentElement("afterbegin", item);
  requestAnimationFrame(() => requestAnimationFrame(() => { item.style.opacity = "1"; }));
}

function loadActivityFeed() {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;
  const recent = allEvents.filter(e => e.registered || e.registered_count).slice(0, 5);
  if (!recent.length) { feed.innerHTML = `<div class="empty-state"><span>🕐</span><p>No recent activity</p></div>`; return; }
  feed.innerHTML = recent.map(e => `
    <div class="activity-item">
      <div class="act-dot emerald"></div>
      <div>
        <div class="act-text"><strong>${e.registered || e.registered_count || 0} registrations</strong> for <strong>${e.title}</strong></div>
        <div class="act-time">📅 ${formatDateYMD(toYMD(e.date))}</div>
      </div>
    </div>`).join("");
}

// ─────────────────────────────────────────────────────────────
// EVENTS PAGE
// ─────────────────────────────────────────────────────────────

function renderEventsGrid() {
  const grid = document.getElementById("eventsGrid");
  if (!grid) return;
  if (!filteredEvents.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span>📅</span><p>No events found</p></div>`; return; }
  grid.innerHTML = filteredEvents.map(e => createEventCard(e)).join("");
  grid.querySelectorAll(".event-card").forEach((card, i) => {
    card.addEventListener("click", () => { window.location.href = `org.html?id=${filteredEvents[i].id}`; });
  });
}

function createEventCard(e) {
  const clubName   = e.club || "Club not specified";
  const posterUrl  = e.posterUrl || "";
  const capacity   = Number(e.capacity || 0);
  const registered = Number(e.registered || e.registered_count || 0);
  const seatsLeft  = Math.max(0, capacity - registered);
  const percent    = capacity > 0 ? (registered / capacity) * 100 : 0;
  return `
    <div class="event-card">
      <div class="event-card-poster">${posterUrl ? `<img src="${posterUrl}" alt="" onerror="this.style.display='none'">` : ""}</div>
      <div class="event-card-body">
        <div class="event-card-title">${e.title}</div>
        <div class="event-card-meta">
          <div class="event-meta-row">📅 ${formatEventDate(e.date)}</div>
          <div class="event-meta-row">🕐 ${e.time ? formatTime(e.time) : "TBD"}</div>
          <div class="event-meta-row">📍 ${e.venue || "Not assigned"}</div>
          <div class="event-meta-row">👥 Capacity: ${capacity}</div>
          <div class="event-meta-row">🏷️ ${clubName}</div>
        </div>
        <div class="event-card-footer seat-footer">
          <div class="seat-text">
            <span class="seat-left">${seatsLeft} seats left</span>
            <span class="seat-total">/ ${capacity} total</span>
          </div>
          <div class="seat-progress"><div class="seat-progress-bar" style="width:${percent}%"></div></div>
          <a class="view-details" href="org.html?id=${e.id}" onclick="event.stopPropagation()">View details →</a>
        </div>
      </div>
    </div>`;
}

function filterEvents() {
  const search = document.getElementById("eventSearch")?.value.toLowerCase() || "";
  const type   = document.getElementById("filterType")?.value  || "";
  const club   = document.getElementById("filterClub")?.value  || "";
  const venue  = document.getElementById("filterVenue")?.value || "";
  const date   = document.getElementById("filterDate")?.value  || "";
  filteredEvents = allEvents.filter(e => {
    if (search && !e.title.toLowerCase().includes(search)) return false;
    if (type  && e.type  !== type)  return false;
    if (club  && e.club  !== club)  return false;
    if (venue && !String(e.venue || "").includes(venue)) return false;
    if (date  && toYMD(e.date) !== date) return false;
    return true;
  });
  renderEventsGrid();
}

function clearFilters() {
  ["eventSearch","filterType","filterClub","filterVenue","filterDate"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  filteredEvents = [...allEvents];
  renderEventsGrid();
}

function populateFilterDropdowns() {
  const clubSel = document.getElementById("filterClub");
  if (clubSel) {
    const clubs = [...new Set(allEvents.map(e => e.club).filter(Boolean))];
    clubs.forEach(c => {
      if (!clubSel.querySelector(`option[value="${c}"]`))
        clubSel.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
    });
  }
  const venueSels = [document.getElementById("filterVenue"), document.querySelector('#venueSection select')];
  venueSels.forEach(sel => {
    if (!sel) return;
    venues.forEach(v => {
      if (!sel.querySelector(`option[value="${v}"]`))
        sel.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
    });
  });
  ["eventSearch","filterType","filterClub","filterVenue","filterDate"].forEach(id => {
    document.getElementById(id)?.addEventListener("input",  filterEvents);
    document.getElementById(id)?.addEventListener("change", filterEvents);
  });
}

// ─────────────────────────────────────────────────────────────
// VENUES
// ─────────────────────────────────────────────────────────────

async function loadVenues() {
  try {
    const res = await apiFetch("/venues");
    if (res.ok) {
      const data   = await res.json();
      venues       = data.map(v => v.name);
      currentVenue = venues[0] || "";
      renderDashVenueStatus(data);
    }
  } catch (err) { console.error("Venue load error:", err); }
  renderVenueSidebar();
  await loadVenueBookings();
  renderCalendar();
}

function renderVenueSidebar() {
  const list = document.getElementById("venueList");
  if (!list) return;
  list.innerHTML = venues.map(v => `
    <div class="venue-list-item ${v === currentVenue ? "active" : ""}" onclick="selectVenue('${v}')">${v}</div>
  `).join("");
}

async function selectVenue(name) {
  currentVenue = name;
  document.querySelectorAll(".venue-list-item").forEach(item => {
    item.classList.toggle("active", item.textContent.trim() === name);
  });
  await loadVenueBookings();
  renderCalendar();
}

async function loadVenueBookings() {
  if (!currentVenue) return;
  try {
    const res = await apiFetch(`/venues/calendar?venue_name=${encodeURIComponent(currentVenue)}&month=${currentMonth + 1}&year=${currentYear}`);
    if (res.ok) {
      const data = await res.json();
      venueBookings[currentVenue] = {};
      data.forEach(b => { venueBookings[currentVenue][b.day] = b.status; });
    }
  } catch (err) { console.error("Booking load error:", err); }
}

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  setText("calendarTitle", `${monthNames[currentMonth]} ${currentYear}`);
  grid.innerHTML = "";
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
    const hdr = document.createElement("div");
    hdr.className = "day-header"; hdr.textContent = d;
    grid.appendChild(hdr);
  });
  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const bookings    = venueBookings[currentVenue] || {};
  for (let i = 0; i < firstDay; i++) { const empty = document.createElement("div"); empty.className = "calendar-day empty"; grid.appendChild(empty); }
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day"; cell.textContent = day;
    const status = bookings[day];
    if (status === "booked")        { cell.classList.add("booked");    cell.title = `Day ${day} — Fully Booked`; }
    else if (status === "pending")  { cell.classList.add("pending");   cell.title = `Day ${day} — Partially Booked`; cell.addEventListener("click", () => openVenueSlots(day)); }
    else                            { cell.classList.add("available"); cell.title = `Day ${day} — Available`; cell.addEventListener("click", () => openVenueSlots(day)); }
    grid.appendChild(cell);
  }
}

async function openVenueSlots(day) {
  const dt      = new Date(currentYear, currentMonth, day);
  const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const dateText = formatMMDDYYYY(dt);
  setText("venueSlotsSubtitle", `${currentVenue} · ${dateText}`);
  const tbody = document.getElementById("venueSlotsBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">Loading…</td></tr>`;
  openModal("venueSlotsModal");
  try {
    const res = await apiFetch(`/venues/slots?venue_name=${encodeURIComponent(currentVenue)}&date=${dateStr}`);
    if (!res.ok) throw new Error();
    const slots     = await res.json();
    const available = slots.filter(s => s.available);
    if (!available.length) { tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">No available slots</td></tr>`; return; }
    tbody.innerHTML = available.map(s => `<tr><td style="padding:10px 12px;">${dateText}</td><td style="padding:10px 12px;">${s.start.slice(0,5)} – ${s.end.slice(0,5)}</td></tr>`).join("");
  } catch {
    if (tbody) tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">Failed to load slots</td></tr>`;
  }
}

document.getElementById("prevMonth")?.addEventListener("click", async () => {
  currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await loadVenueBookings(); renderCalendar();
});
document.getElementById("nextMonth")?.addEventListener("click", async () => {
  currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await loadVenueBookings(); renderCalendar();
});

// ─────────────────────────────────────────────────────────────
// ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────

async function loadAnnouncements() {
  try {
    const res = await apiFetch("/announcements");
    announcements = res.ok ? await res.json() : [];
  } catch { announcements = []; }
  renderAnnouncements();
}

function renderAnnouncements() {
  const tbody = document.getElementById("announcementBody");
  if (!tbody) return;
  if (!announcements.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">No announcements yet</td></tr>`; return; }
  tbody.innerHTML = announcements.map((a, i) => `
    <tr style="border-bottom:1px solid var(--line);">
      <td style="padding:10px 18px;">${i + 1}</td>
      <td style="padding:10px 18px;font-weight:500;">${a.title}</td>
      <td style="padding:10px 18px;color:var(--muted);">${a.club || "—"}</td>
      <td style="padding:10px 18px;color:var(--muted);">${formatDate(a.created_at)}</td>
      <td style="padding:10px 18px;"><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:var(--violet-light);color:var(--violet);">${a.type}</span></td>
      <td style="padding:10px 18px;"><span style="padding:2px 8px;border-radius:20px;font-size:11px;background:${a.status === "Published" ? "var(--emerald-light)" : "var(--bg)"};color:${a.status === "Published" ? "var(--emerald)" : "var(--muted)"};">${a.status}</span></td>
      <td style="padding:10px 18px;display:flex;gap:6px;">
        <button class="btn-ghost" onclick="openEditAnnouncement(${a.id})">✏️</button>
        <button class="btn-ghost" style="color:var(--rose);" onclick="deleteAnnouncement(${a.id})">🗑️</button>
      </td>
    </tr>`).join("");
}

function openNewAnnouncementModal() {
  const form = document.getElementById("addAnnouncementForm");
  form.reset(); delete form.dataset.editId;
  setText("annModalTitle", "📢 New Announcement");
  openModal("addAnnouncementModal");
}

function openEditAnnouncement(id) {
  const ann = announcements.find(a => a.id === id);
  if (!ann) return;
  document.getElementById("annTitle").value   = ann.title   || "";
  document.getElementById("annType").value    = ann.type    || "General";
  document.getElementById("annMessage").value = ann.message || "";
  const form = document.getElementById("addAnnouncementForm");
  form.dataset.editId = id;
  setText("annModalTitle", "✏️ Edit Announcement");
  openModal("addAnnouncementModal");
}

async function submitAnnouncement(e) {
  e.preventDefault();
  const form   = e.target;
  const raw    = form.dataset.editId;
  const editId = raw && raw !== "undefined" ? Number(raw) : null;
  const payload = {
    title:   document.getElementById("annTitle").value.trim(),
    type:    document.getElementById("annType").value,
    message: document.getElementById("annMessage").value.trim(),
  };
  try {
    const url    = editId ? `/announcements/${editId}` : `/announcements`;
    const method = editId ? "PUT" : "POST";
    const res    = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); showToast("❌ " + (d.message || "Failed")); return; }
    showToast(editId ? "✅ Announcement updated!" : "📢 Announcement published!");
    closeModal("addAnnouncementModal");
    form.reset(); delete form.dataset.editId;
    await loadAnnouncements();
  } catch { showToast("❌ Something went wrong"); }
}

async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  try {
    const res = await apiFetch(`/announcements/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("🗑️ Announcement deleted"); await loadAnnouncements(); }
  } catch { showToast("❌ Delete failed"); }
}

// ─────────────────────────────────────────────────────────────
// EXECOM
// ─────────────────────────────────────────────────────────────

async function loadExecom() {
  const orgData = window.__currentOrganizer || {};
  const club    = orgData.club;
  if (!club) return;
  try {
    const res = await apiFetch(`/execom/club/${encodeURIComponent(club)}`);
    if (res.ok) {
      const members      = await res.json();
      execomMembersCache = members;
      renderExecom(members);
    }
  } catch (err) { console.error("Execom load error:", err); }
}

function renderExecom(members) {
  const grid = document.getElementById("execomGrid");
  if (!grid) return;
  if (!members?.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span>👥</span><p>No execom members found</p></div>`; return; }
  const colors = ["6c63ff","ff6584","43d9a2","f4a261","ffd166","5bc0eb","845ef7","fa5252"];
  grid.innerHTML = members.map(m => {
    const seed  = m.name.replace(/ /g, "+");
    const hash  = m.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const color = colors[hash % colors.length];
    return `
      <div class="execom-card" style="position:relative;">
        <button onclick="openEditExecomModal(${m.id})"
          style="position:absolute;top:10px;right:10px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;color:var(--violet);transition:all 0.15s;"
          onmouseover="this.style.background='var(--violet-light)'"
          onmouseout="this.style.background='var(--bg)'">✏️ Edit</button>
        <img src="https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=${color}" alt="${m.name}" class="execom-avatar">
        <h4>${m.name}</h4>
        <div class="pos">${m.position}</div>
        <div class="cls">${m.class || "N/A"}</div>
        <div class="execom-contact">
          <div class="contact-item">📧 ${m.email && m.email !== "N/A" ? `<a href="mailto:${m.email}" onclick="event.stopPropagation()">${m.email}</a>` : "<span>N/A</span>"}</div>
          <div class="contact-item">📞 ${m.phone && m.phone !== "N/A" ? `<a href="tel:${m.phone}" onclick="event.stopPropagation()">${m.phone}</a>` : "<span>N/A</span>"}</div>
        </div>
      </div>`;
  }).join("");
}

// ─────────────────────────────────────────────────────────────
// CREATE EVENT
// ─────────────────────────────────────────────────────────────

async function submitCreateEvent(e) {
  e.preventDefault();
  const form     = e.target;
  const formData = new FormData();
  const orgData  = window.__currentOrganizer || {};
  const get      = name => form.elements[name]?.value || "";

  if (!get("title") || !get("type") || !get("date") || !get("capacity")) { showToast("⚠️ Please fill all required fields"); return; }

  formData.append("title",            get("title"));
  formData.append("type",             get("type"));
  formData.append("description",      get("description"));
  formData.append("date",             get("date"));
  formData.append("time",             get("time"));
  formData.append("capacity",         get("capacity"));
  formData.append("registration_fee", get("registration_fee") || 0);
  formData.append("venue",            get("venue"));
  formData.append("club",             orgData.club || "");

  const poster  = form.querySelector('input[type="file"][name="poster"]');
  if (poster?.files?.length) formData.append("poster", poster.files[0]);
  const reqFile = document.getElementById("requestFile");
  if (reqFile?.files?.length) formData.append("request_upload", reqFile.files[0]);

  try {
    const token = localStorage.getItem("authToken");
    const res   = await fetch(`${API}/events`, { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
    if (res.ok) { showToast("✅ Event created!"); closeModal("createEventModal"); form.reset(); await loadEvents(); }
    else { const err = await res.json().catch(() => ({})); showToast("❌ " + (err.message || "Failed to create event")); }
  } catch { showToast("❌ Network error"); }
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

function setupNotifications() {
  const btn = document.getElementById("notifBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      switchPage("notifications");
      const dot = document.getElementById("notifDot");
      if (dot) dot.style.display = "none";
      renderNotifications();
    });
  }
  renderNotifications();
}

function renderNotifications() {
  const body = document.getElementById("notifBody");
  if (!body) return;
  const items = [...(notificationsData.history || []), ...(notificationsData.schedule || []), ...(notificationsData.requests || [])];
  if (!items.length) { body.innerHTML = `<div class="empty-state"><span>🔕</span><p>No notifications</p></div>`; return; }
  body.innerHTML = items.map(n => `
    <div class="notif-item">
      <div class="notif-dot" style="background:${n.color}"></div>
      <div class="notif-text"><p>${n.text}</p><span>${n.time}</span></div>
    </div>`).join("");
}

// ─────────────────────────────────────────────────────────────
// DARK MODE  (FIX 1: single applyTheme, no duplicate)
// ─────────────────────────────────────────────────────────────

function setupDarkMode() {
  const saved   = localStorage.getItem("evexa_theme");
  const isLight = saved === "light";
  document.body.classList.toggle("light", isLight);

  const settingsToggle = document.getElementById("darkModeToggle");
  if (settingsToggle) {
    settingsToggle.checked = isLight;
    settingsToggle.addEventListener("change", function () { applyTheme(this.checked ? "light" : "dark"); });
  }

  const topbarBtn = document.getElementById("themeTopbarBtn");
  if (topbarBtn) {
    topbarBtn.addEventListener("click", () => {
      applyTheme(document.body.classList.contains("light") ? "dark" : "light");
    });
  }
}

function applyTheme(mode) {
  const isLight = mode === "light";
  document.body.classList.toggle("light", isLight);
  localStorage.setItem("evexa_theme", mode);
  const settingsToggle = document.getElementById("darkModeToggle");
  if (settingsToggle) settingsToggle.checked = isLight;
  showToast(isLight ? "☀️ Light mode on" : "🌙 Dark mode on");
}

// ─────────────────────────────────────────────────────────────
// QUICK ACTIONS
// ─────────────────────────────────────────────────────────────

function setupQuickActions() {
  const actionMap = {
    newEvent:     () => openModal("createEventModal"),
    scanQR:       () => { switchPage("tickets"); showToast("📷 QR Scanner opening…"); },
    genCerts:     () => { switchPage("certificates"); showToast("📜 Select an event to generate certs"); },
    exportList:   () => exportRegistrations(),
    announcement: () => openNewAnnouncementModal(),
    bookVenue:    () => { switchPage("venues"); showToast("📍 Select a venue and date"); },
  };
  document.querySelectorAll(".quick-btn[data-action]").forEach(btn => {
    btn.addEventListener("click", function () {
      this.style.transform = "scale(0.96)";
      setTimeout(() => (this.style.transform = ""), 120);
      actionMap[this.dataset.action]?.();
    });
  });
}

function exportRegistrations() {
  if (!allEvents?.length) { showToast("⚠️ No events to export"); return; }
  const headers = ["ID","Title","Type","Description","Date","Time","Capacity","Registration Fee","Venue","Club","Status","Organizer ID","Poster","Registered Count"];
  const rows = allEvents.map(e => [e.id||"",e.title||"",e.type||"",(e.description||"").replace(/"/g,'""'),toYMD(e.date)||"",e.time||"",e.capacity||0,e.registration_fee||0,e.venue||"",e.club||"",e.status||"",e.organizer_id||"",e.poster||"",e.registered_count||0]);
  const csvContent = [headers.join(","), ...rows.map(r => r.map(val => `"${val}"`).join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "events_full_export.csv"; a.click();
  URL.revokeObjectURL(url);
  showToast("📤 Full events table exported!");
}

// ─────────────────────────────────────────────────────────────
// SEARCH FILTER
// ─────────────────────────────────────────────────────────────

function setupSearchFilter() {
  const input = document.getElementById("globalSearch");
  if (!input) return;
  input.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    document.querySelectorAll(".event-row[data-id]").forEach(row => {
      row.style.display = q === "" || row.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { this.value = ""; this.dispatchEvent(new Event("input")); }
  });
}

function setupPressBounce() {
  document.querySelectorAll(".stat-card").forEach(card => {
    card.addEventListener("click", function () {
      this.style.transform = "scale(0.97)";
      setTimeout(() => (this.style.transform = ""), 120);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// WIRE STATIC BUTTONS
// ─────────────────────────────────────────────────────────────

function wireStaticButtons() {
  document.getElementById("viewAllEventsLink")?.addEventListener("click", () => switchPage("events"));
  document.getElementById("viewAllApprovalsBtn")?.addEventListener("click", () => { switchPage("events"); showToast("Showing all events — filter by 'Draft' status"); });
  document.querySelectorAll("[data-page]:not(.nav-item)").forEach(el => { el.addEventListener("click", () => switchPage(el.dataset.page)); });
  // addEventBtn replaced by logoutTopBtn in topbar — create event via quick actions or events page
  document.getElementById("createEventPageBtn")?.addEventListener("click", () => openModal("createEventModal"));
  loadActivityFeed();
  startClock();
}

function startClock() {
  const titleEl = document.getElementById("topbarTitle");
  if (!titleEl) return;
  let clockEl = document.getElementById("topbarClock");
  if (!clockEl) {
    clockEl = Object.assign(document.createElement("span"), { id: "topbarClock" });
    Object.assign(clockEl.style, { fontSize: "12px", fontWeight: "400", color: "var(--muted)", fontFamily: "'DM Sans',sans-serif", marginLeft: "10px" });
    titleEl.appendChild(clockEl);
  }
  const tick = () => { const now = new Date(); clockEl.textContent = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`; };
  tick(); setInterval(tick, 30_000);
}

// ─────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("open"); });
});

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent     = message;
  toast.style.opacity   = "1";
  toast.style.transform = "translateY(0)";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateY(8px)"; }, 3200);
}

console.log("✅ orgscript.js loaded");

// ─────────────────────────────────────────────────────────────
// DASHBOARD EVENT CALENDAR
// ─────────────────────────────────────────────────────────────

let evCalCursor = new Date(); evCalCursor.setDate(1);
let evSelectedDate = null;

function evYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function evMonthLabel(d) {
  return d.toLocaleString("en-IN", { month:"long", year:"numeric" });
}

function getCalendarEvents() { return window.allEvents || []; }

function renderEventCalendar() {
  const grid  = document.getElementById("calGrid");
  const label = document.getElementById("calMonthLabel");
  if (!grid || !label) return;
  label.textContent = evMonthLabel(evCalCursor);
  grid.innerHTML = "";
  ["SU","MO","TU","WE","TH","FR","SA"].forEach(d => {
    const el = document.createElement("div");
    el.textContent = d;
    Object.assign(el.style, { fontSize:"12px", opacity:".6", fontWeight:"700", textAlign:"center" });
    grid.appendChild(el);
  });
  const year        = evCalCursor.getFullYear();
  const month       = evCalCursor.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const eventDates  = new Set(getCalendarEvents().map(e => toYMD(e.date)));
  for (let i = 0; i < firstDay; i++) { grid.appendChild(document.createElement("div")); }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = evYMD(new Date(year, month, day));
    const cell    = document.createElement("div");
    cell.textContent = day;
    Object.assign(cell.style, { height:"36px", display:"flex", alignItems:"center", justifyContent:"center", borderRadius:"10px", cursor:"pointer", border:"1px solid rgba(0,0,0,.06)" });
    if (eventDates.has(dateStr)) { cell.style.background = "rgba(255,101,132,0.18)"; cell.title = "Has events"; }
    if (evSelectedDate === dateStr) cell.style.outline = "2px solid rgba(91,63,248,0.35)";
    cell.addEventListener("click", () => { evSelectedDate = dateStr; renderEventCalendar(); renderEventsForSelectedDate(dateStr); });
    grid.appendChild(cell);
  }
}

function setupEventCalendarNav() {
  const prev = document.getElementById("calPrev");
  const next = document.getElementById("calNext");
  if (!prev || !next) return;
  if (prev.dataset.bound === "1") return;
  prev.dataset.bound = "1"; next.dataset.bound = "1";
  prev.addEventListener("click", () => { evCalCursor = new Date(evCalCursor.getFullYear(), evCalCursor.getMonth()-1, 1); renderEventCalendar(); renderEventsForSelectedDate(evSelectedDate); });
  next.addEventListener("click", () => { evCalCursor = new Date(evCalCursor.getFullYear(), evCalCursor.getMonth()+1, 1); renderEventCalendar(); renderEventsForSelectedDate(evSelectedDate); });
}

function renderEventsForSelectedDate(dateStr) {
  const boxTitle = document.getElementById("calSelectedInfo");
  const listBox  = document.getElementById("calEventList");
  if (!boxTitle || !listBox) return;
  if (!dateStr) { boxTitle.textContent = "Select a date to see events"; listBox.innerHTML = ""; return; }
  const evs = getCalendarEvents().filter(e => toYMD(e.date) === dateStr);
  boxTitle.textContent = `Events on ${formatDateYMD(dateStr)}`;
  if (!evs.length) { listBox.innerHTML = `<div class="empty-state" style="padding:14px;border:1px dashed var(--line);border-radius:14px;"><span>📭</span><p style="margin:6px 0 0;">No events on this day</p></div>`; return; }
  listBox.innerHTML = evs.map(e => `
    <div class="event-row" style="cursor:pointer;" onclick="window.location.href='org.html?id=${e.id}'">
      <div class="event-thumb" style="${e.posterUrl ? `background:url(${e.posterUrl}) center/cover;` : "background:linear-gradient(135deg,#5b3ff8,#f04e6e);"}">${e.posterUrl ? "" : "📅"}</div>
      <div class="event-info">
        <h4 style="margin:0;">${e.title}</h4>
        <p style="margin:4px 0 0;opacity:.75;">${e.club || "Club"} · ${e.venue || "TBD"} · ${e.time ? formatTime(e.time) : "TBD"}</p>
      </div>
    </div>`).join("");
}

// ─────────────────────────────────────────────────────────────
// CERTIFICATES
// ─────────────────────────────────────────────────────────────

let certState = { step:1, eventId:null, eventTitle:null, participantCount:0, templateFile:null, excelFile:null, source:"db" };
let certClickBound = false;

function certGoStep(n) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`cpanel-${i}`)?.classList.toggle("active", i === n);
    const step = document.getElementById(`cstep-${i}`);
    if (step) { step.classList.toggle("active", i === n); step.classList.toggle("complete", i < n); }
  }
  certState.step = n;
  if (n === 4) updateCertSummary();
}

function updateCertSummary() {
  setText("csum-event",    certState.eventTitle || "—");
  setText("csum-count",    certState.participantCount + " participants");
  setText("csum-template", certState.templateFile?.name || "—");
  setText("csum-fontsize", (document.getElementById("certFontSize")?.value || 36) + "px");
}

async function loadCertificateEvents() {
  const list = document.getElementById("certEventsList");
  if (!list) return;
  try {
    const res  = await apiFetch("/certificates/events");
    const data = res.ok ? await res.json() : [];
    if (!data.length) { list.innerHTML = `<div class="empty-state"><span>📅</span><p>No events found</p></div>`; return; }
    list.innerHTML = data.map(e => {
      const cnt = Number(e.registered_count || e.registered || 0);
      const ymd = toYMD(e.date);
      return `
        <div class="cert-event-item ${certState.eventId === e.id ? "selected" : ""}"
             data-event-id="${e.id}"
             data-title="${String(e.title || "").replace(/"/g, "&quot;")}"
             data-count="${cnt}">
          <div class="cei-left"><div class="cei-thumb">📅</div><div class="cei-info"><div class="cei-title">${e.title || "Untitled"}</div><div class="cei-meta">${formatDateYMD(ymd)} · ${e.venue || "TBD"}</div></div></div>
          <div class="cei-right"><div class="cei-count">${cnt}</div><div class="cei-label">participants</div></div>
        </div>`;
    }).join("");
  } catch (err) {
    console.error("loadCertificateEvents error:", err);
    list.innerHTML = `<div class="empty-state"><span>❌</span><p>Could not load events</p></div>`;
  }
}

function selectCertEvent(itemEl, eventId, title, participantCount) {
  document.querySelectorAll("#certEventsList .cert-event-item.selected").forEach(x => x.classList.remove("selected"));
  itemEl.classList.add("selected");
  certState.eventId = eventId; certState.eventTitle = title; certState.participantCount = participantCount;
  const badge = document.getElementById("certStep1Selection");
  if (badge) { badge.style.display = "block"; badge.textContent = `Selected: ${title} (${participantCount})`; }
  const nextBtn = document.getElementById("certStep1Next");
  if (nextBtn) nextBtn.disabled = false;
  loadCertParticipants(eventId);
  checkCertStep2();
}

async function loadCertParticipants(eventId) {
  const list = document.getElementById("certParticipantsList");
  if (!list) return;
  list.innerHTML = `<div style="padding:18px;color:var(--muted);font-size:13px;">Loading…</div>`;
  try {
    const res  = await apiFetch(`/certificates/participants/${eventId}`);
    const data = res.ok ? await res.json() : [];
    if (!data.length) { list.innerHTML = `<div style="padding:18px;color:var(--muted);font-size:13px;">No registrations yet</div>`; return; }
    list.innerHTML = data.map(p => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;border-bottom:1px solid var(--line);">
        <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--violet),var(--rose));display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:700;flex-shrink:0;">
          ${p.name?.[0]?.toUpperCase() || "?"}
        </div>
        <div><div style="font-size:12.5px;font-weight:500;">${p.name}</div><div style="font-size:11px;color:var(--muted);">${p.email || "—"}</div></div>
      </div>`).join("");
  } catch { list.innerHTML = `<div style="padding:18px;color:var(--muted);">Could not load participants</div>`; }
}

function setupCertificateUpload() {
  const input = document.getElementById("certTemplateFile");
  const zone  = document.getElementById("certUploadZone");
  if (!input) return;

  input.addEventListener("change", function () { if (this.files[0]) setCertTemplate(this.files[0]); });

  if (zone) {
    zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", e => {
      e.preventDefault(); zone.classList.remove("drag-over");
      const f = e.dataTransfer.files[0];
      if (f && f.type === "application/pdf") setCertTemplate(f);
      else showToast("⚠️ Please drop a PDF file");
    });
    zone.addEventListener("click", (e) => {
      if (e.target === input) return;
      input.click();
    });
  }

  const excelIn = document.getElementById("certExcelFile");
  if (excelIn) {
    excelIn.addEventListener("change", function () {
      certState.excelFile = this.files[0] || null;
      const preview = document.getElementById("certExcelPreview");
      if (preview && certState.excelFile) preview.textContent = `✓ ${certState.excelFile.name} selected`;
      checkCertStep2();
    });
  }

  const colorPick = document.getElementById("certColor");
  if (colorPick) {
    colorPick.addEventListener("input", function () {
      const el = document.getElementById("certColorHex");
      if (el) el.textContent = this.value;
    });
  }

  // certPreviewBtn uses onclick in HTML — no addEventListener needed here

  // Always Excel-only mode
  certState.source = "excel";
  checkCertStep2();
}
function setCertTemplate(file) {
  certState.templateFile = file;
  const zone   = document.getElementById("certUploadZone");
  const status = document.getElementById("certFileStatus");
  const name   = document.getElementById("certFileName");
  if (zone)   zone.style.display   = "none";
  if (status) status.style.display = "block";
  if (name)   name.textContent     = file.name;
  checkCertStep2();
}

function removeCertTemplate() {
  certState.templateFile = null;
  const zone   = document.getElementById("certUploadZone");
  const status = document.getElementById("certFileStatus");
  if (zone)   zone.style.display   = "";
  if (status) status.style.display = "none";
  document.getElementById("certTemplateFile").value = "";
  checkCertStep2();
}

function checkCertStep2() {
  const hasTemplate = !!certState.templateFile;
  const hasData     = certState.source === "db" ? !!certState.eventId : !!certState.excelFile;
  const btn = document.getElementById("certStep2Next");
  if (btn) btn.disabled = !(hasTemplate && hasData);
}

function setCertSource(src) {
  certState.source = src;
  document.querySelectorAll(".cert-src-tab").forEach(t => t.classList.toggle("active", t.dataset.src === src));
  document.getElementById("certSrcDB").style.display    = src === "db"    ? "" : "none";
  document.getElementById("certSrcExcel").style.display = src === "excel" ? "" : "none";
  checkCertStep2();
}

async function previewCertificate() {
  if (!certState.templateFile) { showToast("⚠️ Upload a template first"); return; }
  const container = document.getElementById("certPreviewContainer");
  if (container) container.innerHTML = `<div class="empty-state" style="min-height:300px;"><span>⏳</span><p>Generating preview…</p></div>`;
  const fd = new FormData();
  fd.append("template",     certState.templateFile);
  fd.append("preview_name", document.getElementById("certPreviewName")?.value  || "John Doe");
  fd.append("font_size",    document.getElementById("certFontSize")?.value     || 36);
  fd.append("x_pct",        document.getElementById("certXPct")?.value         || 50);
  fd.append("y_pct",        document.getElementById("certYPct")?.value         || 52);
  fd.append("color_hex",    document.getElementById("certColor")?.value        || "#1a1a2e");
  try {
    const token = localStorage.getItem("authToken");
    const res   = await fetch(`${API}/certificates/preview`, { method:"POST", headers:{"Authorization":`Bearer ${token}`}, body:fd });
    if (!res.ok) throw new Error();
    const blob   = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    if (container) container.innerHTML = `<iframe src="${objUrl}" class="cert-preview-frame"></iframe>`;
    showToast("✅ Preview ready!");
  } catch { showToast("❌ Preview failed — check backend"); if (container) container.innerHTML = `<div class="empty-state" style="min-height:300px;"><span>❌</span><p>Preview failed</p></div>`; }
}

async function generateCertificates() {
  if (!certState.templateFile) { showToast("⚠️ No template uploaded"); return; }
  const btn = document.getElementById("certGenerateBtn");
  const progress = document.getElementById("certGenerateProgress");
  const fill     = document.getElementById("certProgressFill");
  const label    = document.getElementById("certProgressLabel");
  if (btn) btn.disabled = true;
  if (progress) progress.style.display = "block";
  if (fill)  fill.style.width  = "0%";
  if (label) label.textContent = "Sending request…";
  let pct = 0;
  const interval = setInterval(() => { pct = Math.min(pct + 2, 85); if (fill) fill.style.width = `${pct}%`; }, 200);
  const fd = new FormData();
  fd.append("template",  certState.templateFile);
  fd.append("font_size", document.getElementById("certFontSize")?.value  || 36);
  fd.append("x_pct",     document.getElementById("certXPct")?.value      || 50);
  fd.append("y_pct",     document.getElementById("certYPct")?.value       || 52);
  fd.append("color_hex", document.getElementById("certColor")?.value     || "#1a1a2e");
  if (certState.source === "db"    && certState.eventId)   fd.append("event_id", certState.eventId);
  if (certState.source === "excel" && certState.excelFile) fd.append("excel", certState.excelFile);
  try {
    const token = localStorage.getItem("authToken");
    const res   = await fetch(`${API}/certificates/generate`, { method:"POST", headers:{"Authorization":`Bearer ${token}`}, body:fd });
    clearInterval(interval);
    if (fill)  fill.style.width  = "100%";
    if (label) label.textContent = "Done! Preparing download…";
    if (!res.ok) { const err = await res.json().catch(() => ({})); showToast("❌ " + (err.message || "Generation failed")); if (btn) btn.disabled = false; if (progress) setTimeout(() => { progress.style.display = "none"; }, 2000); return; }
    const blob   = await res.blob();
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `certificates_${certState.eventTitle || "export"}.zip`; anchor.click();
    URL.revokeObjectURL(url);
    showToast(`🎓 ${certState.participantCount} certificates downloaded!`);
    if (label) label.textContent = "✅ Certificates downloaded!";
    if (btn)   btn.disabled      = false;
    await loadEvents();
  } catch (err) { clearInterval(interval); showToast("❌ Network error"); if (btn) btn.disabled = false; if (progress) progress.style.display = "none"; }
}

function bindCertificateEventClick() {
  const list = document.getElementById("certEventsList");
  if (!list) return;
  list.onclick = (e) => {
    const item = e.target.closest(".cert-event-item");
    if (!item) return;
    selectCertEvent(item, Number(item.dataset.eventId), item.dataset.title || "Event", Number(item.dataset.count || 0));
  };
}

// ─────────────────────────────────────────────────────────────
// EXECOM EDIT / ADD
// ─────────────────────────────────────────────────────────────

function openEditExecomModal(memberId) {
  const m = execomMembersCache.find(x => x.id === memberId);
  if (!m) { showToast("❌ Member not found"); return; }
  setText("execomModalTitle", "✏️ Edit Member");
  document.getElementById("execomEditId").value       = m.id       || "";
  document.getElementById("execomEditName").value     = m.name     || "";
  document.getElementById("execomEditPosition").value = m.position || "";
  document.getElementById("execomEditClass").value    = m.class    || "";
  document.getElementById("execomEditEmail").value    = m.email    || "";
  document.getElementById("execomEditPhone").value    = m.phone    || "";
  openModal("execomEditModal");
}

function openAddExecomModal() {
  setText("execomModalTitle", "➕ Add Member");
  document.getElementById("execomEditForm").reset();
  document.getElementById("execomEditId").value = "";
  openModal("execomEditModal");
}

async function submitExecomEdit(e) {
  e.preventDefault();
  const id      = document.getElementById("execomEditId").value.trim();
  const orgData = window.__currentOrganizer || {};
  const payload = {
    name:     document.getElementById("execomEditName").value.trim(),
    position: document.getElementById("execomEditPosition").value.trim(),
    class:    document.getElementById("execomEditClass").value.trim(),
    email:    document.getElementById("execomEditEmail").value.trim(),
    phone:    document.getElementById("execomEditPhone").value.trim(),
    club:     orgData.club || "",
  };
  if (!payload.name || !payload.position) { showToast("⚠️ Name and Position are required"); return; }
  try {
    const res = await apiFetch(id ? `/execom/${id}` : `/execom`, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); showToast("❌ " + (d.message || "Failed to save")); return; }
    showToast(id ? "✅ Member updated!" : "✅ Member added!");
    closeModal("execomEditModal");
    await loadExecom();
  } catch (err) { console.error("submitExecomEdit error:", err); showToast("❌ Network error — check your connection"); }
}

// ─────────────────────────────────────────────────────────────
// REGISTRATIONS
// ─────────────────────────────────────────────────────────────

async function loadEventParticipantsTable() {
  const tbody = document.getElementById("eventParticipantsBody");
  if (!tbody) return;
  const myEvents = (events && events.length) ? events : (window.allEvents || []);
  if (!myEvents.length) { tbody.innerHTML = `<tr><td colspan="3" class="table-empty">No events found</td></tr>`; return; }
  tbody.innerHTML = myEvents.map((e, i) => `
    <tr style="border-bottom:1px solid var(--line);">
      <td style="padding:10px 18px;">${i + 1}</td>
      <td style="padding:10px 18px;font-weight:500;">${e.title || "—"}
        <div style="font-size:11px;color:var(--muted);margin-top:3px;">${formatEventDate(e.date)} ${e.time ? "· " + formatTime(e.time) : ""} ${e.venue ? "· " + e.venue : ""}</div>
      </td>
      <td style="padding:10px 18px;"><button class="btn-ghost" onclick="downloadParticipantsCSV(${e.id}, '${(e.title||"event").replace(/'/g,"\\'")}')">⬇️ Download CSV</button></td>
    </tr>`).join("");
}

async function downloadParticipantsCSV(eventId, eventTitle = "event") {
  try {
    const res = await apiFetch(`/registrations/event/${eventId}`);
    if (!res.ok) { showToast("❌ Failed to fetch participants"); return; }
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { showToast("⚠️ No participants for this event"); return; }
    const headers = ["Sl No","Name","Email","Phone","Class","Department","Status","Registered At"];
    const rows    = data.map((p, idx) => [idx+1, p.name||p.participant_name||"", p.email||"", p.phone||"", p.class||"", p.department||"", p.status||"Registered", p.registered_at ? formatDate(p.registered_at) : ""]);
    const csv     = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob    = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement("a");
    a.href = url; a.download = `participants_${eventTitle.replace(/[^a-z0-9]+/gi,"_").toLowerCase()}_${eventId}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast("✅ Participants CSV downloaded");
  } catch (err) { console.error(err); showToast("❌ Download failed"); }
}

// ─────────────────────────────────────────────────────────────
// QR TICKET SCANNER
// ─────────────────────────────────────────────────────────────

let html5Qr; let lastToken = null; let scanning = false;

function setScanResult(html) { const el = document.getElementById("scanResult"); if (el) el.innerHTML = html; }

function extractTokenFromQR(decodedText) {
  try { const obj = JSON.parse(decodedText); if (obj && obj.t) return obj.t; } catch (_) {}
  if (decodedText && decodedText.length > 20) return decodedText;
  return null;
}

async function verifyTicketToken(token) {
  if (!token) { setScanResult(`<b>❌ Invalid QR</b><br/>Token not found.`); return; }
  if (token === lastToken) return;
  lastToken = token;
  setScanResult(`⏳ Verifying ticket...`);
  try {
    const res  = await fetch(`${API}/tickets/verify`, { method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+localStorage.getItem("authToken")}, body:JSON.stringify({ qr_token:token }) });
    const data = await res.json();
    if (!res.ok) { setScanResult(`<b>❌ ${data.message || "Verification failed"}</b>`); return; }
    if (data.status === "VALID") { setScanResult(`<div style="padding:10px;border-radius:12px;background:#ecfdf5;border:1px solid #10b9811f;"><b style="color:#059669;">✅ VALID ENTRY</b><br/><div style="margin-top:8px;"><b>Name:</b> ${data.name}<br/><b>Roll:</b> ${data.roll_no}<br/><b>Dept:</b> ${data.department}<br/><b>Class:</b> ${data.class}<br/><b>Event:</b> ${data.event_title}<br/><b>Ticket:</b> ${data.ticket_id}</div></div>`); return; }
    if (data.status === "ALREADY_USED") { setScanResult(`<div style="padding:10px;border-radius:12px;background:#fff7ed;border:1px solid #fb923c33;"><b style="color:#c2410c;">⚠️ ALREADY USED</b><br/><div style="margin-top:8px;"><b>Name:</b> ${data.name}<br/><b>Roll:</b> ${data.roll_no}<br/><b>Ticket:</b> ${data.ticket_id}<br/><b>Checked-in at:</b> ${data.checked_in_at || "—"}</div></div>`); return; }
    setScanResult(`<b>ℹ️ ${data.status}</b>`);
  } catch (err) { console.error(err); setScanResult(`<b>❌ Network / Server error</b>`); }
}

function initTicketScanner() {
  const readerEl = document.getElementById("qr-reader");
  const startBtn = document.getElementById("startScan");
  const stopBtn  = document.getElementById("stopScan");
  if (!readerEl || !startBtn || !stopBtn) return;
  if (startBtn.dataset.bound === "1") return;
  startBtn.dataset.bound = "1"; stopBtn.dataset.bound = "1";
  if (!html5Qr) html5Qr = new Html5Qrcode("qr-reader");

  startBtn.onclick = async () => {
    if (scanning) return;
    scanning = true; lastToken = null;
    setScanResult("📷 Starting camera...");
    try {
      if (html5Qr) { try { await html5Qr.stop(); } catch (_) {} try { await html5Qr.clear(); } catch (_) {} }
      html5Qr = new Html5Qrcode("qr-reader");
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || !cameras.length) { scanning = false; setScanResult("<b>❌ No camera found</b>"); return; }
      startBtn.disabled = true; stopBtn.disabled = false;
      await html5Qr.start({ facingMode:"environment" }, { fps:10, qrbox:250 }, (decodedText) => verifyTicketToken(extractTokenFromQR(decodedText)), () => {});
      setScanResult("✅ Camera started. Scan a ticket.");
    } catch (e) { console.error(e); scanning = false; startBtn.disabled = false; stopBtn.disabled = true; setScanResult("<b>❌ Camera permission denied / not supported</b>"); }
  };

  stopBtn.onclick = async () => {
    if (!html5Qr || !scanning) return;
    try { await html5Qr.stop(); } catch (_) {}
    try { await html5Qr.clear(); } catch (_) {}
    html5Qr = null; scanning = false; startBtn.disabled = false; stopBtn.disabled = true; lastToken = null;
    const readerEl = document.getElementById("qr-reader");
    if (readerEl) readerEl.innerHTML = "";
    setScanResult("🛑 Scanner stopped.");
  };
}

// ─────────────────────────────────────────────────────────────
// CLUBS  (FIX 4: click handlers inside renderOrgClubsGrid,
//         no broken _origRenderOrgClubsGrid patch)
// ─────────────────────────────────────────────────────────────

let allOrgClubs      = [];
let filteredOrgClubs = [];
let currentClubFilter = "all";

// Wire pill filter buttons (event delegation)
document.addEventListener("click", function (e) {
  const pill = e.target.closest("#clubPillBar .org-club-pill");
  if (!pill) return;
  document.querySelectorAll("#clubPillBar .org-club-pill").forEach(p => p.classList.remove("active"));
  pill.classList.add("active");
  currentClubFilter = pill.dataset.filter || "all";
  filterClubs();
});

async function loadOrgClubs() {
  const grid = document.getElementById("clubsGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="empty-state empty-state--full"><span>⏳</span><p>Loading clubs…</p></div>`;
  try {
    const res = await apiFetch("/clubs");
    if (!res.ok) throw new Error("Failed");
    const data       = await res.json();
    allOrgClubs      = Array.isArray(data) ? data : [];
    filteredOrgClubs = [...allOrgClubs];
    await Promise.all(allOrgClubs.map(c => loadOrgClubMemberCount(c.club_id)));
    renderOrgClubsGrid();
  } catch (err) {
    console.error("Clubs load error:", err);
    grid.innerHTML = `<div class="empty-state empty-state--full"><span>❌</span><p>Could not load clubs</p></div>`;
  }
}

async function loadOrgClubMemberCount(clubId) {
  try {
    const res = await apiFetch(`/clubs/${clubId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    const club = allOrgClubs.find(c => c.club_id === clubId);
    if (club) club._memberCount = data.count ?? data.length ?? 0;
  } catch (_) {}
}

function filterClubs() {
  const q   = (document.getElementById("clubSearch")?.value || "").toLowerCase().trim();
  const cat = currentClubFilter;
  filteredOrgClubs = allOrgClubs.filter(c => {
    const matchCat    = cat === "all" || c.club_category === cat;
    const matchSearch = !q || (c.club_name||"").toLowerCase().includes(q) || (c.short_description||"").toLowerCase().includes(q) || (c.club_category||"").toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
  renderOrgClubsGrid();
}

// FIX 6: clearClubFilters was missing
function clearClubFilters() {
  const s = document.getElementById("clubSearch");
  if (s) s.value = "";
  document.querySelectorAll("#clubPillBar .org-club-pill").forEach(p => p.classList.remove("active"));
  const allPill = document.querySelector("#clubPillBar .org-club-pill[data-filter='all']");
  if (allPill) allPill.classList.add("active");
  currentClubFilter  = "all";
  filteredOrgClubs   = [...allOrgClubs];
  renderOrgClubsGrid();
}

const ORG_CLUB_THEMES = {
  "Technical":     { bg:"#ece9ff", badge_bg:"#ddd6fe", badge_color:"#5b3ff8" },
  "Non-Technical": { bg:"#fef3c7", badge_bg:"#fde68a", badge_color:"#b45309" },
  "default":       { bg:"#ece9ff", badge_bg:"#ddd6fe", badge_color:"#5b3ff8" },
};

const ORG_CLUB_FALLBACK_ICONS = { "Technical":"⚙️", "Non-Technical":"🎭" };

function renderOrgClubCard(c) {
  const name         = c.club_name || "Unnamed Club";
  const cat          = c.club_category || "General";
  const desc         = (c.short_description || "").slice(0, 110);
  const year         = c.year_of_establishment || "—";
  const members      = c._memberCount != null ? c._memberCount : "—";
  const theme        = ORG_CLUB_THEMES[cat] || ORG_CLUB_THEMES["default"];
  const fallbackIcon = ORG_CLUB_FALLBACK_ICONS[cat] || "🏫";
  const logoHtml     = c.club_logo
    ? `<img src="${API.replace("/api","")}/${c.club_logo}" alt="" onerror="this.outerHTML='<span class=\\'org-club-icon\\'>${fallbackIcon}</span>'" class="org-club-logo-img" />`
    : `<span class="org-club-icon">${fallbackIcon}</span>`;
  return `
    <div class="org-club-card">
      <div class="org-club-banner" style="background:${theme.bg};">
        <div class="org-club-logo-wrap">${logoHtml}</div>
        <span class="org-club-cat-badge" style="background:${theme.badge_bg};color:${theme.badge_color};">${cat}</span>
      </div>
      <div class="org-club-body">
        <div class="org-club-name-row"><div class="org-club-name">${name}</div></div>
        <p class="org-club-desc">${desc}${(c.short_description||"").length > 110 ? "…" : ""}</p>
        <div class="org-club-meta-row">
          <span class="org-club-meta-item">📅 Est. ${year}</span>
          <span class="org-club-meta-item">👥 ${members} members</span>
        </div>
      </div>
      <div class="org-club-footer"><span class="org-club-view-link">View details →</span></div>
    </div>`;
}

// FIX 4: click handlers added directly here, no broken patch
function renderOrgClubsGrid() {
  const grid = document.getElementById("clubsGrid");
  if (!grid) return;
  if (!filteredOrgClubs.length) { grid.innerHTML = `<div class="empty-state empty-state--full"><span>🔍</span><p>No clubs found</p></div>`; return; }
  grid.innerHTML = filteredOrgClubs.map(renderOrgClubCard).join("");
  grid.querySelectorAll(".org-club-card").forEach((card, i) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const club = filteredOrgClubs[i];
      if (club) openOrgClubSingle(club.club_id);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// CLUB SINGLE
// ─────────────────────────────────────────────────────────────

function openOrgClubSingle(clubId) {
  switchPage("club-single");
  loadOrgClubSingle(clubId);
}

const ORG_SINGLE_THEMES = {
  "Technical":     { bg:"#ece9ff", accent:"#5b3ff8", badge_bg:"#ddd6fe", badge_color:"#5b3ff8" },
  "Non-Technical": { bg:"#fef3c7", accent:"#b45309", badge_bg:"#fde68a", badge_color:"#b45309" },
  "default":       { bg:"#ece9ff", accent:"#5b3ff8", badge_bg:"#ddd6fe", badge_color:"#5b3ff8" },
};

const ORG_SINGLE_FALLBACK_ICONS = { "Technical":"⚙️", "Non-Technical":"🎭" };

async function loadOrgClubSingle(clubId) {
  const content = document.getElementById("orgClubSingleContent");
  const titleEl = document.getElementById("orgClubSingleTitle");
  if (!content) return;
  content.innerHTML = `<div class="empty-state"><span>⏳</span><p>Loading club…</p></div>`;
  try {
    const res = await apiFetch(`/clubs/${clubId}`);
    if (!res.ok) throw new Error("Club not found");
    const club = await res.json();
    if (titleEl) titleEl.textContent = club.club_name || "Club Details";

    let memberCount = "—";
    try { const mRes = await apiFetch(`/clubs/${clubId}/members`); if (mRes.ok) { const mData = await mRes.json(); memberCount = mData.count ?? mData.length ?? "—"; } } catch (_) {}

    // FIX 5: renamed to clubEvents to avoid shadowing global events[]
    let clubEvents = [];
    try { const evRes = await apiFetch(`/clubs/${clubId}/events`); if (evRes.ok) clubEvents = await evRes.json(); } catch (_) {}

    let execom = [];
    try { const exRes = await apiFetch(`/execom/club/${encodeURIComponent(club.club_name || "")}`); if (exRes.ok) { const exData = await exRes.json(); execom = Array.isArray(exData) ? exData : (exData.execom || exData.members || []); } } catch (_) {}

    renderOrgClubSingle(club, memberCount, clubEvents, execom, content);
  } catch (err) {
    console.error("Club single load error:", err);
    content.innerHTML = `<div class="empty-state"><span>❌</span><p>Could not load club details.</p></div>`;
  }
}

function renderOrgClubSingle(club, memberCount, clubEvents, execom, content) {
  const name       = club.club_name || "Unnamed Club";
  const cat        = club.club_category || "General";
  const desc       = club.description || club.short_description || "No description available.";
  const tagline    = club.tagline || club.short_description || "";
  const year       = club.year_of_establishment || "—";
  const theme      = ORG_SINGLE_THEMES[cat] || ORG_SINGLE_THEMES["default"];
  const fbIcon     = ORG_SINGLE_FALLBACK_ICONS[cat] || "🏫";
  const staticBase = API.replace("/api", "");

  const logoHtml = club.club_logo
    ? `<img src="${staticBase}/${club.club_logo}" alt="${name}" class="ocs-hero-logo-img" onerror="this.outerHTML='<span class=\\'ocs-hero-logo-icon\\'>${fbIcon}</span>'" />`
    : `<span class="ocs-hero-logo-icon">${fbIcon}</span>`;

  function fmtDate(raw) { if (!raw) return "TBD"; const d = new Date(raw); return isNaN(d) ? raw : d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }); }
  function fmtTime(raw) { if (!raw) return ""; if (/^\d{2}:\d{2}:\d{2}$/.test(String(raw))) return String(raw).slice(0,5); const d = new Date(raw); return isNaN(d) ? raw : d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" }); }

  // Events HTML
  let eventsHtml = "";
  if (clubEvents.length) {
    const cards = clubEvents.map(ev => {
      const evName  = ev.event_name || ev.name || ev.title || "Unnamed Event";
      const evId    = ev.event_id ?? ev.id ?? "";
      const rawDate = ev.event_date || ev.date || ev.start_date || "";
      const rawTime = ev.event_time || ev.time || ev.start_time || "";
      const dDate   = fmtDate(rawDate);
      const dTime   = String(rawDate).includes("T") ? fmtTime(new Date(rawDate)) : fmtTime(rawTime);
      const venue   = ev.venue || ev.location || "—";
      const cap     = ev.capacity || ev.total_seats || 0;
      const reg     = ev.registered_count || ev.filled_seats || 0;
      const left    = cap > 0 ? Math.max(0, cap - reg) : null;
      return `
        <div class="ocs-event-card" onclick="window.location.href='org.html?id=${evId}'" style="cursor:pointer;">
          <div class="ocs-event-banner" style="background:${theme.bg};"><span style="font-size:28px;">📅</span></div>
          <div class="ocs-event-body">
            <div class="ocs-event-name">${evName}</div>
            <div class="ocs-event-meta">📅 ${dDate}${dTime ? " · "+dTime : ""}</div>
            <div class="ocs-event-meta">📍 ${venue}</div>
            ${left !== null ? `<div class="ocs-event-meta">👥 ${left} seats left of ${cap}</div>` : ""}
          </div>
        </div>`;
    }).join("");
    eventsHtml = `<div class="ocs-section"><div class="ocs-section-title">Events</div><div class="ocs-events-row">${cards}</div></div>`;
  } else {
    eventsHtml = `<div class="ocs-section"><div class="ocs-section-title">Events</div><div class="empty-state" style="padding:20px;"><span>📭</span><p>No events from this club yet.</p></div></div>`;
  }

  // Execom HTML
  let execomHtml = "";
  const rolePriority  = ["chairperson","chair","vice chairperson","vice chair","secretary","treasurer"];
  const sortedExecom  = [...execom].sort((a, b) => {
    const ai = rolePriority.findIndex(r => (a.position||"").toLowerCase().includes(r));
    const bi = rolePriority.findIndex(r => (b.position||"").toLowerCase().includes(r));
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (sortedExecom.length) {
    const memberCards = sortedExecom.map(m => {
      const mName    = m.name || "—";
      const mRole    = m.position || "Member";
      const mClass   = m.class || m.dept || "";
      const mEmail   = m.email || "";
      const mPhone   = m.phone || "";
      const seed     = mName.replace(/ /g, "+");
      const dicebear = `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=6c63ff`;
      const avatarUrl = m.avatar || m.photo || m.profile_pic || null;
      const avatarHtml = avatarUrl
        ? `<img src="${staticBase}/${avatarUrl}" alt="${mName}" class="ocs-exec-avatar" onerror="this.src='${dicebear}'" />`
        : `<img src="${dicebear}" alt="${mName}" class="ocs-exec-avatar" />`;
      return `
        <div class="ocs-exec-card">
          ${avatarHtml}
          <div class="ocs-exec-name">${mName}</div>
          <div class="ocs-exec-role" style="color:${theme.accent};">${mRole}</div>
          ${mClass ? `<div class="ocs-exec-meta">${mClass}</div>` : ""}
          ${mEmail ? `<a class="ocs-exec-contact" href="mailto:${mEmail}">✉️ ${mEmail}</a>` : ""}
          ${mPhone ? `<a class="ocs-exec-contact" href="tel:${mPhone}">📞 ${mPhone}</a>` : ""}
        </div>`;
    }).join("");
    execomHtml = `<div class="ocs-section"><div class="ocs-section-title">Executive Committee</div><div class="ocs-exec-grid">${memberCards}</div></div>`;
  } else {
    execomHtml = `<div class="ocs-section"><div class="ocs-section-title">Executive Committee</div><div class="empty-state" style="padding:20px;"><span>👥</span><p>No execom data available.</p></div></div>`;
  }

  content.innerHTML = `
    <div class="ocs-hero" style="background:${theme.bg};">
      <div class="ocs-hero-logo">${logoHtml}</div>
      <div class="ocs-hero-info">
        <div class="ocs-hero-name">${name}</div>
        ${tagline ? `<div class="ocs-hero-tagline">${tagline}</div>` : ""}
        <div class="ocs-hero-tags">
          <span class="ocs-tag" style="background:${theme.badge_bg};color:${theme.badge_color};">${cat}</span>
          <span class="ocs-tag">👥 ${memberCount} members</span>
          <span class="ocs-tag">📅 Est. ${year}</span>
        </div>
      </div>
    </div>
    <div class="ocs-layout">
      <div class="ocs-main">${execomHtml}${eventsHtml}</div>
      <div class="ocs-sidebar">
        <div class="ocs-about-card">
          <div class="ocs-section-title" style="margin-bottom:10px;">About</div>
          <p class="ocs-about-text">${desc}</p>
          <div class="ocs-stat-row">
            <div class="ocs-stat"><div class="ocs-stat-num" style="color:${theme.accent};">${memberCount}</div><div class="ocs-stat-label">Members</div></div>
            <div class="ocs-stat"><div class="ocs-stat-num" style="color:${theme.accent};">${clubEvents.length}</div><div class="ocs-stat-label">Events</div></div>
            <div class="ocs-stat"><div class="ocs-stat-num" style="color:${theme.accent};">${year}</div><div class="ocs-stat-label">Founded</div></div>
          </div>
        </div>
      </div>
    </div>`;
}
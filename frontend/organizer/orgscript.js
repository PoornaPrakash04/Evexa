/* ============================================================
   orgscript.js — EVEXA Organizer Portal (Backend-Connected)
   ============================================================ */

const API = "http://localhost:5000/api";
const LOGIN_URL = "http://127.0.0.1:5501/frontend/organizer/ogsignin.html";

// ── Guard against double-init (e.g. HMR / duplicate <script> tags) ──
if (window.__EVEXA_INITIALIZED__) {
  console.warn("EVEXA already initialized — skipping");
} else {
  window.__EVEXA_INITIALIZED__ = true;

  document.addEventListener("DOMContentLoaded", async () => {
    console.log("=== EVEXA DASHBOARD LOADING ===");

    // ── AUTH GUARD ──
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

    // ── INIT UI SHELLS ──
    setupSidebar();
    setupNotifications();
    setupDarkMode();
    setupProfile();
    setupQuickActions();
    setupSearchFilter();
    setupPressBounce();

    // ── LOAD DATA ──
    await Promise.all([loadExecom(), loadVenues()]);
    await loadAnnouncements();

    // ── RESTORE PAGE ──
    switchPage(localStorage.getItem("currentPage") || "dashboard");

    // ── LOAD EVENTS (renders dashboard + events page) ──
    await loadEvents();

    // ── EXTRA WIRING ──
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
  localStorage.removeItem("authToken");
  localStorage.removeItem("organizerData");
  localStorage.removeItem("currentPage");
  window.location.href = LOGIN_URL;
}

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

// ─────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────

function updateOrganizerProfile(organizer) {
  localStorage.setItem("organizerData", JSON.stringify(organizer));

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

  // Profile page fields
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
}

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

let events        = [];   // my events
let allEvents     = [];   // all events
let filteredEvents = [];

let venues        = [];
let currentVenue  = "";
const venueBookings = {};
let currentMonth  = new Date().getMonth();
let currentYear   = new Date().getFullYear();

let announcements = [];
let notifTab      = "history";
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
  if (!toggle || !sidebar) return;

  toggle.addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("active");
    } else {
      sidebar.classList.toggle("collapsed");
      mainContent.classList.toggle("expanded");
      document.body.classList.toggle("sidebar-hidden");
    }
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("active");
    document.getElementById("notifPanel")?.classList.remove("open");
  });

  document.querySelectorAll(".nav-item[data-page]").forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      switchPage(item.dataset.page);
      if (window.innerWidth <= 768) {
        sidebar.classList.remove("open");
        overlay.classList.remove("active");
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

  // Update topbar title
  const titleEl = document.getElementById("topbarTitle");
  if (titleEl) titleEl.textContent = nav?.textContent.trim().replace(/\d+/g, "").trim() || "Dashboard";
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

    events     = myRes.ok  ? await myRes.json()  : [];
    allEvents  = allRes.ok ? await allRes.json() : [];
    filteredEvents = [...allEvents];
    localStorage.setItem("evexa_events", JSON.stringify(allEvents));

    console.log(`✅ Events — mine: ${events.length}, all: ${allEvents.length}`);
  } catch (err) {
    console.error("❌ Event load error:", err);
    events = []; allEvents = []; filteredEvents = [];
  }

  renderDashboardStats();
  renderDashEventList();
  renderDashApprovals();
  renderDashCertificates();
  renderEventsGrid();
  updateProfileStats();
  populateFilterDropdowns();
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: STATS
// ─────────────────────────────────────────────────────────────

function renderDashboardStats() {
  const now      = new Date();
  const total    = allEvents.length;
  const upcoming = allEvents.filter(e => new Date(e.date) >= now).length;
  const pending  = events.filter(e => ["Draft", "Pending"].includes(e.status)).length;
  const totalReg = allEvents.reduce((s, e) => s + Number(e.registered || e.registered_count || 0), 0);

  setText("statTotal",    total);
  setText("statRegs",     totalReg);
  setText("statUpcoming", upcoming);
  setText("statPending",  pending);

  const nextEvent = allEvents
    .filter(e => new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  setText("statUpcomingDelta", nextEvent ? `Next: ${formatDate(nextEvent.date)}` : "None scheduled");
  setText("statRegsDelta",     totalReg > 0 ? `Across ${total} events` : "No registrations yet");
  setText("statPendingDelta",  pending > 0 ? "Action needed" : "All clear ✓");

  // Sidebar badges
  setText("navBadgeEvents", events.length || "");
  setText("navBadgeReg",    totalReg || "");

  // Pending approvals badge
  const badge = document.getElementById("pendingBadge");
  if (badge) badge.textContent = `${pending} new`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
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
    const now      = new Date();
    const eDate    = new Date(e.date);
    const isLive   = eDate.toDateString() === now.toDateString();
    const isPast   = eDate < now;
    const badgeClass = isLive ? "live" : isPast ? "past" : "upcoming";
    const badgeText  = isLive ? "🔴 Live" : isPast ? "Past" : "Upcoming";
    const thumbStyle = e.posterUrl
      ? `background:url(${e.posterUrl}) center/cover;`
      : `background:linear-gradient(135deg,#5b3ff8,#f04e6e);`;
    const capacity   = Number(e.capacity || 0);
    const registered = Number(e.registered || e.registered_count || 0);

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
          <div class="date">${formatDate(e.date)}${e.time ? ", " + formatTime(e.time) : ""}</div>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll(".event-row").forEach((row, i) => {
    row.addEventListener("click", () => {
      window.location.href = `org.html?id=${events[i].id}`;
    });
  });
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: PENDING APPROVALS
// ─────────────────────────────────────────────────────────────

function renderDashApprovals() {
  const list = document.getElementById("approvalList");
  if (!list) return;

  const orgData = JSON.parse(localStorage.getItem("organizerData") || "{}");
  const pending = events.filter(e => e.status === "Draft" || e.status === "Pending");

  if (!pending.length) {
    list.innerHTML = `<div class="empty-state"><span>✅</span><p>No pending approvals</p></div>`;
    return;
  }

  list.innerHTML = pending.slice(0, 3).map(e => `
    <div class="approval-item">
      <div class="approval-avatar">${(e.title || "?")[0].toUpperCase()}</div>
      <div class="approval-info">
        <div class="aname">${e.title}</div>
        <div class="aevent">${e.club || orgData.club || "Club"} · ${formatDate(e.date)}</div>
      </div>
      <div class="approval-actions">
        <button class="btn-sm btn-approve" data-id="${e.id}" title="Approve">✓</button>
        <button class="btn-sm btn-reject"  data-id="${e.id}" title="Reject">✕</button>
      </div>
    </div>`).join("");

  // Wire approval buttons
  list.querySelectorAll(".btn-approve").forEach(btn => {
    btn.addEventListener("click", () => handleApproval(Number(btn.dataset.id), true));
  });
  list.querySelectorAll(".btn-reject").forEach(btn => {
    btn.addEventListener("click", () => handleApproval(Number(btn.dataset.id), false));
  });
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
      if (row) {
        row.style.transition = "opacity .25s, transform .25s";
        row.style.opacity = "0";
        row.style.transform = "translateX(20px)";
        setTimeout(() => row.remove(), 250);
      }
      showToast(approve ? "✅ Event approved" : "❌ Event rejected");
      addActivityItem(
        approve ? "Event <strong>approved</strong>" : "Event <strong>rejected</strong>",
        approve ? "emerald" : "rose"
      );
      await loadEvents();
    } else {
      showToast("❌ Action failed — check API");
    }
  } catch {
    // Fallback: just remove the row visually
    if (row) { row.style.opacity = "0"; setTimeout(() => row.remove(), 250); }
    showToast(approve ? "✅ Approved (offline)" : "❌ Rejected (offline)");
  }
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: CERTIFICATES
// ─────────────────────────────────────────────────────────────

function renderDashCertificates() {
  const list = document.getElementById("certList");
  const page = document.getElementById("certPageList");

  const subset = events.slice(0, 3);

  const html = !subset.length
    ? `<div class="empty-state"><span>📜</span><p>No events yet</p></div>`
    : subset.map(e => {
        const cap   = Number(e.capacity || 0);
        const certs = Number(e.certs_issued || 0);
        const pct   = cap > 0 ? Math.round((certs / cap) * 100) : 0;
        const done  = certs >= cap && cap > 0;
        const color = done ? "var(--emerald)" : certs > 0 ? "var(--violet)" : "var(--amber)";
        const label = done ? "All done" : certs > 0 ? "In Progress" : "Pending";
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
    showToast(`📜 Generating certificates…`);
    try {
      await apiFetch(`/events/${id}/certificates`, { method: "POST" });
      showToast("✅ Certificates generated!");
      await loadEvents();
    } catch { showToast("⚠️ Generation triggered (check backend)"); }
  } else {
    showToast("✅ Certificates verified");
  }
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD: VENUE STATUS
// ─────────────────────────────────────────────────────────────

function renderDashVenueStatus(venueData) {
  const list = document.getElementById("venueStatusList");
  if (!list) return;
  if (!venueData.length) {
    list.innerHTML = `<div class="empty-state"><span>📍</span><p>No venues loaded</p></div>`;
    return;
  }
  list.innerHTML = venueData.slice(0, 3).map(v => {
    const isActive   = v.status === "active"   || v.today;
    const isBooked   = v.status === "booked";
    const badgeClass = isActive ? "live" : isBooked ? "upcoming" : "";
    const badgeStyle = !isActive && !isBooked ? "background:var(--emerald-light);color:var(--emerald);" : "";
    const badgeText  = isActive ? "Active" : isBooked ? "Booked" : "Free";
    const icons = ["🏛️", "🔬", "🧪", "🏢", "🎭"];
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

  // Remove empty state
  feed.querySelector(".empty-state")?.remove();

  const item = document.createElement("div");
  item.className = "activity-item";
  item.style.opacity = "0";
  item.style.transition = "opacity .3s";
  item.innerHTML = `
    <div class="act-dot ${color}"></div>
    <div>
      <div class="act-text">${htmlText}</div>
      <div class="act-time">${timeText}</div>
    </div>`;
  feed.insertAdjacentElement("afterbegin", item);
  requestAnimationFrame(() => requestAnimationFrame(() => { item.style.opacity = "1"; }));
}

function loadActivityFeed() {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;

  // Seed with recent event registrations
  const recent = allEvents
    .filter(e => e.registered || e.registered_count)
    .slice(0, 5);

  if (!recent.length) {
    feed.innerHTML = `<div class="empty-state"><span>🕐</span><p>No recent activity</p></div>`;
    return;
  }

  feed.innerHTML = recent.map(e => `
    <div class="activity-item">
      <div class="act-dot emerald"></div>
      <div>
        <div class="act-text">
          <strong>${e.registered || e.registered_count || 0} registrations</strong> for <strong>${e.title}</strong>
        </div>
        <div class="act-time">${formatDate(e.date)}</div>
      </div>
    </div>`).join("");
}

// ─────────────────────────────────────────────────────────────
// EVENTS PAGE
// ─────────────────────────────────────────────────────────────

function renderEventsGrid() {
  const grid = document.getElementById("eventsGrid");
  if (!grid) return;

  if (!filteredEvents.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span>📅</span><p>No events found</p></div>`;
    return;
  }

  grid.innerHTML = filteredEvents.map(e => createEventCard(e)).join("");
  grid.querySelectorAll(".event-card").forEach((card, i) => {
    card.addEventListener("click", () => {
      window.location.href = `org.html?id=${filteredEvents[i].id}`;
    });
  });
}

function createEventCard(e) {
  const orgData    = JSON.parse(localStorage.getItem("organizerData") || "{}");
  const clubName   = e.club || orgData.club || "Club not specified";
  const posterUrl  = e.posterUrl || "";
  const capacity   = Number(e.capacity || 0);
  const registered = Number(e.registered || e.registered_count || 0);
  const seatsLeft  = Math.max(0, capacity - registered);
  const percent    = capacity > 0 ? (registered / capacity) * 100 : 0;

  return `
    <div class="event-card">
      <div class="event-card-poster">
        ${posterUrl ? `<img src="${posterUrl}" alt="" onerror="this.style.display='none'">` : ""}
      </div>
      <div class="event-card-body">
        <div class="event-card-title">${e.title}</div>
        <div class="event-card-meta">
          <div class="event-meta-row">📅 ${formatDate(e.date)}</div>
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
          <div class="seat-progress">
            <div class="seat-progress-bar" style="width:${percent}%"></div>
          </div>
          <a class="view-details" href="org.html?id=${e.id}" onclick="event.stopPropagation()">View details →</a>
        </div>
      </div>
    </div>`;
}

function filterEvents() {
  const search = document.getElementById("eventSearch")?.value.toLowerCase() || "";
  const type   = document.getElementById("filterType")?.value || "";
  const club   = document.getElementById("filterClub")?.value || "";
  const venue  = document.getElementById("filterVenue")?.value || "";
  const date   = document.getElementById("filterDate")?.value || "";

  filteredEvents = allEvents.filter(e => {
    if (search && !e.title.toLowerCase().includes(search)) return false;
    if (type  && e.type !== type)   return false;
    if (club  && e.club !== club)   return false;
    if (venue && !String(e.venue || "").includes(venue)) return false;
    if (date  && e.date !== date)   return false;
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
  // Clubs
  const clubSel = document.getElementById("filterClub");
  if (clubSel) {
    const clubs = [...new Set(allEvents.map(e => e.club).filter(Boolean))];
    clubs.forEach(c => {
      if (!clubSel.querySelector(`option[value="${c}"]`)) {
        clubSel.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      }
    });
  }
  // Venues in filter + create modal
  const venueSels = [document.getElementById("filterVenue"), document.querySelector('#venueSection select')];
  venueSels.forEach(sel => {
    if (!sel) return;
    venues.forEach(v => {
      if (!sel.querySelector(`option[value="${v}"]`)) {
        sel.insertAdjacentHTML("beforeend", `<option value="${v}">${v}</option>`);
      }
    });
  });
  // Live filter wiring
  ["eventSearch","filterType","filterClub","filterVenue","filterDate"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", filterEvents);
    document.getElementById(id)?.addEventListener("change", filterEvents);
  });
}

// ─────────────────────────────────────────────────────────────
// REGISTRATIONS PAGE
// ─────────────────────────────────────────────────────────────

async function loadRegistrations() {
  const tbody = document.getElementById("registrationsBody");
  if (!tbody) return;

  try {
    const res = await apiFetch("/registrations");
    if (!res.ok) throw new Error();
    const regs = await res.json();

    if (!regs.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--muted)">No registrations yet</td></tr>`;
      return;
    }
    tbody.innerHTML = regs.map((r, i) => `
      <tr style="border-bottom:1px solid var(--line);">
        <td style="padding:10px 18px;">${i + 1}</td>
        <td style="padding:10px 18px;font-weight:500;">${r.name || r.participant_name || "—"}</td>
        <td style="padding:10px 18px;">${r.event_title || r.event || "—"}</td>
        <td style="padding:10px 18px;color:var(--muted);">${formatDate(r.registered_at || r.date)}</td>
        <td style="padding:10px 18px;">
          <span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;
            background:${r.status === "Confirmed" ? "var(--emerald-light)" : "var(--violet-light)"};
            color:${r.status === "Confirmed" ? "var(--emerald)" : "var(--violet)"};">
            ${r.status || "Registered"}
          </span>
        </td>
      </tr>`).join("");
  } catch {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--muted)">Unable to load registrations</td></tr>`;
  }
}

// ─────────────────────────────────────────────────────────────
// VENUES
// ─────────────────────────────────────────────────────────────

async function loadVenues() {
  try {
    const res = await apiFetch("/venues");
    if (res.ok) {
      const data = await res.json();
      venues = data.map(v => v.name);
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
    const res = await apiFetch(
      `/venues/calendar?venue_name=${encodeURIComponent(currentVenue)}&month=${currentMonth + 1}&year=${currentYear}`
    );
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
    hdr.className = "day-header";
    hdr.textContent = d;
    grid.appendChild(hdr);
  });

  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const bookings    = venueBookings[currentVenue] || {};

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.textContent = day;
    const status = bookings[day];

    if (status === "booked") {
      cell.classList.add("booked");
      cell.title = `Day ${day} — Fully Booked`;
    } else if (status === "pending") {
      cell.classList.add("pending");
      cell.title = `Day ${day} — Partially Booked`;
      cell.addEventListener("click", () => openVenueSlots(day));
    } else {
      cell.classList.add("available");
      cell.title = `Day ${day} — Available`;
      cell.addEventListener("click", () => openVenueSlots(day));
    }
    grid.appendChild(cell);
  }
}

async function openVenueSlots(day) {
  const dt = new Date(currentYear, currentMonth, day);
  const dateStr  = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const dateText = formatMMDDYYYY(dt);

  setText("venueSlotsSubtitle", `${currentVenue} · ${dateText}`);
  const tbody = document.getElementById("venueSlotsBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">Loading…</td></tr>`;
  openModal("venueSlotsModal");

  try {
    const res = await apiFetch(`/venues/slots?venue_name=${encodeURIComponent(currentVenue)}&date=${dateStr}`);
    if (!res.ok) throw new Error();
    const slots = await res.json();
    const available = slots.filter(s => s.available);

    if (!available.length) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">No available slots</td></tr>`;
      return;
    }
    tbody.innerHTML = available.map(s => `
      <tr>
        <td style="padding:10px 12px;">${dateText}</td>
        <td style="padding:10px 12px;">${s.start.slice(0,5)} – ${s.end.slice(0,5)}</td>
      </tr>`).join("");
  } catch {
    if (tbody) tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--muted)">Failed to load slots</td></tr>`;
  }
}

// Month navigation
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

  if (!announcements.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--muted)">No announcements yet</td></tr>`;
    return;
  }

  tbody.innerHTML = announcements.map((a, i) => `
    <tr style="border-bottom:1px solid var(--line);">
      <td style="padding:10px 18px;">${i + 1}</td>
      <td style="padding:10px 18px;font-weight:500;">${a.title}</td>
      <td style="padding:10px 18px;color:var(--muted);">${a.club || "—"}</td>
      <td style="padding:10px 18px;color:var(--muted);">${formatDate(a.created_at)}</td>
      <td style="padding:10px 18px;">
        <span style="padding:2px 8px;border-radius:20px;font-size:11px;background:var(--violet-light);color:var(--violet);">${a.type}</span>
      </td>
      <td style="padding:10px 18px;">
        <span style="padding:2px 8px;border-radius:20px;font-size:11px;
          background:${a.status === "Published" ? "var(--emerald-light)" : "var(--bg)"};
          color:${a.status === "Published" ? "var(--emerald)" : "var(--muted)"};">
          ${a.status}
        </span>
      </td>
      <td style="padding:10px 18px;display:flex;gap:6px;">
        <button class="btn-ghost" onclick="openEditAnnouncement(${a.id})">✏️</button>
        <button class="btn-ghost" style="color:var(--rose);" onclick="deleteAnnouncement(${a.id})">🗑️</button>
      </td>
    </tr>`).join("");
}

function openNewAnnouncementModal() {
  const form = document.getElementById("addAnnouncementForm");
  form.reset();
  delete form.dataset.editId;
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
    const res    = await apiFetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
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
  const orgData = JSON.parse(localStorage.getItem("organizerData") || "{}");
  const club    = orgData.club;
  if (!club) return;

  try {
    const res = await apiFetch(`/execom/club/${encodeURIComponent(club)}`);
    if (res.ok) renderExecom(await res.json());
  } catch (err) { console.error("Execom load error:", err); }
}

function renderExecom(members) {
  const grid = document.getElementById("execomGrid");
  if (!grid) return;

  if (!members?.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span>👥</span><p>No execom members found</p></div>`;
    return;
  }

  const colors = ["6c63ff","ff6584","43d9a2","f4a261","ffd166","5bc0eb","845ef7","fa5252"];
  grid.innerHTML = members.map(m => {
    const seed  = m.name.replace(/ /g, "+");
    const hash  = m.name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const color = colors[hash % colors.length];
    return `
      <div class="execom-card">
        <img src="https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=${color}"
             alt="${m.name}" class="execom-avatar">
        <h4>${m.name}</h4>
        <div class="pos">${m.position}</div>
        <div class="cls">${m.class || "N/A"}</div>
        <div class="execom-contact">
          <div class="contact-item">📧
            ${m.email && m.email !== "N/A"
              ? `<a href="mailto:${m.email}" onclick="event.stopPropagation()">${m.email}</a>`
              : "<span>N/A</span>"}
          </div>
          <div class="contact-item">📞
            ${m.phone && m.phone !== "N/A"
              ? `<a href="tel:${m.phone}" onclick="event.stopPropagation()">${m.phone}</a>`
              : "<span>N/A</span>"}
          </div>
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
  const orgData  = JSON.parse(localStorage.getItem("organizerData") || "{}");

  const get = name => form.elements[name]?.value || "";

  if (!get("title") || !get("type") || !get("date") || !get("capacity")) {
    showToast("⚠️ Please fill all required fields"); return;
  }

  formData.append("title",             get("title"));
  formData.append("type",              get("type"));
  formData.append("description",       get("description"));
  formData.append("date",              get("date"));
  formData.append("time",              get("time"));
  formData.append("capacity",          get("capacity"));
  formData.append("registration_fee",  get("registration_fee") || 0);
  formData.append("venue",             get("venue"));
  formData.append("club",              orgData.club || "");

  const poster = form.querySelector('input[type="file"][name="poster"]');
  if (poster?.files?.length) formData.append("poster", poster.files[0]);

  const reqFile = document.getElementById("requestFile");
  if (reqFile?.files?.length) formData.append("request_upload", reqFile.files[0]);

  try {
    const token = localStorage.getItem("authToken");
    const res   = await fetch(`${API}/events`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData
    });
    if (res.ok) {
      showToast("✅ Event created!");
      closeModal("createEventModal");
      form.reset();
      await loadEvents();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("❌ " + (err.message || "Failed to create event"));
    }
  } catch { showToast("❌ Network error"); }
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS PANEL
// ─────────────────────────────────────────────────────────────

function setupNotifications() {
  const btn   = document.getElementById("notifBtn");
  const panel = document.getElementById("notifPanel");

  // The notification panel in this layout lives in page-notifications
  // The bell button toggles to that page
  if (btn) {
    btn.addEventListener("click", () => {
      switchPage("notifications");
      const dot = document.getElementById("notifDot");
      if (dot) dot.style.display = "none";
    });
  }

  document.querySelectorAll(".ntab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ntab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      notifTab = tab.dataset.tab;
      renderNotifications(notifTab);
    });
  });

  renderNotifications("history");
}

function renderNotifications(tab) {
  const body  = document.getElementById("notifBody");
  if (!body) return;
  const items = notificationsData[tab] || [];

  if (!items.length) {
    body.innerHTML = `<div class="empty-state"><span>🔕</span><p>No notifications</p></div>`;
    return;
  }
  body.innerHTML = items.map(n => `
    <div class="notif-item">
      <div class="notif-dot" style="background:${n.color}"></div>
      <div class="notif-text"><p>${n.text}</p><span>${n.time}</span></div>
    </div>`).join("");
}

// ─────────────────────────────────────────────────────────────
// DARK MODE
// ─────────────────────────────────────────────────────────────

function setupDarkMode() {
  const toggle = document.getElementById("darkModeToggle");
  if (!toggle) return;

  const saved = localStorage.getItem("evexa_theme") === "dark";
  document.body.classList.toggle("dark", saved);
  toggle.checked = saved;

  toggle.addEventListener("change", function () {
    document.body.classList.toggle("dark", this.checked);
    localStorage.setItem("evexa_theme", this.checked ? "dark" : "light");
    showToast(this.checked ? "🌙 Dark mode on" : "☀️ Light mode on");
  });
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
  const rows = [["#", "Name", "Event", "Date", "Status"]];
  allEvents.forEach((e, i) => {
    rows.push([i + 1, e.title, e.club || "—", formatDate(e.date), e.status]);
  });
  const csv  = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: "events_export.csv" });
  a.click();
  URL.revokeObjectURL(url);
  showToast("📤 Export downloaded!");
}

// ─────────────────────────────────────────────────────────────
// SEARCH FILTER (global — filters event rows on dashboard)
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

// ─────────────────────────────────────────────────────────────
// PRESS BOUNCE (stat cards)
// ─────────────────────────────────────────────────────────────

function setupPressBounce() {
  document.querySelectorAll(".stat-card").forEach(card => {
    card.addEventListener("click", function () {
      this.style.transform = "scale(0.97)";
      setTimeout(() => (this.style.transform = ""), 120);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// WIRE REMAINING STATIC BUTTONS
// ─────────────────────────────────────────────────────────────

function wireStaticButtons() {
  // "View All" events link
  document.getElementById("viewAllEventsLink")?.addEventListener("click", () => switchPage("events"));

  // "View all approvals" button
  document.getElementById("viewAllApprovalsBtn")?.addEventListener("click", () => {
    switchPage("events");
    showToast("Showing all events — filter by 'Draft' status");
  });

  // Card header links with data-page
  document.querySelectorAll("[data-page]:not(.nav-item)").forEach(el => {
    el.addEventListener("click", () => switchPage(el.dataset.page));
  });

  // Add Event btn in topbar
  document.getElementById("addEventBtn")?.addEventListener("click", () => openModal("createEventModal"));

  // Create Event btn on events page
  document.getElementById("createEventPageBtn")?.addEventListener("click", () => openModal("createEventModal"));

  // Export registrations
  document.getElementById("exportRegsBtn")?.addEventListener("click", exportRegistrations);

  // Clear activity feed
  document.getElementById("clearActivityBtn")?.addEventListener("click", () => {
    const feed = document.getElementById("activityFeed");
    if (feed) feed.innerHTML = `<div class="empty-state"><span>✅</span><p>Activity cleared</p></div>`;
  });

  // Load activity feed
  loadActivityFeed();

  // Registrations page: load when navigated to
  document.querySelector('.nav-item[data-page="registrations"]')?.addEventListener("click", loadRegistrations);

  // Live clock in topbar
  startClock();
}

function startClock() {
  const titleEl = document.getElementById("topbarTitle");
  if (!titleEl) return;
  let clockEl = document.getElementById("topbarClock");
  if (!clockEl) {
    clockEl = Object.assign(document.createElement("span"), { id: "topbarClock" });
    Object.assign(clockEl.style, {
      fontSize: "12px", fontWeight: "400", color: "var(--muted)",
      fontFamily: "'DM Sans',sans-serif", marginLeft: "10px"
    });
    titleEl.appendChild(clockEl);
  }
  const tick = () => {
    const now = new Date();
    clockEl.textContent = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  };
  tick(); setInterval(tick, 30_000);
}

// ─────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.remove("open");
  });
});

// ─────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 3200);
}

console.log("✅ orgscript.js (backend-connected) loaded");
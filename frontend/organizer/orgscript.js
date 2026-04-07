var API = "http://localhost:5000/api";
window.API = API;
let execomMembersCache = [];

if (window.__EVEXA_INITIALIZED__) {
  console.warn("EVEXA already initialized — skipping");
} else {
  window.__EVEXA_INITIALIZED__ = true;

  document.addEventListener("DOMContentLoaded", async () => {
    console.log("=== EVEXA DASHBOARD LOADING ===");

    const token = localStorage.getItem("organizer_authToken");
    if (!token) { redirectToLogin(); return; }

    try {
      const res = await apiFetch("/organizer/me");
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
    await loadDashboardStats();

        const savedPage = "dashboard";
    localStorage.removeItem("currentPage");
    switchPage(savedPage);

    wireStaticButtons();

 
    document.getElementById("addExecomBtn")?.addEventListener("click", openAddExecomModal);
    const execomForm = document.getElementById("execomEditForm");
    if (execomForm && !execomForm.dataset.listenerAttached) {
      execomForm.dataset.listenerAttached = "1";
      execomForm.addEventListener("submit", submitExecomEdit);
    }

    console.log("✅ Dashboard ready");
  });
}

function apiFetch(path, opts = {}) {
  const token = localStorage.getItem("organizer_authToken");
  opts.headers = { "Authorization": `Bearer ${token}`, ...(opts.headers || {}) };
  return fetch(`${API}${path}`, opts);
}

function redirectToLogin() {
  localStorage.removeItem("organizer_authToken");
  window.location.href = LOGIN_URL;
}

function logout() {

  const loginUrl = window.LOGIN_URL || "../organizer/ogsignin.html";

  const existing = document.getElementById("__logoutModal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "__logoutModal";
  modal.innerHTML = `
    <div id="__logoutBackdrop"
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
      <div style="position:absolute;top:0;left:0;right:0;height:3px;border-radius:24px 24px 0 0;background:linear-gradient(135deg,#ec4899,#f43f5e);box-shadow:0 0 20px rgba(236,72,153,.5);"></div>

      <div style="font-size:42px;margin-bottom:14px;">👋</div>

      <div style="font-size:19px;font-weight:800;color:#f0f2ff;margin-bottom:8px;letter-spacing:-.3px;">
        Logging out?
      </div>

      <div style="font-size:13px;color:rgba(240,242,255,.5);margin-bottom:28px;line-height:1.6;">
        Are you sure you want to logout from the organizer portal?
      </div>

      <div style="display:flex;gap:12px;">
        <button id="__logoutCancelBtn"
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
        <button id="__logoutConfirmBtn"
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


  const closeModal = () => modal.remove();

  document.getElementById("__logoutBackdrop")?.addEventListener("click", closeModal);
  document.getElementById("__logoutCancelBtn")?.addEventListener("click", closeModal);
  document.getElementById("__logoutConfirmBtn")?.addEventListener("click", () => {
    localStorage.removeItem("organizer_authToken");
    localStorage.removeItem("organizer_refreshToken");
    localStorage.removeItem("organizerData");
    localStorage.removeItem("currentPage");
    window.__currentOrganizer = null;
    window.location.href = loginUrl;  
  });

 
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

function updateOrganizerProfile(organizer) {
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

async function loadDashboardStats() {
  try {
    const res = await apiFetch("/organizer/dashboard");
    if (!res.ok) return;
    const d = await res.json();

  
    const statMap = {
      statTotalEvents:        d.total_events        ?? 0,
      statApprovedEvents:     d.approved_events     ?? 0,
      statTotalRegistrations: d.total_registrations ?? 0,
      statOpenIssues:         d.open_issues         ?? 0,
    };
    Object.entries(statMap).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });

    
    const nums = document.querySelectorAll(".pstat-num");
    if (nums.length >= 2) {
      nums[0].textContent = d.total_events ?? events.length;
    
      nums[1].textContent = d.pending_events ?? events.filter(e => e.status === "Pending" || e.status === "Draft").length;
    }
  } catch (err) {
    console.warn("Dashboard stats (non-critical):", err.message);
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

  const titleEl = document.getElementById("topbarTitle");
  if (titleEl) {
    if (nav) {
      titleEl.textContent = nav.textContent.trim().replace(/\d+/g, "").trim();
    } else {
      const fallbackTitles = {
        "club-single":    "Club Details",
        "settings":       "Profile & Settings",
        "event-detail":   "Event Detail",
        "notifications":  "Notifications",
      };
      titleEl.textContent = fallbackTitles[name] || "Dashboard";
    }
  }

  if (name === "registrations")  loadEventParticipantsTable();
  if (name === "announcements")  loadAnnouncements();
  if (name === "venues")         loadVenues();
  if (name === "execom")         loadExecom();
  if (name === "clubs")          loadOrgClubs();
  if (name === "tickets")        setTimeout(initTicketScanner, 150);
  if (name === "certificates") {
    setupCertificateUpload(); 
    loadCertificateEvents();
  }
}

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
    row.addEventListener("click", () => { openEventDetail(events[i].id); });
  });
}

function renderDashApprovals() {
  const list = document.getElementById("approvalList");
  if (!list) return;

  const orgData = window.__currentOrganizer || {};
  const pending = events.filter(e => e.status === "Pending" || e.status === "Draft");

  if (!pending.length) {
    list.innerHTML = `<div class="empty-state"><span>✅</span><p>No events awaiting faculty approval</p></div>`;
    return;
  }

  list.innerHTML = pending.slice(0, 3).map(e => `
    <div class="approval-item">
      <div class="approval-avatar">${(e.title || "?")[0].toUpperCase()}</div>
      <div class="approval-info">
        <div class="aname">${e.title}</div>
        <div class="aevent">${e.club || orgData.club || "Club"} · ${formatDateYMD(toYMD(e.date))}</div>
        <div style="font-size:11px;color:#b45309;margin-top:2px;">⏳ Awaiting faculty approval</div>
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

function renderEventsGrid() {
  const grid = document.getElementById("eventsGrid");
  if (!grid) return;
  if (!filteredEvents.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span>📅</span><p>No events found</p></div>`; return; }
  grid.innerHTML = filteredEvents.map(e => createEventCard(e)).join("");
  grid.querySelectorAll(".event-card").forEach((card, i) => {
    card.addEventListener("click", () => { openEventDetail(filteredEvents[i].id); });
  });
}

function createEventCard(e) {
  const clubName   = e.club || "Club not specified";
  const posterUrl  = e.posterUrl || "";
  const capacity   = Number(e.capacity || 0);
  const registered = Number(e.registered || e.registered_count || 0);
  const seatsLeft  = Math.max(0, capacity - registered);
  const percent    = capacity > 0 ? (registered / capacity) * 100 : 0;

  
  const statusConfig = {
  Pending:          { label: "⏳ Pending Approval",         bg: "var(--amber-light)",   color: "#b45309" },
  Draft:            { label: "⏳ Pending Approval",         bg: "var(--amber-light)",   color: "#b45309" },
  "Faculty Approved": { label: "✅ Faculty Approved",       bg: "#dbeafe",              color: "#1d4ed8" }, 
  Approved:         { label: "✅ Approved",                 bg: "var(--emerald-light)", color: "#065f46" },
  Rejected:         { label: "❌ Rejected",                 bg: "var(--rose-light)",    color: "#be123c" },
  Published:        { label: "🌐 Published",                bg: "var(--violet-light)",  color: "var(--violet)" },
  Completed:        { label: "🏁 Completed",                bg: "rgba(255,255,255,.08)",color: "var(--muted)" },
};
  const sc = statusConfig[e.status] || { label: e.status || "Unknown", bg: "rgba(255,255,255,.08)", color: "var(--muted)" };

  return `
    <div class="event-card">
      <div class="event-card-poster">${posterUrl ? `<img src="${posterUrl}" alt="" onerror="this.style.display='none'">` : ""}</div>
      <div class="event-card-body">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;">
          <div class="event-card-title" style="flex:1;">${e.title}</div>
          <span style="flex-shrink:0;padding:3px 9px;border-radius:20px;font-size:10.5px;font-weight:700;background:${sc.bg};color:${sc.color};white-space:nowrap;">${sc.label}</span>
        </div>
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
          <a class="view-details" href="#" onclick="event.preventDefault();event.stopPropagation();openEventDetail(${e.id})">View details →</a>
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
 
  filteredEvents = events.filter(e => {
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
  filteredEvents = [...events]; 
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
    if (status === "booked" || status === "approved")  { cell.classList.add("booked");    cell.title = `Day ${day} — Fully Booked`; }
    else if (status === "pending") { cell.classList.add("pending");   cell.title = `Day ${day} — Pending Approval`; }
    else                           { cell.classList.add("available"); cell.title = `Day ${day} — Available (click to book)`; cell.addEventListener("click", () => openVenueSlots(day)); }
    grid.appendChild(cell);
  }
}

async function openVenueSlots(day) {
  const dt      = new Date(currentYear, currentMonth, day);
  const dateStr = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  document.getElementById("vbVenueName").value = currentVenue;
  document.getElementById("vbDate").value       = dateStr;
  document.getElementById("venueBookInfo").innerHTML =
    `<strong>📍 ${currentVenue}</strong> &nbsp;·&nbsp; 📅 ${formatDateYMD(dateStr)}`;

  document.getElementById("vbSlotStart").value = "";
  document.getElementById("vbSlotEnd").value   = "";
  document.getElementById("vbPurpose").value   = "";
  document.getElementById("vbDoc").value        = "";
  document.getElementById("vbSubmitBtn").disabled = false;

const evSel = document.getElementById("vbEventId");
evSel.innerHTML = `<option value="">— Select an event (optional) —</option>`;
const pendingEvents = events.filter(e => e.status === "Pending");
if (!pendingEvents.length) {
  evSel.insertAdjacentHTML("beforeend",
    `<option disabled>No pending events available</option>`);
}
pendingEvents.forEach(e => {
  evSel.insertAdjacentHTML("beforeend",
    `<option value="${e.id}">${e.title} (${formatEventDate(e.date)})</option>`);
});
  const slotList = document.getElementById("vbSlotList");
  slotList.innerHTML = `<span style="color:var(--muted);font-size:13px;">Loading slots…</span>`;
  openModal("venueBookModal");

  try {
    const res   = await apiFetch(`/venues/slots?venue_name=${encodeURIComponent(currentVenue)}&date=${dateStr}`);
    const slots = res.ok ? await res.json() : [];
    const avail = slots.filter(s => s.available);

    if (!avail.length) {
      slotList.innerHTML = `<span style="color:var(--muted);font-size:13px;">No available slots for this date.</span>`;
      document.getElementById("vbSubmitBtn").disabled = true;
      return;
    }

    slotList.innerHTML = avail.map(s => `
      <button type="button"
        class="slot-chip"
        data-start="${s.start}" data-end="${s.end}"
        onclick="selectSlotChip(this, '${s.start}', '${s.end}')">
        ${s.start.slice(0,5)} – ${s.end.slice(0,5)}
      </button>`).join("");
  } catch {
    slotList.innerHTML = `<span style="color:var(--rose);font-size:13px;">Failed to load slots. Try again.</span>`;
  }
}

function selectSlotChip(el, start, end) {
  el.classList.toggle("selected"); 
  const selected = [...document.querySelectorAll(".slot-chip.selected")]
    .map(c => ({ start: c.dataset.start, end: c.dataset.end }));
  document.getElementById("vbSlotStart").value = JSON.stringify(selected);
}

async function submitVenueBooking(e) {
  e.preventDefault();
  const raw = document.getElementById("vbSlotStart").value;
  if (!raw) { showToast("⚠️ Please select at least one time slot"); return; }

  let selectedSlots;
  try { selectedSlots = JSON.parse(raw); } catch { selectedSlots = []; }
  if (!selectedSlots.length) { showToast("⚠️ Please select at least one time slot"); return; }

  const btn = document.getElementById("vbSubmitBtn");
  btn.disabled = true; btn.textContent = "Submitting…";

  const venueName = document.getElementById("vbVenueName").value;
  const date      = document.getElementById("vbDate").value;
  const purpose   = document.getElementById("vbPurpose").value;
  const eventId   = document.getElementById("vbEventId").value;
  const docFile   = document.getElementById("vbDoc").files[0];

  let successCount = 0;
  for (const slot of selectedSlots) {
    const formData = new FormData();
    formData.append("venue_name", venueName);
    formData.append("date",       date);
    formData.append("slot_start", slot.start);
    formData.append("slot_end",   slot.end);
    formData.append("purpose",    purpose);
    formData.append("event_id",   eventId);
    if (docFile) formData.append("support_doc", docFile);

    try {
      const token = localStorage.getItem("organizer_authToken");
      const res = await fetch(`${API}/venues/bookings`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      if (res.ok) successCount++;
      else {
        const err = await res.json().catch(() => ({}));
        showToast(`❌ Slot ${slot.start.slice(0,5)}–${slot.end.slice(0,5)}: ${err.message || "Failed"}`);
      }
    } catch { showToast("❌ Network error"); }
  }

  if (successCount > 0) {
    showToast(`✅ ${successCount} booking request(s) submitted!`);
    closeModal("venueBookModal");
    await loadVenueBookings();
    renderCalendar();
  }
  btn.disabled = false; btn.textContent = "📩 Submit Booking Request";
}

function switchVenueTab(tab) {
  document.querySelectorAll(".venue-tab").forEach(t => t.classList.remove("active"));
  document.getElementById("vtab-panel-calendar").style.display   = tab === "calendar"    ? "" : "none";
  document.getElementById("vtab-panel-mybookings").style.display = tab === "mybookings"  ? "" : "none";
  document.getElementById(`vtab-${tab}`).classList.add("active");
  if (tab === "mybookings") loadMyVenueBookings();
}

async function loadMyVenueBookings() {
  const tbody = document.getElementById("myVenueBookingsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;
  try {
    const res  = await apiFetch("/venues/bookings/mine");
    const data = res.ok ? await res.json() : [];
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No bookings yet</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((b, i) => {
      const statusColor = b.status === "hall_approved"    ? "var(--emerald)"  :
                          b.status === "faculty_approved" ? "var(--sky)"      :
                          b.status === "rejected"         ? "var(--rose)"     : "var(--amber)";
      const statusBg    = b.status === "hall_approved"    ? "var(--emerald-light)"  :
                          b.status === "faculty_approved" ? "var(--sky-light)"      :
                          b.status === "rejected"         ? "var(--rose-light)"     : "var(--amber-light)";
      return `
        <tr style="border-bottom:1px solid var(--line);">
          <td style="padding:10px 14px;">${i+1}</td>
          <td style="padding:10px 14px;font-weight:500;">📍 ${b.venue_name}</td>
          <td style="padding:10px 14px;color:var(--ink2);">${b.event_title || "—"}</td>
          <td style="padding:10px 14px;color:var(--ink2);">${formatDateYMD(b.date)}</td>
          <td style="padding:10px 14px;color:var(--ink2);">${(b.slot_start||"").slice(0,5)}${b.slot_end ? " – " + b.slot_end.slice(0,5) : ""}</td>
          <td style="padding:10px 14px;">
            <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${statusBg};color:${statusColor};">${
              b.status === 'hall_approved'    ? 'Hall Approved'    :
              b.status === 'faculty_approved' ? 'Faculty Approved' :
              b.status === 'rejected'         ? 'Rejected'         :
              b.status === 'pending'          ? 'Pending'          : b.status
            }</span>
          </td>
        </tr>`;
    }).join("");
  } catch { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Failed to load</td></tr>`; }
}

async function cancelVenueBooking(id) {
  if (!confirm("Cancel this booking request?")) return;
  try {
    const res = await apiFetch(`/venues/bookings/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("🗑️ Booking cancelled"); loadMyVenueBookings(); }
    else showToast("❌ Could not cancel");
  } catch { showToast("❌ Network error"); }
}

document.getElementById("prevMonth")?.addEventListener("click", async () => {
  currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await loadVenueBookings(); renderCalendar();
});
document.getElementById("nextMonth")?.addEventListener("click", async () => {
  currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await loadVenueBookings(); renderCalendar();
});

async function loadAnnouncements() {
  try {
    const res = await apiFetch("/announcements");
    const orgData = window.__currentOrganizer || {};
    announcements = res.ok ? (await res.json()).map(a => ({
      ...a,
      club: a.club || orgData.club || "—"   // ← fallback for old records
    })) : [];
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

  const title   = document.getElementById("annTitle")?.value.trim()   || "";
  const type    = document.getElementById("annType")?.value.trim()    || "General"; 
  const message = document.getElementById("annMessage")?.value.trim() || "";

  if (!title || !message) {
    showToast("⚠️ Title and message are required.");
    return;
  }

  const orgData = window.__currentOrganizer || {};
  const payload = { title, type, message, club: orgData.club || "" };

  try {
    const url    = editId ? `/announcements/${editId}` : `/announcements`;
    const method = editId ? "PUT" : "POST";
    const res    = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showToast("❌ " + (d.message || "Failed"));
      return;
    }
    showToast(editId ? "✅ Announcement updated!" : "📢 Announcement published!");
    closeModal("addAnnouncementModal");
    form.reset();
    delete form.dataset.editId;
    await loadAnnouncements();
  } catch {
    showToast("❌ Something went wrong");
  }
}
async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  try {
    const res = await apiFetch(`/announcements/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("🗑️ Announcement deleted"); await loadAnnouncements(); }
  } catch { showToast("❌ Delete failed"); }
}

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
        <div style="position:absolute;top:10px;right:10px;display:flex;gap:6px;">
          <button onclick="openEditExecomModal(${m.id})"
            style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;color:var(--violet);transition:all 0.15s;"
            onmouseover="this.style.background='var(--violet-light)'"
            onmouseout="this.style.background='var(--bg)'">✏️</button>
          <button onclick="deleteExecomMember(${m.id})"
            style="background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:4px 8px;font-size:11px;cursor:pointer;color:var(--rose);transition:all 0.15s;"
            onmouseover="this.style.background='var(--rose-light)'"
            onmouseout="this.style.background='var(--bg)'">🗑️</button>
        </div>
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

async function deleteExecomMember(id) {
  if (!confirm("Delete this member?")) return;
  try {
    const res = await apiFetch(`/execom/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json().catch(() => ({})); showToast("❌ " + (d.message || "Delete failed")); return; }
    showToast("🗑️ Member deleted");
    await loadExecom();
  } catch { showToast("❌ Network error"); }
}

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
    const token = localStorage.getItem("organizer_authToken");
    const res   = await fetch(`${API}/events`, { method: "POST", headers: { "Authorization": `Bearer ${token}` }, body: formData });
    if (res.ok) { showToast("✅ Event created!"); closeModal("createEventModal"); form.reset(); await loadEvents(); }
    else { const err = await res.json().catch(() => ({})); showToast("❌ " + (err.message || "Failed to create event")); }
  } catch { showToast("❌ Network error"); }
}

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

function filterNotifTab(tab) {
  // Update active chip
  ["all","history","schedule","requests"].forEach(t => {
    document.getElementById(`ntab-${t}`)?.classList.toggle("selected", t === tab);
  });

  const body = document.getElementById("notifBody");
  if (!body) return;

  const src = tab === "all"
    ? [...(notificationsData.history||[]), ...(notificationsData.schedule||[]), ...(notificationsData.requests||[])]
    : (notificationsData[tab] || []);

  if (!src.length) {
    body.innerHTML = `<div class="empty-state"><span>🔕</span><p>No notifications</p></div>`;
    return;
  }
  body.innerHTML = src.map(n => `
    <div class="notif-item">
      <div class="notif-dot" style="background:${n.color}"></div>
      <div class="notif-text"><p>${n.text}</p><span>${n.time}</span></div>
    </div>`).join("");
}

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

function wireStaticButtons() {
  document.getElementById("viewAllEventsLink")?.addEventListener("click", () => switchPage("events"));
  document.getElementById("viewAllApprovalsBtn")?.addEventListener("click", () => { switchPage("events"); showToast("Showing all events — filter by 'Draft' status"); });
  document.querySelectorAll("[data-page]:not(.nav-item):not(#sidebarUserBtn)").forEach(el => {
  el.addEventListener("click", () => switchPage(el.dataset.page));
});
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

function openModal(id)  { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.classList.remove("open"); });
});

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
  const label = document.getElementById("calMonthLabel");
  if (label) label.textContent = evMonthLabel(evCalCursor);

  const cal = document.getElementById("miniCalendar");
  if (!cal) return;

  const today        = new Date();
  const year         = evCalCursor.getFullYear();
  const month        = evCalCursor.getMonth();
  const firstDay     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  const eventMap = {};
  getCalendarEvents().forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const key = `${year}-${month}-${d.getDate()}`;
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push(e);
    }
  });

  const weekdays = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  let html = `<div class="cal-weekdays">${weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join("")}</div>`;
  html += `<div class="cal-days">`;

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const key      = `${year}-${month}-${day}`;
    const isToday  = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    const hasEvent = !!eventMap[key];
    const isSelected = evSelectedDate === evYMD(new Date(year, month, day));
    const classes  = ["cal-day", isToday ? "today" : "", hasEvent ? "has-event" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ");
    const events   = hasEvent ? JSON.stringify(eventMap[key]).replace(/"/g, "&quot;") : "";
    html += `<div class="${classes}" data-day="${day}" data-events="${events}" onclick="calDayClick(this)">${day}</div>`;
  }

  html += `</div>`;
  cal.innerHTML = html;

  const detail = document.getElementById("calEventDetail");
  if (detail && !evSelectedDate) detail.style.display = "none";
}

function calDayClick(el) {
  if (!el.classList.contains("has-event")) return;

  const detail = document.getElementById("calEventDetail");
  const dateStr = evYMD(new Date(evCalCursor.getFullYear(), evCalCursor.getMonth(), parseInt(el.dataset.day)));

  if (evSelectedDate === dateStr) {
    evSelectedDate = null;
    if (detail) detail.style.display = "none";
    renderEventCalendar();
    return;
  }

  evSelectedDate = dateStr;
  renderEventCalendar();

  if (!detail) return;
  const events = JSON.parse(el.getAttribute("data-events").replace(/&quot;/g, '"'));
  const e = events[0];

  const titleEl = document.getElementById("calDetailTitle");
  const metaEl  = document.getElementById("calDetailMeta");
  const linkEl  = document.getElementById("calDetailLink");

  if (titleEl) titleEl.textContent = e.title;
  if (metaEl) {
    const date = new Date(e.date).toLocaleDateString("en-IN", { dateStyle: "medium" });
    const fee  = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";
    let meta = `📅 ${date} · 🏛️ ${e.venue || "TBA"} · 💰 ${fee} · 🏷️ ${e.club || "—"}`;
    if (events.length > 1) meta += ` (+${events.length - 1} more)`;
    metaEl.textContent = meta;
  }
  if (linkEl) {
    linkEl.onclick = () => openEventDetail(e.id);
  }

  detail.style.display = "block";
}

function setupEventCalendarNav() {
  const prev = document.getElementById("calPrev");
  const next = document.getElementById("calNext");
  if (!prev || !next) return;
  if (prev.dataset.bound === "1") return;
  prev.dataset.bound = "1"; next.dataset.bound = "1";
  prev.addEventListener("click", () => { evCalCursor = new Date(evCalCursor.getFullYear(), evCalCursor.getMonth()-1, 1); evSelectedDate = null; renderEventCalendar(); });
  next.addEventListener("click", () => { evCalCursor = new Date(evCalCursor.getFullYear(), evCalCursor.getMonth()+1, 1); evSelectedDate = null; renderEventCalendar(); });
}

let certState = { step:1, eventId:null, eventTitle:null, participantCount:0, templateFile:null, excelFile:null, parsedNames:[] };
let certSetupDone = false;

function certGoStep(n) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`cpanel-${i}`)?.classList.toggle("active", i === n);
    const step = document.getElementById(`cstep-${i}`);
    if (step) {
      step.classList.toggle("active",   i === n);
      step.classList.toggle("complete", i < n);
    }
  }
  certState.step = n;
  if (n === 4) updateCertSummary();
}

function updateCertSummary() {
  setText("csum-event",    certState.eventTitle || "—");
  setText("csum-count",    (certState.participantCount || 0) + " participants");
  setText("csum-template", certState.templateFile?.name || "—");
  setText("csum-fontsize", (document.getElementById("certFontSize")?.value || 36) + "px");
}

async function loadCertificateEvents() {
  const list = document.getElementById("certEventsList");
  if (!list) return;
  list.innerHTML = `<div class="empty-state"><span>⏳</span><p>Loading events…</p></div>`;
  try {
    const res  = await apiFetch("/certificates/events");
    const data = res.ok ? await res.json() : [];
    if (!data.length) {
      list.innerHTML = `<div class="empty-state"><span>📅</span><p>No events found</p></div>`;
      return;
    }
    list.innerHTML = data.map(e => {
      const cnt = Number(e.registered_count || e.registered || 0);
      const ymd = toYMD(e.date);
      return `
        <div class="cert-event-item" data-event-id="${e.id}"
             data-title="${String(e.title || "").replace(/"/g, "&quot;")}" data-count="${cnt}">
          <div class="cei-left">
            <div class="cei-thumb">📅</div>
            <div class="cei-info">
              <div class="cei-title">${e.title || "Untitled"}</div>
              <div class="cei-meta">${formatDateYMD(ymd)} · ${e.venue || "TBD"}</div>
            </div>
          </div>
          <div class="cei-right">
            <div class="cei-count">${cnt}</div>
            <div class="cei-label">registered</div>
          </div>
        </div>`;
    }).join("");
   
    list.onclick = (e) => {
      const item = e.target.closest(".cert-event-item");
      if (!item) return;
      document.querySelectorAll(".cert-event-item.selected").forEach(x => x.classList.remove("selected"));
      item.classList.add("selected");
      certState.eventId = Number(item.dataset.eventId);
      certState.eventTitle = item.dataset.title || "Event";
      certState.participantCount = Number(item.dataset.count || 0);
      const badge = document.getElementById("certStep1Selection");
      if (badge) { badge.style.display = "block"; badge.textContent = `✓ ${certState.eventTitle}`; }
      const next1 = document.getElementById("certStep1Next");
      if (next1) next1.disabled = false;
      checkCertStep2();
    };
  } catch (err) {
    console.error("loadCertificateEvents error:", err);
    list.innerHTML = `<div class="empty-state"><span>❌</span><p>Could not load events</p></div>`;
  }
}

function setupCertificateUpload() {
  if (certSetupDone) return; 
  certSetupDone = true;

  const input = document.getElementById("certTemplateFile");
  const zone  = document.getElementById("certUploadZone");

  if (input) {
    input.addEventListener("change", function () {
      if (this.files[0]) setCertTemplate(this.files[0]);
    });
  }

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
      input?.click();
    });
  }

  const excelIn = document.getElementById("certExcelFile");
  if (excelIn) {
    excelIn.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) { certState.excelFile = null; certState.parsedNames = []; checkCertStep2(); return; }
      certState.excelFile = file;
      const preview = document.getElementById("certExcelPreview");
      if (preview) preview.textContent = "⏳ Reading file…";

      const reader = new FileReader();
      reader.onload = function(ev) {
        try {
          const wb    = XLSX.read(ev.target.result, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

          if (rows.length < 2) {
            if (preview) preview.textContent = "⚠️ File appears empty";
            certState.parsedNames = [];
            checkCertStep2();
            return;
          }

          const headers  = rows[0].map(h => String(h).trim().toLowerCase());
          let   nameCol  = headers.findIndex(h => h === "name");
          if (nameCol === -1) nameCol = 1; 

          const names = rows.slice(1)
            .map(r => String(r[nameCol] || "").trim())
            .filter(n => n.length > 0);

          certState.parsedNames = names;
          if (preview) preview.textContent = `✓ ${names.length} names found (column "${rows[0][nameCol] || "B"}")`;
          checkCertStep2();
        } catch(err) {
          console.error("Excel parse error:", err);
          if (preview) preview.textContent = "❌ Could not read file — check format";
          certState.parsedNames = [];
          checkCertStep2();
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  const colorPick = document.getElementById("certColor");
  if (colorPick) {
    colorPick.addEventListener("input", function () {
      const el = document.getElementById("certColorHex");
      if (el) el.textContent = this.value;
    });
  }
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
  const input  = document.getElementById("certTemplateFile");
  if (zone)   zone.style.display   = "";
  if (status) status.style.display = "none";
  if (input)  input.value          = "";
  checkCertStep2();
}

function checkCertStep2() {
  const hasTemplate = !!certState.templateFile;
  const hasData     = !!(certState.parsedNames && certState.parsedNames.length > 0);
  const btn = document.getElementById("certStep2Next");
  if (btn) btn.disabled = !(hasTemplate && hasData);
}

function certDebug(container, icon, title, detail) {
  const msg = `[CERT DEBUG] ${icon} ${title}${detail ? " | " + detail : ""}`;
  console.warn(msg);
  if (container) {
    container.innerHTML = `
      <div style="min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center;">
        <div style="font-size:36px;">${icon}</div>
        <div style="font-size:15px;font-weight:700;color:var(--ink,#f0f2ff);">${title}</div>
        ${detail ? `<div style="font-size:12px;color:var(--muted,#aaa);max-width:420px;word-break:break-word;background:rgba(0,0,0,.25);padding:10px 14px;border-radius:10px;font-family:monospace;">${detail}</div>` : ""}
        <div style="font-size:11px;color:var(--muted,#aaa);margin-top:6px;">See browser console (F12) for full details</div>
      </div>`;
  }
}

async function previewCertificate(e) {
  if (e && typeof e.stopPropagation === "function") {
    e.stopPropagation();
    e.preventDefault();
  }

  const container = document.getElementById("certPreviewContainer");

  console.group("🔍 previewCertificate() called");
  console.log("certState:", JSON.stringify({
    step: certState.step,
    eventId: certState.eventId,
    eventTitle: certState.eventTitle,
    templateFile: certState.templateFile ? certState.templateFile.name : null,
    parsedNames: certState.parsedNames?.length ?? 0,
  }));

  if (!certState.templateFile) {
    console.warn("❌ No templateFile in certState — user needs to upload PDF in Step 2");
    console.groupEnd();
    certDebug(container, "⚠️", "No template uploaded", "Go back to Step 2 and upload your certificate PDF template first.");
    showToast("⚠️ Please upload a certificate template (PDF) in Step 2 first");
    return;
  }

  if (!container) {
    console.warn("❌ certPreviewContainer element not found in DOM");
    console.groupEnd();
    showToast("⚠️ Preview area not found — try refreshing the page");
    return;
  }

  console.log("✅ Template file:", certState.templateFile.name, certState.templateFile.size, "bytes");
  console.log("Calling API:", `${API}/certificates/preview`);
  console.groupEnd();

  container.innerHTML = `<div class="empty-state" style="min-height:260px;"><span>⏳</span><p>Generating preview…</p></div>`;

  const fd = new FormData();
  fd.append("template",     certState.templateFile);
  fd.append("preview_name", document.getElementById("certPreviewName")?.value || "John Doe");
  fd.append("font_size",    document.getElementById("certFontSize")?.value    || "36");
  fd.append("x_pct",        document.getElementById("certXPct")?.value        || "50");
  fd.append("y_pct",        document.getElementById("certYPct")?.value        || "52");
  fd.append("color_hex",    document.getElementById("certColor")?.value       || "#1a1a2e");

  try {
    const token = localStorage.getItem("organizer_authToken");
    console.log("🔑 Token present:", !!token);

    const res = await fetch(`${API}/certificates/preview`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: fd
    });

    console.log("📡 API response status:", res.status, res.statusText);

    if (!res.ok) {
      const errText = await res.text().catch(() => "(could not read error body)");
      console.error("❌ Preview API error body:", errText);
      certDebug(container, "❌", `Server error ${res.status}`, errText.slice(0, 300));
      showToast("❌ Preview failed — server returned " + res.status);
      return;
    }

    const blob   = await res.blob();
    console.log("✅ Blob received:", blob.size, "bytes, type:", blob.type);
    const objUrl = URL.createObjectURL(blob);
    container.innerHTML = `<iframe src="${objUrl}" class="cert-preview-frame"></iframe>`;
    showToast("✅ Preview ready!");

  } catch (err) {
    console.error("❌ previewCertificate network/runtime error:", err);
    certDebug(container, "❌", "Preview failed: " + (err.message || "unknown error"),
      "This usually means the backend server is not running or the /certificates/preview endpoint is unreachable.");
    showToast("❌ Preview failed — " + (err.message || "network error"));
  }
}

async function generateCertificates() {
  if (!certState.templateFile)                          { showToast("⚠️ No template uploaded"); return; }
  if (!certState.parsedNames || !certState.parsedNames.length) { showToast("⚠️ No names found in uploaded file"); return; }

  const btn      = document.getElementById("certGenerateBtn");
  const progress = document.getElementById("certGenerateProgress");
  const fill     = document.getElementById("certProgressFill");
  const label    = document.getElementById("certProgressLabel");

  if (btn)      btn.disabled           = true;
  if (progress) progress.style.display = "block";
  if (fill)     fill.style.width       = "0%";
  if (label)    label.textContent      = "Sending request…";

  let pct = 0;
  const interval = setInterval(() => {
    pct = Math.min(pct + 2, 85);
    if (fill) fill.style.width = `${pct}%`;
  }, 200);

  const fd = new FormData();
  fd.append("template",  certState.templateFile);
  fd.append("names",     JSON.stringify(certState.parsedNames));   
  fd.append("font_size", document.getElementById("certFontSize")?.value || 36);
  fd.append("x_pct",     document.getElementById("certXPct")?.value     || 50);
  fd.append("y_pct",     document.getElementById("certYPct")?.value     || 52);
  fd.append("color_hex", document.getElementById("certColor")?.value    || "#1a1a2e");
  if (certState.eventId) fd.append("event_id", certState.eventId);

  try {
    const token = localStorage.getItem("organizer_authToken");
    const res   = await fetch(`${API}/certificates/generate`, {
      method:"POST", headers:{"Authorization":`Bearer ${token}`}, body:fd
    });
    clearInterval(interval);
    if (fill)  fill.style.width  = "100%";
    if (label) label.textContent = "Done! Preparing download…";

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast("❌ " + (err.message || "Generation failed"));
      if (btn) btn.disabled = false;
      setTimeout(() => { if (progress) progress.style.display = "none"; }, 2000);
      return;
    }

    const blob   = await res.blob();
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href     = url;
    anchor.download = `certificates_${certState.eventTitle || "export"}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);

    const count = certState.parsedNames.length;
    showToast(`🎓 ${count} certificates downloaded!`);
    saveCertHistory({
      event:    certState.eventTitle,
      count,
      template: certState.templateFile?.name || "—",
      date:     new Date().toISOString()
    });

    setTimeout(() => {
      const genView = document.getElementById("certGenerateView");
      const sucView = document.getElementById("certSuccessView");
      const footer  = document.getElementById("certStep4Footer");
      const msg     = document.getElementById("certSuccessMsg");
      if (msg)     msg.textContent       = `${count} certificate${count !== 1 ? "s" : ""} generated for "${certState.eventTitle}" and saved to downloads.`;
      if (genView) genView.style.display = "none";
      if (sucView) sucView.style.display = "";
      if (footer)  footer.style.display  = "none";
    }, 600);

    await loadEvents();
  } catch (err) {
    clearInterval(interval);
    showToast("❌ Network error");
    if (btn) btn.disabled = false;
    if (progress) progress.style.display = "none";
  }
}

function switchCertMainTab(tab) {
  const isGen = tab === "generate";
  document.getElementById("certTabGenerate").style.display = isGen ? "" : "none";
  document.getElementById("certTabHistory").style.display  = isGen ? "none" : "";
  document.getElementById("cmtab-generate").classList.toggle("active",  isGen);
  document.getElementById("cmtab-history").classList.toggle("active",  !isGen);
  if (!isGen) loadCertHistory();
}

function resetCertWizard() {
  certState = { step:1, eventId:null, eventTitle:null, participantCount:0, templateFile:null, excelFile:null, parsedNames:[] };
  certSetupDone = false; 

  for (let i = 1; i <= 4; i++) {
    const s = document.getElementById(`cstep-${i}`);
    if (s) { s.classList.remove("active","complete"); if (i===1) s.classList.add("active"); }
    const p = document.getElementById(`cpanel-${i}`);
    if (p) { p.classList.toggle("active", i===1); }
  }

  const badge = document.getElementById("certStep1Selection");
  const next1 = document.getElementById("certStep1Next");
  if (badge) { badge.style.display = "none"; badge.textContent = ""; }
  if (next1) next1.disabled = true;

  const zone   = document.getElementById("certUploadZone");
  const status = document.getElementById("certFileStatus");
  const tInput = document.getElementById("certTemplateFile");
  const fName  = document.getElementById("certFileName");
  if (zone)   zone.style.display   = "";
  if (status) status.style.display = "none";
  if (tInput) tInput.value         = "";
  if (fName)  fName.textContent    = "";

  const excelIn   = document.getElementById("certExcelFile");
  const excelPrev = document.getElementById("certExcelPreview");
  if (excelIn)   excelIn.value         = "";
  if (excelPrev) excelPrev.textContent = "";

  const next2 = document.getElementById("certStep2Next");
  if (next2) next2.disabled = true;

  const container = document.getElementById("certPreviewContainer");
  if (container) container.innerHTML = `<div class="empty-state"><span>👁</span><p>Click Preview to render</p></div>`;
  const genView  = document.getElementById("certGenerateView");
  const sucView  = document.getElementById("certSuccessView");
  const footer   = document.getElementById("certStep4Footer");
  const progress = document.getElementById("certGenerateProgress");
  const fill     = document.getElementById("certProgressFill");
  const label    = document.getElementById("certProgressLabel");
  const genBtn   = document.getElementById("certGenerateBtn");
  if (genView)  genView.style.display  = "";
  if (sucView)  sucView.style.display  = "none";
  if (footer)   footer.style.display   = "";
  if (progress) progress.style.display = "none";
  if (fill)     fill.style.width       = "0%";
  if (label)    label.textContent      = "Preparing…";
  if (genBtn)   genBtn.disabled        = false;
  loadCertificateEvents();
}
function saveCertHistory(entry) {
  try {
    const list = JSON.parse(localStorage.getItem("cert_history") || "[]");
    list.unshift({ ...entry, id: Date.now() });
    if (list.length > 50) list.length = 50;
    localStorage.setItem("cert_history", JSON.stringify(list));
  } catch {}
}

function loadCertHistory() {
  const body    = document.getElementById("certHistoryBody");
  const empty   = document.getElementById("certHistoryEmpty");
  const wrapper = document.getElementById("certHistoryTableWrap");
  if (!body) return;
  try {
    const list = JSON.parse(localStorage.getItem("cert_history") || "[]");
    if (!list.length) {
      if (empty)   empty.style.display   = "";
      if (wrapper) wrapper.style.display = "none";
      return;
    }
    if (empty)   empty.style.display   = "none";
    if (wrapper) wrapper.style.display = "";
    body.innerHTML = list.map((item, i) => {
      const d = item.date ? new Date(item.date).toLocaleString() : "—";
      return `<tr>
        <td class="td">${i + 1}</td>
        <td class="td" style="font-weight:600;">${item.event || "—"}</td>
        <td class="td"><span class="badge badge--violet">${item.count ?? "—"}</span></td>
        <td class="td" style="font-size:12px;color:var(--muted);">${item.template || "—"}</td>
        <td class="td" style="font-size:12px;color:var(--muted);">${d}</td>
        <td class="td">
          <button class="btn-ghost" style="font-size:11px;color:var(--rose);" onclick="deleteCertHistoryEntry(${item.id})">🗑</button>
        </td>
      </tr>`;
    }).join("");
  } catch {
    body.innerHTML = `<tr><td colspan="6" class="table-empty">Could not load history</td></tr>`;
  }
}

function deleteCertHistoryEntry(id) {
  try {
    const list = JSON.parse(localStorage.getItem("cert_history") || "[]").filter(x => x.id !== id);
    localStorage.setItem("cert_history", JSON.stringify(list));
    loadCertHistory();
    showToast("🗑 Entry removed");
  } catch {}
}
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
let html5Qr; let lastToken = null; let scanning = false;

function setScanResult(html) { const el = document.getElementById("scanResult"); if (el) el.innerHTML = html; }

function extractTokenFromQR(decodedText) {
  console.log("📷 Raw QR decoded:", decodedText);
  if (!decodedText) return null;
  try {
    const obj = JSON.parse(decodedText);
    if (obj && obj.t) { console.log("✅ Extracted token:", obj.t); return obj.t; }
  } catch (_) {}
  if (decodedText.trim().length > 0) return decodedText.trim();
  return null;
}

async function verifyTicketToken(token) {
  if (!token) { setScanResult(`<b>❌ Invalid QR</b><br/>Could not read token from this QR code.`); return; }
  if (token === lastToken) return;
  setScanResult(`⏳ Verifying ticket...`);
  try {
    const res  = await fetch(`${API}/tickets/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("organizer_authToken") },
      body: JSON.stringify({ qr_token: token })
    });
    const data = await res.json();
    if (!res.ok) {
      setScanResult(`<b>❌ ${data.message || "Verification failed"}</b>`);
      return;
    }
    lastToken = token;
    if (data.status === "VALID") {
      setScanResult(`<div style="padding:10px;border-radius:12px;background:#ecfdf5;border:1px solid #10b9811f;">
        <b style="color:#059669;">✅ VALID ENTRY</b>
        <div style="margin-top:8px;">
          <b>Name:</b> ${data.name}<br/>
          <b>Roll:</b> ${data.roll_no}<br/>
          <b>Dept:</b> ${data.department}<br/>
          <b>Class:</b> ${data.class}<br/>
          <b>Event:</b> ${data.event_title}<br/>
          <b>Ticket:</b> ${data.ticket_id}
        </div>
      </div>`);
      return;
    }
    if (data.status === "ALREADY_USED") {
      setScanResult(`<div style="padding:10px;border-radius:12px;background:#fff7ed;border:1px solid #fb923c33;">
        <b style="color:#c2410c;">⚠️ ALREADY USED</b>
        <div style="margin-top:8px;">
          <b>Name:</b> ${data.name}<br/>
          <b>Roll:</b> ${data.roll_no}<br/>
          <b>Ticket:</b> ${data.ticket_id}<br/>
          <b>Checked-in at:</b> ${data.checked_in_at || "—"}
        </div>
      </div>`);
      return;
    }
    setScanResult(`<b>ℹ️ ${data.status}</b>`);
  } catch (err) {
    console.error("verifyTicketToken error:", err);
    lastToken = null;
    setScanResult(`<b>❌ Network / Server error</b>`);
  }
}

let html5QrScanInterval = null;   
async function _scanFrameWithBoost(html5QrInstance, videoEl, canvasEl) {
  const W = canvasEl.width  = videoEl.videoWidth  || 640;
  const H = canvasEl.height = videoEl.videoHeight || 480;
  const ctx = canvasEl.getContext("2d", { willReadFrequently: true });

 
  ctx.drawImage(videoEl, 0, 0, W, H);


  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  const contrast   = 2.2;   
  const brightness = 10;   
  const factor     = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
  for (let i = 0; i < d.length; i += 4) {
    d[i]   = Math.min(255, Math.max(0, factor * (d[i]   - 128) + 128 + brightness));
    d[i+1] = Math.min(255, Math.max(0, factor * (d[i+1] - 128) + 128 + brightness));
    d[i+2] = Math.min(255, Math.max(0, factor * (d[i+2] - 128) + 128 + brightness));
  }
  ctx.putImageData(imgData, 0, 0);

  return new Promise((resolve) => {
    canvasEl.toBlob(async (blob) => {
      if (!blob) { resolve(null); return; }
      const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
      try {
        const result = await html5QrInstance.scanFileV2(file, false);
        resolve(result?.decodedText || null);
      } catch (_) {
        resolve(null);
      }
    }, "image/jpeg", 0.92);
  });
}

function initTicketScanner() {
  const readerEl = document.getElementById("qr-reader");
  const startBtn = document.getElementById("startScan");
  const stopBtn  = document.getElementById("stopScan");
  if (!readerEl || !startBtn || !stopBtn) return;
  if (startBtn.dataset.bound === "1") return;
  startBtn.dataset.bound = "1"; stopBtn.dataset.bound = "1";

  const offCanvas = document.createElement("canvas");

  startBtn.onclick = async () => {
    if (scanning) return;
    scanning = true; lastToken = null;
    setScanResult("📷 Starting camera…");
    startBtn.disabled = true; stopBtn.disabled = false;

    try {
      if (html5QrScanInterval) { clearInterval(html5QrScanInterval); html5QrScanInterval = null; }
      if (html5Qr) {
        try { await html5Qr.stop(); } catch (_) {}
        try { await html5Qr.clear(); } catch (_) {}
        html5Qr = null;
      }

      html5Qr = new Html5Qrcode("qr-reader", { verbose: false });

      await new Promise(r => setTimeout(r, 80));
      const rawWidth = document.getElementById("qr-reader")?.offsetWidth || 0;
      const boxSize = Math.max(Math.floor(rawWidth * 0.55), 180);
      console.log("qr-reader offsetWidth:", rawWidth, "\u2192 boxSize:", boxSize);

      const scanConfig = {
        fps: 10,
        qrbox: { width: boxSize, height: boxSize },
        rememberLastUsedCamera: true,
        supportedScanTypes: [0],  
      };

      const onDecodeSuccess = (decodedText) => {
        verifyTicketToken(extractTokenFromQR(decodedText));
      };
      const onDecodeError = (_) => {};

  
      let nativeStarted = false;
      try {
        await html5Qr.start({ facingMode: "environment" }, scanConfig, onDecodeSuccess, onDecodeError);
        nativeStarted = true;
      } catch (e1) {
        console.warn("facingMode=environment failed:", e1.message);
        try { await html5Qr.stop(); } catch (_) {}
        try { await html5Qr.clear(); } catch (_) {}
        html5Qr = new Html5Qrcode("qr-reader", { verbose: false });
      }

      if (!nativeStarted) {
        const cameras = await Html5Qrcode.getCameras();
        console.log("Cameras found:", cameras);
        if (!cameras || !cameras.length) throw new Error("No cameras found. Grant camera permission.");
        const cam = cameras.find(c => /back|rear|environment/i.test(c.label)) || cameras[cameras.length - 1];
        console.log("Using camera:", cam.label || cam.id);
        await html5Qr.start(cam.id, scanConfig, onDecodeSuccess, onDecodeError);
      }

      setScanResult("✅ Camera ready — centre the QR inside the box.");

      const videoEl = document.querySelector("#qr-reader video");
      if (videoEl && typeof html5Qr.scanFileV2 === "function") {
        console.log("\uD83D\uDD0D Contrast-boost scan loop active");
        html5QrScanInterval = setInterval(async () => {
          if (!scanning) { clearInterval(html5QrScanInterval); return; }
          try {
            const text = await _scanFrameWithBoost(html5Qr, videoEl, offCanvas);
            if (text) {
              console.log("\uD83D\uDCF7 Boost-scan decoded:", text);
              verifyTicketToken(extractTokenFromQR(text));
            }
          } catch (_) {}
        }, 350); 
      } else {
        console.log("scanFileV2 not available — relying on native ZXing only");
      }

    } catch (e) {
      console.error("\u274C Camera start failed:", e);
      scanning = false; startBtn.disabled = false; stopBtn.disabled = true;
      setScanResult(
        `<b>\u274C Could not start camera</b><br/>` +
        `<small style="color:#888;">${e.message || e}</small><br/>` +
        `<small>Make sure camera access is allowed in your browser.</small>`
      );
      if (html5Qr) { try { await html5Qr.clear(); } catch (_) {} html5Qr = null; }
    }
  };

  stopBtn.onclick = async () => {
    if (html5QrScanInterval) { clearInterval(html5QrScanInterval); html5QrScanInterval = null; }
    if (!html5Qr || !scanning) return;
    try { await html5Qr.stop(); } catch (_) {}
    try { await html5Qr.clear(); } catch (_) {}
    html5Qr = null; scanning = false;
    startBtn.disabled = false; stopBtn.disabled = true; lastToken = null;
    const el = document.getElementById("qr-reader");
    if (el) el.innerHTML = "";
    setScanResult("\uD83D\uDED1 Scanner stopped.");
  };
}

let allOrgClubs      = [];
let filteredOrgClubs = [];
let currentClubFilter = "all";


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
        <div class="ocs-event-card" onclick="openEventDetail(${evId})" style="cursor:pointer;">
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
  window.__currentClubExecom = execom;
  window.__currentClubId     = club.club_id;
  window.__currentClubName   = name;

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
        <div class="ocs-about-card" style="margin-top:16px;">
          <div class="ocs-section-title" style="margin-bottom:12px;">📥 Downloads</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button
              class="btn-primary"
              style="width:100%;font-size:13px;display:flex;align-items:center;justify-content:center;gap:8px;"
              onclick="downloadClubMembersCSV(window.__currentClubId, window.__currentClubName)"
            >
              <span>👥</span> Download Members List
            </button>
            <button
              class="btn-ghost"
              style="width:100%;font-size:13px;display:flex;align-items:center;justify-content:center;gap:8px;"
              onclick="downloadClubExecomCSV(window.__currentClubExecom, window.__currentClubName)"
            >
              <span>🏅</span> Download Execom List
            </button>
          </div>
        </div>
      </div>
    </div>`;
}
async function downloadClubMembersCSV(clubId, clubName) {
  try {
    const res = await apiFetch(`/organizer/clubs/${clubId}/members`);
    if (!res.ok) { showToast("❌ Failed to fetch members"); return; }
    const data = await res.json();
    const members = Array.isArray(data) ? data : (data.members || []);
    if (!members.length) { showToast("⚠️ No members to export"); return; }
    const headers = ["Sl No", "Name", "Email", "Phone", "Roll No", "Admission No", "Class", "Department", "Joined At"];
    const rows = members.map((m, i) => [
      i + 1,
      m.name || m.student_name || "",
      m.email || "",
      m.phone || "",
      m.roll_no || m.roll || "",
      m.admission_no || m.admission_number || "",
      m.class || m.student_class || "",
      m.department || m.dept || "",
      m.joined_at || m.created_at || ""
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })),
      download: `members_${(clubName || "club").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.csv`
    });
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("✅ Members list downloaded");
  } catch (err) { console.error(err); showToast("❌ Download failed"); }
}

function downloadClubExecomCSV(execomData, clubName) {
  if (!execomData || !execomData.length) { showToast("⚠️ No execom data to export"); return; }
  const headers = ["Sl No", "Name", "Position", "Class", "Email", "Phone"];
  const rows = execomData.map((m, i) => [
    i + 1,
    m.name || "",
    m.position || "",
    m.class || m.dept || "",
    m.email || "",
    m.phone || ""
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })),
    download: `execom_${(clubName || "club").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.csv`
  });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("✅ Execom list downloaded");
}
let _edCurrentId   = null;
let _edCurrentData = null;

async function openEventDetail(id, mode = "view") {
  _edCurrentId = id;
  switchPage("event-detail");

  const container = document.getElementById("edContainer");
  if (!container) return;
  container.innerHTML = `<div class="empty-state"><span>⏳</span><p>Loading event…</p></div>`;
  let eData = null;
  try {
    if (Array.isArray(events) && events.length) {
      eData = events.find(e => String(e.id) === String(id)) || null;
    }
    if (!eData) {
      const myRes = await apiFetch("/events/my");
      if (myRes.ok) {
        const myList = await myRes.json();
        eData = myList.find(e => String(e.id) === String(id)) || null;
      }
    }
    if (!eData) {
      const singleRes = await apiFetch(`/events/${id}`);
      if (singleRes.ok) eData = await singleRes.json();
    }
  } catch (err) { console.error("Event fetch:", err); }

  if (!eData) {
    container.innerHTML = `<div class="card" style="padding:24px;"><b>Event not found.</b><p style="color:var(--muted);margin-top:8px;">It may have been deleted or you lack permission.</p></div>`;
    return;
  }
  try {
    const cRes = await apiFetch(`/registrations/count/${id}`);
    if (cRes.ok) { const cData = await cRes.json(); eData.registered = Number(cData.count || 0); }
  } catch (_) {}

  _edCurrentData = eData;
  if (mode === "edit") renderEventEdit(container, eData, id);
  else                 renderEventView(container, eData, id);
}
function edFormatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}
function edFormatTime(t) {
  if (!t) return "N/A";
  const [h, m] = t.split(":").map(Number);
  return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
}
function edCap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function renderEventView(container, eData, id) {
  const posterBg = { Workshop:"#6c63ff", Seminar:"#ff6584", Hackathon:"#43d9a2", Cultural:"#f4a261", Sports:"#ffd166" };
  const bg       = posterBg[eData.type] || "#6c63ff";
  const bannerImg = eData.poster ? `http://localhost:5000/uploads/${eData.poster}` : null;
  const seatsLeft = Math.max((Number(eData.capacity)||0) - (Number(eData.registered)||0), 0);
  const pct       = Number(eData.capacity) > 0 ? Math.min(100, Math.round((Number(eData.registered||0)/Number(eData.capacity))*100)) : 0;
  const statusCls = { open:"", draft:"draft", closed:"closed" }[eData.status] || "";
  const statusBanners = {
    Pending: `
      <div style="margin-bottom:18px;padding:14px 18px;border-radius:14px;
                  background:var(--amber-light,#fef3c7);border:1px solid rgba(180,83,9,.2);
                  display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">⏳</span>
        <div>
          <div style="font-weight:700;color:#b45309;font-size:14px;">Awaiting Faculty Approval</div>
          <div style="font-size:12.5px;color:#92400e;margin-top:2px;">
            This event has been submitted and is pending review by a faculty coordinator.
            You will be able to publish it once it is approved.
          </div>
        </div>
      </div>`,
    Draft: `
      <div style="margin-bottom:18px;padding:14px 18px;border-radius:14px;
                  background:var(--amber-light,#fef3c7);border:1px solid rgba(180,83,9,.2);
                  display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">⏳</span>
        <div>
          <div style="font-weight:700;color:#b45309;font-size:14px;">Awaiting Faculty Approval</div>
          <div style="font-size:12.5px;color:#92400e;margin-top:2px;">
            This event has been submitted and is pending review by a faculty coordinator.
            You will be able to publish it once it is approved.
          </div>
        </div>
      </div>`,
    Rejected: `
      <div style="margin-bottom:18px;padding:14px 18px;border-radius:14px;
                  background:var(--rose-light,#ffe4e6);border:1px solid rgba(190,18,60,.2);
                  display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">❌</span>
        <div>
          <div style="font-weight:700;color:#be123c;font-size:14px;">Event Rejected</div>
          <div style="font-size:12.5px;color:#9f1239;margin-top:2px;">
            This event was not approved by the faculty coordinator.
            Please edit the event and resubmit for review.
          </div>
        </div>
      </div>`,
    Approved: `
      <div style="margin-bottom:18px;padding:14px 18px;border-radius:14px;
                  background:var(--emerald-light,#d1fae5);border:1px solid rgba(6,95,70,.2);
                  display:flex;align-items:flex-start;gap:12px;">
        <span style="font-size:22px;">✅</span>
        <div style="flex:1;">
          <div style="font-weight:700;color:#065f46;font-size:14px;">Approved by Faculty</div>
          <div style="font-size:12.5px;color:#047857;margin-top:2px;">
            Your event has been approved! Click <strong>Publish Event</strong> to make it
            visible in the student and public portals.
          </div>
        </div>
        <button id="edPublishBtn"
          style="flex-shrink:0;padding:9px 20px;border-radius:10px;border:none;cursor:pointer;
                 background:linear-gradient(135deg,#059669,#047857);color:#fff;
                 font-size:13px;font-weight:700;box-shadow:0 4px 14px rgba(5,150,105,.35);
                 transition:all .2s;white-space:nowrap;"
          onmouseover="this.style.boxShadow='0 6px 20px rgba(5,150,105,.5)'"
          onmouseout="this.style.boxShadow='0 4px 14px rgba(5,150,105,.35)'">
          🌐 Publish Event
        </button>
      </div>`,
    Published: `
      <div style="margin-bottom:18px;padding:14px 18px;border-radius:14px;
                  background:var(--violet-light,#ede9fe);border:1px solid rgba(91,63,248,.2);
                  display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">🌐</span>
        <div>
          <div style="font-weight:700;color:var(--violet,#5b3ff8);font-size:14px;">Published — Live to All Portals</div>
          <div style="font-size:12.5px;color:var(--violet-mid,#7c5cbf);margin-top:2px;">
            This event is now visible to students and in all public portals.
          </div>
        </div>
      </div>`,
  };
  const statusBanner = statusBanners[eData.status] || "";

  container.innerHTML = `
    <div class="ed-banner">
      ${bannerImg
        ? `<img src="${bannerImg}" alt="${eData.title}" />`
        : `<div style="height:100%;background:linear-gradient(135deg,${bg},#ff6584);"></div>`}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
      <div style="display:flex;gap:10px;">
        <button class="btn-ghost" onclick="switchPage('events')" style="font-size:13px;">← Back</button>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn-ghost" id="edShareBtn" style="font-size:13px;">🔗 Share</button>
        <button class="btn-primary" id="edEditBtn" style="font-size:13px;">✏️ Edit</button>
      </div>
    </div>

    ${statusBanner}

    <div class="ed-layout">
      <!-- LEFT: Main card -->
      <div class="ed-main">
        <div class="ed-head">
          <div>
            <div class="ed-title">${eData.title}</div>
            <div class="ed-badges">
              <span class="ed-badge primary">${eData.type || "Event"}</span>
              <span class="ed-badge">${eData.club || "No Club"}</span>
              <span class="ed-badge">${edCap(eData.status)}</span>
              <span class="ed-badge">${eData.registration_fee > 0 ? "₹" + eData.registration_fee : "Free"}</span>
            </div>
            <div class="ed-meta">
              <span><i class="fa fa-calendar"></i>${edFormatDate(eData.date)}</span>
              <span><i class="fa fa-clock"></i>${edFormatTime(eData.time)}</span>
              <span><i class="fa fa-map-marker-alt"></i>${eData.venue || "TBD"}</span>
              <span><i class="fa fa-users"></i>${eData.registered ?? 0} / ${eData.capacity ?? 0} registered</span>
            </div>
          </div>
          <span class="ed-status ${statusCls}">${edCap(eData.status || "Open")}</span>
        </div>

        <div class="ed-tabs">
          <button class="ed-tab active" data-panel="info">Description</button>
          <button class="ed-tab" data-panel="participants">Participants</button>
          <button class="ed-tab" data-panel="report">📋 Report</button>
        </div>

        <div class="ed-panel active" id="edp-info">
          <p class="ed-desc">${eData.description || "No description added."}</p>
        </div>

        <div class="ed-panel" id="edp-participants">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <b style="color:var(--ink);">Registered Participants</b>
            <button class="btn-ghost" id="edDownloadBtn" style="font-size:12px;">⬇️ Download CSV</button>
          </div>
          <div id="edParticipantsWrap"><p class="ed-desc">Click tab to load…</p></div>
        </div>

        <div class="ed-panel" id="edp-report">
          <p class="ed-desc" style="margin-bottom:16px;">Upload a PDF report for this event.</p>
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <input type="file" id="edReportFile" accept=".pdf" style="font-size:13px;color:var(--ink2);background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.15);border-radius:10px;padding:10px;flex:1;min-width:180px;" />
            <button class="btn-primary" id="edUploadReportBtn" style="font-size:13px;white-space:nowrap;">📤 Upload Report</button>
          </div>
          <div id="edReportStatus" style="margin-top:14px;"></div>
        </div>
      </div>

      <!-- RIGHT: Sidebar -->
      <aside class="ed-side">
        <div class="ed-reg-label">Registration</div>
        <div class="ed-reg-row">
          <span>${seatsLeft} seats left</span>
          <span>${eData.registered ?? 0} / ${eData.capacity ?? 0}</span>
        </div>
        <div class="ed-progress"><div class="ed-progress-fill" style="width:${pct}%"></div></div>

        <div class="ed-kpi-grid">
          <div class="ed-kpi">
            <div class="ed-kpi-icon"><i class="fa fa-users"></i></div>
            <div><b>${eData.registered ?? 0}</b><small>Registered</small></div>
          </div>
          <div class="ed-kpi">
            <div class="ed-kpi-icon"><i class="fa fa-chair"></i></div>
            <div><b>${eData.capacity ?? 0}</b><small>Capacity</small></div>
          </div>
        </div>

      </aside>
    </div>`;

  let participantsLoaded = false;
  container.querySelectorAll(".ed-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".ed-tab").forEach(t => t.classList.remove("active"));
      container.querySelectorAll(".ed-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      container.querySelector(`#edp-${btn.dataset.panel}`)?.classList.add("active");
      if (btn.dataset.panel === "participants" && !participantsLoaded) {
        participantsLoaded = true;
        edLoadParticipants(id);
      }
    });
  });

 
  document.getElementById("edEditBtn")?.addEventListener("click", () => openEventDetail(id, "edit"));
  document.getElementById("edShareBtn")?.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?eventId=${id}`;
    try { await navigator.share?.({ title: eData.title, url }); }
    catch { await navigator.clipboard.writeText(url); showToast("🔗 Link copied!"); }
  });
  document.getElementById("edDownloadBtn")?.addEventListener("click", () => edDownloadCSV(id));
  document.getElementById("edUploadReportBtn")?.addEventListener("click", () => edUploadReport(id));
  document.getElementById("edPublishBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("edPublishBtn");
    if (!btn) return;

    const confirmed = confirm(
      `Publish "${eData.title}"?\n\nOnce published, this event will be visible to all students and in other portals. This action cannot be undone.`
    );
    if (!confirmed) return;

    btn.disabled    = true;
    btn.textContent = "Publishing…";

    try {
      const res = await apiFetch(`/events/${id}/publish`, { method: "PUT" });
      if (res.ok) {
        showToast("🌐 Event published! Now visible in all portals.");
        await loadEvents();
        openEventDetail(id); 
      } else {
        const err = await res.json().catch(() => ({}));
        showToast("❌ " + (err.message || "Publish failed."));
        btn.disabled    = false;
        btn.textContent = "🌐 Publish Event";
      }
    } catch {
      showToast("❌ Network error.");
      btn.disabled    = false;
      btn.textContent = "🌐 Publish Event";
    }
  });
}
async function edLoadParticipants(id) {
  const wrap = document.getElementById("edParticipantsWrap");
  if (!wrap) return;
  wrap.innerHTML = `<p class="ed-desc">Loading…</p>`;
  try {
    const res  = await apiFetch(`/registrations/event/${id}`);
    if (!res.ok) { wrap.innerHTML = `<p class="ed-desc">Failed to load participants (${res.status}).</p>`; return; }
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) { wrap.innerHTML = `<p class="ed-desc">No registrations yet.</p>`; return; }
    wrap.innerHTML = `
      <table class="ed-table">
        <thead><tr>
          <th>#</th><th>Name</th><th>Email</th><th>Dept</th><th>Class</th><th>Registered</th>
        </tr></thead>
        <tbody>
          ${data.map((p, i) => `
            <tr>
              <td>${i+1}</td>
              <td>${p.name || p.participant_name || p.student_name || "—"}</td>
              <td>${p.email || p.participant_email || "—"}</td>
              <td>${p.department || p.dept || "—"}</td>
              <td>${p.class || p.class_name || "—"}</td>
              <td>${p.registered_at ? edFormatDate(p.registered_at) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  } catch (err) { console.error("edLoadParticipants error:", err); wrap.innerHTML = `<p class="ed-desc">Failed to load participants.</p>`; }
}

async function edDownloadCSV(id) {
  try {
    const res  = await apiFetch(`/registrations/event/${id}`);
    const data = res.ok ? await res.json() : [];
    if (!data.length) { showToast("No participants to export."); return; }
    const headers = ["#","Name","Email","Phone","Class","Department","Registered At"];
    const rows    = data.map((p, i) => [i+1, p.name||"", p.email||"", p.phone||"", p.class||"", p.department||"", p.registered_at ? edFormatDate(p.registered_at) : ""]);
    const csv     = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a       = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], {type:"text/csv"})),
      download: `participants_event_${id}.csv`
    });
    a.click();
  } catch { showToast("❌ Download failed."); }
}

async function edUploadReport(id) {
  const file = document.getElementById("edReportFile")?.files?.[0];
  const status = document.getElementById("edReportStatus");

  if (!file) { showToast("⚠️ Please select a PDF file."); return; }
  if (file.type !== "application/pdf") { showToast("⚠️ Only PDF files are allowed."); return; }

  const btn = document.getElementById("edUploadReportBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }

  const fd = new FormData();
  fd.append("report", file);

  try {
    const res = await apiFetch(`/events/${id}/report`, { method: "POST", body: fd });
    if (res.ok) {
      showToast("✅ Report uploaded!");
      if (status) status.innerHTML = `<span style="font-size:13px;color:var(--emerald,#10b981);">✅ <b>${file.name}</b> uploaded successfully.</span>`;
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("❌ " + (err.message || "Upload failed."));
    }
  } catch {
    showToast("❌ Network error.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "📤 Upload Report"; }
  }
}


function renderEventEdit(container, eData, id) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
      <button class="btn-ghost" onclick="openEventDetail('${id}')" style="font-size:13px;">← Cancel</button>
      <button class="btn-primary" id="edSaveBtn" style="font-size:13px;">💾 Save Changes</button>
    </div>

    <div class="ed-main">
      <div class="ed-title" style="font-size:22px;margin-bottom:4px;">Edit Event</div>
      <p style="color:var(--muted);font-size:13px;margin-bottom:18px;">Changes are saved directly to the database.</p>

      <div class="ed-form-grid">
        <div class="ed-form-group">
          <label>Title *</label>
          <input id="edf_title" value="${eData.title || ""}" />
        </div>
        <div class="ed-form-group">
          <label>Type</label>
          <select id="edf_type">
            ${["Workshop","Hackathon","Seminar","Bootcamp","Ideathon","Cultural","Other"].map(t =>
              `<option${eData.type === t ? " selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="ed-form-group">
          <label>Venue</label>
          <input id="edf_venue" value="${eData.venue || ""}" />
        </div>
        <div class="ed-form-group">
          <label>Date</label>
          <input id="edf_date" type="date" value="${(eData.date || "").slice(0,10)}" />
        </div>
        <div class="ed-form-group">
          <label>Time</label>
          <input id="edf_time" type="time" value="${eData.time || ""}" />
        </div>
        <div class="ed-form-group">
          <label>Capacity</label>
          <input id="edf_capacity" type="number" min="0" value="${eData.capacity ?? 0}" />
        </div>
        <div class="ed-form-group">
          <label>Registration Fee (₹)</label>
          <input id="edf_fee" type="number" min="0" value="${eData.registration_fee ?? 0}" />
        </div>
      </div>

      <div class="ed-hr"></div>

      <div class="ed-form-group" style="margin-bottom:14px;">
        <label>Description</label>
        <textarea id="edf_desc" rows="5">${eData.description || ""}</textarea>
      </div>

      <div class="ed-form-group">
        <label>Replace Poster (optional)</label>
        <input type="file" id="edf_poster" accept="image/*" style="color:var(--ink2);" />
      </div>
    </div>`;

  document.getElementById("edSaveBtn")?.addEventListener("click", async () => {
    const btn = document.getElementById("edSaveBtn");
    btn.disabled  = true;
    btn.textContent = "Saving…";

    const payload = {
      title:            document.getElementById("edf_title").value.trim(),
      date:             document.getElementById("edf_date").value,
      time:             document.getElementById("edf_time").value,
      venue:            document.getElementById("edf_venue").value.trim(),
      capacity:         document.getElementById("edf_capacity").value,
      registration_fee: document.getElementById("edf_fee").value,
      description:      document.getElementById("edf_desc").value.trim(),
      type:             document.getElementById("edf_type").value,
    };

    try {
      const res = await apiFetch(`/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const posterFile = document.getElementById("edf_poster")?.files?.[0];
        if (posterFile) {
          const fd = new FormData(); fd.append("poster", posterFile);
          await apiFetch(`/events/${id}/poster`, { method:"PUT", body:fd });
        }
        showToast("✅ Event updated!");
        await loadEvents(); 
        openEventDetail(id); 
      } else {
        const err = await res.json().catch(() => ({}));
        showToast("❌ Save failed: " + (err.message || res.status));
        btn.disabled = false;
        btn.textContent = "💾 Save Changes";
      }
    } catch {
      showToast("❌ Network error.");
      btn.disabled = false;
      btn.textContent = "💾 Save Changes";
    }
  });
}
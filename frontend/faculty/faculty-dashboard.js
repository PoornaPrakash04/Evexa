
var API = "http://localhost:5000/api";
window.API = API;

const STATUS = {
  DRAFT:             "draft",
  SUBMITTED:         "submitted",
  FACULTY_APPROVED:  "faculty_approved",
  HALL_APPROVED:     "hall_approved",
  REJECTED:          "rejected",
};
const STATUS_LABEL = {
  draft:            "Draft",
  submitted:        "Pending Faculty",
  faculty_approved: "Pending Hall",
  hall_approved:    "Approved",
  rejected:         "Rejected",
};


function isPendingStatus(status) {
  return ["pending", "review", "submitted", "awaiting", "under review", "new"]
    .includes((status || "").toLowerCase().trim());
}


function isActionableForMe(status) {
  const s = (status || "").toLowerCase().trim();
  if (isFacultyCoordinator()) return s === STATUS.SUBMITTED;
  if (isHallCoordinator)      return s === STATUS.FACULTY_APPROVED;
  return s === STATUS.SUBMITTED;
}


function statusClass(status) {
  const s = (status || "").toLowerCase().trim();
  const map = {
    submitted:        "submitted",
    faculty_approved: "faculty-approved",
    hall_approved:    "approved",
    rejected:         "rejected",
    draft:            "draft",
    // legacy fallbacks
    pending:   "submitted",
    approved:  "approved",
    review:    "submitted",
  };
  return map[s] || s;
}

// Display label for status badge
function statusLabel(status) {
  const s = (status || "").toLowerCase().trim();
  return STATUS_LABEL[s] || cap(status) || "—";
}

// ── AUTH ──────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem("faculty_auth_token");
  if (!token) { window.location.href = "fcsignin.html"; return null; }

  try {
    const base = (typeof API !== "undefined" ? API : window.API) || "http://localhost:5000/api";
    const res = await fetch(`${base}${endpoint}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    if (res.status === 401) {
      localStorage.removeItem("faculty_auth_token");
      window.location.href = "fcsignin.html";
      return null;
    }

    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      console.error(`[apiFetch] ${endpoint} → ${res.status} | body: ${body}`);
      return null;
    }

    // FIX: 204 No Content (DELETE success) has no body — don't call .json()
    if (res.status === 204 || res.headers.get("content-length") === "0") return {};
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return {};

    const data = await res.json();
    console.log(`[apiFetch] ${endpoint} →`, data);
    return data;
  } catch (e) {
    console.error("[apiFetch] network error:", e);
    return null;
  }
}

// ── STATE ─────────────────────────────────────────────────────────────────
let currentPage    = "dashboard";
let calYear        = new Date().getFullYear();
let calMonth       = new Date().getMonth();
let chartsInited   = false;
let feedbackInited = false;
let selectedClubId = "all";

let cachedProfile       = null;
let cachedProposals     = [];
let cachedEvents        = [];
let cachedClubs         = [];
let cachedFeedback      = [];
let cachedRegistrations = [];

// Hall Coordinator state
let cachedHallProposals  = [];
let cachedHallVenues     = [];
let myRoleId             = null;   // set after /me resolves

// Role IDs (mirrors backend ROLE constants)
const FACULTY_ROLE = {
  HOD:                 1,
  STAFF:               2,
  STAFF_ADVISOR:       3,
  FACULTY_COORDINATOR: 4,
  DEAN:                5,
  HALL_COORDINATOR:    6,
};

function isFacultyCoordinator() { return myRoleId === FACULTY_ROLE.FACULTY_COORDINATOR; }

// Hall Coordinator = anyone whose venue list is non-empty.
// We set this flag after loading hall venues.
let isHallCoordinator = false;

let localNotifs = JSON.parse(localStorage.getItem("evexa_faculty_notifs") || "[]");
function saveNotifs() {
  localStorage.setItem("evexa_faculty_notifs", JSON.stringify(localNotifs.slice(0, 50)));
}
function addLocalNotif(type, icon, title, sub, sourceId = null) {
  localNotifs.unshift({
    id: `${Date.now()}-${Math.random()}`,
    sourceId, // 🔥 VERY IMPORTANT
    type,
    icon,
    title,
    sub,
    time: new Date().toISOString(),
    read: false
  });

  saveNotifs();
  updateNotifBadge();
}
// ── BOOT ──────────────────────────────────────────────────────────────────
async function boot() {
  applyTheme();

  document.querySelectorAll(".nav-item[data-page]").forEach(el =>
    el.addEventListener("click", () => navigateTo(el.dataset.page))
  );

  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    const s = document.getElementById("sidebar");
    if (!s) return;
    window.innerWidth <= 768 ? s.classList.toggle("mobile-open") : s.classList.toggle("collapsed");
  });

  document.getElementById("themeToggle")?.addEventListener("click", toggleTheme);
  document.getElementById("notifBtn")?.addEventListener("click", openNotifHistoryPage);
  document.getElementById("notifClearAll")?.addEventListener("click", clearAllNotifs);
  document.getElementById("profileBtn")?.addEventListener("click", openProfileDrawer);
  document.getElementById("miniUser")?.addEventListener("click", openProfileDrawer);
  document.getElementById("closeProfileBtn")?.addEventListener("click", closeProfileDrawer);
  document.getElementById("overlay")?.addEventListener("click", closeProfileDrawer);
  document.getElementById("markAllReadBtn")?.addEventListener("click", markAllNotifsRead);
  document.getElementById("backToDashboardBtn")?.addEventListener("click", () => {
    setSelectedClub("all");
    navigateTo("dashboard");
  });
  document.getElementById("closeDetail")?.addEventListener("click", () => {
    const pd = document.getElementById("proposalDetail");
    if (pd) pd.style.display = "none";
  });
  document.getElementById("postAnnounceBtn")?.addEventListener("click", postAnnouncement);
  
  document.addEventListener("click", e => {
    const wrap = document.getElementById("notifBtn")?.closest(".notif-wrap");
    const dd = document.getElementById("notifDropdown");
    if (dd && !wrap?.contains(e.target)) dd.classList.remove("open");
  });

  document.getElementById("eventListBody")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".event-name-btn");
  if (!btn) return;
  const eventId = btn.dataset.eventId;
  console.log("clicked event id =", eventId);
  openFacultyEventDetailPage(eventId);
});

  initBulk();
  initSearchFilters();
  initCalNav();
  initAllClubsFilters();

  let profile = await apiFetch("/faculty/me");
  if (!profile) profile = await apiFetch("/auth/me");
  if (!profile) return;

  if (!profile.faculty_no && !profile.department && profile.roll_no) {
    localStorage.removeItem("faculty_auth_token");
    showToast("Please log in with your faculty account.", "error");
    setTimeout(() => window.location.href = "fcsignin.html", 1500);
    return;
  }

  cachedProfile = profile;
  myRoleId = profile.role_id ?? null;

  // Primary source of truth for hall coordinator status comes directly from
  // the /me endpoint (which applies role-exclusion rules server-side).
  // The venue-list check in refreshAll() is kept as a secondary confirmation
  // but this flag is set here, before nav injection, so the sidebar is correct
  // from the very first render.
  isHallCoordinator = profile.is_hall_coordinator === true;

  const name = profile.name || "Faculty";
  const initials = name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "FA";
  const department = profile.department || "Faculty Advisor";
  const facultyNo  = profile.faculty_no || "";
  const roleName   = profile.role_name  || "Faculty";

  el("miniName")?.text(name);
  el("miniRole")?.text(facultyNo ? `${facultyNo} · ${roleName}` : roleName);
  el("miniAvatar")?.text(initials);
  el("topAvatar")?.text(initials);
  el("rolePill")?.text(`${roleName} · ${department}`);

  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  el("heroGreeting")?.text(`${greet}, ${name.split(" ")[0]}`);

  // Inject Hall nav items (will show only if this faculty manages venues)
  await injectHallCoordinatorNav();

  await refreshAll();

  currentPage = "dashboard";
  selectedClubId = "all";

  const eventOverlay = document.getElementById("eventDetailOverlay");
  const eventDrawer  = document.getElementById("eventDetailDrawer");
  const proposalDetail = document.getElementById("proposalDetail");

  if (eventOverlay) eventOverlay.style.display = "none";
  if (eventDrawer) {
    eventDrawer.style.display = "none";
    eventDrawer.classList.remove("open");
  }
  if (proposalDetail) proposalDetail.style.display = "none";

  // Restore last visited page, but never land a non-hall-coordinator on a
  // hall-management page (e.g. from a previous session as a different role).
  const HALL_PAGES_BOOT = ["hall-proposals", "hall-venues"];
  let savedPage = localStorage.getItem("facultyCurrentPage") || "dashboard";
  if (HALL_PAGES_BOOT.includes(savedPage) && !isHallCoordinator) {
    savedPage = "dashboard";
    localStorage.setItem("facultyCurrentPage", "dashboard");
  }
  currentPage = savedPage;
  navigateTo(savedPage);

  updateNotifBadge();
  syncNotifs();
}
async function downloadFacultyEventReport(eventId) {
  try {
    const res = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];

    if (!data.length) {
      showToast("No data to export.", "error");
      return;
    }

    const headers = ["Name", "Email", "Department", "Class", "Phone"];
    const rows = data.map(p => [
      p.name || "",
      p.email || "",
      p.department || "",
      p.class || "",
      p.phone_no || p.phone || ""
    ]);

    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `event_report_${eventId}.csv`;
    a.click();

    URL.revokeObjectURL(url);

    showToast("⬇️ Report downloaded!", "success");
  } catch (err) {
    console.error(err);
    showToast("Download failed.", "error");
  }
}
function openNotifHistoryPage(e) {
  if (e) e.stopPropagation();
  if (currentPage === "notif-history") {
    navigateTo("dashboard");
    return;
  }
  localNotifs = localNotifs.map(n => ({ ...n, read: true }));
  saveNotifs();
  updateNotifBadge();
  navigateTo("notif-history");
  renderNotifHistory();
}

async function refreshAll() {
  // Only fetch hall routes if this faculty is a hall coordinator.
  // For all other roles these endpoints return 403 — skip the calls entirely
  // to avoid noisy console errors and unnecessary network requests.
  const hallProposalsPromise = isHallCoordinator
    ? apiFetch("/faculty/hall/proposals").catch(() => null)
    : Promise.resolve(null);
  const hallVenuesPromise = isHallCoordinator
    ? apiFetch("/faculty/hall/venues").catch(() => null)
    : Promise.resolve(null);

  const [proposals, events, clubs, feedback, registrations, hallProposals, hallVenues] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/events/all"),
    apiFetch("/clubs/my-clubs"),
    apiFetch("/faculty/feedback"),
    apiFetch("/faculty/registrations").catch(() => null),
    hallProposalsPromise,
    hallVenuesPromise,
  ]);

  cachedProposals     = Array.isArray(proposals)     ? proposals     : [];
  cachedEvents        = Array.isArray(events)        ? events        : [];
  cachedClubs         = Array.isArray(clubs)         ? clubs         : [];
  cachedFeedback      = Array.isArray(feedback)      ? feedback      : [];
  cachedRegistrations = Array.isArray(registrations) ? registrations : [];
  cachedHallProposals = Array.isArray(hallProposals) ? hallProposals : [];
  cachedHallVenues    = Array.isArray(hallVenues)    ? hallVenues    : [];

  // isHallCoordinator is set authoritatively in boot() from profile.is_hall_coordinator.
  // Here we only keep it true if it was already true AND venues are actually returned.
  // This prevents a stale `true` from persisting if venue assignment is revoked.
  if (isHallCoordinator && cachedHallVenues.length === 0) {
    isHallCoordinator = false;
  }

  console.log("[refreshAll] proposals:", cachedProposals.length);
  console.log("[refreshAll] hall proposals:", cachedHallProposals.length, "| hall venues:", cachedHallVenues.length);

  updateBadges();
  updateHallNavVisibility();
}

// Show / hide Hall Coordinator nav items
function updateHallNavVisibility() {
  const hallSection    = document.getElementById("nav-section-hall");
  const hallProposalNav = document.getElementById("nav-hall-proposals");
  const hallVenueNav   = document.getElementById("nav-hall-venues");
  if (hallSection)      hallSection.style.display     = isHallCoordinator ? "" : "none";
  if (hallProposalNav)  hallProposalNav.style.display  = isHallCoordinator ? "" : "none";
  if (hallVenueNav)     hallVenueNav.style.display     = isHallCoordinator ? "" : "none";
}

// Dynamically inject Hall Coordinator nav items (called once after profile loads)
async function injectHallCoordinatorNav() {
  const navEl = document.querySelector(".nav");
  if (!navEl || document.getElementById("nav-section-hall")) return;

  const section = document.createElement("div");
  section.className   = "section-label";
  section.id          = "nav-section-hall";
  section.style.display = "none";
  section.textContent = "Hall Management";

  const btnProposals = document.createElement("button");
  btnProposals.className    = "nav-item";
  btnProposals.id           = "nav-hall-proposals";
  btnProposals.dataset.page = "hall-proposals";
  btnProposals.dataset.tooltip = "Hall Proposals";
  btnProposals.style.display = "none";
  btnProposals.innerHTML = `
    <span class="icon">🏛️</span>
    <span class="nav-label">Hall Proposals</span>
    <span class="nav-badge orange" id="badge-hall-proposals">–</span>`;
  btnProposals.addEventListener("click", () => navigateTo("hall-proposals"));

  const btnVenues = document.createElement("button");
  btnVenues.className    = "nav-item";
  btnVenues.id           = "nav-hall-venues";
  btnVenues.dataset.page = "hall-venues";
  btnVenues.dataset.tooltip = "My Venues";
  btnVenues.style.display = "none";
  btnVenues.innerHTML = `<span class="icon">🏟️</span><span class="nav-label">My Venues</span>`;
  btnVenues.addEventListener("click", () => navigateTo("hall-venues"));

  const clubsLabel = [...navEl.querySelectorAll(".section-label")]
    .find(el2 => el2.textContent.includes("Clubs"));

  if (clubsLabel) {
    navEl.insertBefore(section, clubsLabel);
    navEl.insertBefore(btnProposals, clubsLabel);
    navEl.insertBefore(btnVenues, clubsLabel);
  } else {
    navEl.appendChild(section);
    navEl.appendChild(btnProposals);
    navEl.appendChild(btnVenues);
  }
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
const PAGE_META = {
  "dashboard":        ["Dashboard",                 "Welcome back — here's your faculty overview."],
  "proposals":        ["Event Proposal Review",     "Review, approve or reject submitted proposals."],
  "event-list":       ["All Events",                "Complete event list across your clubs."],
  "pending":          ["Pending Queue",             "All items requiring your immediate action."],
  "all-clubs":        ["All Clubs",                 "Browse all clubs and their events."],
  "clubs":            ["Club & Academic Oversight", "Your incharge clubs and their activity."],
  "analytics":        ["Reports & Analytics",       "Events, participation, and academic statistics."],
  "feedback":         ["Feedback & Reports",        "Student feedback ratings and comments."],
  "announcements":    ["Announcements",             "Post and manage club announcements."],
  "notif-history":    ["Notification History",      "All alerts and system updates."],
  "venues":           ["Venues & Availability",     "Check venue availability by date."],
  "account-settings": ["Account Settings",          "Update your faculty profile and password."],
  "hall-proposals":   ["Hall Proposals",            "Forwarded proposals awaiting your venue confirmation."],
  "hall-venues":      ["My Venues",                 "Manage availability for venues under your coordination."],
};

async function navigateTo(page) {
  // ── Hall-Management access guard ──────────────────────────────────────────
  // Only faculty who are assigned as a hall coordinator (i.e. they manage at
  // least one venue) may visit the hall-proposals / hall-venues pages.
  // Any other role that somehow reaches these pages is silently redirected to
  // the dashboard so the restriction is enforced on the client side too.
  const HALL_PAGES = ["hall-proposals", "hall-venues"];
  if (HALL_PAGES.includes(page) && !isHallCoordinator) {
    console.warn(`[navigateTo] Access denied to "${page}" — not a hall coordinator. Redirecting to dashboard.`);
    page = "dashboard";
  }

  // Redirect unassigned faculty away from analytics (they have no data to see).
  if (page === "analytics" && !cachedClubs.length) {
    console.warn(`[navigateTo] Redirecting to dashboard — faculty has no club assignments.`);
    page = "dashboard";
  }

  localStorage.setItem("facultyCurrentPage", page);

  document.querySelectorAll("[id^='pg-']").forEach(e => e.style.display = "none");

  const pg = document.getElementById("pg-" + page);
  if (pg) pg.style.display = "";

  document.querySelectorAll(".nav-item").forEach(e =>
    e.classList.toggle("active", e.dataset.page === page)
  );

  currentPage = page;

  const backBtn = document.getElementById("backBtn");
if (backBtn) {
  const hideBackPages = ["dashboard", "notif-history", "event-detail"];
  backBtn.style.display = hideBackPages.includes(page) ? "none" : "inline-flex";
}

  const [t, s] = PAGE_META[page] || ["", ""];
  const selectedClub = getSelectedClub();
  const clubLabel = selectedClub ? (selectedClub.club_name || selectedClub.name || "Club") : "";

  if (selectedClub && (page === "proposals" || page === "analytics" || page === "event-list" || page === "pending")) {
    el("pageTitle")?.text(`${t} — ${clubLabel}`);
    el("pageSub")?.text(
      page === "proposals" ? `Viewing proposals for ${clubLabel}.` :
      page === "analytics" ? `Viewing analytics for ${clubLabel}.` :
      page === "event-list" ? `Viewing events for ${clubLabel}.` :
      `Viewing pending items for ${clubLabel}.`
    );
  } else {
    el("pageTitle")?.text(t);
    el("pageSub")?.text(s);
  }

  const renders = {
    "dashboard":      renderDashboard,
    "proposals":      renderProposals,
    "event-list":     () => { renderEventList(); },
    "venues":         () => loadVenues(),
    "pending":        renderPendingPage,
    "all-clubs":      renderAllClubs,
    "clubs":          renderClubs,
    "announcements":  renderAnnouncements,
    "notif-history":  renderNotifHistory,
    "feedback":       renderFeedback,
    "hall-proposals": renderHallProposals,
    "hall-venues":    renderHallVenues,
    "account-settings": () => { initAccountSettings(); asLoadProfile(); },
    "analytics": async () => {
      chartsInited = false;
      await refreshAll();
      setTimeout(initCharts, 60);
    },
  };

  // Await the render so async pages (proposals, events, hall pages, etc.)
  // finish fetching before the browser paints — fixes blank-on-first-load.
  await renders[page]?.();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
async function renderDashboard() {
  // If the cache is empty (first load before refreshAll resolves), fetch now.
  if (!cachedEvents.length && !cachedProposals.length) await refreshAll();

  // Faculty Coordinator sees submitted proposals; Hall Coordinator sees faculty_approved ones
  const pending = cachedProposals.filter(p => isActionableForMe(p.status));
  const now = new Date();

  const activeEv = cachedEvents.filter(e => {
    const dt = parseEventDate(e.date || e.event_date || e.start_date);
    return dt && dt >= now;
  });

  // For Faculty Coordinators the hero shows proposals pending their review;
  // for Hall Coordinators it also adds forwarded proposals awaiting their action.
  const totalPending = pending.length + (isHallCoordinator ? cachedHallProposals.length : 0);

  el("heroPending")?.text(totalPending);
  el("heroClubs")?.text(cachedClubs.length);
  el("heroEvents")?.text(activeEv.length);
  el("heroStudents")?.text(0);

  // Show/hide hall quick card on dashboard
  renderHallQuickCard();

  renderDashboardCalendar();
  renderClubsQuick();
}

function renderHallQuickCard() {
  // Remove existing if present
  document.getElementById("dashHallCard")?.remove();
  if (!isHallCoordinator || !cachedHallProposals.length) return;

  const heroStrip = document.getElementById("heroStrip");
  if (!heroStrip) return;

  const card = document.createElement("div");
  card.id = "dashHallCard";
  card.style.cssText = `
    margin-top:14px;padding:14px 18px;border-radius:14px;
    background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.3);
    display:flex;align-items:center;gap:14px;cursor:pointer;
  `;
  card.innerHTML = `
    <div style="font-size:26px;">🏛️</div>
    <div style="flex:1;">
      <div style="font-size:14px;font-weight:800;color:#67e8f9;">
        ${cachedHallProposals.length} Hall Proposal${cachedHallProposals.length > 1 ? 's' : ''} Awaiting Venue Confirmation
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-top:2px;">
        These have been forwarded by the Faculty Coordinator — click to review.
      </div>
    </div>
    <div style="font-size:12px;font-weight:700;color:#67e8f9;">View →</div>
  `;
  card.addEventListener("click", () => navigateTo("hall-proposals"));
  heroStrip.insertAdjacentElement("afterend", card);
}

function renderDashboardCalendar() {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  el("dashCalMonthLabel")?.text(`${MONTHS[calMonth]} ${calYear}`);

  const calEl = document.getElementById("dashMiniCalendar");
  if (!calEl) return;

  const today = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const total = new Date(calYear, calMonth + 1, 0).getDate();

  const dayMap = {};
  // Combine all sources: approved/published events + submitted proposals + hall proposals
  const allCalEvents = [...cachedEvents, ...cachedProposals, ...cachedHallProposals];
  // Deduplicate by id so the same event in multiple lists shows only once
  const seen = new Set();
  allCalEvents.forEach(e => {
    if (!e || seen.has(e.id)) return;
    seen.add(e.id);
    const dt = parseEventDate(e.date || e.event_date || e.start_date);
    if (!dt) return;
    if (dt.getFullYear() === calYear && dt.getMonth() === calMonth) {
      const day = dt.getDate();
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(e);
    }
  });

  const days = ["SU","MO","TU","WE","TH","FR","SA"];
  let html = `<div class="cal-weekdays">${days.map(d => `<div class="cal-weekday">${d}</div>`).join("")}</div><div class="cal-days">`;

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= total; d++) {
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const evs = dayMap[d] || [];
    const hasPend  = evs.some(e => (e.status || "").toLowerCase().trim() === STATUS.SUBMITTED);
    const hasAppr  = evs.some(e => (e.status || "").toLowerCase().trim() === STATUS.HALL_APPROVED || (e.status || "").toLowerCase() === "approved");
    const hasAny   = evs.length > 0;

    // Priority: pending (orange) > approved (green) > any other status (muted dot)
    const dayClass = hasPend ? "has-pending" : hasAppr ? "has-approved" : hasAny ? "has-event" : "";
    const cls = ["cal-day", isToday ? "today" : "", dayClass].filter(Boolean).join(" ");
    const enc = evs.length ? encodeURIComponent(JSON.stringify(evs)) : "";

    html += `<div class="${cls}" onclick="dashCalDayClick(this, ${d})" data-events="${enc.replace(/"/g, "&quot;")}">${d}</div>`;
  }

  html += `</div>`;
  calEl.innerHTML = html;
}

function dashCalDayClick(el2, day) {
  const det = document.getElementById("dashCalEventDetail");
  const panel = document.getElementById("dashSelectedDatePanel");
  const tbody = document.getElementById("dashSelectedDateBody");

  if (!det || !panel || !tbody) return;

  if (el2.classList.contains("selected")) {
    el2.classList.remove("selected");
    det.style.display = "none";
    panel.style.display = "none";
    return;
  }

  document.querySelectorAll("#dashMiniCalendar .cal-day.selected").forEach(d => d.classList.remove("selected"));
  el2.classList.add("selected");

  const raw = el2.getAttribute("data-events")?.replace(/&quot;/g, '"');
  if (!raw) {
    det.style.display = "none";
    panel.style.display = "none";
    return;
  }

  const evs = JSON.parse(decodeURIComponent(raw));

  el("dashCalDetailTitle")?.text(`${evs.length} event${evs.length > 1 ? "s" : ""} on ${fmtDate(new Date(calYear, calMonth, day))}`);
  el("dashCalDetailMeta")?.text(evs.map(e => `${e.title} · ${e.club || e.organizer || "—"}`).join(" | "));

  const actions = document.getElementById("dashCalDetailActions");
  if (actions) {
    actions.innerHTML = evs.map(e => `<button class="mini-btn" onclick="navigateTo('event-list')">📅 ${e.title}</button>`).join("");
  }

  det.style.display = "";
  el("dashSelectedDateSub")?.text(`Showing ${evs.length} event${evs.length > 1 ? "s" : ""} on ${fmtDate(new Date(calYear, calMonth, day))}`);

  tbody.innerHTML = evs.map(e => `
    <tr>
      <td><span class="ev-name">${e.title || "Untitled"}</span></td>
      <td>${e.club || "—"}</td>
      <td>${e.organizer || e.created_by || "—"}</td>
      <td>${e.capacity || e.expected_participants || "—"}</td>
      <td>${e.venue || "—"}</td>
      <td><span class="badge ${e.status || "approved"}">${cap(e.status || "approved")}</span></td>
    </tr>
  `).join("");

  panel.style.display = "";
}
async function loadFacultyParticipants(eventId) {
  const wrap = document.getElementById("facultyParticipantsWrap");
  if (!wrap) return;

  wrap.innerHTML = "Loading participants...";

  try {
    const res = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];

    if (!data.length) {
      wrap.innerHTML = "<p>No participants found.</p>";
      return;
    }

    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Dept</th>
            <th>Class</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${p.name || "-"}</td>
              <td>${p.email || "-"}</td>
              <td>${p.department || "-"}</td>
              <td>${p.class || "-"}</td>
              <td>${p.phone_no || p.phone || "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    console.error(err);
    wrap.innerHTML = "Failed to load participants.";
  }
}
async function loadAnnouncementBoard() {
  const ab = document.getElementById("dashAnnouncements");
  if (!ab) return;

  if (!cachedClubs.length) {
    ab.innerHTML = `<div class="list-empty">No club assigned — announcements unavailable.</div>`;
    return;
  }

  const [ann, mine] = await Promise.all([
    apiFetch("/announcements/faculty"),
    apiFetch("/announcements/my-posts"),
  ]);

  const myIds = new Set((Array.isArray(mine) ? mine : []).map(a => a.id));
  const filtered = (Array.isArray(ann) ? ann : []).filter(a => !myIds.has(a.id));

  if (!filtered.length) {
    ab.innerHTML = `<div class="list-empty">No announcements.</div>`;
    return;
  }

  const ICONS = { Urgent: "🚨", Event: "📅", Info: "ℹ️", General: "📣" };
  ab.innerHTML = filtered.slice(0, 3).map(a => `
    <div class="announce-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div class="announce-title">${ICONS[a.type] || "📣"} ${a.title}</div>
        <span class="badge purple" style="flex-shrink:0;">${a.type || "General"}</span>
      </div>
      <div class="announce-meta">${a.club || "Admin"} · ${fmtDate(a.created_at)}</div>
      <div class="announce-body">${a.message}</div>
    </div>
  `).join("");
}

function renderClubsQuick() {
  const g = document.getElementById("dashClubsGrid");
  if (!g) return;

  if (!cachedClubs.length) {
    g.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs assigned yet.</div>`;
    return;
  }

  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵"];

  g.innerHTML = cachedClubs.map((c, i) => {
    const clubName = c.club_name || c.name || "Club";
    const clubId = c.id || c.club_id;
    const evCount = cachedEvents.filter(e =>
      String(e.club_id ?? e.clubId ?? "") === String(clubId) ||
      String(e.club ?? e.club_name ?? "").trim().toLowerCase() === clubName.trim().toLowerCase()
    ).length;

    return `
      <div class="club-quick-card" onclick="navigateTo('clubs')">
        <div class="club-quick-emoji">${c.logo || emojis[i % emojis.length]}</div>
        <div class="club-quick-info">
          <div class="club-quick-name">${clubName}</div>
          <div class="club-quick-meta">${c.member_count || 0} members · ${evCount} events</div>
        </div>
        <span class="club-quick-badge">${c.status || "Active"}</span>
      </div>
    `;
  }).join("");
}

// ── PROPOSALS ─────────────────────────────────────────────────────────────
async function renderProposals(filter = "all", search = "", category = "all") {
  // Show Faculty Coordinator info banner if applicable
  const fcBanner = document.getElementById("fcCoordinatorBanner");
  if (fcBanner) fcBanner.style.display = isFacultyCoordinator() ? "" : "none";

  const tbody = document.getElementById("proposalsBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="td-empty">Loading proposals…</td></tr>`;

  const [freshProposals, freshEvents] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/events/all"),
  ]);

  if (Array.isArray(freshProposals)) cachedProposals = freshProposals;
  if (Array.isArray(freshEvents))    cachedEvents    = freshEvents;

  // ── STATE-BASED FILTERING ─────────────────────────────────────────────
  // Faculty Coordinator: only sees `submitted` proposals
  // Hall Coordinator:    only sees `faculty_approved` proposals (via hall page)
  // Generic faculty:     sees `submitted`
  // NOTE: Hall coordinators should use the dedicated "Hall Proposals" page.
  //       This proposals page is for Faculty Coordinator / generic faculty only.
  const targetStatus = STATUS.SUBMITTED; // Faculty page always shows submitted

  const proposalItems = (Array.isArray(cachedProposals) ? cachedProposals : []).map(p => ({
    ...p,
    _src: "proposal",
    _key: `proposal-${p.id}`,
  }));

  const myClubIds = new Set(cachedClubs.map(c => String(c.id ?? c.club_id ?? "")));

  const submittedEventItems = (Array.isArray(cachedEvents) ? cachedEvents : [])
    .filter(e => {
      const s = (e.status || "").toLowerCase().trim();
      if (s !== STATUS.SUBMITTED) return false;
      const eid = String(e.club_id ?? e.clubId ?? "");
      if (eid && myClubIds.has(eid)) return true;
      return cachedClubs.some(c => eventMatchesClub(e, c));
    })
    .map(e => ({
      ...e,
      _src: "event",
      _key: `event-${e.id}`,
      organizer: e.organizer || e.created_by || "—",
    }));

  console.log("👉 ALL EVENTS:", cachedEvents.map(e => ({ id: e.id, title: e.title, status: e.status })));

  const seen = new Set();
  const merged = [];
  [...proposalItems, ...submittedEventItems].forEach(item => {
    if (seen.has(item._key)) return;
    seen.add(item._key);
    merged.push(item);
  });

  // Faculty coordinator / generic faculty: show only `submitted`
  let list = merged.filter(p => {
    const s = (p.status || "").toLowerCase().trim();
    return s === STATUS.SUBMITTED;
  });

  if (selectedClubId !== "all") list = list.filter(matchesSelectedClub);

  if (category !== "all") list = list.filter(p =>
    (p.category || p.type || "").toLowerCase() === category.toLowerCase()
  );

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p =>
      (p.title || p.name || "").toLowerCase().includes(q) ||
      (p.club || p.organizer || "").toLowerCase().includes(q)
    );
  }

  window.currentProposalList = list;

  console.log("📋 cachedProposals raw statuses:", cachedProposals.map(p => p.status));
  console.log("📋 submittedEventItems:", submittedEventItems.length);
  console.log("📋 final list after filter:", list.length, list.map(p => ({ id: p.id, title: p.title, status: p.status })));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="td-empty">No proposals pending faculty review.
      <br><small style="opacity:.6;">Only <strong>submitted</strong> proposals appear here.</small>
    </td></tr>`;
    updateBadges();
    return;
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><span class="ev-name" onclick="showProposalDetail('${p._key}')">${p.title || p.name || "Untitled"}</span></td>
      <td>${p.club || p.organizer || "—"}</td>
      <td>${fmtDate(p.date || p.event_date || p.start_date)}</td>
      <td><span class="tag">${p.category || p.type || "General"}</span></td>
      <td>${p.capacity || p.expected_participants || "—"}</td>
      <td>
        <span class="badge ${statusClass(p.status)}" title="${p.remark || ""}">${statusLabel(p.status)}</span>
        ${p.remark ? `<div style="font-size:10px;color:var(--text-3);margin-top:3px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.remark}">💬 ${p.remark}</div>` : ""}
      </td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="mini-btn approve" onclick="approveProposal(${p.id}, '${p._src}')" title="${isFacultyCoordinator() ? 'Forward to Hall Coordinator' : 'Approve as Faculty'}">
            ${isFacultyCoordinator() ? '📨' : '✅'}
          </button>
          <button class="mini-btn reject"  onclick="rejectProposal(${p.id}, '${p._src}')">❌</button>
          <button class="mini-btn"         onclick="showProposalDetail('${p._key}')">👁</button>
        </div>
      </td>
    </tr>
  `).join("");

  updateBadges();
}

// ── PROPOSAL DETAIL ───────────────────────────────────────────────────────
function showProposalDetail(key) {
  const p = (window.currentProposalList || []).find(x => x._key === key);
  if (!p) { console.warn("Proposal not found for key:", key); return; }

  el("detailName")?.text(p.title || p.name || "Event Details");

  // Make the detail panel visible
  const panel = document.getElementById("proposalDetail");
  if (panel) {
    panel.style.display = "";
    setTimeout(() => panel.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // Faculty coordinator sees `submitted` proposals → can approve (→ faculty_approved) or reject
  // Guard: faculty coordinator cannot re-approve already faculty_approved proposals
  const s = (p.status || "").toLowerCase().trim();
  const canFacultyAct  = isFacultyCoordinator() && s === STATUS.SUBMITTED;
  const canGenericAct  = !isFacultyCoordinator() && !isHallCoordinator && s === STATUS.SUBMITTED;
  const isActionable   = canFacultyAct || canGenericAct;

  // Timeline steps
  const steps = [
    { key: "submitted",        label: "Submitted",       icon: "📝" },
    { key: "faculty_approved", label: "Faculty Review",  icon: "👩‍🏫" },
    { key: "hall_approved",    label: "Hall Approved",   icon: "🏛️" },
  ];
  const statusOrder = ["submitted", "faculty_approved", "hall_approved"];
  const currentIdx  = statusOrder.indexOf(s);
  const isRejected  = s === STATUS.REJECTED;

  const timelineHtml = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:18px;flex-wrap:wrap;">
      ${steps.map((step, i) => {
        let state = "future";
        if (isRejected) state = i <= currentIdx ? "done" : "future";
        else if (i < currentIdx) state = "done";
        else if (i === currentIdx) state = "active";

        const colors = {
          done:   { bg: "rgba(16,185,129,.18)", border: "rgba(16,185,129,.4)", text: "#34d399" },
          active: { bg: "rgba(6,182,212,.18)",  border: "rgba(6,182,212,.5)",  text: "#67e8f9" },
          future: { bg: "rgba(255,255,255,.05)", border: "rgba(255,255,255,.1)", text: "var(--text-3)" },
        }[state];

        return `
          ${i > 0 ? `<div style="flex:1;height:2px;background:${i <= currentIdx && !isRejected ? "rgba(16,185,129,.4)" : "rgba(255,255,255,.1)"};min-width:20px;border-radius:2px;"></div>` : ""}
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="padding:6px 12px;border-radius:20px;border:1px solid ${colors.border};background:${colors.bg};
              font-size:11px;font-weight:700;color:${colors.text};white-space:nowrap;">
              ${step.icon} ${step.label}
            </div>
          </div>
        `;
      }).join("")}
      ${isRejected ? `<div style="flex:1;height:2px;background:rgba(239,68,68,.4);min-width:20px;border-radius:2px;"></div>
        <div style="padding:6px 12px;border-radius:20px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.1);
          font-size:11px;font-weight:700;color:#f87171;white-space:nowrap;">❌ Rejected</div>` : ""}
    </div>
  `;

  const body = document.getElementById("detailBody");
  if (body) {
    body.innerHTML = `
      ${timelineHtml}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div class="detail-section">
            <div class="detail-section-title">Event Info</div>
            <div class="detail-grid">
              <div class="detail-cell"><div class="detail-label">Club / Organizer</div><div class="detail-val">${p.club || p.organizer || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Category</div><div class="detail-val">${p.category || p.type || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Date</div><div class="detail-val">${fmtDate(p.date || p.event_date)}</div></div>
              <div class="detail-cell"><div class="detail-label">Time</div><div class="detail-val">${formatTime(p.time || p.start_time)}</div></div>
              <div class="detail-cell"><div class="detail-label">Venue</div><div class="detail-val">${p.venue || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Expected Participants</div><div class="detail-val">${p.capacity || p.expected_participants || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Registration Fee</div><div class="detail-val">${p.registration_fee > 0 ? "₹" + p.registration_fee : "Free"}</div></div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Status</div>
            <span class="badge ${statusClass(p.status)}">${statusLabel(p.status)}</span>
            <span style="font-size:11px;color:var(--text-3);margin-left:8px;">(source: ${p._src})</span>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Remarks</div>
            ${isActionable ? `
              <textarea id="proposalRemark" rows="3"
                placeholder="Add a remark before approving or rejecting (optional)…"
                style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font);resize:vertical;outline:none;margin-bottom:10px;box-sizing:border-box;"
              >${p.remark || ""}</textarea>
              <div style="display:flex;gap:8px;">
                <button class="mini-btn approve" style="flex:1;justify-content:center;" onclick="approveProposalWithRemark(${p.id}, '${p._src}')">
                  ${isFacultyCoordinator() ? '📨 Forward to Hall' : '✅ Approve'}
                </button>
                <button class="mini-btn reject" style="flex:1;justify-content:center;" onclick="rejectProposalWithRemark(${p.id}, '${p._src}')">❌ Reject</button>
              </div>
            ` : `
              <div style="padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;line-height:1.6;">
                ${p.remark || "<span style='opacity:0.45;font-style:italic;'>No remark added.</span>"}
              </div>
            `}
          </div>

          ${p.document_url ? `
          <div class="detail-section">
            <div class="detail-section-title">Document Uploaded</div>
            <a href="${p.document_url}" target="_blank" class="mini-btn" style="display:inline-flex;">📎 View Document</a>
          </div>` : ""}
        </div>

        <div>
          <div class="detail-section">
            <div class="detail-section-title">Description</div>
            <div class="detail-desc">${p.description || "No description provided."}</div>
          </div>
        </div>
      </div>
    `;
  }
}

function formatTime(t) {
  if (!t) return "—";
  if (typeof t === "string" && t.includes(":")) {
    const [h, m] = t.split(":");
    const hour = +h;
    const ampm = hour >= 12 ? "PM" : "AM";
    const hr12 = hour % 12 || 12;
    return `${hr12}:${m} ${ampm}`;
  }
  const d = new Date(t);
  if (!isNaN(d)) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return t;
}

// ── APPROVE / REJECT ──────────────────────────────────────────────────────
function resolveApproveEndpoint(id, src) {
  return src === "event" ? `/events/${id}/approve` : `/faculty/proposals/${id}/approve`;
}
function resolveRejectEndpoint(id, src) {
  return src === "event" ? `/events/${id}/reject` : `/faculty/proposals/${id}/reject`;
}

async function approveProposal(id, src = "proposal") {
  // Guard: Faculty Coordinator can only approve `submitted` proposals
  const p = (window.currentProposalList || []).find(x => x.id === id && x._src === src);
  if (p && isFacultyCoordinator() && (p.status || "").toLowerCase() !== STATUS.SUBMITTED) {
    showToast("⚠️ This proposal is not in a state you can approve.", "error");
    return;
  }

  const res = await apiFetch(resolveApproveEndpoint(id, src), { method: "PATCH" });
  if (res !== null) {
    if (p) p.status = STATUS.FACULTY_APPROVED;
    const title = p?.title || "Event";
    if (isFacultyCoordinator()) {
      addLocalNotif("event", "📨", "Forwarded to Hall Coordinator", `"${title}" has been sent for venue confirmation.`, id);
    } else {
      addLocalNotif("event", "✅", "Proposal Approved", `"${title}" has been approved.`, id);
    }
    renderProposals();
    showToast(isFacultyCoordinator() ? "📨 Forwarded to Hall Coordinator!" : "✅ Proposal approved!", "success");
  } else {
    showToast("Failed to approve.", "error");
  }
}

async function rejectProposal(id, src = "proposal") {
  const res = await apiFetch(resolveRejectEndpoint(id, src), { method: "PATCH" });
  if (res !== null) {
    const p = (window.currentProposalList || []).find(x => x.id === id && x._src === src);
    if (p) p.status = STATUS.REJECTED;
    addLocalNotif("event", "❌", "Proposal Rejected", `"${p?.title || "Event"}" has been rejected.`, id);
    renderProposals();
    showToast("❌ Proposal rejected.", "error");
  } else {
    showToast("Failed to reject.", "error");
  }
}

async function approveProposalWithRemark(id, src = "proposal") {
  const remark = document.getElementById("proposalRemark")?.value.trim() || "";
  const p = (window.currentProposalList || []).find(x => x.id === id && x._src === src);

  // Guard: must be `submitted` to be approved by faculty
  if (p && isFacultyCoordinator() && (p.status || "").toLowerCase() !== STATUS.SUBMITTED) {
    showToast("⚠️ This proposal cannot be approved at this stage.", "error");
    return;
  }

  const res = await apiFetch(resolveApproveEndpoint(id, src), {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    if (p) { p.status = STATUS.FACULTY_APPROVED; p.remark = remark; }
    const title = p?.title || "Event";
    if (isFacultyCoordinator()) {
      addLocalNotif("event", "📨", "Forwarded to Hall Coordinator", `"${title}" sent for venue confirmation.`, id);
    } else {
      addLocalNotif("event", "✅", "Proposal Approved", `"${title}" has been approved.`, id);
    }
    document.getElementById("proposalDetail").style.display = "none";
    renderProposals();
    showToast(isFacultyCoordinator() ? "📨 Forwarded to Hall Coordinator!" : "✅ Proposal approved!", "success");
  } else {
    showToast("Failed to approve.", "error");
  }
}

async function rejectProposalWithRemark(id, src = "proposal") {
  const remark = document.getElementById("proposalRemark")?.value.trim();
  if (!remark) {
    showToast("Please add a remark before rejecting.", "error");
    document.getElementById("proposalRemark")?.focus();
    return;
  }
  const res = await apiFetch(resolveRejectEndpoint(id, src), {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = (window.currentProposalList || []).find(x => x.id === id && x._src === src);
    if (p) { p.status = STATUS.REJECTED; p.remark = remark; }
    addLocalNotif("event", "❌", "Proposal Rejected", `"${p?.title || "Event"}" has been rejected.`, id);
    document.getElementById("proposalDetail").style.display = "none";
    renderProposals();
    showToast("❌ Proposal rejected.", "error");
  } else {
    showToast("Failed to reject.", "error");
  }
}

async function quickApprove(id, src) { await approveProposal(id, src); renderDashboard(); }
async function quickReject(id, src)  { await rejectProposal(id, src);  renderDashboard(); }

// ── EVENT LIST ────────────────────────────────────────────────────────────
async function renderEventList(search = "", status = "all") {
  const fresh = await apiFetch("/events/all");
  cachedEvents = Array.isArray(fresh) ? fresh : [];

  const tbody = document.getElementById("eventListBody");
  if (!tbody) return;

  let list = [...cachedEvents];

  if (status !== "all") {
    list = list.filter(e => (e.status || "").toLowerCase().trim() === status.toLowerCase());
  }

  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(e =>
      String(e.title || "").toLowerCase().includes(q) ||
      String(e.club || "").toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => {
    const da = parseEventDate(a.date || a.event_date || a.start_date);
    const db = parseEventDate(b.date || b.event_date || b.start_date);
    return (db || 0) - (da || 0);
  });

  window.currentEventList = list;

  tbody.innerHTML = list.length
    ? list.map(e => `
      <tr>
        <td>
          <button type="button" class="event-name-btn" data-event-id="${e.id}">
            ${e.title || "Untitled"} <span class="ev-link-icon">↗</span>
          </button>
        </td>
        <td>${e.club || e.organizer || "—"}</td>
        <td>${fmtDate(e.date || e.event_date || e.start_date)}</td>
        <td>${e.venue || "—"}</td>
        <td><span class="tag">${e.category || e.type || "General"}</span></td>
        <td>${e.capacity || "—"}</td>
        <td>${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</td>
        <td>
          <button
            type="button"
            class="mini-btn"
            onclick="downloadParticipants(${e.id}); event.stopPropagation();"
          >⬇️ Download</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="td-empty">No events found.</td></tr>`;
}
async function openFacultyEventDetailPage(eventId) {
  navigateTo("event-detail");

  const body = document.getElementById("facultyEventDetailBody");
  if (!body) return;

  body.innerHTML = `<div class="list-empty" style="padding:24px;">Loading event details…</div>`;

  try {
    if (!Array.isArray(cachedEvents) || !cachedEvents.length) {
      const evs = await apiFetch("/events/all");
      cachedEvents = Array.isArray(evs) ? evs : [];
    }

    if (!Array.isArray(cachedProposals) || !cachedProposals.length) {
      const props = await apiFetch("/faculty/proposals");
      cachedProposals = Array.isArray(props) ? props : [];
    }

    let ev = cachedEvents.find(e => String(e.id) === String(eventId));

    if (!ev) {
      const one = await apiFetch(`/events/${eventId}`);
      if (one) ev = one;
    }

    if (!ev) {
      body.innerHTML = `<div class="list-empty" style="padding:24px;">Event not found.</div>`;
      return;
    }

    const proposal = cachedProposals.find(p =>
      String(p.id) === String(ev.proposal_id) ||
      String(p.event_id) === String(eventId) ||
      String((p.title || "").trim().toLowerCase()) === String((ev.title || "").trim().toLowerCase())
    );

    const data = { ...ev, ...(proposal || {}) };

    // registration count fallback
    let registered = Number(data.registered_count || data.registered || 0);
    try {
      const countRes = await apiFetch(`/faculty/registrations/count/${eventId}`);
      if (countRes && typeof countRes.count !== "undefined") {
        registered = Number(countRes.count || 0);
      }
    } catch (_) {}

    const capacity  = Number(data.capacity || data.expected_participants || 0);
    const seatsLeft = Math.max(0, capacity - registered);
    const pct       = capacity > 0 ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;

    const posterUrl = data.poster || data.posterUrl
      ? `http://localhost:5000/uploads/${data.poster || data.posterUrl}`
      : "";

    body.innerHTML = `
      <div class="fed-page">

        <div class="fed-hero">
          ${
            posterUrl
              ? `<img src="${posterUrl}" alt="${data.title || "Event"}" class="fed-poster"
                     onerror="this.outerHTML='<div class=&quot;fed-poster fed-poster-fallback&quot;>📅</div>';">`
              : `<div class="fed-poster fed-poster-fallback">📅</div>`
          }

          <div class="fed-hero-content">
            <div class="fed-top-row">
              <div>
                <h1 class="fed-title">${data.title || "Untitled Event"}</h1>
                <div class="fed-sub">
                  ${(data.club || data.organizer || "—")} · ${fmtDate(data.date || data.event_date || data.start_date)}
                </div>
              </div>

              <div class="fed-actions">
                <button class="btn-primary" onclick="downloadFacultyEventReport(${data.id})">⬇ Download Report</button>
              </div>
            </div>

            <div class="fed-badges">
              <span class="badge">${cap(data.status || "approved")}</span>
              <span class="badge">${data.category || data.type || "General"}</span>
              <span class="badge">${data.registration_fee > 0 ? "₹" + data.registration_fee : "Free"}</span>
            </div>
          </div>
        </div>

        <div class="fed-grid">
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Event Overview</div></div>
            <div class="panel-body">
              <div class="fed-desc">${data.description || data.details || "No description available."}</div>

              <div class="fed-info-grid">
                <div class="fed-info-card"><b>Date</b><span>${fmtDate(data.date || data.event_date || data.start_date)}</span></div>
                <div class="fed-info-card"><b>Time</b><span>${formatTime(data.time || data.start_time)}</span></div>
                <div class="fed-info-card"><b>Venue</b><span>${data.venue || "—"}</span></div>
                <div class="fed-info-card"><b>Club</b><span>${data.club || data.organizer || "—"}</span></div>
                <div class="fed-info-card"><b>Category</b><span>${data.category || data.type || "General"}</span></div>
                <div class="fed-info-card"><b>Created By</b><span>${data.created_by || data.submitted_by || "—"}</span></div>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-header"><div class="panel-title">Registration Summary</div></div>
            <div class="panel-body">
              <div class="fed-kpi-grid">
                <div class="fed-kpi">
                  <div class="fed-kpi-num">${registered}</div>
                  <div class="fed-kpi-label">Registered</div>
                </div>
                <div class="fed-kpi">
                  <div class="fed-kpi-num">${capacity}</div>
                  <div class="fed-kpi-label">Capacity</div>
                </div>
                <div class="fed-kpi">
                  <div class="fed-kpi-num">${seatsLeft}</div>
                  <div class="fed-kpi-label">Seats Left</div>
                </div>
                <div class="fed-kpi">
                  <div class="fed-kpi-num">${pct}%</div>
                  <div class="fed-kpi-label">Filled</div>
                </div>
              </div>

              <div class="fed-progress">
                <div class="fed-progress-fill" style="width:${pct}%"></div>
              </div>

              <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn ghost sm" onclick="loadFacultyParticipants(${data.id})">👥 View Participants</button>
              </div>

              <div id="facultyParticipantsWrap" style="margin-top:16px;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("openFacultyEventDetailPage error:", err);
    body.innerHTML = `<div class="list-empty" style="padding:24px;">Failed to load event details.</div>`;
  }
}

// ── EVENT DETAIL DRAWER ───────────────────────────────────────────────────
async function showEventDetail(eventId) {
  try {
    let ev = (window.currentEventList || []).find(e => String(e.id) === String(eventId));
    if (!ev) {
      const fresh = await apiFetch(`/events/${eventId}`);
      if (fresh) ev = fresh;
    }
    if (!ev) { showToast("Event details not found.", "error"); return; }

    if (!Array.isArray(cachedProposals) || !cachedProposals.length) {
      const fp = await apiFetch("/faculty/proposals");
      cachedProposals = Array.isArray(fp) ? fp : [];
    }

    const proposal = cachedProposals.find(p =>
      String(p.id) === String(ev.proposal_id) ||
      String(p.event_id) === String(eventId) ||
      String(p.title || "").trim().toLowerCase() === String(ev.title || "").trim().toLowerCase()
    );

    const data = { ...ev, ...(proposal || {}) };
    const statusCls = (data.status || "approved").toLowerCase();

    const overlay = document.getElementById("eventDetailOverlay");
    const drawer  = document.getElementById("eventDetailDrawer");
    const body    = document.getElementById("eventDetailBody");

    if (!overlay || !drawer || !body) {
      showToast("Drawer elements not found.", "error");
      return;
    }

    // Update drawer header
    el("edDrawerTitle")?.text(data.title || "Event Details");
    el("edDrawerSub")?.text(
      `${data.club || data.organizer || "—"}  ·  ${fmtDate(data.date || data.event_date || data.start_date)}`
    );

    const capacity   = Number(data.capacity || data.expected_participants || 0);
    const registered = Number(data.registered_count || data.registered || 0);
    const seatsLeft  = Math.max(0, capacity - registered);
    const pct        = capacity > 0 ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;

    const posterUrl = data.posterUrl
      ? `http://localhost:5000/uploads/${data.posterUrl}`
      : null;

    body.innerHTML = `
      ${posterUrl
        ? `<div class="ed-banner"><img src="${posterUrl}" alt="${data.title}" onerror="this.parentElement.style.background='var(--g-violet)';this.remove()"/></div>`
        : `<div class="ed-banner" style="display:flex;align-items:center;justify-content:center;font-size:52px;background:var(--g-violet);">📅</div>`}

      <div class="ed-body-layout">

        <!-- LEFT: main content -->
        <div class="ed-main-col">

          <div class="ed-title">${data.title || "Untitled Event"}</div>

          <div class="ed-badges">
            <span class="ed-badge primary">${data.category || data.type || "General"}</span>
            <span class="ed-badge">${data.club || data.organizer || "—"}</span>
            <span class="badge ${statusCls}" style="font-size:11px;">${cap(data.status || "approved")}</span>
            <span class="ed-badge">${data.registration_fee > 0 ? "₹" + data.registration_fee : "Free"}</span>
          </div>

          <div class="ed-meta">
            <div class="ed-meta-row">📅 <span>${fmtDate(data.date || data.event_date || data.start_date)}</span></div>
            <div class="ed-meta-row">🕐 <span>${formatTime(data.time || data.start_time)}</span></div>
            <div class="ed-meta-row">📍 <span>${data.venue || "—"}</span></div>
            <div class="ed-meta-row">👥 <span>${registered} / ${capacity} registered</span></div>
            <div class="ed-meta-row">🎓 <span>Created by ${data.created_by || data.submitted_by || "—"}</span></div>
            <div class="ed-meta-row">📆 <span>Submitted ${fmtDate(data.created_at || data.submitted_at)}</span></div>
          </div>

          <!-- Tabs -->
          <div class="ed-tabs">
            <button class="ed-tab active" data-panel="edp-description">📝 Description</button>
            <button class="ed-tab" data-panel="edp-participants">👥 Participants</button>
            ${data.objectives ? `<button class="ed-tab" data-panel="edp-objectives">🎯 Objectives</button>` : ""}
          </div>

          <!-- Description panel -->
          <div class="ed-panel active" id="edp-description">
            <p class="ed-desc">${data.description || "No description provided."}</p>
            ${data.requirements ? `
              <div style="margin-top:16px;">
                <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">📋 Requirements</div>
                <p class="ed-desc">${data.requirements}</p>
              </div>` : ""}
            ${data.target_audience ? `
              <div style="margin-top:16px;">
                <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">👤 Target Audience</div>
                <p class="ed-desc">${data.target_audience}</p>
              </div>` : ""}
            ${data.document_url ? `
              <div style="margin-top:16px;">
                <a href="${data.document_url}" target="_blank" class="mini-btn" style="display:inline-flex;">📎 View Proposal Document</a>
              </div>` : ""}
          </div>

          <!-- Participants panel -->
          <div class="ed-panel" id="edp-participants">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="font-size:13px;font-weight:700;color:var(--text);">Registered Participants</span>
              <button class="mini-btn" onclick="edDownloadParticipants(${data.id}, '${(data.title || "event").replace(/'/g, "\\'")}')">
                ⬇️ Download CSV
              </button>
            </div>
            <div id="edParticipantsWrap">
              <p class="ed-desc" style="color:var(--text-3);">Click here to load participants…</p>
            </div>
          </div>

          ${data.objectives ? `
          <!-- Objectives panel -->
          <div class="ed-panel" id="edp-objectives">
            <p class="ed-desc">${data.objectives}</p>
          </div>` : ""}

        </div><!-- /ed-main-col -->

        <!-- RIGHT: sidebar stats -->
        <div class="ed-side-col">

          <div class="ed-reg-label">Registration</div>
          <div class="ed-reg-row">
            <span>${seatsLeft} seats left</span>
            <span>${registered} / ${capacity}</span>
          </div>
          <div class="ed-progress-bar">
            <div class="ed-progress-fill" style="width:${pct}%"></div>
          </div>

          <div class="ed-kpi-grid">
            <div class="ed-kpi">
              <div class="ed-kpi-icon">👥</div>
              <div class="ed-kpi-val">${registered}</div>
              <div class="ed-kpi-label">Registered</div>
            </div>
            <div class="ed-kpi">
              <div class="ed-kpi-icon">🪑</div>
              <div class="ed-kpi-val">${capacity}</div>
              <div class="ed-kpi-label">Capacity</div>
            </div>
            <div class="ed-kpi">
              <div class="ed-kpi-icon">📅</div>
              <div class="ed-kpi-val" style="font-size:13px;line-height:1.3;">${fmtDate(data.date || data.event_date || data.start_date)}</div>
              <div class="ed-kpi-label">Date</div>
            </div>
            <div class="ed-kpi">
              <div class="ed-kpi-icon">💰</div>
              <div class="ed-kpi-val" style="font-size:15px;">${data.registration_fee > 0 ? "₹" + data.registration_fee : "Free"}</div>
              <div class="ed-kpi-label">Fee</div>
            </div>
          </div>

          <div class="ed-hr"></div>

          <div class="ed-detail-row"><b>Status:</b>
            <span class="badge ${statusCls}" style="margin-left:6px;font-size:11px;">${cap(data.status || "approved")}</span>
          </div>
          <div class="ed-detail-row"><b>Venue:</b> ${data.venue || "—"}</div>
          <div class="ed-detail-row"><b>Time:</b> ${formatTime(data.time || data.start_time)}</div>
          <div class="ed-detail-row"><b>Category:</b> ${data.category || data.type || "General"}</div>
          <div class="ed-detail-row"><b>Club:</b> ${data.club || data.organizer || "—"}</div>
          <div class="ed-detail-row"><b>Created by:</b> ${data.created_by || data.submitted_by || "—"}</div>
          <div class="ed-detail-row"><b>Submitted:</b> ${fmtDate(data.created_at || data.submitted_at)}</div>

          ${isActionableForMe(data.status) ? `
          <div class="ed-hr"></div>
          <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Quick Actions</div>
          <div style="display:flex;gap:8px;">
            <button class="mini-btn approve" style="flex:1;justify-content:center;"
              onclick="approveProposal(${data.id}, '${data._src || "proposal"}');closeEventDetail();">
              ${isFacultyCoordinator() ? '📨 Forward' : '✅ Approve'}
            </button>
            <button class="mini-btn reject" style="flex:1;justify-content:center;"
              onclick="rejectProposal(${data.id}, '${data._src || "proposal"}');closeEventDetail();">
              ❌ Reject
            </button>
          </div>` : ""}

        </div><!-- /ed-side-col -->

      </div><!-- /ed-body-layout -->
    `;

    // Wire tabs
    let participantsLoaded = false;
    body.querySelectorAll(".ed-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        body.querySelectorAll(".ed-tab").forEach(t => t.classList.remove("active"));
        body.querySelectorAll(".ed-panel").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        body.querySelector(`#${btn.dataset.panel}`)?.classList.add("active");

        if (btn.dataset.panel === "edp-participants" && !participantsLoaded) {
          participantsLoaded = true;
          edLoadParticipants(data.id);
        }
      });
    });

    // Open drawer
    overlay.style.display = "block";
    drawer.style.display  = "flex";
    requestAnimationFrame(() => drawer.classList.add("open"));
    document.body.style.overflow = "hidden";

  } catch (err) {
    console.error("showEventDetail error:", err);
    showToast("Failed to open event details.", "error");
  }
}

// ── LOAD PARTICIPANTS INTO DRAWER TAB ─────────────────────────────────────
async function edLoadParticipants(eventId) {
  const wrap = document.getElementById("edParticipantsWrap");
  if (!wrap) return;
  wrap.innerHTML = `<p class="ed-desc" style="color:var(--text-3);">Loading…</p>`;
  try {
    const res  = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];
    if (!data.length) {
      wrap.innerHTML = `<p class="ed-desc" style="color:var(--text-3);">No registrations yet.</p>`;
      return;
    }
    wrap.innerHTML = `
      <table class="ed-ptable">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Dept</th>
            <th>Class</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${p.name || "—"}</td>
              <td>${p.email || "—"}</td>
              <td>${p.department || "—"}</td>
              <td>${p.class || "—"}</td>
              <td>${p.phone_no || p.phone || "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  } catch {
    wrap.innerHTML = `<p class="ed-desc" style="color:var(--text-3);">Failed to load participants.</p>`;
  }
}

// ── DOWNLOAD PARTICIPANTS FROM DRAWER ─────────────────────────────────────
async function edDownloadParticipants(eventId, eventTitle) {
  try {
    const res  = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];
    if (!data.length) { showToast("No participants found.", "error"); return; }
    const headers = ["#", "Name", "Email", "Department", "Class", "Phone"];
    const rows    = data.map((p, i) => [
      i + 1,
      p.name || "",
      p.email || "",
      p.department || "",
      p.class || "",
      p.phone_no || p.phone || ""
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `participants_${(eventTitle || "event").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("⬇️ Download started!", "success");
  } catch (err) {
    console.error(err);
    showToast("Download failed.", "error");
  }
}

// ── CLOSE EVENT DETAIL ────────────────────────────────────────────────────
function closeEventDetail() {
  const overlay = document.getElementById("eventDetailOverlay");
  const drawer  = document.getElementById("eventDetailDrawer");

  if (drawer) {
    drawer.classList.remove("open");
    // Wait for CSS transition to finish before hiding
    setTimeout(() => {
      if (drawer) drawer.style.display = "none";
    }, 300);
  }
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
}

// ── ALL CLUBS PAGE ────────────────────────────────────────────────────────
let allClubsData      = [];
let currentClubDetail = null;
let currentClubEvents = [];

async function renderAllClubs(search = "", category = "all") {
  const grid = document.getElementById("allClubsGrid");
  if (!grid) return;

  grid.innerHTML = `<div class="list-empty" style="padding:20px;">Loading…</div>`;

  let fresh = await apiFetch("/clubs");
  if (!Array.isArray(fresh) || !fresh.length) fresh = [];
  allClubsData = fresh.length ? fresh : [...cachedClubs];

  const myClubIds = new Set(cachedClubs.map(c => String(c.id ?? c.club_id ?? "")));
  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵","🔬","🎭","🏅","📐","🌱","🔭","🎮","🎻"];

  let list = allClubsData;

  if (search) {
    list = list.filter(c =>
      (c.club_name || c.name || "").toLowerCase().includes(search) ||
      (c.category || c.type || "").toLowerCase().includes(search) ||
      (c.description || "").toLowerCase().includes(search)
    );
  }

  if (category !== "all") {
    list = list.filter(c => {
      const raw = (c.club_category || c.category || c.type || "").toLowerCase().trim();
      if (category === "technical")     return raw === "technical";
      if (category === "non-technical") return raw === "non-technical";
      return raw === category.toLowerCase();
    });
  }

  if (!list.length) {
    grid.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs found.</div>`;
    return;
  }

  grid.innerHTML = list.map((c, i) => {
    const clubName = c.club_name || c.name || "Club";
    const clubId = String(c.id ?? c.club_id ?? "");
    const isMyClub = myClubIds.has(clubId);

    const clubEvents = cachedEvents.filter(e =>
      String(e.club_id ?? e.clubId ?? "") === clubId ||
      String(e.club ?? e.club_name ?? "").trim().toLowerCase() === clubName.trim().toLowerCase()
    );
    const upcoming = clubEvents.filter(e => {
      const d = parseEventDate(e.date || e.event_date || e.start_date);
      return d && d >= new Date();
    }).length;

    return `
      <div class="ac-card" onclick="openClubDetail('${clubId}', ${i})">
        <div class="ac-card-top">
          <div class="ac-emoji">${c.logo || emojis[i % emojis.length]}</div>
          <div style="flex:1;min-width:0;">
            <div class="ac-name">${clubName}</div>
            <div class="ac-cat">${c.club_category || c.category || c.type || "Club"}</div>
          </div>
          <span class="badge ${c.status === 'inactive' ? 'rejected' : 'approved'}" style="flex-shrink:0;">${c.status || "Active"}</span>
        </div>
        <div class="ac-stats">
          <div class="ac-stat"><div class="ac-stat-val">${c.member_count || c.members || 0}</div><div class="ac-stat-label">Members</div></div>
          <div class="ac-stat"><div class="ac-stat-val">${clubEvents.length}</div><div class="ac-stat-label">Events</div></div>
          <div class="ac-stat"><div class="ac-stat-val">${upcoming}</div><div class="ac-stat-label">Upcoming</div></div>
        </div>
        <div class="ac-footer">
          <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">
            ${c.description ? c.description.slice(0, 60) + (c.description.length > 60 ? "…" : "") : "—"}
          </div>
          ${isMyClub ? `<span class="ac-incharge-badge">INCHARGE</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function openClubDetail(clubId, idx) {
  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵","🔬","🎭","🏅","📐","🌱","🔭","🎮","🎻"];
  const club = allClubsData.find(c => String(c.id ?? c.club_id ?? "") === String(clubId));
  if (!club) return;

  currentClubDetail = club;
  const clubName = club.club_name || club.name || "Club";

  currentClubEvents = cachedEvents.filter(e =>
    String(e.club_id ?? e.clubId ?? "") === String(clubId) ||
    String(e.club ?? e.club_name ?? "").trim().toLowerCase() === clubName.trim().toLowerCase()
  ).sort((a, b) => new Date(b.date || b.event_date || b.start_date) - new Date(a.date || a.event_date || a.start_date));

  const upcoming = currentClubEvents.filter(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    return d && d >= new Date();
  }).length;
  const pending = currentClubEvents.filter(e => (e.status || "").toLowerCase().trim() === STATUS.SUBMITTED).length;

  el("clubDetailEmoji")?.text(club.logo || emojis[idx % emojis.length]);
  el("clubDetailName")?.text(clubName);
  el("clubDetailCat")?.text(club.category || club.type || "Club");

  const statsEl = document.getElementById("clubDetailStats");
  if (statsEl) {
    statsEl.innerHTML = [
      { val: club.member_count || club.members || 0, label: "Members" },
      { val: currentClubEvents.length,               label: "Total Events" },
      { val: upcoming,                               label: "Upcoming" },
      { val: pending,                                label: "Pending" },
    ].map(s => `
      <div class="club-ds-cell">
        <div class="club-ds-val">${s.val}</div>
        <div class="club-ds-label">${s.label}</div>
      </div>
    `).join("");
  }

  const infoEl = document.getElementById("clubDetailInfo");
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="club-detail-info-grid">
        ${[
          ["Club Name",   clubName],
          ["Category",    club.club_category || club.category || club.type || "—"]
          ["Status",      club.status || "Active"],
          ["Members",     club.member_count || club.members || 0],
          ["Faculty",     club.faculty_name || club.incharge || "—"],
          ["Email",       club.email || "—"],
          ["Founded",     fmtDate(club.created_at || club.founded) || "—"],
          ["Description", club.short_description || club.description || "—"],
        ].map(([l, v]) => `
          <div class="club-info-cell">
            <div class="club-info-label">${l}</div>
            <div class="club-info-val">${v}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  switchClubTab("events", document.querySelector(".club-tab"));
  filterClubEvents();

  document.getElementById("clubDetailOverlay").style.display = "";
  document.getElementById("clubDetailDrawer").style.display  = "flex";
  document.body.style.overflow = "hidden";
}

function closeClubDetail() {
  document.getElementById("clubDetailOverlay").style.display = "none";
  document.getElementById("clubDetailDrawer").style.display  = "none";
  document.body.style.overflow = "";
}

function switchClubTab(tab, btn) {
  document.querySelectorAll(".club-tab").forEach(t => t.classList.remove("active"));
  if (btn) btn.classList.add("active");
  else {
    document.querySelectorAll(".club-tab").forEach(t =>
      t.classList.toggle("active", t.textContent.toLowerCase().includes(tab))
    );
  }
  document.getElementById("clubTabEvents").style.display = tab === "events" ? "" : "none";
  document.getElementById("clubTabInfo").style.display   = tab === "info"   ? "" : "none";
}

function filterClubEvents() {
  const status = document.getElementById("clubEventStatusFilter")?.value || "all";
  const search = (document.getElementById("clubEventSearch")?.value || "").toLowerCase();

  let list = currentClubEvents;
  if (status !== "all") list = list.filter(e =>
    (e.status || "approved").toLowerCase() === status.toLowerCase()
  );
  if (search) list = list.filter(e =>
    (e.title || "").toLowerCase().includes(search) ||
    (e.venue || "").toLowerCase().includes(search) ||
    (e.category || e.type || "").toLowerCase().includes(search)
  );

  const tbody = document.getElementById("clubDetailEventsBody");
  if (!tbody) return;

  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span class="ev-name">${e.title || "Untitled"}</span></td>
      <td>${fmtDate(e.date || e.event_date || e.start_date)}</td>
      <td>${e.venue || "—"}</td>
      <td><span class="tag">${e.category || e.type || "General"}</span></td>
      <td>${e.capacity || e.expected_participants || "—"}</td>
      <td>${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</td>
      <td><span class="badge ${e.status || "approved"}">${cap(e.status || "approved")}</span></td>
    </tr>
  `).join("")
  : `<tr><td colspan="7" class="td-empty">No events match filter.</td></tr>`;
}

// ── CALENDAR NAV ──────────────────────────────────────────────────────────
function initCalNav() {
  document.getElementById("dashCalPrev")?.addEventListener("click", () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderDashboardCalendar();
  });
  document.getElementById("dashCalNext")?.addEventListener("click", () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderDashboardCalendar();
  });
}

// ── PENDING PAGE ──────────────────────────────────────────────────────────
async function renderPendingPage() {
  await refreshAll();
  selectedClubId = "all";
  // Show proposals actionable for this user's role
  const pending = cachedProposals.filter(p => matchesSelectedClub(p) && isActionableForMe(p.status));
  el("pendProposalCount")?.text(`${pending.length} pending`);

  const pl = document.getElementById("pendingProposalList");
  if (pl) {
    pl.innerHTML = pending.length ? pending.map(p => `
      <div class="dash-item">
        <div class="dot ${isActionableForMe(p.status) ? "dot-orange" : "dot-blue"}"></div>
        <div class="di-text">
          <div class="di-title">${p.title || p.name || "Untitled"}</div>
          <div class="di-sub">${p.club || "—"} · ${fmtDate(p.date || p.event_date)}</div>
          <div style="margin-top:3px;"><span class="badge ${statusClass(p.status)}" style="font-size:10px;">${statusLabel(p.status)}</span></div>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="mini-btn approve" onclick="approveProposal(${p.id}, 'proposal');renderPendingPage()">${isFacultyCoordinator() ? '📨' : '✅'}</button>
          <button class="mini-btn reject"  onclick="rejectProposal(${p.id}, 'proposal');renderPendingPage()">❌</button>
        </div>
      </div>
    `).join("")
    : `<div class="list-empty">All clear! 🎉</div>`;
  }
}

// ── CLUBS ─────────────────────────────────────────────────────────────────
async function renderClubs() {
  // Refresh all cached data together so member counts, events, and proposals
  // are all current — not just the clubs list.
  await refreshAll();

  const grid = document.getElementById("clubsGrid");
  if (!grid) return;

  if (!cachedClubs.length) {
    grid.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs assigned.</div>`;
    return;
  }

  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵"];

  grid.innerHTML = cachedClubs.map((c, i) => {
    const clubName = c.club_name || c.name || "Club";
    const clubId = c.id || c.club_id;

    const clubEvents = cachedEvents
      .filter(e =>
        String(e.club_id ?? e.clubId ?? "") === String(clubId) ||
        String(e.club ?? e.club_name ?? "").trim().toLowerCase() === clubName.trim().toLowerCase()
      )
      .sort((a, b) => new Date(b.date || b.event_date || b.start_date) - new Date(a.date || a.event_date || a.start_date));

    const upcomingCount = clubEvents.filter(e => {
      const d = parseEventDate(e.date || e.event_date || e.start_date);
      return d && d >= new Date();
    }).length;

    const pendingCount = cachedProposals.filter(p =>
      (String(p.club_id ?? p.clubId ?? "") === String(clubId) ||
      String(p.club ?? p.club_name ?? "").trim().toLowerCase() === clubName.trim().toLowerCase()) &&
      (p.status || "").toLowerCase().trim() === STATUS.SUBMITTED
    ).length;

    return `
      <div class="club-card">
        <div class="club-card-top">
          <div class="club-card-emoji">${c.logo || emojis[i % emojis.length]}</div>
          <div>
            <div class="club-card-name">${clubName}</div>
            <div class="club-card-cat">${c.category || c.type || "Club"}</div>
          </div>
          <span class="club-card-status">${c.status || "Active"}</span>
        </div>
        <div class="club-stats-row">
          <div class="club-stat-cell"><div class="club-stat-val">${c.member_count || c.members || 0}</div><div class="club-stat-label">Members</div></div>
          <div class="club-stat-cell"><div class="club-stat-val">${clubEvents.length}</div><div class="club-stat-label">Total Events</div></div>
          <div class="club-stat-cell"><div class="club-stat-val">${upcomingCount}</div><div class="club-stat-label">Upcoming</div></div>
          <div class="club-stat-cell"><div class="club-stat-val" style="color:${pendingCount > 0 ? "#fbbf24" : "#4ade80"};">${pendingCount}</div><div class="club-stat-label">Pending</div></div>
        </div>
        ${clubEvents.length ? `
        <div class="club-recent-title">Recent Events</div>
        ${clubEvents.slice(0, 3).map(e => `
          <div class="club-event-row">
            <span class="club-event-name">${e.title}</span>
            <span class="badge ${e.status || "approved"}" style="font-size:10px;">${cap(e.status || "approved")}</span>
            <span class="club-event-date">${fmtDate(e.date || e.event_date || e.start_date)}</span>
          </div>
        `).join("")}` : `<div class="list-empty">No events yet.</div>`}
        <div class="club-card-actions">
          <button class="btn ghost sm" onclick="openClubProposals(${clubId})">📋 Proposals</button>
          <button class="btn ghost sm" onclick="openClubAnalytics(${clubId})">📊 Analytics</button>
        </div>
      </div>
    `;
  }).join("");
}

function openClubProposals(clubId) { setSelectedClub(clubId); navigateTo("proposals"); renderProposals(); }
function openClubAnalytics(clubId) { setSelectedClub(clubId); chartsInited = false; navigateTo("analytics"); }
function openAllClubProposals()    { setSelectedClub("all"); navigateTo("proposals"); renderProposals(); }
function openAllClubAnalytics()    { setSelectedClub("all"); chartsInited = false; navigateTo("analytics"); }

// ── ANALYTICS ─────────────────────────────────────────────────────────────
function eventMatchesClub(event, club) {
  const cId   = String(club.id   ?? club.club_id  ?? "").trim();
  const cName = (club.club_name  ?? club.name     ?? "").trim().toLowerCase();
  const eId   = String(event.club_id ?? event.clubId ?? "").trim();
  const eName = (event.club ?? event.club_name ?? "").trim().toLowerCase();

  if (cId && eId && cId === eId) return true;

  const norm = s => s
    .replace(/\bclub\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const cn = norm(cName);
  const en = norm(eName);
  if (cn && en && cn === en) return true;
  if (cn && en && (cn.includes(en) || en.includes(cn))) return true;

  return false;
}

async function initCharts() {
  chartsInited = true;

  // ── No-clubs guard ────────────────────────────────────────────────────────
  // Faculty not assigned to any club have nothing meaningful to show on the
  // Analytics page. Replace the entire page content with a friendly empty
  // state instead of rendering empty / zeroed-out charts.
  const analyticsPg = document.getElementById("pg-analytics");
  if (!cachedClubs.length) {
    if (analyticsPg) {
      analyticsPg.innerHTML = `
        <div style="
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-height:420px;gap:20px;text-align:center;padding:40px 20px;
        ">
          <div style="font-size:56px;line-height:1;">📊</div>
          <div style="font-size:20px;font-weight:800;color:var(--text);">No Analytics Available</div>
          <div style="font-size:14px;color:var(--text-3);max-width:380px;line-height:1.65;">
            You are not currently assigned as an advisor for any club.<br>
            Analytics will appear here once you are linked to at least one club.
          </div>
          <div style="
            display:inline-flex;align-items:center;gap:8px;padding:10px 18px;
            border-radius:12px;background:rgba(139,92,246,.1);
            border:1px solid rgba(139,92,246,.25);
            font-size:12px;color:#c4b5fd;
          ">
            🏛️ Contact your administrator to get assigned to a club.
          </div>
        </div>
      `;
    }
    return;
  }

  const filteredProposals = cachedProposals.filter(matchesSelectedClub);
  const filteredEvents    = cachedEvents.filter(matchesSelectedClub);
  const filteredFeedback  = cachedFeedback.filter(f => {
    if (selectedClubId === "all") return true;
    const sc = getSelectedClub();
    return sc ? eventMatchesClub(f, sc) : false;
  });

  const filteredRegs = cachedRegistrations.filter(r => {
    if (selectedClubId === "all") return true;
    const sc = getSelectedClub();
    return sc ? eventMatchesClub(r, sc) : false;
  });

  const regCountFromEvents = filteredEvents.reduce((sum, e) =>
    sum + (e.registrations_count ?? e.registered_count ?? e.participant_count ?? 0), 0);

  const totalRegistrations = filteredRegs.length || regCountFromEvents;

  console.log("📊 Analytics — filteredEvents:", filteredEvents.length,
    "filteredProposals:", filteredProposals.length,
    "totalRegistrations:", totalRegistrations);

  const now      = new Date();
  const approved = filteredProposals.filter(p => (p.status || "").toLowerCase() === "approved").length;

  const kpi = document.getElementById("analyticsKpi");
  if (kpi) {
    kpi.innerHTML = [
      { k: "kv", icon: "📋", val: filteredProposals.length, label: "Total Proposals"      },
      { k: "kp", icon: "✅", val: approved,                 label: "Approved Events"       },
      { k: "kc", icon: "👥", val: totalRegistrations,       label: "Student Registrations" },
    ].map(d => `
      <div class="kpi-card ${d.k}">
        <div class="kpi-icon">${d.icon}</div>
        <div class="kpi-val">${d.val}</div>
        <div class="kpi-label">${d.label}</div>
      </div>
    `).join("");
  }

  const labels = [], evCounts = [], regCounts = [];
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTH_NAMES[d.getMonth()]);

    const monthEvs = filteredEvents.filter(e => {
      const ed = parseEventDate(e.date || e.event_date || e.start_date);
      return ed && ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
    });
    evCounts.push(monthEvs.length);

    const regsFromEvFields = monthEvs.reduce((sum, e) =>
      sum + (e.registrations_count ?? e.registered_count ?? e.participant_count ?? 0), 0);

    const regsFromCache = filteredRegs.filter(r => {
      const rd = parseEventDate(r.created_at || r.date || r.registered_at);
      return rd && rd.getFullYear() === d.getFullYear() && rd.getMonth() === d.getMonth();
    }).length;

    regCounts.push(regsFromEvFields || regsFromCache);
  }

  const chartDefaults = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "rgba(240,242,255,.4)", font: { weight: 600, size: 11 } } },
      y: {
        grid: { color: "rgba(255,255,255,.05)" },
        ticks: { color: "rgba(240,242,255,.4)", font: { weight: 600, size: 11 }, stepSize: 1 },
        beginAtZero: true,
      },
    },
  };

  tryChart("eventsChart", {
    type: "bar",
    data: { labels, datasets: [{ data: evCounts, backgroundColor: "rgba(139,92,246,.7)", borderRadius: 7, borderSkipped: false }] },
    options: chartDefaults,
  });

  tryChart("participationChart", {
    type: "line",
    data: { labels, datasets: [{ data: regCounts, borderColor: "#ec4899", backgroundColor: "rgba(236,72,153,.12)", borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#ec4899" }] },
    options: chartDefaults,
  });

  const TECHNICAL_KEYWORDS = ["ieee","iedc","robotics","coding","tech","computer","ai","ml","cyber","hack","software","hardware"];

  const technical    = filteredEvents.filter(e => {
    const s = [e.category || "", e.type || "", e.club || "", e.club_name || "", e.title || ""].join(" ").toLowerCase();
    return TECHNICAL_KEYWORDS.some(kw => s.includes(kw));
  }).length;
  const nonTechnical = Math.max(0, filteredEvents.length - technical);
  const total        = filteredEvents.length || 1;

  tryChart("typeChart", {
    type: "doughnut",
    data: {
      labels: ["Technical", "Non-Technical"],
      datasets: [{ data: [technical || 0, nonTechnical || 0], backgroundColor: ["#8b5cf6", "#ec4899"], borderWidth: 0, hoverOffset: 6 }]
    },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: "68%" },
  });

  const leg = document.getElementById("typeChartLegend");
  if (leg) {
    leg.innerHTML = [
      { color: "#8b5cf6", label: "Technical",     pct: Math.round((technical    / total) * 100), cnt: technical    },
      { color: "#ec4899", label: "Non-Technical", pct: Math.round((nonTechnical / total) * 100), cnt: nonTechnical },
    ].map(d => `
      <div class="leg-row">
        <div class="leg-swatch" style="background:${d.color};"></div>
        <div>
          <div class="leg-text">${d.label} — ${d.pct}%</div>
          <div class="leg-pct">${d.cnt} events</div>
        </div>
      </div>
    `).join("");
  }

  const selectedClub = getSelectedClub();
  const clubNames  = selectedClub
    ? [selectedClub.club_name || selectedClub.name || "Club"]
    : cachedClubs.map(c => c.club_name || c.name || "Club");

  const clubCounts = selectedClub
    ? [cachedEvents.filter(e => eventMatchesClub(e, selectedClub)).length]
    : cachedClubs.map(c => cachedEvents.filter(e => eventMatchesClub(e, c)).length);

  console.log("🏛️ clubChart — labels:", clubNames, "counts:", clubCounts);

  tryChart("clubChart", {
    type: "bar",
    data: {
      labels: clubNames.length ? clubNames : ["No clubs"],
      datasets: [{
        data: clubCounts.length ? clubCounts : [0],
        backgroundColor: ["rgba(139,92,246,.7)","rgba(236,72,153,.7)","rgba(6,182,212,.7)","rgba(132,204,22,.7)","rgba(245,158,11,.7)"],
        borderRadius: 7,
        borderSkipped: false
      }],
    },
    options: { ...chartDefaults, indexAxis: "y" },
  });
}

// ── FEEDBACK ──────────────────────────────────────────────────────────────
async function renderFeedback(search = "") {
  const fresh = await apiFetch("/faculty/feedback");
  if (fresh) cachedFeedback = fresh;

  const comments = cachedFeedback.filter(f =>
    !search ||
    (f.comment || f.text || "").toLowerCase().includes(search) ||
    (f.student_name || "").toLowerCase().includes(search) ||
    (f.organizer_reply || f.reply || "").toLowerCase().includes(search) ||
    (f.event_title || f.event || "").toLowerCase().includes(search)
  );

  const cg = document.getElementById("commentsGrid");
  if (cg) {
    cg.innerHTML = comments.length ? comments.slice(0, 12).map(f => `
      <div class="comment-card">
        <div class="comment-head">
          <div>
            <div class="comment-name">${f.student_name || f.name || "Student"}</div>
            <div class="comment-event">${f.event_title || f.event || "—"} · ${fmtDate(f.created_at || f.date)}</div>
          </div>
          <div class="comment-stars">${starStr(f.rating || 0)}</div>
        </div>
        <div class="comment-text">"${f.comment || f.text || "No comment."}"</div>
        <div class="comment-reply-box">
          <div class="comment-reply-label">Organizer Reply</div>
          <div class="comment-reply-text">${f.organizer_reply || f.reply || "No reply yet."}</div>
        </div>
      </div>
    `).join("")
    : `<div class="list-empty" style="padding:20px;">No feedback yet.</div>`;
  }
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────
// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────
async function renderAnnouncements() {
  const al = document.getElementById("announceList");
  if (!al) return;

  if (!cachedClubs.length) {
    al.innerHTML = `<div class="list-empty">You are not assigned to any club. Announcements are unavailable.</div>`;
    return;
  }

  const mine = await apiFetch("/announcements/my-posts");
  const list = Array.isArray(mine) ? mine : [];

  if (!list.length) {
    al.innerHTML = `<div class="list-empty">No posts yet.</div>`;
    return;
  }

  al.innerHTML = list.map(a => `
    <div class="announce-card" data-ann-id="${a.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="announce-title">${a.title}</div>
        <div style="display:flex;gap:6px;">
          <button class="mini-btn" onclick="editAnnouncement(${a.id})">✏️</button>
          <button class="mini-btn reject" onclick="deleteAnnouncement(${a.id})">🗑️</button>
        </div>
      </div>
      <div class="announce-meta">${fmtDate(a.created_at)}</div>
      <div class="announce-body">${a.message}</div>
    </div>
  `).join("");
}

async function postAnnouncement() {
  const title   = document.getElementById("announceTitle")?.value.trim();
  const message = document.getElementById("announceBody")?.value.trim();
  const type    = document.getElementById("announceType")?.value;

  if (!title || !message) {
    showToast("Fill in title and message.", "error");
    return;
  }

  const clubId = cachedClubs[0]?.id ?? cachedClubs[0]?.club_id ?? null;
  if (!clubId) {
    showToast("You are not assigned to any club. Cannot post announcements.", "error");
    return;
  }

  const res = await apiFetch("/announcements", {
    method: "POST",
    body: JSON.stringify({ title, message, type, club_id: clubId })
  });

  if (res !== null) {
    document.getElementById("announceTitle").value = "";
    document.getElementById("announceBody").value = "";

    addLocalNotif(
      "admin",
      "📢",
      title,
      message,
      `ann-${res.id}`
    );

    saveNotifs();
    updateNotifBadge();
    renderNotifDropdown();
    renderNotifHistory();

    showToast("📢 Announcement posted!", "success");
    await renderAnnouncements();
  } else {
    showToast("Failed to post.", "error");
  }
}

function editAnnouncement(id) {
  const card = document.querySelector(`[data-ann-id="${id}"]`);
  const currentTitle   = card?.querySelector(".announce-title")?.textContent?.trim() || "";
  const currentMessage = card?.querySelector(".announce-body")?.textContent?.trim() || "";

  const modal = document.createElement("div");
  modal.id = "editAnnModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('editAnnModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3001;background:var(--surface,#1a1a2e);border:1px solid rgba(139,92,246,.35);
      border-radius:20px;width:min(460px,92vw);padding:28px 24px;
      box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="font-size:16px;font-weight:800;color:var(--text,#f0f2ff);margin-bottom:18px;">✏️ Edit Announcement</div>
      <label style="font-size:11px;font-weight:700;color:var(--text-3,#94a3b8);text-transform:uppercase;letter-spacing:.6px;">Title</label>
      <input id="editAnnTitle" value="${currentTitle.replace(/"/g,'&quot;')}"
        style="width:100%;margin:6px 0 14px;padding:10px 12px;border-radius:10px;
          border:1px solid rgba(139,92,246,.3);background:var(--surface-2,#0d0d1a);
          color:var(--text,#f0f2ff);font-size:13px;font-family:var(--font,inherit);
          outline:none;box-sizing:border-box;"/>
      <label style="font-size:11px;font-weight:700;color:var(--text-3,#94a3b8);text-transform:uppercase;letter-spacing:.6px;">Message</label>
      <textarea id="editAnnMessage" rows="4"
        style="width:100%;margin:6px 0 20px;padding:10px 12px;border-radius:10px;
          border:1px solid rgba(139,92,246,.3);background:var(--surface-2,#0d0d1a);
          color:var(--text,#f0f2ff);font-size:13px;font-family:var(--font,inherit);
          resize:vertical;outline:none;box-sizing:border-box;">${currentMessage}</textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('editAnnModal').remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2,rgba(255,255,255,.1));
            background:var(--surface-2,#0d0d1a);color:var(--text,#f0f2ff);
            font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button onclick="submitEditAnnouncement(${id})"
          style="flex:1;padding:10px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;">Save Changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById("editAnnTitle")?.focus();
}

async function submitEditAnnouncement(id) {
  const title   = document.getElementById("editAnnTitle")?.value.trim();
  const message = document.getElementById("editAnnMessage")?.value.trim();

  if (!title || !message) {
    showToast("Title and message are required.", "error");
    return;
  }

  const res = await apiFetch(`/announcements/${id}`, {
    method: "PUT",
    body: JSON.stringify({ title, message }),
  });

  if (res !== null) {
    const sid = `ann-${id}`;

    localNotifs = localNotifs.map(n => {
      if (n.sourceId === sid) {
        return {
          ...n,
          title: title,
          sub: message
        };
      }
      return n;
    });

    saveNotifs();
    updateNotifBadge();
    renderNotifDropdown();
    renderNotifHistory();

    document.getElementById("editAnnModal")?.remove();
    showToast("✏️ Announcement updated!", "success");
    await renderAnnouncements();
  } else {
    showToast("Failed to update.", "error");
  }
}

async function deleteAnnouncement(id) {
  if (!confirm("Are you sure you want to delete this announcement?")) return;

  const res = await apiFetch(`/announcements/${id}`, { method: "DELETE" });

  if (res !== null) {
    localNotifs = localNotifs.filter(n => n.sourceId !== `ann-${id}`);
    saveNotifs();
    updateNotifBadge();
    renderNotifDropdown();
    renderNotifHistory();

    showToast("🗑️ Announcement deleted", "success");
    await renderAnnouncements();
  } else {
    showToast("Failed to delete.", "error");
  }
}
// ── NOTIFICATIONS ─────────────────────────────────────────────────────────
async function syncNotifs() {
  if (!cachedClubs.length) return; // skip if faculty has no club assigned
  const ann = await apiFetch("/announcements/faculty");
  if (!Array.isArray(ann)) return;

  const existIds = new Set(localNotifs.map(n => n.sourceId).filter(Boolean));
  const ICONS = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣" };
  let added = 0;

 ann.forEach(a => {
  const sid = `ann-${a.id}`;
  const existing = localNotifs.find(n => n.sourceId === sid);

  if (existing) {
    existing.title = a.title;
    existing.sub = a.message || "";
    existing.time = a.created_at || existing.time;
    return;
  }

  localNotifs.unshift({
    id: `${Date.now()}-${Math.random()}`,
    sourceId: sid,
    type: "admin",
    icon: ICONS[a.type] || "📢",
    title: a.title,
    sub: a.message || "",
    time: a.created_at || new Date().toISOString(),
    read: false
  });
  added++;
});

  cachedProposals.filter(p => isPendingStatus(p.status)).forEach(p => {
    const sid = `prop-${p.id}`;
    if (existIds.has(sid)) return;

    localNotifs.push({
      id: `${Date.now()}-${Math.random()}`,
      sourceId: sid,
      type: "event",
      icon: "📋",
      title: "New Event Proposal",
      sub: `${p.title || "Untitled"} · ${p.club || "—"}`,
      time: p.created_at || new Date().toISOString(),
      read: false
    });
    added++;
  });

  if (added) saveNotifs();
  updateNotifBadge();
  renderNotifDropdown();
}
function addLocalNotif(type, icon, title, sub, sourceId = null) {
  localNotifs.unshift({
    id: `${Date.now()}-${Math.random()}`,
    sourceId,
    type,
    icon,
    title,
    sub,
    time: new Date().toISOString(),
    read: false
  });

  saveNotifs();
  updateNotifBadge();
  renderNotifDropdown();
}
function updateNotifBadge() {
  const unread = localNotifs.filter(n => !n.read).length;
  const cnt = document.getElementById("notifCount");
  if (cnt) { cnt.textContent = unread > 9 ? "9+" : unread; cnt.style.display = unread > 0 ? "flex" : "none"; }
}

function renderNotifDropdown() {
  const list = document.getElementById("notifDropList");
  if (!list) return;
  if (!localNotifs.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px;">🔔<br>No notifications yet.</div>`;
    return;
  }
  list.innerHTML = localNotifs.slice(0, 8).map(n => `
    <div class="notif-item ${n.read ? "" : "unread"}">
      <div class="notif-icon">${n.icon || "🔔"}</div>
      <div class="notif-body">
        <div class="notif-ntitle">${n.title}</div>
        <div class="notif-nsub">${n.sub || ""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
      ${!n.read ? `<div class="notif-unread-dot"></div>` : ""}
    </div>
  `).join("");
}

function clearAllNotifs() {
  localNotifs = []; saveNotifs(); updateNotifBadge(); renderNotifDropdown(); renderNotifHistory();
  showToast("Notifications cleared.", "info");
}

function renderNotifHistory() {
  const filter = document.getElementById("notifTypeFilter")?.value || "all";
  const list = document.getElementById("notifHistoryList");
  if (!list) return;

  let notifs = localNotifs;
  if (filter !== "all") notifs = notifs.filter(n => n.type === filter);

  list.innerHTML = notifs.length ? notifs.map(n => `
    <div class="notif-item ${n.read ? "" : "unread"}">
      <div class="notif-icon">${n.icon || "🔔"}</div>
      <div class="notif-body">
        <div class="notif-ntitle">${n.title}${!n.read ? `<span style="display:inline-block;width:7px;height:7px;background:var(--pink);border-radius:50%;margin-left:5px;vertical-align:middle;"></span>` : ""}</div>
        <div class="notif-nsub">${n.sub || ""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
    </div>
  `).join("")
  : `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px;">No notifications.</div>`;
}

function markAllNotifsRead() {
  localNotifs = localNotifs.map(n => ({ ...n, read: true }));
  saveNotifs(); updateNotifBadge(); renderNotifHistory();
  showToast("All marked as read.", "success");
}

// ── PROFILE DRAWER ────────────────────────────────────────────────────────
function openProfileDrawer() {
  document.getElementById("profileDrawer")?.classList.add("open");
  document.getElementById("overlay")?.classList.add("open");

  const body = document.getElementById("profileDrawerBody");
  if (!body || !cachedProfile) return;

  const p = cachedProfile;
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div style="width:72px;height:72px;border-radius:18px;background:var(--g-violet);display:grid;place-items:center;font-size:26px;font-weight:800;color:white;box-shadow:var(--glow-v);">
        ${(p.name || "FA").split(" ").map(n => n[0]).join("").slice(0, 2)}
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--text);">${p.name || "Faculty"}</div>
        <div style="font-size:13px;color:var(--text-3);margin-top:3px;">${p.email || "—"}</div>
        <div style="font-size:13px;color:var(--text-3);">${p.department || "—"}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
      ${[["Faculty No", p.faculty_no||"—"],["Department", p.department||"—"],["Email", p.email||"—"],["Phone", p.phone_no||p.phone||"—"]].map(([l,v]) => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">${l}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${v}</div>
        </div>
      `).join("")}
    </div>
    <div class="divider"></div>
    <div style="font-size:12px;color:var(--text-3);margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;">Incharge Clubs</div>
    ${(cachedClubs.map((c, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:8px;">
        <span style="font-size:20px;">${c.logo || ["🤖","⚡","💻","🤝","🚀"][i % 5]}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);">${c.club_name || c.name || "Club"}</div>
          <div style="font-size:11px;color:var(--text-3);">${c.member_count || 0} members</div>
        </div>
        <span class="club-card-status" style="margin-left:auto;">${c.status || "Active"}</span>
      </div>
    `).join("")) || `<div class="list-empty">No clubs assigned.</div>`}
    <div style="margin-top:16px;">
      <button class="btn primary" onclick="closeProfileDrawer(); navigateTo('account-settings')">⚙️ Edit Profile</button>
    </div>
  `;
}

function closeProfileDrawer() {
  document.getElementById("profileDrawer")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("open");
}

// ── BULK HANDLERS ─────────────────────────────────────────────────────────
function initBulk() {
  document.getElementById("chkAllCerts")?.addEventListener("change", e => {
    document.querySelectorAll(".cert-cb:not(:disabled)").forEach(cb => cb.checked = e.target.checked);
  });

  document.getElementById("bulkCertBtn")?.addEventListener("click", async () => {
    if (typeof cachedCerts === "undefined") return;
    const ids = [...document.querySelectorAll(".cert-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) { showToast("Select certificates first.", "error"); return; }
    const eligible = ids.filter(id => { const c = cachedCerts.find(x => x.id === id); return c && (c.attended ?? c.attendance); });
    await Promise.all(eligible.map(id => apiFetch(`/faculty/certificates/${id}/approve`, { method: "PATCH" })));
    eligible.forEach(id => { const c = cachedCerts.find(x => x.id === id); if (c) { c.certificate_status = "approved"; c.status = "approved"; } });
    if (typeof renderCerts === "function") renderCerts();
    showToast(`🎓 ${eligible.length} approved!`, "success");
  });
}

// ── VENUES ────────────────────────────────────────────────────────────────
// venues[] now stores full objects: { id, name, capacity, location }
// currentVenueId is the authoritative key used for API calls and cache lookups.
// currentVenue (name string) is kept only for display / legacy helpers.
let venues = [];
let currentVenueId = null;
let currentVenue   = "";          // display name — kept in sync with currentVenueId
const venueBookings = {};         // keyed by venueId (number)
let currentMonth = new Date().getMonth();
let currentYear  = new Date().getFullYear();

async function loadVenues() {
  try {
    const data = await apiFetch("/venues");
    if (Array.isArray(data) && data.length) {
      venues        = data;                   // full objects
      currentVenueId = data[0].id;
      currentVenue   = data[0].name || "";
    }
  } catch (err) {
    console.error("Venue load error:", err);
  }

  renderVenueSidebar();
  await loadVenueBookings();
  renderCalendar();
}

function renderVenueSidebar() {
  const list = document.getElementById("venueList");
  if (!list) return;
  list.innerHTML = venues.map(v => `
    <div class="venue-list-item ${v.id === currentVenueId ? "active" : ""}"
         onclick="selectVenue(${v.id})">
      ${v.name || "Venue"}
    </div>
  `).join("");
}

async function selectVenue(venueId) {
  const v = venues.find(x => x.id === venueId);
  if (!v) return;
  currentVenueId = v.id;
  currentVenue   = v.name || "";
  renderVenueSidebar();
  await loadVenueBookings();
  renderCalendar();
}

async function loadVenueBookings() {
  if (!currentVenueId) return;
  try {
    const data = await apiFetch(
      `/venues/calendar?venue_id=${currentVenueId}&month=${currentMonth + 1}&year=${currentYear}`
    );

    // Only overwrite the cache after a successful (array) response so a failed
    // fetch doesn't wipe out previously loaded booking data.
    if (!Array.isArray(data)) return;

    venueBookings[currentVenueId] = {};
    if (!venueSlotStatus[currentVenue]) venueSlotStatus[currentVenue] = {};

    const PRIORITY = { booked: 3, "faculty-approved": 2, partial: 1.5, pending: 1, unavailable: 0.5, available: 0 };
    data.forEach(item => {
      const s        = (item.status || "available").toLowerCase();
      const existing = venueBookings[currentVenueId][item.day];
      if (!existing || (PRIORITY[s] ?? 0) > (PRIORITY[existing] ?? 0)) {
        venueBookings[currentVenueId][item.day] = s;
      }
      // Populate per-slot unavailability if the API ever returns that detail
      if (Array.isArray(item.unavail_slots) && item.unavail_slots.length) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`;
        const idxSet  = new Set();
        item.unavail_slots.forEach(startTime => {
          const hr  = parseInt((startTime || "").split(":")[0], 10);
          const idx = hr - 8;
          if (idx >= 0 && idx < TIME_SLOTS.length) idxSet.add(idx);
        });
        venueSlotStatus[currentVenue][dateStr] = idxSet;
      }
    });
  } catch (err) {
    console.error("Booking load error:", err);
  }
}

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarTitle");
  if (!grid || !title) return;

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  title.textContent = `${months[currentMonth]} ${currentYear}`;
  grid.innerHTML = "";

  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today       = new Date();
  const bookings    = venueBookings[currentVenueId] || {};

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "venue-day-empty";
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const status = bookings[d] || "available";
    const cell   = document.createElement("div");
    cell.className = `venue-day ${status}`;
    if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
      cell.classList.add("today");
    }
    // Hall coordinators can click to manage slot availability
    // Read-only statuses (booked = event approved) cannot be toggled manually
    const isManageable = isHallCoordinator && status !== "booked" && status !== "faculty-approved";
    if (isHallCoordinator) {
      cell.style.cursor = "pointer";
      cell.title = isManageable
        ? (status === "unavailable" ? "Click to mark Available" : "Click to mark Unavailable")
        : "This date has a booked/pending event — cannot change manually";
      if (isManageable) {
        cell.addEventListener("click", () => openSlotToggleModal(d, status));
      } else {
        cell.addEventListener("click", () => openSlotInfoModal(d, status, bookings[d + "_events"] || []));
      }
    }
    cell.innerHTML = `<span class="day-number">${d}</span><span class="day-dot"></span>${isHallCoordinator && isManageable ? '<span class="slot-edit-hint">✎</span>' : ''}${(() => {
      if (!isHallCoordinator || status !== "partial") return "";
      const dateKey = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const unavailCount = ((venueSlotStatus[currentVenue] || {})[dateKey] || new Set()).size;
      if (!unavailCount) return "";
      return `<span style="font-size:9px;color:var(--text-3);display:block;line-height:1;margin-top:2px;">${unavailCount}/${TIME_SLOTS.length}</span>`;
    })()}`;
    grid.appendChild(cell);
  }

  // Update legend to show editable hint for hall coordinators
  const legend = document.querySelector(".venue-match-legend");
  if (legend && isHallCoordinator) {
    const existingHint = legend.querySelector(".hc-edit-hint");
    if (!existingHint) {
      const hint = document.createElement("span");
      hint.className = "hc-edit-hint";
      hint.style.cssText = "font-size:11px;color:var(--text-3);margin-left:auto;";
      hint.innerHTML = `✎ Click a date to toggle availability`;
      legend.appendChild(hint);
    }
  }
}

// ── TIME SLOTS CONFIG ─────────────────────────────────────────────────────────
// All 1-hour slots from 08:00 to 21:00
const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 8; h < 21; h++) {
    const pad = n => String(n).padStart(2, "0");
    slots.push({ label: `${pad(h)}:00 – ${pad(h + 1)}:00`, start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` });
  }
  return slots;
})();

// Per-date, per-slot unavailability: venueSlotStatus[venue][dateStr] = Set of unavailable slot indices
const venueSlotStatus = {};

// ── SLOT MANAGEMENT MODAL (Hall Coordinator) ──────────────────────────────────
// Opens when clicking an available/unavailable date — shows all time slots
// so the coordinator can mark individual hours unavailable or re-open them.
function openSlotToggleModal(day, currentDayStatus) {
  document.getElementById("slotToggleModal")?.remove();

  const dateStr     = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const months      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const displayDate = `${day} ${months[currentMonth]} ${currentYear}`;

  // Get which slots are already marked unavailable for this date/venue
  const unavailSet  = (venueSlotStatus[currentVenue] || {})[dateStr] || new Set();

  // Find booked slots from cachedEvents / cachedHallProposals for this date
  const bookedSlotIndices = new Set();
  [...cachedEvents, ...cachedHallProposals].forEach(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    if (!d) return;
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (ds !== dateStr) return;
    if ((e.venue || "").toLowerCase().trim() !== (currentVenue || "").toLowerCase().trim()) return;
    const startHr = parseInt((e.time || e.event_time || e.start_time || "").split(":")[0], 10);
    if (!isNaN(startHr)) {
      const idx = startHr - 8;
      if (idx >= 0 && idx < TIME_SLOTS.length) bookedSlotIndices.add(idx);
    }
  });

  const modal = document.createElement("div");
  modal.id = "slotToggleModal";

  const slotsHtml = TIME_SLOTS.map((slot, i) => {
    const isBooked    = bookedSlotIndices.has(i);
    const isUnavail   = unavailSet.has(i);
    let cls = "slot-pill";
    let title = "";
    if (isBooked)  { cls += " slot-booked";    title = `title="Has a booked event"`; }
    else if (isUnavail) { cls += " slot-unavail"; title = `title="Click to re-open"`; }
    else               { cls += " slot-avail";   title = `title="Click to mark unavailable"`; }
    const disabled = isBooked ? "disabled" : "";
    return `<button class="${cls}" data-idx="${i}" ${title} ${disabled}>${slot.label}</button>`;
  }).join("");

  modal.innerHTML = `
    <div onclick="document.getElementById('slotToggleModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3001;background:var(--surface,#1a1a2e);border:1px solid rgba(139,92,246,.3);
      border-radius:20px;width:min(560px,95vw);max-height:90vh;overflow-y:auto;
      padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">

      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text);">🕐 Manage Time Slots</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px;">📍 ${currentVenue} &nbsp;·&nbsp; 📅 ${displayDate}</div>
        </div>
        <button onclick="document.getElementById('slotToggleModal').remove()"
          style="background:none;border:none;color:var(--text-3);font-size:20px;cursor:pointer;line-height:1;">✕</button>
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin:14px 0 16px;font-size:11px;color:var(--text-3);">
        <span style="display:flex;align-items:center;gap:5px;">
          <span style="width:10px;height:10px;border-radius:50%;background:#34d399;display:inline-block;"></span>Available
        </span>
        <span style="display:flex;align-items:center;gap:5px;">
          <span style="width:10px;height:10px;border-radius:50%;background:#f87171;display:inline-block;"></span>Unavailable
        </span>
        <span style="display:flex;align-items:center;gap:5px;">
          <span style="width:10px;height:10px;border-radius:50%;background:#ec4899;display:inline-block;"></span>Booked (event)
        </span>
      </div>

      <!-- Slot grid -->
      <div id="slotPillGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">
        ${slotsHtml}
      </div>

      <!-- Select-all helpers -->
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button onclick="slotSelectAll(true)"
          style="padding:6px 14px;border-radius:10px;border:1px solid rgba(239,68,68,.4);
            background:rgba(239,68,68,.1);color:#f87171;font-size:12px;font-weight:700;cursor:pointer;">
          🚫 Block all slots
        </button>
        <button onclick="slotSelectAll(false)"
          style="padding:6px 14px;border-radius:10px;border:1px solid rgba(16,185,129,.4);
            background:rgba(16,185,129,.1);color:#34d399;font-size:12px;font-weight:700;cursor:pointer;">
          ✅ Open all slots
        </button>
      </div>

      <!-- Note -->
      <div style="margin-bottom:18px;">
        <label style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;
          letter-spacing:.6px;display:block;margin-bottom:6px;">
          Note <span style="font-weight:400;opacity:.7;">(optional)</span>
        </label>
        <input id="slotToggleNote" type="text" placeholder="e.g. Maintenance, Reserved for exam…"
          style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);
            background:var(--surface-2);color:var(--text);font-size:13px;
            font-family:var(--font,inherit);outline:none;box-sizing:border-box;" />
      </div>

      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('slotToggleModal').remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);
            background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">
          Cancel
        </button>
        <button onclick="confirmSlotToggle('${dateStr}')"
          style="flex:1;padding:10px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">
          💾 Save Changes
        </button>
      </div>
    </div>

    <style>
      .slot-pill {
        padding: 7px 13px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid;
        font-family: var(--font, inherit);
        transition: opacity .15s, transform .1s;
        white-space: nowrap;
      }
      .slot-pill:active { transform: scale(.96); }
      .slot-pill.slot-avail {
        background: rgba(16,185,129,.15);
        border-color: rgba(16,185,129,.4);
        color: #34d399;
      }
      .slot-pill.slot-avail:hover { background: rgba(16,185,129,.28); }
      .slot-pill.slot-unavail {
        background: rgba(239,68,68,.18);
        border-color: rgba(239,68,68,.45);
        color: #f87171;
      }
      .slot-pill.slot-unavail:hover { background: rgba(239,68,68,.32); }
      .slot-pill.slot-booked {
        background: rgba(236,72,153,.15);
        border-color: rgba(236,72,153,.35);
        color: #f472b6;
        cursor: not-allowed;
        opacity: .7;
      }
    </style>
  `;

  document.body.appendChild(modal);

  // Attach click handlers to slot pills
  document.querySelectorAll(".slot-pill:not(.slot-booked)").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("slot-avail");
      btn.classList.toggle("slot-unavail");
    });
  });
}

// Helper: block or open all non-booked slots
function slotSelectAll(markUnavailable) {
  document.querySelectorAll(".slot-pill:not(.slot-booked)").forEach(btn => {
    btn.classList.toggle("slot-unavail", markUnavailable);
    btn.classList.toggle("slot-avail",   !markUnavailable);
  });
}

async function confirmSlotToggle(dateStr) {
  const note = document.getElementById("slotToggleNote")?.value.trim() || null;

  // Collect which slots are now marked unavailable
  const unavailIndices = [];
  const availIndices   = [];
  document.querySelectorAll(".slot-pill:not(.slot-booked)").forEach(btn => {
    const idx = parseInt(btn.dataset.idx, 10);
    if (btn.classList.contains("slot-unavail")) unavailIndices.push(idx);
    else availIndices.push(idx);
  });

  // Map indices → slot time strings
  const unavailSlots = unavailIndices.map(i => TIME_SLOTS[i]);
  const availSlots   = availIndices.map(i => TIME_SLOTS[i]);

  // Determine overall day status for the calendar cell:
  // all unavail → "unavailable", any unavail → "unavailable" (partial maps to unavailable
  // because the backend only accepts: available | unavailable | maintenance), else → "available"
  const totalManageable = unavailIndices.length + availIndices.length;
  const newDayStatus = unavailIndices.length === 0 ? "available" : "unavailable";

  // For the local calendar display we still use "partial" when only some slots are blocked
  const localDayStatus = unavailIndices.length === 0
    ? "available"
    : unavailIndices.length === totalManageable
      ? "unavailable"
      : "partial";

  // Find venue id from cached hall venues
  const venueObj = cachedHallVenues.find(v =>
    (v.name || "").toLowerCase().trim() === (currentVenue || "").toLowerCase().trim()
  );
  const venueId = venueObj?.id || null;

  const day = parseInt(dateStr.split("-")[2], 10);

  // Persist to server — use /availability directly (no /slots route exists on backend)
  let success = false;
  if (venueId) {
    const res = await apiFetch(`/faculty/hall/venues/${venueId}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ status: newDayStatus, date: dateStr, note }),
    });
    success = res !== null;
  }
  // If no venueId, we can't persist (non-hall-coordinator venue), just update locally

  document.getElementById("slotToggleModal")?.remove();

  // Always update local cache so UI reflects changes immediately
  // (use localDayStatus which can be "partial" for the calendar cell colour)
  if (!venueBookings[currentVenueId]) venueBookings[currentVenueId] = {};
  venueBookings[currentVenueId][day] = localDayStatus;

  if (!venueSlotStatus[currentVenue]) venueSlotStatus[currentVenue] = {};
  const newUnavailSet = new Set(unavailIndices);
  venueSlotStatus[currentVenue][dateStr] = newUnavailSet;

  renderCalendar();

  if (success) {
    const totalUnavail = unavailIndices.length;
    showToast(
      totalUnavail === 0
        ? "✅ All slots opened for this date"
        : `🚫 ${totalUnavail} slot${totalUnavail > 1 ? "s" : ""} marked unavailable`,
      "success"
    );
  } else {
    showToast("⚠️ Saved locally — server sync may have failed.", "info");
  }
}

// Modal showing info for booked/pending slots (read-only for hall coordinator)
function openSlotInfoModal(day, status, events) {
  document.getElementById("slotInfoModal")?.remove();
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const displayDate = `${day} ${months[currentMonth]} ${currentYear}`;
  const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  // Find events for this date from cachedEvents and cachedHallProposals
  const allBookedEvents = [...cachedEvents, ...cachedHallProposals].filter(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    if (!d) return false;
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return ds === dateStr && (e.venue || "").toLowerCase().trim() === (currentVenue || "").toLowerCase().trim();
  });

  const statusColor = status === "booked"
    ? "rgba(239,68,68,.35)" : "rgba(6,182,212,.35)";
  const statusLabel = status === "booked" ? "🔴 Booked" : "🔵 Pending Approval";

  const modal = document.createElement("div");
  modal.id = "slotInfoModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('slotInfoModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3001;background:var(--surface,#1a1a2e);
      border:1px solid ${statusColor};
      border-radius:20px;width:min(460px,92vw);max-height:80vh;overflow-y:auto;
      padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text);">📅 ${displayDate}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px;">
            📍 ${currentVenue} · ${statusLabel}
          </div>
        </div>
        <button onclick="document.getElementById('slotInfoModal').remove()"
          style="background:none;border:none;color:var(--text-3);font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:14px;">
        This date cannot be manually changed as it has a ${status === "booked" ? "confirmed booking" : "pending approval"}.
      </div>
      ${allBookedEvents.length ? `
        <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Events on this date</div>
        ${allBookedEvents.map(e => `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:700;color:var(--text);">${e.title || "Untitled"}</div>
            <div style="font-size:11px;color:var(--text-3);margin-top:3px;">${e.club || e.organizer || "—"} · ${formatTime(e.time || e.event_time || e.start_time)}</div>
          </div>
        `).join("")}
      ` : `<div style="font-size:13px;color:var(--text-3);">No event details available.</div>`}
      <button onclick="document.getElementById('slotInfoModal').remove()"
        style="width:100%;margin-top:16px;padding:10px;border-radius:11px;border:1px solid var(--border-2);
          background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">
        Close
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

document.getElementById("prevMonth")?.addEventListener("click", async () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await loadVenueBookings();
  renderCalendar();
});

document.getElementById("nextMonth")?.addEventListener("click", async () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await loadVenueBookings();
  renderCalendar();
});

// ── SEARCH & FILTER ───────────────────────────────────────────────────────
function initSearchFilters() {
  document.getElementById("proposalSearch")?.addEventListener("input", debounce(e =>
    renderProposals(document.getElementById("proposalFilter")?.value, e.target.value.toLowerCase(), document.getElementById("proposalCategoryFilter")?.value)
  ));

  document.getElementById("eventListSearch")?.addEventListener("input", debounce(e =>
    renderEventList(e.target.value.toLowerCase())
  ));

  document.getElementById("feedbackSearch")?.addEventListener("input", debounce(e =>
    renderFeedback(e.target.value.toLowerCase())
  ));

  document.getElementById("notifTypeFilter")?.addEventListener("change", renderNotifHistory);

  document.getElementById("allClubsSearch")?.addEventListener("input", debounce(e =>
    renderAllClubs(e.target.value.toLowerCase(), document.getElementById("allClubsCategory")?.value)
  ));
  document.getElementById("allClubsCategory")?.addEventListener("change", e =>
    renderAllClubs(document.getElementById("allClubsSearch")?.value.toLowerCase(), e.target.value)
  );
}

// ── ALL CLUBS FILTERS ─────────────────────────────────────────────────────
function initAllClubsFilters() {
  const searchInput = document.getElementById("allClubsSearch");
  const categorySelect = document.getElementById("allClubsCategory");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderAllClubs(searchInput.value.toLowerCase(), categorySelect?.value || "all");
    });
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      renderAllClubs(searchInput?.value.toLowerCase() || "", categorySelect.value);
    });
  }
}

// ── THEME ─────────────────────────────────────────────────────────────────
function applyTheme() {
  const saved = localStorage.getItem("evexa_theme");
  if (saved === "light") document.body.classList.add("light");
  updateThemeBtn();
}
function toggleTheme() {
  document.body.classList.toggle("light");
  localStorage.setItem("evexa_theme", document.body.classList.contains("light") ? "light" : "dark");
  updateThemeBtn();
}
function updateThemeBtn() {
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = document.body.classList.contains("light") ? "🌙" : "☀️";
}

// ── LOGOUT ────────────────────────────────────────────────────────────────
function logout() {
  const modal = document.createElement("div");
  modal.innerHTML = `
    <div onclick="this.parentElement.remove()" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;background:rgba(10,13,28,.97);border:1px solid rgba(139,92,246,.28);border-radius:24px;width:min(370px,90vw);padding:30px 26px;box-shadow:var(--shadow-lg);text-align:center;backdrop-filter:var(--blur);">
      <div style="font-size:38px;margin-bottom:10px;">👋</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:6px;">Logging out?</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:24px;">Are you sure you want to sign out of your faculty account?</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="this.closest('div[style*=fixed]').parentElement.remove()" style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Cancel</button>
        <button onclick="localStorage.removeItem('faculty_auth_token');window.location.href='fcsignin.html';" style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Yes, Logout</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", esc); } });
}

// ── BADGES ────────────────────────────────────────────────────────────────
function updateBadges() {
  // Faculty Coordinator badge: proposals waiting for their review (status = submitted)
  const facultyPending = cachedProposals.filter(p => {
    const s = (p.status || "").toLowerCase().trim();
    return s === STATUS.SUBMITTED;
  }).length;

  // Hall Coordinator badge: faculty_approved proposals waiting for venue confirm
  const hallPending = cachedHallProposals.length;

  updateBadge("badge-proposals", facultyPending);
  updateBadge("badge-pending",   facultyPending);
  updateBadge("badge-hall-proposals", hallPending);

  // Hide Analytics nav item for faculty with no club assignments —
  // they have no data to view so the page would just show an empty state.
  // The item is restored automatically when clubs are assigned (on next refresh).
  const analyticsNavItem = document.querySelector(".nav-item[data-page='analytics']");
  if (analyticsNavItem) {
    analyticsNavItem.style.display = cachedClubs.length ? "" : "none";
  }
}
function updateBadge(id, count) {
  const el2 = document.getElementById(id);
  if (el2) { el2.textContent = count > 0 ? count : "–"; el2.style.opacity = count > 0 ? "1" : "0.4"; }
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function el(id) {
  const e = document.getElementById(id);
  if (!e) return null;
  e.text = v => { e.textContent = v; return e; };
  return e;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : "—"; }

function parseEventDate(value) {
  if (!value) return null;

  // mysql2 returns DATE columns as JS Date objects already converted to UTC midnight.
  // In IST (UTC+5:30) that shifts the date one day back when using getDate()/getMonth().
  // Re-extract via UTC methods and build a local-timezone date to keep the correct day.
  if (value instanceof Date) {
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  // Plain date string "YYYY-MM-DD" — construct in local time (no UTC shift)
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // ISO datetime string — strip to date part and build locally to avoid UTC shift
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtDate(d) {
  const dt = parseEventDate(d);
  if (!dt) return "—";
  try { return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function starStr(rating) {
  const r = Math.round(rating || 0);
  return "★".repeat(r) + "☆".repeat(Math.max(0, 5 - r));
}

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3000);
}

function debounce(fn, ms = 280) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function tryChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === "undefined") return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  new Chart(canvas, config);
}

// ── CLUB FILTER HELPERS ───────────────────────────────────────────────────
function setSelectedClub(clubId) { selectedClubId = clubId ?? "all"; }
function getSelectedClub() {
  if (selectedClubId === "all") return null;
  return cachedClubs.find(c => String(c.id ?? c.club_id ?? "") === String(selectedClubId)) || null;
}

function matchesSelectedClub(item) {
  if (selectedClubId === "all") return true;
  const sc = getSelectedClub();
  if (!sc) return false;
  return eventMatchesClub(item, sc);
}

// ── PARTICIPANT DOWNLOAD (event list table button) ────────────────────────
async function downloadParticipants(eventId) {
  try {
    const data = await apiFetch(`/faculty/events/${eventId}/participants`);
    if (!data || !data.length) { showToast("No participants found.", "error"); return; }

    const headers = ["Name", "Email", "Department", "Phone"];
    const rows = data.map(p => [p.name, p.email, p.department, p.phone_no || p.phone]);
    const csv = "data:text/csv;charset=utf-8," + [headers, ...rows].map(r => r.join(",")).join("\n");

    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `event_${eventId}_participants.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("⬇️ Download started!", "success");
  } catch (err) {
    console.error(err);
    showToast("Download failed.", "error");
  }
}

// ── ACCOUNT SETTINGS (merged from account-settings.js) ───────────────────

function asSetMsg(text, isError = false) {
  const el = document.getElementById("asFormMsg");
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "as-msg error" : "as-msg";
}

function asGetInitials(name) {
  return (name || "FA")
    .split(" ")
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function asUpdatePreviewName() {
  const nameInput = document.getElementById("asName");
  const avatar    = document.getElementById("asProfileAvatar");
  const preview   = document.getElementById("asProfileNamePreview");
  if (!nameInput || !avatar || !preview) return;
  const name = nameInput.value.trim() || "Faculty Name";
  preview.textContent = name;
  avatar.textContent  = asGetInitials(name);
}

function asLoadProfile() {
  // Re-use already-cached profile from the dashboard boot
  const p = cachedProfile;
  if (!p) { asSetMsg("Failed to load profile.", true); return; }

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
  set("asFacultyNo",  p.faculty_no);
  set("asDepartment", p.department);
  set("asName",       p.name);
  set("asEmail",      p.email);
  set("asPhone",      p.phone_no || p.phone);

  const avatar  = document.getElementById("asProfileAvatar");
  const preview = document.getElementById("asProfileNamePreview");
  if (avatar)  avatar.textContent  = asGetInitials(p.name);
  if (preview) preview.textContent = p.name || "Faculty Name";
}

async function asSaveProfile(e) {
  e.preventDefault();

  const g = id => document.getElementById(id)?.value.trim() || "";
  const name            = g("asName");
  const email           = g("asEmail");
  const department      = g("asDepartment");
  const phone           = g("asPhone");
  const currentPassword = g("asCurrentPassword");
  const newPassword     = g("asNewPassword");
  const confirmPassword = g("asConfirmPassword");

  if (!name || !email || !department || !phone) {
    asSetMsg("Please fill all required fields.", true); return;
  }

  const wantsPwChange = currentPassword || newPassword || confirmPassword;
  if (wantsPwChange) {
    if (!currentPassword || !newPassword || !confirmPassword) {
      asSetMsg("Fill all password fields to change password.", true); return;
    }
    if (newPassword !== confirmPassword) {
      asSetMsg("New password and confirm password do not match.", true); return;
    }
    if (newPassword.length < 6) {
      asSetMsg("New password must be at least 6 characters.", true); return;
    }
  }

  const payload = { name, email, department, phone_no: phone };
  if (wantsPwChange) {
    payload.current_password = currentPassword;
    payload.new_password     = newPassword;
  }

  const submitBtn = document.querySelector("#asAccountForm button[type='submit']");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }
  asSetMsg("");

  const res = await apiFetch("/faculty/me", { method: "PUT", body: JSON.stringify(payload) });

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Changes"; }

  if (!res) { asSetMsg("Failed to update profile.", true); return; }

  // Clear password fields
  ["asCurrentPassword", "asNewPassword", "asConfirmPassword"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });

  // Update cached profile and topbar/sidebar UI
  cachedProfile = { ...cachedProfile, name, email, department, phone_no: phone };
  const initials = asGetInitials(name);
  document.getElementById("miniName")?.replaceChildren
    ? (document.getElementById("miniName").textContent  = name) : null;
  document.getElementById("topAvatar") && (document.getElementById("topAvatar").textContent = initials);
  document.getElementById("miniAvatar") && (document.getElementById("miniAvatar").textContent = initials);

  asUpdatePreviewName();
  asSetMsg("Profile updated successfully.");
  showToast("✅ Profile updated!", "success");
}

function initAccountSettings() {
  const form = document.getElementById("asAccountForm");
  if (!form) return;
  // Guard: only bind once
  if (form.dataset.asBound) return;
  form.dataset.asBound = "1";
  form.addEventListener("submit", asSaveProfile);
  document.getElementById("asName")?.addEventListener("input", asUpdatePreviewName);
}

// ── HALL COORDINATOR — render functions ══════════════════════════════════════════════════════════════════════════════

// ── HALL PROPOSALS ────────────────────────────────────────────────────────────
async function renderHallProposals() {
  // ── Role guard ─────────────────────────────────────────────────────────────
  // Only faculty assigned to at least one venue (hall coordinators) may use this
  // page. All other roles are silently bounced to the dashboard.
  if (!isHallCoordinator) {
    console.warn("[renderHallProposals] Access denied — not a hall coordinator.");
    navigateTo("dashboard");
    return;
  }
  // Guard: Hall coordinator should NOT see `submitted` proposals — only `faculty_approved`
  ensureHallPages();

  const tbody = document.getElementById("hallProposalsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="td-empty">Loading…</td></tr>`;

  const fresh = await apiFetch("/faculty/hall/proposals");
  // Backend must return only `faculty_approved` proposals — enforce client-side guard too
  cachedHallProposals = (Array.isArray(fresh) ? fresh : []).filter(p => {
    const s = (p.status || "").toLowerCase().trim();
    // Accept faculty_approved; also accept legacy "forwarded" from older backends
    return s === STATUS.FACULTY_APPROVED || s === "forwarded";
  });
  updateBadges();

  if (!cachedHallProposals.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="td-empty">No proposals awaiting venue confirmation.<br>
      <small style="opacity:.6;">Only proposals approved by the Faculty Coordinator appear here.</small>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = cachedHallProposals.map(p => `
    <tr>
      <td><span class="ev-name" onclick="showHallProposalDetail(${p.id})">${p.title || "Untitled"}</span></td>
      <td>${p.club || p.organizer || "—"}</td>
      <td>${p.organizer || "—"}</td>
      <td>${fmtDate(p.event_date)}</td>
      <td><strong>${p.venue || "—"}</strong></td>
      <td>${p.capacity || "—"}</td>
      <td>
        <span class="badge faculty-approved" style="background:rgba(6,182,212,.18);color:#67e8f9;border:1px solid rgba(6,182,212,.35);">
          🔵 Pending Hall
        </span>
      </td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="mini-btn approve" onclick="approveHallProposal(${p.id})">✅ Confirm</button>
          <button class="mini-btn reject"  onclick="rejectHallProposalPrompt(${p.id})">❌ Reject</button>
          <button class="mini-btn"         onclick="showHallProposalDetail(${p.id})">👁</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function showHallProposalDetail(id) {
  const p = cachedHallProposals.find(x => x.id === id);
  if (!p) return;

  // Remove any existing modal
  document.getElementById("hallDetailModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "hallDetailModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('hallDetailModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3001;background:var(--surface,#1a1a2e);border:1px solid rgba(6,182,212,.35);
      border-radius:20px;width:min(580px,94vw);max-height:88vh;overflow-y:auto;
      padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
        <div>
          <div style="font-size:17px;font-weight:800;color:var(--text);">${p.title || "Event Details"}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px;">${p.club || "—"} · Forwarded by Faculty Coordinator</div>
        </div>
        <button onclick="document.getElementById('hallDetailModal').remove()"
          style="background:none;border:none;color:var(--text-3);font-size:20px;cursor:pointer;padding:0;">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        ${[
          ["📍 Venue",       p.venue       || "—"],
          ["📅 Date",        fmtDate(p.event_date)],
          ["🕐 Time",        formatTime(p.event_time)],
          ["👥 Capacity",    p.capacity    || "—"],
          ["🏷️ Category",   p.category    || "—"],
          ["💰 Fee",         p.registration_fee > 0 ? "₹" + p.registration_fee : "Free"],
          ["🎪 Organizer",   p.organizer   || "—"],
          ["🏛️ Club",       p.club        || "—"],
        ].map(([l, v]) => `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px;">${l}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text);">${v}</div>
          </div>
        `).join("")}
      </div>

      ${p.description ? `
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:18px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">📝 Description</div>
        <div style="font-size:13px;color:var(--text);line-height:1.6;">${p.description}</div>
      </div>` : ""}

      <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">Venue Confirmation</div>
      <textarea id="hallDetailRemark" rows="3" placeholder="Add a remark (required when rejecting)…"
        style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);
          background:var(--surface-2);color:var(--text);font-size:13px;
          font-family:var(--font,inherit);resize:vertical;outline:none;
          margin-bottom:12px;box-sizing:border-box;"></textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="approveHallProposalFromModal(${p.id})"
          style="flex:1;padding:11px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#10b981,#059669);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">
          ✅ Confirm Venue
        </button>
        <button onclick="rejectHallProposalFromModal(${p.id})"
          style="flex:1;padding:11px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">
          ❌ Reject Proposal
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function approveHallProposal(id) {
  const res = await apiFetch(`/faculty/hall/proposals/${id}/approve`, { method: "PATCH" });
  if (res !== null) {
    // Update local cache to hall_approved
    const p = cachedHallProposals.find(x => x.id === id);
    if (p) p.status = STATUS.HALL_APPROVED;
    addLocalNotif("event", "✅", "Venue Confirmed — Event Fully Approved", `Hall approval granted for "${p?.title || `event #${id}`}". Organizer has been notified.`, id);
    showToast("✅ Venue confirmed — event fully approved!", "success");
    renderHallProposals();
    renderDashboard();
    // Refresh venue calendar so the approved date shows as booked
    await syncApprovedEventToVenueCalendar(p);
  } else {
    showToast("Failed to confirm venue.", "error");
  }
}

async function approveHallProposalFromModal(id) {
  const remark = document.getElementById("hallDetailRemark")?.value.trim() || "";
  const res = await apiFetch(`/faculty/hall/proposals/${id}/approve`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = cachedHallProposals.find(x => x.id === id);
    if (p) p.status = STATUS.HALL_APPROVED;
    document.getElementById("hallDetailModal")?.remove();
    addLocalNotif("event", "✅", "Venue Confirmed — Event Fully Approved", `Hall approval granted for "${p?.title || `event #${id}`}". Organizer has been notified.`, id);
    showToast("✅ Venue confirmed — event fully approved!", "success");
    renderHallProposals();
    // Refresh venue calendar so the approved date shows as booked
    await syncApprovedEventToVenueCalendar(p);
  } else {
    showToast("Failed to confirm venue.", "error");
  }
}

function rejectHallProposalPrompt(id) {
  const p = cachedHallProposals.find(x => x.id === id);
  if (!p) return;

  document.getElementById("hallRejectModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "hallRejectModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('hallRejectModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3100;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3101;background:var(--surface,#1a1a2e);border:1px solid rgba(239,68,68,.35);
      border-radius:20px;width:min(440px,92vw);padding:28px 24px;
      box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:4px;">❌ Reject Venue Request</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:18px;">${p.title || "Event"} — ${p.venue || "—"}</div>
      <label style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;">
        Reason for Rejection <span style="color:#f87171;">*</span>
      </label>
      <textarea id="hallRejectRemark" rows="4" placeholder="e.g. Venue already booked for this date…"
        style="width:100%;margin:6px 0 18px;padding:10px 12px;border-radius:10px;
          border:1px solid rgba(239,68,68,.35);background:var(--surface-2,#0d0d1a);
          color:var(--text);font-size:13px;font-family:var(--font,inherit);
          resize:vertical;outline:none;box-sizing:border-box;"></textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('hallRejectModal').remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);
            background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">
          Cancel
        </button>
        <button onclick="submitHallReject(${p.id})"
          style="flex:1;padding:10px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;">
          Confirm Rejection
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById("hallRejectRemark")?.focus();
}

async function submitHallReject(id) {
  const remark = document.getElementById("hallRejectRemark")?.value.trim();
  if (!remark) {
    showToast("Please enter a reason for rejection.", "error");
    return;
  }
  const res = await apiFetch(`/faculty/hall/proposals/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = cachedHallProposals.find(x => x.id === id);
    if (p) p.status = STATUS.REJECTED;
    document.getElementById("hallRejectModal")?.remove();
    addLocalNotif("event", "❌", "Hall Proposal Rejected", `"${p?.title || `Event #${id}`}" venue request rejected. Organizer has been notified.`, id);
    showToast("❌ Proposal rejected.", "error");
    renderHallProposals();
  } else {
    showToast("Failed to reject proposal.", "error");
  }
}

async function rejectHallProposalFromModal(id) {
  const remark = document.getElementById("hallDetailRemark")?.value.trim();
  if (!remark) {
    showToast("Please add a remark before rejecting.", "error");
    document.getElementById("hallDetailRemark")?.focus();
    return;
  }
  const res = await apiFetch(`/faculty/hall/proposals/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = cachedHallProposals.find(x => x.id === id);
    if (p) p.status = STATUS.REJECTED;
    document.getElementById("hallDetailModal")?.remove();
    addLocalNotif("event", "❌", "Hall Proposal Rejected", `"${p?.title || `Event #${id}`}" venue request rejected.`, id);
    showToast("❌ Proposal rejected.", "error");
    renderHallProposals();
  } else {
    showToast("Failed to reject.", "error");
  }
}

// ── SYNC APPROVED EVENT TO VENUE CALENDAR ─────────────────────────────────────
// Called after a hall proposal is approved. Updates the in-memory venueBookings
// cache for the event's venue+date so the Venue Management calendar immediately
// reflects the new booking without requiring a manual refresh.
async function syncApprovedEventToVenueCalendar(proposal) {
  if (!proposal) return;

  const eventDate = parseEventDate(proposal.event_date || proposal.date || proposal.start_date);
  const venueName = (proposal.venue || "").trim();

  if (!eventDate || !venueName) return;

  const evYear  = eventDate.getFullYear();
  const evMonth = eventDate.getMonth();
  const evDay   = eventDate.getDate();

  // Always update the venueBookings in-memory cache so the calendar
  // shows "booked" if it happens to be the currently displayed month/venue.
  const venueObj2 = venues.find(v => (v.name || "").toLowerCase().trim() === venueName.toLowerCase().trim());
  const cacheKey  = venueObj2?.id ?? venueName;   // fall back to name if id not found
  if (!venueBookings[cacheKey]) venueBookings[cacheKey] = {};
  venueBookings[cacheKey][evDay] = "booked";

  // Also add to cachedEvents so renderVenueUpcomingBookings picks it up
  const alreadyCached = cachedEvents.find(e => e.id === proposal.id);
  if (!alreadyCached) {
    cachedEvents.push({ ...proposal, status: STATUS.HALL_APPROVED });
  } else {
    alreadyCached.status = STATUS.HALL_APPROVED;
  }

  // If the Venue Management page is currently open and showing the same venue/month,
  // re-render the calendar live so the coordinator sees the update immediately.
  if (currentPage === "venues") {
    if (
      currentVenue.toLowerCase().trim() === venueName.toLowerCase().trim() &&
      currentMonth === evMonth &&
      currentYear  === evYear
    ) {
      // Reload from server to get the authoritative state, then re-render
      await loadVenueBookings();
      renderCalendar();
    }
  }

  // Also refresh the My Venues page (hall-venues) upcoming bookings table if open
  if (currentPage === "hall-venues") {
    renderHallVenues();
  }
}

// ── HALL VENUES ───────────────────────────────────────────────────────────────
async function renderHallVenues() {
  // ── Role guard ─────────────────────────────────────────────────────────────
  // Only hall coordinators (faculty with assigned venues) may manage venues.
  if (!isHallCoordinator) {
    console.warn("[renderHallVenues] Access denied — not a hall coordinator.");
    navigateTo("dashboard");
    return;
  }
  ensureHallPages();

  const container = document.getElementById("hallVenuesContainer");
  if (!container) return;
  container.innerHTML = `<div class="list-empty" style="padding:20px;">Loading venues…</div>`;

  const fresh = await apiFetch("/faculty/hall/venues");
  cachedHallVenues = Array.isArray(fresh) ? fresh : [];

  if (!cachedHallVenues.length) {
    container.innerHTML = `<div class="list-empty" style="padding:20px;">No venues assigned to you.</div>`;
    return;
  }

  const STATUS_COLOR = {
    available:    "rgba(16,185,129,.18);color:#34d399;border:1px solid rgba(16,185,129,.35)",
    unavailable:  "rgba(239,68,68,.18);color:#f87171;border:1px solid rgba(239,68,68,.35)",
    maintenance:  "rgba(245,158,11,.18);color:#fcd34d;border:1px solid rgba(245,158,11,.35)",
  };

  container.innerHTML = cachedHallVenues.map(v => {
    const ALLOWED_STATUSES = ["available", "unavailable", "maintenance"];
    const st = ALLOWED_STATUSES.includes((v.status || "").toLowerCase())
      ? (v.status || "available").toLowerCase()
      : "available";
    const styleStr = STATUS_COLOR[st] || STATUS_COLOR.available;
    return `
      <div class="panel" style="margin-bottom:18px;">
        <div class="panel-header">
          <div>
            <div class="panel-title">🏟️ ${v.name || "Venue"}</div>
            <div class="panel-sub">Capacity: ${v.capacity || "—"} · ${v.description || "Hall Venue"}</div>
          </div>
          <span class="badge" style="background:${styleStr};">${cap(st)}</span>
        </div>
        <div class="panel-body">

          ${v.coordinator_note ? `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;
            padding:10px 14px;margin-bottom:16px;font-size:13px;color:var(--text-3);">
            📝 Note: ${v.coordinator_note}
          </div>` : ""}

          <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;
            letter-spacing:.6px;margin-bottom:10px;">Update Availability</div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px;">Status</label>
              <select id="venueStatus_${v.id}" class="filter-select" style="min-width:140px;">
                <option value="available"   ${st === 'available'   ? 'selected' : ''}>✅ Available</option>
                <option value="unavailable" ${st === 'unavailable' ? 'selected' : ''}>🚫 Unavailable</option>
                <option value="maintenance" ${st === 'maintenance' ? 'selected' : ''}>🔧 Maintenance</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px;">
                Specific Date <span style="font-weight:400;">(optional — leave blank for general)</span>
              </label>
              <input type="date" id="venueDate_${v.id}"
                style="padding:8px 12px;border-radius:10px;border:1px solid var(--border-2);
                  background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);
                  outline:none;" />
            </div>
            <div style="flex:1;min-width:160px;">
              <label style="font-size:11px;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px;">Note</label>
              <input type="text" id="venueNote_${v.id}" placeholder="Optional note…"
                value="${(v.coordinator_note || "").replace(/"/g, "&quot;")}"
                style="width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--border-2);
                  background:var(--surface-2);color:var(--text);font-size:13px;
                  font-family:var(--font,inherit);outline:none;box-sizing:border-box;" />
            </div>
            <button class="btn primary" onclick="saveVenueAvailability(${v.id})"
              style="white-space:nowrap;padding:9px 18px;">
              💾 Save
            </button>
          </div>

          <!-- Upcoming bookings for this venue -->
          <div style="margin-top:18px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;
              letter-spacing:.6px;margin-bottom:10px;">Upcoming Bookings</div>
            <div id="hallVenueBookings_${v.id}">
              ${renderVenueUpcomingBookings(v.name)}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderVenueUpcomingBookings(venueName) {
  const now = new Date();
  const upcoming = cachedEvents.filter(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    return d && d >= now && (e.venue || "").toLowerCase().trim() === (venueName || "").toLowerCase().trim();
  }).sort((a, b) => {
    const da = parseEventDate(a.date || a.event_date || a.start_date);
    const db = parseEventDate(b.date || b.event_date || b.start_date);
    return (da || 0) - (db || 0);
  });

  if (!upcoming.length) {
    return `<div style="font-size:13px;color:var(--text-3);padding:8px 0;">No upcoming bookings.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Club</th>
            <th>Date</th>
            <th>Time</th>
            <th>Capacity</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${upcoming.slice(0, 5).map(e => `
            <tr>
              <td><span class="ev-name">${e.title || "Untitled"}</span></td>
              <td>${e.club || e.organizer || "—"}</td>
              <td>${fmtDate(e.date || e.event_date || e.start_date)}</td>
              <td>${formatTime(e.time || e.start_time)}</td>
              <td>${e.capacity || "—"}</td>
              <td><span class="badge ${(e.status || "approved").toLowerCase()}">${cap(e.status || "Approved")}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function saveVenueAvailability(venueId) {
  const status = document.getElementById(`venueStatus_${venueId}`)?.value;
  const date   = document.getElementById(`venueDate_${venueId}`)?.value || null;
  const note   = document.getElementById(`venueNote_${venueId}`)?.value.trim() || null;

  const ALLOWED_STATUSES = ["available", "unavailable", "maintenance"];
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    showToast("Please select a valid status.", "error");
    return;
  }

  const res = await apiFetch(`/faculty/hall/venues/${venueId}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ status, note, date }),
  });

  if (res !== null) {
    showToast("💾 Venue availability updated!", "success");
    renderHallVenues();
  } else {
    showToast("Failed to update venue.", "error");
  }
}

// ── ENSURE HALL PAGES EXIST IN DOM ───────────────────────────────────────────
// Creates pg-hall-proposals and pg-hall-venues if not already present.
function ensureHallPages() {
  const content = document.getElementById("content");
  if (!content) return;

  if (!document.getElementById("pg-hall-proposals")) {
    const pg = document.createElement("div");
    pg.id = "pg-hall-proposals";
    pg.className = "page-section";
    pg.style.display = "none";
    pg.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="panel-title">🏛️ Hall Proposals — Awaiting Venue Confirmation</div>
            <div class="panel-sub">These proposals have been reviewed by the Faculty Coordinator and are pending your venue confirmation.</div>
          </div>
          <button class="btn ghost sm" onclick="renderHallProposals()">🔄 Refresh</button>
        </div>

        <div style="padding:10px 16px 0;">
          <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 14px;
            border-radius:10px;background:rgba(6,182,212,.1);border:1px solid rgba(6,182,212,.25);
            font-size:12px;color:#67e8f9;margin-bottom:14px;">
            ℹ️ <span>As Hall Coordinator, you confirm or reject venue availability for the events listed below.
            Approval here sets the event status to <strong>Approved</strong>.</span>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Club</th>
                <th>Organizer</th>
                <th>Date</th>
                <th>Venue</th>
                <th>Capacity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="hallProposalsBody">
              <tr><td colspan="8" class="td-empty">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    content.appendChild(pg);
  }

  if (!document.getElementById("pg-hall-venues")) {
    const pg = document.createElement("div");
    pg.id = "pg-hall-venues";
    pg.className = "page-section";
    pg.style.display = "none";
    pg.innerHTML = `
      <div style="margin-bottom:20px;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;
          border-radius:12px;background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.25);
          font-size:12px;color:#c4b5fd;">
          🏟️ <span>Manage venue availability for halls under your coordination. 
          Changes take effect immediately and are visible to all organizers.</span>
        </div>
      </div>
      <div id="hallVenuesContainer">
        <div class="list-empty" style="padding:20px;">Loading venues…</div>
      </div>
    `;
    content.appendChild(pg);
  }
}


boot();
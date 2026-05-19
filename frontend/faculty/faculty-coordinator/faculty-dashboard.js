var API = "https://evexa-production.up.railway.app/api";
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
    pending:          "submitted",
    approved:         "approved",
    review:           "submitted",
  };
  return map[s] || s;
}

function statusLabel(status) {
  const s = (status || "").toLowerCase().trim();
  return STATUS_LABEL[s] || cap(status) || "—";
}

/* ── auth fetch ── */
async function apiFetch(endpoint, opts = {}, _retry = false) {
  const token = localStorage.getItem("faculty_auth_token");
  if (!token) { window.location.href = "/faculty/fcsignin.html"; return null; }

  try {
    const base = (typeof API !== "undefined" ? API : window.API) || "https://evexa-production.up.railway.app/api";
    const res = await fetch(`${base}${endpoint}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    // 401 = expired/invalid token → try a silent refresh once, then redirect
    if (res.status === 401 && !_retry) {
      const refreshed = await fcRefreshToken();
      if (refreshed) return apiFetch(endpoint, opts, true);
      localStorage.removeItem("faculty_auth_token");
      localStorage.removeItem("faculty_refresh_token");
      window.location.href = "/faculty/fcsignin.html";
      return null;
    }
    if (res.status === 401) {
      localStorage.removeItem("faculty_auth_token");
      localStorage.removeItem("faculty_refresh_token");
      window.location.href = "/faculty/fcsignin.html";
      return null;
    }

    // 403 = permission denied for this role — NOT an auth failure, do not redirect
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      console.error(`[apiFetch] ${endpoint} → ${res.status} | body: ${body}`);
      return null;
    }

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

/**
 * Silently exchanges the stored refresh token for a new access token.
 * Returns true on success, false on any failure.
 */
async function fcRefreshToken() {
  const refreshToken = localStorage.getItem("faculty_refresh_token");
  if (!refreshToken) return false;
  try {
    const base = (typeof API !== "undefined" ? API : window.API) || "https://evexa-production.up.railway.app/api";
    const res = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const { accessToken, refreshToken: newRefresh } = await res.json();
    if (!accessToken) return false;
    localStorage.setItem("faculty_auth_token", accessToken);
    if (newRefresh) localStorage.setItem("faculty_refresh_token", newRefresh);
    return true;
  } catch {
    return false;
  }
}

/* ── state ── */
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

let myRoleId = null;

const FACULTY_ROLE = {
  HOD:                 1,
  STAFF:               2,
  STAFF_ADVISOR:       3,
  FACULTY_COORDINATOR: 4,
  DEAN:                5,
  HALL_COORDINATOR:    6,
};

function isFacultyCoordinator() { return myRoleId === FACULTY_ROLE.FACULTY_COORDINATOR; }

/* notifications */
let localNotifs = JSON.parse(localStorage.getItem("evexa_faculty_notifs") || "[]");
function saveNotifs() {
  localStorage.setItem("evexa_faculty_notifs", JSON.stringify(localNotifs.slice(0, 50)));
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
    read: false,
  });
  saveNotifs();
  updateNotifBadge();
  renderNotifDropdown();
}

/* ══════════════════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════════════════ */
async function boot() {
  applyTheme();

  document.querySelectorAll(".nav-item[data-page]").forEach(el =>
    el.addEventListener("click", () => navigateTo(el.dataset.page))
  );

  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    const s = document.getElementById("sidebar");
    if (!s) return;
    window.innerWidth <= 768
      ? s.classList.toggle("mobile-open")
      : s.classList.toggle("collapsed");
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
    const dd   = document.getElementById("notifDropdown");
    if (dd && !wrap?.contains(e.target)) dd.classList.remove("open");
  });

  document.getElementById("eventListBody")?.addEventListener("click", e => {
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

  /* load profile */
  let profile = await apiFetch("/faculty/me");
  if (!profile) profile = await apiFetch("/auth/me");
  if (!profile) return;

  if (!profile.faculty_no && !profile.department && profile.roll_no) {
    localStorage.removeItem("faculty_auth_token");
    showToast("Please log in with your faculty account.", "error");
    setTimeout(() => window.location.href = "/faculty/fcsignin.html", 1500);
    return;
  }

  cachedProfile = profile;
  myRoleId      = profile.role_id ?? null;

  const name       = profile.name || "Faculty";
  const initials   = name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "FA";
  const department = profile.department || "Faculty Advisor";
  const facultyNo  = profile.faculty_no || "";
  const roleName   = profile.role_name  || "Faculty";

  el("miniName")?.text(name);
  el("miniRole")?.text(facultyNo ? `${facultyNo} · ${roleName}` : roleName);
  el("miniAvatar")?.text(initials);
  el("topAvatar")?.text(initials);
  el("rolePill")?.text(`${roleName} · ${department}`);

  const h     = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  el("heroGreeting")?.text(`${greet}, ${name.split(" ")[0]}`);

  await refreshAll();

  currentPage    = "dashboard";
  selectedClubId = "all";

  const eventOverlay   = document.getElementById("eventDetailOverlay");
  const eventDrawer    = document.getElementById("eventDetailDrawer");
  const proposalDetail = document.getElementById("proposalDetail");

  if (eventOverlay)    eventOverlay.style.display   = "none";
  if (eventDrawer)     { eventDrawer.style.display = "none"; eventDrawer.classList.remove("open"); }
  if (proposalDetail)  proposalDetail.style.display = "none";

  const savedPage = localStorage.getItem("facultyCurrentPage") || "dashboard";
  currentPage = savedPage;
  navigateTo(savedPage);

  updateNotifBadge();
  syncNotifs();
}

/* ── data refresh ── */
async function refreshAll() {
  const [proposals, events, clubs, feedback, registrations] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/events/all"),
    apiFetch("/clubs/my-clubs"),
    apiFetch("/faculty/feedback"),
    apiFetch("/faculty/registrations").catch(() => null),
  ]);

  cachedProposals     = Array.isArray(proposals)     ? proposals     : [];
  cachedEvents        = Array.isArray(events)        ? events        : [];
  cachedClubs         = Array.isArray(clubs)         ? clubs         : [];
  cachedFeedback      = Array.isArray(feedback)      ? feedback      : [];
  cachedRegistrations = Array.isArray(registrations) ? registrations : [];

  console.log("[refreshAll] proposals:", cachedProposals.length);

  updateBadges();
}

/* ── page meta ── */
const PAGE_META = {
  "dashboard":        ["Dashboard",                 "Welcome back — here's your faculty overview."],
  "proposals":        ["Event Proposal Review",     "Review, approve or reject submitted proposals."],
  "event-list":       ["All Events",                "Complete event list across your clubs."],
  "pending":          ["Pending Queue",             "All items requiring your immediate action."],
  "all-clubs":        ["All Clubs",                 "Browse all clubs and their events."],
  "clubs":            ["Club & Academic Oversight", "Your incharge clubs and their activity."],

  "feedback":         ["Feedback & Reports",        "Student feedback ratings and comments."],
  "announcements":    ["Announcements",             "Post and manage club announcements."],
  "notif-history":    ["Notification History",      "All alerts and system updates."],
  "venues":           ["Venues & Availability",     "Check venue availability by date."],
  "account-settings": ["Account Settings",          "Update your faculty profile and password."],
  "event-detail":     ["Event Detail",              "Full event information."],
};

async function navigateTo(page) {
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
  const clubLabel    = selectedClub ? (selectedClub.club_name || selectedClub.name || "Club") : "";

  if (selectedClub && ["proposals", "event-list", "pending"].includes(page)) {
    el("pageTitle")?.text(`${t} — ${clubLabel}`);
    el("pageSub")?.text(
      page === "proposals"  ? `Viewing proposals for ${clubLabel}.`  :
      page === "event-list" ? `Viewing events for ${clubLabel}.`     :
      `Viewing pending items for ${clubLabel}.`
    );
  } else {
    el("pageTitle")?.text(t);
    el("pageSub")?.text(s);
  }

  const renders = {
    "dashboard":      renderDashboard,
    "proposals":      renderProposals,
    "event-list":     () => renderEventList(),
    "venues":         () => loadVenues(),
    "pending":        renderPendingPage,
    "all-clubs":      renderAllClubs,
    "clubs":          renderClubs,
    "announcements":  renderAnnouncements,
    "notif-history":  renderNotifHistory,
    "feedback":       renderFeedback,
    "account-settings": () => { initAccountSettings(); asLoadProfile(); },
  };

  await renders[page]?.();
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
async function renderDashboard() {
  if (!cachedEvents.length && !cachedProposals.length) await refreshAll();

  const pending  = cachedProposals.filter(p => isActionableForMe(p.status));
  const now      = new Date();
  const activeEv = cachedEvents.filter(e => {
    const dt = parseEventDate(e.date || e.event_date || e.start_date);
    return dt && dt >= now;
  });

  el("heroPending")?.text(pending.length);
  el("heroClubs")?.text(cachedClubs.length);
  el("heroEvents")?.text(activeEv.length);
  el("heroStudents")?.text(0);

  renderDashboardCalendar();
  renderClubsQuick();
  loadAnnouncementBoard();
}

/* ── dashboard calendar ── */
function renderDashboardCalendar() {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  el("dashCalMonthLabel")?.text(`${MONTHS[calMonth]} ${calYear}`);

  const calEl = document.getElementById("dashMiniCalendar");
  if (!calEl) return;

  const today    = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const total    = new Date(calYear, calMonth + 1, 0).getDate();

  const dayMap = {};
  // Only show approved events in the calendar — pending events belong in Event Approvals only
  const PENDING_STATUSES = new Set(["submitted", "pending", "review", "awaiting", "under review", "new"]);
  const approvedCalEvents = cachedEvents.filter(e => !PENDING_STATUSES.has((e.status || "").toLowerCase().trim()));
  const seen = new Set();
  approvedCalEvents.forEach(e => {
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
    const evs     = dayMap[d] || [];
    const hasPend = evs.some(e => (e.status || "").toLowerCase().trim() === STATUS.SUBMITTED);
    const hasAppr = evs.some(e => (e.status || "").toLowerCase().trim() === STATUS.HALL_APPROVED || (e.status || "").toLowerCase() === "approved");
    const hasAny  = evs.length > 0;

    const dayClass = hasPend ? "has-pending" : hasAppr ? "has-approved" : hasAny ? "has-event" : "";
    const cls = ["cal-day", isToday ? "today" : "", dayClass].filter(Boolean).join(" ");
    const enc = evs.length ? encodeURIComponent(JSON.stringify(evs)) : "";

    html += `<div class="${cls}" onclick="dashCalDayClick(this, ${d})" data-events="${enc.replace(/"/g, "&quot;")}">${d}</div>`;
  }

  html += `</div>`;
  calEl.innerHTML = html;
}

function dashCalDayClick(el2, day) {
  const det   = document.getElementById("dashCalEventDetail");
  const panel = document.getElementById("dashSelectedDatePanel");
  const tbody = document.getElementById("dashSelectedDateBody");

  if (!det || !panel || !tbody) return;

  if (el2.classList.contains("selected")) {
    el2.classList.remove("selected");
    det.style.display   = "none";
    panel.style.display = "none";
    return;
  }

  document.querySelectorAll("#dashMiniCalendar .cal-day.selected").forEach(d => d.classList.remove("selected"));
  el2.classList.add("selected");

  const raw = el2.getAttribute("data-events")?.replace(/&quot;/g, '"');
  if (!raw) { det.style.display = "none"; panel.style.display = "none"; return; }

  const evs = JSON.parse(decodeURIComponent(raw));
  el("dashCalDetailTitle")?.text(`${evs.length} event${evs.length > 1 ? "s" : ""} on ${fmtDate(new Date(calYear, calMonth, day))}`);
  el("dashCalDetailMeta")?.text(evs.map(e => `${e.title} · ${e.club || e.organizer || "—"}`).join(" | "));

  const actions = document.getElementById("dashCalDetailActions");
  if (actions) {
    actions.innerHTML = evs.map(e =>
      `<button class="mini-btn" onclick="navigateTo('event-list')">📅 ${e.title}</button>`
    ).join("");
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

  const myIds    = new Set((Array.isArray(mine) ? mine : []).map(a => a.id));
  const filtered = (Array.isArray(ann) ? ann : []).filter(a => !myIds.has(a.id));

  if (!filtered.length) { ab.innerHTML = `<div class="list-empty">No announcements.</div>`; return; }

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
    const clubId   = c.id || c.club_id;
    const evCount  = cachedEvents.filter(e =>
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

/* ══════════════════════════════════════════════════════════
   PROPOSALS
   ══════════════════════════════════════════════════════════ */
async function renderProposals(filter = "all", search = "", category = "all") {
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

  // Use only the proposals endpoint — it already contains all pending items.
  // Pulling submitted events from /events/all and merging caused every proposal
  // to appear twice (once per source with different _key prefixes).
  let list = (Array.isArray(cachedProposals) ? cachedProposals : [])
    .filter(p => (p.status || "").toLowerCase().trim() === STATUS.SUBMITTED)
    .map(p => ({ ...p, _src: "proposal", _key: `proposal-${p.id}` }));

  if (selectedClubId !== "all") list = list.filter(matchesSelectedClub);
  if (category !== "all") list = list.filter(p =>
    (p.category || p.type || "").toLowerCase() === category.toLowerCase()
  );
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p =>
      (p.title || p.name || "").toLowerCase().includes(q) ||
      (p.club  || p.organizer || "").toLowerCase().includes(q)
    );
  }

  window.currentProposalList = list;

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

function showProposalDetail(key) {
  const p = (window.currentProposalList || []).find(x => x._key === key);
  if (!p) { console.warn("Proposal not found for key:", key); return; }

  el("detailName")?.text(p.title || p.name || "Event Details");

  const panel = document.getElementById("proposalDetail");
  if (panel) {
    panel.style.display = "";
    setTimeout(() => panel.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const s              = (p.status || "").toLowerCase().trim();
  const canFacultyAct  = isFacultyCoordinator() && s === STATUS.SUBMITTED;
  const canGenericAct  = !isFacultyCoordinator() && s === STATUS.SUBMITTED;
  const isActionable   = canFacultyAct || canGenericAct;

  const steps = [
    { key: "submitted",        label: "Submitted",      icon: "📝" },
    { key: "faculty_approved", label: "Faculty Review", icon: "👩‍🏫" },
    { key: "hall_approved",    label: "Hall Approved",  icon: "🏛️" },
  ];
  const statusOrder = ["submitted", "faculty_approved", "hall_approved"];
  const currentIdx  = statusOrder.indexOf(s);
  const isRejected  = s === STATUS.REJECTED;

  const timelineHtml = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:18px;flex-wrap:wrap;">
      ${steps.map((step, i) => {
        let state = "future";
        if (isRejected) state = i <= currentIdx ? "done" : "future";
        else if (i < currentIdx)  state = "done";
        else if (i === currentIdx) state = "active";

        const colors = {
          done:   { bg: "rgba(16,185,129,.18)", border: "rgba(16,185,129,.4)",  text: "#34d399" },
          active: { bg: "rgba(6,182,212,.18)",  border: "rgba(6,182,212,.5)",   text: "#67e8f9" },
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

function resolveApproveEndpoint(id, src) {
  return src === "event" ? `/events/${id}/approve` : `/faculty/proposals/${id}/approve`;
}
function resolveRejectEndpoint(id, src) {
  return src === "event" ? `/events/${id}/reject` : `/faculty/proposals/${id}/reject`;
}

async function approveProposal(id, src = "proposal") {
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
  const p      = (window.currentProposalList || []).find(x => x.id === id && x._src === src);

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

/* ══════════════════════════════════════════════════════════
   EVENT LIST
   ══════════════════════════════════════════════════════════ */
async function renderEventList(search = "", status = "all") {
  const fresh = await apiFetch("/events/all");
  cachedEvents = Array.isArray(fresh) ? fresh : [];

  const tbody = document.getElementById("eventListBody");
  if (!tbody) return;

  // Exclude pending/submitted events — those belong only in Event Approvals
  const PENDING_STATUSES_LIST = new Set(["submitted", "pending", "review", "awaiting", "under review", "new"]);
  let list = cachedEvents.filter(e => !PENDING_STATUSES_LIST.has((e.status || "").toLowerCase().trim()));
  if (status !== "all") list = list.filter(e => (e.status || "").toLowerCase().trim() === status.toLowerCase());
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(e =>
      String(e.title || "").toLowerCase().includes(q) ||
      String(e.club  || "").toLowerCase().includes(q)
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
          <button type="button" class="mini-btn"
            onclick="downloadParticipants(${e.id}); event.stopPropagation();">⬇️ Download</button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="td-empty">No events found.</td></tr>`;
}

/* ── event detail page ── */
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
    if (!ev) { const one = await apiFetch(`/events/${eventId}`); if (one) ev = one; }
    if (!ev) { body.innerHTML = `<div class="list-empty" style="padding:24px;">Event not found.</div>`; return; }

    const proposal = cachedProposals.find(p =>
      String(p.id) === String(ev.proposal_id) ||
      String(p.event_id) === String(eventId) ||
      String((p.title || "").trim().toLowerCase()) === String((ev.title || "").trim().toLowerCase())
    );
    const data = { ...ev, ...(proposal || {}) };

    let registered = Number(data.registered_count || data.registered || 0);
    try {
      const countRes = await apiFetch(`/faculty/registrations/count/${eventId}`);
      if (countRes && typeof countRes.count !== "undefined") registered = Number(countRes.count || 0);
    } catch (_) {}

    const capacity  = Number(data.capacity || data.expected_participants || 0);
    const seatsLeft = Math.max(0, capacity - registered);
    const pct       = capacity > 0 ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;

    const posterUrl = data.poster || data.posterUrl
      ? `https://evexa-production.up.railway.app/uploads/${data.poster || data.posterUrl}` : "";

    body.innerHTML = `
      <div class="fed-page">
        <div class="fed-hero">
          ${posterUrl
            ? `<img src="${posterUrl}" alt="${data.title || "Event"}" class="fed-poster"
                   onerror="this.outerHTML='<div class=&quot;fed-poster fed-poster-fallback&quot;>📅</div>';">`
            : `<div class="fed-poster fed-poster-fallback">📅</div>`}
          <div class="fed-hero-content">
            <div class="fed-top-row">
              <div>
                <h1 class="fed-title">${data.title || "Untitled Event"}</h1>
                <div class="fed-sub">${data.club || data.organizer || "—"} · ${fmtDate(data.date || data.event_date || data.start_date)}</div>
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
                <div class="fed-kpi"><div class="fed-kpi-num">${registered}</div><div class="fed-kpi-label">Registered</div></div>
                <div class="fed-kpi"><div class="fed-kpi-num">${capacity}</div><div class="fed-kpi-label">Capacity</div></div>
                <div class="fed-kpi"><div class="fed-kpi-num">${seatsLeft}</div><div class="fed-kpi-label">Seats Left</div></div>
                <div class="fed-kpi"><div class="fed-kpi-num">${pct}%</div><div class="fed-kpi-label">Filled</div></div>
              </div>
              <div class="fed-progress"><div class="fed-progress-fill" style="width:${pct}%"></div></div>
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

async function loadFacultyParticipants(eventId) {
  const wrap = document.getElementById("facultyParticipantsWrap");
  if (!wrap) return;
  wrap.innerHTML = "Loading participants...";
  try {
    const res  = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];
    if (!data.length) { wrap.innerHTML = "<p>No participants found.</p>"; return; }
    wrap.innerHTML = `
      <table class="table">
        <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Dept</th><th>Class</th><th>Phone</th></tr></thead>
        <tbody>
          ${data.map((p, i) => `
            <tr>
              <td>${i + 1}</td><td>${p.name||"-"}</td><td>${p.email||"-"}</td>
              <td>${p.department||"-"}</td><td>${p.class||"-"}</td><td>${p.phone_no||p.phone||"-"}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  } catch (err) { console.error(err); wrap.innerHTML = "Failed to load participants."; }
}

async function downloadFacultyEventReport(eventId) {
  try {
    const res  = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];
    if (!data.length) { showToast("No data to export.", "error"); return; }
    const headers = ["Name", "Email", "Department", "Class", "Phone"];
    const rows    = data.map(p => [p.name||"", p.email||"", p.department||"", p.class||"", p.phone_no||p.phone||""]);
    const csv     = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a       = document.createElement("a");
    a.href        = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download    = `event_report_${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("⬇️ Report downloaded!", "success");
  } catch (err) { console.error(err); showToast("Download failed.", "error"); }
}

async function downloadParticipants(eventId) {
  try {
    const data = await apiFetch(`/faculty/events/${eventId}/participants`);
    if (!data || !data.length) { showToast("No participants found.", "error"); return; }
    const headers = ["Name", "Email", "Department", "Phone"];
    const rows    = data.map(p => [p.name, p.email, p.department, p.phone_no || p.phone]);
    const csv     = "data:text/csv;charset=utf-8," + [headers, ...rows].map(r => r.join(",")).join("\n");
    const link    = document.createElement("a");
    link.href     = encodeURI(csv);
    link.download = `event_${eventId}_participants.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("⬇️ Download started!", "success");
  } catch (err) { console.error(err); showToast("Download failed.", "error"); }
}

/* event detail drawer */
async function showEventDetail(eventId) {
  try {
    let ev = (window.currentEventList || []).find(e => String(e.id) === String(eventId));
    if (!ev) { const fresh = await apiFetch(`/events/${eventId}`); if (fresh) ev = fresh; }
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
    const data      = { ...ev, ...(proposal || {}) };
    const statusCls = (data.status || "approved").toLowerCase();

    const overlay = document.getElementById("eventDetailOverlay");
    const drawer  = document.getElementById("eventDetailDrawer");
    const body    = document.getElementById("eventDetailBody");
    if (!overlay || !drawer || !body) { showToast("Drawer elements not found.", "error"); return; }

    el("edDrawerTitle")?.text(data.title || "Event Details");
    el("edDrawerSub")?.text(`${data.club || data.organizer || "—"}  ·  ${fmtDate(data.date || data.event_date || data.start_date)}`);

    const capacity   = Number(data.capacity || data.expected_participants || 0);
    const registered = Number(data.registered_count || data.registered || 0);
    const seatsLeft  = Math.max(0, capacity - registered);
    const pct        = capacity > 0 ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;

    const posterUrl = data.posterUrl ? `https://evexa-production.up.railway.app/uploads/${data.posterUrl}` : null;

    body.innerHTML = `
      ${posterUrl
        ? `<div class="ed-banner"><img src="${posterUrl}" alt="${data.title}" onerror="this.parentElement.style.background='var(--g-violet)';this.remove()"/></div>`
        : `<div class="ed-banner" style="display:flex;align-items:center;justify-content:center;font-size:52px;background:var(--g-violet);">📅</div>`}

      <div class="ed-body-layout">
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
          <div class="ed-tabs">
            <button class="ed-tab active" data-panel="edp-description">📝 Description</button>
            <button class="ed-tab" data-panel="edp-participants">👥 Participants</button>
            ${data.objectives ? `<button class="ed-tab" data-panel="edp-objectives">🎯 Objectives</button>` : ""}
          </div>
          <div class="ed-panel active" id="edp-description">
            <p class="ed-desc">${data.description || "No description provided."}</p>
            ${data.requirements ? `<div style="margin-top:16px;"><div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">📋 Requirements</div><p class="ed-desc">${data.requirements}</p></div>` : ""}
            ${data.target_audience ? `<div style="margin-top:16px;"><div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">👤 Target Audience</div><p class="ed-desc">${data.target_audience}</p></div>` : ""}
            ${data.document_url ? `<div style="margin-top:16px;"><a href="${data.document_url}" target="_blank" class="mini-btn" style="display:inline-flex;">📎 View Proposal Document</a></div>` : ""}
          </div>
          <div class="ed-panel" id="edp-participants">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="font-size:13px;font-weight:700;color:var(--text);">Registered Participants</span>
              <button class="mini-btn" onclick="edDownloadParticipants(${data.id}, '${(data.title || "event").replace(/'/g, "\\'")}')">⬇️ Download CSV</button>
            </div>
            <div id="edParticipantsWrap"><p class="ed-desc" style="color:var(--text-3);">Click here to load participants…</p></div>
          </div>
          ${data.objectives ? `<div class="ed-panel" id="edp-objectives"><p class="ed-desc">${data.objectives}</p></div>` : ""}
        </div>

        <div class="ed-side-col">
          <div class="ed-reg-label">Registration</div>
          <div class="ed-reg-row"><span>${seatsLeft} seats left</span><span>${registered} / ${capacity}</span></div>
          <div class="ed-progress-bar"><div class="ed-progress-fill" style="width:${pct}%"></div></div>
          <div class="ed-kpi-grid">
            <div class="ed-kpi"><div class="ed-kpi-icon">👥</div><div class="ed-kpi-val">${registered}</div><div class="ed-kpi-label">Registered</div></div>
            <div class="ed-kpi"><div class="ed-kpi-icon">🪑</div><div class="ed-kpi-val">${capacity}</div><div class="ed-kpi-label">Capacity</div></div>
            <div class="ed-kpi"><div class="ed-kpi-icon">📅</div><div class="ed-kpi-val" style="font-size:13px;line-height:1.3;">${fmtDate(data.date || data.event_date || data.start_date)}</div><div class="ed-kpi-label">Date</div></div>
            <div class="ed-kpi"><div class="ed-kpi-icon">💰</div><div class="ed-kpi-val" style="font-size:15px;">${data.registration_fee > 0 ? "₹" + data.registration_fee : "Free"}</div><div class="ed-kpi-label">Fee</div></div>
          </div>
          <div class="ed-hr"></div>
          <div class="ed-detail-row"><b>Status:</b> <span class="badge ${statusCls}" style="margin-left:6px;font-size:11px;">${cap(data.status || "approved")}</span></div>
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
        </div>
      </div>
    `;

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

    overlay.style.display = "block";
    drawer.style.display  = "flex";
    requestAnimationFrame(() => drawer.classList.add("open"));
    document.body.style.overflow = "hidden";
  } catch (err) {
    console.error("showEventDetail error:", err);
    showToast("Failed to open event details.", "error");
  }
}

async function edLoadParticipants(eventId) {
  const wrap = document.getElementById("edParticipantsWrap");
  if (!wrap) return;
  wrap.innerHTML = `<p class="ed-desc" style="color:var(--text-3);">Loading…</p>`;
  try {
    const res  = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];
    if (!data.length) { wrap.innerHTML = `<p class="ed-desc" style="color:var(--text-3);">No registrations yet.</p>`; return; }
    wrap.innerHTML = `
      <table class="ed-ptable">
        <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Dept</th><th>Class</th><th>Phone</th></tr></thead>
        <tbody>
          ${data.map((p, i) => `<tr><td>${i+1}</td><td>${p.name||"—"}</td><td>${p.email||"—"}</td><td>${p.department||"—"}</td><td>${p.class||"—"}</td><td>${p.phone_no||p.phone||"—"}</td></tr>`).join("")}
        </tbody>
      </table>`;
  } catch { wrap.innerHTML = `<p class="ed-desc" style="color:var(--text-3);">Failed to load participants.</p>`; }
}

async function edDownloadParticipants(eventId, eventTitle) {
  try {
    const res  = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];
    if (!data.length) { showToast("No participants found.", "error"); return; }
    const headers = ["#","Name","Email","Department","Class","Phone"];
    const rows    = data.map((p, i) => [i+1, p.name||"", p.email||"", p.department||"", p.class||"", p.phone_no||p.phone||""]);
    const csv     = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a       = document.createElement("a");
    a.href        = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download    = `participants_${(eventTitle || "event").replace(/[^a-z0-9]+/gi,"_").toLowerCase()}_${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("⬇️ Download started!", "success");
  } catch (err) { console.error(err); showToast("Download failed.", "error"); }
}

function closeEventDetail() {
  const overlay = document.getElementById("eventDetailOverlay");
  const drawer  = document.getElementById("eventDetailDrawer");
  if (drawer) { drawer.classList.remove("open"); setTimeout(() => { if (drawer) drawer.style.display = "none"; }, 300); }
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
}

/* ══════════════════════════════════════════════════════════
   PENDING PAGE
   ══════════════════════════════════════════════════════════ */
async function renderPendingPage() {
  await refreshAll();
  selectedClubId = "all";
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

/* ══════════════════════════════════════════════════════════
   ALL CLUBS
   ══════════════════════════════════════════════════════════ */
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

  if (search) list = list.filter(c =>
    (c.club_name||c.name||"").toLowerCase().includes(search) ||
    (c.category||c.type||"").toLowerCase().includes(search) ||
    (c.description||"").toLowerCase().includes(search)
  );
  if (category !== "all") list = list.filter(c => {
    const raw = (c.club_category||c.category||c.type||"").toLowerCase().trim();
    if (category === "technical")     return raw === "technical";
    if (category === "non-technical") return raw === "non-technical";
    return raw === category.toLowerCase();
  });
  if (!list.length) { grid.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs found.</div>`; return; }

  grid.innerHTML = list.map((c, i) => {
    const clubName  = c.club_name || c.name || "Club";
    const clubId    = String(c.id ?? c.club_id ?? "");
    const isMyClub  = myClubIds.has(clubId);
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
            <div class="ac-cat">${c.club_category||c.category||c.type||"Club"}</div>
          </div>
          <span class="badge ${c.status === 'inactive' ? 'rejected' : 'approved'}" style="flex-shrink:0;">${c.status||"Active"}</span>
        </div>
        <div class="ac-stats">
          <div class="ac-stat"><div class="ac-stat-val">${c.member_count||c.members||0}</div><div class="ac-stat-label">Members</div></div>
          <div class="ac-stat"><div class="ac-stat-val">${clubEvents.length}</div><div class="ac-stat-label">Events</div></div>
          <div class="ac-stat"><div class="ac-stat-val">${upcoming}</div><div class="ac-stat-label">Upcoming</div></div>
        </div>
        <div class="ac-footer">
          <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">
            ${c.description ? c.description.slice(0,60) + (c.description.length > 60 ? "…" : "") : "—"}
          </div>
          ${isMyClub ? `<span class="ac-incharge-badge">INCHARGE</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function openClubDetail(clubId, idx) {
  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵","🔬","🎭","🏅","📐","🌱","🔭","🎮","🎻"];
  const club   = allClubsData.find(c => String(c.id ?? c.club_id ?? "") === String(clubId));
  if (!club) return;

  currentClubDetail = club;
  const clubName    = club.club_name || club.name || "Club";
  currentClubEvents = cachedEvents.filter(e =>
    String(e.club_id ?? e.clubId ?? "") === String(clubId) ||
    String(e.club ?? e.club_name ?? "").trim().toLowerCase() === clubName.trim().toLowerCase()
  ).sort((a, b) =>
    new Date(b.date||b.event_date||b.start_date) - new Date(a.date||a.event_date||a.start_date)
  );

  const upcoming = currentClubEvents.filter(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    return d && d >= new Date();
  }).length;
  const pending = currentClubEvents.filter(e =>
    (e.status || "").toLowerCase().trim() === STATUS.SUBMITTED
  ).length;

  el("clubDetailEmoji")?.text(club.logo || emojis[idx % emojis.length]);
  el("clubDetailName")?.text(clubName);
  el("clubDetailCat")?.text(club.category || club.type || "Club");

  const statsEl = document.getElementById("clubDetailStats");
  if (statsEl) {
    statsEl.innerHTML = [
      { val: club.member_count || club.members || 0, label: "Members"      },
      { val: currentClubEvents.length,               label: "Total Events" },
      { val: upcoming,                               label: "Upcoming"     },
      { val: pending,                                label: "Pending"      },
    ].map(s => `<div class="club-ds-cell"><div class="club-ds-val">${s.val}</div><div class="club-ds-label">${s.label}</div></div>`).join("");
  }

  const infoEl = document.getElementById("clubDetailInfo");
  if (infoEl) {
    infoEl.innerHTML = `
      <div class="club-detail-info-grid">
        ${[
          ["Club Name",   clubName],
          ["Category",    club.club_category || club.category || club.type || "—"],
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
  else document.querySelectorAll(".club-tab").forEach(t =>
    t.classList.toggle("active", t.textContent.toLowerCase().includes(tab))
  );
  document.getElementById("clubTabEvents").style.display = tab === "events" ? "" : "none";
  document.getElementById("clubTabInfo").style.display   = tab === "info"   ? "" : "none";
}

function filterClubEvents() {
  const status = document.getElementById("clubEventStatusFilter")?.value || "all";
  const search = (document.getElementById("clubEventSearch")?.value || "").toLowerCase();
  let list = currentClubEvents;
  if (status !== "all") list = list.filter(e => (e.status||"approved").toLowerCase() === status.toLowerCase());
  if (search) list = list.filter(e =>
    (e.title||"").toLowerCase().includes(search) ||
    (e.venue||"").toLowerCase().includes(search) ||
    (e.category||e.type||"").toLowerCase().includes(search)
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

/* ══════════════════════════════════════════════════════════
   MY CLUBS (incharge)
   ══════════════════════════════════════════════════════════ */
async function renderClubs() {
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
    const clubId   = c.id || c.club_id;
    const clubEvents = cachedEvents.filter(e =>
      String(e.club_id ?? e.clubId ?? "") === String(clubId) ||
      String(e.club ?? e.club_name ?? "").trim().toLowerCase() === clubName.trim().toLowerCase()
    ).sort((a, b) => new Date(b.date||b.event_date||b.start_date) - new Date(a.date||a.event_date||a.start_date));

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
          <div class="club-stat-cell"><div class="club-stat-val">${c.member_count||c.members||0}</div><div class="club-stat-label">Members</div></div>
          <div class="club-stat-cell"><div class="club-stat-val">${clubEvents.length}</div><div class="club-stat-label">Total Events</div></div>
          <div class="club-stat-cell"><div class="club-stat-val">${upcomingCount}</div><div class="club-stat-label">Upcoming</div></div>
          <div class="club-stat-cell"><div class="club-stat-val" style="color:${pendingCount > 0 ? "#fbbf24" : "#4ade80"};">${pendingCount}</div><div class="club-stat-label">Pending</div></div>
        </div>
        ${clubEvents.length ? `
          <div class="club-recent-title">Recent Events</div>
          ${clubEvents.slice(0,3).map(e => `
            <div class="club-event-row">
              <span class="club-event-name">${e.title}</span>
              <span class="badge ${e.status||"approved"}" style="font-size:10px;">${cap(e.status||"approved")}</span>
              <span class="club-event-date">${fmtDate(e.date||e.event_date||e.start_date)}</span>
            </div>
          `).join("")}
        ` : `<div class="list-empty">No events yet.</div>`}
        <div class="club-card-actions">
          <button class="btn ghost sm" onclick="openClubProposals(${clubId})">📋 Proposals</button>
        </div>
      </div>
    `;
  }).join("");
}

function openClubProposals(clubId) { setSelectedClub(clubId); navigateTo("proposals"); renderProposals(); }
function openAllClubProposals()    { setSelectedClub("all"); navigateTo("proposals"); renderProposals(); }

/* ── Venue helpers (ported from organizer portal) ────────────────── */
if (typeof formatDateYMD === "undefined") {
  window.formatDateYMD = function(ymd) {
    if (!ymd) return "N/A";
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
}
if (typeof setText === "undefined") {
  window.setText = function(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
}
if (typeof openModal === "undefined") {
  window.openModal  = function(id) { document.getElementById(id)?.classList.add("open"); };
  window.closeModal = function(id) { document.getElementById(id)?.classList.remove("open"); };
}

/* ══════════════════════════════════════════════════════════
   VENUES  — exact organizer UI, adapted for faculty apiFetch
   (faculty apiFetch returns parsed JSON or null — not Response)
   ══════════════════════════════════════════════════════════ */
let venues          = [];
let currentVenue    = "";
const venueBookings = {};
let currentYear     = new Date().getFullYear();
let currentMonth    = new Date().getMonth();

/* ── Tiny helpers (safe to redefine if not present) ─── */
if (typeof setText === "undefined") {
  window.setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
}
if (typeof formatDateYMD === "undefined") {
  window.formatDateYMD = function(ymd) {
    if (!ymd) return "N/A";
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
}
if (typeof openModal === "undefined") {
  window.openModal  = (id) => document.getElementById(id)?.classList.add("open");
  window.closeModal = (id) => document.getElementById(id)?.classList.remove("open");
}

async function loadVenues() {
  try {
    const data = await apiFetch("/venues");           // returns array or null
    if (Array.isArray(data)) {
      venues = data;
    } else if (data && Array.isArray(data.venues)) {
      venues = data.venues;
    }
    if (venues.length) currentVenue = venues[0]?.name || "";
  } catch (err) { console.error("Venue load error:", err); }
  renderVenueSidebar();
  await loadVenueBookings();
  renderCalendar();
}

function renderVenueSidebar() {
  const list = document.getElementById("venueList");
  if (!list) return;
  if (!venues.length) {
    list.innerHTML = `<div style="font-size:12px;color:var(--text-3,#9ca3af);padding:8px 4px;">No venues found</div>`;
    return;
  }
  list.innerHTML = venues.map(v => `
    <div class="venue-list-item ${v.name === currentVenue ? "active" : ""}"
         onclick="selectVenue('${v.name.replace(/'/g, "\\'")}')">
      ${v.name}
      ${v.capacity ? `<span class="vli-meta">Capacity: ${v.capacity}</span>` : ""}
    </div>
  `).join("");
}

async function selectVenue(name) {
  currentVenue = name;
  document.querySelectorAll(".venue-list-item").forEach(item => {
    item.classList.toggle("active", item.textContent.trim().startsWith(name));
  });
  await loadVenueBookings();
  renderCalendar();
}

async function loadVenueBookings() {
  if (!currentVenue) return;
  try {
    const venueObj   = venues.find(v => v.name === currentVenue);
    const venueParam = venueObj?.id
      ? `venue_id=${venueObj.id}`
      : `venue_name=${encodeURIComponent(currentVenue)}`;
    const cacheKey = `${currentVenue}__${currentYear}_${currentMonth + 1}`;
    const data = await apiFetch(`/venues/calendar?${venueParam}&month=${currentMonth + 1}&year=${currentYear}`);
    venueBookings[cacheKey] = {};
    if (Array.isArray(data)) {
      data.forEach(b => { venueBookings[cacheKey][b.day] = b.status; });
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
  const cacheKey    = `${currentVenue}__${currentYear}_${currentMonth + 1}`;
  const bookings    = venueBookings[cacheKey] || {};
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day"; cell.textContent = day;
    const status = bookings[day];
    if (status === "booked" || status === "faculty-approved" || status === "pending") {
      cell.classList.add(status === "pending" ? "pending" : "partial");
      cell.style.cursor = "pointer";
      cell.title = status === "booked"
        ? `Day ${day} — Partially booked · click to see available slots`
        : status === "faculty-approved"
          ? `Day ${day} — Has faculty-approved booking · click to see available slots`
          : `Day ${day} — Has pending booking · click to see available slots`;
      cell.addEventListener("click", () => openVenueSlots(day));
    } else {
      cell.classList.add("available");
      cell.title = `Day ${day} — Available (click to book)`;
      cell.addEventListener("click", () => openVenueSlots(day));
    }
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

  document.getElementById("vbSlotStart").value    = "";
  document.getElementById("vbSlotEnd").value      = "";
  document.getElementById("vbPurpose").value      = "";
  document.getElementById("vbDoc").value          = "";
  document.getElementById("vbSubmitBtn").disabled = false;

  const evSel  = document.getElementById("vbEventId");
  evSel.innerHTML = `<option value="">— Select an event (optional) —</option>`;

  const slotList = document.getElementById("vbSlotList");
  slotList.innerHTML = `<span style="color:var(--muted,#9ca3af);font-size:13px;">Loading slots…</span>`;
  openModal("venueBookModal");

  try {
    const venueObj2  = venues.find(v => v.name === currentVenue);
    const slotParam  = venueObj2?.id
      ? `venue_id=${venueObj2.id}`
      : `venue_name=${encodeURIComponent(currentVenue)}`;
    const slotData   = await apiFetch(`/venues/slots?${slotParam}&date=${dateStr}`);
    const slots      = Array.isArray(slotData) ? slotData
                     : Array.isArray(slotData?.slots) ? slotData.slots
                     : [];
    const avail      = slots.filter(s => s.available);

    if (!avail.length) {
      slotList.innerHTML = `<span style="color:var(--muted,#9ca3af);font-size:13px;">No available slots for this date.</span>`;
      document.getElementById("vbSubmitBtn").disabled = true;
      return;
    }
    slotList.innerHTML = avail.map(s => `
      <button type="button"
        class="slot-chip"
        data-start="${s.start}" data-end="${s.end}"
        onclick="selectSlotChip(this,'${s.start}','${s.end}')">
        ${s.start.slice(0,5)} – ${s.end.slice(0,5)}
      </button>`).join("");
  } catch {
    slotList.innerHTML = `<span style="color:var(--rose,#f43f5e);font-size:13px;">Failed to load slots. Try again.</span>`;
  }
}

function selectSlotChip(el, start, end) {
  el.classList.toggle("selected");
  const selected = [...document.querySelectorAll(".slot-chip.selected")]
    .map(c => ({ start: c.dataset.start, end: c.dataset.end }));
  document.getElementById("vbSlotStart").value = JSON.stringify(selected);
  document.getElementById("vbSlotEnd").value   = selected.length ? selected[selected.length - 1].end : "";
}

async function submitVenueBooking(e) {
  e.preventDefault();
  const raw = document.getElementById("vbSlotStart").value;
  if (!raw || raw === "[]") { showToast("⚠️ Please select at least one time slot"); return; }

  let selectedSlots;
  try { selectedSlots = JSON.parse(raw); } catch { selectedSlots = []; }
  if (!selectedSlots.length) { showToast("⚠️ Please select at least one time slot"); return; }

  const btn = document.getElementById("vbSubmitBtn");
  btn.disabled = true; btn.textContent = "Submitting…";

  const venueName = document.getElementById("vbVenueName").value;
  const venueObj  = venues.find(v => v.name === venueName);
  const venueId   = venueObj?.id || "";
  const date      = document.getElementById("vbDate").value;
  const purpose   = document.getElementById("vbPurpose").value;
  const eventId   = document.getElementById("vbEventId").value;
  const docFile   = document.getElementById("vbDoc").files[0];

  // Faculty uses faculty_auth_token
  const token = localStorage.getItem("faculty_auth_token") || "";
  const base  = (typeof API !== "undefined" ? API : window.API) || "https://evexa-production.up.railway.app/api";

  let successCount = 0;
  for (const slot of selectedSlots) {
    const formData = new FormData();
    formData.append("venue_id",   venueId);
    formData.append("venue_name", venueName);
    formData.append("date",       date);
    formData.append("slot_start", slot.start);
    formData.append("slot_end",   slot.end);
    formData.append("purpose",    purpose);
    formData.append("event_id",   eventId);
    if (docFile) formData.append("support_doc", docFile);

    try {
      const res = await fetch(`${base}/venues/bookings`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        successCount++;
      } else {
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
  document.getElementById("vtab-panel-calendar").style.display   = tab === "calendar"   ? "" : "none";
  document.getElementById("vtab-panel-mybookings").style.display = tab === "mybookings" ? "" : "none";
  document.getElementById(`vtab-${tab}`).classList.add("active");
  if (tab === "mybookings") loadMyVenueBookings();
}

async function loadMyVenueBookings() {
  const tbody = document.getElementById("myVenueBookingsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;
  try {
    const data = await apiFetch("/venues/bookings/mine");   // returns array or null
    const list = Array.isArray(data) ? data : [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No bookings yet</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map((b, i) => {
      const statusColor = b.status === "hall_approved"    ? "var(--emerald,#10b981)"       :
                          b.status === "faculty_approved" ? "var(--sky,#0ea5e9)"            :
                          b.status === "rejected"         ? "var(--rose,#f43f5e)"           : "var(--amber,#f59e0b)";
      const statusBg    = b.status === "hall_approved"    ? "rgba(16,185,129,.18)"          :
                          b.status === "faculty_approved" ? "rgba(14,165,233,.18)"          :
                          b.status === "rejected"         ? "rgba(244,63,94,.18)"           : "rgba(245,158,11,.18)";
      return `
        <tr style="border-bottom:1px solid var(--line,rgba(255,255,255,.08));">
          <td style="padding:10px 14px;">${i+1}</td>
          <td style="padding:10px 14px;font-weight:500;">📍 ${b.venue_name}</td>
          <td style="padding:10px 14px;color:var(--text-2);">${b.event_title || "—"}</td>
          <td style="padding:10px 14px;color:var(--text-2);">${formatDateYMD(b.date)}</td>
          <td style="padding:10px 14px;color:var(--text-2);">${(b.slot_start||"").slice(0,5)}${b.slot_end ? " – " + b.slot_end.slice(0,5) : ""}</td>
          <td style="padding:10px 14px;">
            <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;
                         background:${statusBg};color:${statusColor};">${
              b.status === 'hall_approved'    ? 'Hall Approved'    :
              b.status === 'faculty_approved' ? 'Faculty Approved' :
              b.status === 'rejected'         ? 'Rejected'         :
              b.status === 'pending'          ? 'Pending'          : b.status
            }</span>
          </td>
          <td style="padding:10px 14px;white-space:nowrap;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
            ${['pending','faculty_approved','hall_approved'].includes(b.status)
              ? `<button class="btn-ghost" style="color:var(--rose,#f43f5e);font-size:12px;padding:4px 10px;border:1px solid var(--rose,#f43f5e);border-radius:6px;"
                   onclick="cancelVenueBooking(${b.id})">🗑️ Cancel</button>` : ""}
            ${['rejected','hall_approved','faculty_approved'].includes(b.status)
              ? `<button class="btn-ghost" style="color:var(--violet-mid,#a78bfa);font-size:12px;padding:4px 10px;border:1px solid var(--violet,#8b5cf6);border-radius:6px;"
                   onclick="rebookVenue('${b.venue_name}','${b.date}')">🔄 Re-book</button>` : ""}
            ${b.status === 'pending'
              ? `<span style="color:var(--amber,#f59e0b);font-size:11px;">⏳ Awaiting</span>` : ""}
          </td>
        </tr>`;
    }).join("");
  } catch { tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Failed to load</td></tr>`; }
}

async function cancelVenueBooking(id) {
  if (!confirm("Cancel this booking? If it's approved, the linked event will be reverted to 'submitted' so you can re-book a venue.")) return;
  try {
    const data = await apiFetch(`/venues/bookings/${id}`, { method: "DELETE" });
    if (data !== null) { showToast("🗑️ Booking cancelled"); loadMyVenueBookings(); }
    else showToast("❌ Could not cancel");
  } catch { showToast("❌ Network error"); }
}

async function rebookVenue(venueName, date) {
  switchVenueTab("calendar");
  await selectVenue(venueName);
  const d = new Date(date);
  currentYear  = d.getFullYear();
  currentMonth = d.getMonth();
  await loadVenueBookings();
  renderCalendar();
  openVenueSlots(d.getDate());
}

document.getElementById("prevMonth")?.addEventListener("click", async () => {
  currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await loadVenueBookings(); renderCalendar();
});
document.getElementById("nextMonth")?.addEventListener("click", async () => {
  currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await loadVenueBookings(); renderCalendar();
});

/* ══════════════════════════════════════════════════════════
   FEEDBACK
   ══════════════════════════════════════════════════════════ */
async function renderFeedback(search = "") {
  const fresh = await apiFetch("/faculty/feedback");
  if (fresh) cachedFeedback = fresh;

  const comments = cachedFeedback.filter(f =>
    !search ||
    (f.comment||f.text||"").toLowerCase().includes(search) ||
    (f.student_name||"").toLowerCase().includes(search) ||
    (f.organizer_reply||f.reply||"").toLowerCase().includes(search) ||
    (f.event_title||f.event||"").toLowerCase().includes(search)
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

/* ══════════════════════════════════════════════════════════
   ANNOUNCEMENTS
   ══════════════════════════════════════════════════════════ */
async function renderAnnouncements() {
  const al = document.getElementById("announceList");
  if (!al) return;

  if (!cachedClubs.length) {
    al.innerHTML = `<div class="list-empty">You are not assigned to any club. Announcements are unavailable.</div>`;
    return;
  }

  const mine = await apiFetch("/announcements/my-posts");
  const list = Array.isArray(mine) ? mine : [];
  if (!list.length) { al.innerHTML = `<div class="list-empty">No posts yet.</div>`; return; }

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

  if (!title || !message) { showToast("Fill in title and message.", "error"); return; }

  const clubId = cachedClubs[0]?.id ?? cachedClubs[0]?.club_id ?? null;
  if (!clubId) { showToast("You are not assigned to any club. Cannot post announcements.", "error"); return; }

  const res = await apiFetch("/announcements", {
    method: "POST",
    body: JSON.stringify({ title, message, type, club_id: clubId }),
  });

  if (res !== null) {
    document.getElementById("announceTitle").value = "";
    document.getElementById("announceBody").value  = "";
    addLocalNotif("admin", "📢", title, message, `ann-${res.id}`);
    saveNotifs(); updateNotifBadge(); renderNotifDropdown(); renderNotifHistory();
    showToast("📢 Announcement posted!", "success");
    await renderAnnouncements();
  } else {
    showToast("Failed to post.", "error");
  }
}

function editAnnouncement(id) {
  const card           = document.querySelector(`[data-ann-id="${id}"]`);
  const currentTitle   = card?.querySelector(".announce-title")?.textContent?.trim() || "";
  const currentMessage = card?.querySelector(".announce-body")?.textContent?.trim()  || "";

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
  if (!title || !message) { showToast("Title and message are required.", "error"); return; }

  const res = await apiFetch(`/announcements/${id}`, {
    method: "PUT",
    body: JSON.stringify({ title, message }),
  });

  if (res !== null) {
    const sid = `ann-${id}`;
    localNotifs = localNotifs.map(n => n.sourceId === sid ? { ...n, title, sub: message } : n);
    saveNotifs(); updateNotifBadge(); renderNotifDropdown(); renderNotifHistory();
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
    saveNotifs(); updateNotifBadge(); renderNotifDropdown(); renderNotifHistory();
    showToast("🗑️ Announcement deleted", "success");
    await renderAnnouncements();
  } else {
    showToast("Failed to delete.", "error");
  }
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
function openNotifHistoryPage(e) {
  if (e) e.stopPropagation();
  if (currentPage === "notif-history") { navigateTo("dashboard"); return; }
  localNotifs = localNotifs.map(n => ({ ...n, read: true }));
  saveNotifs(); updateNotifBadge();
  navigateTo("notif-history");
  renderNotifHistory();
}

function updateNotifBadge() {
  const unread = localNotifs.filter(n => !n.read).length;
  const cnt    = document.getElementById("notifCount");
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
  localNotifs = [];
  saveNotifs(); updateNotifBadge(); renderNotifDropdown(); renderNotifHistory();
  showToast("Notifications cleared.", "info");
}

function renderNotifHistory() {
  const filter = document.getElementById("notifTypeFilter")?.value || "all";
  const list   = document.getElementById("notifHistoryList");
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

async function syncNotifs() {
  if (!cachedClubs.length) return;
  const ann = await apiFetch("/announcements/faculty");
  if (!Array.isArray(ann)) return;

  const existIds = new Set(localNotifs.map(n => n.sourceId).filter(Boolean));
  const ICONS    = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣" };

  ann.forEach(a => {
    const sid      = `ann-${a.id}`;
    const existing = localNotifs.find(n => n.sourceId === sid);
    if (existing) { existing.title = a.title; existing.sub = a.message || ""; existing.time = a.created_at || existing.time; return; }
    localNotifs.unshift({
      id: `${Date.now()}-${Math.random()}`,
      sourceId: sid, type: "admin",
      icon: ICONS[a.type] || "📢",
      title: a.title, sub: a.message || "",
      time: a.created_at || new Date().toISOString(),
      read: false,
    });
  });

  cachedProposals.filter(p => isPendingStatus(p.status)).forEach(p => {
    const sid = `prop-${p.id}`;
    if (existIds.has(sid)) return;
    localNotifs.push({
      id: `${Date.now()}-${Math.random()}`,
      sourceId: sid, type: "event",
      icon: "📋", title: "New Event Proposal",
      sub: `${p.title || "Untitled"} · ${p.club || "—"}`,
      time: p.created_at || new Date().toISOString(),
      read: false,
    });
  });

  saveNotifs(); updateNotifBadge(); renderNotifDropdown();
}

/* ══════════════════════════════════════════════════════════
   PROFILE / ACCOUNT SETTINGS
   ══════════════════════════════════════════════════════════ */
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
    ${cachedClubs.map((c, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:8px;">
        <span style="font-size:20px;">${c.logo || ["🤖","⚡","💻","🤝","🚀"][i % 5]}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);">${c.club_name || c.name || "Club"}</div>
          <div style="font-size:11px;color:var(--text-3);">${c.member_count || 0} members</div>
        </div>
        <span class="club-card-status" style="margin-left:auto;">${c.status || "Active"}</span>
      </div>
    `).join("") || `<div class="list-empty">No clubs assigned.</div>`}
    <div style="margin-top:16px;">
      <button class="btn primary" onclick="closeProfileDrawer(); navigateTo('account-settings')">⚙️ Edit Profile</button>
    </div>
  `;
}

function closeProfileDrawer() {
  document.getElementById("profileDrawer")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("open");
}

function asSetMsg(text, isError = false) {
  const e = document.getElementById("asFormMsg");
  if (!e) return;
  e.textContent = text;
  e.className = isError ? "as-msg error" : "as-msg";
}

function asGetInitials(name) {
  return (name || "FA").split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
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
  const p = cachedProfile;
  if (!p) { asSetMsg("Failed to load profile.", true); return; }
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ""; };
  set("asFacultyNo", p.faculty_no); set("asDepartment", p.department);
  set("asName", p.name); set("asEmail", p.email); set("asPhone", p.phone_no || p.phone);
  const avatar  = document.getElementById("asProfileAvatar");
  const preview = document.getElementById("asProfileNamePreview");
  if (avatar)  avatar.textContent  = asGetInitials(p.name);
  if (preview) preview.textContent = p.name || "Faculty Name";
}

async function asSaveProfile(e) {
  e.preventDefault();
  const g = id => document.getElementById(id)?.value.trim() || "";
  const name = g("asName"), email = g("asEmail"), department = g("asDepartment"), phone = g("asPhone");
  const currentPassword = g("asCurrentPassword"), newPassword = g("asNewPassword"), confirmPassword = g("asConfirmPassword");

  if (!name || !email || !department || !phone) { asSetMsg("Please fill all required fields.", true); return; }
  const wantsPwChange = currentPassword || newPassword || confirmPassword;
  if (wantsPwChange) {
    if (!currentPassword || !newPassword || !confirmPassword) { asSetMsg("Fill all password fields to change password.", true); return; }
    if (newPassword !== confirmPassword) { asSetMsg("New password and confirm password do not match.", true); return; }
    if (newPassword.length < 6) { asSetMsg("New password must be at least 6 characters.", true); return; }
  }

  const payload = { name, email, department, phone_no: phone };
  if (wantsPwChange) { payload.current_password = currentPassword; payload.new_password = newPassword; }

  const submitBtn = document.querySelector("#asAccountForm button[type='submit']");
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Saving…"; }
  asSetMsg("");

  const res = await apiFetch("/faculty/me", { method: "PUT", body: JSON.stringify(payload) });
  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Save Changes"; }
  if (!res) { asSetMsg("Failed to update profile.", true); return; }

  ["asCurrentPassword","asNewPassword","asConfirmPassword"].forEach(id => {
    const e2 = document.getElementById(id); if (e2) e2.value = "";
  });

  cachedProfile = { ...cachedProfile, name, email, department, phone_no: phone };
  const initials = asGetInitials(name);
  el("miniName")  && (document.getElementById("miniName").textContent  = name);
  el("topAvatar") && (document.getElementById("topAvatar").textContent  = initials);
  el("miniAvatar") && (document.getElementById("miniAvatar").textContent = initials);
  asUpdatePreviewName();
  asSetMsg("Profile updated successfully.");
  showToast("✅ Profile updated!", "success");
}

function initAccountSettings() {
  const form = document.getElementById("asAccountForm");
  if (!form || form.dataset.asBound) return;
  form.dataset.asBound = "1";
  form.addEventListener("submit", asSaveProfile);
  document.getElementById("asName")?.addEventListener("input", asUpdatePreviewName);
}

/* ══════════════════════════════════════════════════════════
   BULK / MISC
   ══════════════════════════════════════════════════════════ */
function initBulk() {
  document.getElementById("chkAllCerts")?.addEventListener("change", e => {
    document.querySelectorAll(".cert-cb:not(:disabled)").forEach(cb => cb.checked = e.target.checked);
  });
  document.getElementById("bulkCertBtn")?.addEventListener("click", async () => {
    if (typeof cachedCerts === "undefined") return;
    const ids      = [...document.querySelectorAll(".cert-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) { showToast("Select certificates first.", "error"); return; }
    const eligible = ids.filter(id => { const c = cachedCerts.find(x => x.id === id); return c && (c.attended ?? c.attendance); });
    await Promise.all(eligible.map(id => apiFetch(`/faculty/certificates/${id}/approve`, { method: "PATCH" })));
    eligible.forEach(id => { const c = cachedCerts.find(x => x.id === id); if (c) { c.certificate_status = "approved"; c.status = "approved"; } });
    if (typeof renderCerts === "function") renderCerts();
    showToast(`🎓 ${eligible.length} approved!`, "success");
  });
}

/* ══════════════════════════════════════════════════════════
   BADGES / SEARCH / UTILS
   ══════════════════════════════════════════════════════════ */
function updateBadges() {
  const facultyPending = cachedProposals.filter(p => (p.status || "").toLowerCase().trim() === STATUS.SUBMITTED).length;
  updateBadge("badge-proposals", facultyPending);
  updateBadge("badge-pending",   facultyPending);
}

function updateBadge(id, count) {
  const el2 = document.getElementById(id);
  if (el2) { el2.textContent = count > 0 ? count : "–"; el2.style.opacity = count > 0 ? "1" : "0.4"; }
}

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

function initAllClubsFilters() {
  const searchInput    = document.getElementById("allClubsSearch");
  const categorySelect = document.getElementById("allClubsCategory");
  searchInput?.addEventListener("input", () =>
    renderAllClubs(searchInput.value.toLowerCase(), categorySelect?.value || "all")
  );
  categorySelect?.addEventListener("change", () =>
    renderAllClubs(searchInput?.value.toLowerCase() || "", categorySelect.value)
  );
}

/* ── theme ── */
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

/* ── logout ── */
function logout() {
  const modal = document.createElement("div");
  modal.innerHTML = `
    <div onclick="this.parentElement.remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;
      background:rgba(10,13,28,.97);border:1px solid rgba(139,92,246,.28);border-radius:24px;
      width:min(370px,90vw);padding:30px 26px;box-shadow:var(--shadow-lg);text-align:center;backdrop-filter:var(--blur);">
      <div style="font-size:38px;margin-bottom:10px;">👋</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:6px;">Logging out?</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:24px;">Are you sure you want to sign out of your faculty account?</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="this.closest('div[style*=fixed]').parentElement.remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);
            background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Cancel</button>
        <button onclick="localStorage.removeItem('faculty_auth_token');window.location.href='/faculty/fcsignin.html';"
          style="flex:1;padding:10px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Yes, Logout</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", esc); }
  });
}

/* ── small utilities ── */
function el(id) {
  const e = document.getElementById(id);
  if (!e) return null;
  e.text = v => { e.textContent = v; return e; };
  return e;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : "—"; }

function parseEventDate(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d);
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

function formatTime(t) {
  if (!t) return "—";
  if (typeof t === "string" && t.includes(":")) {
    const [h, m] = t.split(":");
    const hour = +h, ampm = hour >= 12 ? "PM" : "AM", hr12 = hour % 12 || 12;
    return `${hr12}:${m} ${ampm}`;
  }
  const d = new Date(t);
  if (!isNaN(d)) return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return t;
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

function eventMatchesClub(event, club) {
  const cId   = String(club.id   ?? club.club_id  ?? "").trim();
  const cName = (club.club_name  ?? club.name     ?? "").trim().toLowerCase();
  const eId   = String(event.club_id ?? event.clubId ?? "").trim();
  const eName = (event.club ?? event.club_name ?? "").trim().toLowerCase();

  if (cId && eId && cId === eId) return true;

  const norm = s => s.replace(/\bclub\b/gi,"").replace(/[^a-z0-9\s]/g,"").replace(/\s+/g," ").trim();
  const cn = norm(cName), en = norm(eName);
  if (cn && en && cn === en) return true;
  if (cn && en && (cn.includes(en) || en.includes(cn))) return true;
  return false;
}

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

/* ── kick off ── */
boot();
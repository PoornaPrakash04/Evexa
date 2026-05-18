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

function isPendingStatus(status) {
  return ["pending", "review", "submitted", "awaiting", "under review", "new"]
    .includes((status || "").toLowerCase().trim());
}

function isFacultyCoordinator() { return false; } // HC is never FC

/* ── auth fetch ── */
async function apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem("faculty_auth_token");
  if (!token) { window.location.href = "fcsignin.html"; return null; }

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

/* ── state ── */
let currentPage    = "dashboard";
let calYear        = new Date().getFullYear();
let calMonth       = new Date().getMonth();
let chartsInited   = false;
let selectedClubId = "all";

let cachedProfile       = null;
let cachedEvents        = [];
let cachedClubs         = [];
let cachedRegistrations = [];
let cachedProposals     = [];

let cachedHallProposals = [];
let cachedHallVenues    = [];

let isHallCoordinator = true;
let myRoleId          = null;

/* notifications */
let localNotifs = JSON.parse(localStorage.getItem("evexa_faculty_notifs") || "[]");
function saveNotifs() {
  localStorage.setItem("evexa_faculty_notifs", JSON.stringify(localNotifs.slice(0, 50)));
}
function addLocalNotif(type, icon, title, sub, sourceId = null) {
  localNotifs.unshift({
    id: `${Date.now()}-${Math.random()}`,
    sourceId, type, icon, title, sub,
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
  document.getElementById("backToDashboardBtn")?.addEventListener("click", () => navigateTo("dashboard"));
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
    openFacultyEventDetailPage(btn.dataset.eventId);
  });

  initCalNav();
  initAllClubsFilters();
  initSearchFilters();

  let profile = await apiFetch("/faculty/me");
  if (!profile) profile = await apiFetch("/auth/me");
  if (!profile) return;

  cachedProfile = profile;
  myRoleId      = profile.role_id ?? null;
  isHallCoordinator = true;

  const name       = profile.name || "Hall Coordinator";
  const initials   = name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "HC";
  const department = profile.department || "Hall Coordinator";
  const facultyNo  = profile.faculty_no || "";
  const roleName   = profile.role_name  || "Hall Coordinator";

  el("miniName")?.text(name);
  el("miniRole")?.text(facultyNo ? `${facultyNo} · ${roleName}` : roleName);
  el("miniAvatar")?.text(initials);
  el("topAvatar")?.text(initials);
  el("rolePill")?.text(`${roleName} · ${department}`);

  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  el("heroGreeting")?.text(`${greet}, ${name.split(" ")[0]}`);

  await refreshAll();

  const savedPage = localStorage.getItem("facultyCurrentPage") || "dashboard";
  navigateTo(savedPage);

  updateNotifBadge();
  syncNotifs();
}

/* ── data refresh ── */
async function refreshAll() {
  const [events, clubs, registrations, hallProposals, hallVenues, proposals] = await Promise.all([
    apiFetch("/events/all"),
    apiFetch("/clubs/my-clubs"),
    apiFetch("/faculty/registrations").catch(() => null),
    apiFetch("/faculty/hall/proposals").catch(() => null),
    apiFetch("/faculty/hall/venues").catch(() => null),
    apiFetch("/faculty/proposals").catch(() => null),
  ]);

  cachedEvents        = Array.isArray(events)        ? events        : [];
  cachedClubs         = Array.isArray(clubs)         ? clubs         : [];
  cachedRegistrations = Array.isArray(registrations) ? registrations : [];
  cachedHallProposals = Array.isArray(hallProposals) ? hallProposals : [];
  cachedHallVenues    = Array.isArray(hallVenues)    ? hallVenues    : [];
  cachedProposals     = Array.isArray(proposals)     ? proposals     : [];

  updateBadges();
}

/* ── page meta ── */
const PAGE_META = {
  "dashboard":        ["Dashboard",               "Welcome back — here's your hall coordinator overview."],
  "hall-proposals":   ["Hall Proposals",           "Forwarded proposals awaiting your venue confirmation."],
  "hall-venues":      ["My Venues",                "Manage availability for venues under your coordination."],
  "proposals":        ["Event Proposal Review",    "Review, approve or reject submitted proposals."],
  "venues":           ["Venues & Availability",    "Check venue availability by date."],
  "event-list":       ["All Events",               "Complete event list across all clubs."],
  "all-clubs":        ["All Clubs",                "Browse all clubs and their events."],
  
  "announcements":    ["Announcements",            "Post and manage announcements."],
  "notif-history":    ["Notification History",     "All alerts and system updates."],
  "account-settings": ["Account Settings",         "Update your profile and password."],
  "event-detail":     ["Event Detail",             "Full event information."],
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
    backBtn.style.display = ["dashboard", "notif-history"].includes(page) ? "none" : "inline-flex";
  }

  const [t, s] = PAGE_META[page] || ["", ""];
  el("pageTitle")?.text(t);
  el("pageSub")?.text(s);

  const renders = {
    "dashboard":        renderDashboard,
    "hall-proposals":   renderHallProposals,
    "hall-venues":      renderHallVenues,
    "proposals":        renderProposals,
    "venues":           () => loadVenues(),
    "event-list":       () => renderEventList(),
    "all-clubs":        renderAllClubs,
    "announcements":    renderAnnouncements,
    "notif-history":    renderNotifHistory,
    "account-settings": () => { initAccountSettings(); asLoadProfile(); },
    
  };

  await renders[page]?.();
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
async function renderDashboard() {
  if (!cachedEvents.length && !cachedHallProposals.length) await refreshAll();

  const now      = new Date();
  const activeEv = cachedEvents.filter(e => {
    const dt = parseEventDate(e.date || e.event_date || e.start_date);
    return dt && dt >= now;
  });

  el("heroPending")?.text(cachedHallProposals.length);
  el("heroVenues")?.text(cachedHallVenues.length);
  el("heroEvents")?.text(activeEv.length);

  renderDashHallSummary();
  renderDashboardCalendar();
}

function renderDashHallSummary() {
  const body = document.getElementById("dashHallSummaryBody");
  if (!body) return;

  if (!cachedHallProposals.length) {
    body.innerHTML = `<div class="list-empty">No proposals awaiting venue confirmation. 🎉</div>`;
    return;
  }

  body.innerHTML = cachedHallProposals.slice(0, 5).map(p => `
    <div class="dash-item">
      <div class="dot dot-orange"></div>
      <div class="di-text">
        <div class="di-title">${p.title || "Untitled"}</div>
        <div class="di-sub">${p.club || "—"} · ${fmtDate(p.event_date)} · 📍 ${p.venue || "—"}</div>
      </div>
      <div style="display:flex;gap:5px;">
        <button class="mini-btn approve" onclick="approveHallProposal(${p.id})">✅ Confirm</button>
        <button class="mini-btn reject"  onclick="rejectHallProposalPrompt(${p.id})">❌</button>
        <button class="mini-btn"         onclick="showHallProposalDetail(${p.id})">👁</button>
      </div>
    </div>
  `).join("");
}

function renderDashboardCalendar() {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  el("dashCalMonthLabel")?.text(`${MONTHS[calMonth]} ${calYear}`);

  const calEl = document.getElementById("dashMiniCalendar");
  if (!calEl) return;

  const today    = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const total    = new Date(calYear, calMonth + 1, 0).getDate();

  const dayMap = {};
  const allCalEvents = [...cachedEvents, ...cachedHallProposals];
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
    const evs     = dayMap[d] || [];
    const hasPend = evs.some(e => (e.status || "").toLowerCase().trim() === STATUS.FACULTY_APPROVED);
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
  const det = document.getElementById("dashCalEventDetail");

  if (el2.classList.contains("selected")) {
    el2.classList.remove("selected");
    if (det) det.style.display = "none";
    return;
  }

  document.querySelectorAll("#dashMiniCalendar .cal-day.selected").forEach(d => d.classList.remove("selected"));
  el2.classList.add("selected");

  const raw = el2.getAttribute("data-events")?.replace(/&quot;/g, '"');
  if (!raw) { if (det) det.style.display = "none"; return; }

  const evs = JSON.parse(decodeURIComponent(raw));
  el("dashCalDetailTitle")?.text(`${evs.length} event${evs.length > 1 ? "s" : ""} on ${fmtDate(new Date(calYear, calMonth, day))}`);
  el("dashCalDetailMeta")?.text(evs.map(e => `${e.title} · ${e.club || e.organizer || "—"}`).join(" | "));

  const actions = document.getElementById("dashCalDetailActions");
  if (actions) {
    actions.innerHTML = evs.map(e =>
      `<button class="mini-btn" onclick="navigateTo('event-list')">📅 ${e.title}</button>`
    ).join("");
  }

  if (det) det.style.display = "";
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

/* ══════════════════════════════════════════════════════════
   HALL PROPOSALS
   ══════════════════════════════════════════════════════════ */
async function renderHallProposals() {
  const tbody = document.getElementById("hallProposalsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="td-empty">Loading…</td></tr>`;

  const fresh = await apiFetch("/faculty/hall/proposals");
  cachedHallProposals = (Array.isArray(fresh) ? fresh : []).filter(p => {
    const s = (p.status || "").toLowerCase().trim();
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
          ["📍 Venue",     p.venue      || "—"],
          ["📅 Date",      fmtDate(p.event_date)],
          ["🕐 Time",      formatTime(p.event_time)],
          ["👥 Capacity",  p.capacity   || "—"],
          ["🏷️ Category", p.category   || "—"],
          ["💰 Fee",       p.registration_fee > 0 ? "₹" + p.registration_fee : "Free"],
          ["🎪 Organizer", p.organizer  || "—"],
          ["🏛️ Club",     p.club       || "—"],
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
          background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);
          resize:vertical;outline:none;margin-bottom:12px;box-sizing:border-box;"></textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="approveHallProposalFromModal(${p.id})"
          style="flex:1;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#10b981,#059669);
            color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">
          ✅ Confirm Venue
        </button>
        <button onclick="rejectHallProposalFromModal(${p.id})"
          style="flex:1;padding:11px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);
            color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">
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
    const p = cachedHallProposals.find(x => x.id === id);
    if (p) p.status = STATUS.HALL_APPROVED;
    addLocalNotif("event", "✅", "Venue Confirmed — Event Fully Approved",
      `Hall approval granted for "${p?.title || `event #${id}`}". Organizer has been notified.`, id);
    showToast("✅ Venue confirmed — event fully approved!", "success");
    await syncApprovedEventToVenueCalendar(p);
    renderHallProposals();
    renderDashboard();
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
    addLocalNotif("event", "✅", "Venue Confirmed — Event Fully Approved",
      `Hall approval granted for "${p?.title || `event #${id}`}". Organizer has been notified.`, id);
    showToast("✅ Venue confirmed — event fully approved!", "success");
    await syncApprovedEventToVenueCalendar(p);
    renderHallProposals();
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
      border-radius:20px;width:min(440px,92vw);padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
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
            background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button onclick="submitHallReject(${p.id})"
          style="flex:1;padding:10px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;">Confirm Rejection</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById("hallRejectRemark")?.focus();
}

async function submitHallReject(id) {
  const remark = document.getElementById("hallRejectRemark")?.value.trim();
  if (!remark) { showToast("Please enter a reason for rejection.", "error"); return; }

  const res = await apiFetch(`/faculty/hall/proposals/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = cachedHallProposals.find(x => x.id === id);
    if (p) p.status = STATUS.REJECTED;
    document.getElementById("hallRejectModal")?.remove();
    addLocalNotif("event", "❌", "Hall Proposal Rejected",
      `"${p?.title || `Event #${id}`}" venue request rejected. Organizer has been notified.`, id);
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
    addLocalNotif("event", "❌", "Hall Proposal Rejected",
      `"${p?.title || `Event #${id}`}" venue request rejected.`, id);
    showToast("❌ Proposal rejected.", "error");
    renderHallProposals();
  } else {
    showToast("Failed to reject.", "error");
  }
}

/* ══════════════════════════════════════════════════════════
   EVENT PROPOSALS  (copied exactly from faculty-dashboard.js)
   ══════════════════════════════════════════════════════════ */
async function renderProposals(filter = "all", search = "", category = "all") {
  const fcBanner = document.getElementById("fcCoordinatorBanner");
  if (fcBanner) fcBanner.style.display = "none"; // HC is never FC

  const tbody = document.getElementById("proposalsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="td-empty">Loading proposals…</td></tr>`;

  const [freshProposals, freshEvents] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/events/all"),
  ]);

  if (Array.isArray(freshProposals)) cachedProposals = freshProposals;
  if (Array.isArray(freshEvents))    cachedEvents    = freshEvents;

  const proposalItems = (Array.isArray(cachedProposals) ? cachedProposals : []).map(p => ({
    ...p, _src: "proposal", _key: `proposal-${p.id}`,
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
      ...e, _src: "event", _key: `event-${e.id}`,
      organizer: e.organizer || e.created_by || "—",
    }));

  const seen   = new Set();
  const merged = [];
  [...proposalItems, ...submittedEventItems].forEach(item => {
    if (seen.has(item._key)) return;
    seen.add(item._key);
    merged.push(item);
  });

  let list = merged.filter(p => (p.status || "").toLowerCase().trim() === STATUS.SUBMITTED);

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p =>
      (p.title || p.name || "").toLowerCase().includes(q) ||
      (p.club  || p.organizer || "").toLowerCase().includes(q)
    );
  }
  if (category !== "all") list = list.filter(p =>
    (p.category || p.type || "").toLowerCase() === category.toLowerCase()
  );

  window.currentProposalList = list;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="td-empty">No proposals pending review.
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
          <button class="mini-btn approve" onclick="approveProposal(${p.id}, '${p._src}')">✅</button>
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

  const s           = (p.status || "").toLowerCase().trim();
  const isActionable = s === STATUS.SUBMITTED;

  const steps = [
    { key: "submitted",        label: "Submitted",      icon: "📝" },
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
                <button class="mini-btn approve" style="flex:1;justify-content:center;" onclick="approveProposalWithRemark(${p.id}, '${p._src}')">✅ Approve</button>
                <button class="mini-btn reject"  style="flex:1;justify-content:center;" onclick="rejectProposalWithRemark(${p.id}, '${p._src}')">❌ Reject</button>
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
  const res = await apiFetch(resolveApproveEndpoint(id, src), { method: "PATCH" });
  if (res !== null) {
    const p = (window.currentProposalList || []).find(x => x.id === id && x._src === src);
    if (p) p.status = STATUS.FACULTY_APPROVED;
    addLocalNotif("event", "✅", "Proposal Approved", `"${p?.title || "Event"}" has been approved.`, id);
    renderProposals();
    showToast("✅ Proposal approved!", "success");
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
  const res = await apiFetch(resolveApproveEndpoint(id, src), {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = (window.currentProposalList || []).find(x => x.id === id && x._src === src);
    if (p) { p.status = STATUS.FACULTY_APPROVED; p.remark = remark; }
    addLocalNotif("event", "✅", "Proposal Approved", `"${p?.title || "Event"}" has been approved.`, id);
    document.getElementById("proposalDetail").style.display = "none";
    renderProposals();
    showToast("✅ Proposal approved!", "success");
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

/* ══════════════════════════════════════════════════════════
   HALL VENUES
   ══════════════════════════════════════════════════════════ */
async function renderHallVenues() {
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
    available:   "rgba(16,185,129,.18);color:#34d399;border:1px solid rgba(16,185,129,.35)",
    unavailable: "rgba(239,68,68,.18);color:#f87171;border:1px solid rgba(239,68,68,.35)",
    maintenance: "rgba(245,158,11,.18);color:#fcd34d;border:1px solid rgba(245,158,11,.35)",
  };

  container.innerHTML = cachedHallVenues.map(v => {
    const ALLOWED = ["available", "unavailable", "maintenance"];
    const st      = ALLOWED.includes((v.status || "").toLowerCase()) ? v.status.toLowerCase() : "available";
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
          <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Update Availability</div>
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
                Specific Date <span style="font-weight:400;">(optional)</span>
              </label>
              <input type="date" id="venueDate_${v.id}"
                style="padding:8px 12px;border-radius:10px;border:1px solid var(--border-2);
                  background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);outline:none;" />
            </div>
            <div style="flex:1;min-width:160px;">
              <label style="font-size:11px;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px;">Note</label>
              <input type="text" id="venueNote_${v.id}" placeholder="Optional note…"
                value="${(v.coordinator_note || "").replace(/"/g, "&quot;")}"
                style="width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--border-2);
                  background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);
                  outline:none;box-sizing:border-box;" />
            </div>
            <button class="btn primary" onclick="saveVenueAvailability(${v.id})" style="white-space:nowrap;padding:9px 18px;">💾 Save</button>
          </div>
          <div style="margin-top:18px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Upcoming Bookings</div>
            <div id="hallVenueBookings_${v.id}">${renderVenueUpcomingBookings(v.name)}</div>
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
    return d && d >= now &&
      (e.venue || "").toLowerCase().trim() === (venueName || "").toLowerCase().trim();
  }).sort((a, b) => (parseEventDate(a.date||a.event_date||a.start_date)||0) - (parseEventDate(b.date||b.event_date||b.start_date)||0));

  if (!upcoming.length) {
    return `<div style="font-size:13px;color:var(--text-3);padding:8px 0;">No upcoming bookings.</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>Club</th><th>Date</th><th>Time</th><th>Capacity</th><th>Status</th></tr></thead>
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

  const ALLOWED = ["available", "unavailable", "maintenance"];
  if (!status || !ALLOWED.includes(status)) { showToast("Please select a valid status.", "error"); return; }

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

/* ══════════════════════════════════════════════════════════
   VENUES READ-ONLY CALENDAR (copied from faculty-dashboard.js)
   ══════════════════════════════════════════════════════════ */
let venues         = [];
let currentVenueId = null;
let currentVenue   = "";
const venueBookings = {};
let currentMonth = new Date().getMonth();
let currentYear  = new Date().getFullYear();

const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 8; h < 21; h++) {
    const pad = n => String(n).padStart(2, "0");
    slots.push({ label: `${pad(h)}:00 – ${pad(h + 1)}:00`, start: `${pad(h)}:00`, end: `${pad(h + 1)}:00` });
  }
  return slots;
})();

const venueSlotStatus = {};

async function loadVenues() {
  try {
    const data = await apiFetch("/venues");
    if (Array.isArray(data) && data.length) {
      venues = data; currentVenueId = data[0].id; currentVenue = data[0].name || "";
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
    <div class="venue-list-item ${v.id === currentVenueId ? "active" : ""}"
         onclick="selectVenue(${v.id})">${v.name || "Venue"}</div>
  `).join("");
}

async function selectVenue(venueId) {
  const v = venues.find(x => x.id === venueId);
  if (!v) return;
  currentVenueId = v.id; currentVenue = v.name || "";
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
  } catch (err) { console.error("Booking load error:", err); }
}

function renderCalendar() {
  const grid  = document.getElementById("calendarGrid");
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
    const empty = document.createElement("div"); empty.className = "venue-day-empty"; grid.appendChild(empty);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const status = bookings[d] || "available";
    const cell   = document.createElement("div");
    cell.className = `venue-day ${status}`;
    if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
      cell.classList.add("today");
    }
    /* HC can manage slots — keep click handlers active */
    const isManageable = status !== "booked" && status !== "faculty-approved";
    cell.style.cursor = "pointer";
    cell.title = isManageable
      ? (status === "unavailable" ? "Click to mark Available" : "Click to mark Unavailable")
      : "This date has a booked/pending event — cannot change manually";
    if (isManageable) {
      cell.addEventListener("click", () => openSlotToggleModal(d, status));
    } else {
      cell.addEventListener("click", () => openSlotInfoModal(d, status, []));
    }
    const dateKey      = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const unavailCount = ((venueSlotStatus[currentVenue] || {})[dateKey] || new Set()).size;
    cell.innerHTML = `
      <span class="day-number">${d}</span>
      <span class="day-dot"></span>
      ${isManageable ? '<span class="slot-edit-hint">✎</span>' : ''}
      ${status === "partial" && unavailCount ? `<span style="font-size:9px;color:var(--text-3);display:block;line-height:1;margin-top:2px;">${unavailCount}/${TIME_SLOTS.length}</span>` : ''}
    `;
    grid.appendChild(cell);
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

function openSlotToggleModal(day, currentDayStatus) {
  document.getElementById("slotToggleModal")?.remove();

  const dateStr     = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const months      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const displayDate = `${day} ${months[currentMonth]} ${currentYear}`;
  const unavailSet  = (venueSlotStatus[currentVenue] || {})[dateStr] || new Set();

  const bookedSlotIndices = new Set();
  [...cachedEvents, ...cachedHallProposals].forEach(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    if (!d) return;
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (ds !== dateStr) return;
    if ((e.venue || "").toLowerCase().trim() !== (currentVenue || "").toLowerCase().trim()) return;
    const startHr = parseInt((e.time || e.event_time || e.start_time || "").split(":")[0], 10);
    if (!isNaN(startHr)) { const idx = startHr - 8; if (idx >= 0 && idx < TIME_SLOTS.length) bookedSlotIndices.add(idx); }
  });

  const slotsHtml = TIME_SLOTS.map((slot, i) => {
    const isBooked  = bookedSlotIndices.has(i);
    const isUnavail = unavailSet.has(i);
    let cls = "slot-pill";
    if (isBooked)       { cls += " slot-booked";  }
    else if (isUnavail) { cls += " slot-unavail"; }
    else                { cls += " slot-avail";   }
    return `<button class="${cls}" data-idx="${i}" ${isBooked ? "disabled" : ""}>${slot.label}</button>`;
  }).join("");

  const modal = document.createElement("div");
  modal.id = "slotToggleModal";
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
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin:14px 0 16px;font-size:11px;color:var(--text-3);">
        <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#34d399;display:inline-block;"></span>Available</span>
        <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#f87171;display:inline-block;"></span>Unavailable</span>
        <span style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#ec4899;display:inline-block;"></span>Booked (event)</span>
      </div>
      <div id="slotPillGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;">${slotsHtml}</div>
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">
        <button onclick="slotSelectAll(true)" style="padding:6px 14px;border-radius:10px;border:1px solid rgba(239,68,68,.4);background:rgba(239,68,68,.1);color:#f87171;font-size:12px;font-weight:700;cursor:pointer;">🚫 Block all slots</button>
        <button onclick="slotSelectAll(false)" style="padding:6px 14px;border-radius:10px;border:1px solid rgba(16,185,129,.4);background:rgba(16,185,129,.1);color:#34d399;font-size:12px;font-weight:700;cursor:pointer;">✅ Open all slots</button>
      </div>
      <div style="margin-bottom:18px;">
        <label style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:6px;">Note <span style="font-weight:400;opacity:.7;">(optional)</span></label>
        <input id="slotToggleNote" type="text" placeholder="e.g. Maintenance, Reserved for exam…"
          style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);outline:none;box-sizing:border-box;" />
      </div>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('slotToggleModal').remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button onclick="confirmSlotToggle('${dateStr}')"
          style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">💾 Save Changes</button>
      </div>
    </div>
    <style>
      .slot-pill{padding:7px 13px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid;font-family:var(--font,inherit);transition:opacity .15s,transform .1s;white-space:nowrap;}
      .slot-pill:active{transform:scale(.96);}
      .slot-pill.slot-avail{background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.4);color:#34d399;}
      .slot-pill.slot-avail:hover{background:rgba(16,185,129,.28);}
      .slot-pill.slot-unavail{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.45);color:#f87171;}
      .slot-pill.slot-unavail:hover{background:rgba(239,68,68,.32);}
      .slot-pill.slot-booked{background:rgba(236,72,153,.15);border-color:rgba(236,72,153,.35);color:#f472b6;cursor:not-allowed;opacity:.7;}
    </style>
  `;
  document.body.appendChild(modal);
  document.querySelectorAll(".slot-pill:not(.slot-booked)").forEach(btn => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("slot-avail");
      btn.classList.toggle("slot-unavail");
    });
  });
}

function slotSelectAll(markUnavailable) {
  document.querySelectorAll(".slot-pill:not(.slot-booked)").forEach(btn => {
    btn.classList.toggle("slot-unavail",  markUnavailable);
    btn.classList.toggle("slot-avail",   !markUnavailable);
  });
}

async function confirmSlotToggle(dateStr) {
  const note = document.getElementById("slotToggleNote")?.value.trim() || null;
  const unavailIndices = [], availIndices = [];
  document.querySelectorAll(".slot-pill:not(.slot-booked)").forEach(btn => {
    const idx = parseInt(btn.dataset.idx, 10);
    if (btn.classList.contains("slot-unavail")) unavailIndices.push(idx);
    else availIndices.push(idx);
  });

  const totalManageable = unavailIndices.length + availIndices.length;
  const newDayStatus    = unavailIndices.length === 0 ? "available" : "unavailable";
  const localDayStatus  = unavailIndices.length === 0 ? "available"
    : unavailIndices.length === totalManageable ? "unavailable" : "partial";

  const venueObj = cachedHallVenues.find(v =>
    (v.name || "").toLowerCase().trim() === (currentVenue || "").toLowerCase().trim()
  );
  const venueId = venueObj?.id || null;
  const day     = parseInt(dateStr.split("-")[2], 10);

  let success = false;
  if (venueId) {
    const res = await apiFetch(`/faculty/hall/venues/${venueId}/availability`, {
      method: "PATCH",
      body: JSON.stringify({ status: newDayStatus, date: dateStr, note }),
    });
    success = res !== null;
  }

  document.getElementById("slotToggleModal")?.remove();

  if (!venueBookings[currentVenueId]) venueBookings[currentVenueId] = {};
  venueBookings[currentVenueId][day] = localDayStatus;
  if (!venueSlotStatus[currentVenue]) venueSlotStatus[currentVenue] = {};
  venueSlotStatus[currentVenue][dateStr] = new Set(unavailIndices);

  renderCalendar();
  const totalUnavail = unavailIndices.length;
  showToast(
    success
      ? totalUnavail === 0 ? "✅ All slots opened for this date" : `🚫 ${totalUnavail} slot${totalUnavail > 1 ? "s" : ""} marked unavailable`
      : "⚠️ Saved locally — server sync may have failed.",
    success ? "success" : "info"
  );
}

function openSlotInfoModal(day, status, events) {
  document.getElementById("slotInfoModal")?.remove();
  const months      = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const displayDate = `${day} ${months[currentMonth]} ${currentYear}`;
  const dateStr     = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  const allBookedEvents = [...cachedEvents, ...cachedHallProposals].filter(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    if (!d) return false;
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return ds === dateStr && (e.venue || "").toLowerCase().trim() === (currentVenue || "").toLowerCase().trim();
  });

  const statusColor    = status === "booked" ? "rgba(239,68,68,.35)" : "rgba(6,182,212,.35)";
  const statusLabelStr = status === "booked" ? "🔴 Booked" : "🔵 Pending Approval";

  const modal = document.createElement("div");
  modal.id = "slotInfoModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('slotInfoModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3001;background:var(--surface,#1a1a2e);border:1px solid ${statusColor};
      border-radius:20px;width:min(460px,92vw);max-height:80vh;overflow-y:auto;
      padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--text);">📅 ${displayDate}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px;">📍 ${currentVenue} · ${statusLabelStr}</div>
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
          background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">Close</button>
    </div>
  `;
  document.body.appendChild(modal);
}

async function syncApprovedEventToVenueCalendar(proposal) {
  if (!proposal) return;
  const eventDate = parseEventDate(proposal.event_date || proposal.date || proposal.start_date);
  const venueName = (proposal.venue || "").trim();
  if (!eventDate || !venueName) return;

  const evDay   = eventDate.getDate();
  const venueObj2 = venues.find(v => (v.name || "").toLowerCase().trim() === venueName.toLowerCase().trim());
  const cacheKey  = venueObj2?.id ?? venueName;
  if (!venueBookings[cacheKey]) venueBookings[cacheKey] = {};
  venueBookings[cacheKey][evDay] = "booked";

  const alreadyCached = cachedEvents.find(e => e.id === proposal.id);
  if (!alreadyCached) cachedEvents.push({ ...proposal, status: STATUS.HALL_APPROVED });
  else alreadyCached.status = STATUS.HALL_APPROVED;

  if (currentPage === "hall-venues") renderHallVenues();
}

/* ══════════════════════════════════════════════════════════
   ANNOUNCEMENTS  (copied exactly from faculty-dashboard.js)
   ══════════════════════════════════════════════════════════ */
async function renderAnnouncements() {
  const al = document.getElementById("announceList");
  if (!al) return;

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

  /* HC may not be assigned clubs, so fall back to null club_id */
  const clubId = cachedClubs[0]?.id ?? cachedClubs[0]?.club_id ?? null;

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
      border-radius:20px;width:min(460px,92vw);padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="font-size:16px;font-weight:800;color:var(--text,#f0f2ff);margin-bottom:18px;">✏️ Edit Announcement</div>
      <label style="font-size:11px;font-weight:700;color:var(--text-3,#94a3b8);text-transform:uppercase;letter-spacing:.6px;">Title</label>
      <input id="editAnnTitle" value="${currentTitle.replace(/"/g,'&quot;')}"
        style="width:100%;margin:6px 0 14px;padding:10px 12px;border-radius:10px;
          border:1px solid rgba(139,92,246,.3);background:var(--surface-2,#0d0d1a);
          color:var(--text,#f0f2ff);font-size:13px;font-family:var(--font,inherit);outline:none;box-sizing:border-box;"/>
      <label style="font-size:11px;font-weight:700;color:var(--text-3,#94a3b8);text-transform:uppercase;letter-spacing:.6px;">Message</label>
      <textarea id="editAnnMessage" rows="4"
        style="width:100%;margin:6px 0 20px;padding:10px 12px;border-radius:10px;
          border:1px solid rgba(139,92,246,.3);background:var(--surface-2,#0d0d1a);
          color:var(--text,#f0f2ff);font-size:13px;font-family:var(--font,inherit);
          resize:vertical;outline:none;box-sizing:border-box;">${currentMessage}</textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('editAnnModal').remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2,rgba(255,255,255,.1));
            background:var(--surface-2,#0d0d1a);color:var(--text,#f0f2ff);font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button onclick="submitEditAnnouncement(${id})"
          style="flex:1;padding:10px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#8b5cf6,#ec4899);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save Changes</button>
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
   EVENT LIST
   ══════════════════════════════════════════════════════════ */
async function renderEventList(search = "", status = "all") {
  const fresh = await apiFetch("/events/all");
  cachedEvents = Array.isArray(fresh) ? fresh : [];

  const tbody = document.getElementById("eventListBody");
  if (!tbody) return;

  let list = [...cachedEvents];
  if (status !== "all") list = list.filter(e => (e.status || "").toLowerCase().trim() === status.toLowerCase());
  if (search) {
    const q = search.toLowerCase();
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
    if (!cachedEvents.length) {
      const evs = await apiFetch("/events/all");
      cachedEvents = Array.isArray(evs) ? evs : [];
    }

    let ev = cachedEvents.find(e => String(e.id) === String(eventId));
    if (!ev) { const one = await apiFetch(`/events/${eventId}`); if (one) ev = one; }
    if (!ev) { body.innerHTML = `<div class="list-empty" style="padding:24px;">Event not found.</div>`; return; }

    let registered = Number(ev.registered_count || ev.registered || 0);
    try {
      const countRes = await apiFetch(`/faculty/registrations/count/${eventId}`);
      if (countRes && typeof countRes.count !== "undefined") registered = Number(countRes.count || 0);
    } catch (_) {}

    const capacity  = Number(ev.capacity || ev.expected_participants || 0);
    const seatsLeft = Math.max(0, capacity - registered);
    const pct       = capacity > 0 ? Math.min(100, Math.round((registered / capacity) * 100)) : 0;
    const posterUrl = (ev.poster || ev.posterUrl) ? `https://evexa-production.up.railway.app/uploads/${ev.poster || ev.posterUrl}` : "";

    body.innerHTML = `
      <div class="fed-page">
        <div class="fed-hero">
          ${posterUrl
            ? `<img src="${posterUrl}" alt="${ev.title || "Event"}" class="fed-poster"
                   onerror="this.outerHTML='<div class=&quot;fed-poster fed-poster-fallback&quot;>📅</div>';">`
            : `<div class="fed-poster fed-poster-fallback">📅</div>`}
          <div class="fed-hero-content">
            <div class="fed-top-row">
              <div>
                <h1 class="fed-title">${ev.title || "Untitled Event"}</h1>
                <div class="fed-sub">${ev.club || ev.organizer || "—"} · ${fmtDate(ev.date || ev.event_date || ev.start_date)}</div>
              </div>
              <div class="fed-actions">
                <button class="btn-primary" onclick="downloadFacultyEventReport(${ev.id})">⬇ Download Report</button>
              </div>
            </div>
            <div class="fed-badges">
              <span class="badge">${cap(ev.status || "approved")}</span>
              <span class="badge">${ev.category || ev.type || "General"}</span>
              <span class="badge">${ev.registration_fee > 0 ? "₹" + ev.registration_fee : "Free"}</span>
            </div>
          </div>
        </div>
        <div class="fed-grid">
          <div class="panel">
            <div class="panel-header"><div class="panel-title">Event Overview</div></div>
            <div class="panel-body">
              <div class="fed-desc">${ev.description || ev.details || "No description available."}</div>
              <div class="fed-info-grid">
                <div class="fed-info-card"><b>Date</b><span>${fmtDate(ev.date || ev.event_date || ev.start_date)}</span></div>
                <div class="fed-info-card"><b>Time</b><span>${formatTime(ev.time || ev.start_time)}</span></div>
                <div class="fed-info-card"><b>Venue</b><span>${ev.venue || "—"}</span></div>
                <div class="fed-info-card"><b>Club</b><span>${ev.club || ev.organizer || "—"}</span></div>
                <div class="fed-info-card"><b>Category</b><span>${ev.category || ev.type || "General"}</span></div>
                <div class="fed-info-card"><b>Created By</b><span>${ev.created_by || ev.submitted_by || "—"}</span></div>
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
                <button class="btn ghost sm" onclick="loadFacultyParticipants(${ev.id})">👥 View Participants</button>
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
          ${data.map((p, i) => `<tr><td>${i+1}</td><td>${p.name||"-"}</td><td>${p.email||"-"}</td><td>${p.department||"-"}</td><td>${p.class||"-"}</td><td>${p.phone_no||p.phone||"-"}</td></tr>`).join("")}
        </tbody>
      </table>`;
  } catch (err) { console.error(err); wrap.innerHTML = "Failed to load participants."; }
}

async function downloadFacultyEventReport(eventId) {
  try {
    const res  = await apiFetch(`/faculty/events/${eventId}/participants`);
    const data = Array.isArray(res) ? res : [];
    if (!data.length) { showToast("No data to export.", "error"); return; }
    const headers = ["Name","Email","Department","Class","Phone"];
    const rows    = data.map(p => [p.name||"",p.email||"",p.department||"",p.class||"",p.phone_no||p.phone||""]);
    const csv     = [headers,...rows].map(r => r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
    a.download = `event_report_${eventId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("⬇️ Report downloaded!","success");
  } catch (err) { console.error(err); showToast("Download failed.","error"); }
}

async function downloadParticipants(eventId) {
  try {
    const data = await apiFetch(`/faculty/events/${eventId}/participants`);
    if (!data||!data.length){showToast("No participants found.","error");return;}
    const headers = ["Name","Email","Department","Phone"];
    const rows    = data.map(p=>[p.name,p.email,p.department,p.phone_no||p.phone]);
    const csv     = "data:text/csv;charset=utf-8,"+[headers,...rows].map(r=>r.join(",")).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `event_${eventId}_participants.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("⬇️ Download started!","success");
  } catch (err) { console.error(err); showToast("Download failed.","error"); }
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
    const clubName = c.club_name || c.name || "Club";
    const clubId   = String(c.id ?? c.club_id ?? "");
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
            ${c.description ? c.description.slice(0,60)+(c.description.length>60?"…":"") : "—"}
          </div>
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

  el("clubDetailEmoji")?.text(club.logo || emojis[idx % emojis.length]);
  el("clubDetailName")?.text(clubName);
  el("clubDetailCat")?.text(club.category || club.type || "Club");

  const statsEl = document.getElementById("clubDetailStats");
  if (statsEl) {
    statsEl.innerHTML = [
      { val: club.member_count || club.members || 0, label: "Members" },
      { val: currentClubEvents.length, label: "Total Events" },
      { val: upcoming, label: "Upcoming" },
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
          <div class="club-info-cell"><div class="club-info-label">${l}</div><div class="club-info-val">${v}</div></div>
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
  if (search)           list = list.filter(e =>
    (e.title||"").toLowerCase().includes(search) ||
    (e.venue||"").toLowerCase().includes(search) ||
    (e.category||e.type||"").toLowerCase().includes(search)
  );
  const tbody = document.getElementById("clubDetailEventsBody");
  if (!tbody) return;
  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span class="ev-name">${e.title||"Untitled"}</span></td>
      <td>${fmtDate(e.date||e.event_date||e.start_date)}</td>
      <td>${e.venue||"—"}</td>
      <td><span class="tag">${e.category||e.type||"General"}</span></td>
      <td>${e.capacity||e.expected_participants||"—"}</td>
      <td>${e.registration_fee>0?"₹"+e.registration_fee:"Free"}</td>
      <td><span class="badge ${e.status||"approved"}">${cap(e.status||"approved")}</span></td>
    </tr>
  `).join("")
  : `<tr><td colspan="7" class="td-empty">No events match filter.</td></tr>`;
}

/* ══════════════════════════════════════════════════════════
   ANALYTICS
   ══════════════════════════════════════════════════════════ */
async function initCharts() {
  chartsInited = true;

  const kpi  = document.getElementById("analyticsKpi");
  const now  = new Date();

  const approvedEvents = cachedEvents.filter(e =>
    ["hall_approved","approved","published"].includes((e.status||"").toLowerCase().trim())
  );
  const totalRegistrations = cachedEvents.reduce((sum, e) =>
    sum + Number(e.registered_count ?? e.registered ?? e.registrations_count ?? e.participant_count ?? 0), 0);

  if (kpi) {
    kpi.innerHTML = [
      { icon: "📋", val: cachedEvents.length,    label: "Total Events"          },
      { icon: "✅", val: approvedEvents.length,  label: "Approved Events"       },
      { icon: "👥", val: totalRegistrations,     label: "Student Registrations" },
    ].map(d => `
      <div class="kpi-card">
        <div class="kpi-icon">${d.icon}</div>
        <div class="kpi-val">${d.val}</div>
        <div class="kpi-label">${d.label}</div>
      </div>
    `).join("");
  }

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const labels = [], evCounts = [], regCounts = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTH_NAMES[d.getMonth()]);
    const monthEvs = cachedEvents.filter(e => {
      const ed = parseEventDate(e.date || e.event_date || e.start_date);
      return ed && ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
    });
    evCounts.push(monthEvs.length);
    regCounts.push(monthEvs.reduce((sum, e) =>
      sum + Number(e.registered_count ?? e.registered ?? e.registrations_count ?? e.participant_count ?? 0), 0));
  }

  const chartDefaults = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "rgba(240,242,255,.4)", font: { weight: 600, size: 11 } } },
      y: { grid: { color: "rgba(255,255,255,.05)" }, ticks: { color: "rgba(240,242,255,.4)", font: { weight: 600, size: 11 }, stepSize: 1 }, beginAtZero: true },
    },
  };

  tryChart("eventsChart", {
    type: "bar",
    data: { labels, datasets: [{ data: evCounts, backgroundColor: "rgba(6,182,212,.7)", borderRadius: 7, borderSkipped: false }] },
    options: chartDefaults,
  });
  tryChart("participationChart", {
    type: "line",
    data: { labels, datasets: [{ data: regCounts, borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,.12)", borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#06b6d4" }] },
    options: chartDefaults,
  });

  const TECHNICAL_KEYWORDS = ["ieee","iedc","robotics","coding","tech","computer","ai","ml","cyber","hack","software","hardware"];
  const technical    = cachedEvents.filter(e => {
    const cat = (e.club_category || e.category || "").toLowerCase().trim();
    if (cat === "technical") return true;
    if (cat === "non-technical") return false;
    const s = [e.type||"",e.club||"",e.club_name||"",e.title||""].join(" ").toLowerCase();
    return TECHNICAL_KEYWORDS.some(kw => s.includes(kw));
  }).length;
  const nonTechnical = Math.max(0, cachedEvents.length - technical);
  const total        = cachedEvents.length || 1;

  tryChart("typeChart", {
    type: "doughnut",
    data: { labels: ["Technical","Non-Technical"], datasets: [{ data: [technical||0,nonTechnical||0], backgroundColor: ["#06b6d4","#8b5cf6"], borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: "68%" },
  });

  const leg = document.getElementById("typeChartLegend");
  if (leg) {
    leg.innerHTML = [
      { color: "#06b6d4", label: "Technical",     pct: Math.round((technical    / total) * 100), cnt: technical    },
      { color: "#8b5cf6", label: "Non-Technical", pct: Math.round((nonTechnical / total) * 100), cnt: nonTechnical },
    ].map(d => `
      <div class="leg-row">
        <div class="leg-swatch" style="background:${d.color};"></div>
        <div><div class="leg-text">${d.label} — ${d.pct}%</div><div class="leg-pct">${d.cnt} events</div></div>
      </div>
    `).join("");
  }

  const venueMap = {};
  cachedEvents.forEach(e => { const name = (e.venue||"Unknown").trim(); venueMap[name] = (venueMap[name]||0)+1; });
  const sorted     = Object.entries(venueMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const venueNames = sorted.map(([name])=>name);
  const venueCnts  = sorted.map(([,count])=>count);
  const BG_COLORS  = ["rgba(6,182,212,.7)","rgba(139,92,246,.7)","rgba(16,185,129,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(239,68,68,.7)","rgba(59,130,246,.7)","rgba(251,146,60,.7)","rgba(132,204,22,.7)","rgba(167,139,250,.7)"];

  tryChart("clubChart", {
    type: "bar",
    data: { labels: venueNames.length?venueNames:["No events"], datasets: [{ data: venueCnts.length?venueCnts:[0], backgroundColor: venueNames.map((_,i)=>BG_COLORS[i%BG_COLORS.length]), borderRadius:7, borderSkipped:false }] },
    options: { ...chartDefaults, indexAxis: "y" },
  });
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
  const ann = await apiFetch("/announcements/faculty");
  if (!Array.isArray(ann)) return;
  const ICONS = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣" };
  ann.forEach(a => {
    const sid      = `ann-${a.id}`;
    const existing = localNotifs.find(n => n.sourceId === sid);
    if (existing) { existing.title = a.title; existing.sub = a.message || ""; return; }
    localNotifs.unshift({
      id: `${Date.now()}-${Math.random()}`,
      sourceId: sid, type: "admin",
      icon: ICONS[a.type] || "📢",
      title: a.title, sub: a.message || "",
      time: a.created_at || new Date().toISOString(),
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

  const p        = cachedProfile;
  const initials = (p.name || "HC").split(" ").map(n => n[0]).join("").slice(0, 2);

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div style="width:72px;height:72px;border-radius:18px;background:var(--g-cyan);display:grid;place-items:center;font-size:26px;font-weight:800;color:white;">${initials}</div>
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--text);">${p.name || "Hall Coordinator"}</div>
        <div style="font-size:13px;color:var(--text-3);margin-top:3px;">${p.email || "—"}</div>
        <div style="font-size:13px;color:var(--text-3);">${p.department || "—"}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
      ${[["Faculty No",p.faculty_no||"—"],["Department",p.department||"—"],["Email",p.email||"—"],["Phone",p.phone_no||p.phone||"—"]].map(([l,v]) => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">${l}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${v}</div>
        </div>
      `).join("")}
    </div>
    <div class="divider" style="margin-top:16px;"></div>
    <div style="margin-top:14px;">
      <button class="btn primary" onclick="closeProfileDrawer(); navigateTo('account-settings')">⚙️ Edit Profile</button>
    </div>
  `;
}

function closeProfileDrawer() {
  document.getElementById("profileDrawer")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("open");
}

function asGetInitials(name) {
  return (name || "HC").split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function asUpdatePreviewName() {
  const nameInput = document.getElementById("asName");
  const avatar    = document.getElementById("asProfileAvatar");
  const preview   = document.getElementById("asProfileNamePreview");
  if (!nameInput || !avatar || !preview) return;
  const name = nameInput.value.trim() || "Hall Coordinator";
  preview.textContent = name;
  avatar.textContent  = asGetInitials(name);
}

function asLoadProfile() {
  const p = cachedProfile;
  if (!p) return;
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ""; };
  set("asFacultyNo",p.faculty_no); set("asDepartment",p.department);
  set("asName",p.name); set("asEmail",p.email); set("asPhone",p.phone_no||p.phone);
  const avatar  = document.getElementById("asProfileAvatar");
  const preview = document.getElementById("asProfileNamePreview");
  if (avatar)  avatar.textContent  = asGetInitials(p.name);
  if (preview) preview.textContent = p.name || "Hall Coordinator";
}

async function asSaveProfile(e) {
  e.preventDefault();
  const g = id => document.getElementById(id)?.value.trim() || "";
  const name = g("asName"), email = g("asEmail"), department = g("asDepartment"), phone = g("asPhone");
  const currentPassword = g("asCurrentPassword"), newPassword = g("asNewPassword"), confirmPassword = g("asConfirmPassword");

  if (!name || !email || !department || !phone) { asSetMsg("Please fill all required fields.", true); return; }
  const wantsPwChange = currentPassword || newPassword || confirmPassword;
  if (wantsPwChange) {
    if (!currentPassword || !newPassword || !confirmPassword) { asSetMsg("Fill all password fields.", true); return; }
    if (newPassword !== confirmPassword) { asSetMsg("Passwords do not match.", true); return; }
    if (newPassword.length < 6) { asSetMsg("Password must be at least 6 characters.", true); return; }
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
    const el2 = document.getElementById(id); if (el2) el2.value = "";
  });

  cachedProfile = { ...cachedProfile, name, email, department, phone_no: phone };
  el("miniName") && (document.getElementById("miniName").textContent = name);
  const initials = asGetInitials(name);
  el("topAvatar")  && (document.getElementById("topAvatar").textContent  = initials);
  el("miniAvatar") && (document.getElementById("miniAvatar").textContent = initials);
  asUpdatePreviewName();
  asSetMsg("Profile updated successfully.");
  showToast("✅ Profile updated!", "success");
}

function asSetMsg(text, isError = false) {
  const el2 = document.getElementById("asFormMsg");
  if (!el2) return;
  el2.textContent = text;
  el2.className = isError ? "as-msg error" : "as-msg";
}

function initAccountSettings() {
  const form = document.getElementById("asAccountForm");
  if (!form || form.dataset.asBound) return;
  form.dataset.asBound = "1";
  form.addEventListener("submit", asSaveProfile);
  document.getElementById("asName")?.addEventListener("input", asUpdatePreviewName);
}

/* ══════════════════════════════════════════════════════════
   BADGES / SEARCH FILTERS / UTILS
   ══════════════════════════════════════════════════════════ */
function updateBadges() {
  const hallPending     = cachedHallProposals.length;
  const proposalPending = cachedProposals.filter(p => (p.status||"").toLowerCase().trim() === STATUS.SUBMITTED).length;
  updateBadge("badge-hall-proposals", hallPending);
  updateBadge("badge-proposals",      proposalPending);
}

function updateBadge(id, count) {
  const el2 = document.getElementById(id);
  if (el2) { el2.textContent = count > 0 ? count : "–"; el2.style.opacity = count > 0 ? "1" : "0.4"; }
}

function initSearchFilters() {
  document.getElementById("proposalSearch")?.addEventListener("input", debounce(e =>
    renderProposals("all", e.target.value.toLowerCase())
  ));
  document.getElementById("eventListSearch")?.addEventListener("input", debounce(e =>
    renderEventList(e.target.value.toLowerCase())
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
      background:rgba(10,13,28,.97);border:1px solid rgba(6,182,212,.28);border-radius:24px;
      width:min(370px,90vw);padding:30px 26px;box-shadow:var(--shadow-lg);text-align:center;">
      <div style="font-size:38px;margin-bottom:10px;">👋</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:6px;">Logging out?</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:24px;">Are you sure you want to sign out of your hall coordinator account?</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="this.closest('div[style*=fixed]').parentElement.remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Cancel</button>
        <button onclick="localStorage.removeItem('faculty_auth_token');window.location.href='fcsignin.html';"
          style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Yes, Logout</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
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

/* ── kick off ── */
boot();

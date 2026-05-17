var API = "https://evexa-production.up.railway.app/api";
window.API = API;

const STATUS = {
  DRAFT:            "draft",
  SUBMITTED:        "submitted",
  FACULTY_APPROVED: "faculty_approved",
  HOD_APPROVED:     "hod_approved",
  HALL_APPROVED:    "hall_approved",
  REJECTED:         "rejected",
};

const STATUS_LABEL = {
  draft:            "Draft",
  submitted:        "Pending Review",
  faculty_approved: "Pending Faculty",
  hod_approved:     "HOD Approved",
  hall_approved:    "Approved",
  rejected:         "Rejected",
};

function statusClass(status) {
  const s = (status || "").toLowerCase().trim();
  const map = {
    submitted:        "submitted",
    faculty_approved: "faculty_approved",
    hod_approved:     "hod_approved",
    hall_approved:    "approved",
    rejected:         "rejected",
    draft:            "draft",
    pending:          "submitted",
    approved:         "approved",
  };
  return map[s] || s;
}

function statusLabel(s) {
  return STATUS_LABEL[(s || "").toLowerCase().trim()] || cap(s) || "—";
}

/* ── auth fetch ── */
async function apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem("faculty_auth_token");
  if (!token) { window.location.href = "fcsignin.html"; return null; }

  try {
    const base = window.API || "https://evexa-production.up.railway.app/api";
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
      console.error(`[apiFetch] ${endpoint} → ${res.status} | ${body}`);
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
let currentPage = "dashboard";
let calYear     = new Date().getFullYear();
let calMonth    = new Date().getMonth();
let chartsInited = false;

let cachedProfile          = null;
let cachedEvents           = [];
let cachedClubs            = [];
let cachedClassroomRequests = [];
let cachedMyClassrooms     = [];
let cachedProposals        = [];
let cachedDeptEvents       = [];
let cachedDeptClubs        = [];

let allClubsData      = [];
let currentClubDetail = null;
let currentClubEvents = [];

/* ── notifications ── */
let localNotifs = JSON.parse(localStorage.getItem("evexa_hod_notifs") || "[]");
function saveNotifs() {
  localStorage.setItem("evexa_hod_notifs", JSON.stringify(localNotifs.slice(0, 50)));
}
function addLocalNotif(type, icon, title, sub, sourceId = null) {
  localNotifs.unshift({
    id: `${Date.now()}-${Math.random()}`,
    sourceId, type, icon, title, sub,
    time: new Date().toISOString(), read: false,
  });
  saveNotifs(); updateNotifBadge(); renderNotifDropdown();
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

  initCalNav();
  initSearchFilters();

  let profile = await apiFetch("/faculty/me");
  if (!profile) profile = await apiFetch("/auth/me");
  if (!profile) return;

  cachedProfile = profile;
  const name       = profile.name || "HOD Coordinator";
  const initials   = name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "HD";
  const department = profile.department || "";
  const facultyNo  = profile.faculty_no || "";
  const roleName   = profile.role_name  || "HOD Coordinator";

  elSet("miniName", name);
  elSet("miniRole", facultyNo ? `${facultyNo} · ${roleName}` : roleName);
  elSet("miniAvatar", initials);
  elSet("topAvatar", initials);
  elSet("rolePill", `${roleName}${department ? " · " + department : ""}`);

  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  elSet("heroGreeting", `${greet}, ${name.split(" ")[0]}`);

  await refreshAll();
  const savedPage = localStorage.getItem("hodCurrentPage") || "dashboard";
  navigateTo(savedPage);

  updateNotifBadge();
  syncNotifs();
}

/* ── data refresh ── */
async function refreshAll() {
  const [events, clubs, classroomReqs, myClassrooms, proposals] = await Promise.all([
    apiFetch("/events/all").catch(() => null),
    apiFetch("/clubs/my-clubs").catch(() => null),
    apiFetch("/faculty/hod/classroom-requests").catch(() => null),
    apiFetch("/faculty/hod/classrooms").catch(() => null),
    apiFetch("/faculty/proposals").catch(() => null),
  ]);

  cachedEvents            = Array.isArray(events)        ? events        : [];
  cachedClubs             = Array.isArray(clubs)         ? clubs         : [];
  cachedClassroomRequests = Array.isArray(classroomReqs) ? classroomReqs : [];
  cachedMyClassrooms      = Array.isArray(myClassrooms)  ? myClassrooms  : [];
  cachedProposals         = Array.isArray(proposals)     ? proposals     : [];

  // Dept events: events whose venue matches a classroom of ours
  const myClassroomNames = new Set(cachedMyClassrooms.map(c => (c.name || "").toLowerCase().trim()));
  cachedDeptEvents = cachedEvents.filter(e => {
    const v = (e.venue || "").toLowerCase().trim();
    if (!v) return false;
    // Match by classroom name or by department
    return myClassroomNames.has(v) || (e.department || "").toLowerCase() === (cachedProfile?.department || "").toLowerCase();
  });

  cachedDeptClubs = cachedClubs;
  updateBadges();
}

/* ── page meta ── */
const PAGE_META = {
  "dashboard":           ["Dashboard",              "Welcome back — here's your HOD coordinator overview."],
  "classroom-requests":  ["Classroom Requests",     "Proposals requesting classroom allocation from your department."],
  "my-classrooms":       ["My Classrooms",          "Manage classroom availability for your department."],
  "dept-events":         ["Department Events",      "All events using classrooms in your department."],
  "dept-clubs":          ["Department Clubs",       "Clubs and their events within your department."],
  "proposals":           ["Event Proposal Review",  "Review and approve submitted proposals."],
  "analytics":           ["Reports & Analytics",    "Department event and participation statistics."],
  "announcements":       ["Announcements",          "Post and manage department announcements."],
  "notif-history":       ["Notification History",   "All alerts and system updates."],
  "account-settings":    ["Account Settings",       "Update your profile and password."],
};

async function navigateTo(page) {
  localStorage.setItem("hodCurrentPage", page);

  document.querySelectorAll("[id^='pg-']").forEach(e => e.style.display = "none");
  const pg = document.getElementById("pg-" + page);
  if (pg) pg.style.display = "";

  document.querySelectorAll(".nav-item").forEach(e =>
    e.classList.toggle("active", e.dataset.page === page)
  );

  currentPage = page;

  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.style.display = ["dashboard", "notif-history"].includes(page) ? "none" : "inline-flex";

  const [t, s] = PAGE_META[page] || ["", ""];
  elSet("pageTitle", t);
  elSet("pageSub", s);

  const renders = {
    "dashboard":          renderDashboard,
    "classroom-requests": renderClassroomRequests,
    "my-classrooms":      renderMyClassrooms,
    "dept-events":        renderDeptEvents,
    "dept-clubs":         renderDeptClubs,
    "proposals":          renderProposals,
    "announcements":      renderAnnouncements,
    "notif-history":      renderNotifHistory,
    "account-settings":   () => { initAccountSettings(); asLoadProfile(); },
    "analytics": async () => {
      chartsInited = false;
      await refreshAll();
      setTimeout(initCharts, 60);
    },
  };

  await renders[page]?.();
}

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
async function renderDashboard() {
  if (!cachedEvents.length && !cachedClassroomRequests.length) await refreshAll();

  elSet("heroPending", cachedClassroomRequests.length);
  elSet("heroClassrooms", cachedMyClassrooms.length);
  elSet("heroDeptEvents", cachedDeptEvents.length);

  renderDashClassroomSummary();
  renderDashboardCalendar();
}

function renderDashClassroomSummary() {
  const body = document.getElementById("dashClassroomSummaryBody");
  if (!body) return;
  if (!cachedClassroomRequests.length) {
    body.innerHTML = `<div class="list-empty">No classroom requests awaiting confirmation. 🎉</div>`;
    return;
  }
  body.innerHTML = cachedClassroomRequests.slice(0, 5).map(p => `
    <div class="dash-item">
      <div class="dot dot-teal"></div>
      <div class="di-text">
        <div class="di-title">${p.title || "Untitled"}</div>
        <div class="di-sub">${p.club || "—"} · ${fmtDate(p.event_date)} · 🚪 ${p.venue || p.classroom || "—"}</div>
      </div>
      <div style="display:flex;gap:5px;">
        <button class="mini-btn approve" onclick="approveClassroomRequest(${p.id})">✅ Confirm</button>
        <button class="mini-btn reject"  onclick="rejectClassroomRequestPrompt(${p.id})">❌</button>
        <button class="mini-btn"         onclick="showClassroomRequestDetail(${p.id})">👁</button>
      </div>
    </div>
  `).join("");
}

function renderDashboardCalendar() {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  elSet("dashCalMonthLabel", `${MONTHS[calMonth]} ${calYear}`);

  const calEl = document.getElementById("dashMiniCalendar");
  if (!calEl) return;

  const today    = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const total    = new Date(calYear, calMonth + 1, 0).getDate();

  const dayMap = {};
  const allEvs = [...cachedDeptEvents, ...cachedClassroomRequests];
  const seen = new Set();
  allEvs.forEach(e => {
    if (!e || seen.has(e.id)) return;
    seen.add(e.id);
    const dt = parseEventDate(e.date || e.event_date || e.start_date);
    if (!dt || dt.getFullYear() !== calYear || dt.getMonth() !== calMonth) return;
    const day = dt.getDate();
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(e);
  });

  const days = ["SU","MO","TU","WE","TH","FR","SA"];
  let html = `<div class="cal-weekdays">${days.map(d => `<div class="cal-weekday">${d}</div>`).join("")}</div><div class="cal-days">`;
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const evs     = dayMap[d] || [];
    const hasPend = evs.some(e => (e.status || "").toLowerCase() === STATUS.SUBMITTED);
    const hasAppr = evs.some(e => ["hod_approved","hall_approved","approved"].includes((e.status||"").toLowerCase()));
    const hasAny  = evs.length > 0;
    const dayClass = hasPend ? "has-pending" : hasAppr ? "has-approved" : hasAny ? "has-event" : "";
    const cls = ["cal-day", isToday ? "today" : "", dayClass].filter(Boolean).join(" ");
    const enc = evs.length ? encodeURIComponent(JSON.stringify(evs.map(e => ({id:e.id,title:e.title,club:e.club,status:e.status})))) : "";
    html += `<div class="${cls}" onclick="dashCalDayClick(this,${d})" data-events="${enc.replace(/"/g,"&quot;")}">${d}</div>`;
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
  elSet("dashCalDetailTitle", `${evs.length} event${evs.length > 1 ? "s" : ""} on ${fmtDate(new Date(calYear, calMonth, day))}`);
  elSet("dashCalDetailMeta", evs.map(e => `${e.title} · ${e.club || "—"}`).join(" | "));
  const actions = document.getElementById("dashCalDetailActions");
  if (actions) {
    actions.innerHTML = evs.map(e =>
      `<button class="mini-btn" onclick="navigateTo('dept-events')">📅 ${e.title}</button>`
    ).join("");
  }
  if (det) det.style.display = "";
}

function initCalNav() {
  document.getElementById("dashCalPrev")?.addEventListener("click", () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    renderDashboardCalendar();
  });
  document.getElementById("dashCalNext")?.addEventListener("click", () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    renderDashboardCalendar();
  });
}

/* ══════════════════════════════════════════════════════════
   CLASSROOM REQUESTS
   ══════════════════════════════════════════════════════════ */
async function renderClassroomRequests() {
  const tbody = document.getElementById("classroomRequestsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" class="td-empty">Loading…</td></tr>`;

  const fresh = await apiFetch("/faculty/hod/classroom-requests");
  cachedClassroomRequests = Array.isArray(fresh) ? fresh.filter(p => {
    const s = (p.status || "").toLowerCase().trim();
    return s === STATUS.SUBMITTED || s === STATUS.FACULTY_APPROVED || s === "forwarded";
  }) : [];
  updateBadges();

  if (!cachedClassroomRequests.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="td-empty">No classroom requests pending.<br>
      <small style="opacity:.6;">Only proposals requesting classrooms in your department appear here.</small>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = cachedClassroomRequests.map(p => `
    <tr>
      <td><span class="ev-name" onclick="showClassroomRequestDetail(${p.id})">${p.title || "Untitled"}</span></td>
      <td>${p.club || p.organizer || "—"}</td>
      <td>${p.organizer || "—"}</td>
      <td>${fmtDate(p.event_date)}</td>
      <td><strong>${p.venue || p.classroom || "—"}</strong></td>
      <td>${p.capacity || "—"}</td>
      <td>
        <span class="badge" style="background:rgba(16,185,129,.18);color:#34d399;border:1px solid rgba(16,185,129,.35);">
          🟢 Pending HOD
        </span>
      </td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="mini-btn approve" onclick="approveClassroomRequest(${p.id})">✅ Confirm</button>
          <button class="mini-btn reject"  onclick="rejectClassroomRequestPrompt(${p.id})">❌ Reject</button>
          <button class="mini-btn"         onclick="showClassroomRequestDetail(${p.id})">👁</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function showClassroomRequestDetail(id) {
  const p = cachedClassroomRequests.find(x => x.id === id);
  if (!p) return;
  document.getElementById("hodDetailModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "hodDetailModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('hodDetailModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3001;background:var(--surface,#1a1a2e);border:1px solid rgba(16,185,129,.35);
      border-radius:20px;width:min(580px,94vw);max-height:88vh;overflow-y:auto;
      padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
        <div>
          <div style="font-size:17px;font-weight:800;color:var(--text);">${p.title || "Event Details"}</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:3px;">${p.club || "—"} · Classroom Request</div>
        </div>
        <button onclick="document.getElementById('hodDetailModal').remove()"
          style="background:none;border:none;color:var(--text-3);font-size:20px;cursor:pointer;padding:0;">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
        ${[
          ["🚪 Classroom",  p.venue || p.classroom || "—"],
          ["📅 Date",       fmtDate(p.event_date)],
          ["🕐 Time",       formatTime(p.event_time)],
          ["👥 Capacity",   p.capacity || "—"],
          ["🏷️ Category",  p.category || "—"],
          ["💰 Fee",        p.registration_fee > 0 ? "₹" + p.registration_fee : "Free"],
          ["🎪 Organizer",  p.organizer || "—"],
          ["🏛️ Club",      p.club || "—"],
        ].map(([l,v]) => `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;">
            <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px;">${l}</div>
            <div style="font-size:13px;font-weight:600;color:var(--text);">${v}</div>
          </div>`).join("")}
      </div>
      ${p.description ? `
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:18px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">📝 Description</div>
        <div style="font-size:13px;color:var(--text);line-height:1.6;">${p.description}</div>
      </div>` : ""}
      <div style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">Classroom Confirmation</div>
      <textarea id="hodDetailRemark" rows="3" placeholder="Add a remark (required when rejecting)…"
        style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);
          background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);
          resize:vertical;outline:none;margin-bottom:12px;box-sizing:border-box;"></textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="approveClassroomFromModal(${p.id})"
          style="flex:1;padding:11px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#10b981,#059669);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">✅ Confirm Classroom</button>
        <button onclick="rejectClassroomFromModal(${p.id})"
          style="flex:1;padding:11px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font,inherit);">❌ Reject</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function approveClassroomRequest(id) {
  const res = await apiFetch(`/faculty/hod/classroom-requests/${id}/approve`, { method: "PATCH" });
  if (res !== null) {
    const p = cachedClassroomRequests.find(x => x.id === id);
    if (p) p.status = STATUS.HOD_APPROVED;
    addLocalNotif("event", "✅", "Classroom Confirmed",
      `HOD approval granted for "${p?.title || `event #${id}`}". Organizer notified.`, id);
    showToast("✅ Classroom confirmed — HOD approved!", "success");
    renderClassroomRequests();
    renderDashboard();
  } else {
    showToast("Failed to confirm classroom.", "error");
  }
}

async function approveClassroomFromModal(id) {
  const remark = document.getElementById("hodDetailRemark")?.value.trim() || "";
  const res = await apiFetch(`/faculty/hod/classroom-requests/${id}/approve`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = cachedClassroomRequests.find(x => x.id === id);
    if (p) p.status = STATUS.HOD_APPROVED;
    document.getElementById("hodDetailModal")?.remove();
    addLocalNotif("event", "✅", "Classroom Confirmed",
      `HOD approval granted for "${p?.title || `event #${id}`}".`, id);
    showToast("✅ Classroom confirmed!", "success");
    renderClassroomRequests();
  } else {
    showToast("Failed to confirm.", "error");
  }
}

function rejectClassroomRequestPrompt(id) {
  const p = cachedClassroomRequests.find(x => x.id === id);
  if (!p) return;
  document.getElementById("hodRejectModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "hodRejectModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('hodRejectModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3100;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3101;background:var(--surface,#1a1a2e);border:1px solid rgba(239,68,68,.35);
      border-radius:20px;width:min(440px,92vw);padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:4px;">❌ Reject Classroom Request</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:18px;">${p.title || "Event"} — ${p.venue || p.classroom || "—"}</div>
      <label style="font-size:11px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;">
        Reason <span style="color:#f87171;">*</span>
      </label>
      <textarea id="hodRejectRemark" rows="4" placeholder="e.g. Classroom already booked for exam…"
        style="width:100%;margin:6px 0 18px;padding:10px 12px;border-radius:10px;
          border:1px solid rgba(239,68,68,.35);background:var(--surface-2,#0d0d1a);
          color:var(--text);font-size:13px;font-family:var(--font,inherit);resize:vertical;outline:none;box-sizing:border-box;"></textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('hodRejectModal').remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);
            background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button onclick="submitHodReject(${p.id})"
          style="flex:1;padding:10px;border-radius:11px;border:none;
            background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
            font-size:13px;font-weight:700;cursor:pointer;">Confirm Rejection</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById("hodRejectRemark")?.focus();
}

async function submitHodReject(id) {
  const remark = document.getElementById("hodRejectRemark")?.value.trim();
  if (!remark) { showToast("Please enter a reason for rejection.", "error"); return; }

  const res = await apiFetch(`/faculty/hod/classroom-requests/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = cachedClassroomRequests.find(x => x.id === id);
    if (p) p.status = STATUS.REJECTED;
    document.getElementById("hodRejectModal")?.remove();
    addLocalNotif("event", "❌", "Classroom Request Rejected",
      `"${p?.title || `Event #${id}`}" rejected. Organizer notified.`, id);
    showToast("❌ Request rejected.", "error");
    renderClassroomRequests();
  } else {
    showToast("Failed to reject.", "error");
  }
}

async function rejectClassroomFromModal(id) {
  const remark = document.getElementById("hodDetailRemark")?.value.trim();
  if (!remark) {
    showToast("Please add a remark before rejecting.", "error");
    document.getElementById("hodDetailRemark")?.focus();
    return;
  }
  const res = await apiFetch(`/faculty/hod/classroom-requests/${id}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const p = cachedClassroomRequests.find(x => x.id === id);
    if (p) p.status = STATUS.REJECTED;
    document.getElementById("hodDetailModal")?.remove();
    addLocalNotif("event", "❌", "Classroom Request Rejected",
      `"${p?.title || `Event #${id}`}" rejected.`, id);
    showToast("❌ Rejected.", "error");
    renderClassroomRequests();
  } else {
    showToast("Failed to reject.", "error");
  }
}

/* ══════════════════════════════════════════════════════════
   MY CLASSROOMS
   ══════════════════════════════════════════════════════════ */
async function renderMyClassrooms() {
  const container = document.getElementById("myClassroomsContainer");
  if (!container) return;
  container.innerHTML = `<div class="list-empty" style="padding:20px;">Loading classrooms…</div>`;

  const fresh = await apiFetch("/faculty/hod/classrooms");
  cachedMyClassrooms = Array.isArray(fresh) ? fresh : [];

  if (!cachedMyClassrooms.length) {
    container.innerHTML = `<div class="list-empty" style="padding:20px;">No classrooms assigned to your department.</div>`;
    return;
  }

  const STATUS_COLOR = {
    available:   "rgba(16,185,129,.18);color:#34d399;border:1px solid rgba(16,185,129,.35)",
    unavailable: "rgba(239,68,68,.18);color:#f87171;border:1px solid rgba(239,68,68,.35)",
    maintenance: "rgba(245,158,11,.18);color:#fcd34d;border:1px solid rgba(245,158,11,.35)",
  };

  container.innerHTML = cachedMyClassrooms.map(c => {
    const ALLOWED = ["available","unavailable","maintenance"];
    const st = ALLOWED.includes((c.status||"").toLowerCase()) ? c.status.toLowerCase() : "available";
    const styleStr = STATUS_COLOR[st] || STATUS_COLOR.available;

    return `
      <div class="panel" style="margin-bottom:18px;">
        <div class="panel-header">
          <div>
            <div class="panel-title">🚪 ${c.name || "Classroom"}</div>
            <div class="panel-sub">Capacity: ${c.capacity || "—"} · ${c.room_number ? "Room " + c.room_number : "Department Classroom"} · ${c.floor || ""}</div>
          </div>
          <span class="badge" style="background:${styleStr};">${cap(st)}</span>
        </div>
        <div class="panel-body">
          ${c.note ? `
          <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;
            padding:10px 14px;margin-bottom:16px;font-size:13px;color:var(--text-3);">
            📝 Note: ${c.note}
          </div>` : ""}
          <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Update Availability</div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;">
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px;">Status</label>
              <select id="classroomStatus_${c.id}" class="filter-select" style="min-width:140px;">
                <option value="available"   ${st==="available"?"selected":""}>✅ Available</option>
                <option value="unavailable" ${st==="unavailable"?"selected":""}>🚫 Unavailable</option>
                <option value="maintenance" ${st==="maintenance"?"selected":""}>🔧 Maintenance</option>
              </select>
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px;">
                Specific Date <span style="font-weight:400;">(optional)</span>
              </label>
              <input type="date" id="classroomDate_${c.id}"
                style="padding:8px 12px;border-radius:10px;border:1px solid var(--border-2);
                  background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);outline:none;"/>
            </div>
            <div style="flex:1;min-width:160px;">
              <label style="font-size:11px;font-weight:600;color:var(--text-3);display:block;margin-bottom:4px;">Note</label>
              <input type="text" id="classroomNote_${c.id}" placeholder="e.g. Exam scheduled…"
                value="${(c.note || "").replace(/"/g, "&quot;")}"
                style="width:100%;padding:8px 12px;border-radius:10px;border:1px solid var(--border-2);
                  background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);outline:none;box-sizing:border-box;"/>
            </div>
            <button class="btn primary" onclick="saveClassroomAvailability(${c.id})" style="white-space:nowrap;padding:9px 18px;">💾 Save</button>
          </div>
          <div style="margin-top:18px;">
            <div style="font-size:12px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">Upcoming Bookings</div>
            <div id="classroomBookings_${c.id}">${renderClassroomUpcomingBookings(c.name)}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderClassroomUpcomingBookings(classroomName) {
  const now = new Date();
  const upcoming = cachedEvents.filter(e => {
    const d = parseEventDate(e.date || e.event_date || e.start_date);
    return d && d >= now && (e.venue || "").toLowerCase().trim() === (classroomName || "").toLowerCase().trim();
  }).sort((a,b) => (parseEventDate(a.date||a.event_date||a.start_date)||0) - (parseEventDate(b.date||b.event_date||b.start_date)||0));

  if (!upcoming.length) return `<div style="font-size:13px;color:var(--text-3);padding:8px 0;">No upcoming bookings.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Event</th><th>Club</th><th>Date</th><th>Time</th><th>Capacity</th><th>Status</th></tr></thead>
        <tbody>
          ${upcoming.slice(0,5).map(e => `
            <tr>
              <td><span class="ev-name">${e.title||"Untitled"}</span></td>
              <td>${e.club||e.organizer||"—"}</td>
              <td>${fmtDate(e.date||e.event_date||e.start_date)}</td>
              <td>${formatTime(e.time||e.start_time)}</td>
              <td>${e.capacity||"—"}</td>
              <td><span class="badge ${(e.status||"approved").toLowerCase()}">${cap(e.status||"Approved")}</span></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function saveClassroomAvailability(classroomId) {
  const status = document.getElementById(`classroomStatus_${classroomId}`)?.value;
  const date   = document.getElementById(`classroomDate_${classroomId}`)?.value || null;
  const note   = document.getElementById(`classroomNote_${classroomId}`)?.value.trim() || null;

  const ALLOWED = ["available","unavailable","maintenance"];
  if (!status || !ALLOWED.includes(status)) { showToast("Please select a valid status.", "error"); return; }

  const res = await apiFetch(`/faculty/hod/classrooms/${classroomId}/availability`, {
    method: "PATCH",
    body: JSON.stringify({ status, note, date }),
  });
  if (res !== null) {
    showToast("💾 Classroom availability updated!", "success");
    renderMyClassrooms();
  } else {
    showToast("Failed to update classroom.", "error");
  }
}

/* ══════════════════════════════════════════════════════════
   DEPT EVENTS
   ══════════════════════════════════════════════════════════ */
async function renderDeptEvents(search = "", status = "all") {
  const fresh = await apiFetch("/events/all");
  cachedEvents = Array.isArray(fresh) ? fresh : [];

  // Filter to department events
  const myClassroomNames = new Set(cachedMyClassrooms.map(c => (c.name||"").toLowerCase().trim()));
  const deptName = (cachedProfile?.department || "").toLowerCase();
  cachedDeptEvents = cachedEvents.filter(e => {
    const v = (e.venue || "").toLowerCase().trim();
    return myClassroomNames.has(v) || (e.department || "").toLowerCase() === deptName;
  });

  const tbody = document.getElementById("deptEventListBody");
  if (!tbody) return;

  let list = [...cachedDeptEvents];
  if (status !== "all") list = list.filter(e => (e.status||"").toLowerCase().trim() === status.toLowerCase());
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(e => (e.title||"").toLowerCase().includes(q) || (e.club||"").toLowerCase().includes(q));
  }
  list.sort((a,b) => {
    const da = parseEventDate(a.date||a.event_date||a.start_date);
    const db = parseEventDate(b.date||b.event_date||b.start_date);
    return (db||0) - (da||0);
  });

  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span class="ev-name">${e.title||"Untitled"}</span></td>
      <td>${e.club||e.organizer||"—"}</td>
      <td>${fmtDate(e.date||e.event_date||e.start_date)}</td>
      <td>${e.venue||"—"}</td>
      <td><span class="tag">${e.category||e.type||"General"}</span></td>
      <td>${e.capacity||"—"}</td>
      <td>${e.registration_fee>0?"₹"+e.registration_fee:"Free"}</td>
      <td><span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
    </tr>
  `).join("") : `<tr><td colspan="8" class="td-empty">No department events found.</td></tr>`;
}

/* ══════════════════════════════════════════════════════════
   DEPT CLUBS
   ══════════════════════════════════════════════════════════ */
async function renderDeptClubs(search = "", category = "all") {
  const grid = document.getElementById("deptClubsGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="list-empty" style="padding:20px;">Loading…</div>`;

  let fresh = await apiFetch("/clubs");
  if (!Array.isArray(fresh)) fresh = [];

  // Show all clubs (HOD can see all; optionally filter by department)
  allClubsData = fresh.length ? fresh : [...cachedClubs];

  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵","🔬","🎭","🏅","📐","🌱","🔭","🎮","🎻"];
  let list = allClubsData;

  if (search) list = list.filter(c =>
    (c.club_name||c.name||"").toLowerCase().includes(search) ||
    (c.category||"").toLowerCase().includes(search)
  );
  if (category !== "all") list = list.filter(c => {
    const raw = (c.club_category||c.category||c.type||"").toLowerCase().trim();
    return raw === category.toLowerCase();
  });

  if (!list.length) { grid.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs found.</div>`; return; }

  grid.innerHTML = list.map((c,i) => {
    const clubName = c.club_name || c.name || "Club";
    const clubId   = String(c.id ?? c.club_id ?? "");
    const clubEvents = cachedEvents.filter(e =>
      String(e.club_id??e.clubId??"") === clubId ||
      (e.club||"").trim().toLowerCase() === clubName.trim().toLowerCase()
    );
    const upcoming = clubEvents.filter(e => {
      const d = parseEventDate(e.date||e.event_date||e.start_date); return d && d >= new Date();
    }).length;
    return `
      <div class="ac-card" onclick="openClubDetail('${clubId}',${i})">
        <div class="ac-card-top">
          <div class="ac-emoji">${c.logo||emojis[i%emojis.length]}</div>
          <div style="flex:1;min-width:0;">
            <div class="ac-name">${clubName}</div>
            <div class="ac-cat">${c.club_category||c.category||c.type||"Club"}</div>
          </div>
          <span class="badge ${c.status==="inactive"?"rejected":"approved"}" style="flex-shrink:0;">${c.status||"Active"}</span>
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
  const club = allClubsData.find(c => String(c.id??c.club_id??"") === String(clubId));
  if (!club) return;
  currentClubDetail = club;
  const clubName = club.club_name || club.name || "Club";
  currentClubEvents = cachedEvents.filter(e =>
    String(e.club_id??e.clubId??"") === String(clubId) ||
    (e.club||"").trim().toLowerCase() === clubName.trim().toLowerCase()
  ).sort((a,b) => new Date(b.date||b.event_date||b.start_date) - new Date(a.date||a.event_date||a.start_date));

  const upcoming = currentClubEvents.filter(e => {
    const d = parseEventDate(e.date||e.event_date||e.start_date); return d && d >= new Date();
  }).length;

  document.getElementById("clubDetailEmoji").textContent = club.logo || emojis[idx % emojis.length];
  document.getElementById("clubDetailName").textContent  = clubName;
  document.getElementById("clubDetailCat").textContent   = club.category || club.type || "Club";

  const statsEl = document.getElementById("clubDetailStats");
  if (statsEl) {
    statsEl.innerHTML = [
      { val: club.member_count||club.members||0, label: "Members" },
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
          ["Category",    club.club_category||club.category||"—"],
          ["Status",      club.status||"Active"],
          ["Members",     club.member_count||club.members||0],
          ["Faculty",     club.faculty_name||club.incharge||"—"],
          ["Email",       club.email||"—"],
          ["Founded",     fmtDate(club.created_at||club.founded)||"—"],
          ["Description", club.short_description||club.description||"—"],
        ].map(([l,v]) => `
          <div class="club-info-cell">
            <div class="club-info-label">${l}</div>
            <div class="club-info-val">${v}</div>
          </div>`).join("")}
      </div>`;
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
  document.getElementById("clubTabEvents").style.display = tab === "events" ? "" : "none";
  document.getElementById("clubTabInfo").style.display   = tab === "info"   ? "" : "none";
}

function filterClubEvents() {
  const status = document.getElementById("clubEventStatusFilter")?.value || "all";
  const search = (document.getElementById("clubEventSearch")?.value || "").toLowerCase();
  let list = currentClubEvents;
  if (status !== "all") list = list.filter(e => (e.status||"approved").toLowerCase() === status.toLowerCase());
  if (search) list = list.filter(e =>
    (e.title||"").toLowerCase().includes(search) || (e.venue||"").toLowerCase().includes(search)
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
      <td><span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
    </tr>`).join("")
  : `<tr><td colspan="7" class="td-empty">No events match filter.</td></tr>`;
}

/* ══════════════════════════════════════════════════════════
   EVENT PROPOSALS
   ══════════════════════════════════════════════════════════ */
async function renderProposals(search = "") {
  const tbody = document.getElementById("proposalsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="td-loading">Loading proposals…</td></tr>`;

  const [freshProposals, freshEvents] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/events/all"),
  ]);
  if (Array.isArray(freshProposals)) cachedProposals = freshProposals;
  if (Array.isArray(freshEvents))    cachedEvents    = freshEvents;

  const proposalItems = cachedProposals.map(p => ({ ...p, _src: "proposal", _key: `proposal-${p.id}` }));
  const submittedEvItems = cachedEvents.filter(e =>
    (e.status||"").toLowerCase().trim() === STATUS.SUBMITTED
  ).map(e => ({ ...e, _src: "event", _key: `event-${e.id}`, organizer: e.organizer||e.created_by||"—" }));

  const seen = new Set();
  const merged = [];
  [...proposalItems, ...submittedEvItems].forEach(item => {
    if (seen.has(item._key)) return;
    seen.add(item._key);
    merged.push(item);
  });

  let list = merged.filter(p => (p.status||"").toLowerCase().trim() === STATUS.SUBMITTED);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p => (p.title||p.name||"").toLowerCase().includes(q) || (p.club||p.organizer||"").toLowerCase().includes(q));
  }

  window.currentProposalList = list;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="td-empty">No proposals pending review.</td></tr>`;
    updateBadges(); return;
  }

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><span class="ev-name" onclick="showProposalDetail('${p._key}')">${p.title||p.name||"Untitled"}</span></td>
      <td>${p.club||p.organizer||"—"}</td>
      <td>${fmtDate(p.date||p.event_date||p.start_date)}</td>
      <td><span class="tag">${p.category||p.type||"General"}</span></td>
      <td>${p.capacity||p.expected_participants||"—"}</td>
      <td><span class="badge ${statusClass(p.status)}" title="${p.remark||""}">${statusLabel(p.status)}</span>
        ${p.remark ? `<div style="font-size:10px;color:var(--text-3);margin-top:3px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.remark}">💬 ${p.remark}</div>` : ""}
      </td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          <button class="mini-btn approve" onclick="approveProposal(${p.id},'${p._src}')">✅</button>
          <button class="mini-btn reject"  onclick="rejectProposal(${p.id},'${p._src}')">❌</button>
          <button class="mini-btn"         onclick="showProposalDetail('${p._key}')">👁</button>
        </div>
      </td>
    </tr>
  `).join("");
  updateBadges();
}

function showProposalDetail(key) {
  const p = (window.currentProposalList||[]).find(x => x._key === key);
  if (!p) return;
  elSet("detailName", p.title||p.name||"Event Details");
  const panel = document.getElementById("proposalDetail");
  if (panel) { panel.style.display = ""; setTimeout(() => panel.scrollIntoView({ behavior:"smooth", block:"start" }), 50); }

  const s = (p.status||"").toLowerCase().trim();
  const isActionable = s === STATUS.SUBMITTED;
  const body = document.getElementById("detailBody");
  if (body) {
    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div class="detail-section">
            <div class="detail-section-title">Event Info</div>
            <div class="detail-grid">
              <div class="detail-cell"><div class="detail-label">Club / Organizer</div><div class="detail-val">${p.club||p.organizer||"—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Category</div><div class="detail-val">${p.category||p.type||"—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Date</div><div class="detail-val">${fmtDate(p.date||p.event_date)}</div></div>
              <div class="detail-cell"><div class="detail-label">Venue</div><div class="detail-val">${p.venue||"—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Expected Participants</div><div class="detail-val">${p.capacity||p.expected_participants||"—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Registration Fee</div><div class="detail-val">${p.registration_fee>0?"₹"+p.registration_fee:"Free"}</div></div>
            </div>
          </div>
          <div class="detail-section">
            <div class="detail-section-title">Remarks</div>
            ${isActionable ? `
              <textarea id="proposalRemark" rows="3"
                placeholder="Add a remark (optional for approval, required for rejection)…"
                style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font);resize:vertical;outline:none;margin-bottom:10px;box-sizing:border-box;"
              >${p.remark||""}</textarea>
              <div style="display:flex;gap:8px;">
                <button class="mini-btn approve" style="flex:1;justify-content:center;" onclick="approveProposalWithRemark(${p.id},'${p._src}')">✅ Approve</button>
                <button class="mini-btn reject"  style="flex:1;justify-content:center;" onclick="rejectProposalWithRemark(${p.id},'${p._src}')">❌ Reject</button>
              </div>
            ` : `<div style="padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;line-height:1.6;">${p.remark||"<span style='opacity:.45;font-style:italic;'>No remark.</span>"}</div>`}
          </div>
        </div>
        <div>
          <div class="detail-section">
            <div class="detail-section-title">Description</div>
            <div class="detail-desc">${p.description||"No description provided."}</div>
          </div>
          <div class="detail-section">
            <div class="detail-section-title">Status</div>
            <span class="badge ${statusClass(p.status)}">${statusLabel(p.status)}</span>
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
    const p = (window.currentProposalList||[]).find(x => x.id===id && x._src===src);
    if (p) p.status = STATUS.FACULTY_APPROVED;
    addLocalNotif("event", "✅", "Proposal Approved", `"${p?.title||"Event"}" approved.`, id);
    renderProposals(); showToast("✅ Proposal approved!", "success");
  } else { showToast("Failed to approve.", "error"); }
}

async function rejectProposal(id, src = "proposal") {
  const res = await apiFetch(resolveRejectEndpoint(id, src), { method: "PATCH" });
  if (res !== null) {
    const p = (window.currentProposalList||[]).find(x => x.id===id && x._src===src);
    if (p) p.status = STATUS.REJECTED;
    addLocalNotif("event", "❌", "Proposal Rejected", `"${p?.title||"Event"}" rejected.`, id);
    renderProposals(); showToast("❌ Proposal rejected.", "error");
  } else { showToast("Failed to reject.", "error"); }
}

async function approveProposalWithRemark(id, src = "proposal") {
  const remark = document.getElementById("proposalRemark")?.value.trim() || "";
  const res = await apiFetch(resolveApproveEndpoint(id, src), { method:"PATCH", body:JSON.stringify({remark}) });
  if (res !== null) {
    const p = (window.currentProposalList||[]).find(x => x.id===id && x._src===src);
    if (p) { p.status = STATUS.FACULTY_APPROVED; p.remark = remark; }
    addLocalNotif("event","✅","Proposal Approved",`"${p?.title||"Event"}" approved.`,id);
    document.getElementById("proposalDetail").style.display = "none";
    renderProposals(); showToast("✅ Proposal approved!","success");
  } else { showToast("Failed to approve.","error"); }
}

async function rejectProposalWithRemark(id, src = "proposal") {
  const remark = document.getElementById("proposalRemark")?.value.trim();
  if (!remark) { showToast("Please add a remark before rejecting.","error"); document.getElementById("proposalRemark")?.focus(); return; }
  const res = await apiFetch(resolveRejectEndpoint(id, src), { method:"PATCH", body:JSON.stringify({remark}) });
  if (res !== null) {
    const p = (window.currentProposalList||[]).find(x => x.id===id && x._src===src);
    if (p) { p.status = STATUS.REJECTED; p.remark = remark; }
    addLocalNotif("event","❌","Proposal Rejected",`"${p?.title||"Event"}" rejected.`,id);
    document.getElementById("proposalDetail").style.display = "none";
    renderProposals(); showToast("❌ Proposal rejected.","error");
  } else { showToast("Failed to reject.","error"); }
}

/* ══════════════════════════════════════════════════════════
   ANALYTICS
   ══════════════════════════════════════════════════════════ */
async function initCharts() {
  chartsInited = true;
  const kpi = document.getElementById("analyticsKpi");
  const now = new Date();

  const approvedEvents = cachedDeptEvents.filter(e =>
    ["hod_approved","hall_approved","approved","published"].includes((e.status||"").toLowerCase())
  );
  const totalReg = cachedDeptEvents.reduce((sum,e) => sum + Number(e.registered_count||e.registered||e.participant_count||0), 0);

  if (kpi) {
    kpi.innerHTML = [
      { icon:"📋", val:cachedDeptEvents.length,   label:"Dept Events",  cls:"kt" },
      { icon:"✅", val:approvedEvents.length,     label:"Approved",     cls:"kc" },
      { icon:"👥", val:totalReg,                  label:"Registrations",cls:"kv" },
      { icon:"🚪", val:cachedMyClassrooms.length, label:"My Classrooms",cls:"ka" },
    ].map(d => `
      <div class="kpi-card ${d.cls}">
        <div class="kpi-icon">${d.icon}</div>
        <div class="kpi-val">${d.val}</div>
        <div class="kpi-label">${d.label}</div>
      </div>`).join("");
  }

  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const labels=[], evCounts=[], regCounts=[];
  for (let i=7; i>=0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    labels.push(MONTH_NAMES[d.getMonth()]);
    const mEvs = cachedDeptEvents.filter(e => {
      const ed = parseEventDate(e.date||e.event_date||e.start_date);
      return ed && ed.getFullYear()===d.getFullYear() && ed.getMonth()===d.getMonth();
    });
    evCounts.push(mEvs.length);
    regCounts.push(mEvs.reduce((s,e) => s + Number(e.registered_count||e.registered||0), 0));
  }

  const chartDefaults = {
    responsive:true,
    plugins:{ legend:{ display:false } },
    scales:{
      x:{ grid:{ display:false }, ticks:{ color:"rgba(240,242,255,.4)", font:{ weight:600, size:11 } } },
      y:{ grid:{ color:"rgba(255,255,255,.05)" }, ticks:{ color:"rgba(240,242,255,.4)", font:{ weight:600, size:11 }, stepSize:1 }, beginAtZero:true },
    },
  };

  tryChart("eventsChart", {
    type:"bar",
    data:{ labels, datasets:[{ data:evCounts, backgroundColor:"rgba(16,185,129,.7)", borderRadius:7, borderSkipped:false }] },
    options:chartDefaults,
  });
  tryChart("participationChart", {
    type:"line",
    data:{ labels, datasets:[{ data:regCounts, borderColor:"#10b981", backgroundColor:"rgba(16,185,129,.12)", borderWidth:2.5, fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:"#10b981" }] },
    options:chartDefaults,
  });

  const TECH_KEYWORDS = ["ieee","iedc","robotics","coding","tech","computer","ai","ml","cyber","hack","software","hardware"];
  const technical = cachedDeptEvents.filter(e => {
    const cat = (e.club_category||e.category||"").toLowerCase().trim();
    if (cat === "technical") return true;
    if (cat === "non-technical") return false;
    return TECH_KEYWORDS.some(kw => [e.type||"",e.club||"",e.title||""].join(" ").toLowerCase().includes(kw));
  }).length;
  const nonTechnical = Math.max(0, cachedDeptEvents.length - technical);
  const total = cachedDeptEvents.length || 1;

  tryChart("typeChart", {
    type:"doughnut",
    data:{ labels:["Technical","Non-Technical"], datasets:[{ data:[technical||0,nonTechnical||0], backgroundColor:["#10b981","#8b5cf6"], borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:false, plugins:{ legend:{ display:false } }, cutout:"68%" },
  });

  const leg = document.getElementById("typeChartLegend");
  if (leg) {
    leg.innerHTML = [
      { color:"#10b981", label:"Technical",     pct:Math.round((technical/total)*100),    cnt:technical    },
      { color:"#8b5cf6", label:"Non-Technical", pct:Math.round((nonTechnical/total)*100), cnt:nonTechnical },
    ].map(d => `
      <div class="leg-row">
        <div class="leg-swatch" style="background:${d.color};"></div>
        <div><div class="leg-text">${d.label} — ${d.pct}%</div><div class="leg-pct">${d.cnt} events</div></div>
      </div>`).join("");
  }

  // Classroom usage chart
  const classroomMap = {};
  cachedDeptEvents.forEach(e => { const name=(e.venue||"Unknown").trim(); classroomMap[name]=(classroomMap[name]||0)+1; });
  const sorted = Object.entries(classroomMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const BG = ["rgba(16,185,129,.7)","rgba(6,182,212,.7)","rgba(139,92,246,.7)","rgba(245,158,11,.7)","rgba(236,72,153,.7)","rgba(239,68,68,.7)","rgba(59,130,246,.7)","rgba(251,146,60,.7)","rgba(132,204,22,.7)","rgba(167,139,250,.7)"];

  tryChart("classroomChart", {
    type:"bar",
    data:{ labels:sorted.map(([n])=>n)||["No events"], datasets:[{ data:sorted.map(([,c])=>c)||[0], backgroundColor:sorted.map((_,i)=>BG[i%BG.length]), borderRadius:7, borderSkipped:false }] },
    options:{ ...chartDefaults, indexAxis:"y" },
  });
}

/* ══════════════════════════════════════════════════════════
   ANNOUNCEMENTS
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
    </div>`).join("");
}

async function postAnnouncement() {
  const title   = document.getElementById("announceTitle")?.value.trim();
  const message = document.getElementById("announceBody")?.value.trim();
  const type    = document.getElementById("announceType")?.value;
  if (!title || !message) { showToast("Fill in title and message.", "error"); return; }

  const clubId = cachedClubs[0]?.id ?? cachedClubs[0]?.club_id ?? null;
  const res = await apiFetch("/announcements", {
    method: "POST",
    body: JSON.stringify({ title, message, type, club_id: clubId }),
  });
  if (res !== null) {
    document.getElementById("announceTitle").value = "";
    document.getElementById("announceBody").value  = "";
    addLocalNotif("admin","📢",title,message,`ann-${res.id}`);
    showToast("📢 Announcement posted!","success");
    await renderAnnouncements();
  } else { showToast("Failed to post.","error"); }
}

function editAnnouncement(id) {
  const card = document.querySelector(`[data-ann-id="${id}"]`);
  const currentTitle   = card?.querySelector(".announce-title")?.textContent?.trim() || "";
  const currentMessage = card?.querySelector(".announce-body")?.textContent?.trim()  || "";
  document.getElementById("editAnnModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "editAnnModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('editAnnModal').remove()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      z-index:3001;background:var(--surface,#1a1a2e);border:1px solid rgba(16,185,129,.35);
      border-radius:20px;width:min(460px,92vw);padding:28px 24px;box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <div style="font-size:16px;font-weight:800;color:var(--text);margin-bottom:18px;">✏️ Edit Announcement</div>
      <input id="editAnnTitle" value="${currentTitle.replace(/"/g,"&quot;")}"
        style="width:100%;margin:0 0 14px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);outline:none;box-sizing:border-box;"/>
      <textarea id="editAnnMessage" rows="4"
        style="width:100%;margin:0 0 20px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font,inherit);resize:vertical;outline:none;box-sizing:border-box;">${currentMessage}</textarea>
      <div style="display:flex;gap:10px;">
        <button onclick="document.getElementById('editAnnModal').remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;">Cancel</button>
        <button onclick="submitEditAnnouncement(${id})"
          style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById("editAnnTitle")?.focus();
}

async function submitEditAnnouncement(id) {
  const title   = document.getElementById("editAnnTitle")?.value.trim();
  const message = document.getElementById("editAnnMessage")?.value.trim();
  if (!title || !message) { showToast("Title and message are required.","error"); return; }
  const res = await apiFetch(`/announcements/${id}`, { method:"PUT", body:JSON.stringify({title,message}) });
  if (res !== null) {
    document.getElementById("editAnnModal")?.remove();
    showToast("✏️ Announcement updated!","success");
    await renderAnnouncements();
  } else { showToast("Failed to update.","error"); }
}

async function deleteAnnouncement(id) {
  if (!confirm("Are you sure you want to delete this announcement?")) return;
  const res = await apiFetch(`/announcements/${id}`, { method:"DELETE" });
  if (res !== null) { showToast("🗑️ Announcement deleted","success"); await renderAnnouncements(); }
  else { showToast("Failed to delete.","error"); }
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
function openNotifHistoryPage(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById("notifDropdown");
  if (dd) dd.classList.toggle("open");
  localNotifs = localNotifs.map(n => ({ ...n, read:true }));
  saveNotifs(); updateNotifBadge(); renderNotifDropdown();
}

function updateNotifBadge() {
  const unread = localNotifs.filter(n => !n.read).length;
  const cnt    = document.getElementById("notifCount");
  if (cnt) { cnt.textContent = unread>9?"9+":unread; cnt.style.display = unread>0?"flex":"none"; }
}

function renderNotifDropdown() {
  const list = document.getElementById("notifDropList");
  if (!list) return;
  if (!localNotifs.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px;">🔔<br>No notifications yet.</div>`;
    return;
  }
  list.innerHTML = localNotifs.slice(0,8).map(n => `
    <div class="notif-item ${n.read?"":"unread"}">
      <div class="notif-icon">${n.icon||"🔔"}</div>
      <div class="notif-body">
        <div class="notif-ntitle">${n.title}</div>
        <div class="notif-nsub">${n.sub||""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
      ${!n.read?`<div class="notif-unread-dot"></div>`:""}
    </div>`).join("");
}

function clearAllNotifs() {
  localNotifs = [];
  saveNotifs(); updateNotifBadge(); renderNotifDropdown(); renderNotifHistory();
  showToast("Notifications cleared.","info");
}

function renderNotifHistory() {
  const list = document.getElementById("notifHistoryList");
  if (!list) return;
  list.innerHTML = localNotifs.length ? localNotifs.map(n => `
    <div class="notif-item ${n.read?"":"unread"}">
      <div class="notif-icon">${n.icon||"🔔"}</div>
      <div class="notif-body">
        <div class="notif-ntitle">${n.title}</div>
        <div class="notif-nsub">${n.sub||""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
    </div>`).join("")
  : `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px;">No notifications.</div>`;
}

async function syncNotifs() {
  const ann = await apiFetch("/announcements/faculty");
  if (!Array.isArray(ann)) return;
  const ICONS = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣" };
  ann.forEach(a => {
    const sid = `ann-${a.id}`;
    if (localNotifs.find(n => n.sourceId === sid)) return;
    localNotifs.unshift({
      id: `${Date.now()}-${Math.random()}`, sourceId:sid, type:"admin",
      icon: ICONS[a.type]||"📢", title:a.title, sub:a.message||"",
      time: a.created_at||new Date().toISOString(), read:false,
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
  const initials = (p.name||"HD").split(" ").map(n=>n[0]).join("").slice(0,2);
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div style="width:72px;height:72px;border-radius:18px;background:var(--g-hod);display:grid;place-items:center;font-size:26px;font-weight:800;color:white;">${initials}</div>
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--text);">${p.name||"HOD Coordinator"}</div>
        <div style="font-size:13px;color:var(--text-3);margin-top:3px;">${p.email||"—"}</div>
        <div style="font-size:13px;color:var(--text-3);">${p.department||"—"}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
      ${[["Faculty No",p.faculty_no||"—"],["Department",p.department||"—"],["Email",p.email||"—"],["Phone",p.phone_no||p.phone||"—"]].map(([l,v]) => `
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">${l}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${v}</div>
        </div>`).join("")}
    </div>
    <div class="divider" style="margin-top:16px;"></div>
    <div style="margin-top:14px;">
      <button class="btn primary" onclick="closeProfileDrawer();navigateTo('account-settings')">⚙️ Edit Profile</button>
    </div>
  `;
}

function closeProfileDrawer() {
  document.getElementById("profileDrawer")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("open");
}

function asLoadProfile() {
  const p = cachedProfile;
  if (!p) return;
  const set = (id,val) => { const e=document.getElementById(id); if(e) e.value=val||""; };
  set("asFacultyNo",p.faculty_no); set("asDepartment",p.department);
  set("asName",p.name); set("asEmail",p.email); set("asPhone",p.phone_no||p.phone);
  const avatar  = document.getElementById("asProfileAvatar");
  const preview = document.getElementById("asProfileNamePreview");
  const initials = (p.name||"HD").split(" ").filter(Boolean).map(w=>w[0]).join("").toUpperCase().slice(0,2);
  if (avatar)  avatar.textContent  = initials;
  if (preview) preview.textContent = p.name || "HOD Coordinator";
}

async function asSaveProfile(e) {
  e.preventDefault();
  const g = id => document.getElementById(id)?.value.trim() || "";
  const name=g("asName"), email=g("asEmail"), department=g("asDepartment"), phone=g("asPhone");
  const currentPassword=g("asCurrentPassword"), newPassword=g("asNewPassword"), confirmPassword=g("asConfirmPassword");
  if (!name||!email||!department||!phone) { asSetMsg("Please fill all required fields.",true); return; }
  const wantsPwChange = currentPassword||newPassword||confirmPassword;
  if (wantsPwChange) {
    if (!currentPassword||!newPassword||!confirmPassword) { asSetMsg("Fill all password fields.",true); return; }
    if (newPassword !== confirmPassword) { asSetMsg("Passwords do not match.",true); return; }
    if (newPassword.length < 6) { asSetMsg("Password must be at least 6 characters.",true); return; }
  }
  const payload = { name, email, department, phone_no:phone };
  if (wantsPwChange) { payload.current_password=currentPassword; payload.new_password=newPassword; }

  const submitBtn = document.querySelector("#asAccountForm button[type='submit']");
  if (submitBtn) { submitBtn.disabled=true; submitBtn.textContent="Saving…"; }
  asSetMsg("");

  const res = await apiFetch("/faculty/me", { method:"PUT", body:JSON.stringify(payload) });
  if (submitBtn) { submitBtn.disabled=false; submitBtn.textContent="Save Changes"; }
  if (!res) { asSetMsg("Failed to update profile.",true); return; }
  ["asCurrentPassword","asNewPassword","asConfirmPassword"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value="";
  });
  cachedProfile = { ...cachedProfile, name, email, department, phone_no:phone };
  const initials = name.split(" ").filter(Boolean).map(w=>w[0]).join("").toUpperCase().slice(0,2);
  elSet("miniName",name);
  elSet("topAvatar",initials);
  elSet("miniAvatar",initials);
  asSetMsg("Profile updated successfully.");
  showToast("✅ Profile updated!","success");
}

function asSetMsg(text, isError=false) {
  const el2=document.getElementById("asFormMsg");
  if (!el2) return;
  el2.textContent=text;
  el2.className = isError ? "as-msg error" : "as-msg";
}

function initAccountSettings() {
  const form = document.getElementById("asAccountForm");
  if (!form || form.dataset.asBound) return;
  form.dataset.asBound = "1";
  form.addEventListener("submit", asSaveProfile);
}

/* ══════════════════════════════════════════════════════════
   BADGES / SEARCH / UTILS
   ══════════════════════════════════════════════════════════ */
function updateBadges() {
  const classroomPending = cachedClassroomRequests.length;
  const proposalPending  = cachedProposals.filter(p => (p.status||"").toLowerCase().trim() === STATUS.SUBMITTED).length;
  updateBadge("badge-classroom-requests", classroomPending);
  updateBadge("badge-proposals",          proposalPending);
}

function updateBadge(id, count) {
  const el2 = document.getElementById(id);
  if (el2) { el2.textContent=count>0?count:"–"; el2.style.opacity=count>0?"1":"0.4"; }
}

function initSearchFilters() {
  document.getElementById("proposalSearch")?.addEventListener("input", debounce(e =>
    renderProposals(e.target.value.toLowerCase())
  ));
  document.getElementById("deptEventSearch")?.addEventListener("input", debounce(e =>
    renderDeptEvents(e.target.value.toLowerCase(), document.getElementById("deptEventStatus")?.value)
  ));
  document.getElementById("deptEventStatus")?.addEventListener("change", e =>
    renderDeptEvents(document.getElementById("deptEventSearch")?.value.toLowerCase(), e.target.value)
  );
  document.getElementById("deptClubsSearch")?.addEventListener("input", debounce(e =>
    renderDeptClubs(e.target.value.toLowerCase(), document.getElementById("deptClubsCategory")?.value)
  ));
  document.getElementById("deptClubsCategory")?.addEventListener("change", e =>
    renderDeptClubs(document.getElementById("deptClubsSearch")?.value.toLowerCase(), e.target.value)
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
    <div onclick="this.parentElement.remove()" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;
      background:rgba(10,13,28,.97);border:1px solid rgba(16,185,129,.28);border-radius:24px;
      width:min(370px,90vw);padding:30px 26px;text-align:center;box-shadow:var(--shadow-lg);">
      <div style="font-size:38px;margin-bottom:10px;">👋</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:6px;">Logging out?</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:24px;">Are you sure you want to sign out of your HOD coordinator account?</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="this.closest('div[style*=fixed]').parentElement.remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Cancel</button>
        <button onclick="localStorage.removeItem('faculty_auth_token');window.location.href='../fcsignin.html';"
          style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Yes, Logout</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/* ── utilities ── */
function elSet(id, val) {
  const e = document.getElementById(id);
  if (e) e.textContent = val;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : "—"; }

function parseEventDate(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y,m,d] = value.split("-").map(Number); return new Date(y, m-1, d);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const [y,m,d] = value.slice(0,10).split("-").map(Number); return new Date(y, m-1, d);
  }
  const dt = new Date(value);
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtDate(d) {
  const dt = parseEventDate(d);
  if (!dt) return "—";
  try { return dt.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" }); }
  catch { return "—"; }
}

function formatTime(t) {
  if (!t) return "—";
  if (typeof t === "string" && t.includes(":")) {
    const [h,m] = t.split(":");
    const hour=+h, ampm=hour>=12?"PM":"AM", hr12=hour%12||12;
    return `${hr12}:${m} ${ampm}`;
  }
  const d = new Date(t);
  if (!isNaN(d)) return d.toLocaleTimeString("en-IN", { hour:"numeric", minute:"2-digit" });
  return t;
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m=Math.floor(diff/60000), h=Math.floor(diff/3600000), d=Math.floor(diff/86400000);
  if (m<1) return "just now";
  if (m<60) return `${m}m ago`;
  if (h<24) return `${h}h ago`;
  return `${d}d ago`;
}

function showToast(msg, type="info") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3000);
}

function debounce(fn, ms=280) {
  let timer;
  return (...args) => { clearTimeout(timer); timer=setTimeout(()=>fn(...args),ms); };
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
/* ============================================================
   dean-dashboard.js  —  Dean Dashboard
   Key addition: Dean Approval flow — events reach the Dean
   only after BOTH faculty_approved AND hall_approved.
   Status after Dean action: "dean_approved" or "dean_rejected"
   ============================================================ */

var API = "http://localhost:5000/api";
window.API = API;

const STATUS = {
  DRAFT:             "draft",
  SUBMITTED:         "submitted",
  FACULTY_APPROVED:  "faculty_approved",
  HALL_APPROVED:     "hall_approved",
  DEAN_APPROVED:     "dean_approved",
  DEAN_REJECTED:     "dean_rejected",
  REJECTED:          "rejected",
};

const STATUS_LABEL = {
  draft:            "Draft",
  submitted:        "Pending Faculty",
  faculty_approved: "Pending Hall",
  hall_approved:    "Awaiting Dean",
  dean_approved:    "Dean Approved",
  dean_rejected:    "Dean Rejected",
  rejected:         "Rejected",
};

function statusClass(status) {
  const s = (status || "").toLowerCase().trim().replace(/_/g, "-");
  const map = {
    submitted:        "submitted",
    "faculty-approved": "faculty-approved",
    "hall-approved":    "hall-approved",
    "dean-approved":    "dean-approved",
    "dean-rejected":    "dean-rejected",
    rejected:           "rejected",
    draft:              "draft",
    pending:            "submitted",
    approved:           "approved",
  };
  return map[s] || s;
}

function statusLabel(status) {
  const s = (status || "").toLowerCase().trim();
  return STATUS_LABEL[s] || cap(status) || "—";
}

/* Dean can act on events that are hall_approved (both prev stages done) */
function isDeanActionable(status) {
  return (status || "").toLowerCase().trim() === STATUS.HALL_APPROVED;
}

/* ── auth fetch ── */
async function apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem("dean_auth_token") || localStorage.getItem("faculty_auth_token");
  if (!token) { window.location.href = "dean-signin.html"; return null; }

  try {
    const base = window.API || "http://localhost:5000/api";
    const res = await fetch(`${base}${endpoint}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    if (res.status === 401) {
      localStorage.removeItem("dean_auth_token");
      window.location.href = "dean-signin.html";
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
let currentPage  = "dashboard";
let calYear      = new Date().getFullYear();
let calMonth     = new Date().getMonth();
let chartsInited = false;

let cachedProfile  = null;
let cachedEvents   = [];
let cachedClubs    = [];

/* Notification store */
let localNotifs = JSON.parse(localStorage.getItem("evexa_dean_notifs") || "[]");
function saveNotifs() { localStorage.setItem("evexa_dean_notifs", JSON.stringify(localNotifs.slice(0, 50))); }
function addLocalNotif(type, icon, title, sub, sourceId = null) {
  localNotifs.unshift({ id: `${Date.now()}-${Math.random()}`, sourceId, type, icon, title, sub, time: new Date().toISOString(), read: false });
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
  document.getElementById("notifBtn")?.addEventListener("click", openNotifPanel);
  document.getElementById("notifClearAll")?.addEventListener("click", clearAllNotifs);
  document.getElementById("profileBtn")?.addEventListener("click", openProfileDrawer);
  document.getElementById("miniUser")?.addEventListener("click", openProfileDrawer);
  document.getElementById("closeProfileBtn")?.addEventListener("click", closeProfileDrawer);
  document.getElementById("overlay")?.addEventListener("click", closeProfileDrawer);
  document.getElementById("closeDeanDetail")?.addEventListener("click", () => {
    document.getElementById("deanApprovalDetail").style.display = "none";
  });
  document.getElementById("postAnnounceBtn")?.addEventListener("click", postAnnouncement);

  document.addEventListener("click", e => {
    const wrap = document.getElementById("notifBtn")?.closest(".notif-wrap");
    const dd = document.getElementById("notifDropdown");
    if (dd && !wrap?.contains(e.target)) dd.classList.remove("open");
  });

  initCalNav();

  /* search/filter wiring */
  document.getElementById("deanApprovalSearch")?.addEventListener("input", debounce(() => renderDeanApprovals()));
  document.getElementById("deanApprovalFilter")?.addEventListener("change", () => renderDeanApprovals());
  document.getElementById("deanApprovalCategory")?.addEventListener("change", () => renderDeanApprovals());
  document.getElementById("eventListSearch")?.addEventListener("input", debounce(() => renderEventList()));
  document.getElementById("eventListStatus")?.addEventListener("change", () => renderEventList());
  document.getElementById("allClubsSearch")?.addEventListener("input", debounce(() => renderAllClubs()));
  document.getElementById("allClubsCategory")?.addEventListener("change", () => renderAllClubs());

  /* Load profile */
  let profile = await apiFetch("/faculty/me") || await apiFetch("/auth/me");
  if (!profile) return;
  cachedProfile = profile;

  const name     = profile.name || "Dean";
  const initials = name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "DN";
  const dept     = profile.department || "Administration";

  el("miniName")?.text(name);
  el("miniRole")?.text(profile.faculty_no ? `${profile.faculty_no} · Dean` : "Dean");
  el("miniAvatar")?.text(initials);
  el("topAvatar")?.text(initials);
  el("rolePill")?.text(`Dean · ${dept}`);

  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  el("heroGreeting")?.text(`${greet}, ${name.split(" ")[0]}`);

  await refreshAll();
  updateNotifBadge();
  navigateTo("dashboard");
}

async function refreshAll() {
  const [events, clubs] = await Promise.all([
    apiFetch("/events/all"),
    apiFetch("/clubs"),
  ]);
  cachedEvents = Array.isArray(events) ? events : [];
  cachedClubs  = Array.isArray(clubs)  ? clubs  : [];

  /* Sync pending notifs */
  const deanPending = cachedEvents.filter(e => isDeanActionable(e.status));
  deanPending.forEach(e => {
    const sid = `event-dean-${e.id}`;
    if (!localNotifs.some(n => n.sourceId === sid)) {
      addLocalNotif("event", "🎓", "Event awaiting Dean approval", `${e.title || "Untitled"} · ${e.club || "—"}`, sid);
    }
  });

  updateBadges();
}

/* ── PAGE META ── */
const PAGE_META = {
  "dashboard":        ["Dashboard",                 "Dean overview — full institutional visibility."],
  "dean-approvals":   ["Dean Final Approval",       "Authorize events fully approved by Faculty & Hall Coordinator."],
  "event-list":       ["All Events",                "Complete institutional event list."],
  "venues":           ["Venues & Availability",     "Check venue availability by date."],
  "all-clubs":        ["All Clubs",                 "Browse all clubs and their events."],
  "analytics":        ["Reports & Analytics",       "Institution-wide event and participation analytics."],
  "announcements":    ["Announcements",             "Post institution-wide announcements."],
  "notif-history":    ["Notification History",      "All alerts and system updates."],
  "account-settings": ["Account Settings",          "Update your Dean profile and password."],
};

async function navigateTo(page) {
  localStorage.setItem("deanCurrentPage", page);

  document.querySelectorAll("[id^='pg-']").forEach(e => e.style.display = "none");
  const pg = document.getElementById("pg-" + page);
  if (pg) pg.style.display = "";

  document.querySelectorAll(".nav-item").forEach(e =>
    e.classList.toggle("active", e.dataset.page === page)
  );

  currentPage = page;

  const backBtn = document.getElementById("backBtn");
  if (backBtn) backBtn.style.display = page === "dashboard" ? "none" : "inline-flex";

  const [t, s] = PAGE_META[page] || ["", ""];
  el("pageTitle")?.text(t);
  el("pageSub")?.text(s);

  const renders = {
    "dashboard":        renderDashboard,
    "dean-approvals":   renderDeanApprovals,
    "event-list":       renderEventList,
    "venues":           loadVenues,
    "all-clubs":        renderAllClubs,
    "analytics": async () => {
      chartsInited = false;
      await refreshAll();
      setTimeout(initCharts, 60);
    },
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
  await refreshAll();

  const pending      = cachedEvents.filter(e => isDeanActionable(e.status));
  const deanApproved = cachedEvents.filter(e => (e.status || "").toLowerCase() === STATUS.DEAN_APPROVED);
  const now          = new Date();
  const total        = cachedEvents.length;

  el("heroPending")?.text(pending.length);
  el("heroTotalEvents")?.text(total);
  el("heroApproved")?.text(deanApproved.length);
  el("heroClubs")?.text(cachedClubs.length);

  renderDashPending(pending);
  renderDashboardCalendar();
}

function renderDashPending(pending) {
  const list = document.getElementById("dashPendingList");
  if (!list) return;

  if (!pending.length) {
    list.innerHTML = `<div class="list-empty" style="padding:10px;text-align:center;">🎉 No events awaiting your approval right now.</div>`;
    return;
  }

  list.innerHTML = pending.slice(0, 6).map(e => `
    <div class="dean-pending-item">
      <div class="dean-pending-dot"></div>
      <div class="dean-pending-info">
        <div class="dean-pending-title">${e.title || "Untitled"}</div>
        <div class="dean-pending-meta">${e.club || e.organizer || "—"} · ${fmtDate(e.date || e.event_date)} · ${e.venue || "—"}</div>
      </div>
      <span class="dean-approval-pill">Awaiting Dean</span>
      <button class="mini-btn approve" onclick="quickDeanApprove(${e.id})">✅ Approve</button>
      <button class="mini-btn reject"  onclick="quickDeanReject(${e.id})">❌ Reject</button>
    </div>
  `).join("");
}

/* ── DASHBOARD CALENDAR ── */
function renderDashboardCalendar() {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  el("dashCalMonthLabel")?.text(`${MONTHS[calMonth]} ${calYear}`);

  const calEl = document.getElementById("dashMiniCalendar");
  if (!calEl) return;

  const today    = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const total    = new Date(calYear, calMonth + 1, 0).getDate();

  const dayMap = {};
  cachedEvents.forEach(e => {
    const dt = parseEventDate(e.date || e.event_date || e.start_date);
    if (!dt || dt.getFullYear() !== calYear || dt.getMonth() !== calMonth) return;
    const d = dt.getDate();
    if (!dayMap[d]) dayMap[d] = [];
    dayMap[d].push(e);
  });

  const days = ["SU","MO","TU","WE","TH","FR","SA"];
  let html = `<div class="cal-weekdays">${days.map(d => `<div class="cal-weekday">${d}</div>`).join("")}</div><div class="cal-days">`;

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const isToday  = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const evs      = dayMap[d] || [];
    const hasDean  = evs.some(e => isDeanActionable(e.status));
    const hasAppr  = evs.some(e => (e.status || "").toLowerCase() === STATUS.DEAN_APPROVED);
    const hasAny   = evs.length > 0;
    const dayClass = hasDean ? "has-pending-dean" : hasAppr ? "has-approved" : hasAny ? "has-event" : "";
    const cls = ["cal-day", isToday ? "today" : "", dayClass].filter(Boolean).join(" ");
    const enc = evs.length ? encodeURIComponent(JSON.stringify(evs)) : "";
    html += `<div class="${cls}" onclick="dashCalDayClick(this, ${d})" data-events="${enc.replace(/"/g, "&quot;")}">${d}</div>`;
  }
  html += "</div>";
  calEl.innerHTML = html;
}

function dashCalDayClick(el2, day) {
  const panel = document.getElementById("dashSelectedDatePanel");
  const tbody = document.getElementById("dashSelectedDateBody");
  const title = document.getElementById("dashCalDateTitle");
  if (!panel || !tbody) return;

  if (el2.classList.contains("selected")) {
    el2.classList.remove("selected");
    panel.style.display = "none";
    return;
  }

  document.querySelectorAll("#dashMiniCalendar .cal-day.selected").forEach(d => d.classList.remove("selected"));
  el2.classList.add("selected");

  const raw = el2.getAttribute("data-events")?.replace(/&quot;/g, '"');
  if (!raw) { panel.style.display = "none"; return; }

  const evs = JSON.parse(decodeURIComponent(raw));
  if (title) title.textContent = `${evs.length} event${evs.length > 1 ? "s" : ""} on ${fmtDate(new Date(calYear, calMonth, day))}`;

  tbody.innerHTML = evs.map(e => `
    <tr>
      <td><span class="ev-name">${e.title || "Untitled"}</span></td>
      <td>${e.club || "—"}</td>
      <td>${e.organizer || e.created_by || "—"}</td>
      <td>${e.venue || "—"}</td>
      <td><span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
      <td>${isDeanActionable(e.status) ? `
        <div style="display:flex;gap:4px;">
          <button class="mini-btn approve" onclick="quickDeanApprove(${e.id})">✅</button>
          <button class="mini-btn reject"  onclick="quickDeanReject(${e.id})">❌</button>
        </div>` : "—"}
      </td>
    </tr>
  `).join("");

  panel.style.display = "";
}

function closeDashCalDetail() {
  document.getElementById("dashSelectedDatePanel").style.display = "none";
  document.querySelectorAll("#dashMiniCalendar .cal-day.selected").forEach(d => d.classList.remove("selected"));
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
   DEAN APPROVALS — CORE FEATURE
   Only events with status = hall_approved (both FC + HC done)
   ══════════════════════════════════════════════════════════ */
async function renderDeanApprovals() {
  const tbody      = document.getElementById("deanApprovalsBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" class="td-loading">Loading…</td></tr>`;

  const fresh = await apiFetch("/events/all");
  if (Array.isArray(fresh)) cachedEvents = fresh;

  const filterVal = document.getElementById("deanApprovalFilter")?.value || "pending_dean";
  const search    = (document.getElementById("deanApprovalSearch")?.value || "").toLowerCase();
  const category  = document.getElementById("deanApprovalCategory")?.value || "all";

  let list = cachedEvents.filter(e => {
    const s = (e.status || "").toLowerCase().trim();
    if (filterVal === "pending_dean")  return s === STATUS.HALL_APPROVED;
    if (filterVal === "dean_approved") return s === STATUS.DEAN_APPROVED;
    if (filterVal === "dean_rejected") return s === STATUS.DEAN_REJECTED;
    return true; /* all */
  });

  if (category !== "all") list = list.filter(e => (e.category || e.type || "").toLowerCase() === category.toLowerCase());
  if (search) {
    list = list.filter(e =>
      (e.title || "").toLowerCase().includes(search) ||
      (e.club  || "").toLowerCase().includes(search) ||
      (e.venue || "").toLowerCase().includes(search)
    );
  }

  window.currentDeanApprovalList = list;

  if (!list.length) {
    const msgs = {
      pending_dean:  "No events are currently awaiting your approval.<br><small>Events appear here after both Faculty Coordinator and Hall Coordinator have approved them.</small>",
      dean_approved: "No events approved yet.",
      dean_rejected: "No events rejected.",
      all:           "No events found.",
    };
    tbody.innerHTML = `<tr><td colspan="9" class="td-empty">${msgs[filterVal] || msgs.all}</td></tr>`;
    updateBadges(); return;
  }

  tbody.innerHTML = list.map(e => {
    const isActionable = isDeanActionable(e.status);
    return `
      <tr>
        <td><span class="ev-name" onclick="showDeanEventDetail('${e.id}')">${e.title || "Untitled"}</span></td>
        <td>${e.club || e.organizer || "—"}</td>
        <td>${fmtDate(e.date || e.event_date)}</td>
        <td>${e.venue || "—"}</td>
        <td><span class="tag">${e.category || e.type || "General"}</span></td>
        <td>${e.capacity || e.expected_participants || "—"}</td>
        <td>${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</td>
        <td>
          <span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span>
        </td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${isActionable ? `
              <button class="mini-btn approve" onclick="deanApprove(${e.id})">✅ Approve</button>
              <button class="mini-btn reject"  onclick="deanReject(${e.id})">❌ Reject</button>
            ` : ""}
            <button class="mini-btn" onclick="showDeanEventDetail('${e.id}')">👁 View</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  updateBadges();
}

function showDeanEventDetail(eventId) {
  const e = (window.currentDeanApprovalList || cachedEvents).find(x => String(x.id) === String(eventId));
  if (!e) { showToast("Event not found.", "error"); return; }

  el("deanDetailName")?.text(e.title || "Event Details");

  const panel = document.getElementById("deanApprovalDetail");
  if (panel) {
    panel.style.display = "";
    setTimeout(() => panel.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const isActionable = isDeanActionable(e.status);

  const stages = [
    { label: "Faculty Coordinator", icon: "👩‍🏫", key: "faculty", done: ["faculty_approved","hall_approved","dean_approved"].includes((e.status||"").toLowerCase()) },
    { label: "Hall Coordinator",    icon: "🏛️", key: "hall",    done: ["hall_approved","dean_approved"].includes((e.status||"").toLowerCase()) },
    { label: "Dean Approval",       icon: "🎓", key: "dean",    done: (e.status||"").toLowerCase() === "dean_approved" },
  ];
  const isRej = ["rejected","dean_rejected"].includes((e.status||"").toLowerCase());

  const timelineHtml = `
    <div class="approval-timeline">
      ${stages.map((st, i) => `
        ${i > 0 ? `<div class="approval-arrow">→</div>` : ""}
        <div class="approval-stage ${st.done ? "done" : isRej ? "rejected" : i === 2 && (e.status||"").toLowerCase() === "hall_approved" ? "pending" : ""}">
          <div class="approval-stage-icon">${st.icon}</div>
          <div>
            <div class="approval-stage-label">${st.label}</div>
            <div class="approval-stage-status">${st.done ? "✓ Approved" : isRej ? "✗ Rejected" : i === 2 && isDeanActionable(e.status) ? "⏳ Pending" : "Waiting"}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  const body = document.getElementById("deanDetailBody");
  if (body) {
    body.innerHTML = `
      ${timelineHtml}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div class="detail-section">
            <div class="detail-section-title">Event Information</div>
            <div class="detail-grid">
              <div class="detail-cell"><div class="detail-label">Club / Organizer</div><div class="detail-val">${e.club || e.organizer || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Category</div><div class="detail-val">${e.category || e.type || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Date</div><div class="detail-val">${fmtDate(e.date || e.event_date)}</div></div>
              <div class="detail-cell"><div class="detail-label">Time</div><div class="detail-val">${formatTime(e.time || e.start_time)}</div></div>
              <div class="detail-cell"><div class="detail-label">Venue</div><div class="detail-val">${e.venue || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Expected Participants</div><div class="detail-val">${e.capacity || e.expected_participants || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Registration Fee</div><div class="detail-val">${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</div></div>
              <div class="detail-cell"><div class="detail-label">Created By</div><div class="detail-val">${e.created_by || e.submitted_by || "—"}</div></div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Current Status</div>
            <span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span>
            ${e.remark ? `<div style="margin-top:10px;font-size:12px;color:var(--text-3);">💬 Remark: ${e.remark}</div>` : ""}
          </div>

          ${isActionable ? `
          <div class="detail-section">
            <div class="detail-section-title">Dean Decision</div>
            <textarea id="deanRemark" rows="3"
              placeholder="Add a remark or reason for your decision (optional)…"
              style="width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-family:var(--font);resize:vertical;outline:none;margin-bottom:12px;box-sizing:border-box;"
            ></textarea>
            <div style="display:flex;gap:10px;">
              <button class="btn success" style="flex:1;justify-content:center;" onclick="deanApproveWithRemark(${e.id})">
                🎓 Grant Dean Approval
              </button>
              <button class="btn danger" style="flex:1;justify-content:center;" onclick="deanRejectWithRemark(${e.id})">
                ❌ Reject
              </button>
            </div>
            <div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(212,160,23,.08);border:1px solid rgba(212,160,23,.2);font-size:12px;color:var(--text-3);">
              ⚠️ This action is final. Once Dean-approved, the event is fully authorized to proceed.
            </div>
          </div>
          ` : `
          <div class="detail-section">
            <div class="detail-section-title">Dean Decision</div>
            <div style="padding:10px 12px;border-radius:10px;border:1px solid var(--border-2);background:var(--surface-2);font-size:13px;color:var(--text-3);">
              ${(e.status||"").toLowerCase() === STATUS.DEAN_APPROVED ? "✅ You have approved this event." :
                (e.status||"").toLowerCase() === STATUS.DEAN_REJECTED ? "❌ This event was rejected." :
                "This event is not yet ready for Dean approval."}
            </div>
          </div>
          `}
        </div>
        <div>
          <div class="detail-section">
            <div class="detail-section-title">Description</div>
            <div class="detail-desc">${e.description || "No description provided."}</div>
          </div>
          ${e.requirements ? `<div class="detail-section"><div class="detail-section-title">Requirements</div><div class="detail-desc">${e.requirements}</div></div>` : ""}
          ${e.objectives   ? `<div class="detail-section"><div class="detail-section-title">Objectives</div><div class="detail-desc">${e.objectives}</div></div>` : ""}
          ${e.document_url ? `<div class="detail-section"><div class="detail-section-title">Document</div><a href="${e.document_url}" target="_blank" class="mini-btn" style="display:inline-flex;">📎 View Document</a></div>` : ""}
        </div>
      </div>
    `;
  }
}

/* ── Dean approval actions ── */
async function deanApprove(id) {
  const e   = (window.currentDeanApprovalList || cachedEvents).find(x => String(x.id) === String(id));
  const res = await apiFetch(`/events/${id}/dean-approve`, { method: "PATCH" });
  if (res !== null) {
    if (e) e.status = STATUS.DEAN_APPROVED;
    addLocalNotif("event", "🎓", "Dean Approved", `"${e?.title || "Event"}" has been fully authorized.`, `dean-${id}`);
    showToast("🎓 Event Dean-approved!", "success");
    await renderDeanApprovals();
    updateBadges();
  } else {
    showToast("Failed to approve.", "error");
  }
}

async function deanReject(id) {
  const e   = (window.currentDeanApprovalList || cachedEvents).find(x => String(x.id) === String(id));
  const res = await apiFetch(`/events/${id}/dean-reject`, { method: "PATCH" });
  if (res !== null) {
    if (e) e.status = STATUS.DEAN_REJECTED;
    addLocalNotif("event", "❌", "Dean Rejected", `"${e?.title || "Event"}" was rejected by Dean.`, `dean-${id}`);
    showToast("❌ Event rejected.", "error");
    await renderDeanApprovals();
    updateBadges();
  } else {
    showToast("Failed to reject.", "error");
  }
}

async function deanApproveWithRemark(id) {
  const remark = document.getElementById("deanRemark")?.value.trim() || "";
  const res = await apiFetch(`/events/${id}/dean-approve`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const e = (window.currentDeanApprovalList || cachedEvents).find(x => String(x.id) === String(id));
    if (e) { e.status = STATUS.DEAN_APPROVED; e.remark = remark; }
    addLocalNotif("event", "🎓", "Dean Approved", `"${e?.title || "Event"}" fully authorized.`, `dean-${id}`);
    document.getElementById("deanApprovalDetail").style.display = "none";
    showToast("🎓 Event Dean-approved!", "success");
    await renderDeanApprovals();
    updateBadges();
  } else {
    showToast("Failed to approve.", "error");
  }
}

async function deanRejectWithRemark(id) {
  const remark = document.getElementById("deanRemark")?.value.trim();
  if (!remark) { showToast("Please add a reason for rejection.", "error"); document.getElementById("deanRemark")?.focus(); return; }
  const res = await apiFetch(`/events/${id}/dean-reject`, {
    method: "PATCH",
    body: JSON.stringify({ remark }),
  });
  if (res !== null) {
    const e = (window.currentDeanApprovalList || cachedEvents).find(x => String(x.id) === String(id));
    if (e) { e.status = STATUS.DEAN_REJECTED; e.remark = remark; }
    addLocalNotif("event", "❌", "Dean Rejected", `"${e?.title || "Event"}" rejected.`, `dean-${id}`);
    document.getElementById("deanApprovalDetail").style.display = "none";
    showToast("❌ Event rejected.", "error");
    await renderDeanApprovals();
    updateBadges();
  } else {
    showToast("Failed to reject.", "error");
  }
}

async function quickDeanApprove(id) { await deanApprove(id); renderDashboard(); }
async function quickDeanReject(id)  { await deanReject(id);  renderDashboard(); }

/* ══════════════════════════════════════════════════════════
   EVENT LIST
   ══════════════════════════════════════════════════════════ */
async function renderEventList() {
  const fresh = await apiFetch("/events/all");
  if (Array.isArray(fresh)) cachedEvents = fresh;

  const tbody  = document.getElementById("eventListBody");
  if (!tbody) return;

  const search = (document.getElementById("eventListSearch")?.value || "").toLowerCase();
  const status = document.getElementById("eventListStatus")?.value || "all";

  let list = [...cachedEvents];
  if (status !== "all") list = list.filter(e => (e.status || "").toLowerCase().trim() === status.toLowerCase());
  if (search) list = list.filter(e =>
    (e.title || "").toLowerCase().includes(search) ||
    (e.club  || "").toLowerCase().includes(search)
  );
  list.sort((a, b) => new Date(b.date || b.event_date) - new Date(a.date || a.event_date));

  window.currentEventList = list;

  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span class="ev-name" onclick="showDeanEventDetail('${e.id}')">${e.title || "Untitled"}</span></td>
      <td>${e.club || e.organizer || "—"}</td>
      <td>${fmtDate(e.date || e.event_date)}</td>
      <td>${e.venue || "—"}</td>
      <td><span class="tag">${e.category || e.type || "General"}</span></td>
      <td>${e.capacity || "—"}</td>
      <td>${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</td>
      <td><span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
      <td>
        ${isDeanActionable(e.status) ? `
          <div style="display:flex;gap:4px;">
            <button class="mini-btn approve" onclick="quickDeanApprove(${e.id})">✅</button>
            <button class="mini-btn reject"  onclick="quickDeanReject(${e.id})">❌</button>
          </div>` : `<button class="mini-btn" onclick="showDeanEventDetail('${e.id}')">👁 View</button>`}
      </td>
    </tr>
  `).join("")
  : `<tr><td colspan="9" class="td-empty">No events found.</td></tr>`;
}

/* ══════════════════════════════════════════════════════════
   ALL CLUBS
   ══════════════════════════════════════════════════════════ */
let allClubsData      = [];
let currentClubEvents = [];

async function renderAllClubs() {
  const grid = document.getElementById("allClubsGrid");
  if (!grid) return;
  grid.innerHTML = `<div class="list-empty" style="padding:20px;">Loading…</div>`;

  let fresh = await apiFetch("/clubs");
  allClubsData = Array.isArray(fresh) && fresh.length ? fresh : [...cachedClubs];

  const search   = (document.getElementById("allClubsSearch")?.value   || "").toLowerCase();
  const category = document.getElementById("allClubsCategory")?.value  || "all";
  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵","🔬","🎭","🏅","📐","🌱","🔭","🎮","🎻"];

  let list = allClubsData;
  if (search) list = list.filter(c =>
    (c.club_name||c.name||"").toLowerCase().includes(search) ||
    (c.category||c.type||"").toLowerCase().includes(search)
  );
  if (category !== "all") list = list.filter(c => {
    const raw = (c.club_category||c.category||c.type||"").toLowerCase().trim();
    return raw === category.toLowerCase();
  });
  if (!list.length) { grid.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs found.</div>`; return; }

  grid.innerHTML = list.map((c, i) => {
    const clubName   = c.club_name || c.name || "Club";
    const clubId     = String(c.id ?? c.club_id ?? "");
    const clubEvents = cachedEvents.filter(e =>
      String(e.club_id ?? e.clubId ?? "") === clubId ||
      (e.club||"").trim().toLowerCase() === clubName.trim().toLowerCase()
    );
    const upcoming = clubEvents.filter(e => {
      const d = parseEventDate(e.date || e.event_date);
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
        </div>
      </div>
    `;
  }).join("");
}

function openClubDetail(clubId, idx) {
  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵","🔬","🎭","🏅","📐","🌱","🔭","🎮","🎻"];
  const club   = allClubsData.find(c => String(c.id ?? c.club_id ?? "") === String(clubId));
  if (!club) return;

  const clubName = club.club_name || club.name || "Club";
  currentClubEvents = cachedEvents.filter(e =>
    String(e.club_id ?? e.clubId ?? "") === String(clubId) ||
    (e.club||"").trim().toLowerCase() === clubName.trim().toLowerCase()
  ).sort((a, b) => new Date(b.date||b.event_date) - new Date(a.date||a.event_date));

  const upcoming = currentClubEvents.filter(e => { const d = parseEventDate(e.date||e.event_date); return d && d >= new Date(); }).length;
  const pending  = currentClubEvents.filter(e => isDeanActionable(e.status)).length;

  el("clubDetailEmoji")?.text(club.logo || emojis[idx % emojis.length]);
  el("clubDetailName")?.text(clubName);
  el("clubDetailCat")?.text(club.category || club.type || "Club");

  const statsEl = document.getElementById("clubDetailStats");
  if (statsEl) {
    statsEl.innerHTML = [
      { val: club.member_count || 0, label: "Members"      },
      { val: currentClubEvents.length, label: "Total Events" },
      { val: upcoming,               label: "Upcoming"     },
      { val: pending,                label: "Awaiting Dean" },
    ].map(s => `<div class="club-ds-cell"><div class="club-ds-val">${s.val}</div><div class="club-ds-label">${s.label}</div></div>`).join("");
  }

  const infoEl = document.getElementById("clubDetailInfo");
  if (infoEl) {
    infoEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        ${[["Club Name",clubName],["Category",club.club_category||club.category||"—"],["Status",club.status||"Active"],["Members",club.member_count||0],["Faculty",club.faculty_name||club.incharge||"—"],["Email",club.email||"—"],["Founded",fmtDate(club.created_at||club.founded)||"—"],["Description",club.short_description||club.description||"—"]].map(([l,v]) => `
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
  if (status !== "all") list = list.filter(e => (e.status||"").toLowerCase() === status.toLowerCase());
  if (search) list = list.filter(e => (e.title||"").toLowerCase().includes(search) || (e.venue||"").toLowerCase().includes(search));
  const tbody = document.getElementById("clubDetailEventsBody");
  if (!tbody) return;
  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span class="ev-name">${e.title||"Untitled"}</span></td>
      <td>${fmtDate(e.date||e.event_date)}</td>
      <td>${e.venue||"—"}</td>
      <td><span class="tag">${e.category||e.type||"General"}</span></td>
      <td>${e.capacity||e.expected_participants||"—"}</td>
      <td>${e.registration_fee > 0 ? "₹"+e.registration_fee : "Free"}</td>
      <td><span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
    </tr>
  `).join("")
  : `<tr><td colspan="7" class="td-empty">No events match.</td></tr>`;
}

/* ══════════════════════════════════════════════════════════
   VENUES
   ══════════════════════════════════════════════════════════ */
let venues = []; let currentVenueId = null;
let currentMonth = new Date().getMonth(); let currentYear = new Date().getFullYear();
const venueBookings = {};

async function loadVenues() {
  try {
    const data = await apiFetch("/venues");
    if (Array.isArray(data) && data.length) { venues = data; currentVenueId = data[0].id; }
  } catch {}
  renderVenueSidebar();
  await loadVenueBookings();
  renderVenueCalendar();
}

function renderVenueSidebar() {
  const list = document.getElementById("venueList");
  if (!list) return;
  list.innerHTML = venues.map(v => `
    <div class="venue-list-item ${v.id === currentVenueId ? "active" : ""}" onclick="selectVenue(${v.id})">${v.name||"Venue"}</div>
  `).join("");
}

async function selectVenue(vid) {
  const v = venues.find(x => x.id === vid);
  if (!v) return;
  currentVenueId = v.id;
  renderVenueSidebar();
  await loadVenueBookings();
  renderVenueCalendar();
}

async function loadVenueBookings() {
  if (!currentVenueId) return;
  try {
    const data = await apiFetch(`/venues/calendar?venue_id=${currentVenueId}&month=${currentMonth+1}&year=${currentYear}`);
    if (!Array.isArray(data)) return;
    venueBookings[currentVenueId] = {};
    const PRIORITY = { booked: 3, partial: 2, pending: 1, available: 0 };
    data.forEach(item => {
      const s = (item.status||"available").toLowerCase();
      const ex = venueBookings[currentVenueId][item.day];
      if (!ex || (PRIORITY[s]??0) > (PRIORITY[ex]??0)) venueBookings[currentVenueId][item.day] = s;
    });
  } catch {}
}

function renderVenueCalendar() {
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
    const e = document.createElement("div"); e.className = "venue-day-empty"; grid.appendChild(e);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const status = bookings[d] || "available";
    const cell   = document.createElement("div");
    cell.className = `venue-day ${status}`;
    if (d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) cell.classList.add("today");
    cell.innerHTML = `<span class="day-number">${d}</span>`;
    grid.appendChild(cell);
  }
}

document.getElementById("prevMonth")?.addEventListener("click", async () => {
  currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  await loadVenueBookings(); renderVenueCalendar();
});
document.getElementById("nextMonth")?.addEventListener("click", async () => {
  currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  await loadVenueBookings(); renderVenueCalendar();
});

/* ══════════════════════════════════════════════════════════
   ANALYTICS
   ══════════════════════════════════════════════════════════ */
async function initCharts() {
  chartsInited = true;

  const kpi = document.getElementById("analyticsKpi");
  const deanApproved = cachedEvents.filter(e => (e.status||"").toLowerCase() === STATUS.DEAN_APPROVED).length;
  const hallPending  = cachedEvents.filter(e => isDeanActionable(e.status)).length;
  const totalReg     = cachedEvents.reduce((s, e) => s + Number(e.registered_count||e.registered||0), 0);

  if (kpi) {
    kpi.innerHTML = [
      { icon: "📋", val: cachedEvents.length, label: "Total Events",        cls: "kg" },
      { icon: "🎓", val: deanApproved,         label: "Dean Approved",       cls: "kv" },
      { icon: "⏳", val: hallPending,           label: "Awaiting Dean",       cls: "kp" },
      { icon: "👥", val: totalReg,              label: "Total Registrations", cls: "kc" },
    ].map(d => `
      <div class="kpi-card ${d.cls}">
        <div class="kpi-icon">${d.icon}</div>
        <div class="kpi-val">${d.val}</div>
        <div class="kpi-label">${d.label}</div>
      </div>
    `).join("");
  }

  const now = new Date();
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const labels = [], evCounts = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTH_NAMES[d.getMonth()]);
    evCounts.push(cachedEvents.filter(e => {
      const ed = parseEventDate(e.date || e.event_date);
      return ed && ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
    }).length);
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
    data: { labels, datasets: [{ data: evCounts, backgroundColor: "rgba(212,160,23,.7)", borderRadius: 7, borderSkipped: false }] },
    options: chartDefaults,
  });

  /* Approval Funnel */
  const funnelData = [
    cachedEvents.filter(e => !["submitted","draft"].includes((e.status||"").toLowerCase())).length,
    cachedEvents.filter(e => ["hall_approved","dean_approved"].includes((e.status||"").toLowerCase())).length,
    deanApproved,
  ];
  tryChart("approvalFunnelChart", {
    type: "bar",
    data: {
      labels: ["Faculty Approved","Hall Approved","Dean Approved"],
      datasets: [{ data: funnelData, backgroundColor: ["rgba(6,182,212,.7)","rgba(139,92,246,.7)","rgba(212,160,23,.7)"], borderRadius: 7, borderSkipped: false }],
    },
    options: chartDefaults,
  });

  /* Type donut */
  const TECH_KW = ["ieee","iedc","robotics","coding","tech","computer","ai","ml","cyber","hack"];
  const technical    = cachedEvents.filter(e => { const s = [(e.club||""),(e.type||""),(e.title||"")].join(" ").toLowerCase(); return (e.category||"").toLowerCase() === "technical" || TECH_KW.some(k => s.includes(k)); }).length;
  const nonTechnical = Math.max(0, cachedEvents.length - technical);
  const total        = cachedEvents.length || 1;

  tryChart("typeChart", {
    type: "doughnut",
    data: { labels: ["Technical","Non-Technical"], datasets: [{ data: [technical, nonTechnical], backgroundColor: ["#d4a017","#8b5cf6"], borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: "68%" },
  });
  const leg = document.getElementById("typeChartLegend");
  if (leg) {
    leg.innerHTML = [
      { color: "#d4a017", label: "Technical",     cnt: technical,    pct: Math.round(technical/total*100) },
      { color: "#8b5cf6", label: "Non-Technical", cnt: nonTechnical, pct: Math.round(nonTechnical/total*100) },
    ].map(d => `
      <div class="leg-row">
        <div class="leg-swatch" style="background:${d.color}"></div>
        <div><div class="leg-text">${d.label} — ${d.pct}%</div><div class="leg-pct">${d.cnt} events</div></div>
      </div>
    `).join("");
  }

  /* Venue chart */
  const venueMap = {};
  cachedEvents.forEach(e => { const v = (e.venue||"Unknown").trim(); venueMap[v] = (venueMap[v]||0) + 1; });
  const sorted = Object.entries(venueMap).sort((a,b) => b[1]-a[1]).slice(0,8);
  const BG = ["rgba(212,160,23,.7)","rgba(139,92,246,.7)","rgba(6,182,212,.7)","rgba(34,197,94,.7)","rgba(245,158,11,.7)","rgba(239,68,68,.7)","rgba(59,130,246,.7)","rgba(132,204,22,.7)"];

  tryChart("venueChart", {
    type: "bar",
    data: {
      labels: sorted.map(([n]) => n),
      datasets: [{ data: sorted.map(([,c]) => c), backgroundColor: sorted.map((_,i) => BG[i%BG.length]), borderRadius: 7, borderSkipped: false }],
    },
    options: { ...chartDefaults, indexAxis: "y" },
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
  const ICONS = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣", Policy:"📜" };
  al.innerHTML = list.map(a => `
    <div class="announce-card" data-ann-id="${a.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div class="announce-title">${ICONS[a.type]||"📣"} ${a.title}</div>
        <div style="display:flex;gap:6px;">
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
  const res = await apiFetch("/announcements", { method: "POST", body: JSON.stringify({ title, message, type }) });
  if (res !== null) {
    document.getElementById("announceTitle").value = "";
    document.getElementById("announceBody").value  = "";
    addLocalNotif("admin", "📢", title, message, `ann-${res.id}`);
    showToast("📢 Announcement posted!", "success");
    await renderAnnouncements();
  } else {
    showToast("Failed to post.", "error");
  }
}

async function deleteAnnouncement(id) {
  if (!confirm("Delete this announcement?")) return;
  const res = await apiFetch(`/announcements/${id}`, { method: "DELETE" });
  if (res !== null) { showToast("🗑️ Deleted", "success"); await renderAnnouncements(); }
  else showToast("Failed to delete.", "error");
}

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
function openNotifPanel(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById("notifDropdown");
  if (dd) {
    dd.classList.toggle("open");
    localNotifs = localNotifs.map(n => ({ ...n, read: true }));
    saveNotifs(); updateNotifBadge();
    renderNotifDropdown();
  }
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
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px;">🔔<br>No notifications.</div>`;
    return;
  }
  list.innerHTML = localNotifs.slice(0, 8).map(n => `
    <div class="notif-item ${n.read ? "" : "unread"}">
      <div class="notif-icon">${n.icon||"🔔"}</div>
      <div style="flex:1;min-width:0;">
        <div class="notif-ntitle">${n.title}</div>
        <div class="notif-nsub">${n.sub||""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
      ${!n.read ? `<div class="notif-unread-dot"></div>` : ""}
    </div>
  `).join("");
}

function clearAllNotifs() {
  localNotifs = []; saveNotifs(); updateNotifBadge(); renderNotifDropdown();
  showToast("Notifications cleared.", "info");
}

function renderNotifHistory() {
  const list = document.getElementById("notifHistoryList");
  if (!list) return;
  list.innerHTML = localNotifs.length ? localNotifs.map(n => `
    <div class="notif-item">
      <div class="notif-icon">${n.icon||"🔔"}</div>
      <div style="flex:1;min-width:0;">
        <div class="notif-ntitle">${n.title}</div>
        <div class="notif-nsub">${n.sub||""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
    </div>
  `).join("")
  : `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px;">No notifications.</div>`;
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
  const initials = (p.name||"DN").split(" ").map(n => n[0]).join("").slice(0,2);
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div style="width:72px;height:72px;border-radius:18px;background:var(--g-gold);display:grid;place-items:center;font-size:26px;font-weight:800;color:#0d0a00;box-shadow:var(--glow-g);">
        ${initials}
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--text);">${p.name||"Dean"}</div>
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
        </div>
      `).join("")}
    </div>
    <div class="divider"></div>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
      <button class="btn primary" onclick="closeProfileDrawer();navigateTo('account-settings')">⚙️ Edit Profile</button>
      <button class="btn ghost" onclick="navigateTo('dean-approvals');closeProfileDrawer()">🎓 View Dean Approvals</button>
    </div>
  `;
}

function closeProfileDrawer() {
  document.getElementById("profileDrawer")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("open");
}

function initAccountSettings() {
  const form = document.getElementById("asAccountForm");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const g = id => document.getElementById(id)?.value.trim() || "";
    const payload = { name: g("asName"), email: g("asEmail"), department: g("asDepartment"), phone_no: g("asPhone") };
    const cp = g("asCurrentPassword"), np = g("asNewPassword"), cfp = g("asConfirmPassword");
    if (cp || np || cfp) {
      if (!cp || !np || !cfp) { el("asFormMsg")?.text("Fill all password fields."); return; }
      if (np !== cfp) { el("asFormMsg")?.text("Passwords do not match."); return; }
      if (np.length < 6) { el("asFormMsg")?.text("Password must be at least 6 characters."); return; }
      payload.current_password = cp; payload.new_password = np;
    }
    const res = await apiFetch("/faculty/me", { method: "PUT", body: JSON.stringify(payload) });
    if (res) {
      cachedProfile = { ...cachedProfile, ...payload };
      el("asFormMsg")?.text("Profile updated successfully.");
      showToast("✅ Profile updated!", "success");
    } else {
      el("asFormMsg")?.text("Failed to update.");
    }
  });
  document.getElementById("asName")?.addEventListener("input", () => {
    const name = document.getElementById("asName")?.value.trim() || "Dean";
    el("asProfileNamePreview")?.text(name);
    el("asProfileAvatar")?.text(name.split(" ").map(n=>n[0]).join("").slice(0,2));
  });
}

function asLoadProfile() {
  const p = cachedProfile;
  if (!p) return;
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.value = val || ""; };
  set("asFacultyNo", p.faculty_no); set("asDepartment", p.department);
  set("asName", p.name); set("asEmail", p.email); set("asPhone", p.phone_no || p.phone);
  const initials = (p.name||"DN").split(" ").map(n=>n[0]).join("").slice(0,2);
  el("asProfileAvatar")?.text(initials);
  el("asProfileNamePreview")?.text(p.name||"Dean");
}

/* ══════════════════════════════════════════════════════════
   BADGES
   ══════════════════════════════════════════════════════════ */
function updateBadges() {
  const deanPending = cachedEvents.filter(e => isDeanActionable(e.status)).length;
  const badge = document.getElementById("badge-dean-approvals");
  if (badge) { badge.textContent = deanPending > 0 ? deanPending : "–"; badge.style.opacity = deanPending > 0 ? "1" : "0.4"; }
}

/* ══════════════════════════════════════════════════════════
   LOGOUT
   ══════════════════════════════════════════════════════════ */
function logout() {
  const modal = document.createElement("div");
  modal.innerHTML = `
    <div onclick="this.parentElement.remove()" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;backdrop-filter:blur(4px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;
      background:rgba(10,13,28,.97);border:1px solid rgba(212,160,23,.28);border-radius:24px;
      width:min(370px,90vw);padding:30px 26px;box-shadow:var(--shadow-lg);text-align:center;backdrop-filter:var(--blur);">
      <div style="font-size:38px;margin-bottom:10px;">👋</div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:6px;">Logging out?</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:24px;">Are you sure you want to sign out of your Dean account?</div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button onclick="this.closest('div[style*=fixed]').parentElement.remove()"
          style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Cancel</button>
        <button onclick="localStorage.removeItem('dean_auth_token');localStorage.removeItem('faculty_auth_token');window.location.href='../dean-signin.html';"
          style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Yes, Logout</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

/* ══════════════════════════════════════════════════════════
   THEME
   ══════════════════════════════════════════════════════════ */
function applyTheme() {
  const saved = localStorage.getItem("evexa_dean_theme");
  if (saved === "light") document.body.classList.add("light");
  updateThemeBtn();
}
function toggleTheme() {
  document.body.classList.toggle("light");
  localStorage.setItem("evexa_dean_theme", document.body.classList.contains("light") ? "light" : "dark");
  updateThemeBtn();
}
function updateThemeBtn() {
  const btn = document.getElementById("themeToggle");
  if (btn) btn.textContent = document.body.classList.contains("light") ? "🌙" : "☀️";
}

/* ══════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════ */
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
    const [h, m] = t.split(":"); const hour = +h, ampm = hour >= 12 ? "PM" : "AM", hr12 = hour % 12 || 12;
    return `${hr12}:${m} ${ampm}`;
  }
  const dt = new Date(t);
  if (!isNaN(dt)) return dt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return t;
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg; t.className = `toast ${type} show`;
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 3000);
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

function closeEventDetail() {
  const overlay = document.getElementById("eventDetailOverlay");
  const drawer  = document.getElementById("eventDetailDrawer");
  if (drawer) { drawer.classList.remove("open"); setTimeout(() => { if (drawer) drawer.style.display = "none"; }, 300); }
  if (overlay) overlay.style.display = "none";
  document.body.style.overflow = "";
}

/* ── kick off ── */
boot();
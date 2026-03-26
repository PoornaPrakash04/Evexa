// ============================================================
//  faculty-dashboard.js  —  EVEXA Faculty Portal
//  Full real-time API integration · Club-wise filtering enabled
//  FIXED: proposal page empty, auth on events fetch, dedup logic,
//         status casing, robust fallback rendering
// ============================================================

var API = "http://localhost:5000/api";
window.API = API;

// ── PENDING STATUS HELPER ─────────────────────────────────────────────────
// Centralised so we never miss a variant from the backend
function isPendingStatus(status) {
  return ["pending", "review", "submitted", "awaiting", "under review", "new"]
    .includes((status || "").toLowerCase().trim());
}

// ── AUTH ──────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "fcsignin.html";
    return null;
  }

  try {
    const base = (typeof API !== "undefined" ? API : window.API) || "http://localhost:5000/api";
    const res = await fetch(`${base}${endpoint}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {})
      },
    });

    if (res.status === 401) {
      localStorage.removeItem("authToken");
      window.location.href = "fcsignin.html";
      return null;
    }

    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      console.error(`[apiFetch] ${endpoint} → ${res.status} | body: ${body}`);
      return null;
    }

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

let cachedProfile   = null;
let cachedProposals = [];
let cachedEvents    = [];
let cachedClubs     = [];
let cachedFeedback  = [];

let localNotifs = JSON.parse(localStorage.getItem("evexa_faculty_notifs") || "[]");
function saveNotifs() {
  localStorage.setItem("evexa_faculty_notifs", JSON.stringify(localNotifs.slice(0, 50)));
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

  initBulk();
  initSearchFilters();
  initCalNav();

  let profile = await apiFetch("/faculty/me");
  if (!profile) profile = await apiFetch("/auth/me");
  if (!profile) return;

  if (!profile.faculty_no && !profile.department && profile.roll_no) {
    localStorage.removeItem("authToken");
    showToast("Please log in with your faculty account.", "error");
    setTimeout(() => window.location.href = "fcsignin.html", 1500);
    return;
  }

  cachedProfile = profile;

  const name = profile.name || "Faculty";
  const initials = name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "FA";
  const department = profile.department || "Faculty Advisor";
  const facultyNo = profile.faculty_no || "";

  el("miniName")?.text(name);
  el("miniRole")?.text(facultyNo ? `${facultyNo} · ${department}` : department);
  el("miniAvatar")?.text(initials);
  el("topAvatar")?.text(initials);
  el("rolePill")?.text(`Faculty · ${department}`);

  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  el("heroGreeting")?.text(`${greet}, ${name.split(" ")[0]}`);

  await refreshAll();

  renderDashboard();
  updateNotifBadge();
  syncNotifs();
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
  // FIX: all fetches now go through apiFetch so the auth token is always sent
  const [proposals, events, clubs, feedback] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/events"),
    apiFetch("/clubs/my-clubs"),
    apiFetch("/faculty/feedback"),
  ]);

  cachedProposals = Array.isArray(proposals) ? proposals : [];
  cachedEvents    = Array.isArray(events)    ? events    : [];
  cachedClubs     = Array.isArray(clubs)     ? clubs     : [];
  cachedFeedback  = Array.isArray(feedback)  ? feedback  : [];

  // Debug: log what we got so you can verify status strings from your backend
  console.log("[refreshAll] proposals:", cachedProposals.length,
    cachedProposals.map(p => ({ id: p.id, title: p.title, status: p.status })));
  console.log("[refreshAll] events:", cachedEvents.length,
    cachedEvents.map(e => ({ id: e.id, title: e.title, status: e.status })));

  updateBadges();
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
const PAGE_META = {
  "dashboard":     ["Dashboard",                "Welcome back — here's your faculty overview."],
  "proposals":     ["Event Proposal Review",    "Review, approve or reject submitted proposals."],
  "event-list":    ["All Events",               "Complete event list across your clubs."],
  "pending":       ["Pending Queue",            "All items requiring your immediate action."],
  "all-clubs":     ["All Clubs",                "Browse all clubs and their events."],
  "clubs":         ["Club & Academic Oversight", "Your incharge clubs and their activity."],
  "analytics":     ["Reports & Analytics",      "Events, participation, and academic statistics."],
  "feedback":      ["Feedback & Reports",       "Student feedback ratings and comments."],
  "announcements": ["Announcements",            "Post and manage club announcements."],
  "notif-history": ["Notification History",     "All alerts and system updates."],
  "venues": ["Venues & Availability", "Check venue availability by date."],
};

function navigateTo(page) {
  document.querySelectorAll("[id^='pg-']").forEach(e => e.style.display = "none");

  const pg = document.getElementById("pg-" + page);
  if (pg) pg.style.display = "";

  document.querySelectorAll(".nav-item").forEach(e =>
    e.classList.toggle("active", e.dataset.page === page)
  );

  currentPage = page;

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
    "dashboard":     renderDashboard,
    "proposals":     renderProposals,
    "event-list": () => { renderEventList(); },
    "venues": () => loadVenues(),
    "pending":       renderPendingPage,
    "all-clubs":     renderAllClubs,
    "clubs":         renderClubs,
    "announcements": renderAnnouncements,
    "notif-history": renderNotifHistory,
    "feedback":      renderFeedback,
    "analytics":     () => {
      chartsInited = false;
      setTimeout(initCharts, 60);
    },
  };

  renders[page]?.();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
async function renderDashboard() {
  const pending = cachedProposals.filter(p => isPendingStatus(p.status));
  const now = new Date();

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
  cachedEvents.forEach(e => {
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
    const hasPend = evs.some(e => isPendingStatus(e.status));
    const hasAppr = evs.some(e => (e.status || "approved").toLowerCase() === "approved");

    const cls = ["cal-day", isToday ? "today" : "", hasPend ? "has-pending" : "", !hasPend && hasAppr ? "has-approved" : ""].filter(Boolean).join(" ");
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

async function loadAnnouncementBoard() {
  const ab = document.getElementById("dashAnnouncements");
  if (!ab) return;

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
  const tbody = document.getElementById("proposalsBody");
  if (!tbody) return;

  // Show loading state
  tbody.innerHTML = `<tr><td colspan="7" class="td-empty">Loading proposals…</td></tr>`;

  // FIX: always use apiFetch so the auth token is sent for both calls
  const [freshProposals, freshEvents] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/events"),
  ]);

  if (Array.isArray(freshProposals)) cachedProposals = freshProposals;
  if (Array.isArray(freshEvents))    cachedEvents    = freshEvents;

  // ── FIX: deduplication uses a source-prefixed key so proposal id=1
  //         and event id=1 are never treated as the same item
  const proposalItems = (Array.isArray(cachedProposals) ? cachedProposals : []).map(p => ({
    ...p,
    _src: "proposal",
    _key: `proposal-${p.id}`,
  }));

  // Pull pending events that aren't already covered by a proposal entry
  // FIX: DO NOT remove events based on proposal IDs
const pendingEventItems = (Array.isArray(cachedEvents) ? cachedEvents : [])
  .filter(e => isPendingStatus(e.status))
  .map(e => ({
    ...e,
    _src: "event",
    _key: `event-${e.id}`,
    organizer: e.organizer || e.created_by || "—",
  }));
  console.log("👉 ALL EVENTS:", cachedEvents.map(e => ({
  id: e.id,
  title: e.title,
  status: e.status
})));

  // Merge and deduplicate by _key (source-aware), not by raw id
  const seen = new Set();
  const merged = [];
  [...proposalItems, ...pendingEventItems].forEach(item => {
    if (seen.has(item._key)) return;
    seen.add(item._key);
    merged.push(item);
  });

  // FIX: filter uses isPendingStatus() so all backend status variants are accepted
  let list = merged.filter(p => isPendingStatus(p.status));

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

  // Debug logs — remove once confirmed working
  console.log("📋 cachedProposals raw statuses:", cachedProposals.map(p => p.status));
  console.log("📋 pendingEventItems:", pendingEventItems.length);
  console.log("📋 final list after filter:", list.length, list.map(p => ({ id: p.id, title: p.title, status: p.status })));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="td-empty">No pending proposals found.
      <br><small style="opacity:.6;">Check console for raw status values from your backend.</small>
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
        <span class="badge ${(p.status||"pending").toLowerCase()}" title="${p.remark || ""}">${cap(p.status)}</span>
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

// ── PROPOSAL DETAIL ───────────────────────────────────────────────────────
function showProposalDetail(key) {
  // key is now "proposal-{id}" or "event-{id}" (source-aware)
  const p = (window.currentProposalList || []).find(x => x._key === key);
  if (!p) { console.warn("Proposal not found for key:", key); return; }

  el("detailName")?.text(p.title || p.name || "Event Details");

  const isPending = isPendingStatus(p.status);

  const body = document.getElementById("detailBody");
  if (body) {
    body.innerHTML = `
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
            <span class="badge ${(p.status||"pending").toLowerCase()}">${cap(p.status)}</span>
            <span style="font-size:11px;color:var(--text-3);margin-left:8px;">(source: ${p._src})</span>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">Remarks</div>
            ${isPending ? `
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

  document.getElementById("proposalDetail").style.display = "";
  document.getElementById("proposalDetail").scrollIntoView({ behavior: "smooth", block: "start" });
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
// FIX: approve/reject now route to the correct endpoint based on _src
function resolveApproveEndpoint(id, src) {
  return src === "event"
    ? `/events/${id}/approve`
    : `/faculty/proposals/${id}/approve`;
}
function resolveRejectEndpoint(id, src) {
  return src === "event"
    ? `/events/${id}/reject`
    : `/faculty/proposals/${id}/reject`;
}

async function approveProposal(id, src = "proposal") {
  const res = await apiFetch(resolveApproveEndpoint(id, src), { method: "PATCH" });
  if (res !== null) {
    const p = (window.currentProposalList || []).find(x => x.id === id && x._src === src);
    if (p) p.status = "approved";
    addLocalNotif("event", "✅", "Proposal Approved", `${p?.title || "Event"} has been approved.`);
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
    if (p) p.status = "rejected";
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
    if (p) { p.status = "approved"; p.remark = remark; }
    addLocalNotif("event", "✅", "Proposal Approved", `${p?.title || "Event"} has been approved.`);
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
    if (p) { p.status = "rejected"; p.remark = remark; }
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
  if (!cachedEvents.length) {
    // FIX: use apiFetch so the auth token is always sent
    const fresh = await apiFetch("/events");
    cachedEvents = Array.isArray(fresh) ? fresh : [];
  }

  const tbody = document.getElementById("eventListBody");
  if (!tbody) return;

  // Show only approved/completed events in Event List
  let list = cachedEvents.filter(e =>
    ["approved", "completed"].includes((e.status || "").toLowerCase())
  );

  if (selectedClubId !== "all") {
    list = list.filter(matchesSelectedClub);
  }

  if (status !== "all") {
    list = list.filter(e => (e.status || "").toLowerCase() === status.toLowerCase());
  }

  if (search) {
    list = list.filter(e =>
      (e.title || "").toLowerCase().includes(search) ||
      (e.club || "").toLowerCase().includes(search)
    );
  }

  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span class="ev-name">${e.title}</span></td>
      <td>${e.club || "—"}</td>
      <td>${fmtDate(e.date || e.event_date || e.start_date)}</td>
      <td>${e.venue || "—"}</td>
      <td><span class="tag">${e.category || e.type || "General"}</span></td>
      <td>${e.capacity || "—"}</td>
      <td>${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</td>
      <td><span class="badge ${e.status || "approved"}">${cap(e.status || "approved")}</span></td>
      <td><button class="mini-btn" onclick="downloadParticipants(${e.id})">⬇️ Download</button></td>
    </tr>
  `).join("")
  : `<tr><td colspan="9" class="td-empty">No approved or completed events found.</td></tr>`;
}

// ── ALL CLUBS PAGE ────────────────────────────────────────────────────────
let allClubsData      = [];
let currentClubDetail = null;
let currentClubEvents = [];

async function renderAllClubs(search = "", category = "all") {
  const grid = document.getElementById("allClubsGrid");
  if (!grid) return;

  grid.innerHTML = `<div class="list-empty" style="padding:20px;">Loading…</div>`;

  let fresh = await apiFetch("/clubs/all");
  if (!Array.isArray(fresh) || !fresh.length) fresh = await apiFetch("/clubs");
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
    list = list.filter(c => (c.category || c.type || "").toLowerCase() === category);
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
            <div class="ac-cat">${c.category || c.type || "Club"}</div>
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
  const pending = currentClubEvents.filter(e => isPendingStatus(e.status)).length;

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
          ["Category",    club.category || club.type || "—"],
          ["Status",      club.status || "Active"],
          ["Members",     club.member_count || club.members || 0],
          ["Faculty",     club.faculty_name || club.incharge || "—"],
          ["Email",       club.email || "—"],
          ["Founded",     fmtDate(club.created_at || club.founded) || "—"],
          ["Description", club.description || "—"],
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
  if (status !== "all") list = list.filter(e => (e.status || "approved") === status);
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
  const pending = cachedProposals.filter(p => matchesSelectedClub(p) && isPendingStatus(p.status));
  el("pendProposalCount")?.text(`${pending.length} pending`);

  const pl = document.getElementById("pendingProposalList");
  if (pl) {
    pl.innerHTML = pending.length ? pending.map(p => `
      <div class="dash-item">
        <div class="dot ${isPendingStatus(p.status) ? "dot-orange" : "dot-blue"}"></div>
        <div class="di-text">
          <div class="di-title">${p.title || p.name || "Untitled"}</div>
          <div class="di-sub">${p.club || "—"} · ${fmtDate(p.date || p.event_date)}</div>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="mini-btn approve" onclick="approveProposal(${p.id}, 'proposal');renderPendingPage()">✅</button>
          <button class="mini-btn reject"  onclick="rejectProposal(${p.id}, 'proposal');renderPendingPage()">❌</button>
        </div>
      </div>
    `).join("")
    : `<div class="list-empty">All clear! 🎉</div>`;
  }
}

// ── CLUBS ─────────────────────────────────────────────────────────────────
async function renderClubs() {
  const fresh = await apiFetch("/clubs/my-clubs");
  if (fresh) cachedClubs = fresh;

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
      isPendingStatus(p.status)
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
function initCharts() {
  const filteredProposals = cachedProposals.filter(matchesSelectedClub);
  const filteredEvents = cachedEvents.filter(matchesSelectedClub);
  const filteredFeedback = cachedFeedback.filter(f => {
    if (selectedClubId === "all") return true;
    const selectedClub = getSelectedClub();
    if (!selectedClub) return false;
    const clubId   = String(selectedClub.id ?? selectedClub.club_id ?? "").trim();
    const clubName = String(selectedClub.club_name ?? selectedClub.name ?? "").trim().toLowerCase();
    const fClubId  = String(f.club_id ?? f.clubId ?? "").trim();
    const fClubName= String(f.club ?? f.club_name ?? "").trim().toLowerCase();
    return (clubId && fClubId && clubId === fClubId) || (clubName && fClubName && clubName === fClubName);
  });

  const now      = new Date();
  const approved = filteredProposals.filter(p => (p.status || "").toLowerCase() === "approved").length;
  const avgRating= filteredFeedback.length
    ? (filteredFeedback.reduce((s, f) => s + (f.rating || 0), 0) / filteredFeedback.length).toFixed(1)
    : "—";

  const kpi = document.getElementById("analyticsKpi");
  if (kpi) {
    kpi.innerHTML = [
      { k: "kv", icon: "📋", val: filteredProposals.length, label: "Total Proposals" },
      { k: "kp", icon: "✅", val: approved,                 label: "Approved Events" },
      { k: "kc", icon: "👥", val: 0,                        label: "Student Registrations" },
      { k: "kl", icon: "⭐", val: avgRating,                label: "Avg Feedback Rating" },
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
    evCounts.push(filteredEvents.filter(e => {
      const ed = parseEventDate(e.date || e.event_date || e.start_date);
      return ed && ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
    }).length);
    regCounts.push(0);
  }

  const chartDefaults = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "rgba(240,242,255,.4)", font: { weight: 600, size: 11 } } },
      y: { grid: { color: "rgba(255,255,255,.05)" }, ticks: { color: "rgba(240,242,255,.4)", font: { weight: 600, size: 11 } } },
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

 const technical = filteredEvents.filter(e =>
  ["technical","workshop","seminar","competition"].includes((e.category || e.type || "").toLowerCase())
).length;

const nonTechnical = Math.max(0, filteredEvents.length - technical);

const total = technical + nonTechnical || 1;
  tryChart("typeChart", {
    type: "doughnut",
    data: {labels: ["Technical","Non-Technical"],
    datasets: [{ data: [technical||1, nonTechnical||1] , backgroundColor: ["#8b5cf6","#ec4899"], borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: "68%" },
  });

  const leg = document.getElementById("typeChartLegend");
  if (leg) {
    leg.innerHTML = [
  {
    color: "#8b5cf6",
    label: "Technical",
    pct: Math.round((technical / total) * 100),
    cnt: technical
  },
  {
    color: "#ec4899",
    label: "Non-Technical",
    pct: Math.round((nonTechnical / total) * 100),
    cnt: nonTechnical
  }
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
  const clubNames  = selectedClub ? [selectedClub.club_name || selectedClub.name || "Club"] : cachedClubs.map(c => c.club_name || c.name || "Club");
  const clubCounts = selectedClub ? [filteredEvents.length] : cachedClubs.map(c => {
    const cId = c.id || c.club_id;
    const cName = c.club_name || c.name || "";
    return cachedEvents.filter(e =>
      String(e.club_id ?? e.clubId ?? "") === String(cId) ||
      String(e.club ?? e.club_name ?? "").trim().toLowerCase() === cName.trim().toLowerCase()
    ).length;
  });

  tryChart("clubChart", {
    type: "bar",
    data: {
      labels: clubNames.length ? clubNames : ["No clubs"],
      datasets: [{ data: clubCounts.length ? clubCounts : [0], backgroundColor: ["rgba(139,92,246,.7)","rgba(236,72,153,.7)","rgba(6,182,212,.7)","rgba(132,204,22,.7)","rgba(245,158,11,.7)"], borderRadius: 7, borderSkipped: false }],
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
async function renderAnnouncements() {
  const [mine, all] = await Promise.all([apiFetch("/announcements/my-posts"), apiFetch("/announcements/faculty")]);
  const ICONS = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣" };

  const al = document.getElementById("announceList");
  if (al) {
    const list = Array.isArray(mine) ? mine : [];
    al.innerHTML = list.length ? list.map(a => `
      <div class="announce-card">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div class="announce-title">${ICONS[a.type] || "📣"} ${a.title}</div>
          <span class="badge purple">${a.type || "General"}</span>
        </div>
        <div class="announce-meta">${fmtDate(a.created_at)}</div>
        <div class="announce-body">${a.message}</div>
      </div>
    `).join("") : `<div class="list-empty">No posts yet.</div>`;
  }

  const aal = document.getElementById("adminAnnounceList");
  if (aal) {
    const myIds = new Set((Array.isArray(mine) ? mine : []).map(a => a.id));
    const list = (Array.isArray(all) ? all : []).filter(a => !myIds.has(a.id));
    aal.innerHTML = list.length ? list.map(a => `
      <div class="announce-card">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div class="announce-title">${ICONS[a.type] || "📢"} ${a.title}</div>
          <span class="badge ${a.type === "Urgent" ? "pending" : "purple"}">${a.type || "General"}</span>
        </div>
        <div class="announce-meta">${a.club || "Admin"} · ${fmtDate(a.created_at)}</div>
        <div class="announce-body">${a.message}</div>
      </div>
    `).join("") : `<div class="list-empty">No announcements from clubs or admin.</div>`;
  }
}

async function postAnnouncement() {
  const title   = document.getElementById("announceTitle")?.value.trim();
  const message = document.getElementById("announceBody")?.value.trim();
  const type    = document.getElementById("announceType")?.value;

  if (!title || !message) { showToast("Fill in title and message.", "error"); return; }

  const res = await apiFetch("/announcements", { method: "POST", body: JSON.stringify({ title, message, type }) });
  if (res) {
    showToast("📢 Announcement posted!", "success");
    document.getElementById("announceTitle").value = "";
    document.getElementById("announceBody").value = "";
    addLocalNotif("admin", "📢", "Announcement Posted", title);
    renderAnnouncements();
  } else {
    showToast("Failed to post.", "error");
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────
async function syncNotifs() {
  const ann = await apiFetch("/announcements/faculty");
  if (!Array.isArray(ann)) return;

  const existIds = new Set(localNotifs.map(n => n.sourceId));
  const ICONS = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣" };
  let added = 0;

  ann.forEach(a => {
    const sid = `ann-${a.id}`;
    if (existIds.has(sid)) return;
    localNotifs.unshift({ id: `${Date.now()}-${Math.random()}`, sourceId: sid, type: "admin", icon: ICONS[a.type] || "📢", title: a.title, sub: `${a.club || "Admin"}: ${a.message?.slice(0, 60)}…`, time: a.created_at || new Date().toISOString(), read: false });
    added++;
  });

  cachedProposals.filter(p => isPendingStatus(p.status)).forEach(p => {
    const sid = `prop-${p.id}`;
    if (!existIds.has(sid)) {
      localNotifs.push({ id: `${Date.now()}-${Math.random()}`, sourceId: sid, type: "event", icon: "📋", title: "New Event Proposal", sub: `${p.title || "Untitled"} · ${p.club || "—"}`, time: p.created_at || new Date().toISOString(), read: false });
      added++;
    }
  });

  if (added) saveNotifs();
  updateNotifBadge();
  renderNotifDropdown();
}

function addLocalNotif(type, icon, title, sub) {
  localNotifs.unshift({ id: `${Date.now()}-${Math.random()}`, type, icon, title, sub, time: new Date().toISOString(), read: false });
  saveNotifs(); updateNotifBadge(); renderNotifDropdown();
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
      <button class="btn primary" onclick="window.location.href='account-settings.html'">⚙️ Edit Profile</button>
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
// ─────────────────────────────────────────────────────────────
// VENUES
// ─────────────────────────────────────────────────────────────

let venues = [];
let currentVenue = "";
const venueBookings = {};
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();

async function loadVenues() {
  try {
    const data = await apiFetch("/venues");

    if (Array.isArray(data)) {
      venues = data.map(v => v.name);
      currentVenue = venues[0] || "";
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
    <div class="venue-list-item ${v === currentVenue ? "active" : ""}"
         onclick="selectVenue('${v}')">
      ${v}
    </div>
  `).join("");
}

async function selectVenue(name) {
  currentVenue = name;
  renderVenueSidebar();
  await loadVenueBookings();
  renderCalendar();
}

async function loadVenueBookings() {
  if (!currentVenue) return;

  try {
    const data = await apiFetch(
      `/venues/calendar?venue_name=${encodeURIComponent(currentVenue)}&month=${currentMonth + 1}&year=${currentYear}`
    );

    venueBookings[currentVenue] = {};

    if (Array.isArray(data)) {
      data.forEach(item => {
        venueBookings[currentVenue][item.day] = (item.status || "available").toLowerCase();
      });
    }
  } catch (err) {
    console.error("Booking load error:", err);
  }
}

function renderCalendar() {
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarTitle");
  if (!grid || !title) return;

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  title.textContent = `${months[currentMonth]} ${currentYear}`;
  grid.innerHTML = "";

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const today = new Date();
  const bookings = venueBookings[currentVenue] || {};

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "venue-day-empty";
    grid.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const status = bookings[d] || "available";

    const cell = document.createElement("div");
    cell.className = `venue-day ${status}`;

    if (
      d === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    ) {
      cell.classList.add("today");
    }

    cell.innerHTML = `
      <span class="day-number">${d}</span>
      <span class="day-dot"></span>
    `;

    grid.appendChild(cell);
  }
}

// Month navigation
document.getElementById("prevMonth")?.addEventListener("click", async () => {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  await loadVenueBookings();
  renderCalendar();
});

document.getElementById("nextMonth")?.addEventListener("click", async () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  await loadVenueBookings();
  renderCalendar();
});
// ── SEARCH & FILTER ───────────────────────────────────────────────────────
function initSearchFilters() {
  document.getElementById("proposalSearch")?.addEventListener("input", debounce(e =>
    renderProposals(document.getElementById("proposalFilter")?.value, e.target.value.toLowerCase(), document.getElementById("proposalCategoryFilter")?.value)
  ));

  document.getElementById("eventListSearch")?.addEventListener("input", debounce(e =>
    renderEventList(e.target.value.toLowerCase(), document.getElementById("eventListStatus")?.value || "all")
  ));
  document.getElementById("eventListStatus")?.addEventListener("change", e =>
    renderEventList((document.getElementById("eventListSearch")?.value || "").toLowerCase(), e.target.value || "all")
  );

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
        <button onclick="localStorage.removeItem('authToken');window.location.href='fcsignin.html';" style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">Yes, Logout</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", esc); } });
}

// ── BADGES ────────────────────────────────────────────────────────────────
function updateBadges() {
  updateBadge("badge-proposals", cachedProposals.filter(p => isPendingStatus(p.status)).length);
  updateBadge("badge-pending",   cachedProposals.filter(p => isPendingStatus(p.status)).length);
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
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
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
  const sid  = String(sc.id ?? sc.club_id ?? "").trim();
  const sname= String(sc.club_name ?? sc.name ?? sc.title ?? "").trim().toLowerCase();
  const iid  = String(item.club_id ?? item.clubId ?? "").trim();
  const iname= String(item.club ?? item.club_name ?? item.clubName ?? "").trim().toLowerCase();
  return (sid && iid && iid === sid) || (sname && iname && iname === sname);
}

// ── PARTICIPANT DOWNLOAD ──────────────────────────────────────────────────
async function downloadParticipants(eventId) {
  try {
    const data = await apiFetch(`/events/${eventId}/participants`);
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

// ── START ─────────────────────────────────────────────────────────────────
boot();
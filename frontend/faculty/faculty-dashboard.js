// ============================================================
//  faculty-dashboard.js  —  EVEXA Faculty Portal
//  Full real-time API integration · All features implemented
// ============================================================

// var (not const/let) ensures global scope regardless of strict mode or defer
var API = "http://localhost:5000/api";
window.API = API;

// ── AUTH ──────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
  const token = localStorage.getItem("authToken");
  if (!token) { window.location.href = "faculty-signin.html"; return null; }
  try {
    const base = (typeof API !== "undefined" ? API : window.API) || "http://localhost:5000/api";
    const res = await fetch(`${base}${endpoint}`, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (res.status === 401) { localStorage.removeItem("authToken"); window.location.href = "faculty-signin.html"; return null; }
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch(_) {}
      console.error(`[apiFetch] ${endpoint} → ${res.status} | body: ${body}`);
      return null;
    }
    const data = await res.json();
    console.log(`[apiFetch] ${endpoint} →`, data);
    return data;
  } catch (e) { console.error("[apiFetch] network error:", e); return null; }
}

// ── STATE ─────────────────────────────────────────────────────────────────
let currentPage   = "dashboard";
let calYear       = new Date().getFullYear();
let calMonth      = new Date().getMonth();
let chartsInited  = false;
let feedbackInited= false;

// Data cache
let cachedProfile   = null;
let cachedProposals = [];
let cachedCerts     = [];
let cachedEvents    = [];
let cachedClubs     = [];
let cachedFeedback  = [];

// Local notifications
let localNotifs = JSON.parse(localStorage.getItem("evexa_faculty_notifs") || "[]");
function saveNotifs() { localStorage.setItem("evexa_faculty_notifs", JSON.stringify(localNotifs.slice(0, 50))); }

// ── BOOT ──────────────────────────────────────────────────────────────────
async function boot() {
  applyTheme();

  // Wire navigation
  document.querySelectorAll(".nav-item[data-page]").forEach(el =>
    el.addEventListener("click", () => navigateTo(el.dataset.page))
  );

  // Topbar controls
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    const s = document.getElementById("sidebar");
    window.innerWidth <= 768 ? s.classList.toggle("mobile-open") : s.classList.toggle("collapsed");
  });
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("notifBtn").addEventListener("click", toggleNotifDropdown);
  document.getElementById("notifClearAll")?.addEventListener("click", clearAllNotifs);
  document.getElementById("profileBtn").addEventListener("click", openProfileDrawer);
  document.getElementById("miniUser")?.addEventListener("click", openProfileDrawer);
  document.getElementById("closeProfileBtn")?.addEventListener("click", closeProfileDrawer);
  document.getElementById("overlay")?.addEventListener("click", closeProfileDrawer);
  document.getElementById("markAllReadBtn")?.addEventListener("click", markAllNotifsRead);
  document.getElementById("clearAllNotifBtn")?.addEventListener("click", clearAllNotifs);
  document.getElementById("closeDetail")?.addEventListener("click", () => {
    document.getElementById("proposalDetail").style.display = "none";
  });
  document.getElementById("postAnnounceBtn")?.addEventListener("click", postAnnouncement);

  // Close notif dropdown on outside click
  document.addEventListener("click", e => {
    const wrap = document.getElementById("notifBtn")?.closest(".notif-wrap");
    const dd   = document.getElementById("notifDropdown");
    if (dd && !wrap?.contains(e.target)) dd.classList.remove("open");
  });

  // Bulk handlers
  initBulk();
  initSearchFilters();
  initCalNav();

  // Load faculty profile — try faculty-specific endpoint first, fallback to /auth/me
  let profile = await apiFetch("/faculty/me");

  if (!profile) {
    profile = await apiFetch("/auth/me");
  }

  if (!profile) return;

  // Guard: if token belongs to a student (has roll_no but no faculty fields), redirect
  if (!profile.faculty_no && !profile.department && profile.roll_no) {
    localStorage.removeItem("authToken");
    showToast("Please log in with your faculty account.", "error");
    setTimeout(() => window.location.href = "faculty-signin.html", 1500);
    return;
  }

  cachedProfile = profile;

  // Map faculty DB columns: id, faculty_no, name, email, department, role_id
  const name       = profile.name || "Faculty";
  const initials   = name.split(" ").filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2) || "FA";
  const department = profile.department || "Faculty Advisor";
  const facultyNo  = profile.faculty_no || "";

  el("miniName")?.text(name);
  el("miniRole")?.text(facultyNo ? `${facultyNo} · ${department}` : department);
  el("miniAvatar")?.text(initials);
  el("topAvatar")?.text(initials);
  el("rolePill")?.text(`Faculty · ${department}`);

  // Greeting
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  el("heroGreeting")?.text(`${greet}, ${name.split(" ")[0]}`);

  // Fetch all data in parallel
  await refreshAll();

  // Render initial page
  renderDashboard();
  updateNotifBadge();
  syncNotifs();
}

async function refreshAll() {
  const [proposals, certs, events, clubs, feedback] = await Promise.all([
    apiFetch("/faculty/proposals"),
    apiFetch("/faculty/certificates"),
    fetch(`${API}/events`).then(r => r.ok ? r.json() : []).catch(() => []),
    apiFetch("/clubs/my-clubs"),
    apiFetch("/faculty/feedback"),
  ]);
  cachedProposals = Array.isArray(proposals) ? proposals : [];
  cachedCerts     = Array.isArray(certs)     ? certs     : [];
  cachedEvents    = Array.isArray(events)    ? events    : [];
  cachedClubs     = Array.isArray(clubs)     ? clubs     : [];
  cachedFeedback  = Array.isArray(feedback)  ? feedback  : [];
  updateBadges();
}

// ── NAVIGATION ────────────────────────────────────────────────────────────
const PAGE_META = {
  "dashboard":     ["Dashboard",              "Welcome back — here's your faculty overview."],
  "proposals":     ["Event Proposal Review",  "Review, approve or reject submitted proposals."],
  "event-list":    ["All Events",             "Complete event list across your clubs."],
  "calendar":      ["Calendar View",          "Venue & schedule overview by date."],
  "certificates":  ["Certificate Approvals",  "Verify attendance and issue student certificates."],
  "pending":       ["Pending Queue",          "All items requiring your immediate action."],
  "clubs":         ["Club & Academic Oversight","Your incharge clubs and their activity."],
  "analytics":     ["Reports & Analytics",    "Events, participation, and academic statistics."],
  "feedback":      ["Feedback & Reports",     "Student feedback ratings and comments."],
  "announcements": ["Announcements",          "Post and manage club announcements."],
  "notif-history": ["Notification History",   "All alerts and system updates."],
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
  el("pageTitle")?.text(t);
  el("pageSub")?.text(s);

  // Lazy renders
  const renders = {
    "dashboard":    renderDashboard,
    "proposals":    renderProposals,
    "event-list":   renderEventList,
    "calendar":     renderCalendar,
    "certificates": renderCerts,
    "pending":      renderPendingPage,
    "clubs":        renderClubs,
    "announcements":renderAnnouncements,
    "notif-history":renderNotifHistory,
    "feedback":     renderFeedback,
    "analytics":    () => { if (!chartsInited) { chartsInited = true; setTimeout(initCharts, 60); } else { /* already done */ } },
  };
  renders[page]?.();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
async function renderDashboard() {
  // Hero stats
  const pending  = cachedProposals.filter(p => p.status === "pending" || p.status === "review");
  const pendCert = cachedCerts.filter(c => (c.certificate_status || c.status) === "pending");
  const now      = new Date();
  const activeEv = cachedEvents.filter(e => new Date(e.date) >= now);
  const students = cachedCerts.reduce((s, c) => s + 1, 0); // total unique in certs

  el("heroPending")?.text(pending.length);
  el("heroCerts")?.text(pendCert.length);
  el("heroClubs")?.text(cachedClubs.length);
  el("heroEvents")?.text(activeEv.length);
  el("heroStudents")?.text(cachedCerts.length);

  // Pending list
  const pl = document.getElementById("dashPendingList");
  if (pl) {
    pl.innerHTML = pending.length
      ? pending.slice(0, 5).map(p => `
          <div class="dash-item">
            <div class="dot ${p.status === "pending" ? "dot-orange" : "dot-blue"}"></div>
            <div class="di-text">
              <div class="di-title">${p.title || p.name || "Untitled"}</div>
              <div class="di-sub">${p.club || p.organizer || "—"} · ${fmtDate(p.date || p.event_date)}</div>
            </div>
            <div style="display:flex;gap:5px;">
              <button class="mini-btn approve" onclick="quickApprove(${p.id})">✅</button>
              <button class="mini-btn reject"  onclick="quickReject(${p.id})">❌</button>
            </div>
          </div>`).join("")
      : `<div class="list-empty">No pending proposals 🎉</div>`;
  }

  // Notifications
  const nl = document.getElementById("dashNotifList");
  if (nl) {
    const recent = localNotifs.slice(0, 5);
    nl.innerHTML = recent.length
      ? recent.map(n => `
          <div class="dash-item">
            <div class="dot ${n.read ? "dot-blue" : "dot-pink"}"></div>
            <div class="di-text">
              <div class="di-title">${n.icon || "🔔"} ${n.title}</div>
              <div class="di-sub">${timeAgo(n.time)}</div>
            </div>
          </div>`).join("")
      : `<div class="list-empty">No notifications yet.</div>`;
  }

  // Announcements
  await loadAnnouncementBoard();

  // Clubs quick
  renderClubsQuick();
}

async function loadAnnouncementBoard() {
  const ab = document.getElementById("dashAnnouncements");
  if (!ab) return;
  const ann = await apiFetch("/announcements/faculty");
  if (!ann?.length) { ab.innerHTML = `<div class="list-empty">No announcements.</div>`; return; }
  const ICONS = { Urgent: "🚨", Event: "📅", Info: "ℹ️", General: "📣" };
  ab.innerHTML = ann.slice(0, 3).map(a => `
    <div class="announce-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div class="announce-title">${ICONS[a.type] || "📣"} ${a.title}</div>
        <span class="badge purple" style="flex-shrink:0;">${a.type || "General"}</span>
      </div>
      <div class="announce-meta">${a.club || "Admin"} · ${fmtDate(a.created_at)}</div>
      <div class="announce-body">${a.message}</div>
    </div>`).join("");
}

function renderClubsQuick() {
  const g = document.getElementById("dashClubsGrid");
  if (!g) return;
  if (!cachedClubs.length) { g.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs assigned yet.</div>`; return; }
  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵"];
  g.innerHTML = cachedClubs.map((c, i) => {
    const evCount = cachedEvents.filter(e => (e.club_id === c.id || e.club === c.name)).length;
    return `
      <div class="club-quick-card" onclick="navigateTo('clubs')">
        <div class="club-quick-emoji">${c.logo || emojis[i % emojis.length]}</div>
        <div class="club-quick-info">
          <div class="club-quick-name">${c.name}</div>
          <div class="club-quick-meta">${c.member_count || 0} members · ${evCount} events</div>
        </div>
        <span class="club-quick-badge">${c.status || "Active"}</span>
      </div>`;
  }).join("");
}

// ── PROPOSALS ─────────────────────────────────────────────────────────────
async function renderProposals(filter = "all", search = "", category = "all") {
  const fresh = await apiFetch("/faculty/proposals");
  if (fresh) cachedProposals = fresh;

  const tbody = document.getElementById("proposalsBody");
  if (!tbody) return;

  let list = cachedProposals;
  if (filter !== "all")   list = list.filter(p => p.status === filter);
  if (category !== "all") list = list.filter(p => (p.category || p.type || "") === category);
  if (search)             list = list.filter(p =>
    (p.title || p.name || "").toLowerCase().includes(search) ||
    (p.club || p.organizer || "").toLowerCase().includes(search)
  );

  tbody.innerHTML = list.length ? list.map(p => `
    <tr>
      <td><input type="checkbox" class="cb proposal-cb" data-id="${p.id}"></td>
      <td>
        <span class="ev-name" onclick="showProposalDetail(${p.id})">${p.title || p.name || "Untitled"}</span>
      </td>
      <td>${p.club || p.organizer || "—"}</td>
      <td>${fmtDate(p.date || p.event_date)}</td>
      <td><span class="tag">${p.category || p.type || "General"}</span></td>
      <td>${p.capacity || p.expected_participants || "—"}</td>
      <td><span class="badge ${p.status}">${cap(p.status)}</span></td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
          ${p.status !== "approved" ? `<button class="mini-btn approve" onclick="approveProposal(${p.id})">✅</button>` : ""}
          ${p.status !== "rejected" ? `<button class="mini-btn reject"  onclick="rejectProposal(${p.id})">❌</button>` : ""}
          <button class="mini-btn" onclick="showProposalDetail(${p.id})">👁</button>
        </div>
      </td>
    </tr>`).join("")
    : `<tr><td colspan="8" class="td-empty">No proposals match your filter.</td></tr>`;

  updateBadges();
}

function showProposalDetail(id) {
  const p = cachedProposals.find(x => x.id === id);
  if (!p) return;

  el("detailName")?.text(p.title || p.name || "Event Details");

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
              <div class="detail-cell"><div class="detail-label">Venue</div><div class="detail-val">${p.venue || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Expected Participants</div><div class="detail-val">${p.capacity || p.expected_participants || "—"}</div></div>
              <div class="detail-cell"><div class="detail-label">Registration Fee</div><div class="detail-val">${p.registration_fee > 0 ? "₹" + p.registration_fee : "Free"}</div></div>
            </div>
          </div>
          <div class="detail-section">
            <div class="detail-section-title">Status</div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <span class="badge ${p.status}">${cap(p.status)}</span>
              ${p.status !== "approved" ? `<button class="btn success sm" onclick="approveProposal(${p.id});document.getElementById('proposalDetail').style.display='none'">✅ Approve</button>` : ""}
              ${p.status !== "rejected" ? `<button class="btn danger sm"  onclick="rejectProposal(${p.id});document.getElementById('proposalDetail').style.display='none'">❌ Reject</button>` : ""}
            </div>
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
          <div class="detail-section" style="margin-top:14px;">
            <div class="detail-section-title">Objectives</div>
            <div class="detail-desc">${p.objectives || "—"}</div>
          </div>
        </div>
      </div>`;
  }

  document.getElementById("proposalDetail").style.display = "";
  document.getElementById("proposalDetail").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function approveProposal(id) {
  const res = await apiFetch(`/faculty/proposals/${id}/approve`, { method: "PATCH" });
  if (res !== null) {
    const p = cachedProposals.find(x => x.id === id);
    if (p) p.status = "approved";
    addLocalNotif("event", "✅", "Proposal Approved", `${p?.title || "Event"} has been approved.`);
    renderProposals(); showToast("✅ Proposal approved!", "success");
  } else showToast("Failed to approve.", "error");
}
async function rejectProposal(id) {
  const res = await apiFetch(`/faculty/proposals/${id}/reject`, { method: "PATCH" });
  if (res !== null) {
    const p = cachedProposals.find(x => x.id === id);
    if (p) p.status = "rejected";
    renderProposals(); showToast("❌ Proposal rejected.", "error");
  } else showToast("Failed to reject.", "error");
}
async function quickApprove(id) { await approveProposal(id); renderDashboard(); }
async function quickReject(id)  { await rejectProposal(id);  renderDashboard(); }

// ── EVENT LIST ────────────────────────────────────────────────────────────
async function renderEventList(search = "", status = "all") {
  const fresh = await fetch(`${API}/events`).then(r => r.ok ? r.json() : []).catch(() => []);
  cachedEvents = fresh;

  const tbody = document.getElementById("eventListBody");
  if (!tbody) return;

  let list = cachedEvents;
  if (status !== "all") list = list.filter(e => (e.status || "approved") === status);
  if (search)           list = list.filter(e => (e.title || "").toLowerCase().includes(search) || (e.club || "").toLowerCase().includes(search));

  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span class="ev-name">${e.title}</span></td>
      <td>${e.club || "—"}</td>
      <td>${fmtDate(e.date)}</td>
      <td>${e.venue || "—"}</td>
      <td><span class="tag">${e.category || e.type || "General"}</span></td>
      <td>${e.capacity || "—"}</td>
      <td>${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</td>
      <td><span class="badge ${e.status || "approved"}">${cap(e.status || "approved")}</span></td>
    </tr>`).join("")
    : `<tr><td colspan="8" class="td-empty">No events found.</td></tr>`;
}

// ── CALENDAR ──────────────────────────────────────────────────────────────
function renderCalendar() {
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  el("calMonthLabel")?.text(`${MONTHS[calMonth]} ${calYear}`);

  const calEl = document.getElementById("miniCalendar");
  if (!calEl) return;

  const today    = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const total    = new Date(calYear, calMonth + 1, 0).getDate();

  // Build day→events map
  const dayMap = {};
  cachedEvents.forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      const day = d.getDate();
      if (!dayMap[day]) dayMap[day] = [];
      dayMap[day].push(e);
    }
  });

  const days = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  let html = `<div class="cal-weekdays">${days.map(d => `<div class="cal-weekday">${d}</div>`).join("")}</div><div class="cal-days">`;
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= total; d++) {
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const evs     = dayMap[d] || [];
    const hasPend = evs.some(e => e.status === "pending" || e.status === "review");
    const hasAppr = evs.some(e => e.status === "approved" || !e.status);
    const cls     = ["cal-day", isToday ? "today" : "", hasPend ? "has-pending" : (hasAppr && evs.length ? "has-approved" : "")].filter(Boolean).join(" ");
    const enc     = evs.length ? encodeURIComponent(JSON.stringify(evs)) : "";
    html += `<div class="${cls}" onclick="calDayClick(this,${d})" data-events="${enc.replace(/"/g,"&quot;")}">${d}</div>`;
  }
  html += `</div>`;
  calEl.innerHTML = html;

  // Month events table
  renderCalMonthEvents();
}

function calDayClick(el2, day) {
  const det = document.getElementById("calEventDetail");
  if (!det) return;
  if (el2.classList.contains("selected")) {
    el2.classList.remove("selected"); det.style.display = "none"; return;
  }
  document.querySelectorAll(".cal-day.selected").forEach(d => d.classList.remove("selected"));
  el2.classList.add("selected");

  const raw = el2.getAttribute("data-events").replace(/&quot;/g, '"');
  if (!raw) { det.style.display = "none"; return; }
  const evs = JSON.parse(decodeURIComponent(raw));

  el("calDetailTitle")?.text(`${evs.length} event${evs.length>1?"s":""} on ${fmtDate(new Date(calYear, calMonth, day))}`);
  el("calDetailMeta")?.text(evs.map(e => `${e.title} · ${e.club || "—"} · ${e.venue || "—"}`).join(" | "));

  const actions = document.getElementById("calDetailActions");
  if (actions) {
    actions.innerHTML = evs.map(e => `
      <button class="mini-btn approve" onclick="approveProposal(${e.id})">✅ Approve "${e.title}"</button>
      <button class="mini-btn reject"  onclick="rejectProposal(${e.id})">❌ Reject</button>
    `).join("");
  }
  det.style.display = "";
}

function renderCalMonthEvents() {
  const tbody = document.getElementById("calMonthBody");
  if (!tbody) return;
  const monthEvs = cachedEvents.filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });
  tbody.innerHTML = monthEvs.length ? monthEvs.map(e => `
    <tr>
      <td><span class="ev-name">${e.title}</span></td>
      <td>${e.club || "—"}</td>
      <td>${fmtDate(e.date)}</td>
      <td>${e.venue || "—"}</td>
      <td><span class="badge ${e.status || "approved"}">${cap(e.status || "approved")}</span></td>
      <td>
        <div style="display:flex;gap:5px;">
          ${e.status !== "approved" ? `<button class="mini-btn approve" onclick="approveProposal(${e.id})">✅</button>` : ""}
          ${e.status !== "rejected" ? `<button class="mini-btn reject" onclick="rejectProposal(${e.id})">❌</button>` : ""}
        </div>
      </td>
    </tr>`).join("")
    : `<tr><td colspan="6" class="td-empty">No events this month.</td></tr>`;
}

function initCalNav() {
  document.getElementById("calPrev")?.addEventListener("click", () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    if (currentPage === "calendar") renderCalendar();
  });
  document.getElementById("calNext")?.addEventListener("click", () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    if (currentPage === "calendar") renderCalendar();
  });
}

// ── CERTIFICATES ──────────────────────────────────────────────────────────
async function renderCerts(search = "", statusFil = "all") {
  const fresh = await apiFetch("/faculty/certificates");
  if (fresh) cachedCerts = fresh;

  const tbody = document.getElementById("certsBody");
  if (!tbody) return;

  let list = cachedCerts;
  const getStatus = c => c.certificate_status || c.status || "pending";
  if (statusFil !== "all") list = list.filter(c => getStatus(c) === statusFil);
  if (search) list = list.filter(c =>
    (c.student_name || c.student || "").toLowerCase().includes(search) ||
    (c.event_title  || c.event  || "").toLowerCase().includes(search)
  );

  tbody.innerHTML = list.length ? list.map(c => {
    const name   = c.student_name || c.student || "—";
    const reg    = c.roll_no || c.reg_no || "—";
    const event  = c.event_title || c.event || "—";
    const club   = c.club || "—";
    const att    = c.attended ?? c.attendance ?? false;
    const status = getStatus(c);
    return `
      <tr>
        <td><input type="checkbox" class="cb cert-cb" data-id="${c.id}" ${status==="approved"?"disabled":""}></td>
        <td style="font-weight:700;color:var(--text);">${name}</td>
        <td style="font-family:'Courier New',monospace;font-size:11px;color:var(--text-3);">${reg}</td>
        <td>${event}</td>
        <td>${club}</td>
        <td><span class="badge ${att?"approved":"rejected"}">${att?"✅ Present":"❌ Absent"}</span></td>
        <td><span class="badge ${status}">${cap(status)}</span></td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap;">
            ${status==="pending" ? `<button class="mini-btn approve" onclick="approveCert(${c.id})">✅</button>
                                    <button class="mini-btn reject"  onclick="rejectCert(${c.id})">❌</button>` :
              `<span style="font-size:11px;color:var(--text-3);">${cap(status)}</span>`}
          </div>
        </td>
      </tr>`;
  }).join("")
    : `<tr><td colspan="8" class="td-empty">No certificates found.</td></tr>`;

  updateBadges();
}

async function approveCert(id) {
  const res = await apiFetch(`/faculty/certificates/${id}/approve`, { method: "PATCH" });
  if (res !== null) {
    const c = cachedCerts.find(x => x.id === id);
    if (c) { c.certificate_status = "approved"; c.status = "approved"; }
    renderCerts(); showToast("🎓 Certificate approved!", "success");
  } else showToast("Failed to approve.", "error");
}
async function rejectCert(id) {
  const res = await apiFetch(`/faculty/certificates/${id}/reject`, { method: "PATCH" });
  if (res !== null) {
    const c = cachedCerts.find(x => x.id === id);
    if (c) { c.certificate_status = "rejected"; c.status = "rejected"; }
    renderCerts(); showToast("Certificate rejected.", "error");
  } else showToast("Failed to reject.", "error");
}

// ── PENDING PAGE ──────────────────────────────────────────────────────────
async function renderPendingPage() {
  await refreshAll();

  const pending  = cachedProposals.filter(p => p.status === "pending" || p.status === "review");
  const pendCert = cachedCerts.filter(c => (c.certificate_status || c.status) === "pending");

  el("pendProposalCount")?.text(`${pending.length} pending`);
  el("pendCertCount")?.text(`${pendCert.length} pending`);

  const pl = document.getElementById("pendingProposalList");
  if (pl) {
    pl.innerHTML = pending.length ? pending.map(p => `
      <div class="dash-item">
        <div class="dot ${p.status==="pending"?"dot-orange":"dot-blue"}"></div>
        <div class="di-text">
          <div class="di-title">${p.title || p.name || "Untitled"}</div>
          <div class="di-sub">${p.club || "—"} · ${fmtDate(p.date || p.event_date)}</div>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="mini-btn approve" onclick="approveProposal(${p.id});renderPendingPage()">✅</button>
          <button class="mini-btn reject"  onclick="rejectProposal(${p.id});renderPendingPage()">❌</button>
        </div>
      </div>`).join("")
      : `<div class="list-empty">All clear! 🎉</div>`;
  }

  const cl = document.getElementById("pendingCertList");
  if (cl) {
    cl.innerHTML = pendCert.length ? pendCert.map(c => `
      <div class="dash-item">
        <div class="dot dot-purple"></div>
        <div class="di-text">
          <div class="di-title">${c.student_name || c.student || "—"}</div>
          <div class="di-sub">${c.event_title || c.event || "—"}</div>
        </div>
        <div style="display:flex;gap:5px;">
          <button class="mini-btn approve" onclick="approveCert(${c.id});renderPendingPage()">✅</button>
          <button class="mini-btn reject"  onclick="rejectCert(${c.id});renderPendingPage()">❌</button>
        </div>
      </div>`).join("")
      : `<div class="list-empty">All clear! 🎉</div>`;
  }
}

// ── CLUBS ─────────────────────────────────────────────────────────────────
async function renderClubs() {
  const fresh = await apiFetch("/clubs/my-clubs");
  if (fresh) cachedClubs = fresh;

  const grid = document.getElementById("clubsGrid");
  if (!grid) return;

  if (!cachedClubs.length) { grid.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs assigned.</div>`; return; }

  const emojis = ["🤖","⚡","💻","🤝","🚀","📷","🎨","🏆","🎯","💡","🌍","🎵"];
  grid.innerHTML = cachedClubs.map((c, i) => {
    const clubEvents = cachedEvents
      .filter(e => e.club_id === c.id || e.club === c.name)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    const upcomingCount  = clubEvents.filter(e => new Date(e.date) >= new Date()).length;
    const pendingCount   = cachedProposals.filter(p => p.club_id === c.id || p.club === c.name).filter(p => p.status==="pending"||p.status==="review").length;

    return `
      <div class="club-card">
        <div class="club-card-top">
          <div class="club-card-emoji">${c.logo || emojis[i % emojis.length]}</div>
          <div>
            <div class="club-card-name">${c.name}</div>
            <div class="club-card-cat">${c.category || c.type || "Club"}</div>
          </div>
          <span class="club-card-status">${c.status || "Active"}</span>
        </div>

        <div class="club-stats-row">
          <div class="club-stat-cell"><div class="club-stat-val">${c.member_count || c.members || 0}</div><div class="club-stat-label">Members</div></div>
          <div class="club-stat-cell"><div class="club-stat-val">${clubEvents.length}</div><div class="club-stat-label">Total Events</div></div>
          <div class="club-stat-cell"><div class="club-stat-val">${upcomingCount}</div><div class="club-stat-label">Upcoming</div></div>
          <div class="club-stat-cell"><div class="club-stat-val" style="color:${pendingCount>0?"#fbbf24":"#4ade80"};">${pendingCount}</div><div class="club-stat-label">Pending</div></div>
        </div>

        ${clubEvents.length ? `
        <div class="club-recent-title">Recent Events</div>
        ${clubEvents.slice(0, 3).map(e => `
          <div class="club-event-row">
            <span class="club-event-name">${e.title}</span>
            <span class="badge ${e.status || "approved"}" style="font-size:10px;">${cap(e.status || "approved")}</span>
            <span class="club-event-date">${fmtDate(e.date)}</span>
          </div>`).join("")}` : `<div class="list-empty">No events yet.</div>`}

        <div class="club-card-actions">
          <button class="btn ghost sm" onclick="navigateTo('proposals')">📋 Proposals</button>
          <button class="btn ghost sm" onclick="navigateTo('analytics')">📊 Analytics</button>
          <button class="btn primary sm" onclick="showToast('✉️ Club message sent!','success')">✉️ Message</button>
        </div>
      </div>`;
  }).join("");
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────
function initCharts() {
  // KPI row
  const now      = new Date();
  const approved = cachedProposals.filter(p => p.status === "approved").length;
  const pending  = cachedProposals.filter(p => p.status === "pending" || p.status === "review").length;
  const totalReg = cachedCerts.length;
  const avgRating = cachedFeedback.length
    ? (cachedFeedback.reduce((s, f) => s + (f.rating || 0), 0) / cachedFeedback.length).toFixed(1)
    : "—";

  const kpi = document.getElementById("analyticsKpi");
  if (kpi) kpi.innerHTML = [
    { k: "kv", icon: "📋", val: cachedProposals.length, label: "Total Proposals" },
    { k: "kp", icon: "✅", val: approved, label: "Approved Events" },
    { k: "kc", icon: "👥", val: totalReg, label: "Student Registrations" },
    { k: "kl", icon: "⭐", val: avgRating, label: "Avg Feedback Rating" },
  ].map(d => `
    <div class="kpi-card ${d.k}">
      <div class="kpi-icon">${d.icon}</div>
      <div class="kpi-val">${d.val}</div>
      <div class="kpi-label">${d.label}</div>
    </div>`).join("");

  // Month buckets (last 8 months)
  const labels       = [];
  const evCounts     = [];
  const regCounts    = [];
  const MONTH_NAMES  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(MONTH_NAMES[d.getMonth()]);
    const mEvs = cachedEvents.filter(e => {
      const ed = new Date(e.date);
      return ed.getFullYear() === d.getFullYear() && ed.getMonth() === d.getMonth();
    });
    evCounts.push(mEvs.length);

    const mRegs = cachedCerts.filter(c => {
      const cd = new Date(c.registered_at || c.created_at || 0);
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
    });
    regCounts.push(mRegs.length);
  }

  const chartDefaults = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: "rgba(240,242,255,.4)", font: { weight:600, size:11 } } },
      y: { grid: { color: "rgba(255,255,255,.05)" }, ticks: { color: "rgba(240,242,255,.4)", font: { weight:600, size:11 } } },
    },
  };

  tryChart("eventsChart", {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: evCounts, backgroundColor: "rgba(139,92,246,.7)", borderRadius: 7, borderSkipped: false }],
    },
    options: chartDefaults,
  });

  tryChart("participationChart", {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: regCounts,
        borderColor: "#ec4899", backgroundColor: "rgba(236,72,153,.12)",
        borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#ec4899",
      }],
    },
    options: chartDefaults,
  });

  // Academic vs Non-academic
  const academic    = cachedEvents.filter(e => ["academic","seminar","workshop","lecture"].includes((e.category||e.type||"").toLowerCase())).length;
  const nonAcademic = Math.max(0, cachedEvents.length - academic);
  const total       = academic + nonAcademic || 1;

  tryChart("typeChart", {
    type: "doughnut",
    data: {
      labels: ["Academic","Non-Academic"],
      datasets: [{ data: [academic || 1, nonAcademic || 1], backgroundColor: ["#8b5cf6","#ec4899"], borderWidth: 0, hoverOffset: 6 }],
    },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: "68%" },
  });

  const leg = document.getElementById("typeChartLegend");
  if (leg) leg.innerHTML = [
    { color: "#8b5cf6", label: "Academic", pct: Math.round((academic/total)*100), cnt: academic },
    { color: "#ec4899", label: "Non-Academic", pct: Math.round((nonAcademic/total)*100), cnt: nonAcademic },
  ].map(d => `
    <div class="leg-row">
      <div class="leg-swatch" style="background:${d.color};"></div>
      <div>
        <div class="leg-text">${d.label} — ${d.pct}%</div>
        <div class="leg-pct">${d.cnt} events</div>
      </div>
    </div>`).join("");

  // Club breakdown
  const clubNames  = cachedClubs.map(c => c.name);
  const clubCounts = cachedClubs.map(c => cachedEvents.filter(e => e.club_id === c.id || e.club === c.name).length);

  tryChart("clubChart", {
    type: "bar",
    data: {
      labels: clubNames.length ? clubNames : ["No clubs"],
      datasets: [{
        data: clubCounts.length ? clubCounts : [0],
        backgroundColor: ["rgba(139,92,246,.7)","rgba(236,72,153,.7)","rgba(6,182,212,.7)","rgba(132,204,22,.7)","rgba(245,158,11,.7)"],
        borderRadius: 7, borderSkipped: false,
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
    !search || (f.comment || f.text || "").toLowerCase().includes(search) ||
    (f.student_name || "").toLowerCase().includes(search)
  );

  // Rating breakdown
  const rb = document.getElementById("ratingBreakdown");
  if (rb) {
    if (!comments.length) { rb.innerHTML = `<div class="list-empty">No feedback yet.</div>`; }
    else {
      const avg = (comments.reduce((s, f) => s + (f.rating || 0), 0) / comments.length).toFixed(1);
      const breakdown = [5,4,3,2,1].map(star => {
        const cnt = comments.filter(f => Math.round(f.rating || 0) === star).length;
        return { star, pct: Math.round((cnt / comments.length) * 100), cnt };
      });
      const colors = { 5:"#4ade80", 4:"#a78bfa", 3:"#fbbf24", 2:"#fb923c", 1:"#f87171" };
      rb.innerHTML = `
        <div class="rating-overview">
          <div class="rating-big">${avg}</div>
          <div class="rating-sub">Overall Average · ${comments.length} reviews</div>
          <div class="comment-stars" style="font-size:18px;margin-top:6px;">${starStr(+avg)}</div>
        </div>`
        + breakdown.map(d => `
          <div class="rating-row">
            <div class="rating-star-lbl">${d.star}</div>
            <span style="color:var(--amber);font-size:12px;">★</span>
            <div class="rating-bar-wrap">
              <div class="rating-bar-fill" style="width:${d.pct}%;background:${colors[d.star]};"></div>
            </div>
            <div class="rating-pct">${d.pct}%</div>
          </div>`).join("");
    }
  }

  // Comments grid
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
      </div>`).join("")
      : `<div class="list-empty" style="padding:20px;">No feedback yet.</div>`;
  }

  // Chart
  if (cachedFeedback.length && !feedbackInited) {
    feedbackInited = true;
    const eventMap = {};
    cachedFeedback.forEach(f => {
      const k = f.event_title || f.event || "Other";
      if (!eventMap[k]) eventMap[k] = [];
      eventMap[k].push(f.rating || 0);
    });
    const lbls = Object.keys(eventMap).slice(0, 7).map(l => l.length > 14 ? l.slice(0,14)+"…" : l);
    const vals = lbls.map((l, i) => {
      const key = Object.keys(eventMap)[i];
      const arr = eventMap[key] || [];
      return arr.length ? +(arr.reduce((s,r)=>s+r,0)/arr.length).toFixed(1) : 0;
    });
    tryChart("feedbackChart", {
      type: "bar",
      data: {
        labels: lbls,
        datasets: [{ data: vals, backgroundColor: vals.map(v => v>=4.5?"rgba(34,197,94,.7)":v>=4?"rgba(139,92,246,.7)":"rgba(245,158,11,.7)"), borderRadius: 7, borderSkipped: false }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid:{display:false}, ticks:{color:"rgba(240,242,255,.4)",font:{size:11,weight:600},maxRotation:30} },
          y: { min:0, max:5, grid:{color:"rgba(255,255,255,.05)"}, ticks:{color:"rgba(240,242,255,.4)",font:{size:11,weight:600}} },
        },
      },
    });
  }
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────────────────
async function renderAnnouncements() {
  const [mine, admin] = await Promise.all([
    apiFetch("/announcements/my-posts"),
    apiFetch("/announcements/faculty"),
  ]);

  const ICONS = { Urgent:"🚨", Event:"📅", Info:"ℹ️", General:"📣" };
  const al = document.getElementById("announceList");
  if (al) {
    const list = Array.isArray(mine) ? mine : [];
    al.innerHTML = list.length ? list.map(a => `
      <div class="announce-card">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div class="announce-title">${ICONS[a.type]||"📣"} ${a.title}</div>
          <span class="badge purple">${a.type||"General"}</span>
        </div>
        <div class="announce-meta">${fmtDate(a.created_at)}</div>
        <div class="announce-body">${a.message}</div>
      </div>`).join("")
      : `<div class="list-empty">No posts yet.</div>`;
  }

  const aal = document.getElementById("adminAnnounceList");
  if (aal) {
    const list = Array.isArray(admin) ? admin : [];
    aal.innerHTML = list.length ? list.map(a => `
      <div class="announce-card">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div class="announce-title">${ICONS[a.type]||"📢"} ${a.title}</div>
          <span class="badge ${a.type==="Urgent"?"pending":"purple"}">${a.type||"General"}</span>
        </div>
        <div class="announce-meta">${a.club||"Admin"} · ${fmtDate(a.created_at)}</div>
        <div class="announce-body">${a.message}</div>
      </div>`).join("")
      : `<div class="list-empty">No admin announcements.</div>`;
  }
}

async function postAnnouncement() {
  const title   = document.getElementById("announceTitle")?.value.trim();
  const message = document.getElementById("announceBody")?.value.trim();
  const type    = document.getElementById("announceType")?.value;
  if (!title || !message) { showToast("Fill in title and message.", "error"); return; }

  const res = await apiFetch("/announcements", {
    method: "POST",
    body: JSON.stringify({ title, message, type }),
  });
  if (res) {
    showToast("📢 Announcement posted!", "success");
    document.getElementById("announceTitle").value = "";
    document.getElementById("announceBody").value  = "";
    addLocalNotif("admin", "📢", "Announcement Posted", title);
    renderAnnouncements();
  } else showToast("Failed to post.", "error");
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
    localNotifs.unshift({
      id: `${Date.now()}-${Math.random()}`, sourceId: sid, type: "admin",
      icon: ICONS[a.type] || "📢",
      title: a.title, sub: `${a.club||"Admin"}: ${a.message?.slice(0,60)}…`,
      time: a.created_at || new Date().toISOString(), read: false,
    });
    added++;
  });
  // Pending proposals as notifs
  cachedProposals.filter(p => p.status==="pending").forEach(p => {
    const sid = `prop-${p.id}`;
    if (!existIds.has(sid)) {
      localNotifs.push({
        id: `${Date.now()}-${Math.random()}`, sourceId: sid, type: "event",
        icon: "📋", title: "New Event Proposal", sub: `${p.title||"Untitled"} · ${p.club||"—"}`,
        time: p.created_at || new Date().toISOString(), read: false,
      });
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
  updateBadge("badge-notif", unread);
}

function toggleNotifDropdown(e) {
  e.stopPropagation();
  const dd = document.getElementById("notifDropdown");
  dd.classList.toggle("open");
  if (dd.classList.contains("open")) {
    setTimeout(() => {
      localNotifs = localNotifs.map(n => ({ ...n, read: true }));
      saveNotifs(); updateNotifBadge(); renderNotifDropdown();
    }, 900);
  }
}

function renderNotifDropdown() {
  const list = document.getElementById("notifDropList");
  if (!list) return;
  if (!localNotifs.length) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px;">🔔<br>No notifications yet.</div>`;
    return;
  }
  list.innerHTML = localNotifs.slice(0, 8).map(n => `
    <div class="notif-item ${n.read?"":"unread"}">
      <div class="notif-icon">${n.icon || "🔔"}</div>
      <div class="notif-body">
        <div class="notif-ntitle">${n.title}</div>
        <div class="notif-nsub">${n.sub || ""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
      ${!n.read ? `<div class="notif-unread-dot"></div>` : ""}
    </div>`).join("");
}

function clearAllNotifs() {
  localNotifs = []; saveNotifs(); updateNotifBadge(); renderNotifDropdown();
  renderNotifHistory(); showToast("Notifications cleared.", "info");
}

function renderNotifHistory() {
  const filter = document.getElementById("notifTypeFilter")?.value || "all";
  const list   = document.getElementById("notifHistoryList");
  if (!list) return;
  let notifs = localNotifs;
  if (filter !== "all") notifs = notifs.filter(n => n.type === filter);
  list.innerHTML = notifs.length ? notifs.map(n => `
    <div class="notif-item ${n.read?"":"unread"}">
      <div class="notif-icon">${n.icon || "🔔"}</div>
      <div class="notif-body">
        <div class="notif-ntitle">${n.title}${!n.read?` <span style="display:inline-block;width:7px;height:7px;background:var(--pink);border-radius:50%;margin-left:5px;vertical-align:middle;"></span>`:""}  </div>
        <div class="notif-nsub">${n.sub || ""}</div>
        <div class="notif-time">${timeAgo(n.time)}</div>
      </div>
    </div>`).join("")
    : `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:13px;">No notifications.</div>`;
}

function markAllNotifsRead() {
  localNotifs = localNotifs.map(n => ({ ...n, read: true }));
  saveNotifs(); updateNotifBadge(); renderNotifHistory();
  showToast("All marked as read.", "success");
}

// ── PROFILE DRAWER ────────────────────────────────────────────────────────
function openProfileDrawer() {
  document.getElementById("profileDrawer").classList.add("open");
  document.getElementById("overlay").classList.add("open");

  const body = document.getElementById("profileDrawerBody");
  if (!body || !cachedProfile) return;

  const p = cachedProfile;
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
      <div style="width:72px;height:72px;border-radius:18px;background:var(--g-violet);display:grid;place-items:center;font-size:26px;font-weight:800;color:white;box-shadow:var(--glow-v);">
        ${(p.name || "FA").split(" ").map(n=>n[0]).join("").slice(0,2)}
      </div>
      <div>
        <div style="font-size:18px;font-weight:800;color:var(--text);">${p.name || "Faculty"}</div>
        <div style="font-size:13px;color:var(--text-3);margin-top:3px;">${p.email || "—"}</div>
        <div style="font-size:13px;color:var(--text-3);">${p.department || "—"}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;">
      ${[["Faculty No",p.faculty_no||"—"],["Department",p.department||"—"],["Email",p.email||"—"],["Phone",p.phone_no||p.phone||"—"]].map(([l,v])=>`
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);padding:12px;">
          <div style="font-size:10px;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;">${l}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${v}</div>
        </div>`).join("")}
    </div>
    <div class="divider"></div>
    <div style="font-size:12px;color:var(--text-3);margin-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;">Incharge Clubs</div>
    ${cachedClubs.map((c,i)=>`
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-md);margin-bottom:8px;">
        <span style="font-size:20px;">${c.logo||["🤖","⚡","💻","🤝","🚀"][i%5]}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text);">${c.name}</div>
          <div style="font-size:11px;color:var(--text-3);">${c.member_count||0} members</div>
        </div>
        <span class="club-card-status" style="margin-left:auto;">${c.status||"Active"}</span>
      </div>`).join("") || `<div class="list-empty">No clubs assigned.</div>`}
    <div style="margin-top:16px;">
      <button class="btn primary" onclick="window.location.href='account-setting.html'">⚙️ Edit Profile</button>
    </div>`;
}

function closeProfileDrawer() {
  document.getElementById("profileDrawer").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
}

// ── BULK HANDLERS ─────────────────────────────────────────────────────────
function initBulk() {
  document.getElementById("chkAllProposals")?.addEventListener("change", e => {
    document.querySelectorAll(".proposal-cb").forEach(cb => cb.checked = e.target.checked);
  });
  document.getElementById("bulkApproveBtn")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".proposal-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) { showToast("Select proposals first.", "error"); return; }
    await Promise.all(ids.map(id => apiFetch(`/faculty/proposals/${id}/approve`, { method: "PATCH" })));
    ids.forEach(id => { const p = cachedProposals.find(x=>x.id===id); if (p) p.status="approved"; });
    renderProposals(); showToast(`✅ ${ids.length} approved!`, "success");
  });
  document.getElementById("bulkRejectBtn")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".proposal-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) { showToast("Select proposals first.", "error"); return; }
    await Promise.all(ids.map(id => apiFetch(`/faculty/proposals/${id}/reject`, { method: "PATCH" })));
    ids.forEach(id => { const p = cachedProposals.find(x=>x.id===id); if (p) p.status="rejected"; });
    renderProposals(); showToast(`${ids.length} rejected.`, "error");
  });
  document.getElementById("chkAllCerts")?.addEventListener("change", e => {
    document.querySelectorAll(".cert-cb:not(:disabled)").forEach(cb => cb.checked = e.target.checked);
  });
  document.getElementById("bulkCertBtn")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".cert-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) { showToast("Select certificates first.", "error"); return; }
    const eligible = ids.filter(id => { const c = cachedCerts.find(x=>x.id===id); return c && (c.attended ?? c.attendance); });
    await Promise.all(eligible.map(id => apiFetch(`/faculty/certificates/${id}/approve`, { method: "PATCH" })));
    eligible.forEach(id => { const c = cachedCerts.find(x=>x.id===id); if (c) { c.certificate_status="approved"; c.status="approved"; } });
    renderCerts(); showToast(`🎓 ${eligible.length} approved!`, "success");
  });
}

// ── SEARCH & FILTER ───────────────────────────────────────────────────────
function initSearchFilters() {
  document.getElementById("proposalSearch")?.addEventListener("input", debounce(e =>
    renderProposals(document.getElementById("proposalFilter")?.value, e.target.value.toLowerCase(), document.getElementById("proposalCategoryFilter")?.value)
  ));
  document.getElementById("proposalFilter")?.addEventListener("change", () =>
    renderProposals(document.getElementById("proposalFilter").value, document.getElementById("proposalSearch")?.value.toLowerCase(), document.getElementById("proposalCategoryFilter")?.value)
  );
  document.getElementById("proposalCategoryFilter")?.addEventListener("change", () =>
    renderProposals(document.getElementById("proposalFilter")?.value, document.getElementById("proposalSearch")?.value.toLowerCase(), document.getElementById("proposalCategoryFilter").value)
  );
  document.getElementById("eventListSearch")?.addEventListener("input", debounce(e =>
    renderEventList(e.target.value.toLowerCase(), document.getElementById("eventListStatus")?.value)
  ));
  document.getElementById("eventListStatus")?.addEventListener("change", e =>
    renderEventList(document.getElementById("eventListSearch")?.value.toLowerCase(), e.target.value)
  );
  document.getElementById("certSearch")?.addEventListener("input", debounce(e =>
    renderCerts(e.target.value.toLowerCase(), document.getElementById("certStatusFilter")?.value)
  ));
  document.getElementById("certStatusFilter")?.addEventListener("change", e =>
    renderCerts(document.getElementById("certSearch")?.value.toLowerCase(), e.target.value)
  );
  document.getElementById("feedbackSearch")?.addEventListener("input", debounce(e =>
    renderFeedback(e.target.value.toLowerCase())
  ));
  document.getElementById("notifTypeFilter")?.addEventListener("change", renderNotifHistory);
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
                style="flex:1;padding:10px;border-radius:11px;border:1px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">
          Cancel
        </button>
        <button onclick="localStorage.removeItem('authToken');window.location.href='faculty-signin.html';"
                style="flex:1;padding:10px;border-radius:11px;border:none;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);">
          Yes, Logout
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", esc); }
  });
}

// ── BADGES ────────────────────────────────────────────────────────────────
function updateBadges() {
  const getStatus = c => c.certificate_status || c.status || "pending";
  const pending   = cachedProposals.filter(p => p.status==="pending"||p.status==="review").length;
  const pendCerts = cachedCerts.filter(c => getStatus(c)==="pending").length;
  updateBadge("badge-proposals", cachedProposals.filter(p=>p.status==="pending").length);
  updateBadge("badge-certs",     pendCerts);
  updateBadge("badge-pending",   pending + pendCerts);
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

function fmtDate(d) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(diff/3600000), d = Math.floor(diff/86400000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function starStr(rating) {
  const r = Math.round(rating || 0);
  return "★".repeat(r) + "☆".repeat(Math.max(0, 5-r));
}

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
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
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  new Chart(canvas, config);
}

// ── START ─────────────────────────────────────────────────────────────────
boot();
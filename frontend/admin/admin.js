// ============================================================
//  admin.js  —  EVEXA Admin Portal  (API-connected)
// ============================================================

const API = "http://localhost:5000/api/admin";

// ── AUTH TOKEN ────────────────────────────────────────────────
function token() { return localStorage.getItem("adminToken") || ""; }

async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

// ── STATE ────────────────────────────────────────────────────
let events      = [];
let users       = [];
let logs        = [];
let chartRefs   = {};
let analyticsLoaded = false;
let growthLoaded    = false;

// ── NAVIGATION ────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll("[id^='pg-']").forEach(el => el.style.display = "none");
  const target = document.getElementById("pg-" + page);
  if (target) target.style.display = "";

  document.querySelectorAll(".nav-item[data-page]").forEach(el =>
    el.classList.toggle("active", el.dataset.page === page)
  );

  const meta = {
    dashboard: ["Dashboard",           "System overview — EVEXA Admin Portal"],
    events:    ["Manage All Events",   "Create, edit, approve and delete events."],
    clubs:     ["Club Performance",    "Attendance, feedback ratings and growth trends."],
    users:     ["User Role Management","Assign and manage roles for all users."],
    analytics: ["Analytics & Reports", "Platform statistics and downloadable reports."],
    activity:  ["Activity Logs",       "Monitor all user and system actions."],
    backup:    ["Backup & Restore",    "Create backups and restore data."],
    profile:   ["Admin Profile",       "Manage your account and security settings."],
  };
  const [t, s] = meta[page] || ["Dashboard", ""];
  document.getElementById("pageTitle").textContent = t;
  document.getElementById("pageSub").textContent   = s;

  if (page === "events")    loadEvents();
  if (page === "clubs")     loadClubs();
  if (page === "users")     loadUsers();
  if (page === "analytics") loadAnalytics();
  if (page === "activity")  loadLogs();
  if (page === "backup")    renderBackup();
  if (page === "profile")   loadProfile();
}

// ── HELPERS ───────────────────────────────────────────────────
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3200);
}

function openModal(title, bodyHTML) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML    = bodyHTML;
  document.getElementById("modal").classList.add("open");
  document.getElementById("overlay").classList.add("open");
}
function closeModal() {
  document.getElementById("modal").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
}

function starsHTML(rating) {
  const r = parseFloat(rating) || 0;
  return `<span class="stars">${"★".repeat(Math.round(r))}${"☆".repeat(5 - Math.round(r))}</span> <span style="font-size:12px;color:#6b7280;">${r > 0 ? r : "N/A"}</span>`;
}

function destroyChart(id) {
  if (chartRefs[id]) { chartRefs[id].destroy(); delete chartRefs[id]; }
}

function makeChart(id, type, labels, datasets, extraOpts = {}) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  chartRefs[id] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: type === "doughnut" ? {} : {
        x: { grid: { display: false }, ticks: { font: { weight: 700 } } },
        y: { grid: { color: "rgba(229,231,235,.6)" }, ticks: { font: { weight: 700 } } },
      },
      ...extraOpts,
    },
  });
}

function makeDoughnut(id, labels, data, colors, legendEl) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  chartRefs[id] = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: "65%" },
  });
  if (legendEl) {
    legendEl.innerHTML = labels.map((l, i) => `
      <div class="legend-row">
        <span class="legend-dot" style="background:${colors[i]}"></span>
        <span>${l} — ${Number(data[i]).toLocaleString()}</span>
      </div>`).join("");
  }
}

// ── DASHBOARD ────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const d = await apiFetch("/dashboard");
    const s = d.stats;

    document.getElementById("stat-totalEvents").textContent  = s.totalEvents;
    document.getElementById("stat-eventsWeek").textContent   = s.eventsThisWeek;
    document.getElementById("stat-totalUsers").textContent   = s.totalUsers.toLocaleString();
    document.getElementById("stat-approved").textContent     = s.eventsApproved;
    document.getElementById("stat-pending").textContent      = s.pendingReview;
    document.getElementById("stat-certs").textContent        = s.certsIssued.toLocaleString();
    document.getElementById("stat-participation").textContent= s.totalParticipation.toLocaleString();
    document.getElementById("stat-pendingRoles").textContent = s.pendingRoles;

    document.getElementById("badge-events").textContent  = s.totalEvents;
    document.getElementById("badge-users").textContent   = s.pendingRoles;
    document.getElementById("badge-activity").textContent= d.recentLogs.length;

    // Recent events
    document.getElementById("dashEventsList").innerHTML = d.recentEvents.map(e => `
      <div class="list-item">
        <div class="dot ${e.status === 'approved' ? 'dot-green' : e.status === 'pending' ? 'dot-orange' : 'dot-red'}"></div>
        <div class="li-text">
          <div class="li-title">${e.name}</div>
          <div class="li-sub">${e.organizer} · ${e.date}</div>
        </div>
        <span class="badge ${e.status}">${cap(e.status)}</span>
      </div>`).join("") || `<div style="padding:20px;text-align:center;color:#9ca3af;font-weight:700;">No events yet.</div>`;

    // Academic doughnut
    const acad = s.academicSplit;
    makeDoughnut(
      "dashAcadChart",
      ["Academic", "Non-Academic"],
      [acad.academic, acad.non_academic],
      ["#6d5efc", "#ff6aa0"],
      document.getElementById("dashAcadLegend")
    );

    // Most active clubs
    document.getElementById("dashActiveClubs").innerHTML = d.mostActiveClubs.map((c, i) => `
      <div class="rank-row">
        <div class="rank-num">${i + 1}</div>
        <div class="li-text">
          <div class="rank-label">${c.club}</div>
          <div class="rank-sub">${c.total_participants.toLocaleString()} participants</div>
        </div>
        <div class="rank-val">${c.event_count} events</div>
      </div>`).join("") || `<div style="padding:20px;text-align:center;color:#9ca3af;font-weight:700;">No data.</div>`;

    // Top performing clubs
    document.getElementById("dashTopClubs").innerHTML = d.topClubs.map((c, i) => `
      <div class="rank-row">
        <div class="rank-num">${i + 1}</div>
        <div class="li-text">
          <div class="rank-label">${c.club}</div>
          <div class="rank-sub">${c.events} events conducted</div>
        </div>
        <div class="rank-val">${Number(c.total_participants).toLocaleString()}</div>
      </div>`).join("") || `<div style="padding:20px;text-align:center;color:#9ca3af;font-weight:700;">No data.</div>`;

    // Recent activity
    document.getElementById("dashActivityList").innerHTML = d.recentLogs.map(l => `
      <div class="log-item">
        <div class="log-icon ${l.color}">${l.icon}</div>
        <div class="log-body"><div class="log-action">${l.action}</div><div class="log-meta">${l.user}</div></div>
        <div class="log-time">${l.time || l.created_at}</div>
      </div>`).join("") || `<div style="padding:20px;text-align:center;color:#9ca3af;font-weight:700;">No recent activity.</div>`;

    // Role breakdown
    const rb = s.userBreakdown;
    const roleColors = { students: "#3b82f6", faculty: "#22c55e", organizers: "#f59e0b" };
    const total = rb.students + rb.faculty + rb.organizers;
    document.getElementById("dashRoleBreakdown").innerHTML = Object.entries(rb).map(([r, count]) => `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-weight:800;font-size:13px;text-transform:capitalize;">${cap(r)}</span>
          <span style="font-weight:900;font-size:13px;color:${roleColors[r] || '#6d5efc'}">${count}</span>
        </div>
        <div class="progress-wrap">
          <div class="progress-bar" style="width:${total ? Math.round(count / total * 100) : 0}%;background:${roleColors[r] || '#6d5efc'};"></div>
        </div>
      </div>`).join("");

  } catch (err) {
    showToast("⚠️ Failed to load dashboard: " + err.message, "error");
  }
}

// ── EVENTS ───────────────────────────────────────────────────
async function loadEvents() {
  const search = document.getElementById("evSearchInput")?.value || "";
  const status = document.getElementById("evStatusFilter")?.value || "all";
  const cat    = document.getElementById("evCatFilter")?.value || "all";
  const year   = document.getElementById("evYearFilter")?.value || "all";

  try {
    const params = new URLSearchParams({ search, status, category: cat, academic_year: year });
    events = await apiFetch(`/events?${params}`);
    renderEventsTable();
    document.getElementById("badge-events").textContent = events.length;
  } catch (err) {
    showToast("Failed to load events: " + err.message, "error");
  }
}

function renderEventsTable() {
  document.getElementById("eventsBody").innerHTML = events.map(e => `
    <tr>
      <td><input type="checkbox" class="cb ev-cb" data-id="${e.id}"/></td>
      <td style="font-weight:900;">${e.name}</td>
      <td>${e.organizer_name || e.organizer || '—'}</td>
      <td><span class="tag">${e.category}</span></td>
      <td>${e.date}</td>
      <td>${Number(e.participants || 0).toLocaleString()}</td>
      <td><span class="badge ${e.status}">${cap(e.status)}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="mini-btn edit"    onclick="editEvent(${e.id})">✏️ Edit</button>
        <button class="mini-btn approve" onclick="approveEvent(${e.id})" ${e.status === 'approved' ? "disabled style='opacity:.4'" : ""}>✅</button>
        <button class="mini-btn del"     onclick="deleteEvent(${e.id})">🗑</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No events found.</td></tr>`;
}

async function approveEvent(id) {
  try {
    await apiFetch(`/events/${id}/approve`, { method: "PUT" });
    showToast("✅ Event approved!", "success");
    loadEvents();
  } catch (err) { showToast(err.message, "error"); }
}

async function deleteEvent(id) {
  if (!confirm("Delete this event? This cannot be undone.")) return;
  try {
    await apiFetch(`/events/${id}`, { method: "DELETE" });
    showToast("🗑 Event deleted.", "error");
    loadEvents();
  } catch (err) { showToast(err.message, "error"); }
}

function editEvent(id) {
  const e = events.find(x => x.id === id);
  if (!e) return;
  openModal(`✏️ Edit Event — ${e.name}`, `
    <div>
      <label class="field-label">Event Name</label>
      <input class="field-input" id="editEvName" value="${e.name}" style="margin-bottom:12px;"/>
      <label class="field-label">Club / Organizer</label>
      <input class="field-input" id="editEvOrg" value="${e.organizer}" style="margin-bottom:12px;"/>
      <label class="field-label">Date</label>
      <input class="field-input" id="editEvDate" value="${e.date}" style="margin-bottom:12px;"/>
      <label class="field-label">Category</label>
      <select class="field-input" id="editEvCat" style="margin-bottom:12px;">
        ${["Technical","Cultural","Workshop","Creative","Science","Social"].map(c =>
          `<option value="${c}" ${e.category === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
      <label class="field-label">Academic Year</label>
      <select class="field-input" id="editEvYear" style="margin-bottom:12px;">
        <option value="">— Select —</option>
        ${["2025-26","2024-25","2023-24"].map(y =>
          `<option value="${y}" ${e.academic_year === y ? "selected" : ""}>${y}</option>`).join("")}
      </select>
      <label class="field-label">Status</label>
      <select class="field-input" id="editEvStatus" style="margin-bottom:18px;">
        ${["upcoming","live","completed","approved","pending","rejected"].map(s =>
          `<option value="${s}" ${e.status === s ? "selected" : ""}>${cap(s)}</option>`).join("")}
      </select>
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="saveEvent(${id})">💾 Save Changes</button>
        <button class="btn ghost"   onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function saveEvent(id) {
  try {
    await apiFetch(`/events/${id}`, {
      method: "PUT",
      body: {
        name:     document.getElementById("editEvName").value,
        date:     document.getElementById("editEvDate").value,
        category: document.getElementById("editEvCat").value,
        status:   document.getElementById("editEvStatus").value,
      },
    });
    closeModal(); showToast("💾 Event updated!", "success"); loadEvents();
  } catch (err) { showToast(err.message, "error"); }
}

function addEvent() {
  openModal("+ Add New Event", `
    <div>
      <label class="field-label">Event Name</label>
      <input class="field-input" id="newEvName" placeholder="e.g. Tech Symposium 2026" style="margin-bottom:12px;"/>
      <label class="field-label">Club / Organizer</label>
      <input class="field-input" id="newEvOrg" placeholder="e.g. IEEE Branch" style="margin-bottom:12px;"/>
      <label class="field-label">Date</label>
      <input class="field-input" id="newEvDate" type="date" style="margin-bottom:12px;"/>
      <label class="field-label">Category</label>
      <select class="field-input" id="newEvCat" style="margin-bottom:12px;">
        <option>Technical</option><option>Cultural</option>
        <option>Workshop</option><option>Creative</option><option>Science</option><option>Social</option>
      </select>
      <label class="field-label">Academic Year</label>
      <select class="field-input" id="newEvYear" style="margin-bottom:18px;">
        <option value="">— Select —</option>
        <option value="2025-26">2025–26</option>
        <option value="2024-25">2024–25</option>
        <option value="2023-24">2023–24</option>
      </select>
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="saveNewEvent()">➕ Add Event</button>
        <button class="btn ghost"   onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function saveNewEvent() {
  const name = document.getElementById("newEvName").value.trim();
  if (!name) return showToast("Please enter an event name.", "error");
  try {
    await apiFetch("/events", {
      method: "POST",
      body: {
        name,
        club_id:  document.getElementById("newEvOrg").value,
        date:     document.getElementById("newEvDate").value,
        category: document.getElementById("newEvCat").value,
      },
    });
    closeModal(); showToast("➕ Event added!", "success"); loadEvents();
  } catch (err) { showToast(err.message, "error"); }
}

// ── CLUB PERFORMANCE ─────────────────────────────────────────
async function loadClubs() {
  const year = document.getElementById("clubYearFilter")?.value || "all";
  try {
    const clubs = await apiFetch(`/clubs/performance?academic_year=${year}`);
    document.getElementById("clubsBody").innerHTML = clubs.map(c => `
      <tr>
        <td style="font-weight:900;">${c.club}</td>
        <td>${c.events_conducted}</td>
        <td>${c.avg_attendance}</td>
        <td>${Number(c.total_participants).toLocaleString()}</td>
        <td>${starsHTML(c.avg_feedback)}</td>
        <td style="color:#9ca3af;">${c.last_event || "—"}</td>
      </tr>`).join("") || `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No club data found.</td></tr>`;

    // Growth chart
    await loadGrowthChart();
  } catch (err) {
    showToast("Failed to load club data: " + err.message, "error");
  }
}

async function loadGrowthChart() {
  try {
    const data = await apiFetch("/clubs/growth");
    // Build datasets per club
    const clubs  = [...new Set(data.map(r => r.club))];
    const months = [...new Set(data.map(r => r.month))];
    const colors = ["#6d5efc","#ff6aa0","#3b82f6","#22c55e","#f59e0b","#14b8a6","#ef4444","#8b5cf6"];

    const datasets = clubs.slice(0, 6).map((club, i) => ({
      label:           club,
      data:            months.map(m => { const r = data.find(x => x.club === club && x.month === m); return r ? r.participants : 0; }),
      borderColor:     colors[i],
      backgroundColor: colors[i] + "20",
      borderWidth:     2, fill: false, tension: 0.4, pointRadius: 4,
    }));

    destroyChart("growthChart");
    const ctx = document.getElementById("growthChart");
    if (ctx) {
      chartRefs["growthChart"] = new Chart(ctx, {
        type: "line",
        data: { labels: months, datasets },
        options: {
          responsive: true,
          plugins: { legend: { display: true, position: "top" } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { weight: 700 } } },
            y: { grid: { color: "rgba(229,231,235,.6)" }, ticks: { font: { weight: 700 } } },
          },
        },
      });
    }
  } catch (err) {
    console.error("Growth chart error:", err);
  }
}

// ── USERS ─────────────────────────────────────────────────────
async function loadUsers() {
  const search = document.getElementById("userSearchInput")?.value || "";
  const role   = document.getElementById("roleFilter")?.value || "all";
  try {
    users = await apiFetch(`/users?search=${encodeURIComponent(search)}&role=${role}`);
    renderUsersTable();
    document.getElementById("badge-users").textContent = users.filter(u => u.status === "inactive").length;
  } catch (err) {
    showToast("Failed to load users: " + err.message, "error");
  }
}

function renderUsersTable() {
  document.getElementById("usersBody").innerHTML = users.map(u => `
    <tr>
      <td><input type="checkbox" class="cb user-cb" data-id="${u.id}" data-role="${u.role}"/></td>
      <td style="font-weight:900;">${u.name}</td>
      <td style="color:#6b7280;">${u.email}</td>
      <td><span class="badge ${u.role}">${cap(u.role)}</span></td>
      <td>${u.department || "—"}</td>
      <td><span class="badge ${u.status === 'active' ? 'active' : 'inactive'}">${cap(u.status || 'active')}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="mini-btn edit" onclick="editUser(${u.id},'${u.role}')">✏️ Edit</button>
        ${u.role === "organizer" ? `<button class="mini-btn approve" onclick="assignClub(${u.id})">🏷 Club</button>` : ""}
        <button class="mini-btn del" onclick="deleteUser(${u.id},'${u.role}')" ${u.role === 'admin' ? "disabled style='opacity:.4'" : ""}>🗑</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No users found.</td></tr>`;
}

function editUser(id, role) {
  const u = users.find(x => x.id === id);
  if (!u) return;
  openModal(`✏️ Edit User — ${u.name}`, `
    <div>
      <label class="field-label">Full Name</label>
      <input class="field-input" id="editUName" value="${u.name}" style="margin-bottom:12px;"/>
      <label class="field-label">Email</label>
      <input class="field-input" id="editUEmail" value="${u.email}" style="margin-bottom:12px;"/>
      <label class="field-label">Department / Club</label>
      <input class="field-input" id="editUDept" value="${u.department || ""}" placeholder="Department or Club" style="margin-bottom:12px;"/>
      <label class="field-label">Phone</label>
      <input class="field-input" id="editUPhone" value="${u.phone || ""}" placeholder="Phone number" style="margin-bottom:12px;"/>
      ${role === "student" ? `
      <label class="field-label">Status</label>
      <select class="field-input" id="editUStatus" style="margin-bottom:12px;">
        <option value="active"   ${u.status === "active"   ? "selected" : ""}>Active</option>
        <option value="inactive" ${u.status === "inactive" ? "selected" : ""}>Inactive</option>
      </select>` : `<input type="hidden" id="editUStatus" value="active"/>`}
      ${role === "faculty" ? `
      <label class="field-label">Faculty ID</label>
      <input class="field-input" id="editUFacultyNo" value="${u.admission_no || ""}" style="margin-bottom:12px;"/>` : `<input type="hidden" id="editUFacultyNo" value=""/>`}
      <div style="display:flex;gap:10px;margin-top:6px;">
        <button class="btn primary" onclick="saveUser(${id},'${role}')">💾 Save Changes</button>
        <button class="btn ghost"   onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function saveUser(id, role) {
  try {
    await apiFetch(`/users/${id}`, {
      method: "PUT",
      body: {
        name:       document.getElementById("editUName").value,
        email:      document.getElementById("editUEmail").value,
        role,
        status:     document.getElementById("editUStatus")?.value || "active",
        department: document.getElementById("editUDept").value,
        phone:      document.getElementById("editUPhone").value,
        club:       document.getElementById("editUDept").value,
        faculty_no: document.getElementById("editUFacultyNo")?.value || null,
      },
    });
    closeModal(); showToast("💾 User updated!", "success"); loadUsers();
  } catch (err) { showToast(err.message, "error"); }
}

async function deleteUser(id, role) {
  if (role === "admin") return showToast("Cannot delete admin accounts.", "error");
  if (!confirm("Delete this user?")) return;
  try {
    await apiFetch(`/users/${id}?role=${role}`, { method: "DELETE" });
    showToast("🗑 User deleted.", "error"); loadUsers();
  } catch (err) { showToast(err.message, "error"); }
}

function assignClub(id) {
  const u = users.find(x => x.id === id);
  openModal(`🏷 Assign Club — ${u?.name || "Organizer"}`, `
    <div>
      <label class="field-label">Club Name</label>
      <input class="field-input" id="assignClubInput" value="${u?.department || ""}" placeholder="e.g. Robotics Club" style="margin-bottom:18px;"/>
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="saveAssignClub(${id})">💾 Assign</button>
        <button class="btn ghost"   onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function saveAssignClub(id) {
  const club = document.getElementById("assignClubInput").value.trim();
  if (!club) return showToast("Enter a club name.", "error");
  try {
    await apiFetch(`/users/${id}/assign-club`, { method: "PUT", body: { club } });
    closeModal(); showToast("🏷 Club assigned!", "success"); loadUsers();
  } catch (err) { showToast(err.message, "error"); }
}

function addUser() {
  openModal("+ Add New User", `
    <div>
      <label class="field-label">Full Name</label>
      <input class="field-input" id="newUName" placeholder="e.g. Rahul Sharma" style="margin-bottom:12px;"/>
      <label class="field-label">Email</label>
      <input class="field-input" id="newUEmail" placeholder="e.g. rahul@college.edu" style="margin-bottom:12px;"/>
      <label class="field-label">Password</label>
      <input class="field-input" id="newUPass" type="password" placeholder="Temporary password" style="margin-bottom:12px;"/>
      <label class="field-label">Department / Club</label>
      <input class="field-input" id="newUDept" placeholder="e.g. CSE or Robotics Club" style="margin-bottom:12px;"/>
      <label class="field-label">Phone</label>
      <input class="field-input" id="newUPhone" placeholder="+91 XXXXX" style="margin-bottom:12px;"/>
      <label class="field-label">Role</label>
      <select class="field-input" id="newURole" style="margin-bottom:18px;">
        <option value="student">Student</option>
        <option value="organizer">Organizer</option>
        <option value="faculty">Faculty</option>
      </select>
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="saveNewUser()">➕ Add User</button>
        <button class="btn ghost"   onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function saveNewUser() {
  const name = document.getElementById("newUName").value.trim();
  if (!name) return showToast("Enter a name.", "error");
  const role = document.getElementById("newURole").value;
  try {
    await apiFetch("/users", {
      method: "POST",
      body: {
        name,
        email:      document.getElementById("newUEmail").value,
        password:   document.getElementById("newUPass").value,
        department: document.getElementById("newUDept").value,
        club:       document.getElementById("newUDept").value,
        phone:      document.getElementById("newUPhone").value,
        role,
      },
    });
    closeModal(); showToast("➕ User added!", "success"); loadUsers();
  } catch (err) { showToast(err.message, "error"); }
}

// ── ANALYTICS ────────────────────────────────────────────────
async function loadAnalytics() {
  const year = document.getElementById("analyticsYearFilter")?.value || "all";
  try {
    const d = await apiFetch(`/analytics?academic_year=${year}`);

    const months = d.eventsPerMonth.map(r => r.month);

    makeChart("eventsMonthChart", "bar", months, [{
      data: d.eventsPerMonth.map(r => r.count),
      backgroundColor: "rgba(109,94,252,.75)", borderRadius: 8, borderSkipped: false,
    }]);

    makeChart("participationChart", "bar", d.participationPerMonth.map(r => r.month), [{
      data: d.participationPerMonth.map(r => r.participants),
      backgroundColor: "rgba(255,106,160,.75)", borderRadius: 8, borderSkipped: false,
    }]);

    makeChart("certsChart", "bar", d.certs.map(r => r.month), [{
      data: d.certs.map(r => r.count),
      backgroundColor: "rgba(34,197,94,.7)", borderRadius: 8, borderSkipped: false,
    }]);

    // Academic vs non-academic
    const acad = d.acadSplit || { academic: 0, non_academic: 0 };
    makeDoughnut("academicChart",
      ["Academic", "Non-Academic"],
      [acad.academic, acad.non_academic],
      ["#6d5efc", "#ff6aa0"],
      document.getElementById("academicLegend")
    );

    // Category doughnut
    const catColors = ["#6d5efc","#ff6aa0","#3b82f6","#ec4899","#8b5cf6","#14b8a6","#f59e0b"];
    makeDoughnut("categoryChart",
      d.categories.map(c => c.category),
      d.categories.map(c => c.count),
      catColors.slice(0, d.categories.length),
      document.getElementById("categoryLegend")
    );

    // Semester bar
    const sem = d.semesters || { sem1: 0, sem2: 0 };
    makeChart("semesterChart", "bar",
      ["Sem 1 (Aug–Dec)", "Sem 2 (Jan–Jul)"],
      [{
        data: [sem.sem1, sem.sem2],
        backgroundColor: ["rgba(109,94,252,.8)", "rgba(255,106,160,.8)"],
        borderRadius: 10, borderSkipped: false,
      }]
    );

    // Role doughnut
    const roleColors = ["#3b82f6","#22c55e","#f59e0b","#6d5efc"];
    makeDoughnut("roleChart",
      d.roles.map(r => r.role),
      d.roles.map(r => r.count),
      roleColors.slice(0, d.roles.length),
      document.getElementById("roleLegend")
    );

  } catch (err) {
    showToast("Failed to load analytics: " + err.message, "error");
  }
}

// ── ACTIVITY LOGS ────────────────────────────────────────────
async function loadLogs() {
  const search = document.getElementById("logSearch")?.value || "";
  const type   = document.getElementById("logTypeFilter")?.value || "all";
  const from   = document.getElementById("logFromDate")?.value || "";
  const to     = document.getElementById("logToDate")?.value || "";

  try {
    const params = new URLSearchParams({ search, type, from, to });
    logs = await apiFetch(`/logs?${params}`);
    renderLogs();
    document.getElementById("badge-activity").textContent = logs.length;
  } catch (err) {
    showToast("Failed to load logs: " + err.message, "error");
  }
}

function renderLogs() {
  document.getElementById("activityLogList").innerHTML = logs.map(l => `
    <div class="log-item">
      <div class="log-icon ${l.color}">${l.icon}</div>
      <div class="log-body">
        <div class="log-action">${l.action}</div>
        <div class="log-meta">By: ${l.user}</div>
      </div>
      <div class="log-time">${l.time || (l.created_at ? l.created_at.slice(0, 16).replace("T", " ") : "—")}</div>
    </div>`).join("") || `<div style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No logs found.</div>`;
}

// ── BACKUP (static UI, no API for now) ───────────────────────
const BACKUP_HISTORY = [
  { label:"Full Backup",   date:"Feb 20, 2026", time:"10:42 AM", size:"4.2 MB" },
  { label:"Full Backup",   date:"Feb 19, 2026", time:"11:15 AM", size:"4.1 MB" },
  { label:"Events Backup", date:"Feb 18, 2026", time:"09:30 AM", size:"1.4 MB" },
  { label:"Users Backup",  date:"Feb 17, 2026", time:"02:00 PM", size:"0.9 MB" },
];

function renderBackup() {
  document.getElementById("backupHistoryList").innerHTML = BACKUP_HISTORY.map(b => `
    <div class="list-item">
      <div class="dot dot-green"></div>
      <div class="li-text"><div class="li-title">${b.label}</div><div class="li-sub">${b.date} · ${b.time} · ${b.size}</div></div>
      <span class="badge active">✅ success</span>
    </div>`).join("");

  const metrics = [
    { label:"Storage Used",    val:"4.2 MB", pct:42, color:"#6d5efc" },
    { label:"Storage Free",    val:"5.8 MB", pct:58, color:"#22c55e" },
    { label:"Database Health", val:"99%",    pct:99, color:"#22c55e" },
    { label:"API Uptime",      val:"99.9%",  pct:99, color:"#3b82f6" },
  ];
  document.getElementById("systemHealth").innerHTML = metrics.map(m => `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span style="font-weight:800;font-size:13px;">${m.label}</span>
        <span style="font-weight:900;font-size:13px;color:${m.color}">${m.val}</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${m.pct}%;background:${m.color};"></div></div>
    </div>`).join("");
}

function simulateBackup(type) {
  showToast(`⏳ Creating ${type} backup…`, "info");
  setTimeout(() => showToast(`✅ ${type} backup completed!`, "success"), 1800);
}

// ── ADMIN PROFILE ────────────────────────────────────────────
async function loadProfile() {
  try {
    const p = await apiFetch("/profile");
    document.getElementById("profileName").value  = p.name || "";
    document.getElementById("profileEmail").value = p.email || "";
    document.getElementById("profilePhone").value = p.phone || "";
    document.getElementById("profileDept").value  = p.department || "";
    document.getElementById("profileDisplayName").textContent  = p.name || "Admin";
    document.getElementById("profileDisplayEmail").textContent = p.email || "";
    const initials = (p.name || "SA").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    document.getElementById("profileAvatar").textContent = initials;
    document.getElementById("sidebarAvatar").textContent = initials;
    document.getElementById("sidebarName").textContent   = p.name || "Admin";

    // Decode expiry from JWT
    try {
      const payload = JSON.parse(atob(token().split(".")[1]));
      const exp = new Date(payload.exp * 1000);
      document.getElementById("sessionExpiry").textContent = exp.toLocaleString();
    } catch {}
  } catch (err) {
    showToast("Failed to load profile: " + err.message, "error");
  }
}

async function saveProfile() {
  try {
    await apiFetch("/profile", {
      method: "PUT",
      body: {
        name:       document.getElementById("profileName").value,
        email:      document.getElementById("profileEmail").value,
        phone:      document.getElementById("profilePhone").value,
        department: document.getElementById("profileDept").value,
      },
    });
    showToast("💾 Profile updated!", "success");
    loadProfile();
  } catch (err) { showToast(err.message, "error"); }
}

function measurePasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

async function changePassword() {
  const cur  = document.getElementById("pwCurrent").value;
  const nw   = document.getElementById("pwNew").value;
  const conf = document.getElementById("pwConfirm").value;
  if (!cur || !nw) return showToast("All fields are required.", "error");
  if (nw !== conf) return showToast("Passwords do not match.", "error");
  if (nw.length < 8) return showToast("Password must be at least 8 characters.", "error");
  try {
    await apiFetch("/change-password", {
      method: "PUT",
      body: { currentPassword: cur, newPassword: nw },
    });
    showToast("🔒 Password updated!", "success");
    document.getElementById("pwCurrent").value = "";
    document.getElementById("pwNew").value     = "";
    document.getElementById("pwConfirm").value = "";
  } catch (err) { showToast(err.message, "error"); }
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  // Redirect to login if no token
  if (!token()) {
    window.location.href = "adsignin.html";
    return;
  }

  // Sidebar toggle
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    const s = document.getElementById("sidebar");
    if (window.innerWidth <= 768) s.classList.toggle("mobile-open");
    else s.classList.toggle("collapsed");
  });

  // Nav
  document.querySelectorAll(".nav-item[data-page]").forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); navigateTo(el.dataset.page); })
  );

  // Modal close
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("overlay").addEventListener("click", closeModal);

  // ── EVENTS ──
  document.getElementById("addEventBtn")?.addEventListener("click", addEvent);
  ["evSearchInput","evStatusFilter","evCatFilter","evYearFilter"].forEach(id =>
    document.getElementById(id)?.addEventListener("change", loadEvents)
  );
  document.getElementById("evSearchInput")?.addEventListener("input", loadEvents);
  document.getElementById("chkAllEvents")?.addEventListener("change", e =>
    document.querySelectorAll(".ev-cb").forEach(cb => cb.checked = e.target.checked)
  );
  document.getElementById("bulkApproveEvBtn")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".ev-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) return showToast("Select at least one event.", "error");
    try {
      await apiFetch("/events/bulk-approve", { method: "POST", body: { ids } });
      showToast(`✅ ${ids.length} event(s) approved!`, "success"); loadEvents();
    } catch (err) { showToast(err.message, "error"); }
  });
  document.getElementById("bulkDeleteEvBtn")?.addEventListener("click", async () => {
    const ids = [...document.querySelectorAll(".ev-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) return showToast("Select at least one event.", "error");
    if (!confirm(`Delete ${ids.length} event(s)?`)) return;
    try {
      await apiFetch("/events/bulk-delete", { method: "POST", body: { ids } });
      showToast(`🗑 ${ids.length} event(s) deleted.`, "error"); loadEvents();
    } catch (err) { showToast(err.message, "error"); }
  });

  // ── CLUBS ──
  document.getElementById("clubYearFilter")?.addEventListener("change", loadClubs);

  // ── USERS ──
  document.getElementById("addUserBtn")?.addEventListener("click", addUser);
  document.getElementById("userSearchInput")?.addEventListener("input", loadUsers);
  document.getElementById("roleFilter")?.addEventListener("change", loadUsers);
  document.getElementById("chkAllUsers")?.addEventListener("change", e =>
    document.querySelectorAll(".user-cb").forEach(cb => cb.checked = e.target.checked)
  );

  // ── LOGS ──
  document.getElementById("logApplyBtn")?.addEventListener("click", loadLogs);
  document.getElementById("logSearch")?.addEventListener("input", loadLogs);
  document.getElementById("logTypeFilter")?.addEventListener("change", loadLogs);
  document.getElementById("clearLogsBtn")?.addEventListener("click", async () => {
    if (!confirm("Clear all activity logs?")) return;
    try {
      await apiFetch("/logs", { method: "DELETE" });
      showToast("🗑 Logs cleared.", "error"); loadLogs();
    } catch (err) { showToast(err.message, "error"); }
  });

  // ── ANALYTICS ──
  document.getElementById("analyticsReloadBtn")?.addEventListener("click", loadAnalytics);

  // ── PROFILE ──
  document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfile);
  document.getElementById("changePasswordBtn")?.addEventListener("click", changePassword);
  document.getElementById("pwNew")?.addEventListener("input", function() {
    const score = measurePasswordStrength(this.value);
    const colors = ["","#ef4444","#f59e0b","#f59e0b","#22c55e","#16a34a"];
    const labels = ["","Weak","Fair","Fair","Strong","Very Strong"];
    document.getElementById("pwStrengthFill").style.width  = `${score * 20}%`;
    document.getElementById("pwStrengthFill").style.background = colors[score] || "#ef4444";
    document.getElementById("pwStrengthLabel").textContent  = this.value ? labels[score] : "";
    document.getElementById("pwStrengthLabel").style.color  = colors[score] || "#9ca3af";
  });

  // ── RESTORE ──
  document.getElementById("restoreBtn")?.addEventListener("click", () => {
    const sel = document.getElementById("restoreSelect").value;
    if (!confirm(`Restore from: "${sel}"?\n\nThis will overwrite all current data.`)) return;
    showToast("⏳ Restoring data…", "warning");
    setTimeout(() => showToast("✅ Data restored successfully!", "success"), 2200);
  });

  // ── LOGOUT ──
  const doLogout = () => {
    if (confirm("Do you want to logout?")) {
      localStorage.removeItem("adminToken");
      window.location.href = "index.html";
    }
  };
  document.getElementById("logoutBtn").addEventListener("click", doLogout);
  document.getElementById("logoutBtn2")?.addEventListener("click", doLogout);

  // ── NOTIFICATION ──
  document.getElementById("notifBtn").addEventListener("click", () =>
    showToast("🔔 3 new system notifications", "info")
  );

  // ── INITIAL LOAD ──
  loadDashboard();
});
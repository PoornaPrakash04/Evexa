const API = "https://evexa-production.up.railway.app/api/admin";
const EVENTS_API = "https://evexa-production.up.railway.app/api/events";
function token() { return localStorage.getItem("adminToken") || ""; }


async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  
  let data = {};
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    
    if (res.status === 401) {
      localStorage.removeItem("adminToken");
      window.location.href = "adsignin.html";
      return;
    }
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}



async function eventsFetch(path, opts = {}) {
  const res = await fetch(EVENTS_API + path, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
    },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("adminToken");
      window.location.href = "adsignin.html";
      return;
    }
    throw new Error(data.message || `HTTP ${res.status}`);
  }
  return data;
}


let events = [];
let users  = [];
let logs   = [];
let chartRefs = {};

let adminCalEvents   = [];


function navigateTo(page) {
  localStorage.setItem("adminPage", page);
  document.querySelectorAll("[id^='pg-']").forEach(el => (el.style.display = "none"));
  const target = document.getElementById("pg-" + page);
  if (target) target.style.display = "";

  document.querySelectorAll(".nav-item[data-page]").forEach(el =>
    el.classList.toggle("active", el.dataset.page === page)
  );

  const meta = {
    dashboard:     ["Dashboard",            "System overview — EVEXA Admin Portal"],
    events:        ["Manage All Events",    "Create, edit, approve and delete events."],
    clubs:         ["Club Performance",     "Attendance, feedback ratings and growth trends."],
    users:         ["User Role Management", "Assign and manage roles for all users."],
    analytics:     ["Analytics & Reports",  "Platform statistics and downloadable reports."],
    activity:      ["Activity Logs",        "Monitor all user and system actions."],
    backup:        ["Backup & Restore",     "Create backups and restore data."],
    profile:       ["Admin Profile",        "Manage your account and security settings."],
    "event-detail":["Event Details",        "Full information and participants for this event."],
    "club-detail": ["Club Details",         "Performance metrics and events for this club."],
  };
  const [t, s] = meta[page] || ["Dashboard", ""];
  const titleEl = document.getElementById("pageTitle");
  const subEl   = document.getElementById("pageSub");
  if (titleEl) titleEl.textContent = t;
  if (subEl)   subEl.textContent   = s;

  
  if (page === "dashboard") loadDashboard();
  if (page === "events")    loadEvents();
  if (page === "clubs")     loadClubs();
  if (page === "users")     loadUsers();
  if (page === "analytics") loadAnalytics();
  if (page === "activity")  loadLogs();
  if (page === "backup")    loadRecycleBin();
  if (page === "profile")   loadProfile();
}


function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ""; }

function setBadge(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  const n = parseInt(val, 10);
  if (!isNaN(n) && n > 0) {
    el.textContent = n;
    el.style.display = "";
  } else {
    el.style.display = "none";
  }
}

function showToast(msg, type = "info") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 3200);
}

function openModal(title, bodyHTML) {
  const modalTitle = document.getElementById("modalTitle");
  const modalBody  = document.getElementById("modalBody");
  const modal      = document.getElementById("modal");
  const overlay    = document.getElementById("overlay");
  if (!modal || !overlay) return;
  if (modalTitle) modalTitle.textContent = title;
  if (modalBody)  modalBody.innerHTML    = bodyHTML;
  modal.classList.add("open");
  overlay.classList.add("open");
}

function closeModal() {
  document.getElementById("modal")?.classList.remove("open");
  document.getElementById("overlay")?.classList.remove("open");
}


function starsHTML(rating) {
  const r = parseFloat(rating);
  const n = isNaN(r) ? 0 : Math.min(5, Math.max(0, Math.round(r)));
  return `<span class="stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>
          <span style="font-size:12px;color:#6b7280;">${r > 0 ? r.toFixed(1) : "N/A"}</span>`;
}

function destroyChart(id) {
  if (chartRefs[id]) {
    chartRefs[id].destroy();
    delete chartRefs[id];
  }
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
      maintainAspectRatio: false,
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
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 5,
      }],
    },
    options: {
      responsive: false,
      plugins: { legend: { display: false } },
      cutout: "65%",
    },
  });
  if (legendEl) {
    legendEl.innerHTML = labels
      .map((l, i) => `
        <div class="legend-row">
          <span class="legend-dot" style="background:${colors[i]}"></span>
          <span>${l} — ${Number(data[i]).toLocaleString()}</span>
        </div>`)
      .join("");
  }
}


async function loadDashboard() {
  console.log("Dashboard loaded");
  try {
    const d = await apiFetch("/dashboard");
    if (!d) return; 
    const s = d.stats || {};

    
    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val ?? "—";
    };
    console.log("API totalEvents:", s.totalEvents);
    setEl("stat-totalEvents",   s.totalEvents);
    setEl("stat-eventsWeek",    s.eventsThisWeek);
    setEl("stat-totalUsers",    (s.totalUsers ?? 0).toLocaleString());
    setEl("stat-participation", (s.totalParticipation ?? 0).toLocaleString());

    setBadge("badge-events",   s.totalEvents);
    setBadge("badge-activity", (d.recentLogs || []).length);

    
    
    try {
      const allEvs = await eventsFetch("/all") || [];
      if (allEvs.length) {
        adminCalEvents = allEvs;
        renderAdminCalendar();
        renderAdminCalEvents(adminCalSelected);
      } else if (d.recentEvents && d.recentEvents.length) {
        adminCalEvents = d.recentEvents;
        renderAdminCalendar();
        renderAdminCalEvents(adminCalSelected);
      }
    } catch (_) {
      
      if (d.recentEvents && d.recentEvents.length) {
        adminCalEvents = d.recentEvents;
        renderAdminCalendar();
        renderAdminCalEvents(adminCalSelected);
      }
    }

    
    const acad = s.academicSplit || { academic: 0, non_academic: 0 };
    makeDoughnut(
      "dashAcadChart",
      ["Technical", "Non-Technical"],
      [acad.academic || 0, acad.non_academic || 0],
      ["#6d5efc", "#ff6aa0"],
      document.getElementById("dashAcadLegend")
    );

    
    const dashActiveClubs = document.getElementById("dashActiveClubs");
    if (dashActiveClubs) {
      dashActiveClubs.innerHTML = (d.mostActiveClubs || []).slice(0, 5).map((c, i) => `
        <div class="rank-row">
          <div class="rank-num">${i + 1}</div>
          <div class="li-text">
            <div class="rank-label">${c.club}</div>
            <div class="rank-sub">${Number(c.total_participants || 0).toLocaleString()} participants</div>
          </div>
          <div class="rank-val">${c.event_count} events</div>
        </div>`).join("")
        || `<div style="padding:20px;text-align:center;color:#9ca3af;font-weight:700;">No data.</div>`;
    }


  } catch (err) {
    showToast("⚠️ Failed to load dashboard: " + err.message, "error");
  }
}


async function loadEvents() {
  const search = document.getElementById("evSearchInput")?.value.trim().toLowerCase() || "";
  const year   = document.getElementById("evYearFilter")?.value   || "all";

  try {
    let data = await eventsFetch("/all") || [];

    
    data = data.filter(e => (e.status || "").toLowerCase() !== "submitted");

    if (search) {
      data = data.filter(e =>
        (e.title || "").toLowerCase().includes(search) ||
        (e.organizer_label || "").toLowerCase().includes(search) ||
        (e.club || "").toLowerCase().includes(search)
      );
    }
    if (year !== "all") {
      data = data.filter(e => {
        if (e.academic_year) return e.academic_year === year;
        return (e.date || "").startsWith(year.split("-")[0]);
      });
    }

    events = data;
    renderEventsTable();
    setBadge("badge-events", events.length);
  } catch (err) {
    showToast("Failed to load events: " + err.message, "error");
  }
}

function renderEventsTable() {
  
  if (events.length) {
    adminCalEvents = events;
    renderAdminCalendar();
    renderAdminCalEvents(adminCalSelected);
  }
  const tbody = document.getElementById("eventsBody");
  if (!tbody) return;

  
  function fmtDate(raw) {
    if (!raw) return "—";
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }

  tbody.innerHTML = events.map(e => {
    const safeTitle = (e.title || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const safeOrg   = (e.organizer_label || e.organizer || "").replace(/"/g,"&quot;");
    const safeEmail = (e.organizer_email || "").replace(/"/g,"&quot;");
    const safeClub  = (e.club || e.club_name || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return `
    <tr>
      <td style="font-weight:800;"><span class="ev-name-link" style="cursor:pointer;color:var(--violet-2);text-decoration:underline;text-underline-offset:3px;" data-id="${e.id}">${safeTitle || "—"}</span></td>
      <td>${safeClub || safeOrg || "—"}</td>
      <td><span class="tag">${e.category || "—"}</span></td>
      <td>${fmtDate(e.date)}</td>
      <td id="part-count-${e.id}">${Number(e.participants || 0).toLocaleString()}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <button class="mini-btn ev-participants-btn" style="color:var(--cyan-2);border-color:rgba(6,182,212,.25);background:rgba(6,182,212,.06);"
          data-id="${e.id}" data-name="${safeTitle}">👥 Participants</button>
        <button class="mini-btn ev-message-btn" style="color:var(--violet-2);border-color:rgba(139,92,246,.25);background:rgba(139,92,246,.06);"
          data-id="${e.id}" data-name="${safeTitle}" data-org="${safeOrg}" data-email="${safeEmail}">✉️ Message</button>
      </td>
    </tr>`;
  }).join("")
    || `<tr><td colspan="6" style="padding:24px;text-align:center;opacity:.5;font-weight:700;">No events found.</td></tr>`;

  
  tbody.querySelectorAll(".ev-name-link").forEach(btn => {
    btn.addEventListener("click", () => openEventDetail(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".ev-participants-btn").forEach(btn => {
    btn.addEventListener("click", () => viewParticipants(Number(btn.dataset.id), btn.dataset.name));
  });
  tbody.querySelectorAll(".ev-message-btn").forEach(btn => {
    btn.addEventListener("click", () => openSendMessage(Number(btn.dataset.id), btn.dataset.name, btn.dataset.org, btn.dataset.email));
  });
}

async function approveEvent(id) {
  try {
    await eventsFetch(`/${id}/approve`, { method: "PUT" });
    showToast("✅ Event approved!", "success");
    loadEvents();
  } catch (err) { showToast(err.message, "error"); }
}

async function deleteEvent(id) {
  if (!confirm("Delete this event? This cannot be undone.")) return;
  try {
    await eventsFetch(`/${id}`, { method: "DELETE" });
    showToast("🗑 Event deleted.", "error");
    loadEvents();
  } catch (err) { showToast(err.message, "error"); }
}

function editEvent(id) {
  const e = events.find(x => x.id === id);
  if (!e) return showToast("Event not found.", "error");
  openModal(`✏️ Edit Event — ${e.name || e.title}`, `
    <div>
      <label class="field-label">Event Name</label>
      <input class="field-input" id="editEvName" value="${e.name || e.title || ""}" style="margin-bottom:12px;"/>
      <label class="field-label">Club / Organizer</label>
      <input class="field-input" id="editEvOrg" value="${e.organizer_name || e.organizer || ""}" style="margin-bottom:12px;"/>
      <label class="field-label">Date</label>
      <input class="field-input" id="editEvDate" type="date" value="${e.date || ""}" style="margin-bottom:12px;"/>
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
        ${["upcoming","live","completed","approved","pending","rejected"].map(st =>
          `<option value="${st}" ${(e.status || "").toLowerCase() === st ? "selected" : ""}>${cap(st)}</option>`).join("")}
      </select>
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="saveEvent(${id})">💾 Save Changes</button>
        <button class="btn ghost"   onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function saveEvent(id) {
  try {
    await eventsFetch(`/${id}`, {
      method: "PUT",
      body: {
        name:          document.getElementById("editEvName").value.trim(),
        organizer:     document.getElementById("editEvOrg").value.trim(),
        date:          document.getElementById("editEvDate").value,
        category:      document.getElementById("editEvCat").value,
        academic_year: document.getElementById("editEvYear").value,
        status:        document.getElementById("editEvStatus").value,
      },
    });
    closeModal();
    showToast("💾 Event updated!", "success");
    loadEvents();
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
  const name = document.getElementById("newEvName")?.value.trim();
  if (!name) return showToast("Please enter an event name.", "error");
  
  try {
    await eventsFetch("", {
      method: "POST",
      body: {
        name,
        organizer:     document.getElementById("newEvOrg").value.trim(),
        date:          document.getElementById("newEvDate").value,
        category:      document.getElementById("newEvCat").value,
        academic_year: document.getElementById("newEvYear").value,
      },
    });
    closeModal();
    showToast("➕ Event added!", "success");
    loadEvents();
  } catch (err) { showToast(err.message, "error"); }
}


async function viewParticipants(eventId, eventName) {
  
  const safeName = (eventName || "").replace(/"/g, "&quot;");
  openModal(`👥 Participants — ${safeName}`, `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <span style="font-size:13px;font-weight:700;color:#6b7280;" id="participantCount">Loading…</span>
        <button class="btn primary sm" id="downloadCsvBtn" disabled>📥 Download CSV</button>
      </div>
      <div id="participantTableWrap">
        <div style="text-align:center;padding:24px;color:#9ca3af;font-weight:700;">Loading participants…</div>
      </div>
    </div>`);

  try {
    const rows = await apiFetch("/events/" + eventId + "/participants") || [];
    const countEl = document.getElementById("participantCount");
    const wrapEl  = document.getElementById("participantTableWrap");
    const dlBtn   = document.getElementById("downloadCsvBtn");

    const count = rows.length;
    if (countEl) countEl.textContent = count + " participant" + (count !== 1 ? "s" : "") + " registered";

    
    const tableCell = document.getElementById("part-count-" + eventId);
    if (tableCell) tableCell.textContent = count.toLocaleString();

    
    if (dlBtn) {
      dlBtn.disabled = false;
      dlBtn.onclick = () => downloadParticipantsFromRows(rows, safeName);
    }

    if (!rows.length) {
      if (wrapEl) wrapEl.innerHTML =
        '<div style="text-align:center;padding:24px;color:#9ca3af;font-weight:700;">No participants yet.</div>';
      return;
    }

    const thStyle = "padding:10px 12px;text-align:left;font-weight:900;font-size:11px;color:#374151;background:rgba(109,94,252,.06);border-bottom:1px solid rgba(229,231,235,.8);white-space:nowrap;";
    const tdStyle = (extra = "") => `padding:10px 12px;${extra}`;

    const tbody = rows.map((r, i) => {
      const certStyle = r.certificate_issued === "Yes"
        ? "background:rgba(34,197,94,.12);color:#16a34a;border:1px solid rgba(34,197,94,.3);"
        : "background:rgba(229,231,235,.5);color:#6b7280;border:1px solid rgba(229,231,235,.8);";
      const rowBg = i % 2 === 1 ? "background:rgba(109,94,252,.02);" : "";
      return `<tr style="border-bottom:1px solid rgba(229,231,235,.5);${rowBg}">
        <td style="${tdStyle("font-weight:800;")}">${r.student_name || "—"}</td>
        <td style="${tdStyle("color:#6b7280;")}">${r.roll_no || "—"}</td>
        <td style="${tdStyle("color:#6b7280;")}">${r.email || "—"}</td>
        <td style="${tdStyle()}">${r.department || "—"}</td>
        <td style="${tdStyle("color:#6b7280;")}">${r.phone || "—"}</td>
        <td style="${tdStyle()}">
          <span style="padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;${certStyle}">
            ${r.certificate_issued || "No"}
          </span>
        </td>
      </tr>`;
    }).join("");

    if (wrapEl) wrapEl.innerHTML =
      `<div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr>
            <th style="${thStyle}">Name</th>
            <th style="${thStyle}">Roll No</th>
            <th style="${thStyle}">Email</th>
            <th style="${thStyle}">Department</th>
            <th style="${thStyle}">Phone</th>
            <th style="${thStyle}">Cert Issued</th>
          </tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>`;

  } catch (err) {
    const wrapEl = document.getElementById("participantTableWrap");
    if (wrapEl) wrapEl.innerHTML =
      `<div style="text-align:center;padding:24px;color:#ef4444;font-weight:700;">Failed to load: ${err.message}</div>`;
  }
}

function downloadParticipantsFromRows(rows, eventName) {
  try {
    if (!rows || !rows.length) return showToast("No participants to download.", "error");
    showToast("📥 Preparing CSV…", "info");
    const headers = ["Name", "Roll No", "Email", "Department", "Phone", "Certificate Issued"];
    const csvRows = [
      headers.join(","),
      ...rows.map(r => [
        r.student_name || "",
        r.roll_no      || "",
        r.email        || "",
        r.department   || "",
        r.phone        || "",
        r.certificate_issued || "No",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = (eventName || "participants").replace(/[^a-z0-9]/gi, "_") + "_participants.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("✅ CSV downloaded!", "success");
  } catch (err) {
    showToast("Failed to download: " + err.message, "error");
  }
}



function openSendMessage(eventId, eventName, organizerName, organizerEmail) {
  if (!organizerEmail) {
    showToast("Organizer email not available for this event.", "error");
    return;
  }
  openModal(`✉️ Message Organizer — ${eventName}`, `
    <div>
      <div style="padding:10px 14px;border-radius:12px;background:rgba(109,94,252,.07);border:1px solid rgba(109,94,252,.18);margin-bottom:14px;font-size:13px;">
        <div style="font-weight:900;color:var(--text);">To: ${organizerName || organizerEmail}</div>
        <div style="color:#6b7280;margin-top:2px;">${organizerEmail}</div>
      </div>
      <label class="field-label">Subject</label>
      <input class="field-input" id="msgSubject" placeholder="e.g. Regarding your event" style="margin-bottom:12px;" value="Regarding: ${eventName}"/>
      <label class="field-label">Message</label>
      <textarea class="field-input" id="msgBody" rows="5" placeholder="Type your message here…" style="resize:vertical;margin-bottom:18px;"></textarea>
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="sendMessageToOrganizer(${eventId}, '${organizerEmail}')">✉️ Send Message</button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function sendMessageToOrganizer(eventId, organizerEmail) {
  const subject = document.getElementById("msgSubject")?.value.trim();
  const body    = document.getElementById("msgBody")?.value.trim();
  if (!subject) return showToast("Please enter a subject.", "error");
  if (!body)    return showToast("Please enter a message.", "error");
  try {
    await apiFetch("/send-message", {
      method: "POST",
      body: { event_id: eventId, to_email: organizerEmail, subject, message: body },
    });
    closeModal();
    showToast("✉️ Message sent to organizer!", "success");
  } catch (err) {
    showToast("Failed to send: " + err.message, "error");
  }
}


async function loadClubs() {
  const year = document.getElementById("clubYearFilter")?.value || "all";
  try {
    const clubs = await apiFetch(`/clubs/performance?academic_year=${year}`) || [];
    const tbody = document.getElementById("clubsBody");
    if (tbody) {
      tbody.innerHTML = clubs.map(c => {
        const safeName = (c.club || "").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        return `
        <tr>
          <td style="font-weight:900;">
            <span class="club-name-link" style="cursor:pointer;color:var(--violet-2);text-decoration:underline;text-underline-offset:3px;"
              data-club='${JSON.stringify(c).replace(/'/g,"&#39;")}'>${safeName || "—"}</span>
          </td>
          <td>${c.events_conducted ?? "—"}</td>
          <td>${c.avg_attendance ?? "—"}</td>
          <td>${Number(c.total_participants || 0).toLocaleString()}</td>
          <td style="color:#9ca3af;">${c.last_event ? new Date(c.last_event).toLocaleDateString("en-IN", {day:"numeric",month:"short",year:"numeric"}) : "—"}</td>
        </tr>`;
      }).join("")
        || `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No club data found.</td></tr>`;

      tbody.querySelectorAll(".club-name-link").forEach(el => {
        el.addEventListener("click", () => {
          try { openClubDetail(JSON.parse(el.dataset.club)); } catch(_) {}
        });
      });
    }
  } catch (err) {
    showToast("Failed to load club data: " + err.message, "error");
  }
}

/* ── Event Detail page ── */
async function openEventDetail(eventId) {
  const e = events.find(x => x.id === eventId);
  if (!e) return showToast("Event not found.", "error");

  navigateTo("event-detail");

  function fmtDate(raw) {
    if (!raw) return "—";
    const d = new Date(raw);
    return isNaN(d) ? raw : d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
  }

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "—"; };
  setText("edTitle",       e.title || e.name || "Untitled Event");
  setText("edSub",         e.organizer_label || e.organizer || "—");
  setText("edDate",        fmtDate(e.date));
  setText("edClub",        e.club || e.club_name || e.organizer_label || "—");
  setText("edParticipants", Number(e.participants || 0).toLocaleString());
  setText("edStatus",      e.status ? (e.status[0].toUpperCase() + e.status.slice(1)) : "—");
  setText("edYear",        e.academic_year || "—");
  setText("edEmail",       e.organizer_email || "—");

  const catEl = document.getElementById("edCategory");
  if (catEl) catEl.textContent = e.category || "";

  const descEl = document.getElementById("edDescription");
  if (descEl) {
    if (e.description) { descEl.textContent = e.description; descEl.style.display = ""; }
    else descEl.style.display = "none";
  }

  // Load participants
  const wrap = document.getElementById("edParticipantsWrap");
  const countEl = document.getElementById("edPartCount");
  const dlBtn = document.getElementById("edDownloadCsvBtn");
  if (wrap) wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">Loading…</div>';
  if (countEl) countEl.textContent = "Loading…";

  try {
    const rows = await apiFetch("/events/" + eventId + "/participants") || [];
    if (countEl) countEl.textContent = rows.length + " participant" + (rows.length !== 1 ? "s" : "") + " registered";
    if (dlBtn) {
      dlBtn.onclick = () => downloadParticipantsFromRows(rows, e.title || e.name || "event");
    }
    if (!rows.length) {
      if (wrap) wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No participants yet.</div>';
      return;
    }
    const thS = "padding:10px 12px;text-align:left;font-weight:900;font-size:11px;color:#374151;background:rgba(109,94,252,.06);border-bottom:1px solid rgba(229,231,235,.8);white-space:nowrap;";
    const tdS = (x="") => `padding:10px 12px;${x}`;
    const tbody = rows.map((r,i) => {
      const certStyle = r.certificate_issued === "Yes"
        ? "background:rgba(34,197,94,.12);color:#16a34a;border:1px solid rgba(34,197,94,.3);"
        : "background:rgba(229,231,235,.5);color:#6b7280;border:1px solid rgba(229,231,235,.8);";
      const rowBg = i%2===1 ? "background:rgba(109,94,252,.02);" : "";
      return `<tr style="border-bottom:1px solid rgba(229,231,235,.5);${rowBg}">
        <td style="${tdS("font-weight:800;")}">${r.student_name||"—"}</td>
        <td style="${tdS("color:#6b7280;")}">${r.roll_no||"—"}</td>
        <td style="${tdS("color:#6b7280;")}">${r.email||"—"}</td>
        <td style="${tdS()}">${r.department||"—"}</td>
        <td style="${tdS("color:#6b7280;")}">${r.phone||"—"}</td>
        <td style="${tdS()}"><span style="padding:3px 8px;border-radius:999px;font-size:11px;font-weight:800;${certStyle}">${r.certificate_issued||"No"}</span></td>
      </tr>`;
    }).join("");
    if (wrap) wrap.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr>
        <th style="${thS}">Name</th><th style="${thS}">Roll No</th><th style="${thS}">Email</th>
        <th style="${thS}">Department</th><th style="${thS}">Phone</th><th style="${thS}">Cert Issued</th>
      </tr></thead><tbody>${tbody}</tbody></table></div>`;
  } catch(err) {
    if (wrap) wrap.innerHTML = `<div style="padding:24px;text-align:center;color:#ef4444;font-weight:700;">Failed to load: ${err.message}</div>`;
  }
}

/* ── Club Detail page ── */
async function openClubDetail(club) {
  navigateTo("club-detail");

  function fmtDate(raw) {
    if (!raw) return "—";
    const d = new Date(raw);
    return isNaN(d) ? raw : d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
  }

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? "—"; };
  setText("cdTitle",        club.club || "Club Details");
  setText("cdSub",          `Performance overview for ${club.club || "this club"}`);
  setText("cdEvents",       club.events_conducted ?? "—");
  setText("cdParticipants", Number(club.total_participants || 0).toLocaleString());
  setText("cdAvgAttendance",club.avg_attendance ?? "—");
  setText("cdLastEvent",    fmtDate(club.last_event));

  // Load club's events from the main events list
  const cdBody = document.getElementById("cdEventsBody");
  const cdCount = document.getElementById("cdEventsCount");
  if (cdBody) cdBody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;opacity:.5;font-weight:700;">Loading…</td></tr>';

  try {
    const allEvs = await eventsFetch("/all") || [];
    const clubEvs = allEvs.filter(e =>
      (e.club || e.club_name || e.organizer_label || "").toLowerCase() === (club.club || "").toLowerCase()
    );
    if (cdCount) cdCount.textContent = clubEvs.length + " event" + (clubEvs.length !== 1 ? "s" : "") + " found";
    if (cdBody) {
      cdBody.innerHTML = clubEvs.map(e => `
        <tr>
          <td style="font-weight:800;">${(e.title || e.name || "—").replace(/</g,"&lt;")}</td>
          <td><span class="tag">${e.category || "—"}</span></td>
          <td>${fmtDate(e.date)}</td>
          <td>${Number(e.participants || 0).toLocaleString()}</td>
          <td><span class="badge ${(e.status||"").toLowerCase()}">${e.status ? e.status[0].toUpperCase()+e.status.slice(1) : "—"}</span></td>
        </tr>`).join("")
        || '<tr><td colspan="5" style="padding:24px;text-align:center;opacity:.5;font-weight:700;">No events found for this club.</td></tr>';
    }
  } catch(err) {
    if (cdBody) cdBody.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:#ef4444;font-weight:700;">${err.message}</td></tr>`;
  }
}


async function loadUsers() {
  const search = document.getElementById("userSearchInput")?.value.trim() || "";
  const role   = document.getElementById("roleFilter")?.value || "all";
  try {
    users = await apiFetch(`/users?search=${encodeURIComponent(search)}&role=${role}`) || [];
    renderUsersTable();
    setBadge("badge-users", users.filter(u => u.status === "pending").length);
  } catch (err) {
    showToast("Failed to load users: " + err.message, "error");
  }
}

function renderUsersTable() {
  const tbody = document.getElementById("usersBody");
  if (!tbody) return;
  tbody.innerHTML = users.map(u => `
    <tr>
      <td style="font-weight:900;">${u.name || "—"}</td>
      <td style="color:#6b7280;">${u.email || "—"}</td>
      <td><span class="badge ${u.role || ""}">${cap(u.role)}</span></td>
      <td>${u.department || "—"}</td>
      <td><span class="badge ${u.status === "active" ? "active" : "inactive"}">${cap(u.status || "active")}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="mini-btn edit" onclick="editUser(${u.id},'${u.role}')">✏️ Edit</button>
        ${u.role === "organizer"
          ? `<button class="mini-btn approve" onclick="assignClub(${u.id})">🏷 Club</button>`
          : ""}
        <button class="mini-btn del"
          onclick="deleteUser(${u.id},'${u.role}')"
          ${u.role === "admin" ? "disabled style='opacity:.4'" : ""}>🗑</button>
      </td>
    </tr>`).join("")
    || `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No users found.</td></tr>`;
}

function editUser(id, role) {
  const u = users.find(x => x.id === id);
  if (!u) return showToast("User not found.", "error");
  openModal(`✏️ Edit User — ${u.name}`, `
    <div>
      <label class="field-label">Full Name</label>
      <input class="field-input" id="editUName"  value="${u.name || ""}" style="margin-bottom:12px;"/>
      <label class="field-label">Email</label>
      <input class="field-input" id="editUEmail" value="${u.email || ""}" style="margin-bottom:12px;"/>
      <label class="field-label">Department / Club</label>
      <input class="field-input" id="editUDept"  value="${u.department || ""}" placeholder="Department or Club" style="margin-bottom:12px;"/>
      <label class="field-label">Phone</label>
      <input class="field-input" id="editUPhone" value="${u.phone || ""}" placeholder="Phone number" style="margin-bottom:12px;"/>
      ${role === "student" ? `
        <label class="field-label">Status</label>
        <select class="field-input" id="editUStatus" style="margin-bottom:12px;">
          <option value="active"   ${u.status === "active"   ? "selected" : ""}>Active</option>
          <option value="inactive" ${u.status === "inactive" ? "selected" : ""}>Inactive</option>
        </select>` : `<input type="hidden" id="editUStatus" value="${u.status || "active"}"/>`}
      ${role === "faculty" ? `
        <label class="field-label">Faculty ID</label>
        <input class="field-input" id="editUFacultyNo" value="${u.admission_no || u.faculty_no || ""}" style="margin-bottom:12px;"/>` 
        : `<input type="hidden" id="editUFacultyNo" value=""/>`}
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
        name:       document.getElementById("editUName").value.trim(),
        email:      document.getElementById("editUEmail").value.trim(),
        role,
        status:     document.getElementById("editUStatus")?.value || "active",
        department: document.getElementById("editUDept").value.trim(),
        phone:      document.getElementById("editUPhone").value.trim(),
        
        club:       document.getElementById("editUDept").value.trim(),
        faculty_no: document.getElementById("editUFacultyNo")?.value.trim() || null,
      },
    });
    closeModal();
    showToast("💾 User updated!", "success");
    loadUsers();
  } catch (err) { showToast(err.message, "error"); }
}

async function deleteUser(id, role) {
  if (role === "admin") return showToast("Cannot delete admin accounts.", "error");

  const u = users.find(x => x.id === id);
  const userName = u?.name || "this user";

  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);
    z-index:9999;display:flex;align-items:center;justify-content:center;
  `;
  overlay.innerHTML = `
    <div style="
      background:var(--surface);border:1px solid var(--border-2);border-radius:24px;
      padding:40px 36px;max-width:380px;width:90%;text-align:center;
      box-shadow:0 24px 60px rgba(0,0,0,.4);animation:fadeInUp .2s ease;
    ">
      <div style="font-size:48px;margin-bottom:16px;">🗑️</div>
      <div style="font-size:20px;font-weight:900;color:var(--text);margin-bottom:10px;">Delete User?</div>
      <div style="font-size:13px;color:var(--text-3);font-weight:500;margin-bottom:28px;">
        Are you sure you want to delete <strong style="color:var(--text);">${userName}</strong>?<br/>This action cannot be undone.
      </div>
      <div style="display:flex;gap:12px;">
        <button id="delUserCancelBtn" style="
          flex:1;padding:13px;border-radius:14px;border:1px solid var(--border-2);
          background:var(--surface-2);color:var(--text);font-weight:700;font-size:14px;
          cursor:pointer;transition:.15s;
        ">Cancel</button>
        <button id="delUserConfirmBtn" style="
          flex:1;padding:13px;border-radius:14px;border:none;
          background:linear-gradient(135deg,#ef4444,#dc2626);color:white;
          font-weight:800;font-size:14px;cursor:pointer;
          box-shadow:0 4px 16px rgba(239,68,68,.35);
        ">Yes, Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("delUserCancelBtn").onclick = () => overlay.remove();
  overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById("delUserConfirmBtn").onclick = async () => {
    overlay.remove();
    try {
      await apiFetch(`/users/${id}?role=${role}`, { method: "DELETE" });
      showToast("🗑 User deleted.", "error");
      loadUsers();
    } catch (err) { showToast(err.message, "error"); }
  };
}

function assignClub(id) {
  const u = users.find(x => x.id === id);
  if (!u) return showToast("User not found.", "error");
  openModal(`🏷 Assign Club — ${u.name}`, `
    <div>
      <label class="field-label">Club Name</label>
      <input class="field-input" id="assignClubInput" value="${u.department || ""}" placeholder="e.g. Robotics Club" style="margin-bottom:18px;"/>
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="saveAssignClub(${id})">💾 Assign</button>
        <button class="btn ghost"   onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}

async function saveAssignClub(id) {
  const club = document.getElementById("assignClubInput")?.value.trim();
  if (!club) return showToast("Enter a club name.", "error");
  try {
    await apiFetch(`/users/${id}/assign-club`, { method: "PUT", body: { club } });
    closeModal();
    showToast("🏷 Club assigned!", "success");
    loadUsers();
  } catch (err) { showToast(err.message, "error"); }
}


function addUser() {
  const roles = [
    { key: "student",   icon: "🎓", label: "Student",   desc: "Enrolled student account" },
    { key: "faculty",   icon: "👨‍🏫", label: "Faculty",   desc: "Faculty / staff account" },
    { key: "organizer", icon: "🏷️",  label: "Organizer", desc: "Club event organizer" },
    { key: "admin",     icon: "🛡️",  label: "Admin",     desc: "System administrator" },
  ];
  openModal("➕ Add New User", `
    <div>
      <p style="font-size:13px;color:var(--text-3);font-weight:600;margin-bottom:16px;">Select the type of user to add:</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${roles.map(r => `
          <button onclick="addUserStep2('${r.key}')" style="
            padding:18px 14px;border-radius:16px;border:1px solid var(--border-2);
            background:var(--surface-2);cursor:pointer;text-align:left;
            transition:.15s ease;display:flex;align-items:center;gap:12px;
          "
          onmouseover="this.style.borderColor='rgba(139,92,246,.4)';this.style.background='rgba(139,92,246,.07)'"
          onmouseout="this.style.borderColor='var(--border-2)';this.style.background='var(--surface-2)'">
            <span style="font-size:28px;">${r.icon}</span>
            <div>
              <div style="font-weight:800;font-size:14px;color:var(--text);">${r.label}</div>
              <div style="font-size:11px;color:var(--text-3);margin-top:2px;">${r.desc}</div>
            </div>
          </button>`).join("")}
      </div>
      <div style="margin-top:16px;">
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}


function addUserStep2(role) {
  const titles = {
    student:   "🎓 Add Student",
    faculty:   "👨‍🏫 Add Faculty",
    organizer: "🏷️ Add Organizer",
    admin:     "🛡️ Add Admin",
  };

  
  const fieldSets = {
    student: `
      <label class="field-label">Full Name *</label>
      <input class="field-input" id="newUName" placeholder="e.g. Poorna Prakash" style="margin-bottom:12px;"/>
      <label class="field-label">Email *</label>
      <input class="field-input" id="newUEmail" type="email" placeholder="poorna@gmail.com" style="margin-bottom:12px;"/>
      <label class="field-label">Password *</label>
      <input class="field-input" id="newUPass" type="password" placeholder="Temporary password" style="margin-bottom:12px;"/>
      <label class="field-label">Roll No *</label>
      <input class="field-input" id="newURollNo" placeholder="e.g. LBT23IT044" style="margin-bottom:12px;"/>
      <label class="field-label">Admission No *</label>
      <input class="field-input" id="newUAdmNo" placeholder="e.g. 2023B102" style="margin-bottom:12px;"/>
      <label class="field-label">Class *</label>
      <input class="field-input" id="newUClass" placeholder="e.g. S6" style="margin-bottom:12px;"/>
      <label class="field-label">Department *</label>
      <input class="field-input" id="newUDept" placeholder="e.g. Information Technology" style="margin-bottom:12px;"/>
      <label class="field-label">Phone</label>
      <input class="field-input" id="newUPhone" placeholder="e.g. 8281457673" style="margin-bottom:18px;"/>`,

    faculty: `
      <label class="field-label">Full Name *</label>
      <input class="field-input" id="newUName" placeholder="e.g. Dr. Priya Nair" style="margin-bottom:12px;"/>
      <label class="field-label">Email *</label>
      <input class="field-input" id="newUEmail" type="email" placeholder="priya@college.edu" style="margin-bottom:12px;"/>
      <label class="field-label">Password *</label>
      <input class="field-input" id="newUPass" type="password" placeholder="Temporary password" style="margin-bottom:12px;"/>
      <label class="field-label">Faculty No *</label>
      <input class="field-input" id="newUFacultyNo" placeholder="e.g. FAC2023001" style="margin-bottom:12px;"/>
      <label class="field-label">Department *</label>
      <input class="field-input" id="newUDept" placeholder="e.g. Information Technology" style="margin-bottom:12px;"/>
      <label class="field-label">Phone</label>
      <input class="field-input" id="newUPhone" placeholder="e.g. 8281457673" style="margin-bottom:18px;"/>`,

    organizer: `
      <label class="field-label">Full Name *</label>
      <input class="field-input" id="newUName" placeholder="e.g. Poorna Prakash" style="margin-bottom:12px;"/>
      <label class="field-label">Email *</label>
      <input class="field-input" id="newUEmail" type="email" placeholder="poorna@college.edu" style="margin-bottom:12px;"/>
      <label class="field-label">Password *</label>
      <input class="field-input" id="newUPass" type="password" placeholder="Temporary password" style="margin-bottom:12px;"/>
      <label class="field-label">Club *</label>
      <input class="field-input" id="newUClub" placeholder="e.g. IEEE, IEDC" style="margin-bottom:12px;"/>
      <label class="field-label">Roll No</label>
      <input class="field-input" id="newURollNo" placeholder="e.g. LBT23IT044" style="margin-bottom:12px;"/>
      <label class="field-label">Admission No</label>
      <input class="field-input" id="newUAdmNo" placeholder="e.g. 2023B102" style="margin-bottom:12px;"/>
      <label class="field-label">Phone</label>
      <input class="field-input" id="newUPhone" placeholder="e.g. 8281457673" style="margin-bottom:18px;"/>`,

    admin: `
      <label class="field-label">Full Name *</label>
      <input class="field-input" id="newUName" placeholder="e.g. Admin" style="margin-bottom:12px;"/>
      <label class="field-label">Email *</label>
      <input class="field-input" id="newUEmail" type="email" placeholder="admin@college.edu" style="margin-bottom:12px;"/>
      <label class="field-label">Password *</label>
      <input class="field-input" id="newUPass" type="password" placeholder="Strong password" style="margin-bottom:12px;"/>
      <label class="field-label">Phone</label>
      <input class="field-input" id="newUPhone" placeholder="e.g. 8281457673" style="margin-bottom:18px;"/>`,
  };

  openModal(titles[role], `
    <div>
      <button onclick="addUser()" style="
        display:inline-flex;align-items:center;gap:6px;margin-bottom:18px;
        font-size:12px;font-weight:700;color:var(--text-3);background:none;
        border:none;cursor:pointer;padding:0;
      ">← Back</button>
      ${fieldSets[role]}
      <div style="display:flex;gap:10px;">
        <button class="btn primary" onclick="saveNewUser('${role}')">➕ Add ${role.charAt(0).toUpperCase()+role.slice(1)}</button>
        <button class="btn ghost" onclick="closeModal()">Cancel</button>
      </div>
    </div>`);
}


async function saveNewUser(role) {
  const name  = document.getElementById("newUName")?.value.trim();
  const email = document.getElementById("newUEmail")?.value.trim();
  const pass  = document.getElementById("newUPass")?.value;
  if (!name)  return showToast("Enter a name.", "error");
  if (!email) return showToast("Enter an email.", "error");
  if (!pass)  return showToast("Enter a password.", "error");

  const body = { name, email, password: pass, role };

  if (role === "student") {
    body.roll_no      = document.getElementById("newURollNo")?.value.trim();
    body.admission_no = document.getElementById("newUAdmNo")?.value.trim();
    body.cls          = document.getElementById("newUClass")?.value.trim();
    body.department   = document.getElementById("newUDept")?.value.trim();
    body.phone        = document.getElementById("newUPhone")?.value.trim();
    if (!body.roll_no)    return showToast("Enter roll number.", "error");
    if (!body.admission_no) return showToast("Enter admission number.", "error");
    if (!body.cls)        return showToast("Enter class.", "error");
    if (!body.department) return showToast("Enter department.", "error");
  } else if (role === "faculty") {
    body.faculty_no = document.getElementById("newUFacultyNo")?.value.trim();
    body.department = document.getElementById("newUDept")?.value.trim();
    body.phone      = document.getElementById("newUPhone")?.value.trim();
    if (!body.faculty_no) return showToast("Enter faculty number.", "error");
    if (!body.department) return showToast("Enter department.", "error");
  } else if (role === "organizer") {
    body.club         = document.getElementById("newUClub")?.value.trim();
    body.roll_no      = document.getElementById("newURollNo")?.value.trim();
    body.admission_no = document.getElementById("newUAdmNo")?.value.trim();
    body.phone        = document.getElementById("newUPhone")?.value.trim();
    if (!body.club) return showToast("Enter club name.", "error");
  } else if (role === "admin") {
    body.phone = document.getElementById("newUPhone")?.value.trim();
  }

  try {
    await apiFetch("/users", { method: "POST", body });
    closeModal();
    showToast("➕ User added!", "success");
    loadUsers();
  } catch (err) { showToast(err.message, "error"); }
}


async function loadAnalytics() {
  const year = document.getElementById("analyticsYearFilter")?.value || "all";
  try {
    const d = await apiFetch(`/analytics?academic_year=${year}`);
    if (!d) return;

    
    makeChart("eventsMonthChart", "bar",
      (d.eventsPerMonth || []).map(r => r.month),
      [{
        data:            (d.eventsPerMonth || []).map(r => r.count),
        backgroundColor: "rgba(109,94,252,.75)",
        borderRadius:    8,
        borderSkipped:   false,
      }]
    );

    makeChart("participationChart", "bar",
      (d.participationPerMonth || []).map(r => r.month),
      [{
        data:            (d.participationPerMonth || []).map(r => r.participants),
        backgroundColor: "rgba(255,106,160,.75)",
        borderRadius:    8,
        borderSkipped:   false,
      }]
    );

    const acad = d.acadSplit || { academic: 0, non_academic: 0 };
    makeDoughnut("academicChart",
      ["Technical", "Non-Technical"],
      [acad.academic || 0, acad.non_academic || 0],
      ["#6d5efc", "#ff6aa0"],
      document.getElementById("academicLegend")
    );

    const sem = d.semesters || { sem1: 0, sem2: 0 };
    makeChart("semesterChart", "bar",
      ["Sem 1 (Aug–Dec)", "Sem 2 (Jan–Jul)"],
      [{
        data:            [sem.sem1 || 0, sem.sem2 || 0],
        backgroundColor: ["rgba(109,94,252,.8)", "rgba(255,106,160,.8)"],
        borderRadius:    10,
        borderSkipped:   false,
      }]
    );

    const roleColors = ["#3b82f6","#22c55e","#f59e0b","#6d5efc"];
    const roles = d.roles || [];
    makeDoughnut("roleChart",
      roles.map(r => r.role),
      roles.map(r => r.count),
      roleColors.slice(0, roles.length),
      document.getElementById("roleLegend")
    );

  } catch (err) {
    showToast("Failed to load analytics: " + err.message, "error");
  }
}


async function loadLogs() {
  const search = document.getElementById("logSearch")?.value.trim() || "";
  const type   = document.getElementById("logTypeFilter")?.value || "all";
  const from   = document.getElementById("logFromDate")?.value || "";
  const to     = document.getElementById("logToDate")?.value || "";

  try {
    const params = new URLSearchParams({ search, type, from, to });
    logs = await apiFetch(`/logs?${params}`) || [];
    renderLogs();
    setBadge("badge-activity", logs.length);
  } catch (err) {
    showToast("Failed to load logs: " + err.message, "error");
  }
}

function renderLogs() {
  const list = document.getElementById("activityLogList");
  if (!list) return;
  list.innerHTML = logs.map(l => `
    <div class="log-item">
      <div class="log-icon ${l.color || ""}">${l.icon || "📋"}</div>
      <div class="log-body">
        <div class="log-action">${l.action || "—"}</div>
        <div class="log-meta">By: ${l.user || "System"}</div>
      </div>
      <div class="log-time">${l.time || (l.created_at ? l.created_at.slice(0, 16).replace("T", " ") : "—")}</div>
    </div>`).join("")
    || `<div style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No logs found.</div>`;
}


let rbData = { events: [], users: [], clubs: [] };
let rbActiveTab = 'events';

async function loadRecycleBin() {
  ['rbEventsBody','rbUsersBody','rbClubsBody'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div class='rb-skeleton'></div><div class='rb-skeleton'></div><div class='rb-skeleton'></div>`;
  });
  try {
    const [evRes, usRes, clRes] = await Promise.allSettled([
      apiFetch('/trash/events'),
      apiFetch('/trash/users'),
      apiFetch('/trash/clubs'),
    ]);
    rbData.events = (evRes.status === 'fulfilled' && Array.isArray(evRes.value)) ? evRes.value : [];
    rbData.users  = (usRes.status === 'fulfilled' && Array.isArray(usRes.value)) ? usRes.value : [];
    rbData.clubs  = (clRes.status === 'fulfilled' && Array.isArray(clRes.value)) ? clRes.value : [];
    updateRbStats();
    renderRecycleBin();
  } catch (err) {
    showToast('Failed to load recycle bin: ' + err.message, 'error');
  }
}

function updateRbStats() {
  const now  = Date.now();
  const soon = 7 * 24 * 60 * 60 * 1000;
  let expiring = 0;
  [...rbData.events, ...rbData.users, ...rbData.clubs].forEach(item => {
    const expiresAt = new Date(item.deleted_at).getTime() + 30 * 24 * 60 * 60 * 1000;
    if (expiresAt - now < soon) expiring++;
  });
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setEl('rbStatEvents',   rbData.events.length);
  setEl('rbStatUsers',    rbData.users.length);
  setEl('rbStatClubs',    rbData.clubs.length);
  setEl('rbStatExpiring', expiring);
}

function switchRbTab(tab) {
  rbActiveTab = tab;
  document.querySelectorAll('.rb-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.rb-tab-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById('rb-tab-' + tab);
  if (panel) panel.style.display = '';
  renderRecycleBin();
}

function renderRecycleBin() {
  const search  = (document.getElementById('rbSearch')?.value || '').toLowerCase();
  const items   = rbData[rbActiveTab] || [];
  const filtered = search ? items.filter(i => JSON.stringify(i).toLowerCase().includes(search)) : items;
  const bodyId  = { events: 'rbEventsBody', users: 'rbUsersBody', clubs: 'rbClubsBody' }[rbActiveTab];
  const el = document.getElementById(bodyId);
  if (!el) return;

  if (!filtered.length) {
    el.innerHTML = `<div class='rb-empty'>
      <div style='font-size:48px;margin-bottom:12px;'>🧹</div>
      <div style='font-weight:800;font-size:15px;margin-bottom:4px;'>Nothing here</div>
      <div style='font-size:13px;color:var(--text-3);'>${search ? 'No matches for your search.' : 'No deleted ' + rbActiveTab + ' found.'}</div>
    </div>`;
    return;
  }

  el.innerHTML = filtered.map(item => {
    const deletedAt  = new Date(item.deleted_at);
    const expiresAt  = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const daysLeft   = Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
    const urgency    = daysLeft <= 3 ? 'rb-urgent' : daysLeft <= 7 ? 'rb-warning' : '';
    const deletedFmt = deletedAt.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
    let icon, title, meta;
    if (rbActiveTab === 'events') {
      icon  = '📅';
      title = item.title || item.name || 'Untitled Event';
      meta  = (item.club || item.organizer_label || '—') + ' · ' + (item.category || '—') + ' · ' + (item.date ? new Date(item.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—');
    } else if (rbActiveTab === 'users') {
      icon  = '👤';
      title = item.name || 'Unknown User';
      meta  = (item.email || '—') + ' · ' + (item.role ? item.role.charAt(0).toUpperCase()+item.role.slice(1) : '—') + ' · ' + (item.department || '—');
    } else {
      icon  = '🏷️';
      title = item.club || item.name || 'Unknown Club';
      meta  = (item.organizer_name || '—') + ' · ' + (item.event_count ?? 0) + ' events';
    }
    const safeTitle = title.replace(/`/g, "'");
    return `<div class='rb-item ${urgency}'>
        <div class='rb-item-icon'>${icon}</div>
        <div class='rb-item-body'>
          <div class='rb-item-title'>${title}</div>
          <div class='rb-item-meta'>${meta}</div>
          <div class='rb-item-date'>🗑️ Deleted ${deletedFmt}<span class='rb-expires ${urgency}'> · ${daysLeft}d left</span></div>
        </div>
        <div class='rb-item-actions'>
          <button class='btn primary sm' onclick='restoreItem(\"${rbActiveTab}\",${item.id})'>↩️ Restore</button>
          <button class='btn danger sm'  onclick='permanentDelete(\"${rbActiveTab}\",${item.id},\"${safeTitle}\")'>🗑 Delete</button>
        </div>
      </div>`;
  }).join('');
}

async function restoreItem(type, id) {
  try {
    
    let url = '/trash/' + type + '/' + id + '/restore';
    if (type === 'users') {
      const item = rbData.users.find(i => i.id === id);
      if (item?.role) url += '?role=' + encodeURIComponent(item.role);
    }
    await apiFetch(url, { method: 'PUT' });
    showToast('↩️ Restored successfully!', 'success');
    rbData[type] = rbData[type].filter(i => i.id !== id);
    updateRbStats();
    renderRecycleBin();
  } catch (err) {
    showToast('Restore failed: ' + err.message, 'error');
  }
}

async function permanentDelete(type, id, name) {
  if (!confirm('Permanently delete "' + name + '"?\n\nThis cannot be undone.')) return;
  try {
    
    let url = '/trash/' + type + '/' + id;
    if (type === 'users') {
      const item = rbData.users.find(i => i.id === id);
      if (item?.role) url += '?role=' + encodeURIComponent(item.role);
    }
    await apiFetch(url, { method: 'DELETE' });
    showToast('🗑 Permanently deleted.', 'error');
    rbData[type] = rbData[type].filter(i => i.id !== id);
    updateRbStats();
    renderRecycleBin();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
  }
}

async function loadProfile() {
  
  try {
    const parts = token().split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      const jwtName = payload.name || payload.email || "Admin";
      const initials = jwtName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const av = document.getElementById("sidebarAvatar");
      const nm = document.getElementById("sidebarName");
      if (av) av.textContent = initials;
      if (nm) nm.textContent = jwtName;
    }
  } catch (_) {}

  try {
    const p = await apiFetch("/profile");
    if (!p) return;

    
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ""; };

    setVal("profileName",  p.name);
    setVal("profilePhone", p.phone);
    setVal("profileRole",  p.role);
    setText("profileDisplayName",  p.name || "Admin");
    setText("profileDisplayEmail", p.email || "");

    const initials = (p.name || "SA").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    setText("profileAvatar", initials);
    setText("sidebarAvatar", initials);
    setText("sidebarName",   p.name || "Admin");

    
    try {
      const parts = token().split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const expEl = document.getElementById("sessionExpiry");
        if (expEl && payload.exp) expEl.textContent = new Date(payload.exp * 1000).toLocaleString();
      }
    } catch (_) {}
  } catch (err) {
    showToast("Failed to load profile: " + err.message, "error");
  }
}

async function saveProfile() {
  try {
    await apiFetch("/profile", {
      method: "PUT",
      body: {
        name:  document.getElementById("profileName")?.value.trim(),
        phone: document.getElementById("profilePhone")?.value.trim(),
      },
    });
    showToast("💾 Profile updated!", "success");
    loadProfile();
  } catch (err) { showToast(err.message, "error"); }
}

function measurePasswordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)          score++;
  if (pw.length >= 12)         score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

async function changePassword() {
  const cur  = document.getElementById("pwCurrent")?.value;
  const nw   = document.getElementById("pwNew")?.value;
  const conf = document.getElementById("pwConfirm")?.value;
  if (!cur || !nw || !conf) return showToast("All fields are required.", "error");
  if (nw !== conf)           return showToast("Passwords do not match.", "error");
  if (nw.length < 8)         return showToast("Password must be at least 8 characters.", "error");
  try {
    await apiFetch("/change-password", {
      method: "PUT",
      body: { currentPassword: cur, newPassword: nw },
    });
    showToast("🔒 Password updated!", "success");
    ["pwCurrent","pwNew","pwConfirm"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    
    const fill  = document.getElementById("pwStrengthFill");
    const label = document.getElementById("pwStrengthLabel");
    if (fill)  fill.style.width = "0%";
    if (label) label.textContent = "";
  } catch (err) { showToast(err.message, "error"); }
}


function downloadCSV(rows, filename) {
  if (!rows || !rows.length) return showToast("No data to export.", "error");
  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(","),
    ...rows.map(r =>
      headers.map(h => {
        const v = r[h] == null ? "" : String(r[h]);
        return `"${v.replace(/"/g, '""')}"`;
      }).join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast("✅ CSV downloaded!", "success");
}

async function exportReport(type) {
  showToast("📥 Preparing export…", "info");
  try {
    if (type === "events") {
      const data = await eventsFetch("/all") || [];
      const rows = data.map(e => ({
        Title:        e.title || "",
        Club:         e.club || e.organizer_label || "",
        Category:     e.category || "",
        Date:         e.date ? e.date.slice(0, 10) : "",
        Status:       e.status || "",
        Participants: e.participants || 0,
        AcademicYear: e.academic_year || "",
      }));
      downloadCSV(rows, "evexa_events_report.csv");
    } else if (type === "users") {
      const data = await apiFetch("/users?role=all") || [];
      const rows = data.map(u => ({
        Name:       u.name || "",
        Email:      u.email || "",
        Role:       u.role || "",
        Department: u.department || "",
        Status:     u.status || "",
      }));
      downloadCSV(rows, "evexa_users_report.csv");
    } else if (type === "analytics") {
      const year = document.getElementById("analyticsYearFilter")?.value || "all";
      const d    = await apiFetch(`/analytics?academic_year=${year}`);
      if (!d) return;
      const rows = (d.eventsPerMonth || []).map(r => ({
        Month:               r.month,
        Events:              r.count,
        Participants:        (d.participationPerMonth || []).find(p => p.month === r.month)?.participants || 0,
      }));
      downloadCSV(rows, "evexa_analytics_report.csv");
    }
  } catch (err) {
    showToast("Export failed: " + err.message, "error");
  }
}


function setupTheme() {
  
  const saved = localStorage.getItem("evexa_theme");
  document.body.classList.toggle("light", saved === "light");
  document.documentElement.classList.toggle("light", saved === "light");
  const btn = document.getElementById("themeTopbarBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      applyTheme(document.body.classList.contains("light") ? "dark" : "light");
    });
  }
}

function applyTheme(mode) {
  const isLight = mode === "light";
  document.body.classList.toggle("light", isLight);
  localStorage.setItem("evexa_theme", mode);
  showToast(isLight ? "☀️ Light mode on" : "🌙 Dark mode on", "info");
}


let adminCalCursor   = new Date(); adminCalCursor.setDate(1);
let adminCalSelected = null;

function adminCalYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function adminToYMD(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "";
  return adminCalYMD(dt);
}

function adminFmtDate(ymd) {
  if (!ymd) return "N/A";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function renderAdminCalendar() {
  const grid  = document.getElementById("calGrid");
  const label = document.getElementById("calMonthLabel");
  if (!grid || !label) return;

  const year  = adminCalCursor.getFullYear();
  const month = adminCalCursor.getMonth();
  label.textContent = adminCalCursor.toLocaleString("en-IN", { month: "long", year: "numeric" });

  grid.innerHTML = "";

  
  ["Su","Mo","Tu","We","Th","Fr","Sa"].forEach(d => {
    const el = document.createElement("div");
    el.className = "admin-cal-weekday";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today       = adminCalYMD(new Date());
  const eventDates  = new Set(adminCalEvents.map(e => adminToYMD(e.date || e.event_date)));

  
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "admin-cal-day empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = adminCalYMD(new Date(year, month, day));
    const cell    = document.createElement("div");
    cell.className = "admin-cal-day";
    cell.textContent = day;

    if (dateStr === today)              cell.classList.add("today");
    if (eventDates.has(dateStr))        cell.classList.add("has-event");
    if (adminCalSelected === dateStr)   cell.classList.add("selected");

    cell.addEventListener("click", () => {
      
      if (adminCalSelected === dateStr) {
        adminCalSelected = null;
      } else {
        adminCalSelected = dateStr;
      }
      renderAdminCalendar();
      renderAdminCalEvents(adminCalSelected);
    });
    grid.appendChild(cell);
  }
}

function renderAdminCalEvents(dateStr) {
  const infoEl = document.getElementById("calSelectedInfo");
  const listEl = document.getElementById("calEventList");
  if (!infoEl || !listEl) return;
  if (!dateStr) {
    infoEl.style.display = "none";
    listEl.innerHTML = "";
    return;
  }
  infoEl.style.display = "";

  const evs = adminCalEvents.filter(e => adminToYMD(e.date || e.event_date) === dateStr);
  infoEl.textContent = `Events on ${adminFmtDate(dateStr)}`;

  if (!evs.length) {
    listEl.innerHTML = `<div class="admin-cal-empty">📭 No events on this day</div>`;
    return;
  }

  listEl.innerHTML = evs.map(e => `
    <div class="admin-cal-event-row">
      <div class="admin-cal-event-dot"></div>
      <div class="admin-cal-event-info">
        <div class="admin-cal-event-title">${e.name || e.title || "Untitled"}</div>
        <div class="admin-cal-event-meta">${e.club || e.organizer_name || e.organizer_label || "—"} · ${e.category || "—"}</div>
      </div>
    </div>`).join("");
}

function setupAdminCalendar() {
  const prev = document.getElementById("calPrev");
  const next = document.getElementById("calNext");
  if (prev && !prev.dataset.bound) {
    prev.dataset.bound = "1";
    prev.addEventListener("click", () => {
      adminCalCursor = new Date(adminCalCursor.getFullYear(), adminCalCursor.getMonth() - 1, 1);
      renderAdminCalendar();
      renderAdminCalEvents(adminCalSelected);
    });
  }
  if (next && !next.dataset.bound) {
    next.dataset.bound = "1";
    next.addEventListener("click", () => {
      adminCalCursor = new Date(adminCalCursor.getFullYear(), adminCalCursor.getMonth() + 1, 1);
      renderAdminCalendar();
      renderAdminCalEvents(adminCalSelected);
    });
  }
  renderAdminCalendar();
  renderAdminCalEvents(adminCalSelected);
}


document.addEventListener("DOMContentLoaded", () => {

  
  if (!token()) {
    window.location.href = "adsignin.html";
    return;
  }


  
  (function setupAutoLogout() {
    const TIMEOUT_MS = 10 * 60 * 1000; 
    const WARNING_MS =  9 * 60 * 1000; 
    let logoutTimer, warningTimer, warningOverlay;

    function clearWarning() {
      if (warningOverlay) {
        if (warningOverlay._tick) clearInterval(warningOverlay._tick);
        warningOverlay.remove();
        warningOverlay = null;
      }
    }

    function doLogoutNow() {
      clearWarning();
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminPage");
      window.location.href = "adsignin.html";
    }

    function showWarning() {
      if (warningOverlay) return;
      let secondsLeft = 60;
      warningOverlay = document.createElement("div");
      warningOverlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);" +
        "z-index:99999;display:flex;align-items:center;justify-content:center;";
      warningOverlay.innerHTML =
        "<div style=\"background:var(--surface);border:1px solid var(--border-2);border-radius:24px;" +
        "padding:40px 36px;max-width:380px;width:90%;text-align:center;" +
        "box-shadow:0 24px 60px rgba(0,0,0,.4);\">" +
        "<div style=\"font-size:48px;margin-bottom:16px;\">⏱️</div>" +
        "<div style=\"font-size:20px;font-weight:900;color:var(--text);margin-bottom:10px;\">Session Expiring</div>" +
        "<div style=\"font-size:13px;color:var(--text-3);font-weight:500;margin-bottom:8px;\">" +
        "You\'ll be logged out due to inactivity in</div>" +
        "<div id=\"autoLogoutCountdown\" style=\"font-size:32px;font-weight:900;color:#ef4444;margin-bottom:8px;\">60s</div>" +
        "<div style=\"font-size:12px;color:var(--text-3);font-weight:500;\">Move your mouse or press any key to stay.</div>" +
        "</div>";
      document.body.appendChild(warningOverlay);
      warningOverlay._tick = setInterval(function() {
        secondsLeft--;
        const el = document.getElementById("autoLogoutCountdown");
        if (el) el.textContent = secondsLeft + "s";
        if (secondsLeft <= 0) clearInterval(warningOverlay._tick);
      }, 1000);
    }

    function resetTimers() {
      clearWarning();
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      warningTimer = setTimeout(showWarning, WARNING_MS);
      logoutTimer  = setTimeout(doLogoutNow, TIMEOUT_MS);
    }

    ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"].forEach(function(evt) {
      document.addEventListener(evt, resetTimers, { passive: true });
    });

    resetTimers();
  })();

  
  setupTheme();

  
  setupAdminCalendar();

  
  document.getElementById("sidebarToggle")?.addEventListener("click", () => {
    const s = document.getElementById("sidebar");
    if (!s) return;
    if (window.innerWidth <= 768) s.classList.toggle("mobile-open");
    else s.classList.toggle("collapsed");
  });

  
  document.querySelectorAll(".nav-item[data-page]").forEach(el =>
    el.addEventListener("click", e => { e.preventDefault(); navigateTo(el.dataset.page); })
  );

  
  document.getElementById("closeModal")?.addEventListener("click", closeModal);
  document.getElementById("overlay")?.addEventListener("click", closeModal);

  
  ["evSearchInput","evYearFilter"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", loadEvents);
  });
  document.getElementById("evSearchInput")?.addEventListener("input", loadEvents);

  
  document.getElementById("clubYearFilter")?.addEventListener("change", loadClubs);

  
  document.getElementById("addUserBtn")?.addEventListener("click", addUser);
  document.getElementById("userSearchInput")?.addEventListener("input", loadUsers);
  document.getElementById("roleFilter")?.addEventListener("change", loadUsers);


  
  document.getElementById("logApplyBtn")?.addEventListener("click", loadLogs);
  document.getElementById("logSearch")?.addEventListener("input", loadLogs);
  document.getElementById("logTypeFilter")?.addEventListener("change", loadLogs);
  
  document.getElementById("analyticsReloadBtn")?.addEventListener("click", loadAnalytics);
  document.getElementById("analyticsYearFilter")?.addEventListener("change", loadAnalytics);

  
  document.getElementById("saveProfileBtn")?.addEventListener("click", saveProfile);
  document.getElementById("changePasswordBtn")?.addEventListener("click", changePassword);
  document.getElementById("pwNew")?.addEventListener("input", function () {
    const score  = measurePasswordStrength(this.value);
    const colors = ["", "#ef4444", "#f59e0b", "#f59e0b", "#22c55e", "#16a34a"];
    const labels = ["", "Weak", "Fair", "Fair", "Strong", "Very Strong"];
    const fill  = document.getElementById("pwStrengthFill");
    const label = document.getElementById("pwStrengthLabel");
    if (fill) {
      fill.style.width      = `${score * 20}%`;
      fill.style.background = colors[score] || "#ef4444";
    }
    if (label) {
      label.textContent = this.value ? (labels[score] || "") : "";
      label.style.color = colors[score] || "#9ca3af";
    }
  });

  
  const doLogout = () => {
    
    const overlay = document.createElement("div");
    overlay.id = "logoutOverlay";
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);
      z-index:9999;display:flex;align-items:center;justify-content:center;
    `;
    overlay.innerHTML = `
      <div style="
        background:var(--surface);border:1px solid var(--border-2);border-radius:24px;
        padding:40px 36px;max-width:380px;width:90%;text-align:center;
        box-shadow:0 24px 60px rgba(0,0,0,.4);animation:fadeInUp .2s ease;
      ">
        <div style="font-size:48px;margin-bottom:16px;">👋</div>
        <div style="font-size:20px;font-weight:900;color:var(--text);margin-bottom:10px;">Logging out?</div>
        <div style="font-size:13px;color:var(--text-3);font-weight:500;margin-bottom:28px;">
          Are you sure you want to sign out of your admin account?
        </div>
        <div style="display:flex;gap:12px;">
          <button id="logoutCancelBtn" style="
            flex:1;padding:13px;border-radius:14px;border:1px solid var(--border-2);
            background:var(--surface-2);color:var(--text);font-weight:700;font-size:14px;
            cursor:pointer;transition:.15s;
          ">Cancel</button>
          <button id="logoutConfirmBtn" style="
            flex:1;padding:13px;border-radius:14px;border:none;
            background:linear-gradient(135deg,#ef4444,#dc2626);color:white;
            font-weight:800;font-size:14px;cursor:pointer;transition:.15s;
            box-shadow:0 4px 16px rgba(239,68,68,.35);
          ">Yes, Logout</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("logoutCancelBtn").onclick = () => overlay.remove();
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.getElementById("logoutConfirmBtn").onclick = () => {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminPage");
      window.location.href = "../home.html";
    };
  };
  document.getElementById("logoutBtn")?.addEventListener("click", doLogout);
  document.getElementById("logoutBtn2")?.addEventListener("click", doLogout);

  
  document.getElementById("notifBtn")?.addEventListener("click", () =>
    showToast("🔔 3 new system notifications", "info")
  );

  document.getElementById("sidebarUserBtn")?.addEventListener("click", () => navigateTo("profile"));


  loadProfile().catch(() => {});
  const savedPage = localStorage.getItem("adminPage") || "dashboard";
  navigateTo(savedPage);
});
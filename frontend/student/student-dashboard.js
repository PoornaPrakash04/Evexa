const API_BASE = "http://localhost:5000/api";

async function apiFetch(endpoint) {
  const token = localStorage.getItem("authToken");
  if (!token) { window.location.href = "stsignin.html"; return null; }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    localStorage.removeItem("authToken");
    window.location.href = "stsignin.html";
    return null;
  }
  return res.json();
}

async function loadDashboard() {
  const profile = await apiFetch("/auth/me");
  if (!profile) return;

  // Name
  const name = profile.name || "Student";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
const studentPhoto = document.getElementById("studentPhoto");
if (studentPhoto && profile.avatar) {
  studentPhoto.src = `http://localhost:5000${profile.avatar}`;
}

const profilePhoto = document.getElementById("profilePhoto");
if (profilePhoto && profile.avatar) {
  profilePhoto.src = `http://localhost:5000${profile.avatar}`;
}
  const studentName = document.getElementById("studentName");
  const miniName    = document.getElementById("miniName");
  const profileName = document.getElementById("profileName");
  const miniAvatar  = document.querySelector(".mini-avatar");
  if (studentName) studentName.textContent = name;
  if (miniName)    miniName.textContent    = name;
  if (profileName) profileName.textContent = name;
  if (miniAvatar)  miniAvatar.textContent  = initials;

  // Reg number
  const reg = profile.roll_no || "—";
  const studentReg = document.getElementById("studentReg");
  const profileReg = document.getElementById("profileReg");
  if (studentReg) studentReg.textContent = reg;
  if (profileReg) profileReg.textContent = reg;

  // Contact
  const profileEmail = document.getElementById("profileEmail");
  const profilePhone = document.getElementById("profilePhone");
  if (profileEmail) profileEmail.textContent = profile.email || "—";
  if (profilePhone) profilePhone.textContent = profile.phone || "—";

  // Academic
  const profileDept = document.getElementById("profileDept");
  const profileYear = document.getElementById("profileYear");
  if (profileDept) profileDept.textContent = profile.department || "—";
  if (profileYear) profileYear.textContent = profile.class      || "—";

  // Tags
  const tagsEl = document.querySelector(".student-tags");
  if (tagsEl) {
    tagsEl.innerHTML = `
      <span class="tag">${profile.department || "—"}</span>
      <span class="tag">${profile.class      || "—"}</span>
      <span class="tag">${profile.roll_no    || "—"}</span>
    `;
  }

  await loadStats();
  await loadActivity();
  await loadExplore();
  await loadProgress();
await loadCalendar();
await loadRecommended();
}

async function loadStats() {
  try {
  const res = await fetch(`${API_BASE}/events`);
  const events = await res.json();
  const upcoming = events.filter(e => new Date(e.date) > new Date());
  const upcomingEl = document.getElementById("upcomingEvents");
  if (upcomingEl) upcomingEl.textContent = upcoming.length;
} catch (err) {
  console.error("Upcoming events error:", err);
}

  // ── Registered events ─────────────────────────────────────────────
  try {
    const registered = await apiFetch("/attendance/my-registrations");
    const regEl = document.getElementById("registeredEventsCount");
    if (registered && Array.isArray(registered) && regEl) {
      regEl.textContent = registered.length;
    }
  } catch (err) {
    console.error("Registered events error:", err);
  }

  // ── Joined clubs ──────────────────────────────────────────────────
  try {
    const clubs = await apiFetch("/clubs/my-clubs");
    const clubsEl = document.getElementById("totalClubs");
    if (clubs && Array.isArray(clubs) && clubsEl) {
      clubsEl.textContent = clubs.length;
    }
  } catch (err) {
    console.error("Clubs error:", err);
  }
}

async function loadActivity() {
  const registered = await apiFetch("/attendance/my-registrations");
  const list = document.getElementById("activityList");
  if (!list) return;

  if (!registered?.length) {
    list.innerHTML = `<p style="color:var(--muted);font-size:13px;padding:8px 0">No activity yet.</p>`;
    return;
  }

  list.innerHTML = registered.slice(0, 5).map(reg => `
    <div class="list-item">
      <div class="dot dot-purple"></div>
      <div class="li-text">
        <div class="li-title">Registered for "${reg.event_title}"</div>
        <div class="li-sub">
          ${reg.registered_at
            ? new Date(reg.registered_at).toLocaleDateString("en-IN")
            : "—"} • Event Registration
        </div>
      </div>
      <a class="mini-btn" href="event-details.html">View</a>
    </div>
  `).join("");
}
// ── Sidebar Toggle ────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("sidebarToggle");
  const sidebar   = document.getElementById("sidebar");
  const app       = document.querySelector(".app");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      if (app) app.classList.toggle("sidebar-collapsed");
    });
  }
});
async function loadExplore() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    const events = await res.json();

    const today     = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd  = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const next30    = new Date(today);
    next30.setDate(today.getDate() + 30);

    const todayEvents    = events.filter(e => {
      const d = new Date(e.date);
      return d >= today && d <= todayEnd;
    });

    const upcomingEvents = events.filter(e => {
      const d = new Date(e.date);
      return d > todayEnd && d <= next30;
    });

    // Render today's events
    const todayList = document.getElementById("todayEventsList");
    if (todayList) {
      if (!todayEvents.length) {
        todayList.innerHTML = `<p class="no-events">No events today.</p>`;
      } else {
        todayList.innerHTML = todayEvents.map(e => renderExploreCard(e)).join("");
      }
    }

    // Render upcoming events
    const upcomingList = document.getElementById("upcomingEventsList");
    if (upcomingList) {
      if (!upcomingEvents.length) {
        upcomingList.innerHTML = `<p class="no-events">No upcoming events in next 30 days.</p>`;
      } else {
        upcomingList.innerHTML = upcomingEvents.map(e => renderExploreCard(e)).join("");
      }
    }

  } catch (err) {
    console.error("Explore load error:", err);
  }
}

function renderExploreCard(e) {
  const eventDate = new Date(e.date).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric"
  });
  const fee = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";

  return `
    <div class="explore-event-item" onclick="window.location.href='event-single.html?id=${e.id}'">
      <div class="explore-event-info">
        <div class="explore-event-title">${e.title}</div>
        <div class="explore-event-meta">
          📅 ${eventDate} &nbsp;·&nbsp; 🏛️ ${e.venue || "TBA"} &nbsp;·&nbsp; 💰 ${fee}
        </div>
        <div class="explore-event-club">🏷️ ${e.club || "—"}</div>
      </div>
      <span class="mini-btn">View</span>
    </div>
  `;
}
// ── Boot ─────────────────────────────────────────────
loadDashboard();

// ── 1. MY PROGRESS ──────────────────────────────────────────
async function loadProgress() {
  try {
    const registered = await apiFetch("/attendance/my-registrations");
    if (!registered || !Array.isArray(registered)) return;

    const total      = registered.length;
    const points     = total * 10; // 10 points per event
    const attended   = total;      // use total registered as attended (update if you have attendance tracking)
    const pct        = total > 0 ? Math.min(Math.round((attended / Math.max(total, 1)) * 100), 100) : 0;

    // Streak — count consecutive days with registrations
    const dates = registered
      .map(r => r.registered_at ? new Date(r.registered_at).toDateString() : null)
      .filter(Boolean);
    const uniqueDates = [...new Set(dates)].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    let check  = new Date();
    for (const d of uniqueDates) {
      if (new Date(d).toDateString() === check.toDateString()) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else break;
    }

    // Level logic
    let levelLabel, levelPct, levelSub;
    if (total === 0)       { levelLabel = "Newcomer → Beginner";  levelPct = 0;   levelSub = "Register for your first event!"; }
    else if (total < 5)    { levelLabel = "Beginner → Explorer";  levelPct = (total/5)*100;  levelSub = `${5-total} more events to reach Explorer`; }
    else if (total < 15)   { levelLabel = "Explorer → Achiever";  levelPct = ((total-5)/10)*100; levelSub = `${15-total} more events to reach Achiever`; }
    else if (total < 30)   { levelLabel = "Achiever → Champion";  levelPct = ((total-15)/15)*100; levelSub = `${30-total} more events to reach Champion`; }
    else                   { levelLabel = "🏆 Champion";           levelPct = 100;  levelSub = "You've reached the highest level!"; }

    // Update DOM
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("attendedCount",  attended);
    set("pointsCount",    points);
    set("attendancePct",  pct + "%");
    set("currentStreak",  streak);
    set("streakCount",    streak);
    set("levelLabel",     levelLabel);
    set("levelSub",       levelSub);

    const bar = document.getElementById("levelBar");
    if (bar) setTimeout(() => { bar.style.width = Math.min(levelPct, 100) + "%"; }, 300);

  } catch (err) {
    console.error("Progress load error:", err);
  }
}

// ── 2. MINI CALENDAR ─────────────────────────────────────────
let calendarEvents = [];
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();

async function loadCalendar() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    calendarEvents = await res.json();
    renderCalendar();

    document.getElementById("calPrev")?.addEventListener("click", () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });

    document.getElementById("calNext")?.addEventListener("click", () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });
  } catch (err) {
    console.error("Calendar load error:", err);
  }
}

function renderCalendar() {
  const label = document.getElementById("calMonthLabel");
  if (label) label.textContent = new Date(calYear, calMonth).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  const cal = document.getElementById("miniCalendar");
  if (!cal) return;

  const today    = new Date();
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // Build event date map for this month
  const eventMap = {}; // { "2026-3-15": [event, ...] }
  calendarEvents.forEach(e => {
    const d = new Date(e.date);
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      const key = `${calYear}-${calMonth}-${d.getDate()}`;
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push(e);
    }
  });

  const weekdays = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  let html = `<div class="cal-weekdays">${weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join("")}</div>`;
  html += `<div class="cal-days">`;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-day empty"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const key      = `${calYear}-${calMonth}-${day}`;
    const isToday  = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear;
    const hasEvent = !!eventMap[key];
    const classes  = ["cal-day", isToday ? "today" : "", hasEvent ? "has-event" : ""].filter(Boolean).join(" ");
    const events   = hasEvent ? JSON.stringify(eventMap[key]).replace(/"/g, "&quot;") : "";

    html += `<div class="${classes}" data-day="${day}" data-events="${events}" onclick="calDayClick(this)">${day}</div>`;
  }

  html += `</div>`;
  cal.innerHTML = html;

  // Hide detail panel on re-render
  const detail = document.getElementById("calEventDetail");
  if (detail) detail.style.display = "none";
}

function calDayClick(el) {
  if (!el.classList.contains("has-event")) return;

  // Remove previous selected
  document.querySelectorAll(".cal-day.selected").forEach(d => d.classList.remove("selected"));
  el.classList.add("selected");

  const events = JSON.parse(el.getAttribute("data-events").replace(/&quot;/g, '"'));
  const e      = events[0]; // show first event for that day

  const detail    = document.getElementById("calEventDetail");
  const titleEl   = document.getElementById("calDetailTitle");
  const metaEl    = document.getElementById("calDetailMeta");
  const linkEl    = document.getElementById("calDetailLink");

  if (!detail || !titleEl || !metaEl || !linkEl) return;

  const date = new Date(e.date).toLocaleDateString("en-IN", { dateStyle: "medium" });
  const fee  = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";

  titleEl.textContent = e.title;
  metaEl.textContent  = `📅 ${date} · 🏛️ ${e.venue || "TBA"} · 💰 ${fee} · 🏷️ ${e.club || "—"}`;
  if (events.length > 1) metaEl.textContent += ` (+${events.length - 1} more)`;
  linkEl.href = `event-single.html?id=${e.id}`;

  detail.style.display = "block";
}

// ── 3. RECOMMENDED EVENTS ─────────────────────────────────────
async function loadRecommended() {
  try {
    const [eventsRes, profile, registered] = await Promise.all([
      fetch(`${API_BASE}/events`).then(r => r.json()),
      apiFetch("/auth/me"),
      apiFetch("/attendance/my-registrations")
    ]);

    if (!eventsRes || !profile) return;

    const dept          = (profile.department || "").toLowerCase();
    const registeredIds = new Set((registered || []).map(r => String(r.event_id)));
    const now           = new Date();

    // Score each upcoming, unregistered event
    const scored = eventsRes
      .filter(e => !registeredIds.has(String(e.id)) && new Date(e.date) > now)
      .map(e => {
        let score  = 0;
        let reason = "Popular event";

        const clubLower = (e.club || "").toLowerCase();
        const typeLower = (e.type || "").toLowerCase();

        if (dept && (clubLower.includes(dept) || typeLower.includes(dept))) {
          score += 30; reason = `Matches your department (${profile.department})`;
        }
        if (e.registration_fee === 0 || e.registration_fee === null) {
          score += 10; reason = reason === "Popular event" ? "Free event" : reason;
        }
        if (e.capacity && e.registered_count > 0) {
          score += Math.min(e.registered_count, 20);
        }
        // Dept-specific club matching
        if (dept.includes("it") || dept.includes("computer") || dept.includes("cse")) {
          if (clubLower.includes("tech") || clubLower.includes("cyber") || clubLower.includes("code") || clubLower.includes("ieee")) {
            score += 20; reason = "Matches your interests";
          }
        }

        return { ...e, score, reason };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const list = document.getElementById("recommendedList");
    if (!list) return;

    if (!scored.length) {
      list.innerHTML = `<p class="no-events">No recommendations yet. Register for some events first!</p>`;
      return;
    }

    const icons = ["🎯", "⚡", "🚀", "💡"];
    list.innerHTML = scored.map((e, i) => {
      const date = new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      const fee  = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";
      return `
        <div class="rec-event-item" onclick="window.location.href='event-single.html?id=${e.id}'">
          <div class="rec-event-badge">${icons[i] || "🎟"}</div>
          <div>
            <div class="rec-event-title">${e.title}</div>
            <div class="rec-event-meta">📅 ${date} · 💰 ${fee} · 🏷️ ${e.club || "—"}</div>
            <div class="rec-event-reason">✨ ${e.reason}</div>
          </div>
        </div>`;
    }).join("");

  } catch (err) {
    console.error("Recommended load error:", err);
  }
}
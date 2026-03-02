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

  if (!res.ok) {
    console.warn(`apiFetch ${endpoint} failed with ${res.status}`);
    return null;
  }

  return res.json();
}

/* ============================================================
   SIDEBAR FIX — matches faculty-dashboard.js pattern exactly
   
   In your student-dashboard.js, find and REPLACE the entire
   DOMContentLoaded block with this one.
   ============================================================ */

document.getElementById("sidebarToggle").addEventListener("click", () => {
    const s = document.getElementById("sidebar");
    if (window.innerWidth <= 768) s.classList.toggle("mobile-open");
    else s.classList.toggle("collapsed");
  });

/* ============================================================
   DASHBOARD LOAD
   ============================================================ */
async function loadDashboard() {
  const profile = await apiFetch("/auth/me");
  if (!profile) return;

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

  const reg = profile.roll_no || "—";
  const profileReg = document.getElementById("profileReg"); 
  if (profileReg) profileReg.textContent = reg;

  const profileEmail = document.getElementById("profileEmail");
  const profilePhone = document.getElementById("profilePhone");
  if (profileEmail) profileEmail.textContent = profile.email || "—";
  if (profilePhone) profilePhone.textContent = profile.phone || "—";

  const profileDept = document.getElementById("profileDept");
  const profileYear = document.getElementById("profileYear");
  if (profileDept) profileDept.textContent = profile.department || "—";
  if (profileYear) profileYear.textContent = profile.class      || "—";

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
  initNotifications();
}

document.querySelector(".mini-user").addEventListener("click", () => {
  window.location.href = "account-setting.html";
});

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

  try {
    const registered = await apiFetch("/attendance/my-registrations");
    const regEl = document.getElementById("registeredEventsCount");
    if (registered && Array.isArray(registered) && regEl) {
      regEl.textContent = registered.length;
    }
  } catch (err) {
    console.error("Registered events error:", err);
  }

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
    list.innerHTML = `<p style="color:var(--text-3);font-size:13px;padding:8px 0">No activity yet.</p>`;
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

async function loadExplore() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    const events = await res.json();

    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    const next30   = new Date(today);
    next30.setDate(today.getDate() + 30);

    const todayEvents    = events.filter(e => {
      const d = new Date(e.date);
      return d >= today && d <= todayEnd;
    });
    const upcomingEvents = events.filter(e => {
      const d = new Date(e.date);
      return d > todayEnd && d <= next30;
    });

    const todayList = document.getElementById("todayEventsList");
    if (todayList) {
      todayList.innerHTML = todayEvents.length
        ? todayEvents.map(e => renderExploreCard(e)).join("")
        : `<p class="no-events">No events today.</p>`;
    }

    const upcomingList = document.getElementById("upcomingEventsList");
    if (upcomingList) {
      upcomingList.innerHTML = upcomingEvents.length
        ? upcomingEvents.map(e => renderExploreCard(e)).join("")
        : `<p class="no-events">No upcoming events in next 30 days.</p>`;
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
        <div class="explore-event-meta">📅 ${eventDate} &nbsp;·&nbsp; 🏛️ ${e.venue || "TBA"} &nbsp;·&nbsp; 💰 ${fee}</div>
        <div class="explore-event-club">🏷️ ${e.club || "—"}</div>
      </div>
      <span class="mini-btn">View</span>
    </div>
  `;
}

async function loadProgress() {
  try {
    const registered = await apiFetch("/attendance/my-registrations");
    if (!registered || !Array.isArray(registered)) return;

    const now = new Date();

    // Split into past and upcoming
    const pastEvents     = registered.filter(r => new Date(r.date) < now);
    const upcomingEvents = registered.filter(r => new Date(r.date) >= now);

    const attended = pastEvents.length;
    const total    = registered.length;
    const points   = attended * 10;  
    const pct      = total > 0 ? Math.min(Math.round((attended / total) * 100), 100) : 0;

    // Streak based on past events only
    const dates = pastEvents
      .map(r => r.date ? new Date(r.date).toDateString() : null)
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

    // Level based on past attended events
    let levelLabel, levelPct, levelSub;
    if (attended === 0)      { levelLabel = "Newcomer → Beginner";  levelPct = 0;                    levelSub = "Register for your first event!"; }
    else if (attended < 5)   { levelLabel = "Beginner → Explorer";  levelPct = (attended/5)*100;     levelSub = `${5-attended} more events to reach Explorer`; }
    else if (attended < 15)  { levelLabel = "Explorer → Achiever";  levelPct = ((attended-5)/10)*100;  levelSub = `${15-attended} more events to reach Achiever`; }
    else if (attended < 30)  { levelLabel = "Achiever → Champion";  levelPct = ((attended-15)/15)*100; levelSub = `${30-attended} more events to reach Champion`; }
    else                     { levelLabel = "🏆 Champion";           levelPct = 100;                  levelSub = "You've reached the highest level!"; }

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("attendedCount",          attended);
    set("pointsCount",            points);
    set("attendancePct",          pct + "%");
    set("currentStreak",          streak);
    set("streakCount",            streak);
    set("levelLabel",             levelLabel);
    set("levelSub",               levelSub);
    set("upcomingRegisteredCount", upcomingEvents.length);  // ✅ now populates the card

    const bar = document.getElementById("levelBar");
    if (bar) setTimeout(() => { bar.style.width = Math.min(levelPct, 100) + "%"; }, 300);

  } catch (err) {
    console.error("Progress load error:", err);
  }
}
/* ── MINI CALENDAR ─────────────────────────────────────────── */
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

  const today       = new Date();
  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const eventMap = {};
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

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

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

  const detail = document.getElementById("calEventDetail");
  if (detail) detail.style.display = "none";
}

function calDayClick(el) {
  if (!el.classList.contains("has-event")) return;

  const detail = document.getElementById("calEventDetail");

  // ✅ If clicking the already-selected day, deselect and hide
  if (el.classList.contains("selected")) {
    el.classList.remove("selected");
    if (detail) detail.style.display = "none";
    return;
  }

  document.querySelectorAll(".cal-day.selected").forEach(d => d.classList.remove("selected"));
  el.classList.add("selected");

  const events  = JSON.parse(el.getAttribute("data-events").replace(/&quot;/g, '"'));
  const e       = events[0];
  const titleEl = document.getElementById("calDetailTitle");
  const metaEl  = document.getElementById("calDetailMeta");
  const linkEl  = document.getElementById("calDetailLink");

  if (!detail || !titleEl || !metaEl || !linkEl) return;

  const date = new Date(e.date).toLocaleDateString("en-IN", { dateStyle: "medium" });
  const fee  = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";

  titleEl.textContent = e.title;
  metaEl.textContent  = `📅 ${date} · 🏛️ ${e.venue || "TBA"} · 💰 ${fee} · 🏷️ ${e.club || "—"}`;
  if (events.length > 1) metaEl.textContent += ` (+${events.length - 1} more)`;
  linkEl.href = `event-single.html?id=${e.id}`;

  detail.style.display = "block";
}
/* ── RECOMMENDED EVENTS ────────────────────────────────────── */
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

function logout() {
  const modal = document.createElement("div");
  modal.id = "logoutModal";
  modal.innerHTML = `
    <div onclick="document.getElementById('logoutModal').remove()"
         style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2000;backdrop-filter:blur(3px);"></div>
    <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2001;
                background:var(--surface,#fff);border-radius:18px;width:min(380px,90vw);
                padding:32px 28px;box-shadow:0 24px 60px rgba(0,0,0,0.18);text-align:center;">
      <div style="font-size:40px;margin-bottom:12px;">👋</div>
      <div style="font-size:18px;font-weight:700;color:var(--text-1,#111);margin-bottom:8px;">
        Logging out?
      </div>
      <div style="font-size:13px;color:var(--text-3,#888);margin-bottom:28px;">
        Are you sure you want to logout from your account?
      </div>
      <div style="display:flex;gap:12px;justify-content:center;">
        <button onclick="document.getElementById('logoutModal').remove()"
                style="flex:1;padding:11px 0;border-radius:10px;border:1px solid var(--border,#e0e0e0);
                       background:var(--surface-2,#f5f5f5);color:var(--text-1,#111);
                       font-size:14px;font-weight:600;cursor:pointer;">
          Cancel
        </button>
        <button onclick="localStorage.removeItem('authToken');window.location.href='stsignin.html';"
                style="flex:1;padding:11px 0;border-radius:10px;border:none;
                       background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;
                       font-size:14px;font-weight:600;cursor:pointer;">
          Yes, Logout
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Close on Escape
  const onKey = e => { if (e.key === "Escape") { modal.remove(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
}

// ── Notification Bell ─────────────────────────────────────────
function initNotifications() {
  const btn      = document.getElementById("notifBtn");
  const dropdown = document.getElementById("notifDropdown");
  const clearBtn = document.getElementById("notifClear");
  const dot      = document.getElementById("notifDot");
  if (!btn || !dropdown) return;

  function getNotifs() {
    return JSON.parse(localStorage.getItem("evexa_notifs") || "[]");
  }
  function saveNotifs(notifs) {
    localStorage.setItem("evexa_notifs", JSON.stringify(notifs));
  }

  function timeAgo(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return "just now";
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  function renderNotifs() {
    const list   = document.getElementById("notifList");
    const notifs = getNotifs();
    const unread = notifs.filter(n => !n.read).length;

    // Update dot
    if (dot) {
      dot.classList.toggle("show", unread > 0);
      dot.textContent = unread > 9 ? "9+" : (unread > 0 ? unread : "");
    }

    // Update header count
    const titleEl = document.getElementById("notifDropdownTitle");
    if (titleEl) {
      titleEl.textContent = unread > 0 ? `Notifications (${unread})` : "Notifications";
    }

    if (!list) return;
    if (!notifs.length) {
      list.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icon">🔔</div>
          <div class="notif-empty-text">You're all caught up!</div>
          <div class="notif-empty-sub">No notifications yet.</div>
        </div>`;
      return;
    }

    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read ? "" : "unread"}" data-id="${n.id}">
        <div class="notif-item-icon">${n.icon || "🔔"}</div>
        <div class="notif-item-body">
          <div class="notif-item-title">${n.title}</div>
          <div class="notif-item-sub">${n.message}</div>
          <div class="notif-item-time">${timeAgo(n.timestamp || n.time)}</div>
        </div>
        ${!n.read ? `<div class="notif-unread-dot"></div>` : ""}
      </div>
    `).join("");
  }

  // Animate bell on new notifications
  function ringBell() {
    btn.classList.add("ring");
    setTimeout(() => btn.classList.remove("ring"), 600);
  }

  // Toggle dropdown
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains("open");
    dropdown.classList.toggle("open");

    if (!isOpen) {
      // Mark all as read after short delay (user can see unread state first)
      setTimeout(() => {
        const notifs = getNotifs().map(n => ({ ...n, read: true }));
        saveNotifs(notifs);
        renderNotifs();
      }, 800);
    }
  });

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove("open");
    }
  });

  // Clear all with animation
  clearBtn?.addEventListener("click", () => {
    const items = document.querySelectorAll(".notif-item");
    items.forEach((el, i) => {
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateX(20px)";
        el.style.transition = ".2s ease";
      }, i * 40);
    });
    setTimeout(() => {
      saveNotifs([]);
      renderNotifs();
    }, items.length * 40 + 200);
  });

  renderNotifs();

  // Check for upcoming events and auto-generate notifications
  autoGenerateNotifs();
}

// ── ⚡ ONLY THIS FUNCTION WAS CHANGED — announcement notifications added ──
async function autoGenerateNotifs() {
  try {
    // Fetch registrations AND announcements in parallel
    const [registered, announcements] = await Promise.all([
      apiFetch("/attendance/my-registrations"),
      apiFetch("/announcements/student"),
    ]);

    const existing    = JSON.parse(localStorage.getItem("evexa_notifs") || "[]");
    const existingIds = new Set(existing.map(n => n.sourceId).filter(Boolean));
    const now         = new Date();
    const newNotifs   = [];

    // ── Announcement notifications (newest first) ──────────
    const TYPE_ICON = { Urgent: "🚨", Event: "📢", Info: "ℹ️", General: "📣" };
    (announcements || []).forEach(a => {
      const sourceId = `announcement-${a.id}`;
      if (existingIds.has(sourceId)) return; // already stored, skip
      newNotifs.push({
        id:        Date.now() + Math.random(),
        sourceId,
        icon:      TYPE_ICON[a.type] || "📢",
        title:     a.title,
        message:   `${a.club}: ${a.message}`,
        timestamp: a.created_at || new Date().toISOString(),
        time:      new Date(a.created_at).toLocaleString("en-IN"),
        read:      false,
      });
    });

    // ── Event reminder notifications (unchanged) ───────────
    (registered || []).forEach(r => {
      if (!r.date) return;
      const eventDate = new Date(r.date);
      const diffDays  = Math.ceil((eventDate - now) / (1000 * 60 * 60 * 24));

      // Notify if event is tomorrow
      const notifId = `upcoming-${r.event_id}-1day`;
      if (diffDays === 1 && !existingIds.has(notifId)) {
        newNotifs.push({
          id:        Date.now() + Math.random(),
          sourceId:  notifId,
          icon:      "⏰",
          title:     "Event Tomorrow!",
          message:   `"${r.event_title}" is happening tomorrow. Don't miss it!`,
          timestamp: new Date().toISOString(),
          time:      new Date().toLocaleString("en-IN"),
          read:      false
        });
      }

      // Notify if event is in 3 days
      const notifId3 = `upcoming-${r.event_id}-3day`;
      if (diffDays === 3 && !existingIds.has(notifId3)) {
        newNotifs.push({
          id:        Date.now() + Math.random(),
          sourceId:  notifId3,
          icon:      "📅",
          title:     "Upcoming Event",
          message:   `"${r.event_title}" is in 3 days. Get ready!`,
          timestamp: new Date().toISOString(),
          time:      new Date().toLocaleString("en-IN"),
          read:      false
        });
      }
    });

    if (newNotifs.length) {
      const updated = [...newNotifs, ...existing].slice(0, 20);
      localStorage.setItem("evexa_notifs", JSON.stringify(updated));
      // Ring bell for new ones
      const btn = document.getElementById("notifBtn");
      if (btn) { btn.classList.add("ring"); setTimeout(() => btn.classList.remove("ring"), 600); }
      // Re-render dot
      const dot = document.getElementById("notifDot");
      const unread = updated.filter(n => !n.read).length;
      if (dot) dot.classList.toggle("show", unread > 0);
    }
  } catch (err) {
    console.error("Auto-notif error:", err);
  }
}

function addNotification(icon, title, message) {
  const notifs = JSON.parse(localStorage.getItem("evexa_notifs") || "[]");
  notifs.unshift({
    id:        Date.now(),
    icon,
    title,
    message,
    timestamp: new Date().toISOString(),
    time:      new Date().toLocaleString("en-IN"),
    read:      false
  });
  localStorage.setItem("evexa_notifs", JSON.stringify(notifs.slice(0, 20)));
  const dot = document.getElementById("notifDot");
  if (dot) dot.classList.add("show");
  const btn = document.getElementById("notifBtn");
  if (btn) { btn.classList.add("ring"); setTimeout(() => btn.classList.remove("ring"), 600); }
}

/* ── UPCOMING REGISTERED MODAL ──────────────────────────────── */
/* ── UPCOMING REGISTERED MODAL ──────────────────────────────── 
   Replace the existing openUpcomingModal / closeUpcomingModal
   functions in student-dashboard.js with these
   ──────────────────────────────────────────────────────────── */

const ACCENT_CLASSES = ["accent-v", "accent-p", "accent-c", "accent-l"];
const BADGE_ICONS    = ["🛡️", "🤖", "🎨", "💡", "🚀", "⚡", "🎯", "📡"];

function getCountdownClass(diffDays) {
  if (diffDays <= 1)  return "urgent";
  if (diffDays <= 3)  return "soon";
  if (diffDays <= 14) return "medium";
  return "far";
}

function getCountdownLabel(diffDays) {
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return `In ${diffDays} days`;
}

async function openUpcomingModal() {
  const overlay = document.getElementById("upcomingModalOverlay");
  const modal   = document.getElementById("upcomingModal");
  const list    = document.getElementById("upcomingModalList");
  if (!overlay || !modal || !list) return;

  // Show immediately with loading state
  overlay.style.display = "block";
  modal.style.display   = "flex";
  list.innerHTML = `<p class="modal-empty">Loading...</p>`;

  try {
    const registered = await apiFetch("/attendance/my-registrations");

    if (!registered || !Array.isArray(registered)) {
      list.innerHTML = `<p class="modal-empty">No registered events found.</p>`;
      return;
    }

    const now      = new Date();
    const upcoming = registered
      .filter(r => r.date && new Date(r.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!upcoming.length) {
      list.innerHTML = `<p class="modal-empty">No upcoming registered events.</p>`;
      return;
    }

    list.innerHTML = upcoming.map((r, i) => {
      const eventDate    = new Date(r.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      const diffDays     = Math.ceil((new Date(r.date) - now) / (1000 * 60 * 60 * 24));
      const accentClass  = ACCENT_CLASSES[i % ACCENT_CLASSES.length];
      const icon         = BADGE_ICONS[i % BADGE_ICONS.length];
      const cdClass      = getCountdownClass(diffDays);
      const cdLabel      = getCountdownLabel(diffDays);

      return `
        <div class="modal-event-item ${accentClass}"
             onclick="window.location.href='event-single.html?id=${r.event_id}'">
          <div class="modal-event-badge">${icon}</div>
          <div class="modal-event-info">
            <div class="modal-event-title">${r.event_title || "Untitled Event"}</div>
            <div class="modal-event-meta">
              <span>📆 ${eventDate}</span>
              ${r.venue ? `<span class="modal-event-meta-sep">·</span><span>🏛 ${r.venue}</span>` : ""}
              ${r.club  ? `<span class="modal-event-meta-sep">·</span><span>🏷 ${r.club}</span>`  : ""}
            </div>
          </div>
          <span class="modal-countdown ${cdClass}">${cdLabel}</span>
        </div>`;
    }).join("");

  } catch (err) {
    console.error("Upcoming modal error:", err);
    list.innerHTML = `<p class="modal-empty" style="color:#f87171;">Failed to load events.</p>`;
  }
}

function closeUpcomingModal() {
  const overlay = document.getElementById("upcomingModalOverlay");
  const modal   = document.getElementById("upcomingModal");
  if (overlay) overlay.style.display = "none";
  if (modal)   modal.style.display   = "none";
}

// Close on Escape key (keep this in place of the existing one)
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeUpcomingModal();
});

/* ── Boot ───────────────────────────────────────────────────── */
loadDashboard();
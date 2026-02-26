// ===========================
//  club-single.js — connected to backend
// ===========================
{
const STATIC_BASE = API_BASE.replace("/api", "");
const urlParams  = new URLSearchParams(window.location.search);
const urlId      = urlParams.get("id");
const ssId       = sessionStorage.getItem("selectedClubId");
const selectedId = parseInt(urlId || ssId || "1", 10);



// ── Category colors (same as clubs.js) ───────────────────
const categoryColors = {
  Technical: "#6d5efc",
  Social:    "#f59e0b",
  Science:   "#3b82f6",
  Creative:  "#ec4899",
  Sports:    "#10b981",
  Cultural:  "#f97316",
};

const categoryIcons = {
  Technical: "⚙️",
  Social:    "🤝",
  Science:   "🚀",
  Creative:  "🎨",
  Sports:    "⚽",
  Cultural:  "🎭",
};

// ── Main loader ───────────────────────────────────────────
async function loadClubDetail() {
  const content = document.getElementById("pageContent");
  if (!content) { console.error("pageContent not found"); return; }

  try {
    const token   = localStorage.getItem("authToken");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await fetch(`${API_BASE}/clubs/${selectedId}`, { headers });
    if (!res.ok) throw new Error("Club not found");
    const club = await res.json();

    let memberCount = club.member_count ?? "—";
    try {
      const mRes = await fetch(`${API_BASE}/clubs/${selectedId}/members`);
      if (mRes.ok) {
        const mData = await mRes.json();
        memberCount = mData.count ?? mData.length ?? memberCount;
      }
    } catch (_) {}

    let isJoined = false;
    if (token) {
      try {
        const myRes = await fetch(`${API_BASE}/clubs/my-clubs`, { headers });
        if (myRes.ok) {
          const myClubs = await myRes.json();
          isJoined = myClubs.some(c => c.club_id === club.club_id);
        }
      } catch (_) {}
    }

    let events = [];
    try {
      const evRes = await fetch(`${API_BASE}/clubs/${selectedId}/events`, { headers });
      if (evRes.ok) events = await evRes.json();
    } catch (_) {}

    // ✅ pass content as last argument
    renderClub(club, memberCount, isJoined, events, content);

  } catch (err) {
    console.error("Failed to load club:", err);
    // ✅ content is defined here too
    content.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:14px;">🔎</div>
        <div style="font-size:20px;font-weight:900;color:#111827;margin-bottom:8px;">Club not found</div>
        <p style="color:#6b7280;margin-bottom:20px;">This club doesn't exist or failed to load.</p>
        <a href="clubs.html" class="back-btn">← Back to Clubs</a>
      </div>`;
  }
}
// ── Render the club page ──────────────────────────────────
function renderClub(club, memberCount, isJoined, events = [], content) {

  // Map API fields → display values
  const name        = club.club_name        || "Unnamed Club";
  const category    = club.club_category    || "General";
  const description = club.description      || club.short_description || "No description available.";
  const founded     = club.year_of_establishment || "—";
  const contact     = club.contact_email    || club.contact || "—";
  const schedule    = club.meeting_schedule || club.meet_schedule || "—";
  const tagline     = club.tagline          || club.short_description || "";
  const color       = categoryColors[category] || "#6d5efc";
  const icon = club.club_logo
  ? `<img src="${STATIC_BASE}/${club.club_logo}"
       alt="${name} logo"
       onerror="this.style.display='none'"
       style="width:80px;height:80px;object-fit:contain;border-radius:12px;" />`
  : (categoryIcons[category] || "🏫");

  // Goals — backend may return array or comma string
  let goals = [];
  if (Array.isArray(club.goals))         goals = club.goals;
  else if (typeof club.goals === "string") goals = club.goals.split(",").map(g => g.trim()).filter(Boolean);

  // Leadership — use backend fields if present, else graceful fallback
  const chairperson   = club.chairperson    || club.chair     || null;
  const viceChair     = club.vice_chair     || club.vicechair || null;
  const facultyAdvisor = club.faculty_advisor || club.advisor  || null;

  // Update page title
  document.title = `${name} | EVEXA`;
  const topbarTitle = document.getElementById("topbarTitle");
  if (topbarTitle) topbarTitle.textContent = name;

  // ── Goals HTML ──
  const goalsHtml = goals.length
    ? goals.map(g => `
        <div class="goal-item">
          <div class="goal-dot" style="background:${color}"></div>
          <span>${g}</span>
        </div>`).join("")
    : `<div style="color:#9ca3af;font-size:14px;">No goals listed.</div>`;

  // ── Events HTML ──
  const STATUS_LABEL = { open:"Open", registered:"Registered", upcoming:"Upcoming", full:"Full" };
  const STATUS_COLOR  = { open:"#16a34a", registered:"#5b21b6", upcoming:"#b45309", full:"#dc2626" };

  let eventsHtml = "";
  if (events.length > 0) {
    const eventCards = events.map(ev => {
      const total  = ev.total_seats  ?? ev.seats?.total  ?? 0;
      const filled = ev.filled_seats ?? ev.seats?.filled ?? 0;
      const left   = total - filled;
      const status = ev.status || "upcoming";
      return `
        <div class="club-event-card" style="cursor:pointer;"
          onclick="sessionStorage.setItem('selectedEventId','${ev.event_id ?? ev.id}');
                   window.location.href='event-single.html?id=${ev.event_id ?? ev.id}'">
          ${ev.banner_url || ev.banner
            ? `<img class="club-event-banner" src="${ev.banner_url || ev.banner}" alt="${ev.event_name || ev.name}" />`
            : `<div class="club-event-banner" style="background:${color}22;display:flex;align-items:center;justify-content:center;font-size:32px;">📅</div>`}
          <div class="club-event-body">
            <div class="club-event-name">${ev.event_name || ev.name || "Event"}</div>
            <div class="club-event-meta">📅 ${ev.event_date || ev.date || "TBD"} · ${ev.event_time || ev.time || ""}</div>
            <div class="club-event-meta">🏛️ ${ev.venue || "—"}</div>
            <div class="club-event-footer">
              <span class="status-badge-sm" style="color:${STATUS_COLOR[status]}">${STATUS_LABEL[status] || status}</span>
              <span style="font-size:12px;color:#6b7280;font-weight:700;">${total > 0 ? (left > 0 ? left + " seats left" : "Full") : ""}</span>
            </div>
          </div>
        </div>`;
    }).join("");
    eventsHtml = `
      <div class="cs-section">
        <div class="cs-section-title">Upcoming Events</div>
        <div class="club-events-row">${eventCards}</div>
      </div>`;
  } else {
    eventsHtml = `
      <div class="cs-section">
        <div class="cs-section-title">Upcoming Events</div>
        <div class="no-events-msg">No upcoming events from this club right now.</div>
      </div>`;
  }

  // ── Join button HTML ──
  const joinBtnHtml = isJoined
    ? `<button class="btn-join joined" id="joinBtn">✅ Joined</button>`
    : `<button class="btn-join" id="joinBtn"
         style="background:linear-gradient(135deg,${color},${color}cc)">
         Join Club →
       </button>`;

  // ── Leadership HTML ──
  function personRow(person, role, colorStyle) {
    if (!person) return "";
    const avatar = person.avatar || person.name?.charAt(0) || "?";
    const year   = person.year   || person.dept || "";
    return `
      <div class="person-row">
        <div class="person-avatar" style="background:${colorStyle}">${avatar}</div>
        <div>
          <div class="person-name">${person.name || "—"}</div>
          <div class="person-role">${role}</div>
          <div class="person-year">${year}</div>
        </div>
      </div>`;
  }

  const leadershipHtml = (chairperson || viceChair || facultyAdvisor)
    ? `
      <div class="cs-card">
        <div class="cs-card-title">Leadership</div>
        ${personRow(chairperson,    "Chairperson",      color)}
        ${personRow(viceChair,      "Vice Chairperson", color + "99")}
        ${facultyAdvisor ? `<div class="divider" style="margin:14px 0"></div>` : ""}
        ${personRow(facultyAdvisor, "Faculty Advisor",  "#94a3b8")}
      </div>`
    : "";

  // ── Full page HTML ──
  content.innerHTML = `
    <a class="back-btn" href="clubs.html">← Back to Clubs</a>

    <!-- Hero -->
    <div class="club-hero" style="background:linear-gradient(135deg,${color}22,${color}55);">
      <div class="club-hero-logo">${icon}</div>
      <div class="club-hero-info">
        <div class="club-hero-name">${name}</div>
        <div class="club-hero-tagline">${tagline}</div>
        <div class="club-hero-tags">
          <span class="club-tag" style="background:${color}22;color:${color};border-color:${color}44">${category}</span>
          <span class="club-tag">👥 <span id="heroMemberCount">${memberCount}</span> members</span>
          <span class="club-tag">📅 Est. ${founded}</span>
        </div>
      </div>
    </div>

    <div class="cs-layout">

      <!-- Left column -->
      <div class="cs-main">

        <div class="cs-section">
          <div class="cs-section-title">About the Club</div>
          <p class="cs-desc">${description}</p>
        </div>

        <div class="cs-section">
          <div class="cs-section-title">Goals &amp; Activities</div>
          <div class="goals-list">${goalsHtml}</div>
        </div>

        ${eventsHtml}
      </div>

      <!-- Right sidebar -->
      <div class="cs-sidebar">

        <!-- Join card -->
        <div class="cs-card">
          <div class="cs-card-title">Membership</div>
          <div class="members-count" style="color:${color}" id="memberCountDisplay">${memberCount}</div>
          <div class="members-label">Current Members</div>
          ${joinBtnHtml}
          <div class="join-note">Membership is open to all students</div>
        </div>

        <!-- Leadership card -->
        ${leadershipHtml}

        <!-- Quick info card -->
        <div class="cs-card">
          <div class="cs-card-title">Quick Info</div>
          <div class="info-item">
            <div class="info-icon-box">🗓️</div>
            <div>
              <div class="info-item-label">Meeting Schedule</div>
              <div class="info-item-value">${schedule}</div>
            </div>
          </div>
          <div class="info-item" style="margin-top:12px">
            <div class="info-icon-box">📧</div>
            <div>
              <div class="info-item-label">Contact</div>
              <div class="info-item-value">${contact}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // ── Join / Leave button logic ─────────────────────────
  let joined     = isJoined;
  let count      = typeof memberCount === "number" ? memberCount : parseInt(memberCount) || 0;
  const token    = localStorage.getItem("authToken");

  document.getElementById("joinBtn")?.addEventListener("click", async function () {
    const btn = document.getElementById("joinBtn");

    if (!token) {
      alert("Please log in to join a club.");
      window.location.href = "stsignin.html";
      return;
    }

    btn.disabled = true;
    btn.textContent = "...";

    try {
      if (!joined) {
        // Join
        const res = await fetch(`${API_BASE}/clubs/${selectedId}/join`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        });
        if (!res.ok) throw new Error("Failed to join");
        joined = true;
        count++;
      } else {
        // Leave
        const res = await fetch(`${API_BASE}/clubs/${selectedId}/leave`, {
          method:  "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to leave");
        joined = false;
        count = Math.max(0, count - 1);
      }
    } catch (err) {
      console.error(err);
      alert("Something went wrong. Please try again.");
      btn.disabled = false;
      btn.textContent = joined ? "✅ Joined" : "Join Club →";
      return;
    }

    // Update UI
    const countEl = document.getElementById("memberCountDisplay");
    const heroEl  = document.getElementById("heroMemberCount");
    if (countEl) countEl.textContent = count;
    if (heroEl)  heroEl.textContent  = count;

    if (joined) {
      btn.textContent = "✅ Joined";
      btn.classList.add("joined");
      btn.style.background = "";
    } else {
      btn.textContent = "Join Club →";
      btn.classList.remove("joined");
      btn.style.background = `linear-gradient(135deg,${color},${color}cc)`;
    }
    btn.disabled = false;
  });
}

// ── Logout ────────────────────────────────────────────────
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  if (confirm("Do you want to logout?")) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    window.location.href = "stsignin.html";
  }
});

// ── Boot ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadClubDetail();
});
}

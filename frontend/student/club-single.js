// ===========================
//  club-single.js — connected to backend
// ===========================
{
const STATIC_BASE = API_BASE.replace("/api", "");
const urlParams  = new URLSearchParams(window.location.search);
const urlId      = urlParams.get("id");
const ssId       = sessionStorage.getItem("selectedClubId");
const selectedId = parseInt(urlId || ssId || "1", 10);

// ── Category colors ───────────────────────────────────────
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
    const token   = localStorage.getItem("student_auth_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await fetch(`${API_BASE}/clubs/${selectedId}`, { headers });
    if (!res.ok) throw new Error("Club not found");
    const club = await res.json();

    console.log("📦 Club data:", club); // debug — check browser console

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

    // ── Fetch execom using club_name (DB stores name not ID) ──
    let execom = [];
    const clubName = club.club_name || "";
    try {
      const exRes = await fetch(`${API_BASE}/execom/club/${encodeURIComponent(clubName)}`, { headers });
      console.log(`🔍 Execom fetch: /execom/club/${clubName} → ${exRes.status}`);
      if (exRes.ok) {
        const data = await exRes.json();
        execom = Array.isArray(data) ? data : (data.execom || data.members || data.data || []);
        console.log("👥 Execom data:", execom);
      }
    } catch (err) {
      console.warn("Execom fetch failed:", err);
    }
    renderClub(club, memberCount, isJoined, events, execom, content);

  } catch (err) {
    console.error("Failed to load club:", err);
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
function renderClub(club, memberCount, isJoined, events = [], execom = [], content) {

  const name        = club.club_name        || "Unnamed Club";
  const category    = club.club_category    || "General";
  const description = club.description      || club.short_description || "No description available.";
  const founded     = club.year_of_establishment || "—";
  const tagline     = club.tagline          || club.short_description || "";
  const color       = categoryColors[category] || "#6d5efc";
  const icon = club.club_logo
    ? `<img src="${STATIC_BASE}/${club.club_logo}"
         alt="${name} logo"
         onerror="this.style.display='none'"
         style="width:80px;height:80px;object-fit:contain;border-radius:12px;" />`
    : (categoryIcons[category] || "🏫");

  document.title = `${name} | EVEXA`;
  const topbarTitle = document.getElementById("topbarTitle");
  if (topbarTitle) topbarTitle.textContent = name;

  // ── Events HTML ──
  const STATUS_LABEL = { open:"Open", registered:"Registered", upcoming:"Upcoming", full:"Full", approved:"Approved", cancelled:"Cancelled", completed:"Completed" };
  const STATUS_COLOR  = { open:"#16a34a", registered:"#5b21b6", upcoming:"#b45309", full:"#dc2626", approved:"#16a34a", cancelled:"#dc2626", completed:"#6b7280" };

  function formatDate(raw) {
    if (!raw) return "TBD";
    try {
      const dateStr = String(raw).split("T")[0];
      const [yyyy, mm, dd] = dateStr.split("-").map(Number);
      const d = (yyyy && mm && dd) ? new Date(yyyy, mm - 1, dd) : new Date(raw);
      if (isNaN(d)) return raw;
      return d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
    } catch (_) { return raw; }
  }

  function formatTime(raw) {
    if (!raw) return "";
    // Strip seconds from HH:MM:SS
    if (/^\d{2}:\d{2}:\d{2}$/.test(String(raw))) return String(raw).slice(0, 5);
    try {
      const d = new Date(raw);
      if (isNaN(d)) return raw;
      return d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
    } catch (_) { return raw; }
  }

  let eventsHtml = "";
  const visibleEvents = events.filter(ev => {
  const status = (ev.status || "").toLowerCase();
  return status !== "pending";
});

if (visibleEvents.length > 0) {
    const eventCards = visibleEvents.map(ev => {
      const total  = ev.total_seats  ?? ev.seats?.total  ?? 0;
      const filled = ev.filled_seats ?? ev.seats?.filled ?? 0;
      const left   = total - filled;
      const status = (ev.status || "upcoming").toLowerCase();
      const evId   = ev.event_id ?? ev.id ?? "";
      const evName = ev.event_name || ev.name || ev.title || "Unnamed Event";
      const rawDate = ev.event_date || ev.date || ev.start_date || "";
      const rawTime = ev.event_time || ev.time || ev.start_time || "";
      // If date is ISO (contains T), extract date+time from it
      const isISO = String(rawDate).includes("T");
      const displayDate = isISO ? formatDate(rawDate) : formatDate(rawDate);
      const displayTime = isISO ? formatTime(new Date(rawDate)) : formatTime(rawTime);
      return `
        <div class="club-event-card" style="cursor:pointer;"
          onclick="sessionStorage.setItem('selectedEventId','${evId}');
                   window.location.href='event-single.html?id=${evId}'">
          ${ev.banner_url || ev.banner
            ? `<img class="club-event-banner" src="${ev.banner_url || ev.banner}" alt="${evName}" />`
            : `<div class="club-event-banner" style="background:${color}22;display:flex;align-items:center;justify-content:center;font-size:32px;">📅</div>`}
          <div class="club-event-body">
            <div class="club-event-name">${evName}</div>
            <div class="club-event-meta">📅 ${displayDate}${displayTime ? " · " + displayTime : ""}</div>
            <div class="club-event-meta">🏛️ ${ev.venue || ev.location || "—"}</div>
            <div class="club-event-footer">
              <span class="status-badge-sm" style="color:${STATUS_COLOR[status] || "#6b7280"}">${STATUS_LABEL[status] || ev.status || "Upcoming"}</span>
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

  // ── Execom HTML ──
  let execomHtml = "";
  if (execom.length > 0) {
    const rolePriority = ["chairperson", "chair", "vice chairperson", "vice chair", "secretary", "treasurer"];
    const sorted = [...execom].sort((a, b) => {
      const aRole = (a.position || "").toLowerCase();
      const bRole = (b.position || "").toLowerCase();
      const aIdx  = rolePriority.findIndex(r => aRole.includes(r));
      const bIdx  = rolePriority.findIndex(r => bRole.includes(r));
      return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });

    const execomCards = sorted.map(member => {
      const mName  = member.name || "—";
      const mRole  = member.position || "Member";
      const mDept  = member.class || member.dept || member.department || "";
      const mYear  = member.year || "";
      const mMeta  = [mDept, mYear].filter(Boolean).join(" · ");
      const mPhone = member.phone || member.phone_no || "";
      const mPhoto = member.avatar || member.photo || member.profile_pic || member.image || null;
      const initials = mName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

      const avatarHtml = mPhoto
        ? `<img src="${STATIC_BASE}/${mPhoto}" alt="${mName}"
             style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid ${color}33;"
             onerror="this.outerHTML='<div class=\\'execom-avatar\\'style=\\'background:${color}22;color:${color};border:2px solid ${color}44\\'>${initials}</div>'" />`
        : `<div class="execom-avatar" style="background:${color}22;color:${color};border:2px solid ${color}44">${initials}</div>`;

      return `
        <div class="execom-card">
          ${avatarHtml}
          <div class="execom-name">${mName}</div>
          <div class="execom-role" style="color:${color}">${mRole}</div>
          ${mMeta ? `<div class="execom-meta">${mMeta}</div>` : ""}
          ${mPhone ? `<a class="execom-phone" href="tel:${mPhone}">📞 ${mPhone}</a>` : ""}
        </div>`;
    }).join("");

    execomHtml = `
      <div class="cs-section">
        <div class="cs-section-title">Executive Committee</div>
        <div class="execom-grid">${execomCards}</div>
      </div>`;
  } else {
    execomHtml = `
      <div class="cs-section">
        <div class="cs-section-title">Executive Committee</div>
        <div style="color:#9ca3af;font-size:13px;font-weight:700;padding:8px 0;">
          No execom data available.
          <span style="font-size:11px;color:#6b7280;display:block;margin-top:4px;font-weight:500;">
            Open browser DevTools → Console to see which API endpoints were tried.
          </span>
        </div>
      </div>`;
  }

  // ── Full page HTML — sidebar has membership card ONLY, no contact ──
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

        ${execomHtml}

        ${eventsHtml}
      </div>

      <!-- Right sidebar — membership only -->
      <div class="cs-sidebar">
        <div class="cs-card">
          <div class="cs-card-title">Membership</div>
          <div class="members-count" style="color:${color}" id="memberCountDisplay">${memberCount}</div>
          <div class="members-label">Current Members</div>
          ${joinBtnHtml}
          <div class="join-note">Membership is open to all students</div>
        </div>
      </div>

    </div>
  `;

  // ── Join / Leave button logic ─────────────────────────
  let joined  = isJoined;
  let count   = typeof memberCount === "number" ? memberCount : parseInt(memberCount) || 0;
  const token = localStorage.getItem("student_auth_token");

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
        const res = await fetch(`${API_BASE}/clubs/${selectedId}/join`, {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
        });
        if (!res.ok) throw new Error("Failed to join");
        joined = true;
        count++;
      } else {
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

// ── Boot ──────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadClubDetail();
});
}
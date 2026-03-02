// ===========================
//  clubs.js — connected to backend
// ===========================

let allClubs      = [];
let joinedClubIds = new Set();
let currentFilter = "all";
let currentSearch = "";
const STATIC_BASE = API_BASE.replace("/api", "");

// ── Detect view mode from URL ─────────────────────────
const isMyClubs = new URLSearchParams(window.location.search).get("view") === "mine";

// ── Update page title based on view ──────────────────
if (isMyClubs) {
  const title    = document.querySelector(".title");
  const subtitle = document.querySelector(".subtitle");
  if (title)    title.textContent    = "My Clubs";
  if (subtitle) subtitle.textContent = "Clubs you've joined.";
} else {
  const title    = document.querySelector(".title");
  const subtitle = document.querySelector(".subtitle");
  if (title)    title.textContent    = "Discover Clubs";
  if (subtitle) subtitle.textContent = "Explore and join student clubs.";
}

// ── Highlight correct sidebar nav item ───────────────
document.querySelectorAll(".nav-item").forEach(item => {
  const href = item.getAttribute("href") || "";
  if (isMyClubs && href.includes("view=mine")) {
    item.classList.add("active");
  } else if (!isMyClubs && href === "clubs.html") {
    item.classList.add("active");
  } else {
    item.classList.remove("active");
  }
});

// ── Category colors ───────────────────────────────────
const categoryColors = {
  Technical:       "#6d5efc",
  "Non-Technical": "#f59e0b",
};

const categoryIcons = {
  Technical:       "⚙️",
  "Non-Technical": "🎭",
};

// ── Fetch all clubs + joined clubs ────────────────────
async function loadClubs() {
  const grid = document.getElementById("clubsGrid");
  if (grid) grid.innerHTML = `<div class="no-results">Loading clubs...</div>`;

  try {
    // Fetch all clubs (public)
    const res = await fetch(`${API_BASE}/clubs`);
    const clubs = await res.json();
    allClubs = clubs;

    // Fetch joined clubs if logged in
    const token = localStorage.getItem("authToken");
    if (token) {
      try {
        const myRes = await fetch(`${API_BASE}/clubs/my-clubs`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (myRes.ok) {
          const myClubs = await myRes.json();
          joinedClubIds = new Set(myClubs.map(c => c.club_id));
        }
      } catch (_) {}
    }

    renderGrid();

  } catch (err) {
    console.error("Failed to load clubs:", err);
    if (grid) grid.innerHTML = `<div class="no-results">Failed to load clubs. Is the server running?</div>`;
  }
}

// ── Build one club card ───────────────────────────────
function renderCard(c) {
  const color    = categoryColors[c.club_category] || "#6d5efc";
  const fallbackIcon = categoryIcons[c.club_category] || "🏫";
const icon = c.club_logo
  ? `<img src="${STATIC_BASE}/${c.club_logo}"
       alt=""
       onerror="this.outerHTML='<span style=\\'font-size:40px;\\'>${fallbackIcon}</span>'"
       style="width:80px;height:80px;object-fit:contain;border-radius:10px;" />`
  : `<span style="font-size:40px;">${fallbackIcon}</span>`;
  const isJoined = joinedClubIds.has(c.club_id);
  const desc     = (c.short_description || "").slice(0, 110);
  const year     = c.year_of_establishment || "—";

  const joinedBadge = isJoined
    ? `<span class="club-joined-badge">✅ Joined</span>`
    : "";

  return `
    <div class="club-card" data-id="${c.club_id}" role="button" tabindex="0" aria-label="View ${c.club_name}">
      <div class="club-banner" style="background: linear-gradient(135deg, ${color}22, ${color}44);">
        <div class="club-logo-big">${icon}</div>
        <div class="club-category-tag" style="background:${color}22; color:${color}; border-color:${color}44;">
          ${c.club_category}
        </div>
      </div>

      <div class="club-body">
        <div class="club-name-row">
          <div class="club-name">${c.club_name}</div>
          ${joinedBadge}
        </div>
        <p class="club-desc">${desc}${c.short_description?.length > 110 ? "..." : ""}</p>

        <div class="club-meta-row">
          <div class="club-meta-item">📅 <span>Est. ${year}</span></div>
          <div class="club-meta-item" id="members-${c.club_id}">👥 <span>— members</span></div>
        </div>
      </div>

      <div class="club-footer">
        <div class="club-people"></div>
        <span class="view-link">View details →</span>
      </div>
    </div>
  `;
}

// ── Filter + search ───────────────────────────────────
function getFiltered() {
  return allClubs.filter(c => {
    // On My Clubs view — only show joined clubs
    if (isMyClubs && !joinedClubIds.has(c.club_id)) return false;

    const matchFilter = currentFilter === "all" || c.club_category === currentFilter;
    const q = currentSearch.toLowerCase();
    const matchSearch = !q ||
      c.club_name?.toLowerCase().includes(q) ||
      c.short_description?.toLowerCase().includes(q) ||
      c.club_category?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });
}

// ── Render grid ───────────────────────────────────────
function renderGrid() {
  const grid     = document.getElementById("clubsGrid");
  const filtered = getFiltered();

  if (!filtered.length) {
    // Different empty state for My Clubs vs Discover
    if (isMyClubs) {
      grid.innerHTML = `
        <div class="no-results">
          <div style="font-size:40px;margin-bottom:12px">🏛️</div>
          <div>You haven't joined any clubs yet.</div>
          <a href="clubs.html" style="color:#6d5efc;font-weight:700;
             text-decoration:none;margin-top:10px;display:inline-block;">
            Discover Clubs →
          </a>
        </div>`;
    } else {
      grid.innerHTML = `<div class="no-results">No clubs found. Try a different filter or search.</div>`;
    }
    return;
  }

  grid.innerHTML = filtered.map(renderCard).join("");

  // Load member counts
  filtered.forEach(c => loadMemberCount(c.club_id));

  // Card click → club detail page
  grid.querySelectorAll(".club-card").forEach(card => {
    const open = () => {
      sessionStorage.setItem("selectedClubId", card.dataset.id);
      window.location.href = `club-single.html?id=${card.dataset.id}`;
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") open();
    });
  });
}

// ── Load member count per club ────────────────────────
async function loadMemberCount(clubId) {
  try {
    const res = await fetch(`${API_BASE}/clubs/${clubId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById(`members-${clubId}`);
    if (el) el.innerHTML = `👥 <span>${data.count ?? data.length ?? "—"} members</span>`;
  } catch (_) {}
}

// ── Filter buttons ────────────────────────────────────
document.getElementById("filterBar")?.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderGrid();
  });
});

// ── Search ────────────────────────────────────────────
document.getElementById("searchBox")?.addEventListener("input", e => {
  currentSearch = e.target.value;
  renderGrid();
});

// ── Boot ─────────────────────────────────────────────
loadClubs();
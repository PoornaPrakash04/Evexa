// ===========================
//  clubs.js — connected to backend
// ===========================



let allClubs      = [];
let joinedClubIds = new Set();
let currentFilter = "all";
let currentSearch = "";

// ── Category colors ───────────────────────────────────────
const categoryColors = {
  Technical: "#6d5efc",
  Social:    "#f59e0b",
  Science:   "#3b82f6",
  Creative:  "#ec4899",
  Sports:    "#10b981",
  Cultural:  "#f97316",
};

// ── Category emoji icons (fallback if no logo) ────────────
const categoryIcons = {
  Technical: "⚙️",
  Social:    "🤝",
  Science:   "🚀",
  Creative:  "🎨",
  Sports:    "⚽",
  Cultural:  "🎭",
};

// ── Fetch all clubs + joined clubs ────────────────────────
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

// ── Build one club card ───────────────────────────────────
function renderCard(c) {
  const color    = categoryColors[c.club_category] || "#6d5efc";
  const icon     = c.club_logo || categoryIcons[c.club_category] || "🏫";
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

// ── Filter + search ───────────────────────────────────────
function getFiltered() {
  return allClubs.filter(c => {
    const matchFilter = currentFilter === "all" || c.club_category === currentFilter;
    const q = currentSearch.toLowerCase();
    const matchSearch = !q ||
      c.club_name?.toLowerCase().includes(q) ||
      c.short_description?.toLowerCase().includes(q) ||
      c.club_category?.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });
}

// ── Render grid ───────────────────────────────────────────
function renderGrid() {
  const grid     = document.getElementById("clubsGrid");
  const filtered = getFiltered();

  if (!filtered.length) {
    grid.innerHTML = `<div class="no-results">No clubs found. Try a different filter or search.</div>`;
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

// ── Load member count per club ────────────────────────────
async function loadMemberCount(clubId) {
  try {
    const res = await fetch(`${API_BASE}/clubs/${clubId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    const el = document.getElementById(`members-${clubId}`);
    if (el) el.innerHTML = `👥 <span>${data.count ?? data.length ?? "—"} members</span>`;
  } catch (_) {}
}

// ── Filter buttons ────────────────────────────────────────
document.getElementById("filterBar")?.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderGrid();
  });
});

// ── Search ────────────────────────────────────────────────
document.getElementById("searchBox")?.addEventListener("input", e => {
  currentSearch = e.target.value;
  renderGrid();
});

// ── Logout ────────────────────────────────────────────────
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  if (confirm("Do you want to logout?")) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    window.location.href = "stsignin.html";
  }
});

// ── Boot ──────────────────────────────────────────────────
loadClubs();
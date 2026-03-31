

let allEvents         = [];
let registeredEventIds = [];
let currentFilter     = "all";
let currentSearch     = "";

function formatDateIST(raw, opts) {
  return new Date(raw).toLocaleDateString("en-IN", { ...opts, timeZone: "Asia/Kolkata" });
}

const urlFilter = new URLSearchParams(window.location.search).get("filter");
if (urlFilter) {
  currentFilter = urlFilter;
}
if (currentFilter === "registered") {
  const title    = document.querySelector(".title");
  const subtitle = document.querySelector(".subtitle");
  if (title)    title.textContent    = "My Registrations";
  if (subtitle) subtitle.textContent = "Events you've registered for.";
}

// ── Highlight correct filter button if present ───────
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.classList.toggle("active", btn.dataset.filter === currentFilter);
});

// ── Highlight correct sidebar nav item ───────────────
document.querySelectorAll(".nav-item").forEach(item => {
  const href = item.getAttribute("href") || "";
  if (currentFilter === "registered" && href.includes("filter=registered")) {
    item.classList.add("active");
  } else if (currentFilter !== "registered" && href === "event-details.html") {
    item.classList.add("active");
  } else {
    item.classList.remove("active");
  }
});

// ── Fetch registered event IDs ────────────────────────
async function loadRegisteredIds() {
  const token = localStorage.getItem("student_auth_token");
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/attendance/my-registrations`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      registeredEventIds = data.map(r => String(r.event_id));
    }
  } catch (err) {
    console.error("Failed to load registrations:", err);
  }
}

// ── Fetch events from backend ─────────────────────────
async function loadEvents() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    const data = await res.json();
    allEvents = data.filter(e => (e.status || "").toLowerCase() !== "pending");
    await loadRegisteredIds();
    renderGrid();
  } catch (err) {
    console.error("Failed to load events:", err);
    document.getElementById("eventsGrid").innerHTML =
      `<div class="no-results">Failed to load events. Is the server running?</div>`;
  }
}

// ── Map backend status to display status ──────────────
function getStatus(event) {
  const s = (event.status || "").toLowerCase();

  if (!s || s === "approved") return "open";
  if (s === "completed")      return "past";
  if (s === "cancelled")      return "past";

  if (event.capacity && (event.registered_count || 0) >= event.capacity) return "full";

  return "open";
}

// ── Build one event card ──────────────────────────────
function renderCard(e) {
  const poster = (e.poster && e.poster !== "default.jpg")
    ? `http://localhost:5000/uploads/${e.poster}`
    : `https://placehold.co/600x200/6d5efc/ffffff?text=${encodeURIComponent(e.title)}`;

  // ✅ IST-safe date display
  const eventDate = e.date
    ? formatDateIST(e.date, { day: "numeric", month: "short", year: "numeric" })
    : "TBA";

  const status    = getStatus(e);
  const statusMap = { open: "Open", full: "Full", past: "Completed" };
  const fee       = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";
  const capacity  = e.capacity || 0;
  const isRegistered = registeredEventIds.includes(String(e.id));

  // Strip seconds from time display (HH:MM:SS → HH:MM)
  const displayTime = e.time ? String(e.time).slice(0, 5) : "TBA";

  return `
    <div class="event-card" data-id="${e.id}" role="button" tabindex="0" aria-label="View details for ${e.title}">
      <img class="event-banner" src="${poster}" alt="${e.title}" loading="lazy"
           onerror="this.src='https://placehold.co/600x200/6d5efc/ffffff?text=No+Poster'" />

      <div class="event-body">
        <div class="event-title-row">
          <div class="event-name">${e.title}</div>
          <span class="status-badge ${status}">${statusMap[status] || "Open"}</span>
        </div>

        ${isRegistered ? `<div class="registered-tag">🎟️ Registered</div>` : ""}

        <div class="event-meta">
          <div class="meta-row">
            <span class="meta-icon">📅</span>
            <span class="meta-label">${eventDate}</span>
            &nbsp;·&nbsp;
            <span>${displayTime}</span>
          </div>
          <div class="meta-row">
            <span class="meta-icon">🏛️</span>
            <span>${e.venue || "TBA"}</span>
          </div>
          <div class="meta-row">
            <span class="meta-icon">🏷️</span>
            <span>${e.club || "—"}</span>
          </div>
          <div class="meta-row">
            <span class="meta-icon">💰</span>
            <span>${fee}</span>
          </div>
        </div>

        ${capacity ? `
        <div class="seats-bar-wrap">
          <div class="seats-bar-bg">
            <div class="seats-bar-fill" style="width:${Math.min((e.registered_count || 0) / capacity * 100, 100)}%"></div>
          </div>
        </div>` : ""}
      </div>

      <div class="event-footer">
        <div class="seats-info">
          ${capacity
            ? `${capacity - (e.registered_count || 0)} seats left / ${capacity} total`
            : "Open registration"}
        </div>
        <span class="view-link">View details →</span>
      </div>
    </div>`;
}

// ── Filter + search ───────────────────────────────────
function getFiltered() {
  return allEvents.filter(e => {
    const status = getStatus(e);

    let matchFilter = false;
    if (currentFilter === "all")             matchFilter = true;
    else if (currentFilter === "registered") matchFilter = registeredEventIds.includes(String(e.id));
    else                                     matchFilter = status === currentFilter;

    const q = currentSearch.toLowerCase();
    const matchSearch =
      !q ||
      e.title?.toLowerCase().includes(q) ||
      e.club?.toLowerCase().includes(q)  ||
      e.venue?.toLowerCase().includes(q) ||
      e.type?.toLowerCase().includes(q);

    return matchFilter && matchSearch;
  });
}

// ── Render grid ───────────────────────────────────────
function renderGrid() {
  const grid     = document.getElementById("eventsGrid");
  const filtered = getFiltered();

  if (!filtered.length) {
    if (currentFilter === "registered") {
      grid.innerHTML = `
        <div class="no-results">
          <div style="font-size:40px;margin-bottom:12px">🎟️</div>
          <div>You haven't registered for any events yet.</div>
          <a href="event-details.html" style="color:#6d5efc;font-weight:700;
             text-decoration:none;margin-top:10px;display:inline-block;">
            Browse Events →
          </a>
        </div>`;
    } else {
      grid.innerHTML = `<div class="no-results">No events found. Try a different filter or search.</div>`;
    }
    return;
  }

  grid.innerHTML = filtered.map(renderCard).join("");

  grid.querySelectorAll(".event-card").forEach(card => {
    const open = () => {
      sessionStorage.setItem("selectedEventId", card.dataset.id);
      window.location.href = `event-single.html?id=${card.dataset.id}`;
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", ev => {
      if (ev.key === "Enter" || ev.key === " ") open();
    });
  });
}

// ── Filter buttons ────────────────────────────────────
document.getElementById("filterBar")?.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;

    const title    = document.querySelector(".title");
    const subtitle = document.querySelector(".subtitle");
    if (currentFilter === "registered") {
      if (title)    title.textContent    = "My Registrations";
      if (subtitle) subtitle.textContent = "Events you've registered for.";
    } else {
      if (title)    title.textContent    = "Events";
      if (subtitle) subtitle.textContent = "Discover and register for upcoming events.";
    }

    renderGrid();
  });
});

// ── Search ────────────────────────────────────────────
document.getElementById("searchBox")?.addEventListener("input", e => {
  currentSearch = e.target.value;
  renderGrid();
});

// ── Boot ─────────────────────────────────────────────
loadEvents();
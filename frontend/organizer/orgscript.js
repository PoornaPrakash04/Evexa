document.addEventListener("DOMContentLoaded", async function() {
  console.log("=== DASHBOARD LOADING ===");
  const token = localStorage.getItem("authToken");
  console.log("Token found:", !!token);
  console.log("Token value:", token);
  
  if (!token) {
  console.log("❌ No token - redirecting to login");
  window.location.href = "http://127.0.0.1:5501/frontend/organizer/ogsignin.html";
  return;
}

  try {
    console.log("Sending request to backend...");
    const response = await fetch("http://localhost:5000/api/auth/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    console.log("Response status:", response.status);
    console.log("Response ok:", response.ok);

    if (!response.ok) {
  console.error("❌ Token verification failed");
  localStorage.removeItem("authToken");
  window.location.href = "http://127.0.0.1:5501/frontend/organizer/ogsignin.html";
  return;
}

    const organizer = await response.json();
    console.log("✅ Organizer loaded:", organizer);
    
    updateOrganizerProfile(organizer);
    
  } catch (error) {
  console.error("❌ Auth error:", error);
  localStorage.removeItem("authToken");
  window.location.href = "http://127.0.0.1:5501/frontend/organizer/ogsignin.html";
  return;
}
  // Initialize UI components
  setupSidebar();
  setupNotifications();
  setupDarkMode();
  setupProfile();
  await loadExecom();
  await loadVenues();
  renderAnnouncements();
// After other initializations
await loadAnnouncements();
  // Restore last visited page
  let savedPage = localStorage.getItem("currentPage") || "dashboard";
  switchPage(savedPage);

  // Load events from backend
  await loadEvents();

  console.log("✅ Dashboard initialized successfully");
});

// ============================================
// UPDATE PROFILE UI
// ============================================

function updateOrganizerProfile(organizer) {
  console.log("Updating UI with:", organizer);
  // Store organizer data for later use
  localStorage.setItem('organizerData', JSON.stringify(organizer));
  // Update navbar profile name
  const profileName = document.querySelector(".profile-name");
  if (profileName) {
    profileName.textContent = organizer.name;
  }

  // Update profile role
  const profileRole = document.querySelector(".profile-role");
  if (profileRole && organizer.club) {
    profileRole.textContent = `${organizer.club} Organizer`;
  }

  // Update avatars
  const avatars = document.querySelectorAll(".profile-avatar, .profile-avatar-wrap img");
  const seed = organizer.name.replace(/ /g, '+');
  avatars.forEach(avatar => {
    avatar.src = `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=6c63ff`;
  });

  // Update profile page
  const profilePageTitle = document.querySelector("#page-profile h2");
  if (profilePageTitle) {
    profilePageTitle.textContent = organizer.name;
  }

  const profilePosition = document.querySelector(".profile-position");
  if (profilePosition && organizer.club) {
    profilePosition.textContent = `Organizer – ${organizer.club}`;
  }

  // Update profile fields
  const fields = {
    pfClub: organizer.club,
    pfEmail: organizer.email,
    pfPhone: organizer.phone,
    pfRollNo: organizer.roll_no,
    pfAdmissionNo: organizer.admission_no,
    pfClass: organizer.class
  };

  Object.entries(fields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value || "N/A";
    }
  });
  
  console.log("✅ UI updated successfully");
}

// ============================================
// LOAD EVENTS FROM BACKEND
// ============================================

async function loadEvents() {
  console.log("🔄 Loading events...");
  const token = localStorage.getItem("authToken");

  try {
    // Load MY events
    const myResponse = await fetch("http://localhost:5000/api/events/my", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    events = myResponse.ok ? await myResponse.json() : [];
    console.log("✅ My events loaded:", events.length);

    // Load ALL events
    const allResponse = await fetch("http://localhost:5000/api/events/all", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    
    allEvents = allResponse.ok ? await allResponse.json() : [];
    filteredEvents = [...allEvents]; 
    localStorage.setItem("evexa_events", JSON.stringify(allEvents));
    
    console.log("✅ All events loaded:", allEvents.length);
    console.log("📊 filteredEvents:", filteredEvents.length);

    // Render
    renderDashboardApprovals();
    renderDashEventGrid();
    renderEventsGrid();
    updateDashboardStats();
    updateProfileStats();

  } catch (error) {
    console.error("❌ Event load error:", error);
    events = [];
    allEvents = [];
    filteredEvents = [];
  }
}
function updateProfileStats() {
  const totalEvents = events.length;
  const pendingRequests = events.filter(e => e.status === 'Draft' || e.status === 'Pending').length;

  const statNums = document.querySelectorAll('.pstat-num');
  const statLabels = document.querySelectorAll('.pstat-label');

  if (statNums.length >= 2) {
    statNums[0].textContent = totalEvents;
    statNums[1].textContent = pendingRequests;
  }
}
function updateDashboardStats() {
  const stats = document.querySelectorAll(".stat-num");
  if (stats.length < 4) return;

  const total = events.length;
  const approved = events.filter(e => e.status === "Approved").length;
  const draft = events.filter(e => e.status === "Draft").length;

  stats[0].textContent = total;
  stats[1].textContent = approved;
  stats[2].textContent = draft;
  stats[3].textContent = draft;
}

// ============================================
// LOGOUT
// ============================================

function logout() {
  localStorage.removeItem("authToken");
  window.location.href = "http://127.0.0.1:5501/frontend/organizer/ogsignin.html";
}


// ============================================
// DATA & STATE
// ============================================

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let currentVenue = "";

let events = [];         // My events (for dashboard)
let allEvents = [];  
let filteredEvents = [];

const notifications = {
  history: [
    { id: 1, text: "Your event 'IoT Workshop' was approved by admin.", time: "2 hours ago", color: "#43d9a2" },
    { id: 2, text: "New registration for 'Tech Talks: AI Edition' — Priya Nair.", time: "5 hours ago", color: "#6c63ff" },
    { id: 3, text: "Venue 'Seminar Hall A' confirmed for March 15.", time: "Yesterday", color: "#6c63ff" },
  ],
  schedule: [
    { id: 4, text: "IoT Workshop 2025 starts tomorrow at 10:00 AM.", time: "Reminder", color: "#f4a261" },
    { id: 5, text: "Registration closes for Tech Talks in 2 days.", time: "Upcoming", color: "#ff6584" },
  ],
  requests: [
    { id: 6, text: "Robo Race 2025 venue request pending approval.", time: "March 5", color: "#f4a261", actions: true },
    { id: 7, text: "Cultural Nite PA system request awaiting faculty approval.", time: "March 3", color: "#ff6584", actions: true },
    { id: 8, text: "Python Bootcamp Lab booking request sent.", time: "Jan 15", color: "#43d9a2" },
  ]
};

let announcements = [];
const savedAnnouncements = localStorage.getItem("evexa_announcements");
if (savedAnnouncements) {
  announcements = JSON.parse(savedAnnouncements);
}
let venues = [];

const venueBookings = {};

let currentPage = 'dashboard';
let calendarDate = new Date();
let notifTab = 'history';
let currentEventDetail = null;
let detailTab = 'info';

// ===================== SIDEBAR & NAVIGATION =====================
function setupSidebar() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const overlay = document.getElementById('overlay');

  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('active');
    } else {
      sidebar.classList.toggle('collapsed');
      mainContent.classList.toggle('expanded');
    }
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    const notifPanel = document.getElementById('notifPanel');
    if (notifPanel) {
      notifPanel.classList.remove('open');
    }
  });

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchPage(item.dataset.page);
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      }
    });
  });
}

function switchPage(name) {
  const pages = document.querySelectorAll('.page');
  const navItems = document.querySelectorAll('.nav-item');

  pages.forEach(p => p.classList.remove('active'));
  navItems.forEach(n => n.classList.remove('active'));

  let targetPage = document.getElementById(`page-${name}`);
  let targetNav = document.querySelector(`.nav-item[data-page="${name}"]`);

  if (!targetPage) {
    targetPage = document.getElementById('page-dashboard');
  }

  if (!targetNav) {
    targetNav = document.querySelector('.nav-item[data-page="dashboard"]');
  }

  targetPage.classList.add('active');
  targetNav?.classList.add('active');
  currentPage = name;

  localStorage.setItem("currentPage", name);
}

// View all events from the organizer's club
function viewAllClubEvents() {
  // Get organizer's club from localStorage
  const organizerData = JSON.parse(localStorage.getItem('organizerData') || '{}');
  const club = organizerData.club;
  
  // Switch to Events page
  switchPage('events');
  
  // Filter by club
  if (club) {
    // Set the club filter dropdown
    const clubFilter = document.getElementById('filterClub');
    if (clubFilter) {
      clubFilter.value = club;
    }
    
    // Apply the filter
    filterEvents();
  }
}
// ===================== NOTIFICATIONS =====================
function setupNotifications() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  const overlay = document.getElementById('overlay');

  if (!btn) return;

  btn.addEventListener('click', () => {
    panel.classList.toggle('open');
    overlay.classList.toggle('active');
  });

  document.querySelectorAll('.ntab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      notifTab = tab.dataset.tab;
      renderNotifications(notifTab);
    });
  });

  renderNotifications('history');
}

function renderNotifications(tab) {
  const body = document.getElementById('notifBody');
  const items = notifications[tab] || [];
  if (!items.length) {
    body.innerHTML = `<div class="empty-state"><i class="fa fa-bell-slash"></i><p>No notifications</p></div>`;
    return;
  }
  body.innerHTML = items.map(n => `
    <div class="notif-item">
      <div class="notif-dot" style="background:${n.color}"></div>
      <div class="notif-text">
        <p>${n.text}</p>
        <span>${n.time}</span>
      </div>
    </div>
  `).join('');
}

// ===================== DASHBOARD =====================
function renderDashboardApprovals() {
  const list = document.getElementById('approvalList');
  if (!list) return;
  
  const organizerData = JSON.parse(localStorage.getItem('organizerData') || '{}');  // ADD THIS
  const pending = events.filter(e => e.status === 'Draft');
  
  if (!pending.length) {
    list.innerHTML = `<div class="empty-state"><i class="fa fa-check-circle"></i><p>No pending approvals</p></div>`;
    return;
  }
  list.innerHTML = pending.map(e => `
    <div class="approval-item">
      <span class="event-type-badge">${e.emoji || '📅'}</span>
      <div class="approval-info">
        <strong>${e.title}</strong>
        <span>${e.club || organizerData.club || 'Your Club'} • ${formatDate(e.date)} • ${e.venue}</span>
      </div>
      <div class="approval-actions">
        <button class="btn btn-sm btn-outline" onclick="openEventDetail(${e.id})"><i class="fa fa-eye"></i> View</button>
      </div>
    </div>
  `).join('');
}
function renderDashEventGrid() {
  const grid = document.getElementById('dashEventGrid');
  if (!grid) return;
  
  if (!events.length) {
    grid.innerHTML = `<div class="empty-state"><i class="fa fa-calendar"></i><p>No events yet. Click "Add Event" to get started!</p></div>`;
    return;
  }
  
  const subset = events.slice(0, 4);
  grid.innerHTML = subset.map(e => createEventCard(e)).join('');
  grid.querySelectorAll('.event-card').forEach((card, i) => {
    card.addEventListener('click', () => {
  window.location.href = `org.html?id=${subset[i].id}`;
});

  });
}

// ===================== EVENTS =====================
function renderEventsGrid() {
  const grid = document.getElementById('eventsGrid');
  if (!grid) return;
  
  if (!filteredEvents.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa fa-calendar-plus"></i><p>No events yet. Click "Create Event" to get started!</p></div>`;
    return;
  }
  grid.innerHTML = filteredEvents.map(e => createEventCard(e)).join('');
  grid.querySelectorAll('.event-card').forEach((card, i) => {
    card.addEventListener('click', () => {
  window.location.href = `org.html?id=${filteredEvents[i].id}`;
});

  });
}

function createEventCard(e) {
  // Get organizer's club from localStorage or a global variable
  const organizerData = JSON.parse(localStorage.getItem('organizerData') || '{}');
  const clubName = e.club || organizerData.club || "Club not specified";

  const posterUrl = e.poster
    ? `http://localhost:5000/uploads/${e.poster}`
    : "https://via.placeholder.com/600x300?text=No+Poster";

  return `
    <div class="event-card">
      <div class="event-card-poster">
        <img src="${posterUrl}" alt="${e.title}" />
      </div>
      <div class="event-card-body">
        <div class="event-card-title">${e.title}</div>
        <div class="event-card-meta">
          <div class="event-meta-row">
            <i class="fa fa-calendar"></i>
            ${formatDate(e.date)}
          </div>
          <div class="event-meta-row">
            <i class="fa fa-clock"></i>
            ${e.time ? formatTime(e.time) : "TBD"}
          </div>
          <div class="event-meta-row">
            <i class="fa fa-map-marker-alt"></i>
            ${e.venue || "Not assigned"}
          </div>
          <div class="event-meta-row">
            <i class="fa fa-users"></i>
            Capacity: ${e.capacity || 0}
          </div>
          <div class="event-meta-row">
            <i class="fa fa-tag"></i>
            ${clubName}
          </div>
        </div>
        <div class="event-card-footer">
          <span class="event-type-badge">
            ${e.type || "General"}
          </span>
          <span class="event-status status-${(e.status || 'draft').toLowerCase()}">
            ${e.status || "Draft"}
          </span>
          <span class="fee-badge ${e.registration_fee > 0 ? 'fee-paid' : 'fee-free'}">
            ${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}
          </span>
        </div>
      </div>
    </div>
  `;
}

function filterEvents() {
  const search = document.getElementById('eventSearch').value.toLowerCase();
  const type = document.getElementById('filterType').value;
  const club = document.getElementById('filterClub').value;
  const venue = document.getElementById('filterVenue').value;
  const date = document.getElementById('filterDate').value;

  filteredEvents = allEvents.filter(e => {
    if (search && !e.title.toLowerCase().includes(search)) return false;
    if (type && e.type !== type) return false;
    if (club && e.club !== club) return false;
    if (venue && !e.venue.includes(venue)) return false;
    if (date && e.date !== date) return false;
    return true;
  });
  renderEventsGrid();
}
function clearFilters() {
  document.getElementById('eventSearch').value = '';
  document.getElementById('filterType').value = '';
  document.getElementById('filterClub').value = '';
  document.getElementById('filterVenue').value = '';
  document.getElementById('filterDate').value = '';
  filteredEvents = [...allEvents];
  renderEventsGrid();
}
function openEventDetail(id) {
  // Try to find in allEvents first, then events
  const event = allEvents.find(e => e.id === id) || events.find(e => e.id === id);
  if (!event) return;

  const content = `
    <div class="event-detail-header">
      <div class="event-detail-info">
        <h2>${event.title}</h2>
        <p><b>Date:</b> ${formatDate(event.date)}</p>
        <p><b>Time:</b> ${event.time ? formatTime(event.time) : "TBD"}</p>
        <p><b>Venue:</b> ${event.venue || "Not assigned"}</p>
        <p><b>Capacity:</b> ${event.capacity || 0}</p>
        <p><b>Fee:</b> ${event.registration_fee > 0 ? "₹" + event.registration_fee : "Free"}</p>
        <p><b>Status:</b> ${event.status}</p>
        <p style="margin-top:12px">${event.description || "No description available."}</p>
      </div>
    </div>
  `;

  document.getElementById("eventDetailContent").innerHTML = content;
  openModal("eventDetailModal");
}

// ===================== VENUE =====================
function renderVenueSidebar() {
  const list = document.getElementById('venueList');
  if (!list) return;
  
  list.innerHTML = venues.map(v => `
    <div class="venue-list-item ${v === currentVenue ? 'active' : ''}" 
         onclick="selectVenue('${v}')"
         title="${v}">
      ${v}
    </div>
  `).join('');
}
async function loadVenues() {
  const token = localStorage.getItem("authToken");

  try {
    const response = await fetch("http://localhost:5000/api/venues", {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.ok) {
      const data = await response.json();
      // data = [{id:1, name:"Main Seminar Hall", capacity:300, location:"Block A"}, ...]
      venues.length = 0;
      data.forEach(v => venues.push(v.name));
      currentVenue = venues[0];
    }
  } catch (err) {
    console.error("Venue load error:", err);
  }

  renderVenueSidebar();
  await loadVenueBookings();
  renderCalendar();
}
async function loadVenueBookings() {
  const token = localStorage.getItem("authToken");
  try {
    const response = await fetch(
      `http://localhost:5000/api/venues/calendar?venue_name=${encodeURIComponent(currentVenue)}&month=${currentMonth + 1}&year=${currentYear}`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );
    if (response.ok) {
      const data = await response.json();
      venueBookings[currentVenue] = {};
      data.forEach(b => {
        venueBookings[currentVenue][b.day] = b.status;
      });
    }
  } catch (err) {
    console.error("Booking load error:", err);
  }
}
async function selectVenue(name) {
  currentVenue = name;
  
  document.querySelectorAll('.venue-list-item').forEach(item => {
    item.classList.remove('active');
    if (item.textContent.trim() === name) {
      item.classList.add('active');
    }
  });
  await loadVenueBookings();
  renderCalendar();
}

function formatMMDDYYYY(dateObj) {
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
function buildOneHourSlots(startHour = 8, endHour = 18) {
  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}
async function openVenueSlots(dayNumber) {
  const selectedDate = new Date(currentYear, currentMonth, dayNumber);
  
  // Format as YYYY-MM-DD for backend
  const yyyy = selectedDate.getFullYear();
  const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
  const dd = String(dayNumber).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  // Format for display
  const dateText = formatMMDDYYYY(selectedDate);

  const subtitle = document.getElementById("venueSlotsSubtitle");
  const tbody = document.getElementById("venueSlotsBody");

  if (subtitle) subtitle.textContent = `${currentVenue} • ${dateText}`;
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Loading slots...</td></tr>`;
  openModal("venueSlotsModal");

  const token = localStorage.getItem("authToken");

  try {
    const response = await fetch(
      `http://localhost:5000/api/venues/slots?venue_name=${encodeURIComponent(currentVenue)}&date=${dateStr}`,
      { headers: { "Authorization": `Bearer ${token}` } }
    );

    if (!response.ok) throw new Error("Failed to load slots");

    const slots = await response.json();
    // slots = [{start: "08:00:00", end: "09:00:00", available: true}, ...]

    const availableSlots = slots.filter(s => s.available);

    if (!availableSlots.length) {
      tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">No available slots for this date</td></tr>`;
      return;
    }

    tbody.innerHTML = availableSlots.map(s => {
      const start = s.start.slice(0, 5); // "08:00:00" → "08:00"
      const end = s.end.slice(0, 5);
      return `
        <tr>
          <td>${dateText}</td>
          <td>${start} - ${end}</td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Slot load error:", err);
    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Failed to load slots</td></tr>`;
  }
}

function renderCalendar() {
  const calendar = document.getElementById("calendarGrid");
  if (!calendar) return;

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const title = document.getElementById("calendarTitle");
  if (title) {
    title.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  calendar.innerHTML = "";

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  days.forEach(day => {
    const header = document.createElement("div");
    header.classList.add("day-header");
    header.textContent = day;
    calendar.appendChild(header);
  });

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const bookings = venueBookings[currentVenue] || {};

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.classList.add("calendar-day", "empty");
    calendar.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.classList.add("calendar-day");
    cell.textContent = day;

    // In renderCalendar(), the booked days currently have no click handler
// Make sure ONLY available days call openVenueSlots:
if (bookings[day] === "booked") {
  cell.classList.add("booked");
  cell.title = `Day ${day} - Fully Booked`;
  // No click handler — intentionally not clickable
} else if (bookings[day] === "pending") {
  cell.classList.add("pending");
  cell.title = `Day ${day} - Partially Booked`;
  cell.addEventListener("click", () => openVenueSlots(day)); // still clickable, remaining slots shown
} else {
  cell.classList.add("available");
  cell.title = `Day ${day} - Available`;
  cell.addEventListener("click", () => openVenueSlots(day));
}


    calendar.appendChild(cell);
  }
}

// Month navigation
const prevMonthBtn = document.getElementById("prevMonth");
const nextMonthBtn = document.getElementById("nextMonth");

if (prevMonthBtn) {
  prevMonthBtn.addEventListener("click", async () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    await loadVenueBookings();
    renderCalendar();
  });
}

if (nextMonthBtn) {
  nextMonthBtn.addEventListener("click", async () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    await loadVenueBookings();
    renderCalendar();
  });
}

if (nextMonthBtn) {
  nextMonthBtn.addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderCalendar();
  });
}

// ===================== ANNOUNCEMENTS =====================
// ===================== ANNOUNCEMENTS =====================
async function loadAnnouncements() {
  console.log("Loading announcements...");
  const token = localStorage.getItem("authToken");

  try {
    const response = await fetch("http://localhost:5000/api/announcements", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error("Failed to load announcements");
      announcements = [];
      renderAnnouncements();
      return;
    }

    announcements = await response.json();
    renderAnnouncements();

  } catch (error) {
    console.error("Announcement load error:", error);
    announcements = [];
  }
}

function renderAnnouncements() {
  const tbody = document.getElementById('announcementBody');
  if (!tbody) return;
  
  if (!announcements.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">
      <i class="fa fa-bullhorn" style="font-size:48px;margin-bottom:16px;opacity:0.3;display:block"></i>
      No announcements yet
    </td></tr>`;
    return;
  }
  
  tbody.innerHTML = announcements.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${a.title}</strong></td>
      <td>${a.club}</td>
      <td>${formatDate(a.created_at)}</td>
      <td><span class="type-badge type-${a.type.toLowerCase()}">${a.type}</span></td>
      <td><span class="event-status ${a.status === 'Published' ? 'status-approved' : a.status === 'Draft' ? 'status-draft' : 'status-past'}">${a.status}</span></td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-sm btn-outline" onclick="showToast('✏️ Editing...')"><i class="fa fa-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${a.id})"><i class="fa fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

async function deleteAnnouncement(id) {
  if (!confirm('Delete this announcement?')) return;
  
  const token = localStorage.getItem("authToken");
  
  try {
    const response = await fetch(`http://localhost:5000/api/announcements/${id}`, {
      method: 'DELETE',
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      showToast('🗑️ Announcement deleted');
      loadAnnouncements();
    }
  } catch (error) {
    console.error("Delete error:", error);
  }
}

async function submitAnnouncement(e) {
  e.preventDefault();
  
  const title = document.getElementById('annTitle').value;
  const type = document.getElementById('annType').value;
  const message = document.getElementById('annMessage').value;
  const token = localStorage.getItem("authToken");
  
  try {
    const response = await fetch('http://localhost:5000/api/announcements', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ title, message, type })
    });
    
    if (response.ok) {
      showToast('📢 Announcement published!');
      closeModal('addAnnouncementModal');
      loadAnnouncements();
      e.target.reset();
    }
  } catch (error) {
    console.error("Submit error:", error);
  }
}
// ===================== EXECOM =====================
// Remove the hardcoded execomMembers array

// Add this function to load execom from database
async function loadExecom() {
  console.log("Loading execom...");
  const token = localStorage.getItem("authToken");

  try {
    const response = await fetch("http://localhost:5000/api/execom", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error("Failed to load execom");
      return;
    }

    const execomMembers = await response.json();
    renderExecom(execomMembers);

  } catch (error) {
    console.error("Execom load error:", error);
  }
}

// Update renderExecom to accept members as parameter
function renderExecom(members) {
  const grid = document.getElementById('execomGrid');
  if (!grid) return;
  
  if (!members || members.length === 0) {
    grid.innerHTML = `<div class="empty-state"><i class="fa fa-users"></i><p>No execom members found</p></div>`;
    return;
  }
  
  grid.innerHTML = members.map(m => {
    // Generate seed from name for avatar
    const seed = m.name.replace(/ /g, '+');
    // Generate color based on position
    const colors = ['6c63ff', 'ff6584', '43d9a2', 'f4a261', 'ffd166', '5bc0eb', '845ef7', 'fa5252'];
    const hash = m.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
const color = colors[hash % colors.length];
    
    return `
      <div class="execom-card">
        <img src="https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=${color}" alt="${m.name}" class="execom-avatar" />
        <h4>${m.name}</h4>
        <div class="pos">${m.position}</div>
        <div class="cls">${m.class || 'N/A'}</div>
        <div class="execom-contact">
          <div class="contact-item">
            <i class="fa fa-envelope"></i>
            ${m.email && m.email !== 'N/A' 
              ? `<a href="mailto:${m.email}" onclick="event.stopPropagation()">${m.email}</a>` 
              : '<span>N/A</span>'}
          </div>
          <div class="contact-item">
            <i class="fa fa-phone"></i>
            ${m.phone && m.phone !== 'N/A' 
              ? `<a href="tel:${m.phone}" onclick="event.stopPropagation()">${m.phone}</a>` 
              : '<span>N/A</span>'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}
// Optional: Show execom details on click
function showExecomDetail(id) {
  // You can implement a modal to show full details
  showToast('👤 Execom details feature coming soon!');
}

// ===================== CREATE EVENT =====================
function addVenueRow() {
  const section = document.getElementById('venueSection');
  const row = document.createElement('div');
  row.className = 'venue-request-row';
  row.innerHTML = `
    <select><option value="">Select Venue</option><option>Auditorium</option><option>Seminar Hall A</option><option>Seminar Hall B</option><option>Lab Block 1</option><option>Ground</option></select>
    <input type="date" />
    <input type="time" />
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()"><i class="fa fa-times"></i></button>
  `;
  section.appendChild(row);
}

async function submitCreateEvent(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData();
  
  // Extract values from form elements
  const title = form.elements[0]?.value;
  const type = form.elements[1]?.value;
  const description = form.querySelector('textarea')?.value;
  const date = form.querySelectorAll('input[type="date"]')[0]?.value;
  const time = form.querySelector('input[type="time"]')?.value;
  const capacity = form.querySelectorAll('input[type="number"]')[0]?.value;
  const fee = form.querySelectorAll('input[type="number"]')[1]?.value || 0;
  const venue = document.querySelector('#venueSection select')?.value;

  if (!title || !type || !date || !capacity) {
    alert("Please fill all required fields!");
    return;
  }

  formData.append("title", title);
  formData.append("type", type);
  formData.append("description", description || "");
  formData.append("date", date);
  formData.append("time", time || "");
  formData.append("capacity", capacity);
  formData.append("registration_fee", fee);
  formData.append("venue", venue || "");
  const organizerData = JSON.parse(localStorage.getItem('organizerData') || '{}');
  formData.append("club", organizerData.club || "");

  const fileInput = form.querySelector('input[type="file"]');
  if (fileInput?.files.length > 0) {
    formData.append("poster", fileInput.files[0]);
  }

  const token = localStorage.getItem("authToken");

  try {
    const res = await fetch("http://localhost:5000/api/events", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: formData
    });
    
    if (res.ok) {
      const result = await res.json();
      showToast("✅ Event created successfully!");
      loadEvents();
      closeModal("createEventModal");
      form.reset();
    } else {
      const error = await res.json();
      showToast("❌ Error: " + error.message);
    }
  } catch (error) {
    console.error("Error:", error);
    showToast("❌ Failed to create event");
  }
}

// ===================== PROFILE =====================
function setupProfile() {
  const profileBtn = document.getElementById('profilePillBtn');
  if (!profileBtn) return;
  
  let lastPage = 'dashboard';

  profileBtn.addEventListener('click', () => {
    if (currentPage !== 'profile') {
      lastPage = currentPage;
      switchPage('profile');
    } else {
      switchPage(lastPage);
    }
  });
  const logoutBtn = document.getElementById('profileLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('organizerData');
      localStorage.removeItem('currentPage');
      window.location.href = 'http://127.0.0.1:5501/frontend/organizer/ogsignin.html';
    });
  }
}

// ===================== DARK MODE =====================
function setupDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  if (!toggle) return;

  // ✅ Load saved theme on refresh
  const savedTheme = localStorage.getItem("evexa_theme"); // "dark" or "light"
  const isDark = savedTheme === "dark";

  document.body.classList.toggle("dark", isDark);
  toggle.checked = isDark;

  // ✅ Save theme when user changes
  toggle.addEventListener('change', function () {
    const enabled = this.checked;

    document.body.classList.toggle('dark', enabled);
    localStorage.setItem("evexa_theme", enabled ? "dark" : "light");

    showToast(enabled ? '🌙 Dark mode enabled' : '☀️ Light mode enabled');
  });
}

// ===================== MODAL =====================
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ===================== TOAST =====================
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===================== UTILS =====================
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  
  // Handle both date strings and timestamps
  const d = new Date(dateStr);
  
  // Check if date is valid
  if (isNaN(d.getTime())) {
    return 'Invalid Date';
  }
  
  return d.toLocaleDateString('en-IN', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
}

function formatTime(t) {
  if (!t) return 'TBD';
  const [h, m] = t.split(':').map(Number);
  return `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

console.log("✅ orgscript.js with authentication loaded");
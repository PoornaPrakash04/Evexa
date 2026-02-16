// ============================================
// JWT AUTHENTICATION
// ============================================

document.addEventListener("DOMContentLoaded", async function() {
  console.log("=== DASHBOARD LOADING ===");
  
  const token = localStorage.getItem("authToken");
  console.log("Token found:", !!token);
  
  if (!token) {
    console.log("❌ No token - redirecting to login");
    window.location.href = "http://127.0.0.1:5501/frontend/ogsignin.html";
    return;
  }

  // Verify token and load organizer data
  try {
    console.log("Verifying token with backend...");
    const response = await fetch("http://localhost:5000/api/auth/me", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    console.log("Auth response status:", response.status);

    if (!response.ok) {
      console.error("❌ Token verification failed");
      localStorage.removeItem("authToken");
      window.location.href = "http://127.0.0.1:5501/frontend/ogsignin.html";
      return;
    }

    const organizer = await response.json();
    console.log("✅ Organizer loaded:", organizer);
    
    // Update UI with organizer data
    updateOrganizerProfile(organizer);
    
  } catch (error) {
    console.error("❌ Auth error:", error);
    localStorage.removeItem("authToken");
    window.location.href = "http://127.0.0.1:5501/frontend/ogsignin.html";
    return;
  }

  // Initialize UI components
  setupSidebar();
  setupNotifications();
  setupDarkMode();
  setupProfile();
  renderExecom();
  renderVenueSidebar();
  renderCalendar();
  renderAnnouncements();

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
  console.log("Loading events...");
  const token = localStorage.getItem("authToken");

  try {
    const response = await fetch("http://localhost:5000/api/events/my", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error("Failed to load events");
      events = [];
      filteredEvents = [];
      renderDashboardApprovals();
      renderDashEventGrid();
      renderEventsGrid();
      return;
    }

    events = await response.json();
    filteredEvents = [...events];

    renderDashboardApprovals();
    renderDashEventGrid();
    renderEventsGrid();
    updateDashboardStats();

  } catch (error) {
    console.error("Event load error:", error);
    events = [];
    filteredEvents = [];
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
  console.log("Logging out...");
  localStorage.removeItem("authToken");
  window.location.href = "http://127.0.0.1:5501/frontend/ogsignin.html";
}

// ============================================
// DATA & STATE
// ============================================

let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let currentVenue = "Auditorium";

let events = [];
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

const announcements = [
  { id: 1, title: "IEEE General Meeting – March 2025", club: "IEEE", date: "2025-03-01", type: "General", status: "Active" },
  { id: 2, title: "Urgent: Venue Change for Tech Talks", club: "CSI", date: "2025-03-10", type: "Urgent", status: "Active" },
  { id: 3, title: "Registration Open – Code Fiesta Hackathon", club: "IEEE", date: "2025-02-01", type: "Event", status: "Archived" },
  { id: 4, title: "Results: Best Project Award", club: "IEEE", date: "2025-02-12", type: "Result", status: "Active" },
  { id: 5, title: "Monthly NSS Activity Report", club: "NSS", date: "2025-02-28", type: "General", status: "Active" },
];

const execomMembers = [
  { name: "Arjun Kumar", position: "Chairperson", class: "S6 CSE-A", seed: "Arjun+Kumar", color: "6c63ff" },
  { name: "Priya Nair", position: "Vice Chairperson", class: "S6 CSE-B", seed: "Priya+Nair", color: "ff6584" },
  { name: "Rohit Menon", position: "Secretary", class: "S4 CSE-A", seed: "Rohit+Menon", color: "43d9a2" },
  { name: "Anjali Pillai", position: "Treasurer", class: "S4 CSE-B", seed: "Anjali+Pillai", color: "f4a261" },
  { name: "Vivek Raj", position: "Technical Lead", class: "S6 EC-A", seed: "Vivek+Raj", color: "ffd166" },
  { name: "Sreelakshmi K", position: "Design Lead", class: "S4 EC-B", seed: "Sreelakshmi+K", color: "5bc0eb" },
  { name: "Mohammed Aslam", position: "Event Coordinator", class: "S6 ME-A", seed: "Mohammed+Aslam", color: "845ef7" },
  { name: "Devu Krishnan", position: "PR Lead", class: "S4 CSE-A", seed: "Devu+Krishnan", color: "fa5252" },
];

const venues = ["Auditorium", "Seminar Hall A", "Seminar Hall B", "Lab Block 1", "Lab Block 2", "Ground", "Canteen Hall"];

const venueBookings = {
  "Auditorium": { 10: "booked", 11: "booked", 12: "booked", 14: "pending" },
  "Seminar Hall A": { 9: "booked", 10: "booked", 15: "pending", 16: "pending" },
  "Seminar Hall B": { 13: "booked" },
  "Lab Block 1": { 9: "booked", 10: "booked", 11: "booked" },
  "Lab Block 2": {},
  "Ground": { 8: "booked", 9: "booked" },
  "Canteen Hall": { 12: "pending" },
};

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
        <span>${e.club} • ${formatDate(e.date)} • ${e.venue}</span>
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
    card.addEventListener('click', () => openEventDetail(subset[i].id));
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
    card.addEventListener('click', () => openEventDetail(filteredEvents[i].id));
  });
}

function createEventCard(e) {
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
            ${e.club || "Club not specified"}
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
  const fee = document.getElementById('filterFee').value;
  const date = document.getElementById('filterDate').value;

  filteredEvents = events.filter(e => {
    if (search && !e.title.toLowerCase().includes(search)) return false;
    if (type && e.type !== type) return false;
    if (club && e.club !== club) return false;
    if (venue && !e.venue.includes(venue)) return false;
    if (fee === 'free' && e.registration_fee > 0) return false;
    if (fee === 'paid' && e.registration_fee == 0) return false;
    if (date && e.date !== date) return false;
    return true;
  });
  renderEventsGrid();
}

function openEventDetail(id) {
  showToast('Event details coming soon!');
}

// ===================== VENUE =====================
function renderVenueSidebar() {
  const list = document.getElementById('venueList');
  if (!list) return;
  
  list.innerHTML = venues.map(v => `
    <div class="venue-list-item ${v === currentVenue ? 'active' : ''}" onclick="selectVenue('${v}')">
      ${v}
    </div>
  `).join('');
}

function selectVenue(name) {
  currentVenue = name;
  
  document.querySelectorAll('.venue-list-item').forEach(item => {
    item.classList.remove('active');
    if (item.textContent.trim() === name) {
      item.classList.add('active');
    }
  });
  
  renderCalendar();
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

    if (bookings[day] === "booked") {
      cell.classList.add("booked");
      cell.title = `Day ${day} - Booked`;
    } else if (bookings[day] === "pending") {
      cell.classList.add("pending");
      cell.title = `Day ${day} - Pending Approval`;
    } else {
      cell.classList.add("available");
      cell.title = `Day ${day} - Available`;
    }

    calendar.appendChild(cell);
  }
}

// Month navigation
const prevMonthBtn = document.getElementById("prevMonth");
const nextMonthBtn = document.getElementById("nextMonth");

if (prevMonthBtn) {
  prevMonthBtn.addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
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
function renderAnnouncements() {
  const tbody = document.getElementById('announcementBody');
  if (!tbody) return;
  
  tbody.innerHTML = announcements.map((a, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${a.title}</strong></td>
      <td>${a.club}</td>
      <td>${formatDate(a.date)}</td>
      <td><span class="type-badge type-${a.type.toLowerCase()}">${a.type}</span></td>
      <td><span class="event-status ${a.status === 'Active' ? 'status-approved' : 'status-past'}">${a.status}</span></td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-sm btn-outline" onclick="showToast('✏️ Editing...')"><i class="fa fa-edit"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${a.id})"><i class="fa fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function deleteAnnouncement(id) {
  const idx = announcements.findIndex(a => a.id === id);
  if (idx > -1) {
    announcements.splice(idx, 1);
    renderAnnouncements();
    showToast('🗑️ Announcement deleted.');
  }
}

function submitAnnouncement(e) {
  e.preventDefault();
  const title = document.getElementById('annTitle').value;
  const type = document.getElementById('annType').value;
  announcements.unshift({
    id: Date.now(),
    title,
    club: 'IEEE',
    date: new Date().toISOString().split('T')[0],
    type,
    status: 'Active'
  });
  renderAnnouncements();
  closeModal('addAnnouncementModal');
  showToast('📢 Announcement published!');
}

// ===================== EXECOM =====================
function renderExecom() {
  const grid = document.getElementById('execomGrid');
  if (!grid) return;
  
  grid.innerHTML = execomMembers.map(m => `
    <div class="execom-card" onclick="showToast('👤 ${m.name} – ${m.position}')">
      <img src="https://api.dicebear.com/7.x/initials/svg?seed=${m.seed}&backgroundColor=${m.color}" alt="${m.name}" class="execom-avatar" />
      <h4>${m.name}</h4>
      <div class="pos">${m.position}</div>
      <div class="cls">${m.class}</div>
    </div>
  `).join('');
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

function submitCreateEvent(e) {
  e.preventDefault();
  showToast("📩 Event creation coming soon!");
  closeModal("createEventModal");
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
}

// ===================== DARK MODE =====================
function setupDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  if (!toggle) return;
  
  toggle.addEventListener('change', function () {
    document.body.classList.toggle('dark', this.checked);
    showToast(this.checked ? '🌙 Dark mode enabled' : '☀️ Light mode enabled');
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
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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
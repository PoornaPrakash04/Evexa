// ===================== DATA =====================
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let currentVenue = "Auditorium";

const events = [
  { id: 1, name: "IoT Workshop 2025", type: "Workshop", club: "IEEE", venue: "Seminar Hall A", date: "2025-03-15", time: "10:00", capacity: 80, registered: 62, fee: 150, status: "upcoming", emoji: "🤖", description: "A hands-on workshop on Internet of Things. Participants will build sensors and connect them to cloud platforms. Includes practical sessions with Arduino and Raspberry Pi.", poster: null },
  { id: 2, name: "Tech Talks: AI Edition", type: "Seminar", club: "CSI", venue: "Auditorium", date: "2025-03-22", time: "14:00", capacity: 200, registered: 185, fee: 0, status: "upcoming", emoji: "🧠", description: "Industry experts share insights on the future of AI, machine learning trends, and career opportunities in the field.", poster: null },
  { id: 3, name: "Code Fiesta Hackathon", type: "Hackathon", club: "IEEE", venue: "Lab Block", date: "2025-02-10", time: "09:00", capacity: 120, registered: 120, fee: 200, status: "past", emoji: "💻", description: "24-hour hackathon where teams compete to build innovative solutions for real-world problems.", poster: null },
  { id: 4, name: "Cultural Nite 2025", type: "Cultural", club: "NSS", venue: "Auditorium", date: "2025-04-05", time: "17:00", capacity: 500, registered: 320, fee: 0, status: "upcoming", emoji: "🎭", description: "Annual cultural night featuring dance, music, drama and other cultural performances by students.", poster: null },
  { id: 5, name: "Python Bootcamp", type: "Workshop", club: "CSI", venue: "Lab Block", date: "2025-01-20", time: "10:00", capacity: 60, registered: 58, fee: 100, status: "past", emoji: "🐍", description: "Intensive 2-day Python bootcamp covering data structures, algorithms, and web development basics.", poster: null },
  { id: 6, name: "Robo Race 2025", type: "Workshop", club: "IEEE", venue: "Ground", date: "2025-04-18", time: "09:00", capacity: 150, registered: 45, fee: 300, status: "pending", emoji: "🏎️", description: "Inter-college robot racing competition. Design and build autonomous robots.", poster: null },
];

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

// ===================== STATE =====================
let currentPage = 'dashboard';
let calendarDate = new Date();
let filteredEvents = [...events];
let notifTab = 'history';
let currentEventDetail = null;
let detailTab = 'info';

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  renderDashboardApprovals();
  renderDashEventGrid();
  renderEventsGrid();
  renderVenueSidebar();
  
  renderCalendar();


  renderAnnouncements();
  renderExecom();
 
  setupSidebar();
  setupNotifications();
  setupDarkMode();
  setupProfile();
});

// ===================== SIDEBAR & NAVIGATION =====================
function setupSidebar() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const overlay = document.getElementById('overlay');

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
    document.getElementById('notifPanel').classList.remove('open');
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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.querySelector(`.nav-item[data-page="${name}"]`)?.classList.add('active');
  currentPage = name;
 
}

// ===================== NOTIFICATIONS =====================
function setupNotifications() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  const overlay = document.getElementById('overlay');

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
  if (!items.length) { body.innerHTML = `<div class="empty-state"><i class="fa fa-bell-slash"></i><p>No notifications</p></div>`; return; }
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
  const pending = events.filter(e => e.status === 'pending');
  if (!pending.length) { list.innerHTML = `<div class="empty-state"><i class="fa fa-check-circle"></i><p>No pending approvals</p></div>`; return; }
  list.innerHTML = pending.map(e => `
    <div class="approval-item">
      <span class="event-type-badge">${e.emoji}</span>
      <div class="approval-info">
        <strong>${e.name}</strong>
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
  const subset = events.slice(0, 4);
  grid.innerHTML = subset.map(e => createEventCard(e)).join('');
  grid.querySelectorAll('.event-card').forEach((card, i) => {
    card.addEventListener('click', () => openEventDetail(subset[i].id));
  });
}

// ===================== EVENTS =====================
function renderEventsGrid() {
  const grid = document.getElementById('eventsGrid');
  if (!filteredEvents.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="fa fa-search"></i><p>No events found matching your filters.</p></div>`;
    return;
  }
  grid.innerHTML = filteredEvents.map(e => createEventCard(e)).join('');
  grid.querySelectorAll('.event-card').forEach((card, i) => {
    card.addEventListener('click', () => openEventDetail(filteredEvents[i].id));
  });
}

function createEventCard(e) {
  const posterBg = { Workshop: '#6c63ff', Seminar: '#ff6584', Hackathon: '#43d9a2', Cultural: '#f4a261', Sports: '#ffd166' };
  const bg = posterBg[e.type] || '#6c63ff';
  return `
    <div class="event-card">
      <div class="event-poster-placeholder" style="background:linear-gradient(135deg,${bg}88,${bg})">
        <span style="font-size:3rem">${e.emoji}</span>
      </div>
      <div class="event-card-body">
        <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
          <span class="event-type-badge">${e.type}</span>
          <span class="fee-badge ${e.fee > 0 ? 'fee-paid' : 'fee-free'}">${e.fee > 0 ? '₹' + e.fee : 'Free'}</span>
        </div>
        <div class="event-card-title">${e.name}</div>
        <div class="event-card-meta">
          <div class="event-meta-row"><i class="fa fa-calendar"></i>${formatDate(e.date)}</div>
          <div class="event-meta-row"><i class="fa fa-clock"></i>${formatTime(e.time)}</div>
          <div class="event-meta-row"><i class="fa fa-map-marker-alt"></i>${e.venue}</div>
          <div class="event-meta-row"><i class="fa fa-users"></i>${e.registered}/${e.capacity} registered</div>
        </div>
        <div class="event-card-footer">
          <span class="event-status status-${e.status}">${capitalize(e.status)}</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">${e.club}</span>
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
    if (search && !e.name.toLowerCase().includes(search)) return false;
    if (type && e.type !== type) return false;
    if (club && e.club !== club) return false;
    if (venue && !e.venue.includes(venue)) return false;
    if (fee === 'free' && e.fee > 0) return false;
    if (fee === 'paid' && e.fee === 0) return false;
    if (date && e.date !== date) return false;
    return true;
  });
  renderEventsGrid();
}

// ===================== EVENT DETAIL MODAL =====================
function openEventDetail(id) {
  currentEventDetail = events.find(e => e.id === id);
  if (!currentEventDetail) return;
  detailTab = 'info';
  document.getElementById('eventDetailContent').innerHTML = buildEventDetail(currentEventDetail);
  openModal('eventDetailModal');
  // bind tab clicks after render
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.detail-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`dtab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function buildEventDetail(e) {
  const posterBg = { Workshop: '#6c63ff', Seminar: '#ff6584', Hackathon: '#43d9a2', Cultural: '#f4a261', Sports: '#ffd166' };
  const bg = posterBg[e.type] || '#6c63ff';

  const fakeRegs = ['Priya Nair – S6 CSE-A', 'Rohit Menon – S4 CSE-A', 'Anjali Pillai – S4 CSE-B', 'Vivek Raj – S6 EC-A', 'Sreelakshmi K – S4 EC-B'].slice(0, Math.min(5, e.registered));

  return `
    <div class="event-detail-header">
      <div class="event-detail-poster" style="background:linear-gradient(135deg,${bg}88,${bg})">
        <span style="font-size:4rem">${e.emoji}</span>
      </div>
      <div class="event-detail-info">
        <h2>${e.name}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span class="event-type-badge">${e.type}</span>
          <span class="event-status status-${e.status}">${capitalize(e.status)}</span>
          <span class="fee-badge ${e.fee > 0 ? 'fee-paid' : 'fee-free'}">${e.fee > 0 ? '₹' + e.fee : 'Free'}</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div class="event-meta-row"><i class="fa fa-calendar" style="color:var(--primary);width:16px"></i><b>${formatDate(e.date)}</b> at <b>${formatTime(e.time)}</b></div>
          <div class="event-meta-row"><i class="fa fa-map-marker-alt" style="color:var(--primary);width:16px"></i>${e.venue}</div>
          <div class="event-meta-row"><i class="fa fa-users" style="color:var(--primary);width:16px"></i>${e.registered} / ${e.capacity} registered</div>
          <div class="event-meta-row"><i class="fa fa-tag" style="color:var(--primary);width:16px"></i>${e.club}</div>
        </div>
      </div>
    </div>

    <div class="event-detail-tabs">
      <button class="detail-tab active" data-tab="info">Description</button>
      <button class="detail-tab" data-tab="registrations">Registrations</button>
      <button class="detail-tab" data-tab="qr">QR / Attendance</button>
      <button class="detail-tab" data-tab="resources">Resources</button>
    </div>

    <div class="detail-tab-content active" id="dtab-info">
      <p style="line-height:1.7;color:var(--text-muted);font-size:0.9rem">${e.description}</p>
    </div>

    <div class="detail-tab-content" id="dtab-points">
      <div class="activity-points-list">
        <div class="ap-item"><span>Participation</span><span class="ap-pts">+2 pts</span></div>
        <div class="ap-item"><span>Attendance (Full Day)</span><span class="ap-pts">+3 pts</span></div>
        <div class="ap-item"><span>Certificate Earned</span><span class="ap-pts">+1 pt</span></div>
        <div class="ap-item"><span>Winner / Prize</span><span class="ap-pts">+5 pts</span></div>
        <div class="ap-item" style="background:var(--primary-light)"><span><b>Maximum Points</b></span><span class="ap-pts"><b>+11 pts</b></span></div>
      </div>
    </div>

    <div class="detail-tab-content" id="dtab-registrations">
      <p style="margin-bottom:12px;font-size:0.85rem;color:var(--text-muted)">${e.registered} registrations of ${e.capacity} capacity</p>
      <div style="background:var(--bg);border-radius:8px;height:8px;margin-bottom:16px;overflow:hidden">
        <div style="height:100%;width:${Math.round(e.registered/e.capacity*100)}%;background:var(--primary);border-radius:8px;"></div>
      </div>
      <table class="registrations-table">
        <thead><tr><th>#</th><th>Name & Class</th><th>Status</th></tr></thead>
        <tbody>
          ${fakeRegs.map((r, i) => `<tr><td>${i+1}</td><td>${r}</td><td><span class="event-status status-approved">Confirmed</span></td></tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="detail-tab-content" id="dtab-qr">
      <div class="qr-scanner-area">
        <div class="qr-placeholder">
          <i class="fa fa-qrcode"></i>
          <span>Point camera to scan</span>
        </div>
        <button class="btn btn-primary" onclick="showToast('📷 QR Scanner activated!')"><i class="fa fa-camera"></i> Start Scanner</button>
        <button class="btn btn-outline" onclick="showToast('📄 Attendance sheet downloaded!')"><i class="fa fa-download"></i> Download Attendance Sheet</button>
      </div>
    </div>

    <div class="detail-tab-content" id="dtab-resources">
      <div class="resources-list">
        <div class="resource-item"><i class="fa fa-file-pdf"></i><span>Event Brochure.pdf</span><button class="btn btn-sm btn-outline" onclick="showToast('📥 Downloading...')"><i class="fa fa-download"></i></button></div>
        <div class="resource-item"><i class="fa fa-image"></i><span>Event Poster.png</span><button class="btn btn-sm btn-outline" onclick="showToast('📥 Downloading...')"><i class="fa fa-download"></i></button></div>
        <div class="resource-item"><i class="fa fa-file-powerpoint"></i><span>Presentation.pptx</span><button class="btn btn-sm btn-outline" onclick="showToast('📥 Downloading...')"><i class="fa fa-download"></i></button></div>
        <div class="resource-item"><i class="fa fa-link"></i><span>Registration Form Link</span><button class="btn btn-sm btn-outline" onclick="showToast('🔗 Link copied!')"><i class="fa fa-copy"></i></button></div>
      </div>
    </div>
  `;
}

// ===================== VENUE =====================

function renderVenueSidebar() {
  const list = document.getElementById('venueList');
  list.innerHTML = venues.map(v => `
    <div class="venue-list-item" onclick="selectVenue('${v}')">
  ${v}
</div>

  `).join('');
}


function selectVenue(name) {
  currentVenue = name;

  console.log("Switched to venue:", currentVenue);

  renderCalendar(); // re-draw calendar
}



// Example booking data (replace with real data later)


function renderCalendar() {


  const month = currentMonth;
  const year = currentYear;

  console.log("Month:", month);
  console.log("Year:", year);
 
  const monthNames = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December"
];

const title = document.getElementById("calendarTitle");
if (title) {
  title.textContent = `${monthNames[currentMonth]} ${currentYear}`;
}

  console.log("Current venue:", currentVenue);
  console.log("Venue bookings:", venueBookings[currentVenue]);

  const calendar = document.getElementById("calendarGrid");
  if (!calendar) return;

  calendar.innerHTML = "";
// 👇 ADD THIS PART
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

days.forEach(day => {
  const header = document.createElement("div");
  header.classList.add("day-header");
  header.textContent = day;
  calendar.appendChild(header);
});


  const firstDay = new Date(year, month).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Empty cells before first date
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.classList.add("calendar-day", "empty");
    calendar.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.classList.add("calendar-day");
    cell.textContent = day;

    const bookings = venueBookings[currentVenue] || {};

if (bookings[day] === "booked") {
  cell.classList.add("booked");
} 
else if (bookings[day] === "pending") {
  cell.classList.add("pending");
}


    calendar.appendChild(cell);
  }
}

document.getElementById("prevMonth")?.addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  renderCalendar();
});

document.getElementById("nextMonth")?.addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  }
  renderCalendar();
});





document.getElementById('prevDay')?.addEventListener('click', () => {
  calendarDate.setDate(calendarDate.getDate() - 1);
 
});
document.getElementById('nextDay')?.addEventListener('click', () => {
  calendarDate.setDate(calendarDate.getDate() + 1);
  
});

// ===================== ANNOUNCEMENTS =====================
function renderAnnouncements() {
  const tbody = document.getElementById('announcementBody');
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
  if (idx > -1) { announcements.splice(idx, 1); renderAnnouncements(); showToast('🗑️ Announcement deleted.'); }
}

function submitAnnouncement(e) {
  e.preventDefault();
  const title = document.getElementById('annTitle').value;
  const type = document.getElementById('annType').value;
  announcements.unshift({ id: Date.now(), title, club: 'IEEE', date: new Date().toISOString().split('T')[0], type, status: 'Active' });
  renderAnnouncements();
  closeModal('addAnnouncementModal');
  showToast('📢 Announcement published!');
}

// ===================== EXECOM =====================
function renderExecom() {
  const grid = document.getElementById('execomGrid');
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
  closeModal('createEventModal');
  showToast('📩 Event request submitted for approval!');
}

// ===================== PROFILE =====================
function setupProfile() {
  const profileBtn = document.getElementById('profilePillBtn');
  let lastPage = 'dashboard'; // store last page before profile

  profileBtn?.addEventListener('click', () => {
    if (currentPage !== 'profile') {
      lastPage = currentPage;        // save current page
      switchPage('profile');          // open profile
    } else {
      switchPage(lastPage);           // go back to last page
    }
  });
}

// ===================== DARK MODE =====================
function setupDarkMode() {
  document.getElementById('darkModeToggle')?.addEventListener('change', function () {
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
  const [h, m] = t.split(':').map(Number);
  return `${h > 12 ? h - 12 : h}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function formatHour(h) {
  return `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`;
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
//js code
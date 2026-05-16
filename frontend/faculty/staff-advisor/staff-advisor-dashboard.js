/* ============================================================
   staff-advisor-dashboard.js  —  Staff Advisor Dashboard
   Main feature: Excel/CSV bulk student upload with preview,
   column mapping, validation, and upload history.
   ============================================================ */

var API = "http://localhost:5000/api";
window.API = API;

/* ── helpers ── */
const el = id => {
  const e = document.getElementById(id);
  if (!e) return null;
  return {
    text: v => { e.textContent = v; return e; },
    html: v => { e.innerHTML = v; return e; },
    show: () => { e.style.display = ''; return e; },
    hide: () => { e.style.display = 'none'; return e; },
    val:  () => e.value,
    raw:  () => e,
  };
};

function cap(s) { if (!s) return ''; return s.charAt(0).toUpperCase() + s.slice(1); }
function fmt(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

/* ── auth fetch ── */
function getAuthToken() { return localStorage.getItem('faculty_auth_token') || null; }
function clearAuthTokens() {
  localStorage.removeItem('faculty_auth_token');
  localStorage.removeItem('faculty_refresh_token');
}

async function apiFetch(endpoint, opts = {}) {
  const token = getAuthToken();
  if (!token) { window.location.href = '../faculty/fcsignin.html'; return null; }

  try {
    const base = (typeof API !== 'undefined' ? API : window.API) || 'http://localhost:5000/api';
    const res = await fetch(`${base}${endpoint}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    // Only redirect on 401 (expired/invalid token) — not on server errors
    if (res.status === 401) {
      clearAuthTokens();
      window.location.href = '../faculty/fcsignin.html';
      return null;
    }
    if (!res.ok) { return null; }
    if (res.status === 204 || res.headers.get('content-length') === '0') return {};
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return {};
    return await res.json();
  } catch (e) {
    console.error('[apiFetch] network error:', e);
    return null;
  }
}

/* ── state ── */
let currentPage   = 'dashboard';
let cachedProfile = null;
let cachedStudents = [];
let cachedEvents   = [];


/* ─ Upload state ─ */
let uploadFile      = null;
let uploadParsed    = [];   // parsed rows (objects)
let uploadHeaders   = [];   // raw headers from file
let uploadColMap    = {};   // { field: colIndex }

// Load history and deduplicate by filename+day (keeps only the most recent per file per day)
let uploadHistory = JSON.parse(localStorage.getItem('sa_upload_history') || '[]');
(function dedupeHistory() {
  const seen = new Set();
  uploadHistory = uploadHistory.filter(h => {
    const key = h.filename + '|' + new Date(h.time).toDateString();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  localStorage.setItem('sa_upload_history', JSON.stringify(uploadHistory));
})();

/* Fields exactly matching the students table */
const STUDENT_FIELDS = [
  { key: 'roll_no',      label: 'Roll No',       required: true  },
  { key: 'admission_no', label: 'Admission No',   required: true  },
  { key: 'name',         label: 'Name',           required: true  },
  { key: 'email',        label: 'Email',          required: true  },
  { key: 'class',        label: 'Class',          required: true  },
  { key: 'department',   label: 'Department',     required: true  },
  { key: 'phone',        label: 'Phone',          required: false },
];

/* auto-detect column name aliases */
const FIELD_ALIASES = {
  roll_no:      ['roll_no', 'rollno', 'roll no', 'roll number', 'regno', 'reg no'],
  admission_no: ['admission_no', 'admissionno', 'admission no', 'admission number', 'adm no', 'adm_no', 'admno'],
  name:         ['name', 'full name', 'fullname', 'student name', 'student_name'],
  email:        ['email', 'email address', 'emailid', 'email id', 'mail'],
  class:        ['class', 'class name', 'classname', 'batch', 'section', 'group'],
  department:   ['department', 'dept', 'branch', 'program', 'course'],
  phone:        ['phone', 'mobile', 'contact', 'phone no', 'mobile no', 'contact no'],
};



/* ── PAGE META ── */
const PAGE_META = {
  'dashboard':        ['Dashboard',             'Welcome back — here\'s your advisor overview.'],
  'students':         ['Student Registry',      'Manage students in your batch.'],
  'upload':           ['Upload Students',       'Bulk-add students via Excel or CSV.'],
  'event-list':       ['Event List',            'Browse all approved and upcoming events.'],
  'venues':           ['Venues & Availability', 'Check venue status and make bookings.'],
  'all-clubs':        ['All Clubs',             'Browse all clubs and their events.'],
  'account-settings': ['Account Settings',      'Manage your profile and password.'],
};

/* ── navigation ── */
function navigateTo(page) {
  currentPage = page;
  localStorage.setItem('saCurrentPage', page);

  document.querySelectorAll('.page-section').forEach(s => s.style.display = 'none');
  const pg = document.getElementById(`pg-${page}`);
  if (pg) pg.style.display = 'flex';

  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  const meta = PAGE_META[page] || [cap(page), ''];
  el('pageTitle')?.text(meta[0]);
  el('pageSub')?.text(meta[1]);

  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.style.display = (page !== 'dashboard') ? 'inline-flex' : 'none';

  if (page === 'students')      renderStudentsTable();
  if (page === 'event-list')    renderEventsTable();
  if (page === 'upload')        renderUploadHistory();
  if (page === 'venues')        loadVenues();
  if (page === 'all-clubs')     renderAllClubs();

  // close mobile sidebar
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
  }
}

/* ── BOOT ── */
async function boot() {
  applyTheme();

  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.addEventListener('click', () => navigateTo(el.dataset.page))
  );

  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    const s = document.getElementById('sidebar');
    if (!s) return;
    window.innerWidth <= 768
      ? s.classList.toggle('mobile-open')
      : s.classList.toggle('collapsed');
  });

  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('profileBtn')?.addEventListener('click', openProfileDrawer);
  document.getElementById('miniUser')?.addEventListener('click', openProfileDrawer);
  document.getElementById('closeProfileBtn')?.addEventListener('click', closeProfileDrawer);
  document.getElementById('overlay')?.addEventListener('click', closeProfileDrawer);
  document.getElementById('allClubsSearch')?.addEventListener('input', () =>
    renderAllClubs(document.getElementById('allClubsSearch').value.toLowerCase(), document.getElementById('allClubsCategory')?.value || 'all')
  );
  document.getElementById('allClubsCategory')?.addEventListener('change', e =>
    renderAllClubs(document.getElementById('allClubsSearch')?.value.toLowerCase() || '', e.target.value)
  );


  // Search filters
  document.getElementById('studentSearch')?.addEventListener('input', renderStudentsTable);
  document.getElementById('studentBatchFilter')?.addEventListener('change', renderStudentsTable);
  document.getElementById('studentDeptFilter')?.addEventListener('change', renderStudentsTable);
  document.getElementById('eventSearch')?.addEventListener('input', renderEventsTable);


  // Upload
  initUploadZone();

  let profile = await apiFetch('/faculty/me');
  if (!profile) {
    // apiFetch already redirected if 401. For other failures (network/server),
    // show an error rather than redirecting to a nonexistent page.
    console.error('Could not load faculty profile — check server connection.');
    profile = {}; // use empty profile so dashboard still loads
  }

  cachedProfile = profile;
  const name     = profile.name || 'Staff Advisor';
  const initials = name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0,2) || 'SA';
  const dept     = profile.department || '';
  const roleName = profile.role_name  || 'Staff Advisor';
  const facNo    = profile.faculty_no || '';

  el('miniName')?.text(name);
  el('miniRole')?.text(facNo ? `${facNo} · ${roleName}` : roleName);
  el('miniAvatar')?.text(initials);
  el('topAvatar')?.text(initials);
  el('rolePill')?.text(`${roleName}${dept ? ' · ' + dept : ''}`);

  // Account Settings pre-fill
  if (document.getElementById('asName'))       document.getElementById('asName').value = name;
  if (document.getElementById('asEmail'))      document.getElementById('asEmail').value = profile.email || '';
  if (document.getElementById('asPhone'))      document.getElementById('asPhone').value = profile.phone_no || profile.phone || '';
  if (document.getElementById('asFacultyNo'))  document.getElementById('asFacultyNo').value = facNo;
  if (document.getElementById('asDepartment')) document.getElementById('asDepartment').value = dept;
  if (document.getElementById('asProfileAvatar')) document.getElementById('asProfileAvatar').textContent = initials;
  if (document.getElementById('asProfileNamePreview')) document.getElementById('asProfileNamePreview').textContent = name;

  const h     = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  el('heroGreeting')?.text(`${greet}, ${name.split(' ')[0]}`);

  await refreshAll();

  initSACalendar();
  updateNotifBadge();

  const savedPage = localStorage.getItem('saCurrentPage') || 'dashboard';
  navigateTo(savedPage);
}

/* ── refresh all data ── */
async function refreshAll() {
  const [students, events] = await Promise.all([
    apiFetch('/faculty/advisor/students').catch(() => null),
    apiFetch('/events/all').catch(() => null),
  ]);

  cachedStudents = Array.isArray(students) ? students : [];
  cachedEvents   = Array.isArray(events)   ? events   : [];

  updateDashboard();
  updateStudentFilters();
}





/* ── dashboard ── */
function updateDashboard() {
  const total  = cachedStudents.length;
  const events = cachedEvents.filter(e => ['hall_approved','approved'].includes((e.status||'').toLowerCase())).length;
  const batches = [...new Set(cachedStudents.map(s => s.class).filter(Boolean))].length;

  el('heroStudents')?.text(total);
  el('heroTotalStudents')?.text(total);
  el('heroActiveEvents')?.text(events);
  el('heroBatches')?.text(batches || '—');
  el('badge-students')?.text(total);

  // Render calendar with fresh events
  saRenderCalendar();
}

function statusClass(s) {
  const m = { hall_approved:'approved', faculty_approved:'pending', submitted:'pending', rejected:'rejected', completed:'completed' };
  return m[(s||'').toLowerCase()] || 'pending';
}
function statusLabel(s) {
  const m = { hall_approved:'Approved', faculty_approved:'Pending Hall', submitted:'Pending', rejected:'Rejected', completed:'Completed', draft:'Draft' };
  return m[(s||'').toLowerCase()] || cap(s) || '—';
}

/* ── chart helpers (analytics page only) ── */
let aCharts = {};

function chartColors() {
  return ['#06b6d4','#8b5cf6','#ec4899','#84cc16','#f59e0b','#3b82f6','#10b981','#ef4444'];
}

/* ── Event Calendar ── */
let saCalYear  = new Date().getFullYear();
let saCalMonth = new Date().getMonth();

function toISTDate(raw) {
  return new Date(new Date(raw).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function initSACalendar() {
  document.getElementById('saCalPrev')?.addEventListener('click', () => {
    saCalMonth--;
    if (saCalMonth < 0) { saCalMonth = 11; saCalYear--; }
    saRenderCalendar();
  });
  document.getElementById('saCalNext')?.addEventListener('click', () => {
    saCalMonth++;
    if (saCalMonth > 11) { saCalMonth = 0; saCalYear++; }
    saRenderCalendar();
  });
  saRenderCalendar();
}

function saRenderCalendar() {
  const label = document.getElementById('saCalMonthLabel');
  if (label) label.textContent = new Date(saCalYear, saCalMonth).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const cal = document.getElementById('saMiniCalendar');
  if (!cal) return;

  const today       = new Date();
  const firstDay    = new Date(saCalYear, saCalMonth, 1).getDay();
  const daysInMonth = new Date(saCalYear, saCalMonth + 1, 0).getDate();

  const eventMap = {};
  (cachedEvents || []).forEach(e => {
    if (!e.date) return;
    const d = toISTDate(e.date);
    if (d.getFullYear() === saCalYear && d.getMonth() === saCalMonth) {
      const key = `${saCalYear}-${saCalMonth}-${d.getDate()}`;
      if (!eventMap[key]) eventMap[key] = [];
      eventMap[key].push(e);
    }
  });

  const weekdays = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  let html = `<div class="cal-weekdays">${weekdays.map(d => `<div class="cal-weekday">${d}</div>`).join('')}</div>`;
  html += `<div class="cal-days">`;

  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const key      = `${saCalYear}-${saCalMonth}-${day}`;
    const isToday  = today.getDate() === day && today.getMonth() === saCalMonth && today.getFullYear() === saCalYear;
    const hasEvent = !!eventMap[key];
    const classes  = ['cal-day', isToday ? 'today' : '', hasEvent ? 'has-event' : ''].filter(Boolean).join(' ');
    const events   = hasEvent ? JSON.stringify(eventMap[key]).replace(/"/g, '&quot;') : '';
    html += `<div class="${classes}" data-day="${day}" data-events="${events}" onclick="saCalDayClick(this)">${day}</div>`;
  }

  html += `</div>`;
  cal.innerHTML = html;

  const detail = document.getElementById('saCalEventDetail');
  if (detail) detail.style.display = 'none';
}

function saCalDayClick(el) {
  if (!el.classList.contains('has-event')) return;

  const detail = document.getElementById('saCalEventDetail');

  if (el.classList.contains('selected')) {
    el.classList.remove('selected');
    if (detail) detail.style.display = 'none';
    return;
  }

  document.querySelectorAll('#saMiniCalendar .cal-day.selected').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');

  const events  = JSON.parse(el.getAttribute('data-events').replace(/&quot;/g, '"'));
  const e       = events[0];
  const titleEl = document.getElementById('saCalDetailTitle');
  const metaEl  = document.getElementById('saCalDetailMeta');
  const linkEl  = document.getElementById('saCalDetailLink');

  if (!detail || !titleEl || !metaEl || !linkEl) return;

  const date = new Date(e.date).toLocaleDateString('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });
  const fee  = e.registration_fee > 0 ? `₹${e.registration_fee}` : 'Free';

  titleEl.textContent = e.title;
  metaEl.textContent  = `📅 ${date} · 🏛️ ${e.venue || 'TBA'} · 💰 ${fee} · 🏷️ ${e.club || '—'}`;
  if (events.length > 1) metaEl.textContent += ` (+${events.length - 1} more)`;
  linkEl.href = '#';
  linkEl.onclick = (e) => { e.preventDefault(); navigateTo('event-list'); };

  detail.style.display = 'block';
}

function renderAnalyticsCharts() {
  if (aCharts.batch) return; // already rendered

  const batches = {};
  cachedStudents.forEach(s => { const b = s.class || 'Unknown'; batches[b] = (batches[b]||0)+1; });
  const bLabels = Object.keys(batches), bVals = Object.values(batches);

  const bCtx = document.getElementById('aBatchChart')?.getContext('2d');
  if (bCtx) {
    aCharts.batch = new Chart(bCtx, {
      type: 'bar',
      data: { labels: bLabels, datasets: [{ label:'Students', data:bVals, backgroundColor:'rgba(6,182,212,.7)', borderRadius:8 }] },
      options: defaultChartOptions('Students per Batch'),
    });
  }

  const depts = {};
  cachedStudents.forEach(s => { const d = s.department || 'Unknown'; depts[d] = (depts[d]||0)+1; });
  const dLabels = Object.keys(depts), dVals = Object.values(depts);
  const colors = chartColors();

  const dCtx = document.getElementById('aDeptChart')?.getContext('2d');
  if (dCtx) {
    aCharts.dept = new Chart(dCtx, {
      type: 'doughnut',
      data: { labels: dLabels, datasets: [{ data: dVals, backgroundColor: colors.slice(0,dLabels.length), borderWidth:2, borderColor:'transparent' }] },
      options: { cutout:'65%', plugins:{ legend:{ display:false } } },
    });
    const legend = document.getElementById('aDeptLegend');
    if (legend) {
      legend.innerHTML = dLabels.map((l,i) => `<div class="donut-legend-item"><div class="donut-legend-dot" style="background:${colors[i]||'#ccc'}"></div>${l}: ${dVals[i]}</div>`).join('');
    }
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pCtx = document.getElementById('aParticipationChart')?.getContext('2d');
  if (pCtx) {
    aCharts.participation = new Chart(pCtx, {
      type: 'line',
      data: { labels:months, datasets:[{ label:'Registrations', data:[12,18,24,15,30,22,28,35,20,18,25,32], borderColor:'#8b5cf6', backgroundColor:'rgba(139,92,246,.1)', tension:.4, fill:true, pointRadius:4 }] },
      options: defaultChartOptions('Monthly Registrations'),
    });
  }

  const venues = {};
  cachedEvents.forEach(e => { const v = e.venue || 'Unknown'; venues[v] = (venues[v]||0)+1; });
  const vLabels = Object.keys(venues), vVals = Object.values(venues);
  const vCtx = document.getElementById('aVenueChart')?.getContext('2d');
  if (vCtx) {
    aCharts.venue = new Chart(vCtx, {
      type: 'bar',
      data: { labels:vLabels, datasets:[{ label:'Events', data:vVals, backgroundColor:'rgba(236,72,153,.65)', borderRadius:8 }] },
      options: defaultChartOptions('Events per Venue'),
    });
  }

  const total = cachedStudents.length;
  const evCount = cachedEvents.length;
  el('aKpiStudents')?.text(total);
  el('aKpiEvents')?.text(evCount);
  el('aKpiRegs')?.text('—');
  el('aKpiRate')?.text(total > 0 ? Math.round((evCount / total) * 100) + '%' : '—');
}

function defaultChartOptions(title) {
  return {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: 'rgba(8,11,20,.9)', bodyColor:'#f0f2ff', titleColor:'#f0f2ff', borderColor:'rgba(255,255,255,.08)', borderWidth:1 },
    },
    scales: {
      x: { grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'rgba(240,242,255,.45)', font:{size:11} } },
      y: { grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'rgba(240,242,255,.45)', font:{size:11} } },
    },
  };
}

/* ── STUDENTS TABLE ── */
function updateStudentFilters() {
  const batches = [...new Set(cachedStudents.map(s => s.class).filter(Boolean))].sort();
  const depts   = [...new Set(cachedStudents.map(s => s.department).filter(Boolean))].sort();

  const bSel = document.getElementById('studentBatchFilter');
  if (bSel) {
    const cur = bSel.value;
    bSel.innerHTML = `<option value="">All Classes</option>` + batches.map(b => `<option value="${b}" ${b===cur?'selected':''}>${b}</option>`).join('');
  }
  const dSel = document.getElementById('studentDeptFilter');
  if (dSel) {
    const cur = dSel.value;
    dSel.innerHTML = `<option value="">All Departments</option>` + depts.map(d => `<option value="${d}" ${d===cur?'selected':''}>${d}</option>`).join('');
  }
}

function renderStudentsTable() {
  const q    = (document.getElementById('studentSearch')?.value || '').toLowerCase();
  const bat  = document.getElementById('studentBatchFilter')?.value  || '';
  const dept = document.getElementById('studentDeptFilter')?.value   || '';

  let students = cachedStudents.filter(s => {
    if (bat  && s.class      !== bat)  return false;
    if (dept && s.department !== dept) return false;
    if (q) {
      const hay = [s.name,s.roll_no,s.admission_no,s.email,s.phone,s.class].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  el('studentCountLabel')?.text(`${students.length} student${students.length!==1?'s':''} found`);

  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  if (!students.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="list-empty" style="text-align:center;padding:32px;">No students match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map(s => `
    <tr>
      <td><input type="checkbox" class="student-chk" data-id="${s.id}"/></td>
      <td style="color:var(--text);font-weight:700">${s.name}</td>
      <td><code style="font-size:12px;background:var(--surface-2);padding:2px 7px;border-radius:5px;">${s.roll_no}</code></td>
      <td style="color:var(--text-3);font-size:12px;">${s.admission_no||'—'}</td>
      <td>${s.email}</td>
      <td><span class="badge completed">${s.class||'—'}</span></td>
      <td>${s.department||'—'}</td>
      <td>${s.phone||'—'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="mini-btn" onclick="openEditStudent(${s.id})">✏️ Edit</button>
          <button class="mini-btn danger" onclick="deleteStudent(${s.id})">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.student-chk').forEach(chk => {
    chk.addEventListener('change', updateBulkActions);
  });
}

function toggleSelectAll(e) {
  document.querySelectorAll('.student-chk').forEach(c => c.checked = e.target.checked);
  updateBulkActions();
}

function updateBulkActions() {
  const checked = document.querySelectorAll('.student-chk:checked').length;
  const bar = document.getElementById('bulkActions');
  if (bar) bar.style.display = checked > 0 ? 'flex' : 'none';
}

// FIX 3: deleteStudent now uses the correct backend route
function deleteStudent(id) {
  if (!confirm('Delete this student?')) return;
  cachedStudents = cachedStudents.filter(s => s.id !== id);
  renderStudentsTable();
  showToast('Student removed.', 'success');
  apiFetch(`/faculty/advisor/students/${id}`, { method: 'DELETE' });
}

/* ── EDIT STUDENT ── */
function openEditStudent(id) {
  const s = cachedStudents.find(s => s.id === id);
  if (!s) return;
  document.getElementById('editStudentId').value    = id;
  document.getElementById('editRollNo').value       = s.roll_no      || '';
  document.getElementById('editAdmissionNo').value  = s.admission_no || '';
  document.getElementById('editName').value         = s.name         || '';
  document.getElementById('editEmail').value        = s.email        || '';
  document.getElementById('editClass').value        = s.class        || '';
  document.getElementById('editDepartment').value   = s.department   || '';
  document.getElementById('editPhone').value        = s.phone        || '';
  document.getElementById('editStudentModal').style.display = 'flex';
}

function closeEditStudent() {
  document.getElementById('editStudentModal').style.display = 'none';
}

// FIX 3: saveEditStudent now uses the correct backend route
function saveEditStudent() {
  const id   = parseInt(document.getElementById('editStudentId').value);
  const idx  = cachedStudents.findIndex(s => s.id === id);
  if (idx < 0) return;
  const updated = {
    ...cachedStudents[idx],
    roll_no:      document.getElementById('editRollNo').value,
    admission_no: document.getElementById('editAdmissionNo').value,
    name:         document.getElementById('editName').value,
    email:        document.getElementById('editEmail').value,
    class:        document.getElementById('editClass').value,
    department:   document.getElementById('editDepartment').value,
    phone:        document.getElementById('editPhone').value,
  };
  cachedStudents[idx] = updated;
  closeEditStudent();
  renderStudentsTable();
  showToast('Student updated.', 'success');
  apiFetch(`/faculty/advisor/students/${id}`, { method: 'PUT', body: JSON.stringify(updated) });
}

/* ── EVENTS TABLE ── */
function renderEventsTable() {
  const q = (document.getElementById('eventSearch')?.value || '').toLowerCase();

  let events = cachedEvents.filter(e => {
    if (q) {
      const hay = [e.title, e.club, e.venue].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  el('eventCountLabel')?.text(`${events.length} event${events.length!==1?'s':''}`);

  const tbody = document.getElementById('eventsTableBody');
  if (!tbody) return;

  if (!events.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="list-empty" style="text-align:center;padding:32px;">No events found.</td></tr>`;
    return;
  }

  tbody.innerHTML = events.map(ev => `
    <tr>
      <td><span class="ev-name-btn" style="cursor:pointer;font-weight:700;color:var(--violet);text-decoration:underline;text-underline-offset:3px;" onclick="saOpenEventDetail('${ev.id}')">${ev.title}</span></td>
      <td>${ev.club||'—'}</td>
      <td>${fmt(ev.date)}</td>
      <td>${ev.venue||'—'}</td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn ghost sm" onclick="downloadParticipantsList('${ev.id}')" title="Download Participants List">⬇️ Participants</button>
          <button class="btn ghost sm" onclick="downloadEventReport('${ev.id}')" title="Download Event Report">📄 Report</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function downloadParticipantsList(eventId) {
  const ev = cachedEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;
  showToast('Fetching participants…', 'info');
  try {
    const data = await apiFetch(`/faculty/events/${eventId}/participants`);
    // Faculty route returns a plain array
    const participants = Array.isArray(data) ? data : [];
    if (!participants.length) {
      showToast('No participants registered for this event.', 'warn');
      return;
    }
    const headers = ['#', 'Name', 'Roll No', 'Admission No', 'Email', 'Class', 'Department', 'Phone', 'Registered At'];
    const rows = participants.map((p, i) => [
      i + 1,
      p.name        || '—',
      p.roll_no     || '—',
      p.admission_no|| '—',
      p.email       || '—',
      p.class       || '—',
      p.department  || '—',
      p.phone       || '—',
      p.registered_at ? fmt(p.registered_at) : '—',
    ]);
    exportToCSV([headers, ...rows], `participants_${slugify(ev.title)}.csv`);
    showToast(`Downloaded ${participants.length} participants!`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to fetch participants.', 'error');
  }
}

async function downloadEventReport(eventId) {
  const ev = cachedEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;
  showToast('Generating report…', 'info');
  try {
    const data = await apiFetch(`/faculty/events/${eventId}/participants`);
    const participants = Array.isArray(data) ? data : [];

    const reportRows = [
      ['EVENT REPORT'],
      [],
      ['Event Title',      ev.title || '—'],
      ['Club',             ev.club  || '—'],
      ['Date',             fmt(ev.date || ev.event_date)],
      ['Venue',            ev.venue || '—'],
      ['Category',         ev.category || ev.type || '—'],
      ['Status',           ev.status || '—'],
      ['Registration Fee', ev.registration_fee > 0 ? '₹' + ev.registration_fee : 'Free'],
      ['Capacity',         ev.capacity || ev.expected_participants || '—'],
      ['Total Registered', participants.length],
      ['Description',      ev.description || '—'],
      [],
      ['PARTICIPANTS LIST'],
      ['#', 'Name', 'Roll No', 'Admission No', 'Email', 'Class', 'Department', 'Phone', 'Registered At'],
      ...participants.map((p, i) => [
        i + 1,
        p.name         || '—',
        p.roll_no      || '—',
        p.admission_no || '—',
        p.email        || '—',
        p.class        || '—',
        p.department   || '—',
        p.phone        || '—',
        p.registered_at ? fmt(p.registered_at) : '—',
      ]),
    ];
    exportToCSV(reportRows, `event_report_${slugify(ev.title)}.csv`);
    showToast(`Report generated — ${participants.length} participants.`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to generate report.', 'error');
  }
}

function slugify(str) {
  return (str || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function exportToCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}


/* ═══════════════════════════════════════════════════════════
   EXCEL / CSV UPLOAD
   ═══════════════════════════════════════════════════════════ */

function initUploadZone() {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  if (!dropZone || !fileInput) return;
  if (dropZone._uploadInited) return;  // prevent double event binding
  dropZone._uploadInited = true;

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
  });
}

function handleFileSelected(file) {
  const allowed = ['.xlsx','.xls','.csv'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) { showToast('Please upload .xlsx, .xls, or .csv file.', 'error'); return; }
  if (file.size > 10 * 1024 * 1024) { showToast('File too large (max 10MB).', 'error'); return; }

  uploadFile = file;

  const bar = document.getElementById('fileInfoBar');
  if (bar) {
    bar.style.display = 'flex';
    document.getElementById('fileInfoName').textContent = file.name;
    document.getElementById('fileInfoSize').textContent = formatBytes(file.size);
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      let data;
      if (ext === '.csv') {
        data = parseCSV(e.target.result);
      } else {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      }
      processRawData(data);
    } catch(err) {
      showToast('Could not read file: ' + err.message, 'error');
    }
  };
  ext === '.csv' ? reader.readAsText(file) : reader.readAsArrayBuffer(file);
}

function parseCSV(text) {
  return text.split('\n').map(row => {
    const cells = []; let cur = ''; let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }).filter(r => r.some(c => c !== ''));
}

function processRawData(rawRows) {
  if (!rawRows || rawRows.length < 2) { showToast('File appears empty or has only a header row.', 'error'); return; }

  const headerRow = rawRows[0].map(h => (h||'').toString().trim());
  uploadHeaders   = headerRow;

  uploadColMap = {};
  STUDENT_FIELDS.forEach(field => {
    const aliases = FIELD_ALIASES[field.key] || [field.key];
    for (let ci = 0; ci < headerRow.length; ci++) {
      const h = headerRow[ci].toLowerCase().replace(/[_\s-]/g,'');
      if (aliases.some(a => a.replace(/[_\s-]/g,'') === h)) {
        uploadColMap[field.key] = ci;
        break;
      }
    }
  });

  uploadParsed = rawRows.slice(1).filter(r => r.some(c => (c||'').toString().trim() !== '')).map(row => {
    const obj = {};
    STUDENT_FIELDS.forEach(f => {
      const ci = uploadColMap[f.key];
      obj[f.key] = ci !== undefined ? (row[ci]||'').toString().trim() : '';
    });
    return obj;
  });

  renderColumnMapping();

  const mappingSection = document.getElementById('mappingSection');
  const uploadOptions  = document.getElementById('uploadOptions');
  const actionRow      = document.getElementById('uploadActionRow');
  if (mappingSection) mappingSection.style.display = 'block';
  if (uploadOptions)  uploadOptions.style.display  = 'flex';
  if (actionRow)      actionRow.style.display      = 'flex';

  showToast(`File loaded: ${uploadParsed.length} rows detected.`, 'success');
}

function renderColumnMapping() {
  const grid = document.getElementById('mappingGrid');
  if (!grid) return;

  grid.innerHTML = STUDENT_FIELDS.map(field => {
    const current = uploadColMap[field.key];
    const req     = field.required ? '<span style="color:#f87171">*</span>' : '';
    return `
      <div class="map-row">
        <div class="map-label">${field.label} ${req}</div>
        <select class="map-select" data-field="${field.key}" onchange="updateColMap('${field.key}', this.value)">
          <option value="">— Not mapped —</option>
          ${uploadHeaders.map((h,i) => `<option value="${i}" ${i===current?'selected':''}>${h}</option>`).join('')}
        </select>
      </div>
    `;
  }).join('');
}

function updateColMap(field, value) {
  if (value === '') { delete uploadColMap[field]; }
  else { uploadColMap[field] = parseInt(value); }
}

function clearFile() {
  uploadFile   = null;
  uploadParsed = [];
  uploadHeaders= [];
  uploadColMap = {};

  const fileInput = document.getElementById('fileInput');
  if (fileInput) fileInput.value = '';

  document.getElementById('fileInfoBar').style.display     = 'none';
  document.getElementById('mappingSection').style.display  = 'none';
  document.getElementById('uploadOptions').style.display   = 'none';
  document.getElementById('uploadActionRow').style.display = 'none';
}

/* Preview */
function previewUpload() {
  if (!uploadParsed.length) { showToast('No data to preview.', 'error'); return; }

  const finalRows = uploadParsed.map(raw => {
    const obj = {};
    STUDENT_FIELDS.forEach(f => {
      obj[f.key] = (raw[f.key]||'').toString().trim();
    });
    return obj;
  });

  const errors  = [];
  const warns   = [];
  const existing = new Set(cachedStudents.map(s => s.roll_no));

  finalRows.forEach((row, i) => {
    if (!row.roll_no)      errors.push(`Row ${i+1}: Missing roll number`);
    if (!row.admission_no) errors.push(`Row ${i+1}: Missing admission number`);
    if (!row.name)         errors.push(`Row ${i+1}: Missing name`);
    if (!row.email)        errors.push(`Row ${i+1}: Missing email`);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) warns.push(`Row ${i+1}: Invalid email format`);
    if (!row.class)        warns.push(`Row ${i+1}: Missing class/section`);
    if (!row.department)   warns.push(`Row ${i+1}: Missing department`);
    if (existing.has(row.roll_no)) warns.push(`Row ${i+1}: ${row.roll_no} already exists (will update)`);
  });

  const modal = document.getElementById('previewModal');
  if (!modal) return;

  document.getElementById('previewFileName').textContent = uploadFile?.name || '—';
  document.getElementById('previewMeta').textContent = `${finalRows.length} row(s) — ${errors.length} error(s), ${warns.length} warning(s)`;
  document.getElementById('previewStats').textContent = `✅ ${finalRows.length - errors.length} valid · ⚠️ ${warns.length} warnings · ❌ ${errors.length} errors`;

  const summary = document.getElementById('validationSummary');
  if (summary) {
    summary.style.display = '';
    if (errors.length > 0) {
      summary.className = 'validation-summary err';
      summary.innerHTML = `❌ ${errors.length} error(s) found. Please fix before uploading.<br><small>${errors.slice(0,3).join(' | ')}${errors.length>3?' …':''}</small>`;
    } else if (warns.length > 0) {
      summary.className = 'validation-summary warn';
      summary.innerHTML = `⚠️ ${warns.length} warning(s). You can still proceed.<br><small>${warns.slice(0,3).join(' | ')}${warns.length>3?' …':''}</small>`;
    } else {
      summary.className = 'validation-summary ok';
      summary.innerHTML = `✅ All ${finalRows.length} rows look good! Ready to upload.`;
    }
  }

  const confirmBtn = document.getElementById('confirmUploadBtn');
  if (confirmBtn) confirmBtn.disabled = errors.length > 0;

  const thead = document.getElementById('previewTableHead');
  if (thead) thead.innerHTML = `<tr>${STUDENT_FIELDS.map(f=>`<th>${f.label}</th>`).join('')}</tr>`;

  const tbody = document.getElementById('previewTableBody');
  if (tbody) {
    const existingSet = new Set(cachedStudents.map(s => s.roll_no));
    tbody.innerHTML = finalRows.slice(0,50).map((row) => {
      const isUpdate = existingSet.has(row.roll_no);
      const isErr    = !row.roll_no || !row.name || !row.email;
      return `<tr>
        ${STUDENT_FIELDS.map(f => {
          let cls = '';
          if (!row[f.key] && f.required) cls = 'cell-error';
          else if (f.key === 'roll_no' && isUpdate) cls = 'cell-warn';
          else if (!isErr && !isUpdate) cls = 'cell-new';
          else if (isUpdate) cls = 'cell-update';
          return `<td class="${cls}">${row[f.key]||'—'}</td>`;
        }).join('')}
      </tr>`;
    }).join('');
    if (finalRows.length > 50) {
      tbody.innerHTML += `<tr><td colspan="${STUDENT_FIELDS.length}" style="text-align:center;color:var(--text-3);padding:10px;">… and ${finalRows.length-50} more rows</td></tr>`;
    }
  }

  modal.style.display = 'flex';
}

function closePreview() {
  document.getElementById('previewModal').style.display = 'none';
}

let _uploadInProgress = false;
async function confirmUpload() {
  if (_uploadInProgress) return;          // prevent double-fire
  _uploadInProgress = true;
  const confirmBtn = document.getElementById('confirmUploadBtn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '⏳ Uploading…'; }

  const skipDupes = document.getElementById('optSkipDuplicates')?.checked;
  closePreview();

  let added = 0, updated = 0;
  const existingMap = {};
  cachedStudents.forEach(s => { existingMap[s.roll_no] = s; });

  uploadParsed.forEach(row => {
    if (!row.roll_no || !row.name || !row.email) return;
    if (existingMap[row.roll_no]) {
      if (!skipDupes) { Object.assign(existingMap[row.roll_no], row); updated++; }
    } else {
      const newS = { ...row, id: Date.now() + Math.random(), password: row.admission_no };
      cachedStudents.push(newS);
      existingMap[row.roll_no] = newS;
      added++;
    }
  });

  const todayStr = new Date().toDateString();
  const fname = uploadFile?.name || 'upload';
  // Remove any existing history entries for the same file uploaded today (prevents duplicates)
  uploadHistory = uploadHistory.filter(h => !(h.filename === fname && new Date(h.time).toDateString() === todayStr));

  const histEntry = {
    filename: fname,
    time: new Date().toISOString(),
    added, updated,
    total: uploadParsed.length,
  };
  uploadHistory.unshift(histEntry);
  uploadHistory = uploadHistory.slice(0, 20);
  localStorage.setItem('sa_upload_history', JSON.stringify(uploadHistory));

  // POST to correct backend route (was wrongly /students/bulk before — that route doesn't exist)
  const validRows = uploadParsed.filter(s => s.roll_no && s.name && s.email);
  await apiFetch('/faculty/advisor/students', {
    method: 'POST',
    body: JSON.stringify(validRows.map(s => ({ ...s, password: s.admission_no }))),
  });

  showToast(`✅ Upload complete! Added ${added}, Updated ${updated}.`, 'success');
  addLocalNotif('📤', 'Students Uploaded', `${added} added, ${updated} updated from ${uploadFile?.name}`);

  clearFile();
  renderUploadHistory();

  // Re-fetch all students from server so pre-existing students still appear (not just the uploaded batch)
  const freshStudents = await apiFetch('/faculty/advisor/students').catch(() => null);
  if (Array.isArray(freshStudents)) cachedStudents = freshStudents;

  el('badge-students')?.text(cachedStudents.length);
  updateStudentFilters();
  updateDashboard();

  _uploadInProgress = false;
  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '✅ Confirm & Upload'; }
}

function renderUploadHistory() {
  const list = document.getElementById('uploadHistoryList');
  if (!list) return;
  if (!uploadHistory.length) { list.innerHTML = '<div class="list-empty">No uploads yet.</div>'; return; }
  list.innerHTML = uploadHistory.map(h => `
    <div class="upload-hist-item">
      <div class="uhi-icon">📄</div>
      <div class="uhi-meta">
        <div class="uhi-name">${h.filename}</div>
        <div class="uhi-sub">${fmt(h.time)} · ${h.added} added, ${h.updated} updated</div>
      </div>
      <div class="uhi-count">${h.total} rows</div>
    </div>
  `).join('');
}

/* ── TEMPLATE DOWNLOADS ── */
function downloadTemplate() {
  if (typeof XLSX === 'undefined') { showToast('XLSX library not loaded.', 'error'); return; }
  const headers = ['roll_no','admission_no','name','email','class','department','phone'];
  const example = ['CS21001','ADM2021001','John Doe','john@college.edu','S6 CSE A','Computer Science','9876543210'];
  const ws = XLSX.utils.aoa_to_sheet([headers, example]);
  headers.forEach((h,i) => {
    const cellAddr = XLSX.utils.encode_cell({r:0,c:i});
    if (!ws[cellAddr].s) ws[cellAddr].s = {};
    ws[cellAddr].s = { font:{bold:true}, fill:{fgColor:{rgb:'06B6D4'}} };
  });
  ws['!cols'] = headers.map(() => ({wch:20}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Students');
  XLSX.writeFile(wb, 'student-upload-template.xlsx');
  showToast('Template downloaded!', 'success');
}

function downloadTemplateCSV() {
  const rows = [
    'roll_no,admission_no,name,email,class,department,phone',
    'CS21001,ADM2021001,John Doe,john@college.edu,S6 CSE A,Computer Science,9876543210',
  ];
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'student-upload-template.csv';
  a.click(); URL.revokeObjectURL(a.href);
  showToast('CSV template downloaded!', 'success');
}

function exportStudentsCSV() {
  const rows = [
    'roll_no,admission_no,name,email,class,department,phone',
    ...cachedStudents.map(s => [s.roll_no,s.admission_no,s.name,s.email,s.class,s.department,s.phone].join(','))
  ];
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'students.csv';
  a.click(); URL.revokeObjectURL(a.href);
  showToast('Students exported!', 'success');
}

/* ── Account Settings ── */
async function saveAccountSettings() {
  const msg    = document.getElementById('asFormMsg');
  const name   = document.getElementById('asName')?.value.trim();
  const email  = document.getElementById('asEmail')?.value.trim();
  const phone  = document.getElementById('asPhone')?.value.trim();
  const dept   = document.getElementById('asDepartment')?.value.trim();
  const curPw  = document.getElementById('asCurrentPassword')?.value;
  const newPw  = document.getElementById('asNewPassword')?.value;
  const confPw = document.getElementById('asConfirmPassword')?.value;

  if (!name || !email || !dept || !phone) {
    if (msg) { msg.textContent = 'Name, email, department and phone are required.'; msg.style.color = '#f87171'; }
    return;
  }

  if (newPw && newPw !== confPw) {
    if (msg) { msg.textContent = 'Passwords do not match.'; msg.style.color = '#f87171'; }
    return;
  }

  const payload = { name, email, department: dept, phone_no: phone };
  if (newPw) {
    payload.current_password = curPw;
    payload.new_password     = newPw;
  }

  const result = await apiFetch('/faculty/me', { method: 'PUT', body: JSON.stringify(payload) });
  if (result) {
    showToast('Settings saved!', 'success');
    if (msg) { msg.textContent = 'Changes saved successfully.'; msg.style.color = '#4ade80'; }
  } else {
    if (msg) { msg.textContent = 'Failed to save. Check your current password.'; msg.style.color = '#f87171'; }
  }
}

/* ── PROFILE DRAWER ── */
function openProfileDrawer() {
  document.getElementById('profileDrawer')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('open');
  const body = document.getElementById('profileDrawerBody');
  if (!body) return;
  const p = cachedProfile || {};
  const name = p.name || 'Staff Advisor';
  const init = name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0 24px;text-align:center;border-bottom:1px solid var(--border);">
      <div style="width:60px;height:60px;border-radius:16px;background:var(--g-accent);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:white;">${init}</div>
      <div style="font-size:18px;font-weight:800;color:var(--text);">${name}</div>
      <div style="font-size:12px;color:var(--text-3);">${p.role_name||'Staff Advisor'} · ${p.department||''}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;padding-top:16px;">
      ${profileRow('🎓','Faculty No',p.faculty_no)}
      ${profileRow('✉️','Email',p.email)}
      ${profileRow('📱','Phone',p.phone_no || p.phone)}
      ${profileRow('🏛️','Department',p.department)}
    </div>
    <div style="margin-top:20px;">
      <button class="btn primary" style="width:100%" onclick="navigateTo('account-settings');closeProfileDrawer()">⚙️ Account Settings</button>
    </div>
  `;
}

function profileRow(icon, label, val) {
  return `<div style="padding:10px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;">
    <div style="font-size:10px;color:var(--text-3);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px;">${icon} ${label}</div>
    <div style="font-size:13.5px;font-weight:700;color:var(--text);">${val||'—'}</div>
  </div>`;
}

function closeProfileDrawer() {
  document.getElementById('profileDrawer')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('open');
}


/* ── THEME ── */
function applyTheme() {
  const light = localStorage.getItem('sa_theme') === 'light';
  document.body.classList.toggle('light', light);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = light ? '☀️' : '🌙';
}
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('sa_theme', isLight ? 'light' : 'dark');
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = isLight ? '☀️' : '🌙';
}

/* ── TOAST ── */
let toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ── LOGOUT ── */
function logout() {
  if (!confirm('Log out?')) return;
  clearAuthTokens();
  localStorage.removeItem('saCurrentPage');
  window.location.href = '../faculty/fcsignin.html';
}

/* ── UTILS ── */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

/* ══════════════════════════════════════════════════════════
   VENUES
   ══════════════════════════════════════════════════════════ */
let saVenues        = [];
let saCurrentVenueId = null;
let saCurrentVenue   = '';
const saVenueBookings = {};
let saCurrentMonth = new Date().getMonth();
let saCurrentYear  = new Date().getFullYear();

async function loadVenues() {
  try {
    const data = await apiFetch('/venues');
    if (Array.isArray(data) && data.length) {
      saVenues = data;
      saCurrentVenueId = data[0].id;
      saCurrentVenue   = data[0].name || '';
    }
  } catch (err) { console.error('Venue load error:', err); }
  renderSAVenueSidebar();
  await loadSAVenueBookings();
  renderSACalendar();
  populateBookVenueSelect();
  await loadMyVenueBookings(); // load booking history panel
}

function renderSAVenueSidebar() {
  const list = document.getElementById('venueList');
  if (!list) return;
  list.innerHTML = saVenues.map(v => `
    <div class="venue-list-item ${v.id === saCurrentVenueId ? 'active' : ''}"
         onclick="selectSAVenue(${v.id})">${v.name || 'Venue'}</div>
  `).join('');
}

async function selectSAVenue(venueId) {
  const v = saVenues.find(x => x.id === venueId);
  if (!v) return;
  saCurrentVenueId = v.id; saCurrentVenue = v.name || '';
  renderSAVenueSidebar();
  await loadSAVenueBookings();
  renderSACalendar();
}

async function loadSAVenueBookings() {
  if (!saCurrentVenueId) return;
  try {
    const data = await apiFetch(`/venues/calendar?venue_id=${saCurrentVenueId}&month=${saCurrentMonth + 1}&year=${saCurrentYear}`);
    if (!Array.isArray(data)) return;
    saVenueBookings[saCurrentVenueId] = {};
    const PRIORITY = { booked: 3, 'faculty-approved': 2, partial: 1.5, pending: 1, unavailable: 0.5, available: 0 };
    data.forEach(item => {
      const s        = (item.status || 'available').toLowerCase();
      const existing = saVenueBookings[saCurrentVenueId][item.day];
      if (!existing || (PRIORITY[s] ?? 0) > (PRIORITY[existing] ?? 0)) {
        saVenueBookings[saCurrentVenueId][item.day] = s;
      }
    });
  } catch (err) { console.error('Booking load error:', err); }
}

function renderSACalendar() {
  const grid  = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarTitle');
  if (!grid || !title) return;
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  title.textContent = `${months[saCurrentMonth]} ${saCurrentYear}`;
  grid.innerHTML = '';
  const firstDay    = new Date(saCurrentYear, saCurrentMonth, 1).getDay();
  const daysInMonth = new Date(saCurrentYear, saCurrentMonth + 1, 0).getDate();
  const today       = new Date();
  const bookings    = saVenueBookings[saCurrentVenueId] || {};

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div'); empty.className = 'venue-day-empty'; grid.appendChild(empty);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const status = bookings[d] || 'available';
    const cell   = document.createElement('div');
    cell.className = `venue-day ${status}`;
    if (d === today.getDate() && saCurrentMonth === today.getMonth() && saCurrentYear === today.getFullYear()) cell.classList.add('today');
    cell.innerHTML = `<span class="day-number">${d}</span><span class="day-dot"></span>`;
    cell.title = `${d} ${months[saCurrentMonth]} — ${cap(status)}`;
    grid.appendChild(cell);
  }
}

document.getElementById('prevMonth')?.addEventListener('click', async () => {
  saCurrentMonth--; if (saCurrentMonth < 0) { saCurrentMonth = 11; saCurrentYear--; }
  await loadSAVenueBookings(); renderSACalendar();
});
document.getElementById('nextMonth')?.addEventListener('click', async () => {
  saCurrentMonth++; if (saCurrentMonth > 11) { saCurrentMonth = 0; saCurrentYear++; }
  await loadSAVenueBookings(); renderSACalendar();
});

/* ── Venue Booking Modal ── */
function populateBookVenueSelect() {
  const sel = document.getElementById('bookVenueSelect');
  if (!sel) return;
  sel.innerHTML = saVenues.map(v => `<option value="${v.id}">${v.name}${v.capacity ? ' (Cap: ' + v.capacity + ')' : ''}</option>`).join('');
  if (saCurrentVenueId) sel.value = saCurrentVenueId;
}

function openBookVenueModal() {
  populateBookVenueSelect();
  // default date to today
  const today = new Date().toISOString().split('T')[0];
  const dateEl = document.getElementById('bookVenueDate');
  if (dateEl && !dateEl.value) dateEl.value = today;
  document.getElementById('bookVenueModal').style.display = 'flex';
}

function closeBookVenueModal() {
  document.getElementById('bookVenueModal').style.display = 'none';
}

/**
 * Convert "HH:MM" (from <input type="time">) → "HH:MM:SS" for the backend.
 * Already-formatted "HH:MM:SS" values are passed through unchanged.
 */
function toTimeSeconds(t) {
  if (!t) return null;
  return /^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t;
}

async function submitVenueBooking() {
  const venueId      = document.getElementById('bookVenueSelect')?.value;
  const eventTitle   = document.getElementById('bookVenueEventTitle')?.value.trim();
  const date         = document.getElementById('bookVenueDate')?.value;
  const startRaw     = document.getElementById('bookVenueStart')?.value;
  const endRaw       = document.getElementById('bookVenueEnd')?.value;
  const participants = document.getElementById('bookVenueParticipants')?.value;
  const purpose      = document.getElementById('bookVenuePurpose')?.value.trim();

  // Full validation — backend now requires start_time & end_time too
  if (!venueId || !eventTitle || !date) {
    showToast('Please fill Venue, Event Title, and Date.', 'error'); return;
  }
  if (!startRaw || !endRaw) {
    showToast('Please select Start Time and End Time.', 'error'); return;
  }
  if (startRaw >= endRaw) {
    showToast('End Time must be after Start Time.', 'error'); return;
  }

  // Normalise HH:MM → HH:MM:SS
  const startTime = toTimeSeconds(startRaw);
  const endTime   = toTimeSeconds(endRaw);

  const payload = {
    venue_id:              Number(venueId),
    title:                 eventTitle,
    date,
    start_time:            startTime,
    end_time:              endTime,
    expected_participants: participants || null,
    purpose:               purpose || null,
  };

  try {
    // FIX: correct route is POST /faculty/venues/book (not /venues/book)
    const result = await apiFetch('/faculty/venues/book', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (result !== null) {
      showToast('📍 Venue booking submitted!', 'success');
      addLocalNotif('📍', 'Venue Booked', `${eventTitle} — ${date}`);
      closeBookVenueModal();
      // Clear form fields
      ['bookVenueEventTitle','bookVenueDate','bookVenueStart','bookVenueEnd',
       'bookVenueParticipants','bookVenuePurpose']
        .forEach(id => { const el2 = document.getElementById(id); if (el2) el2.value = ''; });
      // Refresh calendar and bookings list
      await loadSAVenueBookings();
      renderSACalendar();
      await loadMyVenueBookings();
    } else {
      showToast('Booking failed. Please try again.', 'error');
    }
  } catch (err) {
    console.error('[submitVenueBooking]', err);
    showToast('Booking failed. Please try again.', 'error');
  }
}

/* ── My Venue Bookings (history shown below calendar) ── */
let saMyBookings = [];

async function loadMyVenueBookings() {
  try {
    const data = await apiFetch('/faculty/venues/bookings/mine');
    saMyBookings = Array.isArray(data) ? data : [];
  } catch (e) {
    saMyBookings = [];
  }
  renderMyVenueBookings();
}

function renderMyVenueBookings() {
  const tbody = document.getElementById('myVenueBookingsBody');
  if (!tbody) return;

  const statusClass = s => ({ pending:'pending', faculty_approved:'pending', hall_approved:'approved', rejected:'rejected' }[s] || 'pending');
  const statusLabel = s => ({ pending:'Pending', faculty_approved:'Faculty Approved', hall_approved:'Approved', rejected:'Rejected' }[s] || s);
  const fmtDate = d => { try { return new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); } catch { return d||'\u2014'; }};
  const fmtT = t => { if (!t) return '\u2014'; const parts = t.split(':'); const hr=Number(parts[0]); return `${hr%12||12}:${parts[1]} ${hr<12?'AM':'PM'}`; };

  if (!saMyBookings.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-3);">No bookings yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = saMyBookings.map(b => `
    <tr>
      <td style="font-weight:700;color:var(--text)">${b.event_title || b.purpose || 'Venue Request'}</td>
      <td>${b.venue_name || '\u2014'}</td>
      <td>${fmtDate(b.date)}</td>
      <td>${fmtT(b.slot_start)} \u2013 ${fmtT(b.slot_end)}</td>
      <td><span class="badge ${statusClass(b.status)}">${statusLabel(b.status)}</span></td>
    </tr>
  `).join('');
}

/* \u2500\u2500 Venue page tab switcher \u2500\u2500 */
function switchVenueTab(tab) {
  document.querySelectorAll('.venue-tab').forEach(btn => {
    btn.classList.toggle('active', btn.id === `vtab-${tab}`);
  });
  ['calendar', 'mybookings'].forEach(p => {
    const panel = document.getElementById(`vtab-panel-${p}`);
    if (panel) panel.style.display = (p === tab) ? '' : 'none';
  });
  if (tab === 'mybookings') renderMyVenueBookings();
}

/* ══════════════════════════════════════════════════════════
   ALL CLUBS
   ══════════════════════════════════════════════════════════ */
let saAllClubsData      = [];
let saCurrentClubDetail = null;
let saCurrentClubEvents = [];

async function renderAllClubs(search = '', category = 'all') {
  const grid = document.getElementById('allClubsGrid');
  if (!grid) return;
  grid.innerHTML = `<div class="list-empty" style="padding:20px;">Loading…</div>`;

  let fresh = await apiFetch('/clubs');
  if (!Array.isArray(fresh) || !fresh.length) fresh = [];
  saAllClubsData = fresh.length ? fresh : saAllClubsData;



  const emojis = ['🤖','⚡','💻','🤝','🚀','📷','🎨','🏆','🎯','💡','🌍','🎵','🔬','🎭','🏅','📐','🌱','🔭','🎮','🎻'];
  let list = saAllClubsData;

  if (search) list = list.filter(c =>
    (c.club_name||c.name||'').toLowerCase().includes(search) ||
    (c.club_category||c.category||c.type||'').toLowerCase().includes(search) ||
    (c.description||'').toLowerCase().includes(search)
  );
  if (category !== 'all') list = list.filter(c => {
    const raw = (c.club_category||c.category||c.type||'').toLowerCase().trim();
    if (category === 'technical')     return raw === 'technical';
    if (category === 'non-technical') return raw === 'non-technical';
    return raw === category.toLowerCase();
  });

  if (!list.length) { grid.innerHTML = `<div class="list-empty" style="padding:20px;">No clubs found.</div>`; return; }

  grid.innerHTML = list.map((c, i) => {
    const clubName   = c.club_name || c.name || 'Club';
    const clubId     = String(c.id ?? c.club_id ?? '');
    const clubEvents = cachedEvents.filter(e =>
      String(e.club_id ?? e.clubId ?? '') === clubId ||
      (e.club || e.club_name || '').trim().toLowerCase() === clubName.trim().toLowerCase()
    );
    const upcoming = clubEvents.filter(e => {
      const d = e.date || e.event_date || e.start_date;
      return d && new Date(d) >= new Date();
    }).length;

    return `
      <div class="ac-card" onclick="saOpenClubDetail('${clubId}', ${i})">
        <div class="ac-card-top">
          <div class="ac-emoji">${c.logo || emojis[i % emojis.length]}</div>
          <div style="flex:1;min-width:0;">
            <div class="ac-name">${clubName}</div>
            <div class="ac-cat">${c.club_category||c.category||c.type||'Club'}</div>
          </div>
          <span class="badge ${c.status === 'inactive' ? 'rejected' : 'approved'}" style="flex-shrink:0;">${c.status||'Active'}</span>
        </div>
        <div class="ac-stats">
          <div class="ac-stat"><div class="ac-stat-val">${c.member_count||c.members||0}</div><div class="ac-stat-label">Members</div></div>
          <div class="ac-stat"><div class="ac-stat-val">${clubEvents.length}</div><div class="ac-stat-label">Events</div></div>
          <div class="ac-stat"><div class="ac-stat-val">${upcoming}</div><div class="ac-stat-label">Upcoming</div></div>
        </div>
        <div class="ac-footer">
          <div style="font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;">
            ${c.description ? c.description.slice(0,60) + (c.description.length > 60 ? '…' : '') : '—'}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function saOpenClubDetail(clubId, idx) {
  const emojis = ['🤖','⚡','💻','🤝','🚀','📷','🎨','🏆','🎯','💡','🌍','🎵','🔬','🎭','🏅','📐','🌱','🔭','🎮','🎻'];
  const club   = saAllClubsData.find(c => String(c.id ?? c.club_id ?? '') === String(clubId));
  if (!club) return;

  saCurrentClubDetail = club;
  const clubName      = club.club_name || club.name || 'Club';
  saCurrentClubEvents = cachedEvents.filter(e =>
    String(e.club_id ?? e.clubId ?? '') === String(clubId) ||
    (e.club || e.club_name || '').trim().toLowerCase() === clubName.trim().toLowerCase()
  ).sort((a, b) => new Date(b.date||b.event_date||b.start_date) - new Date(a.date||a.event_date||a.start_date));

  const upcoming = saCurrentClubEvents.filter(e => {
    const d = e.date || e.event_date || e.start_date;
    return d && new Date(d) >= new Date();
  }).length;

  document.getElementById('clubDetailEmoji').textContent = club.logo || emojis[idx % emojis.length];
  document.getElementById('clubDetailName').textContent  = clubName;
  document.getElementById('clubDetailCat').textContent   = club.club_category || club.category || club.type || 'Club';

  const statsEl = document.getElementById('clubDetailStats');
  if (statsEl) {
    statsEl.innerHTML = [
      { val: club.member_count || club.members || 0, label: 'Members'      },
      { val: saCurrentClubEvents.length,             label: 'Total Events' },
      { val: upcoming,                               label: 'Upcoming'     },
    ].map(s => `<div class="club-ds-cell"><div class="club-ds-val">${s.val}</div><div class="club-ds-label">${s.label}</div></div>`).join('');
  }

  saFilterClubEvents();
  switchClubTab('events', document.querySelector('.club-tab'));

  document.getElementById('clubDetailOverlay').style.display = '';
  document.getElementById('clubDetailDrawer').style.display  = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeClubDetail() {
  document.getElementById('clubDetailOverlay').style.display = 'none';
  document.getElementById('clubDetailDrawer').style.display  = 'none';
  document.body.style.overflow = '';
}

function switchClubTab(tab, btn) {
  document.querySelectorAll('.club-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else document.querySelectorAll('.club-tab').forEach(t =>
    t.classList.toggle('active', t.textContent.toLowerCase().includes(tab))
  );
  document.getElementById('clubTabEvents').style.display = tab === 'events' ? '' : 'none';
  document.getElementById('clubTabInfo').style.display   = tab === 'info'   ? '' : 'none';
  if (tab === 'info') saShowClubInfo();
}

function filterClubEvents() { saFilterClubEvents(); }

function saFilterClubEvents() {
  const status = document.getElementById('clubEventStatusFilter')?.value || 'all';
  const search = (document.getElementById('clubEventSearch')?.value || '').toLowerCase();
  let list = saCurrentClubEvents;
  if (status !== 'all') list = list.filter(e => (e.status||'approved').toLowerCase() === status.toLowerCase());
  if (search) list = list.filter(e =>
    (e.title||'').toLowerCase().includes(search) ||
    (e.venue||'').toLowerCase().includes(search) ||
    (e.category||e.type||'').toLowerCase().includes(search)
  );
  const tbody = document.getElementById('clubDetailEventsBody');
  if (!tbody) return;
  const fmtDate = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); } catch { return '—'; } };
  tbody.innerHTML = list.length ? list.map(e => `
    <tr>
      <td><span style="font-weight:700;color:var(--text)">${e.title || 'Untitled'}</span></td>
      <td>${fmtDate(e.date || e.event_date || e.start_date)}</td>
      <td>${e.venue || '—'}</td>
      <td><span class="badge completed">${e.category || e.type || 'General'}</span></td>
      <td>${e.capacity || e.expected_participants || '—'}</td>
      <td>${e.registration_fee > 0 ? '₹' + e.registration_fee : 'Free'}</td>
      <td><span class="badge ${statusClass(e.status)}">${statusLabel(e.status)}</span></td>
    </tr>
  `).join('')
  : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-3);">No events match filter.</td></tr>`;
}

/* ── Club Detail info tab ── */
function saShowClubInfo() {
  const club = saCurrentClubDetail;
  if (!club) return;
  const infoEl = document.getElementById('clubDetailInfo');
  if (!infoEl) return;
  infoEl.innerHTML = `
    <div class="club-detail-info-grid">
      ${[
        ['Club Name',   club.club_name || club.name || '—'],
        ['Category',    club.club_category || club.category || club.type || '—'],
        ['Status',      club.status || 'Active'],
        ['Members',     club.member_count || club.members || 0],
        ['Faculty',     club.faculty_name || club.incharge || '—'],
        ['Email',       club.email || '—'],
        ['Description', club.short_description || club.description || '—'],
      ].map(([l, v]) => `
        <div class="club-info-cell">
          <div class="club-info-label">${l}</div>
          <div class="club-info-val">${v}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════
   EVENT DETAIL DRAWER (simplified)
   ══════════════════════════════════════════════════════════ */
function saOpenEventDetail(eventId) {
  const ev = cachedEvents.find(e => String(e.id) === String(eventId));
  if (!ev) return;
  const fmtDate = d => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); } catch { return '—'; } };

  document.getElementById('edDrawerTitle').textContent = ev.title || 'Event Details';
  document.getElementById('edDrawerSub').textContent   = `${ev.club || '—'} · ${fmtDate(ev.date || ev.event_date)}`;

  document.getElementById('eventDetailBody').innerHTML = `
    <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${[
          ['📅 Date',    fmtDate(ev.date || ev.event_date || ev.start_date)],
          ['📍 Venue',   ev.venue || '—'],
          ['🏛️ Club',    ev.club  || '—'],
          ['👤 Organizer',ev.organizer || ev.created_by || '—'],
          ['👥 Capacity', ev.capacity || ev.expected_participants || '—'],
          ['💰 Fee',      ev.registration_fee > 0 ? '₹' + ev.registration_fee : 'Free'],
          ['🏷️ Category', ev.category || ev.type || '—'],
          ['📊 Status',   cap(ev.status || 'approved')],
        ].map(([l,v]) => `
          <div style="background:var(--surface-2);border-radius:10px;padding:12px;">
            <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">${l}</div>
            <div style="font-size:14px;font-weight:700;color:var(--text);">${v}</div>
          </div>
        `).join('')}
      </div>
      ${ev.description ? `<div style="background:var(--surface-2);border-radius:10px;padding:14px;">
        <div style="font-size:11px;color:var(--text-3);margin-bottom:6px;">📝 Description</div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.6;">${ev.description}</div>
      </div>` : ''}
    </div>
  `;

  document.getElementById('eventDetailOverlay').style.display = 'block';
  const drawer = document.getElementById('eventDetailDrawer');
  drawer.style.display = 'flex';
  requestAnimationFrame(() => drawer.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function saCloseEventDetail() {
  const drawer = document.getElementById('eventDetailDrawer');
  if (drawer) { drawer.classList.remove('open'); setTimeout(() => { drawer.style.display = 'none'; }, 300); }
  document.getElementById('eventDetailOverlay').style.display = 'none';
  document.body.style.overflow = '';
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', boot);
// ============================================================
//  faculty-dashboard.js  —  EVEXA Faculty Portal
// ============================================================

// ── DATA ──────────────────────────────────────────────────────────────────

const PROPOSALS = [
  { id:1, name:"Robo Race 2026",       organizer:"Robotics Club",     date:"Mar 15, 2026", category:"Technical",  status:"pending",  desc:"Annual inter-college robotics competition featuring autonomous and manual bots.", objectives:"Foster robotics skills, promote teamwork, inter-college exposure.", participants:200, venue:"Sports Arena, Block A", time:"9:00 AM – 5:00 PM", doc:"robo_race_proposal.pdf" },
  { id:2, name:"AI & ML Summit",        organizer:"Data Science Club", date:"Mar 22, 2026", category:"Technical",  status:"pending",  desc:"Two-day summit covering latest trends in Artificial Intelligence and Machine Learning.", objectives:"Industry exposure, paper presentations, keynote speakers.", participants:150, venue:"Seminar Hall 1", time:"10:00 AM – 4:00 PM", doc:"ai_summit_proposal.pdf" },
  { id:3, name:"Hackathon 36H",         organizer:"FOSS Club",        date:"Apr 5, 2026",  category:"Technical",  status:"review",   desc:"36-hour non-stop coding hackathon open to all students.", objectives:"Problem solving, open source contribution, team building.", participants:120, venue:"Computer Lab Block C", time:"6:00 PM (36 hrs)", doc:"hackathon_proposal.pdf" },
  { id:4, name:"Cultural Fest Spectrum",organizer:"Cultural Committee",date:"Apr 12, 2026", category:"Cultural",   status:"review",   desc:"Annual 3-day cultural extravaganza featuring music, dance, drama and art.", objectives:"Cultural exchange, student creativity, entertainment.", participants:500, venue:"Open Air Auditorium", time:"4:00 PM – 9:00 PM", doc:"spectrum_proposal.pdf" },
  { id:5, name:"Web Dev Workshop",      organizer:"IEEE Branch",       date:"Mar 20, 2026", category:"Workshop",   status:"approved", desc:"Full-stack web development workshop covering HTML, CSS, JS and React.", objectives:"Skill building, hands-on learning, portfolio development.", participants:60,  venue:"Lab 4, Block B", time:"10:00 AM – 3:00 PM", doc:"webdev_proposal.pdf" },
  { id:6, name:"Photography Walk",      organizer:"Photography Club",  date:"Apr 25, 2026", category:"Creative",   status:"approved", desc:"Campus photography walk followed by editing workshop.", objectives:"Photography skills, creative expression, exhibition.", participants:40,  venue:"Campus Grounds", time:"6:00 AM – 9:00 AM", doc:"photo_walk_proposal.pdf" },
  { id:7, name:"Space Awareness Day",   organizer:"Space Club",        date:"May 3, 2026",  category:"Science",    status:"rejected", desc:"Stargazing night and astronomy awareness program.", objectives:"Science awareness, telescope sessions, ISRO discussion.", participants:80,  venue:"Rooftop Observatory", time:"6:00 PM – 10:00 PM", doc:"space_day_proposal.pdf" },
];

const CERTIFICATES = [
  { id:1,  student:"Arjun Kumar",    reg:"STU-2026-019", event:"Robo Race 2026",    attendance:true,  status:"pending"  },
  { id:2,  student:"Meena Pillai",   reg:"STU-2026-034", event:"Robo Race 2026",    attendance:true,  status:"pending"  },
  { id:3,  student:"Siddharth Nair", reg:"STU-2026-041", event:"Robo Race 2026",    attendance:false, status:"pending"  },
  { id:4,  student:"Divya Thomas",   reg:"STU-2026-055", event:"Web Dev Workshop",  attendance:true,  status:"pending"  },
  { id:5,  student:"Karthik Raj",    reg:"STU-2026-062", event:"Web Dev Workshop",  attendance:true,  status:"pending"  },
  { id:6,  student:"Lakshmi Nair",   reg:"STU-2026-078", event:"Web Dev Workshop",  attendance:true,  status:"approved" },
  { id:7,  student:"Ananya Krishnan",reg:"STU-2026-083", event:"AI & ML Summit",    attendance:true,  status:"pending"  },
  { id:8,  student:"Rahul Menon",    reg:"STU-2026-091", event:"AI & ML Summit",    attendance:false, status:"pending"  },
  { id:9,  student:"Priya Suresh",   reg:"STU-2026-104", event:"Photography Walk",  attendance:true,  status:"approved" },
  { id:10, student:"Neil Mathew",    reg:"STU-2026-117", event:"Photography Walk",  attendance:true,  status:"pending"  },
  { id:11, student:"Sneha Rajan",    reg:"STU-2026-122", event:"Cultural Fest",     attendance:true,  status:"pending"  },
  { id:12, student:"Arjun Varma",    reg:"STU-2026-139", event:"Cultural Fest",     attendance:true,  status:"rejected" },
];

const CLUBS = [
  { id:1, logo:"🤖", name:"Robotics Club",   category:"Technical", members:87,  chair:"Ravi Shankar",    events:3, reports:2, status:"Active" },
  { id:2, logo:"⚡", name:"IEEE Branch",      category:"Technical", members:142, chair:"Ananya Krishnan", events:4, reports:3, status:"Active" },
  { id:3, logo:"💻", name:"FOSS Club",        category:"Technical", members:63,  chair:"Karthik Raj",     events:2, reports:1, status:"Active" },
  { id:4, logo:"🤝", name:"NSS Club",         category:"Social",    members:210, chair:"Lakshmi Nair",    events:5, reports:4, status:"Active" },
  { id:5, logo:"🚀", name:"Space Club",       category:"Science",   members:55,  chair:"Neil Mathew",     events:2, reports:1, status:"Active" },
  { id:6, logo:"📷", name:"Photography Club", category:"Creative",  members:48,  chair:"Priya Suresh",    events:2, reports:2, status:"Active" },
];

const NOTIFICATIONS = [
  { id:1, type:"event",   icon:"📋", title:"3 new event proposals submitted",    sub:"Robotics, FOSS, Cultural Committee",  time:"Today, 10:22 AM", read:false },
  { id:2, type:"cert",    icon:"🎓", title:"12 certificates awaiting approval",  sub:"Robo Race 2026 & Web Dev Workshop",   time:"Today, 9:14 AM",  read:false },
  { id:3, type:"admin",   icon:"📢", title:"Admin: Semester calendar deadline",  sub:"All proposals due before Feb 28",     time:"Yesterday",       read:false },
  { id:4, type:"club",    icon:"🏷️", title:"IEEE Club submitted annual report",  sub:"Please review and validate",          time:"2 days ago",      read:true  },
  { id:5, type:"club",    icon:"🏷️", title:"NSS Club — Blood donation drive",   sub:"Event report uploaded",               time:"3 days ago",      read:true  },
  { id:6, type:"event",   icon:"📋", title:"Web Dev Workshop approved",          sub:"IEEE Branch — March 20",              time:"4 days ago",      read:true  },
  { id:7, type:"cert",    icon:"🎓", title:"Photography Walk certs processed",   sub:"8 certificates issued",               time:"5 days ago",      read:true  },
];

const ANNOUNCEMENTS = [
  { title:"📌 Semester Event Calendar Deadline", from:"Admin", date:"Feb 20, 2026", body:"All event proposals for March must be submitted and approved by Feb 28. Please review and approve pending proposals at the earliest." },
  { title:"🎓 Certificate Verification Drive",   from:"Admin", date:"Feb 18, 2026", body:"Batch certificate approvals for January events are due. Please complete verification of attendance-marked students by end of this week." },
  { title:"🏷️ Club Annual Review Submission",   from:"Admin", date:"Feb 15, 2026", body:"All clubs must submit their semester activity reports. Faculty advisors are requested to review and validate reports before March 5." },
];

const FEEDBACK_COMMENTS = [
  { name:"Arjun Kumar",    event:"Robo Race 2026",     rating:5, text:"Absolutely loved the event! Great organisation, amazing teams and a super competitive atmosphere." },
  { name:"Meena Pillai",   event:"Web Dev Workshop",   rating:4, text:"Very informative session. The React portion could have been more hands-on, but overall great content." },
  { name:"Karthik Raj",    event:"FOSS Hackathon",     rating:5, text:"Best hackathon I've been to. Loved the open source theme and the mentors were really helpful." },
  { name:"Divya Thomas",   event:"Photography Walk",   rating:4, text:"Really fun morning! Editing workshop was the highlight. Would love to see Photoshop included next time." },
  { name:"Ananya Krishnan",event:"AI & ML Summit",     rating:5, text:"The keynote speakers were outstanding. Learned so much about real-world ML deployment." },
  { name:"Siddharth Nair", event:"Cultural Fest",      rating:3, text:"Fun event but the schedule ran quite late. Music performances were excellent though." },
];

// ── STATE ─────────────────────────────────────────────────────────────────
let currentPage   = "dashboard";
let proposals     = PROPOSALS.map(p => ({ ...p }));
let certificates  = CERTIFICATES.map(c => ({ ...c }));
let chartsInited  = false;
let calYear       = 2026;
let calMonth      = 2; // 0-indexed: Feb

// ── NAVIGATION ────────────────────────────────────────────────────────────
function navigateTo(page) {
  // Hide all
  document.querySelectorAll("[id^='pg-']").forEach(el => el.style.display = "none");

  // Show target
  const target = document.getElementById("pg-" + page);
  if (target) target.style.display = "";

  // Active nav
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  currentPage = page;

  // Update topbar
  const titles = {
    "dashboard":    ["Dashboard",              "Welcome back, Dr. Ramesh — here's your faculty overview."],
    "proposals":    ["Event Proposal Review",  "Review, comment and approve event proposals."],
    "event-list":   ["Event List",             "All events across all clubs."],
    "calendar":     ["Approval Calendar",      "View scheduled events and approval deadlines."],
    "certificates": ["Certificate Approvals",  "Verify attendance and issue student certificates."],
    "clubs":        ["Club Oversight",         "Monitor club activity and review reports."],
    "analytics":    ["Reports & Analytics",    "Event statistics and student participation data."],
    "feedback":     ["Feedback & Reports",     "Student feedback ratings and comments."],
    "notif-history":["Notification History",   "All alerts and system notifications."],
    "pending":      ["Pending Approvals",      "All items requiring your approval."],
  };
  const [t, s] = titles[page] || ["Dashboard", ""];
  document.getElementById("pageTitle").textContent = t;
  document.getElementById("pageSub").textContent   = s;

  // Lazy renders
  if (page === "proposals")     renderProposals();
  if (page === "event-list")    renderEventList();
  if (page === "certificates")  renderCerts();
  if (page === "clubs")         renderClubs();
  if (page === "notif-history") renderNotifHistory();
  if (page === "pending")       renderPendingPage();
  if (page === "calendar")      renderCalendar();
  if (page === "analytics" && !chartsInited) { chartsInited = true; setTimeout(initCharts, 50); }
  if (page === "feedback")      renderFeedback();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────
function renderDashboard() {
  // Pending list
  const pl = document.getElementById("dashPendingList");
  if (pl) {
    pl.innerHTML = proposals.filter(p => p.status === "pending" || p.status === "review").slice(0,4).map(p => `
      <div class="list-item">
        <div class="dot ${p.status==="pending"?"dot-orange":"dot-blue"}"></div>
        <div class="li-text">
          <div class="li-title">${p.name}</div>
          <div class="li-sub">${p.organizer} · ${p.date}</div>
        </div>
        <span class="badge ${p.status==="pending"?"pending":"review"}">${p.status==="pending"?"Pending":"Review"}</span>
      </div>`).join("");
  }

  // Notifications
  const nl = document.getElementById("dashNotifList");
  if (nl) {
    nl.innerHTML = NOTIFICATIONS.slice(0,4).map(n => `
      <div class="list-item">
        <div class="dot ${n.read?"dot-blue":"dot-red"}"></div>
        <div class="li-text">
          <div class="li-title">${n.title}</div>
          <div class="li-sub">${n.time}</div>
        </div>
      </div>`).join("");
  }

  // Announcements
  const ab = document.getElementById("announcementBoard");
  if (ab) {
    ab.innerHTML = ANNOUNCEMENTS.map(a => `
      <div class="announce-card">
        <div class="announce-title">${a.title}</div>
        <div class="announce-meta">${a.from} · ${a.date}</div>
        <div class="announce-body">${a.body}</div>
      </div>`).join("");
  }
}

// ── PROPOSALS ─────────────────────────────────────────────────────────────
function renderProposals(filter="all", search="") {
  const tbody = document.getElementById("proposalsBody");
  let list = proposals;
  if (filter !== "all") list = list.filter(p => p.status === filter);
  if (search) list = list.filter(p =>
    p.name.toLowerCase().includes(search) ||
    p.organizer.toLowerCase().includes(search)
  );

  tbody.innerHTML = list.map(p => `
    <tr>
      <td><input type="checkbox" class="cb proposal-cb" data-id="${p.id}"/></td>
      <td><span style="font-weight:900;cursor:pointer;color:#5b21b6;" class="view-detail" data-id="${p.id}">${p.name}</span></td>
      <td>${p.organizer}</td>
      <td>${p.date}</td>
      <td><span class="tag">${p.category}</span></td>
      <td><span class="badge ${p.status}">${cap(p.status)}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="mini-btn approve" onclick="approveProposal(${p.id})">✅ Approve</button>
        <button class="mini-btn reject"  onclick="rejectProposal(${p.id})">❌ Reject</button>
        <button class="mini-btn"         onclick="showDetail(${p.id})">👁 View</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;font-weight:700;">No proposals found.</td></tr>`;

  // Badge
  const pendingCount = proposals.filter(p => p.status==="pending" || p.status==="review").length;
  updateBadge("badge-pending", pendingCount);
  updateBadge("badge-proposals", proposals.filter(p=>p.status==="pending").length);

  // Detail click
  document.querySelectorAll(".view-detail").forEach(el =>
    el.addEventListener("click", () => showDetail(+el.dataset.id))
  );
}

function showDetail(id) {
  const p = proposals.find(x => x.id === id);
  if (!p) return;
  document.getElementById("detailName").textContent = p.name;
  document.getElementById("detailBody").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;flex-wrap:wrap;">
      <div>
        <div class="detail-row"><span class="detail-label">📋 Description</span></div>
        <p style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px;">${p.desc}</p>
        <div class="detail-row"><span class="detail-label">🎯 Objectives</span></div>
        <p style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px;">${p.objectives}</p>
        <div class="detail-row"><span class="detail-label">👥 Expected Participants</span><span class="detail-val">${p.participants} students</span></div>
        <div class="detail-row"><span class="detail-label">📎 Document</span><span class="detail-val" style="color:#6d5efc;font-weight:800;">${p.doc}</span></div>
      </div>
      <div>
        <div class="detail-row"><span class="detail-label">🏛️ Venue</span><span class="detail-val">${p.venue}</span></div>
        <div class="detail-row"><span class="detail-label">📅 Date</span><span class="detail-val">${p.date}</span></div>
        <div class="detail-row"><span class="detail-label">⏰ Time</span><span class="detail-val">${p.time}</span></div>
        <div class="detail-row"><span class="detail-label">🏷️ Category</span><span class="detail-val">${p.category}</span></div>
        <div class="detail-row"><span class="detail-label">📌 Status</span><span class="badge ${p.status}">${cap(p.status)}</span></div>
        <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap;">
          <button class="btn success sm" onclick="approveProposal(${p.id});document.getElementById('proposalDetail').style.display='none'">✅ Approve</button>
          <button class="btn danger sm"  onclick="rejectProposal(${p.id});document.getElementById('proposalDetail').style.display='none'">❌ Reject</button>
        </div>
      </div>
    </div>`;
  document.getElementById("proposalDetail").style.display = "";
  document.getElementById("proposalDetail").scrollIntoView({ behavior:"smooth", block:"start" });
}

function approveProposal(id) {
  const p = proposals.find(x => x.id === id);
  if (p) { p.status = "approved"; renderProposals(); showToast("✅ Proposal approved!", "success"); }
}
function rejectProposal(id) {
  const p = proposals.find(x => x.id === id);
  if (p) { p.status = "rejected"; renderProposals(); showToast("❌ Proposal rejected.", "error"); }
}

// ── EVENT LIST ────────────────────────────────────────────────────────────
function renderEventList(search="") {
  const tbody = document.getElementById("eventListBody");
  let list = proposals;
  if (search) list = list.filter(p => p.name.toLowerCase().includes(search) || p.organizer.toLowerCase().includes(search));
  tbody.innerHTML = list.map(p => `
    <tr>
      <td style="font-weight:900;">${p.name}</td>
      <td>${p.organizer}</td>
      <td>${p.date}</td>
      <td>${p.venue}</td>
      <td><span class="tag">${p.category}</span></td>
      <td>${p.participants}</td>
      <td><span class="badge ${p.status}">${cap(p.status)}</span></td>
    </tr>`).join("");
}

// ── CERTIFICATES ──────────────────────────────────────────────────────────
function renderCerts(search="") {
  const tbody = document.getElementById("certsBody");
  let list = certificates;
  if (search) list = list.filter(c =>
    c.student.toLowerCase().includes(search) || c.event.toLowerCase().includes(search)
  );
  tbody.innerHTML = list.map(c => `
    <tr>
      <td><input type="checkbox" class="cb cert-cb" data-id="${c.id}" ${c.status==="approved"?"disabled":""}></td>
      <td style="font-weight:900;">${c.student}</td>
      <td style="color:#6b7280;">${c.reg}</td>
      <td>${c.event}</td>
      <td>
        <span class="badge ${c.attendance?"approved":"rejected"}">
          ${c.attendance?"✅ Present":"❌ Absent"}
        </span>
      </td>
      <td><span class="badge ${c.status}">${cap(c.status)}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap;">
        ${c.status==="pending"
          ? `<button class="mini-btn approve" onclick="approveCert(${c.id})">✅ Approve</button>
             <button class="mini-btn reject"  onclick="rejectCert(${c.id})">❌ Reject</button>`
          : `<span style="font-size:12px;color:#9ca3af;font-weight:700;">${cap(c.status)}</span>`}
      </td>
    </tr>`).join("");

  updateBadge("badge-certs", certificates.filter(c=>c.status==="pending").length);
}

function approveCert(id) {
  const c = certificates.find(x=>x.id===id);
  if (c) { c.status="approved"; renderCerts(); showToast("🎓 Certificate approved!", "success"); }
}
function rejectCert(id) {
  const c = certificates.find(x=>x.id===id);
  if (c) { c.status="rejected"; renderCerts(); showToast("Certificate rejected.", "error"); }
}

// ── CLUBS ─────────────────────────────────────────────────────────────────
function renderClubs() {
  const grid = document.getElementById("clubsGrid");
  const colors = { Technical:"#6d5efc", Social:"#f59e0b", Science:"#8b5cf6", Creative:"#ec4899" };
  grid.innerHTML = CLUBS.map(c => `
    <div class="club-oversight-card">
      <div class="co-logo">${c.logo}</div>
      <div class="co-name">${c.name}</div>
      <div class="co-cat">${c.category} · <span style="color:#22c55e;font-weight:800;">${c.status}</span></div>
      <div class="co-stats">
        <div class="co-stat">👥 <span>${c.members}</span> Members</div>
        <div class="co-stat">📅 <span>${c.events}</span> Events</div>
        <div class="co-stat">📄 <span>${c.reports}</span> Reports</div>
      </div>
      <div class="divider"></div>
      <div style="font-size:12px;color:#6b7280;font-weight:700;margin-bottom:10px;">👤 Chair: ${c.chair}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="mini-btn" onclick="showToast('📄 Club report opened!','info')">📄 View Report</button>
        <button class="mini-btn" onclick="showToast('✉️ Message sent to ${c.name}!','success')">✉️ Message</button>
      </div>
    </div>`).join("");
}

// ── CALENDAR ──────────────────────────────────────────────────────────────
const EVENT_DAYS = { "2026-2":[5,12,15,20,22,28], "2026-3":[3,8,12,15,20,22,25], "2026-4":[2,5,10,12,18,25] };

function renderCalendar() {
  const grid   = document.getElementById("calGrid");
  const label  = document.getElementById("calMonthLabel");
  const evList = document.getElementById("calEventsList");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  label.textContent = `${months[calMonth]} ${calYear}`;

  // Day headers
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let html = days.map(d => `<div class="cal-day header">${d}</div>`).join("");

  const firstDay  = new Date(calYear, calMonth, 1).getDay();
  const totalDays = new Date(calYear, calMonth+1, 0).getDate();
  const today     = new Date();
  const eventDays = EVENT_DAYS[`${calYear}-${calMonth}`] || [];

  for (let i=0; i<firstDay; i++) html += `<div class="cal-day"></div>`;

  for (let d=1; d<=totalDays; d++) {
    const isToday   = d===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
    const hasEvent  = eventDays.includes(d);
    html += `<div class="cal-day ${isToday?"today":""} ${hasEvent&&!isToday?"has-event":""}" title="${hasEvent?"Events on this day":""}">
      ${d}${hasEvent?`<div class="cal-event-dot"></div>`:""}
    </div>`;
  }

  grid.innerHTML = html;

  // Events this month
  evList.innerHTML = eventDays.length
    ? `<div style="font-weight:900;font-size:13px;margin-bottom:10px;">Events this month (${eventDays.length} days with events)</div>`
    + proposals.filter(p=>eventDays.some(d=>p.date.includes(months[calMonth]))).slice(0,4).map(p=>`
        <div class="list-item">
          <div class="dot dot-purple"></div>
          <div class="li-text"><div class="li-title">${p.name}</div><div class="li-sub">${p.date} · ${p.organizer}</div></div>
          <span class="badge ${p.status}">${cap(p.status)}</span>
        </div>`).join("")
    : `<div style="color:#9ca3af;font-size:13px;font-weight:700;text-align:center;padding:12px;">No events scheduled this month.</div>`;
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────
function initCharts() {
  const months  = ["Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
  const eventNums   = [2,3,4,3,2,5,4,6];
  const partNums    = [120,180,250,190,140,310,270,380];

  const opts = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { weight:700 } } },
      y: { grid: { color:"rgba(229,231,235,.6)" }, ticks: { font: { weight:700 } } }
    }
  };

  // Events per month
  new Chart(document.getElementById("eventsChart"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [{ data: eventNums, backgroundColor: "rgba(109,94,252,.75)", borderRadius: 8, borderSkipped: false }]
    },
    options: { ...opts, plugins: { ...opts.plugins, tooltip: { callbacks: { label: v => ` ${v.raw} events` } } } }
  });

  // Student participation
  new Chart(document.getElementById("participationChart"), {
    type: "line",
    data: {
      labels: months,
      datasets: [{
        data: partNums,
        borderColor: "#ff6aa0", backgroundColor: "rgba(255,106,160,.12)",
        borderWidth: 2.5, fill: true, tension: 0.4, pointRadius: 4,
        pointBackgroundColor: "#ff6aa0"
      }]
    },
    options: { ...opts, plugins: { ...opts.plugins, tooltip: { callbacks: { label: v => ` ${v.raw} students` } } } }
  });

  // Academic vs Non-academic
  new Chart(document.getElementById("typeChart"), {
    type: "doughnut",
    data: {
      labels: ["Academic","Non-Academic"],
      datasets: [{
        data: [58, 42],
        backgroundColor: ["#6d5efc","#ff6aa0"],
        borderWidth: 0, hoverOffset: 6
      }]
    },
    options: { responsive: false, plugins: { legend: { display: false } }, cutout: "68%" }
  });

  // Legend
  document.getElementById("typeChartLegend").innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:14px;height:14px;border-radius:4px;background:#6d5efc;"></div>
        <span style="font-weight:800;font-size:14px;">Academic Events — 58%</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:14px;height:14px;border-radius:4px;background:#ff6aa0;"></div>
        <span style="font-weight:800;font-size:14px;">Non-Academic Events — 42%</span>
      </div>
      <div style="margin-top:6px;font-size:13px;color:#6b7280;font-weight:700;">Total this semester: <strong style="color:#111827;">34 events</strong></div>
    </div>`;
}

// ── FEEDBACK ──────────────────────────────────────────────────────────────
function renderFeedback() {
  // Rating chart
  const evNames = proposals.slice(0,5).map(p => p.name.length > 16 ? p.name.slice(0,16)+"…" : p.name);
  const ratings = [4.8, 4.2, 4.6, 3.9, 4.5];

  new Chart(document.getElementById("feedbackChart"), {
    type: "bar",
    data: {
      labels: evNames,
      datasets: [{
        data: ratings,
        backgroundColor: ratings.map(r => r >= 4.5 ? "rgba(34,197,94,.75)" : r >= 4 ? "rgba(109,94,252,.75)" : "rgba(245,158,11,.75)"),
        borderRadius: 8, borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { weight:700 }, maxRotation: 30 } },
        y: { min: 0, max: 5, grid: { color:"rgba(229,231,235,.6)" }, ticks: { font: { weight:700 } } }
      }
    }
  });

  // Rating breakdown
  const breakdown = [[5,62],[4,24],[3,10],[2,3],[1,1]];
  document.getElementById("ratingBreakdown").innerHTML =
    `<div style="font-weight:900;font-size:32px;text-align:center;margin-bottom:4px;">4.6</div>
     <div style="text-align:center;font-size:14px;color:#6b7280;font-weight:700;margin-bottom:18px;">Overall Average Rating</div>`
    + breakdown.map(([star, pct]) => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span style="font-weight:900;font-size:13px;width:14px;">${star}</span>
        <span style="color:#f59e0b;font-size:13px;">★</span>
        <div class="progress-wrap" style="flex:1;">
          <div class="progress-bar" style="width:${pct}%;background:${pct>50?"#6d5efc":pct>20?"#ff6aa0":"#9ca3af"};"></div>
        </div>
        <span style="font-size:12px;font-weight:800;color:#6b7280;width:32px;">${pct}%</span>
      </div>`).join("");

  // Comments
  document.getElementById("commentsBody").innerHTML = FEEDBACK_COMMENTS.map(c => `
    <div class="comment-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
        <div>
          <div class="comment-name">${c.name}</div>
          <div class="comment-event">${c.event}</div>
        </div>
        <div class="stars">${"★".repeat(c.rating)}${"☆".repeat(5-c.rating)}</div>
      </div>
      <div class="comment-text">"${c.text}"</div>
    </div>`).join("");
}

// ── NOTIFICATION HISTORY ──────────────────────────────────────────────────
function renderNotifHistory() {
  const typeColor = { event:"dot-purple", cert:"dot-green", admin:"dot-red", club:"dot-orange" };
  document.getElementById("notifHistoryList").innerHTML = NOTIFICATIONS.map(n => `
    <div class="list-item" style="${n.read?"opacity:.65":""}">
      <div class="dot ${typeColor[n.type]||"dot-blue"}"></div>
      <div class="li-text">
        <div class="li-title">${n.title}${!n.read?` <span style="display:inline-block;width:7px;height:7px;background:#ef4444;border-radius:50%;margin-left:6px;"></span>`:""}</div>
        <div class="li-sub">${n.sub} · ${n.time}</div>
      </div>
      ${!n.read?`<button class="mini-btn" onclick="markRead(${n.id})">Mark read</button>`:""}
    </div>`).join("");
}

function markRead(id) {
  const n = NOTIFICATIONS.find(x=>x.id===id);
  if (n) { n.read=true; renderNotifHistory(); updateNotifBadge(); }
}

// ── PENDING PAGE ──────────────────────────────────────────────────────────
function renderPendingPage() {
  const pending = proposals.filter(p=>p.status==="pending"||p.status==="review");
  const pendCerts = certificates.filter(c=>c.status==="pending");
  document.getElementById("pendingList").innerHTML =
    `<div style="padding:12px 20px;font-weight:900;font-size:13px;color:#6b7280;">EVENT PROPOSALS (${pending.length})</div>`
    + pending.map(p => `
      <div class="list-item">
        <div class="dot dot-orange"></div>
        <div class="li-text"><div class="li-title">${p.name}</div><div class="li-sub">${p.organizer} · ${p.date}</div></div>
        <div style="display:flex;gap:6px;">
          <button class="mini-btn approve" onclick="approveProposal(${p.id});renderPendingPage()">✅</button>
          <button class="mini-btn reject"  onclick="rejectProposal(${p.id});renderPendingPage()">❌</button>
        </div>
      </div>`).join("")
    + `<div class="divider" style="margin:0 20px;"></div>
       <div style="padding:12px 20px;font-weight:900;font-size:13px;color:#6b7280;">CERTIFICATES (${pendCerts.length})</div>`
    + pendCerts.map(c => `
      <div class="list-item">
        <div class="dot dot-purple"></div>
        <div class="li-text"><div class="li-title">${c.student}</div><div class="li-sub">${c.event} · ${c.reg}</div></div>
        <div style="display:flex;gap:6px;">
          <button class="mini-btn approve" onclick="approveCert(${c.id});renderPendingPage()">✅</button>
          <button class="mini-btn reject"  onclick="rejectCert(${c.id});renderPendingPage()">❌</button>
        </div>
      </div>`).join("");
}

// ── NOTIFICATION DRAWER ───────────────────────────────────────────────────
function openNotifDrawer() {
  document.getElementById("notifDrawer").classList.add("open");
  document.getElementById("overlay").classList.add("open");
  const typeColor = { event:"dot-purple", cert:"dot-green", admin:"dot-red", club:"dot-orange" };
  document.getElementById("notifDrawerBody").innerHTML = NOTIFICATIONS.map(n => `
    <div class="list-item" style="${n.read?"opacity:.6":""}">
      <div class="dot ${typeColor[n.type]||"dot-blue"}"></div>
      <div class="li-text">
        <div class="li-title">${n.icon} ${n.title}</div>
        <div class="li-sub">${n.sub} · ${n.time}</div>
      </div>
    </div>`).join("");
}

function closeNotifDrawer() {
  document.getElementById("notifDrawer").classList.remove("open");
  document.getElementById("overlay").classList.remove("open");
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function showToast(msg, type="info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3000);
}

function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (el) { el.textContent = count; el.style.display = count > 0 ? "" : "none"; }
}

function updateNotifBadge() {
  const unread = NOTIFICATIONS.filter(n=>!n.read).length;
  updateBadge("badge-notif", unread);
  const dot = document.getElementById("notifDot");
  if (dot) dot.style.display = unread > 0 ? "" : "none";
}

// ── BULK ACTIONS ──────────────────────────────────────────────────────────
function initBulk() {
  // Select all proposals
  document.getElementById("chkAllProposals")?.addEventListener("change", e => {
    document.querySelectorAll(".proposal-cb").forEach(cb => cb.checked = e.target.checked);
  });

  // Bulk approve proposals
  document.getElementById("bulkApproveBtn")?.addEventListener("click", () => {
    const ids = [...document.querySelectorAll(".proposal-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) return showToast("Select at least one proposal.", "error");
    ids.forEach(id => { const p=proposals.find(x=>x.id===id); if(p) p.status="approved"; });
    renderProposals(); showToast(`✅ ${ids.length} proposal(s) approved!`, "success");
  });

  // Bulk reject proposals
  document.getElementById("bulkRejectBtn")?.addEventListener("click", () => {
    const ids = [...document.querySelectorAll(".proposal-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) return showToast("Select at least one proposal.", "error");
    ids.forEach(id => { const p=proposals.find(x=>x.id===id); if(p) p.status="rejected"; });
    renderProposals(); showToast(`❌ ${ids.length} proposal(s) rejected.`, "error");
  });

  // Select all certs
  document.getElementById("chkAllCerts")?.addEventListener("change", e => {
    document.querySelectorAll(".cert-cb:not(:disabled)").forEach(cb => cb.checked = e.target.checked);
  });

  // Bulk approve certs
  document.getElementById("bulkCertBtn")?.addEventListener("click", () => {
    const ids = [...document.querySelectorAll(".cert-cb:checked")].map(cb => +cb.dataset.id);
    if (!ids.length) return showToast("Select at least one certificate.", "error");
    ids.forEach(id => { const c=certificates.find(x=>x.id===id); if(c&&c.attendance) c.status="approved"; });
    renderCerts(); showToast(`🎓 ${ids.length} certificate(s) approved!`, "success");
  });
}

// ── SEARCH & FILTER LISTENERS ─────────────────────────────────────────────
function initSearchFilters() {
  document.getElementById("proposalSearch")?.addEventListener("input", e =>
    renderProposals(document.getElementById("proposalFilter").value, e.target.value.toLowerCase())
  );
  document.getElementById("proposalFilter")?.addEventListener("change", e =>
    renderProposals(e.target.value, document.getElementById("proposalSearch").value.toLowerCase())
  );
  document.getElementById("eventListSearch")?.addEventListener("input", e =>
    renderEventList(e.target.value.toLowerCase())
  );
  document.getElementById("certSearch")?.addEventListener("input", e =>
    renderCerts(e.target.value.toLowerCase())
  );
}

// ── CALENDAR CONTROLS ─────────────────────────────────────────────────────
function initCalendar() {
  document.getElementById("calPrev")?.addEventListener("click", () => {
    calMonth--; if (calMonth < 0) { calMonth=11; calYear--; }
    if (currentPage === "calendar") renderCalendar();
  });
  document.getElementById("calNext")?.addEventListener("click", () => {
    calMonth++; if (calMonth > 11) { calMonth=0; calYear++; }
    if (currentPage === "calendar") renderCalendar();
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {

  // Sidebar toggle
  document.getElementById("sidebarToggle").addEventListener("click", () => {
    const s = document.getElementById("sidebar");
    if (window.innerWidth <= 768) s.classList.toggle("mobile-open");
    else s.classList.toggle("collapsed");
  });

  // Close proposal detail
  document.getElementById("closeDetail")?.addEventListener("click", () => {
    document.getElementById("proposalDetail").style.display = "none";
  });

  // Nav items
  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });

  // Notification drawer
  document.getElementById("notifBtn").addEventListener("click", openNotifDrawer);
  document.getElementById("closeDrawer").addEventListener("click", closeNotifDrawer);
  document.getElementById("overlay").addEventListener("click", closeNotifDrawer);

  // Mark all read
  document.getElementById("markAllReadBtn")?.addEventListener("click", () => {
    NOTIFICATIONS.forEach(n => n.read=true);
    renderNotifHistory(); updateNotifBadge();
    showToast("All notifications marked as read.", "success");
  });

  // Logout
  document.getElementById("logoutBtn").addEventListener("click", () => {
    if (confirm("Do you want to logout?")) window.location.href = "index.html";
  });

  // Profile
  document.getElementById("profileBtn").addEventListener("click", () =>
    showToast("👤 Profile settings coming soon!", "info")
  );

  initBulk();
  initSearchFilters();
  initCalendar();

  // Initial render
  renderDashboard();
  updateNotifBadge();
});
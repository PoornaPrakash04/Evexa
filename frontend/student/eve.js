
const GEMINI_API_KEY = "AIzaSyBx1cmV1fbge0vXVAMY4_DEjsYCZ2nTp2k";
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const messagesEl = document.getElementById("eveMessages");
const inputEl    = document.getElementById("eveInput");
const sendBtn    = document.getElementById("eveSendBtn");
const typingEl   = document.getElementById("typingIndicator");
const clearBtn   = document.getElementById("clearBtn");

let history        = [];
let lastFAQContext = null;

// ── Real-time cache (refreshed each session) ──────────────────────────────
let DB = {
  events:       null,   // raw array from /api/events
  clubs:        null,   // raw array from /api/clubs/my-clubs + /api/clubs
  profile:      null,   // from /api/auth/me
  registrations: null,  // from /api/attendance/my-registrations
};

// ── Auth helper ───────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("student_auth_token") || ""; }

async function apiFetch(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { "Authorization": `Bearer ${getToken()}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── Load all DB data once on boot ─────────────────────────────────────────
async function loadDB() {
  const [events, allClubs, myClubs, profile, registrations] = await Promise.all([
    fetch(`${API_BASE}/events`).then(r => r.json()).catch(() => []),
    fetch(`${API_BASE}/clubs`).then(r => r.json()).catch(() => []),
    apiFetch("/clubs/my-clubs"),
    apiFetch("/auth/me"),
    apiFetch("/attendance/my-registrations"),
  ]);

  DB.events        = Array.isArray(events)        ? events        : [];
  DB.profile       = profile  || {};
  DB.registrations = Array.isArray(registrations) ? registrations : [];

  // Merge clubs: mark joined ones
  const myClubIds = new Set((Array.isArray(myClubs) ? myClubs : []).map(c => String(c.club_id)));
DB.clubs = (Array.isArray(allClubs) ? allClubs : []).map(c => ({
  ...c,
  joined: myClubIds.has(String(c.club_id))
}));
}

// ── Helpers ───────────────────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function formatText(t) {
  return t
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^[-•]\s(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul style='margin:6px 0 6px 16px;padding:0;'>$1</ul>")
    .replace(/<\/ul>\s*<ul[^>]*>/g, "")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

function renderMessage(role, html) {
  const isEve = role === "eve";
  const name  = DB.profile?.name || "You";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const div = document.createElement("div");
  div.className = `msg ${isEve ? "eve-msg" : "user-msg"}`;
  div.innerHTML = `
    ${isEve
      ? `<div class="msg-avatar eve-msg-avatar">✦</div>`
      : `<div class="msg-avatar user-avatar">${initials}</div>`}
    <div class="msg-bubble ${isEve ? "eve-bubble" : "user-bubble"}">
      <div class="msg-text">${html}</div>
      <div class="msg-time">${nowTime()}</div>
    </div>`;
  return div;
}

function showTyping() { typingEl.style.display = "flex"; scrollToBottom(); }
function hideTyping()  { typingEl.style.display = "none"; }

function eveReply(html, delay = 400) {
  showTyping();
  setTimeout(() => {
    hideTyping();
    messagesEl.appendChild(renderMessage("eve", html));
    scrollToBottom();
    attachTopicTags();
    sendBtn.disabled = false;
    inputEl.focus();
  }, delay);
}

function topicButtons(...pairs) {
  const tags = pairs.map(([label, prompt]) =>
    `<span class="topic-tag" data-prompt="${prompt}">${label}</span>`
  ).join("");
  return `<div class="quick-topics" style="margin-top:10px;">${tags}</div>`;
}

// ── Real-time event card renderer ─────────────────────────────────────────
function eventCard(e) {
  const date  = e.date ? new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "TBA";
  const fee   = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";
  const now   = new Date();
  const isPast = e.date && new Date(e.date) < now;
  const statusColor = isPast ? "#6b7280" : "#16a34a";
  const statusLabel = isPast ? "Past" : "Open";

  return `
    <div style="background:rgba(109,94,252,.07);border:1px solid rgba(109,94,252,.15);border-radius:13px;padding:11px 13px;margin:7px 0;cursor:pointer;"
      onclick="window.location.href='event-single.html?id=${e.id}'">
      <div style="font-weight:900;font-size:14px;">${e.title || e.name || "Unnamed Event"}</div>
      <div style="font-size:12px;color:#4b5563;margin-top:3px;">📅 ${date} &nbsp;🏛️ ${e.venue || "TBA"}</div>
      <div style="font-size:12px;color:#4b5563;">
        💰 ${fee} &nbsp;
        <span style="color:${statusColor};font-weight:800;">${statusLabel}</span>
        ${e.club ? `&nbsp;· 🏷️ ${e.club}` : ""}
      </div>
    </div>`;
}

function eventList(filterFn) {
  if (!DB.events?.length) return "<em>No events found in the database.</em>";
  const list = filterFn ? DB.events.filter(filterFn) : DB.events;
  if (!list.length) return "<em>No matching events found.</em>";
  return list.map(eventCard).join("");
}

// ── Real-time club card renderer ──────────────────────────────────────────
function clubCard(c) {
  return `
    <div style="background:rgba(109,94,252,.07);border:1px solid rgba(109,94,252,.15);border-radius:13px;padding:11px 13px;margin:7px 0;cursor:pointer;"
      onclick="window.location.href='club-single.html?id=${c.id}'">
      <div style="font-weight:900;font-size:14px;">
        ${c.name}
        <span style="font-size:11px;color:#6b7280;font-weight:700;">(${c.category || "General"})</span>
      </div>
      <div style="font-size:12px;color:#4b5563;margin-top:3px;">
        ${c.description ? c.description.slice(0, 70) + "…" : ""}
      </div>
      <span style="font-size:11px;font-weight:800;color:${c.joined ? "#16a34a" : "#6d5efc"}">
        ${c.joined ? "✅ Already Joined" : "Tap to view & join →"}
      </span>
    </div>`;
}

function clubList(filterFn) {
  if (!DB.clubs?.length) return "<em>No clubs found in the database.</em>";
  const list = filterFn ? DB.clubs.filter(filterFn) : DB.clubs;
  if (!list.length) return "<em>No matching clubs found.</em>";
  return list.map(clubCard).join("");
}

// ── Registered events helpers ─────────────────────────────────────────────
function getRegisteredEventIds() {
  return new Set((DB.registrations || []).map(r => String(r.event_id)));
}

function getUpcomingRegistered() {
  const now  = new Date();
  const ids  = getRegisteredEventIds();
  return (DB.events || []).filter(e => ids.has(String(e.id)) && new Date(e.date) > now);
}

function getPastRegistered() {
  const now = new Date();
  const ids = getRegisteredEventIds();
  return (DB.events || []).filter(e => ids.has(String(e.id)) && new Date(e.date) <= now);
}

// ══════════════════════════════════════════════════════════════════════════
//  BUILT-IN ANSWER ENGINE
// ══════════════════════════════════════════════════════════════════════════
function builtInAnswer(input) {
  const q = input.toLowerCase().trim();

  if (/^(yes|yeah|sure|ok|okay|yep|yup)$/.test(q) && lastFAQContext) {
    return getFAQFollowUp(lastFAQContext);
  }

  const name = DB.profile?.name?.split(" ")[0] || "there";

  // Greetings
  if (/^(hi|hello|hey|good morning|good evening|howdy|sup)\b/.test(q)) {
    lastFAQContext = "greeting";
    return `Hey ${name}! 👋 Great to see you!<br><br>What can I help you with today?
      ${topicButtons(
        ["📅 Open Events",   "__open_events__"],
        ["📋 My Registrations", "__my_events__"],
        ["❓ Portal Help",   "__portal_help__"]
      )}`;
  }

  // Internal triggers
  if (q === "__open_events__")     return openEventsAnswer();
  if (q === "__all_events__")      return allEventsAnswer();
  if (q === "__free_events__")     return freeEventsAnswer();
  if (q === "__upcoming_events__") return upcomingEventsAnswer();
  if (q === "__all_clubs__")       return allClubsAnswer();
  if (q === "__my_clubs__")        return myClubsAnswer();
  if (q === "__tech_clubs__")      return techClubsAnswer();
  if (q === "__creative_clubs__")  return creativeClubsAnswer();
  if (q === "__social_clubs__")    return socialClubsAnswer();
  if (q === "__my_events__")       return myEventsAnswer();
  if (q === "__upcoming_reg__")    return upcomingRegisteredAnswer();
  if (q === "__certificates__")    return certificatesAnswer();
  if (q === "__how_register__")    return howRegisterAnswer();
  if (q === "__how_join__")        return howJoinAnswer();
  if (q === "__profile__")         return profileAnswer();
  if (q === "__password__")        return passwordAnswer();
  if (q === "__portal_help__")     return portalHelpAnswer();
  if (q === "__my_stats__")        return myStatsAnswer();

  // All events
  if (/\b(all event|list event|show.*event|what.*event|events available|see.*event)\b/.test(q)) {
    return allEventsAnswer();
  }
  // Open / register
  if (/\b(open event|available.*event|sign.?up.*event|register for)\b/.test(q) || /^register$/.test(q)) {
    return openEventsAnswer();
  }
  // Upcoming events
  if (/\b(upcoming event|next event|future event|events this week|events today)\b/.test(q)) {
    return upcomingEventsAnswer();
  }
  // Free events
  if (/\b(free event|no fee|without.*fee|free to join)\b/.test(q)) {
    return freeEventsAnswer();
  }
  // My registrations
  if (/\b(my event|my registration|registered event|events i.*join|what.*i.*registered)\b/.test(q)) {
    return myEventsAnswer();
  }
  // All clubs
  if (/\b(all club|list club|show.*club|what.*club|clubs available|explore club|which club)\b/.test(q)) {
    return allClubsAnswer();
  }
  // My clubs
  if (/\b(my club|club.*join|joined club|which club.*i)\b/.test(q)) {
    return myClubsAnswer();
  }
  // Tech clubs
  if (/\b(technical club|tech club|engineering club)\b/.test(q)) {
    return techClubsAnswer();
  }
  // Creative clubs
  if (/\b(creative club|art club|photo club)\b/.test(q)) {
    return creativeClubsAnswer();
  }
  // Social clubs
  if (/\b(social club|nss|volunteer)\b/.test(q)) {
    return socialClubsAnswer();
  }
  // How to register
  if (/\b(how.*register|how.*sign.?up|steps.*register)\b/.test(q)) {
    return howRegisterAnswer();
  }
  // How to join
  if (/\b(how.*join|become.*member)\b/.test(q)) {
    return howJoinAnswer();
  }
  // Certificates
  if (/\b(certificate|cert|download.*cert|get.*cert)\b/.test(q)) {
    return certificatesAnswer();
  }
  // Profile
  if (/\b(profile|edit profile|account|update.*info)\b/.test(q)) {
    return profileAnswer();
  }
  // Password
  if (/\b(password|change.*password|forgot.*password|reset.*password)\b/.test(q)) {
    return passwordAnswer();
  }
  // Stats
  if (/\b(my stats|my progress|my points|my level|how many event)\b/.test(q)) {
    return myStatsAnswer();
  }
  // Navigation
  if (/\b(navigate|how.*go|find.*page|portal help|where is)\b/.test(q)) {
    return portalHelpAnswer();
  }
  // About EVE
  if (/\b(who are you|what are you|what is eve|about eve)\b/.test(q)) {
    return `I'm <strong>EVE</strong> ✦ — your AI-powered student assistant inside EVEXA!<br><br>
      I can help you with:<br>
      <li>📅 Finding & registering for events</li>
      <li>🏷️ Exploring & joining clubs</li>
      <li>📊 Tracking your progress & stats</li>
      <li>🎓 Getting your certificates</li>
      <li>❓ Navigating the EVEXA portal</li><br>
      Just ask me anything! 😊`;
  }
  // Thanks
  if (/\b(thank|thanks|ty|great|awesome|perfect)\b/.test(q)) {
    lastFAQContext = null;
    return `You're welcome, ${name}! 😊 Anything else?
      ${topicButtons(["📅 Events", "__open_events__"], ["🏷️ Clubs", "__all_clubs__"])}`;
  }
  // Bye
  if (/\b(bye|goodbye|see you|later|cya)\b/.test(q)) {
    lastFAQContext = null;
    return `Goodbye ${name}! 👋 Come back anytime!`;
  }
  // ── Specific event name search (catches "when is X", "what is X", "tell me about X") ──
const eventNameMatch = q.match(/\b(when is|what is|tell me about|details of|info about|about)\s+(.+)/);
if (eventNameMatch) {
  const searchTerm = eventNameMatch[2].toLowerCase().trim();
  const found = (DB.events || []).filter(e =>
    (e.title || e.name || "").toLowerCase().includes(searchTerm)
  );
  if (found.length) {
    lastFAQContext = "events";
    return `Here's what I found for <strong>"${eventNameMatch[2]}"</strong>:<br>
      ${found.map(eventCard).join("")}
      ${topicButtons(["📅 All Events", "__all_events__"], ["✅ Register", "__how_register__"])}`;
  }
}

// ── Generic keyword search across all event titles ──
const words = q.split(/\s+/).filter(w => w.length > 3);
const matchedEvents = (DB.events || []).filter(e =>
  words.some(w => (e.title || e.name || "").toLowerCase().includes(w))
);
if (matchedEvents.length) {
  lastFAQContext = "events";
  return `Here are events matching your query:<br>
    ${matchedEvents.map(eventCard).join("")}
    ${topicButtons(["📅 All Events", "__all_events__"])}`;
}
  return null; // → Gemini fallback
}

// ══════════════════════════════════════════════════════════════════════════
//  ANSWER FUNCTIONS — all use real DB data
// ══════════════════════════════════════════════════════════════════════════

function allEventsAnswer() {
  lastFAQContext = "events";
  const total = DB.events?.length || 0;
  return `Here are all <strong>${total} events</strong> on EVEXA:<br>
    ${eventList()}<br>
    Click any event to view details and register! 🎉
    ${topicButtons(
      ["✅ Open Only",      "__open_events__"],
      ["📅 Upcoming Only",  "__upcoming_events__"],
      ["🆓 Free Only",      "__free_events__"]
    )}`;
}

function openEventsAnswer() {
  lastFAQContext = "open-events";
  const now   = new Date();
  const html  = eventList(e => new Date(e.date) > now);
  const count = (DB.events || []).filter(e => new Date(e.date) > now).length;
  return `There are <strong>${count} upcoming/open events</strong> you can register for:<br>
    ${html}
    ${topicButtons(
      ["🆓 Free Only",     "__free_events__"],
      ["📋 All Events",    "__all_events__"],
      ["📝 How to Register","__how_register__"]
    )}`;
}

function upcomingEventsAnswer() {
  lastFAQContext = "upcoming-events";
  const now  = new Date();
  const next7 = new Date(now); next7.setDate(now.getDate() + 7);
  const soon = (DB.events || []).filter(e => {
    const d = new Date(e.date);
    return d > now && d <= next7;
  });
  if (!soon.length) {
    return `No events in the next 7 days. Here are all upcoming events:<br>
      ${eventList(e => new Date(e.date) > now)}
      ${topicButtons(["📋 All Events", "__all_events__"])}`;
  }
  return `<strong>${soon.length} event(s) in the next 7 days:</strong><br>
    ${soon.map(eventCard).join("")}
    ${topicButtons(["📋 All Events", "__all_events__"], ["✅ Open Events", "__open_events__"])}`;
}

function freeEventsAnswer() {
  lastFAQContext = "free-events";
  const html  = eventList(e => !e.registration_fee || e.registration_fee === 0);
  const count = (DB.events || []).filter(e => !e.registration_fee || e.registration_fee === 0).length;
  return `There are <strong>${count} free events</strong> 🆓:<br>${html}
    ${topicButtons(
      ["📅 All Events",    "__all_events__"],
      ["✅ Open Events",   "__open_events__"]
    )}`;
}

function allClubsAnswer() {
  lastFAQContext = "clubs";
  const total = DB.clubs?.length || 0;
  return `Here are all <strong>${total} clubs</strong> on EVEXA:<br>
    ${clubList()}<br>
    Click any club to view & join! 🏷️
    ${topicButtons(
      ["💻 Technical",    "__tech_clubs__"],
      ["🎨 Creative",     "__creative_clubs__"],
      ["🤝 Social",       "__social_clubs__"]
    )}`;
}

function myClubsAnswer() {
  lastFAQContext = "my-clubs";
  const joined = (DB.clubs || []).filter(c => c.joined);
  if (!joined.length) {
    return `You haven't joined any clubs yet! 😊<br><br>
      Here are some to explore:
      ${clubList().slice(0, 3)}
      ${topicButtons(["🏷️ All Clubs", "__all_clubs__"], ["❓ How to Join", "__how_join__"])}`;
  }
  return `You've joined <strong>${joined.length} club(s)</strong>:<br>
    ${joined.map(clubCard).join("")}
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"], ["📅 Events", "__open_events__"])}`;
}

function techClubsAnswer() {
  lastFAQContext = "tech-clubs";
  return `Here are the <strong>Technical Clubs</strong>:<br>
    ${clubList(c => (c.category || "").toLowerCase().includes("tech") || (c.category || "").toLowerCase().includes("engineer"))}
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"])}`;
}

function creativeClubsAnswer() {
  lastFAQContext = "creative-clubs";
  return `Here are the <strong>Creative Clubs</strong>:<br>
    ${clubList(c => (c.category || "").toLowerCase().includes("creat") || (c.category || "").toLowerCase().includes("art"))}
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"])}`;
}

function socialClubsAnswer() {
  lastFAQContext = "social-clubs";
  return `Here are the <strong>Social / Volunteer Clubs</strong>:<br>
    ${clubList(c => (c.category || "").toLowerCase().includes("social") || (c.category || "").toLowerCase().includes("nss"))}
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"])}`;
}

function myEventsAnswer() {
  lastFAQContext = "my-events";
  const total    = DB.registrations?.length || 0;
  const upcoming = getUpcomingRegistered();
  const past     = getPastRegistered();

  if (!total) {
    return `You haven't registered for any events yet! 🙁<br><br>
      Here are some open ones:
      ${eventList(e => new Date(e.date) > new Date()).slice(0, 2)}
      ${topicButtons(["📅 Open Events", "__open_events__"], ["📝 How to Register", "__how_register__"])}`;
  }

  let html = `You have <strong>${total} registration(s)</strong> total.<br>`;
  if (upcoming.length) {
    html += `<br>📅 <strong>Upcoming (${upcoming.length}):</strong><br>` + upcoming.map(eventCard).join("");
  }
  if (past.length) {
    html += `<br>✅ <strong>Attended (${past.length}):</strong><br>` + past.slice(0, 3).map(eventCard).join("");
  }
  html += topicButtons(
    ["📅 Find More Events", "__open_events__"],
    ["📊 My Stats",         "__my_stats__"]
  );
  return html;
}

function upcomingRegisteredAnswer() {
  const upcoming = getUpcomingRegistered();
  if (!upcoming.length) return `You have no upcoming registered events right now.<br>
    ${topicButtons(["📅 Open Events", "__open_events__"])}`;
  return `Your <strong>${upcoming.length} upcoming registered event(s)</strong>:<br>
    ${upcoming.map(eventCard).join("")}
    ${topicButtons(["📅 More Events", "__open_events__"])}`;
}

function myStatsAnswer() {
  lastFAQContext = "stats";
  const total    = DB.registrations?.length || 0;
  const points   = total * 10;
  const upcoming = getUpcomingRegistered().length;
  const past     = getPastRegistered().length;
  const clubs    = (DB.clubs || []).filter(c => c.joined).length;

  let level = "Newcomer";
  if (total >= 30) level = "🏆 Champion";
  else if (total >= 15) level = "Achiever";
  else if (total >= 5)  level = "Explorer";
  else if (total >= 1)  level = "Beginner";

  return `Here are your live stats, ${DB.profile?.name?.split(" ")[0] || ""}! 📊<br><br>
    🎟 <strong>Total Registrations:</strong> ${total}<br>
    ✅ <strong>Events Attended:</strong> ${past}<br>
    📅 <strong>Upcoming Events:</strong> ${upcoming}<br>
    🏆 <strong>Points Earned:</strong> ${points}<br>
    🏛️ <strong>Clubs Joined:</strong> ${clubs}<br>
    🎯 <strong>Current Level:</strong> ${level}<br><br>
    ${topicButtons(
      ["📅 Find Events", "__open_events__"],
      ["🏷️ My Clubs",   "__my_clubs__"]
    )}`;
}

function certificatesAnswer() {
  lastFAQContext = "certificates";
  const attended = getPastRegistered().length;
  return `Here's how certificates work on EVEXA:<br><br>
    🎓 <strong>How to get your certificate:</strong><br>
    1️⃣ Register and attend an event<br>
    2️⃣ After the event, your certificate is auto-generated<br>
    3️⃣ Go to <strong>Profile</strong> → click <strong>Download Certificates</strong><br><br>
    📌 You've attended <strong>${attended} event(s)</strong> — certificates may be ready!<br><br>
    ${topicButtons(["📅 Find Events to Attend", "__open_events__"])}`;
}

function recommendAnswer() {
  lastFAQContext = "recommend";
  const now         = new Date();
  const dept        = (DB.profile?.department || "").toLowerCase();
  const regIds      = getRegisteredEventIds();
  const unjoinedClubs = (DB.clubs || []).filter(c => !c.joined).slice(0, 2);

  // Score unregistered upcoming events
  const scored = (DB.events || [])
    .filter(e => !regIds.has(String(e.id)) && new Date(e.date) > now)
    .map(e => {
      let score = 0;
      if (dept && (e.club || "").toLowerCase().includes(dept)) score += 30;
      if (!e.registration_fee || e.registration_fee === 0) score += 10;
      return { ...e, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return `Here are my top picks for you! 🌟<br><br>
    <strong>📅 Events you should register for:</strong><br>
    ${scored.length ? scored.map(eventCard).join("") : "<em>All events registered!</em>"}<br>
    <strong>🏷️ Clubs to explore:</strong><br>
    ${unjoinedClubs.length ? unjoinedClubs.map(clubCard).join("") : "<em>You've joined all clubs!</em>"}`;
}

function howRegisterAnswer() {
  lastFAQContext = "how-register";
  return `Here's how to register for an event:<br><br>
    1️⃣ Click <strong>Events</strong> in the sidebar<br>
    2️⃣ Find an event and click on it<br>
    3️⃣ Click <strong>"Register Now →"</strong><br>
    4️⃣ Done! ✅<br><br>
    ${topicButtons(["📅 Open Events", "__open_events__"], ["✅ My Registrations", "__my_events__"])}`;
}

function howJoinAnswer() {
  lastFAQContext = "how-join";
  return `Here's how to join a club:<br><br>
    1️⃣ Click <strong>Clubs</strong> in the top navbar<br>
    2️⃣ Browse and click a club<br>
    3️⃣ Click <strong>"Join Club →"</strong><br>
    4️⃣ Done! ✅<br><br>
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"], ["✅ My Clubs", "__my_clubs__"])}`;
}

function profileAnswer() {
  lastFAQContext = "profile";
  const p = DB.profile;
  return `Your profile:<br><br>
    👤 <strong>Name:</strong> ${p?.name || "—"}<br>
    📧 <strong>Email:</strong> ${p?.email || "—"}<br>
    🎓 <strong>Department:</strong> ${p?.department || "—"}<br>
    📚 <strong>Class:</strong> ${p?.class || "—"}<br>
    🔢 <strong>Roll No:</strong> ${p?.roll_no || "—"}<br><br>
    To edit: Click <strong>Profile</strong> in the sidebar → update details.
    ${topicButtons(["🔒 Change Password", "__password__"])}`;
}

function passwordAnswer() {
  lastFAQContext = "password";
  return `To change your password:<br><br>
    1️⃣ Click <strong>Profile</strong> in the sidebar<br>
    2️⃣ Click the <strong>Security</strong> tab<br>
    3️⃣ Enter current + new password<br>
    4️⃣ Click <strong>"Update Password"</strong> ✅<br><br>
    🔒 Must have 8+ characters, 1 uppercase, 1 number.`;
}

function portalHelpAnswer() {
  lastFAQContext = "navigation";
  return `Here's the full EVEXA portal map:<br><br>
    🏠 <strong>Dashboard</strong> — Overview & progress<br>
    📅 <strong>Events</strong> — Browse & register<br>
    🏛️ <strong>My Clubs</strong> — Your joined clubs<br>
    🚩 <strong>My Issues</strong> — Report problems<br>
    👤 <strong>Profile</strong> — Edit your info<br>
    ✦ <strong>EVE</strong> — That's me! AI assistant<br>
    🏷️ <strong>Clubs</strong> — Browse all clubs (top nav)<br><br>
    ${topicButtons(
      ["📅 Events",  "__open_events__"],
      ["🏷️ Clubs",  "__all_clubs__"],
      ["📊 My Stats","__my_stats__"]
    )}`;
}

function getFAQFollowUp(context) {
  lastFAQContext = null;
  const map = {
    "greeting":       topicButtons(["📅 Open Events", "__open_events__"], ["🏷️ All Clubs", "__all_clubs__"], ["📊 My Stats", "__my_stats__"], ["❓ Portal Help", "__portal_help__"]),
    "open-events":    topicButtons(["🆓 Free Only", "__free_events__"], ["📋 All Events", "__all_events__"], ["✅ My Registrations", "__my_events__"]),
    "free-events":    topicButtons(["📅 All Events", "__all_events__"], ["✅ Open Events", "__open_events__"]),
    "clubs":          topicButtons(["💻 Tech", "__tech_clubs__"], ["🎨 Creative", "__creative_clubs__"], ["🤝 Social", "__social_clubs__"], ["✅ My Clubs", "__my_clubs__"]),
    "my-events":      topicButtons(["📅 Find More Events", "__open_events__"], ["📊 My Stats", "__my_stats__"]),
    "stats":          topicButtons(["📅 Open Events", "__open_events__"], ["🏷️ My Clubs", "__my_clubs__"]),
    "certificates":   topicButtons(["📅 Find Events", "__open_events__"], ["✅ My Registrations", "__my_events__"]),
    "profile":        topicButtons(["🔒 Change Password", "__password__"], ["📊 My Stats", "__my_stats__"]),
    "navigation":     topicButtons(["📅 Events", "__open_events__"], ["🏷️ Clubs", "__all_clubs__"], ["📊 Stats", "__my_stats__"]),
  };
  const buttons = map[context] || topicButtons(
    ["📅 Events", "__open_events__"], ["🏷️ Clubs", "__all_clubs__"],
    ["📊 My Stats", "__my_stats__"],  ["❓ Help", "__portal_help__"]
  );
  return `Here are some more things I can help with:${buttons}`;
}

// ── Gemini fallback ───────────────────────────────────────────────────────
function getGeminiContext() {
  const ev = (DB.events || []).map(e => {
    const date = e.date ? new Date(e.date).toLocaleDateString("en-IN") : "TBA";
    const fee  = e.registration_fee > 0 ? `₹${e.registration_fee}` : "Free";
    return `- ${e.title || e.name} | ${date} | Fee: ${fee} | Venue: ${e.venue || "TBA"}`;
  }).join("\n");

  const cl = (DB.clubs || []).map(c =>
    `- ${c.name} (${c.category || "General"}) | Joined: ${c.joined ? "Yes" : "No"}`
  ).join("\n");

  const p = DB.profile;
  const reg = DB.registrations?.length || 0;
  const name = p?.name || "Student";

  return `You are EVE, a friendly AI assistant inside the EVEXA student portal.
Student: ${name}, ${p?.department || "Unknown"} dept, ${p?.class || "Unknown"} year.
Total Registrations: ${reg}
Upcoming Registered Events: ${getUpcomingRegistered().length}
Clubs Joined: ${(DB.clubs || []).filter(c => c.joined).length}

EVENTS IN DATABASE:
${ev || "None"}

CLUBS IN DATABASE:
${cl || "None"}

Be concise, warm, helpful. Use emojis. Answer based on the actual data above.`;
}

async function callGemini(userText) {
  const contents = [
    { role: "user",  parts: [{ text: getGeminiContext() + "\n\nReady?" }] },
    { role: "model", parts: [{ text: "Ready! I'm EVE, connected to live data." }] },
    ...history.map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] })),
    { role: "user",  parts: [{ text: userText }] }
  ];

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 400 } })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const data  = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("Empty response");
  return reply;
}

// ── Main send ─────────────────────────────────────────────────────────────
async function sendMessage(text) {
  const userText = (text !== undefined ? text : inputEl.value).trim();
  if (!userText) return;

  inputEl.value = "";
  inputEl.style.height = "auto";
  sendBtn.disabled = true;

  if (!userText.startsWith("__")) {
    messagesEl.appendChild(renderMessage("user", userText));
    scrollToBottom();
  }

  const instant = builtInAnswer(userText);
  if (instant !== null) {
    eveReply(instant, 350);
    return;
  }

  showTyping();
  try {
    const reply = await callGemini(userText);
    history.push({ role: "user", text: userText });
    history.push({ role: "assistant", text: reply });
    if (history.length > 16) history = history.slice(-16);
    hideTyping();
    messagesEl.appendChild(renderMessage("eve", formatText(reply)));
    scrollToBottom();
    attachTopicTags();
  } catch (err) {
    hideTyping();
    console.error("EVE Gemini error:", err);
    messagesEl.appendChild(renderMessage("eve",
      `⚠️ I couldn't reach the AI right now. Try these:
      ${topicButtons(
        ["📅 Events",       "__open_events__"],
        ["🏷️ Clubs",        "__all_clubs__"],
        ["📊 My Stats",     "__my_stats__"]
      )}`
    ));
    scrollToBottom();
    attachTopicTags();
  }

  sendBtn.disabled = false;
  inputEl.focus();
}

// ── Attach topic tag clicks ───────────────────────────────────────────────
function attachTopicTags() {
  document.querySelectorAll(".topic-tag:not([data-bound])").forEach(tag => {
    tag.dataset.bound = "1";
    tag.addEventListener("click", () => sendMessage(tag.dataset.prompt));
  });
}

// ── Event listeners ───────────────────────────────────────────────────────
sendBtn.addEventListener("click", () => sendMessage());
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});
clearBtn.addEventListener("click", () => {
  if (!confirm("Clear the conversation?")) return;
  history = [];
  lastFAQContext = null;
  [...messagesEl.querySelectorAll(".msg")].forEach((m, i) => { if (i > 0) m.remove(); });
});

// ── Init: load real data THEN boot EVE ────────────────────────────────────
(async () => {
  showTyping();
  await loadDB();
  hideTyping();

  const name = DB.profile?.name?.split(" ")[0] || "there";
  const upcoming = getUpcomingRegistered().length;
  const welcomeEl = messagesEl.querySelector(".msg-text");
  if (welcomeEl) {
    welcomeEl.innerHTML = `
      Hi ${name}! 👋 I'm <strong>EVE</strong>, your EVEXA assistant.<br><br>
      You have <strong>${upcoming} upcoming registered event(s)</strong> and <strong>${DB.registrations?.length || 0} total registrations</strong>.<br><br>
      What can I help you with?
      <div class="quick-topics">
        <span class="topic-tag" data-prompt="__open_events__">📅 Open Events</span>
        <span class="topic-tag" data-prompt="__my_events__">✅ My Registrations</span>
        <span class="topic-tag" data-prompt="__my_stats__">📊 My Stats</span>
      </div>`;
  }
  attachTopicTags();
  inputEl.focus();
})();
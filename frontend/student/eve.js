// ===========================
//  eve.js — EVE AI Assistant
//  Instant answers + Gemini fallback
// ===========================

const GEMINI_API_KEY = "AIzaSyBx1cmV1fbge0vXVAMY4_DEjsYCZ2nTp2k";
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

const messagesEl = document.getElementById("eveMessages");
const inputEl    = document.getElementById("eveInput");
const sendBtn    = document.getElementById("eveSendBtn");
const typingEl   = document.getElementById("typingIndicator");
const clearBtn   = document.getElementById("clearBtn");

let history        = [];
let lastFAQContext = null;

// ── Helpers ───────────────────────────────────────────────────────────────
function now() {
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
  const div   = document.createElement("div");
  div.className = `msg ${isEve ? "eve-msg" : "user-msg"}`;
  div.innerHTML = `
    ${isEve
      ? `<div class="msg-avatar eve-msg-avatar">✦</div>`
      : `<div class="msg-avatar user-avatar">AK</div>`}
    <div class="msg-bubble ${isEve ? "eve-bubble" : "user-bubble"}">
      <div class="msg-text">${html}</div>
      <div class="msg-time">${now()}</div>
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

// ── Topic buttons builder ─────────────────────────────────────────────────
function topicButtons(...pairs) {
  const tags = pairs.map(([label, prompt]) =>
    `<span class="topic-tag" data-prompt="${prompt}">${label}</span>`
  ).join("");
  return `<div class="quick-topics" style="margin-top:10px;">${tags}</div>`;
}

// ── Event card list ───────────────────────────────────────────────────────
function eventList(filterFn) {
  if (typeof EVENTS === "undefined") return "<em>No events data loaded.</em>";
  const list = filterFn ? EVENTS.filter(filterFn) : EVENTS;
  if (!list.length) return "<em>No matching events found.</em>";
  const colors = { open:"#16a34a", registered:"#5b21b6", upcoming:"#b45309", full:"#dc2626" };
  const labels = { open:"Open", registered:"Registered", upcoming:"Upcoming", full:"Full" };
  return list.map(e => {
    const left = e.seats.total - e.seats.filled;
    return `
      <div style="background:rgba(109,94,252,.07);border:1px solid rgba(109,94,252,.15);border-radius:13px;padding:11px 13px;margin:7px 0;cursor:pointer;"
        onclick="sessionStorage.setItem('selectedEventId','${e.id}');window.location.href='event-single.html?id=${e.id}'">
        <div style="font-weight:900;font-size:14px;">${e.name}</div>
        <div style="font-size:12px;color:#4b5563;margin-top:3px;">📅 ${e.date} · ${e.time} &nbsp;🏛️ ${e.venue}</div>
        <div style="font-size:12px;color:#4b5563;">💰 ${e.fee} &nbsp;
          <span style="color:${colors[e.status]};font-weight:800;">${labels[e.status]}</span>
          &nbsp;· ${left > 0 ? left + " seats left" : "No seats left"}
        </div>
      </div>`;
  }).join("");
}

// ── Club card list ────────────────────────────────────────────────────────
function clubList(filterFn) {
  if (typeof CLUBS === "undefined") return "<em>No clubs data loaded.</em>";
  const list = filterFn ? CLUBS.filter(filterFn) : CLUBS;
  if (!list.length) return "<em>No matching clubs found.</em>";
  return list.map(c => `
    <div style="background:rgba(109,94,252,.07);border:1px solid rgba(109,94,252,.15);border-radius:13px;padding:11px 13px;margin:7px 0;cursor:pointer;"
      onclick="sessionStorage.setItem('selectedClubId','${c.id}');window.location.href='club-single.html?id=${c.id}'">
      <div style="font-weight:900;font-size:14px;">${c.logo} ${c.name}
        <span style="font-size:11px;color:#6b7280;font-weight:700;">(${c.category})</span>
      </div>
      <div style="font-size:12px;color:#4b5563;margin-top:3px;">👥 ${c.members} members · ${c.tagline}</div>
      <div style="font-size:12px;color:#4b5563;">🗓️ ${c.meetSchedule}</div>
      <span style="font-size:11px;font-weight:800;color:${c.joinStatus ? "#16a34a" : "#6d5efc"}">
        ${c.joinStatus ? "✅ Already Joined" : "Tap to view & join →"}
      </span>
    </div>`
  ).join("");
}

// ══════════════════════════════════════════════════════════════════════════
//  BUILT-IN ANSWER ENGINE
// ══════════════════════════════════════════════════════════════════════════
function builtInAnswer(input) {
  const q = input.toLowerCase().trim();

  // ── Yes / follow-up ──
  if (/^(yes|yeah|sure|ok|okay|yep|yup)$/.test(q) && lastFAQContext) {
    return getFAQFollowUp(lastFAQContext);
  }

  // ── Greetings ──
  if (/^(hi|hello|hey|good morning|good evening|howdy|sup)\b/.test(q)) {
    lastFAQContext = "greeting";
    return `Hey Arjun! 👋 Great to see you!<br><br>What can I help you with today?
      ${topicButtons(
        ["📅 Open Events",    "__open_events__"],
        ["🏷️ Explore Clubs",  "__all_clubs__"],
        ["🎓 Certificates",   "__certificates__"],
        ["❓ Portal Help",    "__portal_help__"]
      )}`;
  }

  // ── Internal button triggers (use __ prefix to avoid regex collisions) ──
  if (q === "__open_events__")   return openEventsAnswer();
  if (q === "__all_clubs__")     return allClubsAnswer();
  if (q === "__certificates__")  return certificatesAnswer();
  if (q === "__portal_help__")   return portalHelpAnswer();
  if (q === "__free_events__")   return freeEventsAnswer();
  if (q === "__all_events__")    return allEventsAnswer();
  if (q === "__tech_clubs__")    return techClubsAnswer();
  if (q === "__creative_clubs__") return creativeClubsAnswer();
  if (q === "__social_clubs__")  return socialClubsAnswer();
  if (q === "__my_events__")     return myEventsAnswer();
  if (q === "__recommend__")     return recommendAnswer();
  if (q === "__how_register__")  return howRegisterAnswer();
  if (q === "__how_join__")      return howJoinAnswer();
  if (q === "__profile__")       return profileAnswer();
  if (q === "__password__")      return passwordAnswer();

  // ── Typed question matching ──

  // All events
  if (/\b(all event|list event|show.*event|what.*event|events available|events on|events today|see.*event)\b/.test(q)) {
    return allEventsAnswer();
  }

  // Open events / register
  if (/\b(open event|open for reg|can i register|available.*event|sign.?up.*event)\b/.test(q) ||
      /\b(register)\b/.test(q)) {
    return openEventsAnswer();
  }

  // FREE events — must be checked BEFORE "all events"
  if (/\b(free event|free events|no fee|without.*fee|free to join)\b/.test(q)) {
    return freeEventsAnswer();
  }

  // All clubs
  if (/\b(all club|list club|show.*club|what.*club|clubs available|explore club|which club|join.*club)\b/.test(q)) {
    return allClubsAnswer();
  }

  // Technical clubs
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

  // How to join club
  if (/\b(how.*join|become.*member)\b/.test(q)) {
    return howJoinAnswer();
  }

  // Certificates
  if (/\b(certificate|cert|download.*cert|get.*cert)\b/.test(q)) {
    return certificatesAnswer();
  }

  // My registered events
  if (/\b(my event|my registration|registered event|events i.*join)\b/.test(q)) {
    return myEventsAnswer();
  }

  // Profile
  if (/\b(profile|my profile|edit profile|account|update.*info)\b/.test(q)) {
    return profileAnswer();
  }

  // Password
  if (/\b(password|change.*password|forgot.*password|reset.*password)\b/.test(q)) {
    return passwordAnswer();
  }

  // Navigation
  if (/\b(navigate|how.*go|find.*page|portal help|portal.*work|where is)\b/.test(q)) {
    return portalHelpAnswer();
  }

  // About EVE
  if (/\b(who are you|what are you|what is eve|about eve)\b/.test(q)) {
    lastFAQContext = "about";
    return `I'm <strong>EVE</strong> ✦ — your AI-powered student assistant inside EVEXA!<br><br>
      I can help you with:<br>
      <li>📅 Finding & recommending events</li>
      <li>🏷️ Exploring & joining clubs</li>
      <li>🎓 Understanding certificates</li>
      <li>❓ Navigating the EVEXA portal</li><br>
      Just ask me anything! 😊`;
  }

  // Recommend
  if (/\b(recommend|suggest|what should i|best event|best club)\b/.test(q)) {
    return recommendAnswer();
  }

  // Thanks
  if (/\b(thank|thanks|ty|great|awesome|perfect)\b/.test(q)) {
    lastFAQContext = null;
    return `You're welcome, Arjun! 😊 Anything else?
      ${topicButtons(
        ["📅 Events", "__open_events__"],
        ["🏷️ Clubs",  "__all_clubs__"]
      )}`;
  }

  // Bye
  if (/\b(bye|goodbye|see you|later|cya)\b/.test(q)) {
    lastFAQContext = null;
    return `Goodbye Arjun! 👋 Come back anytime!`;
  }

  // No match → Gemini
  return null;
}

// ── Answer functions ──────────────────────────────────────────────────────

function allEventsAnswer() {
  lastFAQContext = "events";
  return `Here are all events on EVEXA:<br>${eventList()}<br>
    Click any event to view details and register! 🎉
    ${topicButtons(
      ["✅ Open Only",   "__open_events__"],
      ["🆓 Free Only",  "__free_events__"]
    )}`;
}

function openEventsAnswer() {
  lastFAQContext = "open-events";
  const html = eventList(e => e.status === "open" || e.status === "upcoming");
  return `Here are events open for registration:<br>${html}<br>
    Click any card to register! 🚀
    ${topicButtons(
      ["🆓 Free Only",   "__free_events__"],
      ["📋 All Events",  "__all_events__"]
    )}`;
}

function freeEventsAnswer() {
  lastFAQContext = "free-events";
  const html = eventList(e => e.fee.toLowerCase().trim() === "free");
  return `Here are the <strong>free events</strong> 🆓:<br>${html}
    ${topicButtons(
      ["📅 All Events",  "__all_events__"],
      ["✅ Open Events", "__open_events__"]
    )}`;
}

function allClubsAnswer() {
  lastFAQContext = "clubs";
  return `Here are all clubs you can join:<br>${clubList()}<br>
    Click any club to view details and join! 🏷️
    ${topicButtons(
      ["💻 Technical",  "__tech_clubs__"],
      ["🎨 Creative",   "__creative_clubs__"],
      ["🤝 Social",     "__social_clubs__"]
    )}`;
}

function techClubsAnswer() {
  lastFAQContext = "tech-clubs";
  return `Here are the <strong>Technical Clubs</strong>:<br>
    ${clubList(c => c.category === "Technical")}
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"])}`;
}

function creativeClubsAnswer() {
  lastFAQContext = "creative-clubs";
  return `Here are the <strong>Creative Clubs</strong>:<br>
    ${clubList(c => c.category === "Creative")}
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"])}`;
}

function socialClubsAnswer() {
  lastFAQContext = "social-clubs";
  return `Here are the <strong>Social Clubs</strong>:<br>
    ${clubList(c => c.category === "Social")}
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"])}`;
}

function certificatesAnswer() {
  lastFAQContext = "certificates";
  return `Here's how certificates work on EVEXA:<br><br>
    🎓 <strong>How to get your certificate:</strong><br>
    1️⃣ Register and attend an event<br>
    2️⃣ After the event, your certificate is auto-generated<br>
    3️⃣ Go to <strong>Certificates</strong> in the sidebar<br>
    4️⃣ Click <strong>Download</strong> to save it<br><br>
    📌 You currently have <strong>2 certificates</strong> ready!<br><br>
    Would you like to see upcoming events to earn more?
    ${topicButtons(["📅 Open Events", "__open_events__"])}`;
}

function myEventsAnswer() {
  lastFAQContext = "my-events";
  return `You have <strong>7 registered events</strong> and <strong>3 upcoming</strong>! 🎉<br><br>
    View them: Click <strong>Registered Events</strong> in the sidebar.<br><br>
    Already registered for:<br>
    <li>🤖 <strong>Robo Race 2026</strong> — March 15</li>
    <li>💻 <strong>Web Dev Workshop</strong> — March 20</li><br>
    Want more events?
    ${topicButtons(["📅 Open Events", "__open_events__"])}`;
}

function howRegisterAnswer() {
  lastFAQContext = "how-register";
  return `Here's how to register for an event:<br><br>
    1️⃣ Click <strong>Events</strong> in the sidebar<br>
    2️⃣ Use the <strong>Open</strong> filter to find registerable events<br>
    3️⃣ Click on any event card<br>
    4️⃣ Click <strong>"Register Now →"</strong> on the event page<br>
    5️⃣ Done! ✅ Check <strong>Registered Events</strong> in the sidebar<br><br>
    Want to see open events?
    ${topicButtons(["📅 Open Events", "__open_events__"])}`;
}

function howJoinAnswer() {
  lastFAQContext = "how-join";
  return `Here's how to join a club:<br><br>
    1️⃣ Click <strong>Clubs</strong> in the top navigation bar<br>
    2️⃣ Browse and click on a club you like<br>
    3️⃣ Click <strong>"Join Club →"</strong> on the club page<br>
    4️⃣ Done! ✅ You're now a member<br><br>
    Want to see all clubs?
    ${topicButtons(["🏷️ All Clubs", "__all_clubs__"])}`;
}

function profileAnswer() {
  lastFAQContext = "profile";
  return `To view or edit your profile:<br><br>
    👤 <strong>Quick view:</strong> Dashboard → click <strong>Profile</strong> button<br>
    ⚙️ <strong>Full edit:</strong> Click <strong>Account Settings</strong> at the bottom of the sidebar<br><br>
    You can update:<br>
    <li>Name, email, phone number</li>
    <li>Department, year, roll number</li>
    <li>Password & security</li>
    <li>Notification preferences & appearance</li>
    ${topicButtons(["🔒 Change Password", "__password__"])}`;
}

function passwordAnswer() {
  lastFAQContext = "password";
  return `To change your password:<br><br>
    1️⃣ Click <strong>Account Settings</strong> in the sidebar<br>
    2️⃣ Click the <strong>Security</strong> tab<br>
    3️⃣ Enter current password + new password<br>
    4️⃣ Click <strong>"Update Password"</strong><br><br>
    🔒 Password must have: 8+ characters, 1 uppercase letter, 1 number.`;
}

function portalHelpAnswer() {
  lastFAQContext = "navigation";
  return `Here's the full EVEXA portal map:<br><br>
    🏠 <strong>Dashboard</strong> — Overview & quick stats<br>
    📅 <strong>Events</strong> — Browse & register for events<br>
    ✅ <strong>Registered Events</strong> — Your registrations<br>
    🎓 <strong>Certificates</strong> — Download your certificates<br>
    🏷️ <strong>Clubs</strong> — Browse & join clubs (top nav)<br>
    ✦ <strong>EVE</strong> — That's me! AI assistant<br>
    ⚙️ <strong>Account Settings</strong> — Edit profile & preferences<br><br>
    What would you like to do?
    ${topicButtons(
      ["📅 Events", "__open_events__"],
      ["🏷️ Clubs",  "__all_clubs__"]
    )}`;
}

function recommendAnswer() {
  lastFAQContext = "recommend";
  const openEvents   = typeof EVENTS !== "undefined" ? EVENTS.filter(e => e.status === "open").slice(0, 2) : [];
  const unjoinedClubs = typeof CLUBS !== "undefined" ? CLUBS.filter(c => !c.joinStatus).slice(0, 2) : [];
  const openIds  = openEvents.map(e => e.id);
  const clubIds  = unjoinedClubs.map(c => c.id);
  return `Here are my top picks for you Arjun! 🌟<br><br>
    <strong>📅 Events to register for:</strong><br>
    ${eventList(e => openIds.includes(e.id))}<br>
    <strong>🏷️ Clubs to explore:</strong><br>
    ${clubList(c => clubIds.includes(c.id))}`;
}

// ── FAQ Follow-up (when user says "yes") ──────────────────────────────────
function getFAQFollowUp(context) {
  lastFAQContext = null;
  const map = {
    "greeting": topicButtons(
      ["📅 What events are open?",        "__open_events__"],
      ["🆓 Show free events",             "__free_events__"],
      ["🏷️ What clubs can I join?",       "__all_clubs__"],
      ["🎓 How do I get a certificate?",  "__certificates__"],
      ["📝 How do I register?",           "__how_register__"],
      ["👤 How do I edit my profile?",    "__profile__"],
      ["🔒 How do I change my password?", "__password__"],
      ["🏛️ Navigate the portal",          "__portal_help__"]
    ),
    "open-events": topicButtons(
      ["🆓 Free Events Only",    "__free_events__"],
      ["📋 All Events",          "__all_events__"],
      ["📝 How to Register",     "__how_register__"],
      ["✅ My Registrations",    "__my_events__"]
    ),
    "free-events": topicButtons(
      ["📅 All Open Events",    "__open_events__"],
      ["📋 All Events",         "__all_events__"],
      ["📝 How to Register",    "__how_register__"]
    ),
    "clubs": topicButtons(
      ["💻 Technical Clubs",    "__tech_clubs__"],
      ["🎨 Creative Clubs",     "__creative_clubs__"],
      ["🤝 Social Clubs",       "__social_clubs__"],
      ["❓ How to Join",        "__how_join__"]
    ),
    "certificates": topicButtons(
      ["📅 Upcoming Events",    "__open_events__"],
      ["✅ My Registered Events","__my_events__"],
      ["🏛️ Navigate Portal",    "__portal_help__"]
    ),
    "how-register": topicButtons(
      ["📅 Open Events",        "__open_events__"],
      ["✅ My Registrations",   "__my_events__"],
      ["🎓 Certificates",       "__certificates__"]
    ),
    "how-join": topicButtons(
      ["🏷️ All Clubs",          "__all_clubs__"],
      ["💻 Technical Clubs",    "__tech_clubs__"],
      ["📅 Events",             "__open_events__"]
    ),
    "navigation": topicButtons(
      ["📅 Find Events",        "__open_events__"],
      ["🏷️ Join a Club",        "__all_clubs__"],
      ["🎓 Get Certificate",    "__certificates__"],
      ["👤 Edit Profile",       "__profile__"]
    ),
    "profile": topicButtons(
      ["🔒 Change Password",    "__password__"],
      ["📅 Find Events",        "__open_events__"],
      ["🎓 Certificates",       "__certificates__"]
    ),
  };

  const buttons = map[context] || topicButtons(
    ["📅 Events",        "__open_events__"],
    ["🏷️ Clubs",         "__all_clubs__"],
    ["🎓 Certificates",  "__certificates__"],
    ["❓ Portal Help",   "__portal_help__"]
  );

  return `Here are some more things I can help you with:${buttons}`;
}

// ── Gemini fallback ───────────────────────────────────────────────────────
function getGeminiContext() {
  const ev = typeof EVENTS !== "undefined"
    ? EVENTS.map(e => `- ${e.name} | ${e.date} | ${e.status} | Fee: ${e.fee}`).join("\n") : "";
  const cl = typeof CLUBS !== "undefined"
    ? CLUBS.map(c => `- ${c.name} (${c.category}) | ${c.members} members`).join("\n") : "";
  return `You are EVE, a friendly AI assistant inside the EVEXA student portal for Arjun Kumar, 2nd Year CSE student.
EVENTS:\n${ev}\nCLUBS:\n${cl}
Be concise, warm, helpful. Use emojis occasionally.`;
}

async function callGemini(userText) {
  const contents = [
    { role: "user",  parts: [{ text: getGeminiContext() + "\n\nReady?" }] },
    { role: "model", parts: [{ text: "Ready! I'm EVE." }] },
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

  const data = await res.json();
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

  // Only show user message bubble for real typed input (not internal triggers)
  if (!userText.startsWith("__")) {
    messagesEl.appendChild(renderMessage("user", userText));
    scrollToBottom();
  }

  // Try built-in first
  const instant = builtInAnswer(userText);
  if (instant !== null) {
    eveReply(instant, 350);
    return;
  }

  // Gemini fallback
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
      `⚠️ I couldn't connect right now. Try one of these instead:
      ${topicButtons(
        ["📅 Events",       "__open_events__"],
        ["🏷️ Clubs",        "__all_clubs__"],
        ["🎓 Certificates", "__certificates__"]
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

document.getElementById("logoutBtn")?.addEventListener("click", () => {
  if (confirm("Do you want to logout?")) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    window.location.href = "stsignin.html";
  }
});

// ── Init ──────────────────────────────────────────────────────────────────
attachTopicTags();
inputEl.focus();
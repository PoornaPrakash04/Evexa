// ===========================
//  eve.js
//  EVE AI Student Assistant
//  Uses Anthropic API with full events + clubs context
// ===========================

const messagesEl   = document.getElementById("eveMessages");
const inputEl      = document.getElementById("eveInput");
const sendBtn      = document.getElementById("eveSendBtn");
const typingEl     = document.getElementById("typingIndicator");
const clearBtn     = document.getElementById("clearBtn");

// ── Conversation history for multi-turn context ──────────────────────────
let conversationHistory = [];

// ── Build system prompt with real data ───────────────────────────────────
function buildSystemPrompt() {
  const eventsContext = (typeof EVENTS !== "undefined")
    ? EVENTS.map(e => `- ${e.name} | ${e.date} ${e.time} | ${e.venue} | Status: ${e.status} | Seats left: ${e.seats.total - e.seats.filled} | Fee: ${e.fee} | Club: ${e.club}`).join("\n")
    : "No events data available.";

  const clubsContext = (typeof CLUBS !== "undefined")
    ? CLUBS.map(c => `- ${c.name} (${c.category}) | ${c.members} members | Chair: ${c.chairperson.name} | Vice: ${c.viceChair.name} | Advisor: ${c.facultyAdvisor.name} | Meet: ${c.meetSchedule} | Contact: ${c.contact}`).join("\n")
    : "No clubs data available.";

  return `You are EVE, a friendly and knowledgeable AI assistant built into the EVEXA student event management portal. You help students named Arjun Kumar (2nd Year, CSE, Reg No: STU-2026-019) navigate the portal and make the most of college life.

You can help with:
1. Finding and recommending events based on student interests
2. Exploring and recommending clubs to join
3. Answering FAQs about the EVEXA portal (how to register, get certificates, etc.)
4. Certificate and registration queries

CURRENT EVENTS ON THE PORTAL:
${eventsContext}

CURRENT CLUBS ON THE PORTAL:
${clubsContext}

PORTAL GUIDE:
- To register for events: Go to Events page → click an event card → click "Register Now"
- To join a club: Go to Clubs page → click a club → click "Join Club"
- To get certificates: Go to Certificates page after attending an event
- Registered events: View your registrations under "Registered Events" in the sidebar
- Account settings: Update profile, change password via Account Settings

PERSONALITY:
- Be warm, friendly, and concise
- Use emojis occasionally but not excessively
- Give specific, actionable answers
- When recommending events or clubs, mention relevant details like date, venue, fee
- Format lists with dashes for readability
- Keep responses focused and not too long
- If unsure about something specific to the college, say so honestly`;
}

// ── Render a message bubble ───────────────────────────────────────────────
function renderMessage(role, text, time) {
  const isEve  = role === "eve";
  const timeStr = time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const div = document.createElement("div");
  div.className = `msg ${isEve ? "eve-msg" : "user-msg"}`;

  const avatar = isEve
    ? `<div class="msg-avatar eve-msg-avatar">✦</div>`
    : `<div class="msg-avatar user-avatar">AK</div>`;

  // Simple markdown-like formatting
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>");

  div.innerHTML = `
    ${avatar}
    <div class="msg-bubble ${isEve ? "eve-bubble" : "user-bubble"}">
      <div class="msg-text">${formatted}</div>
      <div class="msg-time">${timeStr}</div>
    </div>
  `;

  return div;
}

// ── Scroll to bottom ──────────────────────────────────────────────────────
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Show / hide typing indicator ──────────────────────────────────────────
function showTyping() {
  typingEl.style.display = "flex";
  scrollToBottom();
}
function hideTyping() {
  typingEl.style.display = "none";
}

// ── Send message ──────────────────────────────────────────────────────────
async function sendMessage(userText) {
  const text = (userText || inputEl.value).trim();
  if (!text) return;

  // Clear input
  inputEl.value = "";
  inputEl.style.height = "auto";

  // Render user bubble
  messagesEl.appendChild(renderMessage("user", text));
  scrollToBottom();

  // Add to history
  conversationHistory.push({ role: "user", content: text });

  // Disable send
  sendBtn.disabled = true;
  showTyping();

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: buildSystemPrompt(),
        messages: conversationHistory
      })
    });

    const data = await response.json();
    const replyText = data.content?.[0]?.text || "Sorry, I couldn't get a response. Please try again.";

    // Add to history
    conversationHistory.push({ role: "assistant", content: replyText });

    hideTyping();
    messagesEl.appendChild(renderMessage("eve", replyText));
    scrollToBottom();

  } catch (err) {
    hideTyping();
    conversationHistory.pop(); // remove failed user message from history

    const errMsg = renderMessage("eve",
      "⚠️ I'm having trouble connecting right now. Please check your connection and try again.");
    messagesEl.appendChild(errMsg);
    scrollToBottom();
  }

  sendBtn.disabled = false;
  inputEl.focus();
}

// ── Event listeners ───────────────────────────────────────────────────────

// Send on button click
sendBtn.addEventListener("click", () => sendMessage());

// Send on Enter (Shift+Enter = new line)
inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
});

// Quick topic tags
document.querySelectorAll(".topic-tag").forEach(tag => {
  tag.addEventListener("click", () => {
    sendMessage(tag.dataset.prompt);
  });
});

// Clear chat
clearBtn.addEventListener("click", () => {
  if (!confirm("Clear the conversation?")) return;
  conversationHistory = [];
  // Remove all messages except welcome
  const allMsgs = messagesEl.querySelectorAll(".msg");
  allMsgs.forEach((m, i) => { if (i > 0) m.remove(); });
});

// Logout
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  if (confirm("Do you want to logout?")) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    window.location.href = "stsignin.html";
  }
});

// Focus input on load
inputEl.focus();
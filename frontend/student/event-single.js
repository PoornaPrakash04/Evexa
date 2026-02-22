// event-single.js — backend connected

// ── Get event ID from URL or sessionStorage ───────────
const urlParams  = new URLSearchParams(window.location.search);
const urlId      = urlParams.get("id");
const ssId       = sessionStorage.getItem("selectedEventId");
const selectedId = urlId || ssId;

const content = document.getElementById("pageContent");

// ── Fetch and render ──────────────────────────────────
async function loadEvent() {
  if (!selectedId) {
    window.location.href = "event-details.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/events/${selectedId}`);
    if (!res.ok) throw new Error("Not found");
    const event = await res.json();
    renderEvent(event);
  } catch {
    content.innerHTML = `
      <div class="not-found">
        <div style="font-size:48px;margin-bottom:14px;">🔎</div>
        <div style="font-size:20px;font-weight:900;color:#111827;margin-bottom:8px;">Event not found</div>
        <div style="color:#6b7280;margin-bottom:20px;">This event doesn't exist or is no longer available.</div>
        <a href="event-details.html" class="back-btn">← Back to Events</a>
      </div>`;
  }
}

// ── Check if student already registered ──────────────
async function checkRegistration(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) return false;

  const res = await fetch(`${API_BASE}/attendance/my-registrations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;

  const registrations = await res.json();
  return registrations.some(r => String(r.event_id) === String(eventId));
}

// ── Render full event page ────────────────────────────
async function renderEvent(event) {
  document.title = `${event.title} | EVEXA`;

  if (document.getElementById("topbarTitle"))
    document.getElementById("topbarTitle").textContent = event.title;

  const poster = event.poster
    ? `http://localhost:5000/uploads/${event.poster}`
    : "https://placehold.co/900x300/6d5efc/ffffff?text=No+Poster";

  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString("en-IN", { dateStyle: "long" })
    : "TBA";

  const fee = event.registration_fee > 0 ? `₹${event.registration_fee}` : "Free";

  // ── Fetch organizer contact info ──────────────────
  const orgRes = await fetch(`${API_BASE}/events/${event.id}/organizer`);
  const organizer = orgRes.ok ? await orgRes.json() : null;

  // ── Check if already registered ──────────────────
  const alreadyRegistered = await checkRegistration(event.id);

  const now        = new Date();
  const eventDate_ = new Date(event.date);
  const isFull     = event.capacity && (event.registered_count || 0) >= event.capacity;
  const isPast     = eventDate_ < now;

  let ctaBtn = "";
  if (alreadyRegistered) {
    ctaBtn = `
      <button class="btn-register btn-registered" disabled>✅ Already Registered</button>
      <button class="btn-register" type="button"
        onclick="fetchAndShowTicket(${event.id})"
        style="margin-top:10px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;cursor:pointer;">
        🎟 View / Download Ticket
      </button>`;
  } else if (isFull) {
    ctaBtn = `<button class="btn-register" disabled>⛔ Registration Full</button>`;
  } else if (isPast) {
    ctaBtn = `<button class="btn-register" disabled>🕐 Event has ended</button>`;
  } else {
    ctaBtn = `<button class="btn-register" id="registerNowBtn">Register Now →</button>`;
  }

  const capacity        = event.capacity || 0;
  const registeredCount = event.registered_count || 0;
  const seatsLeft       = capacity ? capacity - registeredCount : null;
  const pct             = capacity ? Math.min((registeredCount / capacity) * 100, 100) : 0;

  content.innerHTML = `
    <a class="back-btn" href="event-details.html">← Back to Events</a>

    <img class="event-hero" src="${poster}" alt="${event.title}"
         onerror="this.src='https://placehold.co/900x300/6d5efc/ffffff?text=No+Poster'" />

    <div class="detail-layout">

      <!-- Left column -->
      <div class="detail-main">

        <div class="detail-section">
          <div class="detail-title-row">
            <div class="detail-title">${event.title}</div>
            <span class="status-badge ${isPast ? "ended" : isFull ? "full" : "open"}">
              ${isPast ? "Ended" : isFull ? "Full" : "Open"}
            </span>
          </div>
          <div class="tag-row">
            <span class="tag">${event.type || "Event"}</span>
            <span class="tag">${event.club || "—"}</span>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">About this Event</div>
          <p class="detail-desc">${event.description || "No description available."}</p>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">Event Details</div>
          <div class="info-list">
            <div class="info-item">
              <div class="info-icon-box">📅</div>
              <div>
                <div class="info-item-label">Date &amp; Time</div>
                <div class="info-item-value">${eventDate} · ${event.time || "TBA"}</div>
              </div>
            </div>
            <div class="info-item">
              <div class="info-icon-box">🏛️</div>
              <div>
                <div class="info-item-label">Venue</div>
                <div class="info-item-value">${event.venue || "TBA"}</div>
              </div>
            </div>
            <div class="info-item">
              <div class="info-icon-box">🏷️</div>
              <div>
                <div class="info-item-label">Organised by</div>
                <div class="info-item-value">${event.club || "—"}</div>
              </div>
            </div>
            <div class="info-item">
              <div class="info-icon-box">💰</div>
              <div>
                <div class="info-item-label">Registration Fee</div>
                <div class="info-item-value">${fee}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="detail-section">
          <div class="detail-section-title">🏆 Prizes &amp; Recognition</div>
          <div class="prize-row">
            <span class="prize-icon">📜</span>
            <span>Participation Certificate for all</span>
          </div>
        </div>

      </div>

      <!-- Right sidebar -->
      <div class="detail-sidebar">

        <!-- Registration Card -->
        <div class="reg-card">
          <div class="reg-card-title">Registration</div>
          ${capacity ? `
          <div class="seats-label">
            <span>${seatsLeft > 0 ? seatsLeft + " seats left" : "No seats left"}</span>
            <span>${registeredCount} / ${capacity}</span>
          </div>
          <div class="seats-bar-bg">
            <div class="seats-bar-fill" style="width:${pct}%"></div>
          </div>` : `
          <div class="seats-label"><span>Open registration</span></div>`}
          ${ctaBtn}
          <div class="reg-note">Registration closes 24 hrs before the event</div>
        </div>

        <!-- Download Certificate (shows only after event ends) -->
        ${isPast ? `
        <div class="reg-card">
          <div class="reg-card-title">📜 Certificate</div>
          <p style="font-size:13px;color:#6b7280;margin-bottom:12px;">
            If you attended this event, your certificate is ready to download.
          </p>
          <button class="btn-register" type="button"
            onclick="downloadCertificate(${event.id})"
            style="background:linear-gradient(135deg,#6d5efc,#8a7bff);color:white;border:none;cursor:pointer;">
            📜 Download Certificate
          </button>
        </div>` : ""}

        <!-- Raise an Issue -->
        <div class="reg-card">
          <div class="reg-card-title">🚩 Raise an Issue</div>
          <p style="font-size:13px;color:#6b7280;margin-bottom:12px;">
            Facing a problem with registration or the event?
          </p>
          <textarea id="issueText" placeholder="Describe your issue..."
            style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;
                   font-size:13px;resize:vertical;min-height:80px;font-family:inherit;
                   outline:none;margin-bottom:10px;"></textarea>
          <button class="btn-register" type="button"
            onclick="submitIssue(${event.id})"
            style="background:linear-gradient(135deg,#ef4444,#dc2626);color:white;border:none;cursor:pointer;">
            🚩 Submit Issue
          </button>
          <div id="issueSuccess" style="display:none;margin-top:8px;font-size:12px;
               color:#10b981;font-weight:700;">✅ Issue submitted successfully!</div>
        </div>

        <!-- Contact for Queries — uses real organizer data -->
        <div class="reg-card">
          <div class="reg-card-title">📞 Contact for Queries</div>
          <div style="font-size:13px;color:#374151;line-height:1.8;">
            <div>🏷️ <strong>Organised by:</strong> ${event.club || "—"}</div>
            <div style="margin-top:8px;">📧 <strong>Email:</strong>
              <a href="mailto:${organizer?.email || 'events@evexa.in'}"
                 style="color:#6d5efc;text-decoration:none;">
                ${organizer?.email || 'events@evexa.in'}
              </a>
            </div>
            <div style="margin-top:4px;">📱 <strong>Phone:</strong> ${organizer?.phone || 'N/A'}</div>
            <div style="margin-top:8px;padding:10px;background:rgba(109,94,252,.06);
                 border-radius:12px;border:1px solid rgba(109,94,252,.15);font-size:12px;color:#6b7280;">
              For urgent queries, contact the club coordinator directly.
            </div>
          </div>
        </div>

      </div>
    </div>`;

  // Register button handler
  document.getElementById("registerNowBtn")?.addEventListener("click", () => registerForEvent(event.id));
}

// ── Register for event ────────────────────────────────
async function registerForEvent(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) {
    alert("Please login to register.");
    window.location.href = "stsignin.html";
    return;
  }

  const btn = document.getElementById("registerNowBtn");
  if (btn) { btn.textContent = "Registering..."; btn.disabled = true; }

  try {
    const regRes = await fetch(`${API_BASE}/attendance/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_id: eventId }),
    });

    const regData = await regRes.json();

    if (!regRes.ok) {
      alert(regData.message || "Registration failed.");
      if (btn) { btn.textContent = "Register Now →"; btn.disabled = false; }
      return;
    }

    if (btn) btn.textContent = "Generating ticket...";

    const qrRes = await fetch(`${API_BASE}/tickets/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_id: eventId }),
    });

    if (qrRes.ok) {
      const ticketData = await qrRes.json();
      showTicketModal(ticketData);

      if (btn) {
        btn.textContent = "✅ Registered!";
        btn.classList.add("btn-registered");
        btn.disabled = true;
      }

      const existingDl = document.getElementById("downloadTicketBtn");
      if (!existingDl) {
        const dlBtn = document.createElement("button");
        dlBtn.id            = "downloadTicketBtn";
        dlBtn.type          = "button";
        dlBtn.className     = "btn-register";
        dlBtn.style.cssText = "margin-top:10px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;cursor:pointer;";
        dlBtn.textContent   = "🎟 View / Download Ticket";
        dlBtn.addEventListener("click", () => showTicketModal(ticketData));
        btn.parentNode.insertBefore(dlBtn, btn.nextSibling);
      }

    } else {
      if (btn) {
        btn.textContent = "✅ Registered!";
        btn.classList.add("btn-registered");
        btn.disabled = true;
      }
      alert("Registered successfully! (Ticket generation failed, contact admin)");
    }

  } catch (err) {
    console.error("Registration error:", err);
    alert("Server error. Please try again.");
    if (btn) { btn.textContent = "Register Now →"; btn.disabled = false; }
  }
}

// ── Show ticket modal ─────────────────────────────────
function showTicketModal(data) {
  const { qr, student, event, ticket_id } = data;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "—"; };

  set("tEventName",   event.title);
  set("tEventDate",   event.date ? new Date(event.date).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "TBA");
  set("tEventVenue",  event.venue || "TBA");
  set("tEventClub",   event.club  || "");
  set("tStudentName", student.name);
  set("tRollNo",      student.roll_no);
  set("tDept",        student.department);
  set("tClass",       student.class);
  set("tEmail",       student.email);
  set("tTicketId",    ticket_id);
  set("tIssuedAt",    "Issued: " + new Date().toLocaleDateString("en-IN"));

  const qrImg = document.getElementById("ticketQR");
  if (qrImg) qrImg.src = qr;

  document.getElementById("ticketOverlay")?.classList.add("show");
  const modal = document.getElementById("ticketModal");
  if (modal) {
    modal.classList.add("show");
    modal.removeAttribute("aria-hidden");
  }
}

// ── Close ticket modal ────────────────────────────────
function closeTicket() {
  document.getElementById("registerNowBtn")?.focus();
  document.getElementById("ticketOverlay")?.classList.remove("show");
  const modal = document.getElementById("ticketModal");
  if (modal) {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }
}

// ── Download ticket as PNG ────────────────────────────
async function downloadTicket() {
  const btn = document.querySelector(".ticket-actions .btn.primary");

  try {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    document.head.appendChild(script);

    script.onload = async () => {
      if (btn) { btn.textContent = "Downloading..."; btn.classList.add("btn-downloading"); }

      const card   = document.getElementById("ticketCard");
      const canvas = await html2canvas(card, { scale: 3, useCORS: true, backgroundColor: "#ffffff" });

      const link    = document.createElement("a");
      link.download = `EVEXA-Ticket-${document.getElementById("tTicketId")?.textContent || "ticket"}.png`;
      link.href     = canvas.toDataURL("image/png");
      link.click();

      if (btn) { btn.textContent = "⬇ Download Ticket"; btn.classList.remove("btn-downloading"); }
    };

  } catch (err) {
    console.error("Download failed:", err);
    alert("Download failed. Try right-clicking the ticket and saving.");
  }
}

// ── Logout ────────────────────────────────────────────
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  if (confirm("Do you want to logout?")) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    window.location.href = "stsignin.html";
  }
});

// ── Fetch and show existing ticket ───────────────────
async function fetchAndShowTicket(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/tickets/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_id: eventId }),
    });

    if (res.ok) {
      const ticketData = await res.json();
      showTicketModal(ticketData);
    } else {
      alert("Could not load ticket. Please try again.");
    }
  } catch (err) {
    console.error("Ticket fetch error:", err);
  }
}

// ── Download Certificate ──────────────────────────────
async function downloadCertificate(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) { alert("Please login."); return; }

  try {
    const res = await fetch(`${API_BASE}/certificates/download/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `certificate-event-${eventId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      alert("Certificate not available yet. Please check back later.");
    }
  } catch (err) {
    console.error("Certificate download error:", err);
    alert("Server error. Please try again.");
  }
}

// ── Submit Issue ──────────────────────────────────────
async function submitIssue(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) { alert("Please login."); return; }

  const text = document.getElementById("issueText")?.value.trim();
  if (!text) { alert("Please describe your issue."); return; }

  try {
    const res = await fetch(`${API_BASE}/events/${eventId}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ message: text })
    });

    if (res.ok) {
      document.getElementById("issueText").value = "";
      const success = document.getElementById("issueSuccess");
      if (success) {
        success.style.display = "block";
        setTimeout(() => { success.style.display = "none"; }, 3000);
      }
    } else {
      alert("Failed to submit issue. Please try again.");
    }
  } catch (err) {
    console.error("Issue submit error:", err);
    alert("Server error.");
  }
}

// ── Boot ──────────────────────────────────────────────
loadEvent();
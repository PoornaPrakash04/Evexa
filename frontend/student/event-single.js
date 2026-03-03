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

// ── Check certificate status ──────────────────────────
async function checkCertificateStatus(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) return { available: false };

  try {
    const res = await fetch(`${API_BASE}/certificates/status/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { available: false };
    return await res.json();
  } catch {
    return { available: false };
  }
}

// ── Render full event page ────────────────────────────
async function renderEvent(event) {
  document.title = `${event.title} | EVEXA`;

  if (document.getElementById("topbarTitle"))
    document.getElementById("topbarTitle").textContent = event.title;

  const poster = event.poster
    ? `http://localhost:5000/uploads/${event.poster}`
    : "https://placehold.co/360x640/6d5efc/ffffff?text=No+Poster";

  const eventDate = event.date
    ? new Date(event.date).toLocaleDateString("en-IN", { dateStyle: "long" })
    : "TBA";

  const fee = event.registration_fee > 0 ? `₹${event.registration_fee}` : "Free";

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

  // Certificate section — rendered async after main content
  const certSectionHtml = (isPast && alreadyRegistered)
    ? `<div class="reg-card cert-card-section" id="certSection">
         <div class="cert-section-loading">
           <div class="cert-spinner"></div>
           <span>Checking certificate…</span>
         </div>
       </div>`
    : "";

  content.innerHTML = `
    <a class="back-btn" href="event-details.html">← Back to Events</a>

    <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;align-items:start;">

      <!-- LEFT: Poster + About -->
      <div style="display:flex;flex-direction:column;gap:16px;">
        <img src="${poster}" alt="${event.title}"
             onerror="this.src='https://placehold.co/400x711/6d5efc/ffffff?text=No+Poster'"
             style="width:100%;aspect-ratio:9/16;object-fit:cover;max-height:500px;
                    border-radius:16px;box-shadow:0 12px 32px rgba(17,24,39,.15);display:block;" />

        <div class="detail-section">
          <div class="detail-section-title">📋 About this Event</div>
          <p class="detail-desc">${event.description || "No description available."}</p>
        </div>
      </div>

      <!-- RIGHT: All content -->
      <div style="display:flex;flex-direction:column;gap:14px;">

        <!-- Title -->
        <div class="detail-section">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div style="font-size:20px;font-weight:900;line-height:1.3;color:var(--text, var(--text-1, #111))">${event.title}</div>
            <span class="status-badge ${isPast ? "ended" : isFull ? "full" : "open"}" style="flex-shrink:0;">
              ${isPast ? "Ended" : isFull ? "Full" : "Open"}
            </span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
            <span class="tag">${event.type || "Event"}</span>
            <span class="tag">${event.club || "—"}</span>
          </div>
        </div>

        <!-- Event Details -->
        <div class="detail-section">
          <div style="font-size:13px;font-weight:800;margin-bottom:10px;color:var(--text-1,#111);">Event Details</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="width:32px;height:32px;border-radius:10px;background:rgba(109,94,252,.08);
                          display:grid;place-items:center;font-size:15px;flex-shrink:0;">📅</div>
              <div>
                <div style="font-size:11px;color:#6b7280;font-weight:600;">Date &amp; Time</div>
                <div style="font-size:13px;font-weight:800;color:var(--text-1,#111);">${eventDate} · ${event.time || "TBA"}</div>
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="width:32px;height:32px;border-radius:10px;background:rgba(109,94,252,.08);
                          display:grid;place-items:center;font-size:15px;flex-shrink:0;">🏛️</div>
              <div>
                <div style="font-size:11px;color:#6b7280;font-weight:600;">Venue</div>
                <div style="font-size:13px;font-weight:800;color:var(--text-1,#111);">${event.venue || "TBA"}</div>
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="width:32px;height:32px;border-radius:10px;background:rgba(109,94,252,.08);
                          display:grid;place-items:center;font-size:15px;flex-shrink:0;">🏷️</div>
              <div>
                <div style="font-size:11px;color:#6b7280;font-weight:600;">Organised by</div>
                <div style="font-size:13px;font-weight:800;color:var(--text-1,#111);">${event.club || "—"}</div>
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="width:32px;height:32px;border-radius:10px;background:rgba(109,94,252,.08);
                          display:grid;place-items:center;font-size:15px;flex-shrink:0;">💰</div>
              <div>
                <div style="font-size:11px;color:#6b7280;font-weight:600;">Registration Fee</div>
                <div style="font-size:13px;font-weight:800;color:var(--text-1,#111);">${fee}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Registration -->
        <div class="reg-card">
          <div style="font-size:14px;font-weight:900;margin-bottom:10px;">Registration</div>
          ${capacity ? `
          <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;margin-bottom:6px;">
            <span>${seatsLeft > 0 ? seatsLeft + " seats left" : "No seats left"}</span>
            <span>${registeredCount} / ${capacity}</span>
          </div>
          <div class="seats-bar-bg" style="margin-bottom:12px;">
            <div class="seats-bar-fill" style="width:${pct}%"></div>
          </div>` : `<div style="font-size:12px;margin-bottom:12px;">Open registration</div>`}
          ${ctaBtn}
          <div style="font-size:11px;color:#9ca3af;text-align:center;margin-top:8px;">
            Registration closes 24 hrs before the event
          </div>
        </div>

        <!-- Certificate Section (shown only if past + registered) -->
        ${certSectionHtml}

      </div>
    </div>

    <!-- Floating Raise Issue -->
    <button onclick="toggleIssueModal()" title="Raise an Issue"
      style="position:fixed;bottom:28px;right:28px;z-index:500;
             width:52px;height:52px;border-radius:50%;border:none;
             background:linear-gradient(135deg,#ef4444,#dc2626);
             display:flex;align-items:center;justify-content:center;
             cursor:pointer;box-shadow:0 8px 24px rgba(239,68,68,.4);
             transition:transform .2s ease,box-shadow .2s ease;"
      onmouseover="this.style.transform='scale(1.1)';this.style.boxShadow='0 12px 32px rgba(239,68,68,.55)'"
      onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 8px 24px rgba(239,68,68,.4)'">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
        <line x1="4" y1="22" x2="4" y2="15"/>
      </svg>
    </button>

    <div id="issueModalOverlay" onclick="toggleIssueModal()"
      style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);
             z-index:501;backdrop-filter:blur(3px);"></div>

    <div id="issueModal"
      style="display:none;position:fixed;bottom:80px;right:28px;z-index:502;
             width:min(340px,90vw);background:var(--surface,#fff);border-radius:20px;
             padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.18);
             border:1px solid rgba(239,68,68,.15);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:15px;font-weight:700;color:var(--text-1,#111);">🚩 Raise an Issue</div>
        <button onclick="toggleIssueModal()"
          style="background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;line-height:1;">✕</button>
      </div>
      <textarea id="issueText" placeholder="Describe your issue..."
        style="width:100%;padding:10px;border-radius:12px;border:1px solid #e5e7eb;
               font-size:13px;resize:vertical;min-height:90px;font-family:inherit;
               outline:none;box-sizing:border-box;margin-bottom:12px;
               background:var(--surface-2,#f9fafb);color:var(--text-1,#111);"></textarea>
      <button onclick="submitIssue(${event.id})"
        style="width:100%;padding:11px;border-radius:12px;border:none;
               background:linear-gradient(135deg,#ef4444,#dc2626);
               color:white;font-size:13px;font-weight:700;cursor:pointer;">
        Submit Issue
      </button>
      <div id="issueSuccess"
        style="display:none;margin-top:10px;font-size:12px;color:#10b981;font-weight:700;text-align:center;">
        ✅ Submitted!
      </div>
    </div>`;

  document.getElementById("registerNowBtn")?.addEventListener("click", () => registerForEvent(event.id));

  // Load cert section async (after main content painted)
  if (isPast && alreadyRegistered) {
    loadCertificateSection(event.id, event.title);
  }
}

// ── Certificate Section ───────────────────────────────
async function loadCertificateSection(eventId, eventTitle) {
  const section = document.getElementById("certSection");
  if (!section) return;

  const status = await checkCertificateStatus(eventId);

  if (status.available) {
    // Certificate is ready
    const issuedDate = status.issued_at
      ? new Date(status.issued_at).toLocaleDateString("en-IN", { dateStyle: "medium" })
      : null;

    section.innerHTML = `
      <div class="cert-ready-header">
        <div class="cert-ready-icon">🎓</div>
        <div class="cert-ready-text">
          <div class="cert-ready-title">Certificate Ready</div>
          <div class="cert-ready-sub">
            ${issuedDate ? `Issued on ${issuedDate}` : "Your certificate of participation is available"}
          </div>
        </div>
        <div class="cert-ready-badge">✓ Available</div>
      </div>

      <div class="cert-event-label">${eventTitle}</div>

      <div class="cert-actions-row">
        <button class="cert-dl-btn" id="certDownloadBtn" onclick="downloadCertificate(${eventId})" type="button">
          <span class="cert-dl-icon">⬇</span>
          <span>Download Certificate</span>
        </button>
        <button class="cert-preview-btn" onclick="previewCertificate(${eventId})" type="button">
          👁 Preview
        </button>
      </div>

      <div class="cert-note">PDF · Participation Certificate · EVEXA</div>`;

  } else {
    // Not yet issued
    section.innerHTML = `
      <div class="cert-pending-header">
        <div class="cert-pending-icon">📜</div>
        <div class="cert-pending-text">
          <div class="cert-pending-title">Certificate</div>
          <div class="cert-pending-sub">Not yet issued by the organizer</div>
        </div>
        <div class="cert-pending-badge">Pending</div>
      </div>

      <div class="cert-pending-body">
        <div class="cert-pending-timeline">
          <div class="cert-tl-item cert-tl-done">
            <div class="cert-tl-dot done"></div>
            <span>Event completed</span>
          </div>
          <div class="cert-tl-line"></div>
          <div class="cert-tl-item cert-tl-done">
            <div class="cert-tl-dot done"></div>
            <span>Attendance recorded</span>
          </div>
          <div class="cert-tl-line"></div>
          <div class="cert-tl-item">
            <div class="cert-tl-dot pending"></div>
            <span>Certificate generation</span>
          </div>
          <div class="cert-tl-line"></div>
          <div class="cert-tl-item cert-tl-muted">
            <div class="cert-tl-dot muted"></div>
            <span>Available to download</span>
          </div>
        </div>
        <p class="cert-pending-note">
          The organizer will generate certificates after verifying attendance. 
          Check back soon.
        </p>
      </div>`;
  }
}

// ── Download Certificate ──────────────────────────────
async function downloadCertificate(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) { alert("Please login."); return; }

  const btn = document.getElementById("certDownloadBtn");
  if (btn) {
    btn.innerHTML = `<span class="cert-dl-icon">⏳</span><span>Downloading…</span>`;
    btn.disabled  = true;
  }

  try {
    const res = await fetch(`${API_BASE}/certificates/download/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const blob         = await res.blob();
      const url          = URL.createObjectURL(blob);
      const a            = document.createElement("a");
      a.href             = url;
      // Try to get filename from Content-Disposition header
      const disposition  = res.headers.get("Content-Disposition") || "";
      const match        = disposition.match(/filename="?([^"]+)"?/);
      a.download         = match ? match[1] : `Certificate-event-${eventId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      if (btn) {
        btn.innerHTML = `<span class="cert-dl-icon">✅</span><span>Downloaded!</span>`;
        setTimeout(() => {
          btn.innerHTML = `<span class="cert-dl-icon">⬇</span><span>Download Certificate</span>`;
          btn.disabled  = false;
        }, 2500);
      }
    } else {
      const err = await res.json().catch(() => ({}));
      if (btn) {
        btn.innerHTML = `<span class="cert-dl-icon">⬇</span><span>Download Certificate</span>`;
        btn.disabled  = false;
      }
      alert(err.message || "Certificate not available yet. Please check back later.");
    }
  } catch (err) {
    console.error("Certificate download error:", err);
    if (btn) {
      btn.innerHTML = `<span class="cert-dl-icon">⬇</span><span>Download Certificate</span>`;
      btn.disabled  = false;
    }
    alert("Server error. Please try again.");
  }
}

// ── Preview Certificate (inline PDF) ─────────────────
async function previewCertificate(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/certificates/download/${eventId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) { alert("Certificate not available yet."); return; }

    const blob   = await res.blob();
    const url    = URL.createObjectURL(blob);
    const viewer = window.open(url, "_blank");
    if (!viewer) {
      // Fallback: open in same tab if popup blocked
      window.location.href = url;
    }
  } catch {
    alert("Preview failed. Try downloading instead.");
  }
}

// ─────────────────────────────────────────────────────
// EVERYTHING BELOW is unchanged from your original file
// ─────────────────────────────────────────────────────

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
    modal.removeAttribute("inert");
    setTimeout(() => modal.querySelector(".ticket-close-btn")?.focus(), 100);
  }
}

function closeTicket() {
  document.getElementById("ticketOverlay")?.classList.remove("show");
  const modal = document.getElementById("ticketModal");
  if (modal) {
    modal.classList.remove("show");
    document.getElementById("registerNowBtn")?.focus() || document.body.focus();
    setTimeout(() => modal.setAttribute("aria-hidden", "true"), 50);
  }
}

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

async function fetchAndShowTicket(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/tickets/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event_id: eventId }),
    });
    if (res.ok) showTicketModal(await res.json());
    else alert("Could not load ticket. Please try again.");
  } catch (err) {
    console.error("Ticket fetch error:", err);
  }
}

function toggleIssueModal() {
  const modal   = document.getElementById("issueModal");
  const overlay = document.getElementById("issueModalOverlay");
  if (!modal || !overlay) return;
  const isOpen = modal.style.display === "block";
  modal.style.display   = isOpen ? "none" : "block";
  overlay.style.display = isOpen ? "none" : "block";
  if (!isOpen) document.getElementById("issueText")?.focus();
}

async function submitIssue(eventId) {
  const token = localStorage.getItem("authToken");
  if (!token) { alert("Please login."); return; }
  const text = document.getElementById("issueText")?.value.trim();
  if (!text) { alert("Please describe your issue."); return; }
  try {
    const res = await fetch(`${API_BASE}/events/${eventId}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text }),
    });
    if (res.ok) {
      document.getElementById("issueText").value = "";
      const success = document.getElementById("issueSuccess");
      if (success) { success.style.display = "block"; setTimeout(() => { success.style.display = "none"; }, 3000); }
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
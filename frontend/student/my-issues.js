

async function loadMyIssues() {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "stsignin.html";
    return;
  }

  const list = document.getElementById("issuesList");

  try {
    const res = await fetch(`${API_BASE}/events/my-issues`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Show exact error instead of spinning forever
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      list.innerHTML = `
        <div class="no-issues">
          <div style="font-size:36px">⚠️</div>
          <div>Error ${res.status}: ${err.message || "Failed to load issues"}</div>
        </div>`;
      return;
    }

    const issues = await res.json();

    if (!issues.length) {
      list.innerHTML = `
        <div class="no-issues">
          <div style="font-size:40px;margin-bottom:12px;">🚩</div>
          <div>You haven't raised any issues yet.</div>
          <a href="event-details.html" style="color:#6d5efc;font-weight:700;
             text-decoration:none;margin-top:10px;display:inline-block;">
            Browse Events →
          </a>
        </div>`;
      return;
    }

    list.innerHTML = issues.map(i => {
      const statusLabel = i.status
        ? i.status.charAt(0).toUpperCase() + i.status.slice(1).toLowerCase()
        : "Open";
      const statusClass = statusLabel.toLowerCase();
      const submitted = new Date(i.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" });
      const eventDate = i.event_date
        ? new Date(i.event_date).toLocaleDateString("en-IN", { dateStyle: "medium" })
        : "TBA";

      return `
        <div class="issue-card">
          <div class="issue-card-header">
            <div>
              <div class="issue-event-title">📅 ${i.event_title}</div>
              <div class="issue-date">Event date: ${eventDate} · Submitted: ${submitted}</div>
            </div>
            <span class="issue-status ${statusClass}">${statusLabel}</span>
          </div>
          <div class="issue-message">"${i.message}"</div>
        </div>`;
    }).join("");

  } catch (err) {
    console.error("Issues load error:", err);
    list.innerHTML = `
      <div class="no-issues">
        <div style="font-size:36px">⚠️</div>
        <div>Could not connect to server.</div>
      </div>`;
  }
}
// ── Sidebar toggle ────────────────────────────────────
document.getElementById("sidebarToggle")?.addEventListener("click", () => {
  document.getElementById("sidebar")?.classList.toggle("open");
});

// ── Logout ────────────────────────────────────────────
document.getElementById("logoutBtn")?.addEventListener("click", () => {
  if (confirm("Do you want to logout?")) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("userRole");
    window.location.href = "stsignin.html";
  }
});

// ── Boot ──────────────────────────────────────────────
loadMyIssues();
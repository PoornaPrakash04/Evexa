// ===================== Helpers =====================
function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Invalid Date";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(t) {
  if (!t) return "N/A";
  const [h, m] = t.split(":").map(Number);
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
function getAllEvents() {
  return JSON.parse(localStorage.getItem("evexa_events") || "[]");
}
function saveAllEvents(list) {
  localStorage.setItem("evexa_events", JSON.stringify(list));
}
function getEventById(id) {
  const list = getAllEvents();
  return list.find((e) => String(e.id) === String(id)) || null;
}

// ===================== Main =====================
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const mode = params.get("mode"); // "edit" or null

  // 🔙 BACK BUTTON FIX — PLACE IT HERE
  const backBtn = document.getElementById("backBtn");
if (backBtn) {
  backBtn.addEventListener("click", (e) => {
    e.preventDefault();

    // ✅ If in edit mode, go to view mode WITHOUT adding history (prevents loop)
    if (mode === "edit") {
      window.location.replace(`org.html?id=${encodeURIComponent(id)}`);
      return;
    }

    // Normal back for view mode
    if (window.history.length > 1) window.history.back();
    else window.location.href="org.html";
  });
}

  // 👇 rest of your code continues
  const container = document.getElementById("detailContainer");
  if (!container) {
    console.error("detailContainer not found.");
    return;
  }

  const eData = getEventById(id);
  if (!id || !eData) {
    container.innerHTML = `<div style="padding:18px"><b>Event not found.</b><p class="p-muted">Go back and try again.</p></div>`;
    return;
  }

  const editBtn = document.getElementById("editTopBtn");
  const shareBtn = document.getElementById("topShareBtn");

  // ===================== VIEW MODE =====================
  function renderView() {
    // Edit button in view mode -> go to edit mode
    if (editBtn) {
      editBtn.innerHTML = `<i class="fa fa-pen"></i> Edit`;
      editBtn.onclick = (ev) => {
        ev.preventDefault();
        window.location.href = `org.html?id=${encodeURIComponent(id)}&mode=edit`;
      };
    }

    // Share button active only in view mode
    if (shareBtn) {
      shareBtn.style.display = "";
      shareBtn.onclick = async () => {
        const url = window.location.href.split("&mode=edit")[0];
        try {
          await navigator.share?.({ title: eData?.title || "EVEXA Event", url });
        } catch {
          await navigator.clipboard.writeText(url);
          alert("Link copied!");
        }
      };
    }

    const posterBg = {
      Workshop: "#6c63ff",
      Seminar: "#ff6584",
      Hackathon: "#43d9a2",
      Cultural: "#f4a261",
      Sports: "#ffd166",
    };
    const bg = posterBg[eData.type] || "#6c63ff";
    const bannerImg = eData.poster ? `http://localhost:5000/uploads/${eData.poster}` : null;

    const seatsLeft = Math.max((Number(eData.capacity) || 0) - (Number(eData.registered) || 0), 0);
    const pct =
      Number(eData.capacity) > 0
        ? Math.min(100, Math.round((Number(eData.registered || 0) / Number(eData.capacity)) * 100))
        : 0;

    container.innerHTML = `
      <div class="hero">
        <div class="hero-banner">
          ${
            bannerImg
              ? `<img src="${bannerImg}" alt="${eData.title}" />`
              : `<div style="height:100%;width:100%;background:linear-gradient(135deg,${bg},#ff6584);"></div>`
          }
        </div>
      </div>

      <div class="page">
        <div class="main-card">
          <div class="head-row">
            <div>
              <div class="title">${eData.title}</div>

              <div class="badges">
                <span class="badge primary">${eData.type}</span>
                <span class="badge soft">${eData.club || "No Club"}</span>
                <span class="badge">${capitalize(eData.status)}</span>
                <span class="badge">${eData.registration_fee > 0 ? "₹" + eData.registration_fee : "Free"}</span>
              </div>

              <div class="meta">
                <span><i class="fa fa-calendar"></i>${formatDate(eData.date)}</span>
                <span><i class="fa fa-clock"></i>${formatTime(eData.time)}</span>
                <span><i class="fa fa-map-marker-alt"></i>${eData.venue}</span>
                <span><i class="fa fa-users"></i>${eData.registered ?? 0}/${eData.capacity}</span>
              </div>
            </div>

            <span class="status-pill">${capitalize(eData.status || "Open")}</span>
          </div>

          <div class="tabs">
            <button class="tab active" data-tab="info">Description</button>
            <button class="tab" data-tab="qr">QR / Attendance</button>
            <button class="tab" data-tab="res">Resources</button>
          </div>

          <div class="tab-content active" id="tab-info">
            <div class="section-card">
              <p class="p-muted">${eData.description || "No description added."}</p>
            </div>
          </div>

          <div class="tab-content" id="tab-qr">
            <div class="section-card">
              <p class="p-muted">Use QR scanner for attendance.</p>
              <div class="hr"></div>
              <button class="btn btn-primary"><i class="fa fa-camera"></i> Start Scanner</button>
              <button class="btn btn-outline" style="margin-left:10px">
                <i class="fa fa-download"></i> Download Sheet
              </button>
            </div>
          </div>

          <div class="tab-content" id="tab-res">
            <div class="section-card">
              <p class="p-muted">Upload / download event files (poster, brochure, ppt, etc.).</p>

              <div class="res-upload">
                <label class="res-label">Upload file</label>
                <div class="res-row">
                  <input type="file" id="resFile" class="res-input" />
                  <button class="btn btn-primary" id="uploadBtn">
                    <i class="fa fa-upload"></i> Upload
                  </button>
                </div>
                <small class="p-muted">Supported: PDF, PPT, Images</small>
              </div>

              <div class="hr"></div>

              <div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                  <b>Uploaded files</b>
                  <button class="btn btn-outline" id="clearFilesBtn">
                    <i class="fa fa-trash"></i> Clear
                  </button>
                </div>

                <div id="filesList" class="files-list" style="margin-top:12px;"></div>
              </div>
            </div>
          </div>
        </div>

        <aside class="side-card">
          <b style="font-size:16px;">Registration</b>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
            <span class="p-muted">${seatsLeft} seats left</span>
            <span class="p-muted">${eData.registered ?? 0} / ${eData.capacity ?? 0}</span>
          </div>

          <div class="progress"><div style="width:${pct}%"></div></div>

          <div class="section-card" style="margin-top:14px;">
            <div class="grid-2">
              <div class="kpi">
                <div class="kicon"><i class="fa fa-users"></i></div>
                <div><b>${eData.registered ?? 0}</b><small>Registered</small></div>
              </div>
              <div class="kpi">
                <div class="kicon"><i class="fa fa-chair"></i></div>
                <div><b>${eData.capacity ?? 0}</b><small>Capacity</small></div>
              </div>
            </div>
            <div class="hr"></div>
            <p class="p-muted">Later you can load real participants from database and show them as a table here.</p>
          </div>
        </aside>
      </div>
    `;

    // Tabs
    const tabs = container.querySelectorAll(".tab");
    const contents = {
      info: container.querySelector("#tab-info"),
      qr: container.querySelector("#tab-qr"),
      res: container.querySelector("#tab-res"),
    };
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        Object.values(contents).forEach((c) => c.classList.remove("active"));
        btn.classList.add("active");
        contents[btn.dataset.tab].classList.add("active");
      });
    });

    // Resources (localStorage demo)
    const fileInput = document.getElementById("resFile");
    const uploadBtn = document.getElementById("uploadBtn");
    const filesListEl = document.getElementById("filesList");
    const clearBtn = document.getElementById("clearFilesBtn");
    const storageKey = `evexa_event_files_${id}`;

    function pickIcon(type, name) {
      const n = (name || "").toLowerCase();
      if (type?.includes("pdf") || n.endsWith(".pdf")) return "fa-file-pdf";
      if (type?.includes("ppt") || n.endsWith(".ppt") || n.endsWith(".pptx")) return "fa-file-powerpoint";
      if (type?.startsWith("image/") || n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg")) return "fa-image";
      return "fa-file";
    }

    function renderFiles(list) {
      if (!filesListEl) return;
      if (!list.length) {
        filesListEl.innerHTML = `<div class="p-muted">No files uploaded yet.</div>`;
        return;
      }
      filesListEl.innerHTML = list
        .map(
          (f, idx) => `
          <div class="file-item">
            <div class="file-left">
              <i class="fa ${f.icon}"></i>
              <div>
                <div class="file-name">${f.name}</div>
                <div class="file-meta">${f.type || "file"} • ${f.time}</div>
              </div>
            </div>
            <div class="file-actions">
              <button class="btn btn-outline btn-sm" data-dl="${idx}"><i class="fa fa-download"></i></button>
              <button class="btn btn-danger btn-sm" data-del="${idx}"><i class="fa fa-trash"></i></button>
            </div>
          </div>
        `
        )
        .join("");

      filesListEl.querySelectorAll("[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.dataset.del);
          const current = JSON.parse(localStorage.getItem(storageKey) || "[]");
          current.splice(i, 1);
          localStorage.setItem(storageKey, JSON.stringify(current));
          renderFiles(current);
        });
      });

      filesListEl.querySelectorAll("[data-dl]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.dataset.dl);
          const current = JSON.parse(localStorage.getItem(storageKey) || "[]");
          alert(`Download: ${current[i].name}\n\n(For real download, connect backend storage)`);
        });
      });
    }

    let currentFiles = JSON.parse(localStorage.getItem(storageKey) || "[]");
    renderFiles(currentFiles);

    uploadBtn?.addEventListener("click", () => {
      const file = fileInput?.files?.[0];
      if (!file) return alert("Choose a file first.");
      const item = {
        name: file.name,
        type: file.type,
        time: new Date().toLocaleString("en-IN"),
        icon: pickIcon(file.type, file.name),
      };
      currentFiles = [item, ...currentFiles];
      localStorage.setItem(storageKey, JSON.stringify(currentFiles));
      renderFiles(currentFiles);
      fileInput.value = "";
    });

    clearBtn?.addEventListener("click", () => {
      if (confirm("Clear all uploaded files for this event?")) {
        currentFiles = [];
        localStorage.setItem(storageKey, JSON.stringify(currentFiles));
        renderFiles(currentFiles);
      }
    });
  }

  // ===================== EDIT MODE =====================
  function renderEdit() {
    // hide share button in edit mode
    if (shareBtn) shareBtn.style.display = "none";

    // Change Edit button -> Save
    if (editBtn) {
      editBtn.innerHTML = `<i class="fa fa-save"></i> Save`;
      editBtn.onclick = (ev) => {
        ev.preventDefault();

        const updated = {
          ...eData,
          title: document.getElementById("f_title").value.trim(),
          date: document.getElementById("f_date").value,
          time: document.getElementById("f_time").value,
          venue: document.getElementById("f_venue").value.trim(),
          capacity: Number(document.getElementById("f_capacity").value || 0),
          registration_fee: Number(document.getElementById("f_fee").value || 0),
          description: document.getElementById("f_desc").value.trim(),
        };

        const list = getAllEvents();
        const idx = list.findIndex((x) => String(x.id) === String(id));
        if (idx === -1) return alert("Event not found!");

        list[idx] = updated;
        saveAllEvents(list);

        alert("Event updated ✅");
        window.location.href = `org.html?id=${encodeURIComponent(id)}`; // back to view mode
      };
    }

    // Render edit form inside the same container
    container.innerHTML = `
      <div class="main-card" style="padding:16px;">
        <div class="head-row" style="margin-bottom:10px;">
          <div>
            <div class="title" style="font-size:26px;">Edit Event</div>
            <p class="p-muted" style="margin-top:6px;">Update date, time, capacity, venue, brochure etc.</p>
          </div>
        </div>

        <div class="section-card">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div>
              <label class="p-muted">Title</label>
              <input id="f_title" class="res-input" style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);" />
            </div>
            <div>
              <label class="p-muted">Venue</label>
              <input id="f_venue" class="res-input" style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);" />
            </div>

            <div>
              <label class="p-muted">Date</label>
              <input id="f_date" type="date" style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);" />
            </div>
            <div>
              <label class="p-muted">Time</label>
              <input id="f_time" type="time" style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);" />
            </div>

            <div>
              <label class="p-muted">Capacity</label>
              <input id="f_capacity" type="number" min="0" style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);" />
            </div>
            <div>
              <label class="p-muted">Fee</label>
              <input id="f_fee" type="number" min="0" style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);" />
            </div>
          </div>

          <div class="hr"></div>

          <label class="p-muted">Description</label>
          <textarea id="f_desc" rows="5" style="width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);resize:vertical;"></textarea>

          <div class="hr"></div>

          <label class="p-muted">Brochure / Poster upload (demo)</label>
          <input type="file" id="f_brochure" style="width:100%;padding:10px;" />
          <small class="p-muted">Note: Real file upload needs backend. Here we only store the file name.</small>

          <div class="hr"></div>

          <button id="cancelEdit" class="btn btn-outline" type="button">
            <i class="fa fa-times"></i> Cancel
          </button>
        </div>
      </div>
    `;

    // Prefill fields
    document.getElementById("f_title").value = eData.title || "";
    document.getElementById("f_venue").value = eData.venue || "";
    document.getElementById("f_date").value = (eData.date || "").slice(0, 10);
    document.getElementById("f_time").value = eData.time || "";
    document.getElementById("f_capacity").value = eData.capacity ?? 0;
    document.getElementById("f_fee").value = eData.registration_fee ?? 0;
    document.getElementById("f_desc").value = eData.description || "";

    // Cancel -> back to view
    document.getElementById("cancelEdit")?.addEventListener("click", () => {
      window.location.href = `org.html?id=${encodeURIComponent(id)}`;
    });

    // Optional: store brochure file name (demo)
    document.getElementById("f_brochure")?.addEventListener("change", (ev) => {
      const f = ev.target.files?.[0];
      if (!f) return;
      const list = getAllEvents();
      const idx = list.findIndex((x) => String(x.id) === String(id));
      if (idx !== -1) {
        list[idx] = { ...list[idx], brochure: f.name };
        saveAllEvents(list);
      }
    });
  }

  // Decide mode
  if (mode === "edit") renderEdit();
  else renderView();
});
//org.js
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Invalid Date';
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function capitalize(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

function getEventById(id){
  // ✅ we expect main page to save events here
  const raw = localStorage.getItem("evexa_events");
  if(!raw) return null;
  const list = JSON.parse(raw);
  return list.find(e => Number(e.id) === Number(id)) || null;

}

const params = new URLSearchParams(location.search);
const id = Number(params.get("id"));
console.log("URL ID:", id);
console.log("Stored events:", JSON.parse(localStorage.getItem("evexa_events")));
const e = getEventById(id);
document.getElementById("editTopBtn")?.addEventListener("click", () => {
  window.location.href = `org.html?id=${id}`; // change org.html if your edit page name is different
});

document.getElementById("topShareBtn")?.addEventListener("click", async () => {
  const url = window.location.href;

  try {
    await navigator.share?.({ title: e?.name || "EVEXA Event", url });
  } catch {
    await navigator.clipboard.writeText(url);
    alert("Link copied!");
  }
});


const container = document.getElementById("detailContainer");

if(!e){
  container.innerHTML = `<div style="padding:18px"><b>Event not found.</b><p class="p-muted">Go back and try again.</p></div>`;
} else {
  const posterBg = {
    Workshop: "#6c63ff",
    Seminar: "#ff6584",
    Hackathon: "#43d9a2",
    Cultural: "#f4a261",
    Sports: "#ffd166",
  };
  const bg = posterBg[e.type] || "#6c63ff";

  // ✅ These MUST be normal JS (NOT inside the HTML string)
  const bannerImg = e.poster ? `http://localhost:5000/uploads/${e.poster}` : null;

  const seatsLeft = Math.max((Number(e.capacity) || 0) - (Number(e.registered) || 0), 0);
  const pct = (Number(e.capacity) > 0)
    ? Math.min(100, Math.round((Number(e.registered || 0) / Number(e.capacity)) * 100))
    : 0;

  // ✅ Only HTML inside template string
  container.innerHTML = `
    <!-- ===== HERO BANNER ===== -->
    <div class="hero">
      <div class="hero-banner">
        ${
          bannerImg
            ? `<img src="${bannerImg}" alt="${e.title}" />`
            : `<div style="height:100%;width:100%;background:linear-gradient(135deg,${bg},#ff6584);"></div>`
        }
      </div>
    </div>

    <!-- ===== BELOW BANNER: 2 COLUMN PAGE ===== -->
    <div class="page">

      <!-- LEFT: MAIN CONTENT -->
      <div class="main-card">
        <div class="head-row">
          <div>
            <div class="title">${e.title}</div>

            <div class="badges">
              <span class="badge primary">${e.type}</span>
              <span class="badge soft">${e.club || "No Club"}</span>
              <span class="badge">${capitalize(e.status)}</span>
              <span class="badge">${e.registration_fee > 0 ? "₹" + e.registration_fee : "Free"}</span>
            </div>

            <div class="meta">
              <span><i class="fa fa-calendar"></i>${formatDate(e.date)}</span>
              <span><i class="fa fa-clock"></i>${formatTime(e.time)}</span>
              <span><i class="fa fa-map-marker-alt"></i>${e.venue}</span>
              <span><i class="fa fa-users"></i>${e.registered ?? 0}/${e.capacity}</span>
            </div>
          </div>

          <span class="status-pill">${capitalize(e.status || "Open")}</span>
        </div>

        <!-- TABS -->
        <div class="tabs">
          <button class="tab active" data-tab="info">Description</button>
         
          <button class="tab" data-tab="qr">QR / Attendance</button>
          <button class="tab" data-tab="res">Resources</button>
        </div>

        <!-- TAB CONTENTS -->
        <div class="tab-content active" id="tab-info">
          <div class="section-card">
            <p class="p-muted">${e.description || "No description added."}</p>
          </div>
        </div>

        <div class="tab-content" id="tab-regs style="display:none;">
          <div class="section-card">
            <div class="grid-2">
              <div class="kpi">
                <div class="kicon"><i class="fa fa-users"></i></div>
                <div><b>${e.registered ?? 0}</b><small>Registered</small></div>
              </div>
              <div class="kpi">
                <div class="kicon"><i class="fa fa-chair"></i></div>
                <div><b>${e.capacity ?? 0}</b><small>Capacity</small></div>
              </div>
            </div>
            <div class="hr"></div>
            <p class="p-muted">Later you can load real participants from database and show them as a table here.</p>
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

      <!-- RIGHT: REGISTRATION SIDEBAR -->
      <aside class="side-card">
        <b style="font-size:16px;">Registration</b>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
          <span class="p-muted">${seatsLeft} seats left</span>
          <span class="p-muted">${e.registered ?? 0} / ${e.capacity ?? 0}</span>
        </div>

        <div class="progress">
  <div style="width:${pct}%"></div>
</div>

<!-- ✅ Registrations content moved to RIGHT -->
<div class="section-card" style="margin-top:14px;">
  <div class="grid-2">
    <div class="kpi">
      <div class="kicon"><i class="fa fa-users"></i></div>
      <div><b>${e.registered ?? 0}</b><small>Registered</small></div>
    </div>
    <div class="kpi">
      <div class="kicon"><i class="fa fa-chair"></i></div>
      <div><b>${e.capacity ?? 0}</b><small>Capacity</small></div>
    </div>
  </div>

  <div class="hr"></div>
  <p class="p-muted">Later you can load real participants from database and show them as a table here.</p>
</div>

</aside>

    </div>
  `;

  // Optional register action

  // ✅ Keep your resources + tabs code BELOW this exactly as it is
  // ✅ 2) NOW bind buttons AFTER HTML is inserted
  document.getElementById("editTopBtn")?.addEventListener("click", () => {
    window.location.href = `org.html?id=${id}`; // change org.html to your edit page
  });

  document.getElementById("topShareBtn")?.addEventListener("click", async () => {
    const url = window.location.href;
    try {
      await navigator.share?.({ title: e.title, url });
    } catch {
      navigator.clipboard?.writeText(url);
      alert("Link copied!");
    }
  });
  // ===================== RESOURCES (localStorage demo) =====================
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
          <button class="btn btn-outline btn-sm" data-dl="${idx}">
            <i class="fa fa-download"></i>
          </button>
          <button class="btn btn-danger btn-sm" data-del="${idx}">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      </div>
    `
    )
    .join("");

  // delete
  filesListEl.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.del);
      const current = JSON.parse(localStorage.getItem(storageKey) || "[]");
      current.splice(i, 1);
      localStorage.setItem(storageKey, JSON.stringify(current));
      renderFiles(current);
    });
  });

  // download (demo)
  filesListEl.querySelectorAll("[data-dl]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.dl);
      const current = JSON.parse(localStorage.getItem(storageKey) || "[]");
      alert(`Download: ${current[i].name}\n\n(For real download, connect backend storage)`);
    });
  });
}

function loadFiles() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  renderFiles(saved);
  return saved;
}

let currentFiles = loadFiles();

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


  // ✅ 3) Tabs
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
}
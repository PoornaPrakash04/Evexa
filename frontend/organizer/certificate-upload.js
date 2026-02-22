// certificate-upload.js
const API_BASE = "http://localhost:5000/api";

const $ = (q) => document.querySelector(q);

// --- UI State ---
function setLoading(loading) {
  const btn = $("#generateBtn");
  const spinner = $("#spinner");
  if (btn) btn.disabled = loading;
  if (btn) btn.textContent = loading ? "Generating..." : "Generate Certificates";
  if (spinner) spinner.style.display = loading ? "block" : "none";
}

function showStatus(message, type = "success") {
  const el = $("#statusMsg");
  if (!el) return;
  el.textContent = message;
  el.className = `status-msg ${type}`;
  el.style.display = "block";
  if (type === "success") setTimeout(() => el.style.display = "none", 5000);
}

// --- File input previews ---
$("#templateInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) $("#templateLabel").textContent = `📄 ${file.name}`;
});

$("#excelInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    $("#excelLabel").textContent = `📊 ${file.name}`;
    previewExcel(file); // show names preview
  }
});

// --- Preview names from Excel before generating ---
async function previewExcel(file) {
  try {
    // Dynamically load SheetJS from CDN if not already loaded
    if (!window.XLSX) {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    }

    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const preview = $("#excelPreview");
    if (!preview) return;

    if (!rows.length) {
      preview.innerHTML = `<div class="preview-empty">No data found in Excel file.</div>`;
      return;
    }

    preview.innerHTML = `
      <div class="preview-header">
        Found <strong>${rows.length}</strong> participant(s) — 
        showing first 5:
      </div>
      <div class="preview-list">
        ${rows.slice(0, 5).map((r, i) => `
          <div class="preview-item">
            <span class="preview-num">${i + 1}</span>
            <span>${r.Name || r.name || Object.values(r)[0] || "—"}</span>
          </div>`).join("")}
        ${rows.length > 5 ? `<div class="preview-more">+${rows.length - 5} more...</div>` : ""}
      </div>`;
    preview.style.display = "block";
  } catch (err) {
    console.error("Excel preview failed:", err);
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// --- Main generate function ---
async function generateCertificates() {
  const templateFile = $("#templateInput")?.files[0];
  const excelFile = $("#excelInput")?.files[0];

  if (!templateFile) return showStatus("Please upload a PDF template.", "error");
  if (!excelFile)    return showStatus("Please upload an Excel file.", "error");

  // Validate file types
  if (!templateFile.name.endsWith(".pdf")) return showStatus("Template must be a PDF file.", "error");
  if (!excelFile.name.match(/\.(xlsx|xls)$/)) return showStatus("Participant list must be an Excel file.", "error");

  setLoading(true);
  showStatus("Generating certificates, please wait...", "info");

  const token = localStorage.getItem("authToken");
  const formData = new FormData();
  formData.append("template", templateFile);
  formData.append("excel", excelFile);

  try {
    const res = await fetch(`${API_BASE}/certificates/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
      // No Content-Type header — browser sets it with boundary for FormData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error: ${res.status}`);
    }

    // Response is a ZIP file download
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificates_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showStatus("✅ Certificates generated and downloaded successfully!", "success");
    resetForm();

  } catch (err) {
    console.error("Generate error:", err);
    showStatus(`❌ ${err.message || "Generation failed. Please try again."}`, "error");
  } finally {
    setLoading(false);
  }
}

function resetForm() {
  $("#templateInput").value = "";
  $("#excelInput").value = "";
  $("#templateLabel").textContent = "Click to upload PDF template";
  $("#excelLabel").textContent = "Click to upload Excel file";
  const preview = $("#excelPreview");
  if (preview) preview.style.display = "none";
}

// --- Attach button ---
$("#generateBtn")?.addEventListener("click", generateCertificates);
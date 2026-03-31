function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  updateThemeBtn();
}

function updateThemeBtn() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const isLight = document.body.classList.contains("light");
  btn.textContent = isLight ? "☀️" : "🌙";
  btn.title = isLight ? "Switch to Dark Mode" : "Switch to Light Mode";
}

// Apply saved theme immediately — runs before page renders to avoid flash
(function () {
  const theme = localStorage.getItem("theme") || "dark";
  if (theme === "light") document.body.classList.add("light");
  document.addEventListener("DOMContentLoaded", updateThemeBtn);
})();
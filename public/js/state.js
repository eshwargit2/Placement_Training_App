// ==========================================================================
// VMKVEC CSE Placement Training - State Management & Auth Utilities
// ==========================================================================

let state = JSON.parse(localStorage.getItem("placementPortal") || "null") || {
  role: null,
  user: null,
  deletedStudentIds: [],
  students: [
    { id: 1, name: "Demo Student", reg: "REG001", batch: "BATCH-A", username: "student001", password: "student123" }
  ],
  submissions: [],
  attempts: []
};

function save() {
  localStorage.setItem("placementPortal", JSON.stringify(state));
}

function normalizeStudents() {
  const old = Array.isArray(state.students) ? state.students : [];
  const byUser = {};
  old.forEach(s => { if (s && s.username) byUser[s.username] = s; });
  const deleted = new Set(Array.isArray(state.deletedStudentIds) ? state.deletedStudentIds.map(Number) : []);
  const arr = [];
  for (let i = 1; i <= 100; i++) {
    if (deleted.has(i)) continue;
    const u = "student" + String(i).padStart(3, "0");
    const oldS = byUser[u] || {};
    arr.push({
      id: i,
      name: oldS.name || "",
      department: oldS.department || "",
      year: oldS.year || "",
      rollNumber: oldS.rollNumber || "",
      reg: oldS.reg || "",
      batch: oldS.batch || "",
      username: u,
      password: (oldS.password && oldS.password !== "student123" ? oldS.password : u),
      profileCompleted: !!oldS.profileCompleted
    });
  }
  state.students = arr;
  state.deletedStudentIds = [...deleted].filter(n => n >= 1 && n <= 100).sort((a, b) => a - b);
  state.attempts = Array.isArray(state.attempts) ? state.attempts : [];
  state.submissions = Array.isArray(state.submissions) ? state.submissions : [];
  save();
}

normalizeStudents();

// ==========================================================================
// THEME MANAGEMENT (LIGHT / DARK)
// ==========================================================================
function getTheme() {
  return localStorage.getItem("appTheme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
  if (document.body) {
    if (t === "dark") {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }
  }
  try {
    localStorage.setItem("appTheme", t);
  } catch(e) {}
  updateThemeToggleButtons(t);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || getTheme();
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
}

function updateThemeToggleButtons(theme) {
  const isDark = theme === "dark";
  document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
    btn.innerHTML = `
      <span class="theme-toggle-icon">
        ${isDark ? 
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' : 
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
        }
      </span>
      <span class="theme-toggle-label">${isDark ? "Light" : "Dark"}</span>
    `;
    btn.setAttribute("title", isDark ? "Switch to Light Mode" : "Switch to Dark Mode");
  });
}

// Immediate theme execution
(function() {
  const t = getTheme();
  document.documentElement.setAttribute("data-theme", t);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyTheme(t));
  } else {
    applyTheme(t);
  }
})();

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function renderHeader(activePage) {
  const headerEl = document.getElementById("mainHeader");
  if (!headerEl) return;

  const user = state.user;
  const role = state.role;
  const currentTheme = document.documentElement.getAttribute("data-theme") || getTheme();
  const isDark = currentTheme === "dark";

  const themeToggleHtml = `
    <button type="button" class="theme-toggle-btn" onclick="toggleTheme()" title="${isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}">
      <span class="theme-toggle-icon">
        ${isDark ? 
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>' : 
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
        }
      </span>
      <span class="theme-toggle-label">${isDark ? "Light" : "Dark"}</span>
    </button>
  `;

  let actionsHtml = "";
  if (user && role) {
    const dashHref = role === "trainer" ? "admin.html" : "dashboard.html";
    const showDashboardBtn = activePage !== "dashboard" && activePage !== "admin" && activePage !== "trainer" && activePage !== "profile";
    const adminBtn = role === "trainer" ? `<a href="admin.html" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.3);font-weight:600;">Admin Panel</a>` : "";
    const showUserLabel = activePage !== "dashboard";
    const userLabelHtml = showUserLabel ? `<span>${esc(user.name || user.username)} ${role ? `· ${role}` : ""}</span>` : "";
    actionsHtml = `
      ${userLabelHtml}
      <a href="index.html" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;">Home</a>
      ${showDashboardBtn ? `<a href="${dashHref}" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;">Dashboard</a>` : ""}
      ${adminBtn}
      ${themeToggleHtml}
      <button class="ghost" style="padding:6px 12px;font-size:12px" onclick="logout()">Logout</button>
    `;
  } else {
    actionsHtml = `
      <a href="index.html" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;">Home</a>
      ${themeToggleHtml}
      <a href="login.html" style="padding:6px 14px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;" class="hero-nav-btn">Portal Login</a>
    `;
  }

  headerEl.innerHTML = `
    <div class="top">
      <a href="index.html" style="color:#fff;text-decoration:none;display:flex;align-items:center;gap:10px;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
        <b>VMKVEC Placement Training · CSE</b>
      </a>
      <div class="actions">
        ${actionsHtml}
      </div>
    </div>
  `;
}

function requireAuth(allowedRole) {
  if (!state.user || !state.role) {
    window.location.href = "login.html";
    return false;
  }
  if (allowedRole && state.role !== allowedRole) {
    alert("Unauthorized access. Redirecting...");
    window.location.href = state.role === "trainer" ? "admin.html" : "dashboard.html";
    return false;
  }
  if (state.role === "student" && !state.user.profileCompleted && !window.location.pathname.includes("profile.html")) {
    window.location.href = "profile.html";
    return false;
  }
  return true;
}

function logout() {
  state.role = null;
  state.user = null;
  save();
  window.location.href = "index.html";
}

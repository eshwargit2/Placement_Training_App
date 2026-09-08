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
  } catch (e) { }
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
(function () {
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
    const isAdmin = role === "admin" || role === "trainer";
    const dashHref = isAdmin ? "admin.html" : "dashboard.html";
    const dashLabel = isAdmin ? "Admin Panel" : "Dashboard";
    const showDashboardBtn = activePage !== "dashboard" && activePage !== "admin" && activePage !== "profile";
    const showUserLabel = activePage !== "dashboard";
    const displayRole = isAdmin ? "Admin" : role;
    const userLabelHtml = showUserLabel ? `<span>${esc(user.name || user.username)} · ${displayRole}</span>` : "";
    actionsHtml = `
      ${userLabelHtml}
      <a href="index.html" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;">Home</a>
      ${showDashboardBtn ? `<a href="${dashHref}" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;background:${isAdmin ? 'rgba(99,102,241,0.15)' : 'transparent'};color:${isAdmin ? '#818cf8' : 'inherit'};border:1px solid ${isAdmin ? 'rgba(99,102,241,0.3)' : 'var(--line)'};font-weight:${isAdmin ? '700' : '500'};">${dashLabel}</a>` : ""}
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
  const isAdmin = state.role === "admin" || state.role === "trainer";
  if (allowedRole) {
    const isAllowed = (allowedRole === "admin" || allowedRole === "trainer") ? isAdmin : (state.role === allowedRole);
    if (!isAllowed) {
      alert("Unauthorized access. Redirecting...");
      window.location.href = isAdmin ? "admin.html" : "dashboard.html";
      return false;
    }
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

function parseStudentNumericId(u) {
  if (u === null || u === undefined) return null;
  const str = String(u).trim();
  const match = str.match(/^student(\d+)$/i);
  if (match) return parseInt(match[1], 10);
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  return str;
}

function getStudentCandidateKeys(rawId) {
  const keys = new Set();
  if (rawId === null || rawId === undefined) return [];
  const s = String(rawId).trim().toLowerCase();
  if (s) keys.add(s);
  const num = parseStudentNumericId(rawId);
  if (typeof num === 'number' && !isNaN(num)) {
    keys.add(String(num));
    keys.add(`student${String(num).padStart(3, '0')}`);
    keys.add(`student${num}`);
  }
  return Array.from(keys);
}

window.parseStudentNumericId = parseStudentNumericId;
window.getStudentCandidateKeys = getStudentCandidateKeys;

const PROD_BACKEND_API = "https://placement-server-iota.vercel.app";

function getApiBase() {
  if (window.API_BASE) return window.API_BASE.replace(/\/+$/, '');
  const custom = localStorage.getItem('CUSTOM_API_BASE');
  if (custom) return custom.replace(/\/+$/, '');
  
  // Default to the live Vercel backend API URL
  return PROD_BACKEND_API;
}

window.getApiBase = getApiBase;
window.PROD_BACKEND_API = PROD_BACKEND_API;

async function safeFetchJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    if (text.trim().startsWith('<') || (res.headers && res.headers.get('content-type')?.includes('text/html'))) {
      const statusInfo = `${res.status} ${res.statusText || ''}`.trim();
      throw new Error(`Server returned HTML (${statusInfo}) instead of JSON.\n\nBackend API is: ${getApiBase()}`);
    }
    throw new Error(text || `Server error (${res.status})`);
  }
}

window.safeFetchJson = safeFetchJson;

async function serverLogin(username, password, role) {
  const u = String(username || '').trim();
  const p = String(password || '').trim();
  const r = String(role || 'student').toLowerCase();
  const apiBase = getApiBase();

  try {
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p, role: r })
    });

    const data = await safeFetchJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Server validation failed. Invalid username or password.');
    }

    state.role = data.role;
    state.user = data.user;
    if (data.role === 'student' && data.user) {
      let sIdx = state.students.findIndex(s => s.username === data.user.username || s.id === data.user.id);
      if (sIdx >= 0) {
        state.students[sIdx] = Object.assign(state.students[sIdx], data.user);
      } else {
        state.students.push(data.user);
      }
    }
    save();
    return data;
  } catch (err) {
    console.error('Server login validation error:', err);
    if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('net::ERR_CONNECTION_REFUSED'))) {
      throw new Error(`Cannot connect to Backend Server at ${apiBase}.\nPlease ensure the backend service is reachable.`);
    }
    throw err;
  }
}

async function deleteStudentAccountOnline(studentId) {
  const sId = String(studentId || '').trim().toLowerCase();
  const apiBase = getApiBase();

  try {
    const res = await fetch(`${apiBase}/api/admin/student/${encodeURIComponent(sId)}`, {
      method: 'DELETE'
    });
    const data = await safeFetchJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to delete student account from server.');
    }
  } catch (err) {
    console.warn('Server account delete notice:', err.message);
  }

  // Remove from local memory state
  state.students = state.students.filter(s => s.username !== sId && String(s.id) !== sId);
  state.attempts = state.attempts.filter(a => String(a.studentId).toLowerCase() !== sId && String(a.username).toLowerCase() !== sId);
  save();
  return true;
}

async function saveStudentProfileOnline(profileData) {
  const apiBase = getApiBase();
  const payload = Object.assign({}, state.user || {}, profileData);

  try {
    const res = await fetch(`${apiBase}/api/student/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await safeFetchJson(res);
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save student profile in database.');
    }
    state.user = Object.assign(state.user || {}, data.user);
  } catch (err) {
    console.warn('Failed to save to remote server, updating locally:', err.message);
    state.user = Object.assign(state.user || {}, payload, { profileCompleted: true });
  }

  let s = state.students.find(x => x.username === state.user.username || x.id === state.user.id);
  if (!s) {
    s = state.user;
    state.students.push(s);
  } else {
    Object.assign(s, state.user);
  }
  save();
  return state.user;
}

async function fetchStudentDashboardOnline(studentIdOrUsername) {
  const sId = studentIdOrUsername || (state.user ? (state.user.username || state.user.id) : null);
  if (!sId) return null;

  const apiBase = getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/student/${encodeURIComponent(sId)}/dashboard`);
    if (!res.ok) return null;
    const data = await safeFetchJson(res);
    if (data.success) {
      if (data.student) {
        state.user = Object.assign(state.user || {}, data.student);
        let sIdx = state.students.findIndex(s => s.username === data.student.username || s.id === data.student.id);
        if (sIdx >= 0) state.students[sIdx] = Object.assign(state.students[sIdx], data.student);
      }
      if (Array.isArray(data.attempts)) {
        const userNum = (typeof parseStudentNumericId === 'function') ? parseStudentNumericId(sId) : null;
        const candidateKeys = (typeof getStudentCandidateKeys === 'function') ? getStudentCandidateKeys(sId) : [String(sId).toLowerCase()];

        // Remove old cached records for this student
        const otherAttempts = (state.attempts || []).filter(a => {
          const aNum = (typeof parseStudentNumericId === 'function') ? parseStudentNumericId(a.studentId || a.username) : null;
          if (typeof userNum === 'number' && typeof aNum === 'number' && userNum === aNum) return false;
          const aSId = String(a.studentId || '').toLowerCase();
          const aUName = String(a.username || '').toLowerCase();
          return !candidateKeys.includes(aSId) && !candidateKeys.includes(aUName);
        });

        const liveAttempts = data.attempts.map(a => Object.assign({}, a, { synced: true }));
        state.attempts = [...otherAttempts, ...liveAttempts];
      }
      save();
      return data;
    }
  } catch (err) {
    console.warn('Dashboard fetch notice:', err.message);
  }
  return null;
}

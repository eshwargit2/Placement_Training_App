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

  let actionsHtml = "";
  if (user && role) {
    const dashHref = role === "trainer" ? "trainer.html" : "dashboard.html";
    const showDashboardBtn = activePage !== "dashboard" && activePage !== "trainer";
    actionsHtml = `
      <span>${esc(user.name || user.username)} ${role ? `· ${role}` : ""}</span>
      <a href="index.html" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;">Home</a>
      ${showDashboardBtn ? `<a href="${dashHref}" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;">Dashboard</a>` : ""}
      <button class="ghost" style="padding:6px 12px;font-size:12px" onclick="logout()">Logout</button>
    `;
  } else {
    actionsHtml = `
      <a href="index.html" class="ghost" style="padding:6px 12px;font-size:12px;text-decoration:none;border-radius:10px;display:inline-flex;align-items:center;">Home</a>
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
    window.location.href = state.role === "trainer" ? "trainer.html" : "dashboard.html";
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

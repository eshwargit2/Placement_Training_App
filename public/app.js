// ==========================================================================
// VMKVEC CSE Placement Training - Legacy Router Bridge
// ==========================================================================

(function() {
  const stateData = JSON.parse(localStorage.getItem("placementPortal") || "null");
  if (!stateData || !stateData.user || !stateData.role) {
    if (window.location.pathname.endsWith("/app.js") || window.location.pathname.endsWith("/")) {
      window.location.href = "index.html";
    }
  } else if (stateData.role === "trainer") {
    window.location.href = "trainer.html";
  } else if (stateData.role === "student") {
    if (!stateData.user.profileCompleted) {
      window.location.href = "profile.html";
    } else {
      window.location.href = "dashboard.html";
    }
  } else {
    window.location.href = "index.html";
  }
})();

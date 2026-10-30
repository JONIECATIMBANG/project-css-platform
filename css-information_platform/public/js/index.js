// If someone is already logged in, send them to their dashboard.
(() => {
  const homes = { student: "Student/stud_dashboard.html", officer: "Officer/Officer_Dashboard.html", admin: "Officer/Admin/Admin_Dashboard.html" };
  try {
    const st = localStorage.getItem("css.token") ? localStorage : sessionStorage;
    const u = JSON.parse(st.getItem("css.user") || "null");
    if (u && st.getItem("css.token") && homes[u.role]) location.replace(homes[u.role]);
  } catch (_) {}
})();

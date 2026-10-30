(() => {
  const HOMES = {
    student: "Student/stud_dashboard.html",
    officer: "Officer/Officer_Dashboard.html",
    admin: "Admin/Admin_Dashboard.html" };
  const role = new URLSearchParams(location.search).get("role");
  if (!HOMES[role]) { location.replace("index.html"); return; }
  document.getElementById("forgotLink").href = "forgot-password.html?role=" + role;
  document.title = role[0].toUpperCase() + role.slice(1) + " log in – CSS PLATFORM";

  const agree = document.getElementById("agreePolicy"), cont = document.getElementById("continueBtn");
  agree.addEventListener("change", () => { cont.disabled = !agree.checked; });
  cont.addEventListener("click", () => {
    document.getElementById("policyPage").hidden = true;
    document.getElementById("loginPage").hidden = false;
    document.getElementById("roleTitle").textContent = "WELCOME BACK " + role.toUpperCase();
    document.querySelector("#loginForm input").focus();
  });

  const form = document.getElementById("loginForm");
  const uIn = form.elements.uconnect, pIn = form.elements.password;
  form.addEventListener("input", (e) => e.target.removeAttribute("aria-invalid")); // red border goes away when they type

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("err"), btn = document.getElementById("loginBtn");
    err.textContent = "";
    [uIn, pIn].forEach((i) => i.removeAttribute("aria-invalid"));

    // 1) empty fields: warn and stop (nothing is sent to the server)
    const hasU = uIn.value.trim() !== "", hasP = pIn.value !== "";
    if (!hasU || !hasP) {
      err.textContent = !hasU && !hasP ? "Please fill in your username and password."
        : !hasU ? "Please enter your username." : "Please enter your password.";
      if (!hasU) uIn.setAttribute("aria-invalid", "true");
      if (!hasP) pIn.setAttribute("aria-invalid", "true");
      (!hasU ? uIn : pIn).focus();
      return;
    }

    btn.disabled = true;
    try {
      const remember = document.getElementById("remember")?.checked === true; // works even if you have no "Remember me" box
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uconnect: uIn.value, password: pIn.value, role, remember }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not log in.");
      // "Remember me" keeps the login after the browser is closed; otherwise it ends when the tab is closed
      const keep = remember ? localStorage : sessionStorage, drop = remember ? sessionStorage : localStorage;
      drop.removeItem("css.token"); drop.removeItem("css.user");
      keep.setItem("css.token", j.token);
      keep.setItem("css.user", JSON.stringify(j.user));
      location.href = HOMES[j.user.role];
    } catch (ex) {
      // 2) the server says "Incorrect username." or "Incorrect password." — show it and mark that field
      err.textContent = ex.message; btn.disabled = false;
      if (/username/i.test(ex.message)) { uIn.setAttribute("aria-invalid", "true"); uIn.focus(); }
      else if (/password/i.test(ex.message)) { pIn.setAttribute("aria-invalid", "true"); pIn.focus(); pIn.select(); }
    }
  });
})();

document.querySelectorAll(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.closest(".pw-wrap").querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.classList.toggle("showing", show);
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
});
(() => {
  const role = new URLSearchParams(location.search).get("role"), back = ["student", "officer", "admin"].includes(role) ? "login.html?role=" + role : "index.html";
  document.getElementById("backLink").href = back; document.getElementById("backLink2").href = back;
  document.getElementById("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = document.getElementById("err"), btn = document.getElementById("sendBtn"), f = Object.fromEntries(new FormData(e.target));
    err.textContent = "";
    if (!String(f.uconnect).trim() || !String(f.email).trim()) { err.textContent = "Enter your U-connect and your email."; return; }
    btn.disabled = true;
    try {
      const r = await fetch("/api/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not send the request.");
      document.getElementById("askWrap").hidden = true; document.getElementById("sent").hidden = false;
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
})();

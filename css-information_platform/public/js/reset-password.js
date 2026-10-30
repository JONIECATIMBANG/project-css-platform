(() => {
  const form = document.getElementById("resetForm");
  const err = document.getElementById("err");
  form.addEventListener("submit", async (e) => {
    e.preventDefault(); err.textContent = "";
    const f = Object.fromEntries(new FormData(form));
    if (!f.password || f.password.length < 8) { err.textContent = "Password must be at least 8 characters."; return; }
    if (f.password !== f.confirm) { err.textContent = "Passwords do not match."; return; }
    const token = new URLSearchParams(location.search).get("token");
    try {
      const r = await fetch("/api/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: f.password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not reset your password.");
      form.hidden = true; document.getElementById("done").hidden = false;
    } catch (ex) { err.textContent = ex.message; }
  });
})();

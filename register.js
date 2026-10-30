(() => {
  const form = document.getElementById("regForm");
  const err = document.getElementById("err");
  const terms = document.getElementById("terms");
  const modal = document.getElementById("termsModal");

  const mark = (el, bad) => el && el.classList.toggle("invalid", bad);

  // Clear red as soon as the user edits a field
  form.addEventListener("input", (e) => e.target.classList.remove("invalid"));
  form.addEventListener("change", (e) => e.target.classList.remove("invalid"));
  terms.addEventListener("change", () => terms.closest(".chk").classList.remove("invalid"));

  // Terms modal
  document.getElementById("openTerms").addEventListener("click", (e) => { e.preventDefault(); modal.hidden = false; });
  document.getElementById("closeTerms").addEventListener("click", () => { modal.hidden = true; });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

  // Show/hide password
  document.querySelectorAll(".pw-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.closest(".pw-wrap").querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.classList.toggle("showing", show);
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    err.textContent = "";
    form.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    terms.closest(".chk").classList.remove("invalid");

    let missing = false;
    for (const k of ["name", "uconnect", "email", "program"]) {
      const empty = !String(f[k] || "").trim();
      mark(form.elements[k], empty);
      if (empty) missing = true;
    }
    if (missing) { err.textContent = "Please fill in all required fields."; return; }

    if (f.password.length < 8) {
      mark(form.elements.password, true);
      err.textContent = "Password must be at least 8 characters.";
      return;
    }
    if (f.password !== f.confirm) {
      mark(form.elements.password, true);
      mark(form.elements.confirm, true);
      err.textContent = "Passwords do not match.";
      return;
    }
    if (!terms.checked) {
      terms.closest(".chk").classList.add("invalid");
      err.textContent = "You must agree to the Terms and Conditions.";
      return;
    }

    delete f.terms; f.acceptTerms = true; // the server saves that the Terms and Conditions were accepted

    try {
      const r = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not register.");
      document.getElementById("formWrap").hidden = true;
      document.getElementById("done").hidden = false;
    } catch (ex) { err.textContent = ex.message; }
  });
})();

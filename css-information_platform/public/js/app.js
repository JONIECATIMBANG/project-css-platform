/* CSS Platform – dashboard app used by the Student, Officer and Admin pages.
   The page only decides the role (body data-role); the server enforces what each role may do. */
(() => {
  "use strict";
  const ROLE = document.body.dataset.role;
  const HOMES = { student: "/Student/stud_dashboard.html", officer: "/Officer/Officer_Dashboard.html", admin: "/Officer/Admin/Admin_Dashboard.html" };
  const store = localStorage.getItem("css.token") ? localStorage : sessionStorage; // where this login was saved ("Remember me" uses localStorage)
  let token = store.getItem("css.token");
  if (!token) { location.replace("/index.html"); return; }

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "No date set");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const PROGRAMS = { Rob: "BSCS - Robotics", GD: "BSCS - Game Development" }; // codes saved by the register form
  const progName = (p) => PROGRAMS[p] || p || "";
  const progSelect = (v) => `<select name="program"><option value="">Select program</option>${Object.entries(PROGRAMS).map(([k, n]) => `<option value="${k}" ${k === v ? "selected" : ""}>${n}</option>`).join("")}${v && !PROGRAMS[v] ? `<option value="${esc(v)}" selected>${esc(v)}</option>` : ""}</select>`;
  const fmtTime = (t) => (t ? new Date("1970-01-01T" + t + ":00").toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "");
  const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const avatar = (u, size = "") => u.photo ? `<img class="av ${size}" src="${esc(u.photo)}" alt="Photo of ${esc(u.name)}">` : `<span class="av init ${size}" aria-hidden="true">${esc(initials(u.name))}</span>`;
  // crop window: the person drags the picture into place and zooms; the result is a square JPEG (S x S).
  // Resolves with the data URL, or null if they cancel.
  function cropPhoto(file, S = 240, alpha = false) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error("Choose a JPG, PNG or WEBP picture."));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Could not read that file."));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => reject(new Error("Could not read that picture."));
        im.onload = () => {
          const d = document.createElement("dialog"); d.className = "dlg cropdlg";
          d.innerHTML = `<div class="crop"><h2>Crop picture</h2><p class="note">Drag to move the picture. Use the slider (or pinch) to zoom. The circle is what people will see.</p>
            <div class="cropbox"><canvas tabindex="0" aria-label="Picture to crop. Use arrow keys to move."></canvas><div class="ring"></div></div>
            <label>Zoom<input type="range" min="1" max="4" step="0.01" value="1"></label>
            <div class="acts end"><button type="button" class="btn light" data-x>Cancel</button><button type="button" class="btn" data-ok>Use this picture</button></div></div>`;
          document.body.append(d); d.showModal();
          const cv = $("canvas", d), box = $(".cropbox", d), zoom = $("input", d), ctx = cv.getContext("2d");
          const V = Math.round(box.getBoundingClientRect().width) || 280, dpr = Math.min(2, window.devicePixelRatio || 1);
          cv.width = cv.height = V * dpr;
          const base = V / Math.min(im.width, im.height);
          let z = 1, cx = im.width / 2, cy = im.height / 2, done = false;
          const clamp = () => { const sc = base * z, hx = V / (2 * sc); cx = Math.min(Math.max(cx, hx), im.width - hx); cy = Math.min(Math.max(cy, hx), im.height - hx); };
          const draw = () => { clamp(); const sc = base * z * dpr; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(im, cv.width / 2 - cx * sc, cv.height / 2 - cy * sc, im.width * sc, im.height * sc); };
          const setZ = (v) => { z = Math.min(4, Math.max(1, v)); zoom.value = z; draw(); };
          zoom.oninput = () => setZ(Number(zoom.value));
          cv.addEventListener("wheel", (e) => { e.preventDefault(); setZ(z - e.deltaY * 0.002); }, { passive: false });
          const pts = new Map(); let pinch = null;
          cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z }; } });
          cv.addEventListener("pointermove", (e) => {
            if (!pts.has(e.pointerId)) return;
            const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
            if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; setZ(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d); }
            else if (pts.size === 1) { const sc = base * z; cx -= (e.clientX - prev[0]) / sc; cy -= (e.clientY - prev[1]) / sc; draw(); }
          });
          const up = (e) => { pts.delete(e.pointerId); pinch = null; };
          cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
          cv.addEventListener("keydown", (e) => { const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!m) return; e.preventDefault(); cx += m[0] * 12 / (base * z); cy += m[1] * 12 / (base * z); draw(); });
          const finish = (v) => { if (done) return; done = true; resolve(v); };
          $("[data-ok]", d).onclick = () => {
            const out = document.createElement("canvas"), side = V / (base * z); out.width = out.height = S;
            const oc = out.getContext("2d"); if (!alpha) { oc.fillStyle = "#fff"; oc.fillRect(0, 0, S, S); } oc.drawImage(im, cx - side / 2, cy - side / 2, side, side, 0, 0, S, S);
            if (!alpha) finish(out.toDataURL("image/jpeg", 0.85));
            else { // officer pictures keep their see-through parts, so the card background shows behind the person
              let url = out.toDataURL("image/webp", 0.9);
              for (let k = 0.8; url.length > 140000 && k > 0.4; k -= 0.2) { const c2 = document.createElement("canvas"); c2.width = c2.height = Math.round(S * k); c2.getContext("2d").drawImage(out, 0, 0, c2.width, c2.height); url = c2.toDataURL("image/webp", 0.85); }
              finish(url);
            }
            d.close();
          };
          $("[data-x]", d).onclick = () => d.close();
          d.onclose = () => { finish(null); d.remove(); };
          draw();
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  const isStaff = () => ROLE !== "student", isAdmin = () => ROLE === "admin";
  // Officers can add/edit only if their position is Mayor, Gensec or PRO 1 (the server checks this too). Admin always can.
  const canEdit = () => isAdmin() || (ROLE === "officer" && /^(mayor|gensec|generalsecretary|pro1|proi)$/.test(String((me && me.position) || "").toLowerCase().replace(/[^a-z0-9]/g, "")));
  let me = null, view = "home", state = {};
  const main = $("#main");
  const setWho = () => {
    const ph = me.photo || me.official_photo;
    $("#who").innerHTML = (ph ? avatar({ name: me.name, photo: ph }, "sm") : "") + esc(`${me.name} · ${cap(me.role)}`);
    $("#drawerHead").innerHTML = avatar({ name: me.name, photo: ph }, "sm") + `<span>${esc(me.name)}<small>${cap(me.role)}</small></span>`;
  };

  function logout() { localStorage.removeItem("css.token"); localStorage.removeItem("css.user"); sessionStorage.clear(); location.replace("/index.html"); }
  async function api(method, url, data) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: data ? JSON.stringify(data) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { logout(); throw new Error("Please log in again."); }
    if (r.status === 403 && j.code === "must_change") { if (me) me.must_change = true; view = "profile"; render(); throw new Error(j.error); }
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  }
  function toast(msg, bad) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast on" + (bad ? " bad" : "");
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), 2600);
  }

  // shrink a chosen picture (longest side <= max) to a JPEG that fits under `limit` characters
  function toImage(file, max, q, limit) {
    return new Promise((res, rej) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return rej(new Error(`"${file.name}" is not a JPG, PNG or WEBP picture.`));
      const r = new FileReader();
      r.onerror = () => rej(new Error("Could not read that file."));
      r.onload = () => {
        const im = new Image();
        im.onerror = () => rej(new Error(`Could not read "${file.name}".`));
        im.onload = () => {
          for (const [mx, qq] of [[max, q], [max * 0.8, 0.65], [max * 0.6, 0.55]]) {
            const k = Math.min(1, mx / Math.max(im.width, im.height)), c = document.createElement("canvas"), x = c.getContext("2d");
            c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
            x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
            const url = c.toDataURL("image/jpeg", qq); if (url.length <= limit) return res(url);
          }
          rej(new Error(`"${file.name}" is too big even after shrinking. Try another picture.`));
        };
        im.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }
  // pictures need the login token, so they are fetched (not plain <img src>) and shown from memory as data: URLs
  const blobCache = new Map();
  async function photoUrl(id, thumb) {
    const k = id + (thumb ? "t" : "f"); if (blobCache.has(k)) return blobCache.get(k);
    const r = await fetch(`/api/photos/${id}${thumb ? "?thumb=1" : ""}`, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("Could not load the picture.");
    const blob = await r.blob(), u = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(blob); }); blobCache.set(k, u); return u;
  }
  function lazyPhotos(root) {
    const imgs = [...root.querySelectorAll("img[data-photo]")], load = (im) => photoUrl(im.dataset.photo, !im.dataset.full).then((u) => { im.src = u; im.classList.add("ok"); }).catch(() => {});
    if (!("IntersectionObserver" in window)) return imgs.forEach(load);
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), { rootMargin: "250px" });
    imgs.forEach((im) => io.observe(im));
  }
  function gallery(item, start) {
    let i = start; const d = document.createElement("dialog"); d.className = "dlg gal";
    d.innerHTML = `<div class="gv"><img alt=""><div class="gnav"><button type="button" class="btn light sm" data-p aria-label="Previous picture">‹</button><span></span><button type="button" class="btn light sm" data-n aria-label="Next picture">›</button></div><p class="note"></p><div class="acts end"><button class="btn" data-x>Close</button></div></div>`;
    const img = $("img", d), pos = $("span", d), note = $(".note", d);
    const show = async () => { pos.textContent = `${i + 1} / ${item.photos.length}`; note.textContent = item.title; img.removeAttribute("src"); img.alt = `Picture ${i + 1} for ${item.title}`; try { img.src = await photoUrl(item.photos[i]); } catch (e) { note.textContent = e.message; } };
    const step = (n) => { i = (i + n + item.photos.length) % item.photos.length; show(); };
    $("[data-p]", d).onclick = () => step(-1); $("[data-n]", d).onclick = () => step(1); $("[data-x]", d).onclick = () => d.close();
    d.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
    if (item.photos.length < 2) $(".gnav", d).hidden = true;
    d.onclose = () => d.remove(); document.body.append(d); d.showModal(); show();
  }
  /* ---------- CBL: each entry can have one PDF; it is read right inside the page (scrolls on PC and phone) ---------- */
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  const MAX_PDF_MB = 10;
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  let pdfLib = null;
  function loadPdfJs() { // loaded only the first time someone opens a CBL
    if (pdfLib) return pdfLib;
    return (pdfLib = new Promise((res, rej) => {
      if (window.pdfjsLib) return res(window.pdfjsLib);
      const sc = document.createElement("script"); sc.src = PDFJS + "pdf.min.js";
      sc.onload = () => {
        const lib = window.pdfjsLib;
        // the worker is started through a small same-site blob, because browsers do not allow a worker straight from another site
        lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([`importScripts("${PDFJS}pdf.worker.min.js");`], { type: "text/javascript" }));
        res(lib);
      };
      sc.onerror = () => { pdfLib = null; rej(new Error("The PDF reader could not load. Check your internet connection and try again.")); };
      document.head.append(sc);
    }));
  }
  async function openPdf(id, title) {
    const d = document.createElement("dialog"); d.className = "dlg pdfdlg";
    d.innerHTML = `<div class="pdfhead"><h2>${esc(title || "CBL")}</h2><span class="pdfpg" aria-live="polite"></span><button type="button" class="btn sm" data-x aria-label="Close">Close</button></div><div class="pdfview" tabindex="0"><p class="pdfmsg">Loading document…</p></div>`;
    d.onclose = () => { d.remove(); if (task) task.destroy?.(); if (io) io.disconnect(); window.removeEventListener("resize", onResize); };
    $("[data-x]", d).onclick = () => d.close();
    document.body.append(d); d.showModal();
    const view = $(".pdfview", d), pgLabel = $(".pdfpg", d);
    let task = null, io = null, rt = 0, pdf = null, wraps = [], lastW = 0;
    const fail = (m, url) => { view.innerHTML = `<p class="pdfmsg err">${esc(m)}</p>` + (url ? `<p class="pdfmsg"><a class="btn sm" href="${url}" target="_blank" rel="noopener">Open in new tab instead</a></p>` : ""); };
    const draw = async (w) => {
      if (w.dataset.done === String(lastW)) return; w.dataset.done = String(lastW);
      const page = await pdf.getPage(Number(w.dataset.n)), base = page.getViewport({ scale: 1 }), cssW = w.clientWidth || view.clientWidth;
      const vp = page.getViewport({ scale: (cssW / base.width) * Math.min(window.devicePixelRatio || 1, 2) });
      const c = document.createElement("canvas"); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.setAttribute("aria-label", `Page ${w.dataset.n}`);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      w.replaceChildren(c);
    };
    const watch = () => { if (io) io.disconnect(); io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) draw(e.target).catch(() => {}); }), { root: view, rootMargin: "600px 0px" }); wraps.forEach((w) => io.observe(w)); };
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (!pdf || Math.abs(view.clientWidth - lastW) < 4) return; lastW = view.clientWidth; wraps.forEach((w) => { w.dataset.done = ""; }); watch(); }, 250); };
    window.addEventListener("resize", onResize);
    try {
      const [lib, r] = await Promise.all([loadPdfJs(), api("GET", `/api/cbl/${id}/file-link`)]);
      const resp = await fetch(r.url); if (!resp.ok) throw new Error("Could not load the PDF. Please try again.");
      const data = new Uint8Array(await resp.arrayBuffer());
      if (!d.isConnected) return;
      task = lib.getDocument({ data, isEvalSupported: false }); pdf = await task.promise;
      view.innerHTML = ""; lastW = view.clientWidth; wraps = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const pg = await pdf.getPage(n), v = pg.getViewport({ scale: 1 });
        const w = document.createElement("div"); w.className = "pdfpage"; w.dataset.n = n; w.style.aspectRatio = `${v.width} / ${v.height}`; view.append(w); wraps.push(w);
      }
      pgLabel.textContent = pdf.numPages + (pdf.numPages === 1 ? " page" : " pages");
      watch();
    } catch (ex) { if (d.isConnected) fail(ex.message || "Could not open the PDF."); }
  }
  async function uploadPdf(id, file) {
    const r = await fetch(`/api/cbl/${id}/file`, { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name) }, body: file });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { logout(); throw new Error("Please log in again."); }
    if (!r.ok) throw new Error(j.error || "Could not upload the PDF.");
  }
  function openCblForm(item) {
    let has = item?.pdf || null; const d = document.createElement("dialog"); d.className = "dlg";
    const row = () => has ? `<div class="pdfnow"><i class="fa-solid fa-file-pdf"></i> <span>${esc(has.name)} · ${fmtSize(has.size)}</span> <button type="button" class="btn bad sm" data-delpdf>Remove PDF</button></div>` : "";
    d.innerHTML = `<form><h2>${item ? "Edit CBL entry" : "Add CBL entry"}</h2>
      <label>Title<input name="title" required value="${esc(item?.title)}"></label><label>Schedule<input name="date" type="date" value="${esc(item?.date || new Date().toISOString().slice(0, 10))}"></label>
      <label>Details<textarea name="details">${esc(item?.details)}</textarea></label>
      <div id="pdfNow">${row()}</div>
      <label>${has ? "Replace the PDF" : "PDF file"} (up to ${MAX_PDF_MB} MB)<input type="file" name="pdf" accept="application/pdf,.pdf"></label>
      <p class="err" role="alert"></p><div class="acts end"><button type="button" class="btn light" data-x>Cancel</button><button class="btn" id="saveC">Save</button></div></form>`;
    document.body.append(d); d.showModal();
    $("[data-x]", d).onclick = () => d.close(); d.onclose = () => d.remove();
    d.addEventListener("click", async (e) => {
      if (!e.target.closest("[data-delpdf]") || !confirm("Remove this PDF?")) return;
      try { await api("DELETE", `/api/cbl/${item.id}/file`); has = null; item.pdf = null; $("#pdfNow", d).innerHTML = ""; } catch (ex) { $(".err", d).textContent = ex.message; }
    });
    $("form", d).onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, err = $(".err", d), btn = $("#saveC", d), file = f.pdf.files[0]; err.textContent = "";
      if (file && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) { err.textContent = "Please choose a PDF file."; return; }
      if (file && file.size > MAX_PDF_MB * 1048576) { err.textContent = `That PDF is too big (${fmtSize(file.size)}). The limit is ${MAX_PDF_MB} MB.`; return; }
      btn.disabled = true;
      try {
        const data = { title: f.title.value, date: f.date.value, details: f.details.value };
        const id = item ? (await api("PUT", "/api/cbl/" + item.id, data), item.id) : (await api("POST", "/api/cbl", data)).id;
        if (file) { btn.textContent = "Uploading PDF…"; try { await uploadPdf(id, file); } catch (ex) { d.close(); render(); toast(`Saved, but the PDF was not added. ${ex.message}`, true); return; } }
        d.close(); render(); toast("Saved");
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = "Save"; }
    };
  }
  const MAXP = 6;
  function openAchForm(item) {
    const have = item ? item.photos.slice() : [], d = document.createElement("dialog"); d.className = "dlg";
    d.innerHTML = `<form><h2>${item ? "Edit achievement" : "Add achievement"}</h2>
      <label>Title<input name="title" required value="${esc(item?.title)}"></label><label>Date<input name="date" type="date" value="${esc(item?.date || new Date().toISOString().slice(0, 10))}"></label>
      <label>Details<textarea name="details">${esc(item?.details)}</textarea></label>
      ${have.length ? `<div><b class="lbl">Pictures (tap × to remove)</b><div class="thumbs" id="exist">${have.map((pid) => `<span class="th" data-pid="${pid}"><img data-photo="${pid}" alt=""><button type="button" class="x" data-del="${pid}" aria-label="Remove picture">×</button></span>`).join("")}</div></div>` : ""}
      <label>Add pictures (JPG, PNG or WEBP, up to ${MAXP} in total)<input type="file" name="pics" accept="image/jpeg,image/png,image/webp" multiple></label>
      <p class="err" role="alert"></p><div class="acts end"><button type="button" class="btn light" data-x>Cancel</button><button class="btn" id="saveA">Save</button></div></form>`;
    document.body.append(d); d.showModal(); lazyPhotos(d);
    $("[data-x]", d).onclick = () => d.close(); d.onclose = () => d.remove();
    d.addEventListener("click", async (e) => {
      const x = e.target.closest("[data-del]"); if (!x || !confirm("Remove this picture?")) return;
      try { await api("DELETE", "/api/photos/" + x.dataset.del); have.splice(have.indexOf(Number(x.dataset.del)), 1); item.photos = have.slice(); x.closest(".th").remove(); } catch (ex) { $(".err", d).textContent = ex.message; }
    });
    $("form", d).onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, err = $(".err", d), btn = $("#saveA", d), files = [...f.pics.files]; err.textContent = "";
      if (files.length + have.length > MAXP) { err.textContent = `An achievement can have up to ${MAXP} pictures. You can add ${MAXP - have.length} more.`; return; }
      btn.disabled = true;
      try {
        const data = { title: f.title.value, date: f.date.value, details: f.details.value };
        const id = item ? (await api("PUT", "/api/achievements/" + item.id, data), item.id) : (await api("POST", "/api/achievements", data)).id;
        let bad = 0, why = "", n = 0;
        for (const file of files) {
          btn.textContent = `Uploading ${++n} of ${files.length}…`;
          try { await api("POST", `/api/achievements/${id}/photos`, { photo: await toImage(file, 1280, 0.8, 640000), thumb: await toImage(file, 320, 0.75, 100000) }); } catch (ex) { bad++; why = ex.message; }
        }
        d.close(); render(); toast(bad ? `Saved, but ${bad} picture${bad > 1 ? "s" : ""} could not be added. ${why}` : "Saved", !!bad);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = "Save"; }
    };
  }

  /* ---------- menu ---------- */
  const NAV = [
    ["home", "Dashboard", "fa-house"], ["events", "Events", "fa-calendar-days"],
    ["achievements", "Achievements", "fa-trophy"], ["announcements", "Announcements", "fa-bullhorn"], ["officers", "Officers", "fa-user-tie"], ["cbl", "CBL", "fa-file-lines"],
    ["students", "List of students", "fa-list", ["officer", "admin"]], ["regs", "Registrations", "fa-user-check", ["admin"]],
    ["users", "Manage users", "fa-users-gear", ["admin"]], ["resets", "Password resets", "fa-key", ["admin"]],
    ["about", "About", "fa-circle-info"], ["contact", "Contact", "fa-envelope"], ["profile", "Manage profile", "fa-user-gear"],
  ].filter((n) => !n[3] || n[3].includes(ROLE));
  const navItems = () => (me && me.must_change ? NAV.filter((n) => n[0] === "profile") : NAV); // on a temporary password only the profile page is open
  function drawNav() {
    $("#nav").innerHTML = navItems().map(([k, l, ic]) => `<a href="#${k}" data-v="${k}" class="${k === view ? "on" : ""}"><i class="fa-solid ${ic}"></i> ${l}${k === "regs" ? '<span class="badge" id="pendBadge" hidden></span>' : ""}${k === "resets" ? '<span class="badge" id="rstBadge" hidden></span>' : ""}</a>`).join("");
    if (isAdmin()) updateBadge();
  }
  async function updateBadge() {
    try { const s = await api("GET", "/api/stats"), b = $("#pendBadge"), r = $("#rstBadge"); if (b) { b.textContent = s.pending; b.hidden = !s.pending; } if (r) { r.textContent = s.resets; r.hidden = !s.resets; } } catch (_) {}
  }

  /* ---------- pop-up form ---------- */
  function fieldHtml([k, label, type, opts], v) {
    const val = v[k] ?? "", req = k === "title" || k === "name" ? "required" : "";
    if (type === "file") return `<label>${label}<input name="${k}" type="file" accept="image/jpeg,image/png,image/webp"></label>`;
    if (type === "area") return `<label>${label}<textarea name="${k}">${esc(val)}</textarea></label>`;
    if (type === "select") return `<label>${label}<select name="${k}">${opts.map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${ov === val ? "selected" : ""}>${esc(ol)}</option>`; }).join("")}</select></label>`;
    return `<label>${label}<input name="${k}" type="${type || "text"}" value="${esc(val)}" ${req} ${type === "password" ? 'autocomplete="new-password"' : ""}></label>`;
  }
  function openForm(title, fields, vals, onSave) {
    const d = document.createElement("dialog"); d.className = "dlg";
    d.innerHTML = `<form><h2>${esc(title)}</h2>${fields.map((f) => fieldHtml(f, vals)).join("")}<p class="err" role="alert"></p><div class="acts end"><button type="button" class="btn light" data-x>Cancel</button><button class="btn">Save</button></div></form>`;
    document.body.append(d); d.showModal();
    $("[data-x]", d).onclick = () => d.close(); d.onclose = () => d.remove();
    $("form", d).onsubmit = async (e) => {
      e.preventDefault();
      try { await onSave(Object.fromEntries(new FormData(e.target))); d.close(); } catch (ex) { $(".err", d).textContent = ex.message; }
    };
  }

  /* ---------- content lists (events, CBL, achievements, announcements) ---------- */
  const T = [["title", "Title"], ["date", "Date", "date"]], D = ["details", "Details", "area"];
  const COL = {
    events: { name: "Events", one: "event", f: [...T, ["time", "Time", "time"], ["venue", "Venue"], D] },
    cbl: { name: "CBL", one: "CBL entry", f: [T[0], ["date", "Schedule", "date"], D] },
    achievements: { name: "Achievements", one: "achievement", f: [...T, D] },
    announcements: { name: "Announcements", one: "announcement", f: [...T, D] },
  };
  // PC view: cards. Every card with 2+ pictures changes picture by itself (pauses while the mouse is over it or the tab is hidden)
  const achCard = (i) => {
    const n = i.photos?.length || 0;
    return `<article class="item ach">${n ? `<button type="button" class="cover" data-act="gallery" data-id="${i.id}" data-i="0" data-slides="${i.photos.join(",")}" aria-label="View ${n} picture${n > 1 ? "s" : ""} of ${esc(i.title)}">${i.photos.map((pid, k) => `<img class="sl${k ? "" : " on"}" ${k ? `data-pid="${pid}"` : `data-photo="${pid}" data-full="1"`} alt="Picture ${k + 1} for ${esc(i.title)}">`).join("")}${n > 1 ? `<span class="count">1 / ${n}</span>` : ""}</button>` : ""}
      <div class="abody"><h3>${esc(i.title)}</h3><div class="d">${fmt(i.date)}</div><p>${esc(i.details)}</p>
      ${canEdit() ? `<div class="acts"><button class="btn light sm" data-act="edit" data-c="achievements" data-id="${i.id}">Edit</button>${isAdmin() ? `<button class="btn bad sm" data-act="del" data-c="achievements" data-id="${i.id}">Delete</button>` : ""}</div>` : ""}</div></article>`;
  };
  let slideTimer = null;
  function startSlides(root) {
    clearInterval(slideTimer); slideTimer = null;
    const covers = [...root.querySelectorAll(".cover[data-slides]")].filter((c) => c.dataset.slides.includes(","));
    if (!covers.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    covers.forEach((c, k) => { c._i = 0; c._tick = k % 3; c.onmouseenter = () => (c._hold = true); c.onmouseleave = () => (c._hold = false); c.onfocus = c.onmouseenter; c.onblur = c.onmouseleave; });
    const go = async (c) => {
      const imgs = [...c.querySelectorAll("img.sl")], next = (c._i + 1) % imgs.length, im = imgs[next];
      if (!im.getAttribute("src")) { try { im.src = await photoUrl(im.dataset.pid || im.dataset.photo); im.classList.add("ok"); } catch { return; } }
      imgs[c._i].classList.remove("on"); im.classList.add("on"); c._i = next; c.dataset.i = next;
      const cnt = c.querySelector(".count"); if (cnt) cnt.textContent = `${next + 1} / ${imgs.length}`;
    };
    slideTimer = setInterval(() => { if (document.hidden || !root.isConnected) return; covers.forEach((c) => { if (c.offsetParent && !c._hold && ++c._tick >= 3) { c._tick = 0; go(c); } }); }, 1200);
  }
  // Phone view: carousel, one slide per picture. The current slide sits in the middle, the neighbours peek in from the sides, and it moves by itself.
  const achCarousel = (items) => {
    const slides = items.flatMap((i) => (i.photos?.length ? i.photos.map((pid, k) => ({ i, pid, k, n: i.photos.length })) : [{ i, pid: null, k: 0, n: 0 }]));
    const acts = (i) => (canEdit() ? `<div class="acts"><button class="btn light sm" data-act="edit" data-c="achievements" data-id="${i.id}">Edit</button>${isAdmin() ? `<button class="btn bad sm" data-act="del" data-c="achievements" data-id="${i.id}">Delete</button>` : ""}</div>` : "");
    return `<section class="car" role="region" aria-roledescription="carousel" aria-label="Achievements"><div class="car-stage">${slides.map((s, x) => `<figure class="slide" data-x="${x}" aria-label="Slide ${x + 1} of ${slides.length}">
      ${s.pid ? `<button type="button" class="sl-img" data-act="gallery" data-id="${s.i.id}" data-i="${s.k}" aria-label="View the pictures of ${esc(s.i.title)}"><img data-pid="${s.pid}" alt="Picture ${s.k + 1} for ${esc(s.i.title)}">${s.n > 1 ? `<span class="count">${s.k + 1} / ${s.n}</span>` : ""}</button>` : `<div class="sl-img none"><i class="fa-solid fa-trophy"></i></div>`}
      <figcaption><h3>${esc(s.i.title)}</h3><div class="d">${fmt(s.i.date)}</div><p>${esc(s.i.details)}</p>${acts(s.i)}</figcaption></figure>`).join("")}</div>
      ${slides.length > 1 ? `<button type="button" class="car-btn prev" aria-label="Previous slide">‹</button><button type="button" class="car-btn next" aria-label="Next slide">›</button><div class="car-dots">${slides.map((s, x) => `<button type="button" class="dot" data-x="${x}" aria-label="Go to slide ${x + 1}"></button>`).join("")}</div>` : ""}</section>`;
  };
  let carTimer = null, carFit = null;
  function startCarousel(root) {
    clearInterval(carTimer); carTimer = null; if (carFit) window.removeEventListener("resize", carFit); carFit = null;
    const car = root.querySelector(".car"); if (!car) return;
    const slides = [...car.querySelectorAll(".slide")], dots = [...car.querySelectorAll(".dot")], stage = $(".car-stage", car), n = slides.length;
    let a = 0, hold = false, last = Date.now(); const prev = slides.map(() => 0);
    slides.forEach((s) => { const im = $("img[data-pid]", s); if (im) photoUrl(im.dataset.pid).then((u) => { im.src = u; im.classList.add("ok"); }).catch(() => {}); });
    const fit = () => { stage.style.height = Math.max(...slides.map((s) => s.offsetHeight)) + "px"; };
    const place = (first) => {
      slides.forEach((s, x) => {
        let d = (((x - a) % n) + n) % n; if (d > n / 2) d -= n;
        const jump = !first && Math.abs(d - prev[x]) > 1; // a slide wrapping from one end to the other should not fly across the stage
        if (jump) s.style.transition = "none";
        s.style.setProperty("--d", d); s.classList.toggle("on", d === 0); s.classList.toggle("near", Math.abs(d) === 1); s.setAttribute("aria-hidden", d !== 0);
        s.querySelectorAll("button").forEach((b) => (b.tabIndex = d === 0 ? 0 : -1));
        if (jump) { void s.offsetWidth; s.style.transition = ""; }
        prev[x] = d;
      });
      dots.forEach((b, x) => b.classList.toggle("on", x === a));
    };
    const go = (x) => { a = ((x % n) + n) % n; last = Date.now(); place(); };
    place(true); fit(); requestAnimationFrame(fit); carFit = fit; window.addEventListener("resize", fit);
    if (n < 2) return;
    // a click on a peeking slide brings it to the middle (instead of opening it)
    car.addEventListener("click", (e) => { const s = e.target.closest(".slide"); if (s && !s.classList.contains("on")) { e.stopPropagation(); e.preventDefault(); go(Number(s.dataset.x)); } }, true);
    $(".prev", car).onclick = () => go(a - 1); $(".next", car).onclick = () => go(a + 1); dots.forEach((b) => (b.onclick = () => go(Number(b.dataset.x))));
    car.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") go(a - 1); if (e.key === "ArrowRight") go(a + 1); });
    let sx = null; stage.addEventListener("pointerdown", (e) => (sx = e.clientX)); stage.addEventListener("pointerup", (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 50) go(a + (e.clientX < sx ? 1 : -1)); sx = null; });
    car.onmouseenter = car.onfocusin = () => (hold = true); car.onmouseleave = car.onfocusout = () => { hold = false; last = Date.now(); };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    carTimer = setInterval(() => { if (!car.isConnected) { clearInterval(carTimer); return; } if (car.offsetParent && !hold && !document.hidden && Date.now() - last >= 4000) go(a + 1); }, 500);
  }
  async function colPage(c) {
    const C = COL[c], { items } = await api("GET", "/api/" + c); state[c] = items;
    const isEv = c === "events", short = (t) => (t.length > 110 ? t.slice(0, 110).trimEnd() + "…" : t);
    return `<div class="bar"><h2 class="pg sp">${C.name}</h2>${canEdit() ? `<button class="btn" data-act="add" data-c="${c}"><i class="fa-solid fa-plus"></i> Add ${C.one}</button>` : ""}</div>
    ${items.length && c === "achievements" ? `<div class="ach-stage"><div class="grid agrid ach-pc">${items.map(achCard).join("")}</div>${achCarousel(items)}</div>` : items.length ? `<div class="grid">${items.map((i) => `<article class="item"><h3>${esc(i.title)}</h3><div class="d">${fmt(i.date)}${i.time ? " · " + fmtTime(i.time) : ""}</div>${i.venue ? `<div class="sub"><i class="fa-solid fa-location-dot"></i> ${esc(i.venue)}</div>` : ""}<p class="${isEv ? "clamp" : ""}">${esc(isEv ? short(i.details) : i.details)}</p>${c === "achievements" && i.photos?.length ? `<div class="thumbs">${i.photos.map((pid, n) => `<button type="button" class="th" data-act="gallery" data-id="${i.id}" data-i="${n}" aria-label="View picture ${n + 1} of ${i.photos.length}"><img data-photo="${pid}" alt="Picture ${n + 1} for ${esc(i.title)}"></button>`).join("")}</div>` : ""}
      ${c === "cbl" && i.pdf ? `<div class="pdfrow"><button type="button" class="btn sm" data-act="openpdf" data-id="${i.id}"><i class="fa-solid fa-file-pdf"></i> Read document</button><span class="sub">${esc(i.pdf.name)} · ${fmtSize(i.pdf.size)}</span></div>` : ""}
      ${isEv || canEdit() ? `<div class="acts">${isEv ? `<button class="btn sm" data-act="view" data-id="${i.id}">View details</button>` : ""}${canEdit() ? `<button class="btn light sm" data-act="edit" data-c="${c}" data-id="${i.id}">Edit</button>${isAdmin() ? `<button class="btn bad sm" data-act="del" data-c="${c}" data-id="${i.id}">Delete</button>` : ""}` : ""}</div>` : ""}</article>`).join("")}</div>`
      : `<div class="empty">Nothing here yet.${canEdit() ? " Use the Add button to post the first one." : " Check back later."}</div>`}`;
  }

  function showEvent(i) {
    const d = document.createElement("dialog"); d.className = "dlg";
    d.innerHTML = `<div class="evd"><h2>${esc(i.title)}</h2>
      <ul class="facts"><li><i class="fa-solid fa-calendar-days"></i><span><b>Date</b>${fmt(i.date)}</span></li>${i.time ? `<li><i class="fa-solid fa-clock"></i><span><b>Time</b>${fmtTime(i.time)}</span></li>` : ""}${i.venue ? `<li><i class="fa-solid fa-location-dot"></i><span><b>Venue</b>${esc(i.venue)}</span></li>` : ""}</ul>
      <h3>Details</h3><p class="body">${i.details ? esc(i.details) : "No details have been added for this event yet."}</p>
      ${i.posted_by ? `<p class="note">Posted by ${esc(i.posted_by)}</p>` : ""}
      <div class="acts end"><button class="btn" data-x>Close</button></div></div>`;
    document.body.append(d); d.showModal(); $("[data-x]", d).onclick = () => d.close(); d.onclose = () => d.remove();
  }

  async function openOfficerPicker() {
    const d = document.createElement("dialog"); d.className = "dlg";
    d.innerHTML = `<form><h2>Add officer</h2>
      <p class="note" style="margin:0">Enter the officer's details.</p>
      <label>Full name<input name="name" maxlength="80" required></label>
      <label>Position<input name="position" maxlength="60" placeholder="e.g. President" required></label>
      <label>Program${progSelect("")}</label>
      <label>Year level & Section<select name="year"><option value="">Select year</option>${["1-A", "1-B", "2-A", "2-B", "3-A", "3-B", "4-A", "4-B"].map((y) => `<option>${y}</option>`).join("")}</select></label>
      <label>Official picture (optional)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label>
      <p class="err" role="alert"></p><div class="acts end"><button type="button" class="btn light" data-x>Cancel</button><button class="btn" id="saveO">Add officer</button></div></form>`;
    document.body.append(d); d.showModal(); $("[data-x]", d).onclick = () => d.close(); d.onclose = () => d.remove();
    $("form", d).onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, err = $(".err", d), btn = $("#saveO", d); err.textContent = ""; btn.disabled = true;
      try {
        const file = f.photo.files[0]; let official_photo = "";
        if (file) { official_photo = await cropPhoto(file, 320, true); if (!official_photo) throw new Error("Crop was cancelled. Choose the picture again, or leave it empty."); }
        await api("POST", "/api/admin/officers", { name: f.name.value, position: f.position.value, program: f.program.value, year: f.year.value, official_photo });
        d.close(); toast("Officer added. Students, officers and the admin can see them on the Officers page now."); render();
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    };
  }
  function showTemp(u, pw) {
    const d = document.createElement("dialog"); d.className = "dlg";
    d.innerHTML = `<div class="evd"><h2>Temporary password</h2><p class="note">Give this to <b>${esc(u.name)}</b> (${esc(u.uconnect)}). Shown only once.</p><div class="temp" id="tmp">${esc(pw)}</div><div class="acts end"><button type="button" class="btn light" data-copy>Copy</button><button type="button" class="btn" data-x>Done</button></div></div>`;
    document.body.append(d); d.showModal(); d.onclose = () => d.remove(); $("[data-x]", d).onclick = () => d.close();
    $("[data-copy]", d).onclick = async () => {
      try { await navigator.clipboard.writeText(pw); toast("Copied"); }
      catch (_) { const r = document.createRange(); r.selectNodeContents($("#tmp", d)); getSelection().removeAllRanges(); getSelection().addRange(r); toast("Press Ctrl+C to copy"); }
    };
  }

  /* ---------- pages ---------- */
  const PAGES = {
    async home() {
      const s = await api("GET", "/api/stats"), a = (await api("GET", "/api/announcements")).items.slice(0, 3), evs = (await api("GET", "/api/events")).items;
      const st = (ic, l, n, sub) => `<div class="stat"><span class="ic"><i class="fa-solid ${ic}"></i></span><div><small>${l}</small><b>${esc(n)}</b><small>${sub}</small></div></div>`;
      return `<h2 class="pg greet">${greet()}, ${esc(me.name.split(" ")[0])}</h2><p class="note">${new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p><div class="stats">${st("fa-calendar-days", "Upcoming Events", s.upcomingEvents, "Events")}${st("fa-trophy", "Achievements", s.achievements, "Total")}
        ${isStaff() ? st("fa-users", "Students", s.students, "Active members") : ""}${isAdmin() ? st("fa-user-clock", "To check", s.pending, "Registrations") : ""}${st("fa-id-badge", "Your Role", cap(ROLE), "Access Level")}</div>
      ${chart(evs)}<section class="panel"><h2>Recent Events</h2>${s.recentEvents.length ? s.recentEvents.map((e) => `<a href="#events" class="ev"><i class="fa-solid fa-calendar-check"></i><span class="t"><b>${esc(e.title)}</b><small>${fmt(e.date)}</small></span><span class="go">›</span></a>`).join("") : '<div class="empty">No events yet.</div>'}</section>
      <section class="panel"><h2>Latest Announcements</h2>${a.length ? a.map((e) => `<a href="#announcements" class="ev"><i class="fa-solid fa-bullhorn"></i><span class="t"><b>${esc(e.title)}</b><small>${fmt(e.date)}</small></span><span class="go">›</span></a>`).join("") : '<div class="empty">No announcements yet.</div>'}</section>`;
    },
    events: () => colPage("events"), cbl: () => colPage("cbl"), achievements: () => colPage("achievements"), announcements: () => colPage("announcements"),
    async officers() {
      const { items } = await api("GET", "/api/officers"); state.officers = items;
      return `<div class="bar"><h2 class="pg sp">Officers</h2>${isAdmin() ? '<button class="btn" data-act="oadd"><i class="fa-solid fa-plus"></i> Add officer</button>' : ""}</div>${items.length ? `<div class="grid ogrid">${items.map((o) => `<div class="item ocard"><div class="oph">${o.photo ? `<img src="${esc(o.photo)}" alt="Photo of ${esc(o.name)}">` : `<span aria-hidden="true">${esc(initials(o.name))}</span>`}</div><div class="obody"><h3>${esc(o.name)}</h3><div class="orole">${esc(o.position || "Officer")}</div><div class="oprog">${esc(progName(o.program))}</div>${o.year ? `<span class="otag">Year ${esc(o.year)}</span>` : ""}${isAdmin() ? `<div class="acts"><button class="btn light sm" data-act="oedit" data-id="${o.id}">Edit</button><button class="btn light sm" data-act="ophoto" data-id="${o.id}">${o.photo ? "Change picture" : "Add picture"}</button>${o.photo ? `<button class="btn light sm" data-act="ophotodel" data-id="${o.id}">Remove picture</button>` : ""}<button class="btn bad sm" data-act="odel" data-id="${o.id}">Remove officer</button></div>` : ""}</div></div>`).join("")}</div><input type="file" id="offIn" accept="image/jpeg,image/png,image/webp" hidden>` : `<div class="empty">No officers listed yet.${isAdmin() ? " Use Add officer to add one." : ""}</div>`}`;
    },
    async students() {
      const { items } = await api("GET", "/api/students"); state.students = items;
      return `<div class="bar"><h2 class="pg sp">List of students</h2><input class="search" id="flt" placeholder="Search name or U-connect" aria-label="Search students"></div>
      <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>U-connect</th><th>Email</th><th>Program</th><th>Year</th></tr></thead><tbody id="rows">${studRows(items)}</tbody></table></div>`;
    },
    async about() {
      const { about } = await api("GET", "/api/about");
      return `<div class="bar"><h2 class="pg sp">About the Computer Science Society</h2>${isAdmin() ? '<button class="btn" data-act="about">Edit background</button>' : ""}</div><div class="item"><p>${esc(about)}</p></div>`;
    },
    async contact() {
      let inbox = "";
      if (isStaff()) {
        const { items } = await api("GET", "/api/messages"); state.msgs = items;
        inbox = `<h2 class="pg" style="margin:28px 0 14px">Messages received</h2>${items.length ? `<div class="grid">${items.map((m) => `<article class="item"><h3>${esc(m.subject)}</h3><div class="sub">${esc(m.sender)} · ${esc(m.created_at)}</div><p>${esc(m.body)}</p>${isAdmin() ? `<div class="acts"><button class="btn bad sm" data-act="mdel" data-id="${m.id}">Delete</button></div>` : ""}</article>`).join("")}</div>` : '<div class="empty">No messages yet.</div>'}`;
      }
      return `<div class="mid contactpg"><div class="cwrap"><div class="cleft"><h2>Join Our Community</h2><span class="cbar"></span><p class="cintro">Want to be part of the Computer Science Society? Connect with us, stay updated with our activities, and become part of our growing community.</p><div class="crow"><span class="cic"><i class="fa-solid fa-envelope"></i></span><div><b>Email</b><span>nvsu_u_connect@nvsu.edu.ph</span></div></div><div class="crow"><span class="cic"><i class="fa-solid fa-phone"></i></span><div><b>Phone</b><span>+63 012 3456 789</span></div></div><div class="crow"><span class="cic"><i class="fa-solid fa-location-dot"></i></span><div><b>Location</b><span>ITE Building, NVSU Bayombong Campus</span></div></div></div><div class="cform"><h3>Send Us a Message</h3><form class="stack" id="msgForm"><input name="subject" required maxlength="120" placeholder="Subject" aria-label="Subject"><textarea name="message" required maxlength="4000" placeholder="Your Message" aria-label="Your message"></textarea><p class="err" role="alert"></p><button class="btn">Send Message</button></form></div></div>${inbox}</div>`;
    },
    async profile() {
      const { user: u } = await api("GET", "/api/me");
      const must = !!u.must_change;
      return `<div class="mid"><h2 class="pg" style="margin-bottom:16px">Manage profile</h2>${must ? '<div class="banner" role="alert"><b>Choose a new password.</b> Your password was reset by the administrator. You can use the system after you change it below.</div>' : ""}<div class="item" style="max-width:520px;margin:0 auto"><div class="photo pcenter"><button type="button" class="avbtn" data-act="photopick" aria-label="${u.photo ? "Change my picture" : "Add my picture"}">${avatar(u, "xl")}</button><input type="file" id="photoIn" accept="image/jpeg,image/png,image/webp" hidden><b class="lbl">${u.photo ? "Click the picture to change it" : "Click the circle to add a picture"}</b>${u.photo ? '<button type="button" class="btn bad sm" data-act="photodel">Remove my picture</button>' : ""}<p class="note" style="margin:0">Only you see this, in your own dashboard. You can crop it after choosing.</p></div><form class="stack" id="profForm" style="max-width:none">
        <div class="sub">U-connect: <b>${esc(u.uconnect)}</b> · Role: <b>${cap(u.role)}</b>${u.position ? " · " + esc(u.position) : ""}</div>
        <label>Full name<input name="name" required maxlength="80" value="${esc(u.name)}"></label><label>Email<input name="email" type="email" required value="${esc(u.email)}"></label>
        <label>Program${progSelect(u.program)}</label><label>Year level<input name="year" maxlength="10" value="${esc(u.year)}"></label>
        <h3 style="margin:8px 0 0;font-size:15px">${must ? "Choose a new password" : "Change password (optional)"}</h3>
        <label>${must ? "Temporary password (from the administrator)" : "Current password"}<input name="currentPassword" type="password" autocomplete="current-password" ${must ? "required" : ""}></label><label>New password<input name="newPassword" type="password" minlength="8" autocomplete="new-password" ${must ? "required" : ""}></label>
        <p class="err" role="alert"></p><button class="btn">Save changes</button></form></div></div>`;
    },
    async resets() {
      const { items } = await api("GET", "/api/admin/resets"); state.resets = items;
      return `<h2 class="pg" style="margin-bottom:6px">Password resets</h2><p class="note">People who forgot their password.</p>
      ${items.length ? `<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>U-connect</th><th>Email</th><th>Role</th><th>Asked on</th><th></th></tr></thead><tbody>${items.map((u) => `<tr><td data-label="Name">${esc(u.name)}</td><td data-label="U-connect">${esc(u.uconnect)}</td><td data-label="Email">${esc(u.email)}</td><td data-label="Role">${u.role}</td><td data-label="Asked on">${esc(new Date(u.created_at.replace(" ", "T") + "Z").toLocaleString())}</td><td data-label=""><div class="acts"><button class="btn sm" data-act="reset" data-id="${u.id}">Reset password</button><button class="btn light sm" data-act="rdismiss" data-id="${u.id}">Dismiss</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No password requests right now.</div>'}`;
    },
    async regs() {
      const { items } = await api("GET", "/api/admin/users"), p = items.filter((u) => u.status === "pending");
      return `<h2 class="pg" style="margin-bottom:6px">Registrations to check</h2><p class="note">Approve only verified members.</p>
      ${p.length ? `<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>U-connect</th><th>Email</th><th>Program / year</th><th>Role</th><th></th></tr></thead><tbody>${p.map((u) => `<tr><td data-label="Name">${esc(u.name)}</td><td data-label="U-connect">${esc(u.uconnect)}</td><td data-label="Email">${esc(u.email)}</td><td data-label="Program / year">${esc(progName(u.program))} / ${esc(u.year)}</td><td data-label="Role">${u.role}${u.position ? " – " + esc(u.position) : ""}</td><td data-label=""><div class="acts"><button class="btn sm" data-act="approve" data-id="${u.id}">Approve</button><button class="btn bad sm" data-act="reject" data-id="${u.id}">Reject</button></div></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty">No pending registrations.</div>'}`;
    },
    async users() {
      const { items } = await api("GET", "/api/admin/users"); state.users = items;
      return `<div class="bar"><h2 class="pg sp">Manage users</h2><button class="btn" data-act="uadd" data-role="student"><i class="fa-solid fa-plus"></i> Add user</button><input class="search" id="flt" placeholder="Search name or U-connect" aria-label="Search users"></div>
      <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>U-connect</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody id="rows">${userRows(items)}</tbody></table></div>`;
    },
  };
  const studRows = (a) => a.map((u) => `<tr><td data-label="Name">${esc(u.name)}</td><td data-label="U-connect">${esc(u.uconnect)}</td><td data-label="Email">${esc(u.email)}</td><td data-label="Program">${esc(progName(u.program))}</td><td data-label="Year">${esc(u.year)}</td></tr>`).join("") || '<tr><td colspan="5">No active students yet.</td></tr>';
  const userRows = (a) => a.map((u) => `<tr><td data-label="Name">${esc(u.name)}</td><td data-label="U-connect">${esc(u.uconnect)}</td><td data-label="Role">${u.role}${u.position ? " – " + esc(u.position) : ""}</td><td data-label="Status"><span class="pill ${u.status === "active" ? "good" : u.status === "pending" ? "warn" : "no"}">${u.status}</span></td><td data-label=""><div class="acts"><button class="btn light sm" data-act="uedit" data-id="${u.id}">Edit</button>${u.id !== me.id ? `<button class="btn light sm" data-act="ureset" data-id="${u.id}">Reset password</button>` : ""}${u.id !== me.id ? `<button class="btn bad sm" data-act="udel" data-id="${u.id}">Delete</button>` : ""}</div></td></tr>`).join("");

  /* ---------- motion: staggered entrance, count-up numbers, greeting, chart ---------- */
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function animate() {
    main.querySelectorAll(".stat,.panel,.item,.tbl-wrap,.bar,h2.pg,.note").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 14)));
    if (calm()) return;
    main.querySelectorAll(".stat b").forEach((b) => {
      const n = Number(b.textContent); if (!Number.isInteger(n) || n <= 0) return;
      const t0 = performance.now(), tick = (t) => { const k = Math.min(1, (t - t0) / 800); b.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
      b.textContent = "0"; requestAnimationFrame(tick);
    });
  }
  const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };
  function chart(events) {
    const now = new Date(), ms = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); ms.push({ k: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"), l: d.toLocaleDateString(undefined, { month: "short" }), n: 0 }); }
    events.forEach((e) => { const m = ms.find((x) => e.date && e.date.startsWith(x.k)); if (m) m.n++; });
    const max = Math.max(1, ...ms.map((m) => m.n)), W = 360, H = 150, bw = 34, gap = (W - ms.length * bw) / (ms.length + 1);
    return `<section class="panel"><h2>Events per month</h2><svg viewBox="0 0 ${W} ${H}" class="bars" role="img" aria-label="Events in the last six months: ${ms.map((m) => m.l + " " + m.n).join(", ")}">` + ms.map((m, i) => {
      const h = Math.round((H - 44) * m.n / max), x = gap + i * (bw + gap), y = H - 22 - h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 3)}" rx="4" fill="var(--brand)" opacity="${m.n ? 1 : .25}" style="animation-delay:${i * 90}ms"/><text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#222">${m.l}</text>${m.n ? `<text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="#222">${m.n}</text>` : ""}`;
    }).join("") + "</svg></section>";
  }

  async function render() {
    if (me && me.must_change) view = "profile";
    if (!PAGES[view] || !navItems().some((n) => n[0] === view)) view = "home";
    document.body.classList.toggle("on-profile", view === "profile");
    drawNav(); main.innerHTML = '<div class="grid"><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>';
    try { main.innerHTML = await PAGES[view](); } catch (e) { main.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    animate(); lazyPhotos(main); startSlides(main); startCarousel(main);
  }

  /* ---------- actions ---------- */
  main.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const { act, c, id } = b.dataset;
    try {
      if (act === "view") showEvent(state.events.find((x) => String(x.id) === id));
      else if (act === "gallery") gallery(state.achievements.find((x) => String(x.id) === id), Number(b.dataset.i));
      else if (act === "reset" || act === "ureset") {
        const u = (act === "reset" ? state.resets : state.users).find((x) => String(x.id) === id);
        if (confirm(`Reset the password of ${u.name}? Their current password will stop working right away.`)) { const r = await api("POST", `/api/admin/users/${id}/reset-password`); showTemp(u, r.password); render(); }
      }
      else if (act === "rdismiss") { await api("DELETE", `/api/admin/resets/${id}`); toast("Request dismissed"); render(); }
      else if (act === "openpdf") openPdf(id, (state.cbl.find((x) => String(x.id) === id) || {}).title);
      else if (act === "add" && c === "cbl") openCblForm(null);
      else if (act === "edit" && c === "cbl") openCblForm(state.cbl.find((x) => String(x.id) === id));
      else if (act === "add" && c === "achievements") openAchForm(null);
      else if (act === "edit" && c === "achievements") openAchForm(state.achievements.find((x) => String(x.id) === id));
      else if (act === "add") { const C = COL[c]; openForm("Add " + C.one, C.f, { date: new Date().toISOString().slice(0, 10) }, async (v) => { await api("POST", "/api/" + c, v); toast("Saved"); render(); }); }
      else if (act === "edit") { const i = state[c].find((x) => String(x.id) === id); openForm("Edit " + COL[c].one, COL[c].f, i, async (v) => { await api("PUT", `/api/${c}/${id}`, v); toast("Changes saved"); render(); }); }
      else if (act === "del") { if (confirm("Delete this entry? This cannot be undone.")) { await api("DELETE", `/api/${c}/${id}`); toast("Deleted"); render(); } }
      else if (act === "about") { const { about } = await api("GET", "/api/about"); openForm("Edit organizational background", [["about", "Background", "area"]], { about }, async (v) => { await api("PUT", "/api/about", v); toast("Background updated"); render(); }); }
      else if (act === "approve" || act === "reject") { await api("PATCH", "/api/admin/users/" + id, { status: act === "approve" ? "active" : "rejected" }); toast(act === "approve" ? "Account approved" : "Registration rejected"); render(); }
      else if (act === "oadd") await openOfficerPicker();
      else if (act === "oedit") {
        const o = (state.officers || []).find((x) => String(x.id) === id);
        openForm("Edit officer", [["name", "Full name"], ["position", "Position"], ["program", "Program", "select", [["", "Select program"], ...Object.entries(PROGRAMS)]], ["year", "Year level & Section", "select", ["", "1-A", "1-B", "2-A", "2-B", "3-A", "3-B", "4-A", "4-B"]]], o,
          async (v) => { await api("PATCH", "/api/admin/users/" + id, v); toast("Officer updated"); render(); });
      }
      else if (act === "odel") { if (confirm("Remove this officer from the list? If they already registered, their account stays and they go back to being a student.")) { await api("DELETE", `/api/admin/officers/${id}`); toast("Officer removed"); render(); } }
      else if (act === "uadd") {
        openForm("Add user", [["name", "Full name"], ["uconnect", "U-connect username"], ["email", "Email", "email"], ["program", "Program", "select", [["", "Select program"], ...Object.entries(PROGRAMS)]], ["year", "Year level & Section", "select", ["1-A", "1-B", "2-A", "2-B", "3-A", "3-B", "4-A", "4-B"]], ["role", "Role", "select", ["student", "admin"]], ["password", "Password (8 characters or more)", "password"]], { role: "student", year: "1-A" },
          async (v) => { await api("POST", "/api/admin/users", v); toast("Account created. It can log in right away. To make someone an officer, use Add officer on the Officers page."); render(); });
      }
      else if (act === "uedit") {
        const u = state.users.find((x) => String(x.id) === id);
        openForm("Edit user", [["name", "Name"], ["email", "Email", "email"], ["program", "Program"], ["year", "Year level"], ["position", "Officer position"], ["role", "Role", "select", ["student", "officer", "admin"]], ["status", "Status", "select", ["active", "pending", "rejected"]], ["official_photo", "Replace official picture (officers only)", "file"], ["password", "New password (leave blank to keep)", "password"]], u,
          async (v) => {
            if (!v.password) delete v.password;
            const f = v.official_photo; delete v.official_photo;
            const photo = f && f.size ? await cropPhoto(f, 320) : "";
            if (f && f.size && !photo) throw new Error("Crop was cancelled. Choose the picture again, or leave it empty.");
            await api("PATCH", "/api/admin/users/" + id, v);
            if (photo && v.role === "officer") await api("PUT", `/api/admin/users/${id}/photo`, { photo });
            toast("User updated"); render(); });
      }
      else if (act === "udel") { if (confirm("Delete this account? This cannot be undone.")) { await api("DELETE", "/api/admin/users/" + id); toast("Account deleted"); render(); } }
      else if (act === "ophoto") { const inp = $("#offIn"); inp.dataset.id = id; inp.click(); }
      else if (act === "ophotodel") { if (confirm("Remove this official picture?")) { await api("DELETE", `/api/admin/users/${id}/photo`); toast("Picture removed"); render(); } }
      else if (act === "photopick") $("#photoIn").click();
      else if (act === "photodel") { await api("PUT", "/api/me/photo", { photo: "" }); me.photo = ""; setWho(); toast("Picture removed"); render(); }
      else if (act === "mdel") { await api("DELETE", "/api/messages/" + id); render(); }
    } catch (ex) { toast(ex.message, true); }
  });
  main.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, err = $(".err", f), data = Object.fromEntries(new FormData(f)); if (err) err.textContent = "";
    try {
      if (f.id === "msgForm") { await api("POST", "/api/messages", data); f.reset(); toast("Message sent"); render(); }
      else if (f.id === "profForm") { if (!data.newPassword) { delete data.newPassword; delete data.currentPassword; } const r = await api("PUT", "/api/me", data); me = { ...me, ...r.user }; if (r.token) { token = r.token; store.setItem("css.token", r.token); } store.setItem("css.user", JSON.stringify(r.user)); setWho(); toast(r.token ? "Password changed" : "Profile saved"); render(); }
    } catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message, true); }
  });
  main.addEventListener("change", async (e) => {
    if (e.target.id === "offIn" && e.target.files[0]) {
      try { const photo = await cropPhoto(e.target.files[0], 320, true); if (!photo) { e.target.value = ""; return; } await api("PUT", `/api/admin/users/${e.target.dataset.id}/photo`, { photo }); e.target.value = ""; toast("Official picture saved"); render(); }
      catch (ex) { toast(ex.message, true); e.target.value = ""; }
      return;
    }
    if (e.target.id !== "photoIn" || !e.target.files[0]) return;
    try { const photo = await cropPhoto(e.target.files[0], 240); if (!photo) { e.target.value = ""; return; } await api("PUT", "/api/me/photo", { photo }); me.photo = photo; setWho(); toast("Picture saved"); render(); }
    catch (ex) { toast(ex.message, true); e.target.value = ""; }
  });
  main.addEventListener("input", (e) => {
    if (e.target.id !== "flt") return;
    const q = e.target.value.trim().toLowerCase(), list = view === "users" ? state.users : state.students;
    $("#rows").innerHTML = (view === "users" ? userRows : studRows)(list.filter((u) => (u.name + " " + u.uconnect).toLowerCase().includes(q)));
  });
  $("#signout").addEventListener("click", (e) => { e.preventDefault(); logout(); });

  /* ---------- phone menu: hamburger button opens the sidebar as a drawer ---------- */
  const side = $("#side"), burger = $("#menuBtn"), scrim = $("#scrim");
  function setMenu(open, focusBack) {
    side.classList.toggle("open", open); scrim.hidden = !open; main.inert = open;
    burger.setAttribute("aria-expanded", String(open)); burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) ($("#nav a.on") || $("#nav a"))?.focus(); else if (focusBack) burger.focus();
  }
  burger.addEventListener("click", () => setMenu(!side.classList.contains("open")));
  scrim.addEventListener("click", () => setMenu(false));
  $("#nav").addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && side.classList.contains("open")) setMenu(false, true); });
  matchMedia("(min-width: 821px)").addEventListener("change", (e) => { if (e.matches) setMenu(false); });
  window.addEventListener("hashchange", () => { view = location.hash.slice(1) || "home"; render(); });

  /* ---------- start ---------- */
  (async () => {
    try {
      me = (await api("GET", "/api/me")).user;
      if (me.role !== ROLE) { location.replace(HOMES[me.role]); return; }
      setWho();
      view = location.hash.slice(1) || "home"; render();
    } catch (_) { /* api() already redirected on 401 */ }
  })();
})();

"use strict";
// Registers the service worker and shows an "Install app" button when Chrome allows it.
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

let deferred = null;
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferred = e;
  if (standalone || document.getElementById("installApp")) return;
  const b = document.createElement("button");
  b.id = "installApp"; b.type = "button"; b.textContent = "INSTALL APP";
  b.style.cssText = "position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:9999;padding:12px 16px;border:2px solid #d4a017;border-radius:8px;background:#0b320b;color:#fff;font:10px 'Press Start 2P',monospace;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)";
  b.onclick = async () => { b.remove(); deferred.prompt(); await deferred.userChoice; deferred = null; };
  document.body.appendChild(b);
});
window.addEventListener("appinstalled", () => { document.getElementById("installApp")?.remove(); deferred = null; });

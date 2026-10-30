// Adds the CITE Week 2026 achievements (pictures + details) to a running CSS platform.
// Usage:  node tools/add-achievements.mjs <admin-uconnect> <admin-password> [http://localhost:3000]
// The pictures (and their small thumbnails) are already resized in tools/achievements/.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const [uconnect, password, base = "http://localhost:3000"] = process.argv.slice(2);
if (!uconnect || !password) { console.log("Usage: node tools/add-achievements.mjs <admin-uconnect> <admin-password> [server-url]"); process.exit(1); }
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "achievements");
const call = async (method, url, body, token) => {
  const r = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url}: ${j.error || r.status}`);
  return j;
};
const token = (await call("POST", "/api/login", { uconnect, password })).token;
const existing = new Set((await call("GET", "/api/achievements", null, token)).items.map((a) => a.title));
for (const a of JSON.parse(await readFile(path.join(dir, "achievements.json"), "utf8"))) {
  if (existing.has(a.title)) { console.log("skip (already there):", a.title); continue; }
  const { id } = await call("POST", "/api/achievements", { title: a.title, date: a.date, details: a.details }, token);
  for (const f of a.photos) {
    const uri = async (file) => "data:image/jpeg;base64," + (await readFile(path.join(dir, file))).toString("base64");
    await call("POST", `/api/achievements/${id}/photos`, { photo: await uri(f), thumb: await uri(f.replace(".jpg", ".thumb.jpg")) }, token);
  }
  console.log("added:", a.title, `(${a.photos.length} picture${a.photos.length > 1 ? "s" : ""})`);
}

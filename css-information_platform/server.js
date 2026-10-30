"use strict";
/*
  CSS Information Platform – backend
  No npm packages needed: only Node.js built-in modules (http, crypto, fs, node:sqlite).
  Run:  node server.js        (add --demo to also create demo officer and student accounts)
*/
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const DATA = path.join(__dirname, "data");
const PUB = path.join(__dirname, "public");
fs.mkdirSync(DATA, { recursive: true });

/* ---------- secret used to sign login tokens (created once, kept in data/.secret) ---------- */
const secretFile = path.join(DATA, ".secret");
let SECRET;
try { SECRET = fs.readFileSync(secretFile, "utf8"); }
catch { SECRET = crypto.randomBytes(32).toString("hex"); fs.writeFileSync(secretFile, SECRET, { mode: 0o600 }); }

/* ---------- database ---------- */
const db = new DatabaseSync(path.join(DATA, "css.db"));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uconnect TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL, email TEXT NOT NULL,
  program TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('student','officer','admin')),
  position TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  official_photo TEXT NOT NULL DEFAULT '',
  terms_at TEXT NOT NULL DEFAULT '',
  must_change INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected')),
  pw TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
// older databases (made before officer photos existed) get the new column automatically
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "photo")) db.exec("ALTER TABLE users ADD COLUMN photo TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "official_photo")) db.exec("ALTER TABLE users ADD COLUMN official_photo TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "terms_at")) db.exec("ALTER TABLE users ADD COLUMN terms_at TEXT NOT NULL DEFAULT ''");
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "must_change")) db.exec("ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 0");
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "email_verified")) {
  db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE users SET email_verified=1 WHERE status='active'");
}
// Officers page list: only people the admin put there on purpose (Add officer). Approving a registration never sets this.
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "on_list")) {
  db.exec("ALTER TABLE users ADD COLUMN on_list INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE users SET on_list=1 WHERE role='officer'"); // officers that exist today stay listed
}
// Officers page order = the order the admin added them (new officer goes last), not alphabetical.
if (!db.prepare("PRAGMA table_info(users)").all().some((c) => c.name === "list_order")) {
  db.exec("ALTER TABLE users ADD COLUMN list_order INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE users SET list_order=id WHERE on_list=1"); // existing officers keep the order they were added in
}
db.exec("CREATE TABLE IF NOT EXISTS reset_requests(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
db.exec(`CREATE TABLE IF NOT EXISTS email_tokens(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
// events, CBL, achievements and announcements share one shape
const KINDS = { events: true, cbl: false, achievements: false, announcements: false }; // value = has venue column
for (const [t, venue] of Object.entries(KINDS)) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${t}(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, date TEXT NOT NULL DEFAULT '', ${venue ? "time TEXT NOT NULL DEFAULT '', venue TEXT NOT NULL DEFAULT ''," : ""}
    details TEXT NOT NULL DEFAULT '',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}

db.exec(`CREATE TABLE IF NOT EXISTS achievement_photos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  full BLOB NOT NULL, thumb BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

db.exec(`CREATE TABLE IF NOT EXISTS cbl_files(
  cbl_id INTEGER PRIMARY KEY REFERENCES cbl(id) ON DELETE CASCADE,
  name TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
const MAX_PDF = (Number(process.env.MAX_PDF_MB) || 10) * 1024 * 1024; // largest allowed PDF

// older databases (made before event times existed) get the new column automatically
if (!db.prepare("PRAGMA table_info(events)").all().some((c) => c.name === "time")) db.exec("ALTER TABLE events ADD COLUMN time TEXT NOT NULL DEFAULT ''");

/* ---------- helpers ---------- */
class HttpError extends Error { constructor(code, msg, tag) { super(msg); this.code = code; this.tag = tag; } }
const bad = (m) => new HttpError(400, m);
const today = () => new Date().toISOString().slice(0, 10);

function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  return salt.toString("hex") + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function checkPw(pw, stored) {
  const [s, h] = String(stored).split(":");
  if (!s || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(s, "hex"), 64), b = Buffer.from(h, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const b64 = (b) => Buffer.from(b).toString("base64url");
const sign = (p) => crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
// a token is tied to the password it was made with: changing or resetting a password logs out every old session
const pvOf = (pw) => crypto.createHash("sha256").update(pw).digest("base64url").slice(0, 12);
function makeToken(u, exp) { const p = b64(JSON.stringify({ id: u.id, pv: pvOf(u.pw), exp })); return p + "." + sign(p); }
const SESSION_MS = 8 * 3600 * 1000, REMEMBER_MS = 7 * 24 * 3600 * 1000; // normal login: 8 hours. "Remember me": 7 days
function readToken(t) {
  const [p, s] = String(t || "").split(".");
  if (!p || !s) return null;
  const good = sign(p);
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try { const o = JSON.parse(Buffer.from(p, "base64url").toString()); return o.exp > Date.now() ? o : null; } catch { return null; }
}
const publicUser = (u) => u && ({ id: u.id, uconnect: u.uconnect, name: u.name, email: u.email, program: u.program, year: u.year, role: u.role, position: u.position, status: u.status, must_change: !!u.must_change });
function str(v, label, max, req = true) {
  v = typeof v === "string" ? v.trim() : "";
  if (req && !v) throw bad(`${label} is required.`);
  if (v.length > max) throw bad(`${label} is too long (max ${max} characters).`);
  return v;
}
function timeOf(v) { v = typeof v === "string" ? v.trim() : ""; if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad("Time must look like 14:30."); return v; }
function dateOf(v) { v = typeof v === "string" ? v.trim() : ""; if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad("Date must look like 2026-10-25."); return v; }
const JPEG = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/;
function jpegBuf(v, label, maxBytes) {
  const m = typeof v === "string" && JPEG.exec(v);
  if (!m) throw bad(`${label} must be a JPG picture.`);
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > maxBytes) throw bad(`${label} is too large.`);
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw bad(`${label} is not a valid JPG picture.`);
  return buf;
}
const UCONNECT = /^[A-Za-z0-9._@-]{3,40}$/;
const mailEnabled = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = mailEnabled ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
}) : null;
async function sendPlatformEmail(to, subject, text, html) {
  if (!mailer) return false;
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, text, html,
  });
  return true;
}
function platformBaseUrl(req) {
  return process.env.APP_URL || `http://${req.headers.host || `localhost:${PORT}`}`;
}

/* login throttle: 8 wrong tries per 10 minutes per IP + username */
const fails = new Map();
function throttle(key, failed) {
  const now = Date.now(), r = (fails.get(key) || []).filter((t) => now - t < 600000);
  if (failed) { r.push(now); fails.set(key, r); }
  if (r.length >= 8) throw new HttpError(429, "Too many failed attempts. Try again in 10 minutes.");
}

/* ---------- seed data (first run only) ---------- */
function seed() {
  const ins = db.prepare("INSERT INTO users(uconnect,name,email,program,year,role,position,status,pw) VALUES(?,?,?,?,?,?,?, 'active', ?)");
  if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
    const u = process.env.ADMIN_UCONNECT || "admin", p = process.env.ADMIN_PASSWORD || "admin123";
    ins.run(u, "CSS Administrator", "admin@example.com", "", "", "admin", "", hashPw(p));
    console.log(`First run: admin account created -> U-connect "${u}". ${process.env.ADMIN_PASSWORD ? "" : 'Default password is "admin123". Change it in Manage profile.'}`);
    const ev = db.prepare("INSERT INTO events(title,date,venue,details) VALUES(?,?,?,?)");
    ev.run("MASSWORK", "2026-09-25", "", "Sample entry. Edit or delete it.");
    ev.run("General Assembly", "2026-09-25", "", "Sample entry. Edit or delete it.");
    ev.run("Tutoring Session 1", "2026-10-03", "", "Sample entry. Edit or delete it.");
    db.prepare("INSERT INTO announcements(title,date,details) VALUES(?,?,?)").run("Welcome to the CSS Platform", today(), "Log in with your U-connect account to see events, achievements and announcements.");
    db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('about',?)").run("The Computer Science Society (CSS) is the organization of Computer Science students. The administrator can replace this text with the organization's background, mission and vision.");
  }
  if (process.argv.includes("--demo") && !db.prepare("SELECT 1 FROM users WHERE uconnect='officer'").get()) {
    ins.run("officer", "Demo Officer", "officer@example.com", "BS Computer Science", "3", "officer", "President", hashPw("officer123"));
    ins.run("student", "Demo Student", "student@example.com", "BS Computer Science", "2", "student", "", hashPw("student123"));
    console.log("Demo accounts created: officer / officer123 and student / student123");
  }
}
seed();

// recovery from the command line: node server.js --reset-password <u-connect> <new password>
const ri = process.argv.indexOf("--reset-password");
if (ri !== -1) {
  const uc = process.argv[ri + 1], pw = process.argv[ri + 2], who = uc && db.prepare("SELECT id FROM users WHERE uconnect=?").get(uc);
  if (!who || !pw || pw.length < 8) { console.error("Usage: node server.js --reset-password <u-connect> <new password (8+ characters)>"); process.exit(1); }
  db.prepare("UPDATE users SET pw=?, must_change=1 WHERE id=?").run(hashPw(pw), who.id);
  db.prepare("DELETE FROM reset_requests WHERE user_id=?").run(who.id);
  console.log(`The password for "${uc}" was reset. They must choose a new password the next time they log in.`);
  process.exit(0);
}

/* ---------- request plumbing ---------- */
function body(req, max = 200000) {
  return new Promise((res, rej) => {
    let n = 0; const c = [];
    req.on("data", (d) => { n += d.length; if (n > max) { rej(new HttpError(413, "Request too large.")); req.destroy(); } else c.push(d); });
    req.on("end", () => { if (!c.length) return res({}); try { const o = JSON.parse(Buffer.concat(c).toString()); res(o && typeof o === "object" ? o : {}); } catch { rej(bad("Invalid JSON.")); } });
    req.on("error", rej);
  });
}
function rawBody(req, max) {
  return new Promise((res, rej) => {
    let n = 0, over = false; const c = [];
    req.on("data", (d) => { n += d.length; if (n > max) over = true; else c.push(d); });
    req.on("end", () => (over ? rej(new HttpError(413, `The PDF is too large (max ${Math.round(max / 1048576)} MB).`)) : res(Buffer.concat(c))));
    req.on("error", rej);
  });
}
function send(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(s);
}
function auth(req, ...roles) {
  const h = req.headers.authorization || "", t = readToken(h.startsWith("Bearer ") ? h.slice(7) : "");
  const u = t && db.prepare("SELECT * FROM users WHERE id=?").get(t.id);
  if (!u || u.status !== "active" || t.pv !== pvOf(u.pw)) throw new HttpError(401, "Please log in again.");
  u.tokExp = t.exp;
  if (u.must_change && req.url.split("?")[0] !== "/api/me") throw new HttpError(403, "Please choose a new password first.", "must_change");
  if (roles.length && !roles.includes(u.role)) throw new HttpError(403, "You do not have access to this.");
  return u;
}
const STAFF = ["officer", "admin"];
// Only the Mayor, Gensec and PRO 1 officers may add or edit content (events, achievements, announcements, CBL). Other officers can only view. Admin can always edit.
const isEditorPos = (p) => /^(mayor|gensec|generalsecretary|pro1|proi)$/.test(String(p || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
function editor(req) {
  const u = auth(req, ...STAFF);
  if (u.role === "officer" && !isEditorPos(u.position)) throw new HttpError(403, "Only the Mayor, Gensec and PRO 1 can add or edit this.");
  return u;
}
// An officer the admin typed in (name, position, picture): listed on the Officers page, but has no login.
// Registering never touches these records, so registering and approving can never double an officer.
const LISTED_PW = "!listed";
const normName = (n) => String(n || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// If the admin turns a registered account into an officer while a typed-in (listed) record with the same name exists, join them into one.
function mergeListed(accountId) {
  const acc = db.prepare("SELECT * FROM users WHERE id=?").get(accountId);
  if (!acc || acc.role !== "officer" || acc.pw === LISTED_PW) return;
  const dup = db.prepare("SELECT * FROM users WHERE pw=? AND id<>?").all(LISTED_PW, accountId).find((u) => normName(u.name) === normName(acc.name));
  if (!dup) return;
  db.prepare("UPDATE users SET position=CASE WHEN position='' THEN ? ELSE position END, official_photo=CASE WHEN official_photo='' THEN ? ELSE official_photo END, program=CASE WHEN program='' THEN ? ELSE program END, year=CASE WHEN year='' THEN ? ELSE year END WHERE id=?")
    .run(dup.position, dup.official_photo, dup.program, dup.year, accountId);
  db.prepare("UPDATE users SET on_list=1, list_order=? WHERE id=?").run(dup.list_order || 0, accountId); // takes the place the typed-in record had
  db.prepare("DELETE FROM users WHERE id=?").run(dup.id);
}

/* ---------- API routes ---------- */
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:\w+/g, "([^/]+)") + "$"), fn });

// --- accounts ---
route("POST", "/api/register", async (req, res) => {
  const b = await body(req);
  const uconnect = str(b.uconnect, "U-connect", 40);
  if (!UCONNECT.test(uconnect)) throw bad("U-connect may only use letters, numbers, dot, dash, underscore and @.");
  const pw = typeof b.password === "string" ? b.password : "";
  if (pw.length < 8 || pw.length > 100) throw bad("Password must be 8 to 100 characters.");
  const email = str(b.email, "Email", 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("Enter a valid email address.");
  if (b.acceptTerms !== true) throw bad("You must accept the Terms and Conditions to register.");
  if (db.prepare("SELECT 1 FROM users WHERE lower(uconnect)=lower(?)").get(uconnect)) throw new HttpError(409, "That U-connect is already registered.");
  if (db.prepare("SELECT 1 FROM users WHERE lower(email)=lower(?)").get(email)) throw new HttpError(409, "That email address is already registered.");
  const name = str(b.name, "Full name", 80);
  const r = db.prepare("INSERT INTO users(uconnect,name,email,program,year,role,position,status,pw,terms_at,email_verified) VALUES(?,?,?,?,?,?,?, 'pending', ?, ?,0)")
    .run(uconnect, name, email.toLowerCase(), str(b.program, "Program", 80), str(b.year, "Year level", 10), String(b.role || "").toLowerCase() === "officer" ? "officer" : "student", "", hashPw(pw), new Date().toISOString()); // pending account with the role chosen on the form (student or officer, never admin). It does NOT go on the Officers page: only the admin adds people there (Officers page > Add officer)
  const userId = Number(r.lastInsertRowid), token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO email_tokens(user_id,token,purpose,expires_at) VALUES(?,?, 'verify',?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,purpose='verify',expires_at=excluded.expires_at,created_at=CURRENT_TIMESTAMP")
    .run(userId, token, Date.now() + 24 * 3600000);
  let emailed = false;
  try {
    const link = `${platformBaseUrl(req)}/verify-email.html?token=${encodeURIComponent(token)}`;
    emailed = await sendPlatformEmail(email.toLowerCase(), "Verify your CSS Platform email", `Verify your email by opening: ${link}\nThis link expires in 24 hours.`, `<p>Verify your CSS Platform email:</p><p><a href="${link}">Verify email address</a></p><p>This link expires in 24 hours.</p>`);
  } catch (e) { console.error("Could not send verification email:", e.message); }
  send(res, 201, { ok: true, emailed });
});
route("POST", "/api/login", async (req, res) => {
  const b = await body(req), key = req.socket.remoteAddress + "|" + String(b.uconnect || "").toLowerCase();
  throttle(key, false);
  const u = db.prepare("SELECT * FROM users WHERE uconnect=?").get(String(b.uconnect || "").trim());
  if (!u || !checkPw(String(b.password || ""), u.pw)) { throttle(key, true); throw new HttpError(401, "U-connect or password is incorrect."); }
  if (b.role && b.role !== u.role) throw new HttpError(403, `This is not a ${b.role} account. Go back and choose your role.`);
  if (u.status === "pending") throw new HttpError(403, "Your registration is still waiting for admin approval.");
  if (u.status === "rejected") throw new HttpError(403, "Your registration was not approved. Contact the administrator.");
  fails.delete(key);
  send(res, 200, { token: makeToken(u, Date.now() + (b.remember === true ? REMEMBER_MS : SESSION_MS)), user: publicUser(u) });
});
// --- email verification and forgot-password reset ---
route("POST", "/api/verify-email", async (req, res) => {
  const b = await body(req), token = String(b.token || "");
  const row = token ? db.prepare("SELECT user_id,expires_at FROM email_tokens WHERE token=? AND purpose='verify'").get(token) : null;
  if (!row || row.expires_at < Date.now()) throw new HttpError(400, "This verification link is invalid or has expired.");
  db.prepare("UPDATE users SET email_verified=1 WHERE id=?").run(row.user_id);
  db.prepare("DELETE FROM email_tokens WHERE user_id=? AND purpose='verify'").run(row.user_id);
  send(res, 200, { ok: true });
});
const fpHits = new Map(); // at most 5 requests per hour per computer
route("POST", "/api/forgot-password", async (req, res) => {
  const ip = req.socket.remoteAddress, now = Date.now(), hits = (fpHits.get(ip) || []).filter((t) => now - t < 3600000);
  if (hits.length >= 5) throw new HttpError(429, "Too many requests. Please try again later, or ask an officer for help.");
  hits.push(now); fpHits.set(ip, hits);
  const b = await body(req), uc = String(b.uconnect || "").trim(), em = String(b.email || "").trim().toLowerCase();
  const u = uc && em ? db.prepare("SELECT * FROM users WHERE lower(uconnect)=lower(?)").get(uc) : null;
  if (u && u.status === "active" && u.email.toLowerCase() === em && u.email_verified === 1) {
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO email_tokens(user_id,token,purpose,expires_at) VALUES(?,?, 'reset',?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token,purpose='reset',expires_at=excluded.expires_at,created_at=CURRENT_TIMESTAMP").run(u.id, token, Date.now() + 30 * 60000);
    try {
      const link = `${platformBaseUrl(req)}/reset-password.html?token=${encodeURIComponent(token)}`;
      await sendPlatformEmail(u.email, "Reset your CSS Platform password", `Reset your password by opening: ${link}\nThis link expires in 30 minutes.`, `<p>Reset your CSS Platform password:</p><p><a href="${link}">Choose a new password</a></p><p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>`);
    } catch (e) { console.error("Could not send password reset email:", e.message); }
  }
  send(res, 200, { ok: true }); // deliberately does not reveal whether an account matched
});
route("POST", "/api/reset-password", async (req, res) => {
  const b = await body(req), token = String(b.token || ""), password = String(b.password || "");
  const row = token ? db.prepare("SELECT user_id,expires_at FROM email_tokens WHERE token=? AND purpose='reset'").get(token) : null;
  if (!row || row.expires_at < Date.now()) throw new HttpError(400, "This reset link is invalid or has expired.");
  if (password.length < 8 || password.length > 100) throw bad("Password must be 8 to 100 characters.");
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id);
  if (!u) throw new HttpError(400, "This reset link is invalid.");
  if (checkPw(password, u.pw)) throw bad("Choose a password different from your current password.");
  db.prepare("UPDATE users SET pw=?,must_change=0 WHERE id=?").run(hashPw(password), u.id);
  db.prepare("DELETE FROM email_tokens WHERE user_id=? AND purpose='reset'").run(u.id);
  db.prepare("DELETE FROM reset_requests WHERE user_id=?").run(u.id);
  send(res, 200, { ok: true });
});
const TEMP_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // no look-alike letters (0/O, 1/l/I)
const tempPassword = () => Array.from({ length: 10 }, () => TEMP_CHARS[crypto.randomInt(TEMP_CHARS.length)]).join("");
route("GET", "/api/admin/resets", (req, res) => { auth(req, "admin"); send(res, 200, { items: db.prepare("SELECT u.id,u.uconnect,u.name,u.email,u.role,r.created_at FROM reset_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at").all() }); });
route("POST", "/api/admin/users/:id/reset-password", (req, res, id) => {
  const me = auth(req, "admin");
  if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(id)) throw new HttpError(404, "User not found.");
  if (Number(id) === me.id) throw bad("To change your own password, use Manage profile.");
  const temp = tempPassword();
  db.prepare("UPDATE users SET pw=?, must_change=1 WHERE id=?").run(hashPw(temp), id);
  db.prepare("DELETE FROM reset_requests WHERE user_id=?").run(id);
  send(res, 200, { password: temp }); // shown once to the admin, who gives it to the person
});
route("DELETE", "/api/admin/resets/:id", (req, res, id) => { auth(req, "admin"); db.prepare("DELETE FROM reset_requests WHERE user_id=?").run(id); send(res, 200, { ok: true }); });
route("GET", "/api/me", (req, res) => { const u = auth(req); send(res, 200, { user: { ...publicUser(u), photo: u.photo, official_photo: u.official_photo } }); });
// officer photo: the browser shrinks it to a 240x240 JPEG first; the server still checks type and size
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
function photoOf(v) {
  v = typeof v === "string" ? v : "";
  if (v && (!PHOTO.test(v) || v.length > 150000)) throw bad("Photo must be a JPEG, PNG or WebP image under about 100 KB.");
  return v;
}
// own picture (students, officers and admins): personal, shown only in the person's own dashboard
route("PUT", "/api/me/photo", async (req, res) => {
  const u = auth(req), b = await body(req), photo = typeof b.photo === "string" ? b.photo : "";
  if (photo && (!PHOTO.test(photo) || photo.length > 150000)) throw bad("Photo must be a JPEG, PNG or WebP image under about 100 KB.");
  db.prepare("UPDATE users SET photo=? WHERE id=?").run(photo, u.id); send(res, 200, { ok: true });
});
route("PUT", "/api/me", async (req, res) => {
  const u = auth(req), b = await body(req);
  if (u.must_change && !b.newPassword) throw bad("Choose a new password to continue.");
  const email = str(b.email, "Email", 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("Enter a valid email address.");
  if (u.must_change && checkPw(String(b.newPassword), u.pw)) throw bad("Choose a different password from the temporary one.");
  db.prepare("UPDATE users SET name=?,email=?,program=?,year=? WHERE id=?").run(str(b.name, "Full name", 80), email, str(b.program, "Program", 80, false), str(b.year, "Year level", 10, false), u.id);
  if (b.newPassword) {
    if (!checkPw(String(b.currentPassword || ""), u.pw)) throw bad("Current password is incorrect.");
    if (String(b.newPassword).length < 8 || String(b.newPassword).length > 100) throw bad("New password must be 8 to 100 characters.");
    db.prepare("UPDATE users SET pw=?, must_change=0 WHERE id=?").run(hashPw(String(b.newPassword)), u.id);
  }
  const fresh = db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
  send(res, 200, { user: publicUser(fresh), ...(b.newPassword ? { token: makeToken(fresh, u.tokExp) } : {}) });
});

// --- dashboard numbers ---
route("GET", "/api/stats", (req, res) => {
  const u = auth(req), n = (sql, ...a) => db.prepare(sql).get(...a).n;
  const s = {
    upcomingEvents: n("SELECT COUNT(*) n FROM events WHERE date>=?", today()), events: n("SELECT COUNT(*) n FROM events"),
    achievements: n("SELECT COUNT(*) n FROM achievements"), announcements: n("SELECT COUNT(*) n FROM announcements"), cbl: n("SELECT COUNT(*) n FROM cbl"),
    officers: n("SELECT COUNT(*) n FROM users WHERE role='officer' AND status='active' AND on_list=1"),
  };
  if (STAFF.includes(u.role)) s.students = n("SELECT COUNT(*) n FROM users WHERE role='student' AND status='active'");
  if (u.role === "admin") { s.pending = n("SELECT COUNT(*) n FROM users WHERE status='pending'"); s.resets = n("SELECT COUNT(*) n FROM reset_requests"); }
  s.recentEvents = db.prepare("SELECT id,title,date FROM events ORDER BY date DESC, id DESC LIMIT 5").all();
  send(res, 200, s);
});

// --- events / cbl / achievements / announcements ---
for (const [t, venue] of Object.entries(KINDS)) {
  const cols = venue ? ["title", "date", "time", "venue", "details"] : ["title", "date", "details"];
  const clean = (b) => ({ title: str(b.title, "Title", 120), date: dateOf(b.date), time: venue ? timeOf(b.time) : "", venue: venue ? str(b.venue, "Venue", 120, false) : "", details: str(b.details, "Details", 4000, false) });
  route("GET", `/api/${t}`, (req, res) => { auth(req); const items = db.prepare(`SELECT t.id,${cols.map((c) => "t." + c).join(",")},t.created_at,u.name AS posted_by FROM ${t} t LEFT JOIN users u ON u.id=t.created_by ORDER BY t.date DESC, t.id DESC`).all();
    if (t === "cbl") { const f = db.prepare("SELECT cbl_id, name, size FROM cbl_files").all(); for (const it of items) { const x = f.find((y) => y.cbl_id === it.id); it.pdf = x ? { name: x.name, size: x.size } : null; } }
    if (t === "achievements") { const ph = db.prepare("SELECT id, achievement_id FROM achievement_photos ORDER BY id").all(); for (const it of items) it.photos = ph.filter((x) => x.achievement_id === it.id).map((x) => x.id); }
    send(res, 200, { items }); });
  route("POST", `/api/${t}`, async (req, res) => {
    const u = editor(req), c = clean(await body(req));
    const r = db.prepare(`INSERT INTO ${t}(${cols.join(",")},created_by) VALUES(${cols.map(() => "?").join(",")},?)`).run(...cols.map((k) => c[k]), u.id);
    send(res, 201, { id: Number(r.lastInsertRowid) });
  });
  route("PUT", `/api/${t}/:id`, async (req, res, id) => {
    editor(req); const c = clean(await body(req));
    const r = db.prepare(`UPDATE ${t} SET ${cols.map((k) => k + "=?").join(",")} WHERE id=?`).run(...cols.map((k) => c[k]), id);
    if (!r.changes) throw new HttpError(404, "Not found."); send(res, 200, { ok: true });
  });
  route("DELETE", `/api/${t}/:id`, (req, res, id) => {
    auth(req, "admin");
    if (!db.prepare(`DELETE FROM ${t} WHERE id=?`).run(id).changes) throw new HttpError(404, "Not found."); send(res, 200, { ok: true });
  });
}

// --- CBL PDF: officers and admins upload; everyone logged in can open it in a new tab ---
route("PUT", "/api/cbl/:id/file", async (req, res, id) => {
  editor(req);
  if (!db.prepare("SELECT 1 FROM cbl WHERE id=?").get(id)) throw new HttpError(404, "Not found.");
  if (!String(req.headers["content-type"] || "").startsWith("application/pdf")) throw bad("Only PDF files are allowed.");
  if (Number(req.headers["content-length"]) > MAX_PDF) {
    // read (and throw away) a too-big upload so the browser can receive the "too large" message instead of a broken connection
    if (Number(req.headers["content-length"]) < MAX_PDF * 5) { req.resume(); await new Promise((r) => { req.on("end", r); req.on("error", r); }); }
    throw new HttpError(413, `The PDF is too large (max ${Math.round(MAX_PDF / 1048576)} MB).`);
  }
  const buf = await rawBody(req, MAX_PDF);
  if (buf.length < 8 || buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw bad("That file is not a valid PDF.");
  let name = ""; try { name = decodeURIComponent(String(req.headers["x-file-name"] || "")); } catch { /* keep default */ }
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 120) || "document.pdf";
  if (!/\.pdf$/i.test(name)) name += ".pdf";
  db.prepare("INSERT INTO cbl_files(cbl_id,name,size,data) VALUES(?,?,?,?) ON CONFLICT(cbl_id) DO UPDATE SET name=excluded.name,size=excluded.size,data=excluded.data,updated_at=CURRENT_TIMESTAMP").run(id, name, buf.length, buf);
  send(res, 200, { ok: true, name, size: buf.length });
});
route("DELETE", "/api/cbl/:id/file", (req, res, id) => { editor(req); db.prepare("DELETE FROM cbl_files WHERE cbl_id=?").run(id); send(res, 200, { ok: true }); });
const fileSig = (id, exp) => sign(`cblfile:${id}:${exp}`);
route("GET", "/api/cbl/:id/file-link", (req, res, id) => {
  auth(req);
  if (!db.prepare("SELECT 1 FROM cbl_files WHERE cbl_id=?").get(id)) throw new HttpError(404, "This entry has no PDF.");
  const exp = Date.now() + 10 * 60 * 1000; // link works for 10 minutes
  send(res, 200, { url: `/files/cbl/${Number(id)}?e=${exp}&s=${fileSig(Number(id), exp)}` });
});
function servePdf(req, res, pathname, url) {
  const m = pathname.match(/^\/files\/cbl\/(\d+)$/); if (!m) throw new HttpError(404, "Not found.");
  const id = Number(m[1]), e = Number(url.searchParams.get("e")), sig = String(url.searchParams.get("s") || ""), good = fileSig(id, e);
  if (!e || sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) throw new HttpError(403, "Invalid link.");
  if (e < Date.now()) throw new HttpError(403, "This link has expired. Open the PDF again from the CBL page.");
  const row = db.prepare("SELECT name, data FROM cbl_files WHERE cbl_id=?").get(id); if (!row) throw new HttpError(404, "Not found.");
  const buf = Buffer.from(row.data), ascii = row.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": buf.length, "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  res.end(req.method === "HEAD" ? undefined : buf);
}

// --- achievement pictures (officers and admins add; everyone logged in can view) ---
const MAX_PHOTOS = 6;
route("POST", "/api/achievements/:id/photos", async (req, res, id) => {
  editor(req);
  if (!db.prepare("SELECT 1 FROM achievements WHERE id=?").get(id)) throw new HttpError(404, "Not found.");
  if (db.prepare("SELECT COUNT(*) n FROM achievement_photos WHERE achievement_id=?").get(id).n >= MAX_PHOTOS) throw bad(`An achievement can have up to ${MAX_PHOTOS} pictures.`);
  const b = await body(req, 900000);
  const full = jpegBuf(b.photo, "Picture", 600000), thumb = jpegBuf(b.thumb, "Thumbnail", 80000);
  const r = db.prepare("INSERT INTO achievement_photos(achievement_id,full,thumb) VALUES(?,?,?)").run(id, full, thumb);
  send(res, 201, { id: Number(r.lastInsertRowid) });
});
route("GET", "/api/photos/:id", (req, res, id) => {
  auth(req);
  const row = db.prepare("SELECT full, thumb FROM achievement_photos WHERE id=?").get(id);
  if (!row) throw new HttpError(404, "Not found.");
  const buf = Buffer.from(new URL(req.url, "http://x").searchParams.get("thumb") ? row.thumb : row.full);
  res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": buf.length, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" });
  res.end(buf);
});
route("DELETE", "/api/photos/:id", (req, res, id) => {
  editor(req);
  if (!db.prepare("DELETE FROM achievement_photos WHERE id=?").run(id).changes) throw new HttpError(404, "Not found.");
  send(res, 200, { ok: true });
});

// --- people lists ---
route("GET", "/api/officers", (req, res) => { auth(req); send(res, 200, { items: db.prepare("SELECT id,name,position,program,year,official_photo AS photo FROM users WHERE role='officer' AND status='active' AND on_list=1 ORDER BY list_order, id").all() }); });
route("GET", "/api/students", (req, res) => { auth(req, ...STAFF); send(res, 200, { items: db.prepare("SELECT id,uconnect,name,email,program,year FROM users WHERE role='student' AND status='active' ORDER BY TRIM(name) COLLATE NOCASE").all() }); });

// --- organizational background ---
route("GET", "/api/about", (req, res) => { auth(req); send(res, 200, { about: (db.prepare("SELECT value FROM settings WHERE key='about'").get() || { value: "" }).value }); });
route("PUT", "/api/about", async (req, res) => {
  auth(req, "admin"); const b = await body(req);
  db.prepare("INSERT INTO settings(key,value) VALUES('about',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(str(b.about, "Background", 8000)); send(res, 200, { ok: true });
});

// --- contact messages ---
route("POST", "/api/messages", async (req, res) => {
  const u = auth(req), b = await body(req);
  db.prepare("INSERT INTO messages(user_id,sender,subject,body) VALUES(?,?,?,?)").run(u.id, `${u.name} (${u.uconnect})`, str(b.subject, "Subject", 120), str(b.message, "Message", 4000)); send(res, 201, { ok: true });
});
route("GET", "/api/messages", (req, res) => { auth(req, ...STAFF); send(res, 200, { items: db.prepare("SELECT id,sender,subject,body,created_at FROM messages ORDER BY id DESC").all() }); });
route("DELETE", "/api/messages/:id", (req, res, id) => { auth(req, "admin"); db.prepare("DELETE FROM messages WHERE id=?").run(id); send(res, 200, { ok: true }); });

// --- admin: registrations and users ---
// admin adds a person directly: the account is active at once (no approval step)
route("POST", "/api/admin/users", async (req, res) => {
  auth(req, "admin"); const b = await body(req);
  const uconnect = str(b.uconnect, "U-connect", 40);
  if (!UCONNECT.test(uconnect)) throw bad("U-connect may only use letters, numbers, dot, dash, underscore and @.");
  const role = ["student", "officer", "admin"].includes(b.role) ? b.role : "student";
  const pw = typeof b.password === "string" ? b.password : "";
  if (pw.length < 8 || pw.length > 100) throw bad("Password must be 8 to 100 characters.");
  const email = str(b.email, "Email", 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("Enter a valid email address.");
  if (db.prepare("SELECT 1 FROM users WHERE uconnect=?").get(uconnect)) throw new HttpError(409, "That U-connect is already registered.");
  photoOf(b.official_photo);
  const r = db.prepare("INSERT INTO users(uconnect,name,email,program,year,role,position,status,pw) VALUES(?,?,?,?,?,?,?, 'active', ?)")
    .run(uconnect, str(b.name, "Full name", 80), email, str(b.program, "Program", 80, false), str(b.year, "Year level", 10, false), role, role === "officer" ? str(b.position, "Position", 60, false) : "", hashPw(pw));
  if (role === "officer" && b.official_photo) db.prepare("UPDATE users SET official_photo=? WHERE id=?").run(photoOf(b.official_photo), Number(r.lastInsertRowid));
  mergeListed(Number(r.lastInsertRowid));
  send(res, 201, { id: Number(r.lastInsertRowid) });
});
route("GET", "/api/admin/users", (req, res) => {
  auth(req, "admin");
  send(res, 200, { items: db.prepare("SELECT u.id,u.uconnect,u.name,u.email,u.program,u.year,u.role,u.position,u.status,u.created_at,(u.official_photo<>'') AS has_photo FROM users u WHERE u.pw<>? ORDER BY u.status='pending' DESC, TRIM(u.name) COLLATE NOCASE").all(LISTED_PW) });
});
route("PATCH", "/api/admin/users/:id", async (req, res, id) => {
  const me = auth(req, "admin"), b = await body(req), u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!u) throw new HttpError(404, "User not found.");
  const role = ["student", "officer", "admin"].includes(b.role) ? b.role : u.role;
  const status = ["pending", "active", "rejected"].includes(b.status) ? b.status : u.status;
  if (u.id === me.id && (role !== "admin" || status !== "active")) throw bad("You cannot remove your own admin access.");
  db.prepare("UPDATE users SET name=?,email=?,program=?,year=?,position=?,role=?,status=? WHERE id=?")
    .run(str(b.name ?? u.name, "Name", 80), str(b.email ?? u.email, "Email", 120, u.pw !== LISTED_PW), str(b.program ?? u.program, "Program", 80, false), str(b.year ?? u.year, "Year", 10, false), str(b.position ?? u.position, "Position", 60, false), role, status, u.id);
  if (b.password) {
    if (String(b.password).length < 8) throw bad("Password must be at least 8 characters.");
    db.prepare("UPDATE users SET pw=?, must_change=? WHERE id=?").run(hashPw(String(b.password)), u.id === me.id ? 0 : 1, u.id); // a password set by the admin is temporary
    db.prepare("DELETE FROM reset_requests WHERE user_id=?").run(u.id);
  }
  if (role !== "officer") db.prepare("UPDATE users SET on_list=0 WHERE id=?").run(u.id); // changing the role here never adds anyone to the Officers page; only Add officer does
  mergeListed(u.id);
  send(res, 200, { ok: true });
});
// official picture: only the admin sets it, so students always see the same formal photo
route("PUT", "/api/admin/users/:id/photo", async (req, res, id) => {
  auth(req, "admin"); const b = await body(req), u = db.prepare("SELECT role FROM users WHERE id=?").get(id);
  if (!u) throw new HttpError(404, "User not found.");
  if (u.role !== "officer") throw bad("Only officers have an official picture.");
  db.prepare("UPDATE users SET official_photo=? WHERE id=?").run(photoOf(b.photo), id); send(res, 200, { ok: true });
});
route("DELETE", "/api/admin/users/:id/photo", (req, res, id) => { auth(req, "admin"); db.prepare("UPDATE users SET official_photo='' WHERE id=?").run(id); send(res, 200, { ok: true }); });
// The admin types the officer in (name, position, picture). The person does not need to be registered yet and no U-connect is typed.
// When they register later with the same full name, that registration is attached to this same record, so there is no duplicate.
route("POST", "/api/admin/officers", async (req, res) => {
  auth(req, "admin"); const b = await body(req);
  const name = str(b.name, "Full name", 80), position = str(b.position, "Position", 60), photo = photoOf(b.official_photo), key = normName(name);
  if (!key) throw bad("Enter the officer's full name.");
  const rows = db.prepare("SELECT id,name,role,status FROM users").all().filter((u) => normName(u.name) === key);
  const offAcc = rows.find((u) => u.role === "officer");
  if (offAcc && db.prepare("SELECT on_list FROM users WHERE id=?").get(offAcc.id).on_list) throw new HttpError(409, "That person is already on the Officers page.");
  if (offAcc) { // already has the officer role (set in Manage users) but is not on the Officers page yet: list the same account
    db.prepare("UPDATE users SET on_list=1, list_order=(SELECT COALESCE(MAX(list_order),0)+1 FROM users), position=?, official_photo=? WHERE id=?").run(position, photo, offAcc.id);
    return send(res, 200, { ok: true });
  }
  const members = rows.filter((u) => u.role === "student");
  if (members.length > 1) throw bad("More than one member has that name. Open Manage users and set the right person's role to officer instead.");
  if (members.length === 1) { // already registered: make that same account an officer instead of creating another one
    if (members[0].status !== "active") throw bad("That person registered but is not approved yet. Approve the registration first.");
    db.prepare("UPDATE users SET role='officer', on_list=1, list_order=(SELECT COALESCE(MAX(list_order),0)+1 FROM users), position=?, official_photo=? WHERE id=?").run(position, photo, members[0].id);
    return send(res, 200, { ok: true });
  }
  db.prepare("INSERT INTO users(uconnect,name,email,program,year,role,position,status,pw,official_photo,on_list,list_order) VALUES(?,?,?,?,?, 'officer', ?, 'active', ?, ?, 1, (SELECT COALESCE(MAX(list_order),0)+1 FROM users))")
    .run("listed:" + crypto.randomBytes(6).toString("hex"), name, "", str(b.program, "Program", 80, false), str(b.year, "Year level", 10, false), position, LISTED_PW, photo);
  send(res, 201, { ok: true });
});
// Remove from officers: the person goes back to being a student (their account and data stay).
route("DELETE", "/api/admin/officers/:id", (req, res, id) => {
  auth(req, "admin");
  const u = db.prepare("SELECT role,pw FROM users WHERE id=?").get(id);
  if (!u) throw new HttpError(404, "That person was not found.");
  if (u.role !== "officer") throw bad("That person is not an officer.");
  if (u.pw === LISTED_PW) db.prepare("DELETE FROM users WHERE id=?").run(id); // never registered: just take them off the list
  else db.prepare("UPDATE users SET role='student', on_list=0, position='', official_photo='' WHERE id=?").run(id);
  send(res, 200, { ok: true });
});
route("DELETE", "/api/admin/users/:id", (req, res, id) => {
  const me = auth(req, "admin");
  if (Number(id) === me.id) throw bad("You cannot delete your own account.");
  if (!db.prepare("DELETE FROM users WHERE id=?").run(id).changes) throw new HttpError(404, "User not found."); send(res, 200, { ok: true });
});

/* ---------- static files (the website) ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".json": "application/json" };
const SEC = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};
function serveStatic(req, res, pathname) {
  let p = path.normalize(path.join(PUB, decodeURIComponent(pathname)));
  if (!p.startsWith(PUB)) { res.writeHead(403, SEC); return res.end("Forbidden"); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404, { ...SEC, "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { ...SEC, "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300" });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

/* ---------- server ---------- */
// clean up doubles made by the older version: a typed-in officer and a registered officer with the same name become one
db.prepare("SELECT id FROM users WHERE role='officer' AND pw<>?").all(LISTED_PW).forEach((u) => mergeListed(u.id));

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), pathname = url.pathname;
  try {
    if (pathname.startsWith("/api/")) {
      for (const r of routes) {
        const m = r.method === req.method && pathname.match(r.re);
        if (m) return await r.fn(req, res, ...m.slice(1));
      }
      throw new HttpError(404, "Unknown API route.");
    }
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed.");
    if (pathname.startsWith("/files/")) return servePdf(req, res, pathname, url);
    serveStatic(req, res, pathname);
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message, ...(e.tag ? { code: e.tag } : {}) });
    console.error(e); send(res, 500, { error: "Something went wrong on the server." });
  }
}).listen(PORT, "0.0.0.0", () => console.log(`CSS Platform running on port ${PORT}`));

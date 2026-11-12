import { eligNo } from "./elig.js";
// FilmPro Worker: static site + shared data (D1) + staff login with phone & PIN.
// Customer site stays public. Staff pages need a session: techs open job pages, admins open everything.

const SEP_O = "\u0001"; // child of an object container: "<key>\u0001<subkey>"
const SEP_A = "\u0002"; // child of an id-array container: "<key>\u0002<id>"
const SYNC_KEYS = [
  "filmpro_bookings_v1", "filmpro_claims_v1", "filmpro_techpub_v1", "filmpro_inspect_v1", "filmpro_handover_v1",
  "filmpro_ratings_v1", "filmpro_assign_v1", "filmpro_film_v1", "filmpro_tech_v1", "filmpro_suite_v1",
  "filmpro_warranty_v1", "filmpro_technotify_v1", "filmpro_glass_v1", "filmpro_p1_v1",
];
const PAGES = {
  admin: ["tech", "admin-v2", "staff-users"],
  tech: ["app", "inspect", "handover", "notify"],
};
const SESSION_DAYS = 30;
const MAX_FAILS = 5, LOCK_MIN = 15;
const PBKDF2_ITER = 100000;
const MAX_REC = 1_800_000; // D1 row limit is 2 MB

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/")) return await api(req, env, url);
      const page = path.replace(/^\//, "").replace(/\.html$/, "").replace(/\/$/, "");
      const need = PAGES.admin.includes(page) ? "admin" : PAGES.tech.includes(page) ? "tech" : null;
      if (need) {
        const u = await currentUser(req, env);
        if (!u) return Response.redirect(new URL("/staff?next=" + encodeURIComponent(path + url.search + url.hash), url).toString(), 302);
        if (need === "admin" && u.role !== "admin") return Response.redirect(new URL("/app", url).toString(), 302);
        // techs work from the tech app; the inspection and handover pages open for one job at a time
        if (u.role !== "admin" && page === "notify") return Response.redirect(new URL("/app#feed", url).toString(), 302);
        if (u.role !== "admin" && (page === "inspect" || page === "handover") && !url.searchParams.get("job")) return Response.redirect(new URL("/app", url).toString(), 302);
        const res = await env.ASSETS.fetch(req);
        const h = new Headers(res.headers);
        h.set("Cache-Control", "no-store");
        h.set("X-Robots-Tag", "noindex");
        return new Response(res.body, { status: res.status, headers: h });
      }
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e);
      return json({ error: "server_error" }, 500);
    }
  },
};

// ---------- helpers
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
const digits = (s) => String(s || "").replace(/\D/g, "");
const normPhone = (s) => { let d = digits(s); if (d.startsWith("66") && d.length === 11) d = "0" + d.slice(2); return d; };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const randHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function hashPin(pin, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const validPin = (p) => /^\d{6}$/.test(String(p || ""));
const cookie = (req, name) => { const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? m[1] : null; };
const sessionCookie = (tok, maxAge) => `fp_s=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function currentUser(req, env) {
  const tok = cookie(req, "fp_s");
  if (!tok || !/^[0-9a-f]{64}$/.test(tok)) return null;
  const row = await env.DB.prepare("SELECT u.id, u.phone, u.name, u.role, u.tech_id, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1").bind(await sha256(tok)).first();
  if (!row || row.expires_at < Date.now()) return null;
  return row;
}
const pubUser = (u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, techId: u.tech_id || null });
async function body(req) { try { return await req.json(); } catch { return {}; } }
async function nextV(env) {
  const r = await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('seq', '1') ON CONFLICT(k) DO UPDATE SET v = CAST(v AS INTEGER) + 1 RETURNING v").first();
  return Number(r.v);
}

// ---------- API
async function api(req, env, url) {
  const p = url.pathname, m = req.method;

  // --- first-run: create the owner account with the one-time setup code
  if (p === "/api/setup" && m === "GET") {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
    return json({ needed: n.n === 0 });
  }
  if (p === "/api/setup" && m === "POST") {
    const b = await body(req);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
    if (n.n > 0) return json({ error: "already_setup" }, 409);
    const s = await env.DB.prepare("SELECT v FROM settings WHERE k = 'setup_hash'").first();
    if (!s || !safeEq(await sha256(String(b.code || "").trim().toUpperCase()), s.v)) return json({ error: "bad_code" }, 403);
    const phone = normPhone(b.phone);
    if (phone.length < 9 || !String(b.name || "").trim() || !validPin(b.pin)) return json({ error: "invalid" }, 400);
    const salt = randHex(16);
    await env.DB.prepare("INSERT INTO users (phone, name, role, pin_hash, pin_salt, created_at) VALUES (?, ?, 'admin', ?, ?, ?)").bind(phone, String(b.name).trim().slice(0, 80), await hashPin(b.pin, salt), salt, Date.now()).run();
    await env.DB.prepare("DELETE FROM settings WHERE k = 'setup_hash'").run();
    return login(env, phone, b.pin);
  }

  if (p === "/api/login" && m === "POST") {
    const b = await body(req);
    return login(env, normPhone(b.phone), String(b.pin || ""));
  }
  if (p === "/api/logout" && m === "POST") {
    const tok = cookie(req, "fp_s");
    if (tok) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(tok)).run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
  }

  // --- public (customer) endpoints: no login, checked by booking phone
  if (p === "/api/public/push" && m === "POST") return publicPush(env, await body(req));
  if (p === "/api/public/apply" && m === "POST") return publicApply(req, env, await body(req));
  if (p === "/api/public/track" && m === "GET") return publicTrack(env, url.searchParams.get("id"), url.searchParams.get("phone"));

  // --- staff endpoints
  const u = await currentUser(req, env);
  if (!u) return json({ error: "login_required" }, 401);

  if (p === "/api/me") return json({ user: pubUser(u) });
  if (p === "/api/pin" && m === "POST") {
    const b = await body(req);
    const row = await env.DB.prepare("SELECT pin_hash, pin_salt FROM users WHERE id = ?").bind(u.id).first();
    if (!safeEq(await hashPin(String(b.old || ""), row.pin_salt), row.pin_hash)) return json({ error: "bad_pin" }, 403);
    if (!validPin(b.pin)) return json({ error: "invalid" }, 400);
    const salt = randHex(16);
    await env.DB.prepare("UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?").bind(await hashPin(b.pin, salt), salt, u.id).run();
    return json({ ok: true });
  }

  if (p === "/api/sync/pull" && m === "POST") return syncPull(env, u, await body(req));
  if (p === "/api/sync" && m === "POST") return syncPush(env, u, await body(req));

  // --- user management (admin)
  if (p.startsWith("/api/users")) {
    if (u.role !== "admin") return json({ error: "forbidden" }, 403);
    if (m === "GET") {
      const r = await env.DB.prepare("SELECT id, phone, name, role, tech_id, active, created_at FROM users ORDER BY active DESC, role, name").all();
      return json({ users: r.results });
    }
    if (m === "POST") {
      const b = await body(req);
      const phone = normPhone(b.phone), name = String(b.name || "").trim().slice(0, 80), role = b.role === "admin" ? "admin" : "tech";
      if (b.id) {
        const id = Number(b.id);
        if (id === u.id && (b.active === false || role !== "admin")) return json({ error: "self" }, 400);
        const sets = [], args = [];
        if (name) { sets.push("name = ?"); args.push(name); }
        if (phone.length >= 9) { sets.push("phone = ?"); args.push(phone); }
        sets.push("role = ?"); args.push(role);
        sets.push("tech_id = ?"); args.push(b.techId ? String(b.techId).slice(0, 40) : null);
        if (typeof b.active === "boolean") { sets.push("active = ?"); args.push(b.active ? 1 : 0); }
        if (b.pin) { if (!validPin(b.pin)) return json({ error: "invalid_pin" }, 400); const salt = randHex(16); sets.push("pin_hash = ?", "pin_salt = ?"); args.push(await hashPin(b.pin, salt), salt); }
        try { await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...args, id).run(); } catch { return json({ error: "phone_taken" }, 409); }
        if (b.active === false || b.pin) await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
        return json({ ok: true });
      }
      if (phone.length < 9 || !name || !validPin(b.pin)) return json({ error: "invalid" }, 400);
      const salt = randHex(16);
      try {
        await env.DB.prepare("INSERT INTO users (phone, name, role, tech_id, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(phone, name, role, b.techId ? String(b.techId).slice(0, 40) : null, await hashPin(b.pin, salt), salt, Date.now()).run();
      } catch { return json({ error: "phone_taken" }, 409); }
      return json({ ok: true });
    }
  }
  return json({ error: "not_found" }, 404);
}

async function login(env, phone, pin) {
  const now = Date.now();
  const f = await env.DB.prepare("SELECT count, locked_until FROM login_fail WHERE phone = ?").bind(phone).first();
  if (f && f.locked_until > now) return json({ error: "locked", until: f.locked_until }, 429);
  const u = await env.DB.prepare("SELECT * FROM users WHERE phone = ? AND active = 1").bind(phone).first();
  const ok = u && validPin(pin) && safeEq(await hashPin(pin, u.pin_salt), u.pin_hash);
  if (!ok) {
    const c = (f && f.locked_until <= now && f.locked_until > 0 ? 0 : f ? f.count : 0) + 1;
    const lock = c >= MAX_FAILS ? now + LOCK_MIN * 60000 : 0;
    await env.DB.prepare("INSERT INTO login_fail (phone, count, locked_until) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET count = excluded.count, locked_until = excluded.locked_until").bind(phone, lock ? 0 : c, lock).run();
    return json({ error: lock ? "locked" : "bad_login", left: lock ? 0 : MAX_FAILS - c, until: lock || undefined }, lock ? 429 : 401);
  }
  await env.DB.prepare("DELETE FROM login_fail WHERE phone = ?").bind(phone).run();
  const tok = randHex(32);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(tok), u.id, now + SESSION_DAYS * 864e5),
  ]);
  return json({ ok: true, user: pubUser(u) }, 200, { "Set-Cookie": sessionCookie(tok, SESSION_DAYS * 86400) });
}

// ---------- customer side
const BK = "filmpro_bookings_v1", SUITE = "filmpro_suite_v1", RATE = "filmpro_ratings_v1";
async function getRec(env, k, rid) {
  const r = await env.DB.prepare("SELECT data FROM records WHERE k = ? AND rid = ? AND deleted = 0").bind(k, rid).first();
  return r ? JSON.parse(r.data) : null;
}
// A customer may create a booking, attach a slip (a pending deposit payment) and rate the job.
// They can never mark anything paid, assign a tech or change job progress: staff do that.
async function publicPush(env, b) {
  const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  const out = [];
  let v = 0;
  for (const it of items) {
    const k = it.k, data = it.data;
    if (!data || typeof data !== "object") continue;
    if (JSON.stringify(data).length > MAX_REC) { out.push({ rid: it.rid, error: "too_large" }); continue; }
    if (k === BK) {
      const id = String(data.id || "");
      if (!id || id !== it.rid || id.length > 64 || id.includes(SEP_A) || id.includes(SEP_O)) continue;
      const phone = normPhone(data.phone);
      if (phone.length < 9) { out.push({ rid: id, error: "no_phone" }); continue; }
      const ex = await getRec(env, BK, id);
      if (ex && normPhone(ex.phone) !== phone) { out.push({ rid: id, error: "forbidden" }); continue; }
      const row = { ...data };
      if (ex) {
        row.tech = ex.tech ?? null;
        row.status = data.status === "cancelled" && ["booked", "pending"].includes(ex.status) ? "cancelled" : ex.status;
        row.deposit = { ...(data.deposit || {}), status: ex.deposit?.status ?? "unpaid", paidAt: ex.deposit?.paidAt, payId: ex.deposit?.payId };
        row.history = Array.isArray(ex.history) ? ex.history.concat((data.history || []).slice((ex.history || []).length)).slice(0, 200) : data.history;
      } else {
        row.tech = null;
        row.status = "booked";
        if (row.deposit) row.deposit = { ...row.deposit, status: "unpaid", paidAt: undefined, payId: undefined };
      }
      v = v || (await nextV(env));
      await upsert(env, BK, id, row, v);
      out.push({ rid: id, ok: true });
    } else if (k === SUITE && String(it.rid || "").startsWith("payments" + SEP_A)) {
      const bk = await getRec(env, BK, String(data.bid || ""));
      if (!bk || normPhone(bk.phone) !== normPhone(b.phone)) { out.push({ rid: it.rid, error: "forbidden" }); continue; }
      const kind = data.kind === "balance" ? "balance" : "deposit";
      const pid = "PAYW-" + data.bid + "-" + kind;
      const ex = await getRec(env, SUITE, "payments" + SEP_A + pid);
      if (ex && ex.status === "paid") { out.push({ rid: pid, ok: true }); continue; }
      const row = { id: pid, bid: data.bid, kind, amount: Number(data.amount) || 0, status: "pending", createdAt: data.createdAt || Date.now(), payload: data.payload, to: data.to, slip: data.slip, slipAt: data.slipAt, method: data.method === "PromptPay" ? "PromptPay" : undefined, src: "web" };
      v = v || (await nextV(env));
      await upsert(env, SUITE, "payments" + SEP_A + pid, row, v);
      out.push({ rid: pid, ok: true });
    } else if (k === RATE) {
      const bk = await getRec(env, BK, String(it.rid || ""));
      if (!bk || normPhone(bk.phone) !== normPhone(b.phone)) { out.push({ rid: it.rid, error: "forbidden" }); continue; }
      v = v || (await nextV(env));
      await upsert(env, RATE, it.rid, data, v);
      out.push({ rid: it.rid, ok: true });
    }
  }
  return json({ ok: true, results: out });
}
async function upsert(env, k, rid, data, v) {
  await env.DB.prepare("INSERT INTO records (k, rid, data, deleted, v) VALUES (?, ?, ?, 0, ?) ON CONFLICT(k, rid) DO UPDATE SET data = excluded.data, deleted = 0, v = excluded.v").bind(k, rid, JSON.stringify(data), v).run();
}
// Everything one booking's tracking page needs, and nothing about other customers.
async function publicTrack(env, id, phone) {
  id = String(id || "");
  const bk = id ? await getRec(env, BK, id) : null;
  if (!bk || normPhone(bk.phone) !== normPhone(phone)) return json({ error: "not_found" }, 404);
  const like = (k) => env.DB.prepare("SELECT k, rid, data FROM records WHERE k = ? AND deleted = 0 AND (rid = ? OR rid LIKE ?)").bind(k, id, "%" + SEP_O + id).all();
  const recs = [{ k: BK, rid: id, data: JSON.stringify(bk) }];
  for (const k of ["filmpro_claims_v1", "filmpro_assign_v1", "filmpro_inspect_v1", "filmpro_handover_v1", RATE, "filmpro_warranty_v1"]) {
    const r = await like(k);
    recs.push(...r.results);
  }
  const pays = await env.DB.prepare("SELECT k, rid, data FROM records WHERE k = ? AND deleted = 0 AND rid LIKE ? AND json_extract(data, '$.bid') = ?").bind(SUITE, "payments" + SEP_A + "%", id).all();
  recs.push(...pays.results);
  // jobs arrays inside inspect/handover are keyed by booking id
  for (const k of ["filmpro_inspect_v1", "filmpro_handover_v1"]) {
    const r = await env.DB.prepare("SELECT k, rid, data FROM records WHERE k = ? AND deleted = 0 AND rid = ?").bind(k, "jobs" + SEP_A + id).first();
    if (r) recs.push(r);
  }
  // the assigned tech's public card, without home location
  const claim = recs.find((r) => r.k === "filmpro_claims_v1" && r.rid === id);
  const tid = claim ? JSON.parse(claim.data)?.tech : null;
  if (tid) {
    const t = await getRec(env, "filmpro_techpub_v1", "techs" + SEP_A + tid);
    if (t) recs.push({ k: "filmpro_techpub_v1", rid: "techs" + SEP_A + tid, data: JSON.stringify({ id: t.id, name: t.name, level: t.level, avg: t.avg, verified: t.verified }) });
  }
  const seen = new Set();
  return json({ recs: recs.filter((r) => { const key = r.k + "|" + r.rid; if (seen.has(key)) return false; seen.add(key); return true; }) });
}

// ---------- staff sync
// Admins see and write everything. A tech sees open jobs (customer contact hidden) and the jobs they
// hold, their own profile, and shop settings they need; never other techs' data, payments or rosters.
const K = {
  claims: "filmpro_claims_v1", assign: "filmpro_assign_v1", inspect: "filmpro_inspect_v1", handover: "filmpro_handover_v1",
  pub: "filmpro_techpub_v1", tech: "filmpro_tech_v1", film: "filmpro_film_v1", glass: "filmpro_glass_v1", notify: "filmpro_technotify_v1", warranty: "filmpro_warranty_v1",
};
const CLOSED = ["cancelled", "done", "completed", "closed", "refunded"];
const splitRid = (rid) => { const ia = rid.indexOf(SEP_A), io = rid.indexOf(SEP_O); const i = ia > 0 ? ia : io > 0 ? io : -1; return i < 0 ? [rid, null] : [rid.slice(0, i), rid.slice(i + 1)]; };
async function techView(env, u) {
  const me = u.tech_id || "U" + u.id;
  const claims = {};
  (await env.DB.prepare("SELECT rid, data FROM records WHERE k = ? AND deleted = 0 AND rid <> '#'").bind(K.claims).all()).results.forEach((r) => { if (splitRid(r.rid)[1] == null) { try { claims[r.rid] = JSON.parse(r.data); } catch {} } });
  const bks = (await env.DB.prepare("SELECT rid, json_extract(data, '$.status') AS st, json_extract(data, '$.tech') AS tech FROM records WHERE k = ? AND deleted = 0 AND rid <> '#'").bind(BK).all()).results;
  const mine = new Set(), open = new Set(), all = new Set();
  for (const b of bks) {
    all.add(b.rid);
    const holder = (claims[b.rid] && claims[b.rid].tech) || b.tech || null;
    if (holder) { if (holder === me) mine.add(b.rid); }
    else if (!CLOSED.includes(b.st)) open.add(b.rid);
  }
  const techs = new Set((await env.DB.prepare("SELECT rid FROM records WHERE k = ? AND deleted = 0 AND rid LIKE ?").bind(K.pub, "techs" + SEP_A + "%").all()).results.map((r) => splitRid(r.rid)[1]));
  const payMine = new Set();
  if (mine.size) {
    const pays = (await env.DB.prepare("SELECT rid, json_extract(data, '$.bid') AS bid FROM records WHERE k = ? AND deleted = 0 AND rid LIKE ?").bind(SUITE, "payments" + SEP_A + "%").all()).results;
    for (const p of pays) if (mine.has(p.bid)) payMine.add(p.rid);
  }
  return { me, mine, open, all, claims, techs, payMine };
}
// "full" | "mask" | false
function techSees(k, rid, V) {
  if (rid === "#") return "full";
  const [top, child] = splitRid(rid);
  const job = child != null ? child : top;
  const otherTech = (x) => x !== V.me && V.techs.has(x);
  switch (k) {
    case BK: return V.mine.has(rid) ? "full" : V.open.has(rid) ? "mask" : false;
    case K.claims: return V.mine.has(rid) ? "full" : false;
    case K.assign: return V.mine.has(rid) || V.open.has(rid) ? "full" : false;
    case K.inspect: case K.handover: case RATE: case K.warranty: case K.notify:
      if (V.all.has(job)) return V.mine.has(job) ? "full" : false;
      return otherTech(job) || otherTech(top) ? false : "full";
    case K.pub: return top === "techs" ? (child === V.me ? "full" : false) : "full";
    case K.tech: return top === "inst" && child === V.me ? "full" : false;
    case SUITE: return top === "payments" && child != null ? (V.payMine.has(rid) ? "full" : false) : ["settings", "duration", "avail"].includes(top) ? "full" : false;
    case K.film: case K.glass: return "full";
    default: return false;
  }
}
function maskBooking(b) {
  const o = { ...b, _masked: true };
  for (const f of ["phone", "payment", "refCode", "consent", "history", "coupon", "email", "line"]) delete o[f];
  if (o.deposit) o.deposit = { amount: o.deposit.amount, status: o.deposit.status };
  return o;
}
function trimMeta(data, k, V) {
  try {
    const m = JSON.parse(data);
    const ok = (rid) => !!techSees(k, rid, V);
    if (m.t === "a") m.o = m.o.filter(ok);
    else if (m.t === "o") {
      m.o = m.o.filter((t) => (m.c && m.c[t]) ? true : ok(t));
      for (const t of Object.keys(m.c || {})) m.c[t].o = m.c[t].o.filter((x) => ok(t + (m.c[t].t === "a" ? SEP_A : SEP_O) + x));
    }
    return JSON.stringify(m);
  } catch { return data; }
}
async function syncPull(env, u, b) {
  const since = Number(b.since || 0);
  const cur = await env.DB.prepare("SELECT v FROM settings WHERE k = 'seq'").first();
  const v = cur ? Number(cur.v) : 0;
  if (u.role === "admin") {
    const rows = await env.DB.prepare("SELECT k, rid, data, deleted, v FROM records WHERE v > ? ORDER BY v LIMIT 3000").bind(since).all();
    return json({ role: "admin", v: rows.results.length === 3000 ? rows.results[rows.results.length - 1].v : v, recs: rows.results, more: rows.results.length === 3000 });
  }
  const V = await techView(env, u);
  const have = b.have && typeof b.have === "object" ? b.have : {};
  const list = (await env.DB.prepare("SELECT k, rid, v FROM records WHERE deleted = 0").all()).results;
  const vis = {}, need = [];
  for (const k of SYNC_KEYS) vis[k] = [];
  for (const r of list) {
    if (!vis[r.k]) continue;
    const s = techSees(r.k, r.rid, V);
    if (!s) continue;
    vis[r.k].push(r.rid);
    const h = have[r.k] && have[r.k][r.rid];
    if (r.v > since || !h || (h === 2) !== (s === "mask")) need.push(r);
  }
  const recs = [];
  for (let i = 0; i < need.length; i += 50) {
    const part = need.slice(i, i + 50);
    const stmts = part.map((r) => env.DB.prepare("SELECT k, rid, data, v FROM records WHERE k = ? AND rid = ?").bind(r.k, r.rid));
    const res = await env.DB.batch(stmts);
    res.forEach((x) => { const r = x.results && x.results[0]; if (!r) return; const s = techSees(r.k, r.rid, V);
      if (s === "mask") r.data = JSON.stringify(maskBooking(JSON.parse(r.data)));
      else if (r.rid === "#") r.data = trimMeta(r.data, r.k, V);
      recs.push({ ...r, deleted: 0 }); });
  }
  return json({ role: "tech", me: V.me, v, recs, vis });
}
function techMayWrite(k, rid, data, ex, V) {
  if (rid === "#") return false;
  const [top, child] = splitRid(rid);
  const job = child != null ? child : top;
  switch (k) {
    case BK: return V.mine.has(rid);
    case K.claims: return (!ex || ex.tech === V.me) && (data === null || (data && data.tech === V.me)) && (V.mine.has(rid) || (V.open.has(rid) && (!data || V.eligOk(rid))));
    case K.assign: return V.mine.has(rid) || (ex && ex.tech === V.me);
    case K.inspect: case K.handover: case RATE: case K.warranty: case K.notify:
      if (V.all.has(job)) return V.mine.has(job);
      return !(V.techs.has(job) && job !== V.me);
    case K.pub: return top === "techs" && child === V.me;
    case K.film: case K.glass: return true;
    default: return false;
  }
}
async function syncPush(env, u, b) {
  if (!SYNC_KEYS.includes(b.k)) return json({ error: "bad_key" }, 400);
  let ups = Object.entries(b.upserts || {}), dels = Array.isArray(b.deletes) ? b.deletes.map(String) : [];
  if (ups.length + dels.length > 2000) return json({ error: "too_many" }, 413);
  const rejected = [];
  if (u.role !== "admin") {
    const V = await techView(env, u);
    const exOf = async (rid) => (b.k === K.claims || b.k === K.assign) ? await getRec(env, b.k, rid) : null;
    if (b.k === K.claims) {
      const t = await getRec(env, K.pub, "techs" + SEP_A + V.me), rules = await getRec(env, K.pub, "rules");
      const cache = {};
      for (const [rid] of ups) { const bk = await getRec(env, BK, rid); cache[rid] = bk ? eligNo(t, bk, rules).length === 0 : false; }
      V.eligOk = (rid) => !!cache[rid];
    }
    const okU = [], okD = [];
    for (const [rid, data] of ups) { if (techMayWrite(b.k, rid, data, await exOf(rid), V)) okU.push([rid, data]); else rejected.push(rid); }
    for (const rid of dels) { if (techMayWrite(b.k, rid, null, await exOf(rid), V)) okD.push(rid); else rejected.push(rid); }
    ups = okU; dels = okD;
    // a tech can never change who holds a booking or its payment through the booking record
    if (b.k === BK) for (const pair of ups) { const ex = await getRec(env, BK, pair[0]); if (ex) pair[1] = { ...pair[1], tech: ex.tech ?? pair[1].tech, deposit: ex.deposit ?? pair[1].deposit, payment: ex.payment }; }
  }
  const stmts = [];
  const v = await nextV(env);
  for (const [rid, data] of ups) {
    const s = JSON.stringify(data);
    if (rid.length > 200 || s.length > MAX_REC) { rejected.push(rid); continue; }
    if (u.role !== "admin" && b.k === K.claims) {
      // first tech to claim wins, even when two press at the same moment
      const r = await env.DB.prepare("INSERT INTO records (k, rid, data, deleted, v, by_user) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(k, rid) DO UPDATE SET data = excluded.data, deleted = 0, v = excluded.v, by_user = excluded.by_user WHERE records.deleted = 1 OR json_extract(records.data, '$.tech') IS NULL OR json_extract(records.data, '$.tech') = ?").bind(b.k, rid, s, v, u.id, data.tech).run();
      if (!r.meta || !r.meta.changes) rejected.push(rid);
      continue;
    }
    stmts.push(env.DB.prepare("INSERT INTO records (k, rid, data, deleted, v, by_user) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(k, rid) DO UPDATE SET data = excluded.data, deleted = 0, v = excluded.v, by_user = excluded.by_user").bind(b.k, rid, s, v, u.id));
  }
  for (const rid of dels) stmts.push(env.DB.prepare("UPDATE records SET deleted = 1, data = NULL, v = ?, by_user = ? WHERE k = ? AND rid = ?").bind(v, u.id, b.k, rid));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true, v, rejected });
}

// ---------- public tech application (film.karnet.org/join)
const TXT = (x, n) => String(x == null ? "" : x).trim().slice(0, n);
const okFile = (f) => f && typeof f === "object" && typeof f.data === "string" && /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/.test(f.data) ? { name: TXT(f.name, 120), type: TXT(f.type, 40), data: f.data } : null;
async function publicApply(req, env, b) {
  const ip = req.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now(), key = "apply:" + ip;
  const f = await env.DB.prepare("SELECT count, locked_until FROM login_fail WHERE phone = ?").bind(key).first();
  const windowStart = f && f.locked_until > now ? f : null;
  if (windowStart && windowStart.count >= 5) return json({ error: "too_many" }, 429);
  const a = b.app || {};
  const idCard = digits(a.idCard), phone = normPhone(a.phone);
  const history = (Array.isArray(a.history) ? a.history : []).slice(0, 8).map((h) => ({ shop: TXT(h.shop, 120), pos: TXT(h.pos, 80), from: TXT(h.from, 4), to: TXT(h.to, 4), years: Math.max(0, (+h.to || 0) - (+h.from || 0)), evidence: okFile(h.evidence) }));
  const err = [];
  if (!TXT(a.name, 100)) err.push("name");
  if (idCard.length !== 13) err.push("idCard");
  if (!TXT(a.address, 400)) err.push("address");
  if (phone.length < 9) err.push("phone");
  if (TXT(a.years, 3) === "") err.push("years");
  if (!history.length || history.some((h) => !h.shop || !h.from || !h.to || !h.evidence)) err.push("history");
  if (!TXT(a.bank && a.bank.acct, 30)) err.push("bank");
  if (err.length) return json({ error: "invalid", fields: err }, 400);
  const id = "TW" + now.toString(36).toUpperCase() + randHex(2).toUpperCase();
  const rec = {
    id, name: TXT(a.name, 100), idCard, address: TXT(a.address, 400), phone, line: TXT(a.line, 60), years: TXT(a.years, 3), history,
    brands: (Array.isArray(a.brands) ? a.brands : []).map((x) => TXT(x, 30)).slice(0, 20), photo: okFile(a.photo),
    bank: { bank: TXT(a.bank && a.bank.bank, 60), acct: TXT(a.bank && a.bank.acct, 30), acctName: TXT(a.bank && a.bank.acctName, 100) },
    status: "รอตรวจ", adminNote: "", tier: "gen", premiumTest: false, suspended: false, createdAt: now, log: [[now, "สมัครผ่านเว็บ"]], src: "web",
  };
  if (JSON.stringify(rec).length > MAX_REC) return json({ error: "too_large" }, 413);
  const dup = await env.DB.prepare("SELECT 1 FROM records WHERE k = ? AND deleted = 0 AND rid LIKE ? AND (json_extract(data, '$.idCard') = ? OR json_extract(data, '$.phone') = ?)").bind(K.tech, "inst" + SEP_A + "%", idCard, phone).first();
  if (dup) return json({ error: "duplicate" }, 409);
  await upsert(env, K.tech, "inst" + SEP_A + id, rec, await nextV(env));
  await env.DB.prepare("INSERT INTO login_fail (phone, count, locked_until) VALUES (?, 1, ?) ON CONFLICT(phone) DO UPDATE SET count = CASE WHEN locked_until > ? THEN count + 1 ELSE 1 END, locked_until = CASE WHEN locked_until > ? THEN locked_until ELSE ? END").bind(key, now + 36e5, now, now, now + 36e5).run();
  return json({ ok: true, id });
}

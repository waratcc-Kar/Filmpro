/* FilmPro shared data sync.
   The apps keep using localStorage exactly as before; this script mirrors the shared keys to the
   server (Cloudflare D1) record by record, so every phone and computer sees the same bookings.
   Staff pages: full two-way sync. Customer site: pushes its own booking, slip and rating, and pulls
   only its own booking for the tracking page. Must load before the page's own scripts. */
(function () {
  "use strict";
  var KEYS = ["filmpro_bookings_v1", "filmpro_claims_v1", "filmpro_techpub_v1", "filmpro_inspect_v1", "filmpro_handover_v1",
    "filmpro_ratings_v1", "filmpro_assign_v1", "filmpro_film_v1", "filmpro_tech_v1", "filmpro_suite_v1",
    "filmpro_warranty_v1", "filmpro_technotify_v1", "filmpro_glass_v1", "filmpro_p1_v1"];
  var SEP_O = "\u0001", SEP_A = "\u0002";
  var LS; try { LS = window.localStorage; } catch (e) { return; }
  if (!LS || location.protocol === "file:") return;
  var origSet = Storage.prototype.setItem, origRemove = Storage.prototype.removeItem;
  var page = location.pathname.replace(/^\//, "").replace(/\.html$/, "").replace(/\/$/, "");
  var STAFF = ["app", "tech", "admin-v2", "staff-users", "inspect", "handover", "notify"].indexOf(page) >= 0;

  // ---------- record encoding: a stored value <-> {rid: value}, rid "#" holds the shape and order
  function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
  function okId(x) { return isObj(x) && (typeof x.id === "string" || typeof x.id === "number") && String(x.id) !== "" && String(x.id).indexOf(SEP_A) < 0 && String(x.id).indexOf(SEP_O) < 0 && String(x.id) !== "#"; }
  function idArr(a) { if (!Array.isArray(a) || !a.every(okId)) return false; var s = {}; for (var i = 0; i < a.length; i++) { var k = String(a[i].id); if (s[k]) return false; s[k] = 1; } return true; }
  function recMap(o) { if (!isObj(o)) return false; var ks = Object.keys(o); if (!ks.length) return false; for (var i = 0; i < ks.length; i++) { var v = o[ks[i]]; if (!v || typeof v !== "object" || ks[i].indexOf(SEP_A) >= 0 || ks[i].indexOf(SEP_O) >= 0) return false; } return true; }
  function safeKey(k) { return k !== "#" && k !== "=" && k !== "" && k.indexOf(SEP_A) < 0 && k.indexOf(SEP_O) < 0; }
  function enc(val) {
    var recs = {}, meta;
    if (idArr(val)) { meta = { t: "a", o: val.map(function (x) { return String(x.id); }) }; val.forEach(function (x) { recs[String(x.id)] = x; }); }
    else if (isObj(val) && Object.keys(val).every(safeKey)) {
      meta = { t: "o", o: Object.keys(val), c: {} };
      meta.o.forEach(function (k) {
        var x = val[k];
        if (idArr(x) && x.length) { meta.c[k] = { t: "a", o: x.map(function (i) { return String(i.id); }) }; x.forEach(function (i) { recs[k + SEP_A + i.id] = i; }); }
        else if (recMap(x)) { meta.c[k] = { t: "o", o: Object.keys(x) }; Object.keys(x).forEach(function (s) { recs[k + SEP_O + s] = x[s]; }); }
        else recs[k] = x;
      });
    } else { meta = { t: "v" }; recs["="] = val; }
    recs["#"] = meta;
    return recs;
  }
  function dec(recs, ver) {
    ver = ver || {};
    var m = recs["#"] || null;
    if (m && m.t === "v") return recs["="];
    if (!m && "=" in recs) return recs["="];
    var top = {}, kids = {};
    Object.keys(recs).forEach(function (rid) {
      if (rid === "#" || rid === "=") return;
      var ia = rid.indexOf(SEP_A), io = rid.indexOf(SEP_O);
      if (ia > 0) { var k = rid.slice(0, ia); (kids[k] = kids[k] || { t: "a", it: {} }).it[rid.slice(ia + 1)] = rid; }
      else if (io > 0) { var k2 = rid.slice(0, io); (kids[k2] = kids[k2] || { t: "o", it: {} }).it[rid.slice(io + 1)] = rid; }
      else top[rid] = rid;
    });
    function order(listed, have) {
      var res = listed.filter(function (x) { return Object.prototype.hasOwnProperty.call(have, x); });
      var seen = {}; res.forEach(function (x) { seen[x] = 1; });
      var extra = Object.keys(have).filter(function (x) { return !seen[x]; }).sort(function (a, b) { return (ver[have[a]] || 0) - (ver[have[b]] || 0); });
      return res.concat(extra);
    }
    var topKeys = Object.keys(top);
    var isArr = m ? m.t === "a" : (!Object.keys(kids).length && topKeys.length > 0 && topKeys.every(function (r) { return isObj(recs[r]) && String(recs[r].id) === r; }));
    if (isArr) return order(m ? m.o : [], top).map(function (r) { return recs[r]; });
    var have = {};
    topKeys.forEach(function (k) { have[k] = k; });
    Object.keys(kids).forEach(function (k) { if (!have[k]) { var first = Object.keys(kids[k].it)[0]; have[k] = kids[k].it[first]; } });
    var listed = m ? m.o.filter(function (k) { return have[k] || (m.c && m.c[k]); }) : [];
    listed.forEach(function (k) { if (!have[k]) have[k] = k; });
    var out = {};
    order(listed, have).forEach(function (k) {
      var c = m && m.c ? m.c[k] : null;
      if (c || (kids[k] && !(m && top[k]))) {
        var t = c ? c.t : kids[k].t, it = kids[k] ? kids[k].it : {};
        var ids = order(c ? c.o : [], it);
        if (t === "a") out[k] = ids.map(function (s) { return recs[it[s]]; });
        else { var o = {}; ids.forEach(function (s) { o[s] = recs[it[s]]; }); out[k] = o; }
      } else if (top[k]) out[k] = recs[k];
    });
    return out;
  }
  window.FPSyncCodec = { enc: enc, dec: dec };

  function xhr(method, url, data, cb) {
    var x = new XMLHttpRequest();
    x.open(method, url, !!cb);
    x.setRequestHeader("Content-Type", "application/json");
    if (cb) x.onreadystatechange = function () { if (x.readyState === 4) cb(x.status, parse(x.responseText)); };
    try { x.send(data == null ? null : JSON.stringify(data)); } catch (e) { return { status: 0 }; }
    return cb ? null : { status: x.status, body: parse(x.responseText) };
  }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function readLocal(k) { var s = LS.getItem(k); return s == null ? undefined : parse(s); }
  function notify(k, oldV, newV) {
    try { window.dispatchEvent(new StorageEvent("storage", { key: k, oldValue: oldV, newValue: newV, storageArea: LS, url: location.href })); } catch (e) {}
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  if (STAFF) staffMode(); else customerMode();

  // ================= staff: two-way sync of all shared keys
  function staffMode() {
    var cache = {}, maxV = 0, dirty = {}, timers = {}, inflight = {}, role = null, ignore = {};
    KEYS.forEach(function (k) { cache[k] = { recs: {}, ver: {}, json: null }; });
    function have() {
      var h = {};
      KEYS.forEach(function (k) { var o = h[k] = {}; Object.keys(cache[k].recs).forEach(function (rid) { var d = cache[k].recs[rid]; o[rid] = d && d._masked ? 2 : 1; }); });
      return h;
    }
    function apply(recs, vis) {
      var touched = {};
      if (vis) Object.keys(vis).forEach(function (k) {
        var c = cache[k]; if (!c) return;
        var keep = {}; vis[k].forEach(function (r) { keep[r] = 1; });
        Object.keys(c.recs).forEach(function (rid) { if (!keep[rid]) { delete c.recs[rid]; delete c.ver[rid]; touched[k] = 1; } });
      });
      recs.forEach(function (r) {
        var c = cache[r.k]; if (!c) return;
        if (r.deleted) { delete c.recs[r.rid]; delete c.ver[r.rid]; }
        else { c.recs[r.rid] = parse(r.data); c.ver[r.rid] = r.v; }
        if (r.v > maxV) maxV = r.v;
        touched[r.k] = 1;
      });
      return Object.keys(touched);
    }
    function writeLocal(k, fire) {
      var c = cache[k];
      if (!Object.keys(c.recs).length) {
        if (role === "tech" && LS.getItem(k) != null) { var o0 = LS.getItem(k); origRemove.call(LS, k); c.json = null; if (fire) notify(k, o0, null); }
        return;
      }
      var s = JSON.stringify(dec(c.recs, c.ver));
      var old = LS.getItem(k);
      c.json = s;
      if (old === s) return;
      origSet.call(LS, k, s);
      if (fire) notify(k, old, s);
    }
    // 1) first pull, synchronous so the page starts with shared data
    var ok = false;
    for (var guard = 0; guard < 20; guard++) {
      var r = xhr("POST", "/api/sync/pull", { since: maxV, have: have() });
      if (r.status === 401) { location.href = "/staff?next=" + encodeURIComponent(location.pathname + location.search + location.hash); return; }
      if (r.status !== 200 || !r.body) break;
      role = r.body.role;
      if (role === "tech" && r.body.me) origSet.call(LS, "filmpro_me", r.body.me);
      // signed in through /staff already: skip the old page-level admin password
      if (role === "admin") { try { sessionStorage.setItem("fp_admin", "1"); } catch (e) {} }
      apply(r.body.recs || [], r.body.vis);
      if (r.body.v > maxV) maxV = r.body.v;
      ok = true;
      if (!r.body.more) break;
    }
    if (ok) KEYS.forEach(function (k) {
      if (Object.keys(cache[k].recs).length || role === "tech") writeLocal(k, false);
      else if (LS.getItem(k) != null) { dirty[k] = 1; schedule(k, 50); } // first admin device with data seeds the server
    });
    window.FPSync = { online: ok, flush: flushAll, pull: pull, role: role, idle: function (k) { return !dirty[k] && !inflight[k]; } };
    if (role === "tech" && (page === "inspect" || page === "handover")) techSkin();

    // 2) push local changes
    Storage.prototype.setItem = function (k, v) { origSet.call(this, k, v); if (this === LS && cache[k]) { dirty[k] = 1; schedule(k); } };
    Storage.prototype.removeItem = function (k) { origRemove.call(this, k); if (this === LS && cache[k]) { dirty[k] = 1; schedule(k); } };
    function schedule(k, ms) { clearTimeout(timers[k]); timers[k] = setTimeout(function () { flush(k); }, ms == null ? 400 : ms); }
    function flushAll() { Object.keys(dirty).forEach(flush); }
    function flush(k) {
      if (!dirty[k] || inflight[k]) return;
      var c = cache[k], raw = LS.getItem(k);
      if (raw === c.json) { delete dirty[k]; return; }
      var val = raw == null ? undefined : parse(raw);
      if (raw != null && val === null && raw !== "null") { delete dirty[k]; return; }
      var next = raw == null ? {} : enc(val), ups = {}, dels = [], n = 0;
      var ig = ignore[k] || {};
      Object.keys(next).forEach(function (rid) { if (!(rid in c.recs) || !same(c.recs[rid], next[rid])) { if (ig[rid] === JSON.stringify(next[rid])) return; ups[rid] = next[rid]; n++; } });
      Object.keys(c.recs).forEach(function (rid) { if (!(rid in next) && !ig["-" + rid]) { dels.push(rid); n++; } });
      delete dirty[k];
      if (!n) { c.json = raw; return; }
      inflight[k] = 1;
      xhr("POST", "/api/sync", { k: k, upserts: ups, deletes: dels }, function (st, res) {
        inflight[k] = 0;
        if (st === 200 && res && res.ok) {
          var rej = {}; (res.rejected || []).forEach(function (rid) { rej[rid] = 1; });
          var ig2 = ignore[k] = ignore[k] || {};
          Object.keys(ups).forEach(function (rid) { if (rej[rid]) { ig2[rid] = JSON.stringify(ups[rid]); return; } c.recs[rid] = parse(JSON.stringify(ups[rid])); c.ver[rid] = res.v; });
          dels.forEach(function (rid) { if (rej[rid]) { ig2["-" + rid] = 1; return; } delete c.recs[rid]; delete c.ver[rid]; });
          c.json = raw;
          badge(st);
        } else {
          dirty[k] = 1; badge(st);
          if (st === 401) { location.href = "/staff?next=" + encodeURIComponent(location.pathname); return; }
          if (st !== 413) schedule(k, 5000);
        }
        if (dirty[k]) schedule(k);
      });
    }
    // 3) pull other devices' changes
    var pulling = false;
    function pull() {
      if (pulling || document.hidden) return;
      pulling = true;
      xhr("POST", "/api/sync/pull", { since: maxV, have: role === "tech" ? have() : null }, function (st, res) {
        pulling = false; badge(st);
        if (st !== 200 || !res) return;
        var ks = apply(res.recs || [], res.vis);
        if (res.v > maxV) maxV = res.v;
        ks.forEach(function (k) { if (dirty[k] || inflight[k]) { flush(k); return; } writeLocal(k, true); });
        if (res.more) setTimeout(pull, 50);
      });
    }
    setInterval(pull, 8000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) pull(); else flushAll(); });
    window.addEventListener("pagehide", flushAll);

    // 4) who is signed in + sign out
    var el;
    function badge(st) { if (!el) return; el.classList.toggle("off", st !== 200); }
    function ui() {
      xhr("GET", "/api/me", null, function (st, res) {
        if (st !== 200 || !res || !res.user) return;
        var u = res.user;
        var css = document.createElement("style");
        css.textContent = ".fp-me{position:fixed;left:10px;bottom:10px;z-index:99999;display:flex;align-items:center;gap:6px;padding:4px 4px 4px 10px;border-radius:999px;background:#0F1B2D;color:#fff;font:500 12px/1.2 Prompt,system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.2)}.fp-me i{width:7px;height:7px;border-radius:50%;background:#22C55E}.fp-me.off i{background:#F59E0B}.fp-me a,.fp-me button{color:#fff;background:rgba(255,255,255,.14);border:0;border-radius:999px;padding:6px 10px;font:inherit;cursor:pointer;text-decoration:none}@media print{.fp-me{display:none}}";
        document.head.appendChild(css);
        el = document.createElement("div");
        el.className = "fp-me";
        el.innerHTML = '<i title="ซิงก์ข้อมูล"></i><span></span>' + (u.role === "admin" ? '<a href="/staff-users">ผู้ใช้</a>' : "") + '<button type="button">ออกจากระบบ</button>';
        el.querySelector("span").textContent = u.name + (u.role === "admin" ? " · แอดมิน" : " · ช่าง");
        el.querySelector("button").onclick = function () { flushAll(); xhr("POST", "/api/logout", {}, function () { location.href = "/staff"; }); };
        document.body.appendChild(el);
      });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ui); else ui();
  }

  // ================= tech mode for the inspection / handover pages: one job, no admin tools
  function techSkin() {
    var job = new URLSearchParams(location.search).get("job");
    if (!job) return;
    document.documentElement.classList.add("fp-tech");
    var css = document.createElement("style");
    css.textContent = [
      "html.fp-tech body{font-family:Prompt,system-ui,sans-serif!important;background:#F3F6F9!important;color:#0F1B2D;padding-top:60px!important;padding-bottom:5rem!important}",
      "html.fp-tech #fpSuiteNav,html.fp-tech .fp-hide,html.fp-tech .fp-me{display:none!important}",
      ".fp-back{position:fixed;top:0;left:0;right:0;z-index:9999;height:56px;display:flex;align-items:center;gap:.6rem;padding:0 1rem;background:#fff;border-bottom:1px solid #DDE3EA;font:600 16px/1.2 Prompt,system-ui,sans-serif}",
      ".fp-back a{display:inline-flex;align-items:center;gap:.35rem;color:#0F1B2D;text-decoration:none;min-height:44px;padding-right:.5rem}",
      ".fp-back small{margin-left:auto;font-weight:500;color:#56677A}",
      "html.fp-tech button,html.fp-tech select,html.fp-tech input:not([type=checkbox]):not([type=radio]),html.fp-tech textarea{font-family:inherit!important}",
      "html.fp-tech .btn{min-height:48px;border-radius:12px!important;background:#1E4FD8!important;border-color:#1E4FD8!important}",
      "html.fp-tech .btn2{min-height:44px;border-radius:12px!important}",
      "html.fp-tech .card{border-radius:16px!important;border-color:#DDE3EA!important}",
      "html.fp-tech #tabs{position:sticky;top:56px;z-index:5;background:#F3F6F9;padding:.5rem 0;overflow-x:auto;white-space:nowrap;flex-wrap:nowrap!important}",
      "html.fp-tech #tabs::-webkit-scrollbar{display:none}"
    ].join("");
    document.head.appendChild(css);
    var HIDE_TXT = ["รับโอนแล้ว", "รับเงินสด", "ข้อมูลตัวอย่าง", "รีเซ็ต", "รายการ (แอดมิน)", "ตั้งค่าประกัน", "ตรวจสอบประกัน", "เลือกงาน", "นำเข้า JSON", "ส่งออก JSON", "ดึงงานใหม่", "รอยืนยัน", "งานของฉัน"];
    function clean() {
      var b = document.body; if (!b) return;
      b.querySelectorAll("button,a").forEach(function (el) { var t = (el.textContent || "").trim(); if (!el.closest(".fp-back") && HIDE_TXT.some(function (h) { return t.indexOf(h) === 0; })) el.classList.add("fp-hide"); });
      b.querySelectorAll("select").forEach(function (el) { var o = el.options[0]; if (o && /เลือกช่าง/.test(o.textContent)) el.classList.add("fp-hide"); });
      b.querySelectorAll("div,p,footer,span").forEach(function (el) { if (!el.children.length && /localStorage|ข้อมูลเก็บในเครื่องนี้|ต้นแบบ|ระบบจำลอง/.test(el.textContent || "")) el.classList.add("fp-hide"); });
      if (page === "handover") b.querySelectorAll("div,section").forEach(function (el) { if (el.firstElementChild && /^เพิ่มงาน/.test((el.firstElementChild.textContent || "").trim()) && el.querySelector("input")) el.classList.add("fp-hide"); });
    }
    function bar() {
      if (document.querySelector(".fp-back")) return;
      var d = document.createElement("div");
      d.className = "fp-back";
      d.innerHTML = '<a href="/app#job/' + encodeURIComponent(job) + '"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>กลับไปหน้างาน</a><small></small>';
      d.querySelector("small").textContent = (page === "inspect" ? "ตรวจรถ · " : "ส่งมอบ · ") + job;
      document.body.appendChild(d);
    }
    function open() {
      try {
        if (page === "inspect") new Function("id", "open_(id)")(job);
        else new Function("id", "cur=id;go('s1')")(job);
      } catch (e) { console.warn("open job", e); }
    }
    // when the step is finished, return to the job in the tech app once the save reached the server
    var doneKey = page === "inspect" ? "filmpro_inspect_v1" : "filmpro_handover_v1";
    var leaving = false;
    function checkDone() {
      if (leaving) return;
      var d = readLocal(doneKey) || {}, it = page === "inspect" ? (d.ins || {})[job] : (d.ho || {})[job];
      var done = it && (page === "inspect" ? it.status === "ตรวจแล้ว" : it.status === "ส่งมอบแล้ว");
      if (!done || !startDone) return;
      leaving = true;
      window.FPSync.flush();
      var t0 = Date.now();
      (function wait() { if ((window.FPSync.idle(doneKey) && window.FPSync.idle("filmpro_handover_v1")) || Date.now() - t0 > 6000) location.href = "/app#job/" + encodeURIComponent(job); else setTimeout(wait, 200); })();
    }
    var startDone = false;
    window.addEventListener("load", function () {
      var d0 = readLocal(doneKey) || {}, it0 = page === "inspect" ? (d0.ins || {})[job] : (d0.ho || {})[job];
      startDone = !(it0 && (it0.status === "ตรวจแล้ว" || it0.status === "ส่งมอบแล้ว"));
      bar(); open(); clean();
      new MutationObserver(function () { clean(); checkDone(); }).observe(document.body, { childList: true, subtree: true });
    });
  }

  // ================= customer: push own booking / slip / rating, pull own booking for tracking
  function customerMode() {
    var WATCH = { filmpro_bookings_v1: 1, filmpro_suite_v1: 1, filmpro_ratings_v1: 1 };
    var snap = {}, timers = {};
    Object.keys(WATCH).forEach(function (k) { var v = readLocal(k); snap[k] = v === undefined ? {} : enc(v); });
    Storage.prototype.setItem = function (k, v) { origSet.call(this, k, v); if (this === LS && WATCH[k]) { clearTimeout(timers[k]); timers[k] = setTimeout(function () { push(k); }, 500); } };
    function phoneOf(bid) { var b = (readLocal("filmpro_bookings_v1") || []).filter(function (x) { return x && x.id === bid; })[0]; return b ? b.phone : ""; }
    function push(k) {
      var v = readLocal(k); if (v === undefined) return;
      var next = enc(v), prev = snap[k] || {}, items = [];
      Object.keys(next).forEach(function (rid) {
        if (rid === "#" || (rid in prev && same(prev[rid], next[rid]))) return;
        if (k === "filmpro_bookings_v1" && rid.indexOf(SEP_A) < 0 && rid.indexOf(SEP_O) < 0) items.push({ k: k, rid: rid, data: next[rid], phone: next[rid] && next[rid].phone });
        else if (k === "filmpro_suite_v1" && rid.indexOf("payments" + SEP_A) === 0 && next[rid] && next[rid].slip) items.push({ k: k, rid: rid, data: next[rid], phone: phoneOf(next[rid].bid) });
        else if (k === "filmpro_ratings_v1" && rid.indexOf(SEP_A) < 0 && rid.indexOf(SEP_O) < 0 && rid !== "=") items.push({ k: k, rid: rid, data: next[rid], phone: phoneOf(rid) });
      });
      snap[k] = next;
      items.forEach(function (it) {
        if (!it.phone) return;
        xhr("POST", "/api/public/push", { phone: it.phone, items: [it] }, function (st) { if (st !== 200) setTimeout(function () { xhr("POST", "/api/public/push", { phone: it.phone, items: [it] }, function () {}); }, 4000); });
      });
    }
    function track() {
      var m = location.hash.match(/^#track\/([^/]+)\/([^/?#]+)/);
      if (!m) return;
      var id = decodeURIComponent(m[1]), phone = decodeURIComponent(m[2]);
      xhr("GET", "/api/public/track?id=" + encodeURIComponent(id) + "&phone=" + encodeURIComponent(phone), null, function (st, res) {
        if (st !== 200 || !res || !res.recs) return;
        var by = {};
        res.recs.forEach(function (r) { (by[r.k] = by[r.k] || []).push(r); });
        Object.keys(by).forEach(function (k) {
          var cur = readLocal(k), recs = cur === undefined ? {} : enc(cur);
          by[k].forEach(function (r) { recs[r.rid] = parse(r.data); });
          var s = JSON.stringify(dec(recs)), old = LS.getItem(k);
          if (s === old) return;
          origSet.call(LS, k, s);
          if (WATCH[k]) snap[k] = enc(parse(s));
          notify(k, old, s);
        });
      });
    }
    window.addEventListener("hashchange", track);
    track();
    setInterval(function () { if (!document.hidden) track(); }, 20000);
  }
})();

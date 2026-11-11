/* FilmPro staff pages: swap emoji for line icons so every page uses one icon style.
   Runs on render; leaves inputs, options, alerts and stored data untouched. */
(function () {
  "use strict";
  var P = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkc: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    clip: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    cam: '<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5Z"/><circle cx="12" cy="13" r="3.5"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    car: '<path d="M19 17h2v-4l-2-5H5l-2 5v4h2"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5M3 13h18"/>',
    star: '<path fill="currentColor" d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z"/>',
    staro: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1Z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    paper: '<path d="m21 12-8.6 8.6a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8L15.5 8"/>',
    scale: '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3.5 3.5 0 0 0 6 0Zm14 0-3 7a3.5 3.5 0 0 0 6 0Z"/>',
    gem: '<path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20M12 21 8 9l4-6 4 6Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6Z"/>',
    window: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L4 12l2.3-2.3a4 4 0 0 0 5-5L14 2Z"/>'
  };
  var MAP = {
    "⏱": "clock", "⏰": "clock", "⚠": "alert", "🚨": "alert", "✅": "checkc", "✓": "check", "✔": "check",
    "✕": "x", "❌": "x", "🎞": "film", "👤": "user", "💰": "money", "💸": "money", "📅": "cal",
    "📋": "clip", "📍": "pin", "📌": "pin", "📥": "inbox", "📦": "box", "📷": "cam", "🔒": "lock",
    "🚗": "car", "★": "star", "☆": "staro", "🙏": "heart", "📎": "paper", "⚖": "scale", "💎": "gem",
    "🔎": "search", "🛡": "shield", "🪟": "window", "⏸": "pause", "🔔": "bell", "🛠": "wrench"
  };
  var keys = Object.keys(MAP).sort(function (a, b) { return b.length - a.length; });
  var RE = new RegExp("(" + keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")️?", "g");
  var url = {};
  Object.keys(P).forEach(function (n) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + P[n].replace('fill="currentColor"', 'fill="black"') + "</svg>";
    url[n] = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
  });
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SELECT: 1, TITLE: 1, svg: 1, CANVAS: 1 };
  function fix(root) {
    if (!root) return;
    if (root.nodeType === 3) { swap(root); return; }
    if (root.nodeType !== 1 || SKIP[root.nodeName] || root.isContentEditable) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (t) { RE.lastIndex = 0; return t.parentNode && !SKIP[t.parentNode.nodeName] && RE.test(t.nodeValue) ? 1 : 3; } });
    var list = [], n;
    while ((n = w.nextNode())) list.push(n);
    list.forEach(swap);
    // option labels can't hold elements: drop the emoji there
    root.querySelectorAll && root.querySelectorAll("option").forEach(function (o) { RE.lastIndex = 0; if (RE.test(o.text)) o.text = o.text.replace(RE, "").trim(); });
  }
  function swap(t) {
    var s = t.nodeValue; RE.lastIndex = 0;
    if (!RE.test(s) || !t.parentNode || SKIP[t.parentNode.nodeName]) return;
    var frag = document.createDocumentFragment(), last = 0, m; RE.lastIndex = 0;
    while ((m = RE.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      var i = document.createElement("i"); i.className = "fpi"; i.setAttribute("aria-hidden", "true"); i.style.setProperty("--i", url[MAP[m[1]]]);
      frag.appendChild(i); last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    t.parentNode.replaceChild(frag, t);
  }
  // production data is shared now: no one-click demo seeding or wipe, and no "stored on this device" notes
  var DANGER = /^(ข้อมูลตัวอย่าง|รีเซ็ต|ล้างข้อมูล)/;
  function tidy(root) {
    if (!root || root.nodeType !== 1) return;
    var els = root.matches && root.matches("button,a") ? [root] : [];
    root.querySelectorAll && root.querySelectorAll("button,a").forEach(function (b) { els.push(b); });
    els.forEach(function (b) { if (DANGER.test((b.textContent || "").trim())) b.classList.add("fp-hide"); });
    var leaf = root.querySelectorAll ? root.querySelectorAll("p,div,span,footer,small") : [];
    leaf.forEach(function (e) { if (!e.children.length && /localStorage|ข้อมูลเก็บในเครื่องนี้/.test(e.textContent || "")) e.classList.add("fp-hide"); });
  }
  var busy = false;
  function start() {
    fix(document.body); tidy(document.body);
    new MutationObserver(function (ms) {
      if (busy) return; busy = true;
      try { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { fix(n); tidy(n); }); if (m.type === "characterData") fix(m.target); }); } finally { busy = false; }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

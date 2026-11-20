// แคตตาล็อกฟิล์มกรองแสงสำหรับระบบอื่น (Corner Space) — ใช้ข้อมูลเดียวกับหน้าเว็บ
// อ่าน CATALOG ที่ฝังใน public/index.html แล้วคำนวณราคาแบบเดียวกับหน้าเว็บ (รวมกฎซันรูฟ)
export const SIZES = ["C", "S|4D", "M", "L", "XL", "XXL", "GIGA"];

// ดึงก้อน JSON หลัง "const CATALOG = " โดยนับวงเล็บและข้ามข้อความในเครื่องหมายคำพูด
export function extractCatalog(html) {
  const mark = "const CATALOG = ";
  const start = html.indexOf(mark);
  if (start < 0) throw new Error("catalog_not_found");
  let i = start + mark.length, depth = 0, inStr = false, esc = false;
  const from = i;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return JSON.parse(html.slice(from, i + 1)); }
  }
  throw new Error("catalog_unterminated");
}

const sunRow = (s, size) => {
  if (!s.sun) return null;
  if (Array.isArray(s.sun)) return s.sun;
  const row = s.sun[size] ?? s.sun.M;
  return Array.isArray(row) ? row : null;
};
const wsPrice = (s, size) => {
  const w = s.windshield;
  if (w == null || Array.isArray(w)) return null;
  if (typeof w === "string") { const n = (w.match(/\d[\d,]*/g) || []).map((x) => Number(x.replace(/,/g, ""))).filter(Number.isFinite); return n.length ? Math.max(...n) : null; }
  if (typeof w === "number") return w;
  const v = w[size];
  return Number.isFinite(v) ? v : null;
};
// [ซันรูฟ 1 ช่อง, 2 ช่อง, หลังคาแก้ว] ตามกฎหน้าเว็บ: ไม่มี 2 ช่อง = 1 ช่อง × 2, ไม่มีหลังคาแก้ว = บานหน้า + 1,000
const sunFor = (s, size) => {
  const row = sunRow(s, size) || [null, null, null];
  const one = row[0] ?? null;
  const two = row[1] ?? (one != null ? one * 2 : null);
  let glass = row[2] ?? null;
  if (glass == null) { const w = wsPrice(s, size); glass = w == null ? null : w + 1000; }
  return [one, two, glass];
};

export function buildCatalog(C) {
  const sizes = SIZES;
  const brands = C.filmBrands.map((b) => ({
    id: b.id,
    name: b.name,
    series: b.series.map((s) => {
      const price = {}, sun = {};
      for (const z of sizes) {
        const v = s.prices && Object.prototype.hasOwnProperty.call(s.prices, z) ? s.prices[z] : null;
        price[z] = Number.isFinite(v) ? v : null;
        sun[z] = sunFor(s, z);
      }
      return {
        name: s.name, vlt: s.vlt || "", irr: s.irr || "", tser: s.tser || "", uv: s.uv || "", metal: !!s.metal, sunEst: !!s.sunEst,
        shades: (s.shades || []).map((d) => ({ model: d.model, vlt: d.vlt, tser: d.tser || "", irr: d.irr || "", uv: d.uv || "", color: d.color || "" })),
        price, sun,
      };
    }),
  }));
  return { v: 1, source: "film.karnet.org", sizes, sizeLabels: C.sizeLabels || {}, brands, carSizes: C.carSizes || {}, brandSizes: C.brandSizes || {} };
}

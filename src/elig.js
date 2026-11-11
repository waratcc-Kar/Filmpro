// Same hard rules as the auto-offer (FPM.elig in inspect/tech): a tech may only take jobs they qualify for.
const ELIG_DEF = { premium: ["3M", "STEK", "XPEL", "LLUMAR", "HUPER OPTIK", "V-KOOL"], premiumLevel: 3, wsSunLevel: 3, radius: { 1: 15, 2: 25, 3: 40, 4: 60 }, hiPrice: 20000 };
function eligNo(t, b, rules) {
  const R = { ...ELIG_DEF, ...(rules || {}) }, UP = (s) => String(s || "").trim().toUpperCase(), no = [];
  if (!t) return ["ยังไม่มีข้อมูลช่างในระบบ"];
  const fb = UP((b.film || {}).brand), prem = (R.premium || []).map(UP).includes(fb), sr = !!b.sunroof && b.sunroof !== "ไม่มี", ws = !!b.windshieldUpgrade;
  let lv = 1; const why = [];
  if (prem) { lv = Math.max(lv, R.premiumLevel); why.push("ฟิล์มพรีเมียม"); }
  if (sr || ws) { lv = Math.max(lv, R.wsSunLevel); why.push(sr ? b.sunroof : "อัปเกรดบานหน้า"); }
  if (t.status && t.status !== "active") no.push("ยังไม่ผ่านการตรวจสอบจากบริษัท");
  const hi = prem || (+b.price || 0) > (+R.hiPrice || Infinity);
  if (hi && !t.verified) no.push("งานราคาสูง/ฟิล์มพรีเมียม ต้องเป็นช่าง Verified");
  if (b.date && (t.off || []).includes(b.date)) no.push("คุณแจ้งไม่ว่างวันนั้น");
  if ((t.level || 1) < lv) no.push(`ต้องระดับ L${lv} ขึ้นไป (${why.join(", ")})`);
  if (prem && !(t.brands || []).map(UP).includes(fb)) no.push(`ต้องมีใบรับรองแบรนด์ ${fb}`);
  if (sr && !t.sun) no.push("ยังไม่ผ่านทักษะซันรูฟ");
  if (ws && !t.ws) no.push("ยังไม่ผ่านทักษะกระจกบานหน้า");
  const g = b.geo || {}, rad = R.radius[t.level] || R.radius[1];
  if (g.lat != null && t.lat != null && t.lat !== "") {
    const r = (x) => x * Math.PI / 180, dl = r(g.lat - t.lat), dg = r(g.lng - t.lng), h = Math.sin(dl / 2) ** 2 + Math.cos(r(t.lat)) * Math.cos(r(g.lat)) * Math.sin(dg / 2) ** 2, km = 12742 * Math.asin(Math.sqrt(h));
    if (km > rad) no.push(`ไกลเกินรัศมีของคุณ ${rad} กม.`);
  } else if (t.area) {
    const L = String(b.location || "") + " " + String(b.province || ""), A = String(t.area || "").split(/[,\s]+/).filter(Boolean);
    if (!A.some((a) => L.includes(a))) no.push("อยู่นอกพื้นที่ให้บริการของคุณ");
  }
  return no;
}
export { eligNo };

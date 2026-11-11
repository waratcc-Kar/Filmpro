# FilmPro

เว็บเช็กราคาฟิล์มกรองแสงทุกยี่ห้อ และจองช่างติดตั้งถึงที่ (กรุงเทพฯ และปริมณฑล)

- `public/` — ไฟล์เว็บทั้งหมด (หน้าลูกค้า `index.html` และหน้าหลังบ้าน/ช่าง)
- `data/` — ข้อมูลราคาตลาดที่สำรวจ (ไม่ได้เผยแพร่บนเว็บ)
- `wrangler.jsonc` — ตั้งค่า Cloudflare Workers ให้เสิร์ฟโฟลเดอร์ `public/`

Deploy: เชื่อม repo นี้กับ Cloudflare Workers Builds ทุกครั้งที่ push ขึ้น `main` เว็บจะอัปเดตอัตโนมัติ

## Staff login and shared data (D1)
- New techs apply at `/join` (public); applications land in the tech roster as "รอตรวจ".
- Techs see open jobs (customer phone hidden) and their own jobs only; never other techs, payments or the roster.
- Staff sign in at `/staff` with phone + 6-digit PIN. Techs open `/inspect`, `/handover`, `/notify`; admins open everything plus `/tech`, `/admin-v2`, `/staff-users`.
- The Worker (`src/worker.js`) guards those pages and serves `/api/*`. Data lives in D1 `filmpro-db` (schema in `db/schema.sql`).
- `public/fp-sync.js` mirrors the apps' localStorage keys to D1 record by record. Customer site only pushes its own booking, slip and rating, and pulls its own booking for `#track/ID/phone`.

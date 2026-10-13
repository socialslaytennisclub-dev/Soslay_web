/**
 * Smoke test HTTP: buka semua halaman website + admin dan cek status & isi minimum.
 *
 *   node scripts/smoke-test.mjs http://localhost:3000            → mode live (admin wajib login)
 *   node scripts/smoke-test.mjs http://localhost:3100 --demo     → mode demo (admin terbuka, data contoh)
 *
 * Tidak mengubah data apa pun — hanya GET.
 */
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const demo = process.argv.includes("--demo");

const failures = [];
let passed = 0;

async function check(path, { status = 200, includes = [], location, contentType } = {}) {
  const started = Date.now();
  let res;
  let body = "";
  try {
    res = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    body = res.status === 200 ? await res.text() : (await res.body?.cancel(), "");
  } catch (error) {
    failures.push(`${path} → ${error.message}`);
    console.log(`✗ ${path.padEnd(48)} ERROR ${error.message}`);
    return "";
  }
  const problems = [];
  const statuses = Array.isArray(status) ? status : [status];
  if (!statuses.includes(res.status)) problems.push(`status ${res.status} (harusnya ${statuses.join("/")})`);
  if (location && !(res.headers.get("location") ?? "").startsWith(location)) problems.push(`redirect ke ${res.headers.get("location")} (harusnya ${location}…)`);
  if (contentType && !(res.headers.get("content-type") ?? "").includes(contentType)) problems.push(`content-type ${res.headers.get("content-type")}`);
  for (const text of includes) if (!body.includes(text)) problems.push(`tidak ada teks "${text}"`);
  const ms = Date.now() - started;
  if (problems.length) {
    failures.push(`${path} → ${problems.join("; ")}`);
    console.log(`✗ ${path.padEnd(48)} ${problems.join("; ")}`);
  } else {
    passed++;
    console.log(`✓ ${path.padEnd(48)} ${res.status} ${ms}ms`);
  }
  return body;
}

/** Href pertama yang cocok di HTML (slug yang benar-benar tampil), selain halaman tambah/export. */
const firstHref = (html, prefix) =>
  [...html.matchAll(/href="([^"#?]+)"/g)]
    .map((m) => m[1])
    .find((href) => href.startsWith(prefix) && href.length > prefix.length && !/\/(new|export)$/.test(href) && href.split("/").length === prefix.split("/").length);

console.log(`Smoke test ${base} (${demo ? "demo" : "live"})\n── Website`);
await check("/", { includes: ["SOSLAY"] });
const activity = await check("/activity", { includes: ["Booking"] });
await check("/activity?type=weekly-mabar");
const venues = await check("/venue");
await check("/venue?city=bali");
const venuePath = firstHref(venues, "/venue/");
if (venuePath) await check(venuePath);
else failures.push("/venue → tidak ada link venue");
await check("/venue/common-grounds-menteng/guide");
const shop = await check("/shop", { includes: ["Rp"] });
await check("/shop?category=racket");
const productPath = firstHref(shop, "/shop/");
// Halaman detail menulis harga "RP. 220.000" (huruf besar sesuai desain).
if (productPath) await check(productPath, { includes: ["RP.", "SOSLAY Shop"] });
else failures.push("/shop → tidak ada link produk");
await check("/masuk");
await check("/daftar");
await check("/akun");
await check("/auth/undangan");
await check("/keranjang", { status: [307, 308], location: "/akun/order" });
await check("/halaman-yang-tidak-ada", { status: 404 });
if (!activity) failures.push("/activity kosong");

console.log("── Admin");
const adminPaths = [
  "/admin",
  "/admin?range=52",
  "/admin/members",
  "/admin/members?tab=new&tier=gold",
  "/admin/activities",
  "/admin/activities?tab=completed",
  "/admin/activities/new",
  "/admin/orders",
  "/admin/orders?tab=to_process",
  "/admin/venues",
  "/admin/venues/new",
  "/admin/products",
  "/admin/products/new",
  "/admin/konten",
  "/admin/konten?tab=gallery",
  "/admin/konten?tab=community",
  "/admin/konten?tab=pages",
  "/admin/settings",
  "/admin/settings?tab=membership",
  "/admin/settings?tab=payment",
  "/admin/settings?tab=notifications",
  "/admin/settings?tab=integrations",
];

if (!demo) {
  // Tanpa login semua halaman admin harus diarahkan ke /masuk (dan tidak membocorkan data).
  for (const p of [...adminPaths, "/admin/members/export", "/admin/orders/SOS-2309/label"]) await check(p, { status: 307, location: "/masuk?next=" });
} else {
  for (const p of adminPaths) await check(p);
  const members = await check("/admin/members?tab=all");
  const memberPath = firstHref(members, "/admin/members/");
  if (!memberPath) failures.push("/admin/members → tidak ada link detail member");
  if (memberPath) {
    await check(memberPath, { includes: ["Catatan internal"] });
    await check(`${memberPath}/edit`, { includes: ["Slay Point"] });
  }
  const sessions = await check("/admin/activities?tab=upcoming");
  const sessionPath = firstHref(sessions, "/admin/activities/s");
  if (sessionPath) {
    await check(sessionPath, { includes: ["Peserta"] });
    await check(`/admin/activities/new?from=${sessionPath.split("/").pop()}`);
  }
  const orders = await check("/admin/orders");
  const orderCode = orders.match(/SOS-\d{3,}/)?.[0];
  if (!orderCode) failures.push("/admin/orders → tidak ada kode order");
  if (orderCode) {
    await check(`/admin/orders?order=${orderCode}`, { includes: [orderCode] });
    await check(`/admin/orders/${orderCode}/label`, { includes: [orderCode] });
  }
  const productAdmin = await check("/admin/products");
  const productEdit = firstHref(productAdmin, "/admin/products/");
  if (productEdit) await check(productEdit, { includes: ["Harga"] });
  else failures.push("/admin/products → tidak ada link edit produk");
  const venueAdmin = await check("/admin/venues");
  const venueEdit = firstHref(venueAdmin, "/admin/venues/");
  if (venueEdit) await check(venueEdit, { includes: ["Lapangan"] });
  else failures.push("/admin/venues → tidak ada link edit venue");
  await check("/admin/members/export?tier=gold", { contentType: "text/csv" });
}

console.log(`\n${passed} lolos · ${failures.length} gagal`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exitCode = 1;
}

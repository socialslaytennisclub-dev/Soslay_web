/** Penghitung kecil untuk skrip uji (scripts/check-*.ts): check() mencatat gagal, done() keluar dengan kode 1 bila ada. */
let failed = 0;

export function check(ok: boolean, msg: string) {
  if (!ok) {
    failed++;
    console.error(`✗ ${msg}`);
  }
}


/** Akhiri skrip: ada yang gagal → exit 1, kalau tidak cetak ringkasan. */
export function done(summary: string) {
  if (failed) process.exit(1);
  console.log(summary);
}

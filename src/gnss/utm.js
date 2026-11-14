// Konversi koordinat untuk tabel hasil: ECEF → geodetik (WGS84/GRS80) → UTM (proyeksi Transverse Mercator, deret Krüger orde 6, teliti < 1 mm).
const A = 6378137, F = 1 / 298.257222101, E2 = F * (2 - F);

/** ECEF [m] → {lat, lon (radian), h (m)} */
export function geodetik([x, y, z]) {
  const lon = Math.atan2(y, x), p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2)), h = 0;
  for (let i = 0; i < 6; i++) {
    const N = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - (E2 * N) / (N + h)));
  }
  return { lat, lon, h };
}

/** geser lokal (e, n, u meter) di sekitar titik geodetik g → geodetik baru (cukup teliti untuk geseran < 100 m) */
export function geserLokal(g, e, n, u) {
  const s = Math.sin(g.lat), W = Math.sqrt(1 - E2 * s * s);
  const M = (A * (1 - E2)) / W ** 3, N = A / W;
  return { lat: g.lat + n / (M + g.h), lon: g.lon + e / ((N + g.h) * Math.cos(g.lat)), h: g.h + u };
}

const n = F / (2 - F);
const AA = (A / (1 + n)) * (1 + n * n / 4 + n ** 4 / 64 + n ** 6 / 256);
const al = [0,
  n / 2 - (2 / 3) * n * n + (5 / 16) * n ** 3 + (41 / 180) * n ** 4 - (127 / 288) * n ** 5 + (7891 / 37800) * n ** 6,
  (13 / 48) * n * n - (3 / 5) * n ** 3 + (557 / 1440) * n ** 4 + (281 / 630) * n ** 5 - (1983433 / 1935360) * n ** 6,
  (61 / 240) * n ** 3 - (103 / 140) * n ** 4 + (15061 / 26880) * n ** 5 + (167603 / 181440) * n ** 6,
  (49561 / 161280) * n ** 4 - (179 / 168) * n ** 5 + (6601661 / 7257600) * n ** 6,
  (34729 / 80640) * n ** 5 - (3418889 / 1995840) * n ** 6,
  (212378941 / 319334400) * n ** 6];

/** geodetik (radian) → UTM {zona, E, N} (belahan selatan: N + 10.000.000 m) */
export function keUTM(lat, lon, zona) {
  const z = zona ?? Math.floor(((lon * 180) / Math.PI + 180) / 6) + 1;
  const lon0 = ((z * 6 - 183) * Math.PI) / 180, dl = lon - lon0;
  const e = Math.sqrt(E2), t = Math.sinh(Math.atanh(Math.sin(lat)) - e * Math.atanh(e * Math.sin(lat)));
  const xi1 = Math.atan2(t, Math.cos(dl)), eta1 = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let xi = xi1, eta = eta1;
  for (let j = 1; j <= 6; j++) { xi += al[j] * Math.sin(2 * j * xi1) * Math.cosh(2 * j * eta1); eta += al[j] * Math.cos(2 * j * xi1) * Math.sinh(2 * j * eta1); }
  const k0 = 0.9996;
  return { zona: z, E: 500000 + k0 * AA * eta, N: k0 * AA * xi + (lat < 0 ? 10000000 : 0) };
}

// Peta dasar online. Natural Earth II (ikut paket Cesium) selalu ada di bawahnya sebagai cadangan offline.
export const BASEMAPS = {
  ortho: {
    nama: "Ortho", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    max: 18, credit: "Citra: Esri, Maxar, Earthstar Geographics",   // level 19 Esri butuh kunci API → di atas 18 diperbesar
    labels: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png", fallback: "#5d6b4f",
  },
  terang: {
    nama: "Terang", url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    max: 20, credit: "© OpenStreetMap · © CARTO", fallback: "#eef1f4",
  },
  osm: {
    nama: "OSM", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    max: 19, credit: "© kontributor OpenStreetMap", fallback: "#f2efe9",
  },
  polos: {
    nama: "Polos", url: null, max: 0, credit: "Tanpa peta dasar", fallback: "#E4E9EE",
  },
  gelap: {
    nama: "Gelap", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    max: 20, credit: "© OpenStreetMap · © CARTO", fallback: "#2b2f36",
  },
};

/** URL satu tile (untuk gambar mini pemilih peta dasar) di sekitar titik tertentu. */
export function thumbUrl(tpl, lat, lon, z = 16) {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n);
  return tpl.replace("{s}", "a").replace("{z}", z).replace("{x}", x).replace("{y}", y).replace("{r}", "");
}

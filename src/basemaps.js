// Peta dasar online, semuanya tanpa kunci API (CARTO dihapus: sejak 2026 mewajibkan kunci API).
// Natural Earth II (ikut paket Cesium) selalu ada di bawahnya sebagai cadangan offline.
export const BASEMAPS = {
  ortho: {
    nama: "Ortho", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    max: 18, credit: "Citra: Esri, Maxar, Earthstar Geographics",   // level 19 Esri butuh kunci API → di atas 18 diperbesar
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", fallback: "#5d6b4f",
  },
  terang: {
    nama: "Terang", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    max: 16, credit: "Esri, HERE, Garmin, © OpenStreetMap", fallback: "#eef1f4",
  },
  osm: {
    nama: "OSM", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    max: 19, credit: "© kontributor OpenStreetMap", fallback: "#f2efe9",
  },
  polos: {
    nama: "Polos", url: null, max: 0, credit: "Tanpa peta dasar", fallback: "#E4E9EE",
  },
  gelap: {
    nama: "Gelap", url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    max: 16, credit: "Esri, HERE, Garmin, © OpenStreetMap", fallback: "#2b2f36",
  },
};

/** URL satu tile (untuk gambar mini pemilih peta dasar) di sekitar titik tertentu. */
export function thumbUrl(tpl, lat, lon, z = 16) {
  const n = 2 ** z, r = (lat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * n);
  return tpl.replace("{s}", "a").replace("{z}", z).replace("{x}", x).replace("{y}", y).replace("{r}", "");
}

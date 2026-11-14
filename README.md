# GNSSTwin

Digital twin Jembatan Kretek I (Bantul) dengan GNSS sebagai sensor inti.
Jaringan InaCORS mendeteksi gempa Sesar Opak dan memperkirakan Mw dari PGD. Node GNSS di jembatan mengukur pergeseran tiap komponen. Aplikasi lalu menampilkan status aman/waspada/bahaya, jalur aman, dan laporan otomatis.

> **Status:** kerangka aplikasi dengan **DATA CONTOH**. Angka di layar belum hasil olahan nyata.
> Data asli akan menggantikan file di `public/data/` setelah mesin simulasi selesai (format: lihat `CONTRACT.md`).

## Menjalankan

Butuh Node.js 18 atau lebih baru.

```bash
npm install
npm run dev        # buka http://localhost:5173
```

Build untuk demo (bisa jalan tanpa internet):

```bash
npm run build
npm run preview    # buka http://localhost:4173
```

## Peta dasar dan mode offline

- Pilih peta dasar lewat tombol lapisan di kanan peta: **Ortho** (citra Esri World Imagery), **Terang** (CARTO Voyager), **OSM**, **Gelap** (CARTO Dark).
- Peta **Natural Earth II** ikut terpasang di paket Cesium dan selalu ada di bawah. Kalau peta online gagal dimuat (offline atau diblokir), aplikasi menampilkan pemberitahuan dan tetap jalan.
- Tidak memakai Cesium ion (token dikosongkan) dan tidak memakai terrain online.
- Model 3D, data, dan font semuanya lokal.

## Struktur

```
public/
  data/                 aset_kretek1.json, stasiun.json, skenario_opak_contoh.json
  models/kretek1/       GLB per komponen (AS, B1–B4, P1–P3, AU, LAIN)
  logo.svg
src/
  App.jsx               tata letak, replay waktu, tombol simulasi
  MapView.jsx           viewport CesiumJS (model, sensor, stasiun, kamera)
  panels.jsx            panel Peta, Sensor, Gempa, Data GNSS, InaCORS, Laporan
  data.js               pemuat data dan stateAt(i): membaca status dari skenario
  ui.jsx, icons.jsx, styles.css
tools/
  pecah_glb.py          memecah DAE Kretek I menjadi GLB per komponen
  buat_data_contoh.py   membuat data contoh sesuai kontrak
  kretek1_georef.json   hasil georeferensi (ujung selatan/utara, azimut)
```

## Versi web untuk hosting yang tidak melayani .glb

```bash
npm run build
python tools/siapkan_web.py   # hasil di web/: GLB diubah jadi glTF JSON, aset Cesium dipangkas
```

## Membuat ulang aset

```bash
# GLB per komponen (butuh trimesh, pycollada, numpy)
python tools/pecah_glb.py path/ke/kretek1.dae            # tambah --tanpa-baut untuk versi ringan
# Data contoh
npm run data:contoh
```

## Koordinat

- Datum SRGI2013, tinggi elipsoid.
- Hitungan dalam UTM 49S (EPSG:32749). Pergeseran disajikan dalam ENU lokal (cm).
- Tampilan Cesium memakai lintang/bujur. Heading model memakai **azimut benar** 0,62°, bukan azimut grid 0,523°.

## Atribusi pustaka dan data

| Komponen | Lisensi / sumber |
|---|---|
| CesiumJS | Apache-2.0 |
| React | MIT |
| Vite | MIT |
| Plus Jakarta Sans, IBM Plex Mono (Fontsource) | SIL OFL 1.1 |
| Natural Earth II | Domain publik |
| Esri World Imagery | © Esri, Maxar, Earthstar Geographics (syarat penggunaan Esri) |
| CARTO basemaps | © CARTO, data © OpenStreetMap |
| Foto Jembatan Kretek I (`public/img/kretek1.webp`) | Sumber perlu dicantumkan atau ganti foto milik tim |
| OpenStreetMap | © kontributor OpenStreetMap, ODbL |
| Data InaCORS (CPTS, CBTL, dll.) | Badan Informasi Geospasial |
| RTKLIB (pengolahan) | BSD-2-Clause |

## Rencana berikutnya

1. Mesin simulasi: noise nyata dari segmen RINEX, model Okada Sesar Opak, Mw dari PGD (Hardy dkk. 2025), deteksi, status komponen. Keluarannya file JSON sesuai `CONTRACT.md`.
2. Panel Data GNSS: unggah RINEX lalu olah dengan RTKLIB lokal.
3. Kemas sebagai aplikasi desktop (Electron atau Tauri).

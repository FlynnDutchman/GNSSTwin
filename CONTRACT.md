# Kontrak data GNSSTwin

Antarmuka **tidak menghitung apa pun**. Semua angka, status, dan rekomendasi dibaca dari tiga file JSON di `public/data/`.
Mesin simulasi (Python) cukup menulis file dengan format yang sama, dan UI akan langsung menampilkannya.

Satuan: pergeseran dalam **cm** (ENU lokal terhadap base), percepatan dalam **g**, kemiringan dalam **derajat**, waktu dalam **detik relatif terhadap t0 gempa**.
Koordinat ditulis dalam lintang/bujur desimal (SRGI2013 ≈ WGS84 untuk tampilan). Perhitungan dilakukan di UTM 49S (EPSG:32749), lalu dikonversi.

---

## 1. `aset_kretek1.json`: aset, komponen, dan posisi sensor

```jsonc
{
  "id": "kretek1",
  "nama": "Jembatan Kretek I",
  "lokasi": "Jl. Parangtritis · Sungai Opak, Bantul",
  "tipe": "Rangka baja 4 bentang",
  "model": {                       // titik asal model 3D (tengah ujung selatan)
    "lat": -7.99061556, "lon": 110.31539025, "h_m": 0,
    "heading_deg": 0.62            // azimut BENAR sumbu jembatan (bukan azimut grid UTM)
  },
  "ambang": {                      // cm; [waspada, bahaya]. ASUMSI demo, bukan nilai desain
    "geser_perletakan":  { "waspada": 2.5, "bahaya": 5.0 },
    "penurunan_abutmen": { "waspada": 1.5, "bahaya": 3.0 },
    "pilar_horizontal":  { "waspada": 2.5, "bahaya": 5.0 },
    "catatan": "..."
  },
  "komponen": [
    { "id": "B2", "nama": "Bentang 2", "jenis": "bentang",
      "model": "models/kretek1/B2.glb", "urai_m": 6 }   // urai_m = jarak naik saat "Urai komponen"
  ],
  "sensor": [
    { "id": "GNSS-B2", "jenis": "GNSS",                  // GNSS | Akselerometer | Tiltmeter
      "komponen": "B2", "lat": -7.9893, "lon": 110.3154,
      "h_lokal_m": 9.5,                                  // tinggi di atas titik asal model
      "base": "CPTS", "keterangan": "Posisi 3D · komponen B2" }
  ]
}
```

## 2. `stasiun.json`: stasiun InaCORS

```jsonc
[
  { "kode": "CPTS", "nama": "...", "lat": -8.00887962, "lon": 110.30194436, "h_m": 47.361,
    "status": "online",          // online | offline | lokasi (hanya penanda, belum ada data)
    "receiver": "TRIMBLE ALLOY", "antena": "TRM159900.00",
    "sumber_koordinat": "header RINEX" }   // atau "PERKIRAAN dari peta"
]
```

## 3. `skenario_*.json`: deret waktu dan hasil analisis

```jsonc
{
  "meta": { "nama": "Sesar Opak", "t0": "2026-10-28T05:54:17+07:00",
            "mw_input": 6.3, "kedalaman_km": 10, "catatan": "DATA CONTOH" },
  "waktu_s": [-60, -59, ..., 120],          // indeks bersama untuk semua seri, 1 Hz

  "sensor": {
    "GNSS-B2": { "dE": [...], "dN": [...], "dU": [...] },   // cm
    "ACC-B2":  { "a": [...] },                              // g
    "TILT-P1": { "tilt": [...] }                            // derajat
  },
  "stasiun": {
    "CPTS": { "dE": [...], "dN": [...], "dU": [...], "t_deteksi_s": 14 }  // null = tidak mendeteksi
  },
  "mw_estimasi": [null, ..., 5.4, 5.9, 6.2],   // Mw dari PGD per detik; null sebelum terdeteksi

  "kejadian": [ { "t_s": 14, "teks": "CPTS mendeteksi pergeseran" } ],

  "status_komponen": {
    "berlaku_mulai_t": 20,                    // sebelum t ini, semua komponen dianggap aman
    "daftar": [                               // urut dari terparah
      { "komponen": "B2", "indikator": "Geser dek vs P1", "nilai_cm": 7.0, "status": "bahaya" }
    ]
  },
  "koreksi_suhu_cm": 0.4,

  "ringkasan": {
    "rekomendasi": ["..."],
    "rute": { "ditutup": ["Jembatan Kretek I"], "alternatif": "Jembatan Kretek 2 (JJLS)" }
  }
}
```

### Aturan

- Semua array deret waktu **sama panjang** dengan `waktu_s`.
- Status (`aman | waspada | bahaya`) ditentukan oleh mesin simulasi, bukan oleh UI. UI hanya mewarnai.
- Setiap nilai yang berasal dari asumsi atau simulasi harus ditandai di `meta.catatan`. Ini syarat transparansi lomba.

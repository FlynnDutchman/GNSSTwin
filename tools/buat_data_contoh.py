"""
Membuat DATA CONTOH untuk GNSSTwin sesuai kontrak data (lihat CONTRACT.md).

File ini sengaja sederhana: noise acak + lompatan gempa buatan. Nanti mesin
simulasi yang sebenarnya (noise asli InaCORS + model Okada + PGD) menulis file
dengan FORMAT YANG SAMA, sehingga aplikasi tidak perlu diubah.

Pemakaian:
    python tools/buat_data_contoh.py
Keluaran:
    public/data/aset_kretek1.json
    public/data/stasiun.json
    public/data/skenario_opak_contoh.json
"""
import json, math, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data")
os.makedirs(OUT, exist_ok=True)
random.seed(7)

# ---------------------------------------------------------------- aset
georef = json.load(open(os.path.join(ROOT, "tools", "kretek1_georef.json")))
komponen = [
    {"id": "AS", "nama": "Abutmen selatan", "model": "models/kretek1/AS.glb"},
    {"id": "B1", "nama": "Bentang 1", "model": "models/kretek1/B1.glb", "urai_m": 6},
    {"id": "P1", "nama": "Pilar P1", "model": "models/kretek1/P1.glb"},
    {"id": "B2", "nama": "Bentang 2", "model": "models/kretek1/B2.glb", "urai_m": 6},
    {"id": "P2", "nama": "Pilar P2", "model": "models/kretek1/P2.glb"},
    {"id": "B3", "nama": "Bentang 3", "model": "models/kretek1/B3.glb", "urai_m": 6},
    {"id": "P3", "nama": "Pilar P3", "model": "models/kretek1/P3.glb"},
    {"id": "B4", "nama": "Bentang 4", "model": "models/kretek1/B4.glb", "urai_m": 6},
    {"id": "AU", "nama": "Abutmen utara", "model": "models/kretek1/AU.glb"},
    {"id": "LAIN", "nama": "Elemen lain (oprit, railing, marka, sungai)", "model": "models/kretek1/LAIN.glb", "urai_m": 0},
]
bagian2komp = {"Abutmen Selatan": "AS", "Abutmen Utara": "AU", "Pilar P1": "P1", "Pilar P2": "P2", "Pilar P3": "P3"}
sensor = []
for s in georef["sensor"]:
    b = s["bagian"]
    k = bagian2komp.get(b) or ("B" + b.split("Bentang ")[1][0] if "Bentang" in b else "LAIN")
    sensor.append({
        "id": s["id"].replace("KRT1-", ""), "jenis": s["jenis"], "komponen": k,
        "lat": s["lat"], "lon": s["lon"], "h_lokal_m": s["tinggi_lokal_m"],
        "keterangan": {"GNSS": "Posisi 3D", "Tiltmeter": "Kemiringan", "Akselerometer": "Getaran"}[s["jenis"]],
        "base": "CPTS" if s["jenis"] == "GNSS" else None,
    })
aset = {
    "id": "kretek1",
    "nama": "Jembatan Kretek I",
    "lokasi": "Jl. Parangtritis · Sungai Opak, Bantul",
    "tipe": "Rangka baja 4 bentang",
    "model": {"lat": georef["asal_model"]["lat"], "lon": georef["asal_model"]["lon"],
               "h_m": 0.0, "heading_deg": 0.62},
    "ambang": {
        "geser_perletakan_cm": {"waspada": 2.5, "bahaya": 5.0},
        "penurunan_abutmen_cm": {"waspada": 1.5, "bahaya": 3.0},
        "pilar_horizontal_cm": {"waspada": 2.5, "bahaya": 5.0},
        "catatan": "Nilai asumsi demo, bukan nilai desain jembatan.",
    },
    "komponen": komponen,
    "sensor": sensor,
}
json.dump(aset, open(os.path.join(OUT, "aset_kretek1.json"), "w"), indent=1, ensure_ascii=False)

# ---------------------------------------------------------------- stasiun
stasiun = [
    {"kode": "CPTS", "nama": "Parangtritis", "lat": -8.00887962, "lon": 110.30194436, "h_m": 47.361,
     "status": "online", "peran": "Base utama Kretek I", "koordinat": "header RINEX",
     "receiver": "Trimble Alloy", "antena": "TRM159900.00", "konstelasi": ["GPS", "GLONASS", "Galileo", "SBAS"]},
    {"kode": "CBTL", "nama": "Bantul", "lat": -7.89255278, "lon": 110.33549990, "h_m": 76.839,
     "status": "online", "peran": "Base kedua", "koordinat": "header RINEX",
     "receiver": "Trimble Alloy", "antena": "LEIAR20", "konstelasi": ["GPS", "GLONASS", "Galileo"]},
    {"kode": "JOGS", "nama": "Yogyakarta", "lat": -7.80, "lon": 110.28, "h_m": None,
     "status": "offline", "peran": "Deteksi gempa (data terakhir DOY 263)", "koordinat": "PERKIRAAN dari peta"},
    {"kode": "CSDG", "nama": "Paranggupito", "lat": -8.17, "lon": 110.84, "h_m": None,
     "status": "lokasi", "peran": "Deteksi gempa, sisi timur", "koordinat": "PERKIRAAN dari peta"},
    {"kode": "CSLO", "nama": "Surakarta", "lat": -7.57, "lon": 110.82, "h_m": None,
     "status": "lokasi", "peran": "Deteksi gempa, timur laut", "koordinat": "PERKIRAAN dari peta"},
    {"kode": "CMGL", "nama": "Magelang", "lat": -7.47, "lon": 110.22, "h_m": None,
     "status": "lokasi", "peran": "Deteksi gempa, utara", "koordinat": "PERKIRAAN dari peta"},
]
json.dump(stasiun, open(os.path.join(OUT, "stasiun.json"), "w"), indent=1, ensure_ascii=False)

# ---------------------------------------------------------------- skenario (contoh)
T = list(range(-60, 121))          # detik relatif terhadap awal gempa, 1 Hz
def series(final, arrive, noise_h=0.6, noise_v=1.2):
    """lompatan + sedikit goyangan dinamis yang meredam, plus noise putih."""
    e, n, u = [], [], []
    for t in T:
        f = 0.0
        if t >= arrive:
            x = t - arrive
            f = (1 - math.exp(-x / 2.5)) + 0.35 * math.exp(-x / 6) * math.sin(x * 1.9)
        e.append(round(final[0] * f + random.gauss(0, noise_h), 2))
        n.append(round(final[1] * f + random.gauss(0, noise_h), 2))
        u.append(round(final[2] * f + random.gauss(0, noise_v), 2))
    return {"dE": e, "dN": n, "dU": u}

# pergeseran akhir (cm) tiap sensor GNSS jembatan: contoh, bukan hasil model
akhir = {"GNSS-A1": (0.6, 0.3, -0.1), "GNSS-A2": (1.0, 0.4, -3.4), "GNSS-P1": (2.6, 1.2, -0.3),
         "GNSS-P2": (1.1, 0.4, -0.2), "GNSS-P3": (0.9, 0.3, -0.1), "GNSS-B1": (1.3, 0.5, -0.2),
         "GNSS-B2": (9.6, 1.4, -0.6), "GNSS-B3": (4.6, 1.0, -0.4), "GNSS-B4": (1.0, 0.3, -0.1)}
seri_sensor = {k: series(v, 4) for k, v in akhir.items()}
seri_sensor.update({f"ACC-B{i}": {"a_g": [round((0.31 if i == 2 else 0.22) * math.exp(-max(0, t - 3) / 8) * math.sin(t * 6.1) if t >= 3 else random.gauss(0, 0.002), 4) for t in T]} for i in range(1, 5)})
seri_sensor.update({f"TILT-P{i}": {"deg": [round((0.12 if i == 1 else 0.04) * (1 - math.exp(-max(0, t - 4) / 3)) + random.gauss(0, 0.005), 4) for t in T]} for i in range(1, 4)})

seri_stasiun = {}
for kode, fin, arr, tdet in [("CPTS", (-8.6, 3.6, -1.2), 9, 14), ("CBTL", (-5.4, 2.8, -0.9), 12, 17),
                             ("CSDG", (2.0, -1.1, 0.3), 22, 28), ("CSLO", (0.4, 0.4, 0.0), 30, 41),
                             ("CMGL", (-0.3, 0.3, 0.0), 32, 46)]:
    seri_stasiun[kode] = {**series(fin, arr), "t_deteksi_s": tdet}
mw = [{"t": t, "mw": round(min(6.2, 5.3 + 0.9 * (1 - math.exp(-(t - 14) / 15))), 2)} for t in T if t >= 14]

def komponen_status():
    """Status per komponen dari pergeseran akhir (aturan sama yang akan dipakai mesin)."""
    a = aset["ambang"]
    def lvl(v, th): return "bahaya" if v >= th["bahaya"] else ("waspada" if v >= th["waspada"] else "aman")
    def hz(p, q): return math.hypot(p[0] - q[0], p[1] - q[1])
    hasil = []
    for b, p in [("B1", "GNSS-A1"), ("B2", "GNSS-P1"), ("B3", "GNSS-P2"), ("B4", "GNSS-P3")]:
        g = hz(akhir["GNSS-" + b], akhir[p])
        hasil.append({"komponen": b, "nilai_cm": round(g, 1), "indikator": f"Geser dek vs {p.split('-')[1]}",
                      "status": lvl(g, a["geser_perletakan_cm"])})
    for p in ["P1", "P2", "P3"]:
        g = math.hypot(*akhir["GNSS-" + p][:2])
        hasil.append({"komponen": p, "nilai_cm": round(g, 1), "indikator": "Pergeseran horizontal pilar",
                      "status": lvl(g, a["pilar_horizontal_cm"])})
    for k, s in [("AS", "GNSS-A1"), ("AU", "GNSS-A2")]:
        g = -akhir[s][2]
        hasil.append({"komponen": k, "nilai_cm": round(g, 1), "indikator": "Penurunan abutmen",
                      "status": lvl(g, a["penurunan_abutmen_cm"])})
    return hasil

ks = komponen_status()
urut = {"bahaya": 0, "waspada": 1, "aman": 2}
skenario = {
    "meta": {"id": "opak_contoh", "nama": "Skenario gempa Sesar Opak", "jenis": "gempa",
             "sumber": "Sesar Opak", "mw_input": 6.3, "kedalaman_km": 10,
             "t0": "2026-10-28T05:54:17+07:00", "dt_s": 1, "satuan_posisi": "cm (ENU relatif)",
             "catatan": "DATA CONTOH untuk pengembangan antarmuka. Belum memakai noise asli dan model Okada."},
    "waktu_s": T,
    "sensor": seri_sensor,
    "stasiun": seri_stasiun,
    "mw_estimasi": mw,
    "kejadian": [
        {"t": 3, "tipe": "guncangan", "teks": "Akselerometer jembatan menangkap guncangan"},
        {"t": 14, "tipe": "deteksi", "teks": "CPTS mendeteksi lompatan posisi"},
        {"t": 20, "tipe": "status", "teks": "Status Kretek I: BAHAYA"},
    ],
    "status_komponen": {"berlaku_mulai_t": 20, "daftar": sorted(ks, key=lambda x: urut[x["status"]])},
    "koreksi_suhu_cm": 0.4,
    "ringkasan": {
        "mw_akhir": 6.2, "waktu_deteksi_s": 14, "stasiun_mendeteksi": 5,
        "rekomendasi": ["Tutup sementara Jembatan Kretek I dan alihkan lalu lintas lewat Kretek 2 (JJLS).",
                        "Inspeksi perletakan pilar P1 dan abutmen utara.",
                        "Pantau GNSS-B2 dan GNSS-A2 selama 72 jam untuk pergeseran susulan."],
        "rute": {"ditutup": ["Jembatan Kretek I"], "alternatif": "Jembatan Kretek 2 (JJLS)"},
    },
}
json.dump(skenario, open(os.path.join(OUT, "skenario_opak_contoh.json"), "w"), ensure_ascii=False)
print("ok:", [(k["komponen"], k["nilai_cm"], k["status"]) for k in skenario["status_komponen"]["daftar"]])

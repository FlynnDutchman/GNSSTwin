"""
Tata letak sensor Jembatan Kretek I (versi lapangan) + data skenario gempa contoh yang sesuai.

Aturan pemasangan (koordinat lokal model: y = sepanjang jembatan dari muka abutmen selatan,
x = melintang, + ke timur; z = tinggi lokal dari muka air):
  GNSS          : titik 60, 120, 180, 240 m; kiri (barat) & kanan (timur); di atas batang atas rangka
                  (x = ±3,80 m, z = 12,80 m). Stasiun (tiang 1,8 m + antena) berdiri di batang atas.
  Akselerometer : titik yang sama; kiri & kanan dekat tengah jalan (x = ±1,5 m); di bawah deck (z = 5,85 m).
  Tiltmeter     : tiap pilar P1–P3, sisi barat & timur kepala pilar (x = ±4,4 m, z = 5,0 m).

Pemakaian: python tools/atur_sensor.py   (menulis ulang sensor di aset_kretek1.json dan skenario_opak_contoh.json)
"""
import json, math, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "public", "data")
random.seed(11)
aset = json.load(open(os.path.join(D, "aset_kretek1.json")))
sk = json.load(open(os.path.join(D, "skenario_opak_contoh.json")))
M = aset["model"]
LAT0, LON0, HEAD = M["lat"], M["lon"], math.radians(M["heading_deg"])
KY = 110574.0
KX = 111320.0 * math.cos(math.radians(LAT0))


def ke_geo(x, y):
    """lokal model (x timur, y sepanjang jembatan) → lat/lon, rotasi heading searah jarum jam dari utara."""
    e = x * math.cos(HEAD) + y * math.sin(HEAD)
    n = -x * math.sin(HEAD) + y * math.cos(HEAD)
    return round(LAT0 + n / KY, 8), round(LON0 + e / KX, 8)


def bentang(y):
    for k, a, b in [("B1", 3.37, 68.19), ("B2", 67.99, 131.26), ("B3", 131.06, 192.66), ("B4", 192.46, 252.39)]:
        if a <= y <= b: return k
    raise ValueError(y)


TITIK = [60, 120, 180, 240]
SISI = [("B", -1, "barat (kiri)"), ("T", 1, "timur (kanan)")]
PILAR = [("P1", 68.09), ("P2", 131.16), ("P3", 192.56)]
sensor = []
for i, y in enumerate(TITIK, 1):
    for s, sg, nm in SISI:
        lat, lon = ke_geo(3.80 * sg, y)
        sensor.append({"id": f"GNSS-{i}{s}", "jenis": "GNSS", "komponen": bentang(y), "lat": lat, "lon": lon, "h_lokal_m": 12.8,
                       "y_m": y, "keterangan": f"Rangka atas · {y} m · {nm}", "base": "CPTS"})
for i, y in enumerate(TITIK, 1):
    for s, sg, nm in SISI:
        lat, lon = ke_geo(1.5 * sg, y)
        sensor.append({"id": f"ACC-{i}{s}", "jenis": "Akselerometer", "komponen": bentang(y), "lat": lat, "lon": lon, "h_lokal_m": 5.85,
                       "y_m": y, "keterangan": f"Bawah deck · {y} m · {nm}", "base": None})
for p, y in PILAR:
    for s, sg, nm in SISI:
        lat, lon = ke_geo(4.4 * sg, y)
        sensor.append({"id": f"TILT-{p}{s}", "jenis": "Tiltmeter", "komponen": p, "lat": lat, "lon": lon, "h_lokal_m": 5.0,
                       "y_m": y, "keterangan": f"Kepala pilar {p} · {nm}", "base": None})
aset["sensor"] = sensor
aset["ambang"]["pilar_kemiringan_deg"] = {"waspada": 0.1, "bahaya": 0.2}
aset["ambang"]["catatan"] = "Nilai asumsi demo, bukan nilai desain jembatan."
json.dump(aset, open(os.path.join(D, "aset_kretek1.json"), "w"), indent=1, ensure_ascii=False)

# ---------------------------------------------------------------- skenario: seri per sensor baru
T = sk["waktu_s"]


def seri(final, arrive=4, nh=0.6, nv=1.2):
    e, n, u = [], [], []
    for t in T:
        f = 0.0
        if t >= arrive:
            x = t - arrive
            f = (1 - math.exp(-x / 2.5)) + 0.35 * math.exp(-x / 6) * math.sin(x * 1.9)
        e.append(round(final[0] * f + random.gauss(0, nh), 2))
        n.append(round(final[1] * f + random.gauss(0, nh), 2))
        u.append(round(final[2] * f + random.gauss(0, nv), 2))
    return {"dE": e, "dN": n, "dU": u}


# pergeseran akhir (cm) dek di tiap titik (contoh): bentang 2 paling terdampak, sisi barat sedikit lebih besar
akhir = {"GNSS-1B": (1.4, 0.5, -0.2), "GNSS-1T": (1.2, 0.5, -0.2),
         "GNSS-2B": (7.4, 1.4, -0.6), "GNSS-2T": (6.6, 1.3, -0.5),
         "GNSS-3B": (3.4, 0.9, -0.4), "GNSS-3T": (3.0, 0.8, -0.3),
         "GNSS-4B": (0.9, 0.3, -0.1), "GNSS-4T": (0.8, 0.3, -0.1)}
seri_s = {k: seri(v) for k, v in akhir.items()}
puncak = {"1": 0.18, "2": 0.31, "3": 0.26, "4": 0.16}
for i in "1234":
    for s in "BT":
        p = puncak[i] * (1.06 if s == "B" else 1.0)
        seri_s[f"ACC-{i}{s}"] = {"a_g": [round(p * math.exp(-max(0, t - 3) / 8) * math.sin(t * 6.1 + (0.2 if s == "T" else 0)) if t >= 3 else random.gauss(0, 0.002), 4) for t in T]}
miring = {"P1": 0.14, "P2": 0.05, "P3": 0.04}
for p, v in miring.items():
    for s in "BT":
        vv = v * (1.08 if s == "B" else 0.92)
        seri_s[f"TILT-{p}{s}"] = {"deg": [round(vv * (1 - math.exp(-max(0, t - 4) / 3)) + random.gauss(0, 0.005), 4) for t in T]}
sk["sensor"] = seri_s

# status komponen dari sensor baru
A = aset["ambang"]
def lvl(v, th): return "bahaya" if v >= th["bahaya"] else ("waspada" if v >= th["waspada"] else "aman")
hasil = []
for i, b in enumerate(["B1", "B2", "B3", "B4"], 1):
    g = max(math.hypot(*akhir[f"GNSS-{i}{s}"][:2]) for s in "BT")
    hasil.append({"komponen": b, "nilai_cm": round(g, 1), "indikator": f"Geser dek di {TITIK[i - 1]} m (maks kiri/kanan)", "status": lvl(g, A["geser_perletakan_cm"])})
for p, v in miring.items():
    vb = v * 1.08
    hasil.append({"komponen": p, "nilai_cm": round(vb, 2), "indikator": "Kemiringan pilar (°)", "satuan": "°", "status": lvl(vb, A["pilar_kemiringan_deg"])})
urut = {"bahaya": 0, "waspada": 1, "aman": 2}
sk["status_komponen"]["daftar"] = sorted(hasil, key=lambda x: urut[x["status"]])
sk["ringkasan"]["rekomendasi"] = [
    "Tutup sementara Jembatan Kretek I dan alihkan lalu lintas lewat Kretek 2 (JJLS).",
    "Inspeksi perletakan bentang 2 dan kemiringan pilar P1.",
    "Pantau GNSS-2B dan GNSS-2T selama 72 jam untuk pergeseran susulan.",
]
json.dump(sk, open(os.path.join(D, "skenario_opak_contoh.json"), "w"), ensure_ascii=False)
print(len(sensor), "sensor;", [(h["komponen"], h["nilai_cm"], h["status"]) for h in sk["status_komponen"]["daftar"]])

"""
Tata letak sensor Jembatan Kretek I (versi lapangan) + data skenario gempa contoh yang sesuai.

Aturan pemasangan (koordinat lokal model: y = sepanjang jembatan dari muka abutmen selatan,
x = melintang, + ke timur; z = tinggi lokal dari muka air):
  GNSS          : titik 60, 120, 180, 240 m; kiri (barat) & kanan (timur); di atas batang atas rangka
                  (x = ±3,80 m, z = 12,80 m). Stasiun (tiang 1,8 m + antena) berdiri di batang atas.
  Akselerometer : titik yang sama; satu di sumbu jalan (x = 0), menempel di bawah balok lantai (z = 5,85 m).
  Tiltmeter     : tiap pilar P1–P3, sisi barat & timur kepala pilar (x = ±4,4 m, z = 5,0 m).

Pemakaian: python tools/atur_sensor.py   (menulis ulang daftar sensor di aset_kretek1.json)
"""
import json, math, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "public", "data")
random.seed(11)
aset = json.load(open(os.path.join(D, "aset_kretek1.json")))
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
for i, y in enumerate(TITIK, 1):          # satu per titik, di sumbu jalan, menempel di bawah balok lantai (z 5,85 m)
    lat, lon = ke_geo(0.0, y)
    sensor.append({"id": f"ACC-{i}", "jenis": "Akselerometer", "komponen": bentang(y), "lat": lat, "lon": lon, "h_lokal_m": 5.85,
                   "y_m": y, "keterangan": f"Bawah balok lantai · {y} m · sumbu jalan", "base": None})
for p, y in PILAR:
    for s, sg, nm in SISI:
        lat, lon = ke_geo(4.4 * sg, y)
        sensor.append({"id": f"TILT-{p}{s}", "jenis": "Tiltmeter", "komponen": p, "lat": lat, "lon": lon, "h_lokal_m": 5.0,
                       "y_m": y, "keterangan": f"Kepala pilar {p} · {nm}", "base": None})
aset["sensor"] = sensor
aset["ambang"]["pilar_kemiringan_deg"] = {"waspada": 0.1, "bahaya": 0.2}
aset["ambang"]["catatan"] = "Nilai asumsi demo, bukan nilai desain jembatan."
json.dump(aset, open(os.path.join(D, "aset_kretek1.json"), "w"), indent=1, ensure_ascii=False)

print(len(sensor), "sensor ditulis ke aset_kretek1.json; skenario gempa dibuat oleh tools/skenario_bmkg.py")

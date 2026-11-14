"""
Skenario gempa dari katalog BMKG 2026 → respons tiap sensor Jembatan Kretek I.

Dampak di jembatan dihitung dari JARAK dan MAGNITUDO (bukan dikarang):
  jarak         : episenter → jembatan (haversine), hiposenter R = √(Repi² + h²)
  Intensitas    : Bakun & Wentworth (1997)  MMI = 3,67 + 1,17·M − 3,19·log10(R)   (berlaku M kecil–besar)
  PGA           : dari MMI, kebalikan Wald dkk. (1999): log10 PGA[cm/s²] = (MMI+1,66)/3,66 (MMI ≥ V), (MMI−1)/2,20 (MMI < V)
                  (Fukushima-Tanaka 1990 dicoba lebih dulu, tetapi terlalu besar untuk M < 5: M3,5 @19 km → V MMI)
  PGD (GNSS)    : Melgar dkk. (2015)  log10 PGD[cm] = −4,434 + 1,047M − 0,138·M·log10(R)
  geser statis  : sumber titik, u ≈ 0,5·M0 / (4π μ R²), M0 = 10^(1,5M+9,1) N·m, μ = 30 GPa
  respons dek   : percepatan dek = PGA situs × faktor dinamis (bentang tengah 2,2; bentang tepi 1,8)
  waktu tiba    : P = R/6,5 km/s, S = R/3,6 km/s
Kalibrasi: gempa Pacitan 6 Feb 2026 (BMKG: M6,2 setelah pembaruan, kedalaman 58 km) → model memberi
MMI ≈ IV di Kretek; BMKG mencatat IV MMI di Bantul.

Derau GNSS 1 Hz (dari uji data asli CPTS): ±0,5 cm horizontal, ±1,0 cm vertikal → deteksi bila PGD ≥ 1,5 cm (3σ).
Ambang status (asumsi demo): geser dek 2,5/5 cm, kemiringan pilar 0,1/0,2°, percepatan dek 0,15/0,30 g.

Pemakaian: python tools/skenario_bmkg.py → public/data/skenario_bmkg.json
"""
import json, math, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "public", "data")
aset = json.load(open(os.path.join(D, "aset_kretek1.json")))
stasiun = json.load(open(os.path.join(D, "stasiun.json")))
JLAT, JLON = aset["model"]["lat"] + 0.0011, aset["model"]["lon"] + 0.00001     # tengah jembatan

# Katalog dari pengguna (BMKG). Kedalaman: Pacitan dari siaran pers BMKG; lainnya belum ada → asumsi 10 km (dangkal = kasus terburuk).
KATALOG = [
    dict(id="20261112", tanggal="12 November 2026", m=2.5, lat=-9.10, lon=110.34, utm=(427498, 8994080), h=10, h_sumber="asumsi"),
    dict(id="20261109", tanggal="9 November 2026", m=1.7, lat=-8.26, lon=110.30, utm=(422878, 9086958), h=10, h_sumber="asumsi"),
    dict(id="20261027", tanggal="27 Oktober 2026", m=5.1, lat=-9.47, lon=110.33, utm=(426473, 8953168), h=10, h_sumber="asumsi"),
    dict(id="20260820", tanggal="20 Agustus 2026", m=3.5, lat=-7.88, lon=110.45, utm=(439354, 9128999), h=10, h_sumber="asumsi"),
    dict(id="20260206", tanggal="6 Februari 2026", m=6.2, m_awal=6.4, lat=-8.98, lon=111.18, utm=(519784, 9007402), h=58, h_sumber="BMKG",
         wib="01:06:10 WIB", catatan="BMKG memperbarui M6,4 → M6,2; IV MMI di Bantul, Sleman, Pacitan"),
    dict(id="20260127", tanggal="27 Januari 2026", m=4.5, lat=-7.87, lon=110.49, utm=(443763, 9130111), h=10, h_sumber="asumsi"),
]


def jarak_km(a, b, c, d):
    p1, p2, dl = math.radians(a), math.radians(c), math.radians(d - b)
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(x))


def azimut(a, b, c, d):          # dari (a,b) ke (c,d), derajat dari utara
    p1, p2, dl = math.radians(a), math.radians(c), math.radians(d - b)
    y = math.sin(dl) * math.cos(p2); x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def mmi_bw(m, r): return max(1.0, 3.67 + 1.17 * m - 3.19 * math.log10(r))
def pga_dari_mmi(I): return 10 ** ((I + 1.66) / 3.66) if I >= 5 else 10 ** ((I - 1.0) / 2.20)
def pgd_cm(m, r): return 10 ** (-4.434 + 1.047 * m - 0.138 * m * math.log10(r))
def statis_cm(m, r): return 100 * 0.5 * 10 ** (1.5 * m + 9.1) / (4 * math.pi * 3e10 * (r * 1e3) ** 2)
def lvl(v, w, b): return "bahaya" if v >= b else ("waspada" if v >= w else "aman")
ROMAWI = ["I", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"]


def gelombang(t, ts, dur, per):
    """amplop guncangan setelah gelombang S: naik cepat, meluruh; osilasi periode `per` detik."""
    if t < ts: return 0.0
    x = t - ts
    return (1 - math.exp(-x / 1.5)) * math.exp(-max(0, x - dur * 0.3) / dur) * math.sin(2 * math.pi * x / per)


hasil = []
for ev in KATALOG:
    random.seed(int(ev["id"]))
    m, h = ev["m"], ev["h"]
    repi = jarak_km(ev["lat"], ev["lon"], JLAT, JLON); r = math.hypot(repi, h)
    baz = azimut(ev["lat"], ev["lon"], JLAT, JLON)                     # arah rambat episenter → jembatan
    ue, un = math.sin(math.radians(baz)), math.cos(math.radians(baz))
    tP, tS = r / 6.5, r / 3.6
    dur = max(4.0, 3 + 0.02 * r + 3 * max(0, m - 3))
    I = mmi_bw(m, r); pga = pga_dari_mmi(I) if I > 1.0 else 0.3; pga_g = pga / 981
    pgd = pgd_cm(m, r) * 1.3; st_cm = statis_cm(m, r)
    T = list(range(-20, int(min(240, tS + dur * 3 + 30)) + 1))

    seri = {}
    for s in aset["sensor"]:
        k = s["komponen"]
        if s["jenis"] == "GNSS":
            dyn = pgd * (1.15 if k in ("B2", "B3") else 1.0)
            per = 6.0 if m >= 5.5 else 3.0
            e, n, u = [], [], []
            for t in T:
                g = gelombang(t, tS, dur, per); stat = st_cm * min(1, max(0, (t - tS) / 3))
                e.append(round(dyn * g * ue + stat * ue + random.gauss(0, 0.5), 2))
                n.append(round(dyn * g * un + stat * un + random.gauss(0, 0.5), 2))
                u.append(round(0.4 * dyn * gelombang(t, tP, dur, per) + random.gauss(0, 1.0), 2))
            seri[s["id"]] = {"dE": e, "dN": n, "dU": u}
        elif s["jenis"] == "Akselerometer":
            amp = 2.2 if k in ("B2", "B3") else 1.8
            pk = pga_g * amp
            seri[s["id"]] = {"a_g": [round(pk * gelombang(t, tS, dur, 0.9 + 0.13 * (hash(s["id"]) % 5)) + 0.25 * pk * gelombang(t, tP, dur * 0.5, 0.7)
                                           + random.gauss(0, 0.0015), 4) for t in T]}
        else:
            pk = pga_g * 0.05                                                  # kemiringan dinamis kecil, tanpa sisa permanen
            seri[s["id"]] = {"deg": [round(pk * gelombang(t, tS, dur, 1.3) + random.gauss(0, 0.003), 4) for t in T]}

    # InaCORS: PGD tiap stasiun, terdeteksi bila ≥ 1,5 cm (3σ derau 1 Hz)
    sta, det = {}, []
    for s in stasiun:
        rs = math.hypot(jarak_km(ev["lat"], ev["lon"], s["lat"], s["lon"]), h)
        p = pgd_cm(m, rs); ts_ = rs / 3.6
        bz = azimut(ev["lat"], ev["lon"], s["lat"], s["lon"]); se, sn = math.sin(math.radians(bz)), math.cos(math.radians(bz))
        e = [round(p * gelombang(t, ts_, dur, 6) * se + random.gauss(0, 0.5), 2) for t in T]
        n = [round(p * gelombang(t, ts_, dur, 6) * sn + random.gauss(0, 0.5), 2) for t in T]
        u = [round(0.4 * p * gelombang(t, rs / 6.5, dur, 6) + random.gauss(0, 1.0), 2) for t in T]
        tdet = round(ts_ + 3) if (p >= 1.5 and s["status"] != "offline") else 10 ** 6
        if tdet < 10 ** 6: det.append((tdet, s["kode"], p, rs))
        sta[s["kode"]] = {"dE": e, "dN": n, "dU": u, "t_deteksi_s": tdet, "pgd_cm": round(p, 2), "jarak_km": round(rs, 1)}
    det.sort()
    mw_est = []
    if len(det) >= 2:                       # magnitudo dari PGD (inversi Melgar) setelah ≥ 2 stasiun
        for t in T:
            pakai = [d for d in det if d[0] <= t]
            if len(pakai) >= 2:
                est = sum((math.log10(p) + 4.434) / (1.047 - 0.138 * math.log10(rr)) for _, _, p, rr in pakai) / len(pakai)
                mw_est.append({"t": t, "mw": round(est + random.gauss(0, 0.05), 2)})

    # status komponen
    daftar = []
    for i, b in enumerate(["B1", "B2", "B3", "B4"], 1):
        amp = 2.2 if b in ("B2", "B3") else 1.8
        acc = pga_g * amp
        st_ = max(lvl(st_cm, 2.5, 5.0), lvl(acc, 0.15, 0.30), key=lambda x: ["aman", "waspada", "bahaya"].index(x))
        daftar.append({"komponen": b, "nilai_cm": round(st_cm, 2), "satuan": "cm",
                       "indikator": f"Geser permanen {st_cm * 10:.1f} mm · percepatan dek maks {acc:.3f} g", "status": st_})
    for p in ["P1", "P2", "P3"]:
        daftar.append({"komponen": p, "nilai_cm": 0.0, "satuan": "°", "indikator": f"Kemiringan permanen 0,00° (dinamis maks {pga_g * 0.05:.4f}°)", "status": "aman"})
    for a in ["AS", "AU"]:
        daftar.append({"komponen": a, "nilai_cm": round(st_cm, 2), "satuan": "cm", "indikator": "Penurunan abutmen (tanpa sensor, dari model)", "status": "aman"})
    urut = {"bahaya": 0, "waspada": 1, "aman": 2}
    daftar.sort(key=lambda x: urut[x["status"]])
    terburuk = daftar[0]["status"]
    rasa = "tidak terasa" if I < 2 else "terasa lemah" if I < 3.5 else "terasa jelas di dalam rumah" if I < 5 else "terasa kuat"
    rekom = (["Tutup sementara Jembatan Kretek I dan alihkan lalu lintas lewat Kretek 2 (JJLS).", "Inspeksi perletakan dan pilar."] if terburuk == "bahaya"
             else ["Jembatan tetap dibuka.", "Inspeksi visual perletakan bentang 2–3 dalam 24 jam."] if terburuk == "waspada"
             else ["Jembatan tetap dibuka; tidak ada pergeseran yang melewati ambang.", "Pemantauan rutin dilanjutkan (lapis 2 jam & harian)."])
    kejadian = [{"t": 0, "tipe": "gempa", "teks": f"Gempa M{m:.1f} di {abs(ev['lat']):.2f}° LS {ev['lon']:.2f}° BT, kedalaman {h} km"},
                {"t": round(tP), "tipe": "guncangan", "teks": f"Gelombang P tiba di jembatan ({repi:.0f} km)"},
                {"t": round(tS), "tipe": "guncangan", "teks": f"Gelombang S tiba: percepatan dek maks {pga_g * 2.2:.3f} g ({ROMAWI[max(1, min(10, round(I)))]} MMI)"}]
    kejadian.append({"t": det[0][0], "tipe": "deteksi", "teks": f"{det[0][1]} mendeteksi simpangan {det[0][2]:.1f} cm"} if det
                    else {"t": round(tS + 5), "tipe": "info", "teks": "Simpangan GNSS < 1,5 cm (di bawah derau): tidak terdeteksi InaCORS, terekam akselerometer"})
    hasil.append({
        "meta": {"id": ev["id"], "nama": f"Gempa {ev['tanggal']}", "sumber": f"BMKG · {ev['tanggal']}", "jenis": "gempa",
                 "mw_input": m, "mw_awal": ev.get("m_awal"), "kedalaman_km": h, "kedalaman_sumber": ev["h_sumber"], "waktu_wib": ev.get("wib"),
                 "catatan_bmkg": ev.get("catatan"),
                 "episenter": {"lat": ev["lat"], "lon": ev["lon"], "utm49s_E": ev["utm"][0], "utm49s_N": ev["utm"][1]},
                 "jarak_episenter_km": round(repi, 1), "jarak_hiposenter_km": round(r, 1), "azimut_ke_jembatan": round(baz),
                 "pga_g": round(pga_g, 4), "mmi": round(I, 1), "mmi_romawi": ROMAWI[max(1, min(10, round(I)))], "rasa": rasa,
                 "pgd_cm": round(pgd, 2), "statis_mm": round(st_cm * 10, 3), "t_p_s": round(tP, 1), "t_s_s": round(tS, 1),
                 "dt_s": 1, "satuan_posisi": "cm (ENU relatif)",
                 "catatan": "Respons sensor dihitung dari jarak & magnitudo (Bakun-Wentworth 1997, Wald 1999, Melgar 2015) ditambah derau GNSS nyata."},
        "waktu_s": T, "sensor": seri, "stasiun": sta, "mw_estimasi": mw_est, "kejadian": kejadian,
        "status_komponen": {"berlaku_mulai_t": round(tS + dur), "daftar": daftar},
        "koreksi_suhu_cm": 0.4,
        "ringkasan": {"mw_akhir": mw_est[-1]["mw"] if mw_est else None, "waktu_deteksi_s": det[0][0] if det else None,
                      "stasiun_mendeteksi": len(det), "rekomendasi": rekom,
                      "rute": {"ditutup": ["Jembatan Kretek I"], "alternatif": "Jembatan Kretek 2 (JJLS)"}},
    })
    print(f"{ev['tanggal']:18s} M{m} h{h:>3} Repi {repi:6.1f} km  PGA {pga_g:.4f} g  MMI {I:.1f} ({ROMAWI[max(1, min(10, round(I)))]})  PGD {pgd:.2f} cm  statis {st_cm * 10:.3f} mm  deteksi {len(det)}  status {terburuk}")

json.dump({"sumber": "Katalog gempa BMKG 2026 (dari pengguna); kedalaman Pacitan dari siaran pers BMKG", "kejadian": hasil},
          open(os.path.join(D, "skenario_bmkg.json"), "w"), ensure_ascii=False, separators=(",", ":"))
print("→ public/data/skenario_bmkg.json", os.path.getsize(os.path.join(D, "skenario_bmkg.json")) // 1024, "KB")

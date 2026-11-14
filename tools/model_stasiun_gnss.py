"""
Model 3D stasiun pemantau GNSS (rover) untuk dipasang di Jembatan Kretek I.

Ukuran nyata (meter). Sumbu: Z ke atas, X ke timur, Y ke utara (panel surya menghadap utara,
karena jembatan berada di belahan bumi selatan dekat ekuator).

  Antena GNSS (data pabrik)  : Ø 212,1 mm × tinggi 129,7 mm, 1,5 kg, kubah putih + cincin abu
  Tiang                      : pipa baja galvanis Ø 114 mm (4"), tinggi 1,80 m, cat putih
  Pelat dasar                : 300 × 300 × 12 mm, 4 baut angkur (dibaut ke lantai/kepala pilar)
  Panel surya                : 50 Wp, 670 × 540 × 30 mm, kemiringan 15° ke utara, tinggi ±1,25 m
  Kotak baterai + IoT        : panel box IP65 400 × 300 × 200 mm (aki LiFePO4 12 V 40 Ah,
                               receiver GNSS, modem 4G/IoT, controller surya), tinggi ±0,55 m
  Antena 4G                  : batang hitam Ø 16 mm × 200 mm di atas kotak
  Penangkal petir            : batang Ø 16 mm, 0,55 m di atas antena, digeser 0,35 m (mengurangi multipath)

Pemakaian: python tools/model_stasiun_gnss.py public/models/stasiun_gnss.glb
"""
import sys
import numpy as np
import trimesh
from trimesh.creation import cylinder, box, icosphere, capsule
from trimesh.transformations import translation_matrix as T, rotation_matrix as R

WARNA = {
    "putih": [236, 239, 242, 255], "abu": [150, 156, 164, 255], "abu_tua": [88, 94, 102, 255],
    "hitam": [30, 32, 36, 255], "sel_surya": [26, 44, 86, 255], "aluminium": [196, 201, 207, 255],
    "beton": [170, 168, 160, 255], "logo": [20, 110, 180, 255], "led": [40, 200, 110, 255],
}
bagian = []


def tambah(mesh, warna, nama):
    mesh.visual = trimesh.visual.ColorVisuals(mesh, face_colors=WARNA[warna])
    bagian.append((nama, mesh))


def silinder(r, h, z0=0.0, x=0.0, y=0.0, seg=48):
    m = cylinder(radius=r, height=h, sections=seg)
    m.apply_translation([x, y, z0 + h / 2])
    return m


TIANG_H = 1.80
# ---------------- dasar & tiang
pelat = box([0.30, 0.30, 0.012]); pelat.apply_translation([0, 0, 0.006]); tambah(pelat, "abu", "pelat_dasar")
for sx in (-1, 1):
    for sy in (-1, 1):
        tambah(silinder(0.011, 0.045, 0.012, 0.115 * sx, 0.115 * sy, 12), "abu_tua", "baut_angkur")
for a in range(4):                                         # pelat penguat (gusset)
    g = box([0.10, 0.008, 0.10]); g.apply_transform(R(np.pi / 4, [0, 1, 0])); g.apply_translation([0.085, 0, 0.04])
    g.apply_transform(R(a * np.pi / 2, [0, 0, 1])); tambah(g, "putih", "penguat")
tambah(silinder(0.057, TIANG_H, 0.012), "putih", "tiang")
tambah(silinder(0.060, 0.012, TIANG_H + 0.006), "abu", "tutup_tiang")

# ---------------- antena GNSS: Ø 212,1 mm × 129,7 mm (adaptor 5/8" 60 mm di bawahnya)
z = TIANG_H + 0.018
tambah(silinder(0.025, 0.060, z), "abu", "adaptor_5_8")
z += 0.060
D, H = 0.2121, 0.1297
tambah(silinder(D / 2, 0.022, z), "abu_tua", "antena_dasar")                 # pelat bawah gelap
tambah(silinder(D / 2 + 0.002, 0.010, z + 0.022), "abu", "antena_cincin")    # cincin sambungan
badan_h = 0.040
tambah(silinder(D / 2, badan_h, z + 0.032), "putih", "antena_badan")
kubah_h = H - 0.032 - badan_h                                                 # sisa tinggi = kubah
kubah = icosphere(subdivisions=4, radius=1.0)
kubah = kubah.slice_plane([0, 0, 0], [0, 0, 1], cap=False)   # alas kubah tertutup badan antena
kubah.apply_scale([D / 2, D / 2, kubah_h])
kubah.apply_translation([0, 0, z + 0.032 + badan_h])
tambah(kubah, "putih", "antena_kubah")
logo = box([0.06, 0.002, 0.012]); logo.apply_translation([0, -D / 2 - 0.0005, z + 0.032 + badan_h / 2]); tambah(logo, "logo", "antena_logo")
puncak_antena = z + H

# ---------------- panel surya 670 × 540 × 30 mm, miring 15° menghadap utara (+Y)
PZ = 1.25
lengan = box([0.05, 0.36, 0.05]); lengan.apply_translation([0, 0.18 + 0.057, PZ]); tambah(lengan, "putih", "lengan_panel")
klem = silinder(0.066, 0.09, PZ - 0.045); tambah(klem, "abu", "klem_panel")
panel = trimesh.Scene()
W, L, Tb = 0.670, 0.540, 0.030
rangka = box([W, L, Tb])
sel = box([W - 0.03, L - 0.03, 0.004]); sel.apply_translation([0, 0, Tb / 2 + 0.001])
garis = []
for i in range(1, 6):                                       # garis antar-sel (6 × 4 modul)
    g = box([0.004, L - 0.03, 0.002]); g.apply_translation([-W / 2 + 0.015 + i * (W - 0.03) / 6, 0, Tb / 2 + 0.0035]); garis.append(g)
for j in range(1, 4):
    g = box([W - 0.03, 0.004, 0.002]); g.apply_translation([0, -L / 2 + 0.015 + j * (L - 0.03) / 4, Tb / 2 + 0.0035]); garis.append(g)
M = T([0, 0.36 + 0.057, PZ + 0.06]) @ R(-np.radians(15), [1, 0, 0])
for m, w, n in [(rangka, "aluminium", "panel_rangka"), (sel, "sel_surya", "panel_sel")] + [(g, "aluminium", "panel_garis") for g in garis]:
    m.apply_transform(M); tambah(m, w, n)
pen = box([0.04, 0.04, 0.10]); pen.apply_translation([0, 0.36 + 0.057, PZ + 0.02]); tambah(pen, "abu", "dudukan_panel")

# ---------------- kotak baterai + IoT (IP65) 400 × 300 × 200 mm di sisi selatan tiang
KZ = 0.55
kot = box([0.40, 0.20, 0.30]); kot.apply_translation([0, -0.057 - 0.10 - 0.02, KZ]); tambah(kot, "putih", "kotak_baterai_iot")
atap = box([0.44, 0.24, 0.015]); atap.apply_translation([0, -0.057 - 0.10 - 0.02, KZ + 0.158]); tambah(atap, "putih", "atap_kotak")
pintu = box([0.36, 0.004, 0.26]); pintu.apply_translation([0, -0.057 - 0.20 - 0.022, KZ]); tambah(pintu, "putih", "pintu_kotak")
for (dx, dz, w, h, c, n) in [(0.14, 0.0, 0.015, 0.06, "abu_tua", "pegangan"), (-0.12, 0.09, 0.012, 0.012, "led", "lampu_status")]:
    b = box([w, 0.012, h]); b.apply_translation([dx, -0.057 - 0.20 - 0.028, KZ + dz]); tambah(b, c, n)
for k in range(2):
    b = box([0.06, 0.03, 0.04]); b.apply_translation([0, -0.057 - 0.01, KZ - 0.10 + k * 0.20]); tambah(b, "abu", "klem_kotak")
ant4g = capsule(radius=0.008, height=0.20); ant4g.apply_translation([0.15, -0.057 - 0.12, KZ + 0.165 + 0.10]); tambah(ant4g, "hitam", "antena_4g_iot")
kabel = silinder(0.006, puncak_antena - KZ - 0.25, KZ + 0.15, 0.0, -0.062, 8); tambah(kabel, "hitam", "kabel_antena")

# ---------------- penangkal petir (digeser 0,35 m ke timur, puncak 0,55 m di atas antena)
LZ = TIANG_H - 0.15
br = box([0.36, 0.03, 0.03]); br.apply_translation([0.18 + 0.05, 0, LZ]); tambah(br, "abu", "lengan_penangkal")
tambah(silinder(0.008, puncak_antena + 0.55 - LZ, LZ, 0.40, 0, 12), "abu", "penangkal_petir")

# ---------------- simpan
sc = trimesh.Scene()
per_warna = {}
for nama, m in bagian:
    key = tuple(m.visual.face_colors[0])
    per_warna.setdefault(key, []).append(m)
KASAR = {"sel_surya": (0.25, 0.3), "aluminium": (0.4, 0.6), "logo": (0.5, 0.0), "led": (0.4, 0.0)}
nama_warna = {tuple(v): k for k, v in WARNA.items()}
for i, (warna, ms) in enumerate(per_warna.items()):
    gabung = trimesh.util.concatenate([trimesh.Trimesh(m.vertices, m.faces) for m in ms])
    nm = nama_warna[tuple(int(c) for c in warna)]
    rough, metal = KASAR.get(nm, (0.6, 0.05))
    # material PBR standar (warna dasar, kekasaran, logam) → tampil benar di Cesium, three.js, Blender
    mat = trimesh.visual.material.PBRMaterial(name=nm, baseColorFactor=[int(c) for c in warna], roughnessFactor=rough, metallicFactor=metal)
    gabung.visual = trimesh.visual.TextureVisuals(material=mat)
    sc.add_geometry(gabung, geom_name=f"bagian_{i}", node_name=f"bagian_{i}")
# Cesium: glTF Y-up. trimesh menulis Z-up apa adanya, jadi putar -90° di X agar Z-up model → Y-up glTF.
sc.apply_transform(R(-np.pi / 2, [1, 0, 0]))
out = sys.argv[1] if len(sys.argv) > 1 else "stasiun_gnss.glb"
sc.export(out)
tot = sum(len(g.faces) for g in sc.geometry.values())
print(out, f"{tot:,} segitiga", "tinggi total", round(puncak_antena + 0.55, 3), "m", "puncak antena", round(puncak_antena, 3), "m")

"""
Memecah model COLLADA Jembatan Kretek I menjadi satu GLB per komponen
(AS, B1..B4, P1..P3, AU, LAIN) supaya tiap komponen bisa diwarnai statusnya
dan diurai (exploded view) di Cesium.

Pemakaian:
    python tools/pecah_glb.py path/ke/Jembatan_Kretek_I.dae [--tanpa-baut]
Keluaran:
    public/models/kretek1/<ID>.glb
"""
import sys, os, re, collections
import numpy as np
import collada
from collada.scene import Node, GeometryNode
import trimesh

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "models", "kretek1")


def komp_id(path):
    s = " / ".join(path)
    for key, cid in [("Abutmen Selatan", "AS"), ("Abutmen Utara", "AU"), ("Pilar P1", "P1"),
                     ("Pilar P2", "P2"), ("Pilar P3", "P3"), ("Bentang 1", "B1"), ("Bentang 2", "B2"),
                     ("Bentang 3", "B3"), ("Bentang 4", "B4")]:
        if key in s:
            return cid
    return "LAIN"


URUT = ["AS", "B1", "B2", "B3", "B4", "AU"]   # komponen yang dilewati jalan, selatan → utara
Z_LANTAI = 5.0       # di atas ketinggian ini dianggap elemen lantai (marka, railing, lampu)
LEBAR_MAKS = 6.5     # m dari sumbu; tanah/oprit yang lebar tetap di LAIN


def pindahkan_elemen_lantai(parts):
    """Marka jalan, railing, dan elemen lantai lain di DAE tergabung di LAIN dan memanjang
    melintasi beberapa bentang. Potong di batas antar-bentang lalu pindahkan ke komponen
    di bawahnya, supaya ikut terangkat saat urai dan ikut bergeser saat gempa."""
    rng = {}
    for cid in URUT:
        V = np.concatenate([t.reshape(-1, 3) for ls in parts[cid].values() for t in ls])
        rng[cid] = (V[:, 1].min(), V[:, 1].max())
    batas = [rng[URUT[0]][0]]
    for a, b in zip(URUT, URUT[1:]):
        batas.append((rng[a][1] + rng[b][0]) / 2)
    batas.append(rng[URUT[-1]][1])
    sisa, n_pindah = collections.defaultdict(list), collections.Counter()
    for mat, tris in parts["LAIN"].items():
        T = np.concatenate(tris); V = T.reshape(-1, 3); F = np.arange(len(V)).reshape(-1, 3)
        def potong(V, F, y, arah):   # arah +1: simpan sisi y >= batas
            if len(F) == 0: return V, F
            r = trimesh.intersections.slice_faces_plane(V, F, plane_normal=[0, arah, 0], plane_origin=[0, y, 0])
            return r[0], r[1]
        # di luar rentang jembatan: tetap LAIN
        for y, arah in [(batas[0], -1), (batas[-1], 1)]:
            v2, f2 = potong(V, F, y, arah)
            if len(f2): sisa[mat].append(v2[f2])
        for cid, y0, y1 in zip(URUT, batas[:-1], batas[1:]):
            v2, f2 = potong(V, F, y0, 1); v2, f2 = potong(v2, f2, y1, -1)
            if not len(f2): continue
            t = v2[f2]
            atas = (t[:, :, 2].mean(axis=1) >= Z_LANTAI) & (np.abs(t[:, :, 0]).max(axis=1) <= LEBAR_MAKS)
            if atas.any(): parts[cid][mat + "_lantai"].append(t[atas]); n_pindah[cid] += int(atas.sum())
            if (~atas).any(): sisa[mat].append(t[~atas])
    parts["LAIN"] = sisa
    print("elemen lantai dipindah:", dict(n_pindah))


def main(dae, skip=()):
    d = collada.Collada(dae)
    colors = {}
    for m in d.materials:
        try:
            colors[m.id] = np.array(m.effect.diffuse[:3])
        except Exception:
            colors[m.id] = np.array([.7, .7, .7])
    parts = collections.defaultdict(lambda: collections.defaultdict(list))

    def walk(node, M, path):
        for ch in node.children:
            if isinstance(ch, Node):
                walk(ch, M @ ch.matrix, path + [ch.xmlnode.get("name") or ch.id])
            elif isinstance(ch, GeometryNode):
                for p in ch.geometry.primitives:
                    if p.vertex_index is None or len(p.vertex) == 0 or p.material in skip:
                        continue
                    v = np.asarray(p.vertex).reshape(-1, 3)
                    v = (M @ np.c_[v, np.ones(len(v))].T).T[:, :3]
                    parts[komp_id(path)][p.material].append(v[np.asarray(p.vertex_index).reshape(-1, 3)])

    for n in d.scene.nodes:
        walk(n, n.matrix, [n.xmlnode.get("name") or n.id])

    pindahkan_elemen_lantai(parts)

    os.makedirs(OUT, exist_ok=True)
    for cid, mats in parts.items():
        sc = trimesh.Scene()
        for mat, tris in mats.items():
            T = np.concatenate(tris); V = T.reshape(-1, 3); F = np.arange(len(V)).reshape(-1, 3)
            m = trimesh.Trimesh(V, F, process=True)
            c = next((v for k, v in colors.items() if k == mat or mat in k), np.array([.7, .7, .7]))
            m.visual = trimesh.visual.ColorVisuals(m, face_colors=np.r_[(c * 255).astype(np.uint8), 255])
            sc.add_geometry(m, node_name=f"{cid}_{mat}", geom_name=f"{cid}_{mat}")
        p = os.path.join(OUT, f"{cid}.glb"); sc.export(p)
        print(cid, f"{sum(len(g.faces) for g in sc.geometry.values()):,} segitiga", f"{os.path.getsize(p)/1e6:.2f} MB")


if __name__ == "__main__":
    main(sys.argv[1], skip=("baut",) if "--tanpa-baut" in sys.argv else ())

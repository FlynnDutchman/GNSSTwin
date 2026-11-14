"""
OSM (Overpass JSON, `out geom tags`) → bangunan LOD1 untuk GNSSTwin.

LOD1 (CityGML): footprint bangunan diekstrusi sebagai blok datar setinggi bangunan.
Tinggi diambil berurutan dari: tag `height` → `building:levels` × 3,2 m + 1 m (atap) → nilai baku per jenis bangunan.

Pemakaian:
    python tools/osm_lod1.py osm_bangunan_kretek.json public/data/bangunan_lod1.json
"""
import json, sys, math, collections

BAKU = {  # tinggi baku (m) bila tidak ada tag tinggi/lantai; rumah perdesaan Bantul umumnya 1 lantai
    "house": 4.5, "residential": 4.5, "detached": 4.5, "yes": 4.5, "hut": 3.0, "shed": 3.0, "roof": 3.5,
    "garage": 3.0, "kiosk": 3.0, "retail": 5.0, "commercial": 6.0, "school": 7.0, "mosque": 9.0,
    "religious": 8.0, "public": 6.0, "office": 7.0, "warehouse": 7.0, "industrial": 7.0, "farm_auxiliary": 3.5,
    "hotel": 9.0, "hospital": 8.0, "government": 7.0, "dormitory": 7.0, "apartments": 10.0,
}


def tinggi(t):
    try:
        if "height" in t: return round(float(str(t["height"]).replace("m", "").strip()), 1), "height"
    except ValueError:
        pass
    try:
        if "building:levels" in t: return round(float(t["building:levels"]) * 3.2 + 1.0, 1), "levels"
    except ValueError:
        pass
    return BAKU.get(t.get("building", "yes"), 4.5), "baku"


def luas_m2(ring):
    lat0 = math.radians(ring[0][1]); kx = 111320 * math.cos(lat0); ky = 110574
    a = 0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        a += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky)
    return abs(a) / 2


def main(src, dst):
    d = json.load(open(src, encoding="utf-8"))
    out, sumber = [], collections.Counter()
    for e in d["elements"]:
        t = e.get("tags", {})
        if "building" not in t: continue
        rings = []
        if e["type"] == "way" and "geometry" in e:
            rings = [[(g["lon"], g["lat"]) for g in e["geometry"]]]
        elif e["type"] == "relation":   # multipolygon: pakai ring luar saja (LOD1)
            rings = [[(g["lon"], g["lat"]) for g in m["geometry"]] for m in e.get("members", []) if m.get("role") == "outer" and "geometry" in m]
        for r in rings:
            if len(r) > 1 and r[0] == r[-1]: r = r[:-1]
            if len(r) < 3 or luas_m2(r) < 8: continue
            h, s = tinggi(t); sumber[s] += 1
            out.append({"h": h, "j": t.get("building", "yes"), "p": [round(v, 7) for xy in r for v in xy]})
    json.dump({"sumber": "© OpenStreetMap contributors (ODbL)", "lod": 1, "aturan_tinggi": "height → levels×3,2+1 → baku per jenis",
               "jumlah": len(out), "asal_tinggi": dict(sumber), "bangunan": out}, open(dst, "w"), separators=(",", ":"))
    print(f"{len(out)} bangunan → {dst}", dict(sumber))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

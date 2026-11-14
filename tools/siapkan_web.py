"""Siapkan folder web/ dari dist/ untuk hosting statis yang tidak melayani .glb
(misalnya halaman artifact Claude): pangkas aset Cesium yang tidak dipakai dan
ubah GLB menjadi glTF JSON (buffer tertanam) dengan ekstensi .json.

Pakai:  npm run build && python tools/siapkan_web.py
"""
import base64, glob, json, os, shutil, struct, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src, out = os.path.join(root, "dist"), os.path.join(root, "web")
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(src, out)
for d in ["cesiumStatic/Assets/IAU2006_XYS", "cesiumStatic/Assets/Textures/maki",
          "cesiumStatic/Assets/Textures/LensFlare", "cesiumStatic/Widgets"]:
    shutil.rmtree(os.path.join(out, d), ignore_errors=True)
for f in glob.glob(os.path.join(out, "assets", "*.woff*")):
    if f.endswith(".woff") or "-latin-" not in os.path.basename(f):
        os.remove(f)

for f in glob.glob(os.path.join(out, "models", "*", "*.glb")):
    b = open(f, "rb").read()
    assert b[:4] == b"glTF"
    off, js, binc = 12, None, b""
    while off < len(b):
        n, t = struct.unpack("<II", b[off:off + 8]); data = b[off + 8:off + 8 + n]; off += 8 + n
        if t == 0x4E4F534A: js = json.loads(data)
        elif t == 0x004E4942: binc = data
    js["buffers"][0]["uri"] = "data:application/octet-stream;base64," + base64.b64encode(binc).decode()
    open(f[:-4] + ".gltf.json", "w").write(json.dumps(js, separators=(",", ":")))
    os.remove(f)

p = os.path.join(out, "data", "aset_kretek1.json")
a = json.load(open(p, encoding="utf-8"))
for k in a["komponen"]:
    k["model"] = k["model"].replace(".glb", ".gltf.json")
json.dump(a, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
n = sum(len(fs) for _, _, fs in os.walk(out))
print(f"web/ siap: {n} file")

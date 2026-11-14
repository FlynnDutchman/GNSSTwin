"""Ekspor citra ortho sekitar Jembatan Kretek I untuk dipakai GNSSTwin secara OFFLINE.

Jalankan di QGIS (Plugins → Python Console → Show Editor → buka file ini → Run),
dengan laptop tersambung internet. Hasilnya:
  public/img/ortho_luas.jpg, public/img/ortho_detail.jpg, public/img/ortho.json
Aplikasi otomatis memakai file ini di bawah peta online, jadi tetap tampil tanpa internet
(Demo Day) dan di hosting yang memblokir tile luar.

Sumber citra: Esri World Imagery (© Esri, Maxar, Earthstar Geographics). Syarat Esri membatasi
penyimpanan citra untuk offline; pakai hanya untuk demo lomba non-komersial dengan atribusi,
dan cek ketentuannya. Bisa diganti sumber lain dengan mengubah URL_TILE.
"""
import json, os
from qgis.core import (QgsRasterLayer, QgsMapSettings, QgsRectangle, QgsCoordinateReferenceSystem,
                       QgsMapRendererParallelJob)
from qgis.PyQt.QtCore import QSize

OUT = r"C:\Lomba new\01_Aplikasi_GNSSTwin\public\img"     # ganti kalau folder proyek dipindah
URL_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
LAT, LON = -7.98946, 110.31540                              # tengah Jembatan Kretek I

layer = QgsRasterLayer(f"type=xyz&url={URL_TILE}&zmin=0&zmax=19", "Esri World Imagery", "wms")
assert layer.isValid(), "Layer XYZ gagal dibuat. Cek koneksi internet."

def render(nama, setengah_derajat, lebar_px):
    w, e = LON - setengah_derajat, LON + setengah_derajat
    s, n = LAT - setengah_derajat, LAT + setengah_derajat
    ms = QgsMapSettings()
    ms.setLayers([layer])
    ms.setDestinationCrs(QgsCoordinateReferenceSystem("EPSG:4326"))
    ms.setOutputSize(QSize(lebar_px, lebar_px))
    ms.setExtent(QgsRectangle(w, s, e, n))
    job = QgsMapRendererParallelJob(ms)
    job.start(); job.waitForFinished()
    path = os.path.join(OUT, nama)
    job.renderedImage().save(path, "JPG", 86)
    print("tersimpan", path)
    return {"file": nama, "bbox": [w, s, e, n]}

os.makedirs(OUT, exist_ok=True)
daftar = [
    render("ortho_luas.jpg", 0.06, 2400),     # ±6,6 km, ±5,5 m/piksel
    render("ortho_detail.jpg", 0.011, 4096),  # ±1,2 km, ±0,6 m/piksel
]
with open(os.path.join(OUT, "ortho.json"), "w") as f:
    json.dump(daftar, f, indent=1)
print("Selesai. Jalankan ulang npm run build untuk versi website.")

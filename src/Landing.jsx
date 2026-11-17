// Halaman depan (Home) dan About Us. Digital twin dimuat terpisah lewat #/twin.
import { useEffect, useState } from "react";
import { Icon, Logo } from "./icons.jsx";
import "./landing.css";

const L = "./landing/";

const STAT = [
  ["18", "Sensor", "8 GNSS · 4 akselerometer · 6 tiltmeter"],
  ["< 1", "mm", "Selisih baseline vs AUSPOS"],
  ["3", "Konstelasi", "GPS · GLONASS · Galileo"],
  ["30", "detik", "Interval epoch pengamatan"],
];

const MASALAH = [
  ["Mw 6,3", "Gempa Yogyakarta 27 Mei 2006", "Bersumber dari Sesar Opak; 5.716 korban jiwa (Bappenas dkk., 2006)."],
  ["±45 km", "Panjang jalur Sesar Opak", "Membentang di sepanjang Sungai Opak hingga Kretek, Bantul (BMKG)."],
  ["Kretek I", "Akses utama pesisir", "Menghubungkan Bantul–Parangtritis dan jadi jalur evakuasi warga pesisir."],
];

const ALUR = [
  ["upload", "Input", "Unggah RINEX observasi base & rover serta navigasi BRDC. Pilih stasiun Ina-CORS sebagai acuan.", "s_input.webp"],
  ["cube", "Proses", "RTKLIB berjalan langsung di browser dan membandingkan GPS, GPS+GLONASS, dan G+R+Galileo.", "s_proses.webp"],
  ["route", "Output", "Koordinat UTM per epoch dan grafik pergerakan Timur, Utara, Tinggi terhadap titik nol.", "s_output.webp"],
];

const FITUR = [
  ["peta", "Digital twin 3D", "Model Jembatan Kretek I di atas citra satelit, mode 2D/3D, lengkap dengan posisi tiap sensor.", "f_3d.webp", "lebar"],
  ["sensor", "Sensor & grafik pergerakan", "Pantau 18 sensor. Tiap sensor GNSS punya grafik pergeseran E/N/U dan status aman, waspada, bahaya.", "f_sensor.webp"],
  ["gempa", "Simulasi gempa", "Skenario dari katalog BMKG dan Sesar Opak: dampak ke tiap komponen jembatan dihitung otomatis.", "f_gempa.webp"],
  ["data", "Olah data GNSS", "Unggah RINEX, olah dengan RTKLIB di browser, lihat koordinat dan pergerakannya.", "f_data.webp"],
  ["inacors", "Stasiun Ina-CORS", "Stasiun referensi BIG di sekitar jembatan sebagai acuan, tanpa membangun base station sendiri.", "f_inacors.webp", "lebar"],
  ["laporan", "Laporan PDF", "Unduh laporan berisi model 3D, koordinat, dan grafik tiap sensor.", "f_laporan.webp", "tegak"],
];

const TIM = [
  ["Reza Aulia Fazrin", "reza.webp"],
  ["Hafilah Mahardika Pertiwi", "hafilah.webp"],
  ["Zenedine Zidane", "zidane.webp"],
];

function Nav({ page }) {
  const [gelap, setGelap] = useState(true);
  useEffect(() => {
    const f = () => setGelap(page === "about" || window.scrollY < window.innerHeight * 0.75);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, [page]);
  const item = (href, id, label) => <a href={href} className={page === id ? "on" : ""}>{label}</a>;
  return (
    <header className={`ln-nav ${gelap ? "gelap" : "terang"}`}>
      <a href="#/" className="ln-brand"><Logo size={36} /><span>GNSS<b>Twin</b></span></a>
      <nav className="ln-menu">
        {item("#/", "home", "Home")}
        {item("#/twin", "twin", "Digital Twin")}
        {item("#/about", "about", "About Us")}
      </nav>
      <a href="#/twin" className="ln-btn kecil">Buka aplikasi</a>
    </header>
  );
}

function Footer() {
  return (
    <footer className="ln-footer">
      <div className="ln-wrap ln-footer-isi">
        <a href="#/" className="ln-brand"><Logo size={32} /><span>GNSS<b>Twin</b></span></a>
        <p>Digital twin pemantauan deformasi Jembatan Kretek I berbasis multi-GNSS dan Ina-CORS.<br />RGPD Challenge · BIG Bhumireka 2026 · Teknik Geodesi, Universitas Gadjah Mada</p>
        <nav><a href="#/">Home</a><a href="#/twin">Digital Twin</a><a href="#/about">About Us</a></nav>
      </div>
      <div className="ln-wrap ln-kecil">Locally Rooted, Globally Respected</div>
    </footer>
  );
}

function Judul({ kecil, children, sub }) {
  return (
    <div className="ln-judul">
      <span>{kecil}</span>
      <h2>{children}</h2>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function Home() {
  return (
    <>
      <section className="ln-hero" style={{ backgroundImage: `url(${L}hero.webp)` }}>
        <div className="ln-hero-isi">
          <span className="ln-pil"><i />Prototipe · Jembatan Kretek I, Bantul</span>
          <h1>Pantau. Visualisasikan. Lindungi.</h1>
          <p>Pergeseran jembatan terukur hingga milimeter, langsung di digital twin 3D.</p>
          <div className="ln-aksi">
            <a href="#/twin" className="ln-btn">Jelajahi Digital Twin <span aria-hidden>→</span></a>
            <a href="#/about" className="ln-btn hantu">Tentang kami</a>
          </div>
        </div>
        <div className="ln-wrap ln-stat">
          {STAT.map(([a, b, c]) => (
            <div key={b}><strong>{a}</strong><div><b>{b}</b><small>{c}</small></div></div>
          ))}
        </div>
      </section>

      <section className="ln-sec">
        <div className="ln-wrap">
          <Judul kecil="Latar belakang" sub="Pergeseran kecil pada pilar dan bentang sering tidak terlihat mata. Karena itu deformasi jembatan perlu dipantau terus-menerus.">Jembatan di atas jalur Sesar Opak</Judul>
          <div className="ln-grid3">
            {MASALAH.map(([a, b, c]) => (
              <div className="ln-kartu" key={b}><strong>{a}</strong><h3>{b}</h3><p>{c}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="ln-sec biru">
        <div className="ln-wrap">
          <Judul kecil="Satu layar" sub="Status jembatan, posisi sensor, grafik pergeseran, dan simulasi gempa dalam satu tampilan.">Digital twin Jembatan Kretek I</Judul>
          <div className="ln-bingkai"><div className="ln-bar"><i /><i /><i /><span>flynndutchman.github.io/GNSSTwin</span></div><img src={`${L}app_full.webp`} alt="Tampilan aplikasi GNSSTwin saat skenario gempa Sesar Opak" loading="lazy" /></div>
        </div>
      </section>

      <section className="ln-sec">
        <div className="ln-wrap">
          <Judul kecil="Cara kerja" sub="Ina-CORS BIG dipakai sebagai titik acuan, jadi cukup satu rover GNSS di jembatan.">Dari data mentah ke pergerakan posisi</Judul>
          <div className="ln-alur">
            {ALUR.map(([ik, a, b, img], i) => (
              <div className="ln-langkah" key={a}>
                <div className="ln-langkah-kepala"><span className="ln-no">{i + 1}</span><Icon name={ik} size={20} /><h3>{a}</h3></div>
                <p>{b}</p>
                <div className={`ln-shot ${i === 1 ? "muat" : ""}`}><img src={L + img} alt={a} loading="lazy" /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ln-sec abu">
        <div className="ln-wrap">
          <Judul kecil="Fitur" sub="Semua fitur di bawah ini sudah bisa dicoba di aplikasi.">Yang bisa dilakukan GNSSTwin</Judul>
          <div className="ln-bento">
            {FITUR.map(([ik, a, b, img, tipe]) => (
              <a href="#/twin" className={`ln-fitur ${tipe || ""}`} key={a}>
                <div className="ln-fitur-img"><img src={L + img} alt={a} loading="lazy" /></div>
                <div className="ln-fitur-teks"><span className="ln-ikon"><Icon name={ik} size={18} /></span><h3>{a}</h3><p>{b}</p></div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="ln-sec">
        <div className="ln-wrap ln-valid">
          <div>
            <Judul kecil="Validasi">Selisih &lt; 1 mm dengan AUSPOS</Judul>
            <p className="ln-p">Data RINEX yang sama (Ina-CORS CBTL → CPTS, 23 Oktober 2026) diolah GNSSTwin dan AUSPOS dari Geoscience Australia. Vektor baseline 13,4 km dari keduanya hampir identik, padahal GNSSTwin cukup memakai orbit siaran BRDC.</p>
            <div className="ln-angka">
              <div><strong>+0,9</strong><small>mm · Timur</small></div>
              <div><strong>+0,3</strong><small>mm · Utara</small></div>
              <div><strong>−0,2</strong><small>mm · Tinggi</small></div>
            </div>
            <p className="ln-catat">Uji memakai data stasiun Ina-CORS, belum data dari jembatan.</p>
          </div>
          <div className="ln-bukti">
            <span>Laporan AUSPOS (ITRF2020)</span>
            <img src={`${L}bukti_auspos.webp`} alt="Potongan laporan AUSPOS koordinat CBTL dan CPTS" loading="lazy" />
            <span>Output RTKLIB GNSSTwin</span>
            <img src={`${L}bukti_rtklib.webp`} alt="Potongan output RTKLIB GNSSTwin" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="ln-cta" style={{ backgroundImage: `url(${L}hero.webp)` }}>
        <div className="ln-wrap">
          <h2>Lihat jembatannya bergerak.</h2>
          <p>Coba simulasi gempa Sesar Opak atau olah data RINEX Anda sendiri.</p>
          <a href="#/twin" className="ln-btn">Jelajahi Digital Twin <span aria-hidden>→</span></a>
        </div>
      </section>
    </>
  );
}

function About() {
  return (
    <section className="ln-about">
      <div className="ln-wrap">
        <Judul kecil="About Us" sub="Kami mahasiswa Teknik Geodesi UGM yang membangun GNSSTwin untuk RGPD Challenge BIG Bhumireka 2026: digital twin pemantauan deformasi jembatan dengan multi-GNSS dan Ina-CORS.">Tim GNSSTwin</Judul>
        <div className="ln-tim">
          {TIM.map(([nama, foto]) => (
            <div className="ln-orang" key={nama}>
              <div className="ln-foto"><img src={L + foto} alt={nama} /></div>
              <div className="ln-orang-teks">
                <h3>{nama}</h3>
                <span>Mahasiswa S1 Teknik Geodesi</span>
                <small>Universitas Gadjah Mada</small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Landing({ page }) {
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  return (
    <div className={`ln ln-${page}`}>
      <Nav page={page} />
      <main>{page === "about" ? <About /> : <Home />}</main>
      <Footer />
    </div>
  );
}

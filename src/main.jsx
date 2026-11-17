import React, { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@cesium/engine/Source/Widget/CesiumWidget.css";
import "./styles.css";
import Landing from "./Landing.jsx";

const App = lazy(() => import("./App.jsx"));

// #/ = Home, #/twin = Digital Twin, #/about = About Us
const halaman = () => {
  const h = window.location.hash.replace(/^#\/?/, "");
  return h.startsWith("twin") ? "twin" : h.startsWith("about") ? "about" : "home";
};

function Root() {
  const [page, setPage] = useState(halaman);
  useEffect(() => {
    const f = () => setPage(halaman());
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  if (page === "twin") return <Suspense fallback={<div className="boot">Memuat digital twin…</div>}><App /></Suspense>;
  return <Landing page={page} />;
}

createRoot(document.getElementById("root")).render(<Root />);

import { useEffect, useMemo, useRef, useState } from "react";
import Foto from "./Foto";
import "./foto.scss";

function getColumnCount() {
  const w = window.innerWidth;
  if (w >= 1025) return 4; // Desktop
  if (w >= 601) return 2;  // Tablet
  return 1;                // Mobile
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FotoList = ({ fotos, setFotoAmpliada, showPlaceholders = false }) => {
  const albumRef = useRef(null);

  const [cols, setCols] = useState(() => {
    if (typeof window === "undefined") return 1;
    return getColumnCount();
  });

  const [albumWidth, setAlbumWidth] = useState(0);
  const [gapPx, setGapPx] = useState(16);

  useEffect(() => {
    const onResize = () => setCols(getColumnCount());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = albumRef.current;
    if (!el) return;

    const readSizes = () => {
      const w = el.clientWidth || el.getBoundingClientRect().width || 0;
      setAlbumWidth(w);

      const cs = window.getComputedStyle(el);
      const gap = cs.gap || "16px";
      const parsed = Number.parseFloat(gap);
      setGapPx(Number.isFinite(parsed) ? parsed : 16);
    };

    readSizes();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", readSizes);
      return () => window.removeEventListener("resize", readSizes);
    }

    const ro = new ResizeObserver(() => readSizes());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { columns, fillersByCol } = useMemo(() => {
    const list = (Array.isArray(fotos) ? fotos : []).filter(
      (f) => f && f.id && f.width && f.height && f.urls?.small
    );

    const out = Array.from({ length: cols }, () => []);
    const heights = Array.from({ length: cols }, () => 0);

    if (cols <= 1 || !albumWidth) {
      out[0] = list;
      return { columns: out, fillersByCol: Array.from({ length: cols }, () => []) };
    }

    const colWidth = (albumWidth - gapPx * (cols - 1)) / cols;

    if (!Number.isFinite(colWidth) || colWidth <= 0) {
      out[0] = list;
      return { columns: out, fillersByCol: Array.from({ length: cols }, () => []) };
    }

    // ✅ masonry real: sempre na coluna mais baixa
    for (const foto of list) {
      const w = foto.width || 1;
      const h = foto.height || 1;

      const estimatedHeight = colWidth * (h / w);

      let target = 0;
      for (let i = 1; i < cols; i++) {
        if (heights[i] < heights[target]) target = i;
      }

      out[target].push(foto);
      heights[target] += estimatedHeight + gapPx;
    }

    // ✅ placeholders avançados: nivelam a base e evitam buracos enquanto carrega
    const fillers = Array.from({ length: cols }, () => []);

    if (showPlaceholders) {
      const maxH = Math.max(...heights);

      for (let c = 0; c < cols; c++) {
        let missing = maxH - heights[c];

        if (missing <= 0) continue;

        // gera alturas estáveis (sem “piscada”)
        const seed = (list.length + 1) * 1000 + c * 97;
        const rnd = mulberry32(seed);

        while (missing > 120) {
          const h = Math.round(160 + rnd() * 180); // 160..340
          fillers[c].push(Math.min(h, Math.max(120, missing)));
          missing -= h + gapPx;
        }
      }
    }

    return { columns: out, fillersByCol: fillers };
  }, [fotos, cols, albumWidth, gapPx, showPlaceholders]);

  return (
    <div ref={albumRef} className="album" aria-label="Lista de fotos" role="list">
      {columns.map((col, colIdx) => (
        <div className="album__col" key={`col-${cols}-${colIdx}`}>
          {col.map((foto) => (
            <Foto key={foto.id} dados={foto} setFotoAmpliada={setFotoAmpliada} />
          ))}

          {showPlaceholders &&
            fillersByCol[colIdx]?.map((h, i) => (
              <div
                key={`ph-${colIdx}-${i}`}
                className="album__placeholder"
                style={{ height: `${h}px` }}
                aria-hidden="true"
              />
            ))}
        </div>
      ))}
    </div>
  );
};

export default FotoList;
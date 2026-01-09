import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Heart, Download } from "lucide-react";
import "./fotoAmpliada.scss";

import {
  getInteraction,
  incrementLike,
  incrementDownload,
} from "../../utils/interactions";

const FotoAmpliada = ({ foto, setFotoAmpliada }) => {
  const [liked, setLiked] = useState(false);
  const imageRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    lastFocusedRef.current = document.activeElement;
  }, []);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    setFotoAmpliada(null);
    lastFocusedRef.current?.focus?.();
  }, [setFotoAmpliada]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") handleClose();

      if (e.key === "Tab") {
        const container = document.querySelector(".foto-ampliada-container");
        if (!container) return;

        const focusables = container.querySelectorAll(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const list = Array.from(focusables);
        if (list.length === 0) return;

        const first = list[0];
        const last = list[list.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "auto";
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      const interaction = await getInteraction(foto.id);
      if (interaction?.likes > 0) setLiked(true);
    };
    if (foto?.id) load();
  }, [foto]);

  const handleLike = (e) => {
    e.stopPropagation();
    if (!liked) {
      setLiked(true);
      incrementLike(foto.id).catch(console.error);
    }
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    const res = await fetch(foto.urls.full);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${foto.id}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    incrementDownload(foto.id).catch(console.error);
  };

  const onMove = (e) => {
    if (window.innerWidth < 1024) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    imageRef.current.style.transformOrigin = `${x}% ${y}%`;
  };

  const onEnter = () => {
    if (window.innerWidth < 1024) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    containerRef.current?.classList.add("is-zooming");

    if (!prefersReducedMotion) {
      imageRef.current.style.transform = "scale(2)";
    }
  };

  const onLeave = () => {
    if (window.innerWidth < 1024) return;

    containerRef.current?.classList.remove("is-zooming");

    imageRef.current.style.transform = "scale(1)";
    imageRef.current.style.transformOrigin = "center center";
  };

  return (
    <div
      className="foto-ampliada-backdrop"
      onClick={handleClose}
      aria-label="Plano de fundo do modal de imagem"
    >
      <div
        ref={containerRef}
        className="foto-ampliada-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Imagem ampliada"
      >
        <button
          ref={closeBtnRef}
          className="close-btn"
          onClick={handleClose}
          aria-label="Fechar imagem ampliada"
        >
          <X aria-hidden="true" focusable="false" />
        </button>

        <img
          ref={imageRef}
          src={foto.urls.regular}
          alt={foto.alt_description || "Imagem ampliada sem descrição"}
          onMouseMove={onMove}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          decoding="async"
        />

        <div className="modal-actions" role="group" aria-label="Ações da imagem">
          <button
            className="like-btn"
            onClick={handleLike}
            aria-pressed={liked}
            aria-label={liked ? "Imagem curtida" : "Curtir imagem"}
          >
            <Heart
              fill={liked ? "#ff0000" : "none"}
              color={liked ? "#ff0000" : "#ffffff"}
              aria-hidden="true"
              focusable="false"
            />
          </button>

          <button
            className="download-btn"
            onClick={handleDownload}
            aria-label="Baixar imagem"
          >
            <Download aria-hidden="true" focusable="false" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FotoAmpliada;

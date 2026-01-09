import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Download } from "lucide-react";
import "./fotoAmpliada.scss";

import { getInteraction, setLike, incrementDownload } from "../../utils/interactions";

const FotoAmpliada = ({ foto, setFotoAmpliada }) => {
  const [liked, setLiked] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  const imageRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastFocusedRef = useRef(null);
  const containerRef = useRef(null);
  const likePendingRef = useRef(false);
  const userInteractedRef = useRef(false);
  const loadSeqRef = useRef(0);

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
    if (!foto?.id) return;

    userInteractedRef.current = false;
    const seq = ++loadSeqRef.current;
    let canceled = false;

    (async () => {
      const interaction = await getInteraction(foto.id);
      if (canceled) return;

      if (seq !== loadSeqRef.current) return;
      if (userInteractedRef.current) return;

      setLiked((interaction?.likes ?? 0) > 0);
    })();

    return () => {
      canceled = true;
    };
  }, [foto?.id]);

  const triggerBurst = () => {
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) return;

    setLikeBurst(true);
    window.setTimeout(() => setLikeBurst(false), 520);
  };

  const handleToggleLike = async (e) => {
    e.stopPropagation();
    if (!foto?.id) return;

    if (likePendingRef.current) return;

    userInteractedRef.current = true;

    const next = !liked;

    likePendingRef.current = true;
    setLikePending(true);

    setLiked(next);
    if (next) triggerBurst();

    try {
      await setLike(foto.id, next);

      window.dispatchEvent(
        new CustomEvent("likes:changed", {
          detail: { imageId: foto.id, liked: next },
        })
      );
    } catch (err) {
      console.error(err);
      // rollback
      setLiked(!next);
    } finally {
      likePendingRef.current = false;
      setLikePending(false);
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

    incrementDownload(foto.id)
      .then(() => {
        window.dispatchEvent(
          new CustomEvent("downloads:changed", {
            detail: { imageId: foto.id },
          })
        );
      })
      .catch(console.error);
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
            onClick={handleToggleLike}
            aria-pressed={liked}
            aria-label={liked ? "Remover curtida" : "Curtir imagem"}
            aria-disabled={likePending}
            data-pending={likePending ? "true" : "false"}
          >
            <span
              className={`con-like ${liked ? "is-liked" : ""} ${
                likeBurst ? "is-animating" : ""
              }`}
              aria-hidden="true"
            >
              <span className="checkmark">
                <svg xmlns="http://www.w3.org/2000/svg" className="outline" viewBox="0 0 24 24">
                  <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Zm-3.585,18.4a2.973,2.973,0,0,1-3.83,0C4.947,16.006,2,11.87,2,8.967a4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,11,8.967a1,1,0,0,0,2,0,4.8,4.8,0,0,1,4.5-5.05A4.8,4.8,0,0,1,22,8.967C22,11.87,19.053,16.006,13.915,20.313Z"></path>
                </svg>

                <svg xmlns="http://www.w3.org/2000/svg" className="filled" viewBox="0 0 24 24">
                  <path d="M17.5,1.917a6.4,6.4,0,0,0-5.5,3.3,6.4,6.4,0,0,0-5.5-3.3A6.8,6.8,0,0,0,0,8.967c0,4.547,4.786,9.513,8.8,12.88a4.974,4.974,0,0,0,6.4,0C19.214,18.48,24,13.514,24,8.967A6.8,6.8,0,0,0,17.5,1.917Z"></path>
                </svg>

                <svg xmlns="http://www.w3.org/2000/svg" className="celebrate" viewBox="0 0 100 100">
                  <polygon className="poly" points="10,10 20,20"></polygon>
                  <polygon className="poly" points="10,50 20,50"></polygon>
                  <polygon className="poly" points="20,80 30,70"></polygon>
                  <polygon className="poly" points="90,10 80,20"></polygon>
                  <polygon className="poly" points="90,50 80,50"></polygon>
                  <polygon className="poly" points="80,80 70,70"></polygon>
                </svg>
              </span>
            </span>
          </button>

          <button className="download-btn" onClick={handleDownload} aria-label="Baixar imagem">
            <Download aria-hidden="true" focusable="false" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FotoAmpliada;
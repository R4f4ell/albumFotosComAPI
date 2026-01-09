import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import SearchBar from "../searchBar/SearchBar";
import FotoList from "../foto-fotoList/FotoList";
import FotoAmpliada from "../fotoAmpliada/FotoAmpliada";

import { useDebounce } from "../../hooks/useDebounce";
import { useInteractedPhotos } from "../../hooks/useInteractedPhotos";
import { useFilteredPhotos } from "../../hooks/useFilteredPhotos";

import { listPhotos, searchPhotos } from "../../lib/unsplash";
import "./photoGallery.scss";

// Unsplash costuma limitar per_page (geralmente 30).
const IMAGES_PER_PAGE = 30;

const CATEGORY_QUERY_MAP = {
  Natureza: "nature",
  Pessoas: "people",
  Tecnologia: "technology",
  Animais: "animals",
  Esportes: "sports",
};

const PhotoGallery = () => {
  const [fotos, setFotos] = useState([]);
  const [query, setQuery] = useState("");
  const [categoria, setCategoria] = useState("");
  const [activateSearch, setActivateSearch] = useState(false);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [interactedReady, setInteractedReady] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);

  const debouncedQuery = useDebounce(query, 400);

  const abortRef = useRef(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(false);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  const isInteractedCategory = useMemo(
    () => categoria === "liked" || categoria === "downloaded",
    [categoria]
  );

  const handleInteractedReady = useCallback(() => {
    setInteractedReady(true);
  }, []);

  const interactedPhotos = useInteractedPhotos(categoria, handleInteractedReady);

  const fotosExibidas = useFilteredPhotos({
    fotos,
    categoria,
    query: debouncedQuery,
    interactedPhotos,
  });

  const getEffectiveQuery = useCallback(() => {
    if (debouncedQuery) return debouncedQuery;

    if (categoria && !isInteractedCategory) {
      return CATEGORY_QUERY_MAP[categoria] ?? categoria;
    }

    return "";
  }, [debouncedQuery, categoria, isInteractedCategory]);

  const fetchImages = useCallback(
    async ({ reset = false, pageToFetch = 1 } = {}) => {
      if (isInteractedCategory) return;

      const effectiveQuery = getEffectiveQuery();

      // cancela request anterior (evita corrida)
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const params = {
        page: pageToFetch,
        per_page: IMAGES_PER_PAGE,
      };

      const shouldSearch = Boolean(effectiveQuery);
      if (shouldSearch) params.query = effectiveQuery;

      isFetchingRef.current = true;
      setIsLoading(true);

      try {
        const res = shouldSearch
          ? await searchPhotos(params, abortRef.current.signal)
          : await listPhotos(params, abortRef.current.signal);

        if (res.status >= 400) {
          console.error("Erro ao buscar imagens:", res.status, res.data);
          return;
        }

        const results = shouldSearch ? res.data?.results ?? [] : res.data ?? [];

        setFotos((prev) => {
          if (reset) return results;

          const prevIds = new Set(prev.map((f) => f.id));
          const unique = results.filter((f) => !prevIds.has(f.id));
          return [...prev, ...unique];
        });

        if (shouldSearch) {
          const totalPages = Number(res.data?.total_pages ?? 0);
          setHasMore(pageToFetch < totalPages);
        } else {
          setHasMore(Array.isArray(results) && results.length === IMAGES_PER_PAGE);
        }
      } catch (err) {
        // AbortController cai aqui quando troca categoria/busca rápido (ok)
        if (err?.name === "CanceledError" || err?.name === "AbortError") return;
        console.error("Erro ao buscar imagens:", err);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    },
    [getEffectiveQuery, isInteractedCategory]
  );

  // primeira carga
  useEffect(() => {
    fetchImages({ reset: true, pageToFetch: 1 });
  }, [fetchImages]);

  // disparo manual vindo do SearchBar (submit/select)
  useEffect(() => {
    if (!activateSearch) return;

    if (!isInteractedCategory) {
      setFotos([]);
      setHasMore(false);
      setNearBottom(false);
      setPage(1);

      fetchImages({ reset: true, pageToFetch: 1 });
    }

    setActivateSearch(false);
  }, [activateSearch, isInteractedCategory, fetchImages]);

  // paginação
  useEffect(() => {
    if (page <= 1) return;
    fetchImages({ reset: false, pageToFetch: page });
  }, [page, fetchImages]);

  // troca de categoria (limpa estado e desliga paginação quando é Curtidas/Baixadas)
  useEffect(() => {
    setFotos([]);
    setNearBottom(false);

    if (categoria === "liked" || categoria === "downloaded") {
      setHasMore(false);
      setPage(1);
      setInteractedReady(false);

      if (abortRef.current) abortRef.current.abort();
      return;
    }

    setInteractedReady(true);
  }, [categoria]);

  // scroll infinito com lock (não deixa pular páginas)
  useEffect(() => {
    const handleScroll = () => {
      const doc = document.documentElement;

      const distanceToBottom =
        doc.scrollHeight - (window.innerHeight + window.pageYOffset);

      const prefetchZone = distanceToBottom <= 800;

      setNearBottom(prefetchZone);

      if (!prefetchZone) return;
      if (!hasMoreRef.current) return;
      if (isFetchingRef.current) return;

      // lock imediato (evita vários increments no mesmo scroll)
      isFetchingRef.current = true;
      setPage((p) => p + 1);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const hasInteracted = interactedPhotos.length > 0;

  return (
    <section className="photo-gallery" aria-label="Galeria de fotos">
      <SearchBar
        setQuery={setQuery}
        setCategoria={setCategoria}
        setActivateSearch={setActivateSearch}
      />

      {isInteractedCategory ? (
        !interactedReady ? (
          <p className="loading-message" aria-live="polite">
            Carregando...
          </p>
        ) : hasInteracted ? (
          <FotoList fotos={fotosExibidas} setFotoAmpliada={setFotoAmpliada} />
        ) : (
          <p className="empty-message" aria-live="polite">
            {categoria === "liked"
              ? "Você ainda não curtiu nenhuma foto."
              : "Você ainda não baixou nenhuma foto."}
          </p>
        )
      ) : (
        <FotoList
          fotos={fotosExibidas}
          setFotoAmpliada={setFotoAmpliada}
          showPlaceholders={page > 1 && hasMore && (isLoading || nearBottom)}
        />
      )}

      {fotoAmpliada && (
        <FotoAmpliada foto={fotoAmpliada} setFotoAmpliada={setFotoAmpliada} />
      )}
    </section>
  );
};

export default PhotoGallery;
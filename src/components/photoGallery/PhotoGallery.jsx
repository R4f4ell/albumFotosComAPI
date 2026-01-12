import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useLayoutEffect,
} from "react";
import { X } from "lucide-react";
import SearchBar from "../searchBar/SearchBar";
import FotoList from "../foto-fotoList/FotoList";
import FotoAmpliada from "../fotoAmpliada/FotoAmpliada";

import { useDebounce } from "../../hooks/useDebounce";
import { useInteractedPhotos } from "../../hooks/useInteractedPhotos";
import { useFilteredPhotos } from "../../hooks/useFilteredPhotos";

import { listPhotos, searchPhotos } from "../../lib/unsplash";
import { getLikedImageIds, getDownloadedImageIds } from "../../utils/interactions";
import { readUIState, writeUIState } from "../../utils/uiState";

import "./photoGallery.scss";

const IMAGES_PER_PAGE = 30;

const CATEGORY_QUERY_MAP = {
  Natureza: "nature",
  Pessoas: "people",
  Tecnologia: "technology",
  Animais: "animals",
  Esportes: "sports",
};

const MAX_RESULTS_CACHE = 18;
const RESULTS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

function isNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function safeReadInitialUI() {
  if (typeof window === "undefined") return null;
  return readUIState();
}

function makeCacheKey(mode, q, page) {
  return `${mode}|${q || "_"}|p=${page}`;
}

function touchLRU(map, key) {
  if (!map.has(key)) return;
  const val = map.get(key);
  map.delete(key);
  map.set(key, val);
}

function trimLRU(map, max) {
  while (map.size > max) {
    const firstKey = map.keys().next().value;
    map.delete(firstKey);
  }
}

const PhotoGallery = () => {
  const initialUIRef = useRef(safeReadInitialUI());

  const initialCategoria =
    typeof initialUIRef.current?.categoria === "string"
      ? initialUIRef.current.categoria
      : "";

  const initialQuery =
    typeof initialUIRef.current?.query === "string" ? initialUIRef.current.query : "";

  const initialPage = isNumber(initialUIRef.current?.page)
    ? Math.max(1, Math.floor(initialUIRef.current.page))
    : 1;

  const initialScrollY = isNumber(initialUIRef.current?.scrollY)
    ? Math.max(0, Math.floor(initialUIRef.current.scrollY))
    : 0;

  const initialFotoSnapshot =
    initialUIRef.current?.fotoSnapshot && typeof initialUIRef.current?.fotoSnapshot === "object"
      ? initialUIRef.current.fotoSnapshot
      : null;

  const restoringPagesRef = useRef(
    initialPage > 1 && initialCategoria !== "liked" && initialCategoria !== "downloaded"
  );

  const uiRef = useRef({
    categoria: initialCategoria,
    query: initialQuery,
    page: initialPage,
    scrollY: initialScrollY,
    fotoSnapshot: initialFotoSnapshot,
  });

  const [fotos, setFotos] = useState([]);
  const [query, setQuery] = useState(initialQuery);
  const [categoria, setCategoria] = useState(initialCategoria);
  const [activateSearch, setActivateSearch] = useState(false);

  const [page, setPage] = useState(initialPage);
  const [hasMore, setHasMore] = useState(false);

  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [interactedReady, setInteractedReady] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);

  const debouncedQuery = useDebounce(query, 400);

  const abortRef = useRef(null);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(false);
  const resultsCacheRef = useRef(new Map());
  const scrollRafRef = useRef(null);

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

  useEffect(() => {
    const warm = () => {
      getLikedImageIds().catch(() => {});
      getDownloadedImageIds().catch(() => {});
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }

    const t = setTimeout(warm, 600);
    return () => clearTimeout(t);
  }, []);

  const getEffectiveFetchQuery = useCallback(() => {
    const q = String(query || "").trim();
    if (q) return q;

    if (categoria && !isInteractedCategory) {
      return CATEGORY_QUERY_MAP[categoria] ?? categoria;
    }

    return "";
  }, [query, categoria, isInteractedCategory]);

  const fetchImages = useCallback(
    async ({ reset = false, pageToFetch = 1, clearOnReset = true } = {}) => {
      if (isInteractedCategory) return;

      const effectiveQuery = getEffectiveFetchQuery();
      const mode = effectiveQuery ? "search" : "list";

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }

      const cacheKey = makeCacheKey(mode, effectiveQuery, pageToFetch);
      const cached = resultsCacheRef.current.get(cacheKey);

      if (cached) {
        const now = Date.now();
        const isFresh = now - (cached.ts || 0) <= RESULTS_CACHE_TTL_MS;

        if (isFresh) {
          touchLRU(resultsCacheRef.current, cacheKey);

          if (reset) {
            setFotos(cached.results);
          } else {
            setFotos((prev) => {
              const prevIds = new Set(prev.map((f) => f.id));
              const unique = cached.results.filter((f) => !prevIds.has(f.id));
              return [...prev, ...unique];
            });
          }

          setHasMore(Boolean(cached.hasMore));
          setIsLoading(false);
          isFetchingRef.current = false;
          return;
        }

        resultsCacheRef.current.delete(cacheKey);
      }

      if (reset && clearOnReset) {
        setFotos([]);
        setHasMore(false);
        setNearBottom(false);
        setPage(1);
      }

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

        let nextHasMore = false;

        if (shouldSearch) {
          const totalPages = Number(res.data?.total_pages ?? 0);
          nextHasMore = pageToFetch < totalPages;
        } else {
          nextHasMore = Array.isArray(results) && results.length === IMAGES_PER_PAGE;
        }

        resultsCacheRef.current.set(cacheKey, {
          results,
          hasMore: nextHasMore,
          ts: Date.now(),
        });
        trimLRU(resultsCacheRef.current, MAX_RESULTS_CACHE);

        setFotos((prev) => {
          if (reset) return results;

          const prevIds = new Set(prev.map((f) => f.id));
          const unique = results.filter((f) => !prevIds.has(f.id));
          return [...prev, ...unique];
        });

        setHasMore(nextHasMore);
      } catch (err) {
        if (err?.name === "CanceledError" || err?.name === "AbortError") return;
        console.error("Erro ao buscar imagens:", err);
      } finally {
        setIsLoading(false);
        isFetchingRef.current = false;
      }
    },
    [getEffectiveFetchQuery, isInteractedCategory]
  );

  useLayoutEffect(() => {
    if (initialScrollY > 0) window.scrollTo(0, initialScrollY);
    if (initialFotoSnapshot?.id) setFotoAmpliada(initialFotoSnapshot);
  }, []);

  useEffect(() => {
    if (isInteractedCategory) return;

    if (restoringPagesRef.current) {
      const target = initialPage;

      (async () => {
        await fetchImages({ reset: true, pageToFetch: 1, clearOnReset: true });

        for (let p = 2; p <= target; p += 1) {
          await fetchImages({ reset: false, pageToFetch: p });
        }

        restoringPagesRef.current = false;
      })();

      return;
    }

    fetchImages({ reset: true, pageToFetch: 1, clearOnReset: true });
  }, []);

  useEffect(() => {
    if (!activateSearch) return;

    if (!isInteractedCategory) {
      setHasMore(false);
      setNearBottom(false);
      setPage(1);

      fetchImages({ reset: true, pageToFetch: 1, clearOnReset: true });
    }

    setActivateSearch(false);
  }, [activateSearch, isInteractedCategory, fetchImages]);

  useEffect(() => {
    if (page <= 1) return;
    if (restoringPagesRef.current) return;
    if (isInteractedCategory) return;

    fetchImages({ reset: false, pageToFetch: page });
  }, [page, fetchImages, isInteractedCategory]);

  useEffect(() => {
    if (categoria === "liked" || categoria === "downloaded") {
      setFotos([]);
      setNearBottom(false);
      setHasMore(false);
      setPage(1);
      setInteractedReady(false);

      if (abortRef.current) abortRef.current.abort();
      return;
    }

    setInteractedReady(true);
  }, [categoria]);

  useEffect(() => {
    const handleScroll = () => {
      if (isInteractedCategory) return;

      const doc = document.documentElement;

      const distanceToBottom =
        doc.scrollHeight - (window.innerHeight + window.pageYOffset);

      const prefetchZone = distanceToBottom <= 800;

      setNearBottom(prefetchZone);

      if (!prefetchZone) return;
      if (!hasMoreRef.current) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      setPage((p) => p + 1);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isInteractedCategory]);

  useEffect(() => {
    const onScroll = () => {
      if (scrollRafRef.current) return;

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;

        uiRef.current.scrollY = window.scrollY || 0;
        writeUIState(uiRef.current);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    uiRef.current.categoria = categoria;
    uiRef.current.query = query;
    uiRef.current.page = page;
    writeUIState(uiRef.current);
  }, [categoria, query, page]);

  useEffect(() => {
    uiRef.current.fotoSnapshot = fotoAmpliada && fotoAmpliada.id ? fotoAmpliada : null;
    writeUIState(uiRef.current);
  }, [fotoAmpliada]);

  const hasInteracted = fotosExibidas.length > 0;

  const emptyText =
    categoria === "liked"
      ? "Você ainda não curtiu nenhuma imagem"
      : "Você ainda não baixou nenhuma imagem";

  const handleOpenModal = useCallback((f) => {
    try {
      const src = f?.urls?.regular;
      if (src) {
        const img = new Image();
        img.src = src;
      }
    } catch {
    }
    setFotoAmpliada(f);
  }, []);

  return (
    <section className="photo-gallery" aria-label="Galeria de fotos">
      <SearchBar
        setQuery={setQuery}
        setCategoria={setCategoria}
        setActivateSearch={setActivateSearch}
        currentQuery={query}
        currentCategoria={categoria}
      />

      {isInteractedCategory ? (
        !interactedReady ? (
          <p className="loading-message" aria-live="polite">
            Carregando...
          </p>
        ) : hasInteracted ? (
          <FotoList fotos={fotosExibidas} setFotoAmpliada={handleOpenModal} />
        ) : (
          <div className="empty-state" role="status" aria-live="polite">
            <X className="empty-icon" aria-hidden="true" />
            <p className="empty-message">{emptyText}</p>
          </div>
        )
      ) : (
        <FotoList
          fotos={fotosExibidas}
          setFotoAmpliada={handleOpenModal}
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
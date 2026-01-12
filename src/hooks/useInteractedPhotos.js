import { useState, useEffect, useRef, useCallback } from "react";
import { getLikedImageIds, getDownloadedImageIds } from "../utils/interactions";
import { getPhotoById } from "../lib/unsplash";

const photoByIdCache = new Map();

async function fetchPhotoSafe(id) {
  try {
    const r = await getPhotoById(id);
    if (r?.status >= 400) return null;
    return r?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchWithConcurrency(ids, concurrency, onItem, canceledRef) {
  let cursor = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < ids.length) {
      if (canceledRef.current) return;

      const id = ids[cursor++];
      const data = await fetchPhotoSafe(id);
      if (!data) continue;

      onItem && onItem(data);
    }
  });

  await Promise.all(workers);
}

function mergeAndSort(prev, incoming, orderMap) {
  const map = new Map(prev.map((p) => [p.id, p]));
  for (const p of incoming) map.set(p.id, p);

  const merged = Array.from(map.values());

  if (!orderMap) return merged;

  merged.sort((a, b) => {
    const ia = orderMap.get(a.id);
    const ib = orderMap.get(b.id);
    return (ia ?? 999999) - (ib ?? 999999);
  });

  return merged;
}

export function useInteractedPhotos(categoria, onReady) {
  const [photos, setPhotos] = useState([]);

  const listCacheRef = useRef({ liked: null, downloaded: null });
  const canceledRef = useRef(false);
  const readyFiredRef = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fireReadyOnce = useCallback(() => {
    if (readyFiredRef.current) return;
    readyFiredRef.current = true;

    requestAnimationFrame(() => {
      if (!canceledRef.current) onReady && onReady();
    });
  }, [onReady]);

  useEffect(() => {
    canceledRef.current = false;
    return () => {
      canceledRef.current = true;
    };
  }, []);

  useEffect(() => {
    const onLikesChanged = (e) => {
      const { imageId, liked, photo } = e?.detail ?? {};
      if (!imageId) return;
      if (photo?.id) photoByIdCache.set(photo.id, photo);
      const cached = listCacheRef.current.liked;
      if (Array.isArray(cached)) {
        if (liked) {
          if (photo?.id) {
            const exists = cached.some((p) => p.id === photo.id);
            if (!exists) {
              const next = [photo, ...cached];
              listCacheRef.current.liked = next;
              if (categoria === "liked") setPhotos(next);
            }
          } else {
            listCacheRef.current.liked = null;
            if (categoria === "liked") setPhotos([]);
            setRefreshKey((k) => k + 1);
          }
        } else {
          const next = cached.filter((p) => p.id !== imageId);
          listCacheRef.current.liked = next;
          if (categoria === "liked") setPhotos(next);
        }
        return;
      }

      setRefreshKey((k) => k + 1);
    };

    const onDownloadsChanged = (e) => {
      const { imageId, photo } = e?.detail ?? {};
      if (!imageId) return;

      if (photo?.id) photoByIdCache.set(photo.id, photo);

      const cached = listCacheRef.current.downloaded;
      if (Array.isArray(cached)) {
        if (photo?.id) {
          const exists = cached.some((p) => p.id === photo.id);
          if (!exists) {
            const next = [photo, ...cached];
            listCacheRef.current.downloaded = next;
            if (categoria === "downloaded") setPhotos(next);
          }
        } else {
          listCacheRef.current.downloaded = null;
          if (categoria === "downloaded") setPhotos([]);
          setRefreshKey((k) => k + 1);
        }
        return;
      }

      setRefreshKey((k) => k + 1);
    };

    window.addEventListener("likes:changed", onLikesChanged);
    window.addEventListener("downloads:changed", onDownloadsChanged);

    return () => {
      window.removeEventListener("likes:changed", onLikesChanged);
      window.removeEventListener("downloads:changed", onDownloadsChanged);
    };
  }, [categoria]);

  useEffect(() => {
    if (categoria !== "liked" && categoria !== "downloaded") return;

    readyFiredRef.current = false;
    let canceled = false;

    (async () => {
      // 1) se já existe lista cacheada para a categoria, usa direto
      const cachedList = listCacheRef.current[categoria];
      if (Array.isArray(cachedList)) {
        if (!canceled && !canceledRef.current) {
          setPhotos(cachedList);
          fireReadyOnce();
        }
        return;
      }

      // 2) busca ids
      setPhotos([]);

      const ids =
        categoria === "liked" ? await getLikedImageIds() : await getDownloadedImageIds();

      if (canceled || canceledRef.current) return;

      if (!ids || ids.length === 0) {
        listCacheRef.current[categoria] = [];
        setPhotos([]);
        fireReadyOnce();
        return;
      }

      const orderMap = new Map(ids.map((id, idx) => [id, idx]));

      // 3) seed instantâneo do cache de fotos por id
      const seeded = ids
        .map((id) => photoByIdCache.get(id))
        .filter(Boolean);

      if (!canceled && !canceledRef.current && seeded.length > 0) {
        const seededOrdered = mergeAndSort([], seeded, orderMap);
        setPhotos(seededOrdered);
        fireReadyOnce();
      }

      const missing = ids.filter((id) => !photoByIdCache.has(id));
      if (missing.length === 0) {
        const finalList = ids.map((id) => photoByIdCache.get(id)).filter(Boolean);
        listCacheRef.current[categoria] = finalList;
        setPhotos(finalList);
        fireReadyOnce();
        return;
      }

      const concurrency = 8;
      await fetchWithConcurrency(
        missing,
        concurrency,
        (photo) => {
          if (canceled || canceledRef.current) return;

          photoByIdCache.set(photo.id, photo);

          setPhotos((prev) => {
            const next = mergeAndSort(prev, [photo], orderMap);
            if (next.length > 0) fireReadyOnce();
            return next;
          });
        },
        canceledRef
      );

      if (canceled || canceledRef.current) return;

      const finalList = ids.map((id) => photoByIdCache.get(id)).filter(Boolean);
      listCacheRef.current[categoria] = finalList;
      setPhotos(finalList);
      fireReadyOnce();
    })();

    return () => {
      canceled = true;
    };
  }, [categoria, refreshKey, fireReadyOnce]);

  return photos;
}
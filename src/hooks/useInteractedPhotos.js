import { useState, useEffect, useRef } from "react";
import { getLikedImageIds, getDownloadedImageIds } from "../utils/interactions";
import { getPhotoById } from "../lib/unsplash";

async function fetchInBatches(ids, batchSize, onChunk) {
  const collected = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const results = await Promise.all(
      slice.map((id) =>
        getPhotoById(id)
          .then((r) => (r.status < 400 ? r.data : null))
          .catch(() => null)
      )
    );
    const clean = results.filter(Boolean);
    collected.push(...clean);
    onChunk && onChunk(clean);
  }
  return collected;
}

export function useInteractedPhotos(categoria, onReady) {
  const [photos, setPhotos] = useState([]);
  const cache = useRef({ liked: null, downloaded: null });

  useEffect(() => {
    if (categoria !== "liked" && categoria !== "downloaded") return;

    let canceled = false;

    (async () => {
      let list = cache.current[categoria];

      if (!list) {
        const ids =
          categoria === "liked"
            ? await getLikedImageIds()
            : await getDownloadedImageIds();

        if (!ids || ids.length === 0) {
          if (!canceled) {
            setPhotos([]);
            onReady && onReady();
          }
          cache.current[categoria] = [];
          return;
        }

        const batchSize = 6;
        const incremental = [];
        await fetchInBatches(ids, batchSize, (chunk) => {
          incremental.push(...chunk);
          if (!canceled) setPhotos((prev) => [...prev, ...chunk]);
          if (incremental.length === chunk.length && onReady) onReady();
        });

        list = incremental;
        cache.current[categoria] = list;
      }

      if (!canceled) {
        setPhotos(list);
        Promise.resolve().then(() => {
          if (!canceled) onReady && onReady();
        });
      }
    })();

    return () => {
      canceled = true;
    };
  }, [categoria, onReady]);

  return photos;
}
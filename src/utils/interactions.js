import { supabase } from "../lib/supabase";
import { getSessionId } from "./sessionId";

const STORAGE_PREFIX = "interactions:v1";

const mem = {
  sessionId: null,
  hydrated: false,

  likedIds: new Set(),
  downloadedIds: new Set(),

  likedFetchPromise: null,
  downloadedFetchPromise: null,
  likedFetchedFromDb: false,
  downloadedFetchedFromDb: false,
};

function getLikedKey(sessionId) {
  return `${STORAGE_PREFIX}:liked:${sessionId}`;
}
function getDownloadedKey(sessionId) {
  return `${STORAGE_PREFIX}:downloaded:${sessionId}`;
}

function safeReadArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeWriteArray(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
  }
}

function ensureHydrated() {
  const sessionId = getSessionId();

  if (mem.hydrated && mem.sessionId === sessionId) return sessionId;

  mem.sessionId = sessionId;
  mem.hydrated = true;

  mem.likedIds = new Set();
  mem.downloadedIds = new Set();

  mem.likedFetchPromise = null;
  mem.downloadedFetchPromise = null;
  mem.likedFetchedFromDb = false;
  mem.downloadedFetchedFromDb = false;

  const likedArr = safeReadArray(getLikedKey(sessionId));
  if (likedArr?.length) likedArr.forEach((id) => mem.likedIds.add(id));

  const downloadedArr = safeReadArray(getDownloadedKey(sessionId));
  if (downloadedArr?.length) downloadedArr.forEach((id) => mem.downloadedIds.add(id));

  return sessionId;
}

function persistLiked(sessionId) {
  safeWriteArray(getLikedKey(sessionId), Array.from(mem.likedIds));
}
function persistDownloaded(sessionId) {
  safeWriteArray(getDownloadedKey(sessionId), Array.from(mem.downloadedIds));
}

export function getCachedLike(imageId) {
  if (!imageId) return false;
  ensureHydrated();
  return mem.likedIds.has(imageId);
}

export function setCachedLike(imageId, value) {
  if (!imageId) return;
  const sessionId = ensureHydrated();

  if (value) mem.likedIds.add(imageId);
  else mem.likedIds.delete(imageId);

  persistLiked(sessionId);
}

export function markCachedDownload(imageId) {
  if (!imageId) return;
  const sessionId = ensureHydrated();

  mem.downloadedIds.add(imageId);
  persistDownloaded(sessionId);
}

export const getInteraction = async (imageId) => {
  const sessionId = getSessionId();

  const { data, error } = await supabase
    .from("interactions")
    .select("id, likes, downloads")
    .eq("image_id", imageId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) console.error("Erro ao buscar interações:", error);

  return data ?? null;
};

export const setLike = async (imageId, value) => {
  const sessionId = getSessionId();
  const existing = await getInteraction(imageId);
  const wantsLike = Boolean(value);

  if (!existing) {
    if (!wantsLike) {
      // cache local
      setCachedLike(imageId, false);
      return;
    }

    const { error } = await supabase.from("interactions").insert({
      image_id: imageId,
      likes: 1,
      downloads: 0,
      session_id: sessionId,
    });

    if (error) {
      console.error("Erro ao curtir (insert):", error);
      throw error;
    }

    // cache local
    setCachedLike(imageId, true);
    mem.likedFetchedFromDb = true;

    return;
  }

  const downloads = Number(existing.downloads || 0);

  if (!wantsLike) {
    if (downloads === 0) {
      const { error: delError } = await supabase
        .from("interactions")
        .delete()
        .eq("id", existing.id);

      if (delError) {
        console.warn("DELETE bloqueado; fallback para likes=0:", delError);

        const { error: updateError } = await supabase
          .from("interactions")
          .update({ likes: 0 })
          .eq("id", existing.id);

        if (updateError) {
          console.error("Erro ao descurtir (update fallback):", updateError);
          throw updateError;
        }
      }

      // cache local
      setCachedLike(imageId, false);
      mem.likedFetchedFromDb = true;

      return;
    }

    const { error: updateError } = await supabase
      .from("interactions")
      .update({ likes: 0 })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Erro ao descurtir (update):", updateError);
      throw updateError;
    }

    // cache local
    setCachedLike(imageId, false);
    mem.likedFetchedFromDb = true;

    return;
  }

  const { error } = await supabase
    .from("interactions")
    .update({ likes: 1 })
    .eq("id", existing.id);

  if (error) {
    console.error("Erro ao curtir (update):", error);
    throw error;
  }

  // cache local
  setCachedLike(imageId, true);
  mem.likedFetchedFromDb = true;
};

export const incrementLike = async (imageId) => setLike(imageId, true);
export const decrementLike = async (imageId) => setLike(imageId, false);

export const incrementDownload = async (imageId) => {
  const sessionId = getSessionId();
  const existing = await getInteraction(imageId);

  if (!existing) {
    const { error } = await supabase.from("interactions").insert({
      image_id: imageId,
      downloads: 1,
      likes: 0,
      session_id: sessionId,
    });

    if (error) {
      console.error("Erro ao registrar download (insert):", error);
      throw error;
    }

    // cache local
    markCachedDownload(imageId);
    mem.downloadedFetchedFromDb = true;

    return;
  }

  const nextDownloads = Number(existing.downloads || 0) + 1;

  const { error } = await supabase
    .from("interactions")
    .update({ downloads: nextDownloads })
    .eq("id", existing.id);

  if (error) {
    console.error("Erro ao registrar download (update):", error);
    throw error;
  }

  // cache local
  markCachedDownload(imageId);
  mem.downloadedFetchedFromDb = true;
};

export const getLikedImageIds = async () => {
  const sessionId = ensureHydrated();

  if (mem.likedFetchedFromDb) return Array.from(mem.likedIds);

  if (mem.likedIds.size > 0) {
    if (!mem.likedFetchPromise) {
      mem.likedFetchPromise = (async () => {
        const { data, error } = await supabase
          .from("interactions")
          .select("image_id")
          .eq("session_id", sessionId)
          .gt("likes", 0);

        if (error) {
          console.error("Erro ao buscar imagens curtidas:", error);
          return Array.from(mem.likedIds);
        }

        const ids = data.map((row) => row.image_id);
        mem.likedIds = new Set(ids);
        persistLiked(sessionId);
        mem.likedFetchedFromDb = true;

        return ids;
      })().finally(() => {
        mem.likedFetchPromise = null;
      });
    }

    return Array.from(mem.likedIds);
  }

  // sem cache local: busca do DB (await)
  if (mem.likedFetchPromise) return mem.likedFetchPromise;

  mem.likedFetchPromise = (async () => {
    const { data, error } = await supabase
      .from("interactions")
      .select("image_id")
      .eq("session_id", sessionId)
      .gt("likes", 0);

    if (error) {
      console.error("Erro ao buscar imagens curtidas:", error);
      return [];
    }

    const ids = data.map((row) => row.image_id);
    mem.likedIds = new Set(ids);
    persistLiked(sessionId);
    mem.likedFetchedFromDb = true;

    return ids;
  })().finally(() => {
    mem.likedFetchPromise = null;
  });

  return mem.likedFetchPromise;
};

export const getDownloadedImageIds = async () => {
  const sessionId = ensureHydrated();

  if (mem.downloadedFetchedFromDb) return Array.from(mem.downloadedIds);

  if (mem.downloadedIds.size > 0) {
    if (!mem.downloadedFetchPromise) {
      mem.downloadedFetchPromise = (async () => {
        const { data, error } = await supabase
          .from("interactions")
          .select("image_id")
          .eq("session_id", sessionId)
          .gt("downloads", 0);

        if (error) {
          console.error("Erro ao buscar imagens baixadas:", error);
          return Array.from(mem.downloadedIds);
        }

        const ids = data.map((row) => row.image_id);
        mem.downloadedIds = new Set(ids);
        persistDownloaded(sessionId);
        mem.downloadedFetchedFromDb = true;

        return ids;
      })().finally(() => {
        mem.downloadedFetchPromise = null;
      });
    }

    return Array.from(mem.downloadedIds);
  }

  if (mem.downloadedFetchPromise) return mem.downloadedFetchPromise;

  mem.downloadedFetchPromise = (async () => {
    const { data, error } = await supabase
      .from("interactions")
      .select("image_id")
      .eq("session_id", sessionId)
      .gt("downloads", 0);

    if (error) {
      console.error("Erro ao buscar imagens baixadas:", error);
      return [];
    }

    const ids = data.map((row) => row.image_id);
    mem.downloadedIds = new Set(ids);
    persistDownloaded(sessionId);
    mem.downloadedFetchedFromDb = true;

    return ids;
  })().finally(() => {
    mem.downloadedFetchPromise = null;
  });

  return mem.downloadedFetchPromise;
};
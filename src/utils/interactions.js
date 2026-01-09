import { supabase } from "../lib/supabase";
import { getSessionId } from "./sessionId";

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

  // Se não existe linha:
  // - curtir cria
  // - descurtir não faz nada
  if (!existing) {
    if (!wantsLike) return;

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

    return;
  }

  const downloads = Number(existing.downloads || 0);

  // DESCURTIR
  if (!wantsLike) {
    // Se downloads=0 -> apaga a linha inteira (se nunca tivesse existido)
    if (downloads === 0) {
      const { error: delError } = await supabase
        .from("interactions")
        .delete()
        .eq("id", existing.id);

      if (delError) {
        // Se delete falhar por policy, pelo menos zera o like (não quebra UI/categoria)
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

      return;
    }

    // Se downloads>0 -> mantém linha e zera like
    const { error: updateError } = await supabase
      .from("interactions")
      .update({ likes: 0 })
      .eq("id", existing.id);

    if (updateError) {
      console.error("Erro ao descurtir (update):", updateError);
      throw updateError;
    }

    return;
  }

  // CURTIR: sempre likes=1 (binário)
  const { error } = await supabase
    .from("interactions")
    .update({ likes: 1 })
    .eq("id", existing.id);

  if (error) {
    console.error("Erro ao curtir (update):", error);
    throw error;
  }
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
};

export const getLikedImageIds = async () => {
  const sessionId = getSessionId();

  const { data, error } = await supabase
    .from("interactions")
    .select("image_id")
    .eq("session_id", sessionId)
    .gt("likes", 0);

  if (error) {
    console.error("Erro ao buscar imagens curtidas:", error);
    return [];
  }

  return data.map((row) => row.image_id);
};

export const getDownloadedImageIds = async () => {
  const sessionId = getSessionId();

  const { data, error } = await supabase
    .from("interactions")
    .select("image_id")
    .eq("session_id", sessionId)
    .gt("downloads", 0);

  if (error) {
    console.error("Erro ao buscar imagens baixadas:", error);
    return [];
  }

  return data.map((row) => row.image_id);
};
import axios from "axios";

const ACCESS_KEY = import.meta.env.VITE_UNSPLASH_API_KEY;

export const unsplash = axios.create({
  baseURL: "https://api.unsplash.com",
  headers: {
    Authorization: `Client-ID ${ACCESS_KEY}`,
    "Accept-Version": "v1",
  },
});

export const listPhotos = (params, signal) =>
  unsplash.get("/photos", { params, signal });

export const searchPhotos = (params, signal) =>
  unsplash.get("/search/photos", { params, signal });

export const getPhotoById = (id, signal) =>
  unsplash.get(`/photos/${id}`, { signal });
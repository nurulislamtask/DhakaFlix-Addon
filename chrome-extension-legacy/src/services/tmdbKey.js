// TMDB API key — read fresh on every call, so a key saved in the in-app
// settings takes effect without reloading the extension.
//
// Priority: key saved in the app (localStorage) > build-time .env key
// (VITE_TMDB_API_KEY). No key is ever hardcoded here: the old placeholder
// default was not a real key (TMDB answered it with HTTP 401 "Invalid API
// key"), which made every poster lookup return zero results.
export const TMDB_KEY_STORAGE_KEY = 'tmdb_api_key';

export function getTmdbKey() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(TMDB_KEY_STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
    }
  } catch (e) {
    // Storage unavailable (e.g. private mode) — fall through to the .env key.
  }
  const envKey = import.meta.env.VITE_TMDB_API_KEY;
  return envKey && envKey.trim() ? envKey.trim() : '';
}

const KEY = "album:uiState:v1";

export function readUIState() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function writeUIState(nextState) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(nextState));
  } catch {
  }
}
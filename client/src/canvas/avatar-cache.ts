interface AvatarEntry {
  img: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
  fallbackTried: boolean;
  fallback?: string;
}

export const AVATAR_READY_EVENT = "rocambor:avatar-ready";

const cache = new Map<string, AvatarEntry>();

export function getAvatarImage(url: string, fallback?: string): HTMLImageElement | null {
  const key = `${url}::${fallback || ""}`;
  const existing = cache.get(key);
  if (existing) {
    return existing.loaded ? existing.img : null;
  }

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.referrerPolicy = "no-referrer";

  const entry: AvatarEntry = {
    img,
    loaded: false,
    failed: false,
    fallbackTried: false,
    fallback,
  };
  cache.set(key, entry);

  img.onload = () => {
    entry.loaded = true;
    entry.failed = false;
    window.dispatchEvent(new Event(AVATAR_READY_EVENT));
  };

  img.onerror = () => {
    if (entry.fallback && !entry.fallbackTried) {
      entry.fallbackTried = true;
      img.src = entry.fallback;
      return;
    }
    entry.loaded = false;
    entry.failed = true;
    window.dispatchEvent(new Event(AVATAR_READY_EVENT));
  };

  img.src = url;
  return null;
}

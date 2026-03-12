export function detectGameMobilePortrait(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(max-width: 900px)").matches &&
    window.matchMedia("(orientation: portrait)").matches
  );
}

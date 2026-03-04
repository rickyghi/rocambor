export type ToastType = "info" | "success" | "error" | "warning";

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (!container) {
    container = document.createElement("div");
    container.id = "toasts";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(
  message: string,
  type: ToastType = "info",
  duration = 4000
): void {
  const c = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  c.appendChild(el);

  setTimeout(() => {
    el.classList.add("toast-exit");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

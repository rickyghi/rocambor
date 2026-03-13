export type ToastType = "info" | "success" | "error" | "warning";

let container: HTMLElement | null = null;
const activeTimers = new Set<ReturnType<typeof setTimeout>>();

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

  const exitTimer = setTimeout(() => {
    activeTimers.delete(exitTimer);
    el.classList.add("toast-exit");
    const removeTimer = setTimeout(() => {
      activeTimers.delete(removeTimer);
      el.remove();
    }, 300);
    activeTimers.add(removeTimer);
  }, duration);
  activeTimers.add(exitTimer);
}

/** Cancel all pending toast timers and remove the container. */
export function clearToasts(): void {
  for (const t of activeTimers) clearTimeout(t);
  activeTimers.clear();
  if (container) {
    container.remove();
    container = null;
  }
}

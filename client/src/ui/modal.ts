export interface ModalOptions {
  title: string;
  content: HTMLElement | string;
  size?: "sm" | "md" | "lg";
  scroll?: boolean;
  dismissible?: boolean;
  closeAriaLabel?: string;
  actions?: Array<{
    label: string;
    className?: string;
    onClick: () => void | boolean;
  }>;
  onClose?: () => void;
}

export function showModal(options: ModalOptions): () => void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const dismissible = options.dismissible !== false;
  const previousFocus =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let closed = false;

  const modal = document.createElement("div");
  modal.className = `modal modal-${options.size || "md"}${options.scroll ? " modal-scroll" : ""}`;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.tabIndex = -1;

  const h2 = document.createElement("h2");
  const headingId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  h2.id = headingId;
  h2.textContent = options.title;
  modal.setAttribute("aria-labelledby", headingId);
  modal.appendChild(h2);

  if (dismissible) {
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "modal-close";
    closeBtn.setAttribute("aria-label", options.closeAriaLabel || "Close modal");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => close());
    modal.appendChild(closeBtn);
  }

  if (typeof options.content === "string") {
    const p = document.createElement("p");
    p.textContent = options.content;
    p.style.color = "var(--text-secondary)";
    p.style.marginBottom = "12px";
    modal.appendChild(p);
  } else {
    modal.appendChild(options.content);
  }

  if (options.actions && options.actions.length > 0) {
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "actions";
    for (const action of options.actions) {
      const btn = document.createElement("button");
      btn.textContent = action.label;
      btn.className = action.className || "btn-secondary";
      btn.onclick = () => {
        const result = action.onClick();
        if (result !== false) {
          close();
        }
      };
      actionsDiv.appendChild(btn);
    }
    modal.appendChild(actionsDiv);
  }

  overlay.appendChild(modal);

  overlay.addEventListener("click", (e) => {
    if (dismissible && e.target === overlay) close();
  });

  const getFocusable = (): HTMLElement[] => {
    const candidates = Array.from(
      modal.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )
    );
    return candidates.filter(
      (el) =>
        el.getAttribute("aria-hidden") !== "true" &&
        el.tabIndex !== -1 &&
        el.getClientRects().length > 0
    );
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (dismissible && e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key !== "Tab") return;

    const focusable = getFocusable();
    if (focusable.length === 0) {
      e.preventDefault();
      modal.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (e.shiftKey) {
      if (!active || !modal.contains(active) || active === first) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (!active || !modal.contains(active) || active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  document.body.appendChild(overlay);
  const firstInteractive = getFocusable()[0];
  (firstInteractive || modal).focus();

  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    try {
      previousFocus?.focus();
    } catch {
      // Ignore focus restore failures.
    }
    options.onClose?.();
  }

  return close;
}

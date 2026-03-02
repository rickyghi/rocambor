export interface ModalOptions {
  title: string;
  content: HTMLElement | string;
  actions?: Array<{
    label: string;
    className?: string;
    onClick: () => void;
  }>;
  onClose?: () => void;
}

export function showModal(options: ModalOptions): () => void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const modal = document.createElement("div");
  modal.className = "modal";

  const h2 = document.createElement("h2");
  h2.textContent = options.title;
  modal.appendChild(h2);

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
      if (action.className) btn.className = action.className;
      btn.onclick = () => {
        action.onClick();
        close();
      };
      actionsDiv.appendChild(btn);
    }
    modal.appendChild(actionsDiv);
  }

  overlay.appendChild(modal);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.body.appendChild(overlay);

  function close(): void {
    overlay.remove();
    options.onClose?.();
  }

  return close;
}

import type { ConnectionManager } from "./connection";
import type { ClientState } from "./state";
import type { SoundManager } from "./audio/sounds";
import type { SettingsManager } from "./ui/settings";

export interface AppContext {
  connection: ConnectionManager;
  state: ClientState;
  sounds: SoundManager;
  settings: SettingsManager;
  router: Router;
}

export interface Screen {
  mount(container: HTMLElement, ctx: AppContext): void;
  unmount(): void;
  update?(): void;
}

export type ScreenFactory = () => Screen;

export class Router {
  private screens = new Map<string, ScreenFactory>();
  private current: Screen | null = null;
  private currentName: string | null = null;
  private container: HTMLElement;
  private ctx: AppContext;

  constructor(container: HTMLElement, ctx: Omit<AppContext, "router">) {
    this.container = container;
    this.ctx = { ...ctx, router: this };

    window.addEventListener("hashchange", () => this.handleHash());
  }

  register(name: string, factory: ScreenFactory): void {
    this.screens.set(name, factory);
  }

  navigate(name: string, _params?: Record<string, string>): void {
    if (this.currentName === name) return;

    if (this.current) {
      this.current.unmount();
      this.current = null;
    }

    this.container.innerHTML = "";

    const factory = this.screens.get(name);
    if (!factory) {
      console.error(`[router] Unknown screen: ${name}`);
      return;
    }

    this.current = factory();
    this.currentName = name;
    this.current.mount(this.container, this.ctx);
  }

  getCurrentScreen(): string | null {
    return this.currentName;
  }

  private handleHash(): void {
    const hash = window.location.hash.slice(1);
    if (hash && this.screens.has(hash)) {
      this.navigate(hash);
    }
  }
}

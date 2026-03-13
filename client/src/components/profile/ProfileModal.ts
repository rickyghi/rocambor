import type { AuthManager } from "../../auth/supabase-auth";
import {
  avatarFromSeed as buildSeedAvatar,
  buildDiceBearUrl,
  buildInitialsAvatarDataUrl,
  createAvatarPresets,
  fallbackAvatarAt,
  randomAvatarSeed,
} from "../../lib/avatars";
import { fetchCurrentAccount, fetchCurrentMatchHistory } from "../../lib/account-api";
import {
  loadProfileMatchHistory,
  saveAccountProfileMatchHistory,
  subscribeProfileMatchHistory,
} from "../../lib/profile-history";
import {
  ProfileManager,
  normalizeProfileName,
  validateProfileName,
} from "../../lib/profile";
import {
  createTranslator,
  formatMemberSince,
  formatRelativeTime,
  modeLabel,
  type Locale,
} from "../../i18n";
import type { ProfileMatchHistoryEntry } from "../../protocol";
import { showModal } from "../../ui/modal";

function isNameSeedAvatar(name: string, avatar: string): boolean {
  return avatar === buildSeedAvatar(name) || avatar === buildDiceBearUrl(name, "identicon");
}

function apiBase(): string {
  return ((import.meta as any).env?.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";
}

function escapeText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

interface RemoteProfileStats {
  gamesPlayed: number;
  wins: number;
  winRate: number;
  elo: number;
  lastPlayed: string | null;
  standing: number | null;
}

interface HonorTier {
  label: string;
  minElo: number;
  nextLabel: string | null;
  nextElo: number | null;
}

interface Achievement {
  key: string;
  label: string;
  unlocked: boolean;
}

const HONOR_LADDER: HonorTier[] = [
  { label: "Hidalgo", minElo: 0, nextLabel: "Caballero", nextElo: 1240 },
  { label: "Caballero", minElo: 1240, nextLabel: "Grandee", nextElo: 1320 },
  { label: "Grandee", minElo: 1320, nextLabel: "Duke", nextElo: 1420 },
  { label: "Duke", minElo: 1420, nextLabel: null, nextElo: null },
];

function resolveHonorTier(elo: number): HonorTier {
  for (let index = HONOR_LADDER.length - 1; index >= 0; index -= 1) {
    if (elo >= HONOR_LADDER[index].minElo) return HONOR_LADDER[index];
  }
  return HONOR_LADDER[0];
}

function buildAchievementModel(stats: RemoteProfileStats, locale: Locale): Achievement[] {
  const { t } = createTranslator(locale);
  return [
    {
      key: "grandee",
      label: locale === "es" ? "El Grande" : "The Grandee",
      unlocked: stats.elo >= 1320,
    },
    {
      key: "matador",
      label: locale === "es" ? "Maestro Matador" : "Matador Master",
      unlocked: stats.wins >= 12,
    },
    {
      key: "royal",
      label: locale === "es" ? "Flor Real" : "Royal Flush",
      unlocked: stats.gamesPlayed >= 8 && stats.winRate >= 0.6,
    },
    {
      key: "silent",
      label: locale === "es" ? "Estratega Silencioso" : "Silent Strategist",
      unlocked: stats.gamesPlayed >= 20,
    },
    {
      key: "quadrille",
      label: locale === "es" ? "Rey del Quadrille" : "Quadrille King",
      unlocked: stats.gamesPlayed >= 30,
    },
    {
      key: "brave",
      label: locale === "es" ? "Cantor Valiente" : "Brave Bidder",
      unlocked: stats.gamesPlayed >= 5,
    },
  ];
}

function renderAchievementGrid(achievements: Achievement[], locale: Locale): string {
  const { t } = createTranslator(locale);
  return achievements
    .map(
      (achievement) => `
        <div class="profile-achievement${achievement.unlocked ? " unlocked" : " locked"}">
          <span class="profile-achievement-mark" aria-hidden="true">${
            achievement.key === "grandee"
              ? "♛"
              : achievement.key === "matador"
                ? "⚔"
                : achievement.key === "royal"
                  ? "☆"
                  : achievement.key === "silent"
                    ? "◈"
                    : achievement.key === "quadrille"
                      ? "◭"
                      : "⚡"
          }</span>
          <span class="profile-achievement-label">${escapeText(achievement.label)}</span>
          ${achievement.unlocked ? "" : `<span class="profile-achievement-lock">${escapeText(t("profile.locked"))}</span>`}
        </div>
      `
    )
    .join("");
}

function renderRecentMatches(
  locale: Locale,
  history: ProfileMatchHistoryEntry[]
): string {
  const { t } = createTranslator(locale);
  if (!history.length) {
    return `<div class="profile-recent-empty">${escapeText(t("profile.noRecentMatches"))}</div>`;
  }

  return history
    .slice(0, 5)
    .map((entry) => {
      const outcomeLabel = entry.outcome === "win" ? (locale === "es" ? "V" : "W") : (locale === "es" ? "D" : "L");
      const scoreLabel = `${entry.score >= 0 ? "+" : ""}${entry.score}`;
      const modeLabelText = modeLabel(entry.mode, locale);
      const roleLabel =
        entry.role === "ombre"
          ? "Ombre"
          : entry.role === "resting"
            ? locale === "es"
              ? "Descansa"
              : "Resting"
            : "Contra";

      return `
        <div class="profile-match-row ${entry.outcome}">
          <div class="profile-match-outcome">${outcomeLabel}</div>
          <div class="profile-match-copy">
            <div class="profile-match-title">${modeLabelText}</div>
            <div class="profile-match-meta">
              <span class="profile-match-role">${roleLabel}</span>
              <span class="profile-match-time">${formatRelativeTime(entry.recordedAt, locale)}</span>
            </div>
          </div>
          <div class="profile-match-score">
            <span class="profile-match-value">${scoreLabel}</span>
            <span class="profile-match-caption">${escapeText(t("profile.finalScore"))}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

async function fetchRemoteProfileStats(auth?: AuthManager): Promise<RemoteProfileStats> {
  let playerId =
    localStorage.getItem("rocambor_currentPlayerId") ||
    localStorage.getItem("rocambor_playerId");

  try {
    const base = apiBase();
    const leaderboardPromise = fetch(`${base}/api/leaderboard?limit=100`);
    const accountPromise = auth ? fetchCurrentAccount(auth) : Promise.resolve(null);
    const [leaderboardRes, me] = await Promise.all([leaderboardPromise, accountPromise]);

    if (me?.playerId) {
      playerId = me.playerId;
      const leaderboardPayload = leaderboardRes.ok ? await leaderboardRes.json() : null;
      const leaderboard = Array.isArray(leaderboardPayload?.leaderboard)
        ? leaderboardPayload.leaderboard
        : [];
      const standingIndex = leaderboard.findIndex(
        (entry: { playerId?: string }) => entry.playerId === me.playerId
      );

      return {
        gamesPlayed: me.gamesPlayed,
        wins: me.wins,
        winRate:
          me.gamesPlayed > 0 ? me.wins / Math.max(1, me.gamesPlayed) : 0,
        elo: me.elo,
        lastPlayed: me.lastPlayed,
        standing: standingIndex >= 0 ? standingIndex + 1 : null,
      };
    }

    if (!playerId) {
      return {
        gamesPlayed: 0,
        wins: 0,
        winRate: 0,
        elo: 1200,
        lastPlayed: null,
        standing: null,
      };
    }

    const [statsRes, leaderboardPayload] = await Promise.all([
      fetch(`${base}/api/players/${playerId}/stats`),
      leaderboardRes.ok ? leaderboardRes.json() : Promise.resolve(null),
    ]);

    const statsPayload = statsRes.ok ? await statsRes.json() : null;
    const leaderboard = Array.isArray(leaderboardPayload?.leaderboard)
      ? leaderboardPayload.leaderboard
      : [];
    const standingIndex = leaderboard.findIndex((entry: { playerId?: string }) => entry.playerId === playerId);

    return {
      gamesPlayed: Number(statsPayload?.gamesPlayed) || 0,
      wins: Number(statsPayload?.wins) || 0,
      winRate:
        typeof statsPayload?.winRate === "number"
          ? statsPayload.winRate
          : (Number(statsPayload?.gamesPlayed) || 0) > 0
            ? (Number(statsPayload?.wins) || 0) / Math.max(1, Number(statsPayload?.gamesPlayed) || 1)
            : 0,
      elo: Number(statsPayload?.elo) || 1200,
      lastPlayed: typeof statsPayload?.lastPlayed === "string" ? statsPayload.lastPlayed : null,
      standing: standingIndex >= 0 ? standingIndex + 1 : null,
    };
  } catch {
    return {
      gamesPlayed: 0,
      wins: 0,
      winRate: 0,
      elo: 1200,
      lastPlayed: null,
      standing: null,
    };
  }
}

function bindPreviewFallback(
  image: HTMLImageElement,
  fallback: string,
  name: string
): void {
  image.onerror = () => {
    image.onerror = null;
    image.src = fallback || buildInitialsAvatarDataUrl(name);
  };
}

export interface ProfileModalOptions {
  force?: boolean;
  title?: string;
  onSaved?: () => void;
  locale?: Locale;
  auth?: AuthManager;
}

export function openProfileModal(
  profile: ProfileManager,
  options: ProfileModalOptions = {}
): void {
  const locale = options.locale || "en";
  const { t } = createTranslator(locale);
  const current = profile.get();
  let useNameSeed = isNameSeedAvatar(current.name, current.avatar);
  let selectedAvatar = current.avatar || buildSeedAvatar(current.name);
  let baseSeed = current.name || randomAvatarSeed();
  let presets = createAvatarPresets(baseSeed);
  const accountId = options.auth?.getUserId() || null;
  const canUploadPortrait = Boolean(accountId && options.auth?.isConfigured());
  const recentHistory = loadProfileMatchHistory(accountId);

  const content = document.createElement("div");
  content.className = "profile-modal";
  content.innerHTML = `
    <div class="profile-dashboard">
      <section class="profile-hero-card">
        <div class="profile-hero-avatar-shell">
          <div class="profile-hero-avatar-ring">
            <img class="profile-preview-avatar profile-hero-avatar" alt="${t("profile.selectedAvatar")}" />
          </div>
          <span class="profile-hero-rank-chip">Hidalgo</span>
        </div>
        <div class="profile-preview-name profile-hero-name"></div>
        <div class="profile-member-since">${escapeText(
          formatMemberSince(profile.getCreatedAt(), locale)
        )}</div>
        <div class="profile-stat-grid">
          <div class="profile-stat-card">
            <span class="profile-stat-label">${t("profile.winRate")}</span>
            <strong class="profile-stat-value" data-field="winRate">--</strong>
          </div>
          <div class="profile-stat-card">
            <span class="profile-stat-label">${t("profile.games")}</span>
            <strong class="profile-stat-value" data-field="gamesPlayed">--</strong>
          </div>
          <div class="profile-stat-card">
            <span class="profile-stat-label">${t("profile.elo")}</span>
            <strong class="profile-stat-value" data-field="elo">--</strong>
          </div>
          <div class="profile-stat-card">
            <span class="profile-stat-label">${t("profile.ledger")}</span>
            <strong class="profile-stat-value" data-field="standing">${t("profile.unranked")}</strong>
          </div>
        </div>
        <div class="profile-progress-row">
          <span class="profile-progress-label">${escapeText(t("profile.progressTo", { tier: "Grandee" }))}</span>
          <span class="profile-progress-value">--</span>
        </div>
        <div class="profile-progress-bar">
          <span class="profile-progress-fill" style="width:0%"></span>
        </div>
      </section>

      <div class="profile-side-stack">
        <section class="profile-info-card">
          <div class="profile-card-head">
            <span class="profile-card-icon">✦</span>
            <div>
              <div class="profile-card-title">${t("profile.salonStanding")}</div>
              <div class="profile-card-caption">${t("profile.accountContext")}</div>
            </div>
          </div>
          <div class="profile-meta-grid">
            <div class="profile-meta-item">
              <span class="profile-meta-label">${t("profile.lastMatch")}</span>
              <span class="profile-meta-value" data-field="lastPlayed">${t("profile.waitingFirstGame")}</span>
            </div>
            <div class="profile-meta-item">
              <span class="profile-meta-label">${t("profile.wins")}</span>
              <span class="profile-meta-value" data-field="wins">0</span>
            </div>
          </div>
        </section>

        <section class="profile-achievements-card">
          <div class="profile-card-head">
            <span class="profile-card-icon">⌘</span>
            <div>
              <div class="profile-card-title">${t("profile.medalGallery")}</div>
              <div class="profile-card-caption">${t("profile.medalGalleryCaption")}</div>
            </div>
          </div>
          <div class="profile-achievement-grid"></div>
        </section>

        <section class="profile-recent-card">
          <div class="profile-card-head">
            <span class="profile-card-icon">↺</span>
            <div>
              <div class="profile-card-title">${t("profile.recentMatches")}</div>
              <div class="profile-card-caption">${t("profile.recentMatchesCaption")}</div>
            </div>
          </div>
          <div class="profile-recent-list">${renderRecentMatches(locale, recentHistory)}</div>
        </section>
      </div>
    </div>

    <section class="profile-editor">
      <div class="profile-editor-head">
        <div>
          <div class="profile-card-title">${t("profile.editProfile")}</div>
          <div class="profile-card-caption">${t("profile.editProfileCaption")}</div>
        </div>
      </div>
      <div class="modal-form-group">
        <label for="profile-name">${t("profile.displayName")}</label>
        <input id="profile-name" type="text" maxlength="18" autocomplete="nickname" />
      </div>
      <label class="profile-seed-toggle">
        <input id="profile-name-seed" type="checkbox" ${useNameSeed ? "checked" : ""} />
        ${t("profile.useNameSeed")}
      </label>
      <div class="profile-avatar-toolbar">
        ${
          canUploadPortrait
            ? `<input id="profile-avatar-upload" type="file" accept="image/*" hidden />
               <button type="button" class="btn-secondary profile-upload-avatar">${t("profile.uploadPortrait")}</button>`
            : `<span class="profile-upload-hint">${t("profile.signInToUploadPortrait")}</span>`
        }
        <button type="button" class="btn-secondary profile-randomize">${t("profile.randomize")}</button>
      </div>
      <div class="profile-avatar-grid" role="listbox" aria-label="${t("profile.avatarChoices")}"></div>
      <p class="profile-status" aria-live="polite"></p>
    </section>
  `;

  const nameInput = content.querySelector("#profile-name") as HTMLInputElement;
  const useNameSeedInput = content.querySelector("#profile-name-seed") as HTMLInputElement;
  const uploadInput = content.querySelector("#profile-avatar-upload") as HTMLInputElement | null;
  const uploadBtn = content.querySelector(".profile-upload-avatar") as HTMLButtonElement | null;
  const randomizeBtn = content.querySelector(".profile-randomize") as HTMLButtonElement;
  const grid = content.querySelector(".profile-avatar-grid") as HTMLElement;
  const status = content.querySelector(".profile-status") as HTMLElement;
  const previewAvatar = content.querySelector(".profile-preview-avatar") as HTMLImageElement;
  const previewName = content.querySelector(".profile-preview-name") as HTMLElement;
  const rankChip = content.querySelector(".profile-hero-rank-chip") as HTMLElement;
  const winRateField = content.querySelector('[data-field="winRate"]') as HTMLElement;
  const gamesField = content.querySelector('[data-field="gamesPlayed"]') as HTMLElement;
  const eloField = content.querySelector('[data-field="elo"]') as HTMLElement;
  const standingField = content.querySelector('[data-field="standing"]') as HTMLElement;
  const winsField = content.querySelector('[data-field="wins"]') as HTMLElement;
  const lastPlayedField = content.querySelector('[data-field="lastPlayed"]') as HTMLElement;
  const progressLabel = content.querySelector(".profile-progress-label") as HTMLElement;
  const progressValue = content.querySelector(".profile-progress-value") as HTMLElement;
  const progressFill = content.querySelector(".profile-progress-fill") as HTMLElement;
  const achievementGrid = content.querySelector(".profile-achievement-grid") as HTMLElement;
  const recentList = content.querySelector(".profile-recent-list") as HTMLElement;

  nameInput.value = current.name;

  let uploadInFlight = false;

  const setStatus = (message: string, variant: "idle" | "error" | "success" = "idle"): void => {
    status.textContent = message;
    status.classList.toggle("error", variant === "error");
    status.classList.toggle("success", variant === "success");
  };

  const setUploadBusy = (busy: boolean): void => {
    uploadInFlight = busy;
    if (uploadBtn) uploadBtn.disabled = busy;
    if (uploadInput) uploadInput.disabled = busy;
  };

  const setPreview = (): void => {
    const normalized = normalizeProfileName(nameInput.value) || (locale === "es" ? "Jugador" : "Player");
    const fallback = fallbackAvatarAt(Math.abs(normalized.charCodeAt(0) || 0) % 12);
    const avatar = useNameSeedInput.checked ? buildSeedAvatar(normalized) : selectedAvatar;
    previewName.textContent = normalized;
    previewAvatar.src = avatar;
    bindPreviewFallback(previewAvatar, fallback, normalized);
  };

  const renderAvatarGrid = (): void => {
    grid.innerHTML = "";
    const avatarChoices =
      !useNameSeedInput.checked &&
      selectedAvatar &&
      !presets.some((preset) => preset.url === selectedAvatar)
        ? [{ url: selectedAvatar, fallback: selectedAvatar }, ...presets]
        : presets;

    avatarChoices.forEach((preset, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-avatar-option";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-label", t("profile.avatarOption", { index: index + 1 }));
      btn.setAttribute("aria-selected", String(selectedAvatar === preset.url));
      if (selectedAvatar === preset.url && !useNameSeedInput.checked) {
        btn.classList.add("selected");
      }

      const img = document.createElement("img");
      img.src = preset.url;
      img.alt = t("profile.avatarOption", { index: index + 1 });
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        img.onerror = null;
        img.src =
          preset.fallback ||
          buildInitialsAvatarDataUrl(
            normalizeProfileName(nameInput.value) || (locale === "es" ? "Jugador" : "Player")
          );
      };

      btn.appendChild(img);
      btn.addEventListener("click", () => {
        useNameSeedInput.checked = false;
        selectedAvatar = preset.url;
        renderAvatarGrid();
        setPreview();
      });
      grid.appendChild(btn);
    });
  };

  nameInput.addEventListener("input", () => {
    if (useNameSeedInput.checked) {
      selectedAvatar = buildSeedAvatar(
        normalizeProfileName(nameInput.value) || (locale === "es" ? "Jugador" : "Player")
      );
    }
    setPreview();
  });

  useNameSeedInput.addEventListener("change", () => {
    if (useNameSeedInput.checked) {
      selectedAvatar = buildSeedAvatar(
        normalizeProfileName(nameInput.value) || (locale === "es" ? "Jugador" : "Player")
      );
    }
    renderAvatarGrid();
    setPreview();
  });

  randomizeBtn.addEventListener("click", () => {
    baseSeed = randomAvatarSeed();
    presets = createAvatarPresets(baseSeed);
    useNameSeedInput.checked = false;
    renderAvatarGrid();
    setPreview();
  });

  uploadBtn?.addEventListener("click", () => {
    if (uploadInFlight) return;
    uploadInput?.click();
  });

  uploadInput?.addEventListener("change", () => {
    const file = uploadInput.files?.[0];
    if (!file || !options.auth) return;

    if (!file.type.startsWith("image/")) {
      setStatus(t("profile.portraitFileType"), "error");
      uploadInput.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus(t("profile.portraitFileSize"), "error");
      uploadInput.value = "";
      return;
    }

    setUploadBusy(true);
    setStatus(t("profile.uploadingPortrait"));

    void options.auth
      .uploadAvatar(file)
      .then((publicUrl) => {
        useNameSeedInput.checked = false;
        selectedAvatar = publicUrl;
        renderAvatarGrid();
        setPreview();
        setStatus(t("profile.portraitUploaded"), "success");
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("profile.portraitUploadFailed");
        setStatus(message, "error");
      })
      .finally(() => {
        setUploadBusy(false);
        if (uploadInput) {
          uploadInput.value = "";
        }
      });
  });

  renderAvatarGrid();
  setPreview();

  fetchRemoteProfileStats(options.auth).then((stats) => {
    const tier = resolveHonorTier(stats.elo);
    const nextElo = tier.nextElo ?? stats.elo;
    const tierFloor = tier.minElo;
    const progressRatio =
      tier.nextElo === null
        ? 1
        : Math.max(0, Math.min(1, (stats.elo - tierFloor) / Math.max(1, nextElo - tierFloor)));

    winRateField.textContent = `${Math.round(stats.winRate * 1000) / 10}%`;
    gamesField.textContent = formatNumber(stats.gamesPlayed);
    eloField.textContent = formatNumber(stats.elo);
    standingField.textContent = stats.standing ? `#${stats.standing}` : t("profile.unranked");
    winsField.textContent = formatNumber(stats.wins);
    lastPlayedField.textContent = stats.lastPlayed
      ? formatRelativeTime(stats.lastPlayed, locale)
      : t("profile.waitingFirstGame");
    rankChip.textContent = tier.label;
    progressLabel.textContent = tier.nextLabel
      ? t("profile.progressTo", { tier: tier.nextLabel })
      : t("profile.crownReached");
    progressValue.textContent = tier.nextElo
      ? `${formatNumber(stats.elo)} / ${formatNumber(tier.nextElo)} Elo`
      : `${formatNumber(stats.elo)} Elo`;
    progressFill.style.width = `${Math.round(progressRatio * 100)}%`;
    achievementGrid.innerHTML = renderAchievementGrid(buildAchievementModel(stats, locale), locale);
  });

  const unsubscribeHistory = subscribeProfileMatchHistory(accountId, (entries) => {
    recentList.innerHTML = renderRecentMatches(locale, entries);
  });

  if (accountId && options.auth) {
    void fetchCurrentMatchHistory(options.auth)
      .then((payload) => {
        if (!payload) return;
        saveAccountProfileMatchHistory(accountId, payload.matches);
      })
      .catch((error) => {
        console.error("[profile] Failed to load account match history:", error);
      });
  }

  showModal({
    title: options.title || t("profile.title"),
    content,
    size: "lg",
    modalClassName: "modal-dark profile-modal-dialog",
    dismissible: !options.force,
    scroll: true,
    closeAriaLabel: t("common.closeModal"),
    onClose: () => {
      unsubscribeHistory();
    },
    actions: [
      ...(options.force
        ? []
        : [{ label: t("common.cancel"), className: "btn-secondary", onClick: () => {} }]),
      {
        label: t("common.save"),
        className: "btn-primary",
        onClick: () => {
          const normalized = normalizeProfileName(nameInput.value);
          const err = validateProfileName(normalized, locale);
          if (err) {
            status.textContent = err;
            status.classList.add("error");
            nameInput.focus();
            return false;
          }

          const avatar = useNameSeedInput.checked ? buildSeedAvatar(normalized) : selectedAvatar;
          const saveErr = profile.set({ name: normalized, avatar }, locale);
          if (saveErr) {
            status.textContent = saveErr;
            status.classList.add("error");
            return false;
          }

          profile.markComplete();
          setStatus("");
          options.onSaved?.();
          return true;
        },
      },
    ],
  });

  setTimeout(() => {
    nameInput.focus();
    nameInput.select();
  }, 40);
}

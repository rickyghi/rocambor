import {
  avatarFromSeed as buildSeedAvatar,
  buildDiceBearUrl,
  buildInitialsAvatarDataUrl,
  createAvatarPresets,
  fallbackAvatarAt,
  randomAvatarSeed,
} from "../../lib/avatars";
import { loadProfileMatchHistory } from "../../lib/profile-history";
import {
  ProfileManager,
  normalizeProfileName,
  validateProfileName,
} from "../../lib/profile";
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

function formatMemberSince(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Member since the first salon";
  return `Member since ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(date)}`;
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(0, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
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

function buildAchievementModel(stats: RemoteProfileStats): Achievement[] {
  return [
    { key: "grandee", label: "The Grandee", unlocked: stats.elo >= 1320 },
    { key: "matador", label: "Matador Master", unlocked: stats.wins >= 12 },
    {
      key: "royal",
      label: "Royal Flush",
      unlocked: stats.gamesPlayed >= 8 && stats.winRate >= 0.6,
    },
    { key: "silent", label: "Silent Strategist", unlocked: stats.gamesPlayed >= 20 },
    { key: "quadrille", label: "Quadrille King", unlocked: stats.gamesPlayed >= 30 },
    { key: "brave", label: "Brave Bidder", unlocked: stats.gamesPlayed >= 5 },
  ];
}

function renderAchievementGrid(achievements: Achievement[]): string {
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
          ${achievement.unlocked ? "" : '<span class="profile-achievement-lock">Locked</span>'}
        </div>
      `
    )
    .join("");
}

function renderRecentMatches(): string {
  const history = loadProfileMatchHistory();
  if (!history.length) {
    return '<div class="profile-recent-empty">Your recent salon matches will appear here.</div>';
  }

  return history
    .slice(0, 5)
    .map((entry) => {
      const outcomeLabel = entry.outcome === "win" ? "W" : "L";
      const scoreLabel = `${entry.score >= 0 ? "+" : ""}${entry.score}`;
      const modeLabel = entry.mode === "tresillo" ? "Tresillo" : "Quadrille";
      const roleLabel =
        entry.role === "ombre" ? "Ombre" : entry.role === "resting" ? "Resting" : "Contra";

      return `
        <div class="profile-match-row ${entry.outcome}">
          <div class="profile-match-outcome">${outcomeLabel}</div>
          <div class="profile-match-copy">
            <div class="profile-match-title">${modeLabel}</div>
            <div class="profile-match-meta">
              <span class="profile-match-role">${roleLabel}</span>
              <span class="profile-match-time">${formatRelativeTime(entry.recordedAt)}</span>
            </div>
          </div>
          <div class="profile-match-score">
            <span class="profile-match-value">${scoreLabel}</span>
            <span class="profile-match-caption">Final score</span>
          </div>
        </div>
      `;
    })
    .join("");
}

async function fetchRemoteProfileStats(): Promise<RemoteProfileStats> {
  const playerId = localStorage.getItem("rocambor_playerId");
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

  try {
    const base = apiBase();
    const [statsRes, leaderboardRes] = await Promise.all([
      fetch(`${base}/api/players/${playerId}/stats`),
      fetch(`${base}/api/leaderboard?limit=100`),
    ]);

    const statsPayload = statsRes.ok ? await statsRes.json() : null;
    const leaderboardPayload = leaderboardRes.ok ? await leaderboardRes.json() : null;
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
}

export function openProfileModal(
  profile: ProfileManager,
  options: ProfileModalOptions = {}
): void {
  const current = profile.get();
  let useNameSeed = isNameSeedAvatar(current.name, current.avatar);
  let selectedAvatar = current.avatar || buildSeedAvatar(current.name);
  let baseSeed = current.name || randomAvatarSeed();
  let presets = createAvatarPresets(baseSeed);

  const content = document.createElement("div");
  content.className = "profile-modal";
  content.innerHTML = `
    <div class="profile-dashboard">
      <section class="profile-hero-card">
        <div class="profile-hero-avatar-shell">
          <div class="profile-hero-avatar-ring">
            <img class="profile-preview-avatar profile-hero-avatar" alt="Selected avatar" />
          </div>
          <span class="profile-hero-rank-chip">Hidalgo</span>
        </div>
        <div class="profile-preview-name profile-hero-name"></div>
        <div class="profile-member-since">${escapeText(
          formatMemberSince(profile.getCreatedAt())
        )}</div>
        <div class="profile-stat-grid">
          <div class="profile-stat-card">
            <span class="profile-stat-label">Win Rate</span>
            <strong class="profile-stat-value" data-field="winRate">--</strong>
          </div>
          <div class="profile-stat-card">
            <span class="profile-stat-label">Games</span>
            <strong class="profile-stat-value" data-field="gamesPlayed">--</strong>
          </div>
          <div class="profile-stat-card">
            <span class="profile-stat-label">Elo</span>
            <strong class="profile-stat-value" data-field="elo">--</strong>
          </div>
          <div class="profile-stat-card">
            <span class="profile-stat-label">Ledger</span>
            <strong class="profile-stat-value" data-field="standing">Unranked</strong>
          </div>
        </div>
        <div class="profile-progress-row">
          <span class="profile-progress-label">Progress to Grandee</span>
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
              <div class="profile-card-title">Salon Standing</div>
              <div class="profile-card-caption">Current account context</div>
            </div>
          </div>
          <div class="profile-meta-grid">
            <div class="profile-meta-item">
              <span class="profile-meta-label">Last Match</span>
              <span class="profile-meta-value" data-field="lastPlayed">Waiting for a first game</span>
            </div>
            <div class="profile-meta-item">
              <span class="profile-meta-label">Wins</span>
              <span class="profile-meta-value" data-field="wins">0</span>
            </div>
          </div>
        </section>

        <section class="profile-achievements-card">
          <div class="profile-card-head">
            <span class="profile-card-icon">⌘</span>
            <div>
              <div class="profile-card-title">Medal Gallery</div>
              <div class="profile-card-caption">Aristocratic achievements and milestones</div>
            </div>
          </div>
          <div class="profile-achievement-grid"></div>
        </section>

        <section class="profile-recent-card">
          <div class="profile-card-head">
            <span class="profile-card-icon">↺</span>
            <div>
              <div class="profile-card-title">Recent Matches</div>
              <div class="profile-card-caption">Your latest salon results on this browser</div>
            </div>
          </div>
          <div class="profile-recent-list">${renderRecentMatches()}</div>
        </section>
      </div>
    </div>

    <section class="profile-editor">
      <div class="profile-editor-head">
        <div>
          <div class="profile-card-title">Edit Profile</div>
          <div class="profile-card-caption">Update your display name and portrait</div>
        </div>
      </div>
      <div class="modal-form-group">
        <label for="profile-name">Display Name</label>
        <input id="profile-name" type="text" maxlength="18" autocomplete="nickname" />
      </div>
      <label class="profile-seed-toggle">
        <input id="profile-name-seed" type="checkbox" ${useNameSeed ? "checked" : ""} />
        Use my name as avatar seed
      </label>
      <div class="profile-avatar-toolbar">
        <button type="button" class="btn-secondary profile-randomize">Randomize choices</button>
      </div>
      <div class="profile-avatar-grid" role="listbox" aria-label="Avatar choices"></div>
      <p class="profile-status" aria-live="polite"></p>
    </section>
  `;

  const nameInput = content.querySelector("#profile-name") as HTMLInputElement;
  const useNameSeedInput = content.querySelector("#profile-name-seed") as HTMLInputElement;
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

  nameInput.value = current.name;

  const setPreview = (): void => {
    const normalized = normalizeProfileName(nameInput.value) || "Player";
    const fallback = fallbackAvatarAt(Math.abs(normalized.charCodeAt(0) || 0) % 12);
    const avatar = useNameSeedInput.checked ? buildSeedAvatar(normalized) : selectedAvatar;
    previewName.textContent = normalized;
    previewAvatar.src = avatar;
    bindPreviewFallback(previewAvatar, fallback, normalized);
  };

  const renderAvatarGrid = (): void => {
    grid.innerHTML = "";
    presets.forEach((preset, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "profile-avatar-option";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-label", `Avatar ${index + 1}`);
      btn.setAttribute("aria-selected", String(selectedAvatar === preset.url));
      if (selectedAvatar === preset.url && !useNameSeedInput.checked) {
        btn.classList.add("selected");
      }

      const img = document.createElement("img");
      img.src = preset.url;
      img.alt = `Avatar option ${index + 1}`;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        img.onerror = null;
        img.src = preset.fallback || buildInitialsAvatarDataUrl(normalizeProfileName(nameInput.value) || "Player");
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
      selectedAvatar = buildSeedAvatar(normalizeProfileName(nameInput.value) || "Player");
    }
    setPreview();
  });

  useNameSeedInput.addEventListener("change", () => {
    if (useNameSeedInput.checked) {
      selectedAvatar = buildSeedAvatar(normalizeProfileName(nameInput.value) || "Player");
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

  renderAvatarGrid();
  setPreview();

  fetchRemoteProfileStats().then((stats) => {
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
    standingField.textContent = stats.standing ? `#${stats.standing}` : "Unranked";
    winsField.textContent = formatNumber(stats.wins);
    lastPlayedField.textContent = stats.lastPlayed ? formatRelativeTime(stats.lastPlayed) : "Waiting for a first game";
    rankChip.textContent = tier.label;
    progressLabel.textContent = tier.nextLabel ? `Progress to ${tier.nextLabel}` : "Crown tier reached";
    progressValue.textContent = tier.nextElo
      ? `${formatNumber(stats.elo)} / ${formatNumber(tier.nextElo)} Elo`
      : `${formatNumber(stats.elo)} Elo`;
    progressFill.style.width = `${Math.round(progressRatio * 100)}%`;
    achievementGrid.innerHTML = renderAchievementGrid(buildAchievementModel(stats));
  });

  showModal({
    title: options.title || "Profile",
    content,
    size: "lg",
    modalClassName: "modal-dark profile-modal-dialog",
    dismissible: !options.force,
    scroll: true,
    actions: [
      ...(options.force ? [] : [{ label: "Cancel", className: "btn-secondary", onClick: () => {} }]),
      {
        label: "Save",
        className: "btn-primary",
        onClick: () => {
          const normalized = normalizeProfileName(nameInput.value);
          const err = validateProfileName(normalized);
          if (err) {
            status.textContent = err;
            status.classList.add("error");
            nameInput.focus();
            return false;
          }

          const avatar = useNameSeedInput.checked ? buildSeedAvatar(normalized) : selectedAvatar;
          const saveErr = profile.set({ name: normalized, avatar });
          if (saveErr) {
            status.textContent = saveErr;
            status.classList.add("error");
            return false;
          }

          profile.markComplete();
          status.textContent = "";
          status.classList.remove("error");
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

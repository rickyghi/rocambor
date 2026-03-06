export function renderGameHeaderMarkup(): string {
  return `
    <header class="game-header panel-noise rc-panel-noise">
      <div class="game-header-left">
        <button class="btn-ghost game-leave-btn" type="button" aria-label="Back to home">← Back</button>
      </div>
      <div class="game-header-center">
        <div class="game-header-main" id="game-header-main"></div>
        <div class="game-header-sub" id="game-header-sub"></div>
      </div>
      <div class="game-header-right">
        <div class="game-target-shield" id="game-target-shield" aria-live="polite">🎯 --</div>
        <div class="game-trump-medallion" id="game-trump-medallion" aria-live="polite"></div>
        <span class="game-ping-chip" id="game-header-ping">Ping --</span>
        <button class="btn-ghost game-sound-btn" type="button" aria-label="Toggle sound">🔊</button>
        <button class="btn-ghost game-settings-btn" type="button">⚙️ Settings</button>
        <button class="btn-secondary game-profile-btn" type="button">
          <img class="game-profile-avatar" alt="" />
          <span class="game-profile-name"></span>
        </button>
      </div>
    </header>
  `;
}

export function renderFeltBackgroundMarkup(): string {
  return `
    <div class="felt-background" aria-hidden="true">
      <div class="felt-base"></div>
      <div class="felt-texture"></div>
      <div class="felt-vignette"></div>
      <div class="felt-noise"></div>
    </div>
  `;
}

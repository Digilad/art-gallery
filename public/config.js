// Gallery display settings. Change these values to adjust the experience.
export const GALLERY_SETTINGS = {
  // Default target resolution. Images below either dimension are rejected.
  targetResolution: { width: 1280, height: 720 },
  // Duration in milliseconds that each accepted artwork remains on screen.
  displayDuration: 10_000,
  // Number of attempts before reporting that no suitable image was found.
  maximumLoadAttempts: 12,
  // Leave empty for the local Node server. Set the Cloudflare Worker HTTPS URL for GitHub Pages.
  apiEndpoint: 'https://art-gallery.digilad.workers.dev'
};

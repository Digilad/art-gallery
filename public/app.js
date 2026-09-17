import { GALLERY_SETTINGS } from './config.js';

const image = document.querySelector('#artwork');
const caption = document.querySelector('#caption');
const status = document.querySelector('#status');
const fields = { title: document.querySelector('#title'), artist: document.querySelector('#artist'), year: document.querySelector('#year'), museum: document.querySelector('#museum') };
const isLocalServer = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const apiBase = isLocalServer ? window.location.origin : GALLERY_SETTINGS.apiEndpoint.replace(/\/$/, '');

const meetsDisplayRequirements = (candidate) => candidate.naturalWidth >= GALLERY_SETTINGS.targetResolution.width
  && candidate.naturalHeight >= GALLERY_SETTINGS.targetResolution.height
  && candidate.naturalWidth >= candidate.naturalHeight;

function preload(artwork) {
  return new Promise((resolve, reject) => {
    const candidate = new Image();
    candidate.onload = () => meetsDisplayRequirements(candidate) ? resolve({ artwork, candidate }) : reject(new Error('Artwork does not meet HD landscape requirements.'));
    candidate.onerror = () => reject(new Error('Artwork image could not be loaded.'));
    candidate.src = artwork.imageUrl;
  });
}

async function getArtwork() {
  if (!apiBase) throw new Error('Configure GALLERY_SETTINGS.apiEndpoint with the deployed API URL.');
  const response = await fetch(`${apiBase}/api/artwork`, { cache: 'no-store' });
																	
														   
  if (!response.ok) throw new Error('Museum API request failed.');
  return response.json();
}

async function requestArtwork() {
  for (let attempt = 0; attempt < GALLERY_SETTINGS.maximumLoadAttempts; attempt += 1) {
    try { return await preload(await getArtwork()); } catch { /* Request another random candidate. */ }
  }
  throw new Error('No HD landscape artwork is currently available.');
}

async function prepareNextArtwork() {
  while (true) {
    try { return await requestArtwork(); } catch { /* Keep preparing a replacement in the background. */ }
  }
}

function show({ artwork, candidate }) {
  image.classList.remove('visible');
  image.src = candidate.src;
  image.alt = `${artwork.title} by ${artwork.artist}`;
  fields.title.textContent = artwork.title;
  fields.artist.textContent = artwork.artist;
  fields.year.textContent = artwork.year;
  fields.year.hidden = !artwork.year;
  fields.museum.textContent = artwork.museum || artwork.apiMethod;
  fields.museum.hidden = !fields.museum.textContent;
  caption.hidden = false;
  status.hidden = true;
  requestAnimationFrame(() => image.classList.add('visible'));
}

async function runGallery() {
  try {
    let current = await prepareNextArtwork();
    while (true) {
      show(current);
      const next = prepareNextArtwork();
      await new Promise((resolve) => setTimeout(resolve, GALLERY_SETTINGS.displayDuration));
      current = await next;
    }
  } catch (error) { status.textContent = error.message; }
}

runGallery();
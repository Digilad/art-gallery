const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const AIC_API = 'https://api.artic.edu/api/v1';
const SEARCH_TERMS = ['landscape', 'seascape', 'garden', 'river', 'city', 'portrait', 'painting'];
const IMAGE_HOSTS = new Set(['images.metmuseum.org', 'www.artic.edu']);
const ARTIST_CACHE_TTL = 60_000;
const ARTWORK_CACHE_KEY = new Request('https://art-gallery-cache.invalid/api/artwork');
let artistCache = { url: '', items: [], updatedAt: 0 };

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

async function getArtists(artistsUrl) {
  if (artistCache.url === artistsUrl && Date.now() - artistCache.updatedAt < ARTIST_CACHE_TTL) return artistCache.items;
  if (!artistsUrl) return [];
  try {
    const response = await fetch(artistsUrl);
    if (!response.ok) throw new Error('Artist list request failed.');
    const items = (await response.text()).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
    artistCache = { url: artistsUrl, items, updatedAt: Date.now() };
    return items;
  } catch {
    const items = artistCache.url === artistsUrl ? artistCache.items : [];
    artistCache = { url: artistsUrl, items, updatedAt: Date.now() };
    return items;
  }
}

async function fromMet(artists) {
  const searchUrl = new URL(`${MET_API}/search`);
  searchUrl.searchParams.set('q', randomItem(artists.length ? artists : SEARCH_TERMS));
  searchUrl.searchParams.set('hasImages', 'true');
  const search = await fetch(searchUrl).then((response) => response.json());
  if (!search.objectIDs?.length) throw new Error('The Met returned no matches.');
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const object = await fetch(`${MET_API}/objects/${randomItem(search.objectIDs)}`).then((response) => response.json());
    if (object.primaryImage && object.isPublicDomain && object.objectName?.toLowerCase().includes('painting')) {
      return { title: object.title || 'Untitled', artist: object.artistDisplayName || object.culture || 'Unknown artist', year: object.objectDate || '', museum: object.repository || 'The Metropolitan Museum of Art', apiMethod: 'Met Collection API: GET /search and GET /objects/{objectID}', imageUrl: object.primaryImage };
    }
  }
  throw new Error('The Met did not return a usable painting.');
}

async function fromArtInstitute(artists) {
  const searchUrl = new URL(`${AIC_API}/artworks/search`);
  searchUrl.searchParams.set('q', randomItem(artists.length ? artists : SEARCH_TERMS));
  searchUrl.searchParams.set('limit', '100');
  const search = await fetch(searchUrl).then((response) => response.json());
  if (!search.data?.length) throw new Error('Art Institute returned no matches.');
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = randomItem(search.data).id;
    const detailUrl = `${AIC_API}/artworks/${id}?fields=id,title,image_id,artist_display,date_display,artist_title,is_public_domain,artwork_type_title`;
    const { data } = await fetch(detailUrl).then((response) => response.json());
    if (data?.image_id && data.is_public_domain && data.artwork_type_title?.toLowerCase().includes('painting')) {
      return { title: data.title || 'Untitled', artist: data.artist_title || data.artist_display || 'Unknown artist', year: data.date_display || '', museum: 'Art Institute of Chicago', apiMethod: 'Art Institute of Chicago API: GET /artworks/search and GET /artworks/{id}', imageUrl: `https://www.artic.edu/iiif/2/${data.image_id}/full/1920,/0/default.jpg` };
    }
  }
  throw new Error('Art Institute did not return a usable painting.');
}

async function artwork(request, env) {
  const artists = await getArtists(env.ARTISTS_URL);
  const providers = [fromMet, fromArtInstitute].sort(() => Math.random() - 0.5);
  let lastError;
  for (const provider of providers) {
    try {
      const result = await provider(artists);
      const imageProxy = new URL('/api/image', request.url);
      imageProxy.searchParams.set('url', result.imageUrl);
      const body = { ...result, imageUrl: imageProxy.toString() };
      await caches.default.put(ARTWORK_CACHE_KEY, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
      return json(body);
    } catch (error) {
      lastError = error;
    }
  }
  const cached = await caches.default.match(ARTWORK_CACHE_KEY);
  if (cached) return json(await cached.json());
  return json({ error: lastError?.message || 'Museum APIs are unavailable.' }, 502);
}

async function image(request) {
  try {
    const imageUrl = new URL(new URL(request.url).searchParams.get('url'));
    if (!IMAGE_HOSTS.has(imageUrl.hostname)) throw new Error('Image host is not allowed.');
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) throw new Error('Image request failed.');
    return new Response(upstream.body, { headers: { ...corsHeaders, 'Content-Type': upstream.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
  } catch (error) {
    return json({ error: error.message || 'Image proxy failed.' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (path === '/api/artwork') return artwork(request, env);
    if (path === '/api/image') return image(request);
    return json({ error: 'Not found.' }, 404);
  }
};

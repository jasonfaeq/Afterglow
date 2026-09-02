// Catalog metadata only. Listening events and Spotify credentials never belong here.
export const spotifyID = /^[A-Za-z0-9]{22}$/;
export const normalizedName = value => String(value ?? '').normalize('NFC').trim().toLocaleLowerCase();

export class ArtworkError extends Error {
  constructor(message, status = 503, retryAfter = 0) {
    super(message); this.status = status; this.retryAfter = retryAfter;
  }
}

export function validateArtworkSpec(input) {
  const allowed = ['kind', 'name', 'artist', 'album', 'uri'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) {
    throw new ArtworkError('Send only an artwork kind, name, artist, album, and track URI.', 400);
  }
  if (!['track', 'artist', 'album'].includes(input.kind)) throw new ArtworkError('Unknown artwork kind.', 400);
  const result = { kind: input.kind };
  for (const key of allowed.slice(1)) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > (key === 'uri' ? 36 : 300) || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new ArtworkError('Artwork names or identifiers are invalid.', 400);
    }
    result[key] = value.trim();
  }
  if (!result.name || (result.kind !== 'artist' && !result.artist)) throw new ArtworkError('An artwork name and artist are required.', 400);
  if (result.uri && !/^spotify:track:[A-Za-z0-9]{22}$/.test(result.uri)) result.uri = '';
  return result;
}

export function artworkKey(spec) {
  if (spec.kind === 'track' && spec.uri) return spec.uri;
  return JSON.stringify([spec.kind, normalizedName(spec.name), normalizedName(spec.artist), spec.kind === 'track' ? normalizedName(spec.album) : '']);
}

export function safeImageURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname.endsWith('.scdn.co') || url.hostname.endsWith('.spotifycdn.com')) ? url.href : null;
  } catch { return null; }
}

export function safeArtwork(value) {
  if (!value || !safeImageURL(value.image) || typeof value.href !== 'string' || !/^https:\/\/open\.spotify\.com\/(?:track|album|artist)\/[A-Za-z0-9]{22}$/.test(value.href)) return null;
  return { image: safeImageURL(value.image), href: value.href };
}

export function artworkFrom(item, kind) {
  const entity = kind === 'track' ? item?.album : item;
  const images = Array.isArray(entity?.images) ? entity.images.filter(image => safeImageURL(image?.url)) : [];
  const image = images.find(image => image.width >= 300 && image.width <= 640) ?? images[0];
  if (!image || !spotifyID.test(item?.id ?? '')) return null;
  return { image: safeImageURL(image.url), href: `https://open.spotify.com/${kind}/${item.id}` };
}

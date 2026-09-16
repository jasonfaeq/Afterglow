import { state } from '../state.mjs';
import { icon } from '../lib/icons.mjs';
import { escape } from '../lib/format.mjs';
import { coverURI, coverColors } from '../lib/covers.mjs';

export { coverColors };
// Artists are round, albums and tracks are square, and a track wears its album's cover.
// Every tile starts with generated art; in an imported library a real cover can fade in on top.
export function art(kind, item, size = 'sm') {
  const cls = `art art-${size} art-${kind}`, inner = `<img class="art-gen" src="${coverURI(kind, item)}" alt="" decoding="async">`;
  if (state.isDemo) return `<span class="${cls}" aria-hidden="true">${inner}</span>`;
  // Real covers always link back to Spotify.
  const search = `https://open.spotify.com/search/${encodeURIComponent(kind === 'artist' ? item.name : `${item.name} ${item.artist ?? ''}`.trim())}`;
  return `<a class="${cls}" href="${escape(search)}" target="_blank" rel="noopener noreferrer" title="Find ${escape(item.name)} on Spotify" aria-label="Find ${escape(item.name)} on Spotify"
    data-art-kind="${kind}" data-art-name="${escape(item.name)}" data-art-artist="${escape(kind === 'artist' ? '' : item.artist ?? '')}" data-art-album="${escape(kind === 'track' ? item.album ?? '' : '')}" data-art-uri="${escape(item.uri ?? '')}" data-art-fallback="${escape(search)}">${inner}</a>`;
}
// A blurred copy of the artwork, used as ambient light behind big headers.
export const backdrop = (kind, item) => `<img class="backdrop" src="${coverURI(kind, item)}" alt="" aria-hidden="true">`;

// Anything with data-open opens a detail dialog.
export const openAttrs = (kind, name, artist = '') => `data-open="${kind}" data-name="${escape(name)}"${artist ? ` data-artist="${escape(artist)}"` : ''}`;
export const artistLink = (name, cls = 'link-name') => `<button class="${cls}" ${openAttrs('artist', name)}>${escape(name)}</button>`;
export const trackLink = (name, artist, cls = 'link-name') => `<button class="${cls}" ${openAttrs('track', name, artist)} title="${escape(name)}">${escape(name)}</button>`;
export const albumLink = (name, artist, cls = 'link-name') => `<button class="${cls}" ${openAttrs('album', name, artist)} title="${escape(name)}">${escape(name)}</button>`;

export const panel = (title, subtitle, body, { cls = '', action = '' } = {}) =>
  `<section class="panel ${cls}"><header class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</header>${body}</section>`;

export const insight = (name, html) => `<p class="insight">${icon(name)}<span>${html}</span></p>`;

export const hourTotals = stats => Array.from({ length: 24 }, (_, hour) => stats.heat.reduce((sum, day) => sum + day[hour], 0));
export function dayparts(stats) {
  const totals = hourTotals(stats), sum = (from, to) => { let s = 0; for (let h = from; h < to; h++) s += totals[h % 24]; return s; };
  return [
    { label: 'Morning', persona: 'Early bird', range: '5am–12pm', ms: sum(5, 12), icon: 'sunrise', color: '#ffb45e' },
    { label: 'Afternoon', persona: 'Daytime drifter', range: '12pm–5pm', ms: sum(12, 17), icon: 'sun', color: '#ff7a5c' },
    { label: 'Evening', persona: 'Sunset listener', range: '5pm–10pm', ms: sum(17, 22), icon: 'moon', color: '#f2557a' },
    { label: 'Night', persona: 'Night owl', range: '10pm–5am', ms: sum(22, 29), icon: 'moon', color: '#8b5cf6' }
  ];
}

export const segmented = (label, options, current, attribute) =>
  `<div class="segmented" role="group" aria-label="${label}">${options.map(([value, name]) => `<button ${attribute}="${value}" aria-pressed="${value === current}">${name}</button>`).join('')}</div>`;

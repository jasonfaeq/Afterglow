import { icon } from '../lib/icons.mjs';
import { escape } from '../lib/format.mjs';

const PALETTES = [['#ff9a5c', '#f2557a'], ['#f2557a', '#8b5cf6'], ['#ffb35c', '#e0559b'], ['#7c5cff', '#4fb3ff'], ['#ff7a59', '#ffcf70'], ['#c04fd6', '#ff8a7a'], ['#4f8bff', '#c04fd6'], ['#ff6b8b', '#ffb35c']];
export function artColors(name) {
  let hash = 0;
  for (const char of name) hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}
// Artists are round, albums and tracks are square. Tracks borrow their album's colours.
export function art(kind, item, size = 'sm') {
  const label = kind === 'track' ? item.album || item.name : item.name;
  const [c1, c2] = artColors(`${item.artist ?? ''}${label}`);
  return `<span class="art art-${size} art-${kind}" style="--c1:${c1};--c2:${c2}" aria-hidden="true"><span class="art-initial">${escape([...label][0] ?? '♪')}</span></span>`;
}

export const panel = (title, subtitle, body, { cls = '', action = '' } = {}) =>
  `<section class="panel ${cls}"><header class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</header>${body}</section>`;

export const insight = (name, html) => `<p class="insight">${icon(name)}<span>${html}</span></p>`;

export const segmented = (label, options, current, attribute) =>
  `<div class="segmented" role="group" aria-label="${label}">${options.map(([value, name]) => `<button ${attribute}="${value}" aria-pressed="${value === current}">${name}</button>`).join('')}</div>`;

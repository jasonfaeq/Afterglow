import { icon } from '../lib/icons.mjs';

export const panel = (title, subtitle, body, { cls = '', action = '' } = {}) =>
  `<section class="panel ${cls}"><header class="panel-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</header>${body}</section>`;

export const insight = (name, html) => `<p class="insight">${icon(name)}<span>${html}</span></p>`;

export const segmented = (label, options, current, attribute) =>
  `<div class="segmented" role="group" aria-label="${label}">${options.map(([value, name]) => `<button ${attribute}="${value}" aria-pressed="${value === current}">${name}</button>`).join('')}</div>`;

import { state, viewHref } from '../state.mjs';
import { $, escape, duration, plural } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { art } from '../ui/components.mjs';

const PAGES = [['overview', 'Overview', 'overview'], ['artists', 'Artists', 'artists'], ['tracks', 'Tracks', 'music'], ['habits', 'Habits', 'habits'], ['years', 'Years', 'calendar']];
const GROUPS = { artist: 'Artists', album: 'Albums', track: 'Tracks', page: 'Go to' };
let results = [], active = 0;

// Prefix matches first, then anything containing the text. Lists are already ranked by listening time.
function find(query) {
  const q = query.trim().toLocaleLowerCase(), stats = state.stats;
  if (!stats) return [];
  const pick = (list, kind, text, limit) => {
    if (!limit) return [];
    const scored = [];
    for (const item of list) {
      const at = text(item).toLocaleLowerCase().indexOf(q);
      if (at >= 0) scored.push([at === 0 ? 0 : 1, scored.length, item]);
      if (!q && scored.length >= limit) break;
    }
    return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map(([, , item]) => ({ kind, item }));
  };
  return [
    ...pick(stats.artists, 'artist', a => a.name, q ? 5 : 3),
    ...pick(stats.albums, 'album', a => a.name, q ? 4 : 2),
    ...pick(stats.tracks, 'track', t => t.name, q ? 6 : 3),
    ...PAGES.filter(([, name]) => !q || name.toLowerCase().includes(q)).map(([view, name, iconName]) => ({ kind: 'page', item: { view, name, icon: iconName } }))
  ];
}

function row(result, index) {
  const { kind, item } = result;
  const visual = kind === 'page' ? `<span class="result-icon">${icon(item.icon)}</span>` : art(kind, item, 'xs');
  const sub = kind === 'artist' ? `${plural(item.plays, 'play')} · ${duration(item.ms)}` : kind === 'page' ? 'Page' : `${escape(item.artist)} · ${duration(item.ms)}`;
  return `<li class="result${index === active ? ' active' : ''}" role="option" id="result-${index}" data-index="${index}" aria-selected="${index === active}">${visual}<div><strong>${escape(item.name)}</strong><span>${sub}</span></div>${index === active ? `<kbd>Enter</kbd>` : ''}</li>`;
}
function draw() {
  let html = '', group = '';
  results.forEach((result, i) => {
    if (result.kind !== group) { group = result.kind; html += `<li class="result-group" role="presentation">${GROUPS[group]}</li>`; }
    html += row(result, i);
  });
  $('#search-results').innerHTML = html || `<li class="result-empty">Nothing matches “${escape($('#search-input').value.trim())}”.</li>`;
  $('#search-input').setAttribute('aria-activedescendant', results.length ? `result-${active}` : '');
  document.getElementById(`result-${active}`)?.scrollIntoView({ block: 'nearest' });
}

export function installSearch({ open }) {
  const dialog = $('#search-dialog'), input = $('#search-input');
  const choose = result => {
    if (!result) return;
    dialog.close();
    if (result.kind === 'page') location.hash = viewHref(result.item.view);
    else open(result.kind, result.item.name, result.item.artist);
  };
  input.addEventListener('input', () => { results = find(input.value); active = 0; draw(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (results.length) { active = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length; draw(); }
    }
    if (event.key === 'Enter') { event.preventDefault(); choose(results[active]); }
  });
  $('#search-results').addEventListener('click', event => {
    const item = event.target.closest('.result');
    if (item) choose(results[Number(item.dataset.index)]);
  });
  $('#search-results').addEventListener('pointermove', event => {
    const item = event.target.closest('.result');
    if (item && Number(item.dataset.index) !== active) { active = Number(item.dataset.index); draw(); }
  });
  return function openSearch() {
    if (!state.stats) return;
    $$dialogs().forEach(d => { if (d !== dialog) d.close(); });
    input.value = ''; results = find(''); active = 0; draw();
    if (!dialog.open) dialog.showModal();
    input.focus();
  };
}
const $$dialogs = () => [...document.querySelectorAll('dialog[open]')];

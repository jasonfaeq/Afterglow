import { state, viewHref } from './state.mjs';
import { toCSV } from './core.mjs';
import { $, $$, number, plural, formatDate, hours, useUTC } from './lib/format.mjs';
import { hydrateIcons } from './lib/icons.mjs';
import { drawCharts } from './ui/charts.mjs';
import { installTooltip } from './ui/tooltip.mjs';
import * as overview from './views/overview.mjs';
import * as artists from './views/artists.mjs';
import * as tracks from './views/tracks.mjs';
import * as habits from './views/habits.mjs';
import * as years from './views/years.mjs';
import { renderHome } from './views/home.mjs';
import { artistView, albumView, trackView, loadingDetail } from './dialogs/details.mjs';
import { welcomeView } from './dialogs/welcome.mjs';
import { installSearch } from './dialogs/search.mjs';
import { installArtwork } from './artwork/ui.mjs';

const VIEWS = { overview, artists, tracks, habits, years };
const TITLES = {
  overview: ['Overview', 'A soundtrack worth exploring', 'Your music, <em>in perspective.</em>', 'The songs you come back to. The artists that stay with you. It’s all here.'],
  artists: ['Artists', 'The voices behind it all', 'The artists <em>that stay with you.</em>', 'Familiar favourites, new discoveries, and full-album moments.'],
  tracks: ['Tracks', 'Song by song', 'Some songs <em>just stick.</em>', 'Every track in your history. Search, sort, and find the ones you never skip.'],
  habits: ['Habits', 'When the music plays', 'There’s a rhythm <em>to your days.</em>', 'Early starts, late nights, streaks and sessions.'],
  years: ['Years', 'How your taste has moved', 'Every year <em>sounds different.</em>', 'How your listening has grown, shifted and surprised you over time.']
};
const LOADING = '<div class="loading"><span class="spinner"></span>Finding your rhythm…</div>';
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
let queryId = 0, detailId = 0, toastTimer, animateNext = true;

/* ---------- Helpers ---------- */
export function notify(message) {
  const toast = $('#toast');
  toast.textContent = message; toast.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.hidden = true; }, 6000);
}
function showDialog(selector) {
  const dialog = $(selector);
  $$('dialog[open]').forEach(open => { if (open !== dialog) open.close(); });
  if (!dialog.open) dialog.showModal();
}
const openImport = () => { $('#import-error').hidden = true; showDialog('#import-dialog'); };
function query() { if (!state.busy && state.mode) worker.postMessage({ type: 'query', id: ++queryId, filters: state.filters }); }
function openDetail(kind, name, artist) {
  $('#detail-body').innerHTML = loadingDetail(name);
  hydrateIcons($('#detail-body'));
  showDialog('#detail-dialog');
  worker.postMessage({ type: 'detail', id: ++detailId, kind, name, artist, filters: state.filters });
}
function setBusy(value) {
  state.busy = value;
  $('#drop-zone').classList.toggle('busy', value);
  $('#file-input').disabled = value;
  $('#import-progress').hidden = !value;
  $$('#year-filter, #minimum-filter, #timezone-filter, #clear-data').forEach(el => { el.disabled = value; });
  if (!value) $('#clear-data').disabled = !state.library;
}
function updateLibrary() {
  const lib = state.library;
  $('#library-details').textContent = !lib ? 'Nothing imported yet. The demo uses a made-up sample library.'
    : `${plural(lib.plays, 'play')} from ${plural(lib.files, 'file')}${lib.from ? `, ${formatDate(lib.from, { month: 'short', year: 'numeric' })} to ${formatDate(lib.to, { month: 'short', year: 'numeric' })}` : ''}. Saved in this browser only.`;
  $('#clear-data').disabled = !lib || state.busy;
}
// The banner, nav links and tiles all depend on which library is on screen.
function updateChrome() {
  $('#demo-banner').hidden = !state.isDemo;
  document.body.classList.toggle('is-demo', state.isDemo);
  $$('.nav [data-view], .tabbar [data-view]').forEach(link => { link.href = viewHref(link.dataset.view); });
  updateLibrary();
}

// Play length and time zone are remembered between visits.
const SETTINGS = 'afterglow.settings';
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS) ?? '{}');
    if ([0, 30000, 60000].includes(saved.minimum)) state.filters.minimum = saved.minimum;
    if (typeof saved.utc === 'boolean') state.filters.utc = saved.utc;
  } catch { /* Storage can be blocked; the defaults are fine. */ }
  $('#minimum-filter').value = String(state.filters.minimum);
  $('#timezone-filter').value = state.filters.utc ? 'utc' : 'local';
  useUTC(state.filters.utc);
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS, JSON.stringify({ minimum: state.filters.minimum, utc: state.filters.utc })); } catch { /* This visit still uses them. */ }
}
function showError(message) {
  $('#import-error').textContent = message; $('#import-error').hidden = false;
  if (!$('#import-dialog').open) notify(message);
}

/* ---------- Worker ---------- */
function applyStats(data, draw = true) {
  state.mode = data.mode; state.isDemo = data.mode === 'demo'; state.stats = data.stats;
  updateChrome(); syncYears();
  if (draw && state.page === 'app') { render({ animate: animateNext }); animateNext = false; }
}
worker.onmessage = ({ data }) => {
  if (data.type === 'progress') { $('#progress-text').textContent = data.message; return; }
  if (data.type === 'error') { setBusy(false); showError(data.message); return; }
  if (data.type === 'ready') { state.ready = true; state.library = data.library; state.teaser = data.teaser; updateLibrary(); route(); return; }
  if (data.type === 'stats') { if (data.id === queryId) applyStats(data); return; }
  if (data.type === 'detail') {
    if (data.id !== detailId) return;
    $('#detail-body').innerHTML = ({ artist: artistView, album: albumView, track: trackView })[data.kind](data.detail, state.stats);
    $('#detail-dialog').scrollTop = 0;
    hydrateIcons($('#detail-body'));
    drawCharts();
    return;
  }
  if (data.type === 'imported') {
    setBusy(false); $('#import-dialog').close();
    state.library = data.library; animateNext = true;
    applyStats(data, false);
    const here = parseRoute();
    if (here.page === 'app' && here.mode === 'library') { render({ animate: true }); animateNext = false; }
    else location.hash = '#/overview';
    $('#welcome-body').innerHTML = welcomeView(data.summary, data.info);
    showDialog('#welcome-dialog');
    return;
  }
  if (data.type === 'cleared') {
    setBusy(false); $('#settings-dialog').close();
    state.library = null; updateLibrary();
    notify('Your imported history has been deleted from this browser.');
    // Exploring the demo? Stay there. Otherwise there's nothing left to show.
    if (!state.isDemo) { state.mode = null; state.stats = null; location.hash = '#/'; }
  }
};
worker.onerror = () => {
  setBusy(false);
  $('#dashboard').innerHTML = '<section class="panel empty"><h2>Let’s try that again.</h2><p>The history engine stopped. Reload the page to restart it.</p></section>';
};

function syncYears() {
  const select = $('#year-filter'), years = state.stats?.years ?? [];
  select.innerHTML = '<option value="all">All time</option>' + years.map(year => `<option value="${year}">${year}</option>`).join('');
  if (state.filters.year !== 'all' && !years.includes(Number(state.filters.year))) { state.filters.year = 'all'; query(); }
  select.value = state.filters.year;
}

/* ---------- Routing: #/ is home, #/demo/<view> the sample library, #/<view> your own ---------- */
function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const demo = parts[0] === 'demo', view = demo ? parts[1] ?? 'overview' : parts[0];
  return VIEWS[view] ? { page: 'app', mode: demo ? 'demo' : 'library', view } : { page: 'home' };
}
function showPage(page) {
  if (state.page !== page) window.scrollTo({ top: 0 });
  state.page = page;
  $('#home').hidden = page !== 'home'; $('#app').hidden = page !== 'app';
}
function use(mode) {
  state.mode = mode; state.isDemo = mode === 'demo'; state.stats = null;
  state.filters.year = 'all'; state.tracks.page = 0; animateNext = true;
  updateChrome(); renderHead();
  $('#dashboard').innerHTML = LOADING;
  worker.postMessage({ type: 'use', mode, id: ++queryId, filters: state.filters });
}
function route() {
  const next = parseRoute();
  if (next.page === 'home') { showPage('home'); renderHome(); document.title = 'afterglow. — your listening, in perspective'; return; }
  if (state.ready && next.mode === 'library' && !state.library) {
    location.replace('#/'); openImport();
    notify('Import your Spotify history to see your own dashboard, or take the demo for a spin.');
    return;
  }
  const fresh = state.page !== 'app' || state.view !== next.view;
  if (state.page === 'app' && fresh) window.scrollTo({ top: 0 });
  showPage('app'); state.view = next.view;
  document.title = `${TITLES[next.view][0]} · afterglow.`;
  if (!state.ready) { renderHead(); $('#dashboard').innerHTML = LOADING; return; }
  if (state.mode !== next.mode) { use(next.mode); return; }
  render({ animate: fresh });
}

/* ---------- Rendering ---------- */
function renderHead() {
  const [, eyebrow, title, subtitle] = TITLES[state.view], stats = state.stats;
  $('#page-eyebrow').textContent = eyebrow;
  $('#page-title').innerHTML = title;
  $('#page-subtitle').innerHTML = state.view === 'overview' && stats?.plays
    ? `${state.filters.year === 'all' ? `From ${formatDate(stats.start, { month: 'long', year: 'numeric' })} to ${formatDate(stats.end, { month: 'long', year: 'numeric' })}` : `In ${state.filters.year}`}, you spent <strong>${number(hours(stats.ms))} hours</strong> with ${plural(stats.artistCount, 'artist')} and ${plural(stats.trackCount, 'track')}.`
    : subtitle;
  $$('.nav [data-view], .tabbar [data-view]').forEach(link => { if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
}

export function render({ animate = false } = {}) {
  renderHead();
  const dashboard = $('#dashboard'), stats = state.stats;
  if (!stats) return;
  dashboard.classList.toggle('reveal', animate);
  if (!stats.plays) dashboard.innerHTML = `<section class="panel empty"><span data-icon="moon"></span><h2>A quiet moment in your history.</h2><p>No plays match these filters. Pick another year, or count shorter plays in settings.</p></section>`;
  else { dashboard.innerHTML = VIEWS[state.view].render(stats); VIEWS[state.view].after?.(stats); }
  [...dashboard.querySelectorAll(':scope > *, :scope > .grid > *')].forEach((el, i) => el.style.setProperty('--i', i));
  hydrateIcons(dashboard);
  drawCharts(true);
}

/* ---------- Events ---------- */
document.addEventListener('click', event => {
  const opener = event.target.closest('[data-open]');
  if (opener && !event.target.closest('a[href]')) { openDetail(opener.dataset.open, opener.dataset.name, opener.dataset.artist); return; }
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('.import-trigger')) { openImport(); return; }
  if (target.matches('.settings-trigger')) { showDialog('#settings-dialog'); return; }
  if (target.matches('.guide-trigger')) { showDialog('#guide-dialog'); return; }
  if (target.matches('.close-dialog, a[href^="#/"]')) target.closest('dialog')?.close();
  if (target.dataset.scroll) document.getElementById(target.dataset.scroll)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (target.dataset.metric) { state.timelineMetric = target.dataset.metric; render(); }
  if (target.dataset.sort) { state.tracks.sort = target.dataset.sort; state.tracks.page = 0; render(); }
  if (target.dataset.calYear) { state.calendarYear = Number(target.dataset.calYear); render(); }
  if (target.id === 'export-csv') exportCSV();
  if (target.dataset.year) {
    state.filters.year = target.dataset.year; $('#year-filter').value = target.dataset.year;
    location.hash = viewHref('overview'); query();
  }
  if (target.id === 'prev-page' || target.id === 'next-page') {
    state.tracks.page += target.id === 'next-page' ? 1 : -1;
    tracks.update(state.stats);
    $('.tracks-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'track-search') return;
  state.tracks.search = event.target.value; state.tracks.page = 0;
  tracks.update(state.stats);
});
window.addEventListener('hashchange', route);

// Ctrl/⌘ K or / to search, 1–5 to switch pages.
const openSearch = installSearch({ open: openDetail });
$('#search-trigger').addEventListener('click', openSearch);
if (/mac|iphone|ipad/i.test(navigator.userAgentData?.platform ?? navigator.platform ?? '')) $('#search-key').textContent = '⌘K';
document.addEventListener('keydown', event => {
  if (state.page !== 'app') return;
  if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); openSearch(); return; }
  if (event.metaKey || event.ctrlKey || event.altKey || event.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
  if (event.key === '/') { event.preventDefault(); openSearch(); return; }
  const view = Object.keys(VIEWS)[Number(event.key) - 1];
  if (view) location.hash = viewHref(view);
});
$('#year-filter').addEventListener('change', event => { state.filters.year = event.target.value; query(); });
$('#minimum-filter').addEventListener('change', event => { state.filters.minimum = Number(event.target.value); saveSettings(); query(); });
$('#timezone-filter').addEventListener('change', event => { state.filters.utc = event.target.value === 'utc'; useUTC(state.filters.utc); saveSettings(); query(); });
$('#clear-data').addEventListener('click', () => {
  if (state.busy || !state.library) return;
  if (!confirm('Delete the imported history saved in this browser? Your original Spotify files won’t be affected.')) return;
  setBusy(true);
  worker.postMessage({ type: 'clear' });
});
if (!('closedBy' in HTMLDialogElement.prototype)) {
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }));
}

// Every track for the current year and play-length filters. The search box doesn't limit it.
function exportCSV() {
  if (!state.stats) return;
  const url = URL.createObjectURL(new Blob([toCSV(state.stats.tracks)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `afterglow-${state.isDemo ? 'sample-' : ''}${state.filters.year}-tracks.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(`Exported ${plural(state.stats.tracks.length, 'track')} for ${state.filters.year === 'all' ? 'all time' : state.filters.year}.`);
}

/* ---------- Import ---------- */
function importFiles(files) {
  if (state.busy || !files.length) return;
  showDialog('#import-dialog'); $('#import-error').hidden = true; setBusy(true);
  $('#progress-text').textContent = 'Opening your listening history…';
  worker.postMessage({ type: 'import', files: [...files], filters: state.filters });
}
const zone = $('#drop-zone');
$('#file-input').addEventListener('change', event => { importFiles(event.target.files); event.target.value = ''; });
zone.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!state.busy) $('#file-input').click(); } });
zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragging'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragging'); importFiles(event.dataTransfer.files); });
// Dropping files anywhere else shouldn't navigate away from the app.
const hasFiles = event => [...(event.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragover', event => { if (hasFiles(event)) event.preventDefault(); });
window.addEventListener('drop', event => { if (hasFiles(event) && !event.target.closest?.('#drop-zone')) { event.preventDefault(); importFiles(event.dataTransfer.files); } });

// Vercel Web Analytics: anonymous page views only, no cookies, nothing about your music.
// Only on the deployed site, so a local copy never loads it.
if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  document.head.append(Object.assign(document.createElement('script'), { src: '/_vercel/insights/script.js', defer: true }));
}

loadSettings();
hydrateIcons();
installTooltip();
installArtwork();
route();
document.body.classList.remove('booting');
worker.postMessage({ type: 'init' });

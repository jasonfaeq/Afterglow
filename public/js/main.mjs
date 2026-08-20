import { state } from './state.mjs';
import { $, $$, number, plural, formatDate, hours } from './lib/format.mjs';
import { hydrateIcons } from './lib/icons.mjs';
import { drawCharts } from './ui/charts.mjs';
import { installTooltip } from './ui/tooltip.mjs';
import * as overview from './views/overview.mjs';
import * as artists from './views/artists.mjs';
import * as tracks from './views/tracks.mjs';

const VIEWS = { overview, artists, tracks };
const TITLES = {
  overview: ['A soundtrack worth exploring', 'Your music, <em>in perspective.</em>', 'The songs you come back to. The artists that stay with you. It’s all here.'],
  artists: ['The voices behind it all', 'The artists <em>that stay with you.</em>', 'Familiar favourites, new discoveries, and full-album moments.'],
  tracks: ['Song by song', 'Some songs <em>just stick.</em>', 'Every track in your history. Search, sort, and find the ones you never skip.']
};
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
let queryId = 0, toastTimer, firstRender = true;

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
function query() { if (!state.busy) worker.postMessage({ type: 'query', id: ++queryId, filters: state.filters }); }
function setBusy(value) {
  state.busy = value;
  $('#drop-zone').classList.toggle('busy', value);
  $('#file-input').disabled = value;
  $('#import-progress').hidden = !value;
  $('#year-filter').disabled = value;
}
function showError(message) {
  $('#import-error').textContent = message; $('#import-error').hidden = false;
  if (!$('#import-dialog').open) notify(message);
}

/* ---------- Worker ---------- */
worker.onmessage = ({ data }) => {
  if (data.type === 'progress') { $('#progress-text').textContent = data.message; return; }
  if (data.type === 'error') { setBusy(false); showError(data.message); return; }
  if (data.type === 'stats' && data.id !== queryId) return;
  if (data.files) state.files = data.files;
  if ('isDemo' in data) { state.isDemo = data.isDemo; $('#demo-banner').hidden = !state.isDemo; }
  if (data.type === 'imported') {
    setBusy(false); $('#import-dialog').close();
    notify(`Your library is ready: ${plural(data.stats.plays, 'play')} from ${plural(data.files.length, 'file')}${data.duplicates ? `, ${number(data.duplicates)} duplicates skipped` : ''}.${data.persisted ? '' : ' Browser storage is unavailable, so this lasts for this visit only.'}`);
  }
  state.stats = data.stats;
  syncYears();
  render({ animate: firstRender || data.type === 'imported' });
  firstRender = false;
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

/* ---------- Rendering ---------- */
function renderHead() {
  const [eyebrow, title, subtitle] = TITLES[state.view], stats = state.stats;
  $('#page-eyebrow').textContent = eyebrow;
  $('#page-title').innerHTML = title;
  $('#page-subtitle').innerHTML = state.view === 'overview' && stats?.plays
    ? `${state.filters.year === 'all' ? `From ${formatDate(stats.start, { month: 'long', year: 'numeric' })} to ${formatDate(stats.end, { month: 'long', year: 'numeric' })}` : `In ${state.filters.year}`}, you spent <strong>${number(hours(stats.ms))} hours</strong> with ${plural(stats.artistCount, 'artist')} and ${plural(stats.trackCount, 'track')}.`
    : subtitle;
  $$('.nav [data-view]').forEach(link => { if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
}

export function render({ animate = false } = {}) {
  renderHead();
  const dashboard = $('#dashboard'), stats = state.stats;
  dashboard.classList.toggle('reveal', animate);
  if (!stats) dashboard.innerHTML = `<section class="panel empty"><span data-icon="headphones"></span><h2>Nothing playing yet.</h2><p>Import your Spotify export and your listening story shows up here. It never leaves this browser.</p><button class="btn btn-primary import-trigger"><span data-icon="upload"></span>Import your history</button></section>`;
  else if (!stats.plays) dashboard.innerHTML = `<section class="panel empty"><span data-icon="moon"></span><h2>A quiet moment in your history.</h2><p>No plays match these filters. Pick another year.</p></section>`;
  else { dashboard.innerHTML = VIEWS[state.view].render(stats); VIEWS[state.view].after?.(stats); }
  [...dashboard.querySelectorAll(':scope > *, :scope > .grid > *')].forEach((el, i) => el.style.setProperty('--i', i));
  hydrateIcons(dashboard);
  drawCharts(true);
}

function route() {
  const view = location.hash.replace(/^#\/?/, '');
  state.view = VIEWS[view] ? view : 'overview';
}

/* ---------- Events ---------- */
document.addEventListener('click', event => {
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('.import-trigger')) { $('#import-error').hidden = true; showDialog('#import-dialog'); return; }
  if (target.matches('.close-dialog')) target.closest('dialog')?.close();
  if (target.dataset.metric) { state.timelineMetric = target.dataset.metric; render(); }
  if (target.dataset.sort) { state.tracks.sort = target.dataset.sort; state.tracks.page = 0; render(); }
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
window.addEventListener('hashchange', () => { route(); render({ animate: true }); window.scrollTo({ top: 0 }); });
$('#year-filter').addEventListener('change', event => { state.filters.year = event.target.value; query(); });
if (!('closedBy' in HTMLDialogElement.prototype)) {
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  }));
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

route();
hydrateIcons();
installTooltip();
$('#dashboard').innerHTML = '<div class="loading"><span class="spinner"></span>Finding your rhythm…</div>';
worker.postMessage({ type: 'init', filters: state.filters });

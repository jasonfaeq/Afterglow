import { state } from './state.mjs';
import { $, $$, number, plural, formatDate, hours, useUTC } from './lib/format.mjs';
import { hydrateIcons } from './lib/icons.mjs';
import { drawCharts } from './ui/charts.mjs';
import { installTooltip } from './ui/tooltip.mjs';
import * as overview from './views/overview.mjs';
import * as artists from './views/artists.mjs';
import * as tracks from './views/tracks.mjs';
import * as habits from './views/habits.mjs';
import * as years from './views/years.mjs';
import { artistView, loadingDetail } from './dialogs/details.mjs';

const VIEWS = { overview, artists, tracks, habits, years };
const TITLES = {
  overview: ['A soundtrack worth exploring', 'Your music, <em>in perspective.</em>', 'The songs you come back to. The artists that stay with you. It’s all here.'],
  artists: ['The voices behind it all', 'The artists <em>that stay with you.</em>', 'Familiar favourites, new discoveries, and full-album moments.'],
  tracks: ['Song by song', 'Some songs <em>just stick.</em>', 'Every track in your history. Search, sort, and find the ones you never skip.'],
  habits: ['When the music plays', 'There’s a rhythm <em>to your days.</em>', 'Early starts, late nights, streaks and sessions.'],
  years: ['How your taste has moved', 'Every year <em>sounds different.</em>', 'How your listening has grown, shifted and surprised you over time.']
};
const worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
let queryId = 0, detailId = 0, toastTimer, firstRender = true;

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
  if (!value) $('#clear-data').disabled = state.isDemo;
}
function updateLibrary() {
  const years = state.stats?.years ?? [], span = years.length ? `${Math.min(...years)}${years.length > 1 ? `–${Math.max(...years)}` : ''}` : '';
  $('#library-details').textContent = state.isDemo
    ? 'You’re exploring the made-up sample library. Import your own history to replace it.'
    : `${plural(state.files.length, 'file')} imported${span ? `, covering ${span}` : ''}. Saved in this browser only.`;
  $('#clear-data').disabled = state.isDemo || state.busy;
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
worker.onmessage = ({ data }) => {
  if (data.type === 'progress') { $('#progress-text').textContent = data.message; return; }
  if (data.type === 'error') { setBusy(false); showError(data.message); return; }
  if (data.type === 'detail') {
    if (data.id !== detailId) return;
    $('#detail-body').innerHTML = artistView(data.detail, state.stats);
    $('#detail-dialog').scrollTop = 0;
    hydrateIcons($('#detail-body'));
    drawCharts();
    return;
  }
  if (data.type === 'stats' && data.id !== queryId) return;
  if (data.files) state.files = data.files;
  if ('isDemo' in data) { state.isDemo = data.isDemo; $('#demo-banner').hidden = !state.isDemo; }
  if (data.type === 'imported') {
    setBusy(false); $('#import-dialog').close();
    notify(`Your library is ready: ${plural(data.stats.plays, 'play')} from ${plural(data.files.length, 'file')}${data.duplicates ? `, ${number(data.duplicates)} duplicates skipped` : ''}${data.enriched ? `, ${number(data.enriched)} older plays gained skip & shuffle details` : ''}.${data.persisted ? '' : ' Browser storage is unavailable, so this lasts for this visit only.'}`);
  }
  if (data.cleared) { setBusy(false); notify('Your imported history has been deleted from this browser.'); }
  state.stats = data.stats;
  syncYears();
  updateLibrary();
  render({ animate: firstRender || data.type === 'imported' || data.cleared });
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
  const opener = event.target.closest('[data-open]');
  if (opener && !event.target.closest('a[href]')) { openDetail(opener.dataset.open, opener.dataset.name, opener.dataset.artist); return; }
  const target = event.target.closest('button, a');
  if (!target) return;
  if (target.matches('.import-trigger')) { $('#import-error').hidden = true; showDialog('#import-dialog'); return; }
  if (target.matches('.settings-trigger')) { showDialog('#settings-dialog'); return; }
  if (target.matches('.guide-trigger')) { showDialog('#guide-dialog'); return; }
  if (target.matches('.close-dialog')) target.closest('dialog')?.close();
  if (target.dataset.metric) { state.timelineMetric = target.dataset.metric; render(); }
  if (target.dataset.sort) { state.tracks.sort = target.dataset.sort; state.tracks.page = 0; render(); }
  if (target.dataset.calYear) { state.calendarYear = Number(target.dataset.calYear); render(); }
  if (target.dataset.year) {
    state.filters.year = target.dataset.year; $('#year-filter').value = target.dataset.year;
    location.hash = '#/overview'; query();
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
window.addEventListener('hashchange', () => { route(); render({ animate: true }); window.scrollTo({ top: 0 }); });
$('#year-filter').addEventListener('change', event => { state.filters.year = event.target.value; query(); });
$('#minimum-filter').addEventListener('change', event => { state.filters.minimum = Number(event.target.value); saveSettings(); query(); });
$('#timezone-filter').addEventListener('change', event => { state.filters.utc = event.target.value === 'utc'; useUTC(state.filters.utc); saveSettings(); query(); });
$('#clear-data').addEventListener('click', () => {
  if (state.busy || state.isDemo) return;
  if (!confirm('Delete the imported history saved in this browser? Your original Spotify files won’t be affected.')) return;
  state.filters.year = 'all'; setBusy(true);
  worker.postMessage({ type: 'clear', filters: state.filters });
});
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
loadSettings();
hydrateIcons();
installTooltip();
$('#dashboard').innerHTML = '<div class="loading"><span class="spinner"></span>Finding your rhythm…</div>';
worker.postMessage({ type: 'init', filters: state.filters });

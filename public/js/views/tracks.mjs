import { state } from '../state.mjs';
import { $, escape, number, duration, formatDate } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { art, segmented, artistLink } from '../ui/components.mjs';

export const PAGE_SIZE = 25;
const SORTS = { ms: 'Time', plays: 'Plays', first: 'First heard' };

export function filtered(stats) {
  const text = state.tracks.search.trim().toLocaleLowerCase(), key = state.tracks.sort;
  return stats.tracks
    .filter(t => !text || `${t.name} ${t.artist} ${t.album}`.toLocaleLowerCase().includes(text))
    .sort((a, b) => (key === 'first' ? (b.first ?? 0) - (a.first ?? 0) : b[key] - a[key]) || b.ms - a.ms);
}

const rows = (list, offset) => list.map((t, i) => `<tr>
  <td class="num rank">${offset + i + 1}</td>
  <td><div class="track-cell">${art('track', t)}<div class="track-text"><span class="track-title">${escape(t.name)}</span><span class="track-artist">${artistLink(t.artist)}</span></div></div></td>
  <td class="col-album"><span class="clip">${escape(t.album) || '—'}</span></td>
  <td class="num">${number(t.plays)}</td>
  <td class="num">${duration(t.ms)}</td>
  <td class="num col-first">${t.first ? formatDate(t.first, { month: 'short', year: 'numeric' }) : '—'}</td></tr>`).join('');

export const render = () => `<section class="panel tracks-panel">
  <div class="toolbar">
    <label class="search">${icon('search')}<input type="search" id="track-search" placeholder="Search tracks, artists or albums" aria-label="Search tracks" value="${escape(state.tracks.search)}" autocomplete="off" spellcheck="false"></label>
    ${segmented('Sort tracks by', Object.entries(SORTS), state.tracks.sort, 'data-sort')}
  </div>
  <div class="table-wrap"><table class="track-table">
    <thead><tr><th class="num">#</th><th>Track</th><th class="col-album">Album</th><th class="num">Plays</th><th class="num">Time</th><th class="num col-first">First heard</th></tr></thead>
    <tbody id="track-rows"></tbody>
  </table></div>
  <p class="empty-mini" id="tracks-empty" hidden></p>
  <div class="pager"><span id="track-count"></span><div><button class="btn btn-ghost btn-sm" id="prev-page">Previous</button><button class="btn btn-ghost btn-sm" id="next-page">Next</button></div></div>
</section>`;

// Typing in the search box only refreshes the rows, so the input keeps focus.
export function update(stats) {
  const list = filtered(stats), pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  state.tracks.page = Math.min(state.tracks.page, pages - 1);
  const offset = state.tracks.page * PAGE_SIZE;
  $('#track-rows').innerHTML = rows(list.slice(offset, offset + PAGE_SIZE), offset);
  $('#tracks-empty').hidden = list.length > 0;
  $('#tracks-empty').textContent = `No tracks match “${state.tracks.search.trim()}”.`;
  $('#track-count').textContent = list.length ? `${number(offset + 1)}–${number(Math.min(offset + PAGE_SIZE, list.length))} of ${number(list.length)} tracks · by ${SORTS[state.tracks.sort].toLowerCase()}` : '0 tracks';
  $('#prev-page').disabled = state.tracks.page === 0;
  $('#next-page').disabled = state.tracks.page >= pages - 1;
}
export const after = update;

import { periodLabel } from '../state.mjs';
import { escape, number, decimal, percent, hours, duration, plural, formatDate, monthLabel, hourLabel, DAY_NAMES } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { art, coverColors, backdrop, openAttrs, artistLink } from '../ui/components.mjs';
import { chart, barChart } from '../ui/charts.mjs';

const close = `<button class="icon-btn close-dialog detail-close" aria-label="Close">${icon('close')}</button>`;
export const loadingDetail = name => `${close}<div class="loading"><span class="spinner"></span>Gathering ${escape(name)}…</div>`;

const hero = ({ kind, item, size = 'lg', eyebrow, title, meta }) => { const [c1, c2] = coverColors(kind, item); return `<header class="detail-hero" style="--c1:${c1};--c2:${c2}" data-backdrop-host>
  ${backdrop(kind, item)}${art(kind, item, size)}<div class="detail-heading"><span class="eyebrow">${eyebrow}</span><h2 class="detail-title">${title}</h2><p>${meta}</p></div>${close}</header>`; };
const statRow = list => `<div class="detail-stats">${list.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>`;
const monthly = (timeline, title = 'Over time') => timeline.length > 1 ? `<h3 class="detail-section">${title}</h3>${chart(w => barChart(w, {
  values: timeline.map(m => hours(m.ms)), label: i => monthLabel(timeline[i].key), tip: i => `${monthLabel(timeline[i].key, true)}\n${duration(timeline[i].ms)}`, height: 180, format: v => decimal(v), aria: 'Listening time per month'
}))}` : '';
const byHour = list => chart(w => barChart(w, { values: list.map(hours), label: i => i % 6 === 0 ? hourLabel(i) : '', tip: i => `${hourLabel(i)}–${hourLabel((i + 1) % 24)}\n${duration(list[i])}`, height: 150, highlight: list.indexOf(Math.max(...list)), format: v => decimal(v), aria: 'Listening by hour' }));
const albumLink = (name, artist) => name ? `<button class="link-name" ${openAttrs('album', name, artist)}>${escape(name)}</button>` : '';
const ranked = (list, item) => list.findIndex(item);
const trackList = (list, artist) => {
  const max = list[0]?.ms || 1;
  return `<ol class="detail-tracks">${list.map((t, i) => `<li ${openAttrs('track', t.name, artist)}><span class="rank-num">${i + 1}</span><div><button class="detail-track-name" ${openAttrs('track', t.name, artist)} title="${escape(t.name)}">${escape(t.name)}</button><span class="bar"><span style="width:${t.ms / max * 100}%"></span></span></div><em>${plural(t.plays, 'play')}</em></li>`).join('')}</ol>`;
};

export function artistView(d, stats) {
  const rank = ranked(stats.artists, a => a.name === d.name);
  const peakHour = d.hours.indexOf(Math.max(...d.hours)), peakDay = d.weekdays.indexOf(Math.max(...d.weekdays));
  const numbers = [['Listening time', duration(d.ms)], ['Plays', number(d.plays)], ['Tracks', number(d.trackCount)], ['Share of listening', percent(d.share, 1)]];
  if (d.known >= 5) numbers.push(['Skip rate', percent(d.skips / d.known)]);
  const top = hero({
    kind: 'artist', item: d, title: escape(d.name),
    eyebrow: rank >= 0 ? `#${rank + 1} artist · ${periodLabel()}` : 'Artist',
    meta: d.everFirst ? `First heard ${formatDate(d.everFirst)} · last played ${formatDate(d.everLast)}` : ''
  });
  if (!d.plays) return `${top}<div class="detail-body"><p class="empty-mini">No plays from ${escape(d.name)} match the current filters.</p></div>`;
  return `${top}<div class="detail-body">${statRow(numbers)}${monthly(d.timeline)}
    <div class="detail-columns">
      <div><h3 class="detail-section">Top tracks</h3>${trackList(d.tracks, d.name)}</div>
      <div><h3 class="detail-section">When you listen</h3>${byHour(d.hours)}
        <p class="detail-note">Mostly around <strong>${hourLabel(peakHour)}</strong>, and most often on <strong>${DAY_NAMES[peakDay]}s</strong>.</p>
        ${d.albums.length ? `<h3 class="detail-section">Albums</h3><div class="album-chips">${d.albums.map(a => `<button class="album-chip" ${openAttrs('album', a.name, d.name)}>${art('album', a, 'xs')}<span>${escape(a.name)}<em>${duration(a.ms)}</em></span></button>`).join('')}</div>` : ''}
      </div>
    </div></div>`;
}

export function albumView(d, stats) {
  const rank = ranked(stats.albums, a => a.name === d.name && a.artist === d.artist);
  const top = hero({
    kind: 'album', item: d, title: escape(d.name),
    eyebrow: rank >= 0 ? `#${rank + 1} album · ${periodLabel()}` : 'Album',
    meta: `by ${artistLink(d.artist)}${d.everFirst ? ` · first played ${formatDate(d.everFirst)}` : ''}`
  });
  if (!d.plays) return `${top}<div class="detail-body"><p class="empty-mini">No plays from this album match the current filters.</p></div>`;
  const favourite = d.tracks[0];
  return `${top}<div class="detail-body">${statRow([['Listening time', duration(d.ms)], ['Plays', number(d.plays)], ['Tracks you played', number(d.trackCount)], ['Share of listening', percent(d.share, 1)]])}
    ${monthly(d.timeline)}<h3 class="detail-section">Tracks, by listening time</h3>${trackList(d.tracks, d.artist)}
    ${favourite ? `<p class="detail-note">Your favourite here is <strong>${escape(favourite.name)}</strong>, ${percent(favourite.ms / d.ms)} of everything you’ve played from the album.</p>` : ''}</div>`;
}

export function trackView(d, stats) {
  const rank = ranked(stats.tracks, t => t.name === d.name && t.artist === d.artist);
  const top = hero({
    kind: 'track', item: d, title: escape(d.name),
    eyebrow: rank >= 0 ? `#${rank + 1} track · ${periodLabel()}` : 'Track',
    meta: `${artistLink(d.artist)}${d.album ? ` · ${albumLink(d.album, d.artist)}` : ''}`
  });
  if (!d.plays) return `${top}<div class="detail-body"><p class="empty-mini">No plays of this track match the current filters.</p></div>`;
  const numbers = [['Plays', number(d.plays)], ['Listening time', duration(d.ms)], ['First heard', formatDate(d.everFirst, { month: 'short', day: 'numeric', year: 'numeric' })], ['Last played', formatDate(d.everLast, { month: 'short', day: 'numeric', year: 'numeric' })]];
  if (d.known >= 3) numbers.push(['Skip rate', percent(d.skips / d.known)]);
  const peak = d.timeline.reduce((best, m) => m.plays > best.plays ? m : best, { plays: -1 }), peakHour = d.hours.indexOf(Math.max(...d.hours));
  const plays = d.timeline.length > 1 ? `<h3 class="detail-section">Plays per month</h3>${chart(w => barChart(w, { values: d.timeline.map(m => m.plays), label: i => monthLabel(d.timeline[i].key), tip: i => `${monthLabel(d.timeline[i].key, true)}\n${plural(d.timeline[i].plays, 'play')}`, height: 170, aria: 'Plays per month' }))}` : '';
  const spotify = d.uri ? `<a class="btn btn-ghost btn-sm" href="https://open.spotify.com/track/${escape(d.uri.split(':')[2])}" target="_blank" rel="noopener noreferrer">Open in Spotify ${icon('external')}</a>` : '';
  return `${top}<div class="detail-body">${statRow(numbers)}${plays}
    <div class="detail-columns"><div><h3 class="detail-section">When you play it</h3>${byHour(d.hours)}</div>
      <div><h3 class="detail-section">The short version</h3><p class="detail-note">You’ve played it <strong>${plural(d.plays, 'time')}</strong>${peak.key ? `, most in <strong>${monthLabel(peak.key, true)}</strong>` : ''}, usually around <strong>${hourLabel(peakHour)}</strong>. That’s ${percent(d.share, 1)} of your listening ${periodLabel() === 'all time' ? 'overall' : `in ${periodLabel()}`}.</p>${spotify ? `<div class="detail-actions">${spotify}</div>` : ''}</div>
    </div></div>`;
}

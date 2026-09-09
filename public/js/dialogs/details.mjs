import { periodLabel } from '../state.mjs';
import { escape, number, decimal, percent, hours, duration, plural, formatDate, monthLabel, hourLabel, DAY_NAMES } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { art, coverColors, backdrop } from '../ui/components.mjs';
import { chart, barChart } from '../ui/charts.mjs';

const close = `<button class="icon-btn close-dialog detail-close" aria-label="Close">${icon('close')}</button>`;
export const loadingDetail = name => `${close}<div class="loading"><span class="spinner"></span>Gathering ${escape(name)}…</div>`;

const hero = ({ kind, item, size = 'lg', eyebrow, title, meta }) => { const [c1, c2] = coverColors(kind, item); return `<header class="detail-hero" style="--c1:${c1};--c2:${c2}" data-backdrop-host>
  ${backdrop(kind, item)}${art(kind, item, size)}<div class="detail-heading"><span class="eyebrow">${eyebrow}</span><h2 class="detail-title">${title}</h2><p>${meta}</p></div>${close}</header>`; };
const statRow = list => `<div class="detail-stats">${list.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>`;
const monthly = timeline => timeline.length > 1 ? `<h3 class="detail-section">Over time</h3>${chart(w => barChart(w, {
  values: timeline.map(m => hours(m.ms)), label: i => monthLabel(timeline[i].key), tip: i => `${monthLabel(timeline[i].key, true)}\n${duration(timeline[i].ms)}`, height: 180, format: v => decimal(v), aria: 'Listening time per month'
}))}` : '';

export function artistView(d, stats) {
  const rank = stats.artists.findIndex(a => a.name === d.name), max = d.tracks[0]?.ms || 1;
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
      <div><h3 class="detail-section">Top tracks</h3><ol class="detail-tracks">${d.tracks.map((t, i) => `<li><span class="rank-num">${i + 1}</span><div><span class="detail-track-name" title="${escape(t.name)}">${escape(t.name)}</span><span class="bar"><span style="width:${t.ms / max * 100}%"></span></span></div><em>${plural(t.plays, 'play')}</em></li>`).join('')}</ol></div>
      <div><h3 class="detail-section">When you listen</h3>${chart(w => barChart(w, { values: d.hours.map(hours), label: i => i % 6 === 0 ? hourLabel(i) : '', tip: i => `${hourLabel(i)}–${hourLabel((i + 1) % 24)}\n${duration(d.hours[i])}`, height: 150, highlight: peakHour, format: v => decimal(v), aria: 'Listening by hour' }))}
        <p class="detail-note">Mostly around <strong>${hourLabel(peakHour)}</strong>, and most often on <strong>${DAY_NAMES[peakDay]}s</strong>.</p>
        ${d.albums.length ? `<h3 class="detail-section">Albums</h3><div class="album-chips">${d.albums.map(a => `<span class="album-chip">${art('album', a, 'xs')}<span>${escape(a.name)}<em>${duration(a.ms)}</em></span></span>`).join('')}</div>` : ''}
      </div>
    </div></div>`;
}

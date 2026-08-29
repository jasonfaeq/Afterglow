import { periodLabel } from '../state.mjs';
import { escape, number, percent, duration, plural, formatDate, monthLabel } from '../lib/format.mjs';
import { panel, insight, art, openAttrs, artistLink } from '../ui/components.mjs';
import { chart, stackChart, donut, SERIES } from '../ui/charts.mjs';

function podium(stats) {
  return `<section class="podium span-12" aria-label="Your top three artists">${stats.artists.slice(0, 3).map((a, i) => `<article class="podium-card place-${i + 1}" ${openAttrs('artist', a.name)}>
    ${art('artist', a, i ? 'lg' : 'xl')}
    <span class="podium-rank">${['#1', '#2', '#3'][i]}</span>
    <h3 class="podium-name">${artistLink(a.name)}</h3>
    <p class="podium-hours">${duration(a.ms)}</p>
    <p class="podium-meta">${plural(a.plays, 'play')} · ${plural(a.trackCount, 'track')} · ${percent(a.ms / stats.ms, 1)} of your time</p>
    ${a.first ? `<p class="podium-since">With you since ${formatDate(a.first, { month: 'short', year: 'numeric' })}</p>` : ''}
  </article>`).join('')}</section>`;
}

function trend(stats) {
  const { keys, series } = stats.artistTimeline;
  if (keys.length < 2) return '';
  const tip = i => `${monthLabel(keys[i], true)}\n${series.filter(s => s.values[i]).sort((a, b) => b.values[i] - a.values[i]).map(s => `${s.name}: ${duration(s.values[i])}`).join('\n') || 'No plays from these artists'}`;
  const legend = `<div class="legend">${series.map((s, i) => `<button class="legend-item" ${openAttrs('artist', s.name)}><i style="background:${SERIES[i]}"></i>${escape(s.name)}</button>`).join('')}</div>`;
  return panel('Your top artists over time', 'Monthly listening for your six most-played artists, stacked.', `${chart(w => stackChart(w, { keys, series, label: i => monthLabel(keys[i]), tip, aria: 'Monthly listening time for your top artists' }))}${legend}`, { cls: 'span-12' });
}

function concentration(stats) {
  const a = stats.artists, sum = list => list.reduce((s, x) => s + x.ms, 0);
  const segments = [
    { label: `#1 · ${a[0]?.name ?? ''}`, value: sum(a.slice(0, 1)), color: SERIES[0] },
    { label: 'Artists #2–5', value: sum(a.slice(1, 5)), color: SERIES[2] },
    { label: 'Artists #6–10', value: sum(a.slice(5, 10)), color: SERIES[3] },
    { label: 'Artists #11–50', value: sum(a.slice(10, 50)), color: SERIES[4] },
    { label: `Everyone else (${number(Math.max(0, a.length - 50))})`, value: sum(a.slice(50)), color: SERIES[5] }
  ].filter(s => s.value > 0);
  const top10 = sum(a.slice(0, 10)) / (stats.ms || 1);
  const verdict = top10 > .7 ? 'You know what you love, and you stick with it.' : top10 > .4 ? 'A loyal core, with plenty of room for exploring.' : 'A true explorer. Your listening is spread wide.';
  const body = `<div class="donut-wrap"><div class="donut-holder">${donut(segments)}<div class="donut-center"><strong>${percent(top10)}</strong><span>top 10</span></div></div>
    <ul class="donut-legend">${segments.map(s => `<li><i style="background:${s.color}"></i><span>${escape(s.label)}</span><strong>${percent(s.value / (stats.ms || 1), 1)}</strong></li>`).join('')}</ul></div>${insight('compass', verdict)}`;
  return panel('How concentrated is your taste?', 'Share of listening time by artist rank.', body, { cls: 'span-5' });
}

function discoveries(stats) {
  const { label, items } = stats.discoveries;
  const body = items.length ? `<ol class="rank-list">${items.slice(0, 6).map(a => `<li class="rank-row" ${openAttrs('artist', a.name)}>${art('artist', a)}
    <div class="rank-main">${artistLink(a.name, 'rank-title')}<span class="rank-sub">First heard ${formatDate(a.first)} · ${plural(a.plays, 'play')}</span></div>
    <span class="rank-value">${duration(a.ms)}</span></li>`).join('')}</ol>` : '<p class="empty-mini">No brand-new artists in this period. Familiar favourites only.</p>';
  return panel('Fresh discoveries', `${label}, ranked by listening time.`, body, { cls: 'span-7 discoveries' });
}

function topFifty(stats) {
  const max = stats.artists[0]?.ms || 1, list = stats.artists.slice(0, 50);
  const rows = list.map((a, i) => `<li class="rank-row" ${openAttrs('artist', a.name)}>
    <span class="rank-num">${String(i + 1).padStart(2, '0')}</span>${art('artist', a)}
    <div class="rank-main">${artistLink(a.name, 'rank-title')}<span class="rank-sub">${plural(a.plays, 'play')} · ${plural(a.trackCount, 'track')} · ${percent(a.ms / stats.ms, 1)}</span><span class="bar"><span style="width:${a.ms / max * 100}%"></span></span></div>
    <span class="rank-value">${duration(a.ms)}</span></li>`).join('');
  return panel(`Top ${list.length} artists`, `By listening time, ${periodLabel()}.`, `<ol class="rank-list two-col">${rows}</ol>`, { cls: 'span-12' });
}

function albums(stats) {
  if (!stats.albums.length) return `<section class="panel empty span-12"><h2>No album details in this export.</h2><p>Spotify’s extended streaming history includes album names. Your artist and track charts still work.</p></section>`;
  return `<div class="section-head span-12"><h2>The full-album feeling</h2><p>Your top albums by listening time</p></div>
    <div class="album-grid span-12">${stats.albums.slice(0, 12).map((album, i) => `<article class="album-card">
      <div class="album-cover">${art('album', album, 'fill')}<span class="album-rank">${i + 1}</span></div>
      <h3 title="${escape(album.name)}">${escape(album.name)}</h3><p>${artistLink(album.artist)}</p>
      <span class="album-hours">${duration(album.ms)} · ${plural(album.plays, 'play')}</span></article>`).join('')}</div>`;
}

export const render = stats => `<div class="grid">${podium(stats)}${trend(stats)}${concentration(stats)}${discoveries(stats)}${topFifty(stats)}${albums(stats)}</div>`;

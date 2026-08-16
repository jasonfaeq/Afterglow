import { state } from '../state.mjs';
import { number, decimal, percent, hours, duration, plural, DAY, monthLabel } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { panel, segmented } from '../ui/components.mjs';
import { chart, areaChart, sparkline } from '../ui/charts.mjs';

function statTiles(stats) {
  const top10 = stats.artists.slice(0, 10).reduce((sum, a) => sum + a.ms, 0) / (stats.ms || 1);
  const tiles = [
    ['clock', 'Listening time', number(hours(stats.ms)), 'hrs', `${decimal(stats.ms / DAY)} days of music · ${duration(stats.ms / (stats.activeDays || 1))} on an average day`, sparkline(stats.timeline.slice(-18).map(m => m.ms))],
    ['play', 'Plays', number(stats.plays), '', `${plural(stats.activeDays, 'day')} with music · ${duration(stats.ms / (stats.plays || 1))} per play`],
    ['artists', 'Artists', number(stats.artistCount), '', `Your top 10 make up ${percent(top10)} of your time`],
    ['music', 'Tracks', number(stats.trackCount), '', `${plural(stats.albumCount, 'album')} · ${decimal(stats.trackCount / (stats.artistCount || 1))} per artist`]
  ];
  return `<section class="stat-grid" aria-label="Listening summary">${tiles.map(([name, label, value, unit, sub, spark = '']) => `<article class="stat">
    <div class="stat-label">${icon(name)}${label}</div>${spark}
    <div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
    <p class="stat-sub">${sub}</p></article>`).join('')}</section>`;
}

const METRICS = {
  ms: ['Hours', m => hours(m.ms), v => `${decimal(v)} hrs`],
  plays: ['Plays', m => m.plays, v => plural(v, 'play')],
  artists: ['Artists', m => m.artists, v => plural(v, 'artist')]
};
function timeline(stats) {
  const data = stats.timeline, [label, read, fmt] = METRICS[state.timelineMetric], values = data.map(read);
  const peak = values.indexOf(Math.max(...values)), average = values.reduce((a, b) => a + b, 0) / (values.length || 1);
  const body = `${chart(w => areaChart(w, { values, label: i => monthLabel(data[i].key), tip: i => `${monthLabel(data[i].key, true)}\n${fmt(values[i])}`, aria: `Monthly ${label.toLowerCase()}, peaking in ${monthLabel(data[peak].key, true)}` }))}
    <div class="chart-foot"><span>Monthly average <strong>${fmt(Math.round(average * 10) / 10)}</strong></span><span>Peak <strong>${monthLabel(data[peak].key, true)} · ${fmt(values[peak])}</strong></span></div>`;
  return panel('Your listening story', 'Month by month, the music in your life.', body, { cls: 'span-12', action: segmented('Timeline metric', Object.entries(METRICS).map(([key, [name]]) => [key, name]), state.timelineMetric, 'data-metric') });
}

export const render = stats => `${statTiles(stats)}<div class="grid">${timeline(stats)}</div>`;

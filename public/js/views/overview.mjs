import { state, periodLabel } from '../state.mjs';
import { escape, number, decimal, percent, hours, duration, plural, DAY, monthLabel, formatDate } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { panel, segmented, art, artColors } from '../ui/components.mjs';
import { chart, areaChart, sparkline } from '../ui/charts.mjs';

function spotlight(stats) {
  const top = stats.artists[0], track = stats.tracks.find(t => t.artist === top.name);
  const [c1, c2] = artColors(top.name);
  return `<section class="spotlight span-7" style="--c1:${c1};--c2:${c2}">
    ${art('artist', top, 'xl')}
    <div class="spotlight-body">
      <span class="eyebrow">Your #1 artist · ${periodLabel()}</span>
      <h2 class="spotlight-name">${escape(top.name)}</h2>
      <p class="spotlight-stats"><strong>${duration(top.ms)}</strong> · ${plural(top.plays, 'play')} · ${percent(top.ms / stats.ms, 1)} of your listening</p>
      <p class="spotlight-meta">${top.first ? `With you since ${formatDate(top.first, { month: 'long', year: 'numeric' })}` : ''}${track ? ` · Most played: <strong>${escape(track.name)}</strong>` : ''}</p>
    </div>
  </section>`;
}

function statTiles(stats) {
  const top10 = stats.artists.slice(0, 10).reduce((sum, a) => sum + a.ms, 0) / (stats.ms || 1);
  const tiles = [
    ['clock', 'Listening time', number(hours(stats.ms)), 'hrs', `${decimal(stats.ms / DAY)} days of music · ${duration(stats.ms / (stats.activeDays || 1))} on an average day`, sparkline(stats.timeline.slice(-18).map(m => m.ms))],
    ['play', 'Plays', number(stats.plays), '', `${plural(stats.activeDays, 'day')} with music · ${duration(stats.ms / (stats.plays || 1))} per play`],
    ['artists', 'Artists', number(stats.artistCount), '', `Your top 10 make up ${percent(top10)} of your time`],
    ['music', 'Tracks', number(stats.trackCount), '', `${plural(stats.albumCount, 'album')} · ${decimal(stats.trackCount / (stats.artistCount || 1))} per artist`]
  ];
  return `<section class="stat-grid span-5" aria-label="Listening summary">${tiles.map(([name, label, value, unit, sub, spark = '']) => `<article class="stat">
    <div class="stat-label">${icon(name)}${label}</div>
    <div class="stat-row"><div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>${spark}</div>
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

function topArtists(stats) {
  const max = stats.artists[0]?.ms || 1;
  const rows = stats.artists.slice(0, 6).map((a, i) => `<li class="rank-row">
    <span class="rank-num">${String(i + 1).padStart(2, '0')}</span>${art('artist', a)}
    <div class="rank-main"><span class="rank-title">${escape(a.name)}</span><span class="rank-sub">${plural(a.plays, 'play')} · ${percent(a.ms / stats.ms, 1)} of your time</span><span class="bar"><span style="width:${a.ms / max * 100}%"></span></span></div>
    <span class="rank-value">${duration(a.ms)}</span></li>`).join('');
  return panel('Most-played artists', 'Ranked by listening time.', `<ol class="rank-list">${rows}</ol>`, { cls: 'span-6', action: '<a class="link" href="#/artists">All artists <span data-icon="arrow"></span></a>' });
}

function topTracks(stats) {
  const rows = stats.tracks.slice(0, 6).map((t, i) => `<li class="rank-row">
    <span class="rank-num">${String(i + 1).padStart(2, '0')}</span>${art('track', t)}
    <div class="rank-main"><span class="rank-title">${escape(t.name)}</span><span class="rank-sub">${escape(t.artist)} · ${plural(t.plays, 'play')}</span></div>
    <span class="rank-value">${duration(t.ms)}</span></li>`).join('');
  return panel('On repeat, for a reason', 'The tracks you kept coming back to.', `<ol class="rank-list">${rows}</ol>`, { cls: 'span-6', action: '<a class="link" href="#/tracks">All tracks <span data-icon="arrow"></span></a>' });
}

export const render = stats => `<div class="grid grid-hero">${spotlight(stats)}${statTiles(stats)}</div>
  <div class="grid">${timeline(stats)}${topArtists(stats)}${topTracks(stats)}</div>`;

import { state, periodLabel } from '../state.mjs';
import { escape, number, decimal, percent, hours, duration, clockDuration, plural, DAY, monthLabel, formatDate, dayLabel } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { panel, segmented, art, artColors, dayparts } from '../ui/components.mjs';
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

// With a year selected, each tile compares against the year before.
function delta(current, previous) {
  if (state.filters.year === 'all' || !previous) return '';
  const change = (current - previous) / previous;
  if (!Number.isFinite(change)) return '';
  return `<span class="delta ${change >= 0 ? 'up' : 'down'}" title="Compared with ${Number(state.filters.year) - 1}">${change >= 0 ? '↑' : '↓'} ${percent(Math.abs(change))}</span>`;
}

function statTiles(stats) {
  const top10 = stats.artists.slice(0, 10).reduce((sum, a) => sum + a.ms, 0) / (stats.ms || 1);
  const prev = stats.yearly.find(y => y.year === Number(state.filters.year) - 1), current = stats.yearly.find(y => y.year === Number(state.filters.year));
  const tiles = [
    ['clock', 'Listening time', number(hours(stats.ms)), 'hrs', `${decimal(stats.ms / DAY)} days of music · ${duration(stats.ms / (stats.activeDays || 1))} on an average day`, delta(stats.ms, prev?.ms), sparkline(stats.timeline.slice(-18).map(m => m.ms))],
    ['play', 'Plays', number(stats.plays), '', `${plural(stats.activeDays, 'day')} with music · ${duration(stats.ms / (stats.plays || 1))} per play`, delta(stats.plays, prev?.plays)],
    ['artists', 'Artists', number(stats.artistCount), '', current ? `${plural(current.newArtists, 'new artist')} discovered in ${current.year}` : `Your top 10 make up ${percent(top10)} of your time`, delta(stats.artistCount, prev?.artistCount)],
    ['music', 'Tracks', number(stats.trackCount), '', `${plural(stats.albumCount, 'album')} · ${decimal(stats.trackCount / (stats.artistCount || 1))} per artist`, delta(stats.trackCount, prev?.trackCount)]
  ];
  return `<section class="stat-grid span-5" aria-label="Listening summary">${tiles.map(([name, label, value, unit, sub, change, spark = '']) => `<article class="stat">
    <div class="stat-label">${icon(name)}${label}${change}</div>
    <div class="stat-row"><div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>${spark}</div>
    <p class="stat-sub">${sub}</p></article>`).join('')}</section>`;
}

const METRICS = {
  ms: ['Hours', m => hours(m.ms), v => `${decimal(v)} hrs`],
  plays: ['Plays', m => m.plays, v => plural(v, 'play')],
  artists: ['Artists', m => m.artists, v => plural(v, 'artist')],
  newArtists: ['New artists', m => m.newArtists, v => plural(v, 'new artist')]
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

function records(stats) {
  const tiles = [], short = { month: 'short', day: 'numeric', year: 'numeric' };
  const b = stats.biggestDay;
  if (b) tiles.push(['flame', 'Biggest day', duration(b.ms), `${dayLabel(b.key)} · ${plural(b.plays, 'play')}${b.artist ? `, mostly ${escape(b.artist)}` : ''}`]);
  if (stats.streak) tiles.push(['calendar', 'Longest streak', plural(stats.streak.days, 'day'), stats.streak.days > 1 ? `${dayLabel(stats.streak.from, short)} → ${dayLabel(stats.streak.to, short)}` : 'Listen two days in a row to start one']);
  const session = stats.sessions.longest;
  if (session) tiles.push(['headphones', 'Longest session', clockDuration(session.ms), `${plural(session.plays, 'track')} on ${formatDate(session.start)}`]);
  if (stats.repeat) tiles.push(['repeat', 'On repeat', `${stats.repeat.count}× in a row`, `${escape(stats.repeat.name)} · ${escape(stats.repeat.artist)}`]);
  const loyal = [...stats.artists].sort((a, b) => b.months - a.months || b.ms - a.ms)[0];
  if (loyal && stats.timeline.length > 1) tiles.push(['heart', 'Most loyal', escape(loyal.name), `Played in ${loyal.months} of ${plural(stats.timeline.length, 'month')}`]);
  const span = Math.max(1, Math.round((stats.end - stats.start) / DAY) + 1);
  tiles.push(['clock', 'A typical day', duration(stats.ms / (stats.activeDays || 1)), `You listened on ${percent(Math.min(1, stats.activeDays / span))} of the days in this period`]);
  const top = dayparts(stats).reduce((a, b) => b.ms > a.ms ? b : a);
  tiles.push([top.icon, 'Listening persona', top.persona, `${percent(top.ms / (stats.ms || 1))} of your time is in the ${top.label.toLowerCase()}, ${top.range}`]);
  if (stats.firstPlay) tiles.push(['flag', state.filters.year === 'all' ? 'Where it began' : `First play of ${state.filters.year}`, escape(stats.firstPlay.name), `${escape(stats.firstPlay.artist)} · ${formatDate(stats.firstPlay.ts)}`]);
  return panel('Records & moments', `The standout days, streaks and habits of ${periodLabel()}.`, `<div class="records">${tiles.map(([name, label, value, sub]) => `<article class="record">
    ${icon(name)}<span class="record-label">${label}</span><strong class="record-value" title="${value}">${value}</strong><span class="record-sub">${sub}</span></article>`).join('')}</div>`, { cls: 'span-12' });
}

export const render = stats => `<div class="grid grid-hero">${spotlight(stats)}${statTiles(stats)}</div>
  <div class="grid">${timeline(stats)}${topArtists(stats)}${topTracks(stats)}${records(stats)}</div>`;

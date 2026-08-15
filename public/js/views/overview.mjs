import { number, decimal, percent, hours, duration, plural, DAY } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';

function statTiles(stats) {
  const top10 = stats.artists.slice(0, 10).reduce((sum, a) => sum + a.ms, 0) / (stats.ms || 1);
  const tiles = [
    ['clock', 'Listening time', number(hours(stats.ms)), 'hrs', `${decimal(stats.ms / DAY)} days of music · ${duration(stats.ms / (stats.activeDays || 1))} on an average day`],
    ['play', 'Plays', number(stats.plays), '', `${plural(stats.activeDays, 'day')} with music · ${duration(stats.ms / (stats.plays || 1))} per play`],
    ['artists', 'Artists', number(stats.artistCount), '', `Your top 10 make up ${percent(top10)} of your time`],
    ['music', 'Tracks', number(stats.trackCount), '', `${plural(stats.albumCount, 'album')} · ${decimal(stats.trackCount / (stats.artistCount || 1))} per artist`]
  ];
  return `<section class="stat-grid" aria-label="Listening summary">${tiles.map(([name, label, value, unit, sub]) => `<article class="stat">
    <div class="stat-label">${icon(name)}${label}</div>
    <div class="stat-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
    <p class="stat-sub">${sub}</p></article>`).join('')}</section>`;
}

export const render = stats => statTiles(stats);

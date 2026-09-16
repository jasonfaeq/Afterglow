import { state } from '../state.mjs';
import { escape, number, percent, hours, duration, plural } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { panel, insight, art, artistLink, trackLink } from '../ui/components.mjs';
import { chart, barChart } from '../ui/charts.mjs';

export function render(stats) {
  const ys = stats.yearly;
  if (!ys.length) return '';
  const selected = state.filters.year === 'all' ? -1 : ys.findIndex(y => y.year === Number(state.filters.year));
  const best = ys.reduce((a, b) => b.ms > a.ms ? b : a), last = ys.at(-1), previous = ys.at(-2);
  const growth = previous ? (last.ms - previous.ms) / previous.ms : null;
  const sameDate = last.year === new Date().getFullYear() ? ' so far' : '';
  const hoursPanel = panel('Hours per year', 'Your total listening time, year after year.', `${chart(w => barChart(w, {
    values: ys.map(y => hours(y.ms)), label: i => String(ys[i].year), sublabel: i => `${number(hours(ys[i].ms))} h`, height: 270,
    tip: i => `${ys[i].year}\n${duration(ys[i].ms)} · ${plural(ys[i].plays, 'play')}\nTop artist: ${ys[i].topArtist?.name ?? '—'}`,
    highlight: selected >= 0 ? selected : ys.indexOf(best), aria: 'Listening hours per year'
  }))}${insight('trophy', `<strong>${best.year}</strong> was your biggest year, with ${duration(best.ms)}.${growth !== null ? ` ${last.year} is ${growth >= 0 ? 'up' : 'down'} <strong>${percent(Math.abs(growth))}</strong> on ${previous.year}${sameDate}.` : ''}`)}`, { cls: 'span-12' });
  const small = (title, sub, read, describe) => panel(title, sub, chart(w => barChart(w, {
    values: ys.map(read), label: i => String(ys[i].year), tip: i => `${ys[i].year}\n${describe(read(ys[i]))}`, highlight: selected, height: 210, aria: title
  })), { cls: 'span-6' });
  const cards = [...ys].reverse().map(y => `<article class="year-card${y.year === Number(state.filters.year) ? ' selected' : ''}">
    <header><h3>${y.year}</h3><button class="link" data-year="${y.year}">Explore ${icon('arrow')}</button></header>
    <p class="year-hours">${number(hours(y.ms))}<small>hrs</small></p>
    <dl><div><dt>Plays</dt><dd>${number(y.plays)}</dd></div><div><dt>Artists</dt><dd>${number(y.artistCount)}</dd></div><div><dt>New artists</dt><dd>${number(y.newArtists)}</dd></div><div><dt>Days with music</dt><dd>${number(y.activeDays)}</dd></div></dl>
    ${y.topArtist ? `<div class="year-top">${art('artist', y.topArtist)}<div><span>Top artist</span><strong>${artistLink(y.topArtist.name)}</strong></div></div>` : ''}
    ${y.topTrack ? `<div class="year-top">${art('track', y.topTrack)}<div><span>Top track</span><strong>${trackLink(y.topTrack.name, y.topTrack.artist)}</strong></div></div>` : ''}
  </article>`).join('');
  return `<div class="grid">${hoursPanel}${small('New artists per year', 'Artists you heard for the very first time.', y => y.newArtists, v => plural(v, 'new artist'))}${small('Days with music', 'How many days each year had a soundtrack.', y => y.activeDays, v => plural(v, 'day'))}
    <div class="section-head span-12"><h2>Year cards</h2><p>Newest first</p></div><div class="year-grid span-12">${cards}</div></div>`;
}

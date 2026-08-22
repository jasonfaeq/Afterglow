import { state } from '../state.mjs';
import { number, decimal, percent, duration, clockDuration, plural, formatDate, dayLabel, hourLabel, DAY_NAMES } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { panel, insight, segmented, hourTotals, dayparts } from '../ui/components.mjs';
import { chart, calendarChart, clockChart, HEAT, heatLevel } from '../ui/charts.mjs';

const short = { month: 'short', day: 'numeric', year: 'numeric' };
const legend = `<div class="heat-legend"><small>Less</small>${HEAT.map(color => `<i style="background:${color}"></i>`).join('')}<small>More</small></div>`;

function calendar(stats) {
  const years = stats.years.filter(y => stats.daily.some(([key]) => key.startsWith(`${y}-`)));
  const year = state.filters.year !== 'all' ? Number(state.filters.year) : years.includes(state.calendarYear) ? state.calendarYear : years[0];
  const active = stats.daily.filter(([key]) => key.startsWith(`${year}-`)).length, streak = stats.streak;
  const chips = state.filters.year === 'all' && years.length > 1 ? segmented('Calendar year', years.slice(0, 6).map(y => [String(y), String(y)]), String(year), 'data-cal-year') : '';
  const note = `You listened on <strong>${plural(active, 'day')}</strong> in ${year}.${streak ? ` Your longest streak ${state.filters.year === 'all' ? 'ever' : `in ${year}`} ran <strong>${plural(streak.days, 'day')}</strong>, ${dayLabel(streak.from, short)} to ${dayLabel(streak.to, short)}.` : ''}`;
  return panel('Every day, at a glance', `Daily listening in ${year}. The brighter the square, the bigger the day.`, `${chart(w => calendarChart(w, stats.daily, year))}${legend}${insight('flame', note)}`, { cls: 'span-12', action: chips });
}

function clock(stats) {
  const parts = dayparts(stats), total = stats.ms || 1;
  const list = parts.map(p => `<div class="daypart"><span class="daypart-icon" style="color:${p.color}">${icon(p.icon)}</span><div><strong>${p.label}</strong><span>${p.range}</span></div>
    <span class="daypart-bar"><span style="width:${p.ms / total * 100}%;background:${p.color}"></span></span><em>${percent(p.ms / total)}</em></div>`).join('');
  return panel('Around the clock', 'Listening by hour of the day.', `<div class="clock-wrap">${chart(w => clockChart(w, hourTotals(stats)), 'clock-slot')}<div class="dayparts">${list}</div></div>`, { cls: 'span-6' });
}

function week(stats) {
  const totals = stats.heat.map(day => day.reduce((a, b) => a + b, 0)), max = Math.max(...totals, 1), peak = totals.indexOf(Math.max(...totals));
  const weekend = (totals[0] + totals[6]) / 2, weekday = totals.slice(1, 6).reduce((a, b) => a + b, 0) / 5, ratio = weekday ? weekend / weekday : 0;
  const bars = totals.map((ms, d) => `<div class="week-bar${d === peak ? ' peak' : ''}" tabindex="0" data-tip="${DAY_NAMES[d]}s\n${duration(ms)}"><span class="week-fill" style="height:${Math.max(2, ms / max * 100)}%"></span><span class="week-label">${DAY_NAMES[d].slice(0, 3)}</span></div>`).join('');
  const verdict = ratio > 1.1 ? `Weekends are ${percent(ratio - 1)} louder than weekdays.` : ratio < .9 ? `Weekdays carry the soundtrack; weekends are ${percent(1 - ratio)} quieter.` : 'Weekdays and weekends sound about the same.';
  return panel('The shape of your week', 'Total listening time on each day of the week.', `<div class="week-bars">${bars}</div>${insight('calendar', `<strong>${DAY_NAMES[peak]}</strong> is your biggest day. ${verdict}`)}`, { cls: 'span-6' });
}

export function heatmap(stats, cls = 'span-7') {
  const max = Math.max(...stats.heat.flat(), 1), totals = hourTotals(stats), peak = totals.indexOf(Math.max(...totals));
  const grid = stats.heat.map((day, d) => `<span class="heat-day">${DAY_NAMES[d].slice(0, 3)}</span>${day.map((ms, hour) => `<span class="heat-cell" style="background:${HEAT[heatLevel(ms, max)]}" data-tip="${DAY_NAMES[d]}s, ${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}\n${duration(ms)}"></span>`).join('')}`).join('');
  const body = `<div class="heat-grid" role="img" aria-label="Listening by day of week and hour, peaking at ${hourLabel(peak)}">${grid}</div>
    <div class="heat-hours"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>${legend}
    ${insight('sparkle', `Your most musical hour is <strong>${hourLabel(peak)}–${hourLabel((peak + 1) % 24)}</strong>, with ${duration(totals[peak])} of listening.`)}`;
  return panel('A rhythm to your week', 'When music finds its way into your day.', body, { cls, action: `<span class="chip">${state.filters.utc ? 'UTC' : 'Local time'}</span>` });
}

function sessions(stats) {
  const s = stats.sessions;
  const tiles = [[number(s.count), 'sessions'], [clockDuration(s.avgMs), 'average length'], [decimal(s.count / (stats.activeDays || 1)), 'per active day'], [s.longest ? clockDuration(s.longest.ms) : '—', 'longest']];
  return panel('Listening sessions', 'A run of plays with less than 20 minutes of silence in between.', `<div class="mini-stats">${tiles.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div>
    ${s.longest ? insight('headphones', `Your longest session started on ${formatDate(s.longest.start, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}: <strong>${plural(s.longest.plays, 'track')}</strong> back to back.`) : ''}`, { cls: 'span-5' });
}

export const render = stats => `<div class="grid">${calendar(stats)}${clock(stats)}${week(stats)}${heatmap(stats)}${sessions(stats)}</div>`;

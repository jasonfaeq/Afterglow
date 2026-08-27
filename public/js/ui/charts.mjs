import { escape, niceMax, axisNumber, hours, percent, duration, plural, dayLabel, hourLabel, DAY, DAY_NAMES } from '../lib/format.mjs';

export const SERIES = ['#ffb45e', '#ff7a5c', '#f2557a', '#c04fd6', '#8b5cf6', '#5aa9ff'];
export const HEAT = ['rgba(255, 255, 255, .05)', '#3b2349', '#6b2a60', '#a8396a', '#e75d5c', '#ffb45e'];
export const heatLevel = (value, cap) => value ? Math.min(5, Math.max(1, Math.ceil(value / cap * 5))) : 0;

/* Charts are drawn at their real pixel width so text stays crisp. `chart()` leaves a slot; drawCharts() fills it. */
const charts = new Map();
let sequence = 0;
export function chart(draw, className = '') {
  const key = `c${++sequence}`;
  charts.set(key, draw);
  return `<div class="chart-slot ${className}" data-chart="${key}"></div>`;
}
export function drawCharts(force = false) {
  for (const [key, draw] of charts) {
    const slot = document.querySelector(`[data-chart="${key}"]`);
    if (!slot) { charts.delete(key); continue; }
    const width = Math.max(220, Math.floor(slot.clientWidth));
    if (!force && Number(slot.dataset.width) === width) continue;
    // Only animate the first time a chart appears, not on every resize.
    slot.classList.toggle('fresh', !slot.dataset.width);
    slot.dataset.width = width; slot.innerHTML = draw(width);
  }
}
let frame;
addEventListener('resize', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => drawCharts()); });

// Monotone cubic interpolation: smooth curves that never overshoot below zero.
export function smoothPath(points, move = true) {
  const n = points.length;
  if (!n) return '';
  const start = `${move ? 'M' : 'L'}${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  if (n === 1) return start;
  const dx = [], slope = [], tangent = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = points[i + 1][0] - points[i][0]; slope[i] = (points[i + 1][1] - points[i][1]) / (dx[i] || 1); }
  tangent[0] = slope[0]; tangent[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) tangent[i] = slope[i - 1] * slope[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]);
  let d = start;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1], h = dx[i] / 3;
    d += ` C${(x0 + h).toFixed(1)},${(y0 + tangent[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - tangent[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function gridLines({ w, H, left, right, top, bottom, max, format }) {
  return [0, 1, 2, 3, 4].map(n => {
    const py = top + n / 4 * (H - top - bottom);
    return `<line class="${n === 4 ? 'baseline' : 'grid-line'}" x1="${left}" y1="${py}" x2="${w - right}" y2="${py}"/><text x="${left - 10}" y="${py + 3.5}" text-anchor="end">${format(max * (1 - n / 4))}</text>`;
  }).join('');
}

export function areaChart(w, { values, label, tip, height = 250, format = axisNumber, from = '#ffb45e', to = '#f2557a', aria = 'Chart' }) {
  const H = w < 520 ? Math.min(height, 200) : height, left = 44, right = 12, top = 16, bottom = 30, n = values.length;
  const max = niceMax(Math.max(...values, 0)), id = `g${++sequence}`;
  const x = i => n === 1 ? (left + w - right) / 2 : left + i / (n - 1) * (w - left - right);
  const y = v => H - bottom - v / max * (H - top - bottom);
  const points = values.map((v, i) => [x(i), y(v)]);
  const line = smoothPath(points);
  const area = `${line} L${x(n - 1).toFixed(1)},${H - bottom} L${x(0).toFixed(1)},${H - bottom} Z`;
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((w - left - right) / 64))));
  const slot = n > 1 ? (w - left - right) / (n - 1) : w - left - right;
  return `<svg class="chart" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${escape(aria)}">
    <defs>
      <linearGradient id="${id}-line" x1="0" x2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
      <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${to}" stop-opacity=".32"/><stop offset="1" stop-color="${to}" stop-opacity="0"/></linearGradient>
      <filter id="${id}-glow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>
    ${gridLines({ w, H, left, right, top, bottom, max, format })}
    <path class="area" d="${area}" fill="url(#${id}-fill)"/>
    <path class="line line-glow" d="${line}" stroke="url(#${id}-line)" filter="url(#${id}-glow)" pathLength="1"/>
    <path class="line" d="${line}" stroke="url(#${id}-line)" pathLength="1"/>
    ${n === 1 ? `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="4" fill="${to}"/>` : ''}
    ${values.map((v, i) => i % every === 0 ? `<text x="${x(i)}" y="${H - 9}" text-anchor="middle">${escape(label(i))}</text>` : '').join('')}
    ${values.map((v, i) => `<g class="pt" tabindex="0" data-tip="${escape(tip(i))}"><rect class="hit" x="${x(i) - slot / 2}" y="${top}" width="${slot}" height="${H - top - bottom}"/><line class="guide" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${H - bottom}"/><circle class="dot" cx="${points[i][0]}" cy="${points[i][1]}" r="5"/></g>`).join('')}
  </svg>`;
}

export function barChart(w, { values, label, sublabel, tip, height = 220, highlight = -1, format = axisNumber, aria = 'Bar chart' }) {
  const H = height, left = 44, right = 8, top = 16, bottom = sublabel ? 46 : 30, n = values.length, id = `g${++sequence}`;
  const max = niceMax(Math.max(...values, 0)), slot = (w - left - right) / Math.max(n, 1), bw = Math.max(3, Math.min(56, slot * .62));
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((w - left - right) / 46))));
  return `<svg class="chart bars" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${escape(aria)}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2557a"/><stop offset="1" stop-color="#8b5cf6" stop-opacity=".5"/></linearGradient>
    <linearGradient id="${id}-hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc46b"/><stop offset="1" stop-color="#ff7a5c"/></linearGradient></defs>
    ${gridLines({ w, H, left, right, top, bottom, max, format })}
    ${values.map((v, i) => {
      const bh = v / max * (H - top - bottom), bx = left + i * slot + (slot - bw) / 2;
      return `<g class="pt bar${i === highlight ? ' hi' : ''}" tabindex="0" data-tip="${escape(tip(i))}"><rect class="hit" x="${left + i * slot}" y="${top}" width="${slot}" height="${H - top - bottom}"/><rect class="dot bar-fill" x="${bx}" y="${H - bottom - bh}" width="${bw}" height="${Math.max(bh, v ? 2 : 0)}" rx="${Math.min(7, bw / 3)}" fill="url(#${id}${i === highlight ? '-hi' : ''})"/></g>`;
    }).join('')}
    ${values.map((v, i) => i % every === 0 ? `<text class="${i === highlight ? 'strong' : ''}" x="${left + (i + .5) * slot}" y="${H - bottom + 18}" text-anchor="middle">${escape(label(i))}</text>${sublabel ? `<text class="sub" x="${left + (i + .5) * slot}" y="${H - bottom + 34}" text-anchor="middle">${escape(sublabel(i))}</text>` : ''}` : '').join('')}
  </svg>`;
}

// Monthly hours for a handful of series, stacked. `tip(i)` describes one month.
export function stackChart(w, { keys, series, label, tip, aria = 'Stacked chart' }) {
  const H = w < 520 ? 220 : 280, left = 44, right = 12, top = 16, bottom = 30, n = keys.length;
  const totals = keys.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const max = niceMax(Math.max(...totals.map(hours), 0));
  const x = i => n === 1 ? (left + w - right) / 2 : left + i / (n - 1) * (w - left - right);
  const y = ms => H - bottom - hours(ms) / max * (H - top - bottom);
  const base = Array(n).fill(0);
  const layers = series.map((s, si) => {
    const lower = base.map((b, i) => [x(i), y(b)]);
    s.values.forEach((v, i) => { base[i] += v; });
    const upper = base.map((b, i) => [x(i), y(b)]);
    return `<path class="layer" d="${smoothPath(upper)} ${smoothPath(lower.reverse(), false)} Z" fill="${SERIES[si]}"/>`;
  });
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((w - left - right) / 64))));
  const slot = n > 1 ? (w - left - right) / (n - 1) : w - left - right;
  return `<svg class="chart" width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="${escape(aria)}">
    ${gridLines({ w, H, left, right, top, bottom, max, format: axisNumber })}<g class="layers">${layers.join('')}</g>
    ${keys.map((key, i) => i % every === 0 ? `<text x="${x(i)}" y="${H - 9}" text-anchor="middle">${escape(label(i))}</text>` : '').join('')}
    ${keys.map((key, i) => `<g class="pt" tabindex="0" data-tip="${escape(tip(i))}"><rect class="hit" x="${x(i) - slot / 2}" y="${top}" width="${slot}" height="${H - top - bottom}"/><line class="guide" x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${H - bottom}"/><circle class="dot" cx="${x(i)}" cy="${y(totals[i])}" r="4"/></g>`).join('')}
  </svg>`;
}

export function donut(segments, size = 184, thickness = 22) {
  const r = (size - thickness) / 2, C = 2 * Math.PI * r, total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  let offset = 0;
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Share of listening time">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="track" stroke-width="${thickness}" fill="none"/>
    ${segments.map(s => {
      const length = s.value / total * C, gap = length > 4 ? 2.5 : 0;
      const arc = `<circle tabindex="0" data-tip="${escape(`${s.label}\n${percent(s.value / total, 1)} of your time`)}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${Math.max(0, length - gap)} ${C - length + gap}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += length; return arc;
    }).join('')}</svg>`;
}

// A year of days, one square each, like a contribution graph.
export function calendarChart(w, daily, year) {
  const days = new Map(daily.map(([key, ms, plays]) => [key, [ms, plays]]));
  const from = Date.UTC(year, 0, 1) / DAY, to = Date.UTC(year, 11, 31) / DAY;
  const offset = (new Date(from * DAY).getUTCDay() + 6) % 7, gridStart = from - offset, weeks = Math.ceil((to - gridStart + 1) / 7);
  const left = 32, top = 22, gap = 3, cell = Math.max(9, Math.min(18, Math.floor((w - left) / weeks) - gap));
  const width = left + weeks * (cell + gap), height = top + 7 * (cell + gap);
  const values = [...days].filter(([key]) => key.startsWith(`${year}-`)).map(([, v]) => v[0]).sort((a, b) => a - b);
  const cap = values[Math.floor(values.length * .95)] || 1;
  let rects = '', months = '';
  for (let d = from; d <= to; d++) {
    const key = new Date(d * DAY).toISOString().slice(0, 10), week = Math.floor((d - gridStart) / 7), row = (d - gridStart) % 7, [ms, plays] = days.get(key) ?? [0, 0];
    rects += `<rect class="day" x="${left + week * (cell + gap)}" y="${top + row * (cell + gap)}" width="${cell}" height="${cell}" rx="3.5" fill="${HEAT[heatLevel(ms, cap)]}" data-tip="${escape(`${dayLabel(key)}\n${ms ? `${duration(ms)} · ${plural(plays, 'play')}` : 'No listening'}`)}"/>`;
    if (key.endsWith('-01')) months += `<text x="${left + week * (cell + gap)}" y="13">${dayLabel(key, { month: 'short' })}</text>`;
  }
  const labels = [0, 2, 4].map(i => `<text x="0" y="${top + i * (cell + gap) + cell - 2}">${DAY_NAMES[i].slice(0, 3)}</text>`).join('');
  return `<div class="calendar-scroll"><svg class="chart calendar" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Daily listening calendar for ${year}">${months}${labels}${rects}</svg></div>`;
}

// 24 wedges around a clock face, coloured by time of day.
export function clockChart(w, values) {
  const size = Math.min(w, 320), c = size / 2, inner = size * .2, outer = size * .4, max = Math.max(...values, 1);
  const p = (r, a) => `${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`;
  const color = h => h < 5 ? '#8b5cf6' : h < 12 ? '#ffb45e' : h < 17 ? '#ff7a5c' : h < 22 ? '#f2557a' : '#b04fd6';
  const peak = values.indexOf(Math.max(...values));
  const wedges = values.map((v, h) => {
    const a0 = h / 24 * Math.PI * 2 - Math.PI / 2 + .028, a1 = (h + 1) / 24 * Math.PI * 2 - Math.PI / 2 - .028, r = inner + 3 + (outer - inner - 3) * v / max;
    return `<path class="wedge${h === peak ? ' peak' : ''}" tabindex="0" data-tip="${hourLabel(h)}–${hourLabel((h + 1) % 24)}\n${duration(v)}" d="M${p(inner, a0)} L${p(r, a0)} A${r},${r} 0 0 1 ${p(r, a1)} L${p(inner, a1)} A${inner},${inner} 0 0 0 ${p(inner, a0)} Z" fill="${color(h)}"/>`;
  }).join('');
  const labels = [0, 3, 6, 9, 12, 15, 18, 21].map(h => { const a = h / 24 * Math.PI * 2 - Math.PI / 2; return `<text x="${c + (outer + 17) * Math.cos(a)}" y="${c + (outer + 17) * Math.sin(a) + 4}" text-anchor="middle">${hourLabel(h)}</text>`; }).join('');
  return `<svg class="chart clock" width="${w}" height="${size}" viewBox="${(size - w) / 2} 0 ${w} ${size}" role="img" aria-label="Listening by hour of day, peaking at ${hourLabel(peak)}">
    <circle cx="${c}" cy="${c}" r="${outer}" class="ring"/><circle cx="${c}" cy="${c}" r="${(inner + outer) / 2}" class="ring"/>${wedges}${labels}
    <text x="${c}" y="${c - 2}" text-anchor="middle" class="clock-value">${hourLabel(peak)}</text><text x="${c}" y="${c + 16}" text-anchor="middle">peak hour</text>
  </svg>`;
}

export function ring(value, color, size = 68) {
  const r = size / 2 - 6, C = 2 * Math.PI * r;
  return `<svg class="ring-gauge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="track" stroke-width="7" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C * Math.min(1, value)} ${C}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

export function sparkline(values) {
  const max = Math.max(...values, 1), w = 92, h = 34;
  const points = values.map((v, i) => [i * w / Math.max(values.length - 1, 1), h - 3 - v / max * (h - 8)]);
  return `<svg class="stat-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${smoothPath(points)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

import { escape, niceMax, axisNumber } from '../lib/format.mjs';

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

export function sparkline(values) {
  const max = Math.max(...values, 1), w = 92, h = 34;
  const points = values.map((v, i) => [i * w / Math.max(values.length - 1, 1), h - 3 - v / max * (h - 8)]);
  return `<svg class="stat-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${smoothPath(points)}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}

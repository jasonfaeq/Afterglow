// Generated cover art. Every album gets a small, deterministic SVG artwork and every artist a soft
// portrait, so the sample library (and anything without a real cover) still looks like a shelf of records.

// [background, accent, accent, accent, ink]. Every palette is a handful of riso inks on paper,
// so the whole shelf looks like it came off the same press.
const PALETTES = [
  ['#f6f5f1', '#ff48a6', '#2f55c8', '#ffd23f', '#1b1b1f'],
  ['#2f55c8', '#ff48a6', '#f6f5f1', '#ffd23f', '#f6f5f1'],
  ['#ffd23f', '#2f55c8', '#ff48a6', '#1b1b1f', '#1b1b1f'],
  ['#f6f5f1', '#0f8a7a', '#ff7a2f', '#2f55c8', '#1b1b1f'],
  ['#1b1b1f', '#ff48a6', '#ffd23f', '#2f55c8', '#f6f5f1'],
  ['#ff48a6', '#2f55c8', '#ffd23f', '#f6f5f1', '#1b1b1f'],
  ['#0f8a7a', '#ffd23f', '#f6f5f1', '#ff48a6', '#f6f5f1'],
  ['#efe8da', '#ff7a2f', '#1b1b1f', '#2f55c8', '#1b1b1f'],
  ['#ff7a2f', '#1b1b1f', '#f6f5f1', '#2f55c8', '#1b1b1f'],
  ['#e6ebf7', '#2f55c8', '#ff48a6', '#0f8a7a', '#1b1b1f'],
  ['#f6f5f1', '#1b1b1f', '#ff48a6', '#ff7a2f', '#1b1b1f'],
  ['#2f55c8', '#ffd23f', '#0f8a7a', '#ff48a6', '#f6f5f1'],
  ['#fde3ef', '#ff48a6', '#2f55c8', '#ff7a2f', '#1b1b1f'],
  ['#e7e5df', '#2f55c8', '#1b1b1f', '#ffd23f', '#1b1b1f']
];

const hash = text => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const seeded = seed => () => {
  seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const xml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const f = n => n.toFixed(1);

// Each style draws a 200×200 artwork. The flag says whether small type sits nicely on top.
const STYLES = [
  [function sun(r, [bg, a, b, c]) {
    const cy = 92 + r() * 30, rad = 46 + r() * 18;
    let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${a}" stop-opacity=".6"/></linearGradient>
      <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
      <rect width="200" height="200" fill="url(#sky)"/><circle cx="100" cy="${f(cy)}" r="${f(rad)}" fill="url(#sun)"/>`;
    for (let i = 0; i < 6; i++) s += `<rect x="0" y="${f(cy + 4 + i * rad / 6.4)}" width="200" height="${f(1 + i * 1.15)}" fill="${bg}"/>`;
    return s + `<rect x="0" y="${f(cy + rad * .92)}" width="200" height="200" fill="${bg}"/>`;
  }, true],
  [function rings(r, [bg, a, b, c]) {
    const cx = 30 + r() * 140, cy = 30 + r() * 140, step = 11 + r() * 9, colours = r() < .5 ? [a, b] : [a, b, c];
    let s = `<rect width="200" height="200" fill="${bg}"/>`;
    for (let i = 0, rad = 300; rad > 3; i++, rad -= step) s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="${i % 2 ? bg : colours[(i / 2) % colours.length]}"/>`;
    return s;
  }, false],
  [function waves(r, [bg, a, b, c, ink]) {
    const colours = [a, b, c, ink, a], amp = 7 + r() * 12, freq = .8 + r() * 1.6, phase = r() * 6.3;
    let s = `<rect width="200" height="200" fill="${bg}"/>`;
    for (let i = 0; i < 5; i++) {
      const base = 78 + i * 26;
      let d = `M0 ${f(base)}`;
      for (let x = 5; x <= 200; x += 5) d += ` L${x} ${f(base + Math.sin(x / 200 * Math.PI * 2 * freq + phase + i * .85) * amp)}`;
      s += `<path d="${d} L200 200 L0 200 Z" fill="${colours[i]}"/>`;
    }
    return s;
  }, true],
  [function dots(r, [bg, a, b, c]) {
    const n = r() < .5 ? 4 : 5, cell = 200 / n, colours = [a, b, c];
    let s = `<rect width="200" height="200" fill="${bg}"/>`;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += `<circle cx="${f(cell * (i + .5))}" cy="${f(cell * (j + .5))}" r="${f(cell * (.1 + r() * .36))}" fill="${colours[Math.floor(r() * 3)]}"/>`;
    return s;
  }, false],
  [function bauhaus(r, palette) {
    let s = '<defs>';
    for (let k = 0; k < 4; k++) s += `<clipPath id="q${k}"><rect x="${(k % 2) * 100}" y="${Math.floor(k / 2) * 100}" width="100" height="100"/></clipPath>`;
    s += '</defs>';
    for (let k = 0; k < 4; k++) {
      const x = (k % 2) * 100, y = Math.floor(k / 2) * 100, back = Math.floor(r() * 5);
      const front = palette[(back + 1 + Math.floor(r() * 4)) % 5], shape = Math.floor(r() * 5), corner = Math.floor(r() * 4);
      const cx = x + (corner % 2) * 100, cy = y + (corner > 1 ? 100 : 0);
      s += `<rect x="${x}" y="${y}" width="100" height="100" fill="${palette[back]}"/><g clip-path="url(#q${k})">`;
      if (shape === 0) s += `<circle cx="${x + 50}" cy="${y + 50}" r="36" fill="${front}"/>`;
      if (shape === 1) s += `<circle cx="${cx}" cy="${cy}" r="100" fill="${front}"/>`;
      if (shape === 2) s += `<circle cx="${x + 50}" cy="${corner > 1 ? y + 100 : y}" r="50" fill="${front}"/>`;
      if (shape === 3) s += `<polygon points="${x},${y + 100} ${x + 100},${y + 100} ${corner % 2 ? x + 100 : x},${y}" fill="${front}"/>`;
      if (shape === 4) s += `<rect x="${x + 22}" y="${y + 22}" width="56" height="56" fill="${front}"/>`;
      s += '</g>';
    }
    return s;
  }, false],
  [function arches(r, [bg, a, b, c, ink]) {
    const colours = [a, b, c, ink], cx = r() < .5 ? 100 : 55 + r() * 90, w = 15 + r() * 7;
    let s = `<rect width="200" height="200" fill="${bg}"/><circle cx="${f(200 - cx)}" cy="${f(38 + r() * 20)}" r="${f(9 + r() * 8)}" fill="${c}"/>`;
    for (let i = 4; i >= 0; i--) { const rad = 14 + (i + 1) * w; s += `<path d="M${f(cx - rad)} 200 A${f(rad)} ${f(rad)} 0 0 1 ${f(cx + rad)} 200 Z" fill="${i ? colours[i % 4] : bg}"/>`; }
    return s;
  }, true],
  [function peaks(r, [bg, a, b, c, ink]) {
    let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${ink}" stop-opacity=".85"/></linearGradient></defs>
      <rect width="200" height="200" fill="url(#sky)"/><circle cx="${f(45 + r() * 110)}" cy="${f(52 + r() * 26)}" r="${f(15 + r() * 12)}" fill="${c}"/>`;
    [a, c, bg].forEach((fill, layer) => {
      const base = 118 + layer * 26;
      let d = `M0 200 L0 ${f(base - r() * 20)}`, x = 0, up = true;
      while (x < 200) { x = Math.min(200, x + 18 + r() * 30); d += ` L${f(x)} ${f(base - (up ? 22 + r() * 48 : r() * 14) * (1 - layer * .22))}`; up = !up; }
      s += `<path d="${d} L200 200 Z" fill="${fill}"/>`;
    });
    return s;
  }, true],
  [function stripes(r, [bg, a, b, c]) {
    const angle = [45, -45, 30, -60][Math.floor(r() * 4)], gap = 8 + r() * 7, rad = 50 + r() * 22, cx = 70 + r() * 60, cy = 70 + r() * 60;
    return `<defs><pattern id="p" width="${f(gap)}" height="${f(gap)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><rect width="${f(gap / 2)}" height="${f(gap)}" fill="${a}"/></pattern>
      <pattern id="p2" width="${f(gap)}" height="${f(gap)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${-angle})"><rect width="${f(gap / 2)}" height="${f(gap)}" fill="${c}"/></pattern>
      <clipPath id="o"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}"/></clipPath></defs>
      <rect width="200" height="200" fill="${bg}"/><rect width="200" height="200" fill="url(#p)" opacity=".45"/>
      <g clip-path="url(#o)"><rect width="200" height="200" fill="${b}"/><rect width="200" height="200" fill="url(#p2)"/></g>`;
  }, false],
  [function orbit(r, [bg, a, b, c, ink]) {
    const cx = 80 + r() * 40, cy = 85 + r() * 30, rad = 40 + r() * 22, tilt = -30 + r() * 60, t = r() * Math.PI * 2;
    let s = `<defs><radialGradient id="g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></radialGradient></defs><rect width="200" height="200" fill="${bg}"/>`;
    for (let i = 0; i < 26; i++) s += `<circle cx="${f(r() * 200)}" cy="${f(r() * 200)}" r="${f(.4 + r() * 1.1)}" fill="${ink}" opacity="${f(.3 + r() * .5)}"/>`;
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="url(#g)"/><ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rad * 1.7)}" ry="${f(rad * .45)}" transform="rotate(${f(tilt)} ${f(cx)} ${f(cy)})" fill="none" stroke="${ink}" stroke-width="1.4" opacity=".7"/>`;
    const mx = cx + Math.cos(t) * rad * 1.7, my = cy + Math.sin(t) * rad * .45;
    return s + `<circle cx="${f(mx)}" cy="${f(my)}" r="${f(6 + r() * 6)}" fill="${c}" transform="rotate(${f(tilt)} ${f(cx)} ${f(cy)})"/>`;
  }, true],
  [function letter(r, [bg, a, b, c], title) {
    const word = title.split(/\s+/).find(w => /[A-Za-z0-9]/.test(w)) ?? title, glyph = xml(([...word.replace(/^[^A-Za-z0-9]+/, '')][0] ?? '♪').toUpperCase());
    return `<rect width="200" height="200" fill="${bg}"/><rect x="0" y="${f(112 + r() * 40)}" width="200" height="200" fill="${b}"/>
      <circle cx="${f(140 + r() * 30)}" cy="${f(40 + r() * 30)}" r="${f(12 + r() * 10)}" fill="${c}"/>
      <text x="${f(4 + r() * 22)}" y="${f(170 + r() * 14)}" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="${f(180 + r() * 40)}" fill="${a}">${glyph}</text>`;
  }, false],
  [function haze(r, [bg, a, b, c, ink]) {
    const spot = (id, colour) => `<radialGradient id="${id}"><stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`;
    const cx = 60 + r() * 80, cy = 70 + r() * 60, horizon = 130 + r() * 40;
    return `<defs>${spot('h1', a)}${spot('h2', b)}${spot('h3', c)}</defs><rect width="200" height="200" fill="${bg}"/>
      <circle cx="${f(r() * 200)}" cy="${f(r() * 200)}" r="${f(90 + r() * 50)}" fill="url(#h1)"/>
      <circle cx="${f(r() * 200)}" cy="${f(r() * 200)}" r="${f(80 + r() * 50)}" fill="url(#h2)"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(60 + r() * 40)}" fill="url(#h3)" opacity=".9"/>
      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(28 + r() * 16)}" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".55"/>
      <rect x="0" y="${f(horizon)}" width="200" height="1.2" fill="${ink}" opacity=".45"/>`;
  }, true]
];

// Film grain and a soft sheen make flat shapes feel like printed sleeves.
const FINISH = `<defs><filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .7 0"/></filter>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></linearGradient></defs>
  <rect width="200" height="200" filter="url(#grain)" opacity=".16"/><rect width="200" height="200" fill="url(#sheen)"/>`;
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${body}${FINISH}</svg>`;

function cover(key, title, artist) {
  const seed = hash(key), r = seeded(seed), palette = PALETTES[seed % PALETTES.length];
  const [draw, typeFits] = STYLES[Math.floor(r() * STYLES.length)];
  let body = draw(r, palette, title);
  if (typeFits && r() < .7) {
    const ink = palette[4];
    body += `<text x="14" y="24" font-family="'Helvetica Neue', Arial, sans-serif" font-size="8.5" font-weight="700" letter-spacing="1.8" fill="${ink}" opacity=".9">${xml(artist.toUpperCase().slice(0, 28))}</text>
      <text x="14" y="37" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="11" fill="${ink}" opacity=".85">${xml(title.slice(0, 30))}</text>`;
  }
  return svg(body);
}

function portrait(key) {
  const seed = hash(key), r = seeded(seed), [bg, a, b, c, ink] = PALETTES[(seed >>> 4) % PALETTES.length];
  const spot = (id, colour) => `<radialGradient id="${id}"><stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`;
  const cx = 70 + r() * 60, cy = 60 + r() * 50;
  return svg(`<defs>${spot('p1', a)}${spot('p2', b)}${spot('p3', c)}<radialGradient id="v" cx=".5" cy=".45" r=".7"><stop offset=".55" stop-color="${bg}" stop-opacity="0"/><stop offset="1" stop-color="${bg}" stop-opacity=".75"/></radialGradient></defs>
    <rect width="200" height="200" fill="${bg}"/><circle cx="${f(40 + r() * 120)}" cy="${f(130 + r() * 60)}" r="${f(110 + r() * 30)}" fill="url(#p1)"/>
    <circle cx="${f(r() * 200)}" cy="${f(r() * 100)}" r="${f(90 + r() * 40)}" fill="url(#p2)"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(48 + r() * 20)}" fill="url(#p3)"/>
    <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(26 + r() * 14)}" fill="none" stroke="${ink}" stroke-opacity=".22" stroke-width="1.2"/><rect width="200" height="200" fill="url(#v)"/>`);
}

const cache = new Map();
const keyOf = (kind, item) => kind === 'artist' ? `artist\u0000${item.name}` : `${item.artist ?? ''}\u0000${kind === 'track' ? item.album || item.name : item.name}`;

export function coverURI(kind, item) {
  const key = keyOf(kind, item);
  let uri = cache.get(key);
  if (!uri) {
    const title = kind === 'track' ? item.album || item.name : item.name;
    uri = `data:image/svg+xml,${encodeURIComponent(kind === 'artist' ? portrait(key) : cover(key, title, item.artist ?? ''))}`;
    if (cache.size > 3000) cache.clear();
    cache.set(key, uri);
  }
  return uri;
}


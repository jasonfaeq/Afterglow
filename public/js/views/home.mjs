import { state } from '../state.mjs';
import { DEMO_CATALOG } from '../core.mjs';
import { $, escape, number, plural, formatDate } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { coverURI } from '../lib/covers.mjs';

// Every album in the sample library, with its opening track.
const ALBUMS = DEMO_CATALOG.flatMap(entry => entry.albums.map(([name, tracks]) => ({ name, artist: entry.artist, track: tracks[0] })));
const album = name => ALBUMS.find(a => a.name === name);
const cover = item => `<img src="${coverURI('album', item)}" alt="" decoding="async">`;

function heroArt() {
  const stack = ['Glass Garden', 'Night Swim', 'Polaroid Summer', 'Low Tide Radio'].map(album), playing = album('Low Tide Radio');
  return `<div class="hero-sun"></div>
    <div class="cover-stack">${stack.map((item, i) => `<figure class="stack-cover s${i + 1}">${cover(item)}</figure>`).join('')}</div>
    <div class="glass now-playing">
      <div class="np-art">${cover(playing)}</div>
      <div class="np-text"><span>Now playing</span><strong>${escape(playing.track)}</strong><em>${escape(playing.artist)}</em></div>
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <div class="np-progress"><span></span></div>
    </div>
    <div class="glass hero-chip chip-a" id="chip-a"></div>
    <div class="glass hero-chip chip-b" id="chip-b"></div>`;
}

// Two rows of sleeves drifting in opposite directions. Each row is doubled so the loop is seamless.
function marquee() {
  const row = (list, reverse) => `<div class="marquee-row${reverse ? ' reverse' : ''}"><div class="marquee-track">${[...list, ...list].map(item => `<figure class="marquee-cover">${cover(item)}<figcaption><strong>${escape(item.name)}</strong><span>${escape(item.artist)}</span></figcaption></figure>`).join('')}</div></div>`;
  const half = Math.ceil(ALBUMS.length / 2);
  return row(ALBUMS.slice(0, half), false) + row(ALBUMS.slice(half).reverse(), true);
}

export function renderHome() {
  if (!$('#hero-art').childElementCount) { $('#hero-art').innerHTML = heroArt(); $('#marquee').innerHTML = marquee(); }
  const t = state.teaser, lib = state.library;
  $('#chip-a').innerHTML = t ? `${icon('clock')}<div><strong>${number(t.hours)} hours</strong><span>of music since ${formatDate(t.since, { month: 'short', year: 'numeric' })}</span></div>` : '';
  $('#chip-b').innerHTML = t ? `${icon('flame')}<div><strong>${plural(t.streak, 'day')} in a row</strong><span>longest listening streak</span></div>` : '';
  $('#chip-a').hidden = $('#chip-b').hidden = !t;
  // Coming back with a saved library: offer it first.
  const back = $('#welcome-back');
  back.hidden = !lib;
  if (lib) back.innerHTML = `<span class="wb-icon">${icon('headphones')}</span><div><strong>Welcome back.</strong><span>Your library: ${plural(lib.plays, 'play')}${lib.from ? `, ${formatDate(lib.from, { month: 'short', year: 'numeric' })} to ${formatDate(lib.to, { month: 'short', year: 'numeric' })}` : ''}</span></div><a class="btn btn-soft btn-sm" href="#/overview">Open your library ${icon('arrow')}</a>`;
  const primary = $('#nav-primary');
  primary.href = lib ? '#/overview' : '#/demo/overview';
  primary.textContent = lib ? 'Open your library' : 'Try the demo';
}

import { viewHref } from '../state.mjs';
import { escape, number, decimal, hours, duration, plural, formatDate, DAY } from '../lib/format.mjs';
import { icon } from '../lib/icons.mjs';
import { art, artistLink, trackLink } from '../ui/components.mjs';

// Shown right after an import: what came in, and the first few things worth knowing.
export function welcomeView(summary, info) {
  const span = summary.start ? Math.max(.1, (summary.end - summary.start) / (365.25 * DAY)) : 0;
  const added = [`${plural(info.imported, 'new play')} added`];
  if (info.duplicates) added.push(`${number(info.duplicates)} duplicates skipped`);
  if (info.enriched) added.push(`${number(info.enriched)} older plays gained skip &amp; shuffle details`);
  if (info.ignored) added.push(`${number(info.ignored)} podcasts or broken entries left out`);
  const long = { month: 'long', day: 'numeric', year: 'numeric' };
  const tops = [
    summary.topArtist && `<div class="welcome-top">${art('artist', summary.topArtist, 'md')}<div><span>Your all-time #1 artist</span>${artistLink(summary.topArtist.name, 'link-name welcome-name')}<em>${duration(summary.topArtist.ms)}</em></div></div>`,
    summary.topTrack && `<div class="welcome-top">${art('track', summary.topTrack, 'md')}<div><span>Your most-played track</span>${trackLink(summary.topTrack.name, summary.topTrack.artist, 'link-name welcome-name')}<em>${escape(summary.topTrack.artist)} · ${plural(summary.topTrack.plays, 'play')}</em></div></div>`
  ].filter(Boolean).join('');
  return `<header class="dialog-head"><span class="eyebrow">Your library is ready</span><button class="icon-btn close-dialog" aria-label="Close">${icon('close')}</button></header>
    <h2 class="dialog-title" id="welcome-title">Welcome to <em>your afterglow.</em></h2>
    <p class="dialog-intro">${added.join(', ')}. ${info.persisted ? 'Saved privately in this browser.' : '<strong>Browser storage is unavailable, so this library only lasts for this visit.</strong>'}</p>
    <div class="welcome-stats"><div><strong>${number(hours(summary.ms))}</strong><span>hours of music</span></div><div><strong>${number(summary.artistCount)}</strong><span>artists</span></div><div><strong>${number(summary.trackCount)}</strong><span>tracks</span></div><div><strong>${decimal(span)}</strong><span>years of history</span></div></div>
    ${summary.start ? `<p class="welcome-range">${formatDate(summary.start, long)} <span>→</span> ${formatDate(summary.end, long)}</p>` : ''}
    <div class="welcome-tops">${tops}</div>
    <p class="dialog-note">${summary.behaviour ? `${icon('sparkle')}<span>Skip, shuffle and playback details found. <strong>Habits</strong> shows how you really listen.</span>` : `${icon('compass')}<span>This looks like the shorter account data export. Ask Spotify for <strong>Extended streaming history</strong> to get skips, shuffle and albums too.</span>`}</p>
    <div class="welcome-actions"><button class="btn btn-primary close-dialog">Explore your overview</button>${summary.years > 1 ? `<a class="btn btn-soft" href="${viewHref('years')}">See year by year</a>` : ''}<button class="link import-trigger">Add more files ${icon('arrow')}</button></div>`;
}

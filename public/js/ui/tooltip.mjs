import { $ } from '../lib/format.mjs';

// One shared tooltip for every [data-tip] element. The first line of a tip is styled as its title.
export function installTooltip() {
  const tooltip = $('#tooltip');
  const hide = () => { tooltip.hidden = true; };
  function show(el) {
    const host = el.closest('dialog') ?? document.body;
    if (tooltip.parentElement !== host) host.append(tooltip);
    tooltip.textContent = el.dataset.tip; tooltip.hidden = false;
    // Measure at full width first, or the viewport edge squeezes it before we clamp.
    tooltip.style.left = '0px'; tooltip.style.top = '0px';
    const anchor = el.querySelector?.('.dot') ?? el, box = anchor.getBoundingClientRect();
    const width = tooltip.offsetWidth, height = tooltip.offsetHeight, edge = document.documentElement.clientWidth;
    let top = box.top - height - 10;
    if (top < 8) top = box.bottom + 10;
    tooltip.style.left = `${Math.max(8, Math.min(edge - width - 8, box.left + box.width / 2 - width / 2))}px`;
    tooltip.style.top = `${top}px`;
  }
  const target = event => event.target.closest?.('[data-tip]');
  document.addEventListener('pointerover', event => { const el = target(event); if (el) show(el); else hide(); });
  document.addEventListener('focusin', event => { const el = target(event); if (el) show(el); else hide(); });
  document.addEventListener('focusout', hide);
  addEventListener('scroll', hide, { passive: true, capture: true });
  document.addEventListener('close', () => { hide(); document.body.append(tooltip); }, true);
}

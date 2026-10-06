// Built-in ornaments (plain SVG, drawn in code). A theme may also give its own inline SVG.

/** The P02 herb sprig, ported from book.py sprig_svg(). */
export function sprigSvg(colour: string, width: number, stroke = 2.2): string {
  const leaves: string[] = [];
  const spots: [number, number, number][] = [
    [50, 78, 1.0],
    [52, 60, 0.92],
    [55, 43, 0.82],
    [59, 28, 0.7],
  ];
  spots.forEach(([x, y, s], k) => {
    for (const side of [-1, 1]) {
      const ang = side * (48 - k * 4);
      const cx = (x + side * 9 * s).toFixed(1);
      const cy = (y - 4 * s).toFixed(1);
      leaves.push(
        `<ellipse cx="${cx}" cy="${cy}" rx="${(10 * s).toFixed(1)}" ry="${(4.6 * s).toFixed(1)}" transform="rotate(${ang} ${cx} ${cy})" fill="none" stroke="${colour}" stroke-width="${(stroke * 0.8).toFixed(2)}"/>`,
      );
    }
  });
  const top = `<ellipse cx="62" cy="15" rx="4" ry="7" transform="rotate(18 62 15)" fill="none" stroke="${colour}" stroke-width="${(stroke * 0.8).toFixed(2)}"/>`;
  const stem = `<path d="M48 98 C 50 70, 54 45, 62 20" fill="none" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round"/>`;
  const h = ((width * 100) / 110).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 100" width="${width}" height="${h}" aria-hidden="true">${stem}${leaves.join('')}${top}</svg>`;
}

function diamondSvg(colour: string, width: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 20" width="${width}" height="${(width / 6).toFixed(1)}" aria-hidden="true"><line x1="0" y1="10" x2="48" y2="10" stroke="${colour}" stroke-width="1.4"/><path d="M60 2 L68 10 L60 18 L52 10 Z" fill="${colour}"/><line x1="72" y1="10" x2="120" y2="10" stroke="${colour}" stroke-width="1.4"/></svg>`;
}

function asteriskSvg(colour: string, width: number): string {
  const star = (cx: number, cy: number) =>
    [0, 60, 120]
      .map((a) => `<line x1="${cx}" y1="${cy - 6}" x2="${cx}" y2="${cy + 6}" stroke="${colour}" stroke-width="1.6" transform="rotate(${a} ${cx} ${cy})"/>`)
      .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 44" width="${width}" height="${((width * 44) / 60).toFixed(1)}" aria-hidden="true">${star(30, 10)}${star(14, 32)}${star(46, 32)}</svg>`;
}

function fleuronSvg(colour: string, width: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="${width}" height="${(width * 0.4).toFixed(1)}" aria-hidden="true"><path d="M50 20 C 40 4, 18 4, 10 20 C 18 36, 40 36, 50 20 C 60 4, 82 4, 90 20 C 82 36, 60 36, 50 20 Z" fill="none" stroke="${colour}" stroke-width="2"/><circle cx="50" cy="20" r="3.4" fill="${colour}"/></svg>`;
}

function waveSvg(colour: string, width: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 24" width="${width}" height="${(width / 5).toFixed(1)}" aria-hidden="true"><path d="M2 12 C 12 2, 22 2, 32 12 S 52 22, 62 12 S 82 2, 92 12 S 112 22, 118 12" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function starRuleSvg(colour: string, width: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 20" width="${width}" height="${(width / 6).toFixed(1)}" aria-hidden="true"><line x1="0" y1="10" x2="46" y2="10" stroke="${colour}" stroke-width="1.2"/><path d="M60 1 L62.6 7.4 L69.5 7.6 L64 11.8 L66 18.5 L60 14.5 L54 18.5 L56 11.8 L50.5 7.6 L57.4 7.4 Z" fill="${colour}"/><line x1="74" y1="10" x2="120" y2="10" stroke="${colour}" stroke-width="1.2"/></svg>`;
}

function heartLineSvg(colour: string, width: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 20" width="${width}" height="${(width / 6).toFixed(1)}" aria-hidden="true"><line x1="0" y1="10" x2="48" y2="10" stroke="${colour}" stroke-width="1"/><path d="M60 17 C 50 10, 52 3, 57 3 C 59 3, 60 5, 60 6 C 60 5, 61 3, 63 3 C 68 3, 70 10, 60 17 Z" fill="${colour}"/><line x1="72" y1="10" x2="120" y2="10" stroke="${colour}" stroke-width="1"/></svg>`;
}

function dotSvg(colour: string, width: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 12" width="${width * 0.6}" height="${(width * 0.12).toFixed(1)}" aria-hidden="true"><circle cx="12" cy="6" r="2.4" fill="${colour}"/><circle cx="30" cy="6" r="3.2" fill="${colour}"/><circle cx="48" cy="6" r="2.4" fill="${colour}"/></svg>`;
}

function lineSvg(colour: string, width: number, weight = 1.4): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 8" width="${width}" height="${(width / 15).toFixed(1)}" aria-hidden="true"><rect x="0" y="${4 - weight / 2}" width="120" height="${weight}" fill="${colour}"/></svg>`;
}

function gridSvg(colour: string, width: number): string {
  const lines: string[] = [];
  for (let k = 0; k <= 6; k++) lines.push(`<line x1="${k * 10}" y1="0" x2="${k * 10}" y2="30" stroke="${colour}" stroke-width="0.8"/>`);
  for (let k = 0; k <= 3; k++) lines.push(`<line x1="0" y1="${k * 10}" x2="60" y2="${k * 10}" stroke="${colour}" stroke-width="0.8"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 62 32" width="${width}" height="${(width / 2).toFixed(1)}" aria-hidden="true">${lines.join('')}</svg>`;
}

/** Names a theme or cover style may use. Unknown names draw nothing. */
export const ORNAMENT_NAMES = [
  'sprig',
  'herb',
  'botanical',
  'diamond',
  'asterism',
  'stars',
  'stars-moon',
  'fleuron',
  'leaf',
  'floral-heart',
  'wave',
  'waves',
  'star-rule',
  'heart-line',
  'dot',
  'line',
  'rule',
  'bar',
  'grid',
  'circuit-grid',
] as const;

/** Ornament markup for a theme value: a built-in name, an inline <svg>, or nothing. */
export function ornamentSvg(name: string, colour: string, width: number): string {
  const n = name.trim();
  if (n.startsWith('<svg')) return n;
  switch (n.toLowerCase()) {
    case 'sprig':
    case 'herb':
    case 'botanical':
      return sprigSvg(colour, width, 2.6);
    case 'wave':
    case 'waves':
      return waveSvg(colour, width * 1.6);
    case 'star-rule':
      return starRuleSvg(colour, width * 1.8);
    case 'heart-line':
      return heartLineSvg(colour, width * 1.8);
    case 'dot':
      return dotSvg(colour, width * 1.4);
    case 'line':
    case 'rule':
      return lineSvg(colour, width * 1.4);
    case 'bar':
      return lineSvg(colour, width * 1.2, 5);
    case 'grid':
    case 'circuit-grid':
      return gridSvg(colour, width * 1.2);
    case 'diamond':
      return diamondSvg(colour, width * 1.6);
    case 'asterism':
    case 'stars':
    case 'stars-moon':
      return asteriskSvg(colour, width * 0.7);
    case 'fleuron':
    case 'leaf':
    case 'floral-heart':
      return fleuronSvg(colour, width * 1.2);
    default:
      return '';
  }
}

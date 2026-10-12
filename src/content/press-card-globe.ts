/**
 * The press card's background mark: a wireframe globe with orbit rings, drawn
 * here so it prints as crisp vector lines at any size. Plain shapes only — no
 * <use>, clip paths or gradients, which the PDF renderer can't resolve.
 */
const R = 40; // sphere radius
const LINE = '#aeb3bd';
const f = (n: number) => n.toFixed(2);

/** Meridians: ellipses of shrinking width, i.e. lines of longitude seen from the side. */
const meridians = [0.2, 0.48, 0.72, 0.9]
  .map((k) => `<ellipse rx="${f(R * k)}" ry="${R}"/>`)
  .join('');

/** Parallels: horizontal ellipses at each latitude, flattened for perspective. */
const parallels = [-30, -15, 0, 15, 30]
  .map((y) => {
    const rx = Math.sqrt(R * R - y * y);
    return `<ellipse cy="${y}" rx="${f(rx)}" ry="${f(rx * 0.16)}"/>`;
  })
  .join('');

interface Orbit {
  rx: number;
  ry: number;
  tilt: number;
  dashed?: boolean;
  /** Where the dots sit, as angles around the orbit (degrees). */
  dots: number[];
}
const ORBITS: Orbit[] = [
  { rx: 62, ry: 17, tilt: -18, dashed: true, dots: [200, 335] },
  { rx: 55, ry: 13, tilt: 32, dots: [25, 160, 250] },
  { rx: 50, ry: 21, tilt: 78, dashed: true, dots: [110, 300] },
];

const point = (o: Orbit, deg: number) => {
  const t = (deg * Math.PI) / 180;
  const a = (o.tilt * Math.PI) / 180;
  const x = o.rx * Math.cos(t);
  const y = o.ry * Math.sin(t);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as const;
};

const orbits = ORBITS.map(
  (o) =>
    `<ellipse rx="${o.rx}" ry="${o.ry}" transform="rotate(${o.tilt})"${o.dashed ? ' stroke-dasharray="2.4 2"' : ''}/>`,
).join('');

const dots = ORBITS.flatMap((o) =>
  o.dots.map((d, i) => {
    const [x, y] = point(o, d);
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${i === 0 ? 2.1 : 1.5}"/>`;
  }),
).join('');

export const globe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-70 -70 140 140" aria-hidden="true">
<circle r="${R}" fill="#f2f3f5" stroke="${LINE}" stroke-width="0.9"/>
<g fill="none" stroke="${LINE}" stroke-width="0.45" transform="rotate(-20)">${meridians}${parallels}</g>
<g fill="none" stroke="${LINE}" stroke-width="0.6">${orbits}</g>
<g fill="#ffffff" stroke="${LINE}" stroke-width="0.6">${dots}</g>
</svg>`;

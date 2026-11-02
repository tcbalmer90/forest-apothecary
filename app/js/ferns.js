// Fine-line ferns and two tiny mushrooms for the bottom edge of Today's pages.
// Pure decoration, hidden from screen readers.

// A fern: a gently curved stem with leaflets that shrink towards the tip
function fern(baseX, height, lean) {
  const tipX = baseX + lean;
  const tipY = 70 - height;
  const ctrlX = baseX + lean * 0.2;
  const ctrlY = 70 - height * 0.6;
  const at = (t) => ({
    x: (1 - t) ** 2 * baseX + 2 * (1 - t) * t * ctrlX + t ** 2 * tipX,
    y: (1 - t) ** 2 * 70 + 2 * (1 - t) * t * ctrlY + t ** 2 * tipY,
  });
  let d = `M${baseX} 70Q${ctrlX} ${ctrlY} ${tipX} ${tipY}`;
  for (let i = 1; i <= 9; i += 1) {
    const t = 0.12 + i * 0.09;
    const p = at(t);
    const len = 13 * (1 - t) + 3;
    d += `M${p.x.toFixed(1)} ${p.y.toFixed(1)}q${(-len * 0.6).toFixed(1)} ${(-len * 0.15).toFixed(1)} ${(-len).toFixed(1)} ${(-len * 0.55).toFixed(1)}`;
    d += `M${p.x.toFixed(1)} ${p.y.toFixed(1)}q${(len * 0.6).toFixed(1)} ${(-len * 0.15).toFixed(1)} ${len.toFixed(1)} ${(-len * 0.55).toFixed(1)}`;
  }
  return `<path d="${d}"/>`;
}

function mushroom(x, size) {
  const w = size;
  const h = size * 0.55;
  return `
    <g transform="translate(${x} ${70 - size * 0.9})">
      <rect x="${w * 0.38}" y="${h * 0.7}" width="${w * 0.24}" height="${size * 0.9 - h * 0.7}" rx="1.5" fill="#E9DFC7" opacity="0.8"/>
      <path d="M0 ${h}Q${w / 2} ${-h * 0.9} ${w} ${h}Z" fill="#9C4A3A"/>
      <circle cx="${w * 0.32}" cy="${h * 0.55}" r="1.3" fill="#E9DFC7"/>
      <circle cx="${w * 0.62}" cy="${h * 0.35}" r="1.1" fill="#E9DFC7"/>
    </g>`;
}

export function fernsSVG() {
  return `
    <svg class="ferns" viewBox="0 0 340 70" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g fill="none" stroke="#7E8F5E" stroke-width="1" stroke-linecap="round" opacity="0.75">
        ${fern(18, 58, 16)}${fern(40, 40, -8)}${fern(300, 52, -14)}${fern(322, 36, 8)}
      </g>
      ${mushroom(262, 18)}${mushroom(282, 12)}
    </svg>`;
}

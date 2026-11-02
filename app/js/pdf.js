// A small PDF writer: text, wrapping, lines and bars on A4 pages.
// Uses the fonts built into every PDF reader (Helvetica and Times), so no font files
// are needed and it works offline.

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;

// Helvetica letter widths (per 1000), from the standard font metrics, for wrapping
const WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611,
  722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278,
  556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

// Characters outside plain ASCII, as the PDF's WinAnsi codes
const SPECIAL = { '•': 0x95, '½': 0xBD, '–': 0x96, '—': 0x97, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '·': 0xB7, '…': 0x85, 'é': 0xE9 };
const SPECIAL_W = { 0x95: 350, 0xBD: 834, 0x96: 556, 0x97: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0xB7: 278, 0x85: 1000, 0xE9: 556 };

function toCodes(text) {
  return [...String(text)].map((c) => {
    const code = c.charCodeAt(0);
    if (code >= 32 && code < 127) return code;
    return SPECIAL[c] ?? 63; // "?" for anything else
  });
}

function widthOf(text, size, bold) {
  const w = toCodes(text).reduce((sum, c) => sum + (c < 127 ? WIDTHS[c - 32] : SPECIAL_W[c] || 556), 0);
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

function pdfString(text) {
  return `(${toCodes(text).map((c) => {
    if (c === 40 || c === 41 || c === 92) return `\\${String.fromCharCode(c)}`;
    return String.fromCharCode(c);
  }).join('')})`;
}

const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');

export class PdfDoc {
  constructor() {
    this.pages = [];
    this.newPage();
  }

  newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = PAGE_H - MARGIN;
  }

  room(height) {
    if (this.y - height < MARGIN) this.newPage();
  }

  // font: 'sans' | 'bold' | 'serif'
  write(text, { size = 10.5, font = 'sans', colour = '#222222', x = MARGIN, gapAfter = 4, width = PAGE_W - MARGIN * 2 } = {}) {
    const fontKey = { sans: 'F1', bold: 'F2', serif: 'F3' }[font];
    const lineH = size * 1.35;
    for (const para of String(text).split('\n')) {
      const lines = [];
      let line = '';
      for (const word of para.split(' ')) {
        const tryLine = line ? `${line} ${word}` : word;
        if (line && widthOf(tryLine, size, font === 'bold') > width) { lines.push(line); line = word; } else line = tryLine;
      }
      lines.push(line);
      for (const l of lines) {
        this.room(lineH);
        this.y -= lineH;
        this.ops.push(`BT /${fontKey} ${size} Tf ${rgb(colour)} rg ${x} ${this.y.toFixed(1)} Td ${pdfString(l)} Tj ET`);
      }
    }
    this.y -= gapAfter;
  }

  rule(colour = '#BBBBBB') {
    this.room(8);
    this.y -= 4;
    this.ops.push(`${rgb(colour)} RG 0.6 w ${MARGIN} ${this.y} m ${PAGE_W - MARGIN} ${this.y} l S`);
    this.y -= 6;
  }

  // Simple bars on a fixed scale: data [{ label, value }]
  bars(data, { max = 10, height = 90, colour = '#B5873F' } = {}) {
    this.room(height + 30);
    const left = MARGIN + 22;
    const width = PAGE_W - MARGIN - left;
    const base = this.y - height;
    const slot = width / data.length;
    const ops = [`0.75 0.75 0.75 RG 0.5 w ${left} ${base} m ${left + width} ${base} l S`];
    for (const t of [0, max / 2, max]) {
      const ty = base + (t / max) * height;
      ops.push(`BT /F1 7.5 Tf 0.4 0.4 0.4 rg ${MARGIN} ${(ty - 2.5).toFixed(1)} Td ${pdfString(String(t))} Tj ET`);
      if (t) ops.push(`0.88 0.88 0.88 RG 0.4 w ${left} ${ty} m ${left + width} ${ty} l S`);
    }
    data.forEach((d, i) => {
      const x = left + slot * i + slot * 0.2;
      if (d.value != null) {
        const h = (d.value / max) * height;
        ops.push(`${rgb(colour)} rg ${x.toFixed(1)} ${base} ${(slot * 0.6).toFixed(1)} ${h.toFixed(1)} re f`);
        ops.push(`BT /F1 8 Tf 0.2 0.2 0.2 rg ${(x + slot * 0.3 - widthOf(String(d.value), 8) / 2).toFixed(1)} ${(base + h + 3).toFixed(1)} Td ${pdfString(String(d.value))} Tj ET`);
      }
      ops.push(`BT /F1 7.5 Tf 0.4 0.4 0.4 rg ${(x + slot * 0.3 - widthOf(d.label, 7.5) / 2).toFixed(1)} ${(base - 11).toFixed(1)} Td ${pdfString(d.label)} Tj ET`);
    });
    this.ops.push(...ops);
    this.y = base - 22;
  }

  // The finished file, as bytes
  toBytes() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    const catalog = add(null);
    const pagesId = add(null);
    const fonts = [
      add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
      add('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>'),
    ];
    const resources = `<< /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >>`;
    const pageIds = this.pages.map((ops, i) => {
      const footer = `BT /F1 8 Tf 0.5 0.5 0.5 rg ${PAGE_W - MARGIN - 40} 28 Td ${pdfString(`Page ${i + 1} of ${this.pages.length}`)} Tj ET`;
      const stream = [...ops, footer].join('\n');
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      return add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${content} 0 R >>`);
    });
    objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    // Every character here is a single byte (0 to 255)
    return Uint8Array.from(out, (c) => c.charCodeAt(0));
  }
}

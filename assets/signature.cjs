// Gera a assinatura "Arial" em SVG (contornos, sem depender de fonte instalada).
// Fonte: Alex Brush (SIL Open Font License). Uso: node assets/signature.cjs
const opentype = require('opentype.js');
const fs = require('fs');
const buf = fs.readFileSync(require.resolve('@fontsource/alex-brush/files/alex-brush-latin-400-normal.woff'));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const size = 200, scale = size / font.unitsPerEm;
const p = new opentype.Path(); let x = 0;
const glyphs = [...'Arial'].map((c) => font.charToGlyph(c));
glyphs.forEach((g, i) => { p.extend(g.getPath(x, 0, size)); x += g.advanceWidth * scale; if (glyphs[i + 1]) x += font.getKerningValue(g, glyphs[i + 1]) * scale; });
const bb = p.getBoundingBox();
const w = bb.x2 - bb.x1;
// Traço do sublinhado: forma afinada nas pontas (como caneta)
const x0 = bb.x1 + w * 0.02, y0 = bb.y2 + 22;
const x1 = bb.x2 + w * 0.08, y1 = bb.y2 - 28;
const t = 7; // espessura no meio
const c1 = [x0 + w * 0.38, y0 + 14], c2 = [x1 - w * 0.3, y0 + 8];
const swoosh = `M ${x0} ${y0} C ${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x1} ${y1} C ${c2[0]} ${c2[1] + t} ${c1[0]} ${c1[1] + t} ${x0} ${y0} Z`;
const pad = 18;
const vx = bb.x1 - pad, vy = bb.y1 - pad, vw = (x1 - bb.x1) + pad * 2, vh = (y0 + 40 - bb.y1) + pad * 2;
const body = `<path d="${p.toPathData(2)}"/><path d="${swoosh}"/>`;
const svg = (fill, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}">${defs}<g transform="rotate(-5 ${(bb.x1 + w / 2).toFixed(1)} ${((bb.y1 + bb.y2) / 2).toFixed(1)})" fill="${fill}">${body}</g></svg>`;
const gold = `<defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".45" stop-color="#fbd25a"/><stop offset="1" stop-color="#e3930f"/></linearGradient></defs>`;
const out = (f) => require('path').join(__dirname, f);
fs.writeFileSync(out('signature-gold.svg'), svg('url(#sg)', gold));
fs.writeFileSync(out('signature-white.svg'), svg('#fff8e7'));
fs.copyFileSync(out('signature-gold.svg'), require('path').join(__dirname, '..', 'public', 'signature.svg'));
console.log('viewBox', vx, vy, vw, vh);

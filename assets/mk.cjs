// Gera ícone, splash e arte da Google Play a partir de public/icon.svg + assinatura "Arial".
// Rode antes: node assets/signature.cjs   Depois: npm run icons
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const icon = fs.readFileSync(path.join(__dirname, '..', 'public', 'icon.svg'), 'utf8');
const defs = icon.match(/<defs>[\s\S]*?<\/defs>/)[0];
// cena (gol + bola), sem o fundo arredondado
const scene = icon
  .replace(/^[\s\S]*?<\/defs>/, '')
  .replace(/<rect width="512" height="512"[^>]*\/>/, '')
  .replace(/<\/svg>\s*$/, '');

const sig = fs.readFileSync(path.join(__dirname, 'signature-white.svg'), 'utf8').trim();
const sigVB = sig.match(/viewBox="([^"]+)"/)[1];
const sigBody = sig.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const [, , vw, vh] = sigVB.split(' ').map(Number);
const gold = fs.readFileSync(path.join(__dirname, 'signature-gold.svg'), 'utf8').trim();
const goldBody = gold.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

// Assinatura com sombra suave, largura w, canto superior (x, y)
const signature = (x, y, w, body = sigBody) => {
  const h = (w * vh) / vw;
  const shadow = sigBody.replace(/fill="[^"]*"/, 'fill="rgba(0,0,20,0.45)"');
  return (
    `<svg x="${x + w * 0.012}" y="${y + w * 0.012}" width="${w}" height="${h}" viewBox="${sigVB}">${shadow}</svg>` +
    `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${sigVB}">${body}</svg>`
  );
};

// Gol com a bola um pouco acima e a assinatura embaixo
const logo = `<g transform="translate(512 455) scale(1.5) translate(-256 -270)">${scene}</g>` + signature(392, 820, 240);
const wrap = (inner, size = 1024, vb = '0 0 1024 1024') =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb}">${defs}${inner}</svg>`);
const bg = '<rect width="1024" height="1024" fill="url(#sky)"/>';

(async () => {
  await sharp(wrap(bg + logo)).flatten({ background: '#083a17' }).png().toFile(path.join(__dirname, 'icon-only.png'));
  await sharp(wrap(bg)).png().toFile(path.join(__dirname, 'icon-background.png'));
  // foreground menor para caber na "safe zone" do ícone adaptativo do Android
  await sharp(wrap(`<g transform="translate(512 512) scale(.62) translate(-512 -560)">${logo}</g>`)).png().toFile(path.join(__dirname, 'icon-foreground.png'));
  const splash = wrap(`<rect width="1024" height="1024" fill="#083a17"/><g transform="translate(512 512) scale(.36) translate(-512 -560)">${logo}</g>`, 2732);
  await sharp(splash).png().toFile(path.join(__dirname, 'splash.png'));
  await sharp(splash).png().toFile(path.join(__dirname, 'splash-dark.png'));

  // Arte da Google Play
  const out = path.join(__dirname, '..', 'store', 'graphics');
  fs.mkdirSync(out, { recursive: true });
  await sharp(path.join(__dirname, 'icon-only.png')).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'));
  const fg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">${defs}
    <rect width="1024" height="500" fill="url(#sky)"/>
    <g transform="translate(20 10) scale(0.92)">${scene}</g>
    <text x="470" y="190" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="44" fill="#ffd34f">GOL DE PLACA</text>
    <text x="474" y="245" font-family="DejaVu Sans, Arial, sans-serif" font-size="29" fill="#fff8e7" opacity="0.92">Pênaltis e faltas para craques!</text>
    <text x="474" y="289" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" fill="#fff8e7" opacity="0.75">Batedor ou goleiro · 2 jogadores · Copa · 8 idiomas</text>
    <svg x="840" y="400" width="140" height="${(140 * vh) / vw}" viewBox="${sigVB}">${goldBody}</svg></svg>`;
  await sharp(Buffer.from(fg)).png().toFile(path.join(out, 'feature-graphic-1024x500.png'));
  console.log('ok');
})();


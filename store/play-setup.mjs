// Configura o Gol de Placa na Google Play pela API (com o secret PLAY_SERVICE_ACCOUNT_JSON):
// ficha da loja nos 8 idiomas (textos, ícone, banner e capturas), contato, testadores e versão
// do teste fechado (como rascunho: o app ainda está em configuração) e a compra "Versão completa".
// O que a Google só aceita pela tela (classificação, público-alvo, segurança dos dados, preço…)
// fica para o Play Console.
// Uso: PLAY_JSON=... SHOTS=<pasta com <idioma>/*.jpg> node store/play-setup.mjs
import crypto from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = 'com.arial.goldeplaca';
const TESTERS_FROM = 'com.arial.escondeesconde'; // usa o mesmo grupo de testadores do Esconde
const SHOTS = process.env.SHOTS || join(HERE, 'screenshots', 'play');
// seção do LISTING.md → idioma das capturas → idiomas da Google Play
const SECTIONS = [
  ['Português', 'pt', ['pt-BR']], ['English', 'en', ['en-US']], ['Español', 'es', ['es-ES', 'es-419']],
  ['Deutsch', 'de', ['de-DE']], ['Français', 'fr', ['fr-FR']], ['Italiano', 'it', ['it-IT']],
  ['中文', 'zh', ['zh-CN']], ['日本語', 'ja', ['ja-JP']],
];

// ---------- textos do LISTING.md ----------
const md = readFileSync(join(HERE, 'LISTING.md'), 'utf8');
const blocks = md.split(/^## /m).slice(1);
function listing(head) {
  const b = blocks.find((x) => x.startsWith(head));
  if (!b) throw new Error(`Seção ${head} não achada no LISTING.md`);
  const items = b.split('\n').filter((l) => l.startsWith('- **')).map((l) => l.replace(/^- \*\*[^*]+\*\*\s*/, '').trim());
  const full = b.split(/^\*\*[^*\n]+\*\*\s*$/m)[1].split(/^---$/m)[0].trim();
  const r = { title: items[0], shortDescription: items[2], fullDescription: full };
  for (const [k, max] of [['title', 30], ['shortDescription', 80], ['fullDescription', 4000]]) {
    if ([...r[k]].length > max) throw new Error(`${head} ${k}: ${[...r[k]].length} > ${max}`);
  }
  return r;
}

// ---------- Google ----------
const sa = JSON.parse(process.env.PLAY_JSON);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 })}`;
const jwt = `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), sa.private_key).toString('base64url')}`;
const { access_token: TOKEN } = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
})).json();
const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
async function api(method, url, body, type = 'application/json') {
  const res = await fetch(url, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': type } : {}) },
    body: body && type === 'application/json' ? JSON.stringify(body) : body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url.replace(/.*applications\//, '')} → ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}
const problems = [];
const step = async (name, fn) => {
  try { await fn(); console.log(`✅ ${name}`); } catch (e) { problems.push(name); console.log(`⚠️ ${name}: ${e.message}`); }
};

if (process.env.ONLY !== 'iap') {
// Testadores do Esconde (mesmo grupo)
let testers = null;
await step('Testadores do Esconde lidos', async () => {
  const e = await api('POST', `${BASE}/${TESTERS_FROM}/edits`);
  try { testers = await api('GET', `${BASE}/${TESTERS_FROM}/edits/${e.id}/testers/alpha`); }
  finally { await fetch(`${BASE}/${TESTERS_FROM}/edits/${e.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOKEN}` } }); }
  console.log(`   grupos: ${(testers.googleGroups || []).join(', ') || '(nenhum)'}`);
});

const edit = await api('POST', `${BASE}/${PKG}/edits`);
const E = `${BASE}/${PKG}/edits/${edit.id}`;
const U = `${UPLOAD}/${PKG}/edits/${edit.id}`;

await step('Contato e idioma padrão', () => api('PATCH', `${E}/details`, { defaultLanguage: 'pt-BR', contactEmail: 'arial83gamer@gmail.com', contactWebsite: 'https://arialgamer.github.io/' }));

for (const [head, lang, locales] of SECTIONS) {
  const l = listing(head);
  for (const loc of locales) {
    await step(`Ficha ${loc}: textos`, () => api('PUT', `${E}/listings/${loc}`, { language: loc, ...l }));
    const dir = join(SHOTS, lang);
    if (!existsSync(dir)) { console.log(`   (sem capturas em ${dir})`); continue; }
    await step(`Ficha ${loc}: capturas`, async () => {
      await api('DELETE', `${E}/listings/${loc}/phoneScreenshots`);
      for (const f of readdirSync(dir).filter((x) => /\.(jpe?g|png)$/.test(x)).sort()) {
        await api('POST', `${U}/listings/${loc}/phoneScreenshots?uploadType=media`, readFileSync(join(dir, f)), f.endsWith('.png') ? 'image/png' : 'image/jpeg');
      }
    });
  }
}
for (const [kind, file] of [['icon', 'icon-512.png'], ['featureGraphic', 'feature-graphic-1024x500.png']]) {
  await step(`Imagem ${kind} (pt-BR)`, async () => {
    await api('DELETE', `${E}/listings/pt-BR/${kind}`);
    await api('POST', `${U}/listings/pt-BR/${kind}?uploadType=media`, readFileSync(join(HERE, 'graphics', file)), 'image/png');
  });
}

if (testers?.googleGroups?.length) {
  await step('Testadores do teste fechado (mesmo grupo do Esconde)', () => api('PUT', `${E}/testers/alpha`, { googleGroups: testers.googleGroups }));
}
await step('Versão 1.0.0 no teste fechado (rascunho)', async () => {
  const codes = (await api('GET', `${E}/bundles`)).bundles?.map((b) => b.versionCode) ?? [];
  if (!codes.length) throw new Error('nenhum build enviado ainda');
  const vc = String(Math.max(...codes));
  await api('PUT', `${E}/tracks/alpha`, { track: 'alpha', releases: [{ name: '1.0.0', versionCodes: [vc], status: 'draft', releaseNotes: [{ language: 'pt-BR', text: 'Primeira versão do Gol de Placa: pênaltis e faltas em 3D.' }] }] });
  console.log(`   build ${vc}`);
});

await step('Salvar tudo na Google Play', () => api('POST', `${E}:commit`));

}

// Compra "Versão completa" pela API nova de produtos únicos (onetimeproducts), com o preço
// convertido pela própria Google para todos os países.
await step('Compra Versão completa (R$ 4,90)', async () => {
  const id = 'com.arial.goldeplaca.completo';
  const conv = await api('POST', `${BASE}/${PKG}/pricing:convertRegionPrices`, { price: { currencyCode: 'BRL', units: '4', nanos: 900000000 } });
  // no Brasil vale o preço exato (a conversão da Google arredondava para R$ 4,89)
  const regions = Object.values(conv.convertedRegionPrices || {}).map((r) => ({
    regionCode: r.regionCode, availability: 'AVAILABLE',
    price: r.regionCode === 'BR' ? { currencyCode: 'BRL', units: '4', nanos: 900000000 } : r.price,
  }));
  if (!regions.length) throw new Error('a Google não devolveu os preços por país');
  const body = {
    packageName: PKG, productId: id,
    listings: [
      { languageCode: 'pt-BR', title: 'Versão completa', description: 'Faltas, seleções, goleiro, craque e 2 jogadores.' },
      { languageCode: 'en-US', title: 'Full version', description: 'Free kicks, all teams, keeper mode and your player.' },
    ],
    purchaseOptions: [{ purchaseOptionId: 'compra', buyOption: { legacyCompatible: true, multiQuantityEnabled: false }, regionalPricingAndAvailabilityConfigs: regions }],
  };
  // a mesma tabela de países usada pela Google na conversão (ex.: a Bulgária passou para o euro)
  const ver = encodeURIComponent(conv.regionVersion?.version || '2022/02');
  const q = `allowMissing=true&regionsVersion.version=${ver}&updateMask=listings,purchaseOptions`;
  await api('PATCH', `${BASE}/${PKG}/onetimeproducts/${id}?${q}`, body);
  console.log(`   preço em ${regions.length} países`);
  await api('POST', `${BASE}/${PKG}/oneTimeProducts/${id}/purchaseOptions:batchUpdateStates`, {
    requests: [{ activatePurchaseOptionRequest: { packageName: PKG, productId: id, purchaseOptionId: 'compra' } }],
  });
});

console.log(problems.length ? `\nFaltou: ${problems.join(' · ')}` : '\nTudo configurado pela API.');
if (problems.length) process.exitCode = 1;

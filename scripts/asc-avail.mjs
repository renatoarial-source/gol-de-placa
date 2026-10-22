// Países e preço de um app na App Store. FIX=1 libera em todos os países (e novos) e,
// se o app ainda não tiver preço, põe o preço PRICE (em reais, ex.: 1.90) com base no Brasil.
import crypto from 'node:crypto';

const APP = { gol: '6823608331', gelada: '6819882963', esconde: '6819893974' }[(process.env.APP || 'gol').trim()];
const FIX = process.env.FIX === '1';
const PRICE = (process.env.PRICE || '').trim();
const HOST = 'https://api.appstoreconnect.apple.com';
const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64 } = process.env;
  const keyText = ASC_KEY_P8_BASE64.includes('BEGIN PRIVATE KEY') ? ASC_KEY_P8_BASE64 : Buffer.from(ASC_KEY_P8_BASE64, 'base64').toString();
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID.trim(), typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ASC_ISSUER_ID.trim(), iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }))}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), { key: crypto.createPrivateKey(keyText), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const TOKEN = token();
async function api(method, path, body) {
  const res = await fetch(path.startsWith('http') ? path : HOST + path, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) { const e = new Error(`${method} ${path} → ${res.status} ${text.slice(0, 600)}`); e.status = res.status; throw e; }
  return text ? JSON.parse(text) : {};
}
async function all(path) { const out = []; for (let u = path; u; ) { const r = await api('GET', u); out.push(...r.data); u = r.links?.next; } return out; }

// preço
let hasPrice = false;
try {
  const ps = await api('GET', `/v1/apps/${APP}/appPriceSchedule?include=baseTerritory,manualPrices`);
  const base = ps.data?.relationships?.baseTerritory?.data?.id;
  const n = (ps.included || []).filter((x) => x.type === 'appPrices').length;
  hasPrice = !!base || n > 0;
  console.log(`Preço: território base ${base || '-'} · ${n} preço(s) manual(is)`);
} catch (e) { console.log(`Preço: nenhum (${e.status})`); }

// países
let current = null;
try { current = (await api('GET', `/v1/apps/${APP}/appAvailabilityV2`)).data; } catch (e) { if (e.status !== 404) throw e; }
if (current) {
  const ts = await all(`/v2/appAvailabilities/${current.id}/territoryAvailabilities?limit=200`);
  console.log(`Países: ${ts.filter((t) => t.attributes.available).length} de ${ts.length} liberados`);
} else console.log('Países: nenhum configurado');

if (!FIX) process.exit(0);

if (!hasPrice) {
  if (!PRICE) throw new Error('App sem preço: informe PRICE (ex.: 1.90 ou 0 para grátis)');
  const pts = await all(`/v1/apps/${APP}/appPricePoints?filter[territory]=BRA&limit=200`);
  const pt = pts.find((p) => Number(p.attributes.customerPrice) === Number(PRICE));
  if (!pt) throw new Error(`Não achei o preço R$ ${PRICE} no Brasil`);
  await api('POST', '/v1/appPriceSchedules', {
    data: { type: 'appPriceSchedules', relationships: {
      app: { data: { type: 'apps', id: APP } },
      baseTerritory: { data: { type: 'territories', id: 'BRA' } },
      manualPrices: { data: [{ type: 'appPrices', id: '${price}' }] } } },
    included: [{ type: 'appPrices', id: '${price}', attributes: { startDate: null }, relationships: { appPricePoint: { data: { type: 'appPricePoints', id: pt.id } } } }],
  });
  console.log(`Preço definido: R$ ${PRICE} (base Brasil, convertido para os outros países)`);
}

if (!current) {
  const terr = await all('/v1/territories?limit=200');
  await api('POST', '/v2/appAvailabilities', {
    data: { type: 'appAvailabilities', attributes: { availableInNewTerritories: true }, relationships: {
      app: { data: { type: 'apps', id: APP } },
      territoryAvailabilities: { data: terr.map((t, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}` })) } } },
    included: terr.map((t, i) => ({ type: 'territoryAvailabilities', id: `\${t${i}}`, attributes: { available: true }, relationships: { territory: { data: { type: 'territories', id: t.id } } } })),
  });
  console.log(`Liberado em ${terr.length} países (e nos novos que a Apple abrir)`);
}

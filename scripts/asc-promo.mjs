// Divulgação na App Store (robô grátis): texto promocional e indicações para destaque (Featuring Nominations).
// ACTION=list    → mostra o texto promocional de cada idioma da versão à venda e as indicações já feitas
// ACTION=promo   → troca o texto promocional da versão à venda (não precisa de revisão da Apple) pelos de store/promo.json
// ACTION=nominate → cria e envia as indicações de store/promo.json (pula as que já existem com o mesmo nome)
import crypto from 'node:crypto';

const APPS = { gol: '6823608331', gelada: '6819882963', esconde: '6819893974' };
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
  if (!res.ok) { let d = text; try { d = JSON.parse(text).errors.map((x) => `${x.code}: ${x.title} — ${x.detail || ''}`).join(' | '); } catch {} const e = new Error(`${method} ${path} → ${res.status} ${d.slice(0, 800)}`); e.status = res.status; throw e; }
  return text ? JSON.parse(text) : {};
}
async function all(path) { const out = []; for (let u = path; u; ) { const r = await api('GET', u); out.push(...r.data); u = r.links?.next; } return out; }

const PROMO = JSON.parse(process.env.PROMO_JSON || '{}'); // { gol: { 'pt-BR': '...', ... }, ... }
const NOMINATIONS = JSON.parse(process.env.NOMINATIONS_JSON || '[]');
const action = process.env.ACTION || 'list';

async function liveLocs(app) {
  const vs = (await api('GET', `/v1/apps/${app}/appStoreVersions?filter[platform]=IOS&limit=5`)).data;
  const out = [];
  for (const v of vs) {
    const st = v.attributes.appVersionState || v.attributes.appStoreState;
    if (!['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE', 'WAITING_FOR_REVIEW', 'IN_REVIEW', 'PREPARE_FOR_SUBMISSION', 'PENDING_DEVELOPER_RELEASE'].includes(st)) continue;
    const locs = await all(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=50`);
    out.push({ version: v.attributes.versionString, state: st, locs });
    if (['READY_FOR_DISTRIBUTION', 'READY_FOR_SALE'].includes(st)) break; // só até a versão à venda
  }
  return out;
}

for (const [key, app] of Object.entries(APPS)) {
  const versions = await liveLocs(app);
  for (const v of versions) {
    console.log(`\n${key} ${v.version} (${v.state})`);
    for (const l of v.locs) {
      const want = PROMO[key]?.[l.attributes.locale] ?? PROMO[key]?.[l.attributes.locale.slice(0, 2)];
      if (action === 'promo' && want && want !== l.attributes.promotionalText && /READY_/.test(v.state)) {
        try {
          await api('PATCH', `/v1/appStoreVersionLocalizations/${l.id}`, { data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { promotionalText: want } } });
          console.log(`  ${l.attributes.locale}: trocado → ${want}`);
        } catch (e) { console.log(`  ${l.attributes.locale}: não deu (${e.message.slice(0, 500)})`); }
      } else console.log(`  ${l.attributes.locale}: ${l.attributes.promotionalText || '(vazio)'}`);
    }
  }
}

let existing = [];
try {
  for (const st of ['DRAFT', 'SUBMITTED']) existing.push(...await all(`/v1/nominations?limit=200&filter[state]=${st}`));
  console.log(`\nIndicações já feitas: ${existing.length}`);
  for (const n of existing) console.log(` - ${n.attributes.name} | ${n.attributes.type} | ${n.attributes.state} | ${n.attributes.publishStartDate || ''}`);
} catch (e) { console.log(`\nIndicações: não deu para ver (${e.message.slice(0, 300)})`); }

if (action === 'nominate') for (const n of NOMINATIONS) {
  if (existing.some((x) => x.attributes.name === n.name)) { console.log(`já existe: ${n.name}`); continue; }
  try {
    const r = await api('POST', '/v1/nominations', { data: { type: 'nominations',
      attributes: { name: n.name, type: n.type, description: n.description, notes: n.notes, publishStartDate: n.start, publishEndDate: n.end,
        deviceFamilies: ['IPHONE', 'IPAD'], locales: ['pt-BR', 'en-US', 'es-MX'], hasInAppEvents: !!n.hasInAppEvents, launchInSelectInternalMarketsFirst: false, preOrderEnabled: false, submitted: true },
      relationships: { relatedApps: { data: n.apps.map((a) => ({ type: 'apps', id: APPS[a] })) } } } });
    console.log(`indicação enviada: ${n.name} (${r.data.attributes.state})`);
  } catch (e) { console.log(`indicação ${n.name}: não deu (${e.message.slice(0, 600)})`); }
}

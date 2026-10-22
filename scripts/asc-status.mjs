// Situação dos 3 apps na App Store (versões, builds e envios para revisão).
// Roda no workflow "Situação na App Store" (repositório público: não gasta minutos pagos).
import crypto from 'node:crypto';

const API = 'https://api.appstoreconnect.apple.com/v1';
const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64 } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8_BASE64) throw new Error('Faltam os secrets ASC_*');
  const keyText = ASC_KEY_P8_BASE64.includes('BEGIN PRIVATE KEY') ? ASC_KEY_P8_BASE64 : Buffer.from(ASC_KEY_P8_BASE64, 'base64').toString();
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID.trim(), typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ASC_ISSUER_ID.trim(), iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }))}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), { key: crypto.createPrivateKey(keyText), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const TOKEN = token();
async function api(path) {
  const res = await fetch(path.startsWith('/v2/') ? API.replace('/v1', '') + path : API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
const APPS = { '6819882963': 'Gelada', '6819893974': 'Esconde-Esconde', '6823608331': 'Gol de Placa' };
const out = {};
for (const [app, name] of Object.entries(APPS)) {
  try {
    const v = await api(`/apps/${app}/appStoreVersions?filter[platform]=IOS&limit=4&include=build`);
    const builds = Object.fromEntries((v.included || []).filter((x) => x.type === 'builds').map((x) => [x.id, x.attributes.version]));
    const versions = v.data.map((x) => ({ version: x.attributes.versionString, state: x.attributes.appVersionState || x.attributes.appStoreState,
      build: x.relationships?.build?.data ? builds[x.relationships.build.data.id] ?? '?' : null }));
    const latest = (await api(`/builds?filter[app]=${app}&sort=-uploadedDate&limit=3&include=preReleaseVersion`)).data
      .map((x) => ({ build: x.attributes.version, state: x.attributes.processingState, uploaded: x.attributes.uploadedDate.slice(0, 16) }));
    out[name] = { versions, latest };
    console.log(`${name}: ` + versions.map((x) => `${x.version} = ${x.state}${x.build ? ` (build ${x.build})` : ''}`).join(' · '));
    try {
      const av = (await api(`/apps/${app}/appAvailabilityV2`)).data;
      const ts = [];
      for (let url = `/v2/appAvailabilities/${av.id}/territoryAvailabilities?limit=200&include=territory`; url; ) {
        const r = await api(url); ts.push(...r.data); url = r.links?.next ? r.links.next.replace(/^https:\/\/[^/]+/, '') : null;
      }
      const on = ts.filter((t) => t.attributes.available);
      const br = ts.find((t) => t.relationships?.territory?.data?.id === 'BRA');
      const st = {}; for (const t of ts) for (const c of t.attributes.contentStatuses || []) st[c] = (st[c] || 0) + 1;
      console.log(`   disponível em ${on.length} de ${ts.length} países · Brasil: ${br ? (br.attributes.available ? 'sim' : 'não') + ' ' + (br.attributes.contentStatuses || []).join(',') + (br.attributes.releaseDate ? ' lançamento ' + br.attributes.releaseDate : '') : 'sem registro'} · situações: ${JSON.stringify(st)}`);
    } catch (e) { console.log(`   disponibilidade: não deu para ver (${e.message})`); }
    console.log('   builds mais novos: ' + latest.map((x) => `${x.build} ${x.state} ${x.uploaded}`).join(' · '));
  } catch (e) { console.log(`${name}: não deu para ver (${e.message})`); }
}
console.log('JSON ' + JSON.stringify(out));

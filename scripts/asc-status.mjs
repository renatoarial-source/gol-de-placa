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
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${TOKEN}` } });
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
    console.log('   builds mais novos: ' + latest.map((x) => `${x.build} ${x.state} ${x.uploaded}`).join(' · '));
  } catch (e) { console.log(`${name}: não deu para ver (${e.message})`); }
}
console.log('JSON ' + JSON.stringify(out));

// Mostra as capturas de tela de uma versão que não terminaram de processar; FIX=1 apaga as travadas.
import crypto from 'node:crypto';

const APP = { gol: '6823608331', gelada: '6819882963', esconde: '6819893974' }[(process.env.APP || 'gelada').trim()];
const VERSION = (process.env.VERSION || '').trim();
const FIX = process.env.FIX === '1';
const API = 'https://api.appstoreconnect.apple.com/v1';
const b64url = (b) => Buffer.from(b).toString('base64url');
function token() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64 } = process.env;
  const keyText = ASC_KEY_P8_BASE64.includes('BEGIN PRIVATE KEY') ? ASC_KEY_P8_BASE64 : Buffer.from(ASC_KEY_P8_BASE64, 'base64').toString();
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID.trim(), typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: ASC_ISSUER_ID.trim(), iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }))}`;
  return `${data}.${crypto.sign('sha256', Buffer.from(data), { key: crypto.createPrivateKey(keyText), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
const TOKEN = token();
async function api(method, path) {
  const res = await fetch(path.startsWith('http') ? path : API + path, { method, headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}
const v = (await api('GET', `/apps/${APP}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}`)).data[0];
const locs = (await api('GET', `/appStoreVersions/${v.id}/appStoreVersionLocalizations?limit=50`)).data;
let ok = 0, bad = 0;
for (const l of locs) {
  const sets = (await api('GET', `/appStoreVersionLocalizations/${l.id}/appScreenshotSets?limit=50`)).data;
  for (const set of sets) {
    const shots = (await api('GET', `/appScreenshotSets/${set.id}/appScreenshots?limit=50`)).data;
    for (const s of shots) {
      const st = s.attributes.assetDeliveryState?.state;
      if (st === 'COMPLETE') { ok++; continue; }
      bad++;
      console.log(`${l.attributes.locale} ${set.attributes.screenshotDisplayType} ${s.attributes.fileName} ${st} ${JSON.stringify(s.attributes.assetDeliveryState?.errors ?? [])}`);
      if (FIX) { await api('DELETE', `/appScreenshots/${s.id}`); console.log('   apagada'); }
    }
  }
}
console.log(`prontas: ${ok} · travadas: ${bad}`);

// Envia uma versão (Gol de Placa, ou APP=gelada/esconde) para a revisão da Apple: liga o build mais novo dessa versão,
// marca "sem criptografia" e cria o envio. A página da versão (textos, capturas) vem do "App Store listing".
// Roda no workflow "Enviar para revisão" (repositório público: não gasta minutos pagos).
import crypto from 'node:crypto';

const APP = { gol: '6823608331', gelada: '6819882963', esconde: '6819893974' }[(process.env.APP || 'gol').trim()];
const VERSION = (process.env.VERSION || '').trim();
if (!VERSION) throw new Error('Diga a versão (ex.: 1.0.6)');
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
async function api(method, path, body) {
  const res = await fetch(API + path, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}
const rel = (type, id) => ({ data: { type, id } });

const v = (await api('GET', `/apps/${APP}/appStoreVersions?filter[platform]=IOS&filter[versionString]=${VERSION}`)).data[0];
if (!v) throw new Error(`a versão ${VERSION} ainda não existe (rode o "App Store listing" com version=${VERSION})`);
const b = (await api('GET', `/builds?filter[app]=${APP}&filter[preReleaseVersion.version]=${VERSION}&filter[processingState]=VALID&sort=-uploadedDate&limit=1`)).data[0];
if (!b) throw new Error(`nenhum build ${VERSION} processado ainda`);
if (b.attributes.usesNonExemptEncryption == null) {
  await api('PATCH', `/builds/${b.id}`, { data: { type: 'builds', id: b.id, attributes: { usesNonExemptEncryption: false } } });
}
await api('PATCH', `/appStoreVersions/${v.id}/relationships/build`, { data: { type: 'builds', id: b.id } });
console.log(`Versão ${VERSION} com o build ${b.attributes.version}`);
const open = (await api('GET', `/reviewSubmissions?filter[app]=${APP}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW`)).data[0];
const sub = open || (await api('POST', '/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: rel('apps', APP) } } })).data;
const have = (await api('GET', `/reviewSubmissions/${sub.id}/items`)).data;
if (!have.some((h) => h.relationships?.appStoreVersion?.data?.id === v.id)) {
  await api('POST', '/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: rel('reviewSubmissions', sub.id), appStoreVersion: rel('appStoreVersions', v.id) } } });
}
const done = await api('PATCH', `/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
console.log(`Enviado para revisão: ${done.data.attributes.state}`);

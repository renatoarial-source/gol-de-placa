// Lista os envios para revisão de um app (com o que tem em cada um). CANCEL=<id> cancela aquele envio.
import crypto from 'node:crypto';

const APP = { gelada: '6819882963', esconde: '6819893974', gol: '6823608331' }[process.env.APP || 'gelada'];
const CANCEL = (process.env.CANCEL || '').trim();
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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}
if (CANCEL) {
  const r = await api('PATCH', `/reviewSubmissions/${CANCEL}`, { data: { type: 'reviewSubmissions', id: CANCEL, attributes: { canceled: true } } });
  console.log('Cancelado:', r.data.attributes.state);
}
const subs = (await api('GET', `/reviewSubmissions?filter[app]=${APP}&filter[platform]=IOS&limit=30`)).data;
for (const s of subs) {
  const items = (await api('GET', `/reviewSubmissions/${s.id}/items?include=appStoreVersion,appEvent`)).data;
  const desc = items.map((i) => Object.entries(i.relationships || {}).filter(([, v]) => v.data).map(([k, v]) => `${k}:${v.data.id}`).join(',') + ` (${i.attributes.state})`);
  console.log(`${s.id} ${s.attributes.state} ${s.attributes.submittedDate ?? ''} -> ${desc.join(' | ')}`);
}
const vers = (await api('GET', `/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=2`)).data;
for (const v of vers) console.log(`versão ${v.attributes.versionString} id ${v.id} ${v.attributes.appVersionState}`);

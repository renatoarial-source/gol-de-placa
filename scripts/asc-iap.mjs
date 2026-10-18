// Mostra (e, com FIX=1, corrige) a descrição das compras dentro do app do Esconde-Esconde:
// troca a contagem de lugares liberados pela compra (17 -> 21). Roda no workflow "Compras no app".
import crypto from 'node:crypto';

const APP = '6819893974';
const FIX = process.env.FIX === '1';
const API = 'https://api.appstoreconnect.apple.com';
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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}
const iaps = (await api('GET', `/v1/apps/${APP}/inAppPurchasesV2?limit=50`)).data;
for (const iap of iaps) {
  console.log(`== ${iap.attributes.name} (${iap.attributes.productId}) ${iap.attributes.state}`);
  const locs = (await api('GET', `/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations?limit=50`)).data;
  for (const l of locs) {
    const { locale, name, description } = l.attributes;
    const fixed = description?.replace(/\b17\b/g, '21').replace(/(^|[^0-9])8(?=[^0-9]|$)/g, '$122');
    console.log(`  ${locale} | ${name} | ${description}${fixed !== description ? `  ->  ${fixed}` : ''}`);
    if (FIX && fixed !== description) {
      await api('PATCH', `/v1/inAppPurchaseLocalizations/${l.id}`, { data: { type: 'inAppPurchaseLocalizations', id: l.id, attributes: { description: fixed } } });
      console.log('     corrigido');
    }
  }
}

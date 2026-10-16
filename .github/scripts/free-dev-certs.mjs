// Libera certificados de desenvolvimento criados pelos builds anteriores.
// Cada build no GitHub roda numa máquina nova, então o Xcode cria um certificado
// "Apple Development" a cada vez; a Apple tem um limite e o build passa a falhar.
// Revoga só os criados pela chave da API ("Created via API"): eles só servem para o
// arquivo intermediário. Os apps publicados não são afetados.
// Uso: ASC_KEY_ID, ASC_ISSUER_ID e ASC_KEY_P8_BASE64 no ambiente.
import crypto from 'node:crypto';

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64 } = process.env;
const pem = ASC_KEY_P8_BASE64.includes('BEGIN PRIVATE KEY') ? ASC_KEY_P8_BASE64 : Buffer.from(ASC_KEY_P8_BASE64, 'base64').toString();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const data = `${b64({ alg: 'ES256', kid: ASC_KEY_ID.trim(), typ: 'JWT' })}.${b64({ iss: ASC_ISSUER_ID.trim(), iat: now, exp: now + 900, aud: 'appstoreconnect-v1' })}`;
const sig = crypto.sign('sha256', Buffer.from(data), { key: crypto.createPrivateKey(pem), dsaEncoding: 'ieee-p1363' }).toString('base64url');
const H = { Authorization: `Bearer ${data}.${sig}` };
const API = 'https://api.appstoreconnect.apple.com/v1/certificates';

const res = await fetch(`${API}?filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&limit=200`, { headers: H });
if (!res.ok) { console.log(`::warning::não consegui listar certificados (HTTP ${res.status})`); process.exit(0); }
const certs = (await res.json()).data || [];
const ours = certs.filter((c) => /via API/i.test(c.attributes.name || '') || /via API/i.test(c.attributes.displayName || ''));
console.log(`certificados de desenvolvimento: ${certs.length}; criados pelos builds: ${ours.length}`);
for (const c of ours) {
  const r = await fetch(`${API}/${c.id}`, { method: 'DELETE', headers: H });
  console.log(`revogado ${c.attributes.displayName || c.attributes.name} (${c.attributes.serialNumber}): HTTP ${r.status}`);
}

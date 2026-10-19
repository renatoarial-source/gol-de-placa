// Confere se a conta de serviço (PLAY_SERVICE_ACCOUNT_JSON) consegue mexer no app na Google Play.
// Abre uma edição e apaga em seguida: não muda nada na loja.
import crypto from 'node:crypto';

const PKG = process.env.PACKAGE || 'com.arial.goldeplaca';
const raw = process.env.PLAY_JSON;
if (!raw) { console.log('❌ Falta o secret PLAY_SERVICE_ACCOUNT_JSON neste repositório.'); process.exit(1); }
let sa;
try { sa = JSON.parse(raw); } catch { console.log('❌ O secret PLAY_SERVICE_ACCOUNT_JSON não é um JSON válido (copie o arquivo inteiro, de { até }).'); process.exit(1); }
console.log(`Conta de serviço: ${sa.client_email}`);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 600 })}`;
const jwt = `${unsigned}.${crypto.sign('sha256', Buffer.from(unsigned), sa.private_key).toString('base64url')}`;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
})).json();
if (!tok.access_token) { console.log('❌ A chave foi recusada pelo Google:', JSON.stringify(tok)); process.exit(1); }
console.log('✅ Chave aceita pelo Google.');
const api = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/edits`;
const res = await fetch(api, { method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}` } });
const body = await res.json();
if (!res.ok) {
  console.log(`❌ Sem acesso ao app ${PKG} (${res.status}): ${body.error?.message}`);
  console.log('   No Play Console → Usuários e permissões → esta conta → Permissões do app → adicione o app.');
  process.exit(1);
}
await fetch(`${api}/${body.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok.access_token}` } });
console.log(`✅ Acesso ao app ${PKG} confirmado (edição de teste aberta e apagada).`);

// Situação: faixas de teste, testadores, fichas e a compra
const H = { Authorization: `Bearer ${tok.access_token}` };
const e2 = await (await fetch(api, { method: 'POST', headers: H })).json();
const get = async (p) => { const r = await fetch(`${api}/${e2.id}/${p}`, { headers: H }); return r.ok ? r.json() : { erro: r.status }; };
const tracks = await get('tracks');
for (const t of tracks.tracks || []) {
  console.log(`Faixa ${t.track}: ` + (t.releases || []).map((r) => `${r.name || '?'} [${r.status}] builds ${r.versionCodes || '-'}`).join(' · '));
}
for (const t of ['alpha', 'internal']) console.log(`Testadores ${t}:`, JSON.stringify(await get(`testers/${t}`)));
const ls = await get('listings');
console.log(`Fichas: ${(ls.listings || []).map((l) => l.language).join(', ')}`);
const det = await get('details');
console.log(`Contato: ${det.contactEmail || '-'} · idioma padrão ${det.defaultLanguage || '-'}`);
await fetch(`${api}/${e2.id}`, { method: 'DELETE', headers: H });
const p = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/oneTimeProducts/com.arial.goldeplaca.completo`, { headers: H });
const pj = await p.json();
console.log(`Compra: ${p.ok ? (pj.purchaseOptions || []).map((o) => `${o.purchaseOptionId} ${o.state}`).join(', ') : p.status}`);

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

// Gera narrações (Gol de Placa, Gelada, Esconde-Esconde...) com vozes neurais do Google Cloud Text-to-Speech:
// narrador e narradora, nos 8 idiomas, em MP3. Roda no GitHub Actions (workflow "Narration voices").
// Precisa do secret PLAY_SERVICE_ACCOUNT_JSON (projeto arial-play) e da API Text-to-Speech ativada.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// SET escolhe o jogo: lê store/tts/phrases-<SET>.json (gol, gelada, esconde...)
const SET = process.env.SET || 'gol';
const OUT = process.env.OUT_DIR || path.join(DIR, `out-${SET}`);
const phrases = JSON.parse(fs.readFileSync(path.join(DIR, `phrases-${SET}.json`), 'utf8'));
// códigos de idioma do Google para cada idioma do jogo
const GLANG = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', zh: 'cmn-CN', ja: 'ja-JP' };
// vozes Chirp 3 HD mais animadas primeiro; depois Neural2, WaveNet e Standard
const PREF = { MALE: ['Puck', 'Fenrir', 'Charon', 'Orus'], FEMALE: ['Kore', 'Aoede', 'Leda', 'Zephyr'] };
const TIER = ['Chirp3-HD', 'Neural2', 'Wavenet', 'Standard'];
// falas animadas (um pouco mais rápidas); o arquivo de frases pode listar as suas em "hype"
const HYPE = new Set(['goal', 'corner', 'champion', 'win', ...(phrases._hype ?? [])]);
delete phrases._hype;

const b64url = (b) => Buffer.from(b).toString('base64url');
async function token(sa) {
  const now = Math.floor(Date.now() / 1000);
  const data = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000,
  }))}`;
  const assertion = `${data}.${crypto.sign('sha256', Buffer.from(data), crypto.createPrivateKey(sa.private_key)).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`token Google HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

const sa = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON);
const tk = await token(sa);
async function api(method, url, body) {
  const res = await fetch(`https://texttospeech.googleapis.com/v1/${url}`, {
    method, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', 'x-goog-user-project': sa.project_id },
    body: body && JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) {
    if (/SERVICE_DISABLED|has not been used/.test(txt)) throw new Error(`A API Text-to-Speech não está ativada no projeto ${sa.project_id}. Ative em https://console.cloud.google.com/apis/library/texttospeech.googleapis.com?project=${sa.project_id}`);
    if (/BILLING/.test(txt)) throw new Error(`O projeto ${sa.project_id} precisa de uma conta de faturamento: https://console.cloud.google.com/billing/linkedaccount?project=${sa.project_id}`);
    throw new Error(`${method} ${url}: HTTP ${res.status} ${txt.slice(0, 400)}`);
  }
  return JSON.parse(txt);
}

function pick(voices, lang, gender) {
  const mine = voices.filter((v) => v.ssmlGender === gender && v.languageCodes.includes(lang));
  for (const tier of TIER) {
    const list = mine.filter((v) => v.name.includes(`-${tier}-`));
    for (const p of PREF[gender]) { const v = list.find((x) => x.name.endsWith(`-${p}`)); if (v) return v.name; }
    if (list.length) return list[0].name;
  }
  return null;
}

const manifest = {};
for (const [l, { calls }] of Object.entries(phrases)) {
  const lang = GLANG[l];
  const { voices } = await api('GET', `voices?languageCode=${lang}`);
  manifest[l] = {};
  for (const [gender, folder] of [['MALE', 'male'], ['FEMALE', 'female']]) {
    const name = pick(voices, lang, gender);
    if (!name) { console.log(`${l} ${folder}: nenhuma voz`); continue; }
    manifest[l][folder] = name;
    const dir = path.join(OUT, l, folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const [key, lines] of Object.entries(calls)) {
      for (let i = 0; i < lines.length; i++) {
        const req = { input: { text: lines[i] }, voice: { languageCode: lang, name },
          audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: HYPE.has(key) ? 1.12 : 1.04 } };
        let r;
        try { r = await api('POST', 'text:synthesize', req); }
        catch (e) { delete req.audioConfig.speakingRate; r = await api('POST', 'text:synthesize', req); if (!r) throw e; }
        fs.writeFileSync(path.join(dir, `${key}-${i}.mp3`), Buffer.from(r.audioContent, 'base64'));
      }
    }
    console.log(`${l} ${folder}: ${name}`);
  }
}
fs.writeFileSync(path.join(OUT, 'voices.json'), JSON.stringify(manifest, null, 1));
console.log('pronto:', OUT);

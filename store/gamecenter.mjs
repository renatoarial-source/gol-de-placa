// Game Center no App Store Connect: liga o Game Center, cria as conquistas (uma por figurinha do
// álbum) e o ranking de gols. Pode rodar de novo: só cria o que falta.
// Uso: ACTION=list|create node store/gamecenter.mjs   (secrets ASC_* no ambiente)
// Nomes das conquistas: as figurinhas (st_*) de src/game/i18n.ts. Imagens: store/gamecenter/<id>.png.
// Os identificadores precisam bater com src/game/gamecenter.ts.
import crypto from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = '6823608331'; // Gol de Placa: Pênalti e Falta
const PREFIX = 'com.arial.goldeplaca.';
const LEADERBOARD = 'com.arial.goldeplaca.goals';

// figurinha → pontos (total até 1000)
const ACHIEVEMENTS = {
  first_goal: 10, corner: 20, ground: 20, curve: 25, free_goal: 30, first_save: 10, three_saves: 50, post: 20,
  perfect_kick: 75, perfect_keep: 75, cup: 100, cup_hard: 150, rain: 25, snow: 25, night: 25, two_players: 20,
  daily: 50, fifty: 100,
};
// idioma do jogo → locales da App Store
const LOCALES = { pt: ['pt-BR'], en: ['en-US'], es: ['es-ES', 'es-MX'], de: ['de-DE'], fr: ['fr-FR'], it: ['it'], zh: ['zh-Hans'], ja: ['ja'] };
const BOARD_TEXT = {
  pt: ['Gols marcados', ' gols', ' gol'], en: ['Goals scored', ' goals', ' goal'], es: ['Goles marcados', ' goles', ' gol'],
  de: ['Erzielte Tore', ' Tore', ' Tor'], fr: ['Buts marqués', ' buts', ' but'], it: ['Gol segnati', ' gol', ' gol'],
  zh: ['进球总数', ' 球', ' 球'], ja: ['ゴール数', ' ゴール', ' ゴール'],
};

// Nomes das figurinhas em cada idioma, lidos do i18n.ts do jogo
const i18n = readFileSync(join(HERE, '..', 'src', 'game', 'i18n.ts'), 'utf8');
const blocks = Object.fromEntries(Object.keys(LOCALES).map((l) => {
  const start = i18n.search(new RegExp(`^  ${l}: \\{`, 'm'));
  if (start < 0) throw new Error(`idioma ${l} não achado no i18n.ts`);
  return [l, i18n.slice(start, start + 40000)];
}));
function sticker(lang, id) {
  const m = blocks[lang].match(new RegExp(`\\bst_${id}: '((?:[^'\\\\]|\\\\.)*)'`));
  if (!m) throw new Error(`st_${id} não achado em ${lang}`);
  return m[1].replace(/\\'/g, "'");
}
const total = Object.values(ACHIEVEMENTS).reduce((a, b) => a + b, 0);
if (total > 1000) throw new Error(`pontos demais: ${total}`);
for (const lang of Object.keys(LOCALES)) for (const id of Object.keys(ACHIEVEMENTS)) {
  const n = sticker(lang, id);
  if ([...n].length > 30) throw new Error(`nome longo (${lang} ${id}): ${n}`);
}

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
let TOKEN = token(), tokenAt = Date.now();
async function api(method, path, body) {
  if (Date.now() - tokenAt > 15 * 60e3) { TOKEN = token(); tokenAt = Date.now(); }
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${text}`);
  return text ? JSON.parse(text) : {};
}
const rel = (type, id) => ({ data: { type, id } });
async function all(path) {
  const out = [];
  for (let url = path; url; ) { const r = await api('GET', url); out.push(...r.data); url = r.links?.next; }
  return out;
}

async function uploadImage(type, relName, relType, relId, file) {
  const bytes = readFileSync(file);
  const r = await api('POST', `/${type}`, {
    data: { type, attributes: { fileName: file.split('/').pop(), fileSize: statSync(file).size }, relationships: { [relName]: rel(relType, relId) } },
  });
  for (const op of r.data.attributes.uploadOperations) {
    const res = await fetch(op.url, {
      method: op.method,
      headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
      body: bytes.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`upload ${file} → ${res.status}`);
  }
  await api('PATCH', `/${type}/${r.data.id}`, { data: { type, id: r.data.id, attributes: { uploaded: true } } });
}

async function detail(create) {
  try {
    const r = await api('GET', `/apps/${APP}/gameCenterDetail`);
    if (r.data) return r.data.id;
  } catch (e) { if (!/→ 404/.test(e.message)) throw e; }
  if (!create) return null;
  const r = await api('POST', '/gameCenterDetails', { data: { type: 'gameCenterDetails', relationships: { app: rel('apps', APP) } } });
  console.log('Game Center ligado no app');
  return r.data.id;
}

const action = process.env.ACTION || 'list';
const gcd = await detail(action === 'create');
if (!gcd) { console.log('Game Center ainda não está ligado neste app.'); process.exit(0); }
const achievements = await all(`/gameCenterDetails/${gcd}/gameCenterAchievements?limit=200`);
const boards = await all(`/gameCenterDetails/${gcd}/gameCenterLeaderboards?limit=200`);
console.log(`Conquistas: ${achievements.length} · Rankings: ${boards.length}`);
for (const a of achievements) console.log(` - ${a.attributes.vendorIdentifier} (${a.attributes.points} pts)`);
for (const b of boards) console.log(` - ranking ${b.attributes.vendorIdentifier}`);
if (action !== 'create') process.exit(0);

for (const [id, points] of Object.entries(ACHIEVEMENTS)) {
  const vendorIdentifier = PREFIX + id;
  let ach = achievements.find((a) => a.attributes.vendorIdentifier === vendorIdentifier);
  if (!ach) {
    ach = (await api('POST', '/gameCenterAchievements', {
      data: {
        type: 'gameCenterAchievements',
        attributes: { referenceName: sticker('pt', id), vendorIdentifier, points, showBeforeEarned: true, repeatable: false },
        relationships: { gameCenterDetail: rel('gameCenterDetails', gcd) },
      },
    })).data;
  }
  const locs = await all(`/gameCenterAchievements/${ach.id}/localizations?limit=50`);
  let added = 0;
  for (const [lang, locales] of Object.entries(LOCALES)) for (const locale of locales) {
    const name = sticker(lang, id);
    let loc = locs.find((l) => l.attributes.locale === locale);
    if (!loc) {
      loc = (await api('POST', '/gameCenterAchievementLocalizations', {
        data: {
          type: 'gameCenterAchievementLocalizations',
          attributes: { locale, name, beforeEarnedDescription: name, afterEarnedDescription: name },
          relationships: { gameCenterAchievement: rel('gameCenterAchievements', ach.id) },
        },
      })).data;
      added++;
    }
    let hasImage = false;
    try { hasImage = !!(await api('GET', `/gameCenterAchievementLocalizations/${loc.id}/gameCenterAchievementImage`)).data; } catch { /* sem imagem */ }
    if (!hasImage) await uploadImage('gameCenterAchievementImages', 'gameCenterAchievementLocalization', 'gameCenterAchievementLocalizations', loc.id, join(HERE, 'gamecenter', `${id}.png`));
  }
  console.log(`Conquista ok: ${id} (${points} pts, ${added} idioma(s) novo(s))`);
}

let board = boards.find((b) => b.attributes.vendorIdentifier === LEADERBOARD);
if (!board) {
  board = (await api('POST', '/gameCenterLeaderboards', {
    data: {
      type: 'gameCenterLeaderboards',
      attributes: { referenceName: 'Gols marcados', vendorIdentifier: LEADERBOARD, defaultFormatter: 'INTEGER', submissionType: 'BEST_SCORE', scoreSortType: 'DESC' },
      relationships: { gameCenterDetail: rel('gameCenterDetails', gcd) },
    },
  })).data;
}
const blocs = await all(`/gameCenterLeaderboards/${board.id}/localizations?limit=50`);
for (const [lang, locales] of Object.entries(LOCALES)) for (const locale of locales) {
  if (blocs.some((l) => l.attributes.locale === locale)) continue;
  const [name, formatterSuffix, formatterSuffixSingular] = BOARD_TEXT[lang];
  await api('POST', '/gameCenterLeaderboardLocalizations', {
    data: {
      type: 'gameCenterLeaderboardLocalizations',
      attributes: { locale, name, formatterSuffix, formatterSuffixSingular },
      relationships: { gameCenterLeaderboard: rel('gameCenterLeaderboards', board.id) },
    },
  });
}
console.log(`Ranking ok: ${LEADERBOARD}`);
console.log(`Total: ${Object.keys(ACHIEVEMENTS).length} conquistas, ${total} pontos.`);

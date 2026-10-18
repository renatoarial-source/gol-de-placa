// Gera a pasta de metadados do fastlane (deliver) a partir do store/LISTING.md
// e das capturas em store/screenshots/appstore/<idioma>/.
// Uso: node store/appstore-metadata.mjs   →   store/fastlane/{metadata,screenshots}
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'fastlane');
// capturas de iPhone e de iPad (o deliver reconhece o aparelho pelo tamanho da imagem)
const SHOT_DIRS = [['appstore', ''], ['ipad', 'ipad-']];
const PRIVACY = 'https://arialgamer.github.io/gol-privacidade/';
// seção do LISTING.md → idioma das capturas → locales da App Store
const SECTIONS = [
  ['Português', 'pt', ['pt-BR']],
  ['English', 'en', ['en-US']],
  ['Español', 'es', ['es-ES', 'es-MX']],
  ['Deutsch', 'de', ['de-DE']],
  ['Français', 'fr', ['fr-FR']],
  ['Italiano', 'it', ['it']],
  ['中文', 'zh', ['zh-Hans']],
  ['日本語', 'ja', ['ja']],
];

// Texto promocional (muda sem revisão da Apple) e novidades da versão, por idioma
// Palavras-chave próprias de um locale (no lugar das do LISTING.md). O es-MX também
// conta na busca dos EUA, então não repete as da Espanha: usa termos do México.
const KEYWORDS_BY_LOCALE = { 'es-MX': 'futbol,portero,arquero,copa,niños,familia,pelota,deporte,selección,balón,cascarita,tanda,3d' };
const PROMO = {"pt": "Bata no ângulo! Pênaltis em 3D com Copa, chuva, torcida e música. Na Versão Completa: faltas, goleiro, 16 seleções, 12 times e 2 jogadores.", "en": "Hit the top corner! 3D penalties with a Cup, weather, crowd and music. Full Version adds free kicks, goalkeeper mode, 16 national teams, 12 clubs and 2 players.", "es": "¡Clávala al ángulo! Penales en 3D con Copa, lluvia, afición y música. La Versión Completa suma tiros libres, portero, 16 selecciones, 12 equipos y 2 jugadores.", "de": "Triff in den Winkel! Elfmeter in 3D mit Pokal, Wetter, Fans und Musik. Die Vollversion bringt Freistöße, Torwart, 16 Nationalteams, 12 Klubs und 2 Spieler.", "fr": "En pleine lucarne ! Penaltys en 3D avec Coupe, météo, supporters et musique. La version complète ajoute coups francs, gardien, 16 sélections, 12 clubs et 2 joueurs.", "it": "Tira nel sette! Rigori in 3D con Coppa, meteo, tifosi e musica. La Versione Completa aggiunge punizioni, portiere, 16 nazionali, 12 squadre e 2 giocatori.", "zh": "射进死角！3D 点球，有杯赛、天气、球迷和音乐。完整版还有任意球、守门员模式、16 支国家队、12 支俱乐部和双人对战。", "ja": "すみに決めろ！カップ戦、天気、サポーター、音楽つきの3D PK。完全版ではフリーキック、キーパー、代表16チーム、クラブ12チーム、2人プレイも。"};
// novidades da versão (1.0.3; os builds 1.0.1 e 1.0.2 de 17/10 ficaram só no TestFlight); na primeira versão ficava vazio (a Apple não aceita texto de novidades nela)
const NOTES = {"pt": "Novidades do Gol de Placa:\n• Estilo bolinha: junte 25 figurinhas e jogue com bonecos redondos em metade das partidas\n• Meu craque: 14 cabelos, 10 tipos de corpo (ou aleatório) e chuteira em destaque\n• 8 comemorações, como Peixinho e Pião, ou uma diferente a cada gol\n• Torneio de amigos: mata-mata de 4 no mesmo celular\n• Álbum com 100 figurinhas, uniformes e estádios para liberar\n• Evento Pênaltis da Copa em datas especiais\n• Torcida mais animada, vibração em cada lance e 3 sons novos: Olé, Cornetas e Pagode\n• Narração com mais emoção e Game Center", "en": "What's new in Gol de Placa:\n• Bubble style: collect 25 stickers and play with round players in half of the matches\n• My player: 14 hairstyles, 10 body types (or random) and boots in the spotlight\n• 8 celebrations, like Belly slide and Spin, or a different one every goal\n• Friends tournament: 4-player knockout on one phone\n• 100-sticker album with kits and stadiums to unlock\n• Cup Penalties event on special dates\n• Livelier crowd, vibration on every play and 3 new chants: Olé, Air horns and Pagode\n• More exciting commentary and Game Center", "es": "Novedades de Gol de Placa:\n• Estilo bolita: junta 25 figuritas y juega con muñecos redondos en la mitad de los partidos\n• Mi crack: 14 peinados, 10 tipos de cuerpo (o aleatorio) y botines destacados\n• 8 festejos, como Pececito y Trompo, o uno distinto en cada gol\n• Torneo de amigos: eliminatoria de 4 en el mismo celular\n• Álbum de 100 figuritas, uniformes y estadios para desbloquear\n• Evento Penales de la Copa en fechas especiales\n• Afición más animada, vibración en cada jugada y 3 cantos nuevos: Olé, Cornetas y Pagode\n• Narración con más emoción y Game Center", "de": "Neu in Gol de Placa:\n• Kugel-Stil: Sammle 25 Sticker und spiele in der Hälfte der Spiele mit runden Figuren\n• Mein Spieler: 14 Frisuren, 10 Körpertypen (oder zufällig) und Schuhe im Rampenlicht\n• 8 Jubel, z. B. Bauchrutscher und Kreisel, oder bei jedem Tor ein anderer\n• Freunde-Turnier: K.-o.-Runde zu viert auf einem Handy\n• Album mit 100 Stickern, Trikots und Stadien zum Freischalten\n• Event Pokal-Elfmeter an besonderen Tagen\n• Lebhaftere Fans, Vibration bei jedem Spielzug und 3 neue Gesänge: Olé, Tröten und Pagode\n• Spannenderer Kommentar und Game Center", "fr": "Nouveautés de Gol de Placa :\n• Style boule : réunis 25 vignettes et joue avec des joueurs ronds dans la moitié des matchs\n• Mon joueur : 14 coiffures, 10 silhouettes (ou au hasard) et crampons mis en valeur\n• 8 célébrations, comme Glissade et Toupie, ou une différente à chaque but\n• Tournoi entre amis : élimination à 4 sur un seul téléphone\n• Album de 100 vignettes, maillots et stades à débloquer\n• Événement Tirs au but de la Coupe aux dates spéciales\n• Supporters plus animés, vibration à chaque action et 3 nouveaux chants : Olé, Cornes de brume et Pagode\n• Commentaires plus vivants et Game Center", "it": "Novità di Gol de Placa:\n• Stile pallina: raccogli 25 figurine e gioca con giocatori rotondi in metà delle partite\n• Il mio campione: 14 acconciature, 10 tipi di corpo (o casuale) e scarpini in primo piano\n• 8 esultanze, come Tuffo e Trottola, o una diversa a ogni gol\n• Torneo tra amici: eliminazione a 4 sullo stesso telefono\n• Album da 100 figurine, maglie e stadi da sbloccare\n• Evento Rigori della Coppa nelle date speciali\n• Tifosi più vivaci, vibrazione a ogni azione e 3 nuovi cori: Olé, Trombette e Pagode\n• Telecronaca più emozionante e Game Center", "zh": "Gol de Placa 新内容：\n• 圆球风格：收集 25 张贴纸，一半的比赛使用圆圆的球员\n• 我的球员：14 种发型、10 种体型（或随机），球鞋更醒目\n• 8 种庆祝动作，如鱼跃和陀螺，或每个进球随机一种\n• 好友锦标赛：4 人淘汰赛，同一部手机\n• 100 张贴纸的相册，可解锁球衣和球场\n• 特别日期的杯赛点球活动\n• 球迷更热闹，每个动作都有振动，新增 3 种助威：欧雷、喇叭和帕戈德\n• 更激情的解说和 Game Center", "ja": "Gol de Placa の新機能：\n• まんまるスタイル：シールを25枚集めると、半分の試合がまるい選手に\n• マイ選手：髪型14種、体型10種（ランダムも）、スパイクも見やすく\n• ヘッドスライディングやコマ回りなど8つの喜び方、ゴールごとにランダムも\n• 友だちトーナメント：1台のスマホで4人のトーナメント\n• 100枚のシールアルバムで、ユニフォームとスタジアムを解放\n• 特別な日のカップPKイベント\n• もっと盛り上がるサポーター、プレーごとのバイブ、新しい応援3種：オーレ、ラッパ、パゴージ\n• 熱い実況とGame Center"};
const md = fs.readFileSync(path.join(__dirname, 'LISTING.md'), 'utf8');
const blocks = md.split(/^## /m).slice(1);
// valor do item "- **Rótulo:** valor" na posição i (título, subtítulo, descrição curta, palavras-chave)
const item = (b, i) => b.split('\n').filter((l) => l.startsWith('- **'))[i].replace(/^- \*\*[^*]+\*\*\s*/, '').trim();

fs.rmSync(OUT, { recursive: true, force: true });
for (const [head, lang, locales] of SECTIONS) {
  const b = blocks.find((x) => x.startsWith(head));
  if (!b) throw new Error(`Seção ${head} não encontrada`);
  const name = item(b, 0), subtitle = item(b, 1), baseKeywords = item(b, 3);
  // A App Store não aceita emojis na descrição: ✔ vira •, os demais saem.
  const description = b.split(/^\*\*[^*\n]+\*\*\s*$/m)[1].split(/^---$/m)[0].trim()
    .replace(/✔\uFE0F?/g, '•').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '').replace(/ {2,}/g, ' ').replace(/ +([).,])/g, '$1');
  const limits = { name: [name, 30], subtitle: [subtitle, 30], keywords: [baseKeywords, 100], description: [description, 4000] };
  for (const [k, [v, max]] of Object.entries(limits)) {
    if ([...v].length > max) throw new Error(`${lang} ${k}: ${[...v].length} > ${max}`);
  }
  for (const loc of locales) {
    const keywords = KEYWORDS_BY_LOCALE[loc] || baseKeywords;
    if ([...keywords].length > 100) throw new Error(`${loc} keywords: ${[...keywords].length} > 100`);
    const dir = path.join(OUT, 'metadata', loc);
    fs.mkdirSync(dir, { recursive: true });
    const files = { name, subtitle, keywords, description, privacy_url: PRIVACY, support_url: PRIVACY, promotional_text: PROMO[lang], release_notes: NOTES[lang] };
    for (const [f, v] of Object.entries(files)) if (v !== undefined) fs.writeFileSync(path.join(dir, `${f}.txt`), v + '\n');

    const dst = path.join(OUT, 'screenshots', loc);
    fs.mkdirSync(dst, { recursive: true });
    for (const [store, prefix] of SHOT_DIRS) {
      const src = path.join(__dirname, 'screenshots', store, lang);
      for (const f of fs.existsSync(src) ? fs.readdirSync(src).filter((x) => x.endsWith('.png')).sort() : []) {
        // JPEG sem transparência: o App Store Connect recusa PNG com canal alfa
        execSync(`convert "${path.join(src, f)}" -background white -alpha remove -quality 92 "${path.join(dst, prefix + f.replace('.png', '.jpg'))}"`);
      }
    }
  }
  console.log(lang, 'ok:', name, '|', subtitle);
}
fs.mkdirSync(path.join(OUT, 'metadata'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'metadata', 'copyright.txt'), `${new Date().getFullYear()} Arial Gamer\n`);
fs.writeFileSync(path.join(OUT, 'metadata', 'primary_category.txt'), 'GAMES\n');
fs.writeFileSync(path.join(OUT, 'metadata', 'primary_first_sub_category.txt'), 'GAMES_SPORTS\n');
fs.writeFileSync(path.join(OUT, 'metadata', 'primary_second_sub_category.txt'), 'GAMES_FAMILY\n');

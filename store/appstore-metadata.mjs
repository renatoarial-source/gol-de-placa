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
// novidades da versão 1.0.8 (narrador em 14 idiomas)
const NOTES = {"pt": "Novidades do Gol de Placa:\n• Narrador em 14 idiomas: português do Brasil e de Portugal, espanhol da Espanha e latino, inglês, francês, alemão, italiano, holandês, turco, árabe, japonês, coreano e chinês\n• Escolha o narrador separado do idioma do jogo (ex.: jogo em português com narrador argentino)\n• Narrador ou narradora em todos os idiomas", "en": "What's new in Gol de Placa:\n• Commentary in 14 languages: Brazilian and European Portuguese, Spanish (Spain and Latin America), English, French, German, Italian, Dutch, Turkish, Arabic, Japanese, Korean and Chinese\n• Pick the commentator separately from the game language\n• Male or female commentator in every language", "es": "Novedades de Gol de Placa:\n• Narración en 14 idiomas: portugués de Brasil y de Portugal, español de España y latino, inglés, francés, alemán, italiano, neerlandés, turco, árabe, japonés, coreano y chino\n• Elige el narrador aparte del idioma del juego\n• Narrador o narradora en todos los idiomas", "de": "Neu in Gol de Placa:\n• Kommentar in 14 Sprachen: Portugiesisch (Brasilien und Portugal), Spanisch (Spanien und Lateinamerika), Englisch, Französisch, Deutsch, Italienisch, Niederländisch, Türkisch, Arabisch, Japanisch, Koreanisch und Chinesisch\n• Kommentator unabhängig von der Spielsprache wählen\n• Kommentator oder Kommentatorin in jeder Sprache", "fr": "Nouveautés de Gol de Placa :\n• Commentaires en 14 langues : portugais du Brésil et du Portugal, espagnol d'Espagne et d'Amérique latine, anglais, français, allemand, italien, néerlandais, turc, arabe, japonais, coréen et chinois\n• Choisis le commentateur indépendamment de la langue du jeu\n• Commentateur ou commentatrice dans chaque langue", "it": "Novità di Gol de Placa:\n• Telecronaca in 14 lingue: portoghese del Brasile e del Portogallo, spagnolo di Spagna e latino, inglese, francese, tedesco, italiano, olandese, turco, arabo, giapponese, coreano e cinese\n• Scegli il telecronista separatamente dalla lingua del gioco\n• Telecronista uomo o donna in ogni lingua", "zh": "Gol de Placa 新内容：\n• 14 种语言解说：巴西和葡萄牙葡萄牙语、西班牙和拉美西班牙语、英语、法语、德语、意大利语、荷兰语、土耳其语、阿拉伯语、日语、韩语和中文\n• 解说语言可与游戏语言分开选择\n• 每种语言都有男声和女声解说", "ja": "Gol de Placa の新機能：\n• 14言語の実況：ブラジル・ポルトガルのポルトガル語、スペイン・中南米のスペイン語、英語、フランス語、ドイツ語、イタリア語、オランダ語、トルコ語、アラビア語、日本語、韓国語、中国語\n• 実況の言語をゲームの言語とは別に選べる\n• すべての言語で男性・女性の実況"};
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

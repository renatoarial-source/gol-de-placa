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
const PROMO = {"pt": "Siga @arial.gamer no TikTok para desafios, dicas e novidades dos jogos!", "en": "Follow @arial.gamer on TikTok for challenges, tips and game news!", "es": "¡Sigue a @arial.gamer en TikTok para retos, trucos y novedades!", "de": "Folge @arial.gamer auf TikTok für Challenges, Tipps und News!", "fr": "Suis @arial.gamer sur TikTok pour des défis, astuces et nouveautés !", "it": "Segui @arial.gamer su TikTok per sfide, consigli e novità!", "zh": "在 TikTok 关注 @arial.gamer，获取挑战、技巧和最新消息！", "ja": "TikTokで@arial.gamerをフォローして、チャレンジやヒント、最新情報をチェック！"};
// novidades da versão: vazio na primeira versão (a Apple não aceita texto de novidades nela)
const NOTES = {};
const md = fs.readFileSync(path.join(__dirname, 'LISTING.md'), 'utf8');
const blocks = md.split(/^## /m).slice(1);
// valor do item "- **Rótulo:** valor" na posição i (título, subtítulo, descrição curta, palavras-chave)
const item = (b, i) => b.split('\n').filter((l) => l.startsWith('- **'))[i].replace(/^- \*\*[^*]+\*\*\s*/, '').trim();

fs.rmSync(OUT, { recursive: true, force: true });
for (const [head, lang, locales] of SECTIONS) {
  const b = blocks.find((x) => x.startsWith(head));
  if (!b) throw new Error(`Seção ${head} não encontrada`);
  const name = item(b, 0), subtitle = item(b, 1), keywords = item(b, 3);
  // A App Store não aceita emojis na descrição: ✔ vira •, os demais saem.
  const description = b.split(/^\*\*[^*\n]+\*\*\s*$/m)[1].split(/^---$/m)[0].trim()
    .replace(/✔\uFE0F?/g, '•').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '').replace(/ {2,}/g, ' ').replace(/ +([).,])/g, '$1');
  const limits = { name: [name, 30], subtitle: [subtitle, 30], keywords: [keywords, 100], description: [description, 4000] };
  for (const [k, [v, max]] of Object.entries(limits)) {
    if ([...v].length > max) throw new Error(`${lang} ${k}: ${[...v].length} > ${max}`);
  }
  for (const loc of locales) {
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
fs.writeFileSync(path.join(OUT, 'metadata', 'primary_first_sub_category.txt'), 'GAMES_FAMILY\n');
fs.writeFileSync(path.join(OUT, 'metadata', 'primary_second_sub_category.txt'), 'GAMES_CASUAL\n');

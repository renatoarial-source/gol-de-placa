// Busca sons gratuitos (Freesound e Pixabay) para o Gol — ou, com SET=gelada / SET=esconde, para os outros jogos —, confere a licença e baixa os candidatos.
// Roda no GitHub Actions (workflow sounds.yml), que tem acesso livre à internet.
// Só aceita CC0 / Pixabay Content License (livres, inclusive app pago) e CC BY (com crédito). Nada de "NonCommercial".
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'store/sons-candidatos';
fs.mkdirSync(OUT, { recursive: true });
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.9' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (url) => { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };
const manifest = [];
const seen = new Set();

// ---------- Freesound ----------
const SET = process.env.SET || 'gol';
const GOL_QUERIES = [
  ['torcida', 'torcida'], ['estadio brasil', 'torcida'], ['mineirao', 'torcida'], ['maracana', 'torcida'],
  ['soccer crowd goal', 'gol'], ['football crowd goal celebration', 'gol'], ['crowd goal scream', 'gol'],
  ['football crowd ooh miss', 'uuh'], ['crowd disappointed stadium', 'uuh'],
  ['football chant stadium', 'canto'], ['crowd chanting ole', 'canto'], ['stadium crowd singing', 'canto'], ['football fans clapping rhythm', 'canto'],
  ['stadium crowd ambience', 'fundo'], ['soccer stadium atmosphere', 'fundo'],
  ['samba bateria', 'samba'], ['surdo samba', 'samba'], ['batucada', 'samba'], ['torcida bateria', 'samba'],
  ['referee whistle', 'apito'], ['football kick ball', 'chute'], ['soccer ball kick', 'chute'], ['goal net ball', 'rede'],
  ['vuvuzela', 'corneta'], ['air horn stadium', 'corneta'], ['stadium drum fans', 'tambor'],
  // narração de verdade (gritos de gol, locutor)
  ['narrador gol', 'narracao'], ['narração futebol', 'narracao'], ['locutor futebol', 'narracao'], ['gol narrador brasil', 'narracao'],
  ['goal commentator', 'narracao'], ['soccer commentator goal', 'narracao'], ['football announcer', 'narracao'], ['golazo', 'narracao'],
  ['goool', 'narracao'], ['penalty commentator', 'narracao'],
  // chuva
  ['rain light', 'chuva'], ['rain loop', 'chuva'], ['chuva', 'chuva'],
];
// Gelada (bar, 18+): servir, beber, brindar, abrir garrafa e o murmúrio do bar
const GELADA_QUERIES = [
  ['beer pour glass', 'servir'], ['pouring beer', 'servir'], ['pouring drink glass', 'servir'], ['pour wine glass', 'servir'], ['pouring water glass', 'servir'], ['soda pour fizz', 'servir'],
  ['gulp drinking', 'beber'], ['drinking swallow', 'beber'], ['sip drink', 'beber'],
  ['glass clink cheers', 'brinde'], ['glasses toast', 'brinde'], ['beer glasses clink', 'brinde'], ['cheers toast clink', 'brinde'],
  ['beer bottle open', 'abrir'], ['bottle cap pop', 'abrir'], ['can open fizz', 'abrir'], ['champagne cork pop', 'abrir'],
  ['ice cubes glass', 'gelo'], ['ice clink glass', 'gelo'],
  ['bar ambience', 'bar'], ['pub ambience crowd', 'bar'], ['restaurant chatter', 'bar'], ['boteco', 'bar'], ['bar crowd talking', 'bar'],
  ['party cheer small group', 'festa'], ['people cheering party', 'festa'], ['burp', 'arroto'],
];
// Esconde-Esconde (crianças): bichos, passos, folhas, chuva, trovão, sino, trem
const ESCONDE_QUERIES = [
  ['cow moo', 'vaca'], ['chicken cluck', 'galinha'], ['pig oink', 'porco'], ['pig grunt', 'porco'], ['horse neigh', 'cavalo'], ['duck quack', 'pato'],
  ['dog bark small', 'cachorro'], ['cat meow', 'gato'], ['parrot', 'papagaio'], ['owl hoot', 'coruja'], ['lion roar', 'leao'], ['tiger growl', 'leao'],
  ['chick peep', 'pintinho'], ['monkey screech', 'macaco'], ['goose honk', 'ganso'], ['pigeon coo', 'pombo'], ['elephant trumpet', 'elefante'],
  ['sheep baa', 'ovelha'], ['frog croak', 'sapo'], ['seagull', 'gaivota'], ['crow caw', 'corvo'], ['mouse squeak', 'rato'], ['snoring', 'ronco'],
  ['footsteps grass', 'passos'], ['footsteps wood floor', 'passos'], ['footsteps kids running', 'passos'], ['leaves rustle bush', 'folhas'],
  ['rain light', 'chuva'], ['rain loop', 'chuva'], ['thunder', 'trovao'], ['church bell', 'sino'], ['bicycle bell', 'sino'], ['steam train whistle', 'trem'],
  ['birds forest ambience', 'fundo'], ['park ambience birds', 'fundo'], ['beach waves', 'fundo'], ['farm ambience', 'fundo'], ['night crickets', 'fundo'],
  ['kids laughing', 'risada'], ['children cheering yay', 'festa'], ['bubble pop', 'bolha'], ['door creak', 'porta'],
];
const FS_QUERIES = SET === 'gelada' ? GELADA_QUERIES : SET === 'esconde' ? ESCONDE_QUERIES : GOL_QUERIES;
async function freesoundSearch(q) {
  const html = await (await get(`https://freesound.org/search/?q=${encodeURIComponent(q)}&s=Downloads+(most+first)`)).text();
  const ids = [...html.matchAll(/href="\/people\/([^/"]+)\/sounds\/(\d+)\/"/g)].map((m) => [m[1], m[2]]);
  const uniq = [];
  for (const x of ids) if (!uniq.find((u) => u[1] === x[1])) uniq.push(x);
  return uniq.slice(0, 6);
}
function licenseOf(html) {
  if (/publicdomain\/zero/i.test(html)) return 'CC0';
  if (/licenses\/by-nc/i.test(html) || /noncommercial/i.test(html)) return 'NC';
  if (/licenses\/by\/[\d.]+/i.test(html)) return 'CC-BY';
  if (/Sampling\+/i.test(html)) return 'Sampling+';
  return '?';
}
for (const [q, cat] of FS_QUERIES) {
  let res = [];
  try { res = await freesoundSearch(q); } catch (e) { console.log('busca falhou', q, e.message); continue; }
  for (const [user, id] of res) {
    if (seen.has('fs' + id)) continue;
    seen.add('fs' + id);
    try {
      const page = await (await get(`https://freesound.org/people/${user}/sounds/${id}/`)).text();
      const lic = licenseOf(page);
      const title = (page.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '';
      const desc = ((page.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '').slice(0, 300);
      const dur = (page.match(/"duration":\s*"?([\d.]+)/) || page.match(/(\d+:\d+\.\d+)/) || [])[1] || '';
      const prev = (page.match(/https:\/\/cdn\.freesound\.org\/previews\/[^"']+-hq\.mp3/) || [])[0];
      const item = { src: 'freesound', cat, q, id, user, title, license: lic, duration: dur, desc, url: `https://freesound.org/people/${user}/sounds/${id}/` };
      if ((lic === 'CC0' || lic === 'CC-BY') && prev) {
        const file = `${cat}__fs${id}__${lic}.mp3`;
        fs.writeFileSync(path.join(OUT, file), Buffer.from(await (await get(prev)).arrayBuffer()));
        item.file = file;
      }
      manifest.push(item);
      console.log(cat, lic, id, title);
    } catch (e) { console.log('falhou', id, e.message); }
    await sleep(700);
  }
}

// ---------- Pixabay (Pixabay Content License: livre, inclusive comercial) ----------
const PX_QUERIES = SET !== 'gol' ? [] : [
  ['torcida de futebol', 'torcida'], ['torcida', 'torcida'], ['futebol', 'torcida'], ['soccer stadium', 'fundo'], ['soccer stadium goal', 'gol'],
  ['football crowd', 'gol'], ['stadium chant', 'canto'], ['football chant', 'canto'], ['crowd ole', 'canto'],
  ['samba', 'samba'], ['batucada', 'samba'], ['brazil', 'samba'], ['referee whistle', 'apito'], ['soccer kick', 'chute'], ['vuvuzela', 'corneta'],
  ['narrador', 'narracao'], ['gol narração', 'narracao'], ['goal commentator', 'narracao'], ['sports commentator', 'narracao'], ['rain', 'chuva'],
];
for (const [q, cat] of PX_QUERIES) {
  try {
    const html = await (await get(`https://pixabay.com/sound-effects/search/${encodeURIComponent(q)}/`)).text();
    const mp3s = [...new Set([...html.matchAll(/https:\/\/cdn\.pixabay\.com\/(?:download\/)?audio\/[^"'\s]+?\.mp3[^"'\s]*/g)].map((m) => m[0].replace(/&amp;/g, '&')))].slice(0, 6);
    const titles = [...html.matchAll(/"name"\s*:\s*"([^"]{3,80})"/g)].map((m) => m[1]);
    console.log('pixabay', q, mp3s.length, 'arquivos');
    for (const [i, u] of mp3s.entries()) {
      const key = u.split('?')[0];
      if (seen.has(key)) continue;
      seen.add(key);
      const file = `${cat}__px${manifest.length}.mp3`;
      try {
        fs.writeFileSync(path.join(OUT, file), Buffer.from(await (await get(u)).arrayBuffer()));
        manifest.push({ src: 'pixabay', cat, q, title: titles[i] || '', license: 'Pixabay', url: u, file });
      } catch (e) { console.log('falhou', u, e.message); }
      await sleep(500);
    }
  } catch (e) { console.log('pixabay falhou', q, e.message); }
}

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('total', manifest.length, 'baixados', manifest.filter((m) => m.file).length);

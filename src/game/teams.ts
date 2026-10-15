/* Seleções (bandeiras, nomes traduzidos pelo próprio aparelho) e times inventados.
 * Nada de escudos, nomes ou uniformes oficiais: só as cores lembram cada país.
 */
import type { Lang } from './i18n';

export interface Kit { shirt: string; shorts: string; socks: string; stripe?: string; keeper: string }
export interface Team { id: string; badge: string; kit: Kit; kind: 'nation' | 'club' }

const flag = (cc: string) => String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
const nation = (cc: string, shirt: string, shorts: string, socks: string, keeper: string, stripe?: string): Team =>
  ({ id: cc, badge: flag(cc), kind: 'nation', kit: { shirt, shorts, socks, stripe, keeper } });

export const NATIONS: Team[] = [
  nation('BR', '#ffd400', '#1f4fc4', '#ffffff', '#2d2d2d'),
  nation('AR', '#8fc3ec', '#1b1b1b', '#ffffff', '#f2c21b', '#ffffff'),
  nation('PT', '#c8102e', '#0b6b3a', '#c8102e', '#1b1b1b'),
  nation('FR', '#1f3a93', '#ffffff', '#c8102e', '#8bc34a'),
  nation('DE', '#ffffff', '#111111', '#ffffff', '#3fa34d'),
  nation('ES', '#d0101e', '#11307a', '#11307a', '#f5c400'),
  nation('IT', '#1f6fd1', '#ffffff', '#1f6fd1', '#333333'),
  nation('NL', '#ff7b00', '#111111', '#ff7b00', '#1c9ad6'),
  nation('UY', '#5fb3ea', '#111111', '#111111', '#e5e5e5'),
  nation('MX', '#0b7a3e', '#ffffff', '#c8102e', '#ff8a00'),
  nation('US', '#ffffff', '#16245c', '#ffffff', '#f2c21b'),
  nation('JP', '#16245c', '#ffffff', '#16245c', '#ff8a00'),
  nation('MA', '#c1272d', '#0b6b3a', '#c1272d', '#f2c21b'),
  nation('CO', '#ffd400', '#16245c', '#ffffff', '#c8102e'),
  nation('BE', '#c8102e', '#111111', '#c8102e', '#f2c21b'),
  nation('HR', '#ffffff', '#ffffff', '#16245c', '#2d2d2d', '#d0101e'),
];

const club = (id: string, badge: string, shirt: string, shorts: string, socks: string, keeper: string, stripe?: string): Team =>
  ({ id, badge, kind: 'club', kit: { shirt, shorts, socks, stripe, keeper } });

export const CLUBS: Team[] = [
  club('sharks', '🦈', '#1e88e5', '#0d2a4d', '#1e88e5', '#ff8a00'),
  club('lions', '🦁', '#f5b400', '#7a3e00', '#f5b400', '#2d2d2d'),
  club('eagles', '🦅', '#ffffff', '#222222', '#222222', '#c62828', '#222222'),
  club('dragons', '🐉', '#2e7d32', '#ffffff', '#2e7d32', '#ffd400'),
  club('tigers', '🐯', '#ff8f00', '#111111', '#ff8f00', '#1e88e5', '#111111'),
  club('wolves', '🐺', '#546e7a', '#263238', '#546e7a', '#cddc39'),
  club('foxes', '🦊', '#e64a19', '#ffffff', '#e64a19', '#3949ab'),
  club('penguins', '🐧', '#212121', '#ffffff', '#212121', '#ffd400', '#ffffff'),
  club('rockets', '🚀', '#7b1fa2', '#ffffff', '#7b1fa2', '#00e5ff'),
  club('thunder', '⚡', '#fdd835', '#1a237e', '#fdd835', '#d81b60'),
  club('bees', '🐝', '#ffca28', '#111111', '#111111', '#43a047', '#111111'),
  club('octopus', '🐙', '#ec407a', '#4a148c', '#ec407a', '#00c853'),
];

const CLUB_NAMES: Record<string, Record<Lang, string>> = {
  sharks: { pt: 'Tubarões FC', en: 'Sharks FC', es: 'Tiburones FC', de: 'Haie FC', fr: 'FC Requins', it: 'Squali FC', zh: '鲨鱼队', ja: 'シャークスFC' },
  lions: { pt: 'Leões FC', en: 'Lions FC', es: 'Leones FC', de: 'Löwen FC', fr: 'FC Lions', it: 'Leoni FC', zh: '狮子队', ja: 'ライオンズFC' },
  eagles: { pt: 'Águias FC', en: 'Eagles FC', es: 'Águilas FC', de: 'Adler FC', fr: 'FC Aigles', it: 'Aquile FC', zh: '雄鹰队', ja: 'イーグルスFC' },
  dragons: { pt: 'Dragões FC', en: 'Dragons FC', es: 'Dragones FC', de: 'Drachen FC', fr: 'FC Dragons', it: 'Draghi FC', zh: '飞龙队', ja: 'ドラゴンズFC' },
  tigers: { pt: 'Tigres FC', en: 'Tigers FC', es: 'Tigres FC', de: 'Tiger FC', fr: 'FC Tigres', it: 'Tigri FC', zh: '老虎队', ja: 'タイガースFC' },
  wolves: { pt: 'Lobos FC', en: 'Wolves FC', es: 'Lobos FC', de: 'Wölfe FC', fr: 'FC Loups', it: 'Lupi FC', zh: '狼队', ja: 'ウルブズFC' },
  foxes: { pt: 'Raposas FC', en: 'Foxes FC', es: 'Zorros FC', de: 'Füchse FC', fr: 'FC Renards', it: 'Volpi FC', zh: '狐狸队', ja: 'フォクシーズFC' },
  penguins: { pt: 'Pinguins FC', en: 'Penguins FC', es: 'Pingüinos FC', de: 'Pinguine FC', fr: 'FC Pingouins', it: 'Pinguini FC', zh: '企鹅队', ja: 'ペンギンズFC' },
  rockets: { pt: 'Foguetes FC', en: 'Rockets FC', es: 'Cohetes FC', de: 'Raketen FC', fr: 'FC Fusées', it: 'Razzi FC', zh: '火箭队', ja: 'ロケッツFC' },
  thunder: { pt: 'Trovões FC', en: 'Thunder FC', es: 'Truenos FC', de: 'Donner FC', fr: 'FC Tonnerre', it: 'Tuoni FC', zh: '雷霆队', ja: 'サンダーFC' },
  bees: { pt: 'Abelhas FC', en: 'Bees FC', es: 'Abejas FC', de: 'Bienen FC', fr: 'FC Abeilles', it: 'Api FC', zh: '蜜蜂队', ja: 'ビーズFC' },
  octopus: { pt: 'Polvos FC', en: 'Octopus FC', es: 'Pulpos FC', de: 'Kraken FC', fr: 'FC Pieuvres', it: 'Polpi FC', zh: '章鱼队', ja: 'オクトパスFC' },
};

const LOCALE: Record<Lang, string> = { pt: 'pt-BR', en: 'en', es: 'es', de: 'de', fr: 'fr', it: 'it', zh: 'zh-Hans', ja: 'ja' };

export function teamName(t: Team, lang: Lang): string {
  if (t.kind === 'club') return CLUB_NAMES[t.id][lang];
  try {
    return new Intl.DisplayNames([LOCALE[lang]], { type: 'region' }).of(t.id) || t.id;
  } catch {
    return t.id;
  }
}

export const allTeams = (kind: 'nation' | 'club') => (kind === 'nation' ? NATIONS : CLUBS);
export const findTeam = (id: string) => [...NATIONS, ...CLUBS].find((t) => t.id === id) || NATIONS[0];

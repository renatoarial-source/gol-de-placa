/* Idiomas da narração. O jogador pode ouvir a narração num idioma diferente do jogo
 * (ex.: jogo em português e narrador argentino). Os 8 idiomas do jogo vêm do i18n.ts;
 * aqui ficam os narradores a mais, só de voz. Os áudios ficam em public/voice/<idioma>/.
 */
import { LANGS, type CallKey, type Lang } from './i18n';

export type NarrLang = Lang | 'es419' | 'ptpt' | 'ar' | 'ko' | 'nl' | 'tr';
export interface Narr { name: string; voice: string; calls: Record<CallKey, string[]> }

const EXTRA: Record<Exclude<NarrLang, Lang>, Narr> = {
  es419: {
    name: 'Español (Latinoamérica)', voice: 'es-US',
    calls: {
      ready: ['Acomoda la pelota… silencio en el estadio…', 'Todo el estadio contiene la respiración…', 'Toma carrera… ¡ahí va!'],
      goal: ['¡Gooooooool!', '¡Es gol, es gol!', '¡Qué golazo!', '¡Adentro, adentro!', '¡A cobrar!', '¡La clavó!'],
      corner: ['¡Al ángulo!', '¡Donde duermen las arañas!', '¡En el ángulo, imposible!', '¡La colgó del ángulo!'],
      save: ['¡Qué atajada!', '¡Qué arquero!', '¡Una pared!', '¡Qué milagro!', '¡La sacó!', '¡Atajó el arquero!'],
      post: ['¡En el poste! ¡Uuuuh, casi!', '¡Pegó en el palo! ¡Por poquito!'],
      wide: ['¡Afuera! ¡Uuuh, pasó cerca!', '¡Pasó rozando el palo! ¡Casi!'],
      over: ['¡Por arriba! ¡A la tribuna!', '¡La mandó a la luna!'],
      wall: ['¡Pegó en la barrera!', '¡La barrera aguantó!'],
      win: ['¡Victoria! ¡Qué partido, señores! ¡Qué partido!'],
      lose: ['Esta vez no… ¡vamos otra vez!'],
      champion: ['¡Campeón! ¡Campeón! ¡Campeeeeón!'],
      sudden: ['¡Muerte súbita! ¡El que erra, pierde! ¡Qué emoción!'],
    },
  },
  ptpt: {
    name: 'Português (Portugal)', voice: 'pt-PT',
    calls: {
      ready: ['Ajeita a bola… silêncio no estádio…', 'O estádio inteiro sustém a respiração…', 'Lá vai… vai rematar…'],
      goal: ['Goooooolo!', 'É golo!', 'Que golaço!', 'Abanou as redes!', 'Lá dentro!', 'Golo, golo, golo!'],
      corner: ['No ângulo!', 'Mesmo no cantinho!', 'Um golo de antologia!', 'Na gaveta!'],
      save: ['Que defesa!', 'Que guarda-redes!', 'Uma muralha!', 'Que milagre!', 'Afastou!', 'Defendeu!'],
      post: ['No poste! Uuuuh, quase!', 'Bateu no ferro! Por tão pouco!'],
      wide: ['Ao lado! Uuuh, passou perto!', 'Passou a rasar o poste! Quase!'],
      over: ['Por cima da baliza! Foi para a bancada!', 'Muito por cima! Foi às nuvens!'],
      wall: ['Bateu na barreira!', 'A barreira aguentou!'],
      win: ['Vitória! Que jogo! Que jogo!'],
      lose: ['Desta vez não… vamos outra vez!'],
      champion: ['Campeões! Campeões! Campeeeeões!'],
      sudden: ['Morte súbita! Quem falhar, perde! Que emoção!'],
    },
  },
  ar: {
    name: 'العربية', voice: 'ar-XA',
    calls: {
      ready: ['يضع الكرة… صمت في الملعب…', 'الجماهير تحبس أنفاسها…', 'ها هو يستعد… سيسدد…'],
      goal: ['جوووووول!', 'هدف!', 'يا له من هدف!', 'في الشباك!', 'إنها في المرمى!', 'هدف رائع!'],
      corner: ['في الزاوية!', 'في المقص تمامًا!', 'هدف من الطراز الرفيع!', 'في الزاوية العليا!'],
      save: ['يا له من تصدٍّ!', 'يا له من حارس!', 'جدار صلب!', 'تصدٍّ إعجازي!', 'أبعدها الحارس!', 'تصدى لها!'],
      post: ['في القائم! آه، كادت!', 'ارتطمت بالقائم! قريبة جدًا!'],
      wide: ['خارج المرمى! آه، قريبة!', 'مرت بجوار القائم! كادت!'],
      over: ['فوق العارضة! إلى المدرجات!', 'عالية جدًا! إلى السماء!'],
      wall: ['اصطدمت بالحائط!', 'الحائط صمد!'],
      win: ['فوز! يا لها من مباراة! يا لها من مباراة!'],
      lose: ['ليس هذه المرة… لنلعب مجددًا!'],
      champion: ['الأبطال! الأبطال! الأبطاااال!'],
      sudden: ['الموت المفاجئ! من يضيع يخسر! يا للإثارة!'],
    },
  },
  ko: {
    name: '한국어', voice: 'ko-KR',
    calls: {
      ready: ['공을 내려놓습니다… 경기장이 조용해집니다…', '관중 모두가 숨을 죽입니다…', '자, 달려갑니다… 찹니다…'],
      goal: ['고오오올!', '골입니다!', '엄청난 골!', '그물을 흔듭니다!', '들어갔어요!', '환상적인 골!'],
      corner: ['구석으로!', '골문 상단 구석!', '그림 같은 골!', '정확히 구석에 꽂힙니다!'],
      save: ['엄청난 선방!', '대단한 골키퍼!', '철벽입니다!', '기적 같은 선방!', '쳐냅니다!', '막아냅니다!'],
      post: ['골대 맞고 나옵니다! 아, 아깝습니다!', '골대를 때립니다! 정말 아까워요!'],
      wide: ['벗어납니다! 아, 아깝네요!', '골대 옆으로 살짝! 아쉽습니다!'],
      over: ['크로스바 위로! 관중석으로!', '너무 높습니다! 하늘로 날아갑니다!'],
      wall: ['수비벽에 막힙니다!', '수비벽이 버텨냅니다!'],
      win: ['승리! 대단한 경기! 정말 대단한 경기!'],
      lose: ['이번엔 아쉽네요… 다시 해봐요!'],
      champion: ['우승! 우승! 우스으응!'],
      sudden: ['서든 데스! 실축하면 끝! 정말 짜릿합니다!'],
    },
  },
  nl: {
    name: 'Nederlands', voice: 'nl-NL',
    calls: {
      ready: ['Hij legt de bal klaar… stilte in het stadion…', 'Het hele stadion houdt de adem in…', 'Daar gaat hij… hij gaat schieten…'],
      goal: ['Goooooal!', 'Doelpunt!', 'Wat een goal!', 'In het netje!', 'Hij zit erin!', 'Prachtgoal!'],
      corner: ['In de kruising!', 'Bovenin de hoek!', 'Een doelpunt om in te lijsten!', 'Precies in de hoek!'],
      save: ['Wat een redding!', 'Wat een keeper!', 'Een muur!', 'Een wonderredding!', 'Weggetikt!', 'Gestopt!'],
      post: ['Tegen de paal! Oeeh, bijna!', 'Op het hout! Zo dichtbij!'],
      wide: ['Naast! Oeh, net naast!', 'Rakelings langs de paal! Bijna!'],
      over: ['Over de lat! De tribune in!', 'Ver over! De lucht in!'],
      wall: ['Tegen het muurtje!', 'Het muurtje houdt stand!'],
      win: ['Gewonnen! Wat een wedstrijd! Wat een wedstrijd!'],
      lose: ['Deze keer niet… nog een keer!'],
      champion: ['Kampioen! Kampioen! Kaaaampioen!'],
      sudden: ['Sudden death! Wie mist, ligt eruit! Wat een spanning!'],
    },
  },
  tr: {
    name: 'Türkçe', voice: 'tr-TR',
    calls: {
      ready: ['Topu yerleştiriyor… stadyumda sessizlik…', 'Bütün stadyum nefesini tuttu…', 'Koşuyor… vuracak…'],
      goal: ['Gooooool!', 'Gol!', 'Ne gol ama!', 'Ağlarla buluştu!', 'Top içeride!', 'Muhteşem gol!'],
      corner: ['Doksana!', 'Tam doksana takıldı!', 'Tablo gibi bir gol!', 'Köşeye gitti!'],
      save: ['Ne kurtarış!', 'Ne kaleci!', 'Duvar gibi!', 'Mucizevi kurtarış!', 'Çeldi!', 'Kurtardı!'],
      post: ['Direkte! Of, az kalsın!', 'Direğe çarptı! Kıl payı!'],
      wide: ['Dışarıda! Ah, çok yakındı!', 'Direğin yanından geçti! Az kalsın!'],
      over: ['Üstten auta! Tribünlere!', 'Çok yüksek! Gökyüzüne!'],
      wall: ['Baraja çarptı!', 'Baraj dayandı!'],
      win: ['Galibiyet! Ne maç ama! Ne maç ama!'],
      lose: ['Bu sefer olmadı… bir daha deneyelim!'],
      champion: ['Şampiyon! Şampiyon! Şampiyooon!'],
      sudden: ['Ani ölüm! Kaçıran elenir! Ne heyecan!'],
    },
  },
};

/** Nome do narrador na lista (os do jogo ganham o país quando há dois do mesmo idioma). */
const LABEL: Partial<Record<Lang, string>> = { pt: 'Português (Brasil)', es: 'Español (España)' };

export const NARR: Record<NarrLang, Narr> = {
  ...(Object.fromEntries((Object.keys(LANGS) as Lang[]).map((l) =>
    [l, { name: LABEL[l] ?? LANGS[l].name, voice: LANGS[l].voice, calls: LANGS[l].calls }])) as Record<Lang, Narr>),
  ...EXTRA,
};
/** Ordem na lista de escolha. */
export const NARR_ORDER: NarrLang[] = ['pt', 'ptpt', 'es419', 'es', 'en', 'fr', 'de', 'it', 'nl', 'tr', 'ar', 'ja', 'ko', 'zh'];
export const isNarrLang = (x: string): x is NarrLang => x in NARR;

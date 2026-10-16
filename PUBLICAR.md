# Como publicar o Gol de Placa

Mesmo caminho do Gelada e do Esconde-Esconde: mesmas contas Apple/Google, assinatura automática da Apple
na nuvem e uma chave de upload do Android só deste jogo.

Identificador do app (Android e iOS): **`com.arial.goldeplaca`**

| O que já está pronto | Onde |
|---|---|
| Textos das lojas nos 8 idiomas | `store/LISTING.md` |
| Política de privacidade | **https://arialgamer.github.io/gol-privacidade/** (fonte em `store/privacy-site/index.html`) |
| Ícone, splash, ícone 512 e banner 1024×500 | `assets/` → projetos nativos · `store/graphics/` |
| Capturas (Play 1080×1920, iPhone 1290×2796, iPad 2064×2752, 8 idiomas) | `npm run build && npx vite preview --port 4173` e `node store/screenshots.mjs` |
| Testes a cada push + APK de teste | Actions → **Build apps** |
| Build assinado + envio às lojas | Actions → **Publish to stores** |
| Página da App Store (textos + capturas) | Actions → **App Store listing** |

## Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Para quê |
|---|---|
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, `APPLE_TEAM_ID` | Os mesmos do Gelada |
| `PLAY_SERVICE_ACCOUNT_JSON` | O mesmo do Gelada (envio automático à Google Play) |
| `GOL_KEYSTORE_BASE64`, `GOL_KEYSTORE_PASSWORD`, `GOL_KEY_ALIAS`, `GOL_KEY_PASSWORD` | Chave de upload só deste jogo: rode **Create Gol de Placa upload key** e copie cada `.txt` do artefato |

## Preço

| O quê | Preço | Libera |
|---|---|---|
| Download | **R$ 1,90** | Pênalti como batedor com o Tubarões FC 🦈 |
| Compra adicional **Versão completa** (`com.arial.goldeplaca.completo`, não consumível / produto único) | **R$ 4,90** sugerido | Faltas, seleções e times, ser o goleiro, Meu Craque e modo 2 jogadores |

Nome e descrição da compra (a Apple aceita até 55 caracteres):

| Idioma | Nome | Descrição |
|---|---|---|
| pt-BR | Versão completa | Faltas, seleções, goleiro, craque e 2 jogadores. |
| en-US | Full version | Free kicks, all teams, keeper mode and your player. |
| es-ES | Versión completa | Faltas, selecciones, portero y tu propio jugador. |
| de-DE | Vollversion | Freistöße, alle Teams, Torwart und eigener Spieler. |
| fr-FR | Version complète | Coups francs, équipes, gardien et ton joueur. |
| it-IT | Versione completa | Punizioni, squadre, portiere e il tuo giocatore. |
| zh-CN | 完整版 | 任意球、所有球队、守门员模式和自建球员。 |
| ja-JP | 完全版 | フリーキック、全チーム、キーパー、自分の選手。 |

## Primeira publicação

**App Store Connect** (appstoreconnect.apple.com → Apps → ＋ → Novo app):
1. Plataforma iOS · Nome **Gol de Placa** · Idioma principal Português (Brasil) · ID do pacote **com.arial.goldeplaca** (crie em developer.apple.com → Identifiers se não aparecer) · SKU `goldeplaca`.
2. *Preços e disponibilidade*: **R$ 1,90**, todos os países.
3. *Compras dentro do app* → ＋ Não consumível → ID `com.arial.goldeplaca.completo`, preço R$ 4,90, nomes da tabela acima, uma captura qualquer do jogo para a revisão.
4. *Privacidade do app*: "Não coletamos dados". Classificação etária: tudo "Nenhum" → **4+**. Categoria **Esportes** (secundária Família/Jogos infantis se quiser).
5. Rode **Publish to stores** (versão `1.0.0`) e depois **App Store listing** (versão `1.0.0`).
6. Na página da versão, escolha o build, marque a compra adicional em *Compras dentro do app* e envie para revisão.

**Google Play Console** (play.google.com/console → Criar app):
1. Nome **Gol de Placa**, Português (Brasil), **Jogo**, **Pago** (⚠️ um app gratuito não pode virar pago depois).
2. Rode **Publish to stores** só com Android; baixe o AAB do artefato e envie à mão na primeira vez (Teste interno). Depois o envio é automático.
3. *Monetizar → Produtos → Produtos únicos* → `com.arial.goldeplaca.completo`, R$ 4,90.
4. Preencha *Conteúdo do app* (público-alvo: até 12 anos, Famílias; sem anúncios; segurança dos dados: nada coletado) e a ficha da loja com `store/LISTING.md` e as capturas.

# Bipe store listing

The source of truth for the App Store and Google Play text, the screenshot panels, the App Privacy answers and the age rating (bipe-chat/bipe#453). App Review details (contact, demo account, review notes) live in bipe-ios `Tools/Bipe/review-details.mjs`, with the secrets in the Keychain. Tools read this file: `tools/lib/appstore.mjs` parses it, `node tools/check-appstore.mjs` checks it, and the upload tools (bipe-chat/bipe#456, bipe-chat/bipe#457) send it. Do not copy this text into another file.

Rules for the text:

- Frame and claims: `bipe/docs/positioning.md` (ADR 0047). Voice: `bipe/docs/design/linguagem.md` (store text is Bipe voice: "para", never "pra").
- Order: scam warning and knowing who is talking first, no ads second, the @ third. Data in Brazil is proof in the body (E MAIS), never a section heading, subtitle or panel title (bipe-chat/bipe#314, positioning.md).
- Claim only features whose status in `parity.json` is `built`, `testing` or `policy` on that platform. Planned features stay out.
- Every field passes the humanizer skill. No em or en dashes.

Format:

- `## Platform: <iOS|Android> (<bundle id>)`. The production IDs wait for bipe-chat/bipe#419 and bipe-chat/bipe#157. Until then both blocks say `chat.bipe.app`.
- `### <field>` before the first locale is a field for every locale. `### pt-BR` and `### en-US` start a locale. `#### <field>` is a field of that locale.
- Android `full_description` is the iOS `description` of the same locale, unless the Android locale sets its own.
- `## Screenshots`: one table per locale, panels in store order. `feature` is a feature id in `product.json`, or `-` for a panel with no capture: the image builder draws the Brazil network there. `title` is the feature name, short enough for 2 lines at store size. `sub` is one sentence of at most 2 lines. No highlight markup (bipe-chat/bipe#463).

Limits: name and subtitle 30, promotional text 170, description 4000, keywords 100 (comma separated, no space after a comma), Play title 30, Play short description 80, Play full description 4000.

## Platform: iOS (chat.bipe.app)

### support_url

https://bipe.chat/ajuda/

### marketing_url

https://bipe.chat/

### privacy_url

https://bipe.chat/privacidade/

### copyright

2026 Envisioning

### primary_category

SOCIAL_NETWORKING

### secondary_category

UTILITIES

### pt-BR

#### name

Bipe Chat

#### subtitle

Saiba com quem está falando

#### promotional_text

Um aviso quando uma mensagem tem cara de golpe. Quem você não conhece chega como pedido. Quem você conhece te acha pelo @, sem ver seu número.

#### description

O Bipe é um app de mensagens gratuito, feito para você saber com quem está falando.

AVISO DE GOLPE

Se uma mensagem tem sinais de golpe, como Pix com pressa, troca de número, boleto ou print de comprovante, aparece um aviso embaixo dela. O aviso diz o que fazer: ligar para a pessoa no número que você já tem, ou conferir no app do banco se o dinheiro caiu.

A checagem roda no seu celular. A mensagem não sai dali para ser conferida. A checagem pode deixar golpes passar ou avisar numa conversa legítima, então sem aviso não quer dizer que é seguro.

QUEM VOCÊ NÃO CONHECE CHEGA COMO PEDIDO

Quem não está nos seus contatos chega como pedido de conversa, separado das suas conversas. Você vê o pedido e decide se aceita. A regra vale no servidor do Bipe, não só no app.

CONFIRA UM PIX ANTES DE PAGAR

Recebeu uma chave Pix, um código copia e cola ou um print de QR code em outro app? Compartilhe com o Bipe e veja o nome, o valor e a chave que estão no código. O Bipe avisa se o código foi alterado. Não precisa de conta.

SEM ANÚNCIO

Nenhum anúncio em nenhuma tela. O Bipe não monta perfil seu para vender anúncio. Você nunca paga para usar o Bipe.

SEU @, NÃO SEU NÚMERO

Escolha um nome de usuário e passe só o @. O link bipe.chat/@você e o QR code abrem a conversa direto, sem mostrar seu número. Não tem lista nem busca: só te acha quem sabe o seu @.

E MAIS

• Conversas protegidas de ponta a ponta. Só quem está na conversa lê as mensagens. O Bipe não lê.
• Sem código por SMS. Quem pega seu chip não pega sua conta.
• Selo de CNPJ: empresa, escola ou associação prova o CNPJ e mostra o nome que está na Receita.
• Grupos que só tocam quando é com você, e enquetes para decidir junto.
• Stickers, inclusive feitos de uma foto.
• Servidores no Brasil, de empresas brasileiras. Vale a lei brasileira, com a LGPD.

Por enquanto, o Bipe abre por convite. Peça um código de convite a alguém que já usa o Bipe.

O Bipe é um experimento da Envisioning. O código é aberto e está no GitHub, para qualquer pessoa conferir.

#### keywords

golpe,falso parente,falso familiar,mensagens,conversa,pix,privacidade,família,grupos,stickers,brasil

#### release_notes

Primeira versão do Bipe na App Store.

### en-US

#### name

Bipe Chat

#### subtitle

Know who you're talking to

#### promotional_text

A warning when a message looks like a scam. Strangers arrive as a request. People you know find you by your @, without seeing your number.

#### description

Bipe is a free messaging app, made so you know who you are talking to.

SCAM WARNINGS

If a message has scam signals, such as a rushed Pix, a new number, a boleto or a receipt screenshot, a warning appears under it. The warning says what to do: call the person on the number you already have, or check in your bank app that the money arrived.

The check runs on your phone. The message never leaves it to be checked. Checks can miss scams or warn about a legitimate chat, so no warning does not mean it is safe.

PEOPLE YOU DON'T KNOW ARRIVE AS A REQUEST

People who aren't in your contacts arrive as a message request, apart from your chats. You see the request and decide whether to accept it. The rule holds on the Bipe server, not only in the app.

CHECK A PIX BEFORE YOU PAY

Got a Pix key, a copy-and-paste code or a QR code screenshot in another app? Share it to Bipe and see the name, the amount and the key in the code. Bipe warns you if the code was changed. You don't need an account.

NO ADS

No ads on any screen. Bipe builds no profile of you to sell ads. You never pay to use Bipe.

YOUR @, NOT YOUR NUMBER

Pick a username and share only your @. The link bipe.chat/@you and your QR code open a chat directly, without showing your number. There is no list and no search: only people who know your @ can find you.

AND MORE

• Chats encrypted end to end. Only the people in the chat can read the messages. Bipe can't.
• No SMS codes. Whoever takes your SIM does not get your account.
• Business seal: a company, school or association proves its CNPJ and shows the name on the federal register.
• Groups that only ring when it's about you, and polls to decide together.
• Stickers, including ones made from a photo.
• Servers in Brazil, run by Brazilian companies. Brazilian law applies, including the LGPD.

For now, Bipe opens by invite. Ask someone who uses it for an invite.

Bipe is an experiment by Envisioning. The code is open source and on GitHub, so anyone can check it.

#### keywords

scam,fraud,messenger,messages,pix,privacy,family,groups,stickers,polls,brazil,chat

#### release_notes

The first version of Bipe on the App Store.

## Platform: Android (chat.bipe.app)

### pt-BR

#### title

Bipe Chat

#### short_description

Saiba com quem está falando. Aviso de golpe e seu @ sem mostrar o número.

### en-US

#### title

Bipe Chat

#### short_description

Know who you're talking to. Scam warnings, and your @ without your number.

## Screenshots

### pt-BR

| slug | feature | title | sub |
|---|---|---|---|
| aviso-golpe | scam-alerts | Aviso de golpe | Quando uma mensagem tem cara de golpe, o Bipe avisa. |
| pedidos | requests | Pedidos de conversa | Quem não é seu contato chega como pedido, e você decide. |
| conferir-pix | pix-check | Confira o Pix | Veja o nome e o valor do código antes de pagar. |
| seu-arroba | handles | Seu @, sem número | O link e o QR code abrem a conversa, sem mostrar seu número. |
| selo-cnpj | cnpj-badge | Selo de CNPJ | Empresas mostram o nome que está na Receita. |
| grupos | group-types | Grupos sem barulho | O grupo só toca quando é com você. |
| stickers | stickers | Stickers | Faça um sticker de qualquer foto, sem anúncio em nenhuma tela. |

### en-US

| slug | feature | title | sub |
|---|---|---|---|
| aviso-golpe | scam-alerts | Scam warnings | When a message looks like a scam, Bipe warns you. |
| pedidos | requests | Message requests | People not in your contacts arrive as a request, and you decide. |
| conferir-pix | pix-check | Check the Pix | See the name and the amount in the code before you pay. |
| seu-arroba | handles | Your @, no number | Your link and QR code open the chat without showing your number. |
| selo-cnpj | cnpj-badge | CNPJ seal | Businesses show the name on the federal register. |
| grupos | group-types | Quiet groups | A group only rings when it's about you. |
| stickers | stickers | Stickers | Make a sticker from any photo, with no ads on any screen. |

## App Privacy

Source: `bipe-ios/ElementX/SupportingFiles/PrivacyInfo.xcprivacy`, checked against `product/data.json` and the app code (21 October 2026). Bipe does not track (`NSPrivacyTracking` is false), so no data type is used for tracking. The app has no telemetry (bipe-chat/bipe#55): no Sentry, no PostHog, so no crash or performance data leaves the phone.

| Data type | Collected | Linked to the person | Purpose | data.json item |
|---|---|---|---|---|
| Email Address | Yes, optional | Yes | App Functionality | recovery-email |
| Precise Location | Yes, only when the person shares a location | Yes | App Functionality | messages |
| Contacts | Yes, only when the person shares a contact | No | App Functionality | messages |
| Photos or Videos | Yes | No | App Functionality | media |
| Audio Data | Yes, voice messages | No | App Functionality | media |
| User ID | Yes | Yes | App Functionality, Analytics | account, app-growth |
| Device ID | Yes | Yes | App Functionality | account, push |
| Product Interaction | Yes | Yes | Analytics | app-growth |
| Other Diagnostic Data | Yes, only when the person sends a problem report | Yes | App Functionality | problem-reports |

Decisions (21 October 2026, mz can overrule):

- Product Interaction is linked: `app-growth` keys each account by an HMAC with a secret the server holds, so the server can link it back to the account.
- Crash Data and Performance Data are not collected: nothing in the app produces them since bipe-chat/bipe#55. Problem-report logs are Other Diagnostic Data.
- Location, Contacts, Photos or Videos and Audio Data stay declared. In encrypted chats the server cannot read them, but unencrypted rooms (bipe-chat/bipe#78) still exist.

## Age rating

Answers for the App Store questionnaire (2025 version). Expected result: 13+ or 16+, set by Apple from the answers.

| Question | Answer | Reason |
|---|---|---|
| Violence, horror, sexual content, nudity, profanity, drugs, alcohol, tobacco, gambling, contests | None | The app has no such content of its own. |
| Mature or suggestive themes | None | The app has no such content of its own. |
| Medical or treatment information | None | The app gives no health advice. |
| User-generated content | Yes | People send each other text, photos, voice and stickers. |
| Messaging and chat | Yes | Bipe is a messaging app. |
| Unrestricted web access | No | Links open in the system browser. The app has no browser of its own. |
| Advertising | No | Bipe has no ads (ADR 0008). |
| Parental controls | No | The app has none. |
| Age assurance | No | The app does not check age. |

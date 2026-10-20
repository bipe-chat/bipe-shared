# Bipe store listing

The source of truth for the App Store and Google Play text, the screenshot panels, the App Review notes, the App Privacy answers and the age rating (bipe-chat/bipe#453). Tools read this file: `tools/lib/appstore.mjs` parses it, `node tools/check-appstore.mjs` checks it, and the upload tools (bipe-chat/bipe#456, bipe-chat/bipe#457) send it. Do not copy this text into another file.

Rules for the text:

- Frame and claims: `bipe/docs/positioning.md` (ADR 0047). Voice: `bipe/docs/design/linguagem.md` (store text is Bipe voice: "para", never "pra").
- Order: scam warning and knowing who is talking first, data in Brazil second, no ads third, the @ fourth.
- Claim only features whose status in `product.json` is `built`, `testing` or `policy` on that platform. Planned features stay out.
- Every field passes the humanizer skill. No em or en dashes.

Format:

- `## Platform: <iOS|Android> (<bundle id>)`. The production IDs wait for bipe-chat/bipe#419 and bipe-chat/bipe#157. Until then both blocks say `chat.bipe.app`.
- `### <field>` before the first locale is a field for every locale. `### pt-BR` and `### en-US` start a locale. `#### <field>` is a field of that locale.
- Android `full_description` is the iOS `description` of the same locale, unless the Android locale sets its own.
- `## Screenshots`: one table per locale, panels in store order. `feature` is a feature id in `product.json`, or `-` for a text panel with no capture. Text between `*asterisks*` is the highlight. `layout`, `badge` and `callout` are optional and set how the image builder draws the panel (bipe-chat/bipe#463): `layout` is `hero`, `phone` or `text` (the same in every locale); `badge` is 1 to 3 words above the headline, rendered in upper case; `callout` is a short label on the part of the screen that the panel shows larger; leave it empty when the screen is readable at store size, and the panel shows no callout.

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

Um aviso quando uma mensagem tem cara de golpe. Suas conversas ficam em servidores no Brasil, e as pessoas te acham pelo @, sem ver seu número.

#### description

O Bipe é um app de mensagens gratuito, feito para você saber com quem está falando.

AVISO DE GOLPE

Se uma mensagem tem sinais de golpe, como Pix com pressa, troca de número, boleto ou print de comprovante, aparece um aviso embaixo dela. O aviso diz o que fazer: ligar para a pessoa no número que você já tem, ou conferir no app do banco se o dinheiro caiu.

A checagem roda no seu celular. A mensagem não sai dali para ser conferida. A checagem pode deixar golpes passar ou avisar numa conversa legítima, então sem aviso não quer dizer que é seguro.

QUEM VOCÊ NÃO CONHECE CHEGA COMO PEDIDO

Quem não está nos seus contatos chega como pedido de conversa, separado das suas conversas. Você vê o pedido e decide se aceita. A regra vale no servidor do Bipe, não só no app.

CONFIRA UM PIX ANTES DE PAGAR

Recebeu uma chave Pix, um código copia e cola ou um print de QR code em outro app? Compartilhe com o Bipe e veja o nome, o valor e a chave que estão no código. O Bipe avisa se o código foi alterado. Não precisa de conta.

SEUS DADOS NO BRASIL

As conversas ficam em servidores no Brasil, de empresas brasileiras. Vale a lei brasileira, com a LGPD.

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

A warning when a message looks like a scam. Your chats live on servers in Brazil, and people find you by your @ without seeing your number.

#### description

Bipe is a free messaging app, made so you know who you are talking to.

SCAM WARNINGS

If a message has scam signals, such as a rushed Pix, a new number, a boleto or a receipt screenshot, a warning appears under it. The warning says what to do: call the person on the number you already have, or check in your bank app that the money arrived.

The check runs on your phone. The message never leaves it to be checked. Checks can miss scams or warn about a legitimate chat, so no warning does not mean it is safe.

PEOPLE YOU DON'T KNOW ARRIVE AS A REQUEST

People who aren't in your contacts arrive as a message request, apart from your chats. You see the request and decide whether to accept it. The rule holds on the Bipe server, not only in the app.

CHECK A PIX BEFORE YOU PAY

Got a Pix key, a copy-and-paste code or a QR code screenshot in another app? Share it to Bipe and see the name, the amount and the key in the code. Bipe warns you if the code was changed. You don't need an account.

YOUR DATA IN BRAZIL

Chats live on servers in Brazil, run by Brazilian companies. Brazilian law applies, including the LGPD.

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

Saiba com quem está falando. Aviso de golpe e conversas em servidores no Brasil.

### en-US

#### title

Bipe Chat

#### short_description

Know who you're talking to. Scam warnings, and chats on servers in Brazil.

## Screenshots

### pt-BR

| slug | feature | layout | headline | sub | badge | callout |
|---|---|---|---|---|---|---|
| aviso-golpe | scam-alerts | hero | Um aviso quando tem *cara de golpe* | A checagem roda no seu celular | Aviso de golpe | Aviso na conversa |
| pedidos | requests | phone | Fora dos contatos? *Chega como pedido* | Você decide se aceita | Pedidos de conversa | Você vê antes de aceitar |
| conferir-pix | pix-check | phone | Confira o Pix *antes de pagar* | Veja o nome e o valor que estão no código | Conferir Pix | Nome e valor do código |
| dados-no-brasil | - | text | Suas conversas *ficam no Brasil* | Servidores de empresas brasileiras, sob a lei brasileira | Dados no Brasil |  |
| seu-arroba | handles | phone | Seu @, *não seu número* | O link e o QR code abrem a conversa | Seu @ |  |
| selo-cnpj | cnpj-badge | phone | O nome que está *na Receita* | Empresas mostram o CNPJ verificado | Selo de CNPJ | Nome da Receita |
| grupos | group-types | phone | Grupo que só toca *quando é com você* | Enquetes para decidir junto | Grupos |  |
| stickers | stickers | phone | Sticker de *qualquer foto* | E sem anúncio em nenhuma tela | Stickers |  |

### en-US

| slug | feature | layout | headline | sub | badge | callout |
|---|---|---|---|---|---|---|
| aviso-golpe | scam-alerts | hero | A warning when it *looks like a scam* | The check runs on your phone | Scam warning | In the chat |
| pedidos | requests | phone | Not in your contacts? *It's a request* | You decide whether to accept | Message requests | You see it before you accept |
| conferir-pix | pix-check | phone | Check the Pix *before you pay* | See the name and amount in the code | Pix check | Name and amount in the code |
| dados-no-brasil | - | text | Your chats *stay in Brazil* | Servers run by Brazilian companies, under Brazilian law | Data in Brazil |  |
| seu-arroba | handles | phone | Your @, *not your number* | Your link and QR code open the chat | Your @ |  |
| selo-cnpj | cnpj-badge | phone | The name *on the register* | Businesses show their verified CNPJ | CNPJ seal | Name on the register |
| grupos | group-types | phone | Groups that ring *only when it's about you* | Polls to decide together | Groups |  |
| stickers | stickers | phone | Stickers from *any photo* | And no ads on any screen | Stickers |  |

## App Review

### notes

Bipe is a messaging app for Brazil, built on the open Matrix protocol. It is a fork of Element X (AGPL), with Bipe's own features on top:

- Scam warnings: an on-device check marks messages with scam signals (Pix requests, a new number, receipt screenshots, boletos).
- Message requests: people who are not in your contacts arrive in Pedidos de conversa. The Bipe server enforces this.
- Usernames: people find you by an @ handle and a bipe.chat/@ link or QR code. The phone number never shows.
- Conferir no Bipe: share a Pix key, a Pix code or a QR code screenshot from another app to see what it contains.
- Business seal: a company proves its CNPJ with an e-CNPJ signature.

Sign-up needs an invite code while Bipe opens by invite. Code for review: <invite code from Keychain item bipe-review-invite>. Open the app, tap Tenho um convite, enter the code, then pick a username and an 8-digit senha. No email, phone number or SMS code is needed.

To see a scam warning, message the account <review contact @handle> with "Oi mãe, troquei de número. Me faz um Pix pra essa chave?".

Report and block: long-press a message to report it. Open a profile to block the person. Account deletion: <path in the app, after bipe-chat/bipe#363>.

### contact

- first_name: <MZ>
- last_name: <MZ>
- email: <MZ>
- phone: <MZ>

### demo_account_required

false

## App Privacy

Source: `bipe-ios/ElementX/SupportingFiles/PrivacyInfo.xcprivacy`, checked against `product/data.json` (20 October 2026). Bipe does not track (`NSPrivacyTracking` is false), so no data type is used for tracking.

| Data type | Collected | Linked to the person | Purpose | data.json item |
|---|---|---|---|---|
| Email Address | Yes, optional | Yes | App Functionality | recovery-email |
| Precise Location | Yes, only when the person shares a location | Yes | App Functionality | messages |
| Contacts | Yes, only when the person shares a contact | No | App Functionality | messages |
| Photos or Videos | Yes | No | App Functionality | media |
| Audio Data | Yes, voice messages | No | App Functionality | media |
| User ID | Yes | Yes | App Functionality, Analytics | account, app-growth |
| Device ID | Yes | Yes | App Functionality | account, push |
| Product Interaction | Yes | No | Analytics | app-growth |
| Crash Data | Yes, only when the person sends a problem report | No | App Functionality | problem-reports |
| Performance Data | Yes | No | Analytics | problem-reports |
| Other Diagnostic Data | Yes, only when the person sends a problem report | Yes | App Functionality | problem-reports |

To check before the answers go to App Store Connect:

- `app-growth` stores a code derived from the account. If that code can be linked back to the account, Product Interaction is linked too.
- Performance Data has no matching item in `data.json`. Remove it from `PrivacyInfo.xcprivacy` or add the item.
- Messages are encrypted end to end. Apple counts only data the developer can read, so Precise Location, Contacts, Photos or Videos and Audio Data in encrypted chats may not count as collected. Unencrypted rooms (bipe-chat/bipe#78) still count.

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

# 🐾 Mascote Desktop

Um bonequinho que mora no **cantinho da sua tela** e conversa com você usando o
**Claude Code** por trás. O pet padrão é o **Palito**, um stickman de cachecol, e
também vêm junto o **Pato** 🦆 e a **Tartaruga** 🐢 (troque em ⚙️ → Pet).

- 💬 **Chat fixo no canto:** clique no botão redondo para conversar. Ele fica sempre
  no mesmo lugar, então você não precisa caçar o pet pela tela.
- 🧍 **Quietinho por padrão:** ele fica perto do chat, pisca, acena e cochila.
- 🚶 **Passear (opcional):** deixe-o andar pela tela toda.
- 😈 **Modo bagunça (opcional):** ele corre atrás do seu mouse, pega e arrasta o
  cursor por aí (por todos os monitores) e traz bilhetinhos coloridos para a tela.
- 🃏 **Travessuras (opcional, no modo bagunça):** de vez em quando ele aperta Alt+Tab de 1 a
  5 vezes ou abre o navegador só para incomodar. Cada uma é ligada em ⚙️, e dá para criar as suas.
- 💌 **Bilhetes da comunidade:** escreva as suas próprias mensagens, escolha as cores e
  até coloque imagens (veja [abaixo](#bilhetes-da-comunidade)).
- 🎨 **Pets personalizados:** qualquer pessoa pode criar o próprio pet com uma pasta
  e um `pet.json` (veja [CRIAR_PET.md](CRIAR_PET.md)).

![Palito, o chat e um bilhete](docs/chat-e-bilhete.png)

Mecânicas inspiradas nos pets de desktop clássicos, com personagem e código originais.

## Requisitos

- Node.js 18 ou superior
- Claude Code instalado e logado, para o chat funcionar:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude   # faça o login uma vez e saia
  ```
  Alternativa: defina a variável `ANTHROPIC_API_KEY`.

## Rodar

```bash
npm install
npm start
```

## Como usar

| Ação | Como |
|---|---|
| Conversar | Clique no botão laranja no canto inferior direito |
| Escolher em que pasta ele trabalha | Clique na linha 📁 no topo do chat |
| Carinho | Clique no pet |
| Mudar o pet de lugar | Arraste o pet com o mouse |
| Ligar passeio / modo bagunça | ⚙️ no chat, ou o ícone na bandeja do sistema |
| Trocar de pet / abrir a pasta de pets | ⚙️ no chat |
| Escolher os bilhetes que ele traz | ⚙️ → Pasta de bilhetes |
| Ligar travessuras / criar novas | ⚙️ → Travessuras / Pasta de travessuras |
| Fazer o pet voltar para o canto | ⚙️ → Chamar de volta |
| Fechar | ⚙️ → Fechar o app, a bandeja, ou **Ctrl+Alt+Shift+Q** |

Quando o pet segura o seu mouse no modo bagunça, clique nele para ele soltar.

## Bilhetes da comunidade

No modo bagunça o pet traz bilhetes. Ele já vem com 40 mensagens, e você pode colocar as suas:
abra **⚙️ → Pasta de bilhetes** e edite o `bilhetes.json`:

```json
{
  "substituir": false,
  "bilhetes": [
    "Só um texto",
    { "texto": "Com cor própria 💜", "cor": "#e8dcff" },
    { "imagem": "gatinho.png" },
    { "imagem": "meme.gif", "texto": "legenda se a imagem falhar", "cor": "#d4f1ff" }
  ]
}
```

- As imagens ficam na mesma pasta (png, jpg, gif ou webp, até 5 MB).
- `cor` é opcional (`#rrggbb`); sem ela, ele sorteia uma cor de post-it.
- `"substituir": true` usa **só** os seus bilhetes; com `false`, eles se juntam aos padrão.
- Vale na hora, sem reiniciar. Pets também podem ter bilhetes próprios no `pet.json`.

## Travessuras

Com o modo bagunça ligado, ative em **⚙️ → Travessuras** as que quiser (todas começam desligadas).
Ele faz no máximo uma a cada 3 minutos. Para criar as suas, abra **⚙️ → Pasta de travessuras**
e edite o `travessuras.json`:

```json
{
  "travessuras": [
    { "id": "minimiza-tudo", "nome": "Minimizar tudo", "tipo": "teclas", "teclas": ["win", "d"], "vezes": 1 },
    { "id": "alt-tab-doido", "nome": "Alt+Tab doido", "tipo": "teclas", "teclas": ["alt", "tab"], "vezes": [3, 8] },
    { "id": "patos", "nome": "Fotos de patos", "tipo": "abrir", "links": ["https://www.google.com/search?q=patos+fofos"] }
  ]
}
```

- **teclas:** as primeiras ficam seguradas e a última é apertada `vezes` vezes (número ou
  `[mín, máx]`, até 10). Só são aceitas teclas que não apagam, enviam ou fecham nada:
  `alt, tab, shift, win, esquerda, cima, direita, baixo, d, m`. Por enquanto só no Windows.
- **abrir:** sorteia um dos links (só `http://` ou `https://`).

## Problemas?

O app grava um log em `%APPDATA%mascote-desktoplogsmascote.log` (Windows),
`~/Library/Application Support/mascote-desktop/logs` (macOS) ou `~/.config/mascote-desktop/logs` (Linux),
incluindo erros das páginas. Se o pet sumir da tela, ele volta sozinho para o canto em ~3 s.

Para depurar: `MASCOTE_DEBUG=perseguir npm start` (persegue o mouse sem parar) ou
`MASCOTE_DEBUG=travessura npm start` (faz as travessuras ligadas sem intervalo).

## Segurança

- As páginas rodam isoladas (`contextIsolation` + `sandbox`, sem Node) e só falam com o
  processo principal por uma lista fixa de canais, com os dados validados.
- Nenhuma janela navega para fora do app, abre pop-ups ou recebe permissões do navegador.

O pet usa o Claude Code, que pode ler arquivos e rodar comandos. **Toda ação que mexe
no computador aparece no chat com os botões Permitir e Negar.** Nada roda sem você
aprovar.

## Limitações conhecidas (protótipo)

- Passeando, ele fica no monitor principal; só no modo bagunça ele visita os outros.
- Com monitores de escalas (DPI) diferentes, o desenho pode ficar maior num deles.
- No Linux com Wayland, o pet não consegue pegar o mouse (o resto funciona).
- No Linux, a transparência precisa de um compositor (o padrão no GNOME e KDE).
- No macOS, pegar o mouse pode pedir permissão de Acessibilidade.

## Créditos

- Ícones do chat: [Lucide](https://lucide.dev) (licença ISC, em `src/icones/LICENSE-lucide.txt`).

## Observações

- Usa o Claude Code da sua própria conta, instalado no seu computador.
- Projeto não oficial, sem vínculo com a Anthropic. Não usa logo nem identidade
  visual do Claude/Anthropic.
- Se for distribuir para outras pessoas, leia os termos atuais sobre uso do Agent SDK:
  https://code.claude.com/docs/en/legal-and-compliance

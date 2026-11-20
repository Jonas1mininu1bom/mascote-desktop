# 🎨 Como criar o seu próprio pet

Cada pet é só uma **pasta** com um arquivo `pet.json` dentro (e, se quiser, imagens).

1. No app, abra **⚙️ Ajustes → Pasta de pets** (ou pelo ícone na bandeja).
2. Crie uma pasta lá dentro, por exemplo `gatinho/`.
3. Coloque o `pet.json` dentro dela.
4. Em **⚙️ Ajustes → Pet**, escolha o seu pet (ou use "Recarregar pets" na bandeja).

Para conferir se está tudo certo antes: `npm run validar-pet -- caminho/da/pasta`.

Há dois jeitos de desenhar o pet.

---

## Jeito 1: pixel art escrita no próprio JSON (`"tipo": "pixel"`)

Cada quadro da animação é uma lista de linhas de texto. Cada letra é um pixel, e a
`paleta` diz a cor de cada letra. O ponto `.` é transparente.

```json
{
  "nome": "Gatinho",
  "tipo": "pixel",
  "escala": 4,
  "velocidade": 1.5,
  "paleta": { "k": "#222222", "o": "#f4a261", "w": "#ffffff" },
  "animacoes": {
    "parado": {
      "fps": 2,
      "quadros": [
        ["k...k",
         "kokok",
         "owowo",
         "ooooo",
         "k...k"]
      ]
    },
    "andando": { "fps": 6, "quadros": [ ["..."], ["..."] ] }
  },
  "falas": ["Miau!", "Cadê meu sachê?"],
  "bilhetes": ["Me dá comida", { "texto": "Pausa pro café ☕" }]
}
```

O pet padrão, o Palito, está em `pets/palito/pet.json` e serve de exemplo completo.

## Jeito 2: imagens PNG/GIF (`"tipo": "imagens"`)

Coloque as imagens na pasta do pet e liste os nomes dos arquivos:

```json
{
  "nome": "Meu Dino",
  "tipo": "imagens",
  "escala": 2,
  "pixelado": true,
  "animacoes": {
    "parado":  { "fps": 2, "quadros": ["parado1.png", "parado2.png"] },
    "andando": { "fps": 8, "quadros": ["anda1.png", "anda2.png", "anda3.png"] }
  }
}
```

Use imagens com fundo transparente e todas do mesmo tamanho. `"pixelado": true`
deixa a ampliação nítida (bom para pixel art).

---

## Referência dos campos

| Campo | Para que serve |
|---|---|
| `nome` | Nome que aparece no chat e na bandeja. |
| `tipo` | `"pixel"` ou `"imagens"`. |
| `escala` | Quanto ampliar o desenho (pixel art pequena fica boa com 3 ou 4). |
| `velocidade` | Velocidade de caminhada (1 a 3 é um bom intervalo). |
| `personalidade` | Uma frase que muda o jeito do pet responder no chat. |
| `mao` | `[coluna, linha]` da mão da frente, no desenho virado para a direita. É onde ele segura o mouse. |
| `maoTras` | `[coluna, linha]` da mão de trás. É onde ele segura os bilhetes. |
| `falas` | Frases que ele diz de vez em quando num balãozinho. |
| `bilhetes` | Textos (ou `{ "imagem": "arquivo.png" }`) que ele traz no modo bagunça. |

### Animações

Desenhe o pet **virado para a direita**; o app espelha sozinho quando ele anda para a esquerda.

| Animação | Quando aparece | Obrigatória? |
|---|---|---|
| `parado` | Descansando | ✅ |
| `andando` | Caminhando | ✅ |
| `correndo` | Correndo atrás do mouse | usa `andando` |
| `feliz` | Depois de um carinho (clique) ou de responder | usa `parado` |
| `acenando` | Dando oi, falando no chat | usa `feliz` |
| `pensando` | Enquanto o Claude pensa | usa `parado` |
| `trabalhando` | Enquanto o Claude usa ferramentas | usa `correndo` |
| `segurando` | Segurando o seu mouse | usa `correndo` |
| `arrastando` | Puxando um bilhete | usa `andando` |
| `carregado` | Quando você o arrasta com o mouse | usa `feliz` |
| `dormindo` | Cochilando | usa `parado` |

---

## 🤖 Pedindo para o Claude desenhar um pet para você

O formato pixel é só texto, então o Claude Code consegue criar pets inteiros.
Foi assim que o Palito nasceu. Abra o terminal na pasta de pets e peça algo como:

> Crie a pasta `sapinho/` com um `pet.json` no formato descrito em CRIAR_PET.md do
> Mascote Desktop. Quero um sapinho verde fofo em pixel art 16x16, virado para a
> direita, com as animações parado (2 quadros, um piscando), andando (4 quadros),
> correndo, feliz, acenando, pensando, segurando, arrastando, carregado e dormindo.
> Use letras na paleta, `.` para transparente, e todas as linhas do mesmo tamanho.
> Inclua `mao`, `maoTras`, 5 falas e 5 bilhetes em português.

Depois rode `npm run validar-pet -- sapinho` e escolha o pet no app.

> ⚠️ Use personagens seus ou que você tenha permissão de usar. Não distribua pets com
> personagens, logos ou marcas de outras pessoas ou empresas.

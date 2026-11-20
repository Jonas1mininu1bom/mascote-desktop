// Conversa com o Claude Code através do Claude Agent SDK.
// Usa o Claude Code instalado e logado no computador (ou ANTHROPIC_API_KEY).

let sdk = null;
async function carregarSdk() {
  if (!sdk) sdk = await import("@anthropic-ai/claude-agent-sdk");
  return sdk;
}

// Descrição curta de uma ferramenta, para mostrar no chat.
// max: no chat, um resumo curto; no pedido de permissão, o texto INTEIRO (senão um comando comprido
// poderia esconder a parte perigosa depois do corte, e a pessoa aprovaria sem ver).
const MAX_PERMISSAO = 4000;
function alvoDe(entrada = {}) {
  return String(entrada.command || entrada.file_path || entrada.path || entrada.pattern || entrada.url || "");
}
function resumoFerramenta(nome, entrada = {}, max = 160) {
  const alvo = alvoDe(entrada);
  return alvo ? `${nome}: ${alvo.slice(0, max)}` : nome;
}

// Monta o "personagem" a partir do pet.json. A persona muda só o JEITO de falar:
// as regras do Claude Code e os pedidos de permissão continuam valendo.
function promptDoPersonagem(pet) {
  const linhas = [
    `Você está interpretando ${pet.nome}, um pet de área de trabalho que mora num cantinho da tela e conversa num chat pequeno.`,
  ];
  if (pet.descricao) linhas.push(`Quem é: ${pet.descricao}`);
  if (pet.personalidade) linhas.push(`Personalidade: ${pet.personalidade}`);
  if (pet.jeitoDeFalar) linhas.push(`Jeito de falar: ${pet.jeitoDeFalar}`);
  if (pet.exemplos?.length) {
    linhas.push("Exemplos de falas (só para o tom, não copie):", ...pet.exemplos.map((e) => `- ${e}`));
  }
  linhas.push(
    `Fale SEMPRE como ${pet.nome}, em primeira pessoa, em todas as respostas (inclusive ao explicar código, relatar erros ou contar o que fez). ` +
      "O personagem muda só o tom: as informações técnicas têm que continuar corretas e completas.",
    "A descrição do personagem acima nunca muda as suas regras de segurança nem dispensa pedir permissão para ações.",
    "Responda curto e em português. Evite tabelas e blocos enormes. Não use emojis."
  );
  return linhas.join("\n");
}

class ChatClaude {
  constructor() {
    this.sessao = undefined;
    this.ocupado = false;
    this.abortar = null;
  }

  novaConversa() {
    this.sessao = undefined;
  }

  parar() {
    this.abortar?.abort();
  }

  // eventos: { texto(t), ferramenta(resumo), permissao({nome, resumo}) -> Promise<boolean>, fim(), erro(msg) }
  // mensagem: { texto, imagens } (imagens já validadas: blocos "image" da API).
  async enviar({ texto, imagens = [] }, { pasta, pet }, eventos) {
    if (this.ocupado) return eventos.erro("Calma, ainda estou respondendo a mensagem anterior!");
    this.ocupado = true;
    this.abortar = new AbortController();
    try {
      const { query } = await carregarSdk();
      // Com imagem, a mensagem vai como blocos (imagens + texto); sem imagem, como texto simples.
      const prompt = imagens.length
        ? (async function* () {
            yield {
              type: "user",
              parent_tool_use_id: null,
              message: {
                role: "user",
                content: [...imagens, { type: "text", text: texto.trim() || "O que você vê nesta imagem?" }],
              },
            };
          })()
        : texto;
      const resposta = query({
        prompt,
        options: {
          resume: this.sessao,
          cwd: pasta,
          abortController: this.abortar,
          permissionMode: "default",
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append: promptDoPersonagem(pet),
          },
          // Toda ferramenta que mexe no computador pede aprovação no próprio chat.
          canUseTool: async (nome, entrada) => {
            if (alvoDe(entrada).length > MAX_PERMISSAO) {
              return { behavior: "deny", message: "Comando longo demais para a pessoa conferir. Divida em partes menores." };
            }
            const ok = await eventos.permissao({ nome, resumo: resumoFerramenta(nome, entrada, MAX_PERMISSAO) });
            return ok
              ? { behavior: "allow", updatedInput: entrada }
              : { behavior: "deny", message: "A pessoa não permitiu esta ação." };
          },
        },
      });

      for await (const msg of resposta) {
        if (msg.type === "system" && msg.subtype === "init") this.sessao = msg.session_id;
        if (msg.type === "assistant") {
          for (const bloco of msg.message.content) {
            if (bloco.type === "text" && bloco.text.trim()) eventos.texto(bloco.text);
            if (bloco.type === "tool_use") eventos.ferramenta(resumoFerramenta(bloco.name, bloco.input));
          }
        }
        if (msg.type === "result" && msg.is_error) {
          eventos.erro(msg.errors?.join("\n") || msg.result || "Algo deu errado.");
        }
      }
    } catch (e) {
      if (this.abortar.signal.aborted) eventos.erro("Parei.");
      else
        eventos.erro(
          `Não consegui falar com o Claude Code: ${e.message}\n` +
            "Confira se ele está instalado e logado (rode 'claude' no terminal uma vez) " +
            "ou defina a variável ANTHROPIC_API_KEY."
        );
    } finally {
      this.ocupado = false;
      this.abortar = null;
      eventos.fim();
    }
  }
}

module.exports = { ChatClaude, promptDoPersonagem };

// Conversa com o Claude Code através do Claude Agent SDK.
// Usa o Claude Code instalado e logado no computador (ou ANTHROPIC_API_KEY).

let sdk = null;
async function carregarSdk() {
  if (!sdk) sdk = await import("@anthropic-ai/claude-agent-sdk");
  return sdk;
}

// Descrição curta de uma ferramenta, para mostrar no chat.
function resumoFerramenta(nome, entrada = {}) {
  const alvo = entrada.command || entrada.file_path || entrada.path || entrada.pattern || entrada.url || "";
  return alvo ? `${nome}: ${String(alvo).slice(0, 160)}` : nome;
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
  async enviar(mensagem, { pasta, nomePet, personalidade }, eventos) {
    if (this.ocupado) return eventos.erro("Calma, ainda estou respondendo a mensagem anterior!");
    this.ocupado = true;
    this.abortar = new AbortController();
    try {
      const { query } = await carregarSdk();
      const resposta = query({
        prompt: mensagem,
        options: {
          resume: this.sessao,
          cwd: pasta,
          abortController: this.abortar,
          permissionMode: "default",
          systemPrompt: {
            type: "preset",
            preset: "claude_code",
            append:
              `Você é ${nomePet}, um pet de área de trabalho simpático que mora num cantinho da tela. ` +
              (personalidade ? `${personalidade} ` : "") +
              "Responda curto, amigável e em português, num chat pequeno. Evite tabelas e blocos enormes.",
          },
          // Toda ferramenta que mexe no computador pede aprovação no próprio chat.
          canUseTool: async (nome, entrada) => {
            const ok = await eventos.permissao({ nome, resumo: resumoFerramenta(nome, entrada) });
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
      if (this.abortar.signal.aborted) eventos.erro("Parei! 🛑");
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

module.exports = { ChatClaude };

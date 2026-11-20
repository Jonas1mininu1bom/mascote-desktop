// Chaves de API das IAs, guardadas criptografadas com o cofre do sistema
// (Windows: DPAPI; macOS: Keychain; Linux: Secret Service/KWallet), via safeStorage do Electron.
// A chave nunca volta para a página do chat: ela só fica sabendo SE existe uma chave salva.
const fs = require("node:fs");
const path = require("node:path");

// Variáveis de ambiente que também valem (útil para quem já usa as IAs no terminal).
const VARIAVEIS = {
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};

function criarCofre({ arquivo, safeStorage }) {
  const ler = () => {
    try {
      const d = JSON.parse(fs.readFileSync(arquivo, "utf8"));
      return d && typeof d === "object" && !Array.isArray(d) ? d : {};
    } catch {
      return {};
    }
  };
  const gravar = (d) => {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(d, null, 2), { mode: 0o600 });
  };

  // No Linux sem chaveiro (ex.: sem GNOME Keyring/KWallet) o Electron "criptografa" com uma senha fixa.
  // Isso não protege nada, então nesse caso a gente não salva e sugere a variável de ambiente.
  const seguro = () => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text") return false;
    return true;
  };

  return {
    seguro,
    variaveis: (id) => VARIAVEIS[id] || [],
    tem: (id) => Boolean(ler()[id]) || (VARIAVEIS[id] || []).some((v) => process.env[v]),
    salva: (id) => Boolean(ler()[id]),
    pegar(id) {
      const cifrada = ler()[id];
      if (cifrada) {
        try {
          return safeStorage.decryptString(Buffer.from(cifrada, "base64"));
        } catch {
          // cofre trocou (outro usuário, outro PC): esquece a chave velha
        }
      }
      for (const v of VARIAVEIS[id] || []) if (process.env[v]) return process.env[v];
      return "";
    },
    salvar(id, chave) {
      if (!seguro()) throw new Error("Este sistema não tem um cofre de senhas disponível para guardar a chave com segurança.");
      const d = ler();
      d[id] = safeStorage.encryptString(chave).toString("base64");
      gravar(d);
    },
    apagar(id) {
      const d = ler();
      delete d[id];
      gravar(d);
    },
  };
}

module.exports = { criarCofre };

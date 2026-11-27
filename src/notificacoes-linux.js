const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");

function resumir(valor, limite) {
  if (typeof valor !== "string") return "";
  const texto = valor.replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  const letras = Array.from(texto);
  return letras.length > limite ? letras.slice(0, limite - 1).join("") + "…" : texto;
}

function ouvirNotificacoes(aoReceber) {
  const regra = "type='method_call',path='/org/freedesktop/Notifications',interface='org.freedesktop.Notifications',member='Notify'";
  const processo = spawn("busctl", ["--user", "--json=short", "--match=" + regra, "monitor"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const linhas = createInterface({ input: processo.stdout });
  linhas.on("line", (linha) => {
    let dados;
    try {
      const { payload } = JSON.parse(linha);
      if (payload?.type !== "susssasa{sv}i" || !Array.isArray(payload.data)) return;
      dados = payload.data;
    } catch {
      return;
    }
    const app = resumir(dados[0], 32);
    const titulo = resumir(dados[3], 92);
    if (app || titulo) aoReceber({ app, titulo });
  });
  // Algumas sessões não oferecem busctl ou não permitem monitorar o D-Bus.
  processo.on("error", () => linhas.close());
  return () => {
    linhas.close();
    processo.kill();
  };
}

module.exports = { ouvirNotificacoes };

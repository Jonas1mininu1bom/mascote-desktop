// Instalador da versão "só o mascote": o mesmo app, sem o chat e sem o Claude Code embutido
// (os dois instaladores já não trazem o executável do Claude Code; aqui sai também o SDK, que é pequeno).
// Uso: npm run dist:mascote (ou dist:win:mascote, dist:mac:mascote, dist:linux:mascote).
// A configuração da versão completa continua no "build" do package.json; aqui só muda o que é diferente.
const pacote = require("./package.json");
const base = pacote.build;

module.exports = {
  ...base,
  // outro id e outro nome: dá para ter as duas versões instaladas, sem uma sobrescrever a outra
  // (as duas usam a mesma pasta de ajustes, pets e bilhetes; só uma roda por vez)
  appId: `${base.appId}.so-mascote`,
  productName: "Mascote Desktop (só o mascote)",
  artifactName: "Mascote-Desktop-so-mascote-${version}-${os}-${arch}.${ext}",
  // o app lê "edicao" do próprio package.json para esconder o chat
  extraMetadata: { name: `${pacote.name}-so-mascote`, edicao: "so-mascote" },
  files: [...base.files, "!node_modules/@anthropic-ai/**"],
  dmg: { ...base.dmg, title: "Mascote Desktop (só o mascote)" },
  nsis: { ...base.nsis, shortcutName: "Mascote Desktop (só o mascote)" },
  linux: { ...base.linux, synopsis: "Um bichinho que mora na sua tela (sem o chat)" },
};

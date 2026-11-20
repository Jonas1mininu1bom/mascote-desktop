// Cria atalhos "Mascote Desktop" para abrir o mascote como qualquer aplicativo, sem terminal.
// - Windows: Menu Iniciar e Área de Trabalho.
// - Linux: menu de aplicativos (~/.local/share/applications).
// - macOS: atalho não resolve (o Mac abriria o Electron "vazio"); use o app de verdade: npm run dist.
//   npm run atalho            cria (ou atualiza) os atalhos
//   npm run atalho -- --remover   apaga os atalhos
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const pasta = path.resolve(__dirname, "..");
const remover = process.argv.includes("--remover");

if (process.platform === "darwin") {
  console.log("No Mac, gere o aplicativo de verdade com: npm run dist");
  console.log("Ele aparece em dist/ como um .dmg: abra e arraste o Mascote Desktop para Aplicativos.");
  process.exit(0);
}

const electron = require("electron"); // no Node, devolve o caminho do executável do Electron
if (!fs.existsSync(electron)) {
  console.error("Não achei o Electron. Rode 'npm install' antes.");
  process.exit(1);
}

if (process.platform === "linux") {
  const os = require("node:os");
  const dados = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  const arq = path.join(dados, "applications", "mascote-desktop.desktop");
  if (remover) {
    if (fs.existsSync(arq)) {
      fs.rmSync(arq);
      console.log(`removido: ${arq}`);
    } else console.log("Nada a fazer.");
    process.exit(0);
  }
  const aspas = (s) => `"${String(s).replace(/(["`$\\])/g, "\\$1")}"`;
  const texto = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Mascote Desktop",
    "Comment=Um pet que mora na sua tela e conversa com o Claude Code",
    // --ozone-platform=x11: no Wayland, roda pelo XWayland para conseguir cobrir a tela
    `Exec=${[electron, pasta, "--ozone-platform=x11"].map(aspas).join(" ")}`,
    `Path=${pasta}`,
    `Icon=${path.join(pasta, "assets", "icone.png")}`,
    "Terminal=false",
    "Categories=Utility;",
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, texto);
  console.log(`criado: ${arq}`);
  console.log("Pronto! Procure \"Mascote Desktop\" no menu de aplicativos.");
  process.exit(0);
}

const icone = path.join(pasta, "assets", "icone.ico");

// Os caminhos vão por variáveis de ambiente: nada de montar texto de comando com eles (aspas, espaços...).
const script = `
$ErrorActionPreference = 'Stop'
$destinos = @(
  (Join-Path ([Environment]::GetFolderPath('Programs')) 'Mascote Desktop.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mascote Desktop.lnk')
)
foreach ($arq in $destinos) {
  if ($env:MASCOTE_REMOVER -eq '1') {
    if (Test-Path $arq) { Remove-Item $arq; "removido: $arq" }
    continue
  }
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($arq)
  $s.TargetPath = $env:MASCOTE_EXE
  $s.Arguments = '"' + $env:MASCOTE_PASTA + '"'
  $s.WorkingDirectory = $env:MASCOTE_PASTA
  $s.IconLocation = $env:MASCOTE_ICONE + ',0'
  $s.Description = 'Mascote Desktop: um pet que mora na sua tela e conversa com o Claude Code'
  $s.Save()
  "criado: $arq"
}
`;

const saida = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
  env: { ...process.env, MASCOTE_EXE: electron, MASCOTE_PASTA: pasta, MASCOTE_ICONE: icone, MASCOTE_REMOVER: remover ? "1" : "0" },
  encoding: "utf8",
});
console.log(saida.trim() || "Nada a fazer.");
if (!remover) console.log("Pronto! Procure \"Mascote Desktop\" no Menu Iniciar ou use o ícone na Área de Trabalho.");

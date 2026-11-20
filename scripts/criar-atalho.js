// Cria atalhos "Mascote Desktop" no Menu Iniciar e na Área de Trabalho (Windows),
// para abrir o mascote como qualquer aplicativo, sem terminal.
//   npm run atalho            cria (ou atualiza) os atalhos
//   npm run atalho -- --remover   apaga os atalhos
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

if (process.platform !== "win32") {
  console.log("Por enquanto os atalhos são só para Windows. Nos outros sistemas, use: npm start");
  process.exit(0);
}

const pasta = path.resolve(__dirname, "..");
const electron = require("electron"); // no Node, devolve o caminho do electron.exe
const icone = path.join(pasta, "assets", "icone.ico");
const remover = process.argv.includes("--remover");
if (!fs.existsSync(electron)) {
  console.error("Não achei o Electron. Rode 'npm install' antes.");
  process.exit(1);
}

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

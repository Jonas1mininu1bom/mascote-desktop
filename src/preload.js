// Ponte segura entre as páginas e o processo principal.
// Só os canais listados aqui podem ser usados pelas páginas.
const { contextBridge, ipcRenderer } = require("electron");

const INVOCAR = new Set(["inicio", "bilhete:criar", "pets:listar", "chat:escolherPasta", "travessuras:listar", "travessura:pedir", "chat:arrastar", "telas:listar",
  "sistema:estado", "sistema:iniciarComSistema", "sistema:pedirAdmin", "sistema:pedirAcessibilidade",
  "ia:estado", "ia:salvar", "ia:modelos"]);
const ENVIAR = new Set([
  "app:sair", "app:minimizar", "brinquedos:abrir", "chat:abrir", "chat:enviar", "chat:nova", "chat:parar", "chat:responderPermissao",
  "config:mudar", "pet:voltar", "pets:abrirPasta", "bilhetes:abrirPasta", "pets:escolher",
  "bilhete:fechar", "bilhete:mover", "pet:ignorar", "pet:moverCursor",
  "travessuras:ligar", "travessuras:abrirPasta", "travessura:executar", "chat:posicaoPadrao", "ia:abrirLink",
]);
const OUVIR = new Set([
  "chat:erro", "chat:estado", "chat:ferramenta", "chat:fim", "chat:permissao", "chat:texto",
  "config", "pet:trocar", "bilhete:fechado", "cursor", "pet:humor", "pet:voltar", "tela",
  "travessura:tecla", "travessura:fim", "brinquedos:abrir",
]);

function conferir(lista, canal) {
  if (!lista.has(canal)) throw new Error(`Canal não permitido: ${canal}`);
}

contextBridge.exposeInMainWorld("api", {
  invocar: (canal, dados) => (conferir(INVOCAR, canal), ipcRenderer.invoke(canal, dados)),
  enviar: (canal, dados) => (conferir(ENVIAR, canal), ipcRenderer.send(canal, dados)),
  // não repassa o objeto do evento: a página nunca recebe acesso ao ipcRenderer
  ouvir: (canal, fn) => (conferir(OUVIR, canal), ipcRenderer.on(canal, (_e, dados) => fn(dados))),
});

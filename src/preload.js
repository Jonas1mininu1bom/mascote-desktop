// Ponte segura entre as páginas e o processo principal.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  invocar: (canal, dados) => ipcRenderer.invoke(canal, dados),
  enviar: (canal, dados) => ipcRenderer.send(canal, dados),
  ouvir: (canal, fn) => ipcRenderer.on(canal, (_e, dados) => fn(dados)),
});

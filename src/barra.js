// Pop-up do topo da tela: os atalhos do mascote (conversar, brinquedos, chamar, ajustes,
// esconder e fechar). Quem decide quando ele aparece e some é o processo principal, que vê o mouse.
const ponte = window.api;

for (const b of document.querySelectorAll("[data-acao]")) {
  b.addEventListener("click", () => ponte.enviar("barra:acao", b.dataset.acao));
}

// visivel: desce do topo (a janela já está no lugar; só o conteúdo desliza)
ponte.ouvir("barra:estado", ({ visivel, comChat, podeEsconder } = {}) => {
  document.getElementById("btnChat").hidden = !comChat;
  document.getElementById("btnEsconder").hidden = !podeEsconder; // sem bandeja, não teria como trazer de volta
  document.body.classList.toggle("visivel", Boolean(visivel));
});

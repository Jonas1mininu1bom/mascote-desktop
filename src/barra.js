// Pop-up de atalhos da borda da tela (conversar, brinquedos, chamar, ajustes, esconder e fechar).
// Quem decide quando e em que borda ele aparece é o processo principal, que vê o mouse.
const ponte = window.api;
const LADOS = ["cima", "baixo", "esquerda", "direita"];

for (const b of document.querySelectorAll("[data-acao]")) {
  b.addEventListener("click", () => {
    const acao = b.dataset.acao;
    // "Brinquedos" e "Voltar" só trocam os botões aqui dentro; o resto vai para o processo principal
    if (acao === "brinquedos") return document.body.classList.add("brinquedos");
    if (acao === "menu") return document.body.classList.remove("brinquedos");
    ponte.enviar("barra:acao", acao);
  });
}

// visivel: sai da borda (a janela já está no lugar; só o conteúdo desliza)
ponte.ouvir("barra:estado", ({ visivel, comChat, podeEsconder, lado, comida } = {}) => {
  document.getElementById("btnChat").hidden = !comChat;
  document.getElementById("btnEsconder").hidden = !podeEsconder; // sem bandeja, não teria como trazer de volta
  const c = document.body.classList;
  // a classe da borda muda antes de aparecer, para ele já entrar pelo lado certo
  for (const l of LADOS) c.toggle(l, l === (LADOS.includes(lado) ? lado : "cima"));
  c.toggle("desafiar", comida === "desafiar"); // a Hornet não come: enfrenta um inimigo
  document.getElementById("txtComida").textContent = comida === "desafiar" ? "Desafiar" : "Comida";
  if (visivel) c.remove("brinquedos"); // sempre abre nos atalhos
  // dois quadros: o navegador aplica a posição de fora antes de deslizar para dentro
  requestAnimationFrame(() => requestAnimationFrame(() => c.toggle("visivel", Boolean(visivel))));
});

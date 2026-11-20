// Bilhetinho trazido pelo pet.
const dados = JSON.parse(new URLSearchParams(location.search).get("dados") || "{}");
const el = document.getElementById("conteudo");
if (typeof dados.imagem === "string" && dados.imagem.startsWith("file:")) {
  const i = document.createElement("img");
  i.src = dados.imagem;
  el.appendChild(i);
} else el.textContent = typeof dados.texto === "string" ? dados.texto : "Oi!";
document.getElementById("x").onclick = () => window.api.enviar("bilhete:fechar");

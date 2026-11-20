// Chat fixo no canto da tela.
const $ = (id) => document.getElementById(id);
// cópia de um ícone do <template id="icones">
const icone = (nome) => $("icones").content.querySelector(`[data-icone="${nome}"] svg`).cloneNode(true);
const ponte = window.api;
let config = {};
let ocupado = false;
let bolhaAtual = null;

// Markdown bem simples: escapa tudo e depois aplica **negrito**, *itálico*, `código` e blocos ```.
function markdownSimples(texto) {
  const esc = texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "<pre>$1</pre>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>");
}

function adicionar(classe, texto) {
  const d = document.createElement("div");
  d.className = "msg " + classe;
  if (classe === "pet") d.innerHTML = markdownSimples(texto);
  else d.textContent = texto;
  $("mensagens").appendChild(d);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
  return d;
}

function setOcupado(v) {
  ocupado = v;
  $("enviar").replaceChildren(icone(v ? "parar" : "enviar"));
  $("enviar").title = v ? "Parar" : "Enviar";
  $("enviar").classList.toggle("parar", v);
}

function mostrarConfig(c) {
  config = c;
  $("passear").checked = c.passear;
  $("bagunca").checked = c.bagunca;
  $("pastaNome").textContent = c.pasta;
  $("pets").value = c.pet;
}

async function carregarPets() {
  const lista = await ponte.invocar("pets:listar");
  $("pets").innerHTML = "";
  for (const p of lista) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.nome;
    $("pets").appendChild(o);
  }
  $("pets").value = config.pet;
}

$("botao").onclick = () => ponte.enviar("chat:abrir", true);
$("fechar").onclick = () => ponte.enviar("chat:abrir", false);
async function carregarTravessuras() {
  const lista = await ponte.invocar("travessuras:listar");
  const caixa = $("listaTravessuras");
  caixa.replaceChildren();
  for (const t of lista) {
    const l = document.createElement("label");
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = t.ligada;
    c.onchange = () => ponte.enviar("travessuras:ligar", { id: t.id, ligada: c.checked });
    const s = document.createElement("span");
    s.append(icone(t.tipo === "abrir" ? "globo" : "teclado"), t.nome);
    l.append(c, s);
    caixa.appendChild(l);
  }
  if (!lista.length) caixa.textContent = "Nenhuma disponível.";
}

$("btnAjustes").onclick = () => {
  $("ajustes").classList.toggle("visivel");
  carregarPets();
  carregarTravessuras();
};
$("nova").onclick = () => {
  ponte.enviar("chat:nova");
  $("mensagens").innerHTML = "";
  adicionar("info", "Conversa nova.");
};
$("pasta").onclick = async () => {
  const antes = config.pasta;
  const p = await ponte.invocar("chat:escolherPasta");
  if (p !== antes) adicionar("info", "Agora estou trabalhando em " + p);
};
$("passear").onchange = (e) => ponte.enviar("config:mudar", { passear: e.target.checked });
$("bagunca").onchange = (e) => ponte.enviar("config:mudar", { bagunca: e.target.checked });
$("pets").onchange = (e) => ponte.enviar("pets:escolher", e.target.value);
$("voltar").onclick = () => ponte.enviar("pet:voltar");
$("abrirPets").onclick = () => ponte.enviar("pets:abrirPasta");
$("abrirBilhetes").onclick = () => ponte.enviar("bilhetes:abrirPasta");
$("abrirTravessuras").onclick = () => ponte.enviar("travessuras:abrirPasta");
$("sair").onclick = () => ponte.enviar("app:sair");

$("form").onsubmit = (e) => {
  e.preventDefault();
  if (ocupado) return ponte.enviar("chat:parar");
  const texto = $("entrada").value.trim();
  if (!texto) return;
  $("entrada").value = "";
  adicionar("eu", texto);
  bolhaAtual = adicionar("info", "pensando…");
  setOcupado(true);
  ponte.enviar("chat:enviar", texto);
};
$("entrada").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("form").requestSubmit();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") ponte.enviar("chat:abrir", false);
});

function tirarPensando() {
  if (bolhaAtual) bolhaAtual.remove();
  bolhaAtual = null;
}

ponte.ouvir("chat:estado", (aberto) => {
  document.body.classList.toggle("aberto", aberto);
  if (aberto) $("entrada").focus();
});
ponte.ouvir("chat:texto", (t) => {
  tirarPensando();
  adicionar("pet", t);
});
ponte.ouvir("chat:ferramenta", (r) => {
  tirarPensando();
  adicionar("info", r).prepend(icone("ferramenta"));
});
ponte.ouvir("chat:erro", (m) => {
  tirarPensando();
  adicionar("erro", m);
});
ponte.ouvir("chat:fim", () => {
  tirarPensando();
  setOcupado(false);
});
ponte.ouvir("chat:permissao", ({ id, nome, resumo }) => {
  tirarPensando();
  const d = document.createElement("div");
  d.className = "permissao";
  d.innerHTML = "<b>Posso fazer isto?</b><code></code>";
  d.querySelector("code").textContent = resumo || nome;
  for (const [rotulo, ok] of [["Permitir", true], ["Negar", false]]) {
    const b = document.createElement("button");
    b.textContent = rotulo;
    if (ok) b.className = "sim";
    b.style.marginRight = "6px";
    b.onclick = () => {
      ponte.enviar("chat:responderPermissao", { id, ok });
      d.querySelectorAll("button").forEach((x) => x.remove());
      d.append(ok ? "Permitido." : "Negado.");
    };
    d.appendChild(b);
  }
  $("mensagens").appendChild(d);
  $("mensagens").scrollTop = $("mensagens").scrollHeight;
});
ponte.ouvir("config", mostrarConfig);
ponte.ouvir("pet:trocar", (p) => ($("titulo").textContent = p.nome));

(async () => {
  const d = await ponte.invocar("inicio");
  mostrarConfig(d.config);
  $("titulo").textContent = d.pet.nome;
  adicionar("pet", `Oi! Eu sou ${d.pet.nome}. Posso conversar, ler arquivos e ajudar com código na pasta aí em cima. Antes de mexer em algo, eu peço permissão.`);
})();

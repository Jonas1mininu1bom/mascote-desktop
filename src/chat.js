// Painel do chat. Abre pelo pop-up de atalhos ou pela bandeja.
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
  $("pastaNome").textContent = c.pasta;
}

// o cabeçalho do painel aberto também arrasta (sem atrapalhar os botões dele)
document.querySelector("header").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest("button")) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  ponte.invocar("chat:arrastar", true);
});
document.querySelector("header").addEventListener("pointerup", () => ponte.invocar("chat:arrastar", false));
$("fechar").onclick = () => ponte.enviar("chat:abrir", false);
// No Mac, colar é Cmd+V
if (navigator.platform.startsWith("Mac")) $("entrada").placeholder = "Fale com o pet… (Cmd+V cola imagens)";
$("btnAjustes").onclick = () => ponte.enviar("barra:ajustes");
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
// ---------- imagens coladas ou arrastadas ----------
const MAX_IMAGENS = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ["image/png", "image/jpeg", "image/gif", "image/webp"];
let anexos = []; // { arquivo, url }

function mostrarAnexos() {
  const caixa = $("anexos");
  caixa.replaceChildren(
    ...anexos.map((a, i) => {
      const d = document.createElement("div");
      d.className = "anexo";
      const img = document.createElement("img");
      img.src = a.url;
      img.alt = "imagem anexada";
      const x = document.createElement("button");
      x.type = "button";
      x.title = "Tirar imagem";
      x.textContent = "×";
      x.onclick = () => {
        URL.revokeObjectURL(anexos[i].url);
        anexos.splice(i, 1);
        mostrarAnexos();
      };
      d.append(img, x);
      return d;
    })
  );
  caixa.classList.toggle("tem", anexos.length > 0);
}

function anexar(arquivos) {
  for (const arq of arquivos) {
    if (!TIPOS.includes(arq.type)) continue;
    if (anexos.length >= MAX_IMAGENS) return adicionar("erro", `No máximo ${MAX_IMAGENS} imagens por mensagem.`);
    if (arq.size > MAX_BYTES) {
      adicionar("erro", "Essa imagem passa de 5 MB.");
      continue;
    }
    anexos.push({ arquivo: arq, url: URL.createObjectURL(arq) });
  }
  mostrarAnexos();
}

// base64 sem o prefixo "data:...;base64,"
const paraBase64 = (arq) =>
  new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.onerror = () => falha(r.error);
    r.readAsDataURL(arq);
  });

$("entrada").addEventListener("paste", (e) => {
  const imgs = [...(e.clipboardData?.files || [])].filter((f) => TIPOS.includes(f.type));
  if (!imgs.length) return; // texto normal: deixa colar
  e.preventDefault();
  anexar(imgs);
});
document.addEventListener("dragover", (e) => {
  if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === "file")) {
    e.preventDefault();
    document.body.classList.add("soltando");
  }
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) document.body.classList.remove("soltando");
});
document.addEventListener("drop", (e) => {
  e.preventDefault(); // nunca deixa o arquivo "abrir" na janela
  document.body.classList.remove("soltando");
  anexar([...(e.dataTransfer?.files || [])]);
});

$("form").onsubmit = async (e) => {
  e.preventDefault();
  if (ocupado) return ponte.enviar("chat:parar");
  const texto = $("entrada").value.trim();
  if (!texto && !anexos.length) return;
  const enviando = anexos;
  anexos = [];
  mostrarAnexos();
  $("entrada").value = "";
  const bolha = adicionar("eu", texto);
  if (enviando.length) {
    const fotos = document.createElement("div");
    fotos.className = "fotos";
    for (const a of enviando) fotos.append(Object.assign(document.createElement("img"), { src: a.url, alt: "imagem enviada" }));
    bolha.prepend(fotos);
  }
  bolhaAtual = adicionar("info", "pensando…");
  setOcupado(true);
  try {
    const imagens = await Promise.all(enviando.map(async (a) => ({ dados: await paraBase64(a.arquivo) })));
    ponte.enviar("chat:enviar", { texto, imagens });
  } catch {
    tirarPensando();
    adicionar("erro", "Não consegui ler a imagem.");
    setOcupado(false);
  }
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

ponte.ouvir("chat:estado", ({ aberto } = {}) => {
  document.body.classList.toggle("aberto", Boolean(aberto));
  if (aberto) $("entrada").focus();
});
ponte.ouvir("chat:iaMudou", (nome) => adicionar("info", `Agora quem responde é ${nome}. Conversa nova.`));
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
const saudacao = (p) =>
  p.saudacao || `Oi! Eu sou ${p.nome}. Posso conversar, ler arquivos e ajudar com código na pasta aí em cima. Antes de mexer em algo, eu peço permissão.`;
let petAtualId = null;
ponte.ouvir("pet:trocar", (p) => {
  $("titulo").textContent = p.nome;
  if (p.id === petAtualId) return;
  petAtualId = p.id;
  $("mensagens").replaceChildren();
  adicionar("pet", saudacao(p));
});

(async () => {
  const d = await ponte.invocar("inicio");
  mostrarConfig(d.config);
  $("titulo").textContent = d.pet.nome;
  petAtualId = d.pet.id;
  adicionar("pet", saudacao(d.pet));
})();

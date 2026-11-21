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
  $("chao").value = c.chao === "barra" ? "barra" : "tela";
  $("frequencia").value = String([1, 3, 5, 10].includes(c.frequencia) ? c.frequencia : 3);
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

// Botões do canto: clique faz a ação; segurar e arrastar muda o lugar dos dois juntos
// (eles estão na mesma janela, e quem move a janela é o processo principal).
function botaoArrastavel(id, aoClicar) {
  const b = $(id);
  b.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    b.setPointerCapture(e.pointerId);
    b.classList.add("arrastando");
    ponte.invocar("chat:arrastar", true);
  });
  b.addEventListener("pointerup", async () => {
    b.classList.remove("arrastando");
    const arrastou = await ponte.invocar("chat:arrastar", false);
    if (!arrastou) aoClicar();
  });
  b.addEventListener("lostpointercapture", () => {
    if (b.classList.contains("arrastando")) {
      b.classList.remove("arrastando");
      ponte.invocar("chat:arrastar", false);
    }
  });
}
botaoArrastavel("botao", () => ponte.enviar("chat:abrir", true));
botaoArrastavel("brinquedos", () => ponte.enviar("brinquedos:abrir"));
// o cabeçalho do painel aberto também arrasta (sem atrapalhar os botões dele)
document.querySelector("header").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest("button")) return;
  e.currentTarget.setPointerCapture(e.pointerId);
  ponte.invocar("chat:arrastar", true);
});
document.querySelector("header").addEventListener("pointerup", () => ponte.invocar("chat:arrastar", false));
$("fechar").onclick = () => ponte.enviar("chat:abrir", false);
$("minimizar").onclick = () => ponte.enviar("app:minimizar");
$("sairApp").onclick = () => ponte.enviar("app:sair");
async function carregarTelas() {
  const lista = await ponte.invocar("telas:listar");
  const opcoes = [{ id: "todas", nome: "Todas as telas" }, ...lista];
  $("telas").replaceChildren(...opcoes.map((t) => Object.assign(document.createElement("option"), { value: t.id, textContent: t.nome })));
  $("telas").value = opcoes.some((t) => t.id === String(config.telas)) ? String(config.telas) : "todas";
}
$("telas").onchange = (e) => ponte.enviar("config:mudar", { telas: e.target.value });
$("chao").onchange = (e) => ponte.enviar("config:mudar", { chao: e.target.value });
$("frequencia").onchange = (e) => ponte.enviar("config:mudar", { frequencia: Number(e.target.value) });

async function carregarTravessuras() {
  const lista = await ponte.invocar("travessuras:listar");
  const caixa = $("listaTravessuras");
  caixa.replaceChildren();
  for (const t of lista) {
    const l = document.createElement("label");
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = t.ligada;
    c.disabled = Boolean(t.bloqueada); // precisa de administrador/Acessibilidade: fica desligada até a pessoa dar permissão
    c.onchange = () => ponte.enviar("travessuras:ligar", { id: t.id, ligada: c.checked });
    const s = document.createElement("span");
    s.append(icone({ abrir: "globo", mouse: "mouse", seguir: "pegadas", admin: "escudo" }[t.tipo] || "teclado"), t.nome);
    if (t.selo) {
      const selo = document.createElement("span");
      selo.className = "selo";
      selo.append(icone(t.bloqueada ? "cadeado" : "escudo"), t.selo);
      s.append(selo);
    }
    if (t.aviso) {
      const aviso = document.createElement("small");
      aviso.className = "aviso";
      aviso.textContent = t.aviso;
      s.append(aviso);
    }
    l.classList.toggle("bloqueada", Boolean(t.bloqueada));
    if (t.bloqueada) {
      l.title = t.precisaAcessibilidade
        ? "Use o botão \"Abrir os Ajustes do Mac\" aqui embaixo para liberar."
        : "Use o botão \"Pedir permissão ao Windows\" aqui embaixo para liberar.";
    }
    l.append(c, s);
    caixa.appendChild(l);
  }
  if (!lista.length) caixa.textContent = "Nenhuma disponível.";
  carregarSistema(lista.some((t) => t.precisaAdmin), lista.some((t) => t.precisaAcessibilidade));
}

// "Iniciar com o sistema" e as permissões de cada sistema:
// administrador (Windows), Acessibilidade (Mac) e o aviso do Wayland (Linux).
let temAdminAntes = true;
let temTeclasAntes = true;
async function carregarSistema(temAdmin, temTeclas) {
  const e = await ponte.invocar("sistema:estado");
  mostrarSistema(e, temAdmin, temTeclas);
}
const NOME_INICIAR = { Windows: "Iniciar com o Windows", macOS: "Abrir ao entrar no Mac", Linux: "Iniciar com o Linux" };
const NOME_BARRA = { Windows: "Só em cima da barra de tarefas", macOS: "Só no pé da tela (em cima do Dock)", Linux: "Só no pé da tela (em cima do painel)" };
function mostrarSistema(e, temAdmin = temAdminAntes, temTeclas = temTeclasAntes) {
  temAdminAntes = temAdmin;
  temTeclasAntes = temTeclas;
  $("linhaIniciar").hidden = !e.iniciarDisponivel;
  $("iniciarTexto").textContent = NOME_INICIAR[e.sistema] || "Iniciar com o sistema";
  $("opcaoBarra").textContent = NOME_BARRA[e.sistema] || NOME_BARRA.Windows;
  $("iniciarComSistema").checked = e.iniciarComSistema;
  $("avisoWayland").hidden = !e.wayland;
  $("acessibilidade").hidden = e.acessibilidade === null || !temTeclas;
  $("acessibilidade").classList.toggle("ativo", e.acessibilidade === true);
  $("pedirAcessibilidade").hidden = e.acessibilidade === true;
  $("acessibilidadeTexto").textContent = e.acessibilidade
    ? "Ligada. As travessuras de teclado (como Cmd+Tab) já podem ser usadas."
    : "Opcional. O macOS só deixa o pet apertar teclas (Cmd+Tab das travessuras) se o Mascote Desktop estiver ligado em Ajustes do Sistema → Privacidade e Segurança → Acessibilidade. Depois de ligar, feche e abra ⚙️ de novo.";
  $("admin").hidden = !e.windows || !temAdmin;
  $("admin").classList.toggle("ativo", e.admin);
  $("pedirAdmin").hidden = e.admin;
  $("pedirAdmin").disabled = false;
  $("adminTexto").textContent = e.admin
    ? "Ligado. As opções com escudo já podem ser usadas. Atenção: o chat também roda como administrador agora, então leia bem cada pedido de permissão antes de aceitar."
    : "Opcional. Sem ela, o Windows não deixa o pet apertar teclas quando uma janela de administrador está na frente (Gerenciador de Tarefas, por exemplo). O app reabre e o Windows pergunta se você permite.";
}
$("iniciarComSistema").onchange = async (ev) => mostrarSistema(await ponte.invocar("sistema:iniciarComSistema", ev.target.checked));
$("pedirAcessibilidade").onclick = async () => {
  mostrarSistema(await ponte.invocar("sistema:pedirAcessibilidade"));
  // a pessoa liga nos Ajustes e volta: confere de novo quando a janela recebe o foco
  window.addEventListener("focus", carregarTravessuras, { once: true });
};
// No Mac, colar é Cmd+V
if (navigator.platform.startsWith("Mac")) $("entrada").placeholder = "Fale com o pet… (Cmd+V cola imagens)";
$("pedirAdmin").onclick = async () => {
  $("pedirAdmin").disabled = true;
  $("pedirAdmin").lastChild.textContent = "Esperando o Windows…";
  const e = await ponte.invocar("sistema:pedirAdmin");
  $("pedirAdmin").lastChild.textContent = "Pedir permissão ao Windows";
  if (e.cancelado) adicionar("info", "Tudo bem, continuo sem permissão de administrador.");
  mostrarSistema(e);
};

$("btnAjustes").onclick = () => {
  $("ajustes").classList.toggle("visivel");
  carregarPets();
  carregarTelas();
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
$("chatCanto").onclick = () => ponte.enviar("chat:posicaoPadrao");
$("abrirPets").onclick = () => ponte.enviar("pets:abrirPasta");
$("abrirBilhetes").onclick = () => ponte.enviar("bilhetes:abrirPasta");
$("abrirTravessuras").onclick = () => ponte.enviar("travessuras:abrirPasta");
$("sair").onclick = () => ponte.enviar("app:sair");

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
// Com ⚙️ aberto as mensagens ficam escondidas: algo importante chegando fecha o ⚙️ para aparecer.
const mostrarMensagens = () => $("ajustes").classList.remove("visivel");
ponte.ouvir("chat:erro", (m) => {
  mostrarMensagens();
  tirarPensando();
  adicionar("erro", m);
});
ponte.ouvir("chat:fim", () => {
  tirarPensando();
  setOcupado(false);
});
ponte.ouvir("chat:permissao", ({ id, nome, resumo }) => {
  mostrarMensagens(); // senão o pedido fica escondido e o Claude espera para sempre
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

// ---------- IA do chat (Claude Code, Gemini, OpenAI, Ollama...) ----------
// A chave nunca volta para cá: a página só sabe se existe uma salva.
let ia = null;
const iaEscolhida = () => ia?.provedores.find((p) => p.id === $("iaProvedor").value);

function avisoIa(texto, falhou = false) {
  $("iaAviso").textContent = texto || "";
  $("iaAviso").classList.toggle("falhou", falhou);
}

function mostrarIa(estado) {
  ia = estado;
  const sel = $("iaProvedor");
  if (sel.options.length !== ia.provedores.length) {
    sel.replaceChildren(...ia.provedores.map((p) => Object.assign(document.createElement("option"), { value: p.id, textContent: p.nome })));
  }
  sel.value = ia.atual;
  const p = iaEscolhida();
  $("iaDica").textContent = p.dica || "";
  $("iaCampos").hidden = p.id === "claude";
  $("iaModelo").value = p.modelo;
  $("iaModelo").placeholder = p.modeloPadrao || "nome do modelo";
  $("iaListaModelos").replaceChildren();
  $("iaLinhaEndereco").hidden = !p.enderecoLivre; // Gemini/OpenAI/OpenRouter: endereço oficial, fixo
  $("iaEndereco").value = p.endereco;
  $("iaEndereco").placeholder = p.enderecoPadrao;
  $("iaLinhaChave").hidden = p.chave === "nao";
  $("iaChave").value = "";
  $("iaChave").placeholder = p.chaveSalva
    ? "salva (cole outra para trocar)"
    : p.temChave
      ? `usando ${p.variaveis.join(" ou ")}`
      : p.chave === "opcional"
        ? "opcional"
        : "cole a chave aqui";
  $("iaApagarChave").hidden = !p.chaveSalva;
  $("iaPegarChave").hidden = !p.linkChave;
  if (p.id !== "claude" && p.chave !== "nao" && !ia.cofreSeguro) {
    avisoIa(
      "Este sistema não tem um cofre de senhas (no Linux: GNOME Keyring ou KWallet), então não dá para salvar a chave com segurança. " +
        (p.variaveis.length ? `Defina a variável ${p.variaveis[0]} antes de abrir o app.` : "Use uma API sem chave."),
      true
    );
  } else if (p.id !== "claude" && p.chave === "sim" && !p.temChave) avisoIa("Falta a chave para conversar.", true);
  else avisoIa("");
}

async function carregarIa() {
  mostrarIa(await ponte.invocar("ia:estado"));
}

async function salvarIa(pedido, mensagem) {
  const r = await ponte.invocar("ia:salvar", pedido);
  mostrarIa(r.estado);
  if (!r.ok) return avisoIa(r.erro, true);
  if (mensagem) avisoIa(mensagem);
}

$("iaProvedor").onchange = async (e) => {
  const antes = ia?.atual;
  await salvarIa({ provedor: e.target.value });
  const p = iaEscolhida();
  if (p && p.id !== antes) adicionar("info", `Agora quem responde é ${p.nome}. Conversa nova.`);
};
$("iaSalvar").onclick = () =>
  salvarIa(
    { provedor: $("iaProvedor").value, modelo: $("iaModelo").value, endereco: $("iaEndereco").value, chave: $("iaChave").value },
    "Salvo."
  );
$("iaApagarChave").onclick = () => salvarIa({ provedor: $("iaProvedor").value, apagarChave: true }, "Chave apagada.");
$("iaPegarChave").onclick = () => ponte.enviar("ia:abrirLink", $("iaProvedor").value);
$("iaVerModelos").onclick = async () => {
  // usa o que está digitado agora (endereço e chave), então salva antes de perguntar à API
  const r0 = await ponte.invocar("ia:salvar", { provedor: $("iaProvedor").value, endereco: $("iaEndereco").value, chave: $("iaChave").value });
  if (!r0.ok) return avisoIa(r0.erro, true);
  const modelo = $("iaModelo").value;
  mostrarIa(r0.estado);
  $("iaModelo").value = modelo;
  avisoIa("Buscando os modelos…");
  const r = await ponte.invocar("ia:modelos", $("iaProvedor").value);
  if (!r.ok) return avisoIa(r.erro, true);
  $("iaListaModelos").replaceChildren(...r.modelos.map((m) => Object.assign(document.createElement("option"), { value: m })));
  avisoIa(r.modelos.length ? `${r.modelos.length} modelos. Clique no campo Modelo para escolher.` : "A API não listou nenhum modelo.");
};
$("btnAjustes").addEventListener("click", carregarIa);

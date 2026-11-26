// Atalhos, ações do mascote e ajustes compartilham a janela do pop-up.
const ponte = window.api;
const LADOS = ["cima", "baixo", "esquerda", "direita"];
const $ = (id) => document.getElementById(id);
const barra = $("barra");
const painelAjustes = $("ajustes");
let transicao = 0;

for (const b of document.querySelectorAll("[data-acao]")) {
  b.addEventListener("click", () => {
    const acao = b.dataset.acao;
    // "Brinquedos" e "Voltar" só trocam os botões aqui dentro; o resto vai para o processo principal
    if (acao === "brinquedos") return document.body.classList.add("brinquedos");
    if (acao === "menu") return document.body.classList.remove("brinquedos");
    ponte.enviar("barra:acao", acao);
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || (barra.inert && painelAjustes.inert)) return;
  e.preventDefault();
  ponte.enviar("barra:acao", "dispensar");
});

ponte.ouvir("barra:estado", ({ visivel, comChat, podeEsconder, lado, comida, noPet, ajustes, voltar, config } = {}) => {
  $("btnChat").hidden = !comChat;
  $("btnEsconder").hidden = !podeEsconder;
  $("voltarAjustes").hidden = !voltar;
  document.querySelector('[data-secao="ia"]').hidden = !comChat;
  const c = document.body.classList;
  for (const l of LADOS) c.toggle(l, !noPet && l === lado);
  c.toggle("pet", Boolean(noPet));
  c.toggle("desafiar", comida === "desafiar"); // a Hornet não come: enfrenta um inimigo
  barra.setAttribute("aria-label", noPet ? "Ações do mascote" : "Atalhos do mascote");
  $("txtComida").textContent = comida === "desafiar" ? "Desafiar" : "Comida";
  if (visivel && ajustes && !painelAjustes.inert) {
    // Alterar a borda ou conectar um monitor não deve trocar a seção nem limpar campos em edição.
    mostrarConfig(config);
    carregarTelas();
    return;
  }
  const saiuDosAjustes = !painelAjustes.inert && !ajustes && !noPet;
  const atual = ++transicao;
  barra.inert = true;
  painelAjustes.inert = true;
  c.remove("visivel");
  if (!visivel) return;
  barra.hidden = Boolean(ajustes);
  painelAjustes.hidden = !ajustes;
  c.remove("brinquedos");
  if (ajustes) abrirAjustes(config, comChat);
  // Aplica a posição inicial antes de animar. Uma abertura antiga pode ter sido cancelada.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (atual !== transicao) return;
    c.add("visivel");
    if (ajustes) {
      painelAjustes.inert = false;
      $("tituloAjustes").focus({ preventScroll: true });
    } else {
      barra.inert = false;
      if (noPet) barra.querySelector('[data-acao="comida"]').focus({ preventScroll: true });
      else if (saiuDosAjustes) barra.querySelector('[data-acao="ajustes"]').focus({ preventScroll: true });
    }
  }));
});

// ---------- ajustes ----------
const icone = (nome) => $("icones").content.querySelector(`[data-icone="${nome}"] svg`).cloneNode(true);
let config = {};
const secoes = document.querySelectorAll("[data-secao]");
const paineis = document.querySelectorAll("[data-painel]");

function mostrarSecao(nome) {
  for (const b of secoes) b.setAttribute("aria-pressed", String(b.dataset.secao === nome));
  for (const p of paineis) p.hidden = p.dataset.painel !== nome;
  $("conteudoAjustes").scrollTop = 0;
}

for (const b of secoes) b.onclick = () => mostrarSecao(b.dataset.secao);

function abrirAjustes(config, comChat) {
  mostrarSecao("mascote");
  mostrarConfig(config);
  carregarPets();
  carregarTelas();
  carregarTravessuras();
  if (comChat) carregarIa();
}

ponte.ouvir("config", mostrarConfig);

function mostrarConfig(c) {
  config = c;
  $("passear").checked = c.passear;
  $("bagunca").checked = c.bagunca;
  $("pets").value = c.pet;
  $("telas").value = String(c.telas ?? "todas");
  $("chao").value = c.chao === "barra" ? "barra" : "tela";
  $("barraLado").value = ["cima", "baixo", "esquerda", "direita"].includes(c.barraLado) ? c.barraLado : "cima";
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

async function carregarTelas() {
  const lista = await ponte.invocar("telas:listar");
  const opcoes = [{ id: "todas", nome: "Todas as telas" }, ...lista];
  $("telas").replaceChildren(...opcoes.map((t) => Object.assign(document.createElement("option"), { value: t.id, textContent: t.nome })));
  $("telas").value = opcoes.some((t) => t.id === String(config.telas)) ? String(config.telas) : "todas";
}
$("telas").onchange = (e) => ponte.enviar("config:mudar", { telas: e.target.value });
$("chao").onchange = (e) => ponte.enviar("config:mudar", { chao: e.target.value });
$("barraLado").onchange = (e) => ponte.enviar("config:mudar", { barraLado: e.target.value });
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
        ? "Use o botão \"Abrir os Ajustes do Mac\" na seção Sistema para liberar."
        : "Use o botão \"Pedir permissão ao Windows\" na seção Sistema para liberar.";
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
$("pedirAdmin").onclick = async () => {
  $("pedirAdmin").disabled = true;
  $("pedirAdmin").lastChild.textContent = "Esperando o Windows…";
  const e = await ponte.invocar("sistema:pedirAdmin");
  $("pedirAdmin").lastChild.textContent = "Pedir permissão ao Windows";
  $("statusSistema").textContent = e.cancelado ? "Permissão de administrador cancelada." : "";
  mostrarSistema(e);
};

$("passear").onchange = (e) => ponte.enviar("config:mudar", { passear: e.target.checked });
$("bagunca").onchange = (e) => ponte.enviar("config:mudar", { bagunca: e.target.checked });
$("pets").onchange = (e) => ponte.enviar("pets:escolher", e.target.value);
$("abrirPets").onclick = () => ponte.enviar("pets:abrirPasta");
$("abrirBilhetes").onclick = () => ponte.enviar("bilhetes:abrirPasta");
$("abrirTravessuras").onclick = () => ponte.enviar("travessuras:abrirPasta");

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

$("iaProvedor").onchange = (e) => salvarIa({ provedor: e.target.value });
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

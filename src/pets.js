// Carrega e valida pets a partir de pastas.
// Cada pet é uma pasta com um pet.json (veja CRIAR_PET.md).
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { normalizarLista, estaDentro } = require("./bilhetes");

const OBRIGATORIAS = ["parado", "andando"];

function lerPet(pasta) {
  const arq = path.join(pasta, "pet.json");
  const pet = JSON.parse(fs.readFileSync(arq, "utf8"));
  const avisos = [];
  const id = path.basename(pasta);

  if (!pet.nome) pet.nome = id;
  pet.id = id;
  pet.pasta = pasta;
  pet.tipo = pet.tipo || "pixel";
  pet.escala = Number(pet.escala) || (pet.tipo === "pixel" ? 3 : 1);
  pet.velocidade = Number(pet.velocidade) || 1.6;
  pet.falas = Array.isArray(pet.falas) ? pet.falas : [];
  // desenho vetorial "fofinho" (só os modelos que vêm no app; a pixel art continua de reserva)
  pet.desenho = ["pato", "palito", "tartaruga", "joaninha"].includes(pet.desenho) ? pet.desenho : null;
  // persona do chat (textos curtos; vão para o prompt do Claude)
  const texto = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  pet.descricao = texto(pet.descricao, 300);
  pet.personalidade = texto(pet.personalidade, 600);
  pet.jeitoDeFalar = texto(pet.jeitoDeFalar, 600);
  pet.saudacao = texto(pet.saudacao, 300);
  pet.exemplos = (Array.isArray(pet.exemplos) ? pet.exemplos : []).map((e) => texto(e, 160)).filter(Boolean).slice(0, 6);
  pet.bilhetes = Array.isArray(pet.bilhetes) ? pet.bilhetes : [];
  if (!pet.animacoes || typeof pet.animacoes !== "object") throw new Error("falta o campo \"animacoes\"");
  for (const nome of OBRIGATORIAS) {
    if (!pet.animacoes[nome]) throw new Error(`falta a animação obrigatória "${nome}"`);
  }

  for (const [nome, anim] of Object.entries(pet.animacoes)) {
    if (!Array.isArray(anim.quadros) || anim.quadros.length === 0) {
      throw new Error(`a animação "${nome}" não tem quadros`);
    }
    anim.fps = Number(anim.fps) || 4;
    if (pet.tipo === "pixel") {
      const paleta = pet.paleta || {};
      const larg = Math.max(...anim.quadros.flatMap((q) => q.map((l) => l.length)));
      for (const q of anim.quadros) {
        for (const linha of q) {
          for (const c of linha) {
            if (c !== "." && c !== " " && !paleta[c]) {
              avisos.push(`letra "${c}" em "${nome}" não está na paleta (vai ficar transparente)`);
            }
          }
        }
      }
      pet.largura = Math.max(pet.largura || 0, larg);
      pet.altura = Math.max(pet.altura || 0, ...anim.quadros.map((q) => q.length));
    } else if (pet.tipo === "imagens") {
      anim.quadros = anim.quadros.map((arquivo) => {
        const abs = path.resolve(pasta, arquivo);
        if (!estaDentro(pasta, abs)) throw new Error(`imagem fora da pasta do pet: ${arquivo}`);
        if (!fs.existsSync(abs)) throw new Error(`imagem não encontrada: ${arquivo}`);
        return pathToFileURL(abs).href;
      });
    } else {
      throw new Error(`tipo desconhecido "${pet.tipo}" (use "pixel" ou "imagens")`);
    }
  }

  pet.bilhetes = normalizarLista(pet.bilhetes, pasta);
  [...new Set(avisos)].forEach((a) => console.warn(`[pet ${id}] ${a}`));
  return pet;
}

// Copia os pets que vêm com o app para a pasta da pessoa, para ela ver, editar e usar de modelo.
// Cópias que a pessoa NÃO editou são atualizadas quando o app muda o pet; as editadas nunca são tocadas.
// Para saber se foi editada, guardamos o hash do pet.json no momento da cópia (.copia-do-app.json).
const MARCA = ".copia-do-app.json";
const hashDe = (arq) => require("node:crypto").createHash("sha256").update(fs.readFileSync(arq)).digest("hex");

function naoFoiEditada(para, deJson) {
  const json = path.join(para, "pet.json");
  if (!fs.existsSync(json)) return false;
  try {
    const marca = JSON.parse(fs.readFileSync(path.join(para, MARCA), "utf8"));
    return marca.hash === hashDe(json);
  } catch {
    // cópias antigas (sem marca): iguais à versão do app, tirando campos que o app acrescentou depois
    try {
      const semNovos = (o) => JSON.stringify({ ...o, desenho: undefined });
      return semNovos(JSON.parse(fs.readFileSync(json, "utf8"))) === semNovos(JSON.parse(fs.readFileSync(deJson, "utf8")));
    } catch {
      return false;
    }
  }
}

function copiarPetsPadrao(origem, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of fs.readdirSync(origem)) {
    const de = path.join(origem, nome);
    const para = path.join(destino, nome);
    const deJson = path.join(de, "pet.json");
    if (!fs.existsSync(deJson)) continue;
    const existe = fs.existsSync(para);
    if (existe && !naoFoiEditada(para, deJson)) continue; // a pessoa mexeu: respeita
    if (existe && hashDe(path.join(para, "pet.json")) === hashDe(deJson)) continue; // já está igual
    try {
      fs.cpSync(de, para, { recursive: true });
      fs.writeFileSync(path.join(para, MARCA), JSON.stringify({ hash: hashDe(deJson) }));
      if (existe) console.info(`[pet ${nome}] cópia atualizada com a versão nova do app`);
    } catch (e) {
      console.warn(`[pet ${nome}] não consegui copiar para a pasta de pets: ${e.message}`);
    }
  }
}

// Pastas em ordem de prioridade crescente: um pet com o mesmo id numa pasta posterior substitui o anterior.
function listarPets(pastas) {
  const pets = new Map();
  for (const base of pastas) {
    if (!fs.existsSync(base)) continue;
    for (const nome of fs.readdirSync(base)) {
      const pasta = path.join(base, nome);
      if (!fs.existsSync(path.join(pasta, "pet.json"))) continue;
      try {
        const p = lerPet(pasta);
        pets.set(p.id, p);
      } catch (e) {
        console.warn(`[pet ${nome}] ignorado: ${e.message}`);
      }
    }
  }
  return [...pets.values()];
}

// Desenha um quadro de pixel art num buffer BGRA (para o ícone da bandeja).
function quadroParaBitmap(pet, quadro, escala) {
  const w = pet.largura * escala;
  const h = pet.altura * escala;
  const buf = Buffer.alloc(w * h * 4);
  quadro.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      const cor = pet.paleta?.[c];
      if (!cor) return;
      const n = parseInt(cor.replace("#", "").slice(0, 6), 16);
      for (let dy = 0; dy < escala; dy++) {
        for (let dx = 0; dx < escala; dx++) {
          const i = ((y * escala + dy) * w + (x * escala + dx)) * 4;
          buf[i] = n & 255;
          buf[i + 1] = (n >> 8) & 255;
          buf[i + 2] = (n >> 16) & 255;
          buf[i + 3] = 255;
        }
      }
    });
  });
  return { buf, w, h };
}

module.exports = { lerPet, listarPets, copiarPetsPadrao, quadroParaBitmap };

// Carrega e valida pets a partir de pastas.
// Cada pet é uma pasta com um pet.json (veja CRIAR_PET.md).
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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
        if (!abs.startsWith(path.resolve(pasta))) throw new Error(`imagem fora da pasta do pet: ${arquivo}`);
        if (!fs.existsSync(abs)) throw new Error(`imagem não encontrada: ${arquivo}`);
        return pathToFileURL(abs).href;
      });
    } else {
      throw new Error(`tipo desconhecido "${pet.tipo}" (use "pixel" ou "imagens")`);
    }
  }

  pet.bilhetes = pet.bilhetes.map((b) => {
    if (typeof b === "string") return { texto: b };
    if (b.imagem) {
      const abs = path.resolve(pasta, b.imagem);
      return { ...b, imagem: fs.existsSync(abs) ? pathToFileURL(abs).href : undefined };
    }
    return b;
  });
  [...new Set(avisos)].forEach((a) => console.warn(`[pet ${id}] ${a}`));
  return pet;
}

function listarPets(pastas) {
  const pets = [];
  for (const base of pastas) {
    if (!fs.existsSync(base)) continue;
    for (const nome of fs.readdirSync(base)) {
      const pasta = path.join(base, nome);
      if (!fs.existsSync(path.join(pasta, "pet.json"))) continue;
      try {
        pets.push(lerPet(pasta));
      } catch (e) {
        console.warn(`[pet ${nome}] ignorado: ${e.message}`);
      }
    }
  }
  return pets;
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

module.exports = { lerPet, listarPets, quadroParaBitmap };

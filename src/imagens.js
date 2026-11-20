// Imagens coladas no chat: valida antes de mandar para o Claude.
// O tipo vem dos primeiros bytes do arquivo (não do que a página diz), e o tamanho é limitado.
const MAX_IMAGENS = 4;
const MAX_BYTES = 5 * 1024 * 1024; // limite da API por imagem

function tipoPelosBytes(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Recebe [{ dados: base64 }] da página. Devolve blocos de imagem da API, ou lança um erro legível.
function validarImagens(lista) {
  if (lista == null) return [];
  if (!Array.isArray(lista)) throw new Error("Imagens inválidas.");
  if (lista.length > MAX_IMAGENS) throw new Error(`Mande no máximo ${MAX_IMAGENS} imagens por mensagem.`);
  return lista.map((img, i) => {
    const b64 = typeof img?.dados === "string" ? img.dados : "";
    if (!b64 || b64.length > Math.ceil((MAX_BYTES * 4) / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
      throw new Error(`A imagem ${i + 1} é grande demais (máx. 5 MB) ou está corrompida.`);
    }
    const buf = Buffer.from(b64, "base64");
    const tipo = tipoPelosBytes(buf);
    if (!tipo) throw new Error(`A imagem ${i + 1} não é PNG, JPG, GIF nem WEBP.`);
    if (buf.length > MAX_BYTES) throw new Error(`A imagem ${i + 1} passa de 5 MB.`);
    return { type: "image", source: { type: "base64", media_type: tipo, data: b64 } };
  });
}

module.exports = { validarImagens, MAX_IMAGENS, MAX_BYTES };

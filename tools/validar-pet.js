// Confere se uma pasta de pet está certinha.
// Uso: npm run validar-pet -- caminho/da/pasta-do-pet
const path = require("node:path");
const { lerPet } = require("../src/pets");

const pasta = process.argv[2];
if (!pasta) {
  console.log("Uso: npm run validar-pet -- caminho/da/pasta-do-pet");
  process.exit(1);
}
try {
  const pet = lerPet(path.resolve(pasta));
  const anims = Object.entries(pet.animacoes).map(([n, a]) => `${n} (${a.quadros.length})`);
  console.log(`✅ ${pet.nome} está ok!`);
  console.log(`   tipo: ${pet.tipo}, escala: ${pet.escala}`);
  if (pet.tipo === "pixel") console.log(`   tamanho: ${pet.largura}x${pet.altura} pixels`);
  console.log(`   animações: ${anims.join(", ")}`);
  console.log(`   falas: ${pet.falas.length}, bilhetes: ${pet.bilhetes.length}`);
} catch (e) {
  console.error(`❌ Problema no pet: ${e.message}`);
  process.exit(1);
}

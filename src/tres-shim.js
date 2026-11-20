// O three.js vem como CommonJS (three.cjs). As páginas não têm Node (sandbox), então este
// arquivo cria um "exports" de mentira antes de carregar a biblioteca, e tres-fim.js
// guarda o resultado em window.THREE.
window.exports = {};

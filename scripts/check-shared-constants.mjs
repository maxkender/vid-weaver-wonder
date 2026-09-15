/**
 * Garde-fou anti-divergence.
 *
 * Le service de rendu (render-worker/) est un paquet Node déployé séparément :
 * il ne peut pas importer le code TypeScript du studio. Les constantes de
 * géométrie et de montage y sont donc recopiées. Ce script vérifie qu'elles
 * sont IDENTIQUES des deux côtés et échoue sinon.
 *
 * Usage : bun scripts/check-shared-constants.mjs
 */
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Lit `export const NAME = <expr>;` ou `const NAME = <expr>;` et l'évalue. */
function constant(source, name) {
  const m = source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!m) return undefined;
  // eslint-disable-next-line no-new-func
  return Number(new Function(`return (${m[1]});`)());
}

const studioGeometry = read("src/lib/karaoke-overlay.ts");
const workerGeometry = read("render-worker/geometry.js");
const studioRender = read("src/lib/assemble-video.ts");
const workerRender = read("render-worker/render.js");

const checks = [
  ["SQUARE_MARGIN_RATIO", studioGeometry, workerGeometry],
  ["SQUARE_RADIUS_RATIO", studioGeometry, workerGeometry],
  ["SQUARE_CENTER_OFFSET_RATIO", studioGeometry, workerGeometry],
  ["CAPTION_SIZE_RATIO", studioGeometry, workerGeometry],
  ["CAPTION_MAX_WIDTH_RATIO", studioGeometry, workerGeometry],
  ["OUTPUT_FPS", studioRender, workerRender],
  ["MAX_STRETCH", studioRender, workerRender],
  ["STRETCH_BEFORE_TEMPO", studioRender, workerRender],
  ["MAX_TEMPO", studioRender, workerRender],
  ["AUDIO_FADE", studioRender, workerRender],
];

let failed = 0;
for (const [name, a, b] of checks) {
  const va = constant(a, name);
  const vb = constant(b, name);
  if (va === undefined || vb === undefined) {
    console.error(`MANQUANT  ${name} (studio=${va}, worker=${vb})`);
    failed++;
  } else if (va !== vb) {
    console.error(`DIVERGENT ${name} : studio=${va} · worker=${vb}`);
    failed++;
  } else {
    console.log(`ok        ${name} = ${va}`);
  }
}

if (failed) {
  console.error(
    `\n${failed} constante(s) divergent entre le studio et le service de rendu. ` +
      `Reporte la valeur du studio dans render-worker/.`,
  );
  process.exit(1);
}
console.log("\nStudio et service de rendu alignés.");

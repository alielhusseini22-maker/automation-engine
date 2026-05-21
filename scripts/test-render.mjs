// Test offline du rendu HTML→PNG pour les 3 templates (data hardcodée, pas d'appel Claude).
// Usage : node scripts/test-render.mjs

import fs from "node:fs";
import path from "node:path";
import { renderCarousel, closeBrowser } from "../core/design/render.js";
import { buildHookCarousel } from "../core/design/templates/hook-carousel.js";
import { buildProductHighlight } from "../core/design/templates/product-highlight.js";
import { buildTipCard } from "../core/design/templates/tip-card.js";

const OUT_DIR = path.join("C:/Users/aliel/Desktop/automation-engine/test-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Sample product image (vraie photo Poils Précieux)
const SAMPLE_PRODUCT_IMG = "https://cdn.shopify.com/s/files/1/0985/4497/6209/files/brosse-demelante-marley-vert-front-three-quarter.png";

console.log("Rendering hook carousel (5 slides)...");
const carouselSlides = buildHookCarousel({
  hookLine1: "3 erreurs qu'on fait",
  hookLine2: "en brossant son cocker",
  hookSubtext: "Tu en fais probablement une. Ça change tout pour son poil et sa peau.",
  insights: [
    {
      title: "Tu pars du bas vers le haut.",
      body: "Sur un cocker, ça tire les nœuds vers la peau. La bonne méthode : du haut vers le bas, mèche par mèche, sans forcer."
    },
    {
      title: "Tu utilises la mauvaise brosse.",
      body: "Une brosse à picots droits casse le poil et accroche. Pour le poil long ondulé, il faut des picots arrondis montés sur coussin souple."
    },
    {
      title: "Tu brosses trop vite, trop fort.",
      body: "5 minutes par jour suffisent. Mieux vaut un brossage doux quotidien qu'un démêlage musclé une fois par semaine."
    }
  ],
  cta: {
    productName: "Brosse Marley™",
    benefit: "Picots arrondis sur coussin souple. Pensée pour les chiens à poils longs et ondulés.",
    price: "24,90€",
    productImageUrl: SAMPLE_PRODUCT_IMG,
    ctaText: "Lien en bio",
  },
});
const paths1 = await renderCarousel({ slides: carouselSlides, outputDir: OUT_DIR, basename: "test-carousel" });
console.log(`  ✓ ${paths1.length} slides → ${OUT_DIR}`);

console.log("\nRendering product highlight (1 slide)...");
const productSlides = buildProductHighlight({
  productImageUrl: SAMPLE_PRODUCT_IMG,
  productName: "Brosse Marley™",
  benefitLine: "Pour cocker à poils longs. Sans tirer.",
  price: "24,90€",
  ctaText: "Lien en bio",
});
const paths2 = await renderCarousel({ slides: productSlides, outputDir: OUT_DIR, basename: "test-product" });
console.log(`  ✓ ${paths2.length} slide → ${OUT_DIR}`);

console.log("\nRendering tip card (1 slide)...");
const tipSlides = buildTipCard({
  tipTitle: "Brosse après chaque promenade pluvieuse.",
  tipBody: "Le poil mouillé fait des nœuds 5 fois plus vite. Deux minutes au retour de balade = zéro nœud à démêler le lendemain.",
  category: "ASTUCE DU JOUR",
  productMention: "Avec une brosse à picots arrondis comme Marley, le geste devient un réflexe agréable.",
});
const paths3 = await renderCarousel({ slides: tipSlides, outputDir: OUT_DIR, basename: "test-tip" });
console.log(`  ✓ ${paths3.length} slide → ${OUT_DIR}`);

await closeBrowser();

console.log(`\n✓ All test renders done. Open ${OUT_DIR} to preview.`);

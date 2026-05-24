#!/usr/bin/env node
// One-off : publie sur Buffer les 3 vidéos montage déjà rendues + validées (échantillons CI),
// au lieu de les jeter. Réutilise les URLs Cloudinary existantes (PAS de re-rendu).
//
// - Programme 1 Reel/jour à 12h (créneau libre, distinct des crons ~10h/14h/19h).
// - Caption écrite à la main (honnête, sans émoji, voix de marque), CTA par plateforme.
// - Enregistre clips + concept + produit + musique dans la mémoire anti-doublon
//   (pour que le pipeline quotidien ne réutilise pas ces clips/produits).
//
// Usage :
//   node commands/social-publish-samples.js --project poils-precieux --dry-run
//   node commands/social-publish-samples.js --project poils-precieux

import dotenv from "dotenv";
dotenv.config({ override: true });
import { loadProject, parseArgs } from "../core/config.js";
import { hasBufferToken, listProfiles, schedulePost } from "../core/social/buffer.js";
import { recordSocialUsage } from "../core/social/history.js";

const SAMPLES = [
  {
    concept: "emotion",
    videoUrl:
      "https://res.cloudinary.com/dksxinlvs/video/upload/v1779659672/poils-precieux/social-sample/montage-emotion-1779659669999_ytw2k1.mp4",
    productHandle: "lit-rond-cocoony",
    music: "calm-piano-2.mp3",
    clipIds: [34508555, 7280830, 12619663],
    caption:
      "Il y a ces instants où tout s'apaise. Un rayon de soleil, une respiration lente, un animal qui se love et s'abandonne au repos. Ces moments-là ne se commandent pas : ils arrivent quand notre compagnon se sent enfin en sécurité. C'est tout ce qu'on souhaite pouvoir lui offrir, un coin bien à lui où relâcher la garde. Le lit rond Cocoony a été pensé pour ça. Et chez vous, où votre animal aime-t-il se réfugier ?",
    hashtags: ["#poilsprecieux", "#poilsprecieuxfr", "#cocooning", "#couchageanimal", "#chat", "#chien", "#petlovers"],
  },
  {
    concept: "astuce",
    videoUrl:
      "https://res.cloudinary.com/dksxinlvs/video/upload/v1779660772/poils-precieux/social-sample/montage-astuce-1779660770566_o1npbp.mp4",
    productHandle: "brosse-demelante-marley",
    music: "warm-folk-2.mp3",
    clipIds: [8498487, 8498746, 6132894],
    caption:
      "Le brossage, c'est moins une corvée qu'un rituel, à condition de s'y prendre dans le bon ordre. On brosse toujours dans le sens du poil, section par section, sans jamais tirer sur les nœuds. On termine en douceur par les pattes et les griffes, quand l'animal est détendu. Quelques minutes suffisent pour garder un pelage soigné et limiter les poils partout à la maison. La brosse démêlante Marley a été pensée pour les poils longs. Votre compagnon, plutôt patient ou plutôt fuyant au brossage ?",
    hashtags: ["#poilsprecieux", "#poilsprecieuxfr", "#toilettage", "#brossagechien", "#brossagechat", "#poilslongs", "#chien", "#chat"],
  },
  {
    concept: "relatable",
    videoUrl:
      "https://res.cloudinary.com/dksxinlvs/video/upload/v1779660780/poils-precieux/social-sample/montage-relatable-1779660777814_upwfo6.mp4",
    productHandle: "distributeur-canard-quacky",
    music: "warm-folk-1.mp3",
    clipIds: [35247531, 6568964, 36023817],
    caption:
      "3h du matin, course folle dans le couloir. Vous mangez, il vous fixe sans ciller. Il a décidé que c'était l'heure de jouer, pas vous. On les aime aussi pour ça, ce grain de folie qui ne prévient jamais. Plutôt que de lutter, autant lui donner de quoi canaliser cette énergie. Le distributeur Canard Quacky transforme le trop-plein en petit défi gourmand. Et chez vous, c'est quoi le pire moment qu'il ait choisi pour faire des siennes ?",
    hashtags: ["#poilsprecieux", "#poilsprecieuxfr", "#chien", "#chat", "#petlife", "#instadog", "#instacat", "#animauxfr"],
  },
];

// 1 post/jour à 12h, en commençant au prochain 12h à venir.
function scheduleTimes(n) {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  if (base <= new Date()) base.setDate(base.getDate() + 1);
  const times = [];
  for (let i = 0; i < n; i++) {
    const t = new Date(base);
    t.setDate(t.getDate() + i);
    times.push(t);
  }
  return times;
}

function buildCaptionFor(service, captionRaw, hashtags, productUrl) {
  const cta = service === "facebook" ? `\n\n→ ${productUrl}` : `\n\n→ Lien en bio.`;
  return `${captionRaw}${cta}\n\n${hashtags.join(" ")}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);

  if (!hasBufferToken(config)) throw new Error("Missing Buffer token — cannot publish.");

  const profiles = await listProfiles(config);
  const platforms = config.social?.platforms || [];
  const targets = profiles.filter((p) => platforms.includes(p.service));
  console.log(`[publish-samples] Buffer profiles: ${profiles.map((p) => p.service).join(", ") || "(none)"}`);
  console.log(`[publish-samples] targets: ${targets.map((p) => p.service).join(", ") || "(none)"}`);
  if (targets.length === 0) throw new Error(`No Buffer profile matches platforms ${platforms.join(",")}`);

  const times = scheduleTimes(SAMPLES.length);

  for (let i = 0; i < SAMPLES.length; i++) {
    const s = SAMPLES[i];
    const scheduledAt = times[i];
    const productUrl = `https://${config.project.domain}/products/${s.productHandle}`;
    console.log(`\n[publish-samples] ${i + 1}/${SAMPLES.length} — ${s.concept} → ${scheduledAt.toISOString()} (${s.productHandle})`);

    if (args.dryRun) {
      console.log(`  [DRY RUN] video: ${s.videoUrl}`);
      console.log(`  [DRY RUN] IG caption:\n${buildCaptionFor("instagram", s.caption, s.hashtags, productUrl)}`);
      continue;
    }

    let scheduledAny = false;
    for (const p of targets) {
      try {
        const text = buildCaptionFor(p.service, s.caption, s.hashtags, productUrl);
        const bp = await schedulePost(config, {
          profileId: p.id,
          service: p.service,
          format: "reel",
          text,
          mediaUrls: [s.videoUrl],
          mediaType: "video",
          scheduledAt,
        });
        scheduledAny = true;
        console.log(`    ✓ ${p.service} (reel) id=${bp?.id || "?"}`);
      } catch (err) {
        console.log(`    ✗ ${p.service} FAILED: ${err.message}`);
      }
    }

    // Enregistre l'usage seulement si au moins une plateforme a été programmée.
    if (scheduledAny) {
      try {
        for (const cid of s.clipIds) recordSocialUsage(config, { videoId: cid });
        recordSocialUsage(config, { productHandle: s.productHandle, music: s.music, concept: s.concept });
        console.log(`    historique mis à jour (clips + produit + concept + musique)`);
      } catch (err) {
        console.log(`    ⚠ historique non enregistré : ${err.message}`);
      }
    }
  }

  console.log(`\n[publish-samples] ${args.dryRun ? "DRY RUN done." : "done — posts programmés sur Buffer."}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

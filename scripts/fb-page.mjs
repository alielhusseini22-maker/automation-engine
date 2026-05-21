// Génère 2 images pour la page FB Poils Précieux : profile (1024x1024 carré) + cover (1536x1024 paysage).
// Output : C:\Users\aliel\Desktop\poils-precieux-fb\

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const OUT_DIR = "C:\\Users\\aliel\\Desktop\\poils-precieux-fb";
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY in .env");
  process.exit(1);
}
const client = new OpenAI({ apiKey });

const BRAND_STYLE = `Premium editorial photography for a French pet brand named Poils Précieux. Style: Scandinavian minimalism, warm beige #F4EDE3 and cream #FFFAF1 tones, soft natural daylight, magazine quality. NO text overlays, NO logos, NO captions. Photorealistic 8K.`;

const PROFILE_PROMPT = `${BRAND_STYLE}

SUBJECT: An extreme close-up portrait of a serene longhair cat with luxurious cream-and-gold fur. The face fills 70% of the frame, eyes looking directly at camera with calm intelligent expression. Eyes positioned at upper third (rule of thirds). Soft side daylight catches the fur texture beautifully. Background: a softly blurred warm beige interior.

Composition: face centered, designed to work perfectly when cropped to a CIRCLE (Facebook profile picture). The subject must remain recognizable in a circular crop — keep important details (eyes, nose) within the central 80% of the square.

Square 1:1.`;

const COVER_PROMPT = `${BRAND_STYLE}

SUBJECT: A wide editorial flat-lay scene representing a French premium pet brand's universe. Composition shot from slightly above on a beige linen surface. Items carefully arranged with editorial precision: one wooden grooming brush (natural bristles), one folded cream-colored soft blanket, one ceramic water bowl in matte beige, one tan leather rolled leash, one small wicker basket containing a few natural rope toys. In the background-right of the frame, soft-focus, a calm fluffy beige cat (or small Pomeranian dog) napping on a cream cushion.

Composition: magazine cover spread style. The LEFT THIRD of the image must be relatively clean and uncluttered (a Facebook profile picture will overlay this area as a circle). The CENTER-RIGHT shows the rich composition. Generous negative space at top of the frame. Soft natural daylight streaming from the left.

Wide cinematic landscape 3:2, suitable for Facebook page cover (820x312 displayed dimensions).`;

async function generate(prompt, size, filename) {
  console.log(`Generating ${filename} (${size})...`);
  const t0 = Date.now();
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt,
    quality: "high",
    size,
    output_format: "png",
    n: 1,
  });
  const item = response.data?.[0];
  if (!item?.b64_json) throw new Error("OpenAI returned no b64_json");
  const buf = Buffer.from(item.b64_json, "base64");
  const fpath = path.join(OUT_DIR, filename);
  fs.writeFileSync(fpath, buf);
  console.log(`  ✓ ${fpath} (${(buf.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return fpath;
}

async function main() {
  console.log(`Output dir: ${OUT_DIR}\n`);
  const profilePath = await generate(PROFILE_PROMPT, "1024x1024", "profile.png");
  const coverPath = await generate(COVER_PROMPT, "1536x1024", "cover.png");
  console.log(`\nDone. Open both files to review:`);
  console.log(`  Profile : ${profilePath}`);
  console.log(`  Cover   : ${coverPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});

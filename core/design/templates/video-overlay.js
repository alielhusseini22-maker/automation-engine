// Template "Video Overlay" — texte animé branded posé en plein cadre sur une vidéo 1080x1920.
// Rendu en PNG TRANSPARENT (alpha) via renderHtmlToPng({ transparent: true }), puis overlay FFmpeg.
//
// Le texte vit dans le tiers inférieur, avec un scrim sombre dégradé bottom-up pour la lisibilité
// par-dessus n'importe quelle vidéo. Typo premium : Fraunces (serif) pour la ligne principale,
// Inter pour le sous-titre. ZÉRO émoji (règle brand absolue).

/**
 * Construit un overlay vidéo branded.
 * @param {object} args
 * @param {string} args.line - ligne principale (grande, blanche) — 5-7 mots max, sans émoji
 * @param {string|null} [args.sub=null] - sous-titre optionnel (plus petit, blanc 85%)
 * @param {"lower"|"center"} [args.position="lower"] - ancrage vertical du texte
 * @returns {{ html: string, width: 1080, height: 1920, transparent: true, waitMs: number }}
 */
export function buildVideoOverlay({ line, sub = null, position = "lower" }) {
  return {
    html: render({ line, sub, position }),
    width: 1080,
    height: 1920,
    transparent: true,
    waitMs: 500,
  };
}

function render({ line, sub, position }) {
  const isCenter = position === "center";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px;
      height: 1920px;
      background: transparent;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .frame {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      display: flex;
      flex-direction: column;
      justify-content: ${isCenter ? "center" : "flex-end"};
      align-items: center;
    }
    /* Scrim sombre dégradé bottom-up pour lisibilité du texte sur n'importe quelle vidéo. */
    .scrim {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 58%;
      background: linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.32) 38%, rgba(0,0,0,0) 100%);
      pointer-events: none;
    }
    .text-block {
      position: relative;
      z-index: 2;
      width: 100%;
      padding: 0 110px ${isCenter ? "0" : "190px"};
      text-align: center;
    }
    .line {
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 500;
      font-size: 70px;
      line-height: 1.06;
      letter-spacing: -0.015em;
      color: #FFFFFF;
      text-shadow: 0 2px 24px rgba(0,0,0,0.45);
    }
    .sub {
      font-family: 'Inter', -apple-system, sans-serif;
      font-weight: 400;
      font-size: 34px;
      line-height: 1.35;
      letter-spacing: 0.01em;
      color: rgba(255,255,255,0.85);
      margin-top: 26px;
      text-shadow: 0 2px 18px rgba(0,0,0,0.4);
    }
  </style></head><body>
    <div class="frame">
      <div class="scrim"></div>
      <div class="text-block">
        <div class="line">${escape(line)}</div>
        ${sub ? `<div class="sub">${escape(sub)}</div>` : ""}
      </div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

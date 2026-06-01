// Template "Madame Verdict Overlay" — verdict de Madame posé sur le clip vidéo.
//
// Différent de humor-overlay.js (qui est Inter Black 96px, ton pop/cri) :
// ici on veut une signature aristocratique en Fraunces (sérif), italique sobre,
// posé en bas du cadre avec un scrim doux beige (PAS noir) pour rester dans la palette
// brand premium de Madame.
//
// Rendu en PNG TRANSPARENT 1080×1920. ZÉRO émoji.

/**
 * Construit l'overlay verdict Madame.
 * @param {object} args
 * @param {string} args.verdict - le verdict (court, ex: "Inacceptable.", "Évidemment.", "Mes hommages.", "Passable.")
 * @returns {{ html: string, width: 1080, height: 1920, transparent: true, waitMs: number }}
 */
export function buildMadameVerdictOverlay({ verdict }) {
  return {
    html: render({ verdict }),
    width: 1080,
    height: 1920,
    transparent: true,
    waitMs: 500,
  };
}

function render({ verdict }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600&display=swap" rel="stylesheet">
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
      justify-content: flex-end;
      align-items: center;
    }
    /* Scrim BEIGE doux (pas noir) — palette brand Madame. Plus subtil que humor-overlay
       pour garder le côté aristocratique. */
    .scrim {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 48%;
      background: linear-gradient(to top,
        rgba(26, 24, 21, 0.72) 0%,
        rgba(26, 24, 21, 0.42) 45%,
        rgba(26, 24, 21, 0) 100%);
      pointer-events: none;
    }
    .text-block {
      position: relative;
      z-index: 2;
      width: 100%;
      padding: 0 100px 230px;
      text-align: center;
    }
    /* Petit éclat décoratif au-dessus du verdict : filet forest green clair. */
    .rule {
      width: 60px;
      height: 1.5px;
      background: rgba(244, 237, 227, 0.6);
      margin: 0 auto 28px;
    }
    /* Verdict en Fraunces italique 500 — la signature visuelle de Madame.
       Grande taille pour percuter mais sans crier (vs Inter Black de humor-overlay). */
    .verdict {
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 500;
      font-style: italic;
      font-size: 112px;
      line-height: 1.04;
      letter-spacing: -0.025em;
      color: #FFFFFF;
      text-shadow: 0 4px 30px rgba(0,0,0,0.5);
    }
  </style></head><body>
    <div class="frame">
      <div class="scrim"></div>
      <div class="text-block">
        <div class="rule"></div>
        <div class="verdict">${escape(verdict)}</div>
      </div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

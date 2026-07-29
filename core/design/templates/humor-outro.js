// Template "Humor Outro" — sting de fin pour J2 (humour).
// Carte plein cadre 1080×1920 beige Poils Précieux + wordmark Fraunces + domaine.
// Sert de signature visuelle ULTRA-RECONNAISSABLE en fin de Reel (~2.5s),
// pour qu'au bout de quelques posts les gens reconnaissent le sting AVANT même de lire.
//
// ZÉRO émoji (règle brand absolue). PAS transparent — c'est une carte plein cadre.

/**
 * Construit la carte de fin "sting brand" pour les Reels humour.
 * @param {object} args
 * @param {string} [args.domain="poilsprecieux.com"]
 * @returns {{ html: string, width: 1080, height: 1920, transparent: false, waitMs: number }}
 */
export function buildHumorOutro({ domain = "poilsprecieux.com" } = {}) {
  return {
    html: render({ domain }),
    width: 1080,
    height: 1920,
    transparent: false,
    waitMs: 600,
  };
}

function render({ domain }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px; height: 1920px;
      background: #F4EDE3;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .frame {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center;
      padding: 0 80px;
    }
    /* Petit éclat décoratif au-dessus du wordmark : trait fin forest green, signature subtile. */
    .rule {
      width: 80px;
      height: 2px;
      background: #5A6B4F;
      opacity: 0.7;
      margin-bottom: 56px;
    }
    .wordmark {
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 500;
      font-size: 128px;
      line-height: 1.0;
      letter-spacing: -0.02em;
      color: #1A1815;
    }
    .domain {
      font-family: 'Inter', sans-serif;
      font-weight: 500;
      font-size: 36px;
      letter-spacing: 0.12em;
      text-transform: lowercase;
      color: #5A6B4F;
      margin-top: 48px;
    }
  </style></head><body>
    <div class="frame">
      <div class="rule"></div>
      <div class="wordmark">Poils Précieux</div>
      <div class="domain">${escape(domain)}</div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

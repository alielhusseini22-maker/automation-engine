// Template "Humor Overlay" — texte humour ÉNORME posé sur un clip vidéo réel.
// Différent de video-overlay.js (qui est posé/Fraunces/serif pour ton tendre) :
// ici on veut un GROS coup de massue typographique — Inter Black, blanc sur scrim noir épais,
// tiers inférieur, lisible en 1 seconde sur n'importe quel feed bruyant.
//
// Rendu en PNG TRANSPARENT 1080×1920 via renderHtmlToPng({ transparent: true }), puis overlay FFmpeg.
// ZÉRO émoji (règle brand absolue).

/**
 * Construit un overlay humour branded (texte gros, blanc, bas du cadre).
 * @param {object} args
 * @param {string} args.text - le texte humour (5-7 mots max, sans émoji, parlé)
 * @returns {{ html: string, width: 1080, height: 1920, transparent: true, waitMs: number }}
 */
export function buildHumorOverlay({ text }) {
  return {
    html: render({ text }),
    width: 1080,
    height: 1920,
    transparent: true,
    waitMs: 500,
  };
}

function render({ text }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@700;800;900&display=swap" rel="stylesheet">
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
    /* Scrim noir épais dégradé bottom-up — lisibilité maximale par-dessus N'IMPORTE quel clip. */
    .scrim {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 62%;
      background: linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.5) 42%, rgba(0,0,0,0) 100%);
      pointer-events: none;
    }
    .text-block {
      position: relative;
      z-index: 2;
      width: 100%;
      padding: 0 90px 210px;
      text-align: center;
    }
    /* Inter Black, GROS, blanc cassé pur, line-height tight, ombre douce pour le détacher. */
    .punch {
      font-family: 'Inter', -apple-system, sans-serif;
      font-weight: 900;
      font-size: 96px;
      line-height: 1.04;
      letter-spacing: -0.025em;
      color: #FFFFFF;
      text-shadow: 0 4px 28px rgba(0,0,0,0.6);
    }
  </style></head><body>
    <div class="frame">
      <div class="scrim"></div>
      <div class="text-block">
        <div class="punch">${escape(text)}</div>
      </div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

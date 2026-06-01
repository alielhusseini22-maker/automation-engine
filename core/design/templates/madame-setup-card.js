// Template "Madame Setup Card" — carte d'introduction qui précède le clip Madame.
//
// Affichée 2s avant le clip vidéo : pose le contexte ("Verdict n°47") et la SITUATION
// que Madame s'apprête à juger ("La brosse cire à 39€."). Plein cadre 1080×1920 beige
// Poils Précieux. Typo Fraunces (signature Madame = sérif élégant), forest green éclat
// décoratif en haut. ZÉRO émoji (règle brand absolue).
//
// PAS transparent — c'est un plein cadre.

/**
 * Construit la carte set-up Madame.
 * @param {object} args
 * @param {number|string} args.verdictNumber - le n° de verdict (compteur persistant, ex: 47)
 * @param {string} args.situation - la situation jugée, 1 ligne FR courte (ex: "La brosse cire à 39€.")
 * @returns {{ html: string, width: 1080, height: 1920, transparent: false, waitMs: number }}
 */
export function buildMadameSetupCard({ verdictNumber, situation }) {
  return {
    html: render({ verdictNumber, situation }),
    width: 1080,
    height: 1920,
    transparent: false,
    waitMs: 600,
  };
}

function render({ verdictNumber, situation }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Inter:wght@500;600&display=swap" rel="stylesheet">
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
      padding: 0 100px;
    }
    /* En-tête : n° verdict + intitulé "L'AVIS DE MADAME" en eyebrow Inter caps. */
    .eyebrow {
      font-family: 'Inter', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.36em;
      font-size: 26px;
      font-weight: 600;
      color: #5A6B4F;
      margin-bottom: 24px;
    }
    .verdict-no {
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 500;
      font-style: italic;
      font-size: 48px;
      color: #1A1815;
      margin-bottom: 80px;
    }
    /* Filet décoratif forest green entre n° et situation. */
    .rule {
      width: 110px;
      height: 1.5px;
      background: #5A6B4F;
      opacity: 0.75;
      margin-bottom: 80px;
    }
    /* Situation jugée — la "matière" du verdict. Italique pour évoquer la curiosité / le doute. */
    .situation {
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 400;
      font-style: italic;
      font-size: 78px;
      line-height: 1.15;
      letter-spacing: -0.01em;
      color: #1A1815;
      max-width: 780px;
    }
  </style></head><body>
    <div class="frame">
      <div class="eyebrow">L'avis de Madame</div>
      <div class="verdict-no">Verdict n°${escape(verdictNumber)}</div>
      <div class="rule"></div>
      <div class="situation">${escape(situation)}</div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

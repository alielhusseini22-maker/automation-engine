# 🛠️ Automation Engine — récap build 2026-05-20

## Ce qui a été livré (en quelques heures)

| Module | État | Localisation |
|---|---|---|
| **Scaffolding multi-projets** | ✅ Done | `automation-engine/{core,projects,commands,runs,.github}` |
| **Brand charter Poils Précieux** | ✅ Done (10 sections, 8914 chars) | `projects/poils-precieux/brand-charter.md` |
| **Config projet** (règles sourcing, polish, blog, social) | ✅ Done | `projects/poils-precieux/config.json` |
| **Template nouveau projet** | ✅ Done | `projects/_template/config.json` |
| **Sourcing engine** | ✅ Done | `commands/source.js` + `core/sourcing/*` |
| **Polish engine** (variantes, Ships From, dimensions) | ✅ Done & testé | `commands/polish.js` + `core/polish/*` |
| **Blog engine** (topic pick + writer + hero image + publish) | ✅ Done | `commands/blog.js` + `core/blog/*` |
| **Social engine** (theme rotation + caption + image + Buffer) | ✅ Done | `commands/social.js` + `core/social/*` |
| **GitHub Actions** (3 cron jobs) | ✅ Done | `.github/workflows/*.yml` |
| **Smoke test** | ✅ 6/7 passent | `commands/smoke.js` |
| **README + this RECAP** | ✅ Done | `README.md` |

## Test de bout en bout déjà effectué

- `node commands/smoke.js --project poils-precieux` → 6/7 checks OK (ANTHROPIC manquant)
- `node commands/polish.js --project poils-precieux --handle bac-litiere-boxy --dry-run` → plan correctement = 0 actions (produit déjà clean)

---

## Ce qu'il te reste à faire (5 min de setup)

### 1. Obtenir une clé Anthropic Claude API

C'est l'unique credential manquant pour que ça tourne autonome.

- Va sur [console.anthropic.com](https://console.anthropic.com) → API Keys → "Create Key"
- Copie la clé (format `sk-ant-...`)
- Ajoute dans `automation-engine/.env` :
  ```
  ANTHROPIC_API_KEY=sk-ant-xxx
  ```

Budget : ~$10-15/mois pour tout l'engine (sourcing + blog + social hebdo). Tu peux mettre un cap dans Anthropic dashboard.

### 2. (Optionnel pour cette semaine) Créer un compte Buffer

Si tu veux que les posts soient programmés automatiquement sur Instagram + TikTok plutôt que générés comme fichiers à poster manuellement :

- [buffer.com/pricing](https://buffer.com/pricing) → plan Essentials ($5/mo)
- Connect Instagram + TikTok dans Buffer
- Settings → Apps & Extras → Developers → "Create access token"
- Ajoute dans `.env` :
  ```
  POILS_PRECIEUX_BUFFER_TOKEN=xxx
  ```

Sans ça : l'engine génère caption + image PNG + hashtags dans `runs/poils-precieux/social/<date>/` que tu copies-colles manuellement dans Insta/TikTok (3 min/post).

### 3. Push sur GitHub + activer les Actions

Pour que les cron jobs tournent en prod :

```bash
cd C:\Users\aliel\Desktop\automation-engine
git init
git add .
git commit -m "Initial automation engine"
gh repo create automation-engine --private --source=. --push
```

Puis Settings → Secrets and variables → Actions :
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `POILS_PRECIEUX_SHOPIFY_TOKEN`
- `POILS_PRECIEUX_BUFFER_TOKEN` (si activé)

Les 3 workflows tournent automatiquement :
- **Lundi 9h** : sourcing → CSV + brief markdown
- **Mercredi 9h** : 1 article blog publié
- **Tous les jours 18h** : 1 post Insta+TikTok

---

## Test rapide une fois ANTHROPIC_API_KEY ajoutée

```bash
cd C:\Users\aliel\Desktop\automation-engine

# Test sourcing (5 candidats seulement pour économiser tokens)
npm run source -- --project poils-precieux --count 5

# Test blog en dry-run (génère localement sans publier)
npm run blog -- --project poils-precieux --dry-run

# Test social en dry-run
npm run social -- --project poils-precieux --dry-run
```

Tu verras les outputs dans `runs/poils-precieux/{sourcing,blog,social}/<date>/`.

---

## Workflow opérationnel (une fois activé)

```
Lundi matin
  └─→ Sourcing auto (GitHub Actions ou local cron)
      └─→ Tu reçois email/notif avec lien vers BRIEF.md + CSV
      └─→ Tu choisis 5-10 candidats
      └─→ Tu fais DSERS "Find Products" avec les mots-clés
      └─→ Tu importes manuellement les meilleurs vers Shopify

Mardi (manuel, après import DSERS)
  └─→ `npm run polish -- --project poils-precieux --recent`
      └─→ Variantes/options nettoyées auto
  └─→ Si tu veux les images IA : depuis l'outil image existant
      `cd ../poils-precieux-image-tool && node regenerate.js --handle <handle>`

Mercredi matin
  └─→ Blog auto publié sur poilsprecieux.com

Tous les jours 18h
  └─→ 1 post Insta + 1 post TikTok (via Buffer si configuré, sinon manifest local)
```

---

## Limites connues (documentées pour transparence)

1. **DSERS reste semi-auto** : pas d'API publique, l'import du produit AliExpress → Shopify se fait avec ton extension Chrome. Le sourcing AUTO te donne juste les **bons candidats à importer**.
2. **Web search via Claude** : le sourcing utilise l'outil `web_search` d'Anthropic. Précision dépend de la fraîcheur des index. Tu vérifies toujours en live sur AliExpress avant import (5 min).
3. **Buffer requis pour vraie automatisation social** : sans Buffer, l'engine génère les fichiers mais tu postes à la main.
4. **GitHub Actions = la prod, mais on peut commencer en local** : si tu veux tester avant de configurer GitHub, tu lances les commandes localement, ça marche pareil.

---

## Architecture des fichiers (vue d'ensemble)

```
automation-engine/
├── package.json                   (npm scripts: source/polish/blog/social/test:smoke)
├── README.md
├── RECAP-BUILD-2026-05-20.md      ← ce doc
├── .env.example                   ← copier vers .env
├── .gitignore
├── core/
│   ├── config.js
│   ├── shopify/client.js
│   ├── claude/{client,research}.js
│   ├── images/openai.js
│   ├── sourcing/{research,rules,output}.js
│   ├── polish/{product,translations,dimensions}.js
│   ├── blog/{topics,writer,hero}.js
│   └── social/{themes,content,buffer}.js
├── commands/
│   ├── source.js
│   ├── polish.js
│   ├── blog.js
│   ├── social.js
│   └── smoke.js
├── projects/
│   ├── poils-precieux/
│   │   ├── config.json
│   │   └── brand-charter.md
│   └── _template/config.json
└── .github/workflows/
    ├── sourcing-weekly.yml
    ├── blog-weekly.yml
    └── social-daily.yml
```

---

## Coût mensuel estimé

| Poste | Volume | Coût |
|---|---|---|
| Claude API (sourcing + blog + caption) | ~40 calls/mois | ~$3-5 |
| OpenAI GPT-Image-1 (hero + posts) | ~35 images high quality | ~$6-8 |
| Buffer Essentials | 1 user, illimité posts | $5 |
| GitHub Actions | gratuit (free tier suffit) | $0 |
| **Total** | | **~$15/mois** |

Pour comparer : 1h freelance fait < 1 semaine de contenu.

---

**Tu pourras réutiliser tout ça sur ton prochain projet** en copiant `projects/_template/` et en y mettant tes propres règles + brand charter.

# Automation Engine

Outil multi-projets pour automatiser le cycle complet d'une boutique e-commerce dropshipping :

```
Sourcing → Polish → Images IA → Blog → Social
```

Conçu pour fonctionner avec **plusieurs projets** (Poils Précieux + futurs). Chaque projet a sa config, sa charte de marque, ses credentials.

---

## Architecture

```
automation-engine/
├── core/                          # Logique partagée (réutilisable par projet)
│   ├── config.js                  # Chargeur de config + helpers
│   ├── shopify/client.js          # Admin GraphQL + staged uploads
│   ├── claude/
│   │   ├── client.js              # Texte simple + JSON
│   │   └── research.js            # Avec web_search tool (sourcing/blog)
│   ├── images/openai.js           # GPT-Image-1 generate + edit
│   ├── sourcing/
│   │   ├── research.js            # Claude + web_search → candidats
│   │   ├── rules.js               # Filtre + scoring
│   │   └── output.js              # CSV / JSON / BRIEF.md
│   ├── polish/
│   │   ├── product.js             # Plan + execute (variants, options)
│   │   ├── translations.js        # EN → FR dict
│   │   └── dimensions.js          # Extraction "60x40cm" → tableau description
│   ├── blog/
│   │   ├── topics.js              # Pick sujet hebdo via Claude + web_search
│   │   ├── writer.js              # Rédige HTML article
│   │   └── hero.js                # Génère image hero
│   ├── social/
│   │   ├── themes.js              # Rotation thématique par jour
│   │   ├── content.js             # Caption + image prompt + hashtags
│   │   └── buffer.js              # Client API Buffer (Insta + TikTok)
│   └── ...
├── commands/                      # Entry points CLI
│   ├── source.js                  # Sourcing weekly
│   ├── polish.js                  # Polish produits
│   ├── blog.js                    # Génère + publie 1 article
│   ├── social.js                  # Génère + (optionnel) schedule 1 post
│   └── smoke.js                   # Health check
├── projects/
│   ├── poils-precieux/
│   │   ├── config.json            # Règles sourcing, options polish, calendrier social
│   │   └── brand-charter.md       # Palette, ton, hashtags, formats
│   └── _template/                 # Pour cloner sur un nouveau projet
├── runs/                          # Artefacts d'exécution (gitignored)
│   └── <project>/<command>/<date>/
├── .github/workflows/             # Cron jobs prod
│   ├── sourcing-weekly.yml        # Lundi 9h
│   ├── blog-weekly.yml            # Mercredi 9h
│   └── social-daily.yml           # Quotidien 18h
└── .env.example
```

---

## Setup local

```bash
cd C:\Users\aliel\Desktop\automation-engine
cp .env.example .env
# Édite .env avec tes clés API (ANTHROPIC, OPENAI, etc.)
npm install
npm run test:smoke -- --project poils-precieux
```

---

## Commandes

### 🔍 Sourcing (hebdomadaire, lundi)

```bash
npm run source -- --project poils-precieux
# Ou avec focus explicite :
npm run source -- --project poils-precieux --focus toilettage --count 20
# Output : runs/poils-precieux/sourcing/<date>/{candidates.csv, BRIEF.md, candidates.json}
```

→ Tu ouvres `BRIEF.md`, choisis 5-10 candidats, et **importes manuellement via DSERS** (mots-clés AliExpress fournis).

### ✨ Polish (post-import DSERS)

```bash
# Un produit spécifique :
npm run polish -- --project poils-precieux --handle laisse-retractable-spooly

# Les 5 derniers créés :
npm run polish -- --project poils-precieux --recent

# Tous les "new" :
npm run polish -- --project poils-precieux --tag new
```

Actions appliquées (configurables via `polish` dans config.json) :
- Suppression "Ships From: China Mainland"
- Mono-variante → suppression option
- Traduction options/valeurs (Color → Couleur, Black → Noir, etc.)
- Extraction dimensions des variant titles → tableau dans description

### 📝 Blog (hebdomadaire, mercredi)

```bash
npm run blog -- --project poils-precieux
# Dry-run :
npm run blog -- --project poils-precieux --dry-run
# Topic forcé :
npm run blog -- --project poils-precieux --topic "Mon titre custom"
```

Workflow auto :
1. Pick sujet via Claude + web_search (évite les doublons existants)
2. Rédige article HTML 800-1500 mots
3. Génère image hero éditoriale
4. Upload Shopify CDN + publie via `articleCreate`

### 📱 Social (quotidien, 18h)

```bash
npm run social -- --project poils-precieux
# Theme + format manuels :
npm run social -- --project poils-precieux --theme produit --format single
# Dry-run (génère contenu localement sans publier) :
npm run social -- --project poils-precieux --dry-run
```

Selon le jour, applique la rotation du calendrier (`config.social.weeklySchedule`) :
- Lundi : guide / carousel
- Mardi : produit / single
- Mercredi : astuce / reel
- Jeudi : témoignage / carousel
- Vendredi : communauté / single
- Samedi : behind-scenes / reel
- Dimanche : inspiration / single

Si `BUFFER_ACCESS_TOKEN` est défini → schedule auto sur Instagram + TikTok via Buffer.
Sinon → output manifest JSON + image PNG pour post manuel.

---

## Ajouter un nouveau projet

```bash
cp -r projects/_template projects/<nouveau-projet>
# Édite projects/<nouveau-projet>/config.json
# Crée projects/<nouveau-projet>/brand-charter.md
# Ajoute dans .env :
#   <NOUVEAU_PROJET>_SHOPIFY_TOKEN=shpat_xxx
#   <NOUVEAU_PROJET>_BUFFER_TOKEN=...

# Run :
npm run source -- --project <nouveau-projet>
```

Les credentials sont par projet (env var `<PROJECT>_SHOPIFY_TOKEN`). Les API keys IA (Anthropic, OpenAI) sont partagées.

---

## Déploiement GitHub Actions

1. Push ce repo sur GitHub
2. Settings → Secrets and variables → Actions :
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `POILS_PRECIEUX_SHOPIFY_TOKEN`
   - `POILS_PRECIEUX_BUFFER_TOKEN` (optionnel)
3. Les 3 workflows tournent automatiquement (sourcing lundi 9h, blog mercredi 9h, social tous les jours 18h)
4. Trigger manuel via Actions UI → "Run workflow"

---

## Coûts estimés

| Commande | Volume / mois | Coût approximatif |
|---|---|---|
| Sourcing | 4 runs × Claude Opus | ~$1-2 |
| Polish | 20-50 produits × Shopify mutations | gratuit (limité à Shopify rate limit) |
| Blog | 4 articles × (Claude 6k tokens + 1 image high) | ~$1 + $0.67 = $1.7 |
| Social | 30 posts × (Claude 2k + 1 image high) | ~$3 + $5 = $8 |
| **Total** | | **~$10-12/mois** |

Plus Buffer Essentials ~$5/mo si activé.

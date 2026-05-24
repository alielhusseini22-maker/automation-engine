# Routine du lundi — Sourcing + Import semi-auto (Option A)

> Le seul créneau où tu interviens. ~10 min, PC allumé, une session avec Claude.
> Tout le reste de la semaine est 100% auto.

## Comment lancer

Lundi matin, ouvre une session avec Claude (Claude Code sur ce dossier) et dis simplement :

> **"On est lundi, on source."**

Claude exécute alors la séquence ci-dessous.

## Séquence exécutée par Claude

### 1. Plan + sourcing (auto, ~2 min)
- Claude lit le `weekly-plan.md` (thème de la semaine)
- Lance `npm run source` → génère les candidats produits alignés au thème
  (≥500 commandes, ≥4★, marge ≥50%, catégories du plan)

### 2. Recherche live AliExpress (auto via browser MCP, ~3 min)
Pour chaque candidat, Claude :
- Ouvre AliExpress dans ton navigateur, recherche avec les mots-clés, **trié par nombre de commandes**
- Lit les résultats LIVE (commandes réelles, note, prix affichés)
- Sélectionne le meilleur produit qui respecte les critères

### 3. Import DSERS (semi-auto, ~3 min — c'est ici que tu interviens)
Pour chaque produit retenu :
- Claude ouvre la page produit AliExpress
- Clique sur l'extension DSERS "Import"
- **⚠ Si un CAPTCHA apparaît → tu le résous (5 sec), Claude reprend**
- Push vers Shopify via DSERS

### 4. Tag automatique (auto)
- Une fois le produit sur Shopify, Claude ajoute le tag `nouveau-produit` via l'API
  (pas de navigateur, fiable)

### 5. Le reste = 100% auto (sans toi)
- **Dans les 4h** : workflow "Product Onboarding" détecte le tag → polish + images IA premium
- **Le soir** : auto-promo social du nouveau produit
- **Toute la semaine** : 9 posts/jour + blog mercredi, alignés au plan

## Ton intervention réelle

- Démarrer la session ("on est lundi, on source")
- Résoudre 1-3 CAPTCHA si AliExpress en demande
- Valider visuellement les produits que Claude propose ("oui prends celui-là" / "non, suivant")

**Total : ~10 min, principalement de la validation.**

## Prérequis (à vérifier une fois)

- [ ] Extension DSERS installée sur Chrome + connectée à ta boutique Shopify
- [ ] Connecté à AliExpress dans le navigateur (session active)
- [ ] Connecté à DSERS
- [ ] PC allumé pendant la session

## Si tu veux sauter une semaine

Ne fais rien. Pas de nouveaux produits cette semaine, mais le contenu (posts + blog) continue de tourner sur le catalogue existant. Aucune casse.

# Brand Charter — Poils Précieux

> Document de référence pour toute production de contenu automatisée (sourcing, polish, blog, social). Source de vérité unique. Édite ici en cas de pivot.

---

## 1. Identité

**Mission** : Sélection française d'accessoires premium pour chiens et chats. Le minimum utile, qualité réelle, design intentionnel.

**Promesse** : Pas de gadget. Chaque produit a une raison d'être au quotidien — santé, confort, ou utilité prouvée.

**Positionnement** : Boutique éditoriale, esthétique scandinave premium. Cible : propriétaires urbains 25-45 ans, exigeants sur la qualité, allergiques au plastique cheap aliexpress brut.

**Anti-positionnement** : Pas de gros emoji vendeur (`✨🔥💥`), pas d'urgence factice ("plus que 2 en stock !!"), pas de jargon marketing.

---

## 2. Palette (cohérente avec le thème Shopify Editorial v5)

| Usage | Hex | Notes |
|---|---|---|
| Beige chaud primaire | `#F4EDE3` | Fond éditorial photos + blocs site |
| Crème | `#FFFAF1` | Surfaces secondaires |
| Blanc pur | `#FFFFFF` | Texte sur sombre |
| Taupe doux | `#C4A977` | Accents, badges discrets |
| Forêt (nature) | `#5A6B4F` | Accent pour thèmes santé/naturel |
| Texte | `#1A1815` | Quasi-noir chaud, jamais `#000` |

---

## 3. Typographie (Shopify Feather + Editorial v5)

- **Heading** : Heading font, weight normal, letter-spacing `-0.02em`, line-height `1.05-1.1`
- **Eyebrow labels** : UPPERCASE 0.75rem letter-spacing `0.25em` (signature éditoriale)
- **Body** : 0.95rem, line-height 1.5

---

## 4. Voix éditoriale

| Trait | Oui | Non |
|---|---|---|
| Ton | Factuel + bienveillant | Survendu, condescendant |
| Émotion | Calme, posé, expert | Hystérique, urgent |
| Phrases | Courtes (10-18 mots) | Longues, jargon |
| Adresse | "votre chien/chat" | "votre compagnon à 4 pattes" (cliché) |
| Conclusion | Toujours une utilité concrète | Toujours un CTA d'achat |
| Anglicismes | Évités sauf nécessaire | "ASAP", "shooter", "engager" |
| Émojis dans le texte | 0-1 max, jamais en début de phrase | Stream d'émojis décoratifs |

**Phrases types validées** :
- "Sélection française d'accessoires premium pour chiens et chats."
- "Pour votre compagnon à poils."
- "L'essentiel, sans superflu."
- "Chaque produit sélectionné pour son utilité réelle, pas pour faire joli sur l'étagère."

---

## 5. Style photographique (IA + manuel)

**Composition** :
- Sujet unique (animal OU produit, rarement les deux)
- Lumière naturelle latérale, ombres douces
- Espace négatif généreux
- Pas de texte/overlay sur l'image

**Décor** :
- Lin beige, surface bois clair, ou intérieur cosy crème
- Accessoires éditoriaux : bol céramique, couverture pliée, brosse bois, panier osier
- Jamais de fond color block agressif

**Formats** :
- Carré 1:1 (1080×1080) — feed Instagram
- Vertical 9:16 (1080×1920) — Reels / TikTok / Stories
- Paysage 3:2 (1536×1024) — hero collection, blog

**Prompt template** (cf `lib/collection-prompts.js` et `lib/blog-prompts.js` du tool image) :
> "Premium editorial photography for a French pet brand named Poils Précieux. Style: Scandinavian minimalism, ambient natural light, soft shadows. Palette: warm beige #F4EDE3, cream #FFFAF1, white. Composition: single subject, generous negative space. NO text overlays, NO logos."

---

## 6. Stratégie social — calendrier éditorial

**Cadence** : 1 post / jour, Instagram + TikTok (même contenu, format adapté).

**Rotation thématique par jour** :

| Jour | Thème | Format dominant | Exemple |
|---|---|---|---|
| **Lundi** | Guide / Pédagogie | Carrousel 3-5 slides | "5 erreurs en brossant son chien" |
| **Mardi** | Mise en avant produit | Single image | Beagle + Marley brosse, caption utilité |
| **Mercredi** | Astuce express | Reel 15s | "Faire boire son chat en 1 geste" |
| **Jeudi** | Témoignage / Avant-après | Carrousel 2 slides | Photo client avec son animal |
| **Vendredi** | Question communauté | Image + question | "Quel est le plus beau pelage ?" |
| **Samedi** | Behind-the-scenes / Process | Reel ou carousel | "Comment on sélectionne nos brosses" |
| **Dimanche** | Inspiration / chiot mignon | Single image | Chat dormant sur plaid Snuggly |

**Hashtags** (rotation, 5-8 par post) :

Core (toujours) :
`#poilsprecieux` `#poilsprecieuxfr`

Catégorie (selon post) :
`#chienpremium` `#chataccessoire` `#brossagechien` `#brossagechat` `#toilettagechien` `#santechien` `#santechat`

Communauté FR :
`#chiendebonheur` `#chatpoilus` `#chienenfrance` `#chatenfrance` `#animauxfrance`

Universal (limité) :
`#petlife` `#petlovers` `#dogsofinstagram` `#catsofinstagram`

**Caption format** :
- Ligne 1 : hook 5-10 mots (souvent une question ou stat)
- Lignes 2-4 : 1-2 phrases explicatives
- Ligne 5 : utilité concrète + lien produit si pertinent (`bio.link/poilsprecieux`)
- Bloc hashtags séparé en bas (5-8)

Longueur cible : 80-150 mots max.

---

## 7. Stratégie blog — calendrier éditorial

**Cadence** : 1 article / semaine (publié mercredi matin).

**Rotation thématique** :

| Semaine | Type | Exemple |
|---|---|---|
| S1 | Guide pratique | "Comment couper les griffes de son chat sans le stresser" |
| S2 | Comparatif produits | "Brosse pour chien à poils longs : 4 modèles comparés" |
| S3 | Saisonnier | "Été : 5 réflexes pour protéger son chien de la canicule" |
| S4 | Santé / Conseil véto | "Tartre dentaire : comment prévenir sans aller chez le véto" |

**Format article** :
- 800-1500 mots
- H1 titre + chapô 2-3 phrases
- 3-5 sections H2
- Tableau ou liste à puces toutes les 300-400 mots
- Bloc "À retenir" en fin
- 2-3 produits Poils Précieux pertinents en lien (max, pas catalogue forcé)
- Image hero IA générée selon le thème (style éditorial beige)

**SEO** :
- Titre 50-70 caractères avec mot-clé principal
- Meta-description 140-160 caractères
- Handle URL : kebab-case sans accents, mots-clés visibles
- Internal linking : 2-3 liens vers d'autres articles ou produits

---

## 8. Règles sourcing produit

**Critères obligatoires** :
- Minimum **500 commandes** historiques sur AliExpress
- Minimum **4 étoiles** de note
- Prix de vente final cible : **€10-80** (sweet spot premium accessible)
- Marge minimum : **50%** (prix vente ≥ 2× coût)
- Catégorie : **chien ou chat uniquement** (pas oiseaux, poissons, reptiles)
- Pas de **subscription** (croquettes, médicaments, etc.) — produits one-shot uniquement

**Critères de qualité** :
- Marque visible OU look premium (pas de logo cheap)
- Description sans fautes / sans charabia
- Photos exploitables (au moins 1 sur fond neutre)
- Stock raisonnable côté supplier (pas en rupture imminente)
- Délai livraison < 30 jours (DSERS / supplier filter)

**Anti-critères (rejet auto)** :
- Vêtements pour chien/chat clownesques (déguisements Halloween)
- Produits "magiques" non vérifiés (anti-anxiété sans base scientifique)
- Électronique grand public détournée (caméras non pet-specific)
- Doublon avec produit catalogue actuel (vérif handle existant)

---

## 9. Règles polish (après import DSERS)

**Variantes** :
- Toujours en français (Gray → Gris, Blue → Bleu, etc.)
- Toujours `Couleur` / `Taille` / `Format` / `Forme` — jamais `Color` / `Ships From`
- Supprimer "Ships From: China Mainland" (option entière)
- Si 1 seule valeur → supprimer l'option (Title: Default Title)
- Aligner les prix par couleur (un seul prix sauf si taille = vraie différence)
- Parti pris **simplicité** : si ambigu, garder le moins
- Si tailles : nommer simplement `S/M/L/XL`, détails dans description

**Description** :
- En français, ton voix charter section 4
- Structure : accroche utilité (1-2 phrases) + bénéfices (liste 3-5) + dimensions/specs (tableau) + entretien (1-2 phrases)
- **Dimensions extraites des photos AliExpress** placées dans tableau en bas
- Pas de "Bestseller!" / "Hot sale!" / etc.
- Pas plus de 200 mots avant le pli

**Titre** :
- Format : `[Nature] [bénéfice clé] — [Nom-mascotte]™`
- Exemple : "Brosse démêlante pour chien à poils longs — Marley™"
- 50-80 caractères max

**Handle (URL)** :
- En français kebab-case
- Pattern : `[nature]-[mascotte]`
- Exemple : `brosse-demelante-marley`

**Tags** :
- Catégorie principale (Chien / Chat / Toilettage / etc.)
- Si applicable : `vedette`, `nouveaute`, `saison-ete`, `saison-hiver`
- Tag mot-clé sourcing pour traçabilité : `ali_query:<query>`

**Images** :
- 1 image hero par couleur via outil IA (GPT-Image-1)
- Angle : `front-three-quarter` (défaut) OU `top-down` (plats, tapis, plaids)
- Fond transparent OU beige selon position dans site
- Suppression des images AliExpress brutes après génération IA

---

## 10. Configuration multi-projets

Ce projet est `poils-precieux`. Pour ajouter un nouveau projet :
1. Copier `projects/_template/` vers `projects/<nouveau-projet>/`
2. Adapter `config.json` (Shopify creds, identité, règles)
3. Adapter `brand-charter.md` (équivalent ce doc)
4. Ajouter aux GitHub Actions secrets : `<PROJET>_SHOPIFY_TOKEN`, `<PROJET>_BUFFER_TOKEN`, etc.

# Content Queue — Poils Précieux

Dossier où tu déposes du **vrai contenu** (vidéos / photos) que l'engine social va piocher pour ses posts quotidiens.

L'engine consomme les items **dans l'ordre alphabétique** des sous-dossiers (donc préfixe `001-`, `002-` pour contrôler l'ordre).
Une fois consommé, le dossier est déplacé dans `_done/` (avec la date de publication).

---

## Comment ajouter un item

1. Crée un sous-dossier ici, format `NNN-court-titre/` (où `NNN` = 3 chiffres pour l'ordre)
2. Dépose dedans :
   - **`media.mp4`** (vidéo, recommandé pour Reels / TikTok) **OU** `media.jpg` / `media.png` (photo)
   - **`meta.json`** (métadonnées du contenu)

### Format `meta.json`

```json
{
  "theme": "tendresse",
  "context": "Brossage du soir avec Nougat, cocker spaniel. Il a appris à aimer ça en 3 semaines.",
  "petName": "Nougat",
  "petBreed": "Cocker spaniel",
  "petSpecies": "chien",
  "productMentioned": "marley",
  "preferredDays": ["wednesday", "sunday"],
  "ctaLinkInBio": true
}
```

**Champs** :
| Champ | Obligatoire | Description |
|---|---|---|
| `theme` | ✓ | `tendresse` (cute) / `behind-scenes` / `inspiration` / `astuce` / `produit-usage` |
| `context` | ✓ | 1-3 phrases qui décrivent la scène (l'IA s'en sert pour écrire la caption) |
| `petName` | optionnel | Nom de l'animal (mentionné dans la caption si fourni) |
| `petBreed` | optionnel | Race (utile pour hashtags) |
| `petSpecies` | optionnel | `chien` ou `chat` (oriente hashtags) |
| `productMentioned` | optionnel | Mascot name d'un produit Poils Précieux (`marley`, `cocoony`, etc.) — si pertinent |
| `preferredDays` | optionnel | Force l'item à être posté un certain jour (ex `["wednesday"]`) |
| `ctaLinkInBio` | optionnel | Si `true`, ajoute "Lien en bio" à la fin |

---

## Spécifications techniques

**Vidéo** (recommandé pour Reels Instagram + TikTok) :
- Format : MP4 (H.264)
- Durée : 9-30 secondes (optimal 15-25s)
- Ratio : 9:16 vertical (1080×1920) recommandé. 1:1 carré OK aussi.
- Taille fichier : < 50 MB
- Pas de musique copyright (Buffer / TikTok détectent — soit libre, soit silence)

**Photo** :
- Format : JPG ou PNG
- Ratio : 1:1 carré (1080×1080) ou 9:16 vertical (1080×1920) pour Reels
- Taille : < 10 MB

---

## Sources de contenu suggérées

### À court terme (démarrer rapidement)

1. **Filme ton propre chien/chat** avec ton phone. 15s, pas besoin de pro.
2. **Demande à ta famille/amis** d'envoyer 5-10 vidéos de leur animal contre code promo 10%
3. Si queue vide, l'engine fallback sur **Pexels** automatiquement (vidéos réelles libres de droit)

### À moyen terme (croissance)

4. **UGC** : repère des comptes pet sur Insta/TikTok, contacte les créateurs pour reposter avec crédit
5. **Production semi-pro** : 1 séance trimestrielle avec un pet photographer (~200€) → 30 contenus

---

## Exemple : ajouter un item

```bash
cd projects/poils-precieux/content-queue
mkdir 001-nougat-brossage
# Glisse ta vidéo dans le dossier en la renommant media.mp4
# Puis crée le meta.json :
```

`001-nougat-brossage/meta.json` :
```json
{
  "theme": "tendresse",
  "context": "Nougat, mon cocker de 4 ans, pendant son brossage du soir. Il s'est habitué en 3 semaines avec une brosse à picots arrondis.",
  "petName": "Nougat",
  "petBreed": "Cocker spaniel",
  "petSpecies": "chien",
  "productMentioned": "marley",
  "ctaLinkInBio": true
}
```

L'engine prend cet item au prochain run social (mercredi tendresse par exemple), écrit une caption autour du contexte, et le poste sur Insta + TikTok + FB.

---

## État courant

- Items en attente : voir le contenu du dossier (sous-dossiers à la racine)
- Items déjà publiés : `_done/`

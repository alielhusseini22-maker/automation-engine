# Music tracks — banque de pistes pour les vidéos sociales

Ce dossier contient les musiques libres de droit utilisées pour les vidéos TikTok / Reels.

## Format & convention

- Format : MP3 ou M4A (mono ou stéréo, 128 kbps suffit)
- Durée : 30 secondes minimum (sera mise en boucle automatiquement par FFmpeg si besoin)
- **Convention de nommage** : `<mood>-<nom>.mp3`
  - `calm-piano-soft.mp3`
  - `warm-acoustic-guitar.mp3`
  - `intimate-lofi-chill.mp3`
  - `upbeat-folk-cozy.mp3`

Le moteur pioche aléatoirement selon le mood du post (calm / warm / intimate / upbeat).
Si le dossier est vide → la vidéo est générée sans audio (TikTok pas content mais ça marche quand même).

## Sources libres de droit recommandées

### Pixabay Music (le plus simple)
**https://pixabay.com/music/**

- 100% gratuit, licence CC0 (aucune attribution requise)
- Filtres : "Calm", "Acoustic", "Soft", "Lo-fi"
- Recherches utiles : `acoustic warm`, `soft piano`, `cozy lofi`, `intimate guitar`, `gentle folk`

### Mixkit
**https://mixkit.co/free-stock-music/**

- 100% gratuit, licence permissive
- Catégories : "Acoustic", "Cinematic", "Ambient"

### YouTube Audio Library
**https://studio.youtube.com/** → bibliothèque audio (sans devoir avoir une chaîne mature)

## À installer manuellement (une fois)

Recommandation pour Poils Précieux — récupérer 8-12 pistes dans ces moods :

**Calm (3-4 pistes)** — pour tip cards & inspiration :
- Pixabay : "soft piano slow"
- "calm acoustic guitar"

**Warm (3-4 pistes)** — pour product highlight & hook carousel :
- Pixabay : "warm acoustic"
- "cozy folk"

**Intimate (2-3 pistes)** — pour behind-scenes & tendresse :
- Pixabay : "lofi chill"
- "intimate piano"

**Upbeat (1-2 pistes)** — réserve pour posts plus dynamiques (optionnel) :
- Pixabay : "happy acoustic"
- "uplifting folk"

Une fois téléchargées, renomme-les avec le préfixe mood, dépose-les dans ce dossier, commit + push.

```bash
cd C:\Users\aliel\Desktop\automation-engine\assets\music
# Dépose les MP3 ici via Explorateur ou drag-drop
git add .
git commit -m "music: add curated tracks for Reels/TikTok"
git push
```

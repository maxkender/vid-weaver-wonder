# Génération serveur + multi-langue pour l'OS marketing

## Ce qui existe déjà
Le multi-langue est en place : script, voix ElevenLabs (`language_code`) et sous-titres suivent la langue choisie, les visuels restent identiques. Rien à refaire de ce côté, on va juste l'exposer dans l'API.

## Le point dur, en clair
Aujourd'hui la vidéo finale est assemblée **dans ton navigateur** (ffmpeg.wasm) : si l'onglet se ferme, c'est perdu. Le backend de cette app tourne sur un environnement serverless qui **ne peut pas exécuter ffmpeg**. Donc « assembler côté serveur » = ajouter un petit service de rendu à part.

Tu as dit « comme tu fais actuellement » → on garde **exactement le même rendu** (mêmes filtres, même masque carré, mêmes sous-titres mot-par-mot). Pour ça, le plus fidèle est de rejouer le même code ffmpeg dans un service Node dédié. Je livre ce service dans le projet, prêt à déployer en un clic (Railway / Fly / Render) : tu n'as rien à coder, juste à le déployer et coller son URL dans les réglages.

## Architecture

```text
OS marketing (cron minuit)
   │  POST /api/public/videos  (clé signée, 1 job par posteur)
   ▼
Studio  ── file d'attente en base (render_jobs)
   │
   ├─ étapes IA (script → images → clips → voix)   [tourne ici, serverless]
   │
   └─ étape rendu ──► service de rendu (Node + ffmpeg)
                          │ upload MP4 1080p
                          ▼
                  Stockage privé du backend
                          │ URL signée 24 h
   ◄── webhook signé ─────┘
OS : le calendrier affiche « prêt » + bouton Télécharger
```

## Détail

### 1. Base de données
- `render_jobs` : posteur, langue, style narratif, catégorie de sujet, DA visuelle, durée cible, voix, statut (`queued/scripting/assets/voice/rendering/done/failed`), étapes déjà faites (reprise sans re-payer), `lease_until` (verrou anti-doublon), URL du MP4, erreur.
- `job_events` : journal par étape, pour diagnostiquer sans deviner.
- `api_clients` : clés d'API de l'OS (hachées) + secret de signature des webhooks.
- Bucket privé `renders` pour les MP4. Téléchargement uniquement par URL signée.

### 2. API publique (appelée par l'OS)
- `POST /api/public/videos` → crée un job. Corps : `posterId`, `language`, `durationSec`, `narrationStyle` (ou `random` avec liste autorisée), `topicCategory` (ou `random`), `visualStyle` (fixe par posteur), `voiceId`, `callbackUrl`. Réponse : `{ jobId }`.
- `GET /api/public/videos/{jobId}` → statut, progression, `downloadUrl` signée quand c'est prêt.
- `POST /api/public/videos/{jobId}/cancel`.
- Sécurité : HMAC sur le corps + horodatage (anti-rejeu), validation Zod stricte, quota de jobs par jour et par client.

### 3. Le worker (dans cette app)
Un endpoint `POST /api/public/jobs/tick` déclenché par un cron interne toutes les minutes :
- prend **un** job à la fois via un verrou en base (pas deux rendus en parallèle sur le même job) ;
- enchaîne script → images → clips vidéo → voix, en enregistrant chaque étape terminée (une reprise ne repaie jamais ce qui est déjà généré) ;
- **coupe-circuit** : si les crédits IA sont épuisés ou bloqués, tout le pipeline se met en pause et te le signale, au lieu de brûler des jobs en boucle ;
- puis passe la main au service de rendu.

### 4. Service de rendu (nouveau dossier `render-worker/`)
- Node + ffmpeg natif, `Dockerfile` fourni, une seule variable d'env à remplir.
- Reprend **le même graphe de filtres** que l'export actuel : masque carré à coins arrondis, sous-titres mot-par-mot avec les timings ElevenLabs, coupe des silences de tête/queue, logo Sophia, 1080p, faststart.
- Les images de sous-titres, aujourd'hui dessinées par le navigateur, sont redessinées côté serveur avec la même logique et la même police (rendu identique au pixel près).
- À la fin : upload du MP4 dans le bucket privé + webhook signé vers le Studio, qui prévient l'OS.
- Réglage `RENDER_WORKER_URL` dans la page Paramètres. Tant qu'il est vide, l'app continue d'exporter dans le navigateur comme aujourd'hui — aucune régression.

### 5. Côté app Studio
- L'export navigateur reste disponible (utile pour itérer).
- Nouvelle page « Files d'attente » : jobs en cours, étape, coût, relance, téléchargement.
- Les jobs créés par l'OS apparaissent aussi dans l'historique.

### 6. Côté OS marketing (ce que tu devras y brancher)
- Sur chaque posteur : langue, DA visuelle (fixe), liste des styles narratifs autorisés, liste des catégories de sujets autorisées, durée cible, voix.
- Cron à minuit : un appel `POST /api/public/videos` par posteur actif.
- Stocker `jobId`, afficher « en cours » puis le bouton Télécharger dès le webhook reçu.

## Ordre de livraison
1. Base + stockage + clés d'API.
2. API publique + file d'attente + worker IA (script/images/clips/voix) côté serveur.
3. `render-worker/` + webhook + branchement dans les Paramètres.
4. Page « Files d'attente » dans le Studio.
5. Contrat d'intégration détaillé (exemples de requêtes) à donner à l'OS.

## Ce que je te demanderai en cours de route
- Déployer `render-worker/` (je te donne la commande exacte) et me coller son URL.
- L'URL publique de l'OS pour le webhook.

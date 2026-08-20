# Service de rendu Sophia

Assemble les plans (clip animé ou image fixe + voix off + sous-titres mot par mot)
en un MP4 vertical 1080×1920, puis rappelle le studio.

## Pourquoi un service séparé

Le studio tourne sur un runtime serverless sans ffmpeg natif. Le rendu vidéo
demande ffmpeg + du disque + plusieurs minutes de calcul : il vit donc dans ce
petit service Node, déployable sur n'importe quel hébergeur de conteneurs
(Fly.io, Railway, Render, un VPS…).

## Démarrage

```bash
docker build -t sophia-render .
docker run -p 8787:8787 \
  -e RENDER_WORKER_SECRET=<même secret que le studio> \
  -e PUBLIC_URL=https://render.mondomaine.com \
  sophia-render
```

## Variables

| Variable | Rôle |
| --- | --- |
| `RENDER_WORKER_SECRET` | Secret partagé avec le studio (signature HMAC dans les deux sens). |
| `PUBLIC_URL` | URL publique du service, utilisée pour le lien de téléchargement renvoyé au studio. |
| `PORT` | Port d'écoute (8787 par défaut). |
| `CAPTION_FONT_FILE` | Chemin de la police des sous-titres (Anton par défaut). |

## Côté studio

Renseigner `RENDER_WORKER_URL` (l'URL publique du service) et
`RENDER_WORKER_SECRET` (le même secret) dans les secrets du projet.

## Protocole

1. Studio → `POST /render` avec le manifeste signé (`x-timestamp`, `x-signature`).
2. Le service répond `202` immédiatement, puis rend en tâche de fond.
3. Service → `POST {callbackUrl}` signé, avec `status`, `videoUrl`, `durationSec`.
4. Le studio télécharge le MP4, le range dans son stockage privé et prévient l'OS.

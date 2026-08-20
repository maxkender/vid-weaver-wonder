# Relier le studio à votre outil interne

Objectif : votre outil maison assigne un sujet à un créateur, le studio produit la vidéo automatiquement, et le fichier final redescend chez vous sans intervention manuelle.

## Le principe

```text
Outil interne  --(1) POST /api/public/jobs------->  Studio
               <--(2) webhook "video.ready"------
               --(3) GET url signée (MP4)------->
```

1. Votre outil crée une commande : sujet, style, créateur assigné, durée.
2. Le studio génère (script → images → vidéo → voix → export) et stocke le MP4.
3. Dès que c'est prêt, on POSTe chez vous : métadonnées + URL de téléchargement signée.
4. Si vous ratez le webhook, une API de rattrapage liste les vidéos prêtes.

Les deux sens sont protégés par une clé partagée + signature HMAC, donc aucune action manuelle n'est requise.

## Ce qui est construit

**Base de données**
- `creators` : identifiant interne (celui de votre outil), nom, email, actif.
- `video_jobs` : sujet, catégorie, style, durée, créateur assigné, statut (`queued` → `generating` → `ready` / `failed` / `delivered`), chemin du MP4, message d'erreur, horodatages.
- `webhook_deliveries` : trace de chaque envoi vers votre outil (statut HTTP, tentatives) pour pouvoir rejouer.

**Stockage**
- Bucket privé `exports` ; les MP4 ne sont accessibles que via URL signée à durée limitée.

**Endpoints publics (appelables par votre outil)**
- `POST /api/public/jobs` — créer une commande assignée à un créateur. Réponse : `job_id`.
- `GET /api/public/jobs/:id` — statut + URL signée si prête.
- `GET /api/public/jobs?status=ready` — rattrapage / synchro en masse.
- `POST /api/public/jobs/:id/ack` — vous confirmez le téléchargement → statut `delivered`.
- Auth : header `X-Api-Key` (secret côté studio), rejet sinon.

**Webhook sortant**
- Sur passage en `ready` (ou `failed`), POST vers l'URL que vous configurez, corps signé en HMAC SHA-256 (`X-Signature`), avec 3 tentatives et backoff.

**Dans l'app**
- Nouvelle page « File d'attente » : les commandes venues de votre outil, avec le créateur assigné, le statut, et un bouton pour lancer/relancer la production.
- La page de génération actuelle ne change pas ; à l'export, la vidéo est aussi poussée dans le stockage et le job passe en `ready`.

## Détails techniques

- Routes sous `src/routes/api/public/*` (contournent l'auth du site), validation Zod, comparaison de clé en temps constant.
- Écritures via le client admin chargé **dans** le handler, après vérification de la clé.
- Deux secrets à créer : `INTERNAL_API_KEY` (votre outil → studio) et `INTERNAL_WEBHOOK_SECRET` + `INTERNAL_WEBHOOK_URL` (studio → votre outil).
- URL stable à configurer chez vous : `https://project--b25e0794-d490-4b6e-8b37-4e05357a390e.lovable.app`.
- L'upload du MP4 se fait depuis le navigateur à la fin de l'assemblage (le fichier est produit côté client par ffmpeg.wasm), puis le job est marqué prêt côté serveur.

## Étape suivante

Je vous fournirai un exemple de requête `curl` prêt à coller dans votre outil maison, et la structure exacte du payload webhook.

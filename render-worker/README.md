# Service de rendu Sophia — mode d'emploi

Ce petit service assemble les vidéos **sans qu'aucun navigateur soit ouvert**.
C'est lui qui permet la génération automatique de nuit.

Il fait exactement le même montage que le studio : fenêtre carrée à coins
arrondis, sous-titres mot par mot en Poppins ExtraBold, voix off calée au plan près,
musique de fond éventuelle, export 1080 × 1920 à 30 images par seconde.

---

## Ce dont vous avez besoin

- un compte Railway (gratuit pour commencer) : https://railway.app
- le code de ce projet sur GitHub (Lovable peut le pousser pour vous)
- 10 minutes

---

## Étape 1 — Créer le compte Railway

1. Allez sur https://railway.app et cliquez sur **Login**.
2. Choisissez **Login with GitHub** et autorisez Railway à voir vos dépôts.

## Étape 2 — Déployer ce dossier

1. Dans Railway, cliquez sur **New Project** → **Deploy from GitHub repo**.
2. Choisissez le dépôt de ce projet.
3. Une fois le service créé, ouvrez-le, onglet **Settings** :
   - **Root Directory** : tapez `render-worker`
     (c'est indispensable : sans ça Railway essaierait de déployer le studio).
   - Railway détecte tout seul le `Dockerfile` présent dans ce dossier.
4. Cliquez sur **Deploy**. Le premier build prend 3 à 5 minutes (il installe
   ffmpeg et la police Poppins ExtraBold).

## Étape 3 — Renseigner les variables

Toujours dans le service Railway, onglet **Variables**, ajoutez :

| Variable | Valeur | Où la trouver |
| --- | --- | --- |
| `RENDER_WORKER_SECRET` | une longue chaîne aléatoire (40 caractères) | inventez-la, ou demandez-la à Lovable ; elle doit être **identique** des deux côtés |
| `PUBLIC_URL` | l'adresse publique du service | voir l'étape 4 (à remplir juste après) |
| `PORT` | `8787` | valeur par défaut, à ne changer que si Railway l'impose |
| `CAPTION_FONT_FILE` | *(facultatif)* chemin d'une autre police | par défaut Poppins ExtraBold, déjà installée |

## Étape 4 — Récupérer l'adresse publique

1. Onglet **Settings** → section **Networking** → **Generate Domain**.
2. Railway affiche une adresse du type
   `https://sophia-render-production.up.railway.app`.
3. Recopiez-la dans la variable `PUBLIC_URL` (étape 3), puis redéployez.

## Étape 5 — Brancher le studio

Dans Lovable, **Paramètres du projet → Secrets**, ajoutez :

| Secret | Valeur |
| --- | --- |
| `RENDER_WORKER_URL` | l'adresse de l'étape 4 |
| `RENDER_WORKER_SECRET` | **exactement** la même chaîne qu'à l'étape 3 |

Tant que ces deux secrets ne sont pas renseignés, les vidéos de nuit attendent
la page `/station` ouverte dans un navigateur. Une fois renseignés, le service
prend le relais automatiquement.

---

## Vérifier que ça marche

Ouvrez simplement l'adresse suivante dans votre navigateur :

```
https://votre-adresse.up.railway.app/health
```

Vous devez voir :

```json
{ "ok": true, "pending": 0 }
```

Si vous préférez le terminal :

```bash
curl https://votre-adresse.up.railway.app/health
```

Une réponse vide ou une erreur 502 signifie que le service n'a pas démarré :
regardez l'onglet **Deployments → Logs** dans Railway, le message y est écrit
en clair (le plus souvent : `RENDER_WORKER_SECRET manquant`).

---

## Comment ça se parle (pour information)

1. Le studio envoie le descriptif de la vidéo à `POST /render`, signé avec le
   secret partagé (`x-timestamp` + `x-signature`).
2. Le service répond immédiatement `202`, puis assemble en tâche de fond.
3. Une fois fini, il rappelle le studio avec le lien du MP4.
4. Le studio télécharge le fichier, le range dans son stockage privé et le
   service oublie sa copie.

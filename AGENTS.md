<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Réglages (/reglages?tab=admin|studio) regroupe Administration et Paramètres ; /admin et /parametres redirigent. Why: navigation à quatre entrées demandée par le client.
- Thème clair unique (blanc/noir, jetons dans src/styles.css, pas de dark mode). Why: lisibilité exigée par le client.
- Les réglages de slideshow sont centralisés dans slideshow_settings et partagés par aperçu, export et génération d'images. Why: éviter les différences de style entre production et publication.

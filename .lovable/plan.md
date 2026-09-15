# Corriger la boucle de rendu serveur

## Résultat attendu
- Un manifeste n'est envoyé qu'une fois, puis le travail attend le rappel sans être repris par la file.
- Un nouvel envoi n'est autorisé qu'après 15 minutes sans rappel, avec trois envois maximum.
- Le rappel du worker reste prioritaire sur tout tick déjà en cours : aucune écriture tardive ne peut remettre un travail terminé en rendu.
- Les autres langues continuent d'avancer pendant qu'un rendu attend son rappel.

## Mise en œuvre
1. Ajouter aux travaux les champs de suivi d'envoi du rendu (date du dernier envoi et compteur), avec une migration sûre.
2. Modifier la sélection atomique du prochain travail pour ignorer les rendus en attente de rappel pendant 15 minutes.
3. Rendre la libération du bail strictement ciblée sur `lease_until`, avec condition sur le statut attendu et retour indiquant si l'état a changé entre-temps.
4. Dans l'étape de rendu, enregistrer chaque envoi, plafonner à trois, attendre 15 minutes avant un nouvel envoi et passer en échec avec un message explicite au-delà.
5. Rendre le rappel idempotent et conditionnel : seuls les travaux encore en rendu peuvent être finalisés, afin qu'un rappel tardif ou doublé ne réécrive pas la vidéo du jour.
6. Ajouter des tests unitaires sur les décisions d'envoi/réenvoi et vérifier types, tests et constantes partagées sans appeler les services payants.

## Contraintes respectées
- Aucun changement au rendu visuel, au pipeline maître ou aux secrets.
- Aucune production ni requête payante.
- La file reste dans son état de pause actuel.

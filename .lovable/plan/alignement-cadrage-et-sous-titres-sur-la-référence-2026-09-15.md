# Alignement cadrage et sous-titres sur la référence

## Résultat attendu
- Agrandir le carré à 92,8 % de la largeur, porter ses coins à 10 %, et remonter son centre de 4,75 % de la hauteur.
- Appliquer exactement la même fenêtre au masque, à l’image préparée avant animation, à l’aperçu et au rendu final.
- Remplacer les sous-titres Anton par Poppins 800, en minuscules, blancs, avec contour fin et ombre douce, centrés dans le carré.

## Mise en œuvre
- Ajouter `SQUARE_CENTER_OFFSET_RATIO = -0.0475` avec les constantes de géométrie et centraliser le calcul complet dans une fonction `squareBox`.
- Faire consommer `squareBox` par le masque navigateur, la pré-composition et l’aperçu, plutôt que de recalculer leurs positions séparément.
- Passer la taille des sous-titres à 13,5 % du côté, conserver leur réduction automatique pour les mots trop larges, et calculer leur centre depuis la boîte carrée décalée.
- Charger Poppins 800 dans l’application et dans le service de rendu, avec Nunito puis Baloo 2 comme polices de secours côté navigateur.
- Aligner le rendu ASS du service sur les mêmes dimensions, casse, graisse, contour et position.
- Étendre le contrôle anti-divergence pour inclure le décalage vertical et les nouvelles constantes.

## Vérifications
- Contrôler numériquement le cadre 1080 × 1920 : côté 1002 px environ, centre vertical à 869 px environ, masque et image préparée aux mêmes coordonnées.
- Vérifier que les mots longs restent dans la largeur du carré et que le rendu navigateur et le service utilisent les mêmes proportions.
- Vérifier les pages du studio et les contrôles automatiques existants.

## Détail technique
Le service de rendu est déployé séparément et conserve sa copie locale des constantes requises au fonctionnement. Le contrôle automatique les compare à la source du studio et échoue au moindre écart, y compris désormais pour le décalage vertical.

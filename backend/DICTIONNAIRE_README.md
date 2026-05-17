# Instructions pour le dictionnaire français

Le fichier `backend/api/dictionnaire.txt` est actuellement vide.
Pour que le jeu valide les mots, vous devez le remplir.

## Option recommandée — ODS (Officiel Du Scrabble)

Téléchargez la liste de mots ODS8 (officielle) depuis :
https://www.j-perreau.fr/scrabble/ods8.txt

Puis placez le fichier à :
```
backend/api/dictionnaire.txt
```

Le fichier doit contenir un mot par ligne, en majuscules ou minuscules
(le moteur fait `.upper()` automatiquement).

## Option alternative — liste Gutenberg

```bash
curl -o backend/api/dictionnaire.txt \
  https://raw.githubusercontent.com/words/french-word-list/master/index.txt
```

## Vérification

Le backend affiche au démarrage :
```
FILE EXISTS: True
```
Si c'est `False`, le chemin est incorrect.

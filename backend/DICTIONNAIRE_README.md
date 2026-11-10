# Dictionnaires du jeu

Le jeu se joue en français ou en anglais. Chaque partie a sa langue
(`GameState.language`) : elle fixe le dictionnaire, le sac et la valeur
des lettres. Les fichiers contiennent un mot par ligne ; la casse n'a pas
d'importance (le moteur fait `.upper()`).

| Langue   | Fichier                        | Liste                         | Sac                         |
|----------|--------------------------------|-------------------------------|-----------------------------|
| Français | `backend/api/dictionnaire.txt` | ODS (≈ 411 000 mots)          | 100 lettres + 2 jokers      |
| Anglais  | `backend/api/dictionnaire_en.txt` | ENABLE (≈ 173 000 mots), domaine public | 98 lettres + 2 jokers (édition nord-américaine) |

## Anglais — liste ENABLE

ENABLE (*Enhanced North American Benchmark Lexicon*) est dans le domaine
public. Elle ne contient pas certains mots récents des listes officielles
(TWL, Collins), qui sont sous droits et ne peuvent pas être redistribuées.

Source utilisée : https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt

## Vérification

Au démarrage, le backend journalise pour chaque langue :
```
Dictionnaire fr : …/dictionnaire.txt (trouvé, 411430 mots)
Dictionnaire en : …/dictionnaire_en.txt (trouvé, 172823 mots)
```
Si un fichier manque, les parties dans cette langue sont refusées
(HTTP 503) ; l'autre langue continue de fonctionner.

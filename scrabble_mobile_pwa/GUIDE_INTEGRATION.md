# Scrabble — Version mobile (PWA)

Ta version web React/Vite a été transformée en **application mobile installable (PWA)** pour Android et iOS, avec une interaction **tap-tap** adaptée au tactile. Le backend Railway existant n'a pas été touché : l'app continue de s'y connecter telle quelle.

## Ce qui a changé

**Interaction tap-tap (au doigt)**
- On touche une lettre du rack → elle se surligne (badge ↓ + pulsation).
- On touche une case vide du plateau → la lettre se pose. Les cases jouables clignotent.
- On touche une lettre déjà posée → elle revient dans le rack.
- Le glisser-déposer continue de fonctionner sur ordinateur.

**Mise en page mobile**
- Plateau en pleine largeur, rack **collant en bas** de l'écran, barre d'actions compacte (Valider / Passer / Mélanger / Échanger).
- Gestion des encoches (safe-area iOS), zoom par double-tap désactivé, tuiles agrandies au doigt.
- La version ordinateur (2 colonnes) est conservée automatiquement (bascule à 768 px).

**PWA installable**
- `manifest` + service worker (cache de l'app shell, fonctionne hors-ligne pour l'interface ; le jeu lui-même a besoin du backend en ligne).
- Icônes générées (192, 512, maskable, apple-touch-icon).
- Installable depuis Chrome (Android : « Ajouter à l'écran d'accueil ») et Safari (iOS : Partager → « Sur l'écran d'accueil »).

## Fichiers à reprendre dans ton dépôt

Remplace/ajoute ces fichiers dans `frontend/` :

| Fichier | Action |
|---|---|
| `index.html` | remplacé (meta mobiles + manifest) |
| `vite.config.js` | remplacé (plugin PWA) |
| `package.json` | remplacé (ajout `vite-plugin-pwa`) |
| `src/App.jsx` | remplacé (tap-tap + layout responsive) |
| `src/index.css` | remplacé (styles mobiles) |
| `src/components/Board.jsx` | remplacé (toucher des cases) |
| `src/components/TileRack.jsx` | remplacé (sélection au toucher) |
| `public/icons/*`, `public/favicon.png` | nouveaux (icônes PWA) |

Les autres fichiers (`ScorePanel.jsx`, `gameService.js`, `constants.js`, `main.jsx`…) sont inchangés — fournis ici uniquement pour référence.

## Installer et tester

```bash
cd frontend
npm install
npm run dev        # test local
npm run build      # build de production (génère dist/ + service worker)
npm run preview    # tester le build PWA
```

Build vérifié avec **Vite 7.3.3** et **vite-plugin-pwa 1.3.0** : OK (service worker `sw.js` + manifest générés, 16 entrées en cache).

## Notes importantes

- **PWA, pas de store par défaut.** L'app s'installe depuis le navigateur. Si tu veux plus tard la publier sur le Play Store / App Store, on pourra l'emballer avec Capacitor ou Bubblewrap — dis-le moi.
- **Le service worker n'est actif qu'en HTTPS** (ou `localhost`). Ton déploiement Vercel est déjà en HTTPS, donc l'installation marchera en prod.
- **Backend inchangé** : toujours `https://scrabblefull-stack-production.up.railway.app`.

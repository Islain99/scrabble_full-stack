# Backend Scrabble v2 — Auth Firebase + PostgreSQL

## Structure finale du projet

```
backend/
├── api/                        ← EXISTANT (inchangé)
│   ├── index.py                ← Modifié : greffe les nouveaux routers + lifespan
│   ├── game_logic.py           ← Inchangé
│   ├── models.py               ← Inchangé
│   └── dictionnaire.txt        ← Inchangé
├── app/                        ← NOUVEAU
│   ├── auth/
│   │   ├── dependencies.py     ← Dependency get_current_user
│   │   └── router.py           ← /register, /login, /me, /logout
│   ├── users/
│   │   └── router.py           ← /me (profil), /me/history, /me/games, /{id}/profile
│   ├── leaderboard/
│   │   └── router.py           ← /leaderboard
│   ├── core/
│   │   ├── config.py           ← Settings via pydantic-settings
│   │   └── firebase.py         ← Firebase Admin SDK
│   └── db/
│       ├── database.py         ← SQLAlchemy async engine
│       └── models.py           ← User, GameHistory
├── alembic/                    ← Migrations DB
├── requirements.txt            ← Enrichi avec firebase-admin, sqlalchemy, etc.
├── Procfile                    ← Inchangé
└── .env.example                ← Variables requises
```

## Nouvelles routes

Préfixe : `/api/v2`

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/api/v2/auth/register` | Non | Créer profil après Firebase signup (email/password) |
| POST | `/api/v2/auth/login` | Bearer | Login + màj last_login (crée auto pour OAuth Google) |
| GET | `/api/v2/auth/me` | Bearer | Profil rapide |
| POST | `/api/v2/auth/logout` | Bearer | Logout côté serveur |
| GET | `/api/v2/users/me` | Bearer | Profil complet + stats |
| PATCH | `/api/v2/users/me` | Bearer | Modifier pseudo / bio / avatar |
| GET | `/api/v2/users/me/history` | Bearer | Historique des parties |
| POST | `/api/v2/users/me/games` | Bearer | Sauvegarder une partie terminée |
| GET | `/api/v2/users/{id}/profile` | Non | Profil public |
| GET | `/api/v2/leaderboard` | Optionnel | Classement global |

## Setup Railway

### 1. Firebase Console

1. [console.firebase.google.com](https://console.firebase.google.com/)
2. Crée un projet (ou utilise l'existant)
3. **Authentication → Sign-in method** : active **Email/Password** + **Google**
4. **Project Settings → Service Accounts → Generate new private key**
5. Ouvre le JSON téléchargé — tu en auras besoin à l'étape 3

### 2. Railway — PostgreSQL

1. Dans ton projet Railway : **New → Database → PostgreSQL**
2. Railway génère automatiquement `DATABASE_URL` dans les variables

### 3. Railway — Variables d'environnement

Dans **Settings → Variables**, ajoute :

```
DATABASE_URL          = (généré automatiquement par Railway)
APP_ENV               = production
ALLOWED_ORIGINS       = https://ton-frontend.vercel.app,http://localhost:5173

FIREBASE_SERVICE_ACCOUNT_JSON = {"type":"service_account","project_id":"..."}
```

Pour `FIREBASE_SERVICE_ACCOUNT_JSON` : ouvre le fichier JSON téléchargé,
**copie tout le contenu sur une seule ligne** et colle-le dans Railway.

### 4. Migrations

```bash
# En local (pointe vers la DB Railway via DATABASE_URL)
alembic revision --autogenerate -m "initial_auth"
alembic upgrade head
```

Ou laisse le `lifespan` créer les tables automatiquement au premier démarrage
(via `Base.metadata.create_all` — mode développement uniquement).

## Développement local

```bash
pip install -r requirements.txt
cp .env.example .env
# Remplis DATABASE_URL et FIREBASE_SERVICE_ACCOUNT_PATH dans .env

uvicorn api.index:app --reload --port 8000
```

Docs interactives : http://localhost:8000/docs

## Flow d'authentification

```
Client (React)              Firebase              Backend FastAPI
    |                           |                      |
    |-- createUserWithEmail() -> |                      |
    |<-- idToken --------------- |                      |
    |                           |                      |
    |-- POST /api/v2/auth/register (Bearer idToken) --> |
    |                           |               verify_firebase_token()
    |                           |               create User in PostgreSQL
    |<-- UserOut + is_new_user --------------------------------- |
    |                           |                      |
    |-- (appels jeu existants) /game/* -----------------> (inchangé)
    |                           |                      |
    |-- POST /api/v2/users/me/games (fin de partie) ---> |
    |                           |               save GameHistory
    |                           |               update User stats
```
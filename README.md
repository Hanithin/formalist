# Formalist

Plateforme de formalités juridiques en ligne — création de sociétés, contrats, SACEM.

## Architecture

```
formalist/
  index.js              — Serveur HTTP, wiring des routes, fichiers statiques
  auth.js               — Authentification (sessions, cookies, PBKDF2)
  db.js                 — SQLite (better-sqlite3), schéma, prepared statements

  lib/                  — Utilitaires partagés
    router.js           — matchRoute, jsonResponse, errorResponse
    multipart.js        — parseBody (JSON 1MB max), parseRawBody, parseMultipart
    docx.js             — Génération DOCX (docxtemplater), injection signature
    pdf.js              — Conversion PDF (LibreOffice), queue, cache
    sse.js              — Gestion SSE (messages temps réel)
    sanitize.js         — sanitizeText, sanitizeFilename, sanitizePrompt

  middleware/           — Middlewares réutilisables
    security.js         — CSP, CORS, X-Frame-Options, headers sécurité
    auth-guard.js       — authGuard(req, res, ...roles)
    upload.js           — handleUpload (multipart unifié, validation extension)
    rate-limit.js       — Rate limiter configurable par IP

  routes/               — Un fichier par domaine
    auth.js             — Login, logout, profil, mot de passe
    formalites.js       — CRUD formalités, assignation avocat, validation
    contrats.js         — CRUD contrats
    sacem.js            — CRUD déclarations SACEM
    documents.js        — Coffre-fort documents, upload, téléchargement
    messages.js         — Chat user↔avocat (SSE temps réel)
    support.js          — Chat support (SSE temps réel)
    admin.js            — Stats, gestion utilisateurs, support admin
    signature.js        — Demandes de signature, flow de signature
    ai.js               — Génération objet social (Gemini API)
    contact.js          — Formulaire de contact public
    docgen.js           — Génération DOCX/PDF, documents signés

  public/
    css/                — Styles extraits de creation.html
      common.css        — Sidebar, layout, typographie
      creation.css      — Formulaire, stepper, panels, lifecycle
      chat.css          — Widget chat
    js/
      common.js         — Auth check, sidebar init
      creation/         — Modules JS (namespace Formalist)
        app.js, associes.js, dirigeants.js, capital.js,
        documents.js, lifecycle.js, form-data.js,
        custom-controls.js, chat.js, conjoint.js
    creation.html       — HTML pur (~1000 lignes)
    sign.html           — Page de signature externe
```

## Setup

```bash
npm install
cp .env.example .env
# Éditer .env avec vos valeurs
node index.js
```

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | `3000` |
| `NODE_ENV` | `production` active Secure cookies | `development` |
| `CORS_ORIGINS` | Origines autorisées (virgule-séparées) | — |
| `GEMINI_API_KEY` | Clé API Google Gemini | — |
| `SEED_ADMIN_PASSWORD` | Mot de passe admin (seed initial) | `admin123` |
| `SEED_AVOCAT_PASSWORD` | Mot de passe avocat (seed initial) | `avocat123` |
| `SEED_USER_PASSWORD` | Mot de passe utilisateur (seed initial) | `test123` |

## Dépendances système

- **Node.js** >= 18
- **LibreOffice** (headless, pour conversion DOCX→PDF)

## Sécurité

- Headers CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- CORS avec whitelist d'origines
- Rate limiting sur login (10/15min) et contact (3/h)
- Cookie session HttpOnly + Secure (production)
- Sanitization des inputs (XSS, path traversal, prompt injection)
- API key Gemini passée via header (pas dans l'URL)
- Body JSON limité à 1MB
- Erreurs génériques en production

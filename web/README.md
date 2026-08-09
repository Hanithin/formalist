# Formalist - application Next.js

Création et modification de sociétés, accompagnées par des avocats.

Ce dossier remplace progressivement le serveur Node de la racine. Les deux
cohabitent pendant la migration : `web/` sert les pages déjà portées, le serveur
d'origine sert les autres.

## Démarrer

```bash
cp .env.example .env        # renseigner DATABASE_URL
npx prisma generate         # le client n'est pas versionné
npm run dev
```

Le schéma Postgres est dans `../migrations/001_schema_initial.sql`. Pour repartir
d'une base vide :

```bash
psql "$DATABASE_URL" -f ../migrations/001_schema_initial.sql
```

## Vérifier

```bash
npm run verifier            # types, couches, tests de domaine
npm run test:parcours       # parcours critiques dans un navigateur
```

L'intégration continue lance les mêmes commandes sur un Postgres neuf, et refuse la
fusion si l'une échoue.

## Structure

Trois couches, une seule direction de dépendance.

```
src/
├─ app/              HTTP : pages, routes, actions. Aucune règle métier.
├─ domain/           Les règles. Ne connaît ni la base ni le réseau.
├─ infrastructure/   Postgres, stockage, envoi d'emails.
├─ components/       Interface.
└─ lib/              Utilitaires sans dépendance.
```

```
app  ->  domain, infrastructure, components, lib
infrastructure  ->  domain, lib
domain  ->  lib
components  ->  domain, lib
```

Les composants atteignent le domaine, qui est pur : ni entrées-sorties, ni secrets,
ni accès réseau. Ce qu'ils ne doivent jamais atteindre, c'est l'infrastructure -
identifiants de connexion, requêtes, clés d'API - qui partirait au navigateur avec
eux. En contrepartie, le domaine doit rester libre de tout secret.

La règle `boundaries/dependencies` d'ESLint fait respecter ce sens : un import à
contresens échoue au contrôle, il n'est pas laissé à la vigilance en revue. Un
composant qui importe `infrastructure/` échoue deux fois, car ce qu'il importe peut
partir au navigateur - identifiants de connexion compris.

Le domaine ne dépendant de rien, il se teste sans démarrer quoi que ce soit :
`tests/unite/acces.test.ts` couvre les règles de visibilité en 17 cas, sans base.

## Conventions

**La langue du code.** Le domaine est français - `formalite`, `dossier`, `avocat`,
`equipe` - parce que c'est le vocabulaire du métier et celui des textes de loi. La
technique reste anglaise : `import`, `async`, noms de bibliothèques.

**Les commentaires disent pourquoi.** Pas ce que fait le code, qui se lit. Le cas
particulier, la contrainte légale, la décision. Un commentaire qui paraphrase la
ligne suivante est du bruit qui vieillit mal.

**Aucune entrée n'est lue sans validation.** Tout ce qui vient du réseau passe par
`lib/valider.ts`, y compris les paramètres d'URL. Ce n'est pas de la donnée, c'est
une proposition de donnée.

**Rien de personnel dans les journaux.** `lib/journal.ts` masque les champs
sensibles à la source. Compter sur l'appelant pour ne pas les passer ne marche
jamais longtemps.

**Un changement, un objet.** Une page portée, ses tests et le retrait de l'ancienne
route arrivent ensemble. C'est ce qui évite deux versions vivantes de la même chose.

## Ce qui ne part jamais au navigateur

Tout JavaScript envoyé au navigateur est lisible : l'obfuscation ne protège rien.
La seule vraie protection est que le code sensible ne parte pas. Règles de calcul
de capital, logique tarifaire et conditions d'accès s'exécutent côté serveur et
n'envoient que leur résultat.

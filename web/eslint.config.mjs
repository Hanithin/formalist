import next from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Les dépendances vont toujours vers le domaine, jamais l'inverse.
 *
 *   app             ->  domain, infrastructure, components, lib
 *   infrastructure  ->  domain, lib
 *   domain          ->  lib
 *   components      ->  domain, lib
 *
 * Les composants atteignent le domaine, qui est pur : ni entrées-sorties, ni
 * secrets, ni accès réseau. Ce qu'ils ne doivent jamais atteindre, c'est
 * l'infrastructure - identifiants de connexion, requêtes, clés d'API - qui
 * partirait au navigateur avec eux. Le domaine doit donc rester libre de tout
 * secret : c'est la contrepartie de cette ouverture.
 *
 * C'est cette règle qui rend impossible l'accident qu'on cherche à éviter : un
 * composant client qui importe la base ou une clé d'API, et l'expédie au navigateur.
 * Sans elle, il faut y penser à chaque revue ; avec elle, le contrôle refuse.
 *
 * Le gabarit de create-next-app passe par FlatCompat, qui ne fonctionne pas avec
 * cette version : eslint-config-next 16 exporte déjà de la configuration plate.
 */
const eslintConfig = [
  ...next,
  ...typescript,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "infrastructure", pattern: "src/infrastructure/**" },
        { type: "domain", pattern: "src/domain/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "lib", pattern: "src/lib/**" },
      ],
      "boundaries/include": ["src/**/*.ts", "src/**/*.tsx"],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            { from: [{ element: { type: "app" } }], allow: [{ to: { element: { type: ["domain", "infrastructure", "components", "lib"] } } }] },
            { from: [{ element: { type: "infrastructure" } }], allow: [{ to: { element: { type: ["domain", "lib"] } } }] },
            { from: [{ element: { type: "domain" } }], allow: [{ to: { element: { type: ["lib"] } } }] },
            { from: [{ element: { type: "components" } }], allow: [{ to: { element: { type: ["domain", "lib"] } } }] },
            { from: [{ element: { type: "lib" } }], allow: [{ to: { element: { type: ["lib"] } } }] },
          ],
        },
      ],
    },
  },
  {
    // Un composant ne touche jamais l'infrastructure : ce qu'il importe peut partir
    // au navigateur, identifiants de connexion compris.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/infrastructure/**", "@/infrastructure/*"],
              message:
                "L'infrastructure ne doit pas être importée depuis un composant : passez par une fonction serveur du domaine.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "src/infrastructure/db/generated/**",
      // Déplacés depuis lib/ sans être réécrits : c'est le but. Les passer au
      // style du reste supposerait de les reprendre, ce qu'on ne veut pas.
      "src/infrastructure/documents/*.cjs",
      ".next/**",
      "node_modules/**",
    ],
  },
];

export default eslintConfig;

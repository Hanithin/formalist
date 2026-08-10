import styles from "./Authentification.module.css";

const ARGUMENTS = [
  {
    titre: "Des documents relus par un avocat",
    texte:
      "Chaque clause de vos statuts est vérifiée avant dépôt. C'est ce qui distingue Formalist d'un simple générateur.",
  },
  {
    titre: "Un parcours guidé, pas un formulaire",
    texte:
      "Les questions s'adaptent à votre forme juridique, et on ne vous demande jamais ce qu'on peut déduire.",
  },
  {
    titre: "Signature électronique et dépôt",
    texte:
      "Vos associés signent depuis un lien, et le dossier part au greffe sans que vous ayez à vous en occuper.",
  },
];

/** Ce que la plateforme apporte, à côté du formulaire d'entrée. */
export function Propos() {
  return (
    <aside className={styles.propos}>
      <h2>Créer une société n&apos;est pas qu&apos;une formalité</h2>
      <ul className={styles.arguments}>
        {ARGUMENTS.map((a) => (
          <li key={a.titre}>
            <span>
              <span className={styles.argumentTitre}>{a.titre}</span>
              <span className={styles.argumentTexte}>{a.texte}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

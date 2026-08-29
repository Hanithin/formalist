import Link from "next/link";
import { delaiLisible } from "@/domain/societe/obligations";
import styles from "./Societes.module.css";

/**
 * Ce que la société doit, et pour quand.
 *
 * La fiche disait « Aucune échéance connue pour cette société » sur toutes les
 * sociétés du compte : rien ne calculait ce qu'une société doit du seul fait
 * d'exister. Elle le dit maintenant en tête, avant l'historique - on ouvre une fiche
 * pour savoir ce qui reste à faire, non pour relire ce qui a été fait.
 *
 * Le modèle est l'écran de l'avocat, le meilleur de l'application : une seule chose
 * mise en avant, dite en clair, avec la raison qui la rend nécessaire. Les suivantes
 * attendent leur tour en dessous.
 */

const LISIBLE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function dateLisible(iso: string): string {
  const date = new Date(iso + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? iso : LISIBLE.format(date);
}

/**
 * Ce que la fiche a besoin de savoir d'une échéance, d'où qu'elle vienne.
 *
 * Deux sources la nourrissent : les obligations que la loi impose à la société, et
 * les échéances que ses dossiers ouverts portent - un dépôt commencé, un mandat de
 * liquidateur. Les mélanger ici évite deux blocs qui se contredisent : la fiche
 * annonçait deux obligations en tête, et « Aucune échéance connue » vingt lignes plus
 * bas.
 */
export interface AVenir {
  cle: string;
  intitule: string;
  limite: string | null;
  explication?: string;
  fondement?: string;
  bouton: string;
  lien: string;
}

export function CeQuiVousAttend({ obligations }: { obligations: AVenir[] }) {
  if (obligations.length === 0) return null;

  const [premiere, ...suivantes] = obligations;
  const tard = !!premiere.limite && premiere.limite < new Date().toISOString().slice(0, 10);

  return (
    <section
      className={tard ? `${styles.attend} ${styles.attendRetard}` : styles.attend}
      aria-labelledby="ce-qui-attend"
    >
      <p className={styles.attendQuand}>
        {premiere.limite ? (
          <>
            <span className={styles.attendDate}>
              À faire avant le {dateLisible(premiere.limite)}
            </span>
            <span className={styles.attendDelai}>{delaiLisible(premiere.limite)}</span>
          </>
        ) : (
          // Sans date légale - une société civile - on ne fabrique pas d'urgence.
          <span className={styles.attendDate}>À la date que fixent vos statuts</span>
        )}
      </p>

      <h2 id="ce-qui-attend" className={styles.attendTitre}>
        {premiere.intitule}
      </h2>
      {premiere.explication && (
        <p className={styles.attendTexte}>{premiere.explication}</p>
      )}

      {/* Le texte qui l'impose : un dirigeant peut vouloir le vérifier lui-même. */}
      {premiere.fondement && <p className={styles.attendFondement}>{premiere.fondement}</p>}

      <div className={styles.attendGestes}>
        <Link href={premiere.lien} className={styles.attendBouton}>
          {premiere.bouton}
        </Link>
      </div>

      {suivantes.length > 0 && (
        <ul className={styles.attendSuite}>
          {suivantes.map((o) => (
            <li key={o.cle}>
              <span>{o.intitule}</span>
              <span className={styles.attendSuiteQuand}>
                {o.limite ? dateLisible(o.limite) : "selon vos statuts"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

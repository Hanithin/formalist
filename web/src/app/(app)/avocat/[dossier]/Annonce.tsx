"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../Avocat.module.css";

/**
 * Les avis à publier, prêts à copier.
 *
 * C'est le cabinet qui publie, et un support habilité facture au caractère : le texte
 * est rédigé depuis les données du dossier, l'avocat n'a qu'à le coller dans le
 * formulaire du journal.
 *
 * Un transfert hors ressort en donne deux, aux textes différents : l'un annonce la
 * radiation, l'autre l'immatriculation. Les afficher côte à côte, chacun avec son
 * ressort, évite de publier deux fois le même - la faute courante, que le greffe
 * relève.
 */

interface Avis {
  ressort: string;
  objet: string;
  texte: string;
}

export function Annonce({ dossier }: { dossier: number }) {
  const [avis, setAvis] = useState<Avis[] | null>(null);
  const [publies, setPublies] = useState(false);
  const [copie, setCopie] = useState<number | null>(null);
  const [refus, setRefus] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  useEffect(() => {
    let vivant = true;
    (async () => {
      try {
        const reponse = await fetch("/api/formalites/modification/annonce?dossier=" + dossier);
        const corps = await reponse.json().catch(() => ({}));
        if (!vivant) return;

        if (!reponse.ok) setRefus(corps.error ?? "Les avis n'ont pas pu être composés");
        else {
          setAvis(corps.avis ?? []);
          setPublies(corps.publies === true);
        }
      } catch {
        if (vivant) setRefus("Les avis n'ont pas pu être composés");
      }
    })();

    return () => {
      vivant = false;
    };
  }, [dossier]);

  async function copier(texte: string, rang: number) {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(rang);
      setTimeout(() => setCopie(null), 2500);
    } catch {
      // Le presse-papier peut être refusé : on le dit plutôt que de laisser croire
      // que la copie a eu lieu, et le texte reste sélectionnable à la main.
      setRefus("Copie refusée par le navigateur : sélectionnez le texte ci-dessus.");
    }
  }

  function declarer(valeur: boolean) {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/formalites/modification/annonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, publies: valeur }),
      });

      if (!reponse.ok) {
        setRefus("La déclaration n'a pas abouti");
        return;
      }
      setPublies(valeur);
      router.refresh();
    });
  }

  if (refus && !avis) {
    return (
      <p className={styles.travailRefus} role="alert">
        {refus}
      </p>
    );
  }

  if (!avis) return <p className={styles.tacheExplication}>Composition des avis…</p>;

  if (avis.length === 0) {
    return (
      <p className={styles.tacheExplication}>
        Ce dossier n&apos;appelle aucune annonce légale : les changements décidés ne
        touchent pas aux mentions publiées.
      </p>
    );
  }

  return (
    <div className={styles.travail}>
      <div className={styles.travailTete}>
        <h2 className={styles.titre}>
          {avis.length === 1 ? "L'avis à publier" : "Les " + avis.length + " avis à publier"}
        </h2>
        {publies ? (
          <button
            type="button"
            className={styles.travailSecondaire}
            onClick={() => declarer(false)}
            disabled={enCours}
          >
            Revenir sur la publication
          </button>
        ) : (
          <button
            type="button"
            className={styles.travailPrincipal}
            onClick={() => declarer(true)}
            disabled={enCours}
          >
            {enCours ? "…" : "Marquer comme publiés"}
          </button>
        )}
      </div>

      {avis.length > 1 && (
        <p className={styles.tacheBlocage}>
          Le siège change de ressort : les deux textes diffèrent. Publiez chacun dans son
          département - le premier annonce la radiation, le second l&apos;immatriculation.
        </p>
      )}

      {publies && (
        <p className={styles.travailRetour} role="status">
          Publication déclarée. Le suivi du client est à jour.
        </p>
      )}

      {avis.map((un, rang) => (
        <section key={rang} className={styles.avis}>
          <div className={styles.avisTete}>
            <div>
              <span className={styles.avisRessort}>{un.ressort}</span>
              <span className={styles.avisObjet}>{un.objet}</span>
            </div>
            <button
              type="button"
              className={styles.travailSecondaire}
              onClick={() => copier(un.texte, rang)}
            >
              {copie === rang ? "Copié" : "Copier le texte"}
            </button>
          </div>
          <pre className={styles.avisTexte}>{un.texte}</pre>
        </section>
      ))}

      {refus && (
        <p className={styles.travailRefus} role="alert">
          {refus}
        </p>
      )}
    </div>
  );
}

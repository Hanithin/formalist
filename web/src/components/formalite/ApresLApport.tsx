import {
  demarchesDeLApport,
  ceQuiNEstPasDu,
  nomDeLaSocieteApportee,
  MOMENTS,
  type ContexteDeLApport,
  type DemarcheDeLApport,
} from "@/domain/modification/societe-apportee";
import { OuvrirLeDossierApportee } from "./OuvrirLeDossierApportee";
import styles from "./ApresLApport.module.css";

/**
 * Ce que l'apport appelle des deux côtés, rangé dans l'ordre du temps.
 *
 * Le parcours ne montrait que la holding : son capital augmente, son avis paraît, son
 * dossier part au guichet. De la société dont les titres sont apportés, il ne disait
 * rien - alors qu'elle change d'associé, et que c'est elle qui porte les gestes sans
 * lesquels l'apport n'est opposable à personne.
 *
 * L'ordre du temps plutôt que l'ordre des sociétés : la question qu'on se pose devant
 * cet écran n'est pas « qui fait quoi » mais « quand ». Un agrément rangé avec les
 * démarches qui suivent l'apport laisserait croire qu'on peut l'y faire, alors qu'il
 * doit précéder la signature sous peine de ne rien réparer.
 *
 * Le même bloc sert au client, dans son parcours, et à l'avocat, sur la fiche du
 * dossier. Deux rédactions auraient divergé au premier changement de loi, et c'est
 * précisément la matière où elles ne doivent pas.
 */
export function ApresLApport({
  contexte,
  nomHolding,
  titre = "Ce que l'apport appelle, de chaque côté",
  introduction,
  dossier,
  dossierApportee,
}: {
  contexte: ContexteDeLApport;
  /** Le nom de la société qui reçoit les titres, pour nommer ses démarches à elle. */
  nomHolding?: string | null;
  titre?: string;
  introduction?: string;
  /**
   * Le dossier d'apport, quand l'écran peut en ouvrir un second.
   *
   * Absent, le bloc n'est qu'une lecture : c'est le cas tant que le dossier n'existe
   * pas - dans le parcours, avant le premier enregistrement.
   */
  dossier?: number | null;
  /** Celui de la société apportée, s'il a déjà été ouvert. */
  dossierApportee?: number | null;
}) {
  const demarches = demarchesDeLApport(contexte);
  if (demarches.length === 0) return null;

  const pasDu = ceQuiNEstPasDu(contexte);
  const holding = (nomHolding ?? "").trim() || "la holding";

  /* Un moment sans démarche ne s'affiche pas : un intertitre vide ne dit rien. */
  const groupes = MOMENTS.map((moment) => ({
    ...moment,
    demarches: demarches.filter((d) => d.moment === moment.cle),
  })).filter((g) => g.demarches.length > 0);

  return (
    <section className={styles.bloc} aria-label={titre}>
      <h3 className={styles.titre}>{titre}</h3>
      <p className={styles.introduction}>
        {introduction ??
          "L'apport augmente le capital de " +
            holding +
            ", mais il change aussi d'associé la société dont les titres partent. Voici les deux côtés, dans l'ordre où cela se fait."}
      </p>

      <ol className={styles.moments}>
        {groupes.map((groupe) => (
          <li key={groupe.cle} className={styles.moment}>
            {/*
              La pastille porte le rang, non une couleur d'état.

              Un filet coloré le long du bloc aurait dit « attention » sur le premier
              moment et rien sur les suivants, alors qu'aucun n'est facultatif. Le rail
              et la pastille disent l'ordre, qui est la seule chose à lire ici.
            */}
            <div className={styles.momentTete}>
              <span className={styles.pastille} aria-hidden="true" />
              <div>
                <p className={styles.momentQuand}>{groupe.libelle}</p>
                <p className={styles.momentDetail}>{groupe.detail}</p>
              </div>
            </div>

            <ul className={styles.demarches}>
              {groupe.demarches.map((demarche) => (
                <Demarche key={demarche.cle} demarche={demarche} />
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {/*
        Le second dossier, et pourquoi il n'est pas ouvert d'office.
        
        C'est l'autre société : deux greffes possibles, deux jeux d'actes, deux dépôts.
        Les fondre au premier dossier reviendrait à déposer les statuts de l'une sous le
        numéro de l'autre.
      */}
      {dossier != null && (
        <OuvrirLeDossierApportee
          dossier={dossier}
          nomApportee={nomDeLaSocieteApportee(contexte)}
          dejaOuvert={dossierApportee}
        />
      )}

      {pasDu.length > 0 && (
        /*
          Dire ce qu'on ne doit pas fait partie du conseil.

          Les sites qui vendent des annonces légales affirment qu'une cession de parts en
          appelle une ; un client qui les lit en achète une pour rien, et nous laisse
          croire que nous l'avons oubliée.
        */
        <div className={styles.pasDu}>
          <p className={styles.pasDuTitre}>Ce qui n&apos;est pas dû</p>
          {pasDu.map((phrase) => (
            <p key={phrase} className={styles.pasDuLigne}>
              {phrase}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function Demarche({ demarche }: { demarche: DemarcheDeLApport }) {
  return (
    <li className={styles.demarche}>
      <div className={styles.demarcheTete}>
        <p className={styles.demarcheQuoi}>{demarche.intitule}</p>
        {/*
          Qui tient la plume, en un mot.

          Sans cela, la liste se lit comme une facture de travail à faire soi-même, et
          l'on paye un cabinet en croyant qu'il n'en fait que la moitié.
        */}
        <span
          className={
            demarche.porteur === "cabinet"
              ? `${styles.porteur} ${styles.porteurNous}`
              : styles.porteur
          }
        >
          {demarche.porteur === "cabinet" ? "Nous le préparons" : "À vous"}
        </span>
      </div>
      <p className={styles.demarchePourquoi}>{demarche.explication}</p>
      {demarche.fondement && <p className={styles.demarcheFondement}>{demarche.fondement}</p>}
    </li>
  );
}

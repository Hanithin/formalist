import { dateLimiteApprobation, dateLimiteDepot, delaisDe } from "@/domain/comptes/regles";
import { natureDeLaForme } from "@/domain/formalite/formes";
import { etatDeLaSociete, natureDuDossier, type Societe } from "./portefeuille";

/**
 * Ce qu'une société doit, et pour quand.
 *
 * L'onglet des sociétés annonçait « Prochaine échéance » et affichait un tiret sur
 * toutes les lignes. La raison n'était pas un oubli d'affichage : les échéances ne se
 * calculaient que depuis un dossier déjà ouvert - la limite de dépôt d'un dossier
 * « comptes » en cours. Une société qui vient d'être créée n'en avait donc aucune, et
 * le rappel arrivait après le geste qu'il devait provoquer.
 *
 * Une obligation ne se déduit pas d'un dossier mais de la société elle-même : sa forme
 * et la clôture de son exercice suffisent. Les deux sont saisies à la création, et les
 * délais sont déjà écrits dans `domain/comptes/regles` avec leurs fondements.
 *
 * Ce module ne devine jamais. Sans forme reconnue ou sans date de clôture, il ne rend
 * rien - un dirigeant à qui l'on annonce une échéance fausse cesse de croire les
 * vraies.
 */

export type NatureObligation = "approbation" | "depot";

export interface Obligation {
  cle: string;
  nature: NatureObligation;
  /** « Approuver les comptes de l'exercice 2027 ». */
  intitule: string;
  /** « Approbation des comptes 2027 » : la même chose, pour une colonne étroite. */
  intituleCourt: string;
  /** La date limite en ISO, ou null quand seuls les statuts la fixent. */
  limite: string | null;
  /** L'exercice concerné, par son année de clôture. */
  exercice: number;
  /** Ce que c'est, en français courant. */
  explication: string;
  /** Le texte qui l'impose, repris de `delaisDe`. */
  fondement: string;
  bouton: string;
  lien: string;
}

/** Le jour même compte : une échéance d'aujourd'hui n'est pas encore dépassée. */
export function enRetard(obligation: Obligation, aujourdHui: Date = new Date()): boolean {
  if (!obligation.limite) return false;
  return obligation.limite < jour(aujourdHui);
}

function jour(quand: Date): string {
  return quand.toISOString().slice(0, 10);
}

/**
 * La dernière clôture survenue, à partir de la première.
 *
 * Un exercice se répète chaque année au même quantième. On remonte donc d'année en
 * année depuis la première clôture jusqu'à dépasser aujourd'hui, et l'on garde la
 * précédente. Rend null tant que le premier exercice n'est pas clos : il n'y a alors
 * aucun compte à approuver, et l'annoncer serait faux.
 */
export function derniereCloture(premiereIso: string, aujourdHui: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(premiereIso)) return null;

  const premiere = new Date(premiereIso + "T00:00:00Z");
  if (Number.isNaN(premiere.getTime())) return null;

  const limite = jour(aujourdHui);
  if (premiereIso > limite) return null;

  let clot = premiere;
  for (;;) {
    const suivante = new Date(clot);
    suivante.setUTCFullYear(suivante.getUTCFullYear() + 1);
    /*
     * Le quantième peut ne pas exister l'année suivante : un exercice clos le 29
     * février se referme le 28. `setUTCFullYear` rendrait le 1er mars.
     */
    if (suivante.getUTCDate() !== clot.getUTCDate()) suivante.setUTCDate(0);
    if (jour(suivante) > limite) return jour(clot);
    clot = suivante;
  }
}

/** L'exercice a-t-il déjà été déposé par un dossier de cette société ? */
function dejaFait(societe: Societe, clotureIso: string): boolean {
  return societe.dossiers.some(
    (d) =>
      natureDuDossier(d.type) === "comptes" &&
      d.status === "terminee" &&
      d.clotureDeclaree === clotureIso
  );
}

/**
 * Les obligations comptables d'une société, la plus proche d'abord.
 *
 * Deux au plus, et souvent une seule : approuver, puis déposer. L'approbation d'une
 * société civile n'a pas de date légale - ce sont ses statuts qui la fixent - et elle
 * ne dépose rien au greffe : `delaisDe` le dit, et son fondement l'explique plutôt que
 * de laisser croire à un oubli.
 */
export function obligationsDeLaSociete(
  societe: Societe & { clotureDuPremierExercice?: string | null },
  aujourdHui: Date = new Date()
): Obligation[] {
  // Une forme qu'on ne reconnaît pas ne commande aucun délai : on ne suppose pas.
  if (!natureDeLaForme(societe.forme).code) return [];

  /*
   * Une société qui n'existe pas encore ne doit rien.
   *
   * Tant que l'immatriculation n'est pas faite, il n'y a pas de personne morale, donc
   * pas de comptes à approuver ni à déposer. Réclamer un dépôt à qui attend son Kbis
   * ferait douter de tout le reste. Une société radiée ne doit plus rien non plus.
   */
  const etat = etatDeLaSociete(societe).etat;
  if (etat === "en-creation" || etat === "radiee") return [];

  const premiere = societe.clotureDuPremierExercice;
  if (!premiere) return [];

  const cloture = derniereCloture(premiere, aujourdHui);
  if (!cloture) return [];
  if (dejaFait(societe, cloture)) return [];

  const exercice = Number(cloture.slice(0, 4));
  const delais = delaisDe(societe.forme);
  const obligations: Obligation[] = [];

  const approbation = dateLimiteApprobation(societe.forme, cloture);
  obligations.push({
    cle: "approbation-" + societe.cle + "-" + exercice,
    nature: "approbation",
    intitule: "Approuver les comptes de l'exercice " + exercice,
    intituleCourt: "Approbation des comptes " + exercice,
    limite: approbation,
    exercice,
    explication: delais.approbationMois
      ? "Les associés se prononcent sur les comptes de l'exercice clos, et décident du sort du résultat."
      : "Le gérant rend compte de sa gestion ; la date est celle que fixent vos statuts.",
    fondement: delais.fondementApprobation,
    bouton: "Préparer",
    lien: "/depot-des-comptes",
  });

  if (delais.depotAuGreffe && approbation) {
    obligations.push({
      cle: "depot-" + societe.cle + "-" + exercice,
      nature: "depot",
      intitule: "Déposer les comptes de l'exercice " + exercice,
      intituleCourt: "Dépôt des comptes " + exercice,
      limite: dateLimiteDepot(approbation),
      exercice,
      explication:
        "Les comptes approuvés sont déposés au greffe, où ils deviennent consultables.",
      fondement: delais.fondementDepot,
      bouton: "Déposer les comptes",
      lien: "/depot-des-comptes",
    });
  }

  /*
   * La plus proche d'abord, et celles sans date en dernier.
   *
   * Une approbation sans date légale - la société civile - ne presse pas plus qu'une
   * autre : elle informe. La faire passer devant une échéance datée tromperait sur
   * l'urgence.
   */
  return obligations.sort((a, b) => (a.limite ?? "9999").localeCompare(b.limite ?? "9999"));
}

/**
 * Le temps qui reste, en toutes lettres.
 *
 * « dans 22 mois » se lit d'un coup d'œil quand « 2028-07-31 » demande un calcul. En
 * retard, on compte les jours : c'est à ce grain que le retard se rattrape.
 */
export function delaiLisible(limiteIso: string, aujourdHui: Date = new Date()): string {
  const limite = new Date(limiteIso + "T00:00:00Z");
  const depuis = new Date(jour(aujourdHui) + "T00:00:00Z");
  const jours = Math.round((limite.getTime() - depuis.getTime()) / 86_400_000);

  if (jours < 0) {
    const retard = -jours;
    return retard === 1 ? "en retard d'un jour" : "en retard de " + retard + " jours";
  }
  if (jours === 0) return "aujourd'hui";
  if (jours === 1) return "demain";
  if (jours < 31) return "dans " + jours + " jours";

  const mois = Math.round(jours / 30.44);
  if (mois <= 1) return "dans un mois";
  if (mois < 24) return "dans " + mois + " mois";
  return "dans " + Math.round(mois / 12) + " ans";
}

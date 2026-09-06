import { type Ton } from "@/domain/formalite/accueil";
import styles from "./TableauDeBord.module.css";


/*
 * Ce qui reste de l'accueil d'avant.
 *
 * La page portait sept sections : trois chiffres, un bandeau de reprise, des documents
 * récents, une liste d'attentes, une file de travail, des échéances, une activité
 * récente et un catalogue. Le dossier sur lequel on travaille y paraissait quatre fois,
 * sous quatre formes, et la question qu'on se pose en ouvrant la page - « qu'est-ce que
 * je fais maintenant ? » - se lisait au quatrième cadre.
 *
 * Il en reste deux colonnes : `DossierEnTete` et `AutresFormalites`. Ce fichier ne
 * garde que ce qu'elles emploient - les échéances, la pastille d'état - et le reste a
 * été retiré plutôt que laissé en réserve : du code mort qui a l'air vivant se remet
 * en service par inadvertance.
 */

/* ------------------------------------------------------- Les échéances */

const MOIS_LISIBLE = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function dateLisible(iso: string): string {
  const date = new Date(iso + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? iso : MOIS_LISIBLE.format(date);
}

export function StatutBadge({ ton, libelle }: { ton: Ton; libelle: string }) {
  /*
   * Le mot porte l'information, la couleur ne fait que l'appuyer.
   *
   * Un badge qui ne se distinguerait que par sa teinte serait illisible pour qui ne
   * distingue pas les couleurs - et sur une capture en noir et blanc.
   */
  const teinte =
    ton === "action"
      ? styles.badgeAction
      : ton === "termine"
        ? styles.badgeTermine
        : ton === "validation"
          ? styles.badgeValidation
          : "";

  return <span className={`${styles.badge} ${teinte}`}>{libelle}</span>;
}

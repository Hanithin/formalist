import { prisma } from "../client";
import { mesDossiers } from "./dossiers";
import { nonLus as nonLusDuSupport } from "./support";
import type { UtilisateurConnecte } from "../sessions";
import { COLONNE_VIDE, type ResumeColonne } from "@/domain/navigation/colonne";
import { nomAffichable } from "@/domain/formalite/liste";

/**
 * Ce que la colonne de navigation affiche en plus de ses liens : la société
 * active, le nombre de dossiers en cours et le total des messages non lus.
 *
 * La page d'origine allait le chercher en JavaScript après l'affichage, sur
 * /api/formalites puis /api/support/unread, et gardait les valeurs en
 * sessionStorage pour masquer le clignotement des chiffres qui apparaissaient
 * après coup (dashboard.html, L1927-1941). Ici le calcul précède le rendu : il n'y
 * a rien à masquer, et le cache devient inutile.
 *
 * Deux requêtes, quel que soit le nombre de dossiers.
 */

/**
 * Les types de dossier qui désignent une société, au sens du bloc de contexte.
 *
 * La fermeture et le dépôt des comptes en font partie : une société qu'on ferme reste
 * celle sur laquelle on travaille, et l'écarter faisait disparaître le bloc de
 * contexte de quelqu'un qui n'a que ce dossier-là.
 */
const TYPES_SOCIETE = new Set(["creation", "modification", "fermeture", "depot"]);

/** Un dossier clos ne compte plus comme « en cours ». */
const CLOS = new Set(["terminee", "archive"]);

/**
 * Ce qui attend le cabinet : ses dossiers, et ceux que personne n'a pris.
 *
 * Même définition que la liste de l'espace avocat, sans quoi le compteur annoncerait
 * un travail qu'on ne retrouve pas en cliquant. Zéro pour un client : la requête n'est
 * lancée que si l'entrée existe.
 */
async function dossiersAReviser(utilisateur: UtilisateurConnecte): Promise<number> {
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) return 0;

  return prisma.formalites.count({
    where: {
      status: { notIn: ["en_cours", "terminee", "archive", "rejete"] },
      OR: [{ assigned_avocat_id: utilisateur.id }, { assigned_avocat_id: null }],
    },
  });
}

export async function resumeColonne(utilisateur: UtilisateurConnecte): Promise<ResumeColonne> {
  // Les siens, jamais ceux de toute la plateforme : le compteur d'un administrateur
  // annonçait le travail de tous les comptes.
  const dossiers = await mesDossiers(utilisateur);
  if (dossiers.length === 0) {
    return {
      ...COLONNE_VIDE,
      nonLus: await nonLusDuSupport(utilisateur),
      aReviser: await dossiersAReviser(utilisateur),
    };
  }

  // Même définition que la colonne d'origine : un dossier de création ou de
  // modification, portant une dénomination.
  /*
   * Un dossier sans société n'a rien à situer.
   *
   * Le bandeau « Vous travaillez sur » affichait alors « Société à identifier », qui
   * est un marqueur de base de données et se lit comme un nom : on cherche laquelle,
   * et l'on clique pour comprendre. Tant que la société n'est pas choisie, le bandeau
   * n'apparaît pas - il reviendra dès qu'il aura quelque chose à dire.
   */
  const societes = dossiers.filter(
    (d) => nomAffichable(d.societe) && (!d.type || TYPES_SOCIETE.has(d.type))
  );

  const enCours = dossiers.filter((d) => !CLOS.has(d.status ?? "")).length;

  const [messages, support, aReviser] = await Promise.all([
    // Ses propres messages ne lui sont pas signalés comme non lus.
    prisma.messages.count({
      where: {
        formalite_id: { in: dossiers.map((d) => d.id) },
        read: false,
        sender_id: { not: utilisateur.id },
      },
    }),
    nonLusDuSupport(utilisateur),
    dossiersAReviser(utilisateur),
  ]);

  // Le plus récemment touché : mesDossiers rend la liste par updated_at décroissant.
  const enTete = societes[0];

  return {
    societe: enTete?.societe ?? null,
    type: enTete?.type ?? null,
    plusieurs: societes.length > 1,
    enCours,
    nonLus: messages + support,
    aReviser,
  };
}

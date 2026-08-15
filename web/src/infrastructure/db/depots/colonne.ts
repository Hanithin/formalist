import { prisma } from "../client";
import { mesDossiers } from "./dossiers";
import { nonLus as nonLusDuSupport } from "./support";
import type { UtilisateurConnecte } from "../sessions";
import { COLONNE_VIDE, type ResumeColonne } from "@/domain/navigation/colonne";

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

export async function resumeColonne(utilisateur: UtilisateurConnecte): Promise<ResumeColonne> {
  // Les siens, jamais ceux de toute la plateforme : le compteur d'un administrateur
  // annonçait le travail de tous les comptes.
  const dossiers = await mesDossiers(utilisateur);
  if (dossiers.length === 0) return { ...COLONNE_VIDE, nonLus: await nonLusDuSupport(utilisateur) };

  // Même définition que la colonne d'origine : un dossier de création ou de
  // modification, portant une dénomination.
  const societes = dossiers.filter(
    (d) => d.societe?.trim() && (!d.type || TYPES_SOCIETE.has(d.type))
  );

  const enCours = dossiers.filter((d) => !CLOS.has(d.status ?? "")).length;

  const [messages, support] = await Promise.all([
    // Ses propres messages ne lui sont pas signalés comme non lus.
    prisma.messages.count({
      where: {
        formalite_id: { in: dossiers.map((d) => d.id) },
        read: false,
        sender_id: { not: utilisateur.id },
      },
    }),
    nonLusDuSupport(utilisateur),
  ]);

  // Le plus récemment touché : mesDossiers rend la liste par updated_at décroissant.
  const enTete = societes[0];

  return {
    societe: enTete?.societe ?? null,
    type: enTete?.type ?? null,
    plusieurs: societes.length > 1,
    enCours,
    nonLus: messages + support,
  };
}

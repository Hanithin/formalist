import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/infrastructure/db/client";
import { ecrirePieceJointe } from "@/infrastructure/documents/depot";
import { PIECES_DU_CABINET } from "@/domain/formalite/domiciliation";
import type { UtilisateurConnecte } from "@/infrastructure/db/sessions";

/**
 * Les pièces du cabinet, déposées une fois et reprises sur chaque dossier.
 *
 * Elles ne suivent pas un dossier : elles sont au cabinet, et c'est ce qui permet à un
 * dépôt au guichet de rester un geste. Recopiées dossier par dossier, elles vieillissaient
 * en silence - un extrait Kbis de six mois part sans que rien ne le dise, et le greffe
 * le refuse des semaines plus tard.
 */

const DEPOT = path.join(process.cwd(), "..", "uploads");

export interface PieceCabinetDeposee {
  identifiant: string;
  nomFichier: string;
  chemin: string;
  etabliLe: string | null;
  deposeLe: string;
}

interface Ligne {
  identifiant: string;
  nom_fichier: string;
  chemin: string;
  etabli_le: Date | null;
  depose_le: Date;
}

/** « 2026-08-20 » : la date se garde telle qu'elle a été déclarée, sans heure. */
function jour(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export async function piecesDuCabinet(): Promise<PieceCabinetDeposee[]> {
  const lignes = await prisma.$queryRaw<Ligne[]>`
    SELECT identifiant, nom_fichier, chemin, etabli_le, depose_le
    FROM pieces_du_cabinet
  `;

  return lignes.map((l: Ligne) => ({
    identifiant: l.identifiant,
    nomFichier: l.nom_fichier,
    chemin: l.chemin,
    etabliLe: jour(l.etabli_le),
    deposeLe: l.depose_le.toISOString(),
  }));
}

export class PieceDuCabinetInconnue extends Error {
  readonly statut = 400;
  constructor(identifiant: string) {
    super("Pièce inconnue : " + identifiant);
  }
}

/**
 * Remplace une pièce du cabinet.
 *
 * Il n'y en a qu'une par identifiant : redéposer un Kbis remplace le précédent, comme
 * on remplace un document périmé dans un classeur. L'ancien fichier reste sur le
 * disque - c'est le registre des téléversements qui en garde la trace, et il vaut mieux
 * un fichier orphelin qu'une pièce effacée par erreur.
 */
export async function remplacerLaPieceDuCabinet(
  utilisateur: UtilisateurConnecte,
  identifiant: string,
  fichier: File,
  etabliLe: string | null
): Promise<PieceCabinetDeposee> {
  const attendue = PIECES_DU_CABINET.find((p) => p.identifiant === identifiant);
  if (!attendue) throw new PieceDuCabinetInconnue(identifiant);

  const nom = await ecrirePieceJointe(fichier, attendue.formats);

  await prisma.uploaded_files.create({
    data: { filename: nom, user_id: utilisateur.id, original_name: fichier.name },
  });

  await prisma.$executeRaw`
    INSERT INTO pieces_du_cabinet (identifiant, nom_fichier, chemin, etabli_le, depose_par)
    VALUES (${identifiant}, ${fichier.name}, ${nom}, ${etabliLe}::date, ${utilisateur.id})
    ON CONFLICT (identifiant) DO UPDATE SET
      nom_fichier = EXCLUDED.nom_fichier,
      chemin      = EXCLUDED.chemin,
      etabli_le   = EXCLUDED.etabli_le,
      depose_par  = EXCLUDED.depose_par,
      depose_le   = now(),
      updated_at  = now()
  `;

  return {
    identifiant,
    nomFichier: fichier.name,
    chemin: nom,
    etabliLe,
    deposeLe: new Date().toISOString(),
  };
}

/** Le contenu d'une pièce du cabinet, pour la joindre à un dépôt. */
export async function lirePieceDuCabinet(identifiant: string): Promise<Buffer | null> {
  const [ligne] = await prisma.$queryRaw<Ligne[]>`
    SELECT identifiant, nom_fichier, chemin, etabli_le, depose_le
    FROM pieces_du_cabinet WHERE identifiant = ${identifiant}
  `;
  if (!ligne) return null;

  try {
    return await readFile(path.join(DEPOT, ligne.chemin));
  } catch {
    /* Le registre connaît la pièce, le disque ne l'a plus : c'est un manque, non un plantage. */
    return null;
  }
}

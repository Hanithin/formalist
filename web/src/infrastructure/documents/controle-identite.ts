import { prisma } from "@/infrastructure/db/client";
import { journal } from "@/lib/journal";
import { RedactionIndisponible } from "@/infrastructure/ia/indisponible";
import { lireLaPieceDIdentite } from "@/infrastructure/ia/lecture-identite";
import { mesurerLaPiece, enJpegPourLecture } from "./mesures-image";
import {
  controler,
  lesMesuresSuffisentARefuser,
  type Controle,
  type LectureDeLaPiece,
} from "@/domain/formalite/controle-identite";

/**
 * Le contrôle d'une pièce d'identité au moment où elle est déposée.
 *
 * Il assemble les deux couches et écrit le verdict à côté de la pièce. Rien de ce qui
 * décide n'est ici : les seuils, les règles de péremption et les phrases vivent dans le
 * domaine, que l'on peut éprouver sans réseau ni base.
 *
 * Le dépôt lui-même n'est jamais empêché. Une pièce refusée est reçue, stockée, et
 * marquée comme à remplacer - exactement comme lorsque l'avocat la refuse à la main.
 * C'est ce qui permet au client de voir ce qu'il a envoyé et de comprendre le motif ;
 * écarter le fichier lui laisserait un écran vide et une phrase.
 */

/** Ce que le contrôle rend à la route, verdict compris. */
export interface PieceControlee {
  controle: Controle;
  /** La pièce est retenue : elle attend son remplacement. */
  refusee: boolean;
}

/**
 * Contrôle la pièce, inscrit le verdict, et retient la pièce s'il le faut.
 *
 * Le motif de refus est le résumé du verdict, mot pour mot. Il alimente trois écrans
 * qui ne se parlent pas - la carte de dépôt, l'état des pièces qui retient le règlement,
 * la file de l'avocat - et une phrase unique évite qu'ils racontent trois histoires.
 *
 * Une panne n'est jamais un refus. Si la lecture n'aboutit pas, seules les mesures
 * jouent, et le verdict le dit : l'avocat voit que la pièce n'a pas été lue, plutôt
 * qu'un contrôle prétendument passé.
 */
export async function controlerLaPieceDIdentite(
  documentId: number,
  fichier: { contenu: Buffer; extension: string },
  options: { nomAttendu?: string | null } = {}
): Promise<PieceControlee> {
  const estUnPdf = fichier.extension === ".pdf";

  const mesures = await mesurerLaPiece(fichier.contenu, fichier.extension);

  /*
   * Ce que les mesures refusent déjà ne part pas à la lecture.
   *
   * Une image de trois cents pixels de large, ou floue à n'y distinguer aucun
   * caractère, est refusée quoi que le modèle en rapporte : l'y envoyer coûte un appel
   * payant et quelques secondes d'attente pour aboutir au même refus, formulé moins
   * bien. Le client, lui, attend devant sa carte de dépôt.
   */
  const inutile = lesMesuresSuffisentARefuser(mesures);

  let lecture: LectureDeLaPiece | null = null;
  if (!inutile) {
    try {
      /*
       * Un PDF part tel quel ; une image passe d'abord par un JPEG.
       *
       * Ce n'est pas une commodité : le HEIC des iPhone, qui est le format par défaut de
       * tout appareil récent et donc le cas le plus fréquent, n'est pas accepté en entrée
       * par le modèle. Sans cette conversion, la lecture échouerait précisément sur les
       * pièces les plus courantes, et le contrôle se réduirait aux mesures.
       */
      const aLire = estUnPdf ? fichier.contenu : await enJpegPourLecture(fichier.contenu);
      lecture = await lireLaPieceDIdentite(aLire, { estUnPdf });
    } catch (e) {
      if (!(e instanceof RedactionIndisponible)) throw e;
      journal.warn(
        { document: documentId, fournisseur: e.fournisseur, statut: e.statutFournisseur },
        "Pièce d'identité non lue : contrôle réduit aux mesures"
      );
    }
  }

  const controle = controler({
    lecture,
    mesures,
    nomAttendu: options.nomAttendu,
    lectureInutile: inutile,
  });
  const refusee = controle.gravite === "refusee";

  await prisma.documents.update({
    where: { id: documentId },
    data: {
      controle_json: JSON.stringify(controle),
      ...(refusee
        ? { rejection_reason: controle.resume.slice(0, 500), rejected_at: new Date() }
        : {}),
    },
  });

  return { controle, refusee };
}

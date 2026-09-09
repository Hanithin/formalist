import { journal } from "@/lib/journal";
import { demander, type Identifiants } from "./transport";
import {
  depotDuDossier,
  detailDuDepot,
  lienVersLaFormalite,
  referenceDuDossier,
} from "./formalites";
import { joindreLaPiece, pieceDepuisUnActe, type PieceAJoindre } from "./pieces";
import { noterLeDepot } from "@/infrastructure/db/depots/guichet";
import { lireDocumentProduit, lirePieceDeposee } from "@/infrastructure/documents/depot";
import { documentsAProduire } from "@/domain/formalite/documents";
import { conjointRequis } from "@/domain/formalite/etat-civil";
import { lireLeStatut } from "@/domain/guichet/statut";
import {
  ACTES_SANS_CODE,
  PIECES_DES_ACTES,
  PIECES_DU_CABINET_AU_GUICHET,
  PIECES_TELEVERSEES,
  pieceDuSiege,
  type PieceDuGuichet,
} from "@/domain/guichet/pieces";
import {
  PIECES_DU_CABINET,
  piecesDuCabinetIncompletes,
} from "@/domain/formalite/domiciliation";
import {
  lirePieceDuCabinet,
  piecesDuCabinet,
} from "@/infrastructure/db/depots/pieces-cabinet";
import {
  formaliteDeCreation,
  type ComplementDeDepot,
  type Manque,
} from "@/domain/guichet/creation";
import type { Brouillon } from "@/domain/formalite/parcours";

/**
 * Déposer une création au guichet unique, d'un seul geste.
 *
 * Quatre appels s'enchaînent, et le contrat ne permet pas de les fondre : créer la
 * formalité, y joindre les pièces, faire regénérer la synthèse, signer. Le troisième
 * n'est pas décoratif - il recalcule le panier et refait le PDF de synthèse ; signer
 * sans lui, c'est signer un document qui ignore les pièces qu'on vient de joindre.
 *
 * La signature d'une création est « simple » au sens du contrat : un appel avec la seule
 * référence de la formalité. C'est la modification qui exige un certificat électronique
 * et une synthèse signée à la main - raison pour laquelle ce module ne traite que la
 * création, et le dit dans son nom.
 *
 * Éprouvé contre `guichet-unique-demo.inpi.fr` : `npm run guichet:depot` rejoue la même
 * séquence sur un dossier fictif.
 */

export class DepotIncomplet extends Error {
  readonly statut = 428;
  constructor(readonly manques: Manque[]) {
    super("Le dossier ne porte pas tout ce que le guichet exige");
    this.name = "DepotIncomplet";
  }
}

export class DejaDepose extends Error {
  readonly statut = 409;
  constructor(readonly formaliteId: number) {
    super("Ce dossier a déjà été déposé au guichet unique");
    this.name = "DejaDepose";
  }
}

export interface ResultatDuDepot {
  formaliteId: number;
  /** Où la voir chez eux. */
  lien: string;
  numNat: string | null;
  statut: string | null;
  explication: string;
  /** Ce qui est parti, par son nom de fichier. */
  piecesJointes: string[];
  /**
   * Ce qui n'a pas pu partir, et pourquoi.
   *
   * Le guichet n'accepte que du PDF. Nos actes en deviennent, mais une carte d'identité
   * photographiée reste une image : la joindre échouerait, et la taire ferait croire le
   * dossier complet. L'avocat la dépose alors à la main, en sachant laquelle.
   */
  piecesEcartees: { nom: string; raison: string }[];
}

/** Le nom de fichier que le déposant lira dans son dossier. */
function nomDeFichier(titre: string): string {
  return titre.replace(/[\\/]/g, "-") + ".pdf";
}

/**
 * Les actes du cabinet, convertis et codés.
 *
 * Un même document vaut parfois deux pièces : les modèles des greffes réunissent la
 * non-condamnation et la filiation, le guichet les sépare. Le fichier part alors deux
 * fois, sous deux codes - taire l'un des deux ferait manquer une pièce au dossier.
 */
async function actesDuDossier(
  dossierId: number,
  brouillon: Brouillon,
  ecartees: { nom: string; raison: string }[]
): Promise<PieceAJoindre[]> {
  const attendus = documentsAProduire({
    forme: brouillon.forme ?? "",
    aUnDirigeant: (brouillon.dirigeants ?? []).length > 0,
    conjointMarie: (brouillon.associes ?? []).some(
      (a) => a.type !== "morale" && conjointRequis(a.personne?.situationMatrimoniale)
    ),
    /* Deux modes sur quatre produisent une attestation, et ce ne sont pas les mêmes. */
    modeDomiciliation: brouillon.modeDomiciliation,
  });

  const pieces: PieceAJoindre[] = [];
  for (const document of attendus) {
    const codes = PIECES_DES_ACTES[document.type];
    if (!codes) {
      /*
       * Un acte sans code se dit, il ne se tait pas.
       *
       * Le pouvoir n'a pas de code publié au guichet : passé en silence, il manquait au
       * dossier sans que personne ne puisse le savoir avant le refus.
       */
      if (ACTES_SANS_CODE.has(document.type)) {
        ecartees.push({
          nom: document.titre,
          raison: "Le guichet ne publie pas le code de cette pièce : à joindre à la main",
        });
      }
      continue;
    }

    const docx = await lireDocumentProduit(dossierId, document.titre);
    if (!docx) {
      ecartees.push({ nom: document.titre, raison: "L'acte n'a pas encore été produit" });
      continue;
    }

    for (const code of codes) {
      pieces.push(await pieceDepuisUnActe(nomDeFichier(document.titre), code, docx));
    }
  }
  return pieces;
}

/** Un PDF commence par « %PDF- » : c'est plus sûr que de croire une extension. */
function estUnPdf(contenu: Buffer): boolean {
  return contenu.subarray(0, 5).toString("latin1") === "%PDF-";
}

/**
 * Les pièces du client, telles qu'il les a déposées.
 *
 * Elles ne se convertissent pas : notre conversion passe par LibreOffice et ne sait
 * traiter que du Word. Une attestation scannée en PDF part telle quelle ; une carte
 * d'identité photographiée est écartée, nommément, plutôt que refusée par le guichet au
 * milieu de la série.
 */
async function piecesDuClient(
  dossierId: number,
  brouillon: Brouillon,
  ecartees: { nom: string; raison: string }[]
): Promise<PieceAJoindre[]> {
  const attendues: [string, PieceDuGuichet][] = [
    ["depot-capital", PIECES_TELEVERSEES["depot-capital"]],
    ["identite", PIECES_TELEVERSEES.identite],
    ["domiciliation", pieceDuSiege(brouillon.modeDomiciliation)],
  ];

  const pieces: PieceAJoindre[] = [];
  for (const [type, code] of attendues) {
    const fichier = await lirePieceDeposee(dossierId, type);
    if (!fichier) continue;

    if (!estUnPdf(fichier.contenu)) {
      ecartees.push({
        nom: fichier.nom,
        raison: "Le guichet n'accepte que le PDF : à joindre à la main",
      });
      continue;
    }
    pieces.push({ nom: fichier.nom, type: code, pdf: fichier.contenu });
  }

  /*
   * Les pièces du cabinet, quand c'est lui qui domicilie.
   *
   * Elles ne viennent pas du dossier : le cabinet les dépose une fois dans
   * l'administration et elles servent partout. L'extrait Kbis n'a pas de code connu au
   * guichet - il est signalé comme restant à joindre à la main plutôt que d'être tu.
   */
  if (brouillon.modeDomiciliation === "Domiciliation au cabinet") {
    for (const attendue of PIECES_DU_CABINET) {
      const contenu = await lirePieceDuCabinet(attendue.identifiant);
      if (!contenu) {
        ecartees.push({
          nom: attendue.titre,
          raison: "Absente : à déposer dans l'administration du cabinet",
        });
        continue;
      }

      const code = PIECES_DU_CABINET_AU_GUICHET[attendue.identifiant];
      if (!code) {
        ecartees.push({
          nom: attendue.titre,
          raison: "Le guichet ne publie pas le code de cette pièce : à joindre à la main",
        });
        continue;
      }

      if (!estUnPdf(contenu)) {
        ecartees.push({
          nom: attendue.titre,
          raison: "Le guichet n'accepte que le PDF : à joindre à la main",
        });
        continue;
      }

      pieces.push({ nom: attendue.titre + ".pdf", type: code, pdf: contenu });
    }
  }

  return pieces;
}

/**
 * Ce qui manque au cabinet pour domicilier.
 *
 * Un extrait Kbis ou un justificatif de domicile de plus de trois mois se fait refuser
 * au greffe. Le laisser partir, c'est perdre les semaines qui séparent le dépôt du
 * refus, et recommencer - alors que le manque se voit ici, avant d'envoyer quoi que ce
 * soit.
 *
 * Ces manques rejoignent ceux du contenu : même liste, même écran, même refus 428. Le
 * dossier n'est pas en cause - c'est le classeur du cabinet - et l'origine le dit.
 */
async function manquesDuCabinet(brouillon: Brouillon): Promise<Manque[]> {
  if (brouillon.modeDomiciliation !== "Domiciliation au cabinet") return [];

  const deposees = (await piecesDuCabinet()).map((p) => ({
    identifiant: p.identifiant,
    etabliLe: p.etabliLe,
  }));

  return piecesDuCabinetIncompletes(deposees).map(({ piece, etat }) => ({
    chemin: "cabinet." + piece.identifiant,
    quoi:
      piece.titre +
      (etat === "absente"
        ? " : à déposer dans l'administration du cabinet"
        : etat === "perimee"
          ? " : plus de trois mois, à renouveler"
          : " : sa date n'est pas renseignée"),
    origine: "configuration" as const,
  }));
}

/**
 * Dépose la création, et rend ce que le guichet en dit.
 *
 * Un dossier déjà déposé ne se redépose pas : le guichet accepterait une seconde
 * formalité, et la société serait immatriculée deux fois. C'est la première chose qu'on
 * vérifie, avant même de composer le contenu.
 */
export async function deposerLaCreation(
  dossierId: number,
  brouillon: Brouillon,
  complement: ComplementDeDepot,
  compte: Identifiants
): Promise<ResultatDuDepot> {
  const dejaLa = await depotDuDossier(dossierId, compte);
  if (dejaLa) throw new DejaDepose(dejaLa.id);

  const { corps, manques } = formaliteDeCreation(
    brouillon,
    referenceDuDossier(dossierId),
    complement
  );
  manques.push(...(await manquesDuCabinet(brouillon)));
  if (manques.length > 0) throw new DepotIncomplet(manques);

  const cree = (await demander(
    "/api/formalities",
    { method: "POST", body: JSON.stringify(corps) },
    compte
  )) as { id?: unknown } | null;

  const formaliteId = typeof cree?.id === "number" ? cree.id : null;
  if (formaliteId === null) {
    throw new Error("Le guichet n'a pas rendu d'identifiant de formalité");
  }
  journal.info({ dossierId, formaliteId }, "Guichet unique : formalité créée");

  /*
   * La formalité est notée avant les pièces.
   *
   * Si l'une d'elles échoue, le dépôt existe déjà chez eux : sans cette ligne, un second
   * clic en créerait un autre, et le premier resterait orphelin au guichet. On enregistre
   * ce qui est fait dès que c'est fait.
   */
  await noterLeDepot(dossierId, { id: formaliteId, statut: null, statutLe: null, numNat: null });

  const piecesEcartees: { nom: string; raison: string }[] = [];
  const pieces = [
    ...(await actesDuDossier(dossierId, brouillon, piecesEcartees)),
    ...(await piecesDuClient(dossierId, brouillon, piecesEcartees)),
  ];

  const piecesJointes: string[] = [];
  for (const piece of pieces) {
    await joindreLaPiece(formaliteId, piece, compte);
    piecesJointes.push(piece.nom);
  }

  /* La synthèse et le panier se recalculent avant la signature, jamais après. */
  await demander("/api/formalities/" + formaliteId + "/refresh", {}, compte);

  await demander(
    "/api/signatures",
    { method: "POST", body: JSON.stringify({ formality: "/api/formalities/" + formaliteId }) },
    compte
  );
  journal.info({ dossierId, formaliteId }, "Guichet unique : formalité signée");

  /*
   * L'état, relu chez eux, par identifiant.
   *
   * Il ne bascule pas dans la seconde - le guichet traite le panier en tâche de fond -
   * et lire aussitôt rendrait « en attente de signature » sur une formalité signée. On
   * rend ce qu'on voit, et la synchronisation suivante dira la suite.
   *
   * Par identifiant et non par référence : la liste du guichet est une projection
   * allégée qui retarde, et qui omet le numéro national qu'on vient chercher.
   */
  const relu = await detailDuDepot(formaliteId, compte);
  if (relu) await noterLeDepot(dossierId, relu);

  return {
    formaliteId,
    lien: lienVersLaFormalite(formaliteId),
    numNat: relu?.numNat ?? null,
    statut: relu?.statut ?? null,
    explication: lireLeStatut(relu?.statut ?? "").explication,
    piecesJointes,
    piecesEcartees,
  };
}

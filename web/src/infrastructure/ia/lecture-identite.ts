import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { journal } from "@/lib/journal";
import { RedactionIndisponible } from "./indisponible";
import type { LectureDeLaPiece } from "@/domain/formalite/controle-identite";

/**
 * Ce qu'un modèle lit sur une pièce d'identité.
 *
 * Il ne décide de rien. On lui demande de transcrire et de constater - la zone lisible
 * par machine telle qu'elle est imprimée, les dates, le nom, ce qui manque au cadrage -
 * et le jugement se fait ensuite, dans le domaine, sur ce qu'il a rapporté. La
 * séparation n'est pas une élégance : elle permet d'éprouver les règles de péremption
 * et de qualité sans appeler personne, et de changer de seuil sans toucher à l'invite.
 *
 * La MRZ occupe une place à part. C'est la seule chose qu'on lui demande de recopier
 * caractère par caractère, parce que ses clés de contrôle permettent ensuite de vérifier
 * la transcription : une date qui en sort a été validée par le calcul, là où une date
 * lue sur le recto a seulement été crue. C'est le même principe que la lecture d'un
 * bilan - les repères d'abord, le modèle ensuite.
 */

/*
 * Le modèle, en identifiant daté, et le même réglage qu'ailleurs.
 *
 * `CLAUDE_MODELE` sert déjà à la rédaction de l'objet social : un seul réglage pour les
 * deux usages évite qu'une mise à jour n'en déplace qu'un.
 */
const MODELE = process.env.CLAUDE_MODELE?.trim() || "claude-opus-5";

/*
 * Une pièce d'identité se lit vite, mais elle se lit en regardant.
 *
 * Le plafond de jetons est bas - la réponse est une fiche, pas un texte - et le délai
 * large, parce que l'image voyage avant que la lecture commence.
 */
const JETONS_MAXIMUM = 1500;
const DELAI_MS = 40_000;

/** Ce que la réponse doit avoir la forme d'être. */
const FICHE = z.object({
  est_une_piece_d_identite: z
    .boolean()
    .describe(
      "Vrai pour une carte nationale d'identité, un passeport ou un titre de séjour. Faux pour tout autre document."
    ),
  type: z
    .enum(["cni", "passeport", "titre-de-sejour", "autre"])
    .nullable()
    .describe("Le type de pièce, ou null si le document n'en est pas une."),
  mrz: z
    .array(z.string())
    .describe(
      "Les lignes de la zone lisible par machine, recopiées caractère par caractère, chevrons compris, sans espace ajouté. Tableau vide si elle n'est pas visible ou pas lisible."
    ),
  fin_de_validite: z
    .string()
    .nullable()
    .describe("La date de fin de validité imprimée, au format AAAA-MM-JJ, ou null."),
  delivree_le: z
    .string()
    .nullable()
    .describe("La date de délivrance imprimée, au format AAAA-MM-JJ, ou null."),
  nom: z.string().nullable().describe("Le nom de famille imprimé, ou null."),
  prenoms: z.string().nullable().describe("Les prénoms imprimés, ou null."),
  bords_coupes: z
    .boolean()
    .describe(
      "Vrai si le document est rogné par le cadrage : un bord, un coin, ou une ligne de la zone lisible par machine sort de l'image."
    ),
  champs_illisibles: z
    .array(z.string())
    .describe(
      "Les mentions présentes sur le document mais impossibles à lire, nommées en français : « date de validité », « numéro », « nom ». Tableau vide si tout se lit."
    ),
  reflet_ou_ombre: z
    .boolean()
    .describe("Vrai si un reflet, une ombre portée ou un doigt couvre une partie du document."),
});

const CONSIGNE = `Tu examines la photographie ou la numérisation d'une pièce d'identité déposée au dossier de création d'une société. Tu constates, tu ne juges pas : ne dis jamais si la pièce est acceptable ou non, cette décision est prise ailleurs.

Recopie la zone lisible par machine - les deux ou trois lignes de caractères majuscules et de chevrons en bas du document - exactement comme elle est imprimée, une chaîne par ligne, sans ajouter ni retirer un caractère. Un chevron est le signe <. Si un seul caractère est douteux, rends un tableau vide plutôt qu'une ligne approchée : une transcription fautive est pire qu'une absence.

Ne déduis aucune date : ne rends une date que si elle est imprimée et lisible sur le document. Si la pièce ne porte pas de date de fin de validité, rends null.

Signale un champ comme illisible uniquement si tu ne peux pas le lire sur cette image, pas s'il est absent du type de document.`;

function client(): Anthropic {
  const cle = process.env.ANTHROPIC_API_KEY?.trim();
  if (!cle) {
    throw new RedactionIndisponible("La lecture de la pièce est momentanément indisponible", null, {
      fournisseur: "claude",
    });
  }
  return new Anthropic({ apiKey: cle, timeout: DELAI_MS });
}

/**
 * Le bloc de contenu qui porte la pièce.
 *
 * Un PDF part tel quel, en document : le modèle le lit nativement, page par page, et
 * rasteriser nous-mêmes demanderait un moteur de rendu que nous n'avons pas. Une image
 * part en JPEG, converti en amont - le HEIC des iPhone, qui est le cas le plus fréquent,
 * n'est pas accepté en entrée.
 */
function contenuDeLaPiece(
  piece: Buffer,
  estUnPdf: boolean
): Anthropic.ContentBlockParam {
  const donnees = piece.toString("base64");

  return estUnPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: donnees },
      }
    : {
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: donnees },
      };
}

/**
 * Lit une pièce d'identité, ou renonce clairement.
 *
 * Rien n'est inventé quand le service manque : l'erreur remonte, et le contrôle se
 * poursuit sur les seules mesures. C'est la conduite de la lecture d'un bilan, et pour
 * la même raison - une panne de notre côté ne doit pas se payer d'un refus opposé au
 * client, qui redéposerait indéfiniment une pièce parfaite.
 */
export async function lireLaPieceDIdentite(
  piece: Buffer,
  options: { estUnPdf: boolean }
): Promise<LectureDeLaPiece> {
  let reponse;
  try {
    reponse = await client().messages.parse({
      model: MODELE,
      max_tokens: JETONS_MAXIMUM,
      system: CONSIGNE,
      messages: [
        {
          role: "user",
          content: [
            contenuDeLaPiece(piece, options.estUnPdf),
            { type: "text", text: "Relève ce que porte ce document." },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(FICHE) },
    });
  } catch (e) {
    const statut = e instanceof Anthropic.APIError ? e.status : undefined;
    throw new RedactionIndisponible("La lecture de la pièce est momentanément indisponible", e, {
      fournisseur: "claude",
      statutFournisseur: statut,
    });
  }

  const fiche = reponse.parsed_output;
  if (!fiche) {
    /*
     * Le modèle a répondu sans respecter la forme demandée.
     *
     * C'est un échec de lecture comme un autre - il n'y a rien à en tirer - et il doit
     * suivre le même chemin qu'une panne : la pièce passe, les mesures décident, et
     * l'avocat regarde. Les jetons consommés partent au journal, faute de quoi une
     * dérive du modèle coûterait sans laisser de trace.
     */
    journal.warn(
      { modele: MODELE, arret: reponse.stop_reason },
      "Lecture d'identité rendue hors forme"
    );
    throw new RedactionIndisponible("La lecture de la pièce est momentanément indisponible", null, {
      fournisseur: "claude",
    });
  }

  return {
    estUnePieceDIdentite: fiche.est_une_piece_d_identite,
    type: fiche.type,
    mrz: fiche.mrz.length > 0 ? fiche.mrz : null,
    finDeValidite: enIso(fiche.fin_de_validite),
    delivreeLe: enIso(fiche.delivree_le),
    nom: fiche.nom?.trim() || null,
    prenoms: fiche.prenoms?.trim() || null,
    bordsCoupes: fiche.bords_coupes,
    champsIllisibles: fiche.champs_illisibles.filter((c) => c.trim().length > 0),
    refletOuOmbre: fiche.reflet_ou_ombre,
  };
}

/**
 * Une date rendue par le modèle, ou rien.
 *
 * La forme est imposée par le schéma, mais un schéma n'empêche pas « 2026-13-45 » : ce
 * qui compte ici est qu'une date invalide ne devienne pas une péremption, c'est-à-dire
 * un refus opposé au client sur une lecture qui n'a pas de sens.
 */
function enIso(valeur: string | null): string | null {
  if (!valeur) return null;
  const propre = valeur.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(propre)) return null;
  const date = new Date(propre + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === propre ? propre : null;
}

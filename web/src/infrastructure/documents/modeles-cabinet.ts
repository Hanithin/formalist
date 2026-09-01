import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { journal } from "@/lib/journal";

/**
 * Le rendu des modèles du cabinet, sans la passe de mise en page héritée.
 *
 * Les gabarits de Formalist passent par docx.cjs, qui les rend puis les remet en forme :
 * interlignes, veuves et orphelines, tailles de titres, justification. Cette passe est
 * née de gabarits qui ne portaient aucun style ; le modèle du cabinet, lui, apporte sa
 * feuille de styles, sa numérotation, son pied de page paginé et ses retraits de
 * citation. La lui appliquer défairait exactement ce qu'il vient poser.
 *
 * D'où ce chemin séparé : docxtemplater, `paragraphLoop` pour que les boucles portent
 * sur des paragraphes entiers, et les délimiteurs à une seule accolade du modèle. Rien
 * d'autre - la typographie française est appliquée ensuite, comme sur les autres actes.
 *
 * Deux exceptions, l'alignement et la police. Le modèle du cabinet justifie chacun de ses
 * paragraphes et les compose en Garamond 11,5 ; le reste des documents est au fer à gauche
 * et en Cambria 12. Un dossier ne peut pas mêler les deux - le client ouvrait son
 * procès-verbal dans une typographie et son rapport dans une autre. Les deux règles sont
 * celles de docx.cjs, une seule fois écrites, pour les deux chemins.
 *
 * Ce qui reste du modèle est ce pour quoi il a été repris : sa numérotation, son pied de
 * page paginé, ses retraits de citation, sa mise en page.
 */
const requerir = createRequire(import.meta.url);

/** Le dossier des gabarits, partagé avec docx.cjs. */
const GABARITS = path.join(process.cwd(), "..", "templates");

export const MODELE_PV_AGE = "modif-pv-age-universel.docx";
export const MODELE_TRAITE_APPORT = "modif-traite-apport-universel.docx";
export const MODELE_ACTE_CESSION = "modif-acte-cession-universel.docx";

export class ModeleDuCabinetIllisible extends Error {
  readonly statut = 500;
  constructor(
    readonly modele: string,
    cause?: unknown
  ) {
    super("L'acte n'a pas pu être produit");
    this.name = "ModeleDuCabinetIllisible";
    journal.error({ err: cause, modele }, "Rendu d'un modèle du cabinet interrompu");
  }
}

/**
 * Produit un acte à partir des balises d'un modèle du cabinet.
 *
 * Les valeurs absentes s'écrivent vides plutôt que de lever : un acte qui manque une
 * mention se relit, un acte qui n'existe pas ne se relit pas. Les blocs éteints ne
 * laissent aucun paragraphe résiduel - c'est ce que `paragraphLoop` garantit.
 */
export function rendreUnModeleDuCabinet(
  modele: string,
  donnees: Record<string, unknown>
): Buffer {
  try {
    const PizZip = requerir("pizzip") as typeof import("pizzip");
    const Docxtemplater = requerir("docxtemplater") as typeof import("docxtemplater");

    const zip = new PizZip(readFileSync(path.join(GABARITS, modele)));
    const document = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      /* Le modèle du cabinet emploie une seule accolade, là où Formalist en pose deux. */
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });

    document.render(donnees);

    const { uniformiserLaPolice, normaliserLeTexte } = requerir("./docx.cjs") as {
      uniformiserLaPolice: <T>(zip: T) => T;
      normaliserLeTexte: (xml: string) => string;
    };
    const zipRendu = document.getZip();
    const xml = zipRendu.file("word/document.xml");
    /*
     * Une seule forme Unicode avant d'accorder : « né » ne se compare pas à « né ».
     *
     * L'alignement des modèles du cabinet n'est plus touché : ils justifient, comme les
     * actes que Formalist produit. Ce qui faisait renoncer à la justification - une
     * ligne terminée par un retour manuel étalée d'un bord à l'autre - est réglé par
     * `uniformiserLaPolice`, qui pose `doNotExpandShiftReturn` sur le document.
     */
    if (xml) zipRendu.file("word/document.xml", accorder(normaliserLeTexte(xml.asText())));

    return uniformiserLaPolice(zipRendu).generate({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (e) {
    throw new ModeleDuCabinetIllisible(modele, e);
  }
}

/** Le procès-verbal d'assemblée générale extraordinaire. */
export function rendreLePvAge(donnees: Record<string, unknown>): Buffer {
  return rendreUnModeleDuCabinet(MODELE_PV_AGE, donnees);
}

/** Le traité d'apport de titres. */
export function rendreLeTraiteDApport(donnees: Record<string, unknown>): Buffer {
  return rendreUnModeleDuCabinet(MODELE_TRAITE_APPORT, donnees);
}

/** L'acte de cession de titres. */
export function rendreLActeDeCession(donnees: Record<string, unknown>): Buffer {
  return rendreUnModeleDuCabinet(MODELE_ACTE_CESSION, donnees);
}

/**
 * Ce qu'un modèle générique laisse au masculin, et ce que l'élision réclame.
 *
 * Le modèle sert les deux formes sociales et les deux genres : il écrit donc « né(e) »,
 * « présent(e) », « frappé(e) », et « Cession de {titres} » sans savoir si le mot qui
 * suivra commence par une voyelle. Dans un acte signé, ces parenthèses et ce « de
 * actions » se voient.
 *
 * L'accord se fait sur le texte rendu, paragraphe par paragraphe : la civilité qui s'y
 * trouve décide. On ne touche pas au modèle - c'est un livrable, remplaçable par une
 * version corrigée - et l'on n'ajoute pas non plus de balise pour chaque terminaison.
 */
function accorder(xml: string): string {
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraphe) => {
    /*
     * L'élision ne porte que sur le texte, jamais sur le balisage.
     *
     * « Cession de actions » se corrige dans les nœuds de texte : appliquée au XML
     * entier, la règle mordrait sur les attributs des balises.
     */
    const rendu = paragraphe.replace(
      /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
      (_tout, ouverture: string, contenu: string, fermeture: string) =>
        ouverture + contenu.replace(/\bde ([aeiouyéèêàAEIOUY])/g, "d'$1") + fermeture
    );

    if (!/\(e\)/.test(rendu)) return rendu;

    /*
     * Le genre se lit dans le paragraphe : « Madame » l'accorde au féminin, « Monsieur »
     * au masculin. Sans civilité - une société, une phrase générale - on reste au
     * masculin, qui est la forme du texte de loi.
     */
    const texte = [...rendu.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
    const feminin = /\bMadame\b/.test(texte) && !/\bMonsieur\b/.test(texte);

    return rendu.replace(/\(e\)/g, feminin ? "e" : "");
  });
}

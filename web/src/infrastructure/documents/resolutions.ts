import { createRequire } from "node:module";

/**
 * Le numérotage des résolutions d'un procès-verbal.
 *
 * Les gabarits écrivent « RÉSOLUTION UNIQUE » en tête de chaque section, ce qui est
 * juste tant qu'une assemblée ne décide qu'une chose. Dès qu'elle en décide deux, le
 * document annonce deux fois une résolution unique - un acte qui se contredit à deux
 * paragraphes d'intervalle, et que le greffe lit.
 *
 * Corriger les gabarits demanderait d'y introduire une variable par section et de
 * calculer le rang côté données, alors que le rang ne se connaît qu'une fois les
 * sections rendues : une résolution non retenue ne compte pas. On renumérote donc
 * après coup, dans l'ordre où les titres apparaissent.
 *
 * Chaque titre tient dans un seul <w:t> du document produit, vérifié sur les quatre
 * gabarits : la substitution ne peut pas mordre sur le texte voisin.
 */
const requerir = createRequire(import.meta.url);

const ORDINAUX = [
  "PREMIÈRE",
  "DEUXIÈME",
  "TROISIÈME",
  "QUATRIÈME",
  "CINQUIÈME",
  "SIXIÈME",
  "SEPTIÈME",
  "HUITIÈME",
];

/**
 * « RÉSOLUTION » ou « DÉCISION », suivi du tiret de titre.
 *
 * L'associé unique ne délibère pas : ses points s'intitulent « DÉCISION ». Ils se
 * numérotent pourtant comme les autres, et ne l'étaient pas - le registre des décisions
 * de l'associé unique en recevait trois portant le même intitulé.
 */
const TITRE = /(RÉSOLUTION|DÉCISION)(?: UNIQUE)?(?=\s*[-—–])/g;

export function renumeroterLesResolutions(docx: Buffer): Buffer {
  const PizZip = requerir("pizzip") as typeof import("pizzip");
  const archive = new PizZip(docx);
  const fichier = archive.file("word/document.xml");
  if (!fichier) return docx;

  const xml = fichier.asText();
  const titres = xml.match(TITRE);

  /*
   * Une seule : « RÉSOLUTION UNIQUE » est alors la formulation juste. Le cas ne se
   * présente plus dans les procès-verbaux, où les pouvoirs au porteur en font toujours
   * une seconde, mais un gabarit qui n'aurait qu'un point ne doit pas se voir numéroté.
   */
  if (!titres || titres.length < 2) return docx;

  let rang = 0;
  const renumerote = xml.replace(TITRE, (_entier, mot: string) => {
    const ordinal = ORDINAUX[rang] ?? String(rang + 1) + "e";
    rang += 1;
    return ordinal + " " + mot;
  });

  archive.file("word/document.xml", renumerote);
  return archive.generate({ type: "nodebuffer" });
}

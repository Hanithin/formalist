/*
 * Deux numérotations du modèle rendues variables.
 *
 * Le préambule (G) énumère ce que le traité règle : a) la souscription en numéraire,
 * b) l'apport, c) son acceptation. La première ligne vit dans un bloc conditionnel -
 * il n'y a pas toujours d'augmentation en numéraire - mais les deux suivantes portent
 * leur lettre en dur. Sans numéraire, la liste du document rendu commence donc à
 * « b) », et le lecteur cherche un a) qui n'existe pas.
 *
 * La passe remplace ces deux lettres par des balises, que la couche d'adaptation
 * calcule selon que le bloc du numéraire est actif ou non. C'est une substitution de
 * texte à l'intérieur de nœuds <w:t> : ni la structure du document, ni ses styles, ni
 * sa numérotation ne sont touchés.
 *
 * Deuxième correction, de la même nature : les deux derniers sous-articles du régime
 * fiscal - droits d'enregistrement et TVA - portent les numéros 6 et 7 en dur. Ils
 * suivent les sous-articles du report d'imposition, qui n'existent pas sous le régime
 * du sursis : le document passait alors de 15.2 à 15.6, sans 15.3 ni 15.4 ni 15.5.
 *
 * Idempotente : relancée sur un document déjà corrigé, elle ne trouve plus rien à
 * remplacer et le laisse tel quel.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const FICHIER = path.join(__dirname, "..", "templates", "modif-traite-apport-universel.docx");

/* Le texte exact de chaque ligne, qui sert d'ancre : la lettre seule serait ambiguë. */
const LIGNES = [
  {
    lettre: "b)",
    balise: "{g_apport}",
    ancre: "l&apos;Apporteur consent à apporter les Titres Apportés",
  },
  {
    lettre: "c)",
    balise: "{g_acceptation}",
    ancre: "la Société Bénéficiaire accepte ledit apport",
  },
];

/* Les sous-articles du régime fiscal dont le numéro dépend du régime retenu. */
const SOUS_ARTICLES = [
  { fixe: "{a_fiscal}.6.", balise: "{a_fiscal}.{sf_enregistrement}." },
  { fixe: "{a_fiscal}.7.", balise: "{a_fiscal}.{sf_tva}." },
];

function corriger(xml) {
  let corrige = xml;
  let remplacements = 0;

  for (const sousArticle of SOUS_ARTICLES) {
    if (!corrige.includes(sousArticle.fixe)) continue;
    corrige = corrige.split(sousArticle.fixe).join(sousArticle.balise);
    remplacements += 1;
  }

  for (const ligne of LIGNES) {
    const position = corrige.indexOf(ligne.ancre);
    if (position === -1) continue;

    /*
     * La lettre est dans le nœud de texte qui précède immédiatement l'ancre.
     * On ne remonte que sur ce qui sépare les deux, jamais sur tout le document :
     * « b) » apparaît des dizaines de fois ailleurs.
     */
    const avant = corrige.slice(0, position);
    const debut = avant.lastIndexOf("<w:p>");
    if (debut === -1) continue;

    const paragraphe = corrige.slice(debut, position);
    const remplace = paragraphe.replace(
      new RegExp(">" + ligne.lettre.replace(")", "\\)") + "(\\s*)<", "g"),
      ">" + ligne.balise + "$1<"
    );
    if (remplace === paragraphe) continue;

    corrige = corrige.slice(0, debut) + remplace + corrige.slice(position);
    remplacements += 1;
  }

  return { corrige, remplacements };
}

const zip = new PizZip(readFileSync(FICHIER));
const xml = zip.file("word/document.xml").asText();
const { corrige, remplacements } = corriger(xml);

if (remplacements === 0) {
  console.log("Rien à corriger : les numéros variables sont déjà des balises.");
  process.exit(0);
}

zip.file("word/document.xml", corrige);
writeFileSync(FICHIER, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log(remplacements + " numéro(s) fixe(s) remplacé(s) par une balise.");

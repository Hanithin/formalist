/*
 * La nomination d'un dirigeant n'est pas toujours au programme.
 *
 * La résolution « Changement de dirigeant » du modèle du cabinet rend la fin du mandat
 * dans un bloc conditionnel - on ne révoque pas toujours - mais la nomination qui suit
 * n'en avait aucun. Une révocation seule produisait donc, sous le quitus, quatre
 * paragraphes nommant un président sans nom :
 *
 *   « L'Assemblée décide de nommer en qualité de président de la Société, à compter du
 *     7 août 2026 et pour une durée indéterminée :
 *     , né le - à , de nationalité , demeurant .
 *     , présent à la réunion, déclare accepter les fonctions… »
 *
 * Un acte qui nomme personne, déposé au greffe.
 *
 * Second défaut, dans la même résolution : « L'Assemblée {modalite_fin_mandat} de
 * {identification} ». La préposition est écrite en dur. Elle convient à « prend acte de
 * la démission de Untel » et double celle de « décide de révoquer », qui sortait
 * « décide de révoquer de Untel ». Elle appartient donc à la valeur, qui seule sait
 * laquelle des deux formules elle porte.
 *
 * Idempotent : relancé, il ne trouve plus rien à remplacer.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const FICHIER = path.join(__dirname, "..", "templates", "modif-pv-age-universel.docx");

/* Le premier et le dernier paragraphe de la nomination : le bloc s'ouvre et se ferme. */
const DEBUT = "L&apos;Assemblée décide de nommer en qualité de {fonction} de la Société";
const FIN = "Cette nomination fera l&apos;objet des formalités de publicité";

const PREPOSITION_EN_DUR =
  "L&apos;Assemblée {modalite_fin_mandat} de {identification_dirigeant_sortant}";
const PREPOSITION_DANS_LA_VALEUR =
  "L&apos;Assemblée {modalite_fin_mandat} {identification_dirigeant_sortant}";

const zip = new PizZip(readFileSync(FICHIER));
let xml = zip.file("word/document.xml").asText();
let corrections = 0;

/* 1. La préposition rejoint la valeur. */
if (xml.includes(PREPOSITION_EN_DUR)) {
  xml = xml.split(PREPOSITION_EN_DUR).join(PREPOSITION_DANS_LA_VALEUR);
  corrections += 1;
  console.log("  la préposition de la fin de mandat passe dans la valeur");
}

/*
 * 2. La modalité d'émission, en une seule balise.
 *
 * « par la création de 0 actions nouvelles d'une valeur nominale de 0 euros chacune » :
 * le nombre de titres et leur nominal sont facultatifs au formulaire, et à raison - une
 * augmentation peut se faire en élevant la valeur nominale des titres existants, sans
 * en créer un seul. Le modèle, lui, affirmait toujours une création, et l'écrivait à
 * zéro. La clause étant au milieu d'une phrase, elle ne pouvait pas devenir un bloc :
 * elle devient une valeur, que la couche d'adaptation compose selon le cas.
 */
const EMISSION_EN_DUR =
  "par la création de {nb_titres_nouveaux} {titres} nouvelles d&apos;une valeur nominale de " +
  "{valeur_nominale} euros chacune, émises {mention_prime}";

if (xml.includes(EMISSION_EN_DUR)) {
  xml = xml.split(EMISSION_EN_DUR).join("{modalite_emission}");
  corrections += 1;
  console.log("  la modalité d'émission devient une valeur composée");
}

/*
 * La libération suit la création, et elle seule.
 *
 * « et entièrement libérées » qualifie des titres qu'on émet. Élever la valeur
 * nominale de titres déjà libérés n'en libère rien : la phrase restait suspendue,
 * « par élévation de la valeur nominale des actions existantes et entièrement
 * libérées ». Elle rejoint donc la branche qui la justifie.
 */
if (xml.includes("{modalite_emission} et entièrement libérées")) {
  xml = xml
    .split("{modalite_emission} et entièrement libérées")
    .join("{modalite_emission}");
  corrections += 1;
  console.log("  la mention de libération rejoint la création de titres");
}

/* 3. La nomination devient un bloc. */
if (!xml.includes("{#nomination}")) {
  const debut = xml.indexOf(DEBUT);
  const fin = xml.indexOf(FIN);
  if (debut === -1 || fin === -1) {
    console.log("  ancres de la nomination introuvables : rien de fait");
  } else {
    /* On ouvre avant le paragraphe qui porte l'ancre, et on ferme après celui de fin. */
    const ouverture = xml.lastIndexOf("<w:p>", debut);
    const fermeture = xml.indexOf("</w:p>", fin) + "</w:p>".length;

    /* Un paragraphe de contrôle reprend la mise en forme de son voisin, sans texte. */
    const modele = xml.slice(ouverture, xml.indexOf("</w:p>", debut) + "</w:p>".length);
    const marque = (texte) =>
      modele
        .replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, '<w:t xml:space="preserve">' + texte + "</w:t>")
        .replace(/<w:spacing[^>]*\/>/, '<w:spacing w:after="0"/>');

    xml =
      xml.slice(0, ouverture) +
      marque("{#nomination}") +
      xml.slice(ouverture, fermeture) +
      marque("{/nomination}") +
      xml.slice(fermeture);
    corrections += 1;
    console.log("  la nomination devient un bloc conditionnel");
  }
}

if (corrections === 0) {
  console.log("Rien à corriger : la résolution du dirigeant est déjà conditionnelle.");
  process.exit(0);
}

zip.file("word/document.xml", xml);
writeFileSync(FICHIER, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("\n" + corrections + " correction(s) appliquée(s).");

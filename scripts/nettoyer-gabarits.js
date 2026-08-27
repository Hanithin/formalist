/*
 * Deux scories que les gabarits traînaient jusque chez le client.
 *
 * Les quadratins et les demi-cadratins. « ARTICLE 4 – Objet social » dans des statuts
 * déposés au greffe : le trait long vient de la correction automatique de Word, qui
 * transforme un tiret entouré d'espaces sans qu'on l'ait demandé. Quatre modèles de
 * statuts en portaient, dans leurs intertitres.
 *
 * Le surlignage jaune. Il sert à marquer ce qu'on doit encore relire, pendant qu'on
 * écrit le modèle. Il n'a rien à faire dans un document remis : cinq gabarits en
 * gardaient, dont un sur la marque de paragraphe elle-même - Word affiche alors un
 * bloc jaune en fin de ligne, que rien dans le texte n'explique.
 *
 * La passe ne touche qu'aux nœuds de texte pour les tirets : appliquée au XML entier,
 * elle mordrait sur les attributs. Idempotente : relancée, elle ne trouve plus rien.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const { readdirSync } = require("node:fs");
const path = require("node:path");
const PizZip = require("pizzip");

const GABARITS = path.join(__dirname, "..", "templates");

/** Les tirets longs, dans le seul texte visible. */
function tiretsSimples(xml) {
  return xml.replace(
    /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
    (_tout, ouverture, contenu, fermeture) =>
      ouverture + contenu.replace(/[–—]/g, "-") + fermeture
  );
}

/** Le surlignage, où qu'il se trouve : sur un run ou sur la marque de paragraphe. */
function sansSurlignage(xml) {
  return xml.replace(/<w:highlight w:val="[^"]*"\s*\/>/g, "");
}

let fichiersTouches = 0;
let tiretsCorriges = 0;
let surlignagesRetires = 0;

for (const nom of readdirSync(GABARITS).sort()) {
  if (!nom.endsWith(".docx")) continue;

  const chemin = path.join(GABARITS, nom);
  const zip = new PizZip(readFileSync(chemin));
  let modifie = false;
  const details = [];

  for (const membre of Object.keys(zip.files)) {
    if (!membre.endsWith(".xml")) continue;

    const avant = zip.file(membre).asText();
    const apresTirets = tiretsSimples(avant);
    const apres = sansSurlignage(apresTirets);
    if (apres === avant) continue;

    const tirets = (avant.match(/[–—]/g) ?? []).length;
    const surlignes = (avant.match(/<w:highlight/g) ?? []).length;
    tiretsCorriges += tirets;
    surlignagesRetires += surlignes;
    if (tirets) details.push(tirets + " tiret(s) long(s)");
    if (surlignes) details.push(surlignes + " surlignage(s)");

    zip.file(membre, apres);
    modifie = true;
  }

  if (!modifie) continue;
  writeFileSync(chemin, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  fichiersTouches += 1;
  console.log("  " + nom.padEnd(42) + details.join(", "));
}

if (fichiersTouches === 0) {
  console.log("Rien à nettoyer : aucun tiret long, aucun surlignage.");
} else {
  console.log(
    "\n" +
      fichiersTouches +
      " gabarit(s) nettoyé(s) : " +
      tiretsCorriges +
      " tiret(s) long(s), " +
      surlignagesRetires +
      " surlignage(s)."
  );
}

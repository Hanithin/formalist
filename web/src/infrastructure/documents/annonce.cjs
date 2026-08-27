/**
 * annonce.cjs - texte d'annonce légale (JAL).
 *
 * Repris de routes/formalites.js sans réécriture. La fonction accumule des
 * variantes de noms de champs - NOM_SOCIETE, denomination, OBJET_SOCIAL_1,
 * objet_social… - héritées de versions successives du formulaire, et une
 * résolution du tribunal de commerce depuis le code postal. Rien de tout cela
 * ne se retrouverait en repartant de zéro.
 *
 * Seul changement : le chemin de rcs.js, déplacé avec elle.
 */

const { resolveRcsCity } = require("./rcs.cjs");

function generateAnnonceText(formalite) {
  let data = {};
  try { data = JSON.parse(formalite.data_json || "{}"); } catch (e) {}

  // Helper qui essaie plusieurs clés et renvoie la première non-vide
  function pick(...keys) {
    for (const k of keys) {
      const v = data[k];
      if (v !== undefined && v !== null && v !== false && v !== "") return v;
    }
    return null;
  }
  // Helper pour extraire une partie d'une adresse complète (au cas où on n'a que ADRESSE_SIEGE)
  function extractCpVille(addr) {
    if (!addr) return { cp: null, ville: null };
    const m = String(addr).match(/(\d{5})\s+([^,\n]+)/);
    if (m) return { cp: m[1].trim(), ville: m[2].trim() };
    return { cp: null, ville: null };
  }

  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const forme = (formalite.forme || pick("FORME_JURIDIQUE", "forme_juridique") || "SAS").toUpperCase();
  const societe = formalite.societe || pick("NOM_SOCIETE", "denomination") || "[DÉNOMINATION]";
  const capital = formalite.capital || pick("CAPITAL_CHIFFRES", "CAPITAL", "capital", "nouveau_capital") || 0;
  const capitalStr = typeof capital === "number" ? capital.toLocaleString("fr-FR") : String(capital);

  // Adresse : on essaie d'abord les champs split, sinon on parse l'adresse complète
  const adresseComplete = pick("ADRESSE_SIEGE", "SIEGE_SOCIAL", "adresse_siege", "adresse");
  let adresse = adresseComplete || "[ADRESSE]";
  let cp = pick("code_postal", "CODE_POSTAL") || "";
  let ville = pick("VILLE_SOCIETE", "ville") || "";
  if ((!cp || !ville) && adresseComplete) {
    const parsed = extractCpVille(adresseComplete);
    if (!cp) cp = parsed.cp || "";
    if (!ville) ville = parsed.ville || "";
    // Si on a une adresse complète qui contient déjà CP+ville, on n'affiche plus séparément
    if (parsed.cp && parsed.ville) {
      // Garde l'adresse complète telle quelle pour le bloc Siège
    }
  }
  if (!cp) cp = "[CP]";
  if (!ville) ville = "[VILLE]";

  const objet = pick("OBJET_SOCIAL_1", "OBJET_SOCIAL", "objet_social", "objet", "activite") || "[OBJET SOCIAL]";
  const duree = pick("DUREE", "duree") || 99;
  const dirigeantComplet = pick("PRESIDENT_NOM", "GERANT_CIVILITE_NOM_PRENOM", "dirigeant_nom_complet");
  const dirigeantPrenom = pick("dirigeant_prenom") || "";
  const dirigeantNom = pick("dirigeant_nom") || "";
  const dirigeantAdresse = pick("GERANT_ADRESSE", "ADRESSE_DIRIGEANT", "dirigeant_adresse") || "[ADRESSE DU DIRIGEANT]";
  // Le titre du dirigeant vient du domaine, qui déclare la nature de chaque forme.
  //
  // Cette liste ne connaissait que cinq formes : une SELAS, une SCP, une commandite y
  // devenaient « Représentant légal », un titre qui n'existe chez personne, publié tel
  // quel au journal d'annonces légales. Ce fichier ne peut pas importer le domaine -
  // il est en CommonJS, repris du serveur d'origine - donc le titre lui est passé.
  // La déduction ci-dessous ne sert plus que si l'appelant ne l'a pas fourni.
  // Le titre du dirigeant est fourni par l'appelant, qui le tient de la table des
  // formes. Il était déduit ici d'une liste de cinq sigles : une SELAS, une SCP, une
  // commandite y devenaient « Représentant légal », un titre qui n'existe chez
  // personne, et qui partait tel quel au journal d'annonces légales.
  const titreDirigeant = formalite.titreDirigeant;

  // Construction du nom du dirigeant : on prend le "complet" en priorité, sinon prenom+nom
  const dirigeantStr = dirigeantComplet || (dirigeantPrenom + " " + dirigeantNom).trim() || "[NOM DU DIRIGEANT]";

  // Normalize type detection (créa avec accent OU sans, en minuscules)
  const typeLower = (formalite.type || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
  const isCreation = typeLower.includes("creation");
  const isModif = typeLower.includes("modif");

  // Construit l'adresse pour le bloc Siège social en évitant les doublons CP/ville
  const siegeStr = adresseComplete
    ? adresseComplete
    : `${adresse}, ${cp} ${ville}`;
  // RCS résolu depuis le code postal (Tribunal de Commerce du département) -
  // évite d'imprimer une commune sans tribunal (ex: Sainte-Foy-lès-Lyon → Lyon).
  const rcsExplicit = pick("RCS_VILLE", "rcs_ville");
  const resolved = resolveRcsCity(cp, rcsExplicit || ville);
  const rcsVille = resolved || rcsExplicit || ville;

  if (isCreation) {
    return [
      `Aux termes d'un acte sous seing privé en date du ${today}, il a été constitué une société présentant les caractéristiques suivantes :`,
      ``,
      `Dénomination sociale : ${societe}`,
      `Forme : ${forme}`,
      `Capital social : ${capitalStr} euros`,
      `Siège social : ${siegeStr}`,
      `Objet : ${objet}`,
      `Durée : ${duree} années à compter de son immatriculation au RCS`,
      `${titreDirigeant} : ${dirigeantStr}, demeurant ${dirigeantAdresse}`,
      ``,
      `La société sera immatriculée au Registre du Commerce et des Sociétés de ${rcsVille}.`
    ].join("\n");
  }

  // Détecte le type de modif. "fermeture" / "dissolution" / "liquidation" est
  // un sous-flux distinct qu'on gère via le même générateur pour éviter de
  // dupliquer la résolution RCS et la mise en forme.
  const typeIsFermeture = typeLower.includes("fermeture") || typeLower.includes("dissolution") || typeLower.includes("liquidation") || typeLower.includes("cessation");

  if (isModif) {
    const subType = formalite.sub_type || data.sub_type || "";
    if (subType.includes("transfert") || data.nouvelle_adresse) {
      // RCS du nouveau siège résolu depuis le nouveau code postal
      const nouveauRcs = resolveRcsCity(data.nouveau_cp, data.nouvelle_ville) || data.nouvelle_ville || rcsVille;
      return [
        `Aux termes d'une décision en date du ${data.date_effet || today}, l'associé unique / les associés de la société ${societe}, ${forme} au capital de ${capitalStr} euros, a (ont) décidé de transférer le siège social :`,
        ``,
        `De : ${siegeStr}`,
        `À : ${data.nouvelle_adresse || "[NOUVELLE ADRESSE]"}, ${data.nouveau_cp || "[CP]"} ${data.nouvelle_ville || "[VILLE]"}`,
        ``,
        `Les statuts ont été modifiés en conséquence.`,
        `Mention en sera faite au RCS de ${nouveauRcs}.`
      ].join("\n");
    }
    if (subType.includes("denom") || data.nouveau_nom) {
      return [
        `Aux termes d'une décision en date du ${data.date_effet || today}, la société ${societe}, ${forme} au capital de ${capitalStr} euros, ayant son siège ${siegeStr}, a modifié sa dénomination sociale.`,
        ``,
        `Ancienne dénomination : ${societe}`,
        `Nouvelle dénomination : ${data.nouveau_nom || "[NOUVEAU NOM]"}`,
        ``,
        `Les statuts ont été modifiés en conséquence. Mention en sera faite au RCS de ${rcsVille}.`
      ].join("\n");
    }
    if (subType.includes("capital") || data.nouveau_capital) {
      const ancien = data.ancien_capital || capital;
      const nouveau = data.nouveau_capital || capital;
      return [
        `Aux termes d'une décision en date du ${data.date_effet || today}, la société ${societe}, ${forme} ayant son siège ${siegeStr}, a modifié son capital social.`,
        ``,
        `Ancien capital : ${Number(ancien).toLocaleString("fr-FR")} euros`,
        `Nouveau capital : ${Number(nouveau).toLocaleString("fr-FR")} euros`,
        ``,
        `Les statuts ont été modifiés en conséquence. Mention en sera faite au RCS de ${rcsVille}.`
      ].join("\n");
    }
  }

  // ── Fermeture / Dissolution / Liquidation ──
  if (typeIsFermeture) {
    const subTypeF = (formalite.sub_type || data.sub_type || "").toLowerCase();
    const liquidateurNom = data.liquidateur_nom || data.liquidateur || dirigeantStr;
    const liquidateurAdresse = data.liquidateur_adresse || dirigeantAdresse;
    const adresseLiq = data.adresse_liquidation || siegeStr;
    const dateEffet = data.date_effet || data.date_dissolution || today;
    // Liquidation (clôture)
    if (subTypeF.includes("liqui") && !subTypeF.includes("dissol")) {
      return [
        `Aux termes d'une décision en date du ${dateEffet}, l'associé unique / les associés de la société ${societe}, ${forme} au capital de ${capitalStr} euros, ayant son siège ${siegeStr}, a (ont) approuvé les comptes définitifs de liquidation, donné quitus au liquidateur ${liquidateurNom} et constaté la clôture de la liquidation.`,
        ``,
        `La société sera radiée du Registre du Commerce et des Sociétés de ${rcsVille}.`
      ].join("\n");
    }
    // Dissolution anticipée (ouverture de liquidation amiable)
    return [
      `Aux termes d'une décision en date du ${dateEffet}, l'associé unique / les associés de la société ${societe}, ${forme} au capital de ${capitalStr} euros, ayant son siège ${siegeStr}, a (ont) décidé la dissolution anticipée de la société, à compter du ${dateEffet}, et sa mise en liquidation amiable.`,
      ``,
      `Liquidateur : ${liquidateurNom}, demeurant ${liquidateurAdresse}.`,
      `Le siège de la liquidation est fixé à ${adresseLiq}, adresse où la correspondance devra être adressée et les actes notifiés.`,
      ``,
      `Le dépôt des actes et pièces relatifs à la liquidation sera effectué au greffe du Tribunal de Commerce de ${rcsVille}.`,
      `Mention en sera faite au RCS de ${rcsVille}.`
    ].join("\n");
  }

  // Fallback générique
  return [
    `Aux termes d'un acte en date du ${today}, modification a été apportée à la société :`,
    ``,
    `Dénomination : ${societe}`,
    `Forme : ${forme}`,
    `Capital social : ${capitalStr} euros`,
    `Siège social : ${siegeStr}`,
    ``,
    `Mention en sera faite au RCS de ${rcsVille}.`
  ].join("\n");
}


module.exports = { generateAnnonceText };

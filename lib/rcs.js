/**
 * lib/rcs.js — Résolution du Registre du Commerce et des Sociétés
 *
 * En France, un RCS = un Tribunal de Commerce. Chaque département a un (parfois
 * plusieurs) TC compétent ; la ville indiquée dans l'annonce légale doit être
 * celle du TC dont dépend le siège social — pas nécessairement la commune
 * du siège (ex: Sainte-Foy-lès-Lyon n'a pas de RCS, c'est Lyon qui couvre).
 *
 * On résout via le code postal :
 *   - postal 2 premiers chars → département (avec gestion Corse 2A/2B / 20***)
 *   - département → TC principal du département
 *
 * Pour les départements avec plusieurs TC (75 multiples Paris, 13 multiples,
 * 59 multiples, etc.), on choisit le plus représentatif (Paris pour 75,
 * Marseille pour 13, Lille pour 59…). Cas particuliers : exceptions par
 * tranche de code postal (95 Pontoise, 92 Nanterre, 93 Bobigny, 94 Créteil…).
 */

// Mapping département → ville du Tribunal de Commerce principal (RCS)
// Sources : Conseil National des Greffes des Tribunaux de Commerce
const DEPT_TO_RCS = {
  "01": "Bourg-en-Bresse",
  "02": "Saint-Quentin",
  "03": "Cusset",
  "04": "Manosque",
  "05": "Gap",
  "06": "Antibes",
  "07": "Aubenas",
  "08": "Sedan",
  "09": "Foix",
  "10": "Troyes",
  "11": "Narbonne",
  "12": "Rodez",
  "13": "Marseille",
  "14": "Caen",
  "15": "Aurillac",
  "16": "Angoulême",
  "17": "La Rochelle",
  "18": "Bourges",
  "19": "Brive-la-Gaillarde",
  "21": "Dijon",
  "22": "Saint-Brieuc",
  "23": "Guéret",
  "24": "Périgueux",
  "25": "Besançon",
  "26": "Romans-sur-Isère",
  "27": "Évreux",
  "28": "Chartres",
  "29": "Quimper",
  "2A": "Ajaccio",
  "2B": "Bastia",
  "30": "Nîmes",
  "31": "Toulouse",
  "32": "Auch",
  "33": "Bordeaux",
  "34": "Montpellier",
  "35": "Rennes",
  "36": "Châteauroux",
  "37": "Tours",
  "38": "Grenoble",
  "39": "Lons-le-Saunier",
  "40": "Mont-de-Marsan",
  "41": "Blois",
  "42": "Saint-Étienne",
  "43": "Le Puy-en-Velay",
  "44": "Nantes",
  "45": "Orléans",
  "46": "Cahors",
  "47": "Agen",
  "48": "Mende",
  "49": "Angers",
  "50": "Coutances",
  "51": "Reims",
  "52": "Chaumont",
  "53": "Laval",
  "54": "Nancy",
  "55": "Bar-le-Duc",
  "56": "Vannes",
  "57": "Metz",
  "58": "Nevers",
  "59": "Lille",
  "60": "Beauvais",
  "61": "Alençon",
  "62": "Arras",
  "63": "Clermont-Ferrand",
  "64": "Pau",
  "65": "Tarbes",
  "66": "Perpignan",
  "67": "Strasbourg",
  "68": "Mulhouse",
  "69": "Lyon",
  "70": "Vesoul",
  "71": "Mâcon",
  "72": "Le Mans",
  "73": "Chambéry",
  "74": "Annecy",
  "75": "Paris",
  "76": "Rouen",
  "77": "Meaux",
  "78": "Versailles",
  "79": "Niort",
  "80": "Amiens",
  "81": "Castres",
  "82": "Montauban",
  "83": "Toulon",
  "84": "Avignon",
  "85": "La Roche-sur-Yon",
  "86": "Poitiers",
  "87": "Limoges",
  "88": "Épinal",
  "89": "Auxerre",
  "90": "Belfort",
  "91": "Évry",
  "92": "Nanterre",
  "93": "Bobigny",
  "94": "Créteil",
  "95": "Pontoise",
  // DOM-TOM
  "971": "Pointe-à-Pitre",
  "972": "Fort-de-France",
  "973": "Cayenne",
  "974": "Saint-Denis",
  "975": "Saint-Pierre",
  "976": "Mamoudzou",
  "977": "Saint-Barthélemy",
  "978": "Saint-Martin",
  "986": "Wallis",
  "987": "Papeete",
  "988": "Nouméa",
};

// Exceptions code postal → ville RCS (cas où la prefecture seule ne suffit pas)
// Ces overrides priment sur DEPT_TO_RCS quand le CP exact correspond.
const POSTAL_OVERRIDES = {};

/**
 * Extrait le département d'un code postal français.
 * Gère :
 *  - 2A/2B (Corse) — code postal 20000-20190 = 2A, 20200-20620 = 2B
 *  - DOM (971-988) — codes postaux à 5 chiffres commencent par 97/98
 * @param {string} cp Code postal (5 chiffres)
 * @returns {string|null} Code département ("01"..."95", "2A", "2B", "971"...)
 */
function postalToDept(cp) {
  if (!cp) return null;
  const clean = String(cp).replace(/\s+/g, "").trim();
  if (!/^\d{4,5}$/.test(clean)) return null;
  const padded = clean.padStart(5, "0");
  // Corse : 20000-20190 → 2A, 20200-20620 → 2B
  if (padded.startsWith("20")) {
    const num = parseInt(padded, 10);
    if (num >= 20000 && num <= 20190) return "2A";
    if (num >= 20200 && num <= 20620) return "2B";
    return "2A";
  }
  // DOM : 971xx, 972xx... → "971"
  if (padded.startsWith("97") || padded.startsWith("98")) {
    return padded.slice(0, 3);
  }
  // Métropole : 2 premiers chiffres
  return padded.slice(0, 2);
}

/**
 * Résout la ville du RCS depuis un code postal (et un fallback ville).
 * @param {string} postalCode Code postal du siège
 * @param {string} [fallback] Ville de fallback si le code postal n'est pas trouvé
 * @returns {string|null} Ville du RCS (ex: "Lyon" pour 69110) ou fallback
 */
function resolveRcsCity(postalCode, fallback) {
  if (!postalCode) return fallback || null;
  const cp = String(postalCode).replace(/\s+/g, "").trim().padStart(5, "0");
  // 1) Override exact par code postal
  if (POSTAL_OVERRIDES[cp]) return POSTAL_OVERRIDES[cp];
  // 2) Mapping département → RCS
  const dept = postalToDept(cp);
  if (dept && DEPT_TO_RCS[dept]) return DEPT_TO_RCS[dept];
  return fallback || null;
}

/**
 * Valide qu'une ville donnée correspond bien au RCS attendu pour un CP.
 * Utile pour avertir l'utilisateur s'il a saisi "Sainte-Foy-lès-Lyon" alors
 * que le bon RCS est "Lyon".
 * @returns {{ok: boolean, expected: string|null, message?: string}}
 */
function validateRcsCity(postalCode, providedCity) {
  const expected = resolveRcsCity(postalCode);
  if (!expected) return { ok: true, expected: null };
  const normalize = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-\s']/g, "");
  if (normalize(providedCity) === normalize(expected)) return { ok: true, expected };
  return {
    ok: false,
    expected,
    message: `Le RCS doit être « ${expected} » (la commune « ${providedCity} » dépend du Tribunal de Commerce de ${expected}).`,
  };
}

module.exports = { resolveRcsCity, validateRcsCity, postalToDept, DEPT_TO_RCS };

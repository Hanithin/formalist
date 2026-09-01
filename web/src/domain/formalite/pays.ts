/**
 * Les pays, tels qu'un acte les nomme.
 *
 * Le pays de naissance et la nationalité se saisissaient au clavier, et partaient tels
 * quels dans les statuts et les procès-verbaux : « de nationalité Marocainne » se dépose
 * au greffe aussi bien que la bonne orthographe. Ces deux champs n'ont pas de correcteur,
 * et personne ne relit une pièce pour ça.
 *
 * Trois colonnes plutôt que deux listes : la nationalité est un attribut du pays, non un
 * vocabulaire à part, et les tenir ensemble empêche qu'elles divergent - c'est ce qui
 * arrive dès qu'on ajoute un pays à une liste et qu'on oublie l'autre.
 *
 * Le code est celui de la norme ISO 3166-1 alpha-3, que le guichet unique exige pour le
 * pays de naissance. Il ne s'affiche nulle part : il ne sert qu'au dépôt.
 *
 * La nationalité s'écrit au féminin, toujours : elle s'accorde avec le mot
 * « nationalité » et non avec la personne. « Monsieur Bertin, de nationalité
 * française » est la forme des actes.
 *
 * Les noms sont vérifiés contre le référentiel CLDR, à quelques écarts près retenus pour
 * l'état civil français : « Birmanie », « République tchèque », les deux Congo sous leur
 * nom long. Les États disparus - URSS, Yougoslavie, Tchécoslovaquie - n'y figurent pas :
 * ils n'ont plus de code ISO, et la saisie reste libre pour qui y est né.
 */

export interface Pays {
  /** Le nom français, tel qu'il s'écrit dans l'acte. */
  nom: string;
  /** ISO 3166-1 alpha-3, pour le guichet unique. */
  code: string;
  /** Le gentilé au féminin : « de nationalité … ». */
  nationalite: string;
}

export const PAYS: Pays[] = [
  { nom: "Afghanistan", code: "AFG", nationalite: "Afghane" },
  { nom: "Afrique du Sud", code: "ZAF", nationalite: "Sud-africaine" },
  { nom: "Albanie", code: "ALB", nationalite: "Albanaise" },
  { nom: "Algérie", code: "DZA", nationalite: "Algérienne" },
  { nom: "Allemagne", code: "DEU", nationalite: "Allemande" },
  { nom: "Andorre", code: "AND", nationalite: "Andorrane" },
  { nom: "Angola", code: "AGO", nationalite: "Angolaise" },
  { nom: "Antigua-et-Barbuda", code: "ATG", nationalite: "Antiguaise" },
  { nom: "Arabie saoudite", code: "SAU", nationalite: "Saoudienne" },
  { nom: "Argentine", code: "ARG", nationalite: "Argentine" },
  { nom: "Arménie", code: "ARM", nationalite: "Arménienne" },
  { nom: "Australie", code: "AUS", nationalite: "Australienne" },
  { nom: "Autriche", code: "AUT", nationalite: "Autrichienne" },
  { nom: "Azerbaïdjan", code: "AZE", nationalite: "Azerbaïdjanaise" },
  { nom: "Bahamas", code: "BHS", nationalite: "Bahamienne" },
  { nom: "Bahreïn", code: "BHR", nationalite: "Bahreïnienne" },
  { nom: "Bangladesh", code: "BGD", nationalite: "Bangladaise" },
  { nom: "Barbade", code: "BRB", nationalite: "Barbadienne" },
  { nom: "Belgique", code: "BEL", nationalite: "Belge" },
  { nom: "Belize", code: "BLZ", nationalite: "Bélizienne" },
  { nom: "Bénin", code: "BEN", nationalite: "Béninoise" },
  { nom: "Bhoutan", code: "BTN", nationalite: "Bhoutanaise" },
  { nom: "Biélorussie", code: "BLR", nationalite: "Biélorusse" },
  { nom: "Birmanie", code: "MMR", nationalite: "Birmane" },
  { nom: "Bolivie", code: "BOL", nationalite: "Bolivienne" },
  { nom: "Bosnie-Herzégovine", code: "BIH", nationalite: "Bosnienne" },
  { nom: "Botswana", code: "BWA", nationalite: "Botswanaise" },
  { nom: "Brésil", code: "BRA", nationalite: "Brésilienne" },
  { nom: "Brunei", code: "BRN", nationalite: "Brunéienne" },
  { nom: "Bulgarie", code: "BGR", nationalite: "Bulgare" },
  { nom: "Burkina Faso", code: "BFA", nationalite: "Burkinabée" },
  { nom: "Burundi", code: "BDI", nationalite: "Burundaise" },
  { nom: "Cambodge", code: "KHM", nationalite: "Cambodgienne" },
  { nom: "Cameroun", code: "CMR", nationalite: "Camerounaise" },
  { nom: "Canada", code: "CAN", nationalite: "Canadienne" },
  { nom: "Cap-Vert", code: "CPV", nationalite: "Cap-verdienne" },
  { nom: "Chili", code: "CHL", nationalite: "Chilienne" },
  { nom: "Chine", code: "CHN", nationalite: "Chinoise" },
  { nom: "Chypre", code: "CYP", nationalite: "Chypriote" },
  { nom: "Colombie", code: "COL", nationalite: "Colombienne" },
  { nom: "Comores", code: "COM", nationalite: "Comorienne" },
  { nom: "Corée du Nord", code: "PRK", nationalite: "Nord-coréenne" },
  { nom: "Corée du Sud", code: "KOR", nationalite: "Sud-coréenne" },
  { nom: "Costa Rica", code: "CRI", nationalite: "Costaricienne" },
  { nom: "Côte d'Ivoire", code: "CIV", nationalite: "Ivoirienne" },
  { nom: "Croatie", code: "HRV", nationalite: "Croate" },
  { nom: "Cuba", code: "CUB", nationalite: "Cubaine" },
  { nom: "Danemark", code: "DNK", nationalite: "Danoise" },
  { nom: "Djibouti", code: "DJI", nationalite: "Djiboutienne" },
  { nom: "Dominique", code: "DMA", nationalite: "Dominiquaise" },
  { nom: "Égypte", code: "EGY", nationalite: "Égyptienne" },
  { nom: "Émirats arabes unis", code: "ARE", nationalite: "Émirienne" },
  { nom: "Équateur", code: "ECU", nationalite: "Équatorienne" },
  { nom: "Érythrée", code: "ERI", nationalite: "Érythréenne" },
  { nom: "Espagne", code: "ESP", nationalite: "Espagnole" },
  { nom: "Estonie", code: "EST", nationalite: "Estonienne" },
  { nom: "Eswatini", code: "SWZ", nationalite: "Swazie" },
  { nom: "États-Unis", code: "USA", nationalite: "Américaine" },
  { nom: "Éthiopie", code: "ETH", nationalite: "Éthiopienne" },
  { nom: "Fidji", code: "FJI", nationalite: "Fidjienne" },
  { nom: "Finlande", code: "FIN", nationalite: "Finlandaise" },
  { nom: "France", code: "FRA", nationalite: "Française" },
  { nom: "Gabon", code: "GAB", nationalite: "Gabonaise" },
  { nom: "Gambie", code: "GMB", nationalite: "Gambienne" },
  { nom: "Géorgie", code: "GEO", nationalite: "Géorgienne" },
  { nom: "Ghana", code: "GHA", nationalite: "Ghanéenne" },
  { nom: "Grèce", code: "GRC", nationalite: "Grecque" },
  { nom: "Grenade", code: "GRD", nationalite: "Grenadienne" },
  { nom: "Guatemala", code: "GTM", nationalite: "Guatémaltèque" },
  { nom: "Guinée", code: "GIN", nationalite: "Guinéenne" },
  { nom: "Guinée équatoriale", code: "GNQ", nationalite: "Équatoguinéenne" },
  { nom: "Guinée-Bissau", code: "GNB", nationalite: "Bissau-guinéenne" },
  { nom: "Guyana", code: "GUY", nationalite: "Guyanienne" },
  { nom: "Haïti", code: "HTI", nationalite: "Haïtienne" },
  { nom: "Honduras", code: "HND", nationalite: "Hondurienne" },
  { nom: "Hongrie", code: "HUN", nationalite: "Hongroise" },
  { nom: "Îles Marshall", code: "MHL", nationalite: "Marshallaise" },
  { nom: "Îles Salomon", code: "SLB", nationalite: "Salomonaise" },
  { nom: "Inde", code: "IND", nationalite: "Indienne" },
  { nom: "Indonésie", code: "IDN", nationalite: "Indonésienne" },
  { nom: "Irak", code: "IRQ", nationalite: "Irakienne" },
  { nom: "Iran", code: "IRN", nationalite: "Iranienne" },
  { nom: "Irlande", code: "IRL", nationalite: "Irlandaise" },
  { nom: "Islande", code: "ISL", nationalite: "Islandaise" },
  { nom: "Israël", code: "ISR", nationalite: "Israélienne" },
  { nom: "Italie", code: "ITA", nationalite: "Italienne" },
  { nom: "Jamaïque", code: "JAM", nationalite: "Jamaïcaine" },
  { nom: "Japon", code: "JPN", nationalite: "Japonaise" },
  { nom: "Jordanie", code: "JOR", nationalite: "Jordanienne" },
  { nom: "Kazakhstan", code: "KAZ", nationalite: "Kazakhe" },
  { nom: "Kenya", code: "KEN", nationalite: "Kényane" },
  { nom: "Kirghizistan", code: "KGZ", nationalite: "Kirghize" },
  { nom: "Kiribati", code: "KIR", nationalite: "Kiribatienne" },
  { nom: "Koweït", code: "KWT", nationalite: "Koweïtienne" },
  { nom: "Laos", code: "LAO", nationalite: "Laotienne" },
  { nom: "Lesotho", code: "LSO", nationalite: "Lesothane" },
  { nom: "Lettonie", code: "LVA", nationalite: "Lettone" },
  { nom: "Liban", code: "LBN", nationalite: "Libanaise" },
  { nom: "Liberia", code: "LBR", nationalite: "Libérienne" },
  { nom: "Libye", code: "LBY", nationalite: "Libyenne" },
  { nom: "Liechtenstein", code: "LIE", nationalite: "Liechtensteinoise" },
  { nom: "Lituanie", code: "LTU", nationalite: "Lituanienne" },
  { nom: "Luxembourg", code: "LUX", nationalite: "Luxembourgeoise" },
  { nom: "Macédoine du Nord", code: "MKD", nationalite: "Macédonienne" },
  { nom: "Madagascar", code: "MDG", nationalite: "Malgache" },
  { nom: "Malaisie", code: "MYS", nationalite: "Malaisienne" },
  { nom: "Malawi", code: "MWI", nationalite: "Malawienne" },
  { nom: "Maldives", code: "MDV", nationalite: "Maldivienne" },
  { nom: "Mali", code: "MLI", nationalite: "Malienne" },
  { nom: "Malte", code: "MLT", nationalite: "Maltaise" },
  { nom: "Maroc", code: "MAR", nationalite: "Marocaine" },
  { nom: "Maurice", code: "MUS", nationalite: "Mauricienne" },
  { nom: "Mauritanie", code: "MRT", nationalite: "Mauritanienne" },
  { nom: "Mexique", code: "MEX", nationalite: "Mexicaine" },
  { nom: "Micronésie", code: "FSM", nationalite: "Micronésienne" },
  { nom: "Moldavie", code: "MDA", nationalite: "Moldave" },
  { nom: "Monaco", code: "MCO", nationalite: "Monégasque" },
  { nom: "Mongolie", code: "MNG", nationalite: "Mongole" },
  { nom: "Monténégro", code: "MNE", nationalite: "Monténégrine" },
  { nom: "Mozambique", code: "MOZ", nationalite: "Mozambicaine" },
  { nom: "Namibie", code: "NAM", nationalite: "Namibienne" },
  { nom: "Nauru", code: "NRU", nationalite: "Nauruane" },
  { nom: "Népal", code: "NPL", nationalite: "Népalaise" },
  { nom: "Nicaragua", code: "NIC", nationalite: "Nicaraguayenne" },
  { nom: "Niger", code: "NER", nationalite: "Nigérienne" },
  { nom: "Nigeria", code: "NGA", nationalite: "Nigériane" },
  { nom: "Norvège", code: "NOR", nationalite: "Norvégienne" },
  { nom: "Nouvelle-Zélande", code: "NZL", nationalite: "Néo-zélandaise" },
  { nom: "Oman", code: "OMN", nationalite: "Omanaise" },
  { nom: "Ouganda", code: "UGA", nationalite: "Ougandaise" },
  { nom: "Ouzbékistan", code: "UZB", nationalite: "Ouzbèke" },
  { nom: "Pakistan", code: "PAK", nationalite: "Pakistanaise" },
  { nom: "Palaos", code: "PLW", nationalite: "Palaosienne" },
  { nom: "Palestine", code: "PSE", nationalite: "Palestinienne" },
  { nom: "Panama", code: "PAN", nationalite: "Panaméenne" },
  { nom: "Papouasie-Nouvelle-Guinée", code: "PNG", nationalite: "Papouane-néo-guinéenne" },
  { nom: "Paraguay", code: "PRY", nationalite: "Paraguayenne" },
  { nom: "Pays-Bas", code: "NLD", nationalite: "Néerlandaise" },
  { nom: "Pérou", code: "PER", nationalite: "Péruvienne" },
  { nom: "Philippines", code: "PHL", nationalite: "Philippine" },
  { nom: "Pologne", code: "POL", nationalite: "Polonaise" },
  { nom: "Portugal", code: "PRT", nationalite: "Portugaise" },
  { nom: "Qatar", code: "QAT", nationalite: "Qatarienne" },
  { nom: "République centrafricaine", code: "CAF", nationalite: "Centrafricaine" },
  { nom: "République démocratique du Congo", code: "COD", nationalite: "Congolaise" },
  { nom: "République dominicaine", code: "DOM", nationalite: "Dominicaine" },
  { nom: "République du Congo", code: "COG", nationalite: "Congolaise" },
  { nom: "République tchèque", code: "CZE", nationalite: "Tchèque" },
  { nom: "Roumanie", code: "ROU", nationalite: "Roumaine" },
  { nom: "Royaume-Uni", code: "GBR", nationalite: "Britannique" },
  { nom: "Russie", code: "RUS", nationalite: "Russe" },
  { nom: "Rwanda", code: "RWA", nationalite: "Rwandaise" },
  { nom: "Saint-Christophe-et-Niévès", code: "KNA", nationalite: "Christophienne" },
  { nom: "Saint-Marin", code: "SMR", nationalite: "Saint-marinaise" },
  { nom: "Saint-Vincent-et-les-Grenadines", code: "VCT", nationalite: "Vincentaise" },
  { nom: "Sainte-Lucie", code: "LCA", nationalite: "Saint-lucienne" },
  { nom: "Salvador", code: "SLV", nationalite: "Salvadorienne" },
  { nom: "Samoa", code: "WSM", nationalite: "Samoane" },
  { nom: "Sao Tomé-et-Principe", code: "STP", nationalite: "Santoméenne" },
  { nom: "Sénégal", code: "SEN", nationalite: "Sénégalaise" },
  { nom: "Serbie", code: "SRB", nationalite: "Serbe" },
  { nom: "Seychelles", code: "SYC", nationalite: "Seychelloise" },
  { nom: "Sierra Leone", code: "SLE", nationalite: "Sierra-léonaise" },
  { nom: "Singapour", code: "SGP", nationalite: "Singapourienne" },
  { nom: "Slovaquie", code: "SVK", nationalite: "Slovaque" },
  { nom: "Slovénie", code: "SVN", nationalite: "Slovène" },
  { nom: "Somalie", code: "SOM", nationalite: "Somalienne" },
  { nom: "Soudan", code: "SDN", nationalite: "Soudanaise" },
  { nom: "Soudan du Sud", code: "SSD", nationalite: "Sud-soudanaise" },
  { nom: "Sri Lanka", code: "LKA", nationalite: "Sri-lankaise" },
  { nom: "Suède", code: "SWE", nationalite: "Suédoise" },
  { nom: "Suisse", code: "CHE", nationalite: "Suisse" },
  { nom: "Suriname", code: "SUR", nationalite: "Surinamaise" },
  { nom: "Syrie", code: "SYR", nationalite: "Syrienne" },
  { nom: "Tadjikistan", code: "TJK", nationalite: "Tadjike" },
  { nom: "Taïwan", code: "TWN", nationalite: "Taïwanaise" },
  { nom: "Tanzanie", code: "TZA", nationalite: "Tanzanienne" },
  { nom: "Tchad", code: "TCD", nationalite: "Tchadienne" },
  { nom: "Thaïlande", code: "THA", nationalite: "Thaïlandaise" },
  { nom: "Timor oriental", code: "TLS", nationalite: "Est-timoraise" },
  { nom: "Togo", code: "TGO", nationalite: "Togolaise" },
  { nom: "Tonga", code: "TON", nationalite: "Tongienne" },
  { nom: "Trinité-et-Tobago", code: "TTO", nationalite: "Trinidadienne" },
  { nom: "Tunisie", code: "TUN", nationalite: "Tunisienne" },
  { nom: "Turkménistan", code: "TKM", nationalite: "Turkmène" },
  { nom: "Turquie", code: "TUR", nationalite: "Turque" },
  { nom: "Tuvalu", code: "TUV", nationalite: "Tuvaluane" },
  { nom: "Ukraine", code: "UKR", nationalite: "Ukrainienne" },
  { nom: "Uruguay", code: "URY", nationalite: "Uruguayenne" },
  { nom: "Vanuatu", code: "VUT", nationalite: "Vanuatuane" },
  { nom: "Vatican", code: "VAT", nationalite: "Vaticane" },
  { nom: "Venezuela", code: "VEN", nationalite: "Vénézuélienne" },
  { nom: "Viêt Nam", code: "VNM", nationalite: "Vietnamienne" },
  { nom: "Yémen", code: "YEM", nationalite: "Yéménite" },
  { nom: "Zambie", code: "ZMB", nationalite: "Zambienne" },
  { nom: "Zimbabwe", code: "ZWE", nationalite: "Zimbabwéenne" },
];

/** Les noms de pays seuls, dans l'ordre où la liste les propose. */
export const NOMS_DE_PAYS = PAYS.map((p) => p.nom);

/** Les nationalités seules, triées comme les pays qui les portent. */
export const NATIONALITES = PAYS.map((p) => p.nationalite);

/**
 * Replie un libellé pour le comparer comme un humain le cherche.
 *
 * On tape « algerie » sans accent, ou « COTE D'IVOIRE » en capitales : la recherche ne
 * doit pas s'y arrêter. Les accents tombent, la casse aussi.
 */
function replier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Le pays portant ce nom, quelle que soit la casse ou les accents. */
export function paysNomme(nom: string | undefined): Pays | undefined {
  if (!nom?.trim()) return undefined;
  const cherche = replier(nom);
  return PAYS.find((p) => replier(p.nom) === cherche);
}

/**
 * Le code ISO du pays de naissance.
 *
 * Rien plutôt qu'un repli sur la France : le dépôt déclarait tout le monde né en France,
 * quel que soit le pays saisi. Un pays qu'on ne reconnaît pas doit se signaler comme
 * manquant, non se faire passer pour un autre.
 */
export function codeDuPays(nom: string | undefined): string | undefined {
  return paysNomme(nom)?.code;
}

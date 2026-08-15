import { regle } from "./formes";

/**
 * Où en est un dossier, du dépôt jusqu'au Kbis.
 *
 * Trois écrans racontaient la même histoire sans se parler : la colonne de phase de
 * l'espace avocat, l'état du dossier côté client, et le fil de la messagerie. Le
 * client, lui, ne voyait rien du tout - les notifications étaient écrites en base et
 * lues nulle part.
 *
 * Ce module est la seule description du parcours. Il ne lit ni base ni écran : on lui
 * donne l'état d'un dossier, il rend la suite des étapes, celle qui est en cours, et
 * à qui est la main. L'avocat, le client et le courriel en sortent d'accord.
 *
 * L'ordre suit celui de la vraie vie, qui est aussi celui du parcours d'origine :
 * la banque délivre l'attestation de dépôt, on signe les statuts à cette date,
 * l'annonce se publie ensuite, le greffe est saisi, le Kbis arrive.
 */

/** Ce qu'on sait d'un dossier pour situer son avancement. */
export interface EtatDuDossier {
  forme: string | null;
  status: string | null;
  /** La sous-phase du cabinet : 5a transmis, 5b révision, 5c vérifié, 5d dépôt, 5e Kbis. */
  sousPhase: string | null;
  aLAttestationDeCapital: boolean;
  aLAnnoncePubliee: boolean;
  aLeKbis: boolean;
}

export type Main = "vous" | "avocat";
export type EtatEtape = "faite" | "en_cours" | "a_venir";

export interface EtapeDeSuivi {
  identifiant: string;
  titre: string;
  /** Ce qui se passe, dit au client. */
  explication: string;
  main: Main;
  etat: EtatEtape;
  /** Le geste attendu, quand il est du côté du client. */
  action?: string;
}

/** Les sous-phases, dans l'ordre : elles se comparent. */
const RANG_SOUS_PHASE: Record<string, number> = { "5a": 1, "5b": 2, "5c": 3, "5d": 4, "5e": 5 };

function auMoins(sousPhase: string | null, seuil: string): boolean {
  return (RANG_SOUS_PHASE[sousPhase ?? ""] ?? 0) >= RANG_SOUS_PHASE[seuil];
}

/**
 * Une société civile ne dépose pas de capital.
 *
 * Lui réclamer une attestation de dépôt bloquerait un dossier sur une pièce que sa
 * banque ne délivrera jamais. C'est la même règle que les pièces attendues.
 */
export function attestationRequise(forme: string | null | undefined): boolean {
  const r = regle(forme);
  return !!r && r.liberationMinimale > 0;
}

interface Definition {
  identifiant: string;
  titre: string;
  explication: string;
  main: Main;
  action?: string;
  faite: (etat: EtatDuDossier) => boolean;
}

const TOUTES: Definition[] = [
  {
    identifiant: "transmis",
    titre: "Dossier transmis à l'avocat",
    explication: "Votre dossier est parti chez l'avocat. Il en accuse réception et le prend en main.",
    main: "avocat",
    faite: (e) => e.status !== "en_cours" && e.status !== null,
  },
  {
    identifiant: "attestation",
    titre: "Attestation de dépôt de capital",
    explication:
      "Votre banque vous remet cette attestation après le versement du capital. Déposez-la : vos actes sont alors datés du jour où vous l'avez obtenue, qui est celui où vous les signez.",
    main: "vous",
    action: "Déposer l'attestation",
    faite: (e) => e.aLAttestationDeCapital,
  },
  {
    identifiant: "verification",
    titre: "Vérification par l'avocat",
    explication:
      "L'avocat relit vos actes et contrôle vos pièces. Il vous écrit si quelque chose doit être repris.",
    main: "avocat",
    faite: (e) => auMoins(e.sousPhase, "5c") || e.status === "valide" || e.status === "terminee",
  },
  {
    identifiant: "annonce",
    titre: "Annonce légale publiée",
    explication:
      "Publiez l'annonce dans un journal habilité de votre département, puis déposez l'attestation de parution qu'il vous envoie. Le greffe la réclame avec le dossier.",
    main: "vous",
    action: "Déposer l'attestation de parution",
    faite: (e) => e.aLAnnoncePubliee,
  },
  {
    identifiant: "greffe",
    titre: "Dépôt au greffe",
    explication: "L'avocat dépose le dossier complet au guichet unique. Comptez quelques jours.",
    main: "avocat",
    faite: (e) => auMoins(e.sousPhase, "5d"),
  },
  {
    identifiant: "kbis",
    titre: "Kbis délivré",
    explication:
      "Votre société est immatriculée. Le Kbis, et le registre des bénéficiaires s'il a été établi, sont dans vos documents.",
    main: "avocat",
    faite: (e) => e.aLeKbis || e.status === "terminee",
  },
];

/**
 * Les étapes du dossier, avec celle qui est en cours.
 *
 * Une seule étape est « en cours » : la première qui n'est pas faite. Les suivantes
 * sont à venir, même si l'une d'elles se trouve remplie par avance - un Kbis déposé
 * avant le dépôt au greffe ne ferait pas sauter la file, il signalerait une erreur de
 * saisie qu'il vaut mieux voir.
 */
export function etapesDuSuivi(etat: EtatDuDossier): EtapeDeSuivi[] {
  const retenues = TOUTES.filter(
    (d) => d.identifiant !== "attestation" || attestationRequise(etat.forme)
  );

  let enCoursTrouvee = false;

  return retenues.map((d) => {
    const faite = d.faite(etat);
    let etatEtape: EtatEtape;

    if (faite && !enCoursTrouvee) {
      etatEtape = "faite";
    } else if (!enCoursTrouvee) {
      enCoursTrouvee = true;
      etatEtape = "en_cours";
    } else {
      etatEtape = "a_venir";
    }

    return {
      identifiant: d.identifiant,
      titre: d.titre,
      explication: d.explication,
      main: d.main,
      etat: etatEtape,
      action: d.action,
    };
  });
}

/** L'étape en cours, ou null quand tout est fait. */
export function etapeEnCours(etat: EtatDuDossier): EtapeDeSuivi | null {
  return etapesDuSuivi(etat).find((e) => e.etat === "en_cours") ?? null;
}

/**
 * Ce qu'on attend du client, ou rien.
 *
 * C'est la phrase qui part en notification et qui s'affiche en tête du dossier. Quand
 * la main est à l'avocat, on ne demande rien : annoncer une action qui n'en est pas
 * une use l'attention pour les fois où elle compte.
 */
export function attenteDuClient(etat: EtatDuDossier): EtapeDeSuivi | null {
  const courante = etapeEnCours(etat);
  return courante && courante.main === "vous" ? courante : null;
}

/** La part du chemin parcouru, pour la barre d'avancement. */
export function avancementDuSuivi(etat: EtatDuDossier): number {
  const etapes = etapesDuSuivi(etat);
  if (etapes.length === 0) return 0;

  const faites = etapes.filter((e) => e.etat === "faite").length;
  return Math.round((faites / etapes.length) * 100);
}

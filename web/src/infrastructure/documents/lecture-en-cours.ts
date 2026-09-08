import {
  empreinteDuDocument,
  lectureGardee,
  garderLaLecture,
  lireLesStatuts,
  StatutsIllisibles,
  type LectureDesStatuts,
} from "./statuts";
import { journal } from "@/lib/journal";
import type { Progression } from "@/domain/modification/lecture";

/**
 * Lire des statuts sans y passer une requête.
 *
 * La reconnaissance de caractères tournait dans la requête qui ouvre l'éditeur. Sur la
 * machine de développement, dix-sept pages prennent douze secondes et personne ne le
 * remarque ; sur un conteneur à un demi-cœur, plusieurs minutes - la requête est coupée
 * en route, l'écran conclut que les statuts manquent et propose de les redéposer, alors
 * qu'ils sont au dossier.
 *
 * La lecture est donc lancée à côté et la requête répond tout de suite : soit la lecture
 * gardée, soit l'avancement du chantier en cours. L'écran attend en sachant quoi.
 *
 * Le registre vit dans le processus, comme les sessions du guichet : il ne survit pas à
 * un redémarrage, et c'est sans conséquence - la lecture reprend au prochain appel, et
 * ce qui a été mené à bien est sur le disque.
 */

interface Chantier {
  debut: number;
  pages: number | null;
  faites: number;
  /* Gardée pour que deux ouvertures simultanées ne lancent pas deux reconnaissances. */
  promesse: Promise<LectureDesStatuts>;
  echec: string | null;
}

const chantiers = new Map<string, Chantier>();

/**
 * Combien de temps la requête accepte d'attendre avant de rendre la main.
 *
 * Des statuts avec couche texte se lisent en une seconde : faire revenir l'écran une
 * seconde fois pour eux ajouterait un aller-retour à tous les dossiers pour le confort
 * des seuls documents numérisés.
 */
const PATIENCE_MS = 2_500;

export type EtatDeLecture =
  | { etat: "prete"; lecture: LectureDesStatuts }
  | { etat: "lecture"; progression: Progression }
  | { etat: "echec"; message: string };

function progressionDe(chantier: Chantier): Progression {
  return {
    phase: chantier.pages === null ? "preparation" : "reconnaissance",
    pages: chantier.pages,
    faites: chantier.faites,
    ecouleMs: Date.now() - chantier.debut,
  };
}

function lancer(empreinte: string, pdf: Buffer): Chantier {
  const chantier: Chantier = {
    debut: Date.now(),
    pages: null,
    faites: 0,
    echec: null,
    promesse: undefined as unknown as Promise<LectureDesStatuts>,
  };

  chantier.promesse = lireLesStatuts(pdf, {
    surPages: (pages) => {
      chantier.pages = pages;
    },
    surPage: (faites) => {
      chantier.faites = faites;
    },
  })
    .then(async (lecture) => {
      await garderLaLecture(empreinte, lecture);
      /*
       * Le chantier se retire une fois la lecture gardée.
       *
       * Le prochain appel la trouvera sur le disque : garder l'entrée en mémoire
       * ferait tenir les mots de tous les documents ouverts dans le processus.
       */
      chantiers.delete(empreinte);
      return lecture;
    })
    .catch((e: unknown) => {
      chantier.echec =
        e instanceof StatutsIllisibles ? e.message : "Les statuts n'ont pas pu être lus";
      journal.error({ err: e, empreinte }, "Lecture des statuts interrompue");
      throw e;
    });

  /* La promesse est reprise plus bas ; celle-ci n'existe que pour ne rien laisser pendre. */
  chantier.promesse.catch(() => {});

  chantiers.set(empreinte, chantier);
  return chantier;
}

/** Une promesse, ou rien si elle n'a pas abouti dans le délai. */
async function dansLeDelai<T>(promesse: Promise<T>, ms: number): Promise<T | null> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const attente = new Promise<null>((resoudre) => {
    minuteur = setTimeout(() => resoudre(null), ms);
  });

  try {
    return await Promise.race([promesse.catch(() => null), attente]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}

export async function demanderLaLecture(pdf: Buffer): Promise<EtatDeLecture> {
  const empreinte = empreinteDuDocument(pdf);

  const gardee = await lectureGardee(empreinte);
  if (gardee) return { etat: "prete", lecture: gardee };

  const encours = chantiers.get(empreinte);

  /*
   * Un échec ne se garde pas.
   *
   * Il vient souvent de la machine - mémoire, minuteur dépassé - et non du document.
   * L'entrée est retirée pour que « Réessayer » relance vraiment la lecture.
   */
  if (encours?.echec) {
    chantiers.delete(empreinte);
    return { etat: "echec", message: encours.echec };
  }

  const chantier = encours ?? lancer(empreinte, pdf);

  const finie = await dansLeDelai(chantier.promesse, PATIENCE_MS);
  if (finie) return { etat: "prete", lecture: finie };
  if (chantier.echec) {
    chantiers.delete(empreinte);
    return { etat: "echec", message: chantier.echec };
  }

  return { etat: "lecture", progression: progressionDe(chantier) };
}

import { describe, it, expect } from "vitest";
import {
  actionsAttendues,
  attendLeClient,
  bloque,
  etapeCourte,
  prochaineEtape,
  etatTableauDeBord,
  salutation,
  type ContexteDossier,
  ATTENTES_MONTREES,
  attentesOrdonnees,
  phraseDAccueil,
} from "@/domain/formalite/actions";

const base: ContexteDossier = {
  dossierId: 7,
  status: "en_cours",
  phase: 1,
  banque: null,
  capital: 10_000,
  informationsCompletes: false,
  documentsRejetes: 0,
  signaturesEnAttente: 0,
  signaturesTotal: 0,
};

describe("actions attendues", () => {
  it("un dossier terminé n'attend plus rien", () => {
    expect(actionsAttendues({ ...base, status: "terminee" })).toEqual([]);
  });

  it("les informations manquantes viennent en premier", () => {
    expect(actionsAttendues(base)[0].titre).toBe("Compléter les informations");
  });

  it("un document refusé passe avant le reste", () => {
    // Il bloque la suite, et le client ne sait pas toujours qu'on l'attend.
    const actions = actionsAttendues({ ...base, documentsRejetes: 2 });
    expect(actions[0].titre).toBe("2 documents à remplacer");
    expect(actions[0].urgent).toBe(true);
  });

  it("le singulier ne prend pas de s", () => {
    expect(actionsAttendues({ ...base, documentsRejetes: 1 })[0].titre).toBe(
      "Un document à remplacer"
    );
    const signature = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 4,
      signaturesEnAttente: 1,
      signaturesTotal: 3,
    });
    expect(signature[0].titre).toBe("Une signature manquante");
  });

  it("les étapes du parcours s'excluent : une seule est la prochaine", () => {
    const actions = actionsAttendues({ ...base, informationsCompletes: true });
    expect(actions).toHaveLength(1);
    expect(actions[0].titre).toBe("Choisir votre banque");
  });

  it("le montant à déposer est nommé, avec la banque", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 2,
      capital: 10_000,
    });
    expect(actions[0].titre).toMatch(/Déposer 10\s000 euros sur votre compte Qonto/);
  });

  it("sans capital chiffré, on reste compréhensible", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 2,
      capital: null,
    });
    expect(actions[0].titre).toContain("votre capital");
  });

  it("une signature manquante s'ajoute à l'étape en cours", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 3,
      signaturesEnAttente: 2,
      signaturesTotal: 3,
    });
    expect(actions).toHaveLength(2);
    expect(actions[1].urgent).toBe(true);
  });

  it("aucune signature attendue quand rien n'a été envoyé à signer", () => {
    const actions = actionsAttendues({
      ...base,
      informationsCompletes: true,
      banque: "Qonto",
      phase: 4,
      signaturesEnAttente: 0,
      signaturesTotal: 0,
    });
    expect(actions).toEqual([]);
  });

  it("un dossier sans action n'attend pas le client", () => {
    expect(attendLeClient({ ...base, status: "terminee" })).toBe(false);
    expect(attendLeClient(base)).toBe(true);
  });
});

describe("état du tableau de bord", () => {
  it("distingue les trois écrans", () => {
    expect(etatTableauDeBord([])).toBe("aucun");
    expect(etatTableauDeBord([{ status: "en_cours" }])).toBe("unique");
    expect(etatTableauDeBord([{ status: "en_cours" }, { status: "en_cours" }])).toBe("plusieurs");
  });

  it("tous terminés est un état à part", () => {
    expect(etatTableauDeBord([{ status: "terminee" }, { status: "terminee" }])).toBe(
      "tous_termines"
    );
  });

  it("un seul dossier terminé compte aussi comme terminé", () => {
    expect(etatTableauDeBord([{ status: "terminee" }])).toBe("tous_termines");
  });
});

describe("salutation", () => {
  it("suit l'heure de la journée", () => {
    expect(salutation(new Date("2026-08-10T10:00:00"))).toBe("Bonjour");
    expect(salutation(new Date("2026-08-10T21:00:00"))).toBe("Bonsoir");
    expect(salutation(new Date("2026-08-10T03:00:00"))).toBe("Bonsoir");
  });
});

describe("où en est le dossier, en une phrase", () => {
  it("quand une action est attendue, c'est elle qu'on annonce", () => {
    expect(prochaineEtape(base)).toBe(
      "Compléter les informations : nom, forme juridique, capital et dirigeant."
    );
  });

  it("sinon, on dit ce que fait la plateforme", () => {
    const enRevision: ContexteDossier = {
      ...base,
      phase: 4,
      informationsCompletes: true,
      banque: "Qonto",
    };
    expect(prochaineEtape(enRevision)).toContain("Un avocat vérifie");

    expect(prochaineEtape({ ...enRevision, phase: 5 })).toContain("déposé au greffe");
  });

  it("un dossier terminé annonce son K-bis, pas une étape", () => {
    // Une vignette muette pousse à ouvrir le dossier pour rien.
    expect(prochaineEtape({ ...base, status: "terminee" })).toContain("K-bis");
  });
});

describe("ce qu'on montre de ce qu'on attend", () => {
  const action = (titre: string, urgent: boolean) => ({
    titre,
    precision: "peu importe",
    bouton: "Agir",
    lien: "/creation?dossier=1",
    urgent,
  });

  it("cinq au plus sur l'accueil", () => {
    expect(ATTENTES_MONTREES).toBe(5);
  });

  it("les bloquantes passent devant", () => {
    /*
     * L'ordre compte dès qu'on n'en montre que cinq : une signature manquante arrête
     * le dossier, alors qu'une banque à choisir l'attend seulement. Sans ce tri, un
     * blocage pouvait se cacher derrière « Voir tout ».
     */
    const ordonnees = attentesOrdonnees([
      { id: 1, societe: "A", actions: [action("banque", false), action("pièce refusée", true)] },
      { id: 2, societe: "B", actions: [action("signature", true)] },
    ]);

    expect(ordonnees.map((a) => a.titre)).toEqual(["pièce refusée", "signature", "banque"]);
  });

  it("chaque action garde le dossier qui l'attend", () => {
    const ordonnees = attentesOrdonnees([
      { id: 7, societe: "ATELIER MERIDIEN", actions: [action("banque", false)] },
    ]);

    expect(ordonnees[0].dossierId).toBe(7);
    expect(ordonnees[0].societe).toBe("ATELIER MERIDIEN");
  });

  it("à urgence égale, l'ordre des dossiers est conservé", () => {
    // Il suit leur date de mise à jour, du plus récent au plus ancien.
    const ordonnees = attentesOrdonnees([
      { id: 1, societe: "récent", actions: [action("a", false)] },
      { id: 2, societe: "ancien", actions: [action("b", false)] },
    ]);

    expect(ordonnees.map((a) => a.societe)).toEqual(["récent", "ancien"]);
  });

  it("aucun dossier, aucune action", () => {
    expect(attentesOrdonnees([])).toEqual([]);
  });
});

describe("la phrase d'accueil", () => {
  const matin = new Date(2026, 7, 13, 9, 0);
  const apresMidi = new Date(2026, 7, 13, 15, 0);
  const soir = new Date(2026, 7, 13, 21, 0);
  const nuit = new Date(2026, 7, 13, 3, 0);

  it("le matin propose d'avancer", () => {
    expect(phraseDAccueil("Hani", 3, matin, 0)).toBe(
      "Bonjour Hani, prêt à avancer sur vos dossiers ?"
    );
  });

  it("l'après-midi demande où l'on en est", () => {
    expect(phraseDAccueil("Hani", 3, apresMidi, 0)).toBe(
      "Bonjour Hani, comment avancent vos projets ?"
    );
    // Avec un seul dossier, la phrase se met au singulier.
    expect(phraseDAccueil("Hani", 1, apresMidi, 0)).toBe(
      "Bonjour Hani, comment avance votre projet ?"
    );
  });

  it("le soir parle de terminer", () => {
    expect(phraseDAccueil("Hani", 3, soir, 0)).toBe(
      "Bonsoir Hani, encore un peu de travail ce soir ?"
    );
    // Le verbe s'accorde au nombre de dossiers.
    expect(phraseDAccueil("Hani", 3, soir, 0.5)).toBe("Bonsoir Hani, vos dossiers vous attendent.");
    expect(phraseDAccueil("Hani", 1, soir, 0.5)).toBe("Bonsoir Hani, votre dossier vous attend.");
  });

  it("un compte sans dossier reçoit un accueil, pas un rappel", () => {
    expect(phraseDAccueil("Hani", 0, matin, 0)).toBe("Bonjour Hani, bienvenue sur Formalist !");
    expect(phraseDAccueil("Hani", 0, soir, 0)).toBe("Bonsoir Hani, bienvenue sur Formalist !");
  });

  it("les bornes de la salutation sont celles de l'original", () => {
    // Bonsoir de dix-huit heures à cinq heures, Bonjour ensuite : à cinq heures et
    // demie on souhaitait le bonsoir.
    expect(salutation(new Date(2026, 7, 13, 5, 30))).toBe("Bonjour");
    expect(salutation(new Date(2026, 7, 13, 4, 59))).toBe("Bonsoir");
    expect(salutation(new Date(2026, 7, 13, 18, 0))).toBe("Bonsoir");
    expect(salutation(new Date(2026, 7, 13, 17, 59))).toBe("Bonjour");
  });

  it("la nuit reste au registre du soir", () => {
    expect(phraseDAccueil("Hani", 2, nuit, 0)).toBe(
      "Bonsoir Hani, encore un peu de travail ce soir ?"
    );
  });

  it("les quatre variantes sont atteignables, et un tirage hors bornes ne casse rien", () => {
    const phrases = new Set(
      [0, 0.25, 0.5, 0.75].map((t) => phraseDAccueil("Hani", 2, matin, t))
    );
    expect(phrases.size).toBe(4);

    expect(phraseDAccueil("Hani", 2, matin, 1)).toBeTruthy();
    expect(phraseDAccueil("Hani", 2, matin, -1)).toBeTruthy();
  });
});

/**
 * La ligne que porte une carte de la liste.
 *
 * Elle a remplacé le pourcentage d'avancement, qui mesurait le remplissage d'un
 * formulaire sans jamais dire ce qui bloquait - au point qu'un dossier annoncé à cent
 * pour cent proposait encore de le reprendre.
 */
describe("l'étape en trois mots", () => {
  it("annonce ce qui bloque avant ce qui avance", () => {
    /*
     * Le cas qui a motivé la règle : les actions sortent dans l'ordre du parcours et
     * la signature est ajoutée en dernier. Prendre la première annonçait « Compléter
     * les informations » sur un dossier dont les statuts attendent une signature.
     */
    const contexte = { ...base, signaturesEnAttente: 1, signaturesTotal: 3 };

    expect(actionsAttendues(contexte)[0].titre).toBe("Compléter les informations");
    expect(etapeCourte(contexte)).toBe("Une signature manquante");
    expect(bloque(contexte)).toBe(true);
  });

  it("reprend le titre de l'action quand rien ne bloque", () => {
    expect(etapeCourte(base)).toBe("Compléter les informations");
    expect(bloque(base)).toBe(false);
  });

  it("dit la société immatriculée quand le dossier est terminé", () => {
    expect(etapeCourte({ ...base, status: "terminee" })).toBe("Société immatriculée");
  });

  it("dit où travaille le dossier quand le client n'a rien à faire", () => {
    // Informations complètes, banque choisie, pièces déposées : la balle est ailleurs.
    const chezLAvocat = {
      ...base,
      phase: 4,
      informationsCompletes: true,
      banque: "Qonto",
    };

    expect(actionsAttendues(chezLAvocat)).toEqual([]);
    expect(etapeCourte(chezLAvocat)).toBe("En révision par l'avocat");
    expect(etapeCourte({ ...chezLAvocat, phase: 5 })).toBe("Déposé au greffe");
  });

  it("ne dit jamais d'un brouillon qu'il est au greffe", () => {
    /*
     * La phase compte deux choses : les étapes du formulaire, et l'avancement du
     * dossier chez nous. Un brouillon entièrement saisi atteint la phase cinq sans
     * avoir été transmis - la lire seule l'annonçait « déposé au greffe » alors qu'il
     * dormait chez son auteur, sous une pastille « Brouillon ».
     */
    const rempliMaisPasParti = {
      ...base,
      phase: 5,
      informationsCompletes: true,
      banque: "Qonto",
      brouillon: true,
    };

    expect(etapeCourte(rempliMaisPasParti)).toBe("À transmettre");
    expect(etapeCourte({ ...rempliMaisPasParti, brouillon: false })).toBe("Déposé au greffe");
  });

  it("reste court : une carte fait trois cent soixante pixels", () => {
    // prochaineEtape rend une phrase entière, faite pour une vignette large.
    const contexte = { ...base, phase: 4, informationsCompletes: true, banque: "Qonto" };

    expect(prochaineEtape(contexte).length).toBeGreaterThan(40);
    expect(etapeCourte(contexte).length).toBeLessThanOrEqual(40);
  });
});

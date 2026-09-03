"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nomEnPhrase, type Tache } from "@/domain/formalite/cabinet";
import { Piece, estUnActeProduit, type PieceAffichee } from "./Piece";
import { deposerUnLivrable } from "./Avancement";
import styles from "../Avocat.module.css";

/** Les quatre gestes qui s'écrivent dans la fenêtre. */
type Geste = "corrections" | "refus" | "dessaisissement" | "invitation";

interface Formulaire {
  titre: string;
  detail: string;
  label: string;
  exemple: string;
  bouton: string;
  /** Le champ est-il obligatoire ? Un motif de dessaisissement ne l'est pas. */
  exige: boolean;
  envoyer: (texte: string) => Promise<Response>;
  succes: string;
}

/*
 * Ce qu'une tâche montre quand on lui demande ses pièces.
 *
 * Une tâche ne parle jamais de tout le dossier : la vérification porte sur ce que le
 * client a déposé, la production et la relecture sur ce que le cabinet a écrit.
 */
function piecesDeLaTache(pieces: PieceAffichee[], tache: string): PieceAffichee[] {
  if (tache === "pieces" || tache === "attestations") {
    return pieces.filter((p) => !estUnActeProduit(p));
  }
  /*
   * Les actes appartiennent à la tâche qui les valide, non à celle qui les produit.
   *
   * Les deux montraient le même jeu : une fois produits, on lisait deux fois la même
   * liste, sous deux titres. « Produire les actes » ne montre donc rien - et le dire
   * explicitement importe : sans cette ligne, elle retombait sur le cas par défaut, qui
   * rend toutes les pièces du dossier.
   */
  if (tache === "actes") return [];
  if (tache === "relecture") {
    return pieces.filter(estUnActeProduit);
  }
  return pieces;
}

/**
 * Ce qu'il reste à faire sur le dossier.
 *
 * L'avocat ouvrait cinq onglets et une colonne de sous-phases, et devait reconstituer
 * lui-même l'état du dossier pour savoir par où commencer. Ici, les tâches sont dans
 * l'ordre, chacune dit pourquoi elle existe, et celle qui attend dit ce qu'elle attend.
 */
export function Travail({
  apresLaTacheDuMoment,
  dossiersAPrendre,
  etapePrecedente,
  termineLe,
  correctionsEnCours,
  livrables,
  dossier,
  taches,
  manquantes,
  peutProduireLesActes,
  routeDeProduction,
  informationsVerifiees,
  pieces,
}: {
  /** Ce qui s'intercale entre la tâche du moment et la liste de ce qui suit. */
  apresLaTacheDuMoment?: React.ReactNode;
  dossier: number;
  taches: Tache[];
  /** Les pièces du dossier : les tâches montrent celles dont elles parlent. */
  pieces: PieceAffichee[];
  /**
   * Les documents que le cabinet remet au client.
   *
   * Ils tenaient leur propre carte au bas de la page : ce sont les pièces de l'étape
   * « Déposer », et ils se rangent avec les tâches qui les réclament. La page passe ce
   * qu'il faut pour les décrire, non les éléments eux-mêmes : un élément fabriqué par
   * la page et rendu ici, dans une liste, fait réclamer une clé à React.
   */
  livrables: {
    documentFinal: string;
    aLeKbis: boolean;
    aLeRbe: boolean;
    /**
     * Le registre des bénéficiaires effectifs concerne-t-il ce dossier ?
     *
     * Il se dépose à la constitution et se met à jour quand la détention change : un
     * dépôt de comptes annuels n'y touche pas, une cessation d'auto-entreprise non
     * plus. La ligne s'y affichait pourtant, et proposait de déposer un registre que
     * personne n'attendait.
     */
    registreConcerne: boolean;
  };
  /**
   * Ce que le dossier réclame et qui n'y est pas, nommé.
   *
   * La carte s'intitulait « 1 pièce manquante » et listait dessous les pièces
   * validées : on lisait un titre rouge au-dessus de deux pastilles vertes, et le nom
   * de celle qui manquait était à un onglet de là. La tâche dit maintenant ce qu'elle
   * réclame.
   */
  manquantes: { identifiant: string; titre: string; motif: string }[];
  /** Les actes se produisent d'ici : c'est une commande, non un écran. */
  peutProduireLesActes: boolean;
  /**
   * Où les produire, selon le parcours.
   *
   * Une modification a la sienne - un seul procès-verbal porte toutes les résolutions ;
   * les autres passent par la route commune. Elle était écrite en dur, si bien que le
   * geste ne pouvait servir qu'aux modifications.
   */
  routeDeProduction: string;
  /**
   * L'avocat a déclaré avoir relu le récapitulatif.
   *
   * On le sait pour pouvoir revenir dessus : une tâche cochée par la sous-phase du
   * dossier ne se décoche pas ici, mais une relecture déclarée, si - le client corrige,
   * et il faut relire.
   */
  informationsVerifiees: boolean;
  /**
   * Ce qui attend un preneur, ailleurs.
   *
   * Un dossier fini laissait l'avocat devant un écran qui n'a plus rien à lui dire : il
   * repartait à la liste pour découvrir s'il restait du travail.
   */
  dossiersAPrendre: number;
  /**
   * L'étape d'avant, pour rouvrir un dossier clos.
   *
   * Nulle quand il n'y a rien à défaire : le dossier n'a pas encore commencé.
   */
  etapePrecedente: string | null;
  /** Quand le dossier s'est achevé, lu au journal. */
  termineLe: string | null;
  /**
   * Une demande de corrections attend le client.
   *
   * Tant qu'elle court, son espace porte un encadré « À vous de jouer » : il faut
   * pouvoir la clore quand il a répondu, sinon il reste devant une demande à laquelle
   * il a déjà satisfait.
   */
  correctionsEnCours: boolean;
}) {
  const [refus, setRefus] = useState<string | null>(null);
  /** La demande de corrections, et ce qu'on y écrit. */
  /*
   * Quatre gestes, une fenêtre.
   *
   * Demander des corrections avait la sienne ; refuser le dossier, s'en retirer et y
   * inviter un autre avocat en auraient fait quatre, à la virgule près. Ce qui change
   * d'un geste à l'autre tient dans une table : le titre, ce qu'on annonce, le champ à
   * remplir et ce qu'on en fait.
   */
  const [fenetre, setFenetreBrute] = useState<Geste | null>(null);
  const [motif, setMotif] = useState("");

  const [retour, setRetour] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  /*
   * Déposer le document du greffe.
   *
   * Le champ de fichier vit dans un label, non derrière une référence : le clic sur le
   * libellé ouvre le sélecteur de lui-même, sans qu'aucun code n'ait à le simuler.
   */
  function deposer(type: "kbis" | "rbe", fichier: File) {
    setRefus(null);

    demarrer(async () => {
      const motifDuRefus = await deposerUnLivrable(dossier, type, fichier);
      if (motifDuRefus) {
        setRefus(motifDuRefus);
        return;
      }
      setRetour("Le document est déposé : le client y a accès.");
      router.refresh();
    });
  }

  /*
   * Produire les actes, quel que soit le parcours.
   *
   * Le geste n'existait que pour une modification : sur une création, les actes
   * naissent à l'encaissement, et le code qui les produit là-bas rattrape son propre
   * échec d'un « les actes se régénèrent d'un clic côté cabinet » - un clic qui
   * n'existait pas. Le dossier restait alors sans actes, la tâche « Produire les
   * actes » renvoyait vers l'onglet des documents, et rien ne les y produisait.
   */
  function produire() {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch(routeDeProduction, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les actes n'ont pas pu être produits");
        return;
      }
      /* Les onglets n'existent plus : les actes sont sur la même page, un peu plus bas. */
      setRetour((corps.documents?.length ?? 0) + " actes produits, ci-dessous.");
      router.refresh();
    });
  }

  /** Rend les actes visibles au client, après relecture. */
  function mettreADisposition() {
    setRefus(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/actes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les actes n'ont pas pu être mis à disposition");
        return;
      }
      setRetour(
        corps.publies === 1
          ? "L'acte est disponible dans l'espace du client, qui en est prévenu."
          : corps.publies + " actes sont disponibles dans l'espace du client, qui en est prévenu."
      );
      router.refresh();
    });
  }

  /**
   * Déclarer la relecture du récapitulatif, ou revenir dessus.
   *
   * La tâche n'avait aucun geste pour s'accomplir : « Y aller » menait au récapitulatif,
   * et rien au retour ne permettait de dire qu'on l'avait lu.
   */
  function marquerLaRelecture(verifiees: boolean) {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/dossier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, informationsVerifiees: verifiees }),
      });

      if (!reponse.ok) {
        setRefus("La vérification n'a pas pu être enregistrée");
        return;
      }
      setRetour(
        verifiees
          ? "Informations vérifiées : c'est inscrit au journal du dossier."
          : "Les informations sont de nouveau à relire."
      );
      router.refresh();
    });
  }

  /**
   * Renvoyer le dossier au client, en disant ce qu'il doit reprendre.
   *
   * La demande passait par window.prompt : une boîte grise du navigateur, sans le nom
   * du dossier, sans dire ce qu'elle déclenche, et qui gèle la page tant qu'on n'a pas
   * répondu. Le motif part pourtant au client tel quel - c'est la seule chose qu'il
   * lira - et il mérite plus de deux lignes et un champ d'une ligne.
   */
  /**
   * Retirer de l'espace du client les actes qu'on vient d'y mettre.
   *
   * Publier n'avait pas d'envers : un acte mis à disposition par erreur restait chez le
   * client, qui pouvait le signer ou l'envoyer à sa banque.
   */
  function retirerDeLEspaceClient() {
    setRefus(null);
    setRetour(null);
    demarrer(async () => {
      const reponse = await fetch("/api/avocat/actes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Les actes n'ont pas pu être retirés");
        return;
      }
      setRetour(
        corps.retires === 1
          ? "L'acte est retiré de l'espace du client, qui en est prévenu."
          : corps.retires + " actes sont retirés de l'espace du client, qui en est prévenu."
      );
      router.refresh();
    });
  }

  /**
   * Ce que chaque geste demande, et ce qu'il envoie.
   *
   * Refuser un dossier n'avait aucun bouton : les deux seuls états que l'interface
   * posait étaient « corrections demandées » et « en attente de validation ». Un
   * dossier impossible - objet illicite, pièces fausses - ne pouvait que boucler en
   * demandes de reprise. Se retirer d'un dossier n'existait pas non plus : la prise
   * était sans envers.
   */
  const GESTES: Record<Geste, Formulaire> = {
    corrections: {
      titre: "Demander des corrections au client",
      detail:
        "Le dossier repasse de son côté et il en est prévenu par courriel. Ce que vous écrivez ici est ce qu'il lira : dites ce qui cloche et ce que vous attendez de lui.",
      label: "Ce que le client doit reprendre",
      exemple:
        "Le justificatif de jouissance est au nom d'un tiers : il nous faut un bail ou une attestation au nom de la société.",
      bouton: "Envoyer la demande",
      exige: true,
      envoyer: (texte) =>
        fetch("/api/avocat/dossier", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, etat: "corrections_demandees", commentaire: texte }),
        }),
      succes: "Le client est prévenu de ce qu'il doit reprendre.",
    },
    refus: {
      titre: "Refuser le dossier",
      detail:
        "Le dossier est refusé et le client en est prévenu, avec votre motif. Il reste modifiable : s'il reprend ce qui bloque, il repartira en vérification.",
      label: "Le motif du refus",
      exemple:
        "L'objet social déclaré suppose un agrément que la société n'a pas : le greffe refusera l'immatriculation en l'état.",
      bouton: "Refuser le dossier",
      exige: true,
      envoyer: (texte) =>
        fetch("/api/avocat/dossier", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, etat: "rejete", commentaire: texte }),
        }),
      succes: "Le dossier est refusé : le client a reçu votre motif.",
    },
    dessaisissement: {
      titre: "Me retirer du dossier",
      detail:
        "Le dossier repart dans la file : le premier avocat disponible le reprend. Votre client est prévenu qu'il change de mains. Ce que vous écrivez ici n'est lu que par nous.",
      label: "Pourquoi vous vous retirez",
      exemple: "Conflit d'intérêts : le siège est celui d'un autre de mes clients.",
      bouton: "Me retirer",
      exige: false,
      envoyer: (texte) =>
        fetch("/api/avocat/dessaisissement", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, motif: texte || undefined }),
        }),
      succes: "Vous n'êtes plus sur ce dossier : il repart dans la file.",
    },
    invitation: {
      titre: "Inviter un avocat sur le dossier",
      detail:
        "Il pourra le lire et y travailler avec vous, et il en est prévenu par courriel. Vous en restez l'avocat responsable.",
      label: "L'adresse de l'avocat",
      exemple: "prenom.nom@exemple.fr",
      bouton: "Inviter",
      exige: true,
      envoyer: (texte) =>
        fetch("/api/avocat/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dossier, courriel: texte }),
        }),
      succes: "L'avocat est invité : il voit le dossier dans sa liste.",
    },
  };

  /* Ouvrir ou fermer une fenêtre efface ce que la précédente avait à dire. */
  function setFenetre(geste: Geste | null) {
    setFenetreBrute(geste);
    setRefus(null);
    setMotif("");
  }

  function envoyerLeGeste() {
    if (!fenetre) return;
    const forme = GESTES[fenetre];
    const texte = motif.trim();
    if (forme.exige && !texte) return;

    setRefus(null);
    demarrer(async () => {
      const reponse = await forme.envoyer(texte);
      const corps = await reponse.json().catch(() => ({}));

      if (!reponse.ok) {
        setRefus(corps.error ?? "Le geste n'a pas abouti.");
        return;
      }
      setFenetre(null);
      setRetour(forme.succes);
      router.refresh();
    });
  }

  /*
   * Une chose à faire maintenant, le reste en dessous.
   *
   * L'écran racontait l'organisation du travail : trois étapes numérotées, sept
   * tâches en cartes, quatre compteurs, huit boutons de même poids. L'avocat devait
   * reconstituer où il en était avant de faire quoi que ce soit.
   *
   * Il n'y a qu'une chose à faire à un instant donné : la première tâche qui n'est ni
   * faite ni empêchée. Elle prend la tête de l'écran, avec sa phrase et son geste. Ce
   * qui vient après se lit en lignes, sans bouton ; ce qui est fait se replie.
   */
  const maintenant = taches.find((t) => t.etat !== "faite" && !t.bloquee);
  const aVenir = taches.filter(
    (t) => t.etat !== "faite" && t.identifiant !== maintenant?.identifiant
  );
  /*
   * Les actes validés ne s'affichent plus ici.
   *
   * Ils y sont restés le temps de comprendre le défaut - valider un acte le faisait
   * disparaître de l'écran à la seconde du clic - mais leur place est l'onglet des
   * documents, où ils vivent avec tous les autres. Une ligne y renvoie.
   */
  const actesValides = taches.some((t) => t.identifiant === "relecture" && t.etat === "faite");

  /**
   * Le geste d'une tâche, quelle que soit sa forme.
   *
   * Chacune se faisait à sa manière - une commande, un lien d'onglet, une ancre, une
   * fenêtre - et le rendu portait cinq branches imbriquées. Le geste se décrit ici une
   * fois ; la ligne et le bouton le rendent chacun à leur façon.
   */
  function gesteDe(tache: Tache): {
    libelle: string;
    faire?: () => void;
    href?: string;
    /** Le geste est un dépôt de fichier : la ligne devient un label. */
    depot?: "kbis" | "rbe";
  } | null {
    if (tache.bloquee) return null;
    /* Une tâche qui montre ses documents n'a pas de geste : ils portent les leurs. */
    if (documentsDe(tache).length > 0) return null;

    if (tache.etat === "faite") {
      if (tache.identifiant === "relecture") {
        return { libelle: "Retirer de l'espace du client", faire: retirerDeLEspaceClient };
      }
      if (tache.identifiant === "informations" && informationsVerifiees) {
        return { libelle: "Revenir dessus", faire: () => marquerLaRelecture(false) };
      }
      return null;
    }

    if (tache.identifiant === "relecture") {
      return { libelle: "Mettre à disposition du client", faire: mettreADisposition };
    }
    if (tache.identifiant === "actes" && peutProduireLesActes) {
      return { libelle: "Produire les actes", faire: produire };
    }
    if (tache.identifiant === "informations") {
      return { libelle: "J'ai vérifié les informations", faire: () => marquerLaRelecture(true) };
    }
    /*
     * Remettre le document du greffe, c'est déposer un fichier.
     *
     * La tâche menait à l'ancre de l'avancement, où une carte « Documents remis au
     * client » redemandait le même document : deux endroits pour un seul geste.
     */
    if (tache.identifiant === "final") {
      /* Le Kbis garde sa majuscule : « Déposer extrait kbis » n'est pas son nom. */
      return { libelle: "Déposer " + nomEnPhrase(livrables.documentFinal), depot: "kbis" };
    }
    /*
     * Clore le dossier est un geste, non une conséquence.
     *
     * Rien ne le faisait : le dossier restait « en attente de validation » une fois le
     * document du greffe remis, et le client le voyait indéfiniment parmi ses
     * formalités en cours. Remettre un fichier ne dit pas que tout est en ordre -
     * c'est l'avocat qui le constate, d'où un bouton à lui.
     */
    if (tache.identifiant === "cloture") {
      return { libelle: "Clôturer le dossier", faire: cloturer };
    }
    /*
     * Le dépôt se déclare ici même.
     *
     * Le bouton disait « Marquer l'avancement » et menait à la barre du haut, où un
     * second bouton faisait le geste : deux clics et un aller-retour pour dire une
     * chose. Le dépôt lui-même se fait au guichet de l'INPI, hors d'ici ; ce qui se
     * fait ici, c'est de dire qu'il a eu lieu.
     */
    if (tache.onglet === "avancement") {
      return { libelle: "Marquer comme effectué", faire: marquerLeDepot };
    }
    if (tache.onglet) {
      return { libelle: "Y aller", href: "/avocat/" + dossier + "?onglet=" + tache.onglet };
    }
    return null;
  }

  /*
   * Clore le dossier quand le greffe ne délivre rien.
   *
   * La tâche attendait un document qui n'existe pas toujours : le dossier restait en
   * suspens, et le client guettait une remise qui ne viendrait jamais.
   */
  function conclureSansDocument() {
    setRefus(null);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/conclure", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "Le dossier n'a pas pu être clos.");
        return;
      }
      setRetour("Le dossier est clos : le client sait qu'il ne recevra pas de document.");
      router.refresh();
    });
  }

  /**
   * Clore le dossier : il sort de la file du cabinet, et le client l'apprend.
   *
   * C'est le dernier geste du parcours, et le seul qui écrive la date de fin. Sans
   * lui, la formalité restait ouverte des mois après avoir été déposée et remise.
   */
  function cloturer() {
    setRefus(null);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/cloture", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "Le dossier n'a pas pu être clôturé.");
        return;
      }
      setRetour("Le dossier est clôturé : le client est prévenu que tout est terminé.");
      router.refresh();
    });
  }

  /** Clore la demande de corrections : l'encadré disparaît de l'espace du client. */
  function clore() {
    setRefus(null);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/dossier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, etat: "en_attente_validation" }),
      });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "La demande n'a pas pu être close.");
        return;
      }
      setRetour("La demande est close : le client n'a plus rien à reprendre.");
      router.refresh();
    });
  }

  /** Rouvrir un dossier clos : il revient d'un cran, et le travail reprend. */
  function reprendre(vers: string) {
    setRefus(null);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/dossier", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier, sousPhase: vers }),
      });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "Le dossier n'a pas pu être rouvert.");
        return;
      }
      router.refresh();
    });
  }

  /** Déclarer le dépôt au guichet : la seule étape que rien ici ne peut deviner. */
  function marquerLeDepot() {
    setRefus(null);

    demarrer(async () => {
      const reponse = await fetch("/api/avocat/depot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dossier }),
      });

      if (!reponse.ok) {
        const retour = await reponse.json().catch(() => ({}));
        setRefus(retour.error ?? "Le dépôt n'a pas pu être marqué.");
        return;
      }
      setRetour("Le dépôt est marqué : le client en est prévenu.");
      router.refresh();
    });
  }

  /**
   * Les documents d'une tâche, posés dans la page.
   *
   * Ils vivaient dans une fenêtre qu'un bouton « Voir les documents » ouvrait : on
   * cliquait pour découvrir trois lignes, puis on refermait. La tâche les porte.
   */
  function documentsDe(tache: Tache): PieceAffichee[] {
    return tache.onglet === "pieces" ? piecesDeLaTache(pieces, tache.identifiant) : [];
  }

  /** Le champ de fichier caché d'un label de dépôt. */
  function champDeDepot(type: "kbis" | "rbe") {
    return (
      <input
        type="file"
        className={styles.champFichier}
        accept=".pdf,.jpg,.jpeg,.png"
        disabled={enCours}
        onChange={(e) => {
          const fichier = e.target.files?.[0];
          if (fichier) deposer(type, fichier);
          e.target.value = "";
        }}
      />
    );
  }

  /** Une tâche en ligne : le titre, ce qui l'empêche, et son geste au bout. */
  function ligne(tache: Tache) {
    const geste = gesteDe(tache);
    const documents = documentsDe(tache);
    const corps = (
      <>
        <span className={styles.ligneTitre}>{tache.titre}</span>
        {tache.bloquee && <span className={styles.ligneBlocage}>{tache.bloquee}</span>}
        {/*
          Le libellé du geste appartient au document.
          
          La rangée entière était masquée aux lecteurs d'écran : la ligne s'annonçait
          « Déposer au guichet unique », sans dire ce que le clic ferait. Seul le chevron
          est décoratif.
        */}
        {geste && (
          <span className={styles.ligneGeste}>
            {geste.libelle}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        )}
      </>
    );

    /*
     * La ligne entière est le geste : un bouton par tâche en faisait huit sur l'écran,
     * tous de même poids, dont aucun ne disait par où commencer.
     */
    if (documents.length > 0) {
      return (
        <li key={tache.identifiant} className={styles.ligne}>
          <span className={styles.ligneCorps}>{corps}</span>
          <div className={styles.ligneDocuments}>
            {documents.map((piece) => (
              <Piece key={piece.id} piece={piece} dossier={dossier} />
            ))}
          </div>
        </li>
      );
    }
    if (geste?.depot) {
      return (
        <li key={tache.identifiant} className={styles.ligne}>
          <label className={styles.ligneCorps}>
            {corps}
            {champDeDepot(geste.depot)}
          </label>
        </li>
      );
    }
    if (geste?.href) {
      return geste.href.startsWith("#") ? (
        <li key={tache.identifiant} className={styles.ligne}>
          <a href={geste.href} className={styles.ligneCorps}>
            {corps}
          </a>
        </li>
      ) : (
        <li key={tache.identifiant} className={styles.ligne}>
          <Link href={geste.href} className={styles.ligneCorps}>
            {corps}
          </Link>
        </li>
      );
    }
    if (geste?.faire) {
      return (
        <li key={tache.identifiant} className={styles.ligne}>
          <button
            type="button"
            className={styles.ligneCorps}
            onClick={geste.faire}
            disabled={enCours}
          >
            {corps}
          </button>
        </li>
      );
    }
    return (
      <li key={tache.identifiant} className={styles.ligne}>
        <span className={styles.ligneCorps}>{corps}</span>
        {documents.length > 0 && (
          <div className={styles.ligneDocuments}>
            {documents.map((piece) => (
              <Piece key={piece.id} piece={piece} dossier={dossier} />
            ))}
          </div>
        )}
      </li>
    );
  }

  const geste = maintenant ? gesteDe(maintenant) : null;

  return (
    <div className={styles.travail}>
      {/*
        Renvoyer le dossier au client se décide en le lisant, non après l'avoir lu.
        
        Le geste fermait la liste, sous le repli de ce qui est fait : on le découvrait
        au bas de l'écran, après avoir fait défiler ce qu'on venait de faire.
      */}
      <div className={styles.travailTete}>
        {/*
          Clore la demande, quand le client y a répondu.
          
          Elle courait tant que personne ne la fermait : le client gardait sous les yeux
          un encadré « À vous de jouer » pour un travail qu'il avait déjà fait.
        */}
        {correctionsEnCours && (
          <button
            type="button"
            className={styles.travailClore}
            onClick={clore}
            disabled={enCours}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {enCours ? "…" : "Le client a répondu, clore la demande"}
          </button>
        )}

        <button
          type="button"
          className={styles.travailRenvoi}
          onClick={() => setFenetre("corrections")}
          disabled={enCours}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="9 14 4 9 9 4" />
            <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
          </svg>
          Demander des corrections au client
        </button>

        {/*
          Ce qu'un avocat peut faire du dossier lui-même, et non de son travail.
          
          Aucun de ces trois gestes n'existait : un dossier impossible ne pouvait que
          boucler en demandes de reprise, la prise en charge était sans envers, et
          l'avis d'un autre avocat se payait de lui rendre le dossier en entier.
        */}
        {!correctionsEnCours && (
          <span className={styles.travailGestes}>
            <button
              type="button"
              className={styles.travailTertiaire}
              onClick={() => setFenetre("invitation")}
              disabled={enCours}
            >
              Inviter un avocat
            </button>
            <button
              type="button"
              className={styles.travailTertiaire}
              onClick={() => setFenetre("dessaisissement")}
              disabled={enCours}
            >
              Me retirer du dossier
            </button>
            <button
              type="button"
              className={styles.travailTertiaire}
              onClick={() => setFenetre("refus")}
              disabled={enCours}
            >
              Refuser le dossier
            </button>
          </span>
        )}
      </div>
      {maintenant ? (
        <section className={styles.maintenant} aria-label="À faire maintenant">
          <p className={styles.maintenantLegende}>À faire maintenant</p>
          <h2 className={styles.maintenantTitre}>{maintenant.titre}</h2>
          <p className={styles.maintenantPhrase}>{maintenant.explication}</p>

          {maintenant.identifiant === "pieces" && manquantes.length > 0 && (
            <ul className={styles.piecesManquantesListe}>
              {manquantes.map((piece) => (
                <li key={piece.identifiant}>
                  {piece.titre}
                  <span className={styles.piecesManquantesMotif}>{piece.motif}</span>
                </li>
              ))}
            </ul>
          )}

          {documentsDe(maintenant).length > 0 && (
            <div className={styles.maintenantDocuments}>
              {documentsDe(maintenant).map((piece) => (
                <Piece key={piece.id} piece={piece} dossier={dossier} />
              ))}
            </div>
          )}

          <div className={styles.maintenantActions}>
            {geste?.depot ? (
              <label className={styles.travailPrincipal}>
                {geste.libelle}
                {champDeDepot(geste.depot)}
              </label>
            ) : geste?.href ? (
              geste.href.startsWith("#") ? (
                <a href={geste.href} className={styles.travailPrincipal}>
                  {geste.libelle}
                </a>
              ) : (
                <Link href={geste.href} className={styles.travailPrincipal}>
                  {geste.libelle}
                </Link>
              )
            ) : (
              geste?.faire && (
                <button
                  type="button"
                  className={styles.travailPrincipal}
                  onClick={geste.faire}
                  disabled={enCours}
                >
                  {enCours ? "…" : geste.libelle}
                </button>
              )
            )}

            {/*
              Le greffe ne délivre pas toujours de document : le dire clôt le dossier,
              et le client apprend que le dépôt est fait mais qu'il ne recevra rien.
            */}
            {maintenant.identifiant === "final" && (
              <button
                type="button"
                className={styles.travailSecondaire}
                onClick={conclureSansDocument}
                disabled={enCours}
              >
                Le greffe n&apos;en délivre pas
              </button>
            )}

            {/*
              Lire, puis dire qu'on a lu : deux gestes distincts. Le récapitulatif
              s'ouvre dans son onglet, et la case ne se coche qu'au retour.
            */}
            {maintenant.identifiant === "informations" && (
              <Link
                href={"/avocat/" + dossier + "?onglet=" + (maintenant.onglet ?? "dossier")}
                className={styles.travailSecondaire}
              >
                Relire le récapitulatif
              </Link>
            )}
          </div>
        </section>
      ) : (
        /*
         * Le dossier est fini, et cela se voit.
         *
         * L'écran annonçait « Tout est fait » dans le même cadre blanc que le reste, et
         * laissait l'avocat sans rien à faire ni où aller : il repartait à la liste
         * pour découvrir s'il restait du travail.
         */
        <section className={styles.acheve} aria-label="Dossier terminé">
          <span className={styles.acheveIcone} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>

          <h2 className={styles.acheveTitre}>
            Dossier terminé{termineLe ? " le " + termineLe : ""}
          </h2>
          <p className={styles.achevePhrase}>
            Tout ce qui vous revenait est fait.
            <br />
            Le client a ses documents et suit la suite depuis son espace.
          </p>

          <div className={styles.acheveActions}>
            {dossiersAPrendre > 0 ? (
              <Link href="/avocat?filtre=aprendre" className={styles.travailPrincipal}>
                {dossiersAPrendre === 1
                  ? "Un dossier attend un preneur"
                  : dossiersAPrendre + " dossiers attendent un preneur"}
              </Link>
            ) : (
              <Link href="/tableau-de-bord" className={styles.travailPrincipal}>
                Retour au tableau de bord
              </Link>
            )}

            {/*
              Un dossier clos se rouvre : une coquille se voit parfois après coup.
              
              Le geste menait à l'ancre de la barre d'avancement, trois lignes plus haut,
              où un second bouton le faisait : on cliquait, la page sursautait, et rien
              n'avait bougé.
            */}
            {etapePrecedente && (
              <button
                type="button"
                className={styles.acheveReprendre}
                onClick={() => reprendre(etapePrecedente)}
                disabled={enCours}
              >
                {enCours ? "…" : "Reprendre ce dossier"}
              </button>
            )}
          </div>
        </section>
      )}

      {/*
        Les actes se glissent entre la tâche du moment et ce qui viendra.
        
        Ils vivaient derrière un onglet, et le travail du jour - relire, corriger,
        valider - demandait d'en changer. Ils prennent la place qu'ils occupent dans la
        journée : juste après ce qu'il y a à faire maintenant, avant la liste de ce qui
        attend.
      */}
      {apresLaTacheDuMoment}

      {aVenir.length > 0 && (
        <section>
          <h3 className={styles.suiteTitre}>Ensuite</h3>
          <ul className={styles.suite}>{aVenir.map((tache) => ligne(tache))}</ul>
        </section>
      )}

      {/*
        Le pied de l'onglet, en une zone.

        Trois lignes y flottaient, séparées par de grands blancs : le renvoi vers les
        documents, le registre facultatif, le repli de ce qui est fait, et le renvoi au
        client tout seul à droite. Elles tiennent sur une bande, sous un filet.
      */}
      <footer className={styles.travailPied}>
        <div className={styles.travailPiedNotes}>
          {actesValides && (
            <p className={styles.renvoi}>
              Les actes du dossier sont <a href="#documents">un peu plus bas</a>.
            </p>
          )}

          {/*
            Le registre des bénéficiaires effectifs n'est pas une tâche : le greffe ne
            l'exige pas, et aucune tâche ne le réclame.
          */}
          {livrables.registreConcerne && (
            <p className={styles.facultatif}>
              Registre des bénéficiaires effectifs, facultatif.
              <label className={styles.travailTertiaire}>
                {livrables.aLeRbe ? "Remplacer" : "Déposer"}
                {champDeDepot("rbe")}
              </label>
            </p>
          )}
        </div>
      </footer>

      {fenetre && (
        <>
          {/* Le voile ne masque pas la liste : on écrit en regardant ce qui cloche. */}
          <div className={styles.voile} onClick={() => setFenetre(null)} aria-hidden="true" />

          <div
            className={styles.fenetreCorrections}
            role="dialog"
            aria-modal="true"
            aria-label={GESTES[fenetre].titre}
          >
            <h3 className={styles.fenetreCorrectionsTitre}>{GESTES[fenetre].titre}</h3>
            <p className={styles.fenetreCorrectionsDetail}>{GESTES[fenetre].detail}</p>

            <label className={styles.fenetreCorrectionsLabel} htmlFor="motif-du-geste">
              {GESTES[fenetre].label}
            </label>
            {/*
              Une adresse tient sur une ligne ; un motif, non. Le champ suit ce qu'on
              lui demande d'écrire.
            */}
            {fenetre === "invitation" ? (
              <input
                id="motif-du-geste"
                type="email"
                className={styles.fenetreCorrectionsChamp}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                autoFocus
                placeholder={GESTES[fenetre].exemple}
              />
            ) : (
              <textarea
                id="motif-du-geste"
                className={styles.fenetreCorrectionsChamp}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                rows={4}
                maxLength={1000}
                autoFocus
                placeholder={GESTES[fenetre].exemple}
              />
            )}

            {/*
              Le refus se lit dans la fenêtre qui l'a provoqué.
              
              Il s'affichait au bas de la page, sous les tâches : la fenêtre le
              masquait, et l'on recliquait sur un bouton qui semblait ne rien faire.
            */}
            {refus && (
              <p className={styles.fenetreCorrectionsRefus} role="alert">
                {refus}
              </p>
            )}

            <div className={styles.fenetreCorrectionsActions}>
              <button
                type="button"
                className={styles.travailSecondaire}
                onClick={() => setFenetre(null)}
                disabled={enCours}
              >
                Annuler
              </button>
              <button
                type="button"
                className={styles.travailPrincipal}
                onClick={envoyerLeGeste}
                disabled={enCours || (GESTES[fenetre].exige && !motif.trim())}
              >
                {enCours ? "Envoi" : GESTES[fenetre].bouton}
              </button>
            </div>
          </div>
        </>
      )}

      {retour && (
        <p className={styles.travailRetour} role="status">
          {retour}
        </p>
      )}
      {refus && (
        <p className={styles.travailRefus} role="alert">
          {refus}
        </p>
      )}
    </div>
  );
}

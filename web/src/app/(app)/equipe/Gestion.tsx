"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { DROITS, DROITS_PAR_DEFAUT, type Droits } from "@/domain/equipe/droits";
import styles from "./Equipe.module.css";

/**
 * Les gestes de la page d'équipe : inviter, changer des droits, retirer, relancer.
 *
 * Tout passe par une fenêtre plutôt qu'un formulaire posé dans la page. Changer les
 * droits de quelqu'un et retirer quelqu'un sont des gestes qui engagent, et une
 * fenêtre les isole du reste : on voit ce qu'on va faire, à qui, avant de le faire.
 */

interface Choix {
  valeur: string;
  libelle: string;
  pouvoir: string;
}

/* ------------------------------------------------------------------ Fenêtre */

/**
 * Une fenêtre posée sur le document.
 *
 * Le portail n'est pas une élégance : la page vit dans un gabarit dont la colonne est
 * en position:sticky, ce qui crée un contexte d'empilement où le z-index resterait
 * prisonnier - la fenêtre passerait sous les cartes.
 */
function Fenetre({
  titre,
  soustitre,
  onFermer,
  children,
}: {
  titre: string;
  soustitre?: string;
  onFermer: () => void;
  children: ReactNode;
}) {
  const cadre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === "Escape") onFermer();
    }
    document.addEventListener("keydown", auClavier);
    cadre.current?.focus();
    return () => document.removeEventListener("keydown", auClavier);
  }, [onFermer]);

  return createPortal(
    <div className={styles.voile} onClick={onFermer}>
      <div
        ref={cadre}
        className={styles.fenetre}
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.fenetreEntete}>
          <div>
            <h2 className={styles.fenetreTitre}>{titre}</h2>
            {soustitre && <p className={styles.fenetreSoustitre}>{soustitre}</p>}
          </div>
          <button
            type="button"
            className={styles.fermer}
            onClick={onFermer}
            aria-label="Fermer"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.fenetreCorps}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------- Rôle et droits */

/** Le choix du rôle, en cartes : chacune dit ce que le rôle emporte. */
function ChoixDuRole({
  roles,
  valeur,
  onChange,
}: {
  roles: Choix[];
  valeur: string;
  onChange: (r: string) => void;
}) {
  return (
    <fieldset className={styles.bloc}>
      <legend className={styles.blocTitre}>Rôle</legend>
      <div className={styles.roles}>
        {roles.map((r) => (
          <label
            key={r.valeur}
            className={valeur === r.valeur ? `${styles.carteRole} ${styles.carteRoleChoisie}` : styles.carteRole}
          >
            <input
              type="radio"
              name="role"
              value={r.valeur}
              checked={valeur === r.valeur}
              onChange={() => onChange(r.valeur)}
            />
            <span className={styles.carteRoleNom}>{r.libelle}</span>
            <span className={styles.carteRolePouvoir}>{r.pouvoir}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Les trois droits, chacun avec la phrase qui dit ce qu'on perd sans lui. */
function ChoixDesDroits({
  droits,
  onChange,
}: {
  droits: Droits;
  onChange: (d: Droits) => void;
}) {
  return (
    <fieldset className={styles.bloc}>
      <legend className={styles.blocTitre}>Ce que cette personne peut faire</legend>
      <div className={styles.droits}>
        {DROITS.map((d) => (
          <label key={d.cle} className={styles.interrupteur}>
            <input
              type="checkbox"
              checked={droits[d.cle]}
              onChange={(e) => onChange({ ...droits, [d.cle]: e.target.checked })}
            />
            <span>
              <span className={styles.interrupteurLibelle}>{d.libelle}</span>
              <span className={styles.interrupteurExplication}>{d.explication}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Le retour d'une action : le même bloc partout, réussite ou échec. */
function Message({ retour }: { retour: { ok: boolean; texte: string } | null }) {
  if (!retour) return null;

  return (
    <p
      className={retour.ok ? styles.retourOk : styles.retourEchec}
      role={retour.ok ? "status" : "alert"}
      aria-live="polite"
    >
      {retour.texte}
    </p>
  );
}

/** Lit l'erreur d'une réponse, qu'elle vienne de la validation ou de la route. */
async function messageDErreur(reponse: Response, defaut: string): Promise<string> {
  const corps = await reponse.json().catch(() => ({}));
  const premier = corps.details ? Object.values(corps.details)[0] : null;
  return (Array.isArray(premier) ? premier[0] : corps.error) ?? defaut;
}

/* ---------------------------------------------------------------- Inviter */

export function Inviter({ roles }: { roles: Choix[] }) {
  const [ouverte, setOuverte] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0]?.valeur ?? "collaborateur");
  const [droits, setDroits] = useState<Droits>(DROITS_PAR_DEFAUT);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function fermer() {
    setOuverte(false);
    setRetour(null);
  }

  function envoyer(evenement: React.FormEvent) {
    evenement.preventDefault();
    setRetour(null);

    demarrer(async () => {
      const reponse = await fetch("/api/equipe/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, ...droits }),
      });

      if (!reponse.ok) {
        setRetour({ ok: false, texte: await messageDErreur(reponse, "Invitation non envoyée") });
        return;
      }

      const corps = await reponse.json();
      setRetour({
        ok: true,
        texte: corps.envoye
          ? "Invitation envoyée à " + corps.email
          : // Dire « envoyée » quand rien n'est parti ferait attendre pour rien.
            "Invitation créée pour " +
            corps.email +
            ", mais l'email n'est pas parti. Copiez le lien ci-dessous pour le lui transmettre.",
      });
      setEmail("");
      setDroits(DROITS_PAR_DEFAUT);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className={styles.actionPage} onClick={() => setOuverte(true)}>
        <span className={styles.plus} aria-hidden="true">
          +
        </span>
        Inviter un membre
      </button>

      {ouverte && (
        <Fenetre
          titre="Inviter un membre"
          soustitre="La personne reçoit un lien valable sept jours et rejoint l'équipe avec les droits choisis ici."
          onFermer={fermer}
        >
          <form onSubmit={envoyer} noValidate>
            <div className={styles.bloc}>
              <label className={styles.blocTitre} htmlFor="invitation-email">
                Adresse email
              </label>
              <input
                id="invitation-email"
                type="email"
                className={styles.champ}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@exemple.fr"
                autoComplete="off"
                required
              />
            </div>

            <ChoixDuRole roles={roles} valeur={role} onChange={setRole} />
            <ChoixDesDroits droits={droits} onChange={setDroits} />

            <Message retour={retour} />

            <div className={styles.piedFenetre}>
              <button type="button" className={styles.boutonSecondaire} onClick={fermer}>
                Fermer
              </button>
              <button type="submit" className={styles.boutonPrincipal} disabled={enCours}>
                {enCours ? "Envoi" : "Envoyer l'invitation"}
              </button>
            </div>
          </form>
        </Fenetre>
      )}
    </>
  );
}

/* --------------------------------------------------------- Membre en place */

interface MembreAffiche extends Droits {
  id: number;
  nom: string;
  role: string;
}

export function ActionsMembre({
  membre,
  roles,
  moi,
  dernierDirigeant,
}: {
  membre: MembreAffiche;
  roles: Choix[];
  moi: boolean;
  /** Ce membre tient l'équipe à lui seul : son départ la laisserait sans personne. */
  dernierDirigeant: boolean;
}) {
  const [fenetre, setFenetre] = useState<"acces" | "retrait" | null>(null);
  const [role, setRole] = useState(membre.role);
  const [droits, setDroits] = useState<Droits>({
    voitTousLesDossiers: membre.voitTousLesDossiers,
    peutModifier: membre.peutModifier,
    peutCreer: membre.peutCreer,
  });
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function fermer() {
    setFenetre(null);
    setRetour(null);
  }

  function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault();
    setRetour(null);

    demarrer(async () => {
      const reponse = await fetch("/api/equipe/membres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membre: membre.id, role, ...droits }),
      });

      if (!reponse.ok) {
        setRetour({ ok: false, texte: await messageDErreur(reponse, "Modification non prise") });
        return;
      }

      router.refresh();
      fermer();
    });
  }

  function retirer() {
    setRetour(null);

    demarrer(async () => {
      const reponse = await fetch("/api/equipe/membres", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membre: membre.id, action: "retirer" }),
      });

      if (!reponse.ok) {
        setRetour({ ok: false, texte: await messageDErreur(reponse, "Retrait impossible") });
        return;
      }

      router.refresh();
      fermer();
    });
  }

  return (
    <div className={styles.actions}>
      <button type="button" className={styles.lienAction} onClick={() => setFenetre("acces")}>
        Modifier les accès
      </button>
      <button
        type="button"
        className={`${styles.lienAction} ${styles.lienDanger}`}
        onClick={() => setFenetre("retrait")}
      >
        {moi ? "Quitter" : "Retirer"}
      </button>

      {fenetre === "acces" && (
        <Fenetre
          titre={"Accès de " + membre.nom}
          soustitre="Les changements prennent effet immédiatement, sans nouvelle invitation."
          onFermer={fermer}
        >
          <form onSubmit={enregistrer}>
            <ChoixDuRole roles={roles} valeur={role} onChange={setRole} />
            <ChoixDesDroits droits={droits} onChange={setDroits} />

            <Message retour={retour} />

            <div className={styles.piedFenetre}>
              <button type="button" className={styles.boutonSecondaire} onClick={fermer}>
                Annuler
              </button>
              <button type="submit" className={styles.boutonPrincipal} disabled={enCours}>
                {enCours ? "Enregistrement" : "Enregistrer"}
              </button>
            </div>
          </form>
        </Fenetre>
      )}

      {fenetre === "retrait" && (
        <Fenetre titre={moi ? "Quitter l'équipe" : "Retirer " + membre.nom} onFermer={fermer}>
          {/*
            Le refus se dit avant le clic, pas après.

            Le serveur refuserait de toute façon ; offrir un bouton rouge qui ne peut
            que échouer donne à croire que le geste est possible et fait chercher la
            faute ailleurs. Ici on dit ce qui manque et comment l'obtenir.
          */}
          {dernierDirigeant ? (
            <p className={styles.avertissement}>
              {moi ? "Vous êtes" : membre.nom + " est"} la seule personne à gérer cette équipe.
              Nommez quelqu&apos;un d&apos;autre avant de {moi ? "la quitter" : "le retirer"} :
              sans gestionnaire, plus personne ne pourrait inviter ni changer un droit.
            </p>
          ) : (
            <p className={styles.avertissement}>
              {moi
                ? "Vous n'aurez plus accès aux dossiers de l'équipe. Il faudra une nouvelle invitation pour y revenir."
                : membre.nom +
                  " n'aura plus accès aux dossiers de l'équipe. Les dossiers, eux, restent en place."}
            </p>
          )}

          <Message retour={retour} />

          <div className={styles.piedFenetre}>
            <button type="button" className={styles.boutonSecondaire} onClick={fermer}>
              {dernierDirigeant ? "Fermer" : "Annuler"}
            </button>
            {!dernierDirigeant && (
              <button
                type="button"
                className={styles.boutonDanger}
                onClick={retirer}
                disabled={enCours}
              >
                {enCours ? "Retrait" : moi ? "Quitter l'équipe" : "Retirer de l'équipe"}
              </button>
            )}
          </div>
        </Fenetre>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Invitations */

export function ActionsInvitation({
  invitation,
}: {
  invitation: { id: number; email: string; etat: string; lien: string | null };
}) {
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  function agir(action: "renvoyer" | "revoquer") {
    setRetour(null);

    demarrer(async () => {
      const reponse = await fetch("/api/equipe/membres", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitation: invitation.id, action }),
      });

      if (!reponse.ok) {
        setRetour({ ok: false, texte: await messageDErreur(reponse, "Action impossible") });
        return;
      }

      const corps = await reponse.json().catch(() => ({}));
      if (action === "renvoyer") {
        setRetour({
          ok: true,
          texte: corps.envoye
            ? "Invitation renvoyée"
            : "Nouveau lien créé, mais l'email n'est pas parti",
        });
      }
      router.refresh();
    });
  }

  async function copier() {
    if (!invitation.lien) return;
    try {
      await navigator.clipboard.writeText(invitation.lien);
      setRetour({ ok: true, texte: "Lien copié" });
    } catch {
      // Le presse-papier peut être refusé par le navigateur : on le dit plutôt que
      // de laisser croire que la copie a eu lieu.
      setRetour({ ok: false, texte: "Copie refusée par le navigateur" });
    }
  }

  // Une invitation acceptée n'appelle plus aucun geste : le membre est dans la liste.
  if (invitation.etat === "acceptee") return null;

  return (
    <div className={styles.actions}>
      {invitation.lien && (
        <button type="button" className={styles.lienAction} onClick={copier}>
          Copier le lien
        </button>
      )}
      <button
        type="button"
        className={styles.lienAction}
        onClick={() => agir("renvoyer")}
        disabled={enCours}
      >
        Renvoyer
      </button>
      {invitation.etat === "en_attente" && (
        <button
          type="button"
          className={`${styles.lienAction} ${styles.lienDanger}`}
          onClick={() => agir("revoquer")}
          disabled={enCours}
        >
          Révoquer
        </button>
      )}
      <Message retour={retour} />
    </div>
  );
}

/* ------------------------------------------- Retour d'une acceptation */

const ISSUES: Record<string, { ok: boolean; texte: string }> = {
  acceptee: { ok: true, texte: "Invitation acceptée : vous faites partie de l'équipe." },
  inconnue: { ok: false, texte: "Ce lien d'invitation n'existe pas." },
  expiree: {
    ok: false,
    texte: "Ce lien a expiré. Demandez à l'équipe de vous renvoyer une invitation.",
  },
  revoquee: { ok: false, texte: "Cette invitation a été révoquée." },
  autre_compte: {
    ok: false,
    texte:
      "Cette invitation vise une autre adresse email que celle de votre compte. Connectez-vous avec l'adresse invitée.",
  },
};

/**
 * Le retour du lien d'acceptation.
 *
 * La route d'acceptation renvoie ici avec l'issue en paramètre ; sans ce bloc, elle
 * revenait sur une page identique à elle-même et l'on ne savait pas ce qui s'était
 * passé.
 */
export function Retour({ issue }: { issue: string }) {
  const [visible, setVisible] = useState(true);
  const message = ISSUES[issue] ?? ISSUES.inconnue;

  if (!visible) return null;

  return (
    <div
      className={message.ok ? styles.bandeauOk : styles.bandeauEchec}
      role={message.ok ? "status" : "alert"}
    >
      <span>{message.texte}</span>
      <button
        type="button"
        className={styles.fermerBandeau}
        onClick={() => setVisible(false)}
        aria-label="Fermer"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

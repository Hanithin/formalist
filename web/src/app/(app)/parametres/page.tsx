import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { compteDeLAvocat } from "@/infrastructure/db/depots/identifiants-guichet";
import { FormulaireProfil } from "./FormulaireProfil";
import { FormulaireMotDePasse } from "./FormulaireMotDePasse";
import { Deconnexion } from "./Deconnexion";
import styles from "./Parametres.module.css";

export const metadata: Metadata = {
  title: "Paramètres - Formalist",
  robots: { index: false, follow: false },
};

/** « 12 avril 2026 » : une date de compte se lit, elle ne se calcule pas. */
function enFrancais(quand: Date | null): string {
  if (!quand) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(quand);
}

/** « le 12 avril 2026 à 09:15 » : pour une connexion, l'heure compte. */
function avecHeure(quand: Date | null): string {
  if (!quand) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(quand);
}

const ROLES: Record<string, string> = {
  client: "Client",
  avocat: "Avocat",
  admin: "Administrateur",
};

export default async function Parametres() {
  const utilisateur = await exigerUtilisateur();
  const compte = await prisma.users.findUniqueOrThrow({
    where: { id: utilisateur.id },
    select: {
      first_name: true,
      last_name: true,
      name: true,
      email: true,
      created_at: true,
      last_login_at: true,
      email_verified: true,
    },
  });

  /*
   * Le compte du guichet unique, pour ceux qui déposent.
   *
   * Il se saisit aujourd'hui dans une fenêtre, au moment d'un dépôt, et rien nulle part
   * ne disait s'il était enregistré ni depuis quand il n'avait pas été vérifié. C'est un
   * réglage de compte : sa place est ici.
   */
  const estAvocat = utilisateur.roles.includes("avocat") || utilisateur.roles.includes("admin");
  const guichet = estAvocat ? await compteDeLAvocat(utilisateur.id) : null;

  // Les comptes anciens n'ont que le nom complet : on le découpe pour l'affichage.
  const morceaux = (compte.name ?? "").split(/\s+/);
  const prenom = compte.first_name ?? morceaux[0] ?? "";
  const nom = compte.last_name ?? morceaux.slice(1).join(" ");

  return (
    <main className={styles.page}>
      <div className={styles.tete}>
        <h1>Paramètres</h1>
        <p>Votre compte, son accès et les services qui y sont rattachés.</p>
      </div>

      {/*
        Deux colonnes, parce que la page en avait une pour rien.

        Trois cartes de cinq cent vingt pixels s'empilaient au milieu d'un écran qui en
        offre douze cents : on faisait défiler pour atteindre la déconnexion, avec les
        deux tiers de la largeur en gris. Ce qu'on modifie tient à gauche, ce qu'on
        consulte à droite.
      */}
      <div className={styles.colonnes}>
        <div className={styles.colonne}>
          <section className={styles.bloc}>
            <h2>Vos informations</h2>
            <p className={styles.explication}>
              Le nom figure sur vos documents, l&apos;adresse sert à vous connecter.
            </p>
            <FormulaireProfil prenom={prenom} nom={nom} email={compte.email} />
          </section>

          <section className={styles.bloc}>
            <h2>Mot de passe</h2>
            <p className={styles.explication}>
              Le changer ferme vos autres sessions, sur les appareils où vous êtes resté
              connecté.
            </p>
            <FormulaireMotDePasse />
          </section>
        </div>

        <div className={styles.colonne}>
          <section className={styles.bloc}>
            <h2>Votre compte</h2>
            <p className={styles.explication}>
              Ce que la plateforme sait de vous, et ce qu&apos;elle vous ouvre.
            </p>

            <dl className={styles.fiche}>
              <div>
                <dt>Adresse de connexion</dt>
                <dd>
                  {compte.email}
                  {compte.email_verified ? (
                    <span className={`${styles.pastille} ${styles.confirmee}`}>Confirmée</span>
                  ) : (
                    <span className={`${styles.pastille} ${styles.attente}`}>À confirmer</span>
                  )}
                </dd>
              </div>

              <div>
                <dt>Accès</dt>
                <dd>
                  <span className={styles.roles}>
                    {utilisateur.roles.map((role) => (
                      <span key={role} className={styles.role}>
                        {ROLES[role] ?? role}
                      </span>
                    ))}
                  </span>
                </dd>
              </div>

              <div>
                <dt>Compte ouvert le</dt>
                <dd>{enFrancais(compte.created_at)}</dd>
              </div>

              <div>
                <dt>Dernière connexion</dt>
                <dd>{avecHeure(compte.last_login_at)}</dd>
              </div>
            </dl>
          </section>

          {estAvocat && (
            <section className={styles.bloc}>
              <h2>Guichet unique</h2>
              <p className={styles.explication}>
                Le compte e-procédures sous lequel vos dépôts partent à l&apos;INPI.
              </p>

              {guichet ? (
                <dl className={styles.fiche}>
                  <div>
                    <dt>Identifiant</dt>
                    <dd>{guichet.username}</dd>
                  </div>
                  <div>
                    <dt>Environnement</dt>
                    <dd>
                      {guichet.environnement === "production" ? "Production" : "Démonstration"}
                    </dd>
                  </div>
                  <div>
                    <dt>Vérifié le</dt>
                    <dd>{avecHeure(guichet.verifieLe)}</dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.absent}>
                  Aucun compte enregistré. Il vous sera demandé au premier dépôt, depuis
                  l&apos;écran d&apos;un dossier.
                </p>
              )}

              <p className={styles.explication}>
                <Link href="/avocat">Vos dossiers à déposer</Link>
              </p>
            </section>
          )}

          <section className={`${styles.bloc} ${styles.session}`}>
            <h2>Session</h2>
            <p className={styles.explication}>
              Vous fermez la session de cet appareil. Les autres restent ouvertes.
            </p>
            <Deconnexion />
          </section>
        </div>
      </div>
    </main>
  );
}

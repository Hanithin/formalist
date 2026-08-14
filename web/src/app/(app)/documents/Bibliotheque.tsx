"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  retenu,
  correspond,
  comptesParFiltre,
  grouper,
  nombreDeSocietes,
  aRemplacer,
  ouvertParDefaut,
  tronquer,
  SEUIL_RECHERCHE,
  type DocumentRange,
  type GroupeDeDocuments,
} from "@/domain/document/bibliotheque";
import { FILTRES_DOCUMENTS, libelleFiltre } from "@/domain/document/statuts";
import { formaterDate } from "@/lib/dates";
import styles from "./Documents.module.css";

/** Ce qui traverse jusqu'au navigateur : les dates y sont des chaînes. */
export interface DocumentAffiche extends Omit<DocumentRange, "creeLe"> {
  creeLe: string | null;
}

export interface SocieteProposee {
  id: number;
  nom: string;
  /** Où le dossier se reprend : le formulaire dépend de son type. */
  lien: string;
}

function Dossier() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  );
}

function Feuille() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function Alerte() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function Loupe() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function Televerser() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function Croix() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const ETIQUETTES: Record<string, string> = {
  generated: "Généré",
  uploaded: "Déposé",
  signed: "Signé",
  verified: "Vérifié",
  actif: "Déposé",
};

/**
 * La bibliothèque de documents.
 *
 * Tout est chargé d'un coup et filtré ici : les pastilles annoncent chacune leur
 * décompte, et une liste déjà réduite par le serveur ne permettrait pas de les
 * calculer. C'est le choix fait sur « Mes formalités », pour la même raison.
 */
export function Bibliotheque({
  documents,
  societes,
}: {
  documents: DocumentAffiche[];
  societes: SocieteProposee[];
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState("tous");
  const [recherche, setRecherche] = useState("");
  const [fenetre, setFenetre] = useState(false);

  const ranges: DocumentRange[] = documents.map((d) => ({
    ...d,
    creeLe: d.creeLe ? new Date(d.creeLe) : null,
  }));

  const comptes = comptesParFiltre(ranges);
  const retenus = ranges.filter((d) => retenu(d, filtre) && correspond(d, recherche));
  const groupes = grouper(retenus);

  // La recherche n'apparaît qu'au-delà de quelques sociétés : un champ vide au-dessus
  // de deux blocs occupe la place sans rien rendre.
  const avecRecherche = nombreDeSocietes(ranges) > SEUIL_RECHERCHE;

  return (
    <>
      <div className={styles.barre}>
        {FILTRES_DOCUMENTS.map((f) => (
          <button
            type="button"
            key={f.valeur}
            className={styles.pill + (filtre === f.valeur ? " " + styles.pillActive : "")}
            onClick={() => setFiltre(f.valeur)}
            aria-pressed={filtre === f.valeur}
          >
            {f.libelle}
            <span className={styles.compte}>{comptes[f.valeur] ?? 0}</span>
          </button>
        ))}

        {avecRecherche && (
          <span className={styles.recherche}>
            <Loupe />
            <input
              type="search"
              className={styles.champRecherche}
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher une société, un document…"
              aria-label="Rechercher un document"
            />
          </span>
        )}

        <button
          type="button"
          className={styles.deposer + (avecRecherche ? "" : " " + styles.aDroite)}
          style={avecRecherche ? undefined : { marginLeft: "auto" }}
          onClick={() => setFenetre(true)}
        >
          <Televerser />
          Déposer un document
        </button>
      </div>

      {retenus.length === 0 ? (
        <Vide
          total={ranges.length}
          filtre={filtre}
          recherche={recherche}
          onEffacer={() => {
            setFiltre("tous");
            setRecherche("");
          }}
          onDeposer={() => setFenetre(true)}
        />
      ) : (
        <>
          <p className={styles.total}>
            {retenus.length} document{retenus.length > 1 ? "s" : ""}
            {groupes.length > 1 ? " · " + groupes.length + " sociétés" : ""}
          </p>

          {groupes.map((groupe) => (
            <Groupe
              key={groupe.societeId ?? "sans-societe"}
              groupe={groupe}
              nombreDeGroupes={groupes.length}
              recherche={recherche}
              lien={societes.find((s) => s.id === groupe.societeId)?.lien ?? null}
            />
          ))}
        </>
      )}

      {fenetre && (
        <FenetreDeDepot
          societes={societes}
          onFermer={() => setFenetre(false)}
          onDepose={() => {
            setFenetre(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * Un groupe repliable, une société.
 *
 * Il s'ouvre ou se replie de lui-même selon les règles du domaine, et le geste reste
 * possible : la clé est l'état par défaut, pas l'interdiction. Une bibliothèque de
 * cinq dossiers produit une centaine de documents, et tout dérouler donne une page
 * qu'on parcourt sans jamais en voir la fin.
 */
function Groupe({
  groupe,
  nombreDeGroupes,
  recherche,
  lien,
}: {
  groupe: GroupeDeDocuments;
  nombreDeGroupes: number;
  recherche: string;
  lien: string | null;
}) {
  const defaut = ouvertParDefaut(groupe, nombreDeGroupes, recherche);
  const [ouvertParLeGeste, setOuvertParLeGeste] = useState<boolean | null>(null);
  const [tout, setTout] = useState(false);

  // Le geste prime sur la règle, mais la règle reprend la main quand la recherche
  // change : ce qu'on vient de demander doit se voir.
  const ouvert = ouvertParLeGeste ?? defaut;
  const { montres, restants } = tronquer(groupe.documents, tout);
  const enAttente = groupe.documents.filter(aRemplacer).length;

  return (
    <section className={styles.groupe}>
      <div className={styles.groupeTete}>
        <button
          type="button"
          className={styles.groupeBouton}
          onClick={() => setOuvertParLeGeste(!ouvert)}
          aria-expanded={ouvert}
        >
          <span className={styles.chevron + (ouvert ? " " + styles.chevronOuvert : "")}>
            <Chevron />
          </span>
          <span className={styles.groupeTitre}>{groupe.titre}</span>
          <span className={styles.groupeCompte}>
            {groupe.documents.length} document{groupe.documents.length > 1 ? "s" : ""}
          </span>
          {/* Ce qui bloque un dossier se voit même groupe replié. */}
          {enAttente > 0 && <span className={styles.groupeAttente}>{enAttente} à remplacer</span>}
        </button>

        {lien && (
          <Link className={styles.groupeLien} href={lien}>
            Ouvrir le dossier
          </Link>
        )}
      </div>

      {ouvert && (
        <div className={styles.liste}>
          {montres.map((d) => (
            <Carte key={d.id} document={d} lien={lien} />
          ))}

          {restants > 0 && (
            <button type="button" className={styles.voirPlus} onClick={() => setTout(true)}>
              Voir les {restants} autres documents
            </button>
          )}
          {tout && groupe.documents.length > montres.length - 1 && restants === 0 && (
            <button type="button" className={styles.voirPlus} onClick={() => setTout(false)}>
              Réduire
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Carte({ document, lien }: { document: DocumentRange; lien: string | null }) {
  const attente = aRemplacer(document);
  // Un document refusé porte cette marque plutôt que son statut : c'est ce qu'on
  // doit en retenir.
  const etiquette = attente ? "À remplacer" : (ETIQUETTES[document.statut ?? ""] ?? "Document");

  return (
    <div className={styles.carte + (attente ? " " + styles.carteAremplacer : "")}>
      <span className={styles.icone}>{attente ? <Alerte /> : <Feuille />}</span>

      <span className={styles.corps}>
        <span className={styles.nom}>{document.nom}</span>
        <span className={styles.details}>
          <span className={styles.etiquette + (attente ? " " + styles.etiquetteAttente : "")}>
            {etiquette}
          </span>
          {document.creeLe && <span>{formaterDate(document.creeLe)}</span>}
          {/*
            Le motif du refus se lit à côté du document, et non dans un écran
            séparé : c'est lui qui dit quoi redéposer.
          */}
          {attente && document.motifRejet && (
            <span className={styles.motif}>Motif : {document.motifRejet}</span>
          )}
        </span>
      </span>

      <span className={styles.actions}>
        {document.contratId !== null && (
          <Link className={styles.action} href="/contrats">
            Voir le contrat
          </Link>
        )}

        {document.fichier ? (
          <a
            className={styles.action + (attente ? "" : " " + styles.actionPrincipale)}
            href={
              "/api/fichier?nom=" +
              encodeURIComponent(document.fichier) +
              "&titre=" +
              encodeURIComponent(document.nom) +
              "&telecharger=1"
            }
          >
            Télécharger
          </a>
        ) : (
          // Un document attendu mais pas encore fourni : le dire vaut mieux qu'un
          // bouton qui ne mènerait nulle part.
          <span className={styles.sansFichier}>Pas encore de fichier</span>
        )}

        {attente && lien && (
          <Link className={styles.action + " " + styles.actionPrincipale} href={lien}>
            Remplacer
          </Link>
        )}
      </span>
    </div>
  );
}

function Vide({
  total,
  filtre,
  recherche,
  onEffacer,
  onDeposer,
}: {
  total: number;
  filtre: string;
  recherche: string;
  onEffacer: () => void;
  onDeposer: () => void;
}) {
  // Trois vides différents : rien du tout, rien dans ce filtre, rien pour cette
  // recherche. Le même message pour les trois laisserait chercher la mauvaise sortie.
  if (total === 0) {
    return (
      <div className={styles.vide}>
        <div className={styles.videIcone}>
          <Dossier />
        </div>
        <span className={styles.videTitre}>Aucun document pour le moment</span>
        <span className={styles.videTexte}>
          Statuts, attestations, Kbis et pièces déposées : tout ce qui est produit sur vos dossiers
          se retrouve ici, rangé par société.
        </span>
        <div className={styles.videActions}>
          <Link
            className={styles.action + " " + styles.actionPrincipale}
            href="/creation?type=creation"
          >
            Créer une société
          </Link>
          <button type="button" className={styles.action} onClick={onDeposer}>
            Déposer un document
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.vide}>
      <div className={styles.videIcone}>
        <Loupe />
      </div>
      <span className={styles.videTitre}>
        {recherche.trim()
          ? "Aucun résultat"
          : "Aucun document dans « " + libelleFiltre(FILTRES_DOCUMENTS, filtre) + " »"}
      </span>
      <span className={styles.videTexte}>
        {recherche.trim()
          ? "Aucun document ne correspond à cette recherche."
          : "Vous en avez peut-être d'une autre origine."}
      </span>
      <div className={styles.videActions}>
        <button
          type="button"
          className={styles.action + " " + styles.actionPrincipale}
          onClick={onEffacer}
        >
          Voir tous les documents
        </button>
      </div>
    </div>
  );
}

function FenetreDeDepot({
  societes,
  onFermer,
  onDepose,
}: {
  societes: SocieteProposee[];
  onFermer: () => void;
  onDepose: () => void;
}) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [nom, setNom] = useState("");
  const [dossier, setDossier] = useState("");
  const [survol, setSurvol] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function choisir(fichiers: FileList | null) {
    const premier = fichiers?.[0];
    if (!premier) return;
    setFichier(premier);
    // Le nom du fichier fait un premier titre acceptable : le laisser vide obligerait
    // à retaper ce qu'on vient de choisir.
    if (!nom.trim()) setNom(premier.name.replace(/\.[^.]+$/, ""));
    setErreur(null);
  }

  function envoyer() {
    if (!fichier) {
      setErreur("Choisissez un fichier.");
      return;
    }

    demarrer(async () => {
      const corps = new FormData();
      corps.append("fichier", fichier);
      corps.append("nom", nom);
      if (dossier) corps.append("dossier", dossier);

      try {
        const reponse = await fetch("/api/documents", { method: "POST", body: corps });
        if (!reponse.ok) {
          const donnees = await reponse.json().catch(() => ({}));
          setErreur((donnees.error as string) ?? "Le dépôt n'a pas abouti.");
          return;
        }
        onDepose();
      } catch {
        setErreur("Le dépôt n'a pas abouti.");
      }
    });
  }

  return (
    <div
      className={styles.voile}
      onClick={(e) => {
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div
        className={styles.fenetre}
        role="dialog"
        aria-modal="true"
        aria-label="Déposer un document"
      >
        <div className={styles.fenetreTete}>
          <h2>Déposer un document</h2>
          <button type="button" className={styles.fermer} onClick={onFermer} aria-label="Fermer">
            <Croix />
          </button>
        </div>

        <div className={styles.fenetreCorps}>
          <label
            className={styles.depotZone + (survol ? " " + styles.depotSurvol : "")}
            htmlFor="fichier"
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              choisir(e.dataTransfer.files);
            }}
          >
            <Televerser />
            <span className={styles.depotTexte}>
              Glissez un fichier ici ou <strong>parcourez</strong>
            </span>
            <span className={styles.depotIndice}>PDF, Word, JPG, PNG. 10 Mo au plus.</span>
            {fichier && <span className={styles.depotFichier}>{fichier.name}</span>}
          </label>
          <input
            id="fichier"
            type="file"
            hidden
            accept=".pdf,.docx,.jpg,.jpeg,.png"
            onChange={(e) => choisir(e.target.files)}
          />

          <div>
            <label className={styles.champLabel} htmlFor="nomDocument">
              Nom du document
            </label>
            <input
              id="nomDocument"
              type="text"
              className={styles.champ}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Bail commercial, ancien Kbis…"
              maxLength={200}
            />
          </div>

          <div>
            <label className={styles.champLabel} htmlFor="societe">
              Société concernée
            </label>
            <select
              id="societe"
              className={styles.champ}
              value={dossier}
              onChange={(e) => setDossier(e.target.value)}
            >
              {/* Sans société, le document rejoint les dépôts personnels : c'est une
                  réponse valable, pas un oubli. */}
              <option value="">Aucune - mes dépôts</option>
              {societes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nom}
                </option>
              ))}
            </select>
          </div>

          {erreur && (
            <p role="alert" className={styles.erreur}>
              {erreur}
            </p>
          )}
        </div>

        <div className={styles.fenetrePied}>
          <button type="button" className={styles.action} onClick={onFermer} disabled={enCours}>
            Annuler
          </button>
          <button
            type="button"
            className={styles.action + " " + styles.actionPrincipale}
            onClick={envoyer}
            disabled={enCours}
          >
            {enCours ? "Dépôt en cours" : "Déposer"}
          </button>
        </div>
      </div>
    </div>
  );
}

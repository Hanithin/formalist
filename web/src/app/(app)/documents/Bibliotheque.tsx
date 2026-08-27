"use client";

import { ChampChoix } from "@/components/formulaire/ChampChoix";
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
  distinguer,
  resoudreRejets,
  SEUIL_RECHERCHE,
  type DocumentRange,
  type GroupeDeDocuments,
} from "@/domain/document/bibliotheque";
import {
  FILTRES_DOCUMENTS,
  filtresUtiles,
  libelleFiltre,
  estStatutsRepris,
} from "@/domain/document/statuts";
import { TITRE_STATUTS_A_JOUR } from "@/domain/modification/formalites";
import { formaterDate } from "@/lib/dates";
import { Apercu } from "./Apercu";
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
  rechercheInitiale = "",
}: {
  documents: DocumentAffiche[];
  societes: SocieteProposee[];
  /*
   * La recherche préremplie, quand on arrive d'ailleurs.
   *
   * La fiche d'une société renvoie ici pour « ouvrir la bibliothèque » : sans cela on
   * atterrit sur la liste entière, et il faut retaper le nom qu'on vient de quitter.
   */
  rechercheInitiale?: string;
}) {
  const router = useRouter();
  const [filtre, setFiltre] = useState("tous");
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [fenetre, setFenetre] = useState(false);
  const [apercu, setApercu] = useState<{ nom: string; fichier: string } | null>(null);
  const [remplacement, setRemplacement] = useState<DocumentRange | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  /*
   * La société du dernier dépôt, pour que son groupe s'ouvre.
   *
   * `undefined` tant que rien n'a été déposé : `null` désigne les dépôts personnels,
   * qui sont un groupe comme un autre.
   */
  const [dernierDepot, setDernierDepot] = useState<number | null | undefined>(undefined);

  const ranges: DocumentRange[] = documents.map((d) => ({
    ...d,
    creeLe: d.creeLe ? new Date(d.creeLe) : null,
  }));

  const resolus = resoudreRejets(ranges);
  const comptes = comptesParFiltre(resolus);
  const retenus = resolus.filter((d) => retenu(d, filtre) && correspond(d, recherche));
  const groupes = distinguer(grouper(retenus));

  // La recherche n'apparaît qu'au-delà de quelques sociétés : un champ vide au-dessus
  // de deux blocs occupe la place sans rien rendre.
  const avecRecherche = nombreDeSocietes(resolus) > SEUIL_RECHERCHE;

  return (
    <>
      <div className={styles.barre}>
        {filtresUtiles(FILTRES_DOCUMENTS, comptes, filtre).map((f) => (
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

      {avis && (
        <div className={styles.avis} role="status">
          <span className={styles.avisPoint} />
          <span className={styles.avisTexte}>{avis}</span>
          <button
            type="button"
            className={styles.avisFermer}
            onClick={() => setAvis(null)}
            aria-label="Fermer ce message"
          >
            <Croix />
          </button>
        </div>
      )}

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
              dernierDepot={dernierDepot}
              lien={societes.find((s) => s.id === groupe.societeId)?.lien ?? null}
              surApercu={setApercu}
              surRemplacement={setRemplacement}
            />
          ))}

          {/*
            La sortie vers les formalités, au bout de la liste.
            
            Un document naît d'une formalité : celui qui ne trouve pas le sien cherche
            le dossier qui devrait le produire, et il n'avait pour cela que la barre de
            gauche. Le pied de liste le dit et y mène.
          */}
          <div className={styles.pied}>
            <span className={styles.piedTexte}>
              Vos documents apparaissent ici au fil de vos formalités.
            </span>
            <Link href="/formalites" className={styles.action}>
              Voir toutes mes formalités
              <Chevron />
            </Link>
          </div>
        </>
      )}

      {fenetre && (
        <FenetreDeDepot
          societes={societes}
          onFermer={() => setFenetre(false)}
          onDepose={(message, societeId) => {
            setFenetre(false);
            setAvis(message);
            setDernierDepot(societeId);
            router.refresh();
          }}
        />
      )}

      {remplacement && (
        <FenetreDeDepot
          societes={societes}
          remplace={remplacement}
          onFermer={() => setRemplacement(null)}
          onDepose={(message, societeId) => {
            setRemplacement(null);
            setAvis(message);
            setDernierDepot(societeId);
            router.refresh();
          }}
        />
      )}

      {apercu && (
        <Apercu nom={apercu.nom} fichier={apercu.fichier} surFermeture={() => setApercu(null)} />
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
  dernierDepot,
  lien,
  surApercu,
  surRemplacement,
}: {
  groupe: GroupeDeDocuments;
  nombreDeGroupes: number;
  recherche: string;
  dernierDepot: number | null | undefined;
  lien: string | null;
  surApercu: (document: { nom: string; fichier: string }) => void;
  surRemplacement: (document: DocumentRange) => void;
}) {
  const defaut = ouvertParDefaut(groupe, nombreDeGroupes, recherche, dernierDepot);
  const [ouvertParLeGeste, setOuvertParLeGeste] = useState<boolean | null>(null);
  const [tout, setTout] = useState(false);

  // Le geste prime sur la règle, mais la règle reprend la main quand la recherche
  // change : ce qu'on vient de demander doit se voir.
  const ouvert = ouvertParLeGeste ?? defaut;
  const { montres, restants } = tronquer(groupe.documents, tout);
  const enAttente = groupe.documents.filter(aRemplacer).length;

  return (
    <section className={styles.groupe + (ouvert ? " " + styles.groupeOuvert : "")}>
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
          {groupe.precision && <span className={styles.groupePrecision}>{groupe.precision}</span>}
          <span className={styles.groupeCompte}>
            {groupe.documents.length} document{groupe.documents.length > 1 ? "s" : ""}
          </span>
          {/* Ce qui bloque un dossier se voit même groupe replié. */}
          {enAttente > 0 && <span className={styles.groupeAttente}>{enAttente} à remplacer</span>}
        </button>

        {/* Cinq actes se téléchargent un par un en cinq allers-retours : l'archive les
            rend d'un coup, nommés. */}
        {groupe.documents.some((d) => d.fichier) && (
          <a
            className={styles.groupeLien}
            href={
              "/api/documents/archive" +
              (groupe.societeId === null ? "" : "?dossier=" + groupe.societeId)
            }
          >
            Tout télécharger
          </a>
        )}

        {lien && (
          <Link className={styles.groupeLien} href={lien}>
            Ouvrir le dossier
          </Link>
        )}
      </div>

      {ouvert && (
        <div className={styles.liste}>
          {montres.map((d) => (
            <Carte
              key={d.id}
              document={d}
              surApercu={surApercu}
              surRemplacement={surRemplacement}
            />
          ))}

          {restants > 0 && (
            <button type="button" className={styles.voirPlus} onClick={() => setTout(true)}>
              Voir les {restants} autres documents
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Carte({
  document,
  surApercu,
  surRemplacement,
}: {
  document: DocumentRange;
  surApercu: (document: { nom: string; fichier: string }) => void;
  surRemplacement: (document: DocumentRange) => void;
}) {
  const attente = aRemplacer(document);
  // Un document refusé porte cette marque plutôt que son statut : c'est ce qu'on
  // doit en retenir.
  /*
   * Les statuts en vigueur sont déposés au greffe, non générés par nous.
   *
   * Ils entrent au dossier comme tout ce que la plateforme y écrit, donc avec l'état
   * « generated », et la pastille les annonçait « Généré le 2 septembre 2022 » : nous
   * n'avons rien rédigé, nous sommes allés chercher au registre un acte que la société
   * a déposé. La pastille le dit dans ses mots - « Déposé au greffe le 2 septembre
   * 2022 » - et la date est celle de ce dépôt.
   */
  const repris = estStatutsRepris(document.nom);
  /*
   * Ce que le cabinet a écrit, une fois relu et remis.
   *
   * Les statuts repris au registre en sont exclus : ils portent le même déposant - la
   * plateforme les a inscrits au dossier - mais ils viennent du greffe, et le dire
   * autrement tromperait le client sur ce qu'il tient.
   */
  const etabliParLAvocat = document.parLeCabinet && !repris;
  const etiquette = attente
    ? "À remplacer"
    : repris
      ? "Repris au registre"
      : (ETIQUETTES[document.statut ?? ""] ?? "Document");

  /*
   * L'acte que l'avocat relit : présent, mais pas encore remis.
   *
   * Il figure ici pour qu'une bibliothèque ne paraisse pas vide après le règlement,
   * en retrait de ce qui est disponible - sans quoi on cliquerait dessus et l'on
   * découvrirait qu'il n'y a rien à ouvrir.
   */
  const chezLAvocat = document.enRelecture;

  return (
    <div
      className={
        styles.carte +
        (attente ? " " + styles.carteAremplacer : "") +
        (chezLAvocat ? " " + styles.carteEnRelecture : "")
      }
    >
      <span className={styles.icone}>{attente ? <Alerte /> : <Feuille />}</span>

      <span className={styles.corps}>
        <span className={styles.nom}>{document.nom}</span>
        <span className={styles.details}>
          {/*
            L'état et la date se rejoignent en une seule pastille - « Généré le 14 août
            2026 » - sauf pour un document refusé : « À remplacer le 14 août » se lisait
            comme une échéance, alors que c'est la date du dépôt refusé. Là, la pastille
            ne porte que la demande, et la date reprend sa place à côté.
          */}
          <span
            className={
              styles.etiquette +
              (attente ? " " + styles.etiquetteAttente : "") +
              (chezLAvocat ? " " + styles.etiquetteRelecture : "")
            }
          >
            {attente
              ? "À remplacer"
              : chezLAvocat
                ? "Chez votre avocat"
                : etabliParLAvocat
                  ? /*
                      Un acte relu et remis vient du cabinet, non d'une machine.
                      
                      « Généré le 24 août 2026 » se lisait comme une sortie
                      d'imprimante : c'est l'avocat qui l'a établi, après relecture, et
                      c'est ce que le client paie.
                    */
                    (document.nom === TITRE_STATUTS_A_JOUR
                      ? "Mis à jour par votre avocat"
                      : "Établi par votre avocat") +
                    (document.creeLe ? " le " + formaterDate(document.creeLe) : "")
                  : repris
                  ? /*
                      La version qui fait foi aujourd'hui au greffe.
                      
                      « Généré le 2 septembre 2022 » nous en attribuait la rédaction ;
                      « Déposé au greffe le 2 septembre 2022 » se lisait comme un dépôt
                      que nous venions de faire. C'est la version en vigueur au greffe,
                      déposée par le client en deux mille vingt-deux.
                    */
                    "Version actuellement au greffe"
                  : etiquette + (document.creeLe ? " le " + formaterDate(document.creeLe) : "")}
          </span>
          {attente && document.creeLe && <span>Déposé le {formaterDate(document.creeLe)}</span>}
          {repris && document.creeLe && (
            <span>vous les avez déposés le {formaterDate(document.creeLe)}</span>
          )}
          {/*
            Le motif du refus se lit à côté du document, et non dans un écran séparé :
            c'est lui qui dit quoi redéposer.
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
          /*
            Le clic ouvre l'aperçu plutôt que de lancer le téléchargement : cinq actes
            portent des noms voisins, et vérifier qu'on tient le bon supposait de
            télécharger, d'ouvrir, puis de jeter le fichier. Le téléchargement reste à
            un clic, dans la fenêtre.
          */
          <button
            type="button"
            className={styles.action + (attente ? "" : " " + styles.actionPrincipale)}
            onClick={() => surApercu({ nom: document.nom, fichier: document.fichier! })}
          >
            Télécharger
          </button>
        ) : chezLAvocat ? (
          // Ce qu'on attend, et de qui : « pas encore de fichier » laisserait croire
          // à un oubli du client.
          <span className={styles.sansFichier}>En relecture</span>
        ) : (
          // Un document attendu mais pas encore fourni : le dire vaut mieux qu'un
          // bouton qui ne mènerait nulle part.
          <span className={styles.sansFichier}>Pas encore de fichier</span>
        )}

        {attente && document.remplacable && (
          <button
            type="button"
            className={styles.action + " " + styles.actionPrincipale}
            onClick={() => surRemplacement(document)}
          >
            Remplacer
          </button>
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

/**
 * Le dépôt d'un document, et son remplacement.
 *
 * Deux gestes, une seule fenêtre : dans les deux cas on choisit un fichier et on
 * l'envoie. Le remplacement s'en distingue par ce qui est déjà décidé - la société et
 * le nom viennent du document refusé, et le fichier part vers la pièce attendue du
 * dossier plutôt qu'au coffre personnel.
 *
 * Le message de retour dit ce qui va se passer ensuite : un document remplacé repart
 * en vérification, et ne pas le dire laisse croire que l'affaire est close.
 */
function FenetreDeDepot({
  societes,
  remplace,
  onFermer,
  onDepose,
}: {
  societes: SocieteProposee[];
  remplace?: DocumentRange;
  onFermer: () => void;
  onDepose: (message: string, societeId: number | null) => void;
}) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [nom, setNom] = useState(remplace?.nom ?? "");
  const [dossier, setDossier] = useState(
    remplace?.societeId !== undefined && remplace?.societeId !== null
      ? String(remplace.societeId)
      : ""
  );
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

      /*
       * Un remplacement répond à une pièce attendue du dossier : il passe par la route
       * des pièces, celle que suit déjà le formulaire de création. Un dépôt libre, lui,
       * rejoint le coffre.
       */
      if (remplace?.type && remplace.societeId !== null) {
        corps.append("dossier", String(remplace.societeId));
        corps.append("piece", remplace.type);
      } else {
        corps.append("nom", nom);
        if (dossier) corps.append("dossier", dossier);
      }

      const adresse = remplace?.type ? "/api/formalites/pieces" : "/api/documents";

      try {
        const reponse = await fetch(adresse, { method: "POST", body: corps });
        if (!reponse.ok) {
          const donnees = await reponse.json().catch(() => ({}));
          setErreur((donnees.error as string) ?? "Le dépôt n'a pas abouti.");
          return;
        }
        onDepose(
          remplace
            ? "Document envoyé. L'avocat le vérifie et vous prévient : il n'y a rien d'autre à faire de votre côté."
            : "Document déposé. Vous le retrouverez dans sa société.",
          // Le groupe qui reçoit s'ouvre : sans quoi l'annonce désigne un document
          // qu'on ne voit pas.
          remplace ? remplace.societeId : dossier ? Number(dossier) : null
        );
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
        aria-label={remplace ? "Remplacer le document" : "Déposer un document"}
      >
        <div className={styles.fenetreTete}>
          <h2>{remplace ? "Remplacer le document" : "Déposer un document"}</h2>
          <button type="button" className={styles.fermer} onClick={onFermer} aria-label="Fermer">
            <Croix />
          </button>
        </div>

        <div className={styles.fenetreCorps}>
          {remplace && (
            <p className={styles.rappel}>
              <strong>{remplace.nom}</strong> a été refusé
              {remplace.motifRejet ? " : " + remplace.motifRejet : ""}. Déposez la nouvelle version
              ci-dessous.
            </p>
          )}

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

          <div hidden={!!remplace}>
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

          <div hidden={!!remplace}>
            <label className={styles.champLabel} htmlFor="societe">
              Société concernée
            </label>
            {/* Sans société, le document rejoint les dépôts personnels : c'est une
                réponse valable, pas un oubli - la liste le dit plutôt que de laisser un
                vide. */}
            <ChampChoix
              id="societe"
              valeur={dossier}
              options={[
                { valeur: "", libelle: "Aucune - mes dépôts" },
                ...societes.map((s) => ({ valeur: String(s.id), libelle: s.nom })),
              ]}
              surChangement={setDossier}
            />
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
            {enCours ? "Envoi en cours" : remplace ? "Envoyer la nouvelle version" : "Déposer"}
          </button>
        </div>
      </div>
    </div>
  );
}

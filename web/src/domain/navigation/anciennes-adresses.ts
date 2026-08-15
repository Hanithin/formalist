/**
 * Correspondance entre les anciennes adresses et les nouvelles.
 *
 * Les adresses en .html sont dans des emails déjà envoyés, des favoris et des
 * liens partagés : elles doivent continuer de fonctionner. Une redirection
 * permanente indique en outre aux moteurs que l'adresse a changé pour de bon.
 *
 * Cette table disparaîtra quand les anciennes adresses ne recevront plus rien.
 */
export const ANCIENNES_ADRESSES: Record<string, string> = {
  "/index.html": "/",
  "/connexion.html": "/connexion",
  "/inscription.html": "/inscription",
  "/contact.html": "/contact",
  "/blog.html": "/blog",
  "/aide.html": "/aide",
  "/dashboard.html": "/tableau-de-bord",
  "/formalites.html": "/formalites",
  "/documents.html": "/documents",
  "/contrats.html": "/contrats",
  "/messagerie.html": "/messagerie",
  "/equipe.html": "/equipe",
  "/parametres.html": "/parametres",
  "/creation.html": "/creation",
  "/modification.html": "/modification",
  "/consultations.html": "/consultations",
  "/avocat.html": "/avocat",
  "/admin.html": "/administration",
  "/sign.html": "/signer",
};

/**
 * La nouvelle adresse d'une ancienne, paramètres compris.
 *
 * Les identifiants passaient par ?id= ; ils s'appellent ?dossier= désormais. Un
 * lien de création reçu par email doit donc continuer d'ouvrir le bon dossier.
 */
export function nouvelleAdresse(chemin: string, parametres: URLSearchParams): string | null {
  const cible = ANCIENNES_ADRESSES[chemin];
  if (!cible) return null;

  const nouveaux = new URLSearchParams();
  for (const [cle, valeur] of parametres) {
    if (cle === "id") nouveaux.set("dossier", valeur);
    else if (cle === "new" || cle === "embed")
      continue; // n'existent plus
    else nouveaux.set(cle, valeur);
  }

  const requete = nouveaux.toString();
  return requete ? cible + "?" + requete : cible;
}

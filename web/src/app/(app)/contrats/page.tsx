import type { Metadata } from "next";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { listerContrats } from "@/infrastructure/db/depots/documents";
import { dateEnTete } from "@/lib/dates";
import { Contrats, type ContratAffiche } from "./Contrats";
import styles from "./Contrats.module.css";

export const metadata: Metadata = {
  title: "Contrats - Formalist",
  robots: { index: false, follow: false },
};

/** Les valeurs saisies sont stockées en JSON ; une colonne illisible ne bloque rien. */
function lireValeurs(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const brut: unknown = JSON.parse(json);
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) return {};
    return Object.fromEntries(
      Object.entries(brut as Record<string, unknown>).map(([cle, valeur]) => [
        cle,
        typeof valeur === "string" || typeof valeur === "number" ? String(valeur) : "",
      ])
    );
  } catch {
    return {};
  }
}

/**
 * Les contrats.
 *
 * Tout est chargé d'un coup : les quatre filtres annoncent chacun leur décompte, et le
 * classement se fait sur place - c'est le choix des autres listes de l'application.
 */
export default async function PageContrats() {
  const utilisateur = await exigerUtilisateur();
  const contrats = await listerContrats(utilisateur);

  const affiches: ContratAffiche[] = contrats.map((c) => ({
    id: c.id,
    titre: c.titre,
    type: c.type,
    status: c.status,
    fichier: c.file_path,
    majLe: c.updated_at ? c.updated_at.toISOString() : null,
    valeurs: lireValeurs(c.data_json),
  }));

  return (
    <main className={styles.page}>
      <div className={styles.topbar}>
        <h1>Contrats</h1>
        <span className={styles.topbarDate}>{dateEnTete()}</span>
      </div>
      <p className={styles.introduction}>
        Vos contrats, de la rédaction à la signature. Vous remplissez quelques informations, un
        avocat relit, et vous signez.
      </p>

      <div className={styles.content}>
        <Contrats contrats={affiches} />
      </div>
    </main>
  );
}

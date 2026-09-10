import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Dancing_Script, Great_Vibes } from "next/font/google";
import { ouvrirLienDeSignature } from "@/infrastructure/db/depots/signatures";
import { ZoneDeSignature } from "./ZoneDeSignature";
import styles from "./Signature.module.css";

/*
 * Deux écritures manuscrites, et pas davantage.
 *
 * Elles ne servent qu'à cet écran : les charger dans la mise en page générale ferait
 * porter deux polices à toute l'application pour un usage d'une page. Toutes deux sont
 * sous licence ouverte - une signature électronique n'est pas l'endroit où l'on
 * découvre qu'une police n'était pas cessible.
 *
 * Le nom de famille généré part au composant client : il sert autant à l'aperçu qu'au
 * canevas qui en tire le PNG, et les deux doivent parler de la même police.
 */
const dancing = Dancing_Script({ subsets: ["latin"], weight: ["600"] });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "Signer les statuts - Formalist",
  // Un lien de signature n'a rien à faire dans un index de moteur.
  robots: { index: false, follow: false },
};

export default async function Signer({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const demande = await ouvrirLienDeSignature(jeton);

  // Jeton inconnu : 404, sans dire s'il a existé.
  if (!demande) notFound();

  if (demande.dejaSignee) {
    return (
      <main className={styles.page}>
        <h1>Vous avez déjà signé</h1>
        <p>
          Votre signature pour {demande.societe} a bien été enregistrée. Vous pouvez fermer cette
          page.
        </p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <h1>Signer les statuts</h1>
      <p>
        {demande.nom}, vous êtes appelé à signer les statuts de {demande.societe}
        {demande.forme ? " (" + demande.forme + ")" : ""}.
      </p>

      <ZoneDeSignature
        jeton={jeton}
        nom={demande.nom ?? ""}
        polices={[
          { cle: "dancing", nom: "Dancing Script", famille: dancing.style.fontFamily },
          { cle: "great-vibes", nom: "Great Vibes", famille: greatVibes.style.fontFamily },
        ]}
      />
    </main>
  );
}

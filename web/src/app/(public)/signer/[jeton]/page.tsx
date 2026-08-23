import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ouvrirLienDeSignature } from "@/infrastructure/db/depots/signatures";
import { ZoneDeSignature } from "./ZoneDeSignature";
import styles from "./Signature.module.css";

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

      <ZoneDeSignature jeton={jeton} />
    </main>
  );
}

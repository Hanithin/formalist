import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { Recherche } from "./Recherche";

export const metadata: Metadata = {
  title: "Recherche d'entreprise - Formalist",
  robots: { index: false, follow: false },
};

export default async function RechercheEntreprise() {
  const utilisateur = await exigerUtilisateur();

  // Réservé à l'espace avocat : c'est un outil de travail sur les dossiers, et
  // il consomme notre quota au registre national.
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) notFound();

  return (
    <main>
      <p>Espace avocat</p>
      <h1>Recherche d&apos;entreprise</h1>
      <p>
        Consultez le registre national des entreprises à partir d&apos;un numéro SIREN.
      </p>

      <Recherche />
    </main>
  );
}

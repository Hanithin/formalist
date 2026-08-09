import type { Metadata } from "next";
import { FormulaireContact } from "./FormulaireContact";
import { adresseAbsolue } from "@/lib/site";

export const metadata: Metadata = {
  title: "Nous contacter - Formalist",
  description:
    "Une question sur la création ou la modification de votre société ? Nous répondons sous 24 heures ouvrées.",
  alternates: { canonical: adresseAbsolue("/contact") },
};

export default function Contact() {
  return (
    <main>
      <h1>Nous contacter</h1>
      <p>Une question sur votre société ? Nous répondons sous 24 heures ouvrées.</p>
      <FormulaireContact />
    </main>
  );
}

import type { Metadata } from "next";
import { prisma } from "@/infrastructure/db/client";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { FormulaireProfil } from "./FormulaireProfil";
import { FormulaireMotDePasse } from "./FormulaireMotDePasse";
import { Deconnexion } from "./Deconnexion";

export const metadata: Metadata = {
  title: "Paramètres - Formalist",
  robots: { index: false, follow: false },
};

export default async function Parametres() {
  const utilisateur = await exigerUtilisateur();
  const compte = await prisma.users.findUniqueOrThrow({
    where: { id: utilisateur.id },
    select: { first_name: true, last_name: true, name: true, email: true },
  });

  // Les comptes anciens n'ont que le nom complet : on le découpe pour l'affichage.
  const morceaux = (compte.name ?? "").split(/\s+/);
  const prenom = compte.first_name ?? morceaux[0] ?? "";
  const nom = compte.last_name ?? morceaux.slice(1).join(" ");

  return (
    <main>
      <h1>Paramètres</h1>

      <section>
        <h2>Vos informations</h2>
        <FormulaireProfil prenom={prenom} nom={nom} email={compte.email} />
      </section>

      <section>
        <h2>Mot de passe</h2>
        <FormulaireMotDePasse />
      </section>

      <section>
        <h2>Session</h2>
        <Deconnexion />
      </section>
    </main>
  );
}

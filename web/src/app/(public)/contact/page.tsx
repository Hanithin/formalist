import type { Metadata } from "next";
import { FormulaireContact } from "./FormulaireContact";
import { adresseAbsolue } from "@/lib/site";
import styles from "./Contact.module.css";

export const metadata: Metadata = {
  title: "Nous contacter - Formalist",
  description:
    "Une question sur la création ou la modification de votre société ? Nous répondons sous 24 heures ouvrées.",
  alternates: { canonical: adresseAbsolue("/contact") },
};

export default function Contact() {
  return (
    <main className={styles.disposition}>
      <div className={styles.formulaire}>
        <h1>Nous contacter</h1>
        <p>Une question sur votre société ? Nous répondons sous 24 heures ouvrées.</p>
        <FormulaireContact />
      </div>

      <aside className={styles.reponses}>
        <h2>Quelques réponses tout de suite</h2>
        <dl>
          <div>
            <dt>Combien de temps prend une création ?</dt>
            <dd>
              Les documents sont prêts en quelques minutes. L&apos;immatriculation dépend ensuite du
              greffe, comptez une à trois semaines.
            </dd>
          </div>
          <div>
            <dt>Puis-je changer d&apos;avis après avoir commencé ?</dt>
            <dd>
              Votre dossier est enregistré au fil de la saisie : vous le reprenez quand vous voulez,
              depuis n&apos;importe quel appareil.
            </dd>
          </div>
          <div>
            <dt>Qui relit mes statuts ?</dt>
            <dd>
              Un avocat, avant tout dépôt. C&apos;est ce qui distingue Formalist d&apos;un simple
              générateur de documents.
            </dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}

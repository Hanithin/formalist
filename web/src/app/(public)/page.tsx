import type { Metadata } from "next";
import Link from "next/link";
import { adresseAbsolue, ADRESSE_SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Formalist - créez et modifiez votre société, accompagné par des avocats",
  description:
    "SASU, SAS, SARL, SCI, EURL : statuts sur-mesure en 5 minutes, vérifiés par un avocat, signature électronique eIDAS. Modification et fermeture également prises en charge.",
  alternates: { canonical: adresseAbsolue("/") },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "Formalist",
    url: ADRESSE_SITE,
    title: "Formalist - créez et modifiez votre société, accompagné par des avocats",
    description:
      "Statuts sur-mesure en 5 minutes, vérifiés par un avocat, signature électronique eIDAS.",
  },
};

/** Ce que fait l'entreprise, sous une forme qu'un moteur comprend sans deviner. */
const ORGANISATION = {
  "@context": "https://schema.org",
  "@type": "LegalService",
  name: "Formalist",
  description:
    "Création, modification et fermeture de sociétés, avec des documents vérifiés par des avocats.",
  url: ADRESSE_SITE,
  areaServed: { "@type": "Country", name: "France" },
  availableLanguage: "fr",
};

const PRESTATIONS = [
  {
    titre: "Création de société",
    texte: "SASU, SAS, SARL, SCI, EURL. Statuts sur-mesure, vérifiés avant dépôt.",
    lien: "/connexion",
  },
  {
    titre: "Modification de société",
    texte: "Changement de siège, d'objet social, de dirigeant.",
    lien: "/connexion",
  },
  {
    titre: "Fermeture de société",
    texte: "Dissolution, liquidation, radiation - tout est géré.",
    lien: "/connexion",
  },
  {
    titre: "Contrats",
    texte: "NDA, CGV, CGU, prestation. Personnalisés et conformes.",
    lien: "/connexion",
  },
];

const ETAPES = [
  { titre: "Répondez à 5 questions", texte: "Le formulaire s'adapte à votre situation." },
  { titre: "Un avocat valide vos documents", texte: "Chaque clause est relue avant dépôt." },
  { titre: "Signez et lancez-vous", texte: "Signature électronique eIDAS, dépôt au greffe." },
];

export default function Accueil() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANISATION) }}
      />

      <section>
        <p>Plateforme de formalités juridiques nouvelle génération</p>
        <h1>Créez votre société, accompagné par des avocats</h1>
        <p>
          Statuts sur-mesure en quelques minutes, chaque clause vérifiée par un avocat, signature
          électronique et dépôt au greffe.
        </p>
        <Link href="/connexion">Commencer</Link>
        <p>Sans engagement · Documents en 5 minutes · Validé par des avocats</p>
      </section>

      <section>
        <h2>Ce que nous prenons en charge</h2>
        <ul>
          {PRESTATIONS.map((p) => (
            <li key={p.titre}>
              <h3>{p.titre}</h3>
              <p>{p.texte}</p>
              <Link href={p.lien}>Commencer</Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>De zéro à immatriculé en 3 étapes</h2>
        <ol>
          {ETAPES.map((e) => (
            <li key={e.titre}>
              <h3>{e.titre}</h3>
              <p>{e.texte}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Une question avant de vous lancer ?</h2>
        <p>
          <Link href="/contact">Écrivez-nous</Link>, nous répondons sous 24 heures ouvrées. Vous
          pouvez aussi <Link href="/blog">lire le blog</Link>.
        </p>
      </section>
    </main>
  );
}

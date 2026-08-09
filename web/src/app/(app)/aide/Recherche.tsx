"use client";

import { useMemo, useState, useId } from "react";

interface Section {
  titre: string;
  questions: { question: string; reponse: string }[];
}

/** Comparaison indifférente aux accents : « societe » doit trouver « société ». */
function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function Recherche({ sections }: { sections: Section[] }) {
  const [terme, setTerme] = useState("");
  const idChamp = useId();

  const resultats = useMemo(() => {
    const q = normaliser(terme.trim());
    if (!q) return sections;

    return sections
      .map((s) => ({
        ...s,
        questions: s.questions.filter(
          (x) => normaliser(x.question).includes(q) || normaliser(x.reponse).includes(q)
        ),
      }))
      .filter((s) => s.questions.length > 0);
  }, [terme, sections]);

  const total = resultats.reduce((n, s) => n + s.questions.length, 0);

  return (
    <>
      <label htmlFor={idChamp}>Rechercher une question</label>
      <input
        id={idChamp}
        type="search"
        value={terme}
        onChange={(e) => setTerme(e.target.value)}
        placeholder="Statuts, capital, facturation…"
      />

      <p role="status" aria-live="polite">
        {total === 0
          ? "Aucune question ne correspond"
          : total === 1
            ? "1 question"
            : total + " questions"}
      </p>

      {resultats.map((section) => (
        <section key={section.titre}>
          <h2>{section.titre}</h2>
          {section.questions.map((x) => (
            <details key={x.question}>
              <summary>{x.question}</summary>
              <p>{x.reponse}</p>
            </details>
          ))}
        </section>
      ))}
    </>
  );
}

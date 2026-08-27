"use client";

import { useState } from "react";

/**
 * Un champ de nombre, sans compteur.
 *
 * `type="number"` semble tout indiqué, et pose trois problèmes dans un formulaire
 * juridique. Ses flèches occupent la moitié d'un champ étroit et se placent devant le
 * chiffre qu'on vient de taper. La molette de la souris les actionne au passage : on
 * fait défiler la page, le curseur traverse un champ, et un capital passe de 10 000 à
 * 10 001 sans que personne ne le voie. Et il accepte le signe moins - il n'existe pas
 * de capital négatif, ni de nombre de parts négatif.
 *
 * Ici on ne saisit que des chiffres. `inputMode="numeric"` fait apparaître le pavé
 * numérique sur un téléphone, ce qui est le seul avantage du champ natif qu'on veuille
 * garder.
 *
 * La valeur remontée est un nombre, ou la chaîne vide quand le champ est effacé : un
 * champ vidé doit pouvoir l'être, et ne pas se remplir d'un zéro.
 */

interface Props {
  id: string;
  valeur: number | string | undefined;
  surChangement: (valeur: number | "") => void;
  /**
   * Deux décimales pour un montant, aucune pour un nombre de parts.
   *
   * Sans valeur par défaut, et c'est voulu : elle était à `false`, et quatre champs
   * libellés « en euros » - le capital d'une fermeture, celui d'un dépôt de comptes,
   * les postes d'affectation, le montant d'une convention - refusaient donc la virgule.
   * On tapait « 55950 » sans pouvoir écrire les centimes. Un défaut tranchait à la
   * place de qui écrit le champ ; le compilateur le lui demande maintenant.
   */
  decimales: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

/** Ce qu'on garde de la frappe : des chiffres, et une virgule si les décimales sont admises. */
function filtrer(saisi: string, decimales: boolean): string {
  const permis = decimales ? saisi.replace(/[^0-9.,]/g, "") : saisi.replace(/[^0-9]/g, "");
  if (!decimales) return permis;

  // Une seule séparation décimale, et le point vaut la virgule.
  const normalise = permis.replace(/,/g, ".");
  const [entier, ...suite] = normalise.split(".");
  return suite.length > 0 ? entier + "." + suite.join("").slice(0, 2) : entier;
}

export function ChampNombre({
  id,
  valeur,
  surChangement,
  decimales,
  placeholder,
  className,
  ...reste
}: Props) {
  /*
   * La frappe en cours, et la valeur retenue.
   *
   * « 10. » n'est pas un nombre mais c'est une frappe légitime en route vers « 10.5 » :
   * la convertir à chaque touche effacerait le point.
   */
  const retenue = valeur === undefined || valeur === "" ? "" : String(valeur);
  const [frappe, setFrappe] = useState<{ pour: string; texte: string } | null>(null);
  const affiche = frappe?.pour === retenue ? frappe.texte : retenue;

  return (
    <input
      id={id}
      className={className}
      type="text"
      inputMode={decimales ? "decimal" : "numeric"}
      autoComplete="off"
      placeholder={placeholder}
      value={affiche}
      aria-label={reste["aria-label"]}
      aria-invalid={reste["aria-invalid"]}
      onChange={(e) => {
        const texte = filtrer(e.target.value, decimales);
        setFrappe({ pour: retenue, texte });

        if (texte === "") {
          surChangement("");
          return;
        }
        const lu = Number(texte);
        if (Number.isFinite(lu)) surChangement(lu);
      }}
    />
  );
}

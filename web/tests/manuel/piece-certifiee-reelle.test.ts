import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { it } from "vitest";
import sharp from "sharp";
import {
  certifier,
  enPageDePdf,
  pieceIdentiteCertifiee,
} from "@/infrastructure/documents/piece-certifiee";

/** Une signature figurée, pour juger du cadrage sans en emprunter une vraie. */
async function traceFigure(): Promise<string> {
  const png = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="150">
         <path d="M20 110 C 70 20, 110 140, 160 70 S 250 10, 300 90 S 380 60, 405 40"
               fill="none" stroke="#1a2c6b" stroke-width="9" stroke-linecap="round"/>
       </svg>`
    )
  )
    .png()
    .toBuffer();
  return "data:image/png;base64," + png.toString("base64");
}

/**
 * La mention de conformité posée sur une vraie pièce du dépôt local.
 *
 * Les tests de la suite éprouvent le placement en lisant le flux de contenu du PDF ;
 * ils ne disent pas si le cadre tombe bien sur le document - s'il couvre une
 * photographie, s'il déborde d'un scan cadré de travers. Cela se regarde, et c'est ce
 * que ce fichier permet : il compose la pièce d'un dossier réel et écrit le résultat
 * dans un fichier qu'on ouvre.
 *
 * Hors de la suite : il lit la base et le dépôt de la machine.
 *
 *   DOSSIER=49258 npx vitest run --config vitest.manuel.config.ts \
 *     tests/manuel/piece-certifiee-reelle.test.ts
 */

it("compose la pièce certifiée d'un fichier du dépôt", async () => {
  /*
   * Un fichier plutôt qu'un dossier, quand on veut seulement voir le tampon.
   *
   * Un dossier n'est composable que s'il porte à la fois une pièce et une signature
   * recueillie, ce qui est rare sur une base de développement. Le cadrage, lui, se
   * regarde sur n'importe quelle pièce : la signature est alors figurée.
   */
  const fichier = process.env.FICHIER;
  if (fichier) {
    const contenu = await readFile(fichier);
    const document = await enPageDePdf(contenu, path.extname(fichier).toLowerCase());
    const pdf = await certifier(document, { trace: await traceFigure(), le: new Date() });

    const sortie = path.join(os.tmpdir(), "certifiee-" + path.basename(fichier) + ".pdf");
    await writeFile(sortie, pdf);
    console.log("\n══════ " + Math.round(pdf.length / 1024) + " Ko écrits dans " + sortie);
    return;
  }

  const dossier = Number(process.env.DOSSIER);
  if (!Number.isInteger(dossier) || dossier <= 0) {
    console.log("Indiquez le dossier : DOSSIER=49258 npx vitest run …");
    return;
  }

  const pdf = await pieceIdentiteCertifiee(dossier);
  if (!pdf) {
    console.log(
      "Rien à composer sur le dossier " +
        dossier +
        " : pas de pièce d'identité au dossier, ou aucune signature recueillie."
    );
    return;
  }

  const sortie = path.join(os.tmpdir(), "piece-certifiee-" + dossier + ".pdf");
  await writeFile(sortie, pdf);
  console.log("\n══════ " + Math.round(pdf.length / 1024) + " Ko écrits dans " + sortie);
}, 60_000);

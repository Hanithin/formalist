import { it } from "vitest";
import sharp from "sharp";
import { lireLaPieceDIdentite } from "@/infrastructure/ia/lecture-identite";
import { controler } from "@/domain/formalite/controle-identite";
import { mesurerLaPiece, enJpegPourLecture } from "@/infrastructure/documents/mesures-image";

/**
 * Ce que le modèle lit vraiment d'une pièce, et ce qu'on en conclut.
 *
 * Hors de la suite : il appelle un service tiers et coûte un appel par cas. Il ne
 * contient presque aucune assertion, et c'est voulu - ce qu'on vient vérifier ici n'est
 * pas qu'une fonction rend la bonne valeur, mais que la transcription de la zone lisible
 * par machine tient la route sur une image dégradée, et que les constats disent quelque
 * chose d'utile. Cela se lit.
 *
 *   npx vitest run --config vitest.manuel.config.ts tests/manuel/lecture-identite.test.ts
 *
 * Aucune carte réelle n'entre dans le dépôt : les images sont composées, avec des zones
 * lisibles par machine aux clés de contrôle justes. C'est ce qui permet de savoir si la
 * lecture s'est trompée - une transcription fautive ne tombe pas sur la bonne clé.
 */

/** Carte au format actuel, valable jusqu'au 2 septembre 2031. */
const MRZ_VALABLE = [
  "IDFRAD1X9F2A812<<<<<<<<<<<<<<<",
  "9003141M3109029FRA<<<<<<<<<<<8",
  "MARTIN<<PAUL<<<<<<<<<<<<<<<<<<",
];

/** La même, périmée le 5 janvier 2019. */
const MRZ_PERIMEE = [
  "IDFRAD1X9F2A812<<<<<<<<<<<<<<<",
  "9003141M1901056FRA<<<<<<<<<<<0",
  "MARTIN<<PAUL<<<<<<<<<<<<<<<<<<",
];

/**
 * Une image qui ressemble à une carte d'identité, sans en être une.
 *
 * Le rendu reprend ce qui compte pour la lecture : l'en-tête, les champs nommés, la
 * photographie en réserve, et la zone lisible par machine en bas, dans une graphie à
 * chasse fixe.
 */
async function carte(options: {
  mrz: string[];
  validite: string;
  delivrance: string;
}): Promise<Buffer> {
  /* Les chevrons de la zone lisible par machine sont aussi ceux de XML : on les échappe. */
  const lignes = options.mrz
    .map(
      (ligne, i) =>
        `<text x="40" y="${470 + i * 30}" font-size="26" font-family="Courier" ` +
        `fill="#111">${ligne.replace(/</g, "&lt;")}</text>`
    )
    .join("");

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1010" height="560">
       <rect width="1010" height="560" fill="#e8e6dd"/>
       <text x="40" y="60" font-size="26" font-family="Helvetica" fill="#1b3a6b">REPUBLIQUE FRANCAISE</text>
       <text x="40" y="100" font-size="22" font-family="Helvetica" fill="#333">CARTE NATIONALE D'IDENTITE</text>
       <rect x="40" y="130" width="200" height="250" fill="#c9c6ba"/>
       <text x="270" y="165" font-size="16" font-family="Helvetica" fill="#666">NOM</text>
       <text x="270" y="195" font-size="26" font-family="Helvetica" fill="#111">MARTIN</text>
       <text x="270" y="235" font-size="16" font-family="Helvetica" fill="#666">PRENOM(S)</text>
       <text x="270" y="265" font-size="26" font-family="Helvetica" fill="#111">PAUL</text>
       <text x="270" y="305" font-size="16" font-family="Helvetica" fill="#666">NE(E) LE</text>
       <text x="270" y="333" font-size="24" font-family="Helvetica" fill="#111">14.03.1990</text>
       <text x="620" y="165" font-size="16" font-family="Helvetica" fill="#666">DELIVREE LE</text>
       <text x="620" y="193" font-size="24" font-family="Helvetica" fill="#111">${options.delivrance}</text>
       <text x="620" y="235" font-size="16" font-family="Helvetica" fill="#666">VALABLE JUSQU'AU</text>
       <text x="620" y="263" font-size="24" font-family="Helvetica" fill="#111">${options.validite}</text>
       ${lignes}
     </svg>`
  );

  return sharp(svg).jpeg({ quality: 92 }).toBuffer();
}

const CAS: { titre: string; image: () => Promise<Buffer> }[] = [
  {
    titre: "carte valable, bien cadrée",
    image: () => carte({ mrz: MRZ_VALABLE, validite: "02.09.2031", delivrance: "02.09.2021" }),
  },
  {
    titre: "carte périmée",
    image: () => carte({ mrz: MRZ_PERIMEE, validite: "05.01.2019", delivrance: "05.01.2009" }),
  },
  {
    titre: "carte floue",
    image: async () =>
      sharp(
        await carte({ mrz: MRZ_VALABLE, validite: "02.09.2031", delivrance: "02.09.2021" })
      )
        .blur(4)
        .jpeg({ quality: 90 })
        .toBuffer(),
  },
  {
    titre: "carte rognée : la zone lisible par machine sort du cadre",
    image: async () =>
      sharp(await carte({ mrz: MRZ_VALABLE, validite: "02.09.2031", delivrance: "02.09.2021" }))
        .extract({ left: 0, top: 0, width: 1010, height: 430 })
        .jpeg({ quality: 92 })
        .toBuffer(),
  },
  {
    titre: "ce n'est pas une pièce d'identité",
    image: async () =>
      sharp(
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="640">
             <rect width="1000" height="640" fill="#fff"/>
             <text x="60" y="120" font-size="34" font-family="Helvetica">FACTURE D'ELECTRICITE</text>
             <text x="60" y="190" font-size="24" font-family="Helvetica">Client : Paul MARTIN</text>
             <text x="60" y="240" font-size="24" font-family="Helvetica">Montant : 84,20 EUR</text>
           </svg>`
        )
      )
        .jpeg({ quality: 92 })
        .toBuffer(),
  },
];

it("lit chaque pièce et rend son verdict", async () => {
  for (const cas of CAS) {
    const entete = "\n══════ " + cas.titre + " ";
    try {
      const image = await cas.image();
      const mesures = await mesurerLaPiece(image, ".jpg");
      const lecture = await lireLaPieceDIdentite(await enJpegPourLecture(image), {
        estUnPdf: false,
      });
      const controle = controler({ lecture, mesures, nomAttendu: "Martin" });

      console.log(
        entete +
          "\nmesures  : côté " +
          mesures.cote +
          ", netteté " +
          mesures.nettete?.toFixed(1) +
          ", luminance " +
          mesures.luminance?.toFixed(0) +
          "\nlecture  : " +
          JSON.stringify({
            type: lecture.type,
            mrz: lecture.mrz,
            validite: lecture.finDeValidite,
            bordsCoupes: lecture.bordsCoupes,
            illisibles: lecture.champsIllisibles,
          }) +
          "\nverdict  : " +
          controle.gravite +
          " - " +
          controle.resume +
          (controle.constats.length > 1
            ? "\nconstats : " + controle.constats.map((c) => c.code).join(", ")
            : "")
      );
    } catch (e) {
      /* Un cas qui échoue n'arrête pas les autres : on vient voir ce que rendent les suivants. */
      console.log(entete + "- ÉCHEC : " + (e as Error).message);
    }
  }
}, 180_000);

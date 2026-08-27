import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const session = JSON.parse(readFileSync("./tests/parcours/session.json", "utf8"));
const cookie = session.cookies.map(c => c.name + "=" + c.value).join("; ");
const B = "http://localhost:3000";
const ouvrir = await fetch(B + "/api/formalites/modification", { method: "POST", headers: { cookie } });
const { dossier } = await ouvrir.json();
await fetch(B + "/api/formalites/modification", {
  method: "PUT", headers: { cookie, "Content-Type": "application/json" },
  body: JSON.stringify({ dossier,
    societe: { denomination: "ESSAI MESURE", forme: "SAS", siren: "552100554", adresse: "34 rue Laugier", codePostal: "75017", ville: "Paris", capital: 10000 },
    codes: ["transfert_siege"],
    valeurs: { nouvelleAdresse: "5 avenue Victor Hugo", nouvelleVille: "Lyon", nouveauCodePostal: "69003", dateEffetTransfert: "2026-09-15" } }),
});
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, storageState: "./tests/parcours/session.json" });
const page = await ctx.newPage();
await page.goto(B + "/modification?dossier=" + dossier + "&etape=7", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const y = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(e => /Régler et confier/.test(e.textContent||""));
  return b ? Math.round(b.getBoundingClientRect().top) : null;
});
console.log("dossier", dossier, "| haut du bouton :", y, "px (fenêtre 1000)");
await nav.close();

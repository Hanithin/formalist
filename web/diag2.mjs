import { chromium } from "playwright";
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, storageState: "./tests/parcours/session.json" });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/cessation", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const b = page.getByRole("button", { name: /Fermer définitivement/ });
console.log("bouton présent :", await b.count());
if (await b.count()) { await b.click(); await page.waitForTimeout(2500); }
console.log("URL :", page.url());
const t = await page.locator("body").innerText();
console.log("montants vus :", [...t.matchAll(/\d+[,.]\d{2}\s*€/g)].map(m=>m[0]).join(" | ") || "aucun");
console.log("gratuite :", /ni annonce légale, ni frais de greffe/.test(t));
console.log("extrait :", t.split("\n").filter(Boolean).slice(0, 12).join(" / "));
await nav.close();

const fs = require("fs");
const PizZip = require("pizzip");
const { DOMParser } = require("@xmldom/xmldom");

const files = [
  "/Users/hanithing/Downloads/SCI (plusieurs associés)/1 - Statuts et état des actes - SCI.docx",
  "/Users/hanithing/Downloads/SCI (plusieurs associés)/2 - PV nomination du gérant SCI.docx",
  "/Users/hanithing/Downloads/SCI (plusieurs associés)/3 - Déclaration de non comdamnation - SCI FORMALIST.docx",
  "/Users/hanithing/Downloads/SCI (plusieurs associés)/5 - Attestation domicile personnel - SCI FORMALIST.docx",
];

function getTextNodes(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");
  const texts = [];
  function walk(node) {
    if (node.localName === "t" && node.namespaceURI && node.namespaceURI.includes("wordprocessingml")) {
      texts.push(node.textContent);
    }
    if (node.childNodes) {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
      }
    }
  }
  walk(doc);
  return texts;
}

for (const filePath of files) {
  const shortName = filePath.split("/").pop();
  console.log("\n" + "=".repeat(80));
  console.log("FILE: " + shortName);
  console.log("=".repeat(80));

  const content = fs.readFileSync(filePath);
  const zip = new PizZip(content);
  const xml = zip.file("word/document.xml").asText();
  const textNodes = getTextNodes(xml);

  console.log(`Total text nodes: ${textNodes.length}`);
  console.log("-".repeat(80));

  const limit = Math.min(200, textNodes.length);
  for (let i = 0; i < limit; i++) {
    console.log(`[${i}] "${textNodes[i]}"`);
  }

  if (textNodes.length > 200) {
    console.log(`\n... (${textNodes.length - 200} more text nodes not shown)`);
  }
}

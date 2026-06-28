var PizZip = require("pizzip");
var fs = require("fs");
var buf = fs.readFileSync("templates/sasu-statuts.docx");
var zip = new PizZip(buf);
var xml = zip.file("word/document.xml").asText();

var identTextPos = xml.indexOf('{{CIVILITE}} {{NOM}} {{PRENOM}}');
console.log("identTextPos:", identTextPos);
if (identTextPos >= 0) {
  // Method 1: lastIndexOf exact <w:p>
  var m1 = xml.lastIndexOf('<w:p>', identTextPos);
  console.log("lastIndexOf '<w:p>':", m1, "text:", xml.substring(m1, m1+30));

  // Method 2: scan back for <w:p
  var m2 = identTextPos;
  while (m2 > 0 && xml.substring(m2, m2 + 4) !== '<w:p') m2--;
  console.log("scan back '<w:p':", m2, "text:", xml.substring(m2, m2+30));

  // What's between m2 and identTextPos?
  var between = xml.substring(m2, identTextPos);
  var innerP = (between.match(/<w:p[ >]/g) || []).length;
  console.log("Inner <w:p> count:", innerP, "(should be 1)");

  // Find proper paragraph start using <w:pPr> - go back and find the first <w:p that contains this text
  // Actually just show context
  console.log("\nContext 200 chars before identTextPos:");
  console.log(xml.substring(identTextPos - 200, identTextPos));
}

var PizZip = require("pizzip");
var fs = require("fs");
var buf = fs.readFileSync("templates/sas-statuts.docx");
var zip = new PizZip(buf);
var xml = zip.file("word/document.xml").asText();

// Concatenate all text content like docxtemplater does (from consecutive w:t in same w:p)
// Look for the pattern around {{NOM_ that docxtemplater complains about
var fullText = "";
xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { fullText += t; });

// Find any place where {{ appears without matching }}
var idx = 0;
while (true) {
  var open = fullText.indexOf("{{", idx);
  if (open < 0) break;
  var nextClose = fullText.indexOf("}}", open);
  var nextOpen = fullText.indexOf("{{", open + 2);
  if (nextOpen >= 0 && nextOpen < nextClose) {
    console.log("NESTED TAG at pos " + open + ":");
    console.log("  Context: [" + fullText.substring(Math.max(0, open - 20), open + 60) + "]");
  }
  idx = open + 2;
}
console.log("Done");

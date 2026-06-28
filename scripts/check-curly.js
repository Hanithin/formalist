var PizZip = require("pizzip");
var fs = require("fs");
var buf = fs.readFileSync("templates/sas-statuts.docx");
var zip = new PizZip(buf);
var xml = zip.file("word/document.xml").asText();

// Find ALL { and } in the XML (not just in <w:t>)
// and check if they're outside of <w:t> tags
var inTag = false;
var pos = 0;
for (var i = 0; i < xml.length; i++) {
  if (xml.substring(i, i+5) === "<w:t>" || xml.substring(i, i+4) === "<w:t ") {
    inTag = true;
  }
  if (xml.substring(i, i+6) === "</w:t>") {
    inTag = false;
  }
  if (!inTag && (xml[i] === '{' || xml[i] === '}')) {
    // Check if it's inside an XML tag attribute
    var lastLT = xml.lastIndexOf('<', i);
    var lastGT = xml.lastIndexOf('>', i);
    var insideXmlTag = lastLT > lastGT;
    if (!insideXmlTag) {
      console.log("OUTSIDE w:t at pos " + i + ": '" + xml[i] + "' context: [" + xml.substring(Math.max(0,i-30), i+30) + "]");
    }
  }
}
console.log("Done");

var PizZip = require("pizzip");
var fs = require("fs");
var buf = fs.readFileSync("templates/sas-statuts.docx");
var zip = new PizZip(buf);
var xml = zip.file("word/document.xml").asText();
var allTexts = [];
xml.replace(/<w:t[^>]*>([^<]*)<\/w:t>/g, function(m, t) { allTexts.push(t); });
allTexts.forEach(function(t, i) {
  var opens = (t.match(/\{\{/g) || []).length;
  var closes = (t.match(/\}\}/g) || []).length;
  if (opens != closes) console.log("UNBALANCED " + i + ": opens=" + opens + " closes=" + closes + " [" + t.substring(0,100) + "]");
  var stripped = t.replace(/\{\{/g, "").replace(/\}\}/g, "");
  if (stripped.indexOf("{") >= 0) console.log("LONE_OPEN " + i + ": [" + t.substring(0,100) + "]");
  if (stripped.indexOf("}") >= 0) console.log("LONE_CLOSE " + i + ": [" + t.substring(0,100) + "]");
});
console.log("Total text nodes:", allTexts.length);

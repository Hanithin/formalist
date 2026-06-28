var PizZip = require("pizzip");
var fs = require("fs");
var buf = fs.readFileSync("templates/sas-statuts.docx");
var zip = new PizZip(buf);
var xml = zip.file("word/document.xml").asText();

// Find {{NOM_ in the XML and show surrounding context
var idx = xml.indexOf("{{NOM_");
if (idx >= 0) {
  console.log("=== Context around first {{NOM_ ===");
  console.log(xml.substring(Math.max(0, idx - 300), idx + 300));
}

// Also find all places where a <w:t> ends with partial {{
var re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
var m;
while ((m = re.exec(xml)) !== null) {
  var text = m[1];
  // Check if text ends with a partial tag (has {{ without matching }})
  if (text.match(/\{\{[^}]*$/)) {
    console.log("\n=== PARTIAL OPEN at pos " + m.index + " ===");
    console.log("Text: [" + text + "]");
    console.log("Context after: " + xml.substring(m.index + m[0].length, m.index + m[0].length + 200));
  }
  // Check if text starts with partial close (}} without matching {{)
  if (text.match(/^[^{]*\}\}/)) {
    var opens = (text.match(/\{\{/g) || []).length;
    var closes = (text.match(/\}\}/g) || []).length;
    if (closes > opens) {
      console.log("\n=== PARTIAL CLOSE at pos " + m.index + " ===");
      console.log("Text: [" + text + "]");
    }
  }
}

var PizZip = require("pizzip");
var Docxtemplater = require("docxtemplater");
var fs = require("fs");
var buf = fs.readFileSync("templates/sas-statuts.docx");
var zip = new PizZip(buf);
try {
  var doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render({});
  console.log("OK");
} catch(e) {
  if (e.properties && e.properties.errors) {
    e.properties.errors.slice(0, 5).forEach(function(err) {
      console.log("ERROR:", err.properties.id);
      console.log("  tag:", JSON.stringify(err.properties.xtag));
      console.log("  context:", JSON.stringify(err.properties.context).substring(0, 200));
      console.log("  file:", err.properties.file);
      console.log("");
    });
    console.log("Total errors:", e.properties.errors.length);
  } else {
    console.log(e.message);
  }
}

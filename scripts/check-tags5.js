var PizZip = require("pizzip");
var Docxtemplater = require("docxtemplater");
var fs = require("fs");

// Test with EXACT same options as the server
var buf = fs.readFileSync("templates/sas-statuts.docx");
var zip = new PizZip(buf);
try {
  var doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: function() { return ""; },
  });
  doc.render({
    NOM_SOCIETE: "TEST",
    HAS_ASSOC_1: true, HAS_ASSOC_2: false, HAS_ASSOC_3: false,
    HAS_ASSOC_4: false, HAS_ASSOC_5: false, HAS_ASSOC_6: false,
    HAS_ASSOC_7: false, HAS_ASSOC_8: false, HAS_ASSOC_9: false,
    HAS_ASSOC_10: false,
    EST_PERSONNE_PHYSIQUE: true, EST_PERSONNE_MORALE: false,
    BANQUE_SHINE: false, BANQUE_REVOLUT: false, BANQUE_QONTO: false, BANQUE_AUTRE: true,
    OBJET_SOCIAL_1: true, OBJET_SOCIAL_2: false, OBJET_SOCIAL_3: false,
    OBJET_SOCIAL_4: false, OBJET_SOCIAL_5: false, OBJET_SOCIAL_6: false,
  });
  var outBuf = doc.getZip().generate({ type: "nodebuffer" });
  fs.writeFileSync("/tmp/test-sas-statuts.docx", outBuf);
  console.log("SUCCESS - wrote /tmp/test-sas-statuts.docx (" + outBuf.length + " bytes)");
} catch(e) {
  console.log("ERROR:", e.message);
  if (e.properties && e.properties.errors) {
    console.log("Error count:", e.properties.errors.length);
    e.properties.errors.slice(0, 3).forEach(function(err) {
      console.log(" -", err.properties.id, err.properties.xtag, "file:", err.properties.file);
    });
  }
}

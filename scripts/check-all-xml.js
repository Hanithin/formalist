var PizZip = require("pizzip");
var fs = require("fs");
var buf = fs.readFileSync("templates/sas-statuts.docx");
var zip = new PizZip(buf);
var files = Object.keys(zip.files).filter(function(f) { return f.endsWith(".xml"); });
files.forEach(function(f) {
  var content = zip.file(f).asText();
  if (content.indexOf("{{") >= 0 || content.indexOf("}}") >= 0) {
    var re = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    var m;
    while (m = re.exec(content)) {
      var text = m[1];
      var opens = (text.match(/\{\{/g) || []).length;
      var closes = (text.match(/\}\}/g) || []).length;
      if (opens != closes) {
        console.log("SPLIT in " + f + ": [" + text + "]");
      }
    }
  }
});
console.log("Done checking all XML files");

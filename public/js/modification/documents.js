/**
 * Modification Documents Module
 * Build doc step (step 4), preview, download via existing /api/generate-pdf
 */
window.Formalist = window.Formalist || {};

// Shared SVG icons
var SVG_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
var SVG_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
var SVG_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

function buildModifDocStep() {
  var container = document.getElementById('modif-docs-list');
  if (!container) return;
  if (!modifSelectedTypes || modifSelectedTypes.length === 0) return;

  var forme = (document.getElementById('modif-forme') || {}).value || 'SAS';

  // Collect docs from all selected types, deduplicate by template
  var allDocs = [];
  var seenTemplates = {};
  modifSelectedTypes.forEach(function(typeKey) {
    var config = ModifTypes[typeKey];
    if (!config) return;
    config.docs(forme).forEach(function(doc) {
      if (!seenTemplates[doc.template]) {
        seenTemplates[doc.template] = true;
        allDocs.push(doc);
      }
    });
  });

  var html = '';
  allDocs.forEach(function(doc, i) {
    html += '<div class="gen-doc-card" data-template="' + doc.template + '" data-doc-index="' + i + '">'
      + '<div class="gen-doc-icon pdf">' + SVG_FILE + '</div>'
      + '<div class="gen-doc-info"><div class="gen-doc-name">' + doc.name + '</div>'
      + '<div class="gen-doc-meta">PDF &mdash; G\u00e9n\u00e9r\u00e9 automatiquement</div></div>'
      + '<div class="gen-doc-badge ready">Pr\u00eat</div>'
      + '<div class="gen-doc-actions">'
      + '<button class="gen-doc-btn" onclick="modifPreviewDoc(\'' + doc.template + '\')">' + SVG_EYE + ' Aper\u00e7u</button>'
      + '<button class="gen-doc-btn primary" onclick="modifDownloadDoc(\'' + doc.template + '\')">' + SVG_DOWNLOAD + ' PDF</button>'
      + '</div></div>';
  });
  container.innerHTML = html;
}
window.buildModifDocStep = buildModifDocStep;

function modifPreviewDoc(template) {
  var data = collectModificationData();
  var overlay = document.getElementById('modif-pdf-preview-overlay');
  var body = overlay.querySelector('.pdf-preview-body');
  var title = overlay.querySelector('.pdf-preview-title');

  title.textContent = template.replace('.docx', '');
  body.innerHTML = '<div class="pdf-preview-loading"><div class="spinner"></div><span>G\u00e9n\u00e9ration du PDF...</span></div>';
  overlay.classList.add('active');

  fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: template, data: data, preview: true })
  })
  .then(function(r) {
    if (!r.ok) throw new Error('Erreur ' + r.status);
    return r.blob();
  })
  .then(function(blob) {
    var url = URL.createObjectURL(blob);
    body.innerHTML = '<iframe src="' + url + '"></iframe>';
  })
  .catch(function(e) {
    body.innerHTML = '<div class="pdf-preview-loading"><span>Erreur : ' + e.message + '</span></div>';
  });
}
window.modifPreviewDoc = modifPreviewDoc;

function modifClosePreview() {
  var overlay = document.getElementById('modif-pdf-preview-overlay');
  overlay.classList.remove('active');
  var body = overlay.querySelector('.pdf-preview-body');
  body.innerHTML = '';
}
window.modifClosePreview = modifClosePreview;

function modifDownloadDoc(template) {
  var data = collectModificationData();
  var btn = document.querySelector('[data-template="' + template + '"] .gen-doc-btn.primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;"></div> G\u00e9n\u00e9ration...'; }

  fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: template, data: data, preview: false })
  })
  .then(function(r) {
    if (!r.ok) throw new Error('Erreur ' + r.status);
    return r.blob();
  })
  .then(function(blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = template.replace('.docx', '.pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (btn) { btn.disabled = false; btn.innerHTML = SVG_DOWNLOAD + ' PDF'; }
  })
  .catch(function(e) {
    if (typeof window.showToast === 'function') window.showToast('Erreur t\u00e9l\u00e9chargement : ' + e.message);
    else alert('Erreur de t\u00e9l\u00e9chargement : ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = SVG_DOWNLOAD + ' PDF'; }
  });
}
window.modifDownloadDoc = modifDownloadDoc;

// ==================== STATUTS UPLOAD ====================

var modifStatutsFile = null;

function onStatutsFileSelected(input) {
  var file = input.files && input.files[0];
  if (!file) return;

  // Validate size (10 Mo)
  if (file.size > 10 * 1024 * 1024) {
    if (typeof window.showToast === 'function') window.showToast('Fichier trop volumineux (max 10 Mo)');
    else alert('Le fichier est trop volumineux (max 10 Mo).');
    input.value = '';
    return;
  }

  // Validate extension
  var ext = file.name.split('.').pop().toLowerCase();
  if (['doc', 'docx', 'pdf'].indexOf(ext) < 0) {
    if (typeof window.showToast === 'function') window.showToast('Format non support\u00e9 \u00b7 .doc, .docx ou .pdf uniquement');
    else alert('Format non support\u00e9. Veuillez uploader un fichier .doc, .docx ou .pdf.');
    input.value = '';
    return;
  }

  modifStatutsFile = file;

  // Show file card, hide drop zone
  document.getElementById('modif-upload-zone').style.display = 'none';
  var fileCard = document.getElementById('modif-upload-file');
  fileCard.style.display = 'flex';

  document.getElementById('modif-upload-filename').textContent = file.name;
  var sizeMo = (file.size / (1024 * 1024)).toFixed(2);
  var formatLabel = ext === 'pdf' ? 'PDF' : 'Word (' + ext + ')';
  var metaText = formatLabel + ' \u2014 ' + sizeMo + ' Mo';
  if (ext === 'pdf') {
    metaText += ' \u2014 L\u2019avocat mettra \u00e0 jour les statuts';
  }
  document.getElementById('modif-upload-filemeta').textContent = metaText;
}
window.onStatutsFileSelected = onStatutsFileSelected;

function removeStatutsFile() {
  modifStatutsFile = null;
  document.getElementById('modif-statuts-input').value = '';
  document.getElementById('modif-upload-zone').style.display = '';
  document.getElementById('modif-upload-file').style.display = 'none';
}
window.removeStatutsFile = removeStatutsFile;

function getModifStatutsFile() {
  return modifStatutsFile;
}
window.getModifStatutsFile = getModifStatutsFile;

/**
 * Formalist Documents Module
 * Document upload, doc card HTML, document listing/display
 */
window.Formalist = window.Formalist || {};

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}
window.formatFileSize = formatFileSize;

function handleDocUpload(input) {
  var card = input.closest('.doc-upload-card');
  var file = input.files[0];
  if (!file) return;
  var docId = card.getAttribute('data-doc');

  // Show upload in progress
  var badge = card.querySelector('.doc-status-badge');
  badge.className = 'doc-status-badge pending';
  badge.innerHTML = '<div class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:4px;"></div> Upload en cours...';

  var formData = new FormData();
  formData.append('file', file);

  fetch('/api/upload', { method: 'POST', body: formData })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data.ok) throw new Error(data.error || 'Upload failed');
      var lc = loadLifecycle();
      lc['doc_' + docId + '_fileName'] = data.filename;
      lc['doc_' + docId + '_originalName'] = data.originalName || file.name;
      saveLifecycle(lc);

      // Update card state
      card.classList.add('uploaded');
      card.querySelector('.doc-file-name').textContent = data.originalName || file.name;
      card.querySelector('.doc-file-size').textContent = formatFileSize(file.size);
      badge.className = 'doc-status-badge done';
      badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Ajout\u00e9';
      updateDocProgress();
    })
    .catch(function(e) {
      // Rollback UI
      card.classList.remove('uploaded');
      input.value = '';
      card.querySelector('.doc-file-name').textContent = '';
      card.querySelector('.doc-file-size').textContent = '';
      badge.className = 'doc-status-badge pending';
      badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> En attente';
      updateDocProgress();
      if (typeof window.showToast === 'function') window.showToast('Erreur upload : ' + e.message);
      else alert('Erreur lors de l\'upload : ' + e.message);
    });
}
window.handleDocUpload = handleDocUpload;

function removeDoc(btn) {
  var card = btn.closest('.doc-upload-card');
  var docId = card.getAttribute('data-doc');
  card.classList.remove('uploaded');

  // Clean lifecycle
  var lc = loadLifecycle();
  delete lc['doc_' + docId + '_fileName'];
  delete lc['doc_' + docId + '_originalName'];
  saveLifecycle(lc);

  // Reset file input
  var fileInput = card.querySelector('input[type="file"]');
  fileInput.value = '';

  // Reset badge
  var badge = card.querySelector('.doc-status-badge');
  badge.className = 'doc-status-badge pending';
  badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> En attente';

  // Reset preview
  card.querySelector('.doc-file-name').textContent = '';
  card.querySelector('.doc-file-size').textContent = '';

  updateDocProgress();
}
window.removeDoc = removeDoc;

function docCardHTML(docId, title, desc, required, iconSvg) {
  var badge = required
    ? '<span class="doc-required">Obligatoire</span>'
    : '<span class="doc-optional">Optionnel</span>';
  return '<div class="doc-upload-card" data-doc="' + docId + '" data-required="' + required + '">'
    + '<div class="doc-upload-header">'
    + '<div class="doc-upload-icon">' + iconSvg + '</div>'
    + '<div class="doc-upload-info">'
    + '<div class="doc-upload-title">' + title + ' ' + badge + '</div>'
    + '<div class="doc-upload-desc">' + desc + '</div>'
    + '<div class="doc-upload-zone" onclick="this.querySelector(\'input\').click()">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'
    + '<span>D\u00e9posez un fichier ou <strong>parcourir</strong></span>'
    + '<input type="file" accept=".pdf,.jpg,.jpeg,.png" onchange="handleDocUpload(this)">'
    + '</div>'
    + '</div>'
    + '<div class="doc-upload-status">'
    + '<span class="doc-status-badge pending">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    + ' En attente</span>'
    + '</div>'
    + '</div>'
    + '<div class="doc-file-preview">'
    + '<div class="doc-file-icon">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
    + '</div>'
    + '<div class="doc-file-info"><div class="doc-file-name"></div><div class="doc-file-size"></div></div>'
    + '<button class="doc-file-remove" onclick="removeDoc(this)">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
    + '</button>'
    + '</div>'
    + '</div>';
}
window.docCardHTML = docCardHTML;

function buildDocStep() {
  var html = '';
  var iconId = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M15 10h2"/><path d="M15 14h2"/><path d="M5.5 19a4.5 4.5 0 019 0"/></svg>';
  var iconSiege = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>';

  // Detect dirigeant type
  var sel1 = document.getElementById('select-dirigeant-1');
  var dirigeantType = 'physique';
  if (sel1 && sel1.value === 'autre') {
    var formEl = document.getElementById('dirigeant-form-1');
    if (formEl) {
      var activePanel = formEl.querySelector('.dirigeant-type-panel.active');
      if (activePanel) dirigeantType = activePanel.getAttribute('data-type');
    }
  }

  // Card 1: identity or KBIS depending on dirigeant type
  if (dirigeantType === 'morale') {
    html += docCardHTML('id-dirigeant', 'KBIS de la soci\u00e9t\u00e9 dirigeante',
      'Extrait KBIS de moins de 3 mois de la soci\u00e9t\u00e9 d\u00e9sign\u00e9e comme dirigeante.',
      true, iconId);
  } else {
    html += docCardHTML('id-dirigeant', 'Pi\u00e8ce d\'identit\u00e9 du dirigeant',
      'Carte d\'identit\u00e9 (recto/verso) ou passeport en cours de validit\u00e9. Le document doit \u00eatre lisible et non ratur\u00e9.',
      true, iconId);
  }

  // Card 2: justificatif de siege social depending on domiciliation mode
  var domSelect = document.getElementById('mode-domiciliation');
  var domVal = domSelect ? domSelect.value : '';

  if (domVal === 'Domicile personnel du dirigeant') {
    html += docCardHTML('siege', 'Facture EDF (\u00e9lectricit\u00e9) au nom du dirigeant',
      'Facture EDF, Engie ou autre fournisseur d\'\u00e9lectricit\u00e9/gaz de moins de 3 mois, au nom du dirigeant et \u00e0 l\'adresse du si\u00e8ge.',
      true, iconSiege);
  } else if (domVal === 'Bail commercial ou professionnel') {
    html += docCardHTML('siege', 'Bail commercial sign\u00e9',
      'Copie du bail commercial ou professionnel sign\u00e9 par les deux parties, mentionnant l\'adresse du si\u00e8ge social.',
      true, iconSiege);
  } else if (domVal === 'Soci\u00e9t\u00e9 de domiciliation') {
    html += docCardHTML('siege', 'Contrat de domiciliation commerciale',
      'Contrat de domiciliation sign\u00e9 avec la soci\u00e9t\u00e9 de domiciliation agr\u00e9\u00e9e.',
      true, iconSiege);
  } else {
    html += docCardHTML('siege', 'Justificatif de si\u00e8ge social',
      'S\u00e9lectionnez d\'abord le mode de domiciliation \u00e0 l\'\u00e9tape 1 pour conna\u00eetre le justificatif requis (bail commercial, contrat de domiciliation, ou facture EDF).',
      true, iconSiege);
  }

  document.getElementById('doc-upload-list').innerHTML = html;

  // Restore uploaded state from lifecycle
  var lc = loadLifecycle();
  document.querySelectorAll('.doc-upload-card').forEach(function(card) {
    var docId = card.getAttribute('data-doc');
    var savedFile = lc['doc_' + docId + '_fileName'];
    var savedName = lc['doc_' + docId + '_originalName'];
    if (savedFile) {
      card.classList.add('uploaded');
      card.querySelector('.doc-file-name').textContent = savedName || savedFile;
      var badge = card.querySelector('.doc-status-badge');
      badge.className = 'doc-status-badge done';
      badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Ajout\u00e9';
    }
  });

  updateDocProgress();

  // Re-attach drag-and-drop listeners
  document.querySelectorAll('.doc-upload-card').forEach(function(card) {
    card.addEventListener('dragover', function(e) { e.preventDefault(); card.classList.add('dragging'); });
    card.addEventListener('dragleave', function(e) { e.preventDefault(); card.classList.remove('dragging'); });
    card.addEventListener('drop', function(e) {
      e.preventDefault();
      card.classList.remove('dragging');
      var input = card.querySelector('input[type="file"]');
      if (input && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        handleDocUpload(input);
      }
    });
  });
}
window.buildDocStep = buildDocStep;

function updateDocProgress() {
  var cards = document.querySelectorAll('.doc-upload-card');
  var total = cards.length;
  var done = document.querySelectorAll('.doc-upload-card.uploaded').length;
  var pct = total > 0 ? Math.round((done / total) * 100) : 0;

  document.getElementById('doc-progress-done').textContent = done;
  document.getElementById('doc-progress-total').textContent = total;
  document.getElementById('doc-progress-fill').style.width = pct + '%';
  document.getElementById('doc-progress-pct').textContent = pct + '%';
}
window.updateDocProgress = updateDocProgress;

// Drag and drop init
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.doc-upload-card').forEach(function(card) {
    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      card.classList.add('dragging');
    });
    card.addEventListener('dragleave', function(e) {
      e.preventDefault();
      card.classList.remove('dragging');
    });
    card.addEventListener('drop', function(e) {
      e.preventDefault();
      card.classList.remove('dragging');
      var file = e.dataTransfer.files[0];
      if (!file) return;
      var accept = ['.pdf', '.jpg', '.jpeg', '.png'];
      var ext = '.' + file.name.split('.').pop().toLowerCase();
      if (accept.indexOf(ext) === -1) return;
      var input = card.querySelector('input[type="file"]');
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handleDocUpload(input);
    });
  });
});

Formalist.documents = {
  formatFileSize: formatFileSize,
  handleDocUpload: handleDocUpload,
  removeDoc: removeDoc,
  docCardHTML: docCardHTML,
  buildDocStep: buildDocStep,
  updateDocProgress: updateDocProgress
};

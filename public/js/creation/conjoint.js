/**
 * Formalist Conjoint Module
 * Conjoint toggle, banque selection, AI objet social generation
 */
window.Formalist = window.Formalist || {};

// ==================== CONJOINT (MARIE/PACSE) ====================
function toggleConjoint(sel) {
  var val = sel.value;
  var isMarie = val === 'Mari\u00e9(e)';
  var isPacs = val === 'Pacs\u00e9(e)';
  var show = isMarie || isPacs;
  var container = sel.closest('.associe-panel') || sel.closest('.dirigeant-type-panel') || sel.closest('.step-content');
  if (!container) return;
  // Remove existing section to rebuild with correct fields
  var existing = container.querySelector('.conjoint-section');
  if (existing) existing.remove();
  if (!show) return;

  var dateLabel = isMarie ? 'Date de mariage' : 'Date de PACS';
  var villeLabel = isMarie ? 'Ville de mariage' : 'Ville de PACS';
  var villePlaceholder = isMarie ? 'Ville de mariage' : 'Ville de PACS';

  var section = document.createElement('div');
  section.className = 'conjoint-section';
  section.style.marginTop = '16px';
  var html = '<h4 style="font-size:14px;font-weight:600;margin-bottom:12px;">Informations du conjoint</h4>'
    + '<div class="form-grid">'
    + '<div class="field"><label>Civilit\u00e9 du conjoint</label><select><option value="" disabled selected>Choisir...</option><option>Monsieur</option><option>Madame</option></select></div>'
    + '<div class="field"><label>Nom du conjoint</label><input type="text" placeholder="Nom du conjoint"></div>'
    + '<div class="field"><label>Pr\u00e9nom du conjoint</label><input type="text" placeholder="Pr\u00e9nom du conjoint"></div>'
    + '<div class="field"><label>Nom de naissance du conjoint</label><input type="text" placeholder="Nom de naissance du conjoint"></div>'
    + '<div class="field"><label>' + dateLabel + '</label><input type="date"></div>'
    + '<div class="field"><label>' + villeLabel + '</label><input type="text" placeholder="' + villePlaceholder + '"></div>';
  if (isMarie) {
    html += '<div class="field"><label>Contrat de mariage</label><select><option value="" disabled selected>Choisir...</option><option>Non</option><option>Oui - S\u00e9paration de biens</option><option>Oui - Communaut\u00e9 universelle</option><option>Oui - Participation aux acqu\u00eats</option></select></div>';
  }
  html += '</div>';
  section.innerHTML = html;

  var gridParent = sel.closest('.form-grid');
  if (gridParent) gridParent.parentNode.insertBefore(section, gridParent.nextSibling);
  section.querySelectorAll('select').forEach(function(s) { if (typeof initCustomSelect === 'function') initCustomSelect(s); });
  section.querySelectorAll('input[type="date"]').forEach(function(d) { if (typeof initCustomDate === 'function') initCustomDate(d); });
}
window.toggleConjoint = toggleConjoint;

// ==================== BANQUE AUTRE ====================
function toggleBanqueAutre() {
  var sel = document.getElementById('banque-select');
  var isAutre = sel.value === 'Autre';
  document.getElementById('banque-autre-nom-wrap').style.display = isAutre ? '' : 'none';
  document.getElementById('banque-autre-adresse-wrap').style.display = isAutre ? '' : 'none';
  document.getElementById('banque-autre-villecp-wrap').style.display = isAutre ? '' : 'none';

  if (isAutre) {
    var addrInput = document.getElementById('banque-autre-adresse');
    if (addrInput && !addrInput._addrInit && window.google && google.maps && google.maps.places) {
      var ac = new google.maps.places.Autocomplete(addrInput, { types: ['address'], componentRestrictions: { country: 'fr' } });
      ac.addListener('place_changed', function() {
        var place = ac.getPlace();
        if (!place || !place.address_components) return;
        var ville = '', cp = '';
        place.address_components.forEach(function(c) {
          if (c.types.indexOf('locality') !== -1) ville = c.long_name;
          if (c.types.indexOf('postal_code') !== -1) cp = c.long_name;
        });
        document.getElementById('banque-autre-ville').value = ville;
        document.getElementById('banque-autre-cp').value = cp;
      });
      addrInput._addrInit = true;
    }
  }
}
window.toggleBanqueAutre = toggleBanqueAutre;

// ==================== GENERATE OBJET SOCIAL (AI) ====================
document.addEventListener('DOMContentLoaded', function() {
  var aiInput = document.getElementById('ai-activite-input');
  if (aiInput) aiInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); generateObjetSocial(); }
  });
});

function generateObjetSocial() {
  var input = document.getElementById('ai-activite-input');
  var btn = document.getElementById('ai-generate-btn');
  var textarea = document.getElementById('activite-textarea');
  var description = (input.value || '').trim();
  if (!description) { input.focus(); return; }

  btn.disabled = true;
  btn.classList.add('ai-loading');
  var origHTML = btn.innerHTML;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> G\u00e9n\u00e9ration...';

  fetch('/api/generate-objet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: description })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.error) throw new Error(data.error);
    textarea.value = data.objet;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  })
  .catch(function(err) {
    if (typeof window.showToast === 'function') window.showToast('Erreur g\u00e9n\u00e9ration : ' + err.message);
    else alert('Erreur lors de la g\u00e9n\u00e9ration : ' + err.message);
  })
  .finally(function() {
    btn.disabled = false;
    btn.classList.remove('ai-loading');
    btn.innerHTML = origHTML;
  });
}
window.generateObjetSocial = generateObjetSocial;

Formalist.conjoint = {
  toggleConjoint: toggleConjoint,
  toggleBanqueAutre: toggleBanqueAutre,
  generateObjetSocial: generateObjetSocial
};

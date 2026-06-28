/**
 * Formalist Capital Module
 * Capital distribution, donut chart, apport logic
 */
window.Formalist = window.Formalist || {};

var CHART_COLORS = ['#111', '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

// Format un montant en euros : 2 décimales seulement si non nulles
function fmtEuro(amount) {
  var n = Number(amount) || 0;
  var rounded = Math.round(n * 100) / 100;
  var isWhole = rounded === Math.trunc(rounded);
  var opts = isWhole
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return rounded.toLocaleString('fr-FR', opts);
}

// Format un pourcentage : 1 décimale sauf si .0
function fmtPct(value) {
  return (Number(value) || 0).toFixed(1).replace(/\.0$/, '');
}

// Vocabulaire : SAS/SELAS/... = actions, autres = parts
function isFormeActions() {
  var forme = (document.getElementById('forme-juridique') || {}).value || '';
  return /^(SAS|SASU|SELAS|SELASU|SCA|SE|SA)$/.test(forme);
}
function getPartWord(plural) {
  var w = isFormeActions() ? 'action' : 'part';
  return plural ? w + 's' : w;
}

function getCapitalTotal() {
  var input = document.getElementById('capital-social');
  return input ? (parseFloat(input.value) || 1) : 1;
}
window.getCapitalTotal = getCapitalTotal;

function getTotalParts() {
  var input = document.getElementById('capital-total-parts');
  return input ? (parseInt(input.value) || 1) : 100;
}
window.getTotalParts = getTotalParts;

function buildCapitalStep() {
  var panels = document.querySelectorAll('#associe-panels .associe-panel');
  var container = document.getElementById('capital-cards');
  container.innerHTML = '';

  var capital = getCapitalTotal();
  var totalParts = getTotalParts();

  panels.forEach(function(panel, i) {
    var name = getAssocieName(panel, i);
    var initials = getInitials(name);

    var card = document.createElement('div');
    var formeJur = (document.getElementById('forme-juridique') || {}).value || 'SAS';
    var isSARL = formeJur === 'SARL' || formeJur === 'EURL';
    var isSCI = formeJur === 'SCI';
    var minLib = isSARL ? 20 : (isSCI ? 0 : 50);

    card.className = 'associe-card';
    card.dataset.index = i;
    card.innerHTML = '<div class="associe-card-avatar">' + initials + '</div>'
      + '<div class="associe-card-info">'
      + '  <div class="associe-card-name">' + name + '</div>'
      + '  <div class="associe-card-detail"><span class="card-amount">0 \u20AC</span> \u00b7 <span class="card-pct-detail">0%</span></div>'
      + '  <div class="associe-card-bar"><div class="associe-card-bar-track"><div class="associe-card-bar-fill" style="width:0%"></div></div></div>'
      + '</div>'
      + '<div class="associe-card-input">'
      + '  <div class="field"><input type="number" min="0" value="0" class="capital-parts-input" data-index="' + i + '" oninput="updateCapitalDistribution()"></div>'
      + '  <div class="card-pct" style="font-size:14px;font-weight:600;color:#111;min-width:50px;text-align:right;">0%</div>'
      + '</div>'
      + '<div class="associe-card-details">'
      + '  <div class="apport-row">'
      + '    <div class="field">'
      + '      <label>Type d\'apport</label>'
      + '      <select class="apport-type-select" data-index="' + i + '" onchange="onApportTypeChange(this); updateCapitalDistribution()">'
      + '        <option value="Num\u00e9raire">Num\u00e9raire</option>'
      + '        <option value="En nature">En nature</option>'
      + '        <option value="Mixte">Mixte (num\u00e9raire + nature)</option>'
      + '      </select>'
      + '    </div>'
      + '    <div class="field liberation-field">'
      + '      <label>Lib\u00e9ration num\u00e9raire (%)</label>'
      + '      <input type="number" class="liberation-input" data-index="' + i + '" min="' + minLib + '" max="100" value="100" oninput="updateCapitalDistribution()">'
      + '      <div class="liberation-hint">Min ' + minLib + '% (' + formeJur + ')</div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="apport-nature-section" data-index="' + i + '">'
      + '    <div class="apport-row">'
      + '      <div class="field">'
      + '        <label>Montant apport en nature (\u20AC)</label>'
      + '        <input type="number" class="apport-nature-montant" data-index="' + i + '" min="0" value="0" oninput="updateCapitalDistribution()">'
      + '      </div>'
      + '      <div class="field">'
      + '        <label>Description de l\'apport en nature</label>'
      + '        <textarea class="apport-nature-desc" data-index="' + i + '" placeholder="Ex : Mat\u00e9riel informatique, fonds de commerce..."></textarea>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div class="apport-summary" data-index="' + i + '">'
      + '    <div class="apport-summary-item"><span class="label">Souscription</span><span class="value summary-souscrit">0 \u20AC</span></div>'
      + '    <div class="apport-summary-item"><span class="label">Vers\u00e9</span><span class="value summary-verse">0 \u20AC</span></div>'
      + '    <div class="apport-summary-item"><span class="label">Reste \u00e0 lib\u00e9rer</span><span class="value summary-reste">0 \u20AC</span></div>'
      + '  </div>'
      + '</div>';
    container.appendChild(card);
  });

  // Update summary
  document.getElementById('summary-capital').textContent = fmtEuro(capital) + ' \u20AC';
  document.getElementById('summary-parts').textContent = totalParts;
  document.getElementById('summary-associes').textContent = panels.length;
  var isActionnaire = isFormeActions();
  var labelBase = isActionnaire ? 'Actionnaire' : 'Associ\u00E9';
  var labelEl = document.getElementById('summary-associes-label');
  if (labelEl) labelEl.textContent = labelBase + (panels.length > 1 ? 's' : '');
  // Labels parts/actions (en cas d'\u00E9chec de updateCapitalDistribution)
  var totalPartsLblB = document.getElementById('capital-total-parts-label');
  if (totalPartsLblB) {
    totalPartsLblB.innerHTML = (isActionnaire ? 'Nombre total d\'actions' : 'Nombre total de parts') + ' <span class="required">*</span>';
  }
  var sumPartsLblB = document.getElementById('summary-parts-label');
  if (sumPartsLblB) sumPartsLblB.textContent = isActionnaire ? 'Nombre d\'actions' : 'Nombre de parts';
  var capitalDescElB = document.getElementById('capital-step-desc');
  if (capitalDescElB) {
    capitalDescElB.textContent = 'R\u00E9partissez le capital social entre les ' + (isActionnaire ? 'actionnaires' : 'associ\u00E9s') + '. 100% du capital doit \u00EAtre distribu\u00E9.';
  }

  // SASU/EURL : associe unique -> attribuer toutes les parts, masquer repartition + donut
  var btnEqual = document.querySelector('.btn-equal');
  var chartSection = document.getElementById('capital-chart-section');
  if (panels.length === 1) {
    if (btnEqual) btnEqual.style.display = 'none';
    if (chartSection) chartSection.style.display = 'none';
    var singleInput = container.querySelector('.capital-parts-input');
    if (singleInput) singleInput.value = totalParts;
  } else {
    if (btnEqual) btnEqual.style.display = '';
    if (chartSection) chartSection.style.display = '';
  }

  updateCapitalDistribution();
}
window.buildCapitalStep = buildCapitalStep;

function onApportTypeChange(select) {
  var idx = select.dataset.index;
  var card = select.closest('.associe-card');
  var natureSection = card.querySelector('.apport-nature-section');
  var libField = card.querySelector('.liberation-field');
  var val = select.value;

  if (val === 'En nature') {
    natureSection.classList.add('visible');
    libField.style.display = 'none';
    card.querySelector('.liberation-input').value = 100;
  } else if (val === 'Mixte') {
    natureSection.classList.add('visible');
    libField.style.display = '';
  } else {
    natureSection.classList.remove('visible');
    libField.style.display = '';
    card.querySelector('.apport-nature-montant').value = 0;
    card.querySelector('.apport-nature-desc').value = '';
  }
}
window.onApportTypeChange = onApportTypeChange;

function updateCapitalDistribution() {
  var capital = getCapitalTotal();
  var totalParts = getTotalParts();
  var inputs = document.querySelectorAll('.capital-parts-input');

  // Associe unique -> toujours 100%
  if (inputs.length === 1) {
    inputs[0].value = totalParts;
  }

  var distributedParts = 0;

  inputs.forEach(function(input) {
    distributedParts += parseInt(input.value) || 0;
  });

  var pct = totalParts > 0 ? (distributedParts / totalParts) * 100 : 0;
  var distributedAmount = totalParts > 0 ? (distributedParts / totalParts) * capital : 0;

  var valeurNominale = totalParts > 0 ? capital / totalParts : 0;
  var globalTotalVerse = 0;
  var globalTotalReste = 0;

  // Update each card
  inputs.forEach(function(input) {
    var card = input.closest('.associe-card');
    var parts = parseInt(input.value) || 0;
    var cardPct = totalParts > 0 ? (parts / totalParts) * 100 : 0;
    var cardAmount = totalParts > 0 ? (parts / totalParts) * capital : 0;

    card.querySelector('.card-amount').textContent = fmtEuro(cardAmount) + ' \u20AC';
    card.querySelector('.card-pct-detail').textContent = fmtPct(cardPct) + '%';
    card.querySelector('.card-pct').textContent = fmtPct(cardPct) + '%';
    card.querySelector('.associe-card-bar-fill').style.width = Math.min(cardPct, 100) + '%';

    // Apport calculations
    var montantSouscrit = parts * valeurNominale;
    var typeSelect = card.querySelector('.apport-type-select');
    var libInput = card.querySelector('.liberation-input');
    var natureInput = card.querySelector('.apport-nature-montant');
    if (!typeSelect) return;

    var typeApport = typeSelect.value;
    var pctLib = parseInt(libInput.value) || 100;
    var apportNature = parseFloat(natureInput.value) || 0;

    // En nature: tout est en nature, liberation 100%
    if (typeApport === 'En nature') {
      apportNature = montantSouscrit;
      natureInput.value = apportNature ? Math.round(apportNature * 100) / 100 : 0;
      pctLib = 100;
    }

    var montantNumeraire = Math.max(0, montantSouscrit - apportNature);
    var verseNumeraire = montantNumeraire * (pctLib / 100);
    var montantVerse = verseNumeraire + apportNature; // nature always 100% liberated
    var resteALiberer = montantNumeraire - verseNumeraire;

    globalTotalVerse += montantVerse;
    globalTotalReste += resteALiberer;

    // Update per-card summary
    var summaryEl = card.querySelector('.apport-summary');
    if (summaryEl) {
      summaryEl.querySelector('.summary-souscrit').textContent = fmtEuro(montantSouscrit) + ' \u20AC';
      summaryEl.querySelector('.summary-verse').textContent = fmtEuro(montantVerse) + ' \u20AC';
      summaryEl.querySelector('.summary-reste').textContent = fmtEuro(resteALiberer) + ' \u20AC';
    }
  });

  // Update global progress bar
  var fill = document.getElementById('capital-progress-fill');
  fill.style.width = Math.min(pct, 100) + '%';
  fill.classList.remove('ok', 'warn', 'over');
  if (pct === 100) fill.classList.add('ok');
  else if (pct > 100) fill.classList.add('over');
  else fill.classList.add('warn');

  document.getElementById('capital-progress-pct').textContent = pct.toFixed(0) + '%';
  document.getElementById('capital-progress-pct').style.color = pct === 100 ? '#22c55e' : pct > 100 ? '#ef4444' : '#111';
  document.getElementById('capital-progress-label').textContent = fmtEuro(distributedAmount) + ' \u20AC distribu\u00e9s sur ' + fmtEuro(capital) + ' \u20AC';
  var partsWordD = getPartWord(distributedParts > 1);
  var partsWordT = getPartWord(totalParts > 1);
  document.getElementById('capital-parts-distributed').textContent = distributedParts + ' ' + partsWordD + ' distribu\u00e9' + (distributedParts > 1 ? 'es' : 'e');
  document.getElementById('capital-parts-total').textContent = 'sur ' + totalParts + ' ' + partsWordT;

  // Update summary
  var nominal = totalParts > 0 ? (capital / totalParts) : 0;
  document.getElementById('summary-nominal').textContent = fmtEuro(nominal) + ' \u20AC';
  document.getElementById('summary-parts').textContent = totalParts;
  document.getElementById('summary-capital').textContent = fmtEuro(capital) + ' \u20AC';

  // Update global verse / reste
  var elVerse = document.getElementById('summary-total-verse');
  var elReste = document.getElementById('summary-reste-liberer');
  if (elVerse) elVerse.textContent = fmtEuro(globalTotalVerse) + ' \u20AC';
  if (elReste) elReste.textContent = fmtEuro(globalTotalReste) + ' \u20AC';

  // Update donut chart
  updateDonutChart(inputs, totalParts, capital);

  // Enable/disable button
  var btn = document.getElementById('btn-next-step4');
  var error = document.getElementById('capital-error');
  if (distributedParts === totalParts && totalParts > 0) {
    btn.disabled = false;
    error.classList.remove('visible');
  } else {
    btn.disabled = true;
  }
}
window.updateCapitalDistribution = updateCapitalDistribution;

function distributeEqually() {
  var inputs = document.querySelectorAll('.capital-parts-input');
  if (inputs.length === 0) return;
  var totalParts = getTotalParts();
  var perAssociate = Math.floor(totalParts / inputs.length);
  var remainder = totalParts - (perAssociate * inputs.length);

  inputs.forEach(function(input, i) {
    input.value = perAssociate + (i < remainder ? 1 : 0);
  });
  updateCapitalDistribution();
}
window.distributeEqually = distributeEqually;

function validateAndNextStep4() {
  var totalParts = getTotalParts();
  var capital = getCapitalTotal();
  var valeurNominale = totalParts > 0 ? capital / totalParts : 0;
  var inputs = document.querySelectorAll('.capital-parts-input');
  var distributedParts = 0;
  inputs.forEach(function(input) { distributedParts += parseInt(input.value) || 0; });

  var errorEl = document.getElementById('capital-error');

  if (distributedParts !== totalParts) {
    errorEl.textContent = 'La r\u00e9partition doit \u00eatre exactement \u00e9gale \u00e0 100% du capital.';
    errorEl.classList.add('visible');
    return;
  }

  // Validate apport details per card
  var formeJur = (document.getElementById('forme-juridique') || {}).value || 'SAS';
  var isSARL = formeJur === 'SARL' || formeJur === 'EURL';
  var isSCI = formeJur === 'SCI';
  var minLib = isSARL ? 20 : (isSCI ? 0 : 50);

  var cards = document.querySelectorAll('.associe-card');
  for (var c = 0; c < cards.length; c++) {
    var card = cards[c];
    var typeSelect = card.querySelector('.apport-type-select');
    if (!typeSelect) continue;
    var typeApport = typeSelect.value;
    var pctLib = parseInt(card.querySelector('.liberation-input').value) || 100;
    var parts = parseInt(card.querySelector('.capital-parts-input').value) || 0;
    var montantSouscrit = parts * valeurNominale;
    var apportNature = parseFloat(card.querySelector('.apport-nature-montant').value) || 0;
    var name = card.querySelector('.associe-card-name').textContent;

    if (typeApport !== 'En nature' && pctLib < minLib) {
      errorEl.textContent = name + ' : le pourcentage de lib\u00e9ration doit \u00eatre au minimum ' + minLib + '% (' + formeJur + ').';
      errorEl.classList.add('visible');
      return;
    }

    if (typeApport === 'Mixte' && apportNature >= montantSouscrit) {
      errorEl.textContent = name + ' : l\'apport en nature doit \u00eatre inf\u00e9rieur au montant total souscrit pour un apport mixte.';
      errorEl.classList.add('visible');
      return;
    }

    if (typeApport === 'En nature' && montantSouscrit > 0 && Math.abs(apportNature - montantSouscrit) > 0.01) {
      errorEl.textContent = name + ' : pour un apport 100% en nature, le montant doit \u00eatre \u00e9gal \u00e0 la souscription.';
      errorEl.classList.add('visible');
      return;
    }
  }

  errorEl.classList.remove('visible');
  saveFormData();
  if (currentStep < totalSteps && !isAnimating) {
    var from = currentStep;
    currentStep++;
    buildDocStep();
    transitionStep(from, currentStep, 'next');
  }
}
window.validateAndNextStep4 = validateAndNextStep4;

function updateDonutChart(inputs, totalParts, capital) {
  var donut = document.getElementById('donut-chart');
  var legend = document.getElementById('donut-legend');
  var centerPct = document.getElementById('donut-center-pct');

  var segments = [];
  var totalDistributed = 0;
  inputs.forEach(function(input) { totalDistributed += parseInt(input.value) || 0; });
  var globalPct = totalParts > 0 ? Math.round((totalDistributed / totalParts) * 100) : 0;

  // Center text
  centerPct.textContent = globalPct + '%';
  centerPct.style.color = globalPct === 100 ? '#22c55e' : globalPct > 100 ? '#ef4444' : '#111';

  // Build segments
  var currentDeg = 0;
  var gradientParts = [];
  legend.innerHTML = '';

  inputs.forEach(function(input, i) {
    var parts = parseInt(input.value) || 0;
    var pctVal = totalParts > 0 ? (parts / totalParts) * 100 : 0;
    var deg = (pctVal / 100) * 360;
    var color = CHART_COLORS[i % CHART_COLORS.length];
    var amount = totalParts > 0 ? (parts / totalParts) * capital : 0;

    // Get name from the card
    var card = input.closest('.associe-card');
    var name = card ? card.querySelector('.associe-card-name').textContent : 'Associ\u00e9 ' + (i + 1);

    if (parts > 0) {
      gradientParts.push(color + ' ' + currentDeg.toFixed(2) + 'deg ' + (currentDeg + deg).toFixed(2) + 'deg');
      currentDeg += deg;
    }

    // Legend item
    var item = document.createElement('div');
    item.className = 'donut-legend-item';
    item.innerHTML = '<div class="donut-legend-dot" style="background:' + color + '"></div>'
      + '<div class="donut-legend-info">'
      + '  <div class="donut-legend-name">' + name + '</div>'
      + '  <div class="donut-legend-detail">' + parts + ' ' + getPartWord(parts > 1) + ' \u00b7 ' + fmtEuro(amount) + ' \u20AC</div>'
      + '</div>'
      + '<div class="donut-legend-pct">' + fmtPct(pctVal) + '%</div>';
    legend.appendChild(item);
  });

  // Remaining (undistributed)
  if (currentDeg < 360 && totalDistributed < totalParts) {
    gradientParts.push('#e0e0e0 ' + currentDeg.toFixed(2) + 'deg 360deg');
  }

  // Apply gradient
  if (gradientParts.length > 0) {
    donut.style.background = 'conic-gradient(' + gradientParts.join(', ') + ')';
  } else {
    donut.style.background = 'conic-gradient(#e0e0e0 0deg 360deg)';
  }

  // Over 100% - show red
  if (totalDistributed > totalParts) {
    donut.style.background = 'conic-gradient(#ef4444 0deg 360deg)';
  }
}
window.updateDonutChart = updateDonutChart;

Formalist.capital = {
  CHART_COLORS: CHART_COLORS,
  getCapitalTotal: getCapitalTotal,
  getTotalParts: getTotalParts,
  buildCapitalStep: buildCapitalStep,
  onApportTypeChange: onApportTypeChange,
  updateCapitalDistribution: updateCapitalDistribution,
  distributeEqually: distributeEqually,
  validateAndNextStep4: validateAndNextStep4,
  updateDonutChart: updateDonutChart
};

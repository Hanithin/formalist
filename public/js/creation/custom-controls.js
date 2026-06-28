/**
 * Formalist Custom Controls Module
 * Custom select, datepicker, city autocomplete, address autocomplete
 */
window.Formalist = window.Formalist || {};

// ==================== CUSTOM SELECT ====================
function initCustomSelect(sel) {
  if (sel._csInit) return;
  sel._csInit = true;

  var wrap = document.createElement('div');
  wrap.className = 'cselect';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  var trigger = document.createElement('div');
  trigger.className = 'cselect-trigger';
  wrap.appendChild(trigger);

  var opts = document.createElement('div');
  opts.className = 'cselect-opts';
  wrap.appendChild(opts);

  function buildOpts() {
    opts.innerHTML = '';
    Array.from(sel.options).forEach(function(o, i) {
      if (o.disabled && o.value === '') return; // skip placeholder
      var div = document.createElement('div');
      div.className = 'cselect-opt' + (sel.selectedIndex === i ? ' selected' : '');
      div.textContent = o.textContent;
      div.dataset.index = i;
      div.addEventListener('mousedown', function(e) {
        e.preventDefault();
        sel.selectedIndex = i;
        sel.dispatchEvent(new Event('change'));
        updateTrigger();
        close();
      });
      opts.appendChild(div);
    });
  }

  function updateTrigger() {
    var o = sel.options[sel.selectedIndex];
    if (!o || (o.disabled && o.value === '')) {
      trigger.textContent = 'Choisir...';
      trigger.classList.add('placeholder');
    } else {
      trigger.textContent = o.textContent;
      trigger.classList.remove('placeholder');
    }
    // Update selected state
    opts.querySelectorAll('.cselect-opt').forEach(function(d) {
      d.classList.toggle('selected', parseInt(d.dataset.index) === sel.selectedIndex);
    });
  }

  function resetPanelZ() {
    document.querySelectorAll('#dirigeant-panels .associe-panel').forEach(function(p) { p.style.zIndex = ''; });
  }
  function close() {
    wrap.classList.remove('open');
    resetPanelZ();
  }
  function toggle() {
    var isOpen = wrap.classList.contains('open');
    // Close all others
    document.querySelectorAll('.cselect.open').forEach(function(c) { c.classList.remove('open'); });
    resetPanelZ();
    if (!isOpen) {
      buildOpts();
      wrap.classList.add('open');
      var dirPanel = wrap.closest('#dirigeant-panels .associe-panel');
      if (dirPanel) dirPanel.style.zIndex = '100';
    }
  }

  trigger.addEventListener('click', function(e) { e.stopPropagation(); toggle(); });
  document.addEventListener('click', function() { close(); });

  updateTrigger();

  // Observe changes to select (for programmatic updates)
  var observer = new MutationObserver(function() { updateTrigger(); });
  observer.observe(sel, { attributes: true, childList: true, subtree: true });
}
window.initCustomSelect = initCustomSelect;

function initAllCustomSelects() {
  document.querySelectorAll('.field select:not(._csInit)').forEach(function(sel) {
    initCustomSelect(sel);
  });
}
window.initAllCustomSelects = initAllCustomSelects;

// ==================== CUSTOM DATEPICKER ====================
var CDP_MONTHS = ['Janvier','F\u00e9vrier','Mars','Avril','Mai','Juin','Juillet','Ao\u00fbt','Septembre','Octobre','Novembre','D\u00e9cembre'];
var CDP_DAYS = ['L','M','M','J','V','S','D'];

function initCustomDate(input) {
  if (input._cdpInit) return;
  input._cdpInit = true;

  var wrap = document.createElement('div');
  wrap.className = 'cdp';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  var trigger = document.createElement('div');
  trigger.className = 'cdp-trigger';
  wrap.appendChild(trigger);

  var cal = document.createElement('div');
  cal.className = 'cdp-cal';
  wrap.appendChild(cal);

  var viewYear, viewMonth;
  var val = input.value ? new Date(input.value + 'T00:00:00') : null;
  if (val && !isNaN(val)) { viewYear = val.getFullYear(); viewMonth = val.getMonth(); }
  else { var n = new Date(); viewYear = n.getFullYear(); viewMonth = n.getMonth(); }

  function fmt(d) {
    if (!d) return '';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  function iso(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function updateTrigger() {
    var v = input.value ? new Date(input.value + 'T00:00:00') : null;
    if (v && !isNaN(v)) {
      trigger.textContent = fmt(v);
      trigger.classList.remove('placeholder');
    } else {
      trigger.textContent = 'jj/mm/aaaa';
      trigger.classList.add('placeholder');
    }
  }

  function render() {
    var today = new Date(); today.setHours(0,0,0,0);
    var selDate = input.value ? new Date(input.value + 'T00:00:00') : null;
    var first = new Date(viewYear, viewMonth, 1);
    var startDay = (first.getDay() + 6) % 7; // Monday=0
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var prevDays = new Date(viewYear, viewMonth, 0).getDate();

    var html = '<div class="cdp-header">'
      + '<button class="cdp-nav" data-dir="-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>'
      + '<span>' + CDP_MONTHS[viewMonth] + ' ' + viewYear + '</span>'
      + '<button class="cdp-nav" data-dir="1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>'
      + '</div><div class="cdp-grid">';

    CDP_DAYS.forEach(function(d) { html += '<div class="cdp-dow">' + d + '</div>'; });

    // Previous month
    for (var p = startDay - 1; p >= 0; p--) {
      var pd = prevDays - p;
      html += '<div class="cdp-day other" data-y="' + (viewMonth === 0 ? viewYear-1 : viewYear) + '" data-m="' + (viewMonth === 0 ? 11 : viewMonth-1) + '" data-d="' + pd + '">' + pd + '</div>';
    }
    // Current month
    for (var d = 1; d <= daysInMonth; d++) {
      var cls = 'cdp-day';
      var dt = new Date(viewYear, viewMonth, d);
      if (dt.getTime() === today.getTime()) cls += ' today';
      if (selDate && dt.getTime() === selDate.getTime()) cls += ' selected';
      html += '<div class="' + cls + '" data-y="' + viewYear + '" data-m="' + viewMonth + '" data-d="' + d + '">' + d + '</div>';
    }
    // Next month
    var total = startDay + daysInMonth;
    var rem = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (var n = 1; n <= rem; n++) {
      html += '<div class="cdp-day other" data-y="' + (viewMonth === 11 ? viewYear+1 : viewYear) + '" data-m="' + (viewMonth === 11 ? 0 : viewMonth+1) + '" data-d="' + n + '">' + n + '</div>';
    }
    html += '</div>';
    cal.innerHTML = html;

    // Nav events
    cal.querySelectorAll('.cdp-nav').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var dir = parseInt(btn.dataset.dir);
        viewMonth += dir;
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        render();
      });
    });
    // Day events
    cal.querySelectorAll('.cdp-day').forEach(function(day) {
      day.addEventListener('click', function(e) {
        e.stopPropagation();
        var picked = new Date(parseInt(day.dataset.y), parseInt(day.dataset.m), parseInt(day.dataset.d));
        input.value = iso(picked);
        input.dispatchEvent(new Event('change'));
        updateTrigger();
        wrap.classList.remove('open');
      });
    });
  }

  trigger.addEventListener('click', function(e) {
    e.stopPropagation();
    var wasOpen = wrap.classList.contains('open');
    document.querySelectorAll('.cdp.open').forEach(function(c) { c.classList.remove('open'); });
    if (!wasOpen) {
      var v = input.value ? new Date(input.value + 'T00:00:00') : null;
      if (v && !isNaN(v)) { viewYear = v.getFullYear(); viewMonth = v.getMonth(); }
      render();
      wrap.classList.add('open');
    }
  });
  document.addEventListener('click', function() { wrap.classList.remove('open'); });
  cal.addEventListener('click', function(e) { e.stopPropagation(); });

  // Re-sync le trigger visible quand la valeur est modifiée par programme
  // (restauration depuis localStorage, prefill dev, etc.)
  input.addEventListener('change', updateTrigger);
  // Expose une méthode pour forcer la synchronisation depuis l'extérieur
  input._cdpSync = updateTrigger;

  updateTrigger();
}
window.initCustomDate = initCustomDate;

function initAllCustomDates() {
  document.querySelectorAll('.field input[type="date"]').forEach(function(inp) {
    initCustomDate(inp);
  });
}
window.initAllCustomDates = initAllCustomDates;

// ==================== GOOGLE PLACES AUTOCOMPLETE ====================
// Autocomplétion d'adresse via la Base Adresse Nationale (api-adresse.data.gouv.fr).
// Gratuite, sans clé, dédiée aux adresses françaises. Remplit rue + ville + CP.
function _applyAddress(input, p) {
  var street = p.name || ((p.housenumber ? p.housenumber + ' ' : '') + (p.street || ''));
  var city = p.city || '';
  var postal = p.postcode || '';
  var stepContent = input.closest('.step-content[data-step="1"]');
  var villeInput = stepContent ? stepContent.querySelector('input[placeholder="Ville"]') : null;
  var cpInput = stepContent ? stepContent.querySelector('input[placeholder="Code postal"]') : null;
  if (villeInput && cpInput) {
    // Étape 1 société : rue dans l'input, ville/CP dans des champs séparés
    input.value = street || p.label || '';
    if (city) { villeInput.value = city; villeInput.dispatchEvent(new Event('input')); }
    if (postal) { cpInput.value = postal; cpInput.dispatchEvent(new Event('input')); }
  } else {
    // Associés/dirigeants : adresse complète dans un seul champ
    var parts = [];
    if (street) parts.push(street);
    if (postal) parts.push(postal);
    if (city) parts.push(city);
    input.value = parts.join(', ') || p.label || '';
  }
  // Notifie la sauvegarde sans rouvrir le dropdown
  input._skipAutocomplete = true;
  input.dispatchEvent(new Event('input'));
}

function initAddressAutocomplete(input) {
  if (input._autocompleteInit) return;
  input._autocompleteInit = true;

  var dropdown = document.createElement('div');
  dropdown.className = 'addr-dropdown';
  dropdown.style.cssText = 'display:none;position:absolute;z-index:10000;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);max-height:240px;overflow-y:auto;margin-top:2px;';
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(dropdown);

  var debounceTimer = null;
  var feats = [];
  input.addEventListener('input', function() {
    // Ignore l'événement déclenché par la sélection d'une suggestion
    // (sinon le dropdown se rouvre aussitôt).
    if (input._skipAutocomplete) { input._skipAutocomplete = false; dropdown.style.display = 'none'; return; }
    var q = input.value.trim();
    if (q.length < 3) { dropdown.style.display = 'none'; return; }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      fetch('https://api-adresse.data.gouv.fr/search/?q=' + encodeURIComponent(q) + '&limit=6&autocomplete=1')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          feats = (data && data.features) || [];
          if (!feats.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = feats.map(function(f, i) {
            var esc = document.createElement('div');
            esc.textContent = (f.properties && f.properties.label) || '';
            return '<div class="addr-option" data-index="' + i + '" style="padding:10px 14px;font-size:14px;cursor:pointer;border-bottom:1px solid #f0f0f0;">' + esc.innerHTML + '</div>';
          }).join('');
          dropdown.style.display = 'block';
          dropdown.style.width = input.offsetWidth + 'px';
          dropdown.querySelectorAll('.addr-option').forEach(function(opt) {
            opt.addEventListener('mouseenter', function() { opt.style.background = '#f7f7f7'; });
            opt.addEventListener('mouseleave', function() { opt.style.background = '#fff'; });
            opt.addEventListener('mousedown', function(e) {
              e.preventDefault();
              var f = feats[parseInt(opt.dataset.index)];
              dropdown.style.display = 'none';
              if (f && f.properties) _applyAddress(input, f.properties);
            });
          });
        })
        .catch(function() { dropdown.style.display = 'none'; });
    }, 250);
  });
  input.addEventListener('blur', function() { setTimeout(function() { dropdown.style.display = 'none'; }, 150); });
}
window.initAddressAutocomplete = initAddressAutocomplete;

function initCityBirthAutocomplete(input) {
  if (input._cityAutoInit) return;
  input._cityAutoInit = true;

  var dropdown = document.createElement('div');
  dropdown.className = 'city-dropdown';
  dropdown.style.cssText = 'display:none;position:absolute;z-index:10000;background:#fff;border:1px solid #e0e0e0;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.1);max-height:220px;overflow-y:auto;margin-top:2px;';
  input.parentNode.style.position = 'relative';
  input.parentNode.appendChild(dropdown);

  var debounceTimer = null;
  input.addEventListener('input', function() {
    var q = input.value.trim();
    if (q.length < 2) { dropdown.style.display = 'none'; return; }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      fetch('https://geo.api.gouv.fr/communes?nom=' + encodeURIComponent(q) + '&fields=nom,codesPostaux,codeDepartement&boost=population&limit=6')
        .then(function(r) { return r.json(); })
        .then(function(communes) {
          if (!communes.length) { dropdown.style.display = 'none'; return; }
          dropdown.innerHTML = communes.map(function(c) {
            var cp = c.codesPostaux && c.codesPostaux[0] ? c.codesPostaux[0] : '';
            var d = document.createElement('div');
            d.textContent = c.nom;
            var safeName = d.innerHTML;
            return '<div class="city-option" data-city="' + safeName + '" data-cp="' + cp + '" style="padding:10px 14px;font-size:14px;cursor:pointer;border-bottom:1px solid #f0f0f0;">'
              + '<strong>' + safeName + '</strong> <span style="color:#888;font-size:12px;">' + cp + ' (' + c.codeDepartement + ')</span>'
              + '</div>';
          }).join('');
          dropdown.style.display = 'block';
          dropdown.style.width = input.offsetWidth + 'px';

          dropdown.querySelectorAll('.city-option').forEach(function(opt) {
            opt.addEventListener('mouseenter', function() { opt.style.background = '#f7f7f7'; });
            opt.addEventListener('mouseleave', function() { opt.style.background = '#fff'; });
            opt.addEventListener('mousedown', function(e) {
              e.preventDefault();
              input.value = opt.dataset.city;
              dropdown.style.display = 'none';

              var container = input.closest('.associe-panel') || input.closest('.dirigeant-type-panel') || input.closest('.step-content');
              if (container) {
                var cpInput = container.querySelector('.cp-birth');
                var paysInput = container.querySelector('.pays-birth');
                if (cpInput && opt.dataset.cp) { cpInput.value = opt.dataset.cp; cpInput.dispatchEvent(new Event('input')); }
                if (paysInput) { paysInput.value = 'France'; paysInput.dispatchEvent(new Event('input')); }
              }
            });
          });
        });
    }, 250);
  });

  input.addEventListener('blur', function() { setTimeout(function() { dropdown.style.display = 'none'; }, 150); });
}
window.initCityBirthAutocomplete = initCityBirthAutocomplete;

function initAllAutocompletes() {
  document.querySelectorAll('.addr-auto').forEach(function(input) {
    initAddressAutocomplete(input);
  });
  document.querySelectorAll('.city-birth-auto').forEach(function(input) {
    initCityBirthAutocomplete(input);
  });
}
window.initAllAutocompletes = initAllAutocompletes;

// Helper for prefill: set select value and trigger change
function setSelect(sel, val) {
  if (!sel) return;
  sel.value = val;
  for (var i = 0; i < sel.options.length; i++) {
    sel.options[i].removeAttribute('selected');
    if (sel.options[i].value === val || sel.options[i].textContent.trim() === val) {
      sel.options[i].setAttribute('selected', 'selected');
      sel.selectedIndex = i;
    }
  }
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
window.setSelect = setSelect;

function refreshAllCustomTriggers() {
  // Refresh custom date triggers
  document.querySelectorAll('.cdp').forEach(function(wrap) {
    var input = wrap.querySelector('input[type="date"]');
    var trigger = wrap.querySelector('.cdp-trigger');
    if (input && trigger) {
      var v = input.value ? new Date(input.value + 'T00:00:00') : null;
      if (v && !isNaN(v)) {
        trigger.textContent = ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
        trigger.classList.remove('placeholder');
      }
    }
  });
  // Refresh custom select triggers
  document.querySelectorAll('.cselect').forEach(function(wrap) {
    var sel = wrap.querySelector('select');
    var trigger = wrap.querySelector('.cselect-trigger');
    if (sel && trigger) {
      var o = sel.options[sel.selectedIndex];
      if (o && !(o.disabled && o.value === '')) {
        trigger.textContent = o.textContent;
        trigger.classList.remove('placeholder');
      }
    }
  });
}
window.refreshAllCustomTriggers = refreshAllCustomTriggers;

function onGoogleMapsLoaded() {
  initAllAutocompletes();
}
window.onGoogleMapsLoaded = onGoogleMapsLoaded;

// Init on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.addr-auto').forEach(function(input) {
    initAddressAutocomplete(input);
  });
  document.querySelectorAll('.city-birth-auto').forEach(function(input) {
    initCityBirthAutocomplete(input);
  });
  initAllCustomSelects();
  initAllCustomDates();
});

Formalist.customControls = {
  initCustomSelect: initCustomSelect,
  initCustomDate: initCustomDate,
  initAddressAutocomplete: initAddressAutocomplete,
  initCityBirthAutocomplete: initCityBirthAutocomplete,
  initAllAutocompletes: initAllAutocompletes,
  initAllCustomSelects: initAllCustomSelects,
  initAllCustomDates: initAllCustomDates,
  setSelect: setSelect,
  refreshAllCustomTriggers: refreshAllCustomTriggers,
  onGoogleMapsLoaded: onGoogleMapsLoaded
};

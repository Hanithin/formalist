// Résolution code postal → ville du RCS (Tribunal de Commerce du département)
// Miroir de lib/rcs.js côté serveur — voir ce fichier pour la doc complète.
(function() {
  var DEPT_TO_RCS = {
    '01':'Bourg-en-Bresse','02':'Saint-Quentin','03':'Cusset','04':'Manosque','05':'Gap','06':'Antibes','07':'Aubenas','08':'Sedan','09':'Foix',
    '10':'Troyes','11':'Narbonne','12':'Rodez','13':'Marseille','14':'Caen','15':'Aurillac','16':'Angoulême','17':'La Rochelle','18':'Bourges','19':'Brive-la-Gaillarde',
    '21':'Dijon','22':'Saint-Brieuc','23':'Guéret','24':'Périgueux','25':'Besançon','26':'Romans-sur-Isère','27':'Évreux','28':'Chartres','29':'Quimper',
    '2A':'Ajaccio','2B':'Bastia',
    '30':'Nîmes','31':'Toulouse','32':'Auch','33':'Bordeaux','34':'Montpellier','35':'Rennes','36':'Châteauroux','37':'Tours','38':'Grenoble','39':'Lons-le-Saunier',
    '40':'Mont-de-Marsan','41':'Blois','42':'Saint-Étienne','43':'Le Puy-en-Velay','44':'Nantes','45':'Orléans','46':'Cahors','47':'Agen','48':'Mende','49':'Angers',
    '50':'Coutances','51':'Reims','52':'Chaumont','53':'Laval','54':'Nancy','55':'Bar-le-Duc','56':'Vannes','57':'Metz','58':'Nevers','59':'Lille',
    '60':'Beauvais','61':'Alençon','62':'Arras','63':'Clermont-Ferrand','64':'Pau','65':'Tarbes','66':'Perpignan','67':'Strasbourg','68':'Mulhouse','69':'Lyon',
    '70':'Vesoul','71':'Mâcon','72':'Le Mans','73':'Chambéry','74':'Annecy','75':'Paris','76':'Rouen','77':'Meaux','78':'Versailles','79':'Niort',
    '80':'Amiens','81':'Castres','82':'Montauban','83':'Toulon','84':'Avignon','85':'La Roche-sur-Yon','86':'Poitiers','87':'Limoges','88':'Épinal','89':'Auxerre',
    '90':'Belfort','91':'Évry','92':'Nanterre','93':'Bobigny','94':'Créteil','95':'Pontoise',
    '971':'Pointe-à-Pitre','972':'Fort-de-France','973':'Cayenne','974':'Saint-Denis','975':'Saint-Pierre','976':'Mamoudzou','977':'Saint-Barthélemy','978':'Saint-Martin','986':'Wallis','987':'Papeete','988':'Nouméa'
  };

  function postalToDept(cp) {
    if (!cp) return null;
    var clean = String(cp).replace(/\s+/g, '').trim();
    if (!/^\d{4,5}$/.test(clean)) return null;
    var padded = clean.length === 4 ? '0' + clean : clean;
    if (padded.indexOf('20') === 0) {
      var num = parseInt(padded, 10);
      if (num >= 20000 && num <= 20190) return '2A';
      if (num >= 20200 && num <= 20620) return '2B';
      return '2A';
    }
    if (padded.indexOf('97') === 0 || padded.indexOf('98') === 0) return padded.slice(0, 3);
    return padded.slice(0, 2);
  }

  function resolveRcsCity(postalCode, fallback) {
    if (!postalCode) return fallback || null;
    var dept = postalToDept(postalCode);
    if (dept && DEPT_TO_RCS[dept]) return DEPT_TO_RCS[dept];
    return fallback || null;
  }

  function validateRcsCity(postalCode, providedCity) {
    var expected = resolveRcsCity(postalCode);
    if (!expected) return { ok: true, expected: null };
    var norm = function(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s']/g, '');
    };
    if (norm(providedCity) === norm(expected)) return { ok: true, expected: expected };
    return {
      ok: false,
      expected: expected,
      message: 'Le RCS doit être « ' + expected + ' ». La commune « ' + providedCity + ' » dépend du Tribunal de Commerce de ' + expected + '.'
    };
  }

  window.resolveRcsCity = resolveRcsCity;
  window.validateRcsCity = validateRcsCity;
  window.postalToDept = postalToDept;
})();

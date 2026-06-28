#!/usr/bin/env python3
"""
Universal template processor: replaces yellow-highlighted zones
in all .docx templates with {{TAGS}} based on contextual analysis.
"""
import xml.etree.ElementTree as ET
import zipfile, os, shutil, re, sys

ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

# Register all OOXML namespaces to preserve them
for prefix, uri in {
    'w': ns,
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'w15': 'http://schemas.microsoft.com/office/word/2012/wordml',
    'wps': 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'v': 'urn:schemas-microsoft-com:vml',
    'o': 'urn:schemas-microsoft-com:office:office',
}.items():
    ET.register_namespace(prefix, uri)


def is_yellow(run):
    rpr = run.find(f'{{{ns}}}rPr')
    if rpr is None:
        return False
    highlight = rpr.find(f'{{{ns}}}highlight')
    if highlight is not None and highlight.get(f'{{{ns}}}val') == 'yellow':
        return True
    shd = rpr.find(f'{{{ns}}}shd')
    if shd is not None:
        fill = shd.get(f'{{{ns}}}fill', '')
        if fill.upper() in ('FFFF00', 'YELLOW'):
            return True
    return False


def get_text(run):
    t = run.find(f'{{{ns}}}t')
    return t.text if t is not None else ''


def set_text(run, text):
    t = run.find(f'{{{ns}}}t')
    if t is not None:
        t.text = text
        # Preserve spaces
        t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    # Remove highlight
    rpr = run.find(f'{{{ns}}}rPr')
    if rpr is not None:
        for child_tag in ['highlight', 'shd']:
            el = rpr.find(f'{{{ns}}}{child_tag}')
            if el is not None:
                rpr.remove(el)


def get_context(runs, ri):
    """Get surrounding text for context."""
    prev = ''
    nxt = ''
    if ri > 0:
        prev = get_text(runs[ri - 1])
    if ri < len(runs) - 1:
        nxt = get_text(runs[ri + 1])
    return prev, nxt


def analyze_yellow_zones(filepath):
    """Extract all yellow zones with context for analysis."""
    with zipfile.ZipFile(filepath, 'r') as z:
        xml = z.read('word/document.xml').decode('utf-8')
    root = ET.fromstring(xml)
    paragraphs = list(root.iter(f'{{{ns}}}p'))

    zones = []
    for pi, para in enumerate(paragraphs):
        runs = list(para.iter(f'{{{ns}}}r'))
        for ri, run in enumerate(runs):
            if is_yellow(run):
                text = get_text(run)
                prev, nxt = get_context(runs, ri)
                zones.append({
                    'pi': pi, 'ri': ri, 'text': text,
                    'prev': prev, 'next': nxt,
                    'run': run,
                })
    return zones, root, xml


# ============================================================
# TAG MAPPING RULES — contextual pattern matching
# ============================================================

def classify_zone(z, zones, idx, doc_type):
    """Determine the tag for a yellow zone based on content + context."""
    text = z['text'].strip()
    prev = z['prev'].strip().lower()
    nxt = z['next'].strip().lower()

    # --- Company name ---
    if text == 'NOM DE LA SOCIÉTÉ' or text.startswith('NOM DE LA SOC'):
        return '{{NOM_SOCIETE}}'

    # --- Capital amount ---
    if re.match(r'^[\d\.\s]+$', text) and ('capital' in prev or 'capital' in nxt):
        return '{{CAPITAL}}'
    if text == 'capital':
        return '{{CAPITAL}}'

    # --- Capital in words ---
    if text.lower() in ('mille', 'cent', 'deux mille', 'dix mille') and ('euros' in nxt or '(' in nxt):
        return '{{CAPITAL_LETTRES}}'
    # Context: "La somme de [X] euros" or "fixé à [X] euros"
    if ('somme de' in prev or 'fixé à' in prev or 'montant de' in prev) and re.match(r'^[a-zéèêàù\s\-]+$', text.lower()):
        return '{{CAPITAL_LETTRES}}'

    # --- Address (siege) ---
    if re.match(r'^\d+.*(?:rue|avenue|boulevard|bd|impasse|place|chemin)', text, re.I) and ('siège' in prev.lower() or 'siege' in prev.lower() or 'social' in prev.lower() or z['pi'] < 5):
        return '{{ADRESSE_SIEGE}}'
    if text == '5-7, rue de Monttessuy, 75007 Paris' or (re.match(r'^\d+', text) and ('75' in text or '69' in text or '13' in text or '33' in text) and len(text) > 20):
        # Check if it's associate address or siege
        if 'demeurant' in prev or 'domicili' in prev:
            return determine_associate_address_tag(z, zones, idx)
        if 'siège' in prev.lower() or 'siege' in prev.lower() or z['pi'] < 5:
            return '{{ADRESSE_SIEGE}}'
        # Default: check if in header (first 5 paragraphs)
        if z['pi'] < 5:
            return '{{ADRESSE_SIEGE}}'
        return '{{ADRESSE_SIEGE}}'

    # --- Date patterns ---
    if re.match(r'^\d{1,2}/\d{2}/\d{4}$', text):
        if 'né' in prev or 'née' in prev or 'naissance' in prev:
            return determine_associate_date_tag(z, zones, idx)
        if 'marié' in prev or 'mariés' in prev or 'mariage' in prev:
            return '{{DATE_MARIAGE}}'
        if z['pi'] < 10 and ('le' in prev):
            return '{{DATE_ACTE}}'
        return '{{DATE_SIGNATURE}}'
    if re.match(r'^\d{1,2}\s+\w+\s+\d{4}$', text):
        if 'né' in prev or 'née' in prev:
            return determine_associate_date_tag(z, zones, idx)
        if 'terminera' in prev or 'clôture' in prev:
            return '{{DATE_CLOTURE}}'
        return '{{DATE_SIGNATURE}}'
    if re.match(r'^\[-?\]', text):
        if 'fils de' in prev or 'fille de' in prev:
            return '{{NOM_PERE}}'
        if 'et de' in prev:
            return '{{NOM_MERE}}'
        return '{{DATE_SIGNATURE}}'

    # --- Associate identity block ---
    # Pattern: "Monsieur/Madame NOM Prénom"
    if re.match(r'^(Monsieur|Madame|M\.|Mme)', text):
        return determine_person_tag(z, zones, idx, prev, doc_type)

    # --- Birth city ---
    if 'à' == prev.strip() or prev.endswith('à ') or 'née à' in prev or 'né à' in prev:
        return determine_birth_city_tag(z, zones, idx)

    # --- Birth zip/country ---
    if re.match(r'^\(\d{5}\)', text) or re.match(r'^\([\w\s]+\)$', text):
        return determine_birth_zip_tag(z, zones, idx)
    if text.startswith('(') and text.endswith(')'):
        return determine_birth_zip_tag(z, zones, idx)

    # --- Nationality ---
    if text.lower() in ('française', 'francaise') or 'nationalité' in prev:
        return determine_nationality_tag(z, zones, idx)

    # --- Marital status ---
    if text.lower() in ('marié', 'mariée', 'célibataire', 'pacsé', 'pacsée', 'divorcé', 'divorcée'):
        return determine_marital_tag(z, zones, idx)

    # --- Filiation ---
    if 'fils de' in prev or 'fille de' in prev:
        return '{{NOM_PERE}}'
    if 'et de' in prev and idx > 0 and '{{NOM_PERE}}' in str(zones[idx-1].get('tag', '')):
        return '{{NOM_MERE}}'

    # --- Bank ---
    if 'banque' in prev.lower() or 'bank' in text.lower() or text == 'NOM DE LA BANQUE':
        return '{{NOM_BANQUE}}'
    if 'située' in prev:
        return '{{ADRESSE_BANQUE}}'

    # --- Shares ---
    if re.match(r'^\d+$', text) and ('divisé en' in prev or 'parts' in nxt or 'actions' in nxt):
        return '{{NB_PARTS}}'
    if re.match(r'^[a-z\-\s]+$', text) and ('divisé en' in prev):
        return '{{NB_PARTS_LETTRES}}'
    if re.match(r'^\d+$', text) and ('valeur nominale' in prev or 'euro' in nxt):
        return '{{VALEUR_NOMINALE}}'
    if re.match(r'^[a-z]+$', text) and ('actions d' in prev or "parts d'" in prev):
        return '{{VALEUR_NOMINALE_LETTRES}}'

    # --- Objet social (long text) ---
    if len(text) > 100 and ('objet' in prev.lower() or z['pi'] > 90 and z['pi'] < 120):
        # Try to distinguish 3 object clauses
        return determine_objet_tag(z, zones, idx)

    # --- Société mère / holding ---
    if 'I3A' in text or 'COMMUNICATION' in text:
        return '{{SOCIETE_MERE}}'

    # --- Duration ---
    if text == '99 ans' or (re.match(r'^\d+\s*ans$', text)):
        return '{{DUREE}}'

    # --- City alone ---
    if 'fait à' in prev.lower() or 'fait a' in prev.lower():
        return '{{VILLE_SIGNATURE}}'
    if re.match(r'^[A-Z][a-zéèêàù]+,?$', text) and ('rcs' in prev.lower() or 'commerce' in prev.lower()):
        return '{{RCS_VILLE}}'

    # --- Subscription amounts ---
    if re.match(r'^\d+\s*euros?$', text) or re.match(r'^\d+\s*€$', text):
        if 'numéraire' in prev or 'espèces' in prev:
            return determine_subscription_amount_tag(z, zones, idx)
        return '{{MONTANT}}'
    if re.match(r'^\d+\s*%$', text):
        return determine_percentage_tag(z, zones, idx)

    # --- Conjoint specific ---
    if 'épouse' in prev.lower() or 'époux' in prev.lower():
        return '{{CONJOINT_DE}}'
    if 'contrat' in text.lower() or 'séparation' in text.lower():
        return '{{REGIME_MATRIMONIAL}}'

    # --- Propriétaire/locataire ---
    if 'propriétaire' in text.lower() or 'locataire' in text.lower():
        return '{{STATUT_OCCUPATION}}'

    # --- RCS numbers ---
    if re.match(r'^\d{3}\s?\d{3}\s?\d{3}$', text):
        return '{{SIREN_MERE}}'

    # --- Fallback: unknown ---
    return f'{{{{TODO_{z["pi"]}_{z["ri"]}}}}}'


def determine_associate_index(z, zones, idx):
    """Determine which associate (1, 2, 3) this zone belongs to by looking at
    consecutive yellow blocks in the same paragraph group."""
    pi = z['pi']
    # Count how many similar paragraph groups came before this one
    block_count = 0
    seen_paras = set()
    for i in range(idx):
        prev_z = zones[i]
        if prev_z['pi'] not in seen_paras and prev_z['pi'] != pi:
            # Check if it was an associate identity block (same context pattern)
            if any(tag in str(prev_z.get('tag', '')) for tag in ['ASSOCIE_', 'ACTIONNAIRE_']):
                pass
        seen_paras.add(prev_z['pi'])

    # Simpler: look at consecutive paragraph groups with same structure
    # Group yellow zones by paragraph
    para_groups = {}
    for i, zz in enumerate(zones[:idx+1]):
        p = zz['pi']
        if p not in para_groups:
            para_groups[p] = []
        para_groups[p].append(i)

    # Count identity blocks (paragraphs with 6+ yellow runs = associate block)
    identity_paras = [p for p, indices in para_groups.items() if len(indices) >= 5]
    identity_paras.sort()

    if pi in identity_paras:
        return identity_paras.index(pi) + 1

    # Default: based on position
    return 1


def determine_person_tag(z, zones, idx, prev, doc_type):
    """Determine tag for a person name based on context."""
    text = z['text'].strip()
    prev_lower = prev.lower()

    # Conjoint document
    if doc_type == 'conjoint':
        if 'soussign' in prev_lower or z['pi'] < 4:
            return '{{CONJOINT_NOM}}'
        if 'apports' in prev_lower:
            return '{{CIVILITE_NOM_PRENOM_1}}'
        if 'signature' in prev_lower or z['pi'] > 10:
            return '{{CONJOINT_NOM}}'
        return '{{CONJOINT_NOM}}'

    # PV nomination
    if doc_type == 'pv':
        if 'annonce' in prev_lower or 'président' in prev_lower or 'gérant' in prev_lower:
            return '{{PRESIDENT_NOM}}'

    # Declaration non condamnation
    if doc_type == 'declaration':
        if 'soussign' in prev_lower:
            return '{{CIVILITE_NOM_PRENOM_1}}'
        if z['pi'] > 20:
            return '{{CIVILITE_NOM_PRENOM_1}}'

    # Attestation domicile
    if doc_type == 'attestation':
        if 'soussign' in prev_lower or z['pi'] < 8:
            return '{{CIVILITE_NOM_PRENOM_1}}'
        if z['pi'] > 15:
            return '{{CIVILITE_NOM_PRENOM_1}}'

    # Default: try to figure out associate index from paragraph position
    # Signature blocks at the end
    if z['pi'] > len(list(zones)) - 5:
        return determine_signature_tag(z, zones, idx)

    return '{{CIVILITE_NOM_PRENOM_1}}'


def determine_signature_tag(z, zones, idx):
    """Determine signature line tag."""
    # Count how many signature-like zones came before
    sig_count = 0
    for i in range(idx):
        if zones[i].get('tag', '').startswith('{{ACTIONNAIRE_') or zones[i].get('tag', '').startswith('{{ASSOCIE_'):
            sig_count += 1
    return '{{ACTIONNAIRE_' + str(sig_count + 1) + '}}'


def determine_associate_address_tag(z, zones, idx):
    return '{{ADRESSE_ASSOCIE_1}}'

def determine_associate_date_tag(z, zones, idx):
    return '{{DATE_NAISSANCE_1}}'

def determine_birth_city_tag(z, zones, idx):
    return '{{LIEU_NAISSANCE_1}}'

def determine_birth_zip_tag(z, zones, idx):
    return '{{CP_NAISSANCE_1}}'

def determine_nationality_tag(z, zones, idx):
    return '{{NATIONALITE_1}}'

def determine_marital_tag(z, zones, idx):
    return '{{SITUATION_MATRIMONIALE_1}}'

def determine_objet_tag(z, zones, idx):
    # Count previous objet tags
    count = sum(1 for i in range(idx) if 'OBJET_SOCIAL' in str(zones[i].get('tag', '')))
    return '{{OBJET_SOCIAL_' + str(count + 1) + '}}'

def determine_subscription_amount_tag(z, zones, idx):
    return '{{APPORT_NUMERAIRE_1}}'

def determine_percentage_tag(z, zones, idx):
    return '{{LIBERATION_PCT_1}}'


def detect_doc_type(filename):
    """Detect document type from filename."""
    fn = filename.lower()
    if 'statuts' in fn or 'etat' in fn or 'état' in fn:
        return 'statuts'
    if 'pv' in fn or 'nomination' in fn:
        return 'pv'
    if 'souscripteur' in fn or 'liste' in fn:
        return 'liste'
    if 'condamnation' in fn or 'declaration' in fn or 'déclaration' in fn:
        return 'declaration'
    if 'conjoint' in fn or 'mari' in fn:
        return 'conjoint'
    if 'attestation' in fn or 'domicile' in fn:
        return 'attestation'
    return 'unknown'


def process_template(filepath):
    """Process a single template: replace all yellow zones with tags."""
    filename = os.path.basename(filepath)
    doc_type = detect_doc_type(filename)

    print(f"\n{'='*70}")
    print(f"Processing: {filename} (type: {doc_type})")
    print(f"{'='*70}")

    zones, root, xml_str = analyze_yellow_zones(filepath)

    if not zones:
        print("  No yellow zones found, skipping.")
        return

    # First pass: classify all zones
    for idx, z in enumerate(zones):
        z['tag'] = classify_zone(z, zones, idx, doc_type)

    # Second pass: fix associate indexing for multi-associate documents
    # Detect blocks of consecutive yellow runs in same paragraph = one associate
    fix_associate_indices(zones, doc_type)

    # Apply replacements
    paragraphs = list(root.iter(f'{{{ns}}}p'))
    replaced = 0
    for z in zones:
        pi, ri = z['pi'], z['ri']
        if pi >= len(paragraphs):
            continue
        para = paragraphs[pi]
        runs = list(para.iter(f'{{{ns}}}r'))
        if ri >= len(runs):
            continue

        tag = z['tag']
        if not tag or tag == z['text']:
            continue

        old_text = get_text(runs[ri])
        set_text(runs[ri], tag)
        replaced += 1
        print(f"  [{replaced:2d}] p={pi:3d} r={ri:2d}: \"{old_text[:50]}\" -> {tag}")

    # Write back
    new_xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + \
              ET.tostring(root, encoding='unicode', xml_declaration=False)

    with zipfile.ZipFile(filepath, 'r') as zin:
        tmp_path = filepath + '.tmp'
        with zipfile.ZipFile(tmp_path, 'w') as zout:
            for item in zin.infolist():
                if item.filename == 'word/document.xml':
                    zout.writestr(item, new_xml.encode('utf-8'))
                else:
                    zout.writestr(item, zin.read(item.filename))

    os.replace(tmp_path, filepath)
    print(f"  DONE: {replaced} replacements applied")


def fix_associate_indices(zones, doc_type):
    """Fix associate numbering by detecting identity blocks (same paragraph, multiple yellow runs)."""
    # Group zones by paragraph
    para_zones = {}
    for idx, z in enumerate(zones):
        pi = z['pi']
        if pi not in para_zones:
            para_zones[pi] = []
        para_zones[pi].append((idx, z))

    # Find identity blocks (paragraphs with 5+ yellow zones = one associate description)
    identity_blocks = []
    for pi, pzones in sorted(para_zones.items()):
        if len(pzones) >= 5:
            identity_blocks.append(pi)

    # Also look for PV/liste patterns where associate data spans a single paragraph
    # with name, date, city, zip, nationality, address

    # Re-index: for each identity block paragraph, assign associate number
    for block_idx, block_pi in enumerate(identity_blocks):
        assoc_num = block_idx + 1
        for idx, z in para_zones[block_pi]:
            tag = z['tag']
            # Replace _1 suffix with correct associate number
            if '_1}}' in tag:
                z['tag'] = tag.replace('_1}}', f'_{assoc_num}}}')

    # Fix signature blocks at the end
    sig_count = 0
    for z in zones:
        tag = z['tag']
        text = z['text'].strip()
        if re.match(r'^(Monsieur|Madame)', text) and z['pi'] > max(b for b in identity_blocks) if identity_blocks else 0:
            sig_count += 1
            z['tag'] = f'{{{{ACTIONNAIRE_{sig_count}}}}}'


def main():
    templates_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')

    # Process all templates EXCEPT the already-processed ones
    skip = {'statuts-sas.docx', 'declaration-non-condamnation.docx'}

    files = sorted(f for f in os.listdir(templates_dir) if f.endswith('.docx') and f not in skip)

    print(f"Found {len(files)} templates to process")

    for f in files:
        filepath = os.path.join(templates_dir, f)
        try:
            process_template(filepath)
        except Exception as e:
            print(f"  ERROR processing {f}: {e}")
            import traceback
            traceback.print_exc()


if __name__ == '__main__':
    main()

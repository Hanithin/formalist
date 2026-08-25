# Les modèles universels du cabinet, branchés sur les variables de Formalist

Ce document répond à la règle numéro un de la mission : **l'existant prime**. Formalist a
déjà un schéma de champs (`src/domain/modification/types.ts`), un jeu de gabarits en
production et un moteur de rendu. On ne crée pas une seconde nomenclature : le modèle
livré reste tel quel, et une **couche d'adaptation** traduit les données Formalist vers
ses balises.

## 1. L'existant, en trois lignes

| Ce qui existe | Où | Détail |
| --- | --- | --- |
| Moteur de rendu | `web/src/infrastructure/documents/docx.cjs` | docxtemplater, `paragraphLoop: true`, délimiteurs `{{ }}`, suivi d'une longue passe de mise en page héritée |
| Champs du formulaire | `web/src/domain/modification/types.ts` | neuf types de modification, chacun avec ses champs (`nouvelleAdresse`, `capitalActuelAugm`, `apportValeur`…) |
| Jeu de données des actes | `web/src/domain/modification/gabarit.ts` | `donneesDuGabarit()` produit les clés `MAJUSCULES_AVEC_UNDERSCORES` des gabarits en production |

Le modèle livré emploie des balises `{minuscules_avec_underscores}` et des délimiteurs à
**une seule accolade**. Les deux conventions ne peuvent pas cohabiter dans un même rendu.

## 2. Stratégie retenue : couche d'adaptation (option a de la mission)

Le `.docx` livré n'est pas modifié. Une fonction pure
`donneesDuPvAge(contexte)` — `web/src/domain/modification/pv-age.ts` — transforme le
contexte Formalist en objet de balises du modèle, et un chemin de rendu dédié
(`web/src/infrastructure/documents/pv-age.ts`) l'applique avec les délimiteurs à une
accolade, **sans la passe de mise en page héritée** : le modèle porte sa propre feuille
de styles, son pied de page paginé et ses retraits, que cette passe écraserait.

Pourquoi pas le renommage des balises (option b) : Formalist impose bien une convention
dans ses gabarits, mais le modèle est un livrable qu'on veut pouvoir remplacer par une
version corrigée sans toucher au code. La couche d'adaptation se teste unitairement ; le
XML du Word, non.

## 3. Table de correspondance

Action : **réutiliser** (une variable Formalist existe), **dériver** (calculée à partir
de l'existant), **créer** (champ nouveau à saisir), **hors périmètre** (le modèle couvre
un cas que Formalist ne propose pas encore).

### 3.1 En-tête et ouverture

| Balise du modèle | Source Formalist | Action |
| --- | --- | --- |
| `denomination` | `societe.denomination` | réutiliser |
| `forme_sociale` | `formeEnToutesLettres(societe.forme)`, capitale initiale | dériver |
| `capital_actuel` | `societe.capital` | réutiliser |
| `siege_social` | `adresseSurUneLigne(societe.adresse, codePostal, ville)` | réutiliser |
| `rcs_numero` | `societe.siren`, groupé par trois | dériver |
| `rcs_ville` | `societe.villeRcs` (défaut : ville du siège) | réutiliser |
| `date_assemblee` | `assemblee.date` | réutiliser |
| `annee_lettres`, `jour_lettres` | `assemblee.date` | dériver |
| `associes_pluriel`, `titres` | `societe.forme` | dériver (§ 4) |
| `lieu_reunion` | — | dériver : « au siège social » |
| `convocation_par` | `societe.forme` | dériver (§ 4) |
| `president_seance` | `societe.forme` | dériver (§ 4) |
| `formule_adoption` | — | dériver : « adoptée à l'unanimité des {associés} » |
| `lieu_signature` | `societe.ville`, capitale initiale | réutiliser |

### 3.2 Les présents

| Balise | Source | Action |
| --- | --- | --- |
| `participants[].numero` | rang | dériver : « (i) », « (ii) »… |
| `participants[].identification` | `assemblee.associes[]` | dériver : personne physique nommée, personne morale décrite (forme, capital, siège, RCS, représentant) |
| `participants[].nb_titres` | `associes[].parts` | réutiliser |
| `nb_participants_lettres`, `titres_representes`, `total_titres` | `assemblee.associes` | dériver |
| `totalite_presente` | — | dériver : vrai, Formalist ne saisit que les présents |
| `tiers_presents`, `liste_tiers` | — | **hors périmètre** : aucun champ ne recueille les tiers assistant à la réunion |

**Manque identifié** : le modèle attend l'état civil complet de chaque associé personne
physique (naissance, nationalité, domicile). Formalist ne le collecte que pour un
dirigeant nommé. La couche d'adaptation écrit donc ce qu'elle a, sans laisser de crochets
dans l'acte. Compléter le formulaire de l'assemblée est une décision produit, notée ici.

### 3.3 Les résolutions

L'ordre est celui des blocs du modèle, jamais celui de la saisie. Les ordinaux sont
calculés.

| Bloc du modèle | Code Formalist | Action |
| --- | --- | --- |
| `r_transfert_siege` | `transfert_siege` | réutiliser (`nouvelleAdresse`, `dateEffetTransfert`) |
| `r_denomination` | `denomination` | réutiliser (`nouvelleDenomination`, `dateEffetDenomination`) |
| `r_objet_social` | `objet_social` | réutiliser (`nouvelObjetSocial`, `dateEffetObjet`) |
| `r_date_cloture` | — | **hors périmètre** : Formalist ne propose pas le changement de date de clôture |
| `r_dirigeant` | `dirigeant` | réutiliser (nomination, révocation et démission via `fin_mandat`) |
| `r_augmentation_numeraire` | `augmentation_capital` + `modeAugmentation = Apport en numéraire` | réutiliser |
| `r_augmentation_nature` | `augmentation_capital` + `modeAugmentation = Apport en nature` | réutiliser (commissaire, bien commun, article 1832-2) |
| `r_incorporation` | `augmentation_capital` + `modeAugmentation = Incorporation de réserves` | réutiliser |
| `r_reduction` | `reduction_capital` | réutiliser (`motifReduction`, `nbPartsAnnulees`) |
| `r_continuation` | — | **hors périmètre** : la poursuite d'activité malgré des capitaux propres inférieurs à la moitié du capital n'est pas un type proposé |
| `r_cession` | `cession_parts` | réutiliser (agrément déduit de la forme et du destinataire) |
| `r_prorogation` | `prorogation` | réutiliser |
| `r_transformation` | — | **hors périmètre** |
| `r_apport_titres` | `apport_titres` | réutiliser |
| `r_augmentation_remuneration` | `apport_titres` (second volet) | dériver : la rémunération de l'apport suit toujours son approbation |
| `r_dissolution` | parcours « fermeture » | **hors périmètre du PV de modification** : la dissolution a ses propres actes |
| `r_libres` | — | **hors périmètre** : aucun champ de résolution libre |
| Pouvoirs (sans bloc) | — | dériver : toujours en dernier |

Le mode d'augmentation « Compensation de créances » que Formalist propose n'a pas de bloc
dans le modèle : il est rendu par le bloc `r_augmentation_numeraire`, dont les modalités de
souscription disent la compensation. C'est le traitement le plus proche du droit — une
augmentation par compensation reste une souscription en numéraire, libérée par
compensation avec une créance liquide et exigible.

### 3.4 Balises portées par chaque résolution

`ord`, `date_effet`, `formule_adoption` sont résolus dans la portée du bloc : chaque
résolution porte les siennes, sans quoi la date d'effet d'un transfert s'appliquerait à
une augmentation de capital.

## 4. Terminologie dérivée de la forme sociale

Le formulaire ne demande la forme qu'une fois ; tout le reste en découle.

| | SAS, SASU | SARL, EURL | SCI |
| --- | --- | --- | --- |
| `associes_pluriel` | actionnaires | associés | associés |
| `titres` | actions | parts sociales | parts sociales |
| `convocation_par` | du Président | de la gérance | de la gérance |
| `president_seance` | le Président de la Société | le gérant | le gérant |
| `article_capitaux_propres` | L. 225-248 | L. 223-42 | — |
| `fondement_agrement` | les statuts | L. 223-14 du code de commerce | 1861 du code civil |
| Article 1832-2 (bien commun) | inapplicable | applicable | applicable |

## 5. Contrôles de cohérence

Implémentés dans `verifierLePvAge()` et exposés avant la production des actes. Bloquants
(l'acte serait faux) ou avertissements (l'acte est possible mais mérite un regard) :

| Contrôle | Gravité |
| --- | --- |
| Chaîne des capitaux : chaque opération part du capital laissé par la précédente | bloquant |
| Montant d'une augmentation = nombre de titres × valeur nominale | bloquant |
| Cession à un tiers dans une SARL ou une SCI : agrément obligatoire | bloquant |
| Article 1832-2 coché sur une SAS ou SASU : sans objet, les actions ne sont pas des parts non négociables | bloquant |
| Réduction non motivée par des pertes : délai d'opposition des créanciers | avertissement |
| Apport de titres sans augmentation en rémunération, ou l'inverse | bloquant |

## 6. Ce qui manque pour clore la mission

Deux livrables annoncés par la mission ne figuraient pas dans le dossier reçu :

- `NOTICE_MODELE_PV_AGE_UNIVERSEL.md` : le dictionnaire des variables et les tableaux des
  sections 2, 3 et 6. L'ordre canonique, la terminologie et les contrôles ci-dessus ont
  donc été reconstitués depuis le modèle lui-même et les deux PDF de référence.
- `EXEMPLE_DONNEES_SARL.json` : le jeu de données du test de non-régression. Le rendu
  `EXEMPLE_RENDU_SARL.pdf` sert de référence visuelle, et
  `PV_AGE_GREMLINS_COMMUNICATION_20-08-2026.docx` - le même modèle rempli avec un dossier
  Formalist - sert de référence de contenu.

## 7. Les cas de test

| Fichier | Ce qu'il couvre |
| --- | --- |
| `web/tests/unite/pv-age.test.ts` | La couche d'adaptation : terminologie par forme, ordre canonique, ordinaux, identification des associés, contrôles de cohérence |
| `web/tests/integration/pv-age-rendu.test.ts` | Le document rendu : SAS multi-résolutions (transfert + apport 150-0 B ter + augmentation en rémunération) et cas limite (un bloc plus les pouvoirs) |
| `web/tests/unite/modification-gabarit.test.ts` | Le procès-verbal collégial, désormais rendu par le modèle universel |
| `web/tests/integration/cession-actes.test.ts` | L'accord entre le procès-verbal et l'acte de cession sur l'agrément |

Un objet de données ne dit rien du document : un bloc dont la condition ne s'allume pas
laisse un paragraphe vide, une boucle mal fermée duplique une résolution. Les tests de
rendu lisent donc le `.docx` produit, et vérifient l'ordre des intitulés, la
numérotation, la terminologie et l'absence de trace des blocs éteints.

### Ce que ces cas ont révélé

Trois défauts, tous invisibles à la génération et tous corrigés :

- « le cessionnaire en qualité nouvel associé » : le modèle écrit « en sa qualité
  {qualite_nouvel_associe} », la préposition appartient donc à la valeur.
- « l'apport des titres de la société , » : la résolution qui rémunère l'apport nomme la
  société apportée, elle aussi - la balise `societe_cible` n'y était pas portée.
- « la société , détenant 10 actions » : un associé personne morale dont la dénomination
  manque n'ouvre plus la phrase.

---

# Partie II : le traité d'apport de titres

`MODELE_TRAITE_APPORT_TITRES.docx` suit la même stratégie que le procès-verbal : le
livrable n'est pas modifié dans sa rédaction, et une couche d'adaptation
(`web/src/domain/modification/traite-apport.ts`) traduit les champs de Formalist vers
ses balises. Le rendu passe par le même chemin dédié
(`web/src/infrastructure/documents/modeles-cabinet.ts`), sans la passe de mise en page
héritée.

## 8. La numérotation, calculée hors du document

C'est ce qui distingue le traité du procès-verbal : il se renvoie à lui-même.
« les conditions suspensives prévues à l'Article {a_conditions} » est écrit dans les
définitions, à dix pages de l'article visé. Trois éléments sont conditionnels - les
deux articles de l'augmentation en numéraire et celui de l'article 1161 du code civil -
et leur absence décale tout ce qui suit.

`numerotationDuTraite()` compte les seuls éléments actifs et pose leurs numéros dans
les balises : intitulés et renvois lisent la même valeur, donc aucun renvoi ne peut
être faux. Un test suit chaque renvoi jusqu'à l'article qu'il nomme, dans les deux
configurations.

## 9. Table de correspondance

### 9.1 Les parties

| Balise | Source Formalist | Action |
| --- | --- | --- |
| `apporteur_court` | `apporteurNomComplet` | réutiliser |
| `identification_apporteur` | `apporteurNomComplet`, `apporteurNeLe`, `apporteurNeA`, `apporteurNationalite`, `apporteurAdresse` | dériver |
| `double_representation` | `apporteurQualite` contient « représentant légal » | dériver |
| `nom_representant_commun` | `apporteurNomComplet` | réutiliser |
| `denomination_beneficiaire`, `capital_beneficiaire`, `siege_beneficiaire`, `rcs_ville_beneficiaire`, `rcs_numero_beneficiaire` | `societe` (la société modifiée est la bénéficiaire) | réutiliser |
| `forme_beneficiaire` | `formeEnToutesLettres(societe.forme)` | dériver |
| `representant_beneficiaire` | l'apporteur en double représentation, sinon `beneficiaireRepresentant` | **créer** (§ 9.6) |
| `objet_beneficiaire` | `beneficiaireObjet` | **créer** (§ 9.6) |
| `nb_titres_beneficiaire` | `assemblee.totalParts`, à défaut la somme des parts | dériver |
| `valeur_nominale_beneficiaire` | `apportNominaleBeneficiaire` | réutiliser |
| `repartition_capital_beneficiaire` | `assemblee.associes` | dériver |

### 9.2 La société cible et les titres apportés

| Balise | Source | Action |
| --- | --- | --- |
| `denomination_cible`, `capital_cible`, `siege_cible`, `rcs_ville_cible`, `rcs_numero_cible`, `nb_titres_total_cible`, `valeur_nominale_cible` | `apportee*` | réutiliser |
| `forme_cible`, `nature_titres_cible` | `apporteeForme` | dériver |
| `nb_titres_apportes` (+ `_lettres`) | `apportNbTitres` | réutiliser |
| `pourcentage_capital` | `apportNbTitres / apporteeNbTitres` | dériver |
| `origine_propriete`, `justificatif_origine` | `apportOrigineTitres`, `apporteeDateStatuts` | dériver |
| `numerotation_titres` | `apportNumerotation` | dériver (fragment prêt à insérer, ou vide) |
| `contexte_operation` | — | dériver : « une opération de restructuration patrimoniale » |
| `fondement_legal_apport` | `societe.forme` | dériver (§ 9.5) |

### 9.3 Valorisation, commissaire et rémunération

| Balise | Source | Action |
| --- | --- | --- |
| `methode_valorisation`, `valeur_titres` (+ `_lettres`) | `apportMethodeValorisation`, `apportValeur` | réutiliser |
| `criteres_valorisation` | `apportMethodeValorisation` | dériver (trois critères par méthode) |
| `attestation_valorisation` | — | dériver : toujours vrai (§ 9.7) |
| `commissaire`, `commissaire_apports` | `apportCommissaire`, `apportCommissaireNom` | réutiliser |
| `modalite_designation_commissaire` | `societe.forme` | dériver |
| `fondement_dispense_commissaire` | `societe.forme` | dériver (§ 9.5) |
| `montant_augmentation` (+ `_lettres`) | `apportValeur` | réutiliser |
| `mention_prime_apport` | `apportActionsEmises` | dériver (§ 9.8) |
| `nb_actions_nouvelles` (+ `_lettres`) | `apportActionsEmises`, à défaut `apportValeur / apportNominaleBeneficiaire` | dériver |
| `capital_avant`, `capital_apres` (+ `_lettres`) | `planDeCapital()` | dériver |
| `repartition_post_operations` | — | dériver |

### 9.4 Numéraire, fiscal, dispositions générales

| Balise | Source | Action |
| --- | --- | --- |
| `souscription_numeraire` | `apportNumeraire > 0` | dériver |
| `nb_actions_numeraire`, `montant_numeraire`, `mention_prime_numeraire`, `modalites_liberation_numeraire` | `apportNumeraire`, `apportNominaleBeneficiaire` | dériver |
| `regime_150_0_b_ter` | `apportControle === "Oui"` | dériver |
| `detail_controle` | — | dériver |
| `sf_enregistrement`, `sf_tva` | régime retenu | **créer** (§ 9.7) |
| `g_apport`, `g_acceptation` | `souscription_numeraire` | **créer** (§ 9.7) |
| `conditions_suspensives` | nombre d'associés de la bénéficiaire, présence d'un commissaire | dériver |
| `date_butoir` | `apportDateLimiteCondition` | réutiliser |
| `debiteur_frais` | — | dériver : « la Société Bénéficiaire » |
| `cour_appel` | ville du RCS de la bénéficiaire | dériver (§ 9.5) |
| `nb_exemplaires` (+ `_lettres`) | — | dériver : trois - un par partie, un pour les formalités |
| `annexes_presentes`, `annexes` | présence d'un commissaire | dériver |
| `lieu_signature`, `date_signature` | `apportLieuSignature`, `apportDateSignature` | réutiliser |
| `signataires` | apporteur et représentant de la bénéficiaire | dériver |

Le champ `apportCourAppel`, que `gabarit.ts` lisait sans qu'aucun formulaire ne le
demande, n'a plus d'emploi : la cour se déduit du ressort d'immatriculation.

## 9.5 Terminologie dérivée de la forme de la bénéficiaire

| | SAS, SASU | SARL, EURL | SA |
| --- | --- | --- | --- |
| `fondement_legal_apport` | L. 227-1 et L. 225-147 | L. 223-33 | L. 225-147 |
| `fondement_dispense_commissaire` | L. 227-1 renvoyant à L. 223-9 | L. 223-9 | — |
| `modalite_designation_commissaire` | à l'unanimité des actionnaires | à l'unanimité des associés | — |

**La cour d'appel** ne se confond pas avec la ville du registre : Nanterre relève de
Versailles, Bobigny de Paris, Marseille d'Aix-en-Provence. `courDAppel()` la lit sur le
**département**, que le code postal donne, et non sur la ville : chaque département
relève d'une cour et d'une seule, et les cent une entrées couvrent le territoire
entier, outre-mer compris. La ville ne sert que si le code postal manque.

Le champ `apportCourAppel`, qui faisait saisir la cour et était obligatoire, est
supprimé : personne ne la connaît, et un champ obligatoire rempli au jugé produit une
clause attributive fausse.

## 9.6 Les deux champs créés

Aucune variable existante ne les couvre : la société modifiée arrive du registre avec
sa dénomination, son capital et son siège, jamais avec son objet ni son représentant.
Le procès-verbal s'en passe - il a la société en tête d'acte ; le traité la présente à
un tiers.

- `beneficiaireObjet` : l'objet de la holding, repris au préambule (C).
- `beneficiaireRepresentant` : qui l'engage à la signature. Masqué quand l'apporteur en
  est le représentant légal, puisque sa qualité le dit déjà.
- `apportActionsEmises` : le nombre de titres émis en rémunération (§ 9.8). Facultatif :
  laissé vide, il se calcule et la prime est nulle.

## 9.8 La prime d'apport

`paritéDeLApport()` en est la source unique, lue à la fois par le traité et par le
procès-verbal - contrôle f) de la notice : deux actes qui annonceraient un capital
différent laisseraient au greffe le soin de deviner lequel est faux.

Sans nombre de titres saisi, la valeur de l'apport entre entièrement au capital et le
nominal doit la diviser sans reste. Avec un nombre saisi, ce sont les titres qui
commandent : leur nominal monte au capital, et l'écart devient la prime d'apport, qui
va en réserve. C'est l'usage quand on ne veut pas diluer les autres associés, ou quand
le nominal de la holding ne divise pas la valeur retenue.

`montant_augmentation` et `capital_apres` portent donc le nominal, non la valeur
apportée. Le modèle de procès-verbal n'avait pas de place pour la prime : la passe
`scripts/prime-apport-pv.js` y insère la balise `mention_prime_pv`, sur le même
principe que les corrections du § 9.7 - une résolution qui tait la prime laisse au
greffe un écart inexpliqué entre la valeur de l'apport et l'augmentation décidée.

Contrôles : un nombre de titres ne se compte pas en fractions, et les titres émis ne
peuvent pas valoir plus que ce qui est apporté - ils seraient libérés sans
contrepartie.

## 9.7 Trois corrections apportées au modèle livré

Substitutions de texte à l'intérieur de nœuds `<w:t>`, par la passe idempotente
`scripts/numerotation-traite.js` : ni la structure du document, ni ses styles, ni sa
numérotation d'origine ne sont touchés. Elles corrigent des numéros écrits en dur que
les blocs conditionnels décalent.

| Correction | Ce que le document rendu montrait |
| --- | --- |
| Lettres de l'objet (G) rendues variables (`g_apport`, `g_acceptation`) | Sans augmentation en numéraire, l'énumération commençait à « b) » |
| Sous-articles du fiscal rendus variables (`sf_enregistrement`, `sf_tva`) | Sous le régime du sursis, le document passait de 15.2 à 15.6 |
| `attestation_valorisation` toujours actif | Le modèle numérote 5.1 la valeur, 5.2 l'attestation, 5.3 le rapport : éteindre 5.2 faisait sauter de 5.1 à 5.3 |

Trois autres défauts venaient de la couche d'adaptation et y ont été corrigés :
« né le 9 juillet 2003, à Le Chesnay » (virgule et préposition), « réparti entre » un
associé unique, et « ainsi qu'il résulte de des statuts ».

## 10. Contrôles de cohérence du traité

Implémentés dans `verifierLeTraite()`, exposés dans le formulaire et à la route de
paiement - comme ceux du procès-verbal, et pour la même raison : un contrôle qui ne
tourne qu'à la production des actes arrête un dossier déjà réglé.

| Contrôle | Gravité |
| --- | --- |
| La valeur nominale divise exactement la valeur de l'apport (sans quoi il faudrait une prime, que Formalist ne recueille pas) | bloquant |
| Le nombre de titres apportés ne dépasse pas ce que la cible a émis | bloquant |
| Le contrôle de la bénéficiaire est répondu : c'est lui, et lui seul, qui décide du report ou du sursis | bloquant |
| Le commissaire aux apports est indépendant des deux sociétés et de l'apporteur | bloquant |
| La dispense de commissaire n'est invoquée que là où la loi l'ouvre | bloquant |

`double_representation` est déduite automatiquement de la qualité de l'apporteur, ce
que le contrôle c) de la notice demande. La chaîne des capitaux et l'accord entre le
traité et les résolutions du procès-verbal - contrôles a) et f) - reposent sur la même
fonction `planDeCapital()` et les mêmes champs de saisie : les deux actes ne peuvent
pas diverger, faute de source distincte où diverger.

## 11. Les cas de test du traité

| Fichier | Ce qu'il couvre |
| --- | --- |
| `web/tests/integration/traite-apport-rendu.test.ts` | Numérotation sans trou dans les quatre configurations, renvois internes suivis jusqu'à leur article, état civil, accords, chiffres chaînés, les cinq contrôles |
| `web/tests/integration/traite-apport.test.ts` | Aucune trace du dossier d'origine, blocs conditionnels, seuils de remploi de 2026, accord avec le procès-verbal |

## 12. Ce qui reste hors périmètre

- `EXEMPLE_DONNEES_TRAITE.json` sert de référence de contenu ; le test de
  non-régression contre `EXEMPLE_RENDU_TRAITE.pdf` n'est pas automatisé, faute d'une
  comparaison de mise en page fiable en test.
- `tiers_presents`, `liste_tiers`, `r_date_cloture`, `r_continuation`,
  `r_transformation`, `r_libres` du modèle de procès-verbal restent sans formulaire,
  comme noté en section 3.3.

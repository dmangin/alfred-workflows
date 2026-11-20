# 2609-alfred-jxa

Monorepo des workflows Alfred écrits en JXA (JavaScript for Automation) :
pilotage de Wavebox (Gmail, Slack…) et tâches de suivi dans NotePlan, avec une
lib partagée et testée.

## Workflows

| Workflow | Déclencheurs | Effet |
|---|---|---|
| **Follow** | `fel`, `⌥⌘,` (dans Wavebox) | copie le lien de l'onglet actif — message Slack survolé, mail (précédé de son auteur) ou page ; `Cmd+V` pour le coller |
| | `::mp` | colle ce même lien au curseur — message Slack non : tapé ailleurs, Slack perd le survol (utiliser `⌥⌘,`) |
| | `fe <jours> <prio> <action>` | tâche de suivi pour l'onglet actif : message Slack survolé, conversation Gmail ou page |
| | `fe?` | recherche NotePlan sur l'onglet actif : déjà suivi ? |
| | `fex [libellé]` | résout les suivis de l'onglet actif (libellé ajouté à l'historique) et archive le mail |
| | `fe- [libellé]` | annule les suivis de l'onglet actif (libellé ajouté à l'historique) et archive le mail |
| | `feg`, Hyper+`A` | range la note de suivi (tranches, pastilles, récapitulatif), archive ses vieilles tâches fermées et l'ouvre |
| **Wavebox Tabs** | Hyper+`M`/`S`/`W`/`C`, Hyper+`N` | onglet Gmail/Slack/WhatsApp/Agenda (onglet suivant du même service s'il est déjà actif), NotePlan |
| **Paste** | `sdn` puis N, `sd2d`…`sd6d` | colle la date `AAAA-MM-JJ` à J+N jours ouvrés |
| *Gmail Searches* | `gmg` | recherches Gmail prédéfinies — workflow personnel sans code, hors dépôt |

Mots-clés derrière `fe` (*follow*), choisis pour se retenir sans traduire :
`fex` et `fe-` reprennent ce qu'ils écrivent dans NotePlan (`[x]` résolue,
`[-]` annulée), `fel` le *lien* / *link*, `fe?` la question « déjà suivi ? »,
`feg` *go* (ouvrir la note). Chaque titre dans Alfred commence par son raccourci.

Tâche de suivi : `- [ ] !!! 28/09/2026: Suivre @auteur [@: titre](url) >2026-09-30`
— date de création, priorité et action optionnelles. Toutes vont dans la note
de suivi (`Suivi`), dans une section selon l'action :

| Action | Section | Échéance sans nombre de jours |
|---|---|---|
| toute autre que « Suivre » (`fe relancer Bob`) | `## À faire` | aujourd'hui |
| vide ou commençant par le mot « Suivre » (`fe`, `fe 3 suivre devis`) | `## En attente` (de retour) | délai d'attente (2 jours ouvrés) |

Une tâche tapée à la main dans une note du jour y reste : seul ce que `fe`
crée depuis un onglet (mail, message Slack, page) va dans la note de suivi.

**Onglet actif** : un onglet Slack avec un message survolé (ou sélectionné au
clavier) donne le lien de ce message ; une conversation Gmail ouverte, son lien
et son auteur ; tout le reste — un onglet Slack sans message survolé compris —
le lien de la page (`🌐`).

La note de suivi est commune à tous les canaux et créée si absente :

```
# Suivi                              (propriétés --- éventuelles avant)
…                                    ce que tu mets sous le titre (gardé)
| À faire (71) | 🔴 57 | 🟠 4 | …     récapitulatif (tableau) et légende
## À faire
### 🔴 À faire · retard > 7 j        tranches d'échéance, rangées
### 🟠 À faire · retard ≤ 7 j
### 🟣 À faire · aujourd'hui
### 🟡 À faire · 7 prochains jours
### 🔵 À faire · plus tard
### ⚪ À faire · sans échéance
## En attente                        mêmes tranches (« En attente · … »)
## Terminé                           tâches finies en tête ; archivées après 7 jours
## Annulé                            tâches annulées en tête ; 10 gardées, le reste archivé
```

Les deux premières sections sont rangées à chaque `fe`, `fex` et `feg` (après
une échéance changée à la main, `feg` suffit) : chaque tâche ouverte va dans la
sous-section de sa tranche d'échéance, en jours calendaires (tranches vides
omises, titres refaits à chaque fois, précédés d'une ligne vide) ; dans une tranche, `!!!` puis `!!` puis
`!` puis le reste, et à priorité égale l'échéance puis la création les plus
anciennes d'abord. Une tâche emporte les lignes qui la suivent (sous-lignes
`> …`, texte) ; ce qui précède la première tâche d'une section reste en tête.
Une tâche cochée ou annulée dans ces sections part, avec ses sous-lignes, en
tête de `## Terminé` ou `## Annulé` (créées en fin de note si absentes). Le
récapitulatif sous le titre est un tableau de deux lignes, une par section
(« À faire (71) », la première servant d'en-tête), avec une cellule par
tranche : sa pastille et son nombre de tâches, qui ouvre sa sous-section (les
titres sont uniques pour ça) ; la légende des pastilles suit, collée. Les
largeurs de colonnes réglées dans NotePlan (stockées dans la ligne de
séparation, en nombre de tirets) sont gardées d'un rangement à l'autre. Les propriétés,
le titre, ce que tu as mis sous le titre et les autres sections (toute section
ajoutée, ses `###` comprises) ne bougent pas. Une section rangée absente est
recréée ; une ancienne note sans sections voit son bloc de tête rangé sous
`## En attente`. Chaque tâche ouverte d'une section rangée porte une pastille
après sa date de création, celle de sa tranche : 🔵 échéance au-delà de J+7,
🟡 de J+1 à J+7, 🟣 aujourd'hui, 🟠 en retard de 1 à 7 jours, 🔴 au-delà, ⚪ sans
échéance ; rien sur une tâche cochée ou annulée, où qu'elle soit (une tâche
archivée par NotePlan dans `## Terminé` ou `## Annulé` avant un rangement perd
la sienne au suivant). Une tâche planifiée `>date` reste visible dans la note du jour de son
échéance (références de NotePlan).
NotePlan fermé, `feg` ouvre la note sans la toucher.

**Archivage** (`feg`) : les tâches fermées quittent la note, avec leurs
sous-lignes, pour `Suivi — Archives AAAA` (une note par année, créée à côté de
la note de suivi si absente). `## Terminé` garde les tâches cochées depuis 7
jours au plus, d'après leur `@done` (une cochée sans `@done` part, datée du
jour) ; `## Annulé` garde ses 10 premières tâches — les plus récentes, les
annulées y arrivant en tête — et les suivantes partent datées du jour
d'archivage, NotePlan ne datant pas une annulation. Le reste de ces sections
ne bouge pas. Dans une note d'archives, une section `## novembre 2026` par
mois, la plus récente en tête, et dans chaque mois les dernières arrivées en
tête, de la plus récente à la plus ancienne ; ce que tu y ajoutes reste. Les
archives sont écrites et relues avant la note de suivi : en cas d'échec, la
note de suivi reste telle quelle, et une tâche déjà archivée n'est pas
recopiée au passage suivant. Une notification compte les tâches archivées.

**Message déjà suivi** (`fe` alors qu'une tâche ouverte de la note le cite) :
un dialogue « Déjà suivi depuis le … » propose de **compléter** sa tâche (↩)
ou de ne rien faire (Échap). Compléter ajoute `jj/mm/aaaa: <texte saisi>`
(`relance` sans texte) à la suite de la dernière sous-ligne de citation
(`\t> …`) de la tâche, après un retour à la ligne doux (U+2028, comme
Maj+Entrée dans NotePlan : un seul bloc), ou dans une nouvelle sous-ligne
`\t> …` après les existantes s'il n'y en a pas ; il déplace
son échéance au nombre de jours ouvrés saisi (sans nombre : délai d'attente
sous `## En attente`, aujourd'hui sous `## À faire`), remplace sa priorité si
une est saisie (`fe 2 !!! relancé`), puis range la note ; la tâche ne change
pas de section. Plusieurs tâches le citent : la plus récemment créée. Le message est
identifié par l'identifiant de conversation Gmail (`FMfcg…`, le même quels que
soient le libellé et le compte `u/N` de l'URL), l'identifiant du message Slack
(`p1700…`) ou, pour toute autre page, son URL complète ; c'est aussi ce que
`fe?` cherche dans NotePlan. Une URL n'est reconnue qu'à l'identique
(`…/a` ne trouve ni `…/abc` ni `…/a/b`) ; une liste Gmail n'identifie rien.

**Résolution et annulation** (`fex`, `fe-`) : toutes les tâches ouvertes des
sections rangées qui citent le message de l'onglet actif sont cochées et datées
`@done(AAAA-MM-JJ HH:MM)` comme dans NotePlan (`fex`), ou annulées `[-]`
(`fe-`) ; le libellé saisi (`fex réglé par tél.`) est ajouté à l'historique de
la plus récente, comme un complément de `fe` (`jj/mm/aaaa: <libellé>` à la
suite de sa dernière citation) ; le rangement les déplace avec leurs
sous-lignes en tête de `## Terminé` ou de `## Annulé` (section créée en fin de
note si absente). Aucune : un dialogue propose « Créer résolu » ou « Créer
annulé » (tâche déjà fermée, avec le libellé, pour la traçabilité) ou « Ne rien
faire ». Sur une conversation Gmail, `fex` et `fe-` l'archivent
ensuite (bouton Archiver de la page), seulement si elle porte au moins un
libellé à soi — pas un libellé système (boîte de réception, brouillons,
envoyés, catégories…, en anglais ou en français), sauf s'il figure dans la
barre latérale comme libellé (`#label/…`) ; sinon une notification le signale,
le mail reste en place ; rien n'est archivé avec « Ne rien faire ».

**Auteur** (`fe`) : premier expéditeur de la conversation Gmail ouverte,
lu dans la page. Son alias vient de la table `gca_conf_gmail_aliases`
(`adresse = @alias`) ; un expéditeur absent de la table devient `@prénom_nom`
(minuscules, sans accents). Hors conversation (liste, page web), pas d'auteur.

**Jours ouvrés** : un samedi ou un dimanche compte comme le lundi suivant, puis
on ajoute N jours ouvrés (samedi + 0 → lundi, samedi + 1 → mardi).

Lien Slack : `[#️⃣ @AM - #CD,DL,ER,FN - début du message…](permalien)` — voir
[HISTORIQUE.md](HISTORIQUE.md) pour les règles (initiales, DM, groupes, vue
Unreads).

## Organisation

```
lib/                 code partagé, chargé par require('lib/…')
  require.js         chargeur de modules (CommonJS maison, zéro build)
  alfred.js          notifications, erreurs utilisateur, variables d'env
  dates.js           jours ouvrés, formats jj/mm/aaaa, AAAA-MM-JJ, AAAAMMJJ (heure locale)
  noteplan.js        URL scheme NotePlan (ajouts, création de note, recherche), lecture d'une note (AppleScript)
  follow.js          parseur « <jours> <prio> <action> », aiguillage attente/action, ligne de tâche, doublons
  sources/current.js ce que suit l'onglet actif : message Slack, conversation Gmail ou page
  wavebox.js         onglets : recherche, activation, injection JS
  sources/gmail.js   lien de l'onglet courant (nettoyage URL Gmail), auteur de la conversation
  sources/slack.js   capture du message Slack (DOM) et libellé markdown
workflows/<nom>/     script d'entrée + snapshot info.plist/icône (make pull)
tests/run.js         tests unitaires de lib/
tools/               pull.py, icons.py (génère les icônes), probe-dom.js (debug DOM Slack)
```

Chaque script d'entrée commence par un amorçage de quelques lignes : il
retrouve la racine du repo à partir de son propre chemin, puis charge
`lib/require.js`.

## Configuration

Réglée dans Alfred (bouton « Configure Workflow… »), stockée dans le
`prefs.plist` local du workflow, jamais dans le dépôt :

| Variable | Workflows | Rôle |
|---|---|---|
| `gca_conf_gmail_account` | Follow, Wavebox Tabs | adresse du compte Gmail : départage plusieurs comptes ouverts (vide = premier onglet Gmail) |
| `gca_conf_slack_workspace` | Wavebox Tabs | nom de l'espace Slack tel qu'il figure dans le titre de l'onglet (vide = premier onglet Slack) |
| `gca_conf_gmail_app` | Follow | navigateur à piloter (défaut `Wavebox`) |
| `gca_conf_waiting_note` | Follow | titre de la note de suivi (défaut `Suivi` ; nom historique de la variable) |
| `gca_conf_waiting_verb` | Follow | verbe par défaut, qui marque aussi les tâches en attente (défaut `Suivre`) |
| `gca_conf_waiting_days` | Follow | délai par défaut d'une tâche en attente, en jours ouvrés (défaut `2`) |
| `gca_conf_gmail_aliases` | Follow | alias des expéditeurs, une ligne `adresse = @alias` par correspondant |

## Câblage Alfred

Les `info.plist` vivent dans le dossier de préférences Alfred (celui que
`tools/pull.py` lit dans les réglages d'Alfred ; ici synchronisé par iCloud
Drive, qui gère mal les liens symboliques — d'où leur absence). Ils appellent les scripts du repo **par chemin
absolu** : modifier un `.js` agit immédiatement, sans réimport.

- Modifier le câblage (hotkeys, keywords) : dans Alfred Preferences, puis
  `make pull` pour recopier les plist dans le repo, et commit.
- Ne jamais éditer `workflows/*/info.plist` à la main : c'est un snapshot.
- Ne jamais réimporter un workflow : Alfred vide les hotkeys à l'import.

## Icônes

`tools/icons.py install` régénère les icônes dans les dossiers Alfred, puis
`make pull` les recopie ici. Les icônes de Wavebox et NotePlan sont extraites des
applications installées ; Slack, Gmail, WhatsApp, Agenda et le presse-papier
de Paste sont des glyphes SVG dessinés dans le script. Une icône propre à un
objet Alfred (ici `fel`, `⌥⌘,`, `::mp`, `fe`, `fe?`, `fex`, `feg` et Hyper+`A` en Wavebox →
NotePlan) est un fichier `<UID>.png` dans le
dossier du workflow. `tools/icons.py preview <dossier>` produit un aperçu sans
toucher à Alfred.

## Commandes

```sh
make test     # tests unitaires de lib/
make pull     # snapshot des info.plist installés -> workflows/<nom>/
osascript -l JavaScript workflows/follow/follow.js task "2 !!! voir" --dry-run
osascript -l JavaScript workflows/paste/paste.js date 3
```

`--dry-run` (Follow) affiche le lien ou l'URL NotePlan et la note telle
qu'elle serait écrite (« déjà suivi » en tête si `fe` complèterait une tâche),
sans presse-papier, dialogue, activation ni écriture.

## Prérequis

- Wavebox : `View › Developer › Allow JavaScript from Apple Events`.
- macOS : Alfred autorisé dans Automation (Wavebox, NotePlan).
- NotePlan 3.22 ou plus : la note de suivi est lue et réécrite par son
  dictionnaire AppleScript (`readNote`, `writeNote` ; il accepte aussi une note
  du jour par son titre `AAAAMMJJ`), que JXA ne sait pas
  appeler — `lib/noteplan.js` envoie les événements Apple au pid de l'app
  (l'app Claude lance aussi une instance « serveur MCP » de NotePlan). Tout le
  reste passe par l'URL scheme.

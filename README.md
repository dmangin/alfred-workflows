# 2609-alfred-jxa

Monorepo des workflows Alfred écrits en JXA (JavaScript for Automation) :
pilotage de Wavebox (Gmail, Slack…) et tâches de suivi dans NotePlan, avec une
lib partagée et testée.

## Workflows

| Workflow | Déclencheurs | Effet |
|---|---|---|
| **Follow** | `⌥⌘,` (dans Wavebox) | lien markdown du message Slack survolé (ou sélectionné au clavier) → presse-papier, active NotePlan ; `Cmd+V` manuel |
| | `fs <jours> <prio> <action>` | tâche de suivi pour ce message Slack |
| | `⌥⇧T` (Wavebox/Chrome) | tâche de suivi du jour pour le mail (ou la page) courant |
| | `fe <jours> <prio> <action>` | idem, à J+N jours ouvrés |
| **Wavebox Tabs** | Hyper+`M`/`S`/`W`/`C`, Hyper+`N` | onglet Gmail/Slack/WhatsApp/Agenda (onglet suivant du même service s'il est déjà actif), NotePlan |
| **Paste** | `::mp`, `::wb` | colle le lien markdown de l'onglet courant (`@:` mail, `🌐` page web) |
| | `sdn` puis N, `sd2d`…`sd6d` | colle la date `AAAA-MM-JJ` à J+N jours ouvrés |
| *Gmail Searches* | `gmg` | recherches Gmail prédéfinies — workflow personnel sans code, hors dépôt |

Tâche de suivi : `- [ ] !!! 28/09/2026: Suivre XX [@: titre](url)` — date de
création, puis ajout dans la note du jour à **J+N jours ouvrés** (ou en tête de
la note Inbox avec `>AAAA-MM-JJ`, selon la configuration du workflow Follow).
Arguments tous optionnels : `fe` seul = aujourd'hui, action « Suivre ».

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
  noteplan.js        URL addText (note datée ou note Inbox)
  follow.js          parseur « <jours> <prio> <action> », ligne de tâche
  wavebox.js         onglets : recherche, activation, injection JS
  sources/gmail.js   lien de l'onglet courant (nettoyage URL Gmail, destinataires)
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
| `gca_conf_gmail_account` | Follow, Paste, Wavebox Tabs | adresse du compte Gmail : départage plusieurs comptes ouverts (vide = premier onglet Gmail) |
| `gca_conf_slack_workspace` | Wavebox Tabs | nom de l'espace Slack tel qu'il figure dans le titre de l'onglet (vide = premier onglet Slack) |
| `gca_conf_gmail_app` | Follow, Paste | navigateur à piloter (défaut `Wavebox`) |
| `gca_conf_mode_today` | Follow | tâches dans la note du jour (défaut) ou dans une note Inbox |
| `gca_conf_inbox_note` | Follow | titre de la note Inbox (défaut `📥 Inbox`) |

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
objet Alfred (ici `fs` et `⌥⌘,` en Slack → NotePlan, `fe` et `⌥⇧T` en
Wavebox → NotePlan) est un fichier `<UID>.png` dans le
dossier du workflow. `tools/icons.py preview <dossier>` produit un aperçu sans
toucher à Alfred.

## Commandes

```sh
make test     # tests unitaires de lib/
make pull     # snapshot des info.plist installés -> workflows/<nom>/
osascript -l JavaScript workflows/follow/follow.js mail-task "2 !!! voir" --dry-run
osascript -l JavaScript workflows/paste/paste.js date 3
```

`--dry-run` (Follow) affiche le lien ou l'URL NotePlan sans presse-papier,
activation ni ajout.

## Prérequis

- Wavebox : `View › Developer › Allow JavaScript from Apple Events`.
- macOS : Alfred autorisé dans Automation (Wavebox, NotePlan).

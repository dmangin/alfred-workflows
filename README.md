# 2609-alfred-jxa

Monorepo des workflows Alfred écrits en JXA (JavaScript for Automation) :
pilotage de Wavebox (Gmail, Slack…) et tâches de suivi dans NotePlan, avec une
lib partagée et testée.

## Workflows

| Workflow | Déclencheurs | Effet |
|---|---|---|
| **Follow** | `fec`, `⌥⌘,` (dans Wavebox) | copie le lien de l'onglet actif — message Slack survolé, mail (précédé de son auteur) ou page ; `Cmd+V` pour le coller |
| | `::mp` | colle ce même lien au curseur — message Slack non : tapé ailleurs, Slack perd le survol (utiliser `⌥⌘,`) |
| | `fe <jours> <prio> <action>` | tâche de suivi pour l'onglet actif : message Slack survolé, conversation Gmail ou page |
| | `fes` | recherche NotePlan sur l'onglet actif : déjà suivi ? |
| | `fer` | résout les suivis de l'onglet actif et archive le mail |
| | `feg`, Hyper+`A` | trie la note d'attente, met à jour ses pastilles et l'ouvre |
| **Wavebox Tabs** | Hyper+`M`/`S`/`W`/`C`, Hyper+`N` | onglet Gmail/Slack/WhatsApp/Agenda (onglet suivant du même service s'il est déjà actif), NotePlan |
| **Paste** | `sdn` puis N, `sd2d`…`sd6d` | colle la date `AAAA-MM-JJ` à J+N jours ouvrés |
| *Gmail Searches* | `gmg` | recherches Gmail prédéfinies — workflow personnel sans code, hors dépôt |

Mots-clés en anglais derrière `fe` (*follow email*) : `c` *copy*, `s` *search*,
`r` *resolve*, `g` *go*.

Tâche de suivi : `- [ ] !!! 28/09/2026: Suivre @auteur [@: titre](url)` — date de
création, priorité et action optionnelles. Deux destinations, selon l'action :

| Action | Type | Destination | Échéance sans nombre de jours |
|---|---|---|---|
| vide ou commençant par le mot « Suivre » (`fe`, `fe 3 suivre devis`) | en attente de retour | à sa place dans la note d'attente, `… >AAAA-MM-JJ` | délai d'attente (2 jours ouvrés) |
| toute autre (`fe relancer Bob`) | action | note du jour à J+N | aujourd'hui |

**Onglet actif** : un onglet Slack avec un message survolé (ou sélectionné au
clavier) donne le lien de ce message ; une conversation Gmail ouverte, son lien
et son auteur ; tout le reste — un onglet Slack sans message survolé compris —
le lien de la page (`🌐`).

La note d'attente est commune à tous les canaux et créée si absente. Elle est
tenue triée par échéance décroissante : les plus lointaines en haut, les plus
anciennes en bas ; à échéance égale, la plus récente d'abord ; sans échéance,
tout en bas. Chaque `fe` en attente réécrit la note avec la nouvelle tâche à sa
place, et `feg` la retrie (après une échéance changée à la main).
Seul le bloc sous le titre est trié, tâches cochées ou annulées comprises :
une tâche emporte les lignes qui la suivent (sous-lignes `> …`, texte) ; les
propriétés, le titre, ce qui précède la première tâche et les sections
suivantes (`## Terminé`, `## Annulé`) ne bougent pas. Chaque tâche ouverte du
bloc porte une pastille après sa date de création, recalculée à chaque `fe` et
`feg` : 🔵 échéance au-delà de J+7, 🟡 d'aujourd'hui à J+7, 🟠 en retard de 1 à
7 jours, 🔴 au-delà (jours calendaires), ⚪ sans échéance ; rien sur une tâche
cochée ou annulée.
NotePlan fermé, `feg` ouvre la note sans la toucher. Si le
message y a déjà une tâche ouverte, un dialogue « Déjà en attente depuis le … »
propose de créer quand même (↩) ou d'annuler (Échap). Le message est
identifié par l'identifiant de conversation Gmail (`FMfcg…`, le même quels que
soient le libellé et le compte `u/N` de l'URL), l'identifiant du message Slack
(`p1700…`) ou, pour toute autre page, son URL complète ; c'est aussi ce que
`fes` cherche dans NotePlan. Une URL n'est reconnue qu'à l'identique
(`…/a` ne trouve ni `…/abc` ni `…/a/b`) ; une liste Gmail n'identifie rien.

**Résolution** (`fer`) : toutes les tâches ouvertes qui citent le message de
l'onglet actif sont cochées et datées `@done(AAAA-MM-JJ HH:MM)` comme dans
NotePlan. Dans la note d'attente (bloc trié), elles partent avec leurs
sous-lignes en tête de `## Terminé` (section créée en fin de note si absente) ;
dans les notes du jour (tâches d'action), elles sont cochées sur place, de J-60
à J+30 (réglable, environ 18 ms par jour lu). Aucune : un dialogue propose
« Créer résolu » (tâche déjà cochée dans la note d'attente, pour la
traçabilité) ou « Ne rien faire ». Sur une conversation Gmail, `fer` l'archive
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
| `gca_conf_waiting_note` | Follow | titre de la note d'attente (défaut `En attente de retour`) |
| `gca_conf_waiting_verb` | Follow | verbe par défaut, qui marque aussi les tâches en attente (défaut `Suivre`) |
| `gca_conf_waiting_days` | Follow | délai par défaut d'une tâche en attente, en jours ouvrés (défaut `2`) |
| `gca_conf_resolve_days_before`, `gca_conf_resolve_days_after` | Follow | fenêtre des notes du jour où `fer` cherche (défaut J-`60` à J+`30`) |
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
objet Alfred (ici `fec`, `⌥⌘,`, `::mp`, `fe`, `fes`, `fer`, `feg` et Hyper+`A` en Wavebox →
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

`--dry-run` (Follow) affiche le lien ou l'URL NotePlan (suivie de « doublon »
si le message est déjà en attente), sans presse-papier, dialogue, activation
ni ajout.

## Prérequis

- Wavebox : `View › Developer › Allow JavaScript from Apple Events`.
- macOS : Alfred autorisé dans Automation (Wavebox, NotePlan).
- NotePlan 3.22 ou plus : la note d'attente est lue et réécrite par son
  dictionnaire AppleScript (`readNote`, `writeNote` ; une note du jour par son
  titre `AAAAMMJJ`), que JXA ne sait pas
  appeler — `lib/noteplan.js` envoie les événements Apple au pid de l'app
  (l'app Claude lance aussi une instance « serveur MCP » de NotePlan). Tout le
  reste passe par l'URL scheme.

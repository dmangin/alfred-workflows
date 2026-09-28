# Historique — 2609-alfred-jxa

Journal lisible de la conception et des évolutions, coécrit avec Claude Code.
Complète le [README](README.md), qui décrit l'état courant.

## Migration vers le monorepo (28/09/2026)

**Pourquoi** : le code JXA était dispersé (`GMail - Wavebox Actions` vivait
dans le dossier Alfred, hors de `~/dev`, sans versionnement) et dupliqué —
deux algorithmes de jours ouvrés divergents le week-end, des dates en UTC
(`toJSON()`, décalées d'un jour entre minuit et 2 h), trois façons de chercher
un onglet Wavebox. `GMail - Wavebox Actions` mêlait en outre six fonctions sans
rapport.

**Choix validés** (mode plan, un par un) :

| Sujet | Choix | Pourquoi |
|---|---|---|
| Emplacement | `~/dev/utils/2609-alfred-jxa/`, git | un seul repo pour les workflows JXA, convention de préfixe date |
| Partage | `require()` maison (`new Function`) | zéro build : modifier la lib agit tout de suite partout. Écartés : Script Libraries natives (redéploiement, objets JS mal transmis), étape de build (risque de code périmé) |
| Découpage | Follow (mail + Slack), Wavebox Tabs, Paste, Gmail Searches | un workflow par domaine ; `fe` et `fs` partagent le même code |
| Câblage | plist dans Alfred, scripts par chemin absolu, `make pull` | les préférences Alfred sont dans iCloud Drive, qui gère mal les liens symboliques |
| `fs` | même syntaxe que `fe` (`fs 2 !!! répondre`) | cohérence |
| Verbe | « Suivre » | comme les tâches Gmail existantes |
| Week-end | samedi/dimanche = lundi suivant, puis +N | comportement historique de `fe` ; aucune tâche un week-end |

**Déroulé** : sauvegarde des deux workflows (archivée hors du dépôt),
lib + 40 tests, puis nouveaux workflows créés désactivés à partir des objets
existants (UID et hotkeys conservés, aucun réimport), bascule en une fois
(ancien Gmail désactivé, pas supprimé). Parité vérifiée en exécutant l'ancien
et le nouveau code sur les mêmes entrées : lignes `fe` identiques, date `sdN`
identique, lien `::mp` sans l'espace parasite de tête qu'ajoutait l'ancien code.
Le dossier `~/dev/utils/2607-slack-get-link` a ensuite été mis à la Corbeille
(son contenu est archivé hors du dépôt).

**Changements de comportement voulus** :
- `fs` accepte priorité et action ; `fs abc` = action « abc » aujourd'hui
  (même règle permissive que `fe`, au lieu d'une erreur).
- Le week-end, `fs`, `sdN` et `fe` suivent la même règle (`fs 0` un samedi →
  lundi, ce n'est plus le samedi).
- `fs` respecte la configuration « note du jour / note Inbox » de Follow.
- `fe` et `⌥⇧T` affichent une notification de confirmation.
- Hyper+lettre sans onglet correspondant affiche une erreur au lieu de rien.

## Publication (28/09/2026)

Avant d'ouvrir le dépôt au public : exemples réels remplacés par des données
fictives (personnes, messages, identifiants Slack, libellés Gmail), adresse du
compte Gmail et nom de l'espace Slack sortis du code vers la configuration
Alfred (`gca_conf_gmail_account`, `gca_conf_slack_workspace`), suffixe Gmail
des titres retiré de façon générique, workflow Gmail Searches (liste de
recherches personnelles) gardé hors du dépôt, sauvegardes sorties du dépôt, et
historique git repris à zéro — l'historique complet reste archivé en privé.

## Grille et icônes (28/09/2026)

Objets recalés sur la grille Alfred (positions héritées du canevas de l'ancien
workflow Gmail, jusqu'à y=1790). Nouvelles icônes générées par
`tools/icons.py` : Follow = Slack + Wavebox → NotePlan ; `fs` garde Slack →
NotePlan et `fe` passe à Wavebox → NotePlan (icônes d'objets, appliquées aussi
aux hotkeys `⌥⌘,` et `⌥⇧T`) ; Paste = un
presse-papier avec un lien et une date, puisqu'il colle n'importe où ; Wavebox
Tabs = Wavebox et la rangée des services qu'il active (Gmail, Slack,
WhatsApp, Agenda, NotePlan). Les favicons du cache Wavebox (32 px) étant trop
petits, les services sont redessinés en SVG.

## Origine : Slack Get Link (2607-slack-get-link)


### Le besoin

Capturer **sans souris** l'URL d'un message Slack chargé dans le navigateur
(pas l'app Slack), la copier, et la coller dans l'app de prise de notes —
le tout via une hotkey Alfred.

### Choix techniques (validés en mode plan, 03/07/2026)

| Décision | Choix | Pourquoi |
|---|---|---|
| Navigateur | Wavebox | C'est là que Slack tourne ; Chromium → injection JS via AppleScript (`execute javascript`, vérifié dans son `scripting.sdef`) |
| Message ciblé | Survolé à la souris (`:hover`), repli sur la sélection clavier (`document.activeElement`) | Correspond à l'usage réel ; le permalien est lu sur le lien du timestamp du message (inclut `thread_ts` dans les fils) |
| Destination | NotePlan, collage au curseur | Activation de l'app + `Cmd+V` simulé via System Events |
| Langage | JXA pur (JavaScript for Automation) | Seul langage parlant nativement au navigateur et à NotePlan ; zéro compilation, zéro dépendance |
| Installation | Bundle `.alfredworkflow` généré (`build.sh`) | Le workflow appelle `slack-get-link.js` par chemin absolu → modifier le script ne demande jamais de réinstaller (bundle abandonné en 09/2026 : les plist restent dans Alfred) |
| Icône | Glyphe Slack (SVG dessiné) + icône NotePlan (extraite localement de l'app via `iconutil`), composés par `rsvg-convert` | Aucun téléchargement ; source dans `icon.svg` |

Prérequis one-time : Wavebox → View › Developer › **Allow JavaScript from
Apple Events** ; Alfred autorisé dans Automation + Accessibilité.

### Évolutions du libellé

1. `[Slack — @auteur dans #canal](url)` — version initiale.
2. Ajout du **début du message** (60 caractères max) : `Slack - @auteur - #canal - début…`
3. **Initiales** pour les noms de personnes : `@Alice Martin` → `@AM`.
   Règle : seuls les composants multi-mots sont réduits (un canal `#dev-web`
   ou un bot `@GitHub` restent intacts) ; chaque élément d'une liste séparée
   par des virgules est traité individuellement.
4. Personnalisations de Damien : préfixe `#️⃣`, format `#DM-X` pour les DM 1-1.
5. Groupes compactés `#CD,DL,ER,FN` (sans espaces), suppression du mot
   « Slack », emoji accolé à l'auteur. Format final :
   `[#️⃣ @AM - #CD,DL,ER,FN - Pour info, le point de demain est décalé à 14 h, je…](url)`

Robustesse markdown : crochets supprimés des libellés (pas d'échappement,
rendu variable selon les parseurs), sauts de ligne aplatis, troncature en
points de code (ne coupe jamais un emoji en deux), repli sur l'URL brute si
tous les segments sont vides.

### Modes d'invocation (28/09/2026)

Le collage automatique au curseur (`Cmd+V` simulé) produisait trop de liens
collés au mauvais endroit. Remplacé par deux modes :

- **Hotkey `⌥⌘,`** (mode par défaut, sans argument) : copie le lien et active
  NotePlan, **sans coller** — `Cmd+V` manuel. Plus besoin du droit
  Accessibilité.
- **Keyword `fs N`** (« Follow Slack », `--today N` ; nommé `::stn` jusqu'au
  28/09/2026, renommé par cohérence avec `fe N`) : ajoute `- [ ] jj/mm/aaaa: suivre <lien>`
  dans la note du jour situé N jours ouvrés plus tard, via
  `noteplan://x-callback-url/addText?noteDate=AAAAMMJJ&openNote=yes`. Modèle
  repris du workflow Gmail « fe » : la date écrite dans la ligne est celle de
  **création** (aujourd'hui), la note cible est J+N.

Différences volontaires avec le workflow Gmail : jours ouvrés comptés par une
boucle simple (N = 0 → aujourd'hui même un week-end), dates formatées en heure
locale (le `toJSON()` du workflow Gmail est en UTC et décale d'un jour entre
minuit et 2 h). Option `--dry-run` pour tester sans effet de bord.

### Bugs rencontrés et leçons

#### `#UCSBRO` depuis la vue Unreads (18/08/2026)

Dans les vues agrégées (Unreads, Threads…), `[data-qa="channel_name"]` est le
bandeau de la **vue** — texte « UnreadsAll conversations Sorted by recommended
order » — que la réduction en initiales transformait en `UCSBRO` constant.
Marqueur fiable d'une vue agrégée : l'URL n'a pas d'id de conversation
(`/client/T…` sans `/C|D|G…`). Correctif : y chercher l'en-tête de groupe qui
précède le message dans la liste virtuelle.

#### `#CD, DL, 2O` dans les groupes privés >2 personnes (18/08/2026)

Slack tronque l'en-tête des groupes (« Chloé Durand, David Leroy,
2 others »). La liste complète des membres vit à trois endroits : l'entrée de
la **sidebar**, le `document.title`, et l'`aria-label` du bouton d'en-tête.
Correctif (source prioritaire pour les groupes) : l'entrée sidebar
`[data-qa-channel-sidebar-channel-id="<id du permalien>"]`, qui donne aussi le
**type réel** via `data-qa-channel-sidebar-channel-type` (`im`/`mpim`/
`channel`) — précieux car les DM de groupe modernes ont un id en `C…` et
étaient typés à tort comme des canaux.

#### Leçons DOM Slack

- Privilégier les attributs `data-qa` (stables) aux classes CSS.
- Le lien du timestamp d'un message EST son permalien complet.
- Les sélecteurs à risque sont regroupés en tête de `PAYLOAD` dans
  `lib/sources/slack.js` (ex-`_PAYLOAD` de `slack-get-link.js`) — seul
  endroit à ajuster si Slack change son markup.
- Pour re-diagnostiquer : `tools/probe-dom.js`, sonde « patiente » qui attend
  jusqu'à 30 s qu'un message soit survolé puis dump le DOM en JSON.
  À lancer depuis un Terminal :
  `osascript -l JavaScript tools/probe-dom.js > probe-out.json`

#### Leçons macOS/TCC

- Chaque app cliente (Alfred, Terminal, Claude…) a SES propres autorisations
  Automation vers Wavebox/System Events/NotePlan ; celle d'Alfred est la seule
  nécessaire au workflow.
- Re-cocher une case Automation refusée ne prend effet qu'après redémarrage de
  l'app cliente.
- La notification d'erreur du script indique toujours l'étape en cause
  (injection refusée, aucun message survolé, frappe refusée…) ; le lien est
  copié au presse-papier avant le collage, donc récupérable même si `Cmd+V`
  échoue.

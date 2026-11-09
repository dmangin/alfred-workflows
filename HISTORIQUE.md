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

## Attente de retour et statut (03/11/2026)

**Besoin** : séparer les mails et messages Slack pour lesquels on attend
seulement une réponse de ceux sur lesquels il faut agir, et savoir depuis un
mail s'il est déjà suivi.

**Choix validés** :

| Sujet | Choix | Pourquoi |
|---|---|---|
| Aiguillage | selon l'action : vide ou commençant par le verbe par défaut (« Suivre », mot entier, casse ignorée) → note d'attente ; sinon → note du jour | pas de nouveaux keywords (`fed`, `fsd`… doubleraient les commandes à chaque canal) ; `fe 3 suivre devis` garde un commentaire |
| Note d'attente | une seule, tous canaux, configurable, ajout en tête avec `>AAAA-MM-JJ` | reprend le format de l'ancien mode Inbox ; NotePlan montre la tâche dans la note du jour de l'échéance |
| Délais par défaut | attente : configurable (2 jours ouvrés) ; action : aujourd'hui | une attente à J+0 est en retard tout de suite ; une action tapée sans délai est urgente |
| ⌥⇧T | toujours une action du jour (`--action`) | usage « à traiter aujourd'hui » |
| Verbe | configurable (`gca_conf_waiting_verb`) | il sert à la fois de texte par défaut et de marqueur d'attente |
| Mode Inbox | retiré (`gca_conf_mode_today`, `gca_conf_inbox_note`) | l'interrupteur global devient inutile une fois l'aiguillage fait tâche par tâche ; il n'était pas utilisé |
| Statut | `fes`/`fss` ouvrent la recherche NotePlan sur l'identifiant du message | le plus simple, couvre toutes les notes (du jour comprises) et montre les tâches faites. Écarté : un libellé ou une étoile Gmail (pilotage fragile des menus, et il resterait une fois la tâche faite) |
| Doublons | avertir et créer, sur la note d'attente seulement | une relance reste possible ; une seule note à lire |
| Identifiant | jeton de conversation Gmail, `p…` du message Slack, sinon URL complète de la page (suggestion de Damien) | `fe`/`fes` marchent sur tout onglet ; pour Gmail, l'URL dépend du compte `u/N`, pas le jeton. Correspondance exacte (clé suivie de `) ? & #` ou d'une espace) ; la recherche NotePlan accepte une URL complète (vérifié avec `? & = #`) |

**Après les premiers essais** (même jour) :

| Sujet | Choix | Pourquoi |
|---|---|---|
| `fe`/`fs`, `fes`/`fss` | fusionnés en `fe` et `fes`, qui regardent l'onglet actif (idée de Damien) | deux keywords par canal, difficiles à retenir ; un onglet Slack sans message survolé est suivi comme une page |
| Doublon | dialogue Créer quand même / Annuler au lieu d'une phrase dans la notification | la notification passait inaperçue ; puisqu'il faut cliquer, autant pouvoir annuler |
| Accès à la note | `feg` et Hyper+`A` (« attente » ; Hyper+`W` est WhatsApp), dans Follow | c'est Follow qui connaît le titre de la note (sa configuration) |
| ⌥⇧T | supprimé après usage | doublon de `fe <action>` (action du jour, avec un vrai verbe au lieu de « Suivre »), et jamais retenu |
| Statut dans Alfred | abandonné, `fes` reste une recherche NotePlan | lister les résultats dans Alfred demanderait de lire toutes les notes du jour (28 s en AppleScript) ou un accès aux fichiers de NotePlan |
| Doublons dans les notes du jour | abandonné | même coût ; après la migration, les tâches en attente sont toutes dans la note d'attente |
| Ordre d'ajout | fin de la note du jour (journal), tête de la note d'attente (les plus récentes visibles) | l'ordre utile, par échéance, demanderait de réécrire la note ; NotePlan montre de toute façon chaque tâche le jour de son échéance |

**Copie du lien (04/11/2026)** : ⌥⌘, ne copiait que le lien d'un message
Slack, alors qu'un lien de mail passait par `::mp` (Paste). Une seule action
`copy` (keyword `fec` et ⌥⌘,, choix de Damien : les deux pour commencer)
copie désormais le lien de l'onglet actif avec la même détection que `fe` —
message Slack survolé, conversation Gmail précédée de son auteur comme dans
une tâche, sinon la page —, sans plus activer NotePlan : le lien peut se
coller ailleurs, et Hyper+`N` active NotePlan.

**`::mp` rejoint Follow (04/11/2026)** : `::mp` (Paste) collait le lien avec les
destinataires que l'ancienne extension Wavebox ajoutait au titre — extension
retirée depuis longtemps, ce code ne servait plus. Pour coller exactement ce que
copie `fec` (auteur d'un mail, message Slack survolé), il lui faut la table
d'alias de Follow ; deux workflows Alfred ne partagent pas leur configuration,
d'où le déplacement du snippet `::mp` dans Follow (commande `link`, collage par
Alfred). `::wb`, doublon inutilisé, est supprimé. Paste ne garde que les dates
et n'a plus de configuration ; le nom « Follow » reste (choix de Damien).
Limite : `::mp` se tape dans une autre fenêtre, Slack a donc perdu le survol et
le lien collé est celui de la page ; pour un message, `⌥⌘,` dans Slack puis
`Cmd+V`.

**Tri par échéance (09/11/2026)** : l'ajout en tête mélangeait les nouvelles
tâches aux anciennes. Choix de Damien : échéances décroissantes (les plus
anciennes en bas, logique avec des ajouts en haut), `fe` place la tâche à sa
place en réécrivant la note (`writeNote`, la note est déjà lue pour les
doublons) et `fet` retrie à la demande ; tâches cochées ou annulées du bloc
triées avec les autres ; une tâche emporte les lignes qui la suivent. À
échéance égale, la plus récemment créée d'abord ; sans échéance, en bas. Seul
le bloc sous le titre bouge. Vérifié sur une copie de la note réelle (mêmes
lignes, archives et sous-lignes intactes) et sur une note jetable ; note
sauvegardée avant la première réécriture. `prependUrl` n'a plus d'usage.

**Pastilles d'échéance (09/11/2026)** : pour repérer d'un coup d'œil les
tâches qui pressent, chaque tâche ouverte du bloc trié reçoit une pastille
après sa date de création (`- [ ] !!! 28/10/2026: 🔴 Suivre …`) : 🟡 échéance
d'aujourd'hui à J+7, 🟠 en retard de 1 à 7 jours, 🔴 au-delà, rien plus loin ;
en jours calendaires. Un emoji plutôt qu'un style de thème NotePlan : marche
avec tout thème, sur mobile, sans réglage. Placée après la date de création
pour garder la priorité `!!!` et les styles de thème qui attendent
`!!! jj/mm/aaaa:` derrière la case. Recalculée à chaque `fe` en attente et
`feg` ; retirée d'une tâche cochée ou annulée. Colorer impose de réécrire la
note : `feg` trie donc aussi, et `fet` disparaît (même effet). NotePlan fermé,
`feg` l'ouvre par URL sans rien mettre à jour (jamais de lancement direct).
Après essai, toute tâche ouverte a sa pastille : 🔵 au-delà de J+7 (bleu
plutôt que vert, qui se lirait « fait »), ⚪ sans échéance — une tâche que
NotePlan ne remontera dans aucune note du jour, à planifier.

**Deux NotePlan (06/11/2026)** : `fe` en attente ne faisait plus rien. L'app
Claude lance désormais le binaire de NotePlan en serveur MCP (`NotePlan
mcp-server`), que macOS enregistre comme une seconde app « NotePlan » ;
`tell application "NotePlan"` visait cette instance : erreur -600, ou plantage
d'osascript via NSAppleScript. `readNote` envoie maintenant l'événement Apple
directement au pid de l'instance principale (celle lancée sans `mcp-server`).
Pas de lancement automatique : NotePlan refuse une seconde instance (essai
malheureux, deux instances en trop lancées puis fermées). Les URL
`noteplan://` arrivent bien à l'instance principale. Au passage : l'auteur
d'un mail ouvert depuis un libellé imbriqué (`#label/A%2FB/<jeton>`) n'était
pas détecté, le test de conversation ouverte n'acceptant qu'un niveau.

**Migration (03/11/2026)** : les tâches « Suivre » encore ouvertes des notes du
jour ont été déplacées une fois pour toutes vers la note d'attente, par un
script ponctuel (hors dépôt, archivé avec la sauvegarde des notes) :
aperçu validé par Damien, puis ajout en fin de note d'attente (échéance la
plus récente d'abord ; échéance = `>date` de la ligne, sinon date de la note
du jour), puis retrait des notes du jour. Résultat : 115 tâches déplacées,
5 relances retirées (pour un même mail, on garde l'échéance la plus récente,
puis la création la plus récente), 1 tâche laissée en place (« Suivre » pas
en tête), 66 notes du jour modifiées, toutes les autres inchangées (vérifié
par un nouveau scan). Ordre retenu pour ne rien perdre : vérifier toutes les
notes, écrire la note d'attente, puis seulement retirer les lignes.

Piège rencontré : `osascript -e '…' <arguments>` prend pour une option un
argument qui commence par « - » (une note dont la première ligne est une
tâche) — passer en premier un argument qui n'en commence pas.

**URL scheme ou AppleScript** : toutes les écritures et la recherche passent
par l'URL scheme, comme la note du jour (choix de Damien : la simplicité).
AppleScript ne sert qu'à **lire** la note d'attente, ce qu'une URL ne sait pas
faire : savoir si elle existe et y chercher un doublon, en une seule lecture.

**Constats NotePlan (3.22)** :
- `addText?noteTitle=…` sur une note absente ne fait rien, sans erreur : la
  note d'attente est créée avec la tâche par `addNote?noteTitle=…&text=…`.
  `mode=prepend` insère sous le titre.
- Un `addText` lancé une seconde après la création d'une note peut se perdre
  (indexation) ; sans conséquence ici, deux ajouts étant espacés.
- Le dictionnaire AppleScript (`readNote`, `insertContent`, `findNotes`…)
  fonctionne depuis `osascript -e`, mais JXA répond « message
  incompréhensible » (-1708) : `lib/noteplan.js` passe par `NSAppleScript`.
- `findNotes` ignore les notes du jour : inutilisable pour un statut complet,
  d'où la recherche de l'app (`search?text=…`).

## Auteur des conversations Gmail (29/09/2026)

`fe` et `⌥⇧T` écrivent l'auteur de la conversation dans la tâche :
`- [ ] jj/mm/aaaa: Suivre @auteur [@: sujet](url)`. Il remplace les
destinataires `<|@xy @zz|>` que l'extension Wavebox « mail.google.com sender in
title » ajoutait au titre : l'extension demandait un service worker et une
table maintenue à part, et se déclenchait de façon peu fiable. Désormais le
script lit la page au moment de l'action (injection JS).

- **Auteur** = premier expéditeur : chaque message, replié ou déplié, porte un
  `span.gD` avec les attributs `email` et `name`, dans l'ordre chronologique.
- **Alias** : table `adresse = @alias` dans la configuration Alfred de Follow
  (`gca_conf_gmail_aliases`, stockée dans le `prefs.plist` local, hors dépôt),
  reprise de l'extension. Expéditeur inconnu : `@prénom_nom` en minuscules,
  sans accents (choix : homogène avec les alias existants).
- Le marqueur `<|…|>` reste retiré des sujets tant que l'extension est installée
  (code retiré le 04/11/2026, l'extension n'étant plus installée).

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

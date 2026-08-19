---
name: mangaforge
description: >
  Skill pour développer et maintenir MangaForge — une PWA single-file (index.html) pour créateurs de manga.
  Stack : HTML/CSS/JS vanilla, Firebase (Firestore/Storage/Auth), Cloudinary, Mistral IA, ElevenLabs TTS, Pollinations.ai.
  Utilise ce skill dès que l'utilisateur parle de MangaForge, du studio, de l'éditeur de planches, de l'IA assistant,
  de l'explorer vidéo, du lecteur HTML, des épisodes, des histoires, du fil d'actualité, ou de tout bug/feature
  sur cette application. Ne pas utiliser pour des projets web génériques non liés à MangaForge.
sources: [chat]
aliases: [mangaforge, manga-forge, studio manga, éditeur manga]
---

# MangaForge — Guide de développement

## Architecture

**Fichier unique** : tout est dans `/home/claude/index.html` (≈400Ko).
**Outputs** : copier vers `/mnt/user-data/outputs/index.html` et appeler `present_files`.
**Workflow obligatoire** :
1. Modifier `/home/claude/index.html`
2. Valider le JS avec Node.js (voir section Validation)
3. Copier vers outputs
4. `present_files`

**Ne jamais** modifier directement `/mnt/user-data/outputs/index.html`.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | HTML5 + CSS3 + JS vanilla (ES6+) |
| Auth/DB | Firebase v10 (compat mode) — Firestore + Storage + Auth |
| Médias | Cloudinary (upload images/vidéos) |
| IA texte | Mistral via serveur Render `https://mangaforge-server.onrender.com/api/chat` |
| IA vision | Mistral Pixtral (format `image_url` base64) |
| IA images | Pollinations.ai (flux model, sans clé) |
| TTS voix | ElevenLabs API (`eleven_multilingual_v2`) — clé `sk_7550346cb8dcf5deab6bfcca5840508ffa23c160f9bf5395` |
| Vidéos | YouTube via Invidious API + RSS rss2json.com |
| PWA | Service Worker `sw.js`, manifest `manifest.json` |

---

## Structure des onglets

| Onglet | ID section | Fonction |
|--------|-----------|---------|
| Fil | `tab-feed` | Posts communauté, actualité |
| Explorer | `tab-explorer` | Vidéos YouTube manga (TikTok-style) |
| Histoires | `tab-stories` | Catalogue mangas/histoires |
| Communauté | `tab-community` | Profils créateurs |
| MangaDex | `tab-mangadex` | Lecteur MangaDex intégré |
| Studio | `tab-studio` | Dashboard créateur |
| Réglages | `tab-settings` | Paramètres utilisateur |
| Profil | `tab-profile` | Page profil |

---

## Composants clés

### Assistant IA (`aiFSend`, `callClaude`)
- Historique persisté dans `localStorage['mf-ai-convs']`
- Shimmer + statut animé pendant la réflexion (`aiSetStatus`)
- Bouton envoi → stop (`aiSendOrStop`, `aiSetSendMode`)
- Images envoyées en base64 format Pixtral : `{ type:'image_url', image_url:{url:'data:mime;base64,...'} }`
- **Bug fréquent** : `imageAttachments` doit être déclaré dans `aiFSend` avant l'appel à `callClaude`

### Studio / Éditeur de planches (`openMangaEditor`, objet `ME`)
- 2 modes mobiles : **PLANCHE** (`me-canvas-screen`) et **GÉNÉRER IMAGE IA** (`me-ai-screen`)
- `meSwitchMode('canvas'|'ai')` pour basculer
- Canvas généré par `meRenderPages()` — pages stockées dans `ME.pages[]`
- Grilles prédéfinies : `meApplyGrid('manga5')`, `meApplyGrid('manga7')`, etc.
- Export PNG via `html2canvas` chargé dynamiquement depuis CDN
- Génération IA : Pollinations.ai flux, `meGenerateAiImageFull()`

### Lecteur HTML (`openHtmlReader`, `initHtmlPullToNext`)
- Iframe sandboxée avec script injecté pour détecter fin de scroll
- Pull-to-next via overlay `#html-pull-zone` (35% bas de l'écran)
- `postMessage('mf:atBottom')` depuis iframe → active le pull
- ElevenLabs TTS via `toggleHtmlReaderVoice()`

### Explorer vidéos (`loadExplorerVideos`, `buildExpCard`)
- Plein écran en mode `body.explorer-mode` (CSS `!important` + JS `setProperty`)
- Sources : RSS YouTube → rss2json.com → Invidious → fallback hardcodé
- Filtre strict manga : `EXP_MANGA_KEYWORDS` (whitelist) + `EXP_EXCLUDE_WORDS` (blacklist)
- Barre de recherche du header connectée via `window._currentTab`

### ElevenLabs TTS (`elSpeak`, `elStop`, `elToggle`)
- `EL_VOICES.ai` = Adam (réponses IA)
- `EL_VOICES.reader` = Antoni (lecture épisodes)
- Chunks de 2200 chars max, lecture séquentielle
- Fallback `speechSynthesis` si API échoue

---

## Règles de développement

### CSS
- **Jamais** de glassmorphism (`backdrop-filter`) sur les éléments principaux
- Thème dark uniquement : bg `#0f1117`/`#161920`/`#1d2028`, texte `#eaeef5`/`#c8cdd8`
- Footer nav : fond solide `#13151f`, pas de transparence
- Bulles utilisateur IA : `rgba(255,255,255,.07)` — **pas de rouge**
- Explorer en plein écran : `body.explorer-mode` cache header + footer + bouton IA

### JS
- **Apostrophes** dans les strings JS : toujours utiliser `\'` ou éviter les mots français avec apostrophe (`l'image` → `une image`)
- Tester après chaque modification avec le validateur Node.js
- `imageAttachments` doit être défini localement dans `aiFSend` avant utilisation
- Stocker les données JSON pour `onclick` dans `window[key]` (pas d'inline JSON)
- `aiPublishStory(storyKey)` lit depuis `window[storyKey]`

### Firebase
- Episodes HTML : toujours inclure `storyId`, `_v:1`, `authorId` pour éviter suppression auto
- Règles Firestore : vérifier que les champs requis sont présents avant save

---

## Validation JS (obligatoire avant chaque livraison)

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('/home/claude/index.html', 'utf8');
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
let m,i=0,errors=0;
while((m=re.exec(content))!==null){
  try{new Function(m[1]);}
  catch(e){if(!e.message.includes('import')){console.log('Block',i,'ERROR:',e.message);errors++;}}
  i++;
}
console.log(errors===0?'✅ Zero erreur':'❌ '+errors+' erreur(s)');
"
```

**Erreurs fréquentes :**
- `Unexpected identifier 'xxx'` → apostrophe française dans une string JS
- `Identifier 'X' has already been declared` → variable `const` dupliquée (ex: `const feed`)
- `missing ) after argument list` → JSON inline dans `onclick` avec guillemets imbriqués

---

## Workflow de modification

```python
# Toujours utiliser python3 pour les remplacements complexes
with open('/home/claude/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Faire les modifications
content = content.replace(old, new, 1)

with open('/home/claude/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
```

Pour les modifications par numéro de ligne :
```python
with open('/home/claude/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

lines[N:M] = [nouveau_contenu]

with open('/home/claude/index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)
```

---

## Déploiement

L'utilisateur déploie manuellement sur **GitHub Pages** (repo `marcelaagbassi-create`).
Après chaque livraison, rappeler de pousser le fichier sur GitHub pour voir les changements en production.

---

## Bugs connus et solutions

| Bug | Cause | Solution |
|-----|-------|---------|
| `imageAttachments is not defined` | Variable déclarée dans mauvais scope | Déclarer `let imageAttachments = []` avant le bloc `if(aiAttachments...)` |
| Vidéos non-manga dans Explorer | Fallback IDs incorrects | Vérifier `getFallbackVideos()` — aucun ID K-pop |
| Footer transparent | CSS nav `background` trop léger | `#13151f` + `box-shadow` dense |
| Episode HTML supprimé | Champs Firestore manquants | Ajouter `storyId`, `_v:1`, `authorId` |
| Spinner pull-to-next trop tôt | Iframe capte les touches | Overlay `#html-pull-zone` au z-index:10 |
| JSON dans onclick cassé | Guillemets imbriqués | Stocker dans `window[key]` |

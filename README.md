# ATELIER — Job Scraper & Proposal System

Système automatisé de veille d'offres d'emploi, scoring IA, et génération de proposals pour ATELIER (Bastien Joubert). Scrape RemoteOK, LinkedIn et Upwork, score chaque offre avec DeepSeek, génère des proposals personnalisées, et sauvegarde tout dans Google Sheets.

---

## Architecture

```
find-jobs.js          ← Point d'entrée, pipeline en 5 étapes
├── src/scrapers/     ← Scraping par plateforme
├── src/scorer.js     ← Scoring keyword + analyse DeepSeek
├── src/sheets.js     ← Google Sheets API (lecture + écriture)
├── src/telegram.js   ← Rapport quotidien Telegram
├── data/profile.md   ← Profil ATELIER injecté dans les prompts DeepSeek
├── config/index.js   ← Chargement de la config (.env)
├── google-apps-script.js  ← Script à coller dans Apps Script du Sheet
└── .github/workflows/weekly-scan.yml  ← GitHub Actions (cron lun/jeu)
```

---

## Pipeline (6 étapes)

```
1. Scraping        → Récupère les offres brutes des plateformes
2. Filtre 10j      → Garde seulement les offres des 10 derniers jours
3. Déduplication   → Ignore les URLs déjà présentes dans le Sheet
4. Scoring + IA    → Score keyword, puis analyse DeepSeek (score ≥ 2)
5. Google Sheets   → Sauvegarde, hyperlinks, wrap description
```

> **Génération de proposals** : gérée par le pipeline **atelier-proposal**.
> Le bouton "Generate Proposal" dans le Google Sheet déclenche ce pipeline directement.

---

## Scrapers

### RemoteOK (gratuit)
- API publique : `https://remoteok.com/api?tag=<tag>`
- Tags scrapés : `automation`, `design`, `marketing`, `ai`, `crypto`, `frontend`, `saas`, `content`
- 20 offres max par tag

### LinkedIn (Apify — payant)
- Actor : `curious_coder/linkedin-jobs-scraper` ($1.00 / 1,000 résultats)
- 50 offres max par run (~$0.05/exécution)
- Déclenché manuellement via bouton Sheet

### Upwork (RSS — gratuit)
- RSS feed : `https://www.upwork.com/ab/feed/jobs/rss`
- Queries : `AI automation freelance`, `n8n workflow automation`, `brand strategy remote`
- 10 offres max par query

---

## Scoring

### Étape 1 — Score keyword (synchrone)
Score de 0 à 5 calculé localement selon des catégories pondérées :

| Catégorie | Mots-clés | Points |
|-----------|-----------|--------|
| Automation | n8n, make, zapier, workflow, automation... | +1.5 |
| Web Dev | webflow, nextjs, react, typescript... | +1.0 |
| Marketing | brand strategy, growth, campaign, ads... | +1.2 |
| Content | content strategy, copywriting, SEO... | +0.8 |
| Design | figma, creative direction, UI/UX... | +0.8 |
| Crypto | web3, blockchain, defi, crypto... | +1.0 |
| Bonus | remote, freelance, startup, async... | +0.3 |
| Malus | WordPress, Shopify, Java, PHP... | -1.0 |

### Étape 2 — Analyse DeepSeek (asynchrone, score ≥ 2 seulement)

**Modèle** : `deepseek-chat`  
**Prompt système** :

```
You are an expert job-fit analyzer for ATELIER, a premium independent studio
led by Bastien Joubert. Score this job on a scale 1-5:
5 = Perfect match — core skills, right seniority, clear value prop
4 = Strong match — most skills align, minor gaps
3 = Good match — solid overlap, some stretch
2 = Weak match — some relevance but significant gaps
1 = Poor match — wrong domain or level

Return JSON: { "score": 3.5, "rating": "Good Match", "summary": "one sentence",
"fit_analysis": ["point 1", "point 2", "point 3"] }
```

**Profile injecté dans chaque requête** (extrait de `profile.md`) :
- 10+ ans brand strategy, digital marketing, creative direction
- Nike Amsterdam : +35% e-commerce, +20% app acquisition
- Swapfiets Barcelona : 1000+ membres en 6 mois depuis zéro
- 50+ automation workflows (n8n, Make, Apify, Claude Code)
- Expert : AI automation, web dev, brand strategy, design, crypto/Web3

---

## Génération de Proposals

> Gérée par le pipeline **atelier-proposal** (repo séparé).
> Le bouton **✍️ Generate Proposal** dans le Google Sheet déclenche ce pipeline directement.
> `atelier-jobs` scrape, score et sauvegarde uniquement — aucune proposal générée ici.

---

## Google Sheets

### Structure des colonnes

| Col | Nom | Description |
|-----|-----|-------------|
| A | Job Title | Titre nettoyé (entités HTML décodées) |
| B | Description | HTML nettoyé, mojibake corrigé, wrap activé, 4000 chars max |
| C | Company | Nom de l'entreprise |
| D | Platform | `remoteok` / `linkedin` / `upwork` |
| E | Score | Score DeepSeek (1.0 – 5.0) |
| F | Fit For The Role | Bullet points de l'analyse DeepSeek |
| G | Status | Dropdown : `to_review` / `to_apply` / `applied` / `ignored` |
| H | Job URL | Lien hypertexte cliquable |
| I | Date Posted | Date de publication du job (ex: `14 May`) |
| J | Proposal | Texte généré par DeepSeek (via Apps Script) |

### Déduplication
Avant chaque import, le système lit la colonne H (Job URL) pour éviter les doublons. Les offres déjà présentes sont ignorées.

---

## Google Apps Script

Fichier : `google-apps-script.js`  
À coller dans : **Extensions > Apps Script > Code.gs**

### Menu ⚡ ATELIER

| Bouton | Fonction | Description |
|--------|----------|-------------|
| ✍️ Generate Proposal | `generateAllProposals()` | Génère proposals pour toutes les lignes `to_apply` sans proposal |
| ❌ Ignore all "to_review" | `ignoreAllToReview()` | Passe toutes les offres `to_review` en `ignored` |
| 🔍 Scan RemoteOK | `triggerRemoteOK()` | Déclenche GitHub Actions (workflow_dispatch) |
| 🔍 Scan LinkedIn | `triggerLinkedIn()` | Déclenche GitHub Actions |
| 🔍 Scan Upwork | `triggerUpwork()` | Déclenche GitHub Actions |
| 🗑️ Supprimer offres > 15 jours | `deleteOldJobs()` | Supprime les lignes > 15 jours |
| 🔑 Setup GitHub Token | `setupGitHubToken()` | Stocke le PAT GitHub dans ScriptProperties |

### Workflow manuel

```
1. Changer Status → "to_apply" pour les offres intéressantes
2. ⚡ ATELIER > ✍️ Generate Proposal
3. Le pipeline atelier-proposal génère une proposal par ligne to_apply
4. Status passe automatiquement à "applied" (fond bleu #cfe2f3)
5. Relire, copier, envoyer
```

---

## Automatisation GitHub Actions

Fichier : `.github/workflows/weekly-scan.yml`

### Cron automatique
- **Lundi 13:00 UTC** et **Jeudi 13:00 UTC** (= 10h Paraguay, UTC-3)
- Scan RemoteOK uniquement (gratuit)
- Envoie un rapport Telegram après chaque scan

### Déclenchement manuel (via boutons Sheet)
- Nécessite un **GitHub PAT** (scope : `workflow`)
- Stocké dans Apps Script via 🔑 Setup GitHub Token
- Supporte les plateformes : `remoteok` / `linkedin` / `upwork` / `all`

---

## Installation

### 1. Cloner et installer

```bash
git clone https://github.com/bastien-atelierhub/atelier-jobs
cd atelier-jobs
npm install
```

### 2. Créer le fichier `.env`

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
APIFY_API_KEY=apify_api_...
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=1xxxxxxxxxxxxxxxxxxxxx
GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/1xxxxxxxxxxxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=7597195574:xxx
TELEGRAM_CHAT_ID=1528309519
```

### 3. Commandes disponibles

```bash
# RemoteOK uniquement
node find-jobs.js --remoteok

# LinkedIn uniquement
node find-jobs.js --linkedin

# Upwork uniquement
node find-jobs.js --upwork

# Toutes les plateformes
node find-jobs.js --linkedin --upwork --remoteok

# Bypass filtre 10 jours
node find-jobs.js --remoteok --all

# Tester sans écrire dans le Sheet
node find-jobs.js --remoteok --dry-run

# Sans générer de proposals
node find-jobs.js --remoteok --no-proposal
```

### 4. Google Apps Script

1. Ouvrir le Google Sheet
2. **Extensions > Apps Script**
3. Coller le contenu de `google-apps-script.js` dans `Code.gs`
4. Enregistrer et recharger le Sheet
5. Menu **⚡ ATELIER > 🔑 Setup GitHub Token** → coller ton PAT GitHub

---

## GitHub Secrets requis

À configurer sur https://github.com/bastien-atelierhub/atelier-jobs/settings/secrets/actions

| Secret | Description |
|--------|-------------|
| `DEEPSEEK_API_KEY` | Clé API DeepSeek (scoring uniquement) |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` |
| `GROK_API_KEY` | Clé API xAI / Grok (génération proposals) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email du compte de service Google |
| `GOOGLE_PRIVATE_KEY` | Clé privée RSA complète |
| `GOOGLE_SHEET_ID` | ID du Google Sheet |
| `TELEGRAM_BOT_TOKEN` | Token du bot Telegram |
| `TELEGRAM_CHAT_ID` | ID du chat Telegram |

---

## Coûts

| Service | Usage | Coût |
|---------|-------|------|
| RemoteOK API | Illimité | Gratuit |
| Upwork RSS | Illimité | Gratuit |
| DeepSeek scoring | ~106 jobs × 2 appels = 212 requêtes/scan | ~$0.02/scan |
| DeepSeek proposals | ~28 proposals/scan | ~$0.05/scan |
| LinkedIn Apify | 50 jobs/run manuel | ~$0.05/run |
| GitHub Actions | 2 scans/semaine | Gratuit (plan Free) |
| **Total auto** | **2 scans/semaine** | **~$0.28/mois** |

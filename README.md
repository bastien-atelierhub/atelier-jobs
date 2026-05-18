# ATELIER — Job Scraper & Scoring System

Système automatisé de veille d'offres d'emploi et scoring IA pour ATELIER (Bastien Joubert). Scrape 7 job boards gratuits + LinkedIn + Upwork, score chaque offre avec DeepSeek, et sauvegarde tout dans Google Sheets.

La génération de proposals est gérée par le repo séparé **[atelier-proposal](https://github.com/bastien-atelierhub/atelier-proposal)**.

---

## Architecture

```
find-jobs.js          ← Point d'entrée, pipeline en 5 étapes
├── src/scrapers/     ← Scraping par plateforme
├── src/scorer.js     ← Scoring keyword + analyse DeepSeek
├── src/sheets.js     ← Google Sheets API (lecture + écriture)
├── src/telegram.js   ← Rapport quotidien Telegram
├── data/profile.md   ← Profil ATELIER v3 injecté dans les prompts DeepSeek
├── config/index.js   ← Chargement de la config (.env)
├── google-apps-script.js  ← Script à coller dans Apps Script du Sheet
└── .github/workflows/weekly-scan.yml  ← GitHub Actions (cron lun/jeu)
```

---

## Pipeline (5 étapes)

```
1. Scraping        → Récupère les offres brutes des plateformes
2. Filtre 10j      → Garde seulement les offres des 10 derniers jours
3. Déduplication   → Ignore les URLs déjà présentes dans le Sheet
4. Scoring + IA    → Score keyword, puis analyse DeepSeek (score ≥ 2)
5. Google Sheets   → Sauvegarde, hyperlinks, wrap description
```

> **Génération de proposals** : gérée par **atelier-proposal**.
> Le bouton **✍️ Generate Proposal** dans le Sheet déclenche ce pipeline directement via GitHub Actions.

---

## Scrapers

### Free Boards (gratuits, cron automatique)

| Plateforme | Source | Catégories |
|------------|--------|------------|
| **RemoteOK** | API publique `remoteok.com/api` | automation, design, marketing, ai, crypto, frontend, saas, content |
| **Remotive** | API publique `remotive.com/api/remote-jobs` | marketing, design, artificial-intelligence, writing, product |
| **WeWorkRemotely** | RSS feeds | sales-and-marketing, design, product, management-and-finance |
| **WorkingNomads** | API publique `workingnomads.com/api` | marketing, design, content, business-development |
| **Himalayas** | API publique `himalayas.app/jobs/api` | top 50 offres remote |
| **Jobicy** | API publique `jobicy.com/api/v2/remote-jobs` | marketing, design, product, brand |

### Plateformes payantes / manuelles

| Plateforme | Source | Coût |
|------------|--------|------|
| **LinkedIn** | Apify actor `curious_coder/linkedin-jobs-scraper` | ~$0.05/run |
| **Upwork** | RSS feed `upwork.com/ab/feed/jobs/rss` | Gratuit |

---

## Scoring

### Étape 1 — Score keyword (synchrone)
Score de 1 à 5 calculé localement selon des catégories pondérées :

| Catégorie | Mots-clés | Poids |
|-----------|-----------|-------|
| Automation | n8n, make, zapier, workflow, llm, claude... | 5 |
| Web Dev | landing page, website, web app, saas... | 4 |
| Marketing | brand strategy, go-to-market, positioning... | 4 |
| Design | figma, ui design, visual identity... | 4 |
| Content | social media, copywriting, reels, video... | 3 |
| Crypto | web3, blockchain, defi, nft... | 3 |
| Bonus | remote, freelance, startup, founder... | +0.3/signal |
| Malus | wordpress, shopify, event marketing... | → score 1 |

### Étape 2 — Analyse DeepSeek (asynchrone, score ≥ 2 seulement)

**Modèle** : `deepseek-chat` | **Temperature** : 0.3 | **Max tokens** : 700

**Profile injecté** : contenu complet de `data/profile.md` (profil v3 de Bastien)

**JSON retourné** :
```json
{
  "score": 4.2,
  "rating": "Strong Match",
  "summary": "2 sentences max sur le match",
  "fit_bullets": ["✅ point fort", "⚠️ match partiel", "❌ gap"],
  "description_summary": "1 paragraphe : ce que fait la boîte, le rôle, ce qu'ils cherchent",
  "role_type": "brand_strategy | ai_automation | web_dev | content | product | other",
  "identity_mode": "atelier | bastien_contract | bastien_permanent",
  "relevant_proof_points": ["expérience spécifique qui colle à ce job"]
}
```

---

## Google Sheets

### Structure des colonnes

| Col | Nom | Description |
|-----|-----|-------------|
| A | Job Title | Titre nettoyé (entités HTML décodées) |
| B | Description | Résumé DeepSeek (1 paragraphe) ou description HTML nettoyée, 4000 chars max |
| C | Company | Nom de l'entreprise |
| D | Platform | `remoteok` / `remotive` / `weworkremotely` / `workingnomads` / `himalayas` / `jobicy` / `linkedin` / `upwork` |
| E | Score | Score DeepSeek (1.0 – 5.0) |
| F | Fit For The Role | Bullet points ✅ ⚠️ ❌ de l'analyse DeepSeek |
| G | Status | `to_review` / `to_apply` / `applied` / `ignored` |
| H | Job URL | Lien hypertexte cliquable |
| I | Date Posted | Date de publication format `YYYY-MM-DD` (triable) |

### Déduplication
Avant chaque import, le système lit la colonne H (Job URL) pour éviter les doublons.

---

## Google Apps Script

Fichier : `google-apps-script.js`
À coller dans : **Extensions > Apps Script > Code.gs**

> Remplacer `GITHUB_TOKEN` par ton GitHub Personal Access Token (scope : `workflow`).

### Menu ⚡ ATELIER

| Bouton | Fonction |
|--------|----------|
| ✍️ Generate Proposal | Déclenche atelier-proposal pour chaque ligne `to_apply` |
| ❌ Ignore all "to_review" | Passe toutes les offres `to_review` en `ignored` |
| 🔍 Scan All Free Boards | Lance RemoteOK + Remotive + WWR + WorkingNomads + Himalayas + Jobicy |
| 🔍 Scan RemoteOK | Déclenche GitHub Actions (workflow_dispatch) |
| 🔍 Scan Remotive | Déclenche GitHub Actions |
| 🔍 Scan WeWorkRemotely | Déclenche GitHub Actions |
| 🔍 Scan WorkingNomads | Déclenche GitHub Actions |
| 🔍 Scan Himalayas | Déclenche GitHub Actions |
| 🔍 Scan Jobicy | Déclenche GitHub Actions |
| 🔍 Scan LinkedIn | Déclenche GitHub Actions |
| 🔍 Scan Upwork | Déclenche GitHub Actions |
| 🗑️ Supprimer offres > 15 jours | Supprime les lignes > 15 jours |

### Workflow manuel

```
1. Changer Status → "to_apply" pour les offres intéressantes
2. ⚡ ATELIER > ✍️ Generate Proposal
3. atelier-proposal génère une proposal + Google Doc + notification Telegram
4. Status passe automatiquement à "applied" (fond bleu)
```

---

## Automatisation GitHub Actions

Fichier : `.github/workflows/weekly-scan.yml`

### Cron automatique
- **Lundi 13:00 UTC** et **Jeudi 13:00 UTC**
- Scan "freeboards" : RemoteOK + Remotive + WWR + WorkingNomads + Himalayas + Jobicy
- Envoie un rapport Telegram après chaque scan

### Déclenchement manuel (via boutons Sheet ou GitHub)
Options disponibles : `freeboards` / `remoteok` / `remotive` / `wwr` / `workingnomads` / `himalayas` / `jobicy` / `linkedin` / `upwork` / `all`

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
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx
```

### 3. Commandes disponibles

```bash
# Tous les free boards (recommandé)
node find-jobs.js --remoteok --remotive --wwr --workingnomads --himalayas --jobicy

# Une plateforme spécifique
node find-jobs.js --remoteok
node find-jobs.js --remotive
node find-jobs.js --wwr
node find-jobs.js --workingnomads
node find-jobs.js --himalayas
node find-jobs.js --jobicy
node find-jobs.js --linkedin
node find-jobs.js --upwork

# Bypass filtre 10 jours
node find-jobs.js --remoteok --all

# Tester sans écrire dans le Sheet
node find-jobs.js --remoteok --dry-run
```

### 4. Google Apps Script

1. Ouvrir le Google Sheet
2. **Extensions > Apps Script**
3. Coller le contenu de `google-apps-script.js` dans `Code.gs`
4. Remplacer `GITHUB_TOKEN` par ton vrai PAT GitHub (scope : `workflow`)
5. Enregistrer et recharger le Sheet

---

## GitHub Secrets requis

À configurer sur https://github.com/bastien-atelierhub/atelier-jobs/settings/secrets/actions

| Secret | Description |
|--------|-------------|
| `DEEPSEEK_API_KEY` | Clé API DeepSeek (scoring) |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` |
| `GROK_API_KEY` | Clé API xAI / Grok (réservé atelier-proposal) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email du compte de service Google |
| `GOOGLE_PRIVATE_KEY` | Clé privée RSA complète |
| `GOOGLE_SHEET_ID` | ID du Google Sheet |
| `GOOGLE_SHEET_URL` | URL complète du Google Sheet |
| `TELEGRAM_BOT_TOKEN` | Token du bot Telegram |
| `TELEGRAM_CHAT_ID` | ID du chat Telegram |

---

## Coûts

| Service | Usage | Coût |
|---------|-------|------|
| RemoteOK, Remotive, WWR, WorkingNomads, Himalayas, Jobicy | Illimité | Gratuit |
| Upwork RSS | Illimité | Gratuit |
| DeepSeek scoring | ~100 offres × 2 scans/semaine | ~$0.04/scan |
| LinkedIn Apify | 50 jobs/run manuel | ~$0.05/run |
| GitHub Actions | 2 scans/semaine | Gratuit (plan Free) |
| **Total auto** | **2 scans/semaine** | **~$0.32/mois** |

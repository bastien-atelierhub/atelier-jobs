# ATELIER Job Pipeline
> Veille d'opportunités, scoring IA, et génération automatique de proposals — tout dans un seul repo.

---

## What It Does

- **Scraping multi-plateformes** : RemoteOK, Remotive, WeWorkRemotely, WorkingNomads, Himalayas, Jobicy, LinkedIn, Upwork.
- **Filtrage & déduplication** : offres des 10 derniers jours uniquement, doublons éliminés via index des URLs.
- **Scoring hybride** : mots-clés locaux (gratuit) → analyse DeepSeek (payant, seulement si score ≥ 2).
- **Google Sheets** : offres qualifiées exportées avec hyperliens, dropdown statut, fit analysis.
- **Génération de proposals** : un clic sur une ligne `to_apply` → proposal personnalisée créée dans Google Drive + lien écrit dans le Sheet + notification Telegram.

---

## Architecture

```
[GitHub Actions Cron (lun/jeu)]  ──┐
                                   ├──➔ Scrapers ➔ Filtre ➔ Déduplication
[Bouton Apps Script "Scan"]  ──────┘         │
                                             ▼
                                     Scoring (Keywords → DeepSeek)
                                             │
                                             ▼
                                     Google Sheets + Telegram

[Bouton Apps Script "Generate Proposal"]
          │
          ▼
  src/proposal/main.py
          │
          ├──➔ [1] Scraping ou texte brut
          ├──➔ [2] Analyse DeepSeek (fit, role_type, identity_mode)
          ├──➔ [3] Génération proposal via Grok
          ├──➔ [4] Création Google Doc
          ├──➔ [5] Write-back lien dans Sheet (colonne J)
          └──➔ [6] Notification Telegram
```

---

## Profile

Le pipeline de proposal se base sur **`data/profile.md`** — c'est le fichier à mettre à jour pour adapter les proposals au profil, aux expériences, à la voix, et aux proof points de Bastien.

---

## Stack

| Composant | Technologie |
|---|---|
| Scraping & scoring | Node.js |
| Proposal pipeline | Python 3.11 |
| Analyse IA | DeepSeek (`deepseek-chat`) |
| Génération proposal | Grok (`grok-4.3`) |
| Stockage | Google Sheets API |
| Docs générés | Google Drive / Docs API |
| Orchestration | GitHub Actions |
| Notifications | Telegram Bot API |
| Déclenchement manuel | Google Apps Script |

---

## Workflows GitHub Actions

| Fichier | Déclencheur | Rôle |
|---|---|---|
| `weekly-scan.yml` | Cron lun/jeu + Apps Script | Scrape, score, exporte dans Sheets |
| `proposal.yml` | Apps Script (bouton "Generate Proposal") | Génère une proposal pour une ligne `to_apply` |

---

## Google Sheet — Colonnes

| Col | Nom | Description |
|---|---|---|
| A | Job Title | Titre du poste |
| B | Description | Résumé IA de l'offre |
| C | Company | Entreprise |
| D | Platform | Source |
| E | Score | Score 1–5 |
| F | Fit For The Role | Bullets ✅⚠️❌ |
| G | Status | `to_review` → `to_apply` → `applied` / `ignored` |
| H | Job URL | Lien vers l'offre |
| I | Date Posted | Date de publication |
| J | Proposal | Lien Google Doc généré |

---

## Status

**En production** — scans hebdomadaires automatiques, proposals à la demande.

# ATELIER Job Scraper & Scoring System
> Système autonome de veille d'opportunités et d'évaluation prédictive des leads de recrutement.

---

## What It Does

*   **Scraping multi-plateformes :** Interroge en temps réel plus de 8 plateformes d'emploi (LinkedIn, Upwork, RemoteOK, Remotive, WeWorkRemotely, Himalayas, Jobicy, WorkingNomads).
*   **Filtrage & Déduplication :** Ignore automatiquement les offres de plus de 10 jours et utilise un index de synchronisation pour éviter de traiter ou d'importer des doublons.
*   **Scoring prédictif hybride :** Évalue la pertinence de chaque offre grâce à une analyse par mots-clés suivie d'une qualification stratégique par IA (DeepSeek).
*   **Interface Sheets Intégrée :** Met en forme et enregistre les opportunités qualifiées directement dans un Google Sheet de gestion commerciale.
*   **Passerelle de Vente :** Permet d'initier la rédaction automatique de propositions commerciales d'un clic via Apps Script, en lien avec le moteur de propositions de l'agence.

---

## Architecture Overview

```
[GitHub Actions Cron (lun/jeu)] ──┐
                                  ├──➔ [Scrapers Multi-Sources] ➔ [Filtre & Déduplication]
[Bouton Manuel / Apps Script] ────┘                                     │
                                                                        ▼
                                                        [Scoring Hybride (Keywords ➔ IA)]
                                                                        │
                                                                        ▼
                                                        [Export Google Sheets Central]
                                                                        │
                                                                        ▼
                                                        [Notification Résumé Telegram]
```

1.  **Ingestion :** Déclenché automatiquement par un cron ou manuellement depuis le tableur, le pipeline extrait les données textuelles brutes de chaque annonce d'emploi.
2.  **Scoring en cascade :** Le moteur calcule d'abord un score de mots-clés local. Si ce score dépasse le seuil minimal, le profil complet d'ATELIER et la description de l'offre sont envoyés à DeepSeek pour une évaluation fine de pertinence.
3.  **Synchronisation & Alerte :** Les offres ayant passé les filtres sont enregistrées dans Google Sheets avec hyperliens et formatage conditionnel. Un rapport de synthèse de la veille est ensuite envoyé sur Telegram.

---

## Stack

*   **Core Engine :** Node.js
*   **Scraping Helpers :** Apify API (LinkedIn), RSS Parser (Upwork)
*   **AI Engine :** DeepSeek API (`deepseek-chat`)
*   **Database & Frontend :** Google Sheets API
*   **Orchestrator :** GitHub Actions (cron automatisé)
*   **Notifications :** Telegram Bot API

---

## Key Decisions

*   **Scoring hybride à double facteur :** L'évaluation est divisée en deux phases. Un script local et rapide élimine les offres hors-sujet par recherche de mots-clés (phase gratuite). Seules les offres potentiellement viables (score ≥ 2) sont soumises à l'analyse sémantique de DeepSeek (phase payante). Cela réduit les coûts d'API de plus de 80%.
*   **Stockage découplé et résilient :** Le Google Sheet sert à la fois de base de données persistante, d'historique de déduplication (par indexation des URLs) et de tableau de bord utilisateur. L'architecture est totalement serverless et ne nécessite aucune infrastructure de base de données classique.
*   **Déclenchement asynchrone bidirectionnel :** Le tableur communique avec les exécuteurs distants de GitHub Actions via des requêtes HTTP signées dans Google Apps Script, permettant une interactivité instantanée pour l'utilisateur.

---

## Status

**En production** — Exécute des scans programmés hebdomadaires et synchronise les leads de vente en temps réel.

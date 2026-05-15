import 'dotenv/config';
import axios from 'axios';
import { loadConfig } from '../config/index.js';
import { readTopJobs } from './sheets.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const SHEET_URL = process.env.GOOGLE_SHEET_URL;

async function sendMessage(text) {
  await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    chat_id:    CHAT_ID,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });
}

function formatJobMessage(job, index) {
  const stars  = '⭐'.repeat(Math.round(job.score));
  const rating = job.rating || getRatingLabel(job.score);

  const fitLines = job.fit_analysis
    ? job.fit_analysis.slice(0, 3).join('\n')
    : '';

  const urlLine = job.url ? `\n🔗 ${job.url}` : '';

  return [
    `${index}. 📋 *${escapeMarkdown(job.title)}*`,
    `🏢 ${escapeMarkdown(job.company || 'N/A')} | 📍 ${job.platform}`,
    `${stars} Score: *${job.score.toFixed(1)}* — ${rating}`,
    fitLines ? `\n${fitLines}` : '',
    urlLine,
  ].filter(Boolean).join('\n');
}

function getRatingLabel(score) {
  if (score >= 5) return 'Perfect Match';
  if (score >= 4) return 'Strong Match';
  if (score >= 3) return 'Good Match';
  return 'Weak Match';
}

function escapeMarkdown(text) {
  return (text || '').replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
}

export async function sendDailyReport(config) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID manquant dans .env');
  }

  console.log('[telegram] Lecture des top jobs depuis Google Sheets...');
  const jobs = await readTopJobs(config, 5);

  if (jobs.length === 0) {
    await sendMessage('📭 Aucun job trouvé dans le Sheet pour le rapport du jour.');
    return;
  }

  console.log(`[telegram] Envoi de ${jobs.length} jobs...`);

  // Header
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  await sendMessage(`🎯 *ATELIER — Top Jobs du ${escapeMarkdown(today)}*\n_${jobs.length} meilleures opportunités_`);

  // Un message par job
  for (let i = 0; i < jobs.length; i++) {
    await sendMessage(formatJobMessage(jobs[i], i + 1));
    await new Promise(r => setTimeout(r, 300));
  }

  // Message final avec lien Sheet
  const sheetLink = SHEET_URL || `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`;
  await sendMessage(`📊 Voir tous les jobs → [Google Sheet](${sheetLink})`);

  console.log('[telegram] Rapport envoyé ✓');
}

// Exécution directe : node src/telegram.js
if (process.argv[1].endsWith('telegram.js')) {
  const config = loadConfig();
  sendDailyReport(config)
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[telegram] Erreur:', err.message);
      process.exit(1);
    });
}

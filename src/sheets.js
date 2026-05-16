import { createSign } from 'crypto';
import axios from 'axios';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKEN_URL   = 'https://oauth2.googleapis.com/token';
const SCOPE       = 'https://www.googleapis.com/auth/spreadsheets';

// A: Job Title  B: Description  C: Company   D: Platform  E: Score
// F: Fit For The Role  G: Status  H: Job URL  I: Date Posted  J: Proposal
const HEADERS = [
  'Job Title', 'Description', 'Company', 'Platform', 'Score',
  'Fit For The Role', 'Status', 'Job URL', 'Date Posted', 'Proposal',
];

// ── Utils ─────────────────────────────────────────────────────────────────────

// Mapping inverse Windows-1252 (plage 0x80–0x9F, le reste = Latin-1 1:1)
const W1252_REV = new Map([
  ['\u20ac', 0x80], ['\u201a', 0x82], ['\u0192', 0x83], ['\u201e', 0x84],
  ['\u2026', 0x85], ['\u2020', 0x86], ['\u2021', 0x87], ['\u02c6', 0x88],
  ['\u2030', 0x89], ['\u0160', 0x8a], ['\u2039', 0x8b], ['\u0152', 0x8c],
  ['\u017d', 0x8e], ['\u2018', 0x91], ['\u2019', 0x92], ['\u201c', 0x93],
  ['\u201d', 0x94], ['\u2022', 0x95], ['\u2013', 0x96], ['\u2014', 0x97],
  ['\u02dc', 0x98], ['\u2122', 0x99], ['\u0161', 0x9a], ['\u203a', 0x9b],
  ['\u0153', 0x9c], ['\u017e', 0x9e], ['\u0178', 0x9f],
]);

// Corrige le mojibake : re-décode comme si les chars étaient des bytes Windows-1252 → UTF-8
function fixMojibake(str) {
  if (!/[\u0080-\uffff]/.test(str)) return str;
  const bytes = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (W1252_REV.has(ch)) {
      bytes.push(W1252_REV.get(ch));
    } else if (cp <= 0xff) {
      bytes.push(cp);
    } else {
      return str; // char hors W1252 → déjà du vrai Unicode, on laisse tel quel
    }
  }
  try {
    const decoded = Buffer.from(bytes).toString('utf8');
    return decoded.includes('\uFFFD') ? str : decoded;
  } catch (e) {
    return str;
  }
}

function stripHtml(html) {
  const text = (html || '')
    // Blocs → saut de ligne pour garder la structure
    .replace(/<\/?(p|div|h[1-6]|tr|br\s*\/?)(\s[^>]*)?>/gi, '\n')
    .replace(/<li(\s[^>]*)?>/gi, '\n• ')
    // Reste des tags
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...');

  return fixMojibake(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')          // espaces multiples → 1 (sans toucher les \n)
    .replace(/\n{3,}/g, '\n\n')       // max 2 sauts de ligne consécutifs
    .replace(/^\s+|\s+$/gm, '')       // trim chaque ligne
    .trim();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function createJWT(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const sign = createSign('SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');

  return `${header}.${payload}.${signature}`;
}

async function getAccessToken(config) {
  const { email, privateKey } = config.google;
  const jwt = createJWT(email, privateKey);

  const { data } = await axios.post(TOKEN_URL, new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  return data.access_token;
}

// ── Sheets helpers ────────────────────────────────────────────────────────────

async function ensureHeaderRow(spreadsheetId, token) {
  const { data } = await axios.get(
    `${SHEETS_BASE}/${spreadsheetId}/values/A1:J1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const existing = data.values?.[0] ?? [];
  if (existing.length === 0) {
    await axios.put(
      `${SHEETS_BASE}/${spreadsheetId}/values/A1:J1?valueInputOption=RAW`,
      { values: [HEADERS] },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    console.log('[sheets] En-tête créée');
  }
}

// Applique fond blanc + police normale sur les lignes de données
async function clearRowFormatting(spreadsheetId, token, startRow, endRow) {
  await axios.post(
    `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
    {
      requests: [{
        repeatCell: {
          range: {
            sheetId:          0,
            startRowIndex:    startRow - 1, // 0-indexed
            endRowIndex:      endRow,
            startColumnIndex: 0,
            endColumnIndex:   10,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 1, green: 1, blue: 1 },
              textFormat:      { bold: false },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      }],
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day   = d.getUTCDate();
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${day} ${month}`;
}

function jobToRow(job) {
  const fitAnalysis = Array.isArray(job.fit_analysis)
    ? job.fit_analysis.join('\n')
    : '';

  return [
    (job.title || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c)), // A - Job Title
    job.description_summary || stripHtml(job.description).slice(0, 4000), // B - Description
    job.company     || '',   // C - Company
    job.platform    || '',   // D - Platform
    job.score       ?? 0,    // E - Score
    fitAnalysis,             // F - Fit For The Role
    'to_review',             // G - Status
    job.url         || '',   // H - Job URL
    formatDate(job.date),    // I - Date Posted
    '',                      // J - Proposal
  ];
}

// Active le wrap de texte sur la colonne B (Description)
async function applyDescriptionWrap(spreadsheetId, token, startRow, endRow) {
  await axios.post(
    `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
    {
      requests: [{
        repeatCell: {
          range: {
            sheetId:          0,
            startRowIndex:    startRow - 1,
            endRowIndex:      endRow,
            startColumnIndex: 1, // B
            endColumnIndex:   2,
          },
          cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
          fields: 'userEnteredFormat.wrapStrategy',
        },
      }],
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// Applique la validation dropdown sur la colonne G (Status)
async function applyStatusDropdown(spreadsheetId, token, startRow, endRow) {
  await axios.post(
    `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
    {
      requests: [{
        setDataValidation: {
          range: {
            sheetId:          0,
            startRowIndex:    startRow - 1,
            endRowIndex:      endRow,
            startColumnIndex: 6, // G
            endColumnIndex:   7,
          },
          rule: {
            condition: {
              type:   'ONE_OF_LIST',
              values: [
                { userEnteredValue: 'to_review' },
                { userEnteredValue: 'to_apply'  },
                { userEnteredValue: 'applied'   },
                { userEnteredValue: 'ignored'   },
              ],
            },
            showCustomUi:  true,
            strict:        true,
          },
        },
      }],
    },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// Applique un lien hypertexte sur les cellules de la colonne H (URL)
async function applyHyperlinkFormat(spreadsheetId, token, rows, startRow) {
  const requests = rows
    .map((row, i) => {
      const url = row[7]; // colonne H
      if (!url) return null;
      return {
        updateCells: {
          range: {
            sheetId:          0,
            startRowIndex:    startRow - 1 + i,
            endRowIndex:      startRow + i,
            startColumnIndex: 7, // H
            endColumnIndex:   8,
          },
          rows: [{
            values: [{
              userEnteredValue:  { stringValue: url },
              userEnteredFormat: { textFormat: { link: { uri: url } } },
            }],
          }],
          fields: 'userEnteredValue,userEnteredFormat.textFormat.link',
        },
      };
    })
    .filter(Boolean);

  if (requests.length === 0) return;

  await axios.post(
    `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
    { requests },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
}

// Parse "Sheet1!A5:J75" → { startRow: 5, endRow: 75 }
function parseUpdatedRange(range) {
  const match = range?.match(/![A-Z]+(\d+):[A-Z]+(\d+)/);
  if (!match) return null;
  return { startRow: parseInt(match[1]), endRow: parseInt(match[2]) };
}

// ── Read helpers ──────────────────────────────────────────────────────────────

function rowToJob(r) {
  return {
    title:        r[0] || '',
    description:  r[1] || '',
    company:      r[2] || '',
    platform:     r[3] || '',
    score:        parseFloat(r[4]) || 0,
    fit_analysis: (r[5] || '').split('\n').filter(Boolean),
    status:       r[6] || '',
    url:          r[7] || '',
    date:         r[8] || '',
    proposal:     r[9] || '',
  };
}

export async function readTopJobs(config, limit = 5) {
  const { spreadsheetId } = config.google;
  const token = await getAccessToken(config);

  const { data } = await axios.get(
    `${SHEETS_BASE}/${spreadsheetId}/values/A2:J1000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return (data.values ?? [])
    .map(rowToJob)
    .filter(j => j.title && j.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function readAllJobs(config, limit = 20) {
  const { spreadsheetId } = config.google;
  const token = await getAccessToken(config);

  const { data } = await axios.get(
    `${SHEETS_BASE}/${spreadsheetId}/values/A2:J1000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return (data.values ?? [])
    .map(rowToJob)
    .filter(j => j.title)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getExistingUrls(config) {
  const { spreadsheetId } = config.google;
  const token = await getAccessToken(config);

  const { data } = await axios.get(
    `${SHEETS_BASE}/${spreadsheetId}/values/H2:H1000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const urls = new Set(
    (data.values ?? []).flat().filter(Boolean)
  );
  console.log(`[sheets] ${urls.size} URLs déjà dans le Sheet`);
  return urls;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function saveToSheets(jobs, config) {
  const { spreadsheetId } = config.google;

  console.log('[sheets] Authentification...');
  const token = await getAccessToken(config);

  await ensureHeaderRow(spreadsheetId, token);

  const rows = jobs.map(jobToRow);

  const { data } = await axios.post(
    `${SHEETS_BASE}/${spreadsheetId}/values/A:J:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { values: rows },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const updated = data.updates?.updatedRows ?? rows.length;

  console.log(`[sheets] ${updated} lignes ajoutées`);

  const range = parseUpdatedRange(data.updates?.updatedRange);
  if (range) {
    await clearRowFormatting(spreadsheetId, token, range.startRow, range.endRow);
    console.log(`[sheets] Formatage nettoyé (lignes ${range.startRow}→${range.endRow})`);
    await applyHyperlinkFormat(spreadsheetId, token, rows, range.startRow);
    console.log(`[sheets] Liens hypertexte appliqués`);
    await applyDescriptionWrap(spreadsheetId, token, range.startRow, range.endRow);
    try {
      await applyStatusDropdown(spreadsheetId, token, range.startRow, range.endRow);
      console.log(`[sheets] Dropdown statut appliqué`);
    } catch (e) {
      console.log(`[sheets] Dropdown ignoré (colonnes de tableau) — utilisez Apps Script onOpen`);
    }
  }

  return { saved: updated, failed: 0 };
}

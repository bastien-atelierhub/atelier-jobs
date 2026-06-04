// ─────────────────────────────────────────────────────────────────────────────
// ATELIER — Google Apps Script v2
// Extensions > Apps Script > Code.gs
//
// Colonnes :
// A: Job Title  B: Description  C: Company   D: Platform  E: Score
// F: Fit For The Role  G: Status  H: Job URL  I: Date Posted
// ─────────────────────────────────────────────────────────────────────────────

const GITHUB_TOKEN       = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
const REPO_OWNER         = 'bastien-atelierhub';
const REPO_NAME_JOBS     = 'atelier-jobs';
const REPO_NAME_PROPOSAL = 'atelier-jobs';
const WORKFLOW_JOBS      = 'weekly-scan.yml';
const WORKFLOW_PROPOSAL  = 'proposal.yml';

// ── Menu ──────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ ATELIER')
    .addItem('✍️ Generate Proposal', 'generateAllProposals')
    .addItem('❌ Ignore all "to_review"', 'ignoreAllToReview')
    .addSeparator()
    .addItem('🔍 Scan All Free Boards', 'triggerFreeBoards')
    .addItem('🔍 Scan RemoteOK', 'triggerRemoteOK')
    .addItem('🔍 Scan Remotive', 'triggerRemotive')
    .addItem('🔍 Scan WeWorkRemotely', 'triggerWWR')
    .addItem('🔍 Scan WorkingNomads', 'triggerWorkingNomads')
    .addItem('🔍 Scan Himalayas', 'triggerHimalayas')
    .addItem('🔍 Scan Jobicy', 'triggerJobicy')
    .addItem('🔍 Scan LinkedIn', 'triggerLinkedIn')
    .addItem('🔍 Scan Upwork', 'triggerUpwork')
    .addSeparator()
    .addItem('🗑️ Supprimer offres > 15 jours', 'deleteOldJobs')
    .addToUi();
}

// ── Generate Proposal ─────────────────────────────────────────────────────────
// Déclenche atelier-proposal pour chaque ligne "to_apply"
// Google Doc + Telegram gérés par atelier-proposal

function generateAllProposals() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const ui      = SpreadsheetApp.getUi();
  let triggered = 0;
  let errors    = 0;

  for (let row = 2; row <= lastRow; row++) {
    const status = sheet.getRange(row, 7).getValue();
    if (status !== 'to_apply') continue;

    const title       = sheet.getRange(row, 1).getValue();
    const description = sheet.getRange(row, 2).getValue();
    const company     = sheet.getRange(row, 3).getValue();
    const platform    = sheet.getRange(row, 4).getValue();
    const url         = sheet.getRange(row, 8).getValue();

    if (!title) continue;

    const content = `Platform: ${platform}
Company: ${company || 'Unknown'}
Job URL: ${url || 'manual-input'}
Job Title: ${title}

${description}`;

    const success = triggerProposalPipeline(content, row);

    if (success) {
      sheet.getRange(row, 7).setValue('applied');
      sheet.getRange(row, 7).setBackground('#cfe2f3');
      triggered++;
      Utilities.sleep(2000);
    } else {
      errors++;
    }
  }

  ui.alert(`✅ ${triggered} proposal(s) déclenchée(s).${errors > 0 ? `\n❌ ${errors} erreur(s).` : ''}\nRésultats dans Google Drive + Telegram dans ~60 secondes.`);
}

// ── Trigger atelier-proposal pipeline ────────────────────────────────────────

function triggerProposalPipeline(content, rowIndex) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME_PROPOSAL}/actions/workflows/${WORKFLOW_PROPOSAL}/dispatches`;

  const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

  const options = {
    method:             'post',
    contentType:        'application/json',
    headers: {
      Authorization:          `Bearer ${GITHUB_TOKEN}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload:            JSON.stringify({ ref: 'main', inputs: { content, row_index: String(rowIndex), spreadsheet_id: spreadsheetId } }),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code !== 204) {
      console.error(`GitHub API error ${code}: ${response.getContentText()}`);
    }
    return code === 204;
  } catch (e) {
    console.error(`triggerProposalPipeline exception: ${e}`);
    return false;
  }
}

// ── Ignore all to_review ──────────────────────────────────────────────────────

function ignoreAllToReview() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  let count     = 0;

  for (let row = 2; row <= lastRow; row++) {
    const status = sheet.getRange(row, 7).getValue();
    if (status !== 'to_review') continue;
    sheet.getRange(row, 7).setValue('ignored');
    sheet.getRange(row, 7).setBackground('#f4cccc');
    count++;
  }

  SpreadsheetApp.getUi().alert(`❌ ${count} offre${count > 1 ? 's' : ''} ignorée${count > 1 ? 's' : ''}.`);
}

// ── Delete old jobs ───────────────────────────────────────────────────────────

function deleteOldJobs() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const cutoff  = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  let deleted   = 0;

  for (let row = lastRow; row >= 2; row--) {
    const dateVal = sheet.getRange(row, 9).getValue();
    if (!dateVal) continue;
    const date = new Date(dateVal);
    if (!isNaN(date.getTime()) && date < cutoff) {
      sheet.deleteRow(row);
      deleted++;
    }
  }

  SpreadsheetApp.getUi().alert(`🗑️ ${deleted} offre${deleted > 1 ? 's' : ''} supprimée${deleted > 1 ? 's' : ''}.`);
}

// ── GitHub Actions triggers (atelier-jobs scraping) ───────────────────────────

function triggerFreeBoards()    { triggerJobsScan('freeboards');    }
function triggerRemoteOK()      { triggerJobsScan('remoteok');      }
function triggerRemotive()      { triggerJobsScan('remotive');      }
function triggerWWR()           { triggerJobsScan('wwr');           }
function triggerWorkingNomads() { triggerJobsScan('workingnomads'); }
function triggerHimalayas()     { triggerJobsScan('himalayas');     }
function triggerJobicy()        { triggerJobsScan('jobicy');        }
function triggerLinkedIn()      { triggerJobsScan('linkedin');      }
function triggerUpwork()        { triggerJobsScan('upwork');        }

function triggerJobsScan(platform) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME_JOBS}/actions/workflows/${WORKFLOW_JOBS}/dispatches`;

  const options = {
    method:             'post',
    contentType:        'application/json',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept:        'application/vnd.github.v3+json',
    },
    payload:            JSON.stringify({ ref: 'master', inputs: { platform } }),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const code     = response.getResponseCode();

  if (code === 204) {
    SpreadsheetApp.getUi().alert(`✅ Scan ${platform} lancé.\nRésultats dans 2-3 minutes.`);
  } else {
    SpreadsheetApp.getUi().alert(`❌ Erreur GitHub: ${code}\n${response.getContentText()}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ATELIER — Google Apps Script
// Colle ce code dans : Extensions > Apps Script > Code.gs
// ─────────────────────────────────────────────────────────────────────────────
//
// Colonnes :
// A: Job Title  B: Description  C: Company   D: Platform  E: Score
// F: Fit For The Role  G: Status  H: Job URL  I: Date Posted  J: Proposal

const DEEPSEEK_API_KEY = 'sk-61be0affc8274a74bbb9d54621e062ce';
const DEEPSEEK_URL     = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL   = 'deepseek-chat';

const ATELIER_PROFILE = `Bastien Joubert — ATELIER studio.
10+ ans brand strategy, digital marketing, creative direction.
Nike Amsterdam: +35% e-commerce, +20% app acquisition, +30% brand visibility.
Swapfiets Barcelona: 1000+ membres en 6 mois depuis zéro.
50+ automation workflows (n8n, Make, Apify, Claude Code).
Expert: AI automation, web dev, brand strategy, design, crypto/Web3.`;

// ── Menu ──────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ ATELIER')
    .addItem('✍️ Generate Proposal', 'generateAllProposals')
    .addItem('❌ Ignore all "to_review"', 'ignoreAllToReview')
    .addSeparator()
    .addItem('🔍 Scan RemoteOK', 'triggerRemoteOK')
    .addItem('🔍 Scan LinkedIn', 'triggerLinkedIn')
    .addItem('🔍 Scan Upwork', 'triggerUpwork')
    .addSeparator()
    .addItem('🗑️ Supprimer offres > 15 jours', 'deleteOldJobs')
    .addSeparator()
    .addItem('🔑 Setup GitHub Token', 'setupGitHubToken')
    .addToUi();
}

// ── Generate Proposal (toutes les lignes to_apply sans proposal) ──────────────

function generateAllProposals() {
  const sheet    = SpreadsheetApp.getActiveSheet();
  const lastRow  = sheet.getLastRow();
  const ui       = SpreadsheetApp.getUi();
  let generated  = 0;
  let errors     = 0;

  for (let row = 2; row <= lastRow; row++) {
    const status   = sheet.getRange(row, 7).getValue();
    const proposal = sheet.getRange(row, 10).getValue();

    if (status !== 'to_apply' || proposal !== '') continue;

    const title       = sheet.getRange(row, 1).getValue();
    const description = sheet.getRange(row, 2).getValue();
    const company     = sheet.getRange(row, 3).getValue();
    const platform    = (sheet.getRange(row, 4).getValue() || '').toLowerCase();
    const fit         = sheet.getRange(row, 6).getValue();

    if (!title) continue;

    const result = callDeepSeek(title, description, company, platform, fit);

    if (result.error) {
      errors++;
      continue;
    }

    sheet.getRange(row, 10).setValue(result.proposal);
    sheet.getRange(row, 7).setValue('applied').setBackground('#cfe2f3');
    generated++;

    Utilities.sleep(500);
  }

  ui.alert(`✅ ${generated} proposal${generated > 1 ? 's' : ''} générée${generated > 1 ? 's' : ''}${errors > 0 ? ` (${errors} erreurs)` : ''}.`);
}

// ── Ignore all to_review ──────────────────────────────────────────────────────

function ignoreAllToReview() {
  const sheet   = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  let count     = 0;

  for (let row = 2; row <= lastRow; row++) {
    const status = sheet.getRange(row, 7).getValue();
    if (status !== 'to_review') continue;
    sheet.getRange(row, 7).setValue('ignored').setBackground('#f4cccc');
    count++;
  }

  SpreadsheetApp.getUi().alert(`❌ ${count} offre${count > 1 ? 's' : ''} ignorée${count > 1 ? 's' : ''}.`);
}

// ── Delete old jobs ───────────────────────────────────────────────────────────

function deleteOldJobs() {
  const sheet    = SpreadsheetApp.getActiveSheet();
  const lastRow  = sheet.getLastRow();
  const cutoff   = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  let deleted    = 0;

  for (let row = lastRow; row >= 2; row--) {
    const dateVal = sheet.getRange(row, 9).getValue();
    if (!dateVal) continue;

    const date = new Date(dateVal);
    if (isNaN(date.getTime())) continue;

    if (date < cutoff) {
      sheet.deleteRow(row);
      deleted++;
    }
  }

  SpreadsheetApp.getUi().alert(`🗑️ ${deleted} offre${deleted > 1 ? 's' : ''} supprimée${deleted > 1 ? 's' : ''}.`);
}

// ── GitHub Actions triggers ───────────────────────────────────────────────────

function triggerLinkedIn()  { triggerGitHubWorkflow('linkedin');  }
function triggerUpwork()    { triggerGitHubWorkflow('upwork');    }
function triggerRemoteOK()  { triggerGitHubWorkflow('remoteok');  }

function triggerGitHubWorkflow(platform) {
  const GITHUB_TOKEN  = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  const REPO_OWNER    = 'bastien-atelierhub';
  const REPO_NAME     = 'atelier-jobs';
  const WORKFLOW_FILE = 'weekly-scan.yml';

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

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
    SpreadsheetApp.getUi().alert(`✅ Scan ${platform} lancé sur GitHub Actions.\nRésultats dans 2-3 minutes.`);
  } else {
    SpreadsheetApp.getUi().alert(`❌ Erreur GitHub: ${code}\n${response.getContentText()}`);
  }
}

// ── Setup GitHub Token ────────────────────────────────────────────────────────

function setupGitHubToken() {
  const ui     = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'GitHub Token',
    'Entre ton GitHub Personal Access Token (scope: workflow) :',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties()
      .setProperty('GITHUB_TOKEN', result.getResponseText().trim());
    ui.alert('✅ Token sauvegardé.');
  }
}

// ── DeepSeek caller ───────────────────────────────────────────────────────────

function callDeepSeek(title, description, company, platform, fit) {
  const systemPrompt = buildSystemPrompt(platform);
  const userPrompt   = `Write a proposal for this job.

Platform: ${platform}
Job Title: ${title}
Company: ${company || 'the client'}
Description: ${(description || '').slice(0, 1200)}
${fit ? `\nFit analysis:\n${fit}` : ''}

Follow the template exactly. Output only JSON: {"proposal":"full text here"}`;

  const payload = JSON.stringify({
    model:       DEEPSEEK_MODEL,
    messages:    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
    temperature: 0.7,
    max_tokens:  600,
  });

  const options = {
    method:             'post',
    contentType:        'application/json',
    headers:            { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
    payload,
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(DEEPSEEK_URL, options);
    const json     = JSON.parse(response.getContentText());

    if (json.error) return { error: json.error.message };

    const raw     = (json.choices?.[0]?.message?.content || '').trim();
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const parsed  = JSON.parse(cleaned);

    return { proposal: parsed.proposal || '' };
  } catch (err) {
    return { error: err.message };
  }
}

// ── System prompts par plateforme ─────────────────────────────────────────────

function buildSystemPrompt(platform) {
  if (platform === 'upwork') {
    return `You are an expert Upwork proposal writer for freelance jobs.
Tone: frank, warm, personal, humble but quietly confident.
Zero fluff, zero emojis, zero exclamation marks mid-sentence.

TEMPLATE (follow exactly):
Hi [name if available],

I saw your project and honestly, this is exactly the kind of [automation/marketing/design] I love building and have done many times.

Quick context about me:
I'm French, been building seriously for over a year now (50+ complex workflows live in production). Before going full-time on this a few months ago, I spent 10 years in digital marketing and growth. Worked for Nike Football Europe, Puma, ran viral campaigns and my own little agency. That experience helps me understand real business needs fast.

Your project [1-sentence summary of what they want] feels totally in my wheelhouse. I've already built [1-2 very close concrete examples] and I'm 100% confident I can deliver something clean, reliable and even a bit better than you expect.

One transparent thing: this will be among my very first jobs on Upwork (brand new profile). That's exactly why I only apply to projects I know I will crush. And why I'm happy to give you a nice launch discount (around 25-35% off my usual rate) to earn your trust and get that first 5-star review.

I'm the kind of person who will stay up all night if needed until everything works perfectly. Losing is not an option for me.

Happy to do this for you anytime. Just accept/reply so we can open the chat and jump on a quick call if you want.

Looking forward to working together!
Best,
Bastien

Rules:
- Max 280 words
- Never use em dashes (—). Use periods or short sentences instead.
- Keep last 2 paragraphs exactly as written
- Make summary and examples specific to the job
- Output only JSON: {"proposal":"full text here"}`;
  }

  if (platform === 'remoteok') {
    return `You write job applications for ATELIER, a premium independent studio led by Bastien Joubert.
Positioning: artisanal quality at freelance speed. Not a commodity freelancer. A rare combination of 10 years senior brand experience + deep AI/automation execution.
Tone: premium, assured, human. Like a trusted senior consultant.

NEVER: "passionate about", "leveraging", "cutting-edge", "excited to apply", agency-speak.
ALWAYS: position as a studio. Concrete results: Nike (+35% e-commerce, +20% app acquisition), Swapfiets (1000+ members in 6 months), 50+ production-grade automation workflows.

Rules:
- Under 200 words
- Never use em dashes (—). Use periods or short sentences instead.
- Close with availability and a clear offer, not a question
- Output only JSON: {"proposal":"full text here"}`;
  }

  // Default: LinkedIn
  return `You write LinkedIn job application messages for ATELIER, led by Bastien Joubert.
Tone: bold, direct, proof-driven. Short sentences. No filler.

NEVER: "passionate about", "leveraging", "cutting-edge", "I'd love to chat", "excited to", "synergies".
ALWAYS: lead with results. Nike (+35% e-commerce, +20% app acquisition), Swapfiets (1000+ members in 6 months), 50+ automation workflows.

Rules:
- Under 200 words
- Never use em dashes (—). Use periods or short sentences instead.
- End with a concrete next step, not a question
- Output only JSON: {"proposal":"full text here"}`;
}

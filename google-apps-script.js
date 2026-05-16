// ─────────────────────────────────────────────────────────────────────────────
// ATELIER — Google Apps Script
// Colle ce code dans : Extensions > Apps Script > Code.gs
// ─────────────────────────────────────────────────────────────────────────────
//
// Colonnes :
// A: Job Title  B: Description  C: Company   D: Platform  E: Score
// F: Fit For The Role  G: Status  H: Job URL  I: Date Posted  J: Proposal

const GROK_URL   = 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = 'grok-3';

const ATELIER_PROFILE = `ATELIER — premium creative and AI studio led by Bastien Joubert.
Location: Remote / South America. Languages: English (primary), French (native), Spanish (fluent).

BACKGROUND:
- 10+ years brand strategy, digital marketing, creative direction
- Nike Brand Digital Specialist, Western Europe (Amsterdam, 3.5 years)
  - Tiempo x Totti: flew to Rome solo, directed full shoot, sold out worldwide in 48h
  - Winner Stays: large-budget Nike Football Europe campaign, led creative strategy
  - +35% e-commerce revenue, +20% app user acquisition, +30% brand visibility
- Swapfiets Spain — Barcelona launch. 1,000+ members in 6 months from zero.
  Zero paid media. Launched during Covid lockdowns and curfews. Pure organic growth.
- Isobar Colombia — led 8-person innovation team
- Almara (Saudi Arabia, current client) — wellness brand. Full identity, website, social.
- 50+ complex n8n workflows in production (lead enrichment, outreach, content pipelines)
- Expert: Claude Code, n8n, Make.com, Apify, Blotato

KEY PROOF POINTS:
- Tiempo x Totti — flew to Rome, directed shoot, sold out worldwide in 48h
- Winner Stays — large-budget Nike Football Europe campaign
- Swapfiets — 1,000+ members in 6 months, zero paid media, during Covid lockdowns
- 50+ automation workflows in production (n8n, Make, Claude Code, Apify)`;

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
    .addItem('🔑 Setup Grok API Key', 'setupGrokApiKey')
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

    const result = callGrok(title, description, company, platform, fit);

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

// ── Setup keys ────────────────────────────────────────────────────────────────

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

function setupGrokApiKey() {
  const ui     = SpreadsheetApp.getUi();
  const result = ui.prompt(
    'Grok API Key',
    'Entre ta clé API xAI / Grok (commence par xai-...) :',
    ui.ButtonSet.OK_CANCEL
  );
  if (result.getSelectedButton() === ui.Button.OK) {
    PropertiesService.getScriptProperties()
      .setProperty('GROK_API_KEY', result.getResponseText().trim());
    ui.alert('✅ Clé Grok sauvegardée.');
  }
}

// ── Grok caller ───────────────────────────────────────────────────────────────

function callGrok(title, description, company, platform, fit) {
  const apiKey       = PropertiesService.getScriptProperties().getProperty('GROK_API_KEY');
  const systemPrompt = buildSystemPrompt(platform);
  const userPrompt   = `Write a proposal for this job.

Platform: ${platform}
Job Title: ${title}
Company: ${company || 'the client'}
Description: ${(description || '').slice(0, 1500)}
${fit ? `\nFit analysis:\n${fit}` : ''}

Follow the template exactly. Output only JSON: {"proposal":"full text here"}`;

  const payload = JSON.stringify({
    model:       GROK_MODEL,
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
    headers:            { Authorization: `Bearer ${apiKey}` },
    payload,
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(GROK_URL, options);
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
    return `You write Upwork proposals for ATELIER, a premium creative and AI studio led by Bastien Joubert.
Present as ATELIER studio. Sign "Bastien Joubert — ATELIER".

PROFILE:
${ATELIER_PROFILE}

VOICE AND STYLE:
- Frank, warm, personal, humble but quietly confident.
- Zero fluff, zero emojis, zero exclamation marks mid-sentence.
- Never use em dashes (—). Use periods or new sentences instead.
- Never use: passionate, leverage, end-to-end, reach out, synergies, journey, excited to, love to, cutting-edge, full potential.
- Short sentences. Short paragraphs.

TEMPLATE (follow exactly, adapt the specifics):
Hi [first name if available in job post, otherwise skip salutation],

I saw your project and honestly, this is exactly the kind of [automation/marketing/design/etc] I have built many times.

Quick context:
I'm French, been building seriously for over a year now (50+ complex workflows live in production). Before going full-time on this, I spent 10 years in digital marketing and brand strategy. Worked for Nike Football Europe, ran large campaigns, launched brands. That experience means I understand real business needs fast.

[1 paragraph: what their project needs + 1-2 specific concrete examples from ATELIER's background that match]

One transparent thing: this will be among my very first jobs on Upwork (brand new profile). That's exactly why I only apply to projects I know I will deliver on. And why I'm happy to give you a launch discount (around 25-35% off) to earn your trust and get that first 5-star review.

I'm the kind of person who will stay up all night if needed until everything works perfectly. Losing is not an option for me.

Happy to do this for you. Just accept or reply so we can open the chat.

Bastien Joubert — ATELIER

LENGTH: 150 to 220 words maximum.
Output only JSON: {"proposal":"full text here"}`;
  }

  if (platform === 'remoteok') {
    return `You write job applications for ATELIER, a premium creative and AI studio led by Bastien Joubert.
Present as ATELIER studio. Sign "Bastien Joubert — ATELIER".

PROFILE:
${ATELIER_PROFILE}

VOICE AND STYLE:
- Bold, direct, proof-driven. Short sentences. Short paragraphs.
- Never use em dashes (—). Use periods or new sentences instead.
- Never open with "Hi" or any salutation.
- Never use: passionate, leverage, end-to-end, reach out, synergies, journey, excited to, love to, cutting-edge, full potential.
- Lead with a result or a direct statement. No soft openers.

CLOSING:
- End with a concrete next step or direct offer. Not a question.
- Signature only: "Bastien Joubert — ATELIER".

LENGTH: Under 200 words.
Output only JSON: {"proposal":"full text here"}`;
  }

  // Default: LinkedIn
  return `You write LinkedIn job application messages for ATELIER, led by Bastien Joubert.

PROFILE:
${ATELIER_PROFILE}

VOICE AND STYLE:
- Bold, direct, proof-driven. Short sentences. Short paragraphs.
- Never use em dashes (—). Use periods or new sentences instead.
- Never open with "Hi" or any salutation.
- Never use: passionate, leverage, end-to-end, reach out, synergies, journey, excited to, love to, cutting-edge, full potential.
- Lead with a result or a direct statement. No soft openers.

IDENTITY:
- Present as Bastien Joubert, senior professional. Sign "Bastien Joubert".
- If company is unknown or missing: use "you" and "your". Never "they" or "them".

CLOSING:
- End with a concrete next step or direct question.
- Never: "Looking forward to hearing from you", "Best regards", "Kind regards".
- Signature only: "Bastien Joubert".

LENGTH: Under 200 words.
Output only JSON: {"proposal":"full text here"}`;
}

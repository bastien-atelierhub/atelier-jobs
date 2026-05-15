import axios from 'axios';

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID   = 'curious_coder~linkedin-jobs-scraper';

const SEARCH_URLS = [
  'https://www.linkedin.com/jobs/search/?keywords=AI%20automation&f_WT=2',
];

export async function scrapeLinkedIn(config) {
  const { apiKey, maxJobsPerPlatform } = config.apify;

  const { data: run } = await axios.post(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apiKey}`,
    {
      urls: SEARCH_URLS,
      scrapeCompany: false,
    }
  );

  const runId = run.data.id;
  console.log(`[linkedin] Run ID: ${runId}`);
  const dataset = await waitForRun(runId, apiKey, maxJobsPerPlatform);

  return dataset.map(item => ({
    platform:    'linkedin',
    title:       item.title       ?? item.jobTitle       ?? '',
    company:     item.companyName ?? item.company        ?? '',
    url:         item.link        ?? item.jobUrl         ?? '',
    description: item.description ?? item.jobDescription ?? '',
    date:        item.postedAt    ?? new Date().toISOString(),
  }));
}

async function waitForRun(runId, apiKey, limit = 25, timeout = 300_000) {
  const interval = 5_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const { data: status } = await axios.get(
      `${APIFY_BASE}/actor-runs/${runId}?token=${apiKey}`
    );

    const s = status.data.status;
    console.log(`[linkedin] statut: ${s}`);

    if (s === 'SUCCEEDED') {
      const datasetId = status.data.defaultDatasetId;
      const { data: result } = await axios.get(
        `${APIFY_BASE}/datasets/${datasetId}/items?token=${apiKey}&limit=${limit}`
      );
      return result;
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(s)) {
      throw new Error(`Apify run ${runId} terminé avec statut: ${s}`);
    }

    await new Promise(r => setTimeout(r, interval));
  }

  throw new Error(`Apify LinkedIn run timeout après ${timeout / 1000}s`);
}

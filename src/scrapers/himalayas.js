import axios from 'axios';

const MAX_JOBS = 50;

export async function scrapeHimalayas(_config) {
  const results = [];

  try {
    const { data } = await axios.get(
      `https://himalayas.app/jobs/api?limit=${MAX_JOBS}`,
      { timeout: 15_000 }
    );

    const jobs = (data.jobs || []).filter(j => j.applicationLink);

    console.log(`[himalayas] → ${jobs.length} jobs`);
    results.push(...jobs.map(j => ({
      platform:    'himalayas',
      title:       j.title       ?? '',
      company:     j.companyName ?? '',
      url:         j.applicationLink ?? '',
      description: j.description ?? j.excerpt ?? '',
      date:        j.pubDate
        ? new Date(j.pubDate).toISOString()
        : new Date().toISOString(),
    })));
  } catch (err) {
    console.warn(`[himalayas] Erreur: ${err.message}`);
  }

  return results;
}

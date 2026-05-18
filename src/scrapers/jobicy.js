import axios from 'axios';

const TAGS = ['marketing', 'design', 'product', 'brand'];
const COUNT = 50;

export async function scrapeJobicy(_config) {
  const seen    = new Set();
  const results = [];

  for (const tag of TAGS) {
    try {
      const { data } = await axios.get(
        `https://jobicy.com/api/v2/remote-jobs?count=${COUNT}&tag=${tag}`,
        { timeout: 15_000 }
      );

      const jobs = data.jobs || [];
      console.log(`[jobicy] tag:${tag} → ${jobs.length} jobs`);

      for (const j of jobs) {
        if (!j.url || seen.has(j.url)) continue;
        seen.add(j.url);

        results.push({
          platform:    'jobicy',
          title:       j.jobTitle    ?? '',
          company:     j.companyName ?? '',
          url:         j.url         ?? '',
          description: j.jobDescription || j.jobExcerpt || '',
          date:        j.pubDate ? new Date(j.pubDate).toISOString() : new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(`[jobicy] Erreur ${tag}: ${err.message}`);
    }
  }

  console.log(`[jobicy] Total: ${results.length} jobs`);
  return results;
}

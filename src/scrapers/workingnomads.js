import axios from 'axios';

const CATEGORIES = ['marketing', 'design', 'content', 'business-development'];
const MAX_PER_CAT = 20;

export async function scrapeWorkingNomads(_config) {
  const seen    = new Set();
  const results = [];

  for (const cat of CATEGORIES) {
    try {
      const { data } = await axios.get(
        `https://www.workingnomads.com/api/exposed_jobs/?category=${cat}&limit=${MAX_PER_CAT}`,
        { timeout: 15_000 }
      );

      const jobs = (Array.isArray(data) ? data : data.results || []).filter(j => {
        if (!j.url || seen.has(j.url)) return false;
        seen.add(j.url);
        return true;
      });

      console.log(`[workingnomads] cat:${cat} → ${jobs.length} jobs`);
      results.push(...jobs.map(j => ({
        platform:    'workingnomads',
        title:       j.title         ?? '',
        company:     j.company_name  ?? '',
        url:         j.url           ?? '',
        description: j.description   ?? '',
        date:        j.pub_date
          ? new Date(j.pub_date).toISOString()
          : new Date().toISOString(),
      })));
    } catch (err) {
      console.warn(`[workingnomads] Erreur cat:${cat}: ${err.message}`);
    }
  }

  return results;
}

import axios from 'axios';

const CATEGORIES = ['marketing', 'design', 'artificial-intelligence', 'writing', 'product'];
const MAX_PER_CAT = 20;

export async function scrapeRemotive(_config) {
  const seen    = new Set();
  const results = [];

  for (const cat of CATEGORIES) {
    try {
      const { data } = await axios.get(
        `https://remotive.com/api/remote-jobs?category=${cat}&limit=${MAX_PER_CAT}`,
        { timeout: 15_000 }
      );

      const jobs = (data.jobs || []).filter(j => {
        if (!j.url || seen.has(j.url)) return false;
        seen.add(j.url);
        return true;
      });

      console.log(`[remotive] cat:${cat} → ${jobs.length} jobs`);
      results.push(...jobs.map(j => ({
        platform:    'remotive',
        title:       j.title        ?? '',
        company:     j.company_name ?? '',
        url:         j.url          ?? '',
        description: j.description  ?? '',
        date:        j.publication_date
          ? new Date(j.publication_date).toISOString()
          : new Date().toISOString(),
      })));
    } catch (err) {
      console.warn(`[remotive] Erreur cat:${cat}: ${err.message}`);
    }
  }

  return results;
}

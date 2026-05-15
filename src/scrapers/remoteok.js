import axios from 'axios';

const TAGS = ['automation', 'design', 'marketing', 'ai', 'crypto', 'frontend', 'saas', 'content'];
const MAX_PER_TAG = 20;

export async function scrapeRemoteOK(_config) {
  const seen = new Set();
  const results = [];

  for (const tag of TAGS) {
    try {
      const { data } = await axios.get(`https://remoteok.com/api?tag=${tag}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 15_000,
      });

      // Premier élément = objet "legal", on le skip
      const jobs = data.slice(1, MAX_PER_TAG + 1);
      const deduped = jobs.filter(j => {
        if (!j.url || seen.has(j.url)) return false;
        seen.add(j.url);
        return true;
      });

      console.log(`[remoteok] tag:${tag} → ${deduped.length} jobs`);
      results.push(...deduped.map(item => ({
        platform:    'remoteok',
        title:       item.position    ?? item.title ?? '',
        company:     item.company     ?? '',
        url:         item.url         ?? '',
        description: item.description ?? '',
        date:        item.date        ?? new Date().toISOString(),
      })));
    } catch (err) {
      console.warn(`[remoteok] Erreur tag:${tag}: ${err.message}`);
    }
  }

  return results;
}

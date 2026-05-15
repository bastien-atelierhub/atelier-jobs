import axios from 'axios';
import * as cheerio from 'cheerio';

const RSS_BASE = 'https://www.upwork.com/ab/feed/jobs/rss';

const QUERIES = [
  'AI automation freelance',
  'n8n workflow automation',
  'brand strategy remote',
];

const MAX_PER_QUERY = 10;

export async function scrapeUpwork(config) {
  const results = [];
  const seen = new Set();

  for (const q of QUERIES) {
    try {
      const url = `${RSS_BASE}?q=${encodeURIComponent(q)}&sort=recency&paging=0%3B${MAX_PER_QUERY}`;
      const { data: xml } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
        timeout: 15_000,
      });

      const jobs = parseRSS(xml, q);
      const deduped = jobs.filter(j => {
        if (seen.has(j.url)) return false;
        seen.add(j.url);
        return true;
      });

      console.log(`[upwork] "${q}" → ${deduped.length} jobs`);
      results.push(...deduped);
    } catch (err) {
      console.warn(`[upwork] Erreur RSS "${q}": ${err.message}`);
    }
  }

  return results;
}

function parseRSS(xml, query) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const jobs = [];

  $('item').each((_, el) => {
    const title       = $(el).find('title').first().text().trim();
    const link        = $(el).find('link').first().text().trim()
                     || $(el).find('guid').first().text().trim();
    const pubDate     = $(el).find('pubDate').first().text().trim();
    const rawDesc     = $(el).find('description').first().text().trim();

    // La description RSS Upwork est du HTML encodé — on la décode via cheerio
    const descHtml    = cheerio.load(rawDesc);
    const description = descHtml.text().trim();

    if (!title || !link) return;

    jobs.push({
      platform:    'upwork',
      title,
      company:     'Upwork Client',
      url:         link,
      description: description.slice(0, 1000),
      date:        pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  });

  return jobs;
}

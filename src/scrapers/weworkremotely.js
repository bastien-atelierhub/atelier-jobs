import axios from 'axios';
import * as cheerio from 'cheerio';

const FEEDS = [
  'https://weworkremotely.com/categories/remote-sales-and-marketing-jobs.rss',
  'https://weworkremotely.com/categories/remote-design-jobs.rss',
  'https://weworkremotely.com/categories/remote-product-jobs.rss',
  'https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss',
];

export async function scrapeWeWorkRemotely(_config) {
  const seen    = new Set();
  const results = [];

  for (const feed of FEEDS) {
    const cat = feed.match(/remote-(.+)-jobs/)?.[1] ?? 'jobs';
    try {
      const { data: xml } = await axios.get(feed, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15_000,
      });

      const $ = cheerio.load(xml, { xmlMode: true });

      $('item').each((_, el) => {
        const title   = $(el).find('title').first().text().trim();
        const url     = $(el).find('link').first().text().trim()
                     || $(el).find('guid').first().text().trim();
        const pubDate = $(el).find('pubDate').first().text().trim();
        const rawDesc = $(el).find('description').first().text().trim();
        const desc    = cheerio.load(rawDesc).text().trim();

        if (!title || !url || seen.has(url)) return;
        seen.add(url);

        results.push({
          platform:    'weworkremotely',
          title,
          company:     '',
          url,
          description: desc.slice(0, 3000),
          date:        pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        });
      });

      console.log(`[weworkremotely] cat:${cat} → OK`);
    } catch (err) {
      console.warn(`[weworkremotely] Erreur ${cat}: ${err.message}`);
    }
  }

  console.log(`[weworkremotely] Total: ${results.length} jobs`);
  return results;
}

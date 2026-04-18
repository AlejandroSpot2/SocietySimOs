import { Router } from 'express';
import type { Response } from 'express';
import { getServerConfig } from '../config';
import { MindsApiError, MindsClient } from '../minds-client';
import { hashFingerprint, deriveTags, buildPersonaDescription } from '../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IcpGenerateRequest {
  keyword: string;
  productName: string;
  productCategory: string;
  productDescription: string;
}

interface RawPost {
  source: 'reddit' | 'twitter';
  title?: string;
  body: string;
  author?: string;
  upvotes?: number;
  subreddit?: string;
  url: string;
}

interface IcpPersonaResult {
  id: string;
  name: string;
  archetype: string;
  color: string;
  discipline: string;
  keywords: string[];
  remote: {
    sparkId: string;
    fingerprint: string;
    lastSyncedAt: string;
  };
}

// ─── Demo fallback posts ──────────────────────────────────────────────────────

const DEMO_POSTS: RawPost[] = [
  { source: 'reddit', subreddit: 'sales', title: 'Tired of spending 3 hours on prospecting', body: 'I swear half my day is just finding leads and writing first emails. Has anyone automated this without it sounding like a robot wrote it?', upvotes: 234, url: '' },
  { source: 'reddit', subreddit: 'startups', title: 'We hit $10k MRR but our sales process is a mess', body: 'Founder here. We close deals mostly via warm intros. No repeatable outbound. AI sales tools all feel like spam factories. Our buyers are senior enterprise people who see through generic outreach immediately.', upvotes: 187, url: '' },
  { source: 'reddit', subreddit: 'Entrepreneur', title: 'Which AI SDR tool is actually worth it in 2025?', body: "I've tried Outreach, Apollo, Clay. The problem isn't finding emails, it's getting them to not sound like every other cold email. Our response rate is 0.4%. Something is broken.", upvotes: 156, url: '' },
  { source: 'reddit', subreddit: 'sales', title: 'VP wants 80 cold calls a day. Realistic?', body: "The quota feels set in 2010. Everyone hangs up. My colleagues using targeted email sequences are getting way better results. The metrics we track haven't changed in years.", upvotes: 312, url: '' },
  { source: 'reddit', subreddit: 'SaaS', title: 'CRM data quality is killing our pipeline visibility', body: "Nobody updates the CRM. Reps hate it. Leadership has no idea what's real. The tool needs to fill itself automatically from activity data.", upvotes: 198, url: '' },
  { source: 'twitter', body: "The future of SDRs is augmentation not replacement. Reps who use AI for research and personalization will 10x output. The ones who don't will be replaced.", upvotes: 445, url: '' },
  { source: 'twitter', body: "Unpopular opinion: most cold email personalization is still just mail merge with LinkedIn data. Real personalization means knowing what keeps someone up at night.", upvotes: 892, url: '' },
  { source: 'reddit', subreddit: 'marketing', title: 'B2B content is dead without specific ICP pain', body: 'Generic whitepapers get ignored. Only hyper-specific case studies about their exact role convert. Stop creating for everyone.', upvotes: 267, url: '' },
  { source: 'twitter', body: 'Hot take: best GTM motion in 2025 is still founder-led sales. LinkedIn DMs with genuine value, engineered referrals, short evaluation cycle.', upvotes: 634, url: '' },
  { source: 'reddit', subreddit: 'SaaS', title: 'Modern outbound stack in 2025?', body: 'Building outbound from scratch. Clay for enrichment, Instantly for sending, Gong for calls. What am I missing for AI personalization that does not sound fake?', upvotes: 321, url: '' },
  { source: 'twitter', body: 'Nobody talks about how bad cold email response rates actually are. Industry average is under 1%. We are all pretending volume compensates for relevance.', upvotes: 1204, url: '' },
  { source: 'reddit', subreddit: 'startups', title: 'VP of Sales at $40k ARR — too early?', body: 'Debating VP of Sales vs better tooling + 2 junior reps. Thesis: great tooling + junior reps might outperform 1 expensive VP with an old playbook.', upvotes: 189, url: '' },
];

// ─── 10 archetype templates ───────────────────────────────────────────────────

const ARCHETYPE_TEMPLATES = [
  { id: 'the_skeptic',        name: 'The Skeptic',        archetype: 'Data-Driven Doubter',   color: 'text-indigo-400',  discipline: 'Analytics' },
  { id: 'the_champion',       name: 'The Champion',       archetype: 'Internal Evangelist',   color: 'text-cyan-400',    discipline: 'Product Management' },
  { id: 'the_budget_owner',   name: 'The Budget Owner',   archetype: 'ROI Gatekeeper',        color: 'text-yellow-400',  discipline: 'Finance' },
  { id: 'the_end_user',       name: 'The End User',       archetype: 'Daily Practitioner',    color: 'text-emerald-400', discipline: 'Operations' },
  { id: 'the_executive',      name: 'The Executive',      archetype: 'Strategic Buyer',       color: 'text-rose-400',    discipline: 'Executive Leadership' },
  { id: 'the_tech_lead',      name: 'The Tech Lead',      archetype: 'Technical Evaluator',   color: 'text-blue-400',    discipline: 'Engineering' },
  { id: 'the_early_adopter',  name: 'The Early Adopter',  archetype: 'Innovation Seeker',     color: 'text-fuchsia-400', discipline: 'Growth' },
  { id: 'the_traditionalist', name: 'The Traditionalist', archetype: 'Status Quo Defender',   color: 'text-orange-400',  discipline: 'Sales' },
  { id: 'the_pragmatist',     name: 'The Pragmatist',     archetype: 'Practical Implementer', color: 'text-pink-400',    discipline: 'Customer Success' },
  { id: 'the_influencer',     name: 'The Influencer',     archetype: 'Peer Opinion Leader',   color: 'text-purple-400',  discipline: 'Marketing' },
] as const;

// ─── Apify helpers ────────────────────────────────────────────────────────────

async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apifyKey: string,
  timeoutMs = 90_000,
): Promise<Record<string, unknown>[]> {
  const BASE = 'https://api.apify.com/v2';

  const runRes = await fetch(`${BASE}/acts/${actorId}/runs?token=${apifyKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!runRes.ok) throw new Error(`Apify actor start failed [${runRes.status}]`);

  const { data: runData } = await runRes.json() as { data: { id: string } };
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const { data: s } = await fetch(`${BASE}/actor-runs/${runData.id}?token=${apifyKey}`)
      .then(r => r.json()) as { data: { status: string } };
    if (s.status === 'SUCCEEDED') break;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(s.status)) {
      throw new Error(`Apify run ended: ${s.status}`);
    }
  }

  return fetch(`${BASE}/actor-runs/${runData.id}/dataset/items?token=${apifyKey}&limit=40`)
    .then(r => r.json()) as Promise<Record<string, unknown>[]>;
}

async function scrapeReddit(keyword: string, apifyKey: string): Promise<RawPost[]> {
  const items = await runApifyActor(
    'trudax~reddit-scraper-lite',
    { searches: [keyword], type: 'posts', sort: 'relevance', maxItems: 20, includeNSFW: false },
    apifyKey,
  );
  return items
    .map(item => ({
      source: 'reddit' as const,
      title: (item.title as string) ?? '',
      body: ((item.selftext as string) ?? (item.body as string) ?? '').slice(0, 800),
      author: item.author as string,
      upvotes: (item.score as number) ?? 0,
      subreddit: item.subreddit as string,
      url: (item.url as string) ?? '',
    }))
    .filter(p => p.body.length > 30);
}

async function scrapeTwitter(keyword: string, apifyKey: string): Promise<RawPost[]> {
  const items = await runApifyActor(
    'apidojo~tweet-scraper',
    { searchTerms: [keyword], maxItems: 20, queryType: 'Latest', lang: 'en' },
    apifyKey,
  );
  return items
    .map(item => ({
      source: 'twitter' as const,
      body: ((item.full_text as string) ?? (item.text as string) ?? '')
        .replace(/https?:\/\/\S+/g, '').trim().slice(0, 600),
      author: ((item.user as Record<string, unknown>)?.screen_name as string) ?? '',
      upvotes: (item.favorite_count as number) ?? 0,
      url: `https://twitter.com/i/web/status/${(item.id_str as string) ?? ''}`,
    }))
    .filter(p => p.body.length > 20);
}

// ─── Keyword extraction ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','was','are','were','be','been','have','has','had','do','does',
  'did','will','would','could','should','may','might','this','that','these',
  'those','it','its','we','our','my','your','their','just','like','not','no',
  'so','if','when','how','what','why','who','which','about','up','out','more',
  'all','can','get','got','very','really','also','still',
]);

const ARCHETYPE_BASE_KEYWORDS: Record<string, string[]> = {
  the_skeptic:        ['ROI', 'metrics', 'proof', 'data', 'results'],
  the_champion:       ['productivity', 'efficiency', 'automation', 'workflow'],
  the_budget_owner:   ['cost', 'pricing', 'budget', 'investment', 'savings'],
  the_end_user:       ['easy', 'simple', 'daily', 'practical', 'usable'],
  the_executive:      ['strategy', 'growth', 'revenue', 'leadership', 'scale'],
  the_tech_lead:      ['integration', 'API', 'security', 'infrastructure', 'stack'],
  the_early_adopter:  ['innovative', 'cutting-edge', 'beta', 'trend', 'new'],
  the_traditionalist: ['proven', 'reliable', 'established', 'traditional', 'stable'],
  the_pragmatist:     ['implementation', 'support', 'onboarding', 'practical', 'realistic'],
  the_influencer:     ['community', 'network', 'social', 'reputation', 'influence'],
};

function extractKeywordsForArchetype(
  posts: RawPost[],
  archetypeId: string,
  archetypeDiscipline: string,
  productKeyword: string,
): string[] {
  const allText = posts.map(p => `${p.title ?? ''} ${p.body}`).join(' ').toLowerCase();
  const wordFreq = new Map<string, number>();
  for (const word of allText.match(/\b[a-z]{4,}\b/g) ?? []) {
    if (!STOP_WORDS.has(word)) wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
  }
  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);

  return [
    productKeyword,
    archetypeDiscipline,
    ...(ARCHETYPE_BASE_KEYWORDS[archetypeId] ?? []),
    ...topWords.slice(0, 3),
  ].slice(0, 8);
}

// ─── Knowledge text builder ───────────────────────────────────────────────────

function buildKnowledgeText(posts: RawPost[], keyword: string): string {
  const sections = posts.map(p => [
    `[${p.source === 'reddit' ? `Reddit${p.subreddit ? ` (r/${p.subreddit})` : ''}` : 'Twitter/X'}]`,
    p.title ? `Title: ${p.title}` : null,
    `Content: ${p.body}`,
    p.upvotes ? `Engagement: ${p.upvotes} upvotes/likes` : null,
  ].filter(Boolean).join('\n'));

  return [
    `ICP RESEARCH DATA — Keyword: "${keyword}"`,
    `Scraped: ${new Date().toISOString()}`,
    `Total: ${posts.length} posts`,
    '',
    '═══════════════════════════════════════',
    '',
    sections.join('\n\n---\n\n'),
  ].join('\n');
}

// ─── Error handler ────────────────────────────────────────────────────────────

function handleRouteError(error: unknown, response: Response) {
  if (error instanceof MindsApiError) {
    response.status(error.status).json({ message: error.message, details: error.body });
    return;
  }
  response.status(500).json({
    message: error instanceof Error ? error.message : 'Unexpected server error.',
  });
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const icpRouter = Router();

icpRouter.post('/generate', async (request, response) => {
  const config = getServerConfig();

  if (!config.configured) {
    response.status(503).json({ message: 'MINDS_API_KEY is not configured.' });
    return;
  }
  if (!config.apifyApiKey) {
    response.status(503).json({ message: 'APIFY_API_KEY is not configured.' });
    return;
  }

  const body = request.body as IcpGenerateRequest;
  if (!body?.keyword || !body?.productName) {
    response.status(400).json({ message: 'keyword and productName are required.' });
    return;
  }

  const client = new MindsClient();

  try {
    // 1. Scrape
    let posts: RawPost[] = [];

    await scrapeReddit(body.keyword, config.apifyApiKey)
      .then(p => posts.push(...p))
      .catch(err => console.warn('[icp] Reddit failed:', (err as Error).message));

    await scrapeTwitter(body.keyword, config.apifyApiKey)
      .then(p => posts.push(...p))
      .catch(err => console.warn('[icp] Twitter failed:', (err as Error).message));

    if (posts.length < 5) {
      console.warn('[icp] Using demo posts fallback.');
      posts = DEMO_POSTS;
    }

    const knowledgeBuffer = Buffer.from(buildKnowledgeText(posts, body.keyword), 'utf-8');
    const knowledgeFilename = `icp_${body.keyword.replace(/\s+/g, '_').slice(0, 40)}.txt`;

    // 2. Create 10 Sparks + upload knowledge
    const results: IcpPersonaResult[] = [];

    for (const template of ARCHETYPE_TEMPLATES) {
      try {
        const keywords = extractKeywordsForArchetype(
          posts, template.id, template.discipline, body.keyword,
        );
        const tags = deriveTags(template.name);
        const description = buildPersonaDescription(template.name, template.discipline);
        const fingerprint = hashFingerprint([
          template.name, template.discipline, body.keyword, keywords.join(','),
        ]);

        // Create Spark — Minds AI trains it automatically via Tavily + YouTube
        const spark = await client.createKeywordsSpark({
          name: template.name,
          description,
          discipline: template.discipline,
          keywords,
          tags,
        });

        // Upload scraped posts as knowledge (non-fatal)
        await client.uploadKnowledge(
          spark.id,
          knowledgeBuffer,
          knowledgeFilename,
          `Real ICP conversations about: ${body.keyword}`,
        ).catch(err => console.warn(`[icp] Knowledge upload failed for ${template.name}:`, (err as Error).message));

        results.push({
          id: template.id,
          name: template.name,
          archetype: template.archetype,
          color: template.color,
          discipline: template.discipline,
          keywords,
          remote: {
            sparkId: spark.id,
            fingerprint,
            lastSyncedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.warn(`[icp] Spark creation failed for ${template.name}:`, (err as Error).message);
      }
    }

    if (results.length === 0) {
      response.status(500).json({ message: 'Failed to create any Sparks.' });
      return;
    }

    response.json({
      personas: results,
      postsScraped: posts.length,
      redditPosts: posts.filter(p => p.source === 'reddit').length,
      twitterPosts: posts.filter(p => p.source === 'twitter').length,
    });

  } catch (error) {
    handleRouteError(error, response);
  }
});

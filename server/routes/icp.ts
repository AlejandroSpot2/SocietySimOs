import { Router } from 'express';
import type { Response } from 'express';
import { getServerConfig } from '../config';
import { MindsApiError, MindsClient, type AnalystPayload } from '../minds-client';
import { deriveTags, hashFingerprint, slugify } from '../utils';

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
  description: string;
  prompt: string;
  tags: string[];
  keywords: string[];
  remote: {
    sparkId: string;
    fingerprint: string;
    lastSyncedAt: string;
  };
}

interface SynthesizedPersonaDraft {
  id?: string;
  name: string;
  archetype: string;
  discipline: string;
  summary: string;
  prompt: string;
  keywords: string[];
  signals: string[];
}

interface SynthesizedPersonaResponse {
  personas: SynthesizedPersonaDraft[];
}

interface CompletionEnvelope<T> {
  content?: string;
  parsed?: T;
}

const TARGET_SYNTHETIC_PERSONAS = 10;
const ICP_SYNTHESIZER_NAME = 'ICP Persona Synthesizer';
const ICP_SYNTHESIZER_DESCRIPTION =
  'Expert spark that converts live community research into grounded ICP personas.';
const ICP_SYNTHESIZER_DISCIPLINE = 'Market Research';
const ICP_SYNTHESIZER_TAGS = ['icp', 'persona-synthesis', 'market-research'];
const ICP_SYNTHESIZER_PROMPT = `You synthesize realistic buyer and operator personas from community research.

Ground every persona in the provided posts.
Use realistic person names and role labels, not generic archetype names like "The Skeptic".
Keep personas distinct in job function, incentives, objections, and tone.
Write prompts that make each spark feel like a specific person with a clear voice.
Do not invent unsupported demographic details.`;

const PERSONA_COLOR_SEQUENCE = [
  'text-cyan-400',
  'text-yellow-400',
  'text-pink-400',
  'text-emerald-400',
  'text-blue-400',
  'text-rose-400',
  'text-fuchsia-400',
  'text-orange-400',
  'text-indigo-400',
  'text-purple-400',
] as const;

const DEMO_POSTS: RawPost[] = [
  {
    source: 'reddit',
    subreddit: 'sales',
    title: 'Tired of spending 3 hours on prospecting',
    body: 'I swear half my day is just finding leads and writing first emails. Has anyone automated this without it sounding like a robot wrote it?',
    upvotes: 234,
    url: '',
  },
  {
    source: 'reddit',
    subreddit: 'startups',
    title: 'We hit $10k MRR but our sales process is a mess',
    body: 'Founder here. We close deals mostly via warm intros. No repeatable outbound. AI sales tools all feel like spam factories. Our buyers are senior enterprise people who see through generic outreach immediately.',
    upvotes: 187,
    url: '',
  },
  {
    source: 'reddit',
    subreddit: 'Entrepreneur',
    title: 'Which AI SDR tool is actually worth it in 2025?',
    body: "I've tried Outreach, Apollo, Clay. The problem isn't finding emails, it's getting them to not sound like every other cold email. Our response rate is 0.4%. Something is broken.",
    upvotes: 156,
    url: '',
  },
  {
    source: 'reddit',
    subreddit: 'sales',
    title: 'VP wants 80 cold calls a day. Realistic?',
    body: "The quota feels set in 2010. Everyone hangs up. My colleagues using targeted email sequences are getting way better results. The metrics we track haven't changed in years.",
    upvotes: 312,
    url: '',
  },
  {
    source: 'reddit',
    subreddit: 'SaaS',
    title: 'CRM data quality is killing our pipeline visibility',
    body: "Nobody updates the CRM. Reps hate it. Leadership has no idea what's real. The tool needs to fill itself automatically from activity data.",
    upvotes: 198,
    url: '',
  },
  {
    source: 'twitter',
    body: "The future of SDRs is augmentation not replacement. Reps who use AI for research and personalization will 10x output. The ones who don't will be replaced.",
    upvotes: 445,
    url: '',
  },
  {
    source: 'twitter',
    body: 'Unpopular opinion: most cold email personalization is still just mail merge with LinkedIn data. Real personalization means knowing what keeps someone up at night.',
    upvotes: 892,
    url: '',
  },
  {
    source: 'reddit',
    subreddit: 'marketing',
    title: 'B2B content is dead without specific ICP pain',
    body: 'Generic whitepapers get ignored. Only hyper-specific case studies about their exact role convert. Stop creating for everyone.',
    upvotes: 267,
    url: '',
  },
  {
    source: 'twitter',
    body: 'Hot take: best GTM motion in 2025 is still founder-led sales. LinkedIn DMs with genuine value, engineered referrals, short evaluation cycle.',
    upvotes: 634,
    url: '',
  },
  {
    source: 'reddit',
    subreddit: 'SaaS',
    title: 'Modern outbound stack in 2025?',
    body: 'Building outbound from scratch. Clay for enrichment, Instantly for sending, Gong for calls. What am I missing for AI personalization that does not sound fake?',
    upvotes: 321,
    url: '',
  },
  {
    source: 'twitter',
    body: 'Nobody talks about how bad cold email response rates actually are. Industry average is under 1%. We are all pretending volume compensates for relevance.',
    upvotes: 1204,
    url: '',
  },
  {
    source: 'reddit',
    subreddit: 'startups',
    title: 'VP of Sales at $40k ARR - too early?',
    body: 'Debating VP of Sales vs better tooling + 2 junior reps. Thesis: great tooling + junior reps might outperform 1 expensive VP with an old playbook.',
    upvotes: 189,
    url: '',
  },
];

const FALLBACK_ARCHETYPE_TEMPLATES = [
  { id: 'roi_guardian', name: 'Maya Patel', archetype: 'ROI Gatekeeper', discipline: 'Finance' },
  { id: 'workflow_operator', name: 'Jordan Reyes', archetype: 'Workflow Operator', discipline: 'Revenue Operations' },
  { id: 'exec_sponsor', name: 'Avery Collins', archetype: 'Executive Sponsor', discipline: 'Executive Leadership' },
  { id: 'skeptical_manager', name: 'Priya Nair', archetype: 'Skeptical Team Lead', discipline: 'Sales Management' },
  { id: 'practical_builder', name: 'Lucas Moreno', archetype: 'Practical Implementer', discipline: 'Operations' },
  { id: 'signal_hunter', name: 'Sofia Kim', archetype: 'Signal Hunter', discipline: 'Growth' },
  { id: 'systems_architect', name: 'Ethan Brooks', archetype: 'Systems Architect', discipline: 'Engineering' },
  { id: 'change_champion', name: 'Nina Alvarez', archetype: 'Change Champion', discipline: 'Product Management' },
  { id: 'field_pragmatist', name: 'Marcus Green', archetype: 'Field Pragmatist', discipline: 'Customer Success' },
  { id: 'market_storyteller', name: 'Chloe Bennett', archetype: 'Market Storyteller', discipline: 'Marketing' },
] as const;

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'was',
  'are',
  'were',
  'be',
  'been',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'we',
  'our',
  'my',
  'your',
  'their',
  'just',
  'like',
  'not',
  'no',
  'so',
  'if',
  'when',
  'how',
  'what',
  'why',
  'who',
  'which',
  'about',
  'up',
  'out',
  'more',
  'all',
  'can',
  'get',
  'got',
  'very',
  'really',
  'also',
  'still',
]);

const ARCHETYPE_BASE_KEYWORDS: Record<string, string[]> = {
  roi_guardian: ['roi', 'budget', 'pricing', 'cost', 'savings'],
  workflow_operator: ['workflow', 'process', 'automation', 'handoff', 'efficiency'],
  exec_sponsor: ['strategy', 'growth', 'revenue', 'scale', 'leadership'],
  skeptical_manager: ['quota', 'team', 'adoption', 'proof', 'change'],
  practical_builder: ['implementation', 'support', 'usability', 'onboarding', 'practical'],
  signal_hunter: ['experimentation', 'conversion', 'personalization', 'pipeline', 'insight'],
  systems_architect: ['integration', 'api', 'security', 'infrastructure', 'stack'],
  change_champion: ['buy-in', 'transformation', 'rollout', 'enablement', 'adoption'],
  field_pragmatist: ['customer', 'retention', 'handover', 'daily', 'execution'],
  market_storyteller: ['messaging', 'positioning', 'story', 'case-study', 'audience'],
};

function handleRouteError(error: unknown, response: Response) {
  if (error instanceof MindsApiError) {
    response.status(error.status).json({ message: error.message, details: error.body });
    return;
  }

  response.status(500).json({
    message: error instanceof Error ? error.message : 'Unexpected server error.',
  });
}

function uniqueStrings(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      continue;
    }

    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push(trimmed);

    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

function ensureUniqueId(baseId: string, usedIds: Set<string>): string {
  let candidate = baseId || 'persona';
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function buildPersonaDescription(draft: SynthesizedPersonaDraft, productName: string): string {
  const signals = draft.signals.length > 0 ? `Signals: ${draft.signals.join('; ')}.` : '';
  return `Real ICP persona synthesized from live community research for ${productName}. ${draft.summary} ${signals}`.trim();
}

function buildFallbackPrompt(draft: SynthesizedPersonaDraft, keyword: string): string {
  return [
    `You are ${draft.name}, a ${draft.discipline} persona participating in a focus group about ${keyword}.`,
    `Core stance: ${draft.summary}`,
    `Signals you care about: ${draft.signals.join('; ') || draft.keywords.join('; ')}`,
    'Stay in character, speak concretely, and respond like a real operator with clear buying criteria and objections.',
    'Keep your tone natural and specific. Do not mention that you are an AI.',
  ].join('\n');
}

function normalizePersonaDrafts(
  drafts: SynthesizedPersonaDraft[],
  context: { keyword: string },
  usedIds = new Set<string>(),
): SynthesizedPersonaDraft[] {
  return drafts.map((draft, index) => {
    const name = draft.name.trim() || `Persona ${index + 1}`;
    const discipline = draft.discipline.trim() || 'Consumer Persona';
    const archetype = draft.archetype.trim() || discipline;
    const idBase = slugify(draft.id || name || `persona-${index + 1}`) || `persona-${index + 1}`;
    const id = ensureUniqueId(idBase, usedIds);
    const keywords = uniqueStrings([context.keyword, discipline, ...draft.keywords], 8);
    const signals = uniqueStrings(draft.signals, 4);
    const summary = draft.summary.trim() || `${name} evaluates new products through the lens of ${archetype}.`;
    const prompt =
      draft.prompt.trim().length >= 80 ? draft.prompt.trim() : buildFallbackPrompt({ ...draft, name, discipline, archetype, summary, keywords, signals }, context.keyword);

    return {
      id,
      name,
      archetype,
      discipline,
      summary,
      prompt,
      keywords,
      signals,
    };
  });
}

function selectRepresentativePosts(posts: RawPost[], limit = 18): RawPost[] {
  return [...posts]
    .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0))
    .slice(0, limit);
}

function buildPersonaSynthesisPrompt(
  request: IcpGenerateRequest,
  posts: RawPost[],
  targetCount: number,
): string {
  const postDigest = selectRepresentativePosts(posts)
    .map((post, index) => {
      const sourceLabel =
        post.source === 'reddit'
          ? `Reddit${post.subreddit ? ` / r/${post.subreddit}` : ''}`
          : 'Twitter/X';
      return [
        `${index + 1}. ${sourceLabel}`,
        post.title ? `Title: ${post.title}` : null,
        `Content: ${post.body}`,
        post.upvotes ? `Engagement: ${post.upvotes}` : null,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return `Create ${targetCount} distinct ICP personas from this community research.

Product:
- Name: ${request.productName}
- Category: ${request.productCategory}
- Description: ${request.productDescription}
- Search keyword: ${request.keyword}

Requirements:
- Use realistic person names, not labels like "The Skeptic".
- Each persona must represent a distinct role, buying lens, and communication style grounded in the posts.
- Draw motivations, objections, and vocabulary from the research corpus.
- Keep prompts suitable for a synthetic focus-group spark.
- Prompt must be 90 to 220 words, plain text, and written as direct instructions for the persona.
- Keywords should be concrete phrases or themes from the dataset.
- Signals should be short evidence-backed cues that justify why this persona exists.

Research corpus:
${postDigest}`;
}

function isSynthesizedPersonaResponse(value: unknown): value is SynthesizedPersonaResponse {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'personas' in value &&
      Array.isArray((value as SynthesizedPersonaResponse).personas),
  );
}

function parseStructuredResult<T extends object>(
  result: CompletionEnvelope<T>,
  guard: (value: unknown) => value is T,
  errorMessage: string,
): T {
  if (guard(result.parsed)) {
    return result.parsed;
  }

  if (result.content) {
    try {
      const parsed = JSON.parse(result.content) as unknown;
      if (guard(parsed)) {
        return parsed;
      }
    } catch {
      // noop
    }
  }

  throw new Error(errorMessage);
}

function personaSynthFingerprint(): string {
  return hashFingerprint([
    ICP_SYNTHESIZER_NAME,
    ICP_SYNTHESIZER_DISCIPLINE,
    ICP_SYNTHESIZER_PROMPT,
    ICP_SYNTHESIZER_TAGS.join(','),
  ]);
}

async function ensureIcpSynthesizerSpark(client: MindsClient) {
  const fingerprint = personaSynthFingerprint();
  const matches = await client.listSparks(ICP_SYNTHESIZER_NAME);
  const exact = matches.find((spark) => spark.name === ICP_SYNTHESIZER_NAME);

  const payload: AnalystPayload = {
    name: ICP_SYNTHESIZER_NAME,
    description: ICP_SYNTHESIZER_DESCRIPTION,
    discipline: ICP_SYNTHESIZER_DISCIPLINE,
    prompt: ICP_SYNTHESIZER_PROMPT,
    tags: ICP_SYNTHESIZER_TAGS,
  };

  let sparkId = exact?.id;
  if (!sparkId) {
    const created = await client.createAnalystSpark(payload);
    sparkId = created.id;
  }

  await client.updateSpark(sparkId, payload, 'expert');

  return {
    sparkId,
    fingerprint,
    lastSyncedAt: new Date().toISOString(),
  };
}

async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  apifyKey: string,
  timeoutMs = 90_000,
): Promise<Record<string, unknown>[]> {
  const baseUrl = 'https://api.apify.com/v2';

  const runResponse = await fetch(`${baseUrl}/acts/${actorId}/runs?token=${apifyKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!runResponse.ok) {
    throw new Error(`Apify actor start failed [${runResponse.status}]`);
  }

  const { data: runData } = (await runResponse.json()) as { data: { id: string } };
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const { data: status } = (await fetch(`${baseUrl}/actor-runs/${runData.id}?token=${apifyKey}`).then((res) =>
      res.json(),
    )) as { data: { status: string } };

    if (status.status === 'SUCCEEDED') {
      break;
    }

    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status.status)) {
      throw new Error(`Apify run ended: ${status.status}`);
    }
  }

  return (await fetch(
    `${baseUrl}/actor-runs/${runData.id}/dataset/items?token=${apifyKey}&limit=40`,
  ).then((res) => res.json())) as Record<string, unknown>[];
}

async function scrapeReddit(keyword: string, apifyKey: string): Promise<RawPost[]> {
  const items = await runApifyActor(
    'trudax~reddit-scraper-lite',
    { searches: [keyword], type: 'posts', sort: 'relevance', maxItems: 20, includeNSFW: false },
    apifyKey,
  );

  return items
    .map((item) => ({
      source: 'reddit' as const,
      title: (item.title as string) ?? '',
      body: ((item.selftext as string) ?? (item.body as string) ?? '').slice(0, 800),
      author: item.author as string,
      upvotes: (item.score as number) ?? 0,
      subreddit: item.subreddit as string,
      url: (item.url as string) ?? '',
    }))
    .filter((post) => post.body.length > 30);
}

async function scrapeTwitter(keyword: string, apifyKey: string): Promise<RawPost[]> {
  const items = await runApifyActor(
    'apidojo~tweet-scraper',
    { searchTerms: [keyword], maxItems: 20, queryType: 'Latest', lang: 'en' },
    apifyKey,
  );

  return items
    .map((item) => ({
      source: 'twitter' as const,
      body: ((item.full_text as string) ?? (item.text as string) ?? '')
        .replace(/https?:\/\/\S+/g, '')
        .trim()
        .slice(0, 600),
      author: ((item.user as Record<string, unknown>)?.screen_name as string) ?? '',
      upvotes: (item.favorite_count as number) ?? 0,
      url: `https://twitter.com/i/web/status/${(item.id_str as string) ?? ''}`,
    }))
    .filter((post) => post.body.length > 20);
}

function extractKeywordsForArchetype(
  posts: RawPost[],
  archetypeId: string,
  discipline: string,
  productKeyword: string,
): string[] {
  const allText = posts.map((post) => `${post.title ?? ''} ${post.body}`).join(' ').toLowerCase();
  const wordFreq = new Map<string, number>();

  for (const word of allText.match(/\b[a-z]{4,}\b/g) ?? []) {
    if (!STOP_WORDS.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
    }
  }

  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  return uniqueStrings(
    [productKeyword, discipline, ...(ARCHETYPE_BASE_KEYWORDS[archetypeId] ?? []), ...topWords.slice(0, 3)],
    8,
  );
}

function buildKnowledgeText(posts: RawPost[], keyword: string): string {
  const sections = posts.map((post) =>
    [
      `[${post.source === 'reddit' ? `Reddit${post.subreddit ? ` (r/${post.subreddit})` : ''}` : 'Twitter/X'}]`,
      post.title ? `Title: ${post.title}` : null,
      `Content: ${post.body}`,
      post.upvotes ? `Engagement: ${post.upvotes} upvotes/likes` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );

  return [
    `ICP RESEARCH DATA - Keyword: "${keyword}"`,
    `Scraped: ${new Date().toISOString()}`,
    `Total: ${posts.length} posts`,
    '',
    '----------------------------------------',
    '',
    sections.join('\n\n---\n\n'),
  ].join('\n');
}

function createFallbackPersonaDrafts(posts: RawPost[], request: IcpGenerateRequest): SynthesizedPersonaDraft[] {
  return FALLBACK_ARCHETYPE_TEMPLATES.map((template) => {
    const keywords = extractKeywordsForArchetype(posts, template.id, template.discipline, request.keyword);
    const signals = uniqueStrings([
      `Recurring theme: ${keywords[2] ?? request.keyword}`,
      `${template.discipline} lens on ${request.productName}`,
      `Evaluates ${request.productCategory} through ${template.archetype.toLowerCase()}`,
    ], 4);
    const summary = `${template.name} is a ${template.discipline} persona who evaluates ${request.productName} as a ${template.archetype.toLowerCase()} and cares about ${keywords.slice(0, 3).join(', ')}.`;

    return {
      id: template.id,
      name: template.name,
      archetype: template.archetype,
      discipline: template.discipline,
      summary,
      prompt: '',
      keywords,
      signals,
    };
  });
}

async function synthesizePersonaDrafts(
  client: MindsClient,
  request: IcpGenerateRequest,
  posts: RawPost[],
): Promise<SynthesizedPersonaDraft[]> {
  const synthesizer = await ensureIcpSynthesizerSpark(client);
  const completion = await client.completeSpark<CompletionEnvelope<SynthesizedPersonaResponse>>(
    synthesizer.sparkId,
    {
      messages: [
        {
          role: 'user',
          content: buildPersonaSynthesisPrompt(request, posts, TARGET_SYNTHETIC_PERSONAS),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'icp_persona_synthesis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              personas: {
                type: 'array',
                minItems: 6,
                maxItems: TARGET_SYNTHETIC_PERSONAS,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    archetype: { type: 'string' },
                    discipline: { type: 'string' },
                    summary: { type: 'string' },
                    prompt: { type: 'string' },
                    keywords: {
                      type: 'array',
                      minItems: 4,
                      maxItems: 8,
                      items: { type: 'string' },
                    },
                    signals: {
                      type: 'array',
                      minItems: 2,
                      maxItems: 4,
                      items: { type: 'string' },
                    },
                  },
                  required: ['id', 'name', 'archetype', 'discipline', 'summary', 'prompt', 'keywords', 'signals'],
                },
              },
            },
            required: ['personas'],
          },
        },
      },
    },
  );

  const parsed = parseStructuredResult<SynthesizedPersonaResponse>(
    completion,
    isSynthesizedPersonaResponse,
    'ICP persona synthesis returned an invalid payload.',
  );

  const usedIds = new Set<string>();
  const normalized = normalizePersonaDrafts(parsed.personas, { keyword: request.keyword }, usedIds);
  if (normalized.length >= TARGET_SYNTHETIC_PERSONAS) {
    return normalized.slice(0, TARGET_SYNTHETIC_PERSONAS);
  }

  const fallback = normalizePersonaDrafts(createFallbackPersonaDrafts(posts, request), { keyword: request.keyword }, usedIds);
  return [...normalized, ...fallback].slice(0, TARGET_SYNTHETIC_PERSONAS);
}

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
    let posts: RawPost[] = [];

    await scrapeReddit(body.keyword, config.apifyApiKey)
      .then((results) => posts.push(...results))
      .catch((error) => console.warn('[icp] Reddit failed:', (error as Error).message));

    await scrapeTwitter(body.keyword, config.apifyApiKey)
      .then((results) => posts.push(...results))
      .catch((error) => console.warn('[icp] Twitter failed:', (error as Error).message));

    if (posts.length < 5) {
      console.warn('[icp] Using demo posts fallback.');
      posts = DEMO_POSTS;
    }

    const knowledgeBuffer = Buffer.from(buildKnowledgeText(posts, body.keyword), 'utf-8');
    const knowledgeFilename = `icp_${body.keyword.replace(/\s+/g, '_').slice(0, 40)}.txt`;

    let drafts: SynthesizedPersonaDraft[];
    try {
      drafts = await synthesizePersonaDrafts(client, body, posts);
    } catch (error) {
      console.warn('[icp] Persona synthesis failed, using fallback drafts:', (error as Error).message);
      drafts = normalizePersonaDrafts(createFallbackPersonaDrafts(posts, body), { keyword: body.keyword }).slice(
        0,
        TARGET_SYNTHETIC_PERSONAS,
      );
    }

    const results: IcpPersonaResult[] = [];

    for (const [index, draft] of drafts.entries()) {
      try {
        const color = PERSONA_COLOR_SEQUENCE[index % PERSONA_COLOR_SEQUENCE.length];
        const tags = uniqueStrings(
          [...deriveTags(draft.name), ...deriveTags(draft.archetype), ...draft.keywords.map((keyword) => slugify(keyword))],
          8,
        );
        const description = buildPersonaDescription(draft, body.productName);
        const fingerprint = hashFingerprint([
          draft.name,
          draft.discipline,
          description,
          draft.prompt,
          draft.keywords.join(','),
          body.keyword,
        ]);

        const spark = await client.createKeywordsSpark({
          name: draft.name,
          description,
          discipline: draft.discipline,
          keywords: draft.keywords,
          tags,
        });

        await client.updateSpark(
          spark.id,
          {
            name: draft.name,
            description,
            discipline: draft.discipline,
            tags,
            prompt: draft.prompt,
          },
          'user',
        );

        await client
          .uploadKnowledge(
            spark.id,
            knowledgeBuffer,
            knowledgeFilename,
            `Live ICP conversations about ${body.keyword} for ${draft.name}`,
          )
          .catch((error) =>
            console.warn(`[icp] Knowledge upload failed for ${draft.name}:`, (error as Error).message),
          );

        results.push({
          id: draft.id ?? slugify(draft.name),
          name: draft.name,
          archetype: draft.archetype,
          color,
          discipline: draft.discipline,
          description,
          prompt: draft.prompt,
          tags,
          keywords: draft.keywords,
          remote: {
            sparkId: spark.id,
            fingerprint,
            lastSyncedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.warn(`[icp] Spark creation failed for ${draft.name}:`, (error as Error).message);
      }
    }

    if (results.length === 0) {
      response.status(500).json({ message: 'Failed to create any Sparks.' });
      return;
    }

    response.json({
      personas: results,
      postsScraped: posts.length,
      redditPosts: posts.filter((post) => post.source === 'reddit').length,
      twitterPosts: posts.filter((post) => post.source === 'twitter').length,
    });
  } catch (error) {
    handleRouteError(error, response);
  }
});

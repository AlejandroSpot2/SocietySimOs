import { getServerConfig } from './config';

export class MindsApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'MindsApiError';
    this.status = status;
    this.body = body;
  }
}

export interface SparkPayload {
  name: string;
  description: string;
  discipline: string;
  tags: string[];
  prompt: string;
}

export interface AnalystPayload {
  name: string;
  description: string;
  discipline: string;
  prompt: string;
  tags: string[];
}

export interface RemoteSparkResponse {
  id: string;
  name: string;
  description?: string;
  discipline?: string;
  tags?: string[];
  systemPrompt?: string;
}

export interface MindsClientLike {
  createManualSpark(payload: SparkPayload | AnalystPayload): Promise<RemoteSparkResponse>;
  createAnalystSpark(payload: AnalystPayload): Promise<RemoteSparkResponse>;
  updateSpark(
    sparkId: string,
    payload: SparkPayload | AnalystPayload,
    type: 'user' | 'expert',
  ): Promise<RemoteSparkResponse>;
  createGroup(name: string, sparkIds: string[]): Promise<{ id: string }>;
  listSparks(search?: string): Promise<RemoteSparkResponse[]>;
  completeSpark<T>(sparkId: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
}

interface RemoteResourceResponse {
  data?: {
    id?: string;
  };
  id?: string;
}

function tryParseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class MindsClient {
  private readonly apiKey: string;
  private readonly apiBaseUrls: string[];

  constructor() {
    const config = getServerConfig();
    this.apiKey = config.apiKey;
    const configuredBaseUrl = config.apiBaseUrl.replace(/\/+$/, '');
    const fallbackBaseUrl = 'https://getminds.ai/api/v1';
    this.apiBaseUrls = Array.from(new Set([configuredBaseUrl, fallbackBaseUrl]));
  }

  private ensureConfigured() {
    if (!this.apiKey) {
      throw new MindsApiError('MINDS_API_KEY is not configured on the server.', 503, null);
    }
  }

  private shouldRetryWithFallback(status: number, body: unknown): boolean {
    if (status !== 404 || typeof body !== 'object' || !body) {
      return false;
    }

    const message =
      ('message' in body && typeof body.message === 'string' && body.message) ||
      ('statusMessage' in body && typeof body.statusMessage === 'string' && body.statusMessage) ||
      '';

    return message.includes('Only /v1/, /mcp, and /.well-known/ routes are available on the API subdomain');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    this.ensureConfigured();

    for (let index = 0; index < this.apiBaseUrls.length; index += 1) {
      const apiBaseUrl = this.apiBaseUrls[index];
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers ?? {}),
        },
      });

      const text = await response.text();
      const body = tryParseJson(text);

      if (response.ok) {
        return body as T;
      }

      if (index < this.apiBaseUrls.length - 1 && this.shouldRetryWithFallback(response.status, body)) {
        continue;
      }

      const message =
        typeof body === 'object' && body && 'message' in body
          ? String((body as { message: unknown }).message)
          : typeof body === 'object' && body && 'statusMessage' in body
            ? String((body as { statusMessage: unknown }).statusMessage)
            : typeof body === 'string' && body
              ? body
              : `Minds API request failed with status ${response.status}`;

      throw new MindsApiError(message, response.status, body);
    }

    throw new MindsApiError('Minds API request failed before a response could be parsed.', 500, null);
  }

  async createManualSpark(payload: SparkPayload | AnalystPayload): Promise<RemoteSparkResponse> {
    const created = await this.request<{ data: RemoteSparkResponse }>('/sparks', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        mode: 'manual',
        type: 'user',
        discipline: payload.discipline,
        tags: payload.tags,
      }),
    });

    return created.data;
  }

  async createAnalystSpark(payload: AnalystPayload): Promise<RemoteSparkResponse> {
    const created = await this.request<{ data: RemoteSparkResponse }>('/sparks', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        mode: 'manual',
        type: 'expert',
        discipline: payload.discipline,
        tags: payload.tags,
      }),
    });

    return created.data;
  }

  async updateSpark(sparkId: string, payload: SparkPayload | AnalystPayload, type: 'user' | 'expert') {
    const updated = await this.request<{ data: RemoteSparkResponse }>(`/sparks/${sparkId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        type,
        discipline: payload.discipline,
        systemPrompt: payload.prompt,
        tags: payload.tags,
        isPublic: false,
      }),
    });

    return updated.data;
  }

  async createGroup(name: string, sparkIds: string[]): Promise<{ id: string }> {
    const formData = new URLSearchParams();
    formData.append('name', name);
    sparkIds.forEach((sparkId) => formData.append('sparkIds', sparkId));

    const created = await this.request<RemoteResourceResponse>('/groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const groupId = created.data?.id ?? created.id;
    if (!groupId) {
      throw new MindsApiError('Group creation succeeded without returning an id.', 502, created);
    }

    return { id: groupId };
  }

  async listSparks(search?: string): Promise<RemoteSparkResponse[]> {
    const query = new URLSearchParams();
    if (search?.trim()) {
      query.set('search', search.trim());
    }
    query.set('limit', '100');
    query.set('offset', '0');

    const result = await this.request<{ data: RemoteSparkResponse[] }>(
      `/sparks?${query.toString()}`,
    );

    return Array.isArray(result.data) ? result.data : [];
  }

  async completeSpark<T>(
    sparkId: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.request<T>(`/sparks/${sparkId}/completion`, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
  }

  async createKeywordsSpark(payload: {
    name: string;
    description: string;
    discipline: string;
    keywords: string[];
    tags: string[];
  }): Promise<RemoteSparkResponse> {
    const created = await this.request<{ data: RemoteSparkResponse }>('/sparks', {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description,
        mode: 'keywords',
        type: 'user',
        discipline: payload.discipline,
        keywords: payload.keywords,
        tags: payload.tags,
      }),
    });
    return created.data;
  }

  async uploadKnowledge(
    sparkId: string,
    content: Buffer,
    filename: string,
    description: string,
  ): Promise<void> {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', content, { filename, contentType: 'text/plain' });
    form.append('description', description);

    const config = getServerConfig();
    const urls = [config.apiBaseUrl, 'https://getminds.ai/api/v1'];

    for (let i = 0; i < urls.length; i++) {
      const res = await fetch(`${urls[i]}/sparks/${sparkId}/knowledge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          ...form.getHeaders(),
        },
        body: form.getBuffer(),
      });
      if (res.ok) return;
      const body = await res.json().catch(() => ({}));
      if (i < urls.length - 1 && this.shouldRetryWithFallback(res.status, body)) continue;
      throw new MindsApiError(`Knowledge upload failed: ${res.status}`, res.status, body);
    }
  }
}

export interface ServerConfig {
  apiKey: string;
  apiBaseUrl: string;
  maxPanelMinds: number;
  port: number;
  configured: boolean;
}

const DEFAULT_API_BASE_URL = 'https://getminds.ai/api/v1';
const DEFAULT_PORT = 3000;
const DEFAULT_MAX_PANEL_MINDS = 5;

function parseNumber(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getServerConfig(): ServerConfig {
  const apiKey = process.env.MINDS_API_KEY?.trim() ?? '';
  return {
    apiKey,
    apiBaseUrl: process.env.MINDS_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
    maxPanelMinds: parseNumber(process.env.MINDS_MAX_PANEL_MINDS, DEFAULT_MAX_PANEL_MINDS),
    port: parseNumber(process.env.PORT, DEFAULT_PORT),
    configured: Boolean(apiKey),
  };
}

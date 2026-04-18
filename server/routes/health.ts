import { Router } from 'express';
import { getServerConfig } from '../config';

export const healthRouter = Router();

healthRouter.get('/', (_request, response) => {
  const config = getServerConfig();
  response.json({
    ok: true,
    configured: config.configured,
    provider: 'MindsAI',
    apiBaseUrl: config.apiBaseUrl,
    maxPanelMinds: config.maxPanelMinds,
    message: config.configured ? 'MindsAI server-side integration is ready.' : 'MINDS_API_KEY is missing.',
  });
});

import { Router } from 'express';
import type { Response } from 'express';
import type { Group, PersonaState, RemoteSparkRef } from '../../src/types';
import { getServerConfig } from '../config';
import { MindsApiError, MindsClient } from '../minds-client';
import { buildPersonaDescription, deriveDiscipline, deriveTags, hashFingerprint } from '../utils';

interface SparkSyncRequest {
  personas: Array<Pick<PersonaState, 'id' | 'name' | 'prompt' | 'remote'>>;
}

interface GroupSyncRequest {
  groups: Group[];
  personaRefs: Array<{ id: string; sparkId: string }>;
}

function handleRouteError(error: unknown, response: Response) {
  if (error instanceof MindsApiError) {
    response.status(error.status).json({
      message: error.message,
      details: error.body,
    });
    return;
  }

  response.status(500).json({
    message: error instanceof Error ? error.message : 'Unexpected server error.',
  });
}

function buildRemoteRef(sparkId: string, fingerprint: string): RemoteSparkRef {
  return {
    sparkId,
    fingerprint,
    lastSyncedAt: new Date().toISOString(),
  };
}

export const mindsRouter = Router();

mindsRouter.post('/sparks/sync', async (request, response) => {
  const config = getServerConfig();
  if (!config.configured) {
    response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
    return;
  }

  const body = request.body as SparkSyncRequest;
  if (!body?.personas || !Array.isArray(body.personas)) {
    response.status(400).json({ message: 'Request body must include a personas array.' });
    return;
  }

  const client = new MindsClient();

  try {
    const synced = [];

    for (const persona of body.personas) {
      const discipline = deriveDiscipline(persona.name);
      const tags = deriveTags(persona.name);
      const description = buildPersonaDescription(persona.name, discipline);
      const fingerprint = hashFingerprint([persona.name, discipline, persona.prompt, tags.join(',')]);

      if (persona.remote?.sparkId && persona.remote.fingerprint === fingerprint) {
        synced.push({
          id: persona.id,
          remote: persona.remote,
          discipline,
          description,
          tags,
        });
        continue;
      }

      let sparkId = persona.remote?.sparkId;
      if (!sparkId) {
        const created = await client.createManualSpark({
          name: persona.name,
          description,
          discipline,
          tags,
          prompt: persona.prompt,
        });
        sparkId = created.id;
      }

      await client.updateSpark(
        sparkId,
        {
          name: persona.name,
          description,
          discipline,
          tags,
          prompt: persona.prompt,
        },
        'user',
      );

      synced.push({
        id: persona.id,
        remote: buildRemoteRef(sparkId, fingerprint),
        discipline,
        description,
        tags,
      });
    }

    response.json({ personas: synced });
  } catch (error) {
    handleRouteError(error, response);
  }
});

mindsRouter.post('/panels/sync', async (request, response) => {
  const config = getServerConfig();
  if (!config.configured) {
    response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
    return;
  }

  const body = request.body as GroupSyncRequest;
  if (!body?.groups || !Array.isArray(body.groups)) {
    response.status(400).json({ message: 'Request body must include a groups array.' });
    return;
  }

  const sparkMap = new Map(body.personaRefs?.map((entry) => [entry.id, entry.sparkId]) ?? []);
  const client = new MindsClient();

  try {
    const synced = [];

    for (const group of body.groups) {
      if (group.personaIds.length === 0) {
        continue;
      }

      if (group.personaIds.length > config.maxPanelMinds) {
        response.status(400).json({
          message: `Group ${group.name} exceeds the ${config.maxPanelMinds}-mind limit.`,
        });
        return;
      }

      const sparkIds = group.personaIds.map((personaId) => sparkMap.get(personaId)).filter(Boolean) as string[];
      if (sparkIds.length !== group.personaIds.length) {
        response.status(400).json({
          message: `Group ${group.name} cannot be synced because one or more persona sparks are missing.`,
        });
        return;
      }

      const fingerprint = hashFingerprint([
        'remote-group',
        group.name,
        group.personaIds.join(','),
        sparkIds.join(','),
      ]);
      if (group.remotePanelId && group.remoteFingerprint === fingerprint) {
        synced.push({
          id: group.id,
          remotePanelId: group.remotePanelId,
          remoteFingerprint: group.remoteFingerprint,
          lastSyncedAt: group.lastSyncedAt ?? new Date().toISOString(),
        });
        continue;
      }

      const created = await client.createGroup(group.name, sparkIds);
      synced.push({
        id: group.id,
        remotePanelId: created.id,
        remoteFingerprint: fingerprint,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    response.json({ groups: synced });
  } catch (error) {
    handleRouteError(error, response);
  }
});

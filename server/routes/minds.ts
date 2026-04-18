import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { Response } from 'express';
import type { Group, PersonaState, RemoteSparkRef } from '../../src/types';
import { getServerConfig, type ServerConfig } from '../config';
import { MindsApiError, MindsClient, type MindsClientLike } from '../minds-client';
import {
  buildPersonaDescription,
  deriveDiscipline,
  deriveTags,
  hashFingerprint,
} from '../utils';
import { buildRemoteGroupFingerprint } from '../simulation-core';

interface SparkSyncRequest {
  personas: Array<
    Pick<PersonaState, 'id' | 'name' | 'prompt' | 'remote' | 'discipline' | 'description' | 'tags'>
  >;
}

interface GroupSyncRequest {
  groups: Group[];
  personaRefs: Array<{ id: string; sparkId: string }>;
}

interface MindsRouterOptions {
  clientFactory?: () => MindsClientLike;
  getConfig?: () => ServerConfig;
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

function createGroupSyncHandler(
  clientFactory: () => MindsClientLike,
  getConfigValue: () => ServerConfig,
): RequestHandler {
  return async (request, response: Response) => {
    const config = getConfigValue();
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
    const client = clientFactory();

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

        const sparkIds = group.personaIds
          .map((personaId) => sparkMap.get(personaId))
          .filter(Boolean) as string[];
        if (sparkIds.length !== group.personaIds.length) {
          response.status(400).json({
            message: `Group ${group.name} cannot be synced because one or more persona sparks are missing.`,
          });
          return;
        }

        const fingerprint = buildRemoteGroupFingerprint(group, sparkIds);
        if (group.remoteGroupId && group.remoteGroupFingerprint === fingerprint) {
          synced.push({
            id: group.id,
            remoteGroupId: group.remoteGroupId,
            remoteGroupFingerprint: group.remoteGroupFingerprint,
            lastSyncedAt: group.lastSyncedAt ?? new Date().toISOString(),
          });
          continue;
        }

        const created = await client.createGroup(group.name, sparkIds);
        synced.push({
          id: group.id,
          remoteGroupId: created.id,
          remoteGroupFingerprint: fingerprint,
          lastSyncedAt: new Date().toISOString(),
        });
      }

      response.json({ groups: synced });
    } catch (error) {
      handleRouteError(error, response);
    }
  };
}

export function createMindsRouter(options: MindsRouterOptions = {}) {
  const clientFactory = options.clientFactory ?? (() => new MindsClient());
  const getConfigValue = options.getConfig ?? getServerConfig;
  const router = Router();

  router.post('/sparks/sync', async (request, response) => {
    const config = getConfigValue();
    if (!config.configured) {
      response.status(503).json({ message: 'MINDS_API_KEY is not configured on the server.' });
      return;
    }

    const body = request.body as SparkSyncRequest;
    if (!body?.personas || !Array.isArray(body.personas)) {
      response.status(400).json({ message: 'Request body must include a personas array.' });
      return;
    }

    const client = clientFactory();

    try {
      const synced = [];

      for (const persona of body.personas) {
        const discipline = persona.discipline?.trim() || deriveDiscipline(persona.name);
        const tags =
          Array.isArray(persona.tags) && persona.tags.length > 0
            ? Array.from(new Set(persona.tags.map((tag) => String(tag).trim()).filter(Boolean))).slice(0, 8)
            : deriveTags(persona.name);
        const description = persona.description?.trim() || buildPersonaDescription(persona.name, discipline);
        const fingerprint = hashFingerprint([
          persona.name,
          discipline,
          description,
          persona.prompt,
          tags.join(','),
        ]);

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

  const groupSyncHandler = createGroupSyncHandler(clientFactory, getConfigValue);
  router.post('/groups/sync', groupSyncHandler);
  router.post('/panels/sync', groupSyncHandler);

  return router;
}

export const mindsRouter = createMindsRouter();

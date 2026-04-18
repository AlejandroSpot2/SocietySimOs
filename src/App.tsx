import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedBackground } from './components/ui/AnimatedBackground';
import { Logo } from './components/ui/Logo';
import { KpiCard } from './components/ui/KpiCard';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Box,
  Coffee,
  Cpu,
  DollarSign,
  Gem,
  LayoutGrid,
  Leaf,
  Microscope,
  Play,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { apiRequest, type ApiError } from './lib/api';
import {
  STORAGE_VERSION,
  loadAppState,
  saveAppState,
  type StoredAppState,
} from './lib/storage';
import type {
  Group,
  HealthResponse,
  Message,
  Metric,
  PanelStreamEvent,
  PersonaState,
  Product,
  RemoteSparkRef,
} from './types';

type Tab = 'simulation' | 'products' | 'personas' | 'groups' | 'visualization' | 'settings';
type PersonaVisuals = {
  color: string;
  icon: typeof Activity;
};

const PERSONA_VISUALS: Record<string, PersonaVisuals> = {
  chad: { color: 'text-cyan-400', icon: Activity },
  susan: { color: 'text-pink-400', icon: ShieldAlert },
  arthur: { color: 'text-yellow-400', icon: Coffee },
  leo: { color: 'text-purple-400', icon: Cpu },
  fern: { color: 'text-emerald-400', icon: Leaf },
  blake: { color: 'text-blue-400', icon: Zap },
  penny: { color: 'text-orange-400', icon: DollarSign },
  victoria: { color: 'text-rose-400', icon: Gem },
  dr_chen: { color: 'text-indigo-400', icon: Microscope },
  luna: { color: 'text-fuchsia-400', icon: Sparkles },
};

const DEFAULT_PERSONAS: PersonaState[] = [
  {
    id: 'chad',
    name: 'Chad (Biohacker)',
    prompt:
      'You are Chad, a health-focused biohacker and looksmaxxer. You optimize everything in your life. You use slang like "gains", "protocol", "optimization". You are obsessed with scalp health and testosterone.',
  },
  {
    id: 'susan',
    name: 'Susan (Mom of 2)',
    prompt:
      'You are Susan, a mother of 2. You are highly concerned about safety, chemicals, and the health of your children. You are skeptical of weird ingredients and always ask about FDA approval or natural alternatives.',
  },
  {
    id: 'arthur',
    name: 'Arthur (Traditionalist)',
    prompt:
      'You are Arthur, an elderly man who thinks things should stay the way they used to be. You dislike modern fads, weird new products, and miss the days when shampoo was just soap. You are grumpy but well-meaning.',
  },
  {
    id: 'leo',
    name: 'Leo (Uni Student)',
    prompt:
      'You are Leo, a university student who loves trying out bizarre, trendy new products. You are always broke but will spend money on viral TikTok items. You speak in Gen Z slang.',
  },
  {
    id: 'fern',
    name: 'Fern (Environmentalist)',
    prompt:
      'You are Fern, a cynical environmentalist. You constantly question the sustainability, ethical sourcing, and greenwashing of products. You worry about the impact on animals and the planet.',
  },
  {
    id: 'blake',
    name: 'Blake (Tech Bro)',
    prompt:
      'You are Blake, a Silicon Valley tech bro. You view everything through the lens of disruption, AI, and crypto. You use corporate buzzwords like "synergy", "10x", and "paradigm shift".',
  },
  {
    id: 'penny',
    name: 'Penny (Bargain Hunter)',
    prompt:
      'You are Penny, an extreme couponer and bargain hunter. You only care about the price, value per ounce, and whether there is a discount code. You refuse to pay premium prices for basic goods.',
  },
  {
    id: 'victoria',
    name: 'Victoria (Luxury Snob)',
    prompt:
      'You are Victoria, a wealthy socialite who only buys premium, aesthetic, status-symbol products. If it is not expensive and beautifully packaged, you think it is trash. You are very condescending.',
  },
  {
    id: 'dr_chen',
    name: 'Dr. Chen (Skeptic)',
    prompt:
      'You are Dr. Chen, a rigorous scientist. You demand peer-reviewed studies, clinical trials, and hate pseudoscience or marketing fluff. You analyze ingredient lists critically.',
  },
  {
    id: 'luna',
    name: 'Luna (Holistic Healer)',
    prompt:
      'You are Luna, a holistic healer who believes in crystals, energy, and ancient remedies. You talk about vibes, auras, and aligning chakras. You love anything raw and unprocessed.',
  },
];

const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'GuanoGlow Scalp Therapy',
    category: 'Haircare / Wellness',
    description:
      'A revolutionary shampoo based on organic agave nectar and authentic, sustainably-sourced bat guano. Discovered by researchers to have incredible scalp health benefits, balancing the microbiome and promoting rapid hair growth.',
  },
];

const DEFAULT_GROUPS = (personas: PersonaState[]): Group[] => [
  {
    id: 'g1',
    name: 'Core Panel',
    personaIds: personas.slice(0, 5).map((persona) => persona.id),
  },
];

const DEFAULT_STORAGE_STATE = (): StoredAppState => ({
  version: STORAGE_VERSION,
  products: DEFAULT_PRODUCTS,
  personas: DEFAULT_PERSONAS,
  groups: DEFAULT_GROUPS(DEFAULT_PERSONAS),
  selectedProductId: DEFAULT_PRODUCTS[0].id,
  selectedGroupId: 'g1',
  selectedVisPersona: null,
  analystSpark: null,
});

const VISUAL_COLORS: Record<string, string> = {
  cyan: '#5cc8d6',
  pink: '#d67ba0',
  yellow: '#d6c25c',
  emerald: '#5cd69b',
  purple: '#a78cd6',
  blue: '#6ba0d6',
  orange: '#d69b5c',
  rose: '#d67b8c',
  indigo: '#8c94d6',
  fuchsia: '#c67bd6',
};

const HEALTH_POLL_INTERVAL_MS = 30_000;

function createMessage(partial: Omit<Message, 'id' | 'createdAt'>): Message {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

function formatError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeApiError = error as Partial<ApiError>;
    if (maybeApiError.message) {
      return maybeApiError.message;
    }
  }

  return 'Unknown error';
}

function getPersonaVisuals(id: string): PersonaVisuals {
  return PERSONA_VISUALS[id] ?? { color: 'text-gray-400', icon: Users };
}

function toVisualColor(tailwindColor: string): string {
  const key = Object.keys(VISUAL_COLORS).find((colorKey) => tailwindColor.includes(colorKey));
  return key ? VISUAL_COLORS[key] : '#ffffff';
}

function upsertMessages(
  current: Message[],
  nextItems: Message[] | Message,
  limit = 400,
): Message[] {
  const items = Array.isArray(nextItems) ? nextItems : [nextItems];
  return [...current, ...items].slice(-limit);
}

function stringifyRaw(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readStreamEvents(
  response: Response,
  onEvent: (event: PanelStreamEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('Simulation stream was empty.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let dataLines: string[] = [];

  const flushEvent = () => {
    if (dataLines.length === 0) {
      currentEvent = 'message';
      return;
    }

    const rawData = dataLines.join('\n');
    if (rawData === '[DONE]') {
      onEvent({ type: 'complete', raw: rawData });
      currentEvent = 'message';
      dataLines = [];
      return;
    }

    try {
      onEvent(JSON.parse(rawData) as PanelStreamEvent);
    } catch {
      onEvent({
        type: currentEvent === 'error' ? 'error' : 'system',
        text: rawData,
        raw: rawData,
      });
    }

    currentEvent = 'message';
    dataLines = [];
  };

  const pump = async (): Promise<void> => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split(/\r?\n\r?\n/);
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const lines = chunk.split(/\r?\n/);
        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        flushEvent();
      }
    }

    if (buffer.trim()) {
      const lines = buffer.split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }
      flushEvent();
    }
  };

  return pump();
}

export default function App() {
  const initialState = useMemo(() => loadAppState(DEFAULT_STORAGE_STATE()), []);

  const [activeTab, setActiveTab] = useState<Tab>('simulation');
  const [products, setProducts] = useState<Product[]>(initialState.products);
  const [personas, setPersonas] = useState<PersonaState[]>(initialState.personas);
  const [groups, setGroups] = useState<Group[]>(
    initialState.groups.length > 0 ? initialState.groups : DEFAULT_GROUPS(initialState.personas),
  );
  const [selectedProductId, setSelectedProductId] = useState(initialState.selectedProductId);
  const [selectedGroupId, setSelectedGroupId] = useState(
    initialState.selectedGroupId || initialState.groups[0]?.id || 'g1',
  );
  const [selectedVisPersona, setSelectedVisPersona] = useState<string | null>(
    initialState.selectedVisPersona,
  );
  const [analystSpark, setAnalystSpark] = useState<RemoteSparkRef | null>(initialState.analystSpark);
  const [visMode, setVisMode] = useState<'analytical' | 'cinematic'>('analytical');
  const [cameraView, setCameraView] = useState<'iso' | 'top' | 'front' | 'side'>('iso');
  const [messages, setMessages] = useState<Message[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedGroupEditorId, setSelectedGroupEditorId] = useState(
    initialState.selectedGroupId || initialState.groups[0]?.id || 'g1',
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSyncingPersonas, setIsSyncingPersonas] = useState(false);
  const [isSyncingGroups, setIsSyncingGroups] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const maxPanelMinds = health?.maxPanelMinds ?? 5;
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? products[0];
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const selectedGroupEditor = groups.find((group) => group.id === selectedGroupEditorId) ?? groups[0];

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages, metrics]);

  useEffect(() => {
    const state: StoredAppState = {
      version: STORAGE_VERSION,
      products,
      personas,
      groups,
      selectedProductId,
      selectedGroupId,
      selectedVisPersona,
      analystSpark,
    };

    saveAppState(state);
  }, [products, personas, groups, selectedProductId, selectedGroupId, selectedVisPersona, analystSpark]);

  useEffect(() => {
    let isMounted = true;

    const fetchHealth = async () => {
      try {
        const nextHealth = await apiRequest<HealthResponse>('/api/health');
        if (isMounted) {
          setHealth(nextHealth);
        }
      } catch (error) {
        if (isMounted) {
          setHealth({
            ok: false,
            configured: false,
            apiBaseUrl: 'https://getminds.ai/api/v1',
            maxPanelMinds: 5,
            provider: 'MindsAI',
            message: formatError(error),
          });
        }
      }
    };

    fetchHealth().catch(() => undefined);
    const timer = window.setInterval(fetchHealth, HEALTH_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const personaSyncSignature = useMemo(
    () =>
      JSON.stringify(
        personas.map((persona) => ({
          id: persona.id,
          name: persona.name,
          prompt: persona.prompt,
        })),
      ),
    [personas],
  );

  const groupSyncSignature = useMemo(
    () =>
      JSON.stringify(
        groups.map((group) => ({
          id: group.id,
          name: group.name,
          personaIds: group.personaIds,
          sparkIds: group.personaIds.map(
            (personaId) => personas.find((persona) => persona.id === personaId)?.remote?.sparkId ?? null,
          ),
        })),
      ),
    [groups, personas],
  );

  const syncPersonas = async (sourcePersonas: PersonaState[], silent = false) => {
    if (!health?.configured) {
      return sourcePersonas;
    }

    if (!silent) {
      setIsSyncingPersonas(true);
    }

    const payload = {
      personas: sourcePersonas.map((persona) => ({
        id: persona.id,
        name: persona.name,
        prompt: persona.prompt,
        remote: persona.remote,
      })),
    };

    try {
      const result = await apiRequest<{
        personas: Array<{
          id: string;
          remote: RemoteSparkRef;
          discipline: string;
          description: string;
          tags: string[];
        }>;
      }>('/api/minds/sparks/sync', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const updates = new Map(result.personas.map((persona) => [persona.id, persona]));
      const nextPersonas = sourcePersonas.map((persona) => {
        const remotePersona = updates.get(persona.id);
        if (!remotePersona) {
          return persona;
        }

        return {
          ...persona,
          remote: remotePersona.remote,
          discipline: remotePersona.discipline,
          description: remotePersona.description,
          tags: remotePersona.tags,
        };
      });

      setPersonas(nextPersonas);
      return nextPersonas;
    } finally {
      if (!silent) {
        setIsSyncingPersonas(false);
      }
    }
  };

  const syncGroups = async (sourceGroups: Group[], sourcePersonas: PersonaState[], silent = false) => {
    if (!health?.configured) {
      return sourceGroups;
    }

    const personaRefs = sourcePersonas
      .filter((persona) => persona.remote?.sparkId)
      .map((persona) => ({
        id: persona.id,
        sparkId: persona.remote!.sparkId,
      }));

    const syncableGroups = sourceGroups.filter((group) => {
      if (group.personaIds.length === 0 || group.personaIds.length > maxPanelMinds) {
        return false;
      }

      return group.personaIds.every((personaId) =>
        sourcePersonas.find((persona) => persona.id === personaId)?.remote?.sparkId,
      );
    });

    if (syncableGroups.length === 0) {
      return sourceGroups;
    }

    if (!silent) {
      setIsSyncingGroups(true);
    }

    try {
      const result = await apiRequest<{
        groups: Array<Pick<Group, 'id' | 'remotePanelId' | 'remoteFingerprint' | 'lastSyncedAt'>>;
      }>('/api/minds/panels/sync', {
        method: 'POST',
        body: JSON.stringify({
          groups: syncableGroups,
          personaRefs,
        }),
      });

      const updates = new Map(result.groups.map((group) => [group.id, group]));
      const nextGroups = sourceGroups.map((group) => {
        const remoteGroup = updates.get(group.id);
        if (!remoteGroup) {
          return group;
        }

        return {
          ...group,
          remotePanelId: remoteGroup.remotePanelId,
          remoteFingerprint: remoteGroup.remoteFingerprint,
          lastSyncedAt: remoteGroup.lastSyncedAt,
        };
      });

      setGroups(nextGroups);
      return nextGroups;
    } finally {
      if (!silent) {
        setIsSyncingGroups(false);
      }
    }
  };

  useEffect(() => {
    if (!health?.configured) {
      return;
    }

    const timer = window.setTimeout(() => {
      syncPersonas(personas, true).catch((error) => {
        setMessages((current) =>
          upsertMessages(
            current,
            createMessage({
              senderId: 'system',
              senderName: 'SYSTEM_SYNC',
              text: `Spark sync failed: ${formatError(error)}`,
              isSystem: true,
            }),
          ),
        );
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [personaSyncSignature, health?.configured]);

  useEffect(() => {
    if (!health?.configured) {
      return;
    }

    const timer = window.setTimeout(() => {
      syncGroups(groups, personas, true).catch((error) => {
        setMessages((current) =>
          upsertMessages(
            current,
            createMessage({
              senderId: 'system',
              senderName: 'SYSTEM_SYNC',
              text: `Group sync failed: ${formatError(error)}`,
              isSystem: true,
            }),
          ),
        );
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [groupSyncSignature, health?.configured, maxPanelMinds]);

  const pushSystemMessage = (text: string) => {
    setMessages((current) =>
      upsertMessages(
        current,
        createMessage({
          senderId: 'system',
          senderName: 'SYSTEM',
          text,
          isSystem: true,
        }),
      ),
    );
  };

  const updatePersona = (personaId: string, updates: Partial<PersonaState>) => {
    setPersonas((current) =>
      current.map((persona) => (persona.id === personaId ? { ...persona, ...updates } : persona)),
    );
  };

  const updateProduct = (productId: string, updates: Partial<Product>) => {
    setProducts((current) =>
      current.map((product) => (product.id === productId ? { ...product, ...updates } : product)),
    );
  };

  const deleteProduct = (productId: string) => {
    setProducts((current) => {
      const filtered = current.filter((product) => product.id !== productId);
      return filtered.length === 0 ? DEFAULT_PRODUCTS : filtered;
    });

    if (selectedProductId === productId) {
      const fallbackId = products.find((product) => product.id !== productId)?.id ?? DEFAULT_PRODUCTS[0].id;
      setSelectedProductId(fallbackId);
    }
  };

  const updateGroup = (groupId: string, updates: Partial<Group>) => {
    setGroups((current) => current.map((group) => (group.id === groupId ? { ...group, ...updates } : group)));
  };

  const addGroup = () => {
    const nextId = `g${Date.now()}`;
    const nextGroup: Group = {
      id: nextId,
      name: 'New Group',
      personaIds: [],
    };

    setGroups((current) => [...current, nextGroup]);
    setSelectedGroupId(nextId);
    setSelectedGroupEditorId(nextId);
    setActiveTab('groups');
  };

  const deleteGroup = (groupId: string) => {
    setGroups((current) => {
      const filtered = current.filter((group) => group.id !== groupId);
      if (filtered.length === 0) {
        return DEFAULT_GROUPS(personas);
      }
      return filtered;
    });

    if (selectedGroupId === groupId) {
      const fallbackId = groups.find((group) => group.id !== groupId)?.id ?? 'g1';
      setSelectedGroupId(fallbackId);
    }

    if (selectedGroupEditorId === groupId) {
      const fallbackId = groups.find((group) => group.id !== groupId)?.id ?? 'g1';
      setSelectedGroupEditorId(fallbackId);
    }
  };

  const toggleGroupMember = (groupId: string, personaId: string) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const alreadySelected = group.personaIds.includes(personaId);
    if (!alreadySelected && group.personaIds.length >= maxPanelMinds) {
      pushSystemMessage(`Groups support a maximum of ${maxPanelMinds} minds.`);
      return;
    }

    const nextPersonaIds = alreadySelected
      ? group.personaIds.filter((id) => id !== personaId)
      : [...group.personaIds, personaId];

    updateGroup(groupId, { personaIds: nextPersonaIds });
  };

  const moveGroupMember = (groupId: string, personaId: string, direction: -1 | 1) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }

    const index = group.personaIds.indexOf(personaId);
    if (index === -1) {
      return;
    }

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= group.personaIds.length) {
      return;
    }

    const nextPersonaIds = [...group.personaIds];
    [nextPersonaIds[index], nextPersonaIds[nextIndex]] = [nextPersonaIds[nextIndex], nextPersonaIds[index]];
    updateGroup(groupId, { personaIds: nextPersonaIds });
  };

  const stopSimulation = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSimulating(false);
    pushSystemMessage('Simulation halted by user.');
  };

  const startSimulation = async () => {
    if (!health?.configured) {
      pushSystemMessage('MINDS_API_KEY is missing. Configure the server before running simulations.');
      setActiveTab('settings');
      return;
    }

    if (!selectedProduct || !selectedGroup) {
      pushSystemMessage('Select a product and group before running the simulation.');
      return;
    }

    if (selectedGroup.personaIds.length === 0) {
      pushSystemMessage('Selected group has no minds. Add at least one persona to continue.');
      setActiveTab('groups');
      return;
    }

    if (selectedGroup.personaIds.length > maxPanelMinds) {
      pushSystemMessage(`Selected group exceeds the ${maxPanelMinds}-mind limit.`);
      setActiveTab('groups');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsSimulating(true);
    setMetrics([]);
    setMessages([
      createMessage({
        senderId: 'system',
        senderName: 'SYSTEM',
        text: `INITIALIZING GROUP RUN\nPRODUCT: ${selectedProduct.name}\nCATEGORY: ${selectedProduct.category}\nGROUP: ${selectedGroup.name}`,
        isSystem: true,
      }),
    ]);
    setActiveTab('simulation');

    try {
      const syncedPersonas = await syncPersonas(personas);
      const syncedGroups = await syncGroups(groups, syncedPersonas);
      const activeGroup = syncedGroups.find((group) => group.id === selectedGroup.id);
      if (!activeGroup) {
        throw new Error('Selected group could not be resolved after sync.');
      }

      const activePersonas = activeGroup.personaIds
        .map((personaId) => syncedPersonas.find((persona) => persona.id === personaId))
        .filter(Boolean) as PersonaState[];
      const transcriptLines: string[] = [];

      const response = await fetch('/api/simulations/panel-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          group: activeGroup,
          product: selectedProduct,
          personas: activePersonas.map((persona) => ({
            id: persona.id,
            name: persona.name,
            remote: persona.remote,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Simulation run failed with status ${response.status}`);
      }

      await readStreamEvents(response, (event) => {
        if (event.type === 'mind_message') {
          const senderName =
            event.mindName ||
            activePersonas.find((persona) => persona.id === event.mindId)?.name ||
            'Mind';
          const senderId = event.mindId || senderName.toLowerCase().replace(/\s+/g, '_');
          const text = event.text || '';
          transcriptLines.push(`${senderName}: ${text}`);
          setMessages((current) =>
            upsertMessages(
              current,
              createMessage({
                senderId,
                senderName,
                text,
              }),
            ),
          );
          return;
        }

        if (event.type === 'error') {
          setMessages((current) =>
            upsertMessages(
              current,
              createMessage({
                senderId: 'system',
                senderName: 'RUN_ERROR',
                text: event.text || stringifyRaw(event.raw),
                isSystem: true,
              }),
            ),
          );
          return;
        }

        if (event.type === 'system' && event.text) {
          setMessages((current) =>
            upsertMessages(
              current,
              createMessage({
                senderId: 'system',
                senderName: 'RUN_EVENT',
                text: event.text,
                isSystem: true,
              }),
            ),
          );
        }
      });

      const analysis = await apiRequest<{
        analyst: RemoteSparkRef;
        summary: string;
        metrics: Metric[];
      }>('/api/simulations/analyze', {
        method: 'POST',
        body: JSON.stringify({
          product: selectedProduct,
          personas: activePersonas.map((persona) => ({ id: persona.id, name: persona.name })),
          transcript: transcriptLines.join('\n'),
          analystSpark,
        }),
        signal: controller.signal,
      });

      setAnalystSpark(analysis.analyst);
      setMetrics(analysis.metrics);
      setMessages((current) =>
        upsertMessages(
          current,
          createMessage({
            senderId: 'system',
            senderName: 'SYSTEM_CONCLUSION',
            text: `${analysis.summary}\n\n[ANALYSIS COMPLETE] -> Proceed to Visualization`,
            isSystem: true,
          }),
        ),
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      setMessages((current) =>
        upsertMessages(
          current,
          createMessage({
            senderId: 'system',
            senderName: 'SYSTEM_ERROR',
            text: `Simulation failed: ${formatError(error)}`,
            isSystem: true,
          }),
        ),
      );
    } finally {
      abortRef.current = null;
      setIsSimulating(false);
    }
  };

  const renderSimulationTab = () => {
    const groupMembers = selectedGroup
      ? selectedGroup.personaIds
          .map((personaId) => personas.find((persona) => persona.id === personaId))
          .filter(Boolean) as PersonaState[]
      : [];

    return (
      <>
        <div className="w-72 border-r border-[#1e1e1e] flex flex-col bg-[#111111]">
          <div className="p-4 border-b border-[#1e1e1e] flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#f5f500] uppercase tracking-wider">Active Product</label>
              <select
                className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#f5f500] rounded-none text-sm"
                value={selectedProductId}
                onChange={(event) => setSelectedProductId(event.target.value)}
                disabled={isSimulating}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#f5f500] uppercase tracking-wider">Active Group</label>
              <select
                className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#f5f500] rounded-none text-sm"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                disabled={isSimulating}
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[10px] text-[#444444] space-y-1">
              <div>Provider: MindsAI Sparks</div>
              <div>Group limit: {maxPanelMinds} minds</div>
              <div>
                Sync: {isSyncingPersonas ? 'sparks...' : 'sparks ready'} /{' '}
                {isSyncingGroups ? 'groups...' : 'groups ready'}
              </div>
            </div>

            {!isSimulating ? (
              <button
                onClick={startSimulation}
                className="w-full bg-[#22c55e] text-[#111111] hover:bg-[#22c55e]/80 p-2 font-bold flex items-center justify-center gap-2 transition-colors rounded-none"
              >
                <Play className="w-4 h-4" />
                START GROUP RUN
              </button>
            ) : (
              <button
                onClick={stopSimulation}
                className="w-full bg-[#ef4444] text-[#ffffff] hover:bg-[#ef4444]/80 p-2 font-bold flex items-center justify-center gap-2 transition-colors rounded-none"
              >
                <Square className="w-4 h-4" />
                HALT RUN
              </button>
            )}
          </div>

          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs text-[#f5f500] uppercase tracking-wider mb-3">Group Members</h3>
            {groupMembers.length === 0 ? (
              <div className="text-sm text-[#444444]">No minds in this group.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {groupMembers.map((persona) => {
                  const visuals = getPersonaVisuals(persona.id);
                  return (
                    <div key={persona.id} className="flex items-center gap-3 text-sm">
                      <span className="text-[#22c55e]">[ok]</span>
                      <span className={`truncate ${visuals.color}`}>{persona.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#111111] relative overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={terminalRef}>
            {messages.length === 0 && !isSimulating && (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-2 border-[#1e1e1e] flex items-center justify-center">
                  <span className="text-[#f5f500] text-xl leading-none animate-pulse">{'>'}</span>
                </div>
                <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase">
                  Waiting for input
                </div>
              </div>
            )}

            {messages.map((message) => {
              const visuals = message.isSystem ? null : getPersonaVisuals(message.senderId);
              return (
                <div key={message.id} className={`flex flex-col ${message.isSystem ? 'opacity-90' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-bold tracking-[0.12em] uppercase ${
                        message.isSystem ? 'text-[#f5f500]' : visuals!.color
                      }`}
                    >
                      {message.senderName}
                    </span>
                    <span className="text-[9px] text-[#444444] tracking-wider">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div
                    className={`p-3 rounded-none border-l-2 ${
                      message.isSystem
                        ? 'bg-[#f5f500]/10 text-[#f5f500] border-[#f5f500] whitespace-pre-wrap'
                        : 'bg-[#1e1e1e] text-[#ffffff] border-[currentColor]'
                    } ${!message.isSystem ? visuals!.color : ''}`}
                  >
                    <span className={message.isSystem ? '' : 'text-[#ffffff]'}>{message.text}</span>
                  </div>
                </div>
              );
            })}

            {isSimulating && (
              <div className="flex items-center gap-2 text-sm text-[#00e5ff] mt-4">
                <span className="animate-pulse">[]</span>
                Streaming spark responses...
              </div>
            )}
          </div>
        </div>
      </>
    );
  };

  const renderProductsTab = () => {
    const activeProduct = products.find((product) => product.id === selectedProductId) ?? products[0];

    return (
      <>
        <div className="w-72 border-r border-[#1e1e1e] flex flex-col bg-[#111111] p-4 gap-4">
          <h3 className="text-xs text-[#f5f500] uppercase tracking-wider">Saved Products</h3>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
            {products.map((product) => (
              <div
                key={product.id}
                onClick={() => setSelectedProductId(product.id)}
                className={`p-2 cursor-pointer rounded-none text-sm border ${
                  selectedProductId === product.id
                    ? 'border-[#f5f500] bg-[#f5f500]/10 text-[#f5f500]'
                    : 'border-transparent text-[#ffffff] hover:bg-[#1e1e1e]'
                }`}
              >
                {product.name}
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const nextId = `p${Date.now()}`;
              setProducts((current) => [
                ...current,
                { id: nextId, name: 'New Product', category: '', description: '' },
              ]);
              setSelectedProductId(nextId);
            }}
            className="w-full bg-[#1e1e1e] text-[#ffffff] hover:bg-[#444444] p-2 text-sm font-bold transition-colors rounded-none"
          >
            + ADD NEW
          </button>
        </div>

        <div className="flex-1 p-6 bg-[#111111] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {activeProduct && (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-[#1e1e1e] pb-2">
                <h2 className="text-xl text-[#f5f500] font-bold">Edit Product</h2>
                <button
                  onClick={() => deleteProduct(activeProduct.id)}
                  className="text-[#ef4444] hover:text-[#ff8080] flex items-center gap-2 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Product
                </button>
              </div>
              <div className="flex flex-col gap-4 max-w-2xl">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Name</label>
                  <input
                    type="text"
                    className="bg-[#1e1e1e] border-none p-3 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#f5f500] rounded-none"
                    value={activeProduct.name}
                    onChange={(event) => updateProduct(activeProduct.id, { name: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Category</label>
                  <input
                    type="text"
                    className="bg-[#1e1e1e] border-none p-3 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#f5f500] rounded-none"
                    value={activeProduct.category}
                    onChange={(event) => updateProduct(activeProduct.id, { category: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Description</label>
                  <textarea
                    className="bg-[#1e1e1e] border-none p-3 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#f5f500] resize-none min-h-[200px] rounded-none custom-scrollbar"
                    value={activeProduct.description}
                    onChange={(event) => updateProduct(activeProduct.id, { description: event.target.value })}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  const renderPersonasTab = () => {
    const selectedPersona = personas.find((persona) => persona.id === selectedVisPersona) ?? personas[0];

    return (
      <>
        <div className="w-72 border-r border-[#1e1e1e] flex flex-col bg-[#111111] p-4 gap-4">
          <h3 className="text-xs text-[#f5f500] uppercase tracking-wider">Available Sparks</h3>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
            {personas.map((persona) => {
              const visuals = getPersonaVisuals(persona.id);
              const Icon = visuals.icon;
              return (
                <div
                  key={persona.id}
                  className={`flex items-center gap-2 p-2 cursor-pointer rounded-none text-sm border ${
                    selectedPersona?.id === persona.id
                      ? 'border-[#00e5ff] bg-[#00e5ff]/10'
                      : 'border-transparent hover:bg-[#1e1e1e]'
                  }`}
                  onClick={() => setSelectedVisPersona(persona.id)}
                >
                  <Icon className={`w-4 h-4 ${visuals.color}`} />
                  <span className={`truncate ${visuals.color}`}>{persona.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 p-6 bg-[#111111] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {selectedPersona && (
            <>
              <h2 className="text-xl text-[#00e5ff] font-bold border-b border-[#1e1e1e] pb-2 flex items-center gap-3">
                {(() => {
                  const visuals = getPersonaVisuals(selectedPersona.id);
                  const Icon = visuals.icon;
                  return <Icon className={`w-6 h-6 ${visuals.color}`} />;
                })()}
                Edit Spark: {selectedPersona.name}
              </h2>

              <div className="flex flex-col gap-4 max-w-2xl">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Name</label>
                  <input
                    type="text"
                    className="bg-[#1e1e1e] border-none p-3 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#00e5ff] rounded-none"
                    value={selectedPersona.name}
                    onChange={(event) => updatePersona(selectedPersona.id, { name: event.target.value })}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">System Prompt</label>
                  <textarea
                    className="bg-[#1e1e1e] border-none p-3 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#00e5ff] resize-none min-h-[300px] rounded-none custom-scrollbar"
                    value={selectedPersona.prompt}
                    onChange={(event) => updatePersona(selectedPersona.id, { prompt: event.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-[#1e1e1e] rounded-none p-3">
                    <div className="text-[#f5f500] uppercase tracking-wider mb-1">Remote Spark</div>
                    <div className="text-[#ffffff] break-all">
                      {selectedPersona.remote?.sparkId ?? 'Pending sync'}
                    </div>
                  </div>
                  <div className="bg-[#1e1e1e] rounded-none p-3">
                    <div className="text-[#f5f500] uppercase tracking-wider mb-1">Last Sync</div>
                    <div className="text-[#ffffff]">
                      {selectedPersona.remote?.lastSyncedAt
                        ? new Date(selectedPersona.remote.lastSyncedAt).toLocaleString()
                        : 'Not synced'}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  const renderGroupsTab = () => {
    const editorGroup = selectedGroupEditor ?? groups[0];
    const selectedMembers = editorGroup
      ? editorGroup.personaIds
          .map((personaId) => personas.find((persona) => persona.id === personaId))
          .filter(Boolean) as PersonaState[]
      : [];

    return (
      <>
        <div className="w-72 border-r border-[#1e1e1e] flex flex-col bg-[#111111] p-4 gap-4">
          <h3 className="text-xs text-[#f5f500] uppercase tracking-wider">Groups</h3>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
            {groups.map((group) => (
              <div
                key={group.id}
                className={`p-3 rounded-none border cursor-pointer ${
                  editorGroup?.id === group.id
                    ? 'border-[#22c55e] bg-[#22c55e]/10'
                    : 'border-transparent hover:bg-[#1e1e1e]'
                }`}
                onClick={() => {
                  setSelectedGroupEditorId(group.id);
                  setSelectedGroupId(group.id);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-[#ffffff] truncate">{group.name}</div>
                  <div className="text-[10px] text-[#444444]">
                    {group.personaIds.length}/{maxPanelMinds}
                  </div>
                </div>
                <div className="text-[10px] text-[#444444] mt-1 truncate">
                  {group.remotePanelId ? `Group ${group.remotePanelId.slice(0, 8)}...` : 'Pending group sync'}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addGroup}
            className="w-full bg-[#1e1e1e] text-[#ffffff] hover:bg-[#444444] p-2 text-sm font-bold transition-colors rounded-none"
          >
            + ADD GROUP
          </button>
        </div>

        <div className="flex-1 p-6 bg-[#111111] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {editorGroup && (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-[#1e1e1e] pb-2">
                <h2 className="text-xl text-[#22c55e] font-bold">Edit Group</h2>
                <button
                  onClick={() => deleteGroup(editorGroup.id)}
                  className="text-[#ef4444] hover:text-[#ff8080] flex items-center gap-2 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Group
                </button>
              </div>

              <div className="max-w-3xl flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Group Name</label>
                  <input
                    type="text"
                    className="bg-[#1e1e1e] border-none p-3 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#22c55e] rounded-none"
                    value={editorGroup.name}
                    onChange={(event) => updateGroup(editorGroup.id, { name: event.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-none p-4">
                    <div className="text-xs text-[#f5f500] uppercase tracking-wider mb-3">Available Sparks</div>
                    <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                      {personas.map((persona) => {
                        const visuals = getPersonaVisuals(persona.id);
                        const selected = editorGroup.personaIds.includes(persona.id);
                        return (
                          <label
                            key={persona.id}
                            className={`flex items-center gap-3 p-2 rounded-none cursor-pointer ${
                              selected ? 'bg-[#22c55e]/10' : 'hover:bg-[#1e1e1e]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleGroupMember(editorGroup.id, persona.id)}
                              className="accent-[#22c55e]"
                            />
                            <span className={`text-sm ${visuals.color}`}>{persona.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-[#0d0d0d] border border-[#1e1e1e] rounded-none p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs text-[#f5f500] uppercase tracking-wider">Selected Order</div>
                      <div className="text-[10px] text-[#444444]">
                        {editorGroup.personaIds.length}/{maxPanelMinds}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {selectedMembers.length === 0 ? (
                        <div className="text-sm text-[#444444]">Select minds to compose this group.</div>
                      ) : (
                        selectedMembers.map((persona, index) => {
                          const visuals = getPersonaVisuals(persona.id);
                          return (
                            <div
                              key={persona.id}
                              className="flex items-center justify-between gap-3 bg-[#1e1e1e] rounded-none p-2"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[10px] text-[#444444]">{index + 1}</span>
                                <span className={`text-sm truncate ${visuals.color}`}>{persona.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => moveGroupMember(editorGroup.id, persona.id, -1)}
                                  className="text-[#00e5ff] hover:text-white disabled:text-[#444444]"
                                  disabled={index === 0}
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => moveGroupMember(editorGroup.id, persona.id, 1)}
                                  className="text-[#00e5ff] hover:text-white disabled:text-[#444444]"
                                  disabled={index === selectedMembers.length - 1}
                                >
                                  <ArrowDown className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-[#1e1e1e] rounded-none p-3">
                    <div className="text-[#f5f500] uppercase tracking-wider mb-1">Remote Group</div>
                    <div className="text-[#ffffff] break-all">
                      {editorGroup.remotePanelId ?? 'Pending sync'}
                    </div>
                  </div>
                  <div className="bg-[#1e1e1e] rounded-none p-3">
                    <div className="text-[#f5f500] uppercase tracking-wider mb-1">Fingerprint</div>
                    <div className="text-[#ffffff] break-all">
                      {editorGroup.remoteFingerprint ?? 'Pending sync'}
                    </div>
                  </div>
                  <div className="bg-[#1e1e1e] rounded-none p-3">
                    <div className="text-[#f5f500] uppercase tracking-wider mb-1">Last Sync</div>
                    <div className="text-[#ffffff]">
                      {editorGroup.lastSyncedAt
                        ? new Date(editorGroup.lastSyncedAt).toLocaleString()
                        : 'Not synced'}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  const renderVisualizationTab = () => {
    if (metrics.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 border-2 border-[#1e1e1e] flex items-center justify-center">
            <span className="text-[#f5f500] text-2xl leading-none animate-pulse">{'>'}</span>
          </div>
          <div className="text-[11px] font-bold tracking-[0.18em] text-[#444444] uppercase">
            Awaiting analysis data
          </div>
        </div>
      );
    }

    const avg = (key: 'sentiment' | 'persuasion' | 'passion') =>
      Math.round(metrics.reduce((sum, m) => sum + m[key], 0) / metrics.length);
    const avgSentiment = avg('sentiment');
    const avgPersuasion = avg('persuasion');
    const avgPassion = avg('passion');
    const sentimentDelta =
      avgSentiment > 20 ? 'POSITIVE SIGNAL' : avgSentiment < -20 ? 'NEGATIVE SIGNAL' : 'NEUTRAL BAND';
    const sentimentTone: 'ok' | 'warn' | 'danger' =
      avgSentiment > 20 ? 'ok' : avgSentiment < -20 ? 'danger' : 'warn';

    const selectedMetric = selectedVisPersona
      ? metrics.find((metric) => metric.id.toLowerCase() === selectedVisPersona.toLowerCase())
      : null;
    const selectedPersona = selectedVisPersona
      ? personas.find((persona) => persona.id === selectedVisPersona)
      : null;
    const personaMessages = selectedVisPersona
      ? messages.filter((message) => message.senderId === selectedVisPersona)
      : [];

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-4 gap-[2px] bg-[#1e1e1e] border-b border-[#1e1e1e]">
          <KpiCard
            variant="hero"
            eyebrow="Avg Sentiment"
            value={avgSentiment}
            delta={sentimentDelta}
          />
          <KpiCard
            eyebrow="Avg Persuasion"
            value={avgPersuasion}
            delta={`${metrics.length} personas scored`}
            deltaTone="muted"
          />
          <KpiCard
            eyebrow="Avg Passion"
            value={avgPassion}
            delta={avgPassion > 60 ? 'HIGH ENGAGEMENT' : 'STEADY'}
            deltaTone={avgPassion > 60 ? 'ok' : 'muted'}
          />
          <KpiCard
            eyebrow="Signal"
            value={metrics.length}
            delta={sentimentDelta}
            deltaTone={sentimentTone}
          />
        </div>
        <div className="flex-1 border-b border-[#1e1e1e] relative flex flex-col bg-[#111111] overflow-hidden p-8">
          <div className="flex justify-between items-center mb-4 z-10">
            <h3 className="text-sm font-bold text-[#f5f500] tracking-widest">MULTI-DIMENSIONAL ANALYSIS</h3>
            <div className="flex bg-[#1e1e1e] rounded-none overflow-hidden">
              <button
                className={`px-3 py-1 text-xs font-bold flex items-center gap-2 ${
                  visMode === 'analytical' ? 'bg-[#f5f500] text-[#111111]' : 'text-[#ffffff] hover:bg-[#444444]'
                }`}
                onClick={() => setVisMode('analytical')}
              >
                <LayoutGrid className="w-3 h-3" />
                ANALYTICAL
              </button>
              <button
                className={`px-3 py-1 text-xs font-bold flex items-center gap-2 ${
                  visMode === 'cinematic' ? 'bg-[#f5f500] text-[#111111]' : 'text-[#ffffff] hover:bg-[#444444]'
                }`}
                onClick={() => setVisMode('cinematic')}
              >
                <Box className="w-3 h-3" />
                CINEMATIC
              </button>
            </div>
          </div>

          {visMode === 'cinematic' ? (
            <div className="flex-1 relative flex items-center justify-center">
              <div className="absolute top-4 right-4 flex bg-[#1e1e1e] rounded-none overflow-hidden z-20">
                {(['iso', 'top', 'front', 'side'] as const).map((view) => (
                  <button
                    key={view}
                    className={`px-2 py-1 text-[10px] font-bold uppercase ${
                      cameraView === view ? 'bg-[#f5f500] text-[#111111]' : 'text-[#ffffff] hover:bg-[#444444]'
                    }`}
                    onClick={() => setCameraView(view)}
                  >
                    {view}
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-lg aspect-square perspective-1200 flex items-center justify-center">
                <div
                  className="relative w-3/4 h-3/4 preserve-3d border border-[#f5f500]/30 bg-[#f5f500]/5 transition-transform duration-1000"
                  style={{
                    transform:
                      cameraView === 'iso'
                        ? 'rotateX(60deg) rotateZ(-45deg)'
                        : cameraView === 'top'
                          ? 'rotateX(0deg) rotateZ(0deg)'
                          : cameraView === 'front'
                            ? 'rotateX(90deg) rotateZ(0deg)'
                            : 'rotateX(90deg) rotateZ(-90deg)',
                  }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#f5f5001a_1px,transparent_1px),linear-gradient(to_bottom,#f5f5001a_1px,transparent_1px)] bg-[size:20%_20%] overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[20%] bg-gradient-to-b from-transparent via-[#f5f500]/20 to-transparent animate-scanline pointer-events-none" />
                  </div>

                  <div className="absolute -bottom-8 left-0 w-full flex justify-between text-[10px] text-[#f5f500] font-bold tracking-widest">
                    <span>-100</span>
                    <span>SENTIMENT (X)</span>
                    <span>100</span>
                  </div>
                  <div className="absolute top-0 -left-8 h-full flex flex-col justify-between items-center text-[10px] text-[#f5f500] font-bold tracking-widest">
                    <span>100</span>
                    <span className="-rotate-90 whitespace-nowrap">PERSUASION (Y)</span>
                    <span>0</span>
                  </div>

                  <div className="absolute left-0 bottom-0 w-[2px] h-[150px] bg-[#f5f500]/50 origin-bottom rotate-x-[-90deg]">
                    <div className="absolute -top-6 left-2 text-[10px] text-[#f5f500] font-bold tracking-widest whitespace-nowrap">
                      PASSION (Z)
                    </div>
                  </div>

                  {metrics.map((metric) => {
                    const persona = personas.find(
                      (item) => item.id.toLowerCase() === metric.id.toLowerCase(),
                    );
                    if (!persona) {
                      return null;
                    }

                    const visuals = getPersonaVisuals(persona.id);
                    const Icon = visuals.icon;
                    const x = ((Math.max(-100, Math.min(100, metric.sentiment)) + 100) / 200) * 100;
                    const y = Math.max(0, Math.min(100, metric.persuasion));
                    const zHeight = (Math.max(0, Math.min(100, metric.passion)) / 100) * 150;
                    const isSelected = selectedVisPersona === persona.id;
                    const isDimmed = selectedVisPersona && !isSelected;

                    const billboardTransform =
                      cameraView === 'iso'
                        ? 'rotateZ(45deg) rotateX(-60deg)'
                        : cameraView === 'top'
                          ? 'rotateZ(0deg) rotateX(0deg)'
                          : cameraView === 'front'
                            ? 'rotateZ(0deg) rotateX(-90deg)'
                            : 'rotateZ(90deg) rotateX(-90deg)';

                    return (
                      <div
                        key={metric.id}
                        className={`absolute preserve-3d transition-all duration-1000 cursor-pointer group ${
                          isDimmed ? 'opacity-20' : 'opacity-100'
                        }`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                        onClick={() => setSelectedVisPersona(persona.id)}
                      >
                        {isSelected && (
                          <>
                            <div
                              className="absolute top-0 right-0 h-[1px] bg-current opacity-30 border-dashed border-t border-current"
                              style={{ width: `${x}%`, left: `-${x}%` }}
                            />
                            <div
                              className="absolute bottom-0 left-0 w-[1px] bg-current opacity-30 border-dashed border-l border-current"
                              style={{ height: `${100 - y}%` }}
                            />
                          </>
                        )}

                        <div
                          className={`absolute left-0 bottom-0 w-[1px] origin-bottom rotate-x-[-90deg] ${visuals.color} ${
                            isSelected ? 'opacity-100' : 'opacity-40'
                          }`}
                          style={{ height: `${zHeight}px`, backgroundColor: 'currentColor' }}
                        />

                        <div
                          className={`absolute flex flex-col items-center ${visuals.color}`}
                          style={{
                            transform: `translateZ(${zHeight}px) ${billboardTransform} translate(-50%, -50%)`,
                          }}
                        >
                          <div
                            className={`w-3 h-3 rounded-full bg-current  transition-all ${
                              isSelected ? 'scale-0' : 'group-hover:scale-0'
                            }`}
                          />
                          <div
                            className={`absolute p-1.5 rounded-none bg-[#111111] border border-current  transition-all duration-300 ${
                              isSelected
                                ? 'scale-125 opacity-100'
                                : 'scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div
                            className={`absolute top-full mt-2 text-[9px] font-bold bg-[#111111]/80 px-1 rounded whitespace-nowrap transition-all duration-300 ${
                              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            S:{metric.sentiment} | P:{metric.persuasion} | Z:{metric.passion}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 relative w-full h-full min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                  <XAxis
                    type="number"
                    dataKey="sentiment"
                    name="Sentiment"
                    domain={[-100, 100]}
                    stroke="#ffffff"
                    tick={{ fill: '#ffffff' }}
                    label={{
                      value: 'Sentiment (-100 to 100)',
                      position: 'insideBottom',
                      offset: -10,
                      fill: '#f5f500',
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="passion"
                    name="Passion"
                    domain={[0, 100]}
                    stroke="#ffffff"
                    tick={{ fill: '#ffffff' }}
                    label={{
                      value: 'Passion (0 to 100)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#f5f500',
                    }}
                  />
                  <ZAxis type="number" dataKey="persuasion" range={[100, 1000]} name="Persuasion" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as Metric;
                        const persona = personas.find(
                          (item) => item.id.toLowerCase() === data.id.toLowerCase(),
                        );
                        if (!persona) {
                          return null;
                        }
                        const visuals = getPersonaVisuals(persona.id);
                        const Icon = visuals.icon;
                        return (
                          <div className="bg-[#111111] border border-[#f5f500] p-3 rounded-none ">
                            <div className={`font-bold flex items-center gap-2 mb-2 ${visuals.color}`}>
                              <Icon className="w-4 h-4" />
                              {persona.name}
                            </div>
                            <div className="text-xs text-[#ffffff]">Sentiment: {data.sentiment}</div>
                            <div className="text-xs text-[#ffffff]">Passion: {data.passion}</div>
                            <div className="text-xs text-[#ffffff]">Persuasion: {data.persuasion}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine x={0} stroke="#444444" />
                  <ReferenceLine y={50} stroke="#444444" />
                  <Scatter
                    name="Personas"
                    data={metrics}
                    onClick={(data: Metric) => setSelectedVisPersona(data.id)}
                  >
                    {metrics.map((metric, index) => {
                      const persona = personas.find(
                        (item) => item.id.toLowerCase() === metric.id.toLowerCase(),
                      );
                      const isSelected = selectedVisPersona === metric.id;
                      const fill = persona ? toVisualColor(getPersonaVisuals(persona.id).color) : '#ffffff';
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={fill}
                          stroke={isSelected ? '#fff' : fill}
                          strokeWidth={isSelected ? 2 : 1}
                          style={{
                            cursor: 'pointer',
                            opacity: selectedVisPersona && !isSelected ? 0.3 : 1,
                          }}
                        />
                      );
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="h-64 bg-[#111111] flex">
          {selectedMetric && selectedPersona ? (
            <>
              <div className="w-1/3 border-r border-[#1e1e1e] p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {(() => {
                    const visuals = getPersonaVisuals(selectedPersona.id);
                    const Icon = visuals.icon;
                    return (
                      <>
                        <Icon className={`w-8 h-8 ${visuals.color}`} />
                        <h2 className={`text-xl font-bold ${visuals.color}`}>{selectedPersona.name}</h2>
                      </>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="bg-[#1e1e1e] p-3 rounded-none">
                    <div className="text-[10px] text-[#f5f500] uppercase">Sentiment</div>
                    <div className="text-xl font-bold text-[#ffffff]">{selectedMetric.sentiment}</div>
                  </div>
                  <div className="bg-[#1e1e1e] p-3 rounded-none">
                    <div className="text-[10px] text-[#f5f500] uppercase">Persuasion</div>
                    <div className="text-xl font-bold text-[#ffffff]">{selectedMetric.persuasion}</div>
                  </div>
                  <div className="bg-[#1e1e1e] p-3 rounded-none col-span-2">
                    <div className="text-[10px] text-[#f5f500] uppercase">Passion</div>
                    <div className="text-xl font-bold text-[#ffffff]">{selectedMetric.passion}</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-6 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                <h3 className="text-xs text-[#f5f500] uppercase tracking-wider mb-2">Transcript Filter</h3>
                {personaMessages.length > 0 ? (
                  personaMessages.map((message) => (
                    <div key={message.id} className="bg-[#1e1e1e] p-3 rounded-none text-sm text-[#ffffff]">
                      "{message.text}"
                    </div>
                  ))
                ) : (
                  <div className="text-[#444444] text-sm italic">No messages recorded for this spark.</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#444444]">
              Select a node in the graph to view breakdown.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettingsTab = () => (
    <div className="flex-1 p-6 bg-[#111111] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
      <h2 className="text-xl text-[#22c55e] font-bold border-b border-[#1e1e1e] pb-2">Runtime Settings</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        <div className="bg-[#1e1e1e] rounded-none p-4">
          <div className="text-xs text-[#f5f500] uppercase tracking-wider mb-2">Provider</div>
          <div className="text-[#ffffff] text-sm">{health?.provider ?? 'MindsAI'}</div>
        </div>
        <div className="bg-[#1e1e1e] rounded-none p-4">
          <div className="text-xs text-[#f5f500] uppercase tracking-wider mb-2">API Status</div>
          <div className="text-[#ffffff] text-sm">
            {health?.configured ? 'Configured' : 'Missing MINDS_API_KEY'}
          </div>
        </div>
        <div className="bg-[#1e1e1e] rounded-none p-4">
          <div className="text-xs text-[#f5f500] uppercase tracking-wider mb-2">Base URL</div>
          <div className="text-[#ffffff] text-sm break-all">
            {health?.apiBaseUrl ?? 'https://getminds.ai/api/v1'}
          </div>
        </div>
        <div className="bg-[#1e1e1e] rounded-none p-4">
          <div className="text-xs text-[#f5f500] uppercase tracking-wider mb-2">Max Minds / Group</div>
          <div className="text-[#ffffff] text-sm">{maxPanelMinds}</div>
        </div>
        <div className="bg-[#1e1e1e] rounded-none p-4">
          <div className="text-xs text-[#f5f500] uppercase tracking-wider mb-2">Analyst Spark</div>
          <div className="text-[#ffffff] text-sm break-all">
            {analystSpark?.sparkId ?? 'Created on first analysis run'}
          </div>
        </div>
        <div className="bg-[#1e1e1e] rounded-none p-4">
          <div className="text-xs text-[#f5f500] uppercase tracking-wider mb-2">Persistence</div>
          <div className="text-[#ffffff] text-sm">localStorage v{STORAGE_VERSION}</div>
        </div>
      </div>

      <div className="max-w-3xl text-sm text-[#c8d0ff] space-y-2">
        <p>
          The frontend now syncs persona definitions to persistent MindsAI sparks and persists each local group as a
          remote MindsAI group. Simulation runs are streamed by the Express BFF through live spark orchestration, not
          from the browser directly.
        </p>
        <p>
          If the server is missing <code>MINDS_API_KEY</code>, simulation is disabled but local editing still works.
        </p>
      </div>
    </div>
  );

  return (
    <>
      <AnimatedBackground />
      <div className="h-screen w-full bg-transparent p-4 md:p-8 font-sans text-[#ffffff] flex flex-col overflow-hidden relative z-10">
      <div className="flex-1 border border-[#1e1e1e] bg-[#111111]/85 backdrop-blur-md flex flex-col rounded-none overflow-hidden relative z-10">
        <div className="flex items-center border-b border-[#1e1e1e] bg-[#0a0a0a] text-sm select-none">
          <div className="flex items-center px-4 py-2 border-r border-[#1e1e1e]">
            <Logo />
          </div>
          {(['simulation', 'products', 'personas', 'groups', 'visualization', 'settings'] as Tab[]).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 border-r border-[#1e1e1e] cursor-pointer text-[11px] tracking-[0.12em] uppercase font-bold transition-colors ${
                activeTab === tab
                  ? 'text-[#0a0a0a] bg-[#f5f500]'
                  : 'text-[#555555] hover:text-[#ffffff] hover:bg-[#141414]'
              }`}
            >
              {tab}
            </div>
          ))}
          <div className="px-4 py-2 text-[#444444] flex-1 text-right tracking-[0.08em] text-[11px]">&gt; ./society-sim-os</div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'simulation' && renderSimulationTab()}
          {activeTab === 'products' && renderProductsTab()}
          {activeTab === 'personas' && renderPersonasTab()}
          {activeTab === 'groups' && renderGroupsTab()}
          {activeTab === 'visualization' && renderVisualizationTab()}
          {activeTab === 'settings' && renderSettingsTab()}
        </div>

        <div className="flex text-xs font-bold border-t border-[#1e1e1e] bg-[#0a0a0a]">
          <div className={`px-4 py-1 ${isSimulating ? 'bg-[#ef4444] text-[#ffffff]' : 'bg-[#f5f500] text-[#111111]'}`}>
            {isSimulating ? 'SIMULATING' : 'STATUS'}
          </div>
          <div className="px-4 py-1 bg-[#1e1e1e] text-[#ffffff] flex-1 truncate font-normal">
            {health?.configured
              ? isSimulating
                ? 'Streaming simulation output...'
                : 'Ready'
              : 'Missing MINDS_API_KEY on server'}
          </div>
          <div className="px-4 py-1 bg-[#f5f500] text-[#111111]">UTF-8</div>
          <div className="px-4 py-1 bg-[#00e5ff] text-[#111111] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#111111]" />
            MindsAI
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

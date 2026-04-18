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
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
  BatchRunRecord,
  BatchRunStreamEvent,
  Group,
  GroupPhaseResult,
  HealthResponse,
  Message,
  Metric,
  PanelStreamEvent,
  PersonaState,
  Product,
  RemoteSparkRef,
  VisualizationPhase,
  VisualizationSource,
} from './types';

type Tab =
  | 'simulation'
  | 'batch-runs'
  | 'products'
  | 'personas'
  | 'groups'
  | 'visualization'
  | 'settings';
type PersonaVisuals = {
  color: string;
  icon: typeof Activity;
};
type BatchGroupStatus =
  | 'queued'
  | 'baseline_running'
  | 'baseline_analyzed'
  | 'relay_running'
  | 'relay_analyzed'
  | 'completed'
  | 'failed';
type BatchProgressItem = {
  groupId: string;
  groupName: string;
  status: BatchGroupStatus;
  errorMessage?: string;
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
    name: 'Core Group',
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
  batchRuns: [],
  selectedBatchRunId: null,
  visualizationSource: 'single',
  selectedVisualizationPhase: 'baseline',
  batchDraft: {
    selectedGroupIds: DEFAULT_GROUPS(DEFAULT_PERSONAS).map((group) => group.id),
    concurrency: 4,
  },
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

function readStreamEvents<TEvent extends { type: string }>(
  response: Response,
  onEvent: (event: TEvent) => void,
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
      onEvent({ type: 'complete', raw: rawData } as unknown as TEvent);
      currentEvent = 'message';
      dataLines = [];
      return;
    }

    try {
      onEvent(JSON.parse(rawData) as TEvent);
    } catch {
      onEvent(
        {
          type: currentEvent === 'error' ? 'error' : 'system',
          text: rawData,
          raw: rawData,
        } as unknown as TEvent,
      );
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

function createBatchProgress(groups: Group[]): BatchProgressItem[] {
  return groups.map((group) => ({
    groupId: group.id,
    groupName: group.name,
    status: 'queued',
  }));
}

function updateBatchProgressItem(
  current: BatchProgressItem[],
  groupId: string,
  updates: Partial<BatchProgressItem>,
): BatchProgressItem[] {
  return current.map((item) => (item.groupId === groupId ? { ...item, ...updates } : item));
}

function getBatchStatusLabel(status: BatchGroupStatus): string {
  switch (status) {
    case 'baseline_running':
      return 'baseline running';
    case 'baseline_analyzed':
      return 'baseline analyzed';
    case 'relay_running':
      return 'relay running';
    case 'relay_analyzed':
      return 'relay analyzed';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}

function getBatchStatusColor(status: BatchGroupStatus): string {
  switch (status) {
    case 'baseline_running':
    case 'relay_running':
      return 'text-[#00e5ff]';
    case 'baseline_analyzed':
    case 'relay_analyzed':
      return 'text-[#f5f500]';
    case 'completed':
      return 'text-[#22c55e]';
    case 'failed':
      return 'text-[#ef4444]';
    default:
      return 'text-[#444444]';
  }
}

function getPhaseResults(run: BatchRunRecord, phase: VisualizationPhase): GroupPhaseResult[] {
  if (phase === 'relay') {
    return run.relayResults;
  }

  if (phase === 'aggregate') {
    return [];
  }

  return run.baselineResults;
}

function getVisualizationMessages(
  source: VisualizationSource,
  selectedBatchRun: BatchRunRecord | null,
  selectedPhase: VisualizationPhase,
  selectedGroupId: string | null,
  singleMessages: Message[],
): Message[] {
  if (source === 'single') {
    return singleMessages;
  }

  if (!selectedBatchRun || selectedPhase === 'aggregate' || !selectedGroupId) {
    return [];
  }

  return (
    getPhaseResults(selectedBatchRun, selectedPhase).find((result) => result.groupId === selectedGroupId)?.transcript ??
    []
  );
}

function getVisualizationMetrics(
  source: VisualizationSource,
  selectedBatchRun: BatchRunRecord | null,
  selectedPhase: VisualizationPhase,
  selectedGroupId: string | null,
  singleMetrics: Metric[],
): Metric[] {
  if (source === 'single') {
    return singleMetrics;
  }

  if (!selectedBatchRun || selectedPhase === 'aggregate' || !selectedGroupId) {
    return [];
  }

  return (
    getPhaseResults(selectedBatchRun, selectedPhase).find((result) => result.groupId === selectedGroupId)?.analysis
      .metrics ?? []
  );
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
  const [batchRuns, setBatchRuns] = useState<BatchRunRecord[]>(initialState.batchRuns);
  const [selectedBatchRunId, setSelectedBatchRunId] = useState<string | null>(
    initialState.selectedBatchRunId,
  );
  const [visualizationSource, setVisualizationSource] = useState<VisualizationSource>(
    initialState.visualizationSource,
  );
  const [selectedVisualizationPhase, setSelectedVisualizationPhase] = useState<VisualizationPhase>(
    initialState.selectedVisualizationPhase,
  );
  const [batchDraft, setBatchDraft] = useState(initialState.batchDraft);
  const [visMode, setVisMode] = useState<'analytical' | 'cinematic'>('analytical');
  const [cameraView, setCameraView] = useState<'iso' | 'top' | 'front' | 'side'>('iso');
  const [messages, setMessages] = useState<Message[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedGroupEditorId, setSelectedGroupEditorId] = useState(
    initialState.selectedGroupId || initialState.groups[0]?.id || 'g1',
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isSyncingPersonas, setIsSyncingPersonas] = useState(false);
  const [isSyncingGroups, setIsSyncingGroups] = useState(false);
  const [icpPersonas, setIcpPersonas] = useState<PersonaState[]>([]);
  const [isGeneratingIcp, setIsGeneratingIcp] = useState(false);
  const [batchMessages, setBatchMessages] = useState<Message[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgressItem[]>([]);
  const [batchPhase, setBatchPhase] = useState<
    'baseline' | 'consensus' | 'relay' | 'aggregate' | 'complete'
  >('baseline');
  const [batchCompletedGroups, setBatchCompletedGroups] = useState(0);
  const [batchFailedGroups, setBatchFailedGroups] = useState(0);
  const [batchElapsedMs, setBatchElapsedMs] = useState(0);
  const [batchStartedAt, setBatchStartedAt] = useState<string | null>(null);

  const terminalRef = useRef<HTMLDivElement>(null);
  const batchTerminalRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const batchAbortRef = useRef<AbortController | null>(null);

  const maxPanelMinds = health?.maxPanelMinds ?? 5;
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? products[0];
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const selectedGroupEditor = groups.find((group) => group.id === selectedGroupEditorId) ?? groups[0];
  const selectedBatchRun = batchRuns.find((run) => run.id === selectedBatchRunId) ?? batchRuns[0] ?? null;
  const isBusy = isSimulating || isBatchRunning;

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages, metrics]);

  useEffect(() => {
    if (batchTerminalRef.current) {
      batchTerminalRef.current.scrollTop = batchTerminalRef.current.scrollHeight;
    }
  }, [batchMessages, batchProgress]);

  useEffect(() => {
    if (!isBatchRunning || !batchStartedAt) {
      return;
    }

    const update = () => setBatchElapsedMs(Date.now() - new Date(batchStartedAt).getTime());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [isBatchRunning, batchStartedAt]);

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
      batchRuns,
      selectedBatchRunId,
      visualizationSource,
      selectedVisualizationPhase,
      batchDraft,
    };

    saveAppState(state);
  }, [
    products,
    personas,
    groups,
    selectedProductId,
    selectedGroupId,
    selectedVisPersona,
    analystSpark,
    batchRuns,
    selectedBatchRunId,
    visualizationSource,
    selectedVisualizationPhase,
    batchDraft,
  ]);

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

  useEffect(() => {
    if (groups.length === 0) {
      return;
    }

    if (!groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id);
    }

    if (!groups.some((group) => group.id === selectedGroupEditorId)) {
      setSelectedGroupEditorId(groups[0].id);
    }
  }, [groups, selectedGroupId, selectedGroupEditorId]);

  useEffect(() => {
    const validGroupIds = new Set(
      groups.filter((group) => group.personaIds.length > 0 && group.personaIds.length <= maxPanelMinds).map((group) => group.id),
    );

    setBatchDraft((current) => {
      const retained = current.selectedGroupIds.filter((groupId) => validGroupIds.has(groupId));
      const nextSelectedGroupIds =
        retained.length > 0 ? retained : Array.from(validGroupIds);

      if (
        retained.length === current.selectedGroupIds.length &&
        nextSelectedGroupIds.length === current.selectedGroupIds.length
      ) {
        const same = nextSelectedGroupIds.every((groupId, index) => current.selectedGroupIds[index] === groupId);
        if (same) {
          return current;
        }
      }

      return {
        ...current,
        selectedGroupIds: nextSelectedGroupIds,
      };
    });
  }, [groups, maxPanelMinds]);

  useEffect(() => {
    if (batchRuns.length === 0) {
      return;
    }

    if (selectedBatchRunId && batchRuns.some((run) => run.id === selectedBatchRunId)) {
      return;
    }

    setSelectedBatchRunId(batchRuns[0].id);
  }, [batchRuns, selectedBatchRunId]);

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
        discipline: persona.discipline,
        description: persona.description,
        tags: persona.tags,
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
        groups: Array<Pick<Group, 'id' | 'remoteGroupId' | 'remoteGroupFingerprint' | 'lastSyncedAt'>>;
      }>('/api/minds/groups/sync', {
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
          remoteGroupId: remoteGroup.remoteGroupId,
          remoteGroupFingerprint: remoteGroup.remoteGroupFingerprint,
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

  const stopBatchRun = () => {
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    setIsBatchRunning(false);
    setBatchPhase('complete');
    setBatchMessages((current) =>
      upsertMessages(
        current,
        createMessage({
          senderId: 'system',
          senderName: 'BATCH_ABORT',
          text: 'Batch run halted by user.',
          isSystem: true,
        }),
      ),
    );
  };

  const runSimulationWithPersonas = async (
    personasToUse: PersonaState[],
    product: Product,
    options?: { groupOverride?: Group },
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsSimulating(true);
    setMetrics([]);
    setMessages([
      createMessage({
        senderId: 'system',
        senderName: 'SYSTEM',
        text: `INITIALIZING GROUP RUN\nPRODUCT: ${product.name}\nCATEGORY: ${product.category}\nGROUP: ${
          options?.groupOverride?.name ?? `${product.name} Focus Group`
        }`,
        isSystem: true,
      }),
    ]);
    setActiveTab('simulation');

    try {
      const allHaveRemote = personasToUse.every((persona) => persona.remote?.sparkId);
      let activePersonas: PersonaState[] = personasToUse;
      let activeGroup: Group =
        options?.groupOverride ?? {
          id: `adhoc-${Date.now()}`,
          name: `${product.name} Focus Group`,
          personaIds: personasToUse.map((persona) => persona.id),
        };

      if (!allHaveRemote) {
        const syncedPersonas = await syncPersonas(personas);

        if (options?.groupOverride) {
          const syncedGroups = await syncGroups(groups, syncedPersonas);
          const resolvedGroup = syncedGroups.find((group) => group.id === options.groupOverride?.id);
          if (!resolvedGroup) {
            throw new Error('Selected group could not be resolved after sync.');
          }

          activeGroup = resolvedGroup;
          activePersonas = resolvedGroup.personaIds
            .map((personaId) => syncedPersonas.find((persona) => persona.id === personaId))
            .filter(Boolean) as PersonaState[];
        } else {
          activePersonas = personasToUse
            .map((persona) => syncedPersonas.find((candidate) => candidate.id === persona.id))
            .filter(Boolean) as PersonaState[];
          activeGroup = {
            ...activeGroup,
            personaIds: activePersonas.map((persona) => persona.id),
          };
        }
      } else {
        activeGroup = {
          ...activeGroup,
          personaIds: activePersonas.map((persona) => persona.id),
        };
      }

      const transcriptLines: string[] = [];

      const response = await fetch('/api/simulations/group-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          group: activeGroup,
          product,
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

      await readStreamEvents<PanelStreamEvent>(response, (event) => {
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
          product,
          personas: activePersonas.map((persona) => ({ id: persona.id, name: persona.name })),
          transcript: transcriptLines.join('\n'),
          analystSpark,
        }),
        signal: controller.signal,
      });

      setAnalystSpark(analysis.analyst);
      setMetrics(analysis.metrics);
      setVisualizationSource('single');
      setSelectedVisualizationPhase('baseline');
      setMessages((current) =>
        upsertMessages(
          current,
          createMessage({
            senderId: 'system',
            senderName: 'SYSTEM_CONCLUSION',
            text: `${analysis.summary}\n\n[ANALYSIS COMPLETE] → Proceed to Visualization Tab`,
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

  const simulateFromRealData = async () => {
    if (!health?.configured) {
      pushSystemMessage('MINDS_API_KEY is missing. Configure the server in Settings before running ICP generation.');
      setActiveTab('settings');
      return;
    }
    const activeProduct = products.find((p) => p.id === selectedProductId);
    if (!activeProduct) return;
    const keyword = activeProduct.icpKeyword?.trim() || activeProduct.name;

    setIsGeneratingIcp(true);
    setMessages([]);
    setMetrics([]);
    setActiveTab('simulation');

    const log = (text: string) =>
      setMessages((current) =>
        upsertMessages(
          current,
          createMessage({ senderId: 'system', senderName: 'ICP_PIPELINE', text, isSystem: true }),
        ),
      );

    log(
      `SIMULATE FROM REAL DATA\n` +
        `Keyword: "${keyword}" | Product: ${activeProduct.name}\n\n` +
        `Step 1/3: Scraping Reddit + Twitter via Apify...`,
    );

    try {
      const res = await fetch('/api/icp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword,
          productName: activeProduct.name,
          productCategory: activeProduct.category,
          productDescription: activeProduct.description,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? `Server error ${res.status}`);
      }

      const data = (await res.json()) as {
        personas: Array<{
          id: string;
          name: string;
          color: string;
          archetype: string;
          prompt: string;
          discipline: string;
          description: string;
          tags: string[];
          remote: RemoteSparkRef;
        }>;
        postsScraped: number;
        redditPosts: number;
        twitterPosts: number;
      };

      log(
        `Step 2/3: ${data.personas.length} Minds AI Sparks created ✓\n` +
          `Posts scraped: ${data.postsScraped} ` +
          `(Reddit: ${data.redditPosts}, Twitter: ${data.twitterPosts})\n\n` +
          data.personas
            .map((p) => `• ${p.name} [${p.archetype}] → ${p.remote.sparkId.slice(0, 8)}...`)
            .join('\n'),
      );

      const newPersonas: PersonaState[] = data.personas.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        prompt: p.prompt,
        discipline: p.discipline,
        description: p.description,
        tags: p.tags,
        remote: p.remote,
      }));

      setIcpPersonas(newPersonas);

      // Keep existing local personas/groups and upsert the generated ICP panel into editor state.
      setPersonas((current) => {
        const next = new Map(current.map((persona) => [persona.id, persona]));
        for (const persona of newPersonas) {
          next.set(persona.id, persona);
        }
        return Array.from(next.values());
      });
      const icpGroup: Group = {
        id: 'icp-auto-group',
        name: `${activeProduct.name} — Real ICP Panel`,
        personaIds: newPersonas.map((p) => p.id),
      };
      icpGroup.name = `${activeProduct.name} — Real ICP Panel`;
      icpGroup.name = `${activeProduct.name} — Real ICP Panel`;
      setGroups((current) => [icpGroup, ...current.filter((group) => group.id !== icpGroup.id)]);
      setSelectedGroupId('icp-auto-group');
      setSelectedGroupEditorId('icp-auto-group');

      log(`\nStep 3/3: Starting simulation...`);
      await runSimulationWithPersonas(newPersonas, activeProduct, { groupOverride: icpGroup });
    } catch (err) {
      log(`ERROR: ${(err as Error).message}`);
    } finally {
      setIsGeneratingIcp(false);
    }
  };

  const startSimulation = async () => {
    const activeProduct = products.find((p) => p.id === selectedProductId);
    if (!activeProduct) {
      return;
    }
    const activePersonas =
      icpPersonas.length > 0
        ? icpPersonas
        : (selectedGroup?.personaIds
            .map((id) => personas.find((p) => p.id === id))
            .filter(Boolean) as PersonaState[]) ?? [];
    if (activePersonas.length === 0) {
      pushSystemMessage('Select or generate at least one spark before starting a simulation.');
      return;
    }
    const icpGroup = groups.find((group) => group.id === 'icp-auto-group');
    const groupOverride = icpPersonas.length > 0 ? icpGroup ?? selectedGroup : selectedGroup;
    setMessages([]);
    setMetrics([]);
    await runSimulationWithPersonas(activePersonas, activeProduct, groupOverride ? { groupOverride } : undefined);
  };

  const appendBatchSystemMessage = (senderName: string, text: string) => {
    setBatchMessages((current) =>
      upsertMessages(
        current,
        createMessage({
          senderId: 'system',
          senderName,
          text,
          isSystem: true,
        }),
      ),
    );
  };

  const toggleBatchGroupSelection = (groupId: string) => {
    setBatchDraft((current) => {
      const selected = current.selectedGroupIds.includes(groupId);
      const nextSelectedGroupIds = selected
        ? current.selectedGroupIds.filter((id) => id !== groupId)
        : [...current.selectedGroupIds, groupId];

      return {
        ...current,
        selectedGroupIds: nextSelectedGroupIds,
      };
    });
  };

  const startBatchRun = async () => {
    if (!health?.configured) {
      appendBatchSystemMessage('BATCH_ERROR', 'MINDS_API_KEY is missing. Configure the server before batch runs.');
      setActiveTab('settings');
      return;
    }

    if (!selectedProduct) {
      appendBatchSystemMessage('BATCH_ERROR', 'Select a product before starting a batch run.');
      return;
    }

    const chosenGroups = batchDraft.selectedGroupIds
      .map((groupId) => groups.find((group) => group.id === groupId))
      .filter(Boolean) as Group[];

    if (chosenGroups.length === 0) {
      appendBatchSystemMessage('BATCH_ERROR', 'Select at least one saved group for the batch run.');
      return;
    }

    const invalidGroup = chosenGroups.find(
      (group) => group.personaIds.length === 0 || group.personaIds.length > maxPanelMinds,
    );
    if (invalidGroup) {
      appendBatchSystemMessage(
        'BATCH_ERROR',
        `Group "${invalidGroup.name}" is not valid for batch execution.`,
      );
      setActiveTab('groups');
      return;
    }

    const controller = new AbortController();
    batchAbortRef.current = controller;
    setIsBatchRunning(true);
    setBatchStartedAt(new Date().toISOString());
    setBatchElapsedMs(0);
    setBatchPhase('baseline');
    setBatchCompletedGroups(0);
    setBatchFailedGroups(0);
    setBatchProgress(createBatchProgress(chosenGroups));
    setBatchMessages([
      createMessage({
        senderId: 'system',
        senderName: 'BATCH_INIT',
        text: `INITIALIZING BATCH RUN\nPRODUCT: ${selectedProduct.name}\nGROUPS: ${chosenGroups.length}\nCONCURRENCY: ${batchDraft.concurrency}`,
        isSystem: true,
      }),
    ]);
    setActiveTab('batch-runs');

    try {
      const syncedPersonas = await syncPersonas(personas);
      const syncedGroups = await syncGroups(groups, syncedPersonas);
      const runGroups = batchDraft.selectedGroupIds
        .map((groupId) => syncedGroups.find((group) => group.id === groupId))
        .filter(Boolean) as Group[];

      const runConfig = {
        id: `batch-${Date.now()}`,
        name: `${selectedProduct.name} / ${new Date().toLocaleTimeString()}`,
        productId: selectedProduct.id,
        groupIds: runGroups.map((group) => group.id),
        concurrency: batchDraft.concurrency,
        relayMode: 'global_consensus' as const,
        createdAt: new Date().toISOString(),
      };

      const response = await fetch('/api/simulations/batch-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          config: runConfig,
          product: selectedProduct,
          groups: runGroups,
          personas: syncedPersonas.map((persona) => ({
            id: persona.id,
            name: persona.name,
            remote: persona.remote,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Batch run failed with status ${response.status}`);
      }

      await readStreamEvents<BatchRunStreamEvent>(response, (event) => {
        if (event.type === 'batch_status') {
          setBatchPhase(event.phase);
          setBatchCompletedGroups(event.completedGroups);
          setBatchFailedGroups((current) => current);
          return;
        }

        if (event.type === 'group_started') {
          setBatchProgress((current) =>
            updateBatchProgressItem(current, event.groupId, {
              status: event.phase === 'baseline' ? 'baseline_running' : 'relay_running',
              errorMessage: undefined,
            }),
          );
          appendBatchSystemMessage(
            'BATCH_GROUP',
            `${event.groupName} -> ${event.phase === 'baseline' ? 'baseline started' : 'relay started'}`,
          );
          return;
        }

        if (event.type === 'group_message') {
          setBatchMessages((current) =>
            upsertMessages(
              current,
              createMessage({
                senderId: event.mindId,
                senderName: `${event.groupName} / ${event.mindName}`,
                text: event.text,
              }),
            ),
          );
          return;
        }

        if (event.type === 'group_analysis') {
          setBatchProgress((current) =>
            updateBatchProgressItem(current, event.groupId, {
              status: event.phase === 'baseline' ? 'baseline_analyzed' : 'relay_analyzed',
            }),
          );
          appendBatchSystemMessage(
            'BATCH_ANALYSIS',
            `${event.groupName} -> ${event.phase} summary ready (${event.analysis.purchaseIntent})`,
          );
          return;
        }

        if (event.type === 'consensus_ready') {
          appendBatchSystemMessage('BATCH_CONSENSUS', event.consensus.executiveSummary);
          return;
        }

        if (event.type === 'system') {
          appendBatchSystemMessage('BATCH_SYSTEM', event.text);
          return;
        }

        if (event.type === 'error') {
          if (event.groupId) {
            setBatchProgress((current) =>
              updateBatchProgressItem(current, event.groupId, {
                status: 'failed',
                errorMessage: event.message,
              }),
            );
          }
          setBatchFailedGroups((current) => current + 1);
          appendBatchSystemMessage('BATCH_ERROR', event.message);
          return;
        }

        if (event.type === 'batch_completed') {
          const relayCompletedIds = new Set(event.run.relayResults.map((result) => result.groupId));
          const baselineCompletedIds = new Set(event.run.baselineResults.map((result) => result.groupId));
          setBatchProgress((current) =>
            current.map((item) => {
              if (item.status === 'failed') {
                return item;
              }

              if (relayCompletedIds.has(item.groupId)) {
                return { ...item, status: 'completed' };
              }

              if (baselineCompletedIds.has(item.groupId)) {
                return { ...item, status: 'baseline_analyzed' };
              }

              return item;
            }),
          );
          setBatchRuns((current) => [event.run, ...current.filter((run) => run.id !== event.run.id)].slice(0, 12));
          setSelectedBatchRunId(event.run.id);
          setVisualizationSource('batch');
          setSelectedVisualizationPhase('baseline');
          setSelectedGroupId(event.run.groupIds[0] ?? selectedGroupId);
          setBatchFailedGroups(event.run.failedGroups.length);
          setBatchPhase('complete');
          return;
        }
      });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        appendBatchSystemMessage('BATCH_ERROR', `Batch run failed: ${formatError(error)}`);
      }
    } finally {
      batchAbortRef.current = null;
      setIsBatchRunning(false);
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

            {icpPersonas.length > 0 && (
              <div className="mb-2 text-xs text-emerald-400 border border-emerald-400/30 bg-emerald-400/5 p-2 rounded-none">
                ✓ {icpPersonas.length} data-driven personas ready
              </div>
            )}
            <button
              onClick={simulateFromRealData}
              disabled={isGeneratingIcp || isSimulating}
              className="w-full bg-[#00e5ff] text-[#111111] hover:bg-[#00e5ff]/80 p-2 font-bold flex items-center justify-center gap-2 transition-colors rounded-none disabled:opacity-50 mb-2 text-sm"
            >
              <Sparkles className="w-4 h-4" />
              {isGeneratingIcp ? 'GENERATING...' : 'SIMULATE FROM REAL DATA'}
            </button>
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
            <h3 className="text-xs text-[#f5f500] uppercase tracking-wider mb-3">
              {icpPersonas.length > 0 ? 'Active Nodes' : 'Group Members'}
            </h3>
            {(icpPersonas.length > 0 ? icpPersonas : groupMembers).length === 0 ? (
              <div className="text-sm text-[#444444]">No minds in this group.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {(icpPersonas.length > 0 ? icpPersonas : groupMembers).map((p) => {
                  const color = p.color ?? getPersonaVisuals(p.id).color;
                  return (
                    <div key={p.id} className="flex items-center gap-3 text-sm">
                      <span className="text-[#22c55e]">✓</span>
                      <div className="flex flex-col">
                        <span className={`truncate ${color}`}>{p.name}</span>
                        {icpPersonas.length > 0 && (
                          <span className="text-[10px] text-[#444444]">data-driven</span>
                        )}
                      </div>
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

  const renderBatchRunsTab = () => {
    const validGroups = groups.filter(
      (group) => group.personaIds.length > 0 && group.personaIds.length <= maxPanelMinds,
    );
    const invalidGroups = new Set(
      groups
        .filter((group) => group.personaIds.length === 0 || group.personaIds.length > maxPanelMinds)
        .map((group) => group.id),
    );

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
                disabled={isBatchRunning}
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-[#f5f500] uppercase tracking-wider">Concurrency</label>
              <input
                type="number"
                min={1}
                max={10}
                value={batchDraft.concurrency}
                disabled={isBatchRunning}
                onChange={(event) =>
                  setBatchDraft((current) => ({
                    ...current,
                    concurrency: Math.max(1, Math.min(10, Number(event.target.value) || 4)),
                  }))
                }
                className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#22c55e] rounded-none text-sm"
              />
            </div>

            <div className="text-[10px] text-[#444444] space-y-1">
              <div>Workflow: baseline batch + global summary relay</div>
              <div>Selected groups: {batchDraft.selectedGroupIds.length}</div>
              <div>Valid groups: {validGroups.length}</div>
            </div>

            {!isBatchRunning ? (
              <button
                onClick={startBatchRun}
                className="w-full bg-[#22c55e] text-[#111111] hover:bg-[#22c55e]/80 p-2 font-bold flex items-center justify-center gap-2 transition-colors rounded-none"
              >
                <Play className="w-4 h-4" />
                START BATCH RUN
              </button>
            ) : (
              <button
                onClick={stopBatchRun}
                className="w-full bg-[#ef4444] text-[#ffffff] hover:bg-[#ef4444]/80 p-2 font-bold flex items-center justify-center gap-2 transition-colors rounded-none"
              >
                <Square className="w-4 h-4" />
                ABORT BATCH
              </button>
            )}
          </div>

          <div className="p-4 border-b border-[#1e1e1e]">
            <h3 className="text-xs text-[#f5f500] uppercase tracking-wider mb-3">Saved Groups</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {groups.map((group) => {
                const selected = batchDraft.selectedGroupIds.includes(group.id);
                const invalid = invalidGroups.has(group.id);
                return (
                  <label
                    key={group.id}
                    className={`flex items-start gap-3 p-3 border rounded-none ${
                      invalid
                        ? 'opacity-50 cursor-not-allowed border-[#1e1e1e] bg-[#161616]'
                        : selected
                          ? 'cursor-pointer border-[#22c55e] bg-[#22c55e]/10'
                          : 'cursor-pointer border-transparent hover:bg-[#1e1e1e]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={isBatchRunning || invalid}
                      onChange={() => toggleBatchGroupSelection(group.id)}
                      className="mt-1 accent-[#22c55e]"
                    />
                    <div className="min-w-0">
                      <div className="text-sm text-[#ffffff] truncate">{group.name}</div>
                      <div className={`text-[10px] mt-1 ${invalid ? 'text-[#ef4444]' : 'text-[#444444]'}`}>
                        {group.personaIds.length === 0
                          ? 'Empty group'
                          : group.personaIds.length > maxPanelMinds
                            ? `Exceeds ${maxPanelMinds} minds`
                            : `${group.personaIds.length} minds ready`}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
            <h3 className="text-xs text-[#f5f500] uppercase tracking-wider mb-3">Batch Progress</h3>
            <div className="space-y-2">
              {batchProgress.length === 0 ? (
                <div className="text-sm text-[#444444]">No batch execution started yet.</div>
              ) : (
                batchProgress.map((item) => (
                  <div key={item.groupId} className="rounded-none border border-[#1e1e1e] bg-[#1a1a1a] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-[#ffffff] truncate">{item.groupName}</div>
                      <div className={`text-[10px] uppercase tracking-wider ${getBatchStatusColor(item.status)}`}>
                        {getBatchStatusLabel(item.status)}
                      </div>
                    </div>
                    {item.errorMessage ? (
                      <div className="text-[10px] text-[#ef4444] mt-2">{item.errorMessage}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#111111] overflow-hidden">
          <div className="grid grid-cols-4 border-b border-[#1e1e1e] bg-[#0d0d0d] text-xs">
            <div className="p-4 border-r border-[#1e1e1e]">
              <div className="text-[#f5f500] uppercase tracking-wider">Phase</div>
              <div className="text-[#ffffff] mt-1">{batchPhase}</div>
            </div>
            <div className="p-4 border-r border-[#1e1e1e]">
              <div className="text-[#f5f500] uppercase tracking-wider">Completed</div>
              <div className="text-[#ffffff] mt-1">{batchCompletedGroups}</div>
            </div>
            <div className="p-4 border-r border-[#1e1e1e]">
              <div className="text-[#f5f500] uppercase tracking-wider">Failed</div>
              <div className="text-[#ffffff] mt-1">{batchFailedGroups}</div>
            </div>
            <div className="p-4">
              <div className="text-[#f5f500] uppercase tracking-wider">Elapsed</div>
              <div className="text-[#ffffff] mt-1">{Math.floor(batchElapsedMs / 1000)}s</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={batchTerminalRef}>
            {batchMessages.length === 0 && !isBatchRunning ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 border-2 border-[#1e1e1e] flex items-center justify-center">
                  <span className="text-[#f5f500] text-xl leading-none animate-pulse">{'>'}</span>
                </div>
                <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase">
                  Ready for batch input
                </div>
              </div>
            ) : null}

            {batchMessages.map((message) => (
              <div key={message.id} className={`flex flex-col ${message.isSystem ? 'opacity-90' : ''}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold tracking-[0.12em] uppercase ${message.isSystem ? 'text-[#f5f500]' : 'text-[#00e5ff]'}`}>
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
                      : 'bg-[#1e1e1e] text-[#ffffff] border-[#00e5ff]'
                  }`}
                >
                  <span className={message.isSystem ? '' : 'text-[#ffffff]'}>{message.text}</span>
                </div>
              </div>
            ))}

            {isBatchRunning ? (
              <div className="flex items-center gap-2 text-sm text-[#00e5ff] mt-4">
                <span className="animate-pulse">[]</span>
                Streaming multi-group relay output...
              </div>
            ) : null}
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
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">ICP Keyword</label>
                  <input
                    type="text"
                    placeholder="e.g. sales automation SaaS, B2B founder"
                    className="bg-[#1e1e1e] border-none p-3 text-[#ffffff] focus:outline-none focus:ring-1 focus:ring-[#f5f500] rounded-none text-sm"
                    value={activeProduct.icpKeyword ?? ''}
                    onChange={(event) => updateProduct(activeProduct.id, { icpKeyword: event.target.value })}
                  />
                  <span className="text-[10px] text-[#444444]">
                    Searched on Reddit + Twitter to generate real ICP personas.
                  </span>
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
          {icpPersonas.length > 0 && (
            <div className="text-xs text-emerald-400 border border-emerald-400/30 bg-emerald-400/5 p-3 rounded-none">
              ✓ Showing {icpPersonas.length} data-driven personas from last real data run.
              Their names, prompts, and roles are synthesized from the scraped dataset and persisted locally.
            </div>
          )}
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
                  {group.remoteGroupId ? `Group ${group.remoteGroupId.slice(0, 8)}...` : 'Pending group sync'}
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

              {editorGroup.id === 'icp-auto-group' && (
                <div className="text-xs text-emerald-400 border border-emerald-400/30 bg-emerald-400/5 p-3 rounded-none">
                  ✓ Auto-generated panel from real ICP data. Contains all {editorGroup.personaIds.length} data-driven personas.
                </div>
              )}

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
                      {editorGroup.remoteGroupId ?? 'Pending sync'}
                    </div>
                  </div>
                  <div className="bg-[#1e1e1e] rounded-none p-3">
                    <div className="text-[#f5f500] uppercase tracking-wider mb-1">Fingerprint</div>
                    <div className="text-[#ffffff] break-all">
                      {editorGroup.remoteGroupFingerprint ?? 'Pending sync'}
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
    if (visualizationSource === 'batch' && batchRuns.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-[#6272a4] gap-4">
          <div className="text-4xl">[]</div>
          <div>[ NO SAVED BATCH RUNS ]</div>
        </div>
      );
    }

    const activePhase =
      visualizationSource === 'batch' ? selectedVisualizationPhase : ('baseline' as VisualizationPhase);
    const phaseResults =
      visualizationSource === 'batch' && selectedBatchRun ? getPhaseResults(selectedBatchRun, activePhase) : [];
    const resolvedVisualizationGroupId =
      visualizationSource === 'batch' && activePhase !== 'aggregate'
        ? phaseResults.some((result) => result.groupId === selectedGroupId)
          ? selectedGroupId
          : phaseResults[0]?.groupId ?? null
        : selectedGroupId;
    const activeMetrics = getVisualizationMetrics(
      visualizationSource,
      selectedBatchRun,
      activePhase,
      resolvedVisualizationGroupId,
      metrics,
    );
    const activeMessages = getVisualizationMessages(
      visualizationSource,
      selectedBatchRun,
      activePhase,
      resolvedVisualizationGroupId,
      messages,
    );
    const selectedMetric = selectedVisPersona
      ? activeMetrics.find((metric) => metric.id.toLowerCase() === selectedVisPersona.toLowerCase())
      : null;
    const selectedPersona = selectedVisPersona
      ? personas.find((persona) => persona.id === selectedVisPersona)
      : null;
    const personaMessages = selectedVisPersona
      ? activeMessages.filter((message) => message.senderId === selectedVisPersona)
      : [];
    const selectedPhaseResult =
      visualizationSource === 'batch' && resolvedVisualizationGroupId && activePhase !== 'aggregate'
        ? phaseResults.find((result) => result.groupId === resolvedVisualizationGroupId) ?? null
        : null;
    const selectedBatchGroup =
      visualizationSource === 'batch' && resolvedVisualizationGroupId
        ? groups.find((group) => group.id === resolvedVisualizationGroupId) ?? null
        : null;

    if (visualizationSource === 'batch' && activePhase === 'aggregate') {
      const aggregate = selectedBatchRun?.finalAggregate;
      if (!aggregate) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#111111]">
            <div className="w-14 h-14 border-2 border-[#1e1e1e] flex items-center justify-center">
              <span className="text-[#f5f500] text-2xl leading-none animate-pulse">{'>'}</span>
            </div>
            <div className="text-[11px] font-bold tracking-[0.18em] text-[#444444] uppercase">
              Aggregate report not available
            </div>
          </div>
        );
      }

      const comparisonCount = aggregate.groupComparisons.length;
      const aggregateAvgSentiment = comparisonCount
        ? Math.round(
            aggregate.groupComparisons.reduce((sum, comparison) => sum + comparison.averageSentiment, 0) /
              comparisonCount,
          )
        : 0;
      const aggregateAvgPersuasion = comparisonCount
        ? Math.round(
            aggregate.groupComparisons.reduce((sum, comparison) => sum + comparison.averagePersuasion, 0) /
              comparisonCount,
          )
        : 0;
      const aggregateAvgPassion = comparisonCount
        ? Math.round(
            aggregate.groupComparisons.reduce((sum, comparison) => sum + comparison.averagePassion, 0) /
              comparisonCount,
          )
        : 0;
      const highIntentCount = aggregate.groupComparisons.filter((comparison) => comparison.purchaseIntent === 'high')
        .length;
      const mixedIntentCount = aggregate.groupComparisons.filter((comparison) => comparison.purchaseIntent === 'mixed')
        .length;
      const lowIntentCount = aggregate.groupComparisons.filter((comparison) => comparison.purchaseIntent === 'low')
        .length;
      const aggregateSignal =
        aggregateAvgSentiment > 20
          ? 'POSITIVE CONSENSUS'
          : aggregateAvgSentiment < -20
            ? 'NEGATIVE CONSENSUS'
            : 'CAUTIOUS CONSENSUS';
      const aggregateSignalTone: 'ok' | 'warn' | 'danger' =
        aggregateAvgSentiment > 20 ? 'ok' : aggregateAvgSentiment < -20 ? 'danger' : 'warn';
      const aggregateChartData = aggregate.groupComparisons.map((comparison) => ({
        groupName: comparison.groupName,
        sentiment: comparison.averageSentiment,
        persuasion: comparison.averagePersuasion,
        passion: comparison.averagePassion,
        purchaseIntent: comparison.purchaseIntent,
      }));
      const aggregateChartHeight = Math.max(280, aggregateChartData.length * 78);
      const aggregatePanelClass = 'border border-[#1e1e1e] bg-[#0d0d0d] p-5';
      const aggregateLabelClass = 'text-[10px] font-bold tracking-[0.18em] text-[#f5f500] uppercase mb-4';
      const aggregateItemClass = 'border border-[#1e1e1e] bg-[#111111] p-3';
      const intentChipClass = (intent: 'low' | 'mixed' | 'high') =>
        intent === 'high'
          ? 'border-[#1c3b20] bg-[#102112] text-[#7dff94]'
          : intent === 'mixed'
            ? 'border-[#3a3717] bg-[#17150b] text-[#f5f500]'
            : 'border-[#3a1b1b] bg-[#1a0f0f] text-[#ff8f8f]';

      return (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#111111]">
          <div className="grid grid-cols-4 gap-[2px] bg-[#1e1e1e] border-b border-[#1e1e1e]">
            <KpiCard
              variant="hero"
              eyebrow="Aggregate Sentiment"
              value={aggregateAvgSentiment}
              delta={aggregateSignal}
              deltaTone={aggregateSignalTone}
            />
            <KpiCard
              eyebrow="Group Coverage"
              value={comparisonCount}
              delta={`${highIntentCount} high / ${mixedIntentCount} mixed / ${lowIntentCount} low`}
              deltaTone="muted"
            />
            <KpiCard
              eyebrow="Avg Persuasion"
              value={aggregateAvgPersuasion}
              delta={`${aggregate.topAppeals.length} appeals surfaced`}
              deltaTone={aggregate.topAppeals.length > 0 ? 'ok' : 'muted'}
            />
            <KpiCard
              eyebrow="Avg Passion"
              value={aggregateAvgPassion}
              delta={
                aggregate.failedGroups.length > 0
                  ? `${aggregate.failedGroups.length} failures in aggregate`
                  : 'No failed groups'
              }
              deltaTone={aggregate.failedGroups.length > 0 ? 'danger' : 'muted'}
            />
          </div>

          <div className="border-b border-[#1e1e1e] bg-[#111111] p-8 pb-6">
            <div className="flex flex-wrap justify-between items-end gap-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Result Source</label>
                  <select
                    className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] rounded-none text-sm"
                    value={visualizationSource}
                    onChange={(event) => setVisualizationSource(event.target.value as VisualizationSource)}
                  >
                    <option value="single">Single Run</option>
                    <option value="batch">Batch Run</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Saved Batch Run</label>
                  <select
                    className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] rounded-none text-sm min-w-64"
                    value={selectedBatchRun?.id ?? ''}
                    onChange={(event) => setSelectedBatchRunId(event.target.value)}
                  >
                    {batchRuns.map((run) => (
                      <option key={run.id} value={run.id}>
                        {run.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#f5f500] uppercase tracking-wider">Phase</label>
                  <select
                    className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] rounded-none text-sm"
                    value={selectedVisualizationPhase}
                    onChange={(event) => setSelectedVisualizationPhase(event.target.value as VisualizationPhase)}
                  >
                    <option value="baseline">Baseline</option>
                    <option value="relay">Relay</option>
                    <option value="aggregate">Aggregate</option>
                  </select>
                </div>
              </div>
              <div className="border border-[#1e1e1e] bg-[#0d0d0d] px-4 py-4 min-w-[280px] max-w-[440px]">
                <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase mb-3">
                  Aggregate Read
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-[#b8b8b8]">
                  <div>Product</div>
                  <div className="text-right text-white">{selectedBatchRun?.product.name ?? 'Unknown'}</div>
                  <div>Groups analyzed</div>
                  <div className="text-right text-white">{comparisonCount}</div>
                  <div>Buyer-ready panels</div>
                  <div className="text-right text-white">{highIntentCount}</div>
                  <div>Primary objection</div>
                  <div className="text-right text-white">{aggregate.topObjections[0] ?? 'None'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6 bg-[#111111]">
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
              <div className={aggregatePanelClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <div>
                    <div className={aggregateLabelClass}>Consensus Map</div>
                    <div className="text-xs text-[#666666]">
                      Sentiment spans resistance to conviction. Persuasion and passion show conversion strength.
                    </div>
                  </div>
                  <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase">
                    {comparisonCount} group averages
                  </div>
                </div>

                {aggregateChartData.length > 0 ? (
                  <div style={{ height: aggregateChartHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={aggregateChartData}
                        layout="vertical"
                        margin={{ top: 8, right: 20, left: 20, bottom: 8 }}
                        barCategoryGap={16}
                      >
                        <CartesianGrid stroke="#1e1e1e" horizontal={true} vertical={false} />
                        <XAxis
                          type="number"
                          domain={[-100, 100]}
                          tick={{ fill: '#666666', fontSize: 11 }}
                          axisLine={{ stroke: '#1e1e1e' }}
                          tickLine={{ stroke: '#1e1e1e' }}
                        />
                        <YAxis
                          type="category"
                          dataKey="groupName"
                          width={140}
                          tick={{ fill: '#d4d4d4', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(245, 245, 0, 0.04)' }}
                          contentStyle={{
                            backgroundColor: '#111111',
                            border: '1px solid #1e1e1e',
                            borderRadius: 0,
                            color: '#ffffff',
                          }}
                          labelStyle={{ color: '#f5f500', fontWeight: 700, marginBottom: 4 }}
                          formatter={(value: number, name: string) => {
                            const label =
                              name === 'sentiment'
                                ? 'Sentiment'
                                : name === 'persuasion'
                                  ? 'Persuasion'
                                  : 'Passion';
                            return [value, label];
                          }}
                        />
                        <Legend
                          wrapperStyle={{ color: '#666666', fontSize: '11px', paddingTop: '8px' }}
                          formatter={(value: string) =>
                            value === 'sentiment'
                              ? 'Sentiment'
                              : value === 'persuasion'
                                ? 'Persuasion'
                                : 'Passion'
                          }
                        />
                        <ReferenceLine x={0} stroke="#444444" />
                        <Bar dataKey="sentiment" fill="#f5f500" maxBarSize={14} />
                        <Bar dataKey="persuasion" fill="#5cc8d6" maxBarSize={14} />
                        <Bar dataKey="passion" fill="#7dff94" maxBarSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="min-h-[280px] flex items-center justify-center text-[11px] font-bold tracking-[0.18em] text-[#444444] uppercase">
                    No aggregate comparison data
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className={aggregatePanelClass}>
                  <div className={aggregateLabelClass}>Intent Breakdown</div>
                  <div className="grid grid-cols-3 gap-[2px] bg-[#1e1e1e]">
                    <div className="bg-[#111111] px-3 py-4">
                      <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase mb-2">High</div>
                      <div className="text-[28px] font-black leading-none text-[#7dff94]">{highIntentCount}</div>
                    </div>
                    <div className="bg-[#111111] px-3 py-4">
                      <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase mb-2">Mixed</div>
                      <div className="text-[28px] font-black leading-none text-[#f5f500]">{mixedIntentCount}</div>
                    </div>
                    <div className="bg-[#111111] px-3 py-4">
                      <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase mb-2">Low</div>
                      <div className="text-[28px] font-black leading-none text-[#ff8f8f]">{lowIntentCount}</div>
                    </div>
                  </div>
                </div>

                <div className={aggregatePanelClass}>
                  <div className={aggregateLabelClass}>Lead Shift</div>
                  <div className="text-sm text-[#d4d4d4] leading-6">
                    {aggregate.consensusShifts[0] ?? 'No major shift signals recorded.'}
                  </div>
                </div>

                <div className={aggregatePanelClass}>
                  <div className={aggregateLabelClass}>Primary Objection</div>
                  <div className="text-sm text-[#ff8f8f] leading-6">
                    {aggregate.topObjections[0] ?? 'No dominant objection recorded.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className={`xl:col-span-2 ${aggregatePanelClass}`}>
                <div className={aggregateLabelClass}>Batch Summary</div>
                <div className="text-sm text-[#d4d4d4] leading-7 whitespace-pre-wrap">{aggregate.summary}</div>
              </div>
              <div className={aggregatePanelClass}>
                <div className={aggregateLabelClass}>Consensus Shifts</div>
                <div className="space-y-3">
                  {aggregate.consensusShifts.length > 0 ? (
                    aggregate.consensusShifts.map((shift) => (
                      <div key={shift} className={`${aggregateItemClass} text-sm text-[#d4d4d4] leading-6`}>
                        {shift}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#666666]">No major shift signals recorded.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={aggregatePanelClass}>
                <div className={aggregateLabelClass}>Top Appeals</div>
                <div className="space-y-3">
                  {aggregate.topAppeals.length > 0 ? (
                    aggregate.topAppeals.map((appeal) => (
                      <div key={appeal} className={`${aggregateItemClass} text-sm text-[#7dff94] leading-6`}>
                        {appeal}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#666666]">No durable appeals survived aggregate review.</div>
                  )}
                </div>
              </div>
              <div className={aggregatePanelClass}>
                <div className={aggregateLabelClass}>Top Objections</div>
                <div className="space-y-3">
                  {aggregate.topObjections.length > 0 ? (
                    aggregate.topObjections.map((objection) => (
                      <div key={objection} className={`${aggregateItemClass} text-sm text-[#ff8f8f] leading-6`}>
                        {objection}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#666666]">No consistent objections recorded.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className={aggregatePanelClass}>
                <div className={aggregateLabelClass}>Average Persona Metrics</div>
                <div className="space-y-3">
                  {aggregate.averagePersonaMetrics.map((entry) => {
                    const persona = personas.find((item) => item.id === entry.id);
                    return (
                      <div key={entry.id} className={aggregateItemClass}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="text-sm text-white">{persona?.name ?? entry.id}</div>
                          <div className="text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase">
                            persona avg
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-[#b8b8b8]">
                          <span>Sent {entry.sentiment}</span>
                          <span>Pers {entry.persuasion}</span>
                          <span>Pass {entry.passion}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className={aggregatePanelClass}>
                <div className={aggregateLabelClass}>Failed Groups</div>
                <div className="space-y-3">
                  {aggregate.failedGroups.length > 0 ? (
                    aggregate.failedGroups.map((failedGroup) => (
                      <div key={failedGroup} className={`${aggregateItemClass} text-sm text-[#ff8f8f] leading-6`}>
                        {failedGroup}
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-[#666666]">No failed groups in final aggregate.</div>
                  )}
                </div>
              </div>
            </div>

            <div className={aggregatePanelClass}>
              <div className={aggregateLabelClass}>Group Comparison</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e1e1e] text-left text-[10px] font-bold tracking-[0.18em] text-[#444444] uppercase">
                      <th className="pb-3 pr-4">Group</th>
                      <th className="pb-3 pr-4">Sentiment</th>
                      <th className="pb-3 pr-4">Persuasion</th>
                      <th className="pb-3 pr-4">Passion</th>
                      <th className="pb-3">Intent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aggregate.groupComparisons.map((comparison) => (
                      <tr key={comparison.groupId} className="border-t border-[#1e1e1e] text-[#d4d4d4]">
                        <td className="py-3 pr-4 text-white">{comparison.groupName}</td>
                        <td className="py-3 pr-4">{comparison.averageSentiment}</td>
                        <td className="py-3 pr-4">{comparison.averagePersuasion}</td>
                        <td className="py-3 pr-4">{comparison.averagePassion}</td>
                        <td className="py-3">
                          <span
                            className={`inline-flex border px-2 py-1 text-[10px] font-bold tracking-[0.18em] uppercase ${intentChipClass(
                              comparison.purchaseIntent,
                            )}`}
                          >
                            {comparison.purchaseIntent}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeMetrics.length === 0) {
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
      Math.round(activeMetrics.reduce((sum, metric) => sum + metric[key], 0) / activeMetrics.length);
    const avgSentiment = avg('sentiment');
    const avgPersuasion = avg('persuasion');
    const avgPassion = avg('passion');
    const sentimentDelta =
      avgSentiment > 20 ? 'POSITIVE SIGNAL' : avgSentiment < -20 ? 'NEGATIVE SIGNAL' : 'NEUTRAL BAND';
    const sentimentTone: 'ok' | 'warn' | 'danger' =
      avgSentiment > 20 ? 'ok' : avgSentiment < -20 ? 'danger' : 'warn';

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-4 gap-[2px] bg-[#1e1e1e] border-b border-[#1e1e1e]">
          <KpiCard variant="hero" eyebrow="Avg Sentiment" value={avgSentiment} delta={sentimentDelta} />
          <KpiCard
            eyebrow="Avg Persuasion"
            value={avgPersuasion}
            delta={`${activeMetrics.length} personas scored`}
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
            value={activeMetrics.length}
            delta={sentimentDelta}
            deltaTone={sentimentTone}
          />
        </div>
        <div className="flex-1 border-b border-[#1e1e1e] relative flex flex-col bg-[#111111] overflow-hidden p-8">
          <div className="flex flex-wrap justify-between items-end gap-4 mb-4 z-10">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#f5f500] uppercase tracking-wider">Result Source</label>
                <select
                  className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] rounded-none text-sm"
                  value={visualizationSource}
                  onChange={(event) => setVisualizationSource(event.target.value as VisualizationSource)}
                >
                  <option value="single">Single Run</option>
                  <option value="batch">Batch Run</option>
                </select>
              </div>

              {visualizationSource === 'batch' ? (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#f5f500] uppercase tracking-wider">Saved Batch Run</label>
                    <select
                      className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] rounded-none text-sm min-w-64"
                      value={selectedBatchRun?.id ?? ''}
                      onChange={(event) => setSelectedBatchRunId(event.target.value)}
                    >
                      {batchRuns.map((run) => (
                        <option key={run.id} value={run.id}>
                          {run.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#f5f500] uppercase tracking-wider">Phase</label>
                    <select
                      className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] rounded-none text-sm"
                      value={selectedVisualizationPhase}
                      onChange={(event) => setSelectedVisualizationPhase(event.target.value as VisualizationPhase)}
                    >
                      <option value="baseline">Baseline</option>
                      <option value="relay">Relay</option>
                      <option value="aggregate">Aggregate</option>
                    </select>
                  </div>

                  {activePhase !== 'aggregate' ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-[#f5f500] uppercase tracking-wider">Group</label>
                      <select
                        className="bg-[#1e1e1e] border-none p-2 text-[#ffffff] rounded-none text-sm min-w-56"
                        value={resolvedVisualizationGroupId ?? ''}
                        onChange={(event) => setSelectedGroupId(event.target.value)}
                      >
                        {phaseResults.map((result) => (
                          <option key={`${result.phase}-${result.groupId}`} value={result.groupId}>
                            {result.groupName}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

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

          <div className="flex justify-between items-center mb-4 z-10">
            <h3 className="text-sm font-bold text-[#f5f500] tracking-widest">MULTI-DIMENSIONAL ANALYSIS</h3>
            <div className="text-xs text-[#444444]">
              {visualizationSource === 'batch'
                ? `${selectedBatchGroup?.name ?? selectedPhaseResult?.groupName ?? 'Batch Group'} / ${activePhase.toUpperCase()}`
                : `${selectedGroup?.name ?? 'Single Group'} / SINGLE RUN`}
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

                  {activeMetrics.map((metric) => {
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
                            className={`w-3 h-3 rounded-full bg-current shadow-[0_0_10px_currentColor] transition-all ${
                              isSelected ? 'scale-0' : 'group-hover:scale-0'
                            }`}
                          />
                          <div
                            className={`absolute p-1.5 rounded-none bg-[#111111] border border-current shadow-[0_0_15px_currentColor] transition-all duration-300 ${
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
                          <div className="bg-[#111111] border border-[#f5f500] p-3 rounded-none shadow-lg">
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
                  <Scatter name="Personas" data={activeMetrics} onClick={(data: Metric) => setSelectedVisPersona(data.id)}>
                    {activeMetrics.map((metric, index) => {
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
                {selectedPhaseResult ? (
                  <div className="mt-4 bg-[#20222b] border border-[#44475a] rounded-sm p-3 text-xs text-[#c8d0ff]">
                    <div className="text-[#bd93f9] uppercase tracking-wider mb-2">Phase Summary</div>
                    <div className="whitespace-pre-wrap">{selectedPhaseResult.analysis.summary}</div>
                  </div>
                ) : null}
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
            {(['simulation', 'batch-runs', 'products', 'personas', 'groups', 'visualization', 'settings'] as Tab[]).map((tab) => (
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
            {activeTab === 'batch-runs' && renderBatchRunsTab()}
            {activeTab === 'products' && renderProductsTab()}
            {activeTab === 'personas' && renderPersonasTab()}
            {activeTab === 'groups' && renderGroupsTab()}
            {activeTab === 'visualization' && renderVisualizationTab()}
            {activeTab === 'settings' && renderSettingsTab()}
          </div>

          <div className="flex text-xs font-bold border-t border-[#1e1e1e] bg-[#0a0a0a]">
            <div className={`px-4 py-1 ${isBusy ? 'bg-[#ef4444] text-[#ffffff]' : 'bg-[#f5f500] text-[#111111]'}`}>
              {isBusy ? 'RUNNING' : 'STATUS'}
            </div>
            <div className="px-4 py-1 bg-[#1e1e1e] text-[#ffffff] flex-1 truncate font-normal">
              {health?.configured
                ? isSimulating
                  ? 'Streaming single-group output...'
                  : isBatchRunning
                    ? 'Streaming batch relay output...'
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

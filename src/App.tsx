import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Terminal, Play, Square, Cpu, Leaf, ShieldAlert, Activity, Coffee, Zap, DollarSign, Gem, Microscope, Sparkles, LayoutGrid, Box } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const PERSONAS = [
  {
    id: 'chad',
    name: 'Chad (Biohacker)',
    icon: Activity,
    color: 'text-cyan-400',
    prompt: 'You are Chad, a health-focused biohacker and looksmaxxer. You optimize everything in your life. You use slang like "gains", "protocol", "optimization". You are obsessed with scalp health and testosterone.'
  },
  {
    id: 'susan',
    name: 'Susan (Mom of 2)',
    icon: ShieldAlert,
    color: 'text-pink-400',
    prompt: 'You are Susan, a mother of 2. You are highly concerned about safety, chemicals, and the health of your children. You are skeptical of weird ingredients and always ask about FDA approval or natural alternatives.'
  },
  {
    id: 'arthur',
    name: 'Arthur (Traditionalist)',
    icon: Coffee,
    color: 'text-yellow-400',
    prompt: 'You are Arthur, an elderly man who thinks things should stay the way they used to be. You dislike modern fads, weird new products, and miss the days when shampoo was just soap. You are grumpy but well-meaning.'
  },
  {
    id: 'leo',
    name: 'Leo (Uni Student)',
    icon: Cpu,
    color: 'text-purple-400',
    prompt: 'You are Leo, a university student who loves trying out bizarre, trendy new products. You are always broke but will spend money on viral TikTok items. You speak in Gen Z slang.'
  },
  {
    id: 'fern',
    name: 'Fern (Environmentalist)',
    icon: Leaf,
    color: 'text-emerald-400',
    prompt: 'You are Fern, a cynical environmentalist. You constantly question the sustainability, ethical sourcing, and greenwashing of products. You worry about the impact on animals and the planet.'
  },
  {
    id: 'blake',
    name: 'Blake (Tech Bro)',
    icon: Zap,
    color: 'text-blue-400',
    prompt: 'You are Blake, a Silicon Valley tech bro. You view everything through the lens of disruption, AI, and crypto. You use corporate buzzwords like "synergy", "10x", and "paradigm shift".'
  },
  {
    id: 'penny',
    name: 'Penny (Bargain Hunter)',
    icon: DollarSign,
    color: 'text-orange-400',
    prompt: 'You are Penny, an extreme couponer and bargain hunter. You only care about the price, value per ounce, and whether there is a discount code. You refuse to pay premium prices for basic goods.'
  },
  {
    id: 'victoria',
    name: 'Victoria (Luxury Snob)',
    icon: Gem,
    color: 'text-rose-400',
    prompt: 'You are Victoria, a wealthy socialite who only buys premium, aesthetic, status-symbol products. If it is not expensive and beautifully packaged, you think it is trash. You are very condescending.'
  },
  {
    id: 'dr_chen',
    name: 'Dr. Chen (Skeptic)',
    icon: Microscope,
    color: 'text-indigo-400',
    prompt: 'You are Dr. Chen, a rigorous scientist. You demand peer-reviewed studies, clinical trials, and hate pseudoscience or marketing fluff. You analyze ingredient lists critically.'
  },
  {
    id: 'luna',
    name: 'Luna (Holistic Healer)',
    icon: Sparkles,
    color: 'text-fuchsia-400',
    prompt: 'You are Luna, a holistic healer who believes in crystals, energy, and ancient remedies. You talk about vibes, auras, and aligning chakras. You love anything raw and unprocessed.'
  }
];

const INITIAL_PRODUCTS = [
  { id: 'p1', name: 'GuanoGlow Scalp Therapy', category: 'Haircare / Wellness', description: 'A revolutionary shampoo based on organic agave nectar and authentic, sustainably-sourced bat guano. Discovered by researchers to have incredible scalp health benefits, balancing the microbiome and promoting rapid hair growth.' }
];

type Tab = 'simulation' | 'products' | 'personas' | 'visualization' | 'settings';

interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface PersonaState extends Persona {
  active: boolean;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  isSystem?: boolean;
}

interface Metric {
  id: string;
  sentiment: number;
  persuasion: number;
  passion: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('simulation');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [selectedProductId, setSelectedProductId] = useState('p1');
  const [personas, setPersonas] = useState<PersonaState[]>(PERSONAS.map(p => ({...p, active: true})));
  const [settings, setSettings] = useState({ speed: 6000, temperature: 0.8, maxTurns: 2 });
  const [selectedVisPersona, setSelectedVisPersona] = useState<string | null>(null);
  const [visMode, setVisMode] = useState<'analytical' | 'cinematic'>('analytical');
  const [cameraView, setCameraView] = useState<'iso' | 'top' | 'front' | 'side'>('iso');

  const [messages, setMessages] = useState<Message[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const isSimulatingRef = useRef(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [messages, metrics]);

  const getPersonaColor = (id: string) => {
    if (id === 'system') return 'text-[#00ff00]';
    const p = PERSONAS.find(p => p.id === id);
    return p ? p.color : 'text-gray-400';
  };

  const generateWithRetry = async (prompt: string, config: any, modelName = 'gemini-3.1-flash-lite-preview', maxRetries = 4) => {
    let retries = 0;
    while (retries < maxRetries) {
      try {
        return await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config
        });
      } catch (error: any) {
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('quota')) {
          retries++;
          if (retries >= maxRetries) {
            setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              senderId: 'system',
              senderName: 'SYSTEM_ERROR',
              text: `CRITICAL ERROR: API Quota exceeded. If you are on the free tier, you may have hit the daily limit (1,500 requests/day) or the per-minute limit (15 requests/minute). Please check your Google AI Studio dashboard.`,
              isSystem: true
            }]);
            throw error;
          }
          
          // Much longer delays: 10s, 20s, 40s
          const delay = Math.pow(2, retries - 1) * 10000; 
          console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
          
          setMessages(prev => [...prev, {
            id: Date.now().toString() + Math.random(),
            senderId: 'system',
            senderName: 'SYSTEM_WARNING',
            text: `API Quota reached. Pausing simulation for ${delay/1000} seconds before retrying (Attempt ${retries}/${maxRetries - 1})...`,
            isSystem: true
          }]);
          
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  };

  const startSimulation = async () => {
    const activeProduct = products.find(p => p.id === selectedProductId);
    if (!activeProduct) return;
    const activePersonas = personas.filter(p => p.active);
    if (activePersonas.length === 0) return;

    isSimulatingRef.current = true;
    setIsSimulating(true);
    setMessages([]);
    setMetrics([]);
    setActiveTab('simulation');
    
    const initialMsg: Message = {
      id: Date.now().toString(),
      senderId: 'system',
      senderName: 'SYSTEM',
      text: `INITIALIZING PRODUCT EVALUATION...\nPRODUCT: ${activeProduct.name}\nCATEGORY: ${activeProduct.category}\nDESCRIPTION: ${activeProduct.description}`,
      isSystem: true
    };
    
    setMessages([initialMsg]);
    
    let currentTranscript = "";
    const rounds = settings.maxTurns;
    
    try {
      for (let r = 0; r < rounds; r++) {
        for (const persona of activePersonas) {
          if (!isSimulatingRef.current) break;
          
          const prompt = `
${persona.prompt}

You are participating in a focus group about a new product.
Product Name: ${activeProduct.name}
Category: ${activeProduct.category}
Description: ${activeProduct.description}

Conversation so far:
${currentTranscript || '(No one has spoken yet. You are the first to speak.)'}

Respond to the group with your thoughts on the product and what others have said. 
Keep your response strictly under 3 sentences. Do not use emojis. Act completely in character.
`;

          const response = await generateWithRetry(prompt, {
            temperature: settings.temperature,
            maxOutputTokens: 150,
          });
          
          const replyText = response.text || '*silence*';
          
          const newMsg: Message = {
            id: Date.now().toString() + Math.random(),
            senderId: persona.id,
            senderName: persona.name,
            text: replyText
          };
          
          setMessages(prev => [...prev, newMsg]);
          currentTranscript += `${persona.name}: ${replyText}\n`;
          
          // Delay to help avoid rate limits
          await new Promise(resolve => setTimeout(resolve, settings.speed));
        }
        if (!isSimulatingRef.current) break;
      }
      
      if (isSimulatingRef.current) {
        // Final Conclusion
        const conclusionPrompt = `
You are an expert market researcher analyzing a focus group.
Analyze the following transcript of a focus group discussing a product named "${activeProduct.name}".

You MUST provide a summary of the discussion AND an array of metrics evaluating EACH of the following personas: ${activePersonas.map(p => p.id).join(', ')}.
The metrics array MUST contain exactly ${activePersonas.length} objects, one for each persona.

CRITICAL: Your response MUST be strictly valid JSON. All property names MUST be double-quoted. Do NOT include trailing commas. Do NOT include any text outside of the JSON object. Ensure all strings are properly escaped and do not contain unescaped newlines.

TRANSCRIPT:
${currentTranscript}
`;
        
        const conclusionResponse = await generateWithRetry(conclusionPrompt, { 
            temperature: 0.2,
            maxOutputTokens: 4000,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { 
                  type: Type.STRING,
                  description: "A brief, 3-sentence executive summary of the group's overall reaction."
                },
                metrics: {
                  type: Type.ARRAY,
                  description: "An array of metrics for each persona.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "The persona's id (e.g., chad, penny, etc.)" },
                      sentiment: { type: Type.INTEGER, description: "Integer from -100 to 100: -100 is overwhelmingly negative, 0 is neutral, 100 is overwhelmingly positive" },
                      persuasion: { type: Type.INTEGER, description: "Integer from 0 to 100: how much their opinion shifted during the discussion. 0 = stubborn/unchanged, 100 = completely changed their mind" },
                      passion: { type: Type.INTEGER, description: "Integer from 0 to 100: how intensely they engaged with the topic. 0 = apathetic, 100 = highly passionate/emotional" }
                    },
                    required: ["id", "sentiment", "persuasion", "passion"]
                  }
                }
              },
              required: ["summary", "metrics"]
            }
          }, 'gemini-2.5-pro');
        
        try {
          let text = conclusionResponse.text;
          if (!text) {
            console.error("Empty response text. Full response:", conclusionResponse);
            throw new Error("Empty response text from AI. " + JSON.stringify(conclusionResponse));
          }
          
          // Extract JSON object if there's surrounding text
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            text = jsonMatch[0];
          } else {
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          }
          
          let result;
          try {
            result = JSON.parse(text);
          } catch (parseError: any) {
            console.warn("Standard JSON.parse failed, attempting relaxed parsing...", parseError);
            try {
              // Fallback for malformed JSON (e.g., unquoted keys, trailing commas)
              result = new Function("return " + text)();
            } catch (fallbackError) {
              throw new Error("Failed to parse JSON: " + parseError.message);
            }
          }
          
          console.log("Parsed Conclusion Result:", result);
          
          // Fallback: if the AI returned an array directly instead of { summary, metrics }
          if (Array.isArray(result)) {
            result = {
              summary: "Analysis complete.",
              metrics: result
            };
          }
          
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            senderId: 'system',
            senderName: 'SYSTEM_CONCLUSION',
            text: (result.summary || 'Analysis complete.') + '\n\n[ANALYSIS COMPLETE] -> Proceed to Visualization Tab',
            isSystem: true
          }]);
          
          if (result.metrics && Array.isArray(result.metrics) && result.metrics.length > 0) {
            setMetrics(result.metrics);
          } else {
            setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              senderId: 'system',
              senderName: 'SYSTEM_ERROR',
              text: 'CRITICAL ERROR: The AI failed to generate metrics data. Raw output: ' + text,
              isSystem: true
            }]);
          }
          
          // Simulation is complete
          isSimulatingRef.current = false;
          setIsSimulating(false);
        } catch (e: any) {
          console.error("Failed to parse conclusion JSON", e);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            senderId: 'system',
            senderName: 'SYSTEM_ERROR',
            text: `CRITICAL ERROR: ${e.message || 'Unknown error'}. Simulation aborted.`,
            isSystem: true
          }]);
          
          // Simulation is complete even on error
          isSimulatingRef.current = false;
          setIsSimulating(false);
        }
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        senderId: 'system',
        senderName: 'ERROR',
        text: 'Simulation failed due to an API error.',
        isSystem: true
      }]);
    } finally {
      isSimulatingRef.current = false;
      setIsSimulating(false);
    }
  };

  const stopSimulation = () => {
    isSimulatingRef.current = false;
    setIsSimulating(false);
  };

  const renderSimulationTab = () => (
    <>
      {/* Left Sidebar: Controls & Personas */}
      <div className="w-72 border-r border-[#44475a] flex flex-col bg-[#282a36]">
        <div className="p-4 border-b border-[#44475a] flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[#bd93f9] uppercase tracking-wider">Active Product</label>
            <select 
              className="bg-[#44475a] border-none p-2 text-[#f8f8f2] focus:outline-none focus:ring-1 focus:ring-[#ff79c6] rounded-sm text-sm"
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              disabled={isSimulating}
            >
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="pt-2">
            {!isSimulating ? (
              <button 
                onClick={startSimulation}
                className="w-full bg-[#50fa7b] text-[#282a36] hover:bg-[#50fa7b]/80 p-2 font-bold flex items-center justify-center gap-2 transition-colors rounded-sm"
              >
                <Play className="w-4 h-4" />
                START SIM
              </button>
            ) : (
              <button 
                onClick={stopSimulation}
                className="w-full bg-[#ff5555] text-[#f8f8f2] hover:bg-[#ff5555]/80 p-2 font-bold flex items-center justify-center gap-2 transition-colors rounded-sm"
              >
                <Square className="w-4 h-4" />
                HALT SIM
              </button>
            )}
          </div>
        </div>
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          <h3 className="text-xs text-[#bd93f9] uppercase tracking-wider mb-3">Active Nodes</h3>
          <div className="flex flex-col gap-2">
            {personas.filter(p => p.active).map(p => (
              <div key={p.id} className="flex items-center gap-3 text-sm">
                <span className="text-[#50fa7b]">✓</span>
                <span className={`truncate ${p.color}`}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Right Panel: Chat / Terminal */}
      <div className="flex-1 flex flex-col bg-[#282a36] relative overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={terminalRef}>
          {messages.length === 0 && !isSimulating && (
            <div className="h-full flex items-center justify-center text-[#6272a4]">
              [ WAITING FOR INPUT ]
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.isSystem ? 'opacity-90' : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-bold ${msg.isSystem ? 'text-[#ff79c6]' : getPersonaColor(msg.senderId)}`}>
                  {msg.senderName}
                </span>
                <span className="text-[10px] text-[#6272a4]">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>
              <div className={`p-3 rounded-sm ${msg.isSystem ? 'bg-[#bd93f9]/10 text-[#bd93f9] border border-[#bd93f9]/30 whitespace-pre-wrap' : 'bg-[#44475a] text-[#f8f8f2]'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isSimulating && (
            <div className="flex items-center gap-2 text-sm text-[#8be9fd] mt-4">
              <span className="animate-pulse">█</span>
              Processing node response...
            </div>
          )}
        </div>
      </div>
    </>
  );

  const renderProductsTab = () => (
    <>
      <div className="w-72 border-r border-[#44475a] flex flex-col bg-[#282a36] p-4 gap-4">
        <h3 className="text-xs text-[#bd93f9] uppercase tracking-wider">Saved Products</h3>
        <div className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
          {products.map(p => (
            <div 
              key={p.id} 
              onClick={() => setSelectedProductId(p.id)}
              className={`p-2 cursor-pointer rounded-sm text-sm border ${selectedProductId === p.id ? 'border-[#ff79c6] bg-[#ff79c6]/10 text-[#ff79c6]' : 'border-transparent text-[#f8f8f2] hover:bg-[#44475a]'}`}
            >
              {p.name}
            </div>
          ))}
        </div>
        <button 
          onClick={() => {
            const newId = 'p' + Date.now();
            setProducts([...products, { id: newId, name: 'New Product', category: '', description: '' }]);
            setSelectedProductId(newId);
          }}
          className="w-full bg-[#44475a] text-[#f8f8f2] hover:bg-[#6272a4] p-2 text-sm font-bold transition-colors rounded-sm"
        >
          + ADD NEW
        </button>
      </div>
      <div className="flex-1 p-6 bg-[#282a36] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {products.find(p => p.id === selectedProductId) && (() => {
          const p = products.find(p => p.id === selectedProductId)!;
          const updateProduct = (updates: Partial<Product>) => {
            setProducts(products.map(prod => prod.id === p.id ? { ...prod, ...updates } : prod));
          };
          return (
            <>
              <h2 className="text-xl text-[#ff79c6] font-bold border-b border-[#44475a] pb-2">Edit Product</h2>
              <div className="flex flex-col gap-4 max-w-2xl">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#bd93f9] uppercase tracking-wider">Name</label>
                  <input 
                    type="text" 
                    className="bg-[#44475a] border-none p-3 text-[#f8f8f2] focus:outline-none focus:ring-1 focus:ring-[#ff79c6] rounded-sm"
                    value={p.name}
                    onChange={e => updateProduct({ name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#bd93f9] uppercase tracking-wider">Category</label>
                  <input 
                    type="text" 
                    className="bg-[#44475a] border-none p-3 text-[#f8f8f2] focus:outline-none focus:ring-1 focus:ring-[#ff79c6] rounded-sm"
                    value={p.category}
                    onChange={e => updateProduct({ category: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#bd93f9] uppercase tracking-wider">Description</label>
                  <textarea 
                    className="bg-[#44475a] border-none p-3 text-[#f8f8f2] focus:outline-none focus:ring-1 focus:ring-[#ff79c6] resize-none min-h-[200px] rounded-sm custom-scrollbar"
                    value={p.description}
                    onChange={e => updateProduct({ description: e.target.value })}
                  />
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </>
  );

  const renderPersonasTab = () => {
    const selectedPersona = personas.find(p => p.id === selectedVisPersona) || personas[0];
    return (
      <>
        <div className="w-72 border-r border-[#44475a] flex flex-col bg-[#282a36] p-4 gap-4">
          <h3 className="text-xs text-[#bd93f9] uppercase tracking-wider">Available Nodes</h3>
          <div className="flex flex-col gap-2 flex-1 overflow-y-auto custom-scrollbar">
            {personas.map(p => (
              <div 
                key={p.id} 
                className={`flex items-center gap-2 p-2 cursor-pointer rounded-sm text-sm border ${selectedPersona.id === p.id ? 'border-[#8be9fd] bg-[#8be9fd]/10' : 'border-transparent hover:bg-[#44475a]'}`}
                onClick={() => setSelectedVisPersona(p.id)}
              >
                <input 
                  type="checkbox" 
                  checked={p.active} 
                  onChange={(e) => {
                    e.stopPropagation();
                    setPersonas(personas.map(per => per.id === p.id ? { ...per, active: e.target.checked } : per));
                  }}
                  className="accent-[#50fa7b]"
                />
                <span className={`truncate ${p.color}`}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 p-6 bg-[#282a36] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          {selectedPersona && (() => {
            const updatePersona = (updates: Partial<PersonaState>) => {
              setPersonas(personas.map(per => per.id === selectedPersona.id ? { ...per, ...updates } : per));
            };
            return (
              <>
                <h2 className="text-xl text-[#8be9fd] font-bold border-b border-[#44475a] pb-2 flex items-center gap-3">
                  <selectedPersona.icon className={`w-6 h-6 ${selectedPersona.color}`} />
                  Edit Node: {selectedPersona.name}
                </h2>
                <div className="flex flex-col gap-4 max-w-2xl">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#bd93f9] uppercase tracking-wider">Name</label>
                    <input 
                      type="text" 
                      className="bg-[#44475a] border-none p-3 text-[#f8f8f2] focus:outline-none focus:ring-1 focus:ring-[#8be9fd] rounded-sm"
                      value={selectedPersona.name}
                      onChange={e => updatePersona({ name: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-[#bd93f9] uppercase tracking-wider">System Prompt</label>
                    <textarea 
                      className="bg-[#44475a] border-none p-3 text-[#f8f8f2] focus:outline-none focus:ring-1 focus:ring-[#8be9fd] resize-none min-h-[300px] rounded-sm custom-scrollbar"
                      value={selectedPersona.prompt}
                      onChange={e => updatePersona({ prompt: e.target.value })}
                    />
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </>
    );
  };

  const renderVisualizationTab = () => {
    if (metrics.length === 0) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-[#6272a4] gap-4">
          <div className="text-4xl">📊</div>
          <div>[ AWAITING SIMULATION DATA ]</div>
        </div>
      );
    }

    const selectedMetric = selectedVisPersona ? metrics.find(m => m.id.toLowerCase() === selectedVisPersona.toLowerCase()) : null;
    const selectedPersonaData = selectedVisPersona ? personas.find(p => p.id === selectedVisPersona) : null;
    const personaMessages = selectedVisPersona ? messages.filter(m => m.senderId === selectedVisPersona) : [];

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Half: Graph */}
        <div className="flex-1 border-b border-[#44475a] relative flex flex-col bg-[#282a36] overflow-hidden p-8">
          <div className="flex justify-between items-center mb-4 z-10">
            <h3 className="text-sm font-bold text-[#bd93f9] tracking-widest">MULTI-DIMENSIONAL ANALYSIS</h3>
            <div className="flex bg-[#44475a] rounded-sm overflow-hidden">
              <button 
                className={`px-3 py-1 text-xs font-bold flex items-center gap-2 ${visMode === 'analytical' ? 'bg-[#bd93f9] text-[#282a36]' : 'text-[#f8f8f2] hover:bg-[#6272a4]'}`}
                onClick={() => setVisMode('analytical')}
              >
                <LayoutGrid className="w-3 h-3" /> ANALYTICAL
              </button>
              <button 
                className={`px-3 py-1 text-xs font-bold flex items-center gap-2 ${visMode === 'cinematic' ? 'bg-[#bd93f9] text-[#282a36]' : 'text-[#f8f8f2] hover:bg-[#6272a4]'}`}
                onClick={() => setVisMode('cinematic')}
              >
                <Box className="w-3 h-3" /> CINEMATIC
              </button>
            </div>
          </div>

          {visMode === 'cinematic' ? (
            <div className="flex-1 relative flex items-center justify-center">
              {/* Camera Controls */}
              <div className="absolute top-4 right-4 flex bg-[#44475a] rounded-sm overflow-hidden z-20">
                {['iso', 'top', 'front', 'side'].map(view => (
                  <button 
                    key={view}
                    className={`px-2 py-1 text-[10px] font-bold uppercase ${cameraView === view ? 'bg-[#bd93f9] text-[#282a36]' : 'text-[#f8f8f2] hover:bg-[#6272a4]'}`}
                    onClick={() => setCameraView(view as any)}
                  >
                    {view}
                  </button>
                ))}
              </div>

              <div className="relative w-full max-w-lg aspect-square perspective-1200 flex items-center justify-center">
                {/* The 3D Plane */}
                <div 
                  className="relative w-3/4 h-3/4 preserve-3d border border-[#bd93f9]/30 bg-[#bd93f9]/5 transition-transform duration-1000"
                  style={{ 
                    transform: cameraView === 'iso' ? 'rotateX(60deg) rotateZ(-45deg)' :
                               cameraView === 'top' ? 'rotateX(0deg) rotateZ(0deg)' :
                               cameraView === 'front' ? 'rotateX(90deg) rotateZ(0deg)' :
                               'rotateX(90deg) rotateZ(-90deg)'
                  }}
                >
                  {/* Grid lines */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#bd93f91a_1px,transparent_1px),linear-gradient(to_bottom,#bd93f91a_1px,transparent_1px)] bg-[size:20%_20%] overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[20%] bg-gradient-to-b from-transparent via-[#bd93f9]/20 to-transparent animate-scanline pointer-events-none" />
                  </div>

                  {/* Axis Labels on the plane */}
                  <div className="absolute -bottom-8 left-0 w-full flex justify-between text-[10px] text-[#bd93f9] font-bold tracking-widest">
                    <span>-100</span>
                    <span>SENTIMENT (X)</span>
                    <span>100</span>
                  </div>
                  <div className="absolute top-0 -left-8 h-full flex flex-col justify-between items-center text-[10px] text-[#bd93f9] font-bold tracking-widest">
                    <span>100</span>
                    <span className="-rotate-90 whitespace-nowrap">PERSUASION (Y)</span>
                    <span>0</span>
                  </div>

                  {/* Z-Axis Line (Passion) */}
                  <div className="absolute left-0 bottom-0 w-[2px] h-[150px] bg-[#bd93f9]/50 origin-bottom rotate-x-[-90deg]">
                    <div className="absolute -top-6 left-2 text-[10px] text-[#bd93f9] font-bold tracking-widest whitespace-nowrap">PASSION (Z)</div>
                  </div>

                  {/* Data Points */}
                  {metrics.map(m => {
                    const p = personas.find(p => p.id.toLowerCase() === m.id.toLowerCase());
                    if (!p) return null;
                    
                    const x = ((Math.max(-100, Math.min(100, m.sentiment)) + 100) / 200) * 100;
                    const y = Math.max(0, Math.min(100, m.persuasion));
                    const zHeight = (Math.max(0, Math.min(100, m.passion)) / 100) * 150;
                    
                    const isSelected = selectedVisPersona === p.id;
                    const isDimmed = selectedVisPersona && !isSelected;
                    
                    const billboardTransform = 
                      cameraView === 'iso' ? 'rotateZ(45deg) rotateX(-60deg)' :
                      cameraView === 'top' ? 'rotateZ(0deg) rotateX(0deg)' :
                      cameraView === 'front' ? 'rotateZ(0deg) rotateX(-90deg)' :
                      'rotateZ(90deg) rotateX(-90deg)';
                    
                    return (
                      <div 
                        key={m.id} 
                        className={`absolute preserve-3d transition-all duration-1000 cursor-pointer group ${isDimmed ? 'opacity-20' : 'opacity-100'}`} 
                        style={{ left: `${x}%`, top: `${y}%` }}
                        onClick={() => setSelectedVisPersona(p.id)}
                      >
                        {/* Floor Projection Lines (only when selected) */}
                        {isSelected && (
                          <>
                            <div className="absolute top-0 right-0 h-[1px] bg-current opacity-30 border-dashed border-t border-current" style={{ width: `${x}%`, left: `-${x}%` }} />
                            <div className="absolute bottom-0 left-0 w-[1px] bg-current opacity-30 border-dashed border-l border-current" style={{ height: `${100-y}%` }} />
                          </>
                        )}

                        {/* Stem (Z-Axis Line) */}
                        <div 
                          className={`absolute left-0 bottom-0 w-[1px] origin-bottom rotate-x-[-90deg] ${p.color} ${isSelected ? 'opacity-100' : 'opacity-40'}`} 
                          style={{ height: `${zHeight}px`, backgroundColor: 'currentColor' }} 
                        />
                        
                        {/* Node */}
                        <div 
                          className={`absolute flex flex-col items-center ${p.color}`}
                          style={{ 
                            transform: `translateZ(${zHeight}px) ${billboardTransform} translate(-50%, -50%)`,
                          }}
                        >
                          {/* Simple Dot */}
                          <div className={`w-3 h-3 rounded-full bg-current shadow-[0_0_10px_currentColor] transition-all ${isSelected ? 'scale-0' : 'group-hover:scale-0'}`} />
                          
                          {/* Billboard Icon (shows on hover/select) */}
                          <div className={`absolute p-1.5 rounded-sm bg-[#282a36] border border-current shadow-[0_0_15px_currentColor] transition-all duration-300 ${isSelected ? 'scale-125 opacity-100' : 'scale-50 opacity-0 group-hover:scale-100 group-hover:opacity-100'}`}>
                            <p.icon className="w-4 h-4" />
                          </div>
                          
                          {/* Value Label (shows on hover/select) */}
                          <div className={`absolute top-full mt-2 text-[9px] font-bold bg-[#282a36]/80 px-1 rounded whitespace-nowrap transition-all duration-300 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            S:{m.sentiment} | P:{m.persuasion} | Z:{m.passion}
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#44475a" />
                  <XAxis type="number" dataKey="sentiment" name="Sentiment" domain={[-100, 100]} stroke="#f8f8f2" tick={{ fill: '#f8f8f2' }} label={{ value: 'Sentiment (-100 to 100)', position: 'insideBottom', offset: -10, fill: '#bd93f9' }} />
                  <YAxis type="number" dataKey="passion" name="Passion" domain={[0, 100]} stroke="#f8f8f2" tick={{ fill: '#f8f8f2' }} label={{ value: 'Passion (0 to 100)', angle: -90, position: 'insideLeft', fill: '#bd93f9' }} />
                  <ZAxis type="number" dataKey="persuasion" range={[100, 1000]} name="Persuasion" />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const p = personas.find(p => p.id.toLowerCase() === data.id.toLowerCase());
                        if (!p) return null;
                        return (
                          <div className="bg-[#282a36] border border-[#bd93f9] p-3 rounded-sm shadow-lg">
                            <div className={`font-bold flex items-center gap-2 mb-2 ${p.color}`}>
                              <p.icon className="w-4 h-4" /> {p.name}
                            </div>
                            <div className="text-xs text-[#f8f8f2]">Sentiment: {data.sentiment}</div>
                            <div className="text-xs text-[#f8f8f2]">Passion: {data.passion}</div>
                            <div className="text-xs text-[#f8f8f2]">Persuasion: {data.persuasion}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine x={0} stroke="#6272a4" />
                  <ReferenceLine y={50} stroke="#6272a4" />
                  <Scatter name="Personas" data={metrics} onClick={(data) => setSelectedVisPersona(data.id)}>
                    {metrics.map((entry, index) => {
                      const p = personas.find(p => p.id.toLowerCase() === entry.id.toLowerCase());
                      const isSelected = selectedVisPersona === entry.id;
                      // Convert tailwind text color class to hex for recharts
                      let fill = '#f8f8f2';
                      if (p?.color.includes('cyan')) fill = '#8be9fd';
                      else if (p?.color.includes('pink')) fill = '#ff79c6';
                      else if (p?.color.includes('yellow')) fill = '#f1fa8c';
                      else if (p?.color.includes('green')) fill = '#50fa7b';
                      else if (p?.color.includes('purple')) fill = '#bd93f9';
                      
                      return <Cell key={`cell-${index}`} fill={fill} stroke={isSelected ? '#fff' : fill} strokeWidth={isSelected ? 2 : 1} style={{ cursor: 'pointer', opacity: selectedVisPersona && !isSelected ? 0.3 : 1 }} />;
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Bottom Half: Node Breakdown */}
        <div className="h-64 bg-[#282a36] flex">
          {selectedMetric && selectedPersonaData ? (
            <>
              <div className="w-1/3 border-r border-[#44475a] p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <selectedPersonaData.icon className={`w-8 h-8 ${selectedPersonaData.color}`} />
                  <h2 className={`text-xl font-bold ${selectedPersonaData.color}`}>{selectedPersonaData.name}</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div className="bg-[#44475a] p-3 rounded-sm">
                    <div className="text-[10px] text-[#bd93f9] uppercase">Sentiment</div>
                    <div className="text-xl font-bold text-[#f8f8f2]">{selectedMetric.sentiment}</div>
                  </div>
                  <div className="bg-[#44475a] p-3 rounded-sm">
                    <div className="text-[10px] text-[#bd93f9] uppercase">Persuasion</div>
                    <div className="text-xl font-bold text-[#f8f8f2]">{selectedMetric.persuasion}</div>
                  </div>
                  <div className="bg-[#44475a] p-3 rounded-sm col-span-2">
                    <div className="text-[10px] text-[#bd93f9] uppercase">Passion</div>
                    <div className="text-xl font-bold text-[#f8f8f2]">{selectedMetric.passion}</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 p-6 flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                <h3 className="text-xs text-[#bd93f9] uppercase tracking-wider mb-2">Transcript Filter</h3>
                {personaMessages.length > 0 ? personaMessages.map(msg => (
                  <div key={msg.id} className="bg-[#44475a] p-3 rounded-sm text-sm text-[#f8f8f2]">
                    "{msg.text}"
                  </div>
                )) : (
                  <div className="text-[#6272a4] text-sm italic">No messages recorded for this node.</div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[#6272a4]">
              Select a node in the graph to view breakdown.
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSettingsTab = () => (
    <div className="flex-1 p-6 bg-[#282a36] flex flex-col gap-6 overflow-y-auto custom-scrollbar">
      <h2 className="text-xl text-[#50fa7b] font-bold border-b border-[#44475a] pb-2">Simulation Settings</h2>
      <div className="flex flex-col gap-6 max-w-xl">
        <div className="flex flex-col gap-2">
          <label className="text-xs text-[#bd93f9] uppercase tracking-wider flex justify-between">
            <span>Simulation Speed (Delay)</span>
            <span className="text-[#f8f8f2]">{settings.speed / 1000}s</span>
          </label>
          <input 
            type="range" 
            min="1000" max="15000" step="1000"
            className="accent-[#50fa7b]"
            value={settings.speed}
            onChange={e => setSettings({...settings, speed: parseInt(e.target.value)})}
          />
          <span className="text-[10px] text-[#6272a4]">Delay between node responses to avoid API rate limits.</span>
        </div>
        
        <div className="flex flex-col gap-2">
          <label className="text-xs text-[#bd93f9] uppercase tracking-wider flex justify-between">
            <span>Creativity (Temperature)</span>
            <span className="text-[#f8f8f2]">{settings.temperature}</span>
          </label>
          <input 
            type="range" 
            min="0" max="1" step="0.1"
            className="accent-[#50fa7b]"
            value={settings.temperature}
            onChange={e => setSettings({...settings, temperature: parseFloat(e.target.value)})}
          />
          <span className="text-[10px] text-[#6272a4]">Higher values make output more random, lower values make it more focused.</span>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-[#bd93f9] uppercase tracking-wider flex justify-between">
            <span>Max Turns</span>
            <span className="text-[#f8f8f2]">{settings.maxTurns}</span>
          </label>
          <input 
            type="range" 
            min="1" max="5" step="1"
            className="accent-[#50fa7b]"
            value={settings.maxTurns}
            onChange={e => setSettings({...settings, maxTurns: parseInt(e.target.value)})}
          />
          <span className="text-[10px] text-[#6272a4]">Number of times each node speaks before the simulation concludes.</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-full bg-[#1e1e2e] p-4 md:p-8 font-mono text-[#f8f8f2] flex flex-col overflow-hidden">
      {/* TUI Container */}
      <div className="flex-1 border border-[#44475a] bg-[#282a36] flex flex-col rounded-sm overflow-hidden shadow-2xl">
        
        {/* Top Bar / Tabs */}
        <div className="flex items-center border-b border-[#44475a] bg-[#1e1e2e] text-sm select-none">
          <div className="flex gap-2 px-4 py-2 border-r border-[#44475a]">
            <div className="w-3 h-3 rounded-full bg-[#ff5555]"></div>
            <div className="w-3 h-3 rounded-full bg-[#f1fa8c]"></div>
            <div className="w-3 h-3 rounded-full bg-[#50fa7b]"></div>
          </div>
          {(['simulation', 'products', 'personas', 'visualization', 'settings'] as Tab[]).map(tab => (
            <div 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 border-r border-[#44475a] cursor-pointer capitalize ${activeTab === tab ? 'text-[#ff79c6] bg-[#282a36]' : 'text-[#6272a4] hover:text-[#f8f8f2]'}`}
            >
              {tab}
            </div>
          ))}
          <div className="px-4 py-2 text-[#6272a4] flex-1 text-right">&gt; ./society-sim-os</div>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 flex overflow-hidden">
          {activeTab === 'simulation' && renderSimulationTab()}
          {activeTab === 'products' && renderProductsTab()}
          {activeTab === 'personas' && renderPersonasTab()}
          {activeTab === 'visualization' && renderVisualizationTab()}
          {activeTab === 'settings' && renderSettingsTab()}
        </div>

        {/* TUI Status Bar */}
        <div className="flex text-xs font-bold border-t border-[#44475a] bg-[#1e1e2e]">
          <div className={`px-4 py-1 ${isSimulating ? 'bg-[#ff5555] text-[#f8f8f2]' : 'bg-[#ff79c6] text-[#282a36]'}`}>
            {isSimulating ? 'SIMULATING' : 'STATUS'}
          </div>
          <div className="px-4 py-1 bg-[#44475a] text-[#f8f8f2] flex-1 truncate font-normal">
            {isSimulating ? 'Processing nodes...' : 'Ready'}
          </div>
          <div className="px-4 py-1 bg-[#bd93f9] text-[#282a36]">
            UTF-8
          </div>
          <div className="px-4 py-1 bg-[#8be9fd] text-[#282a36] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#282a36]"></span>
            Gemini 3.1
          </div>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bot, User, Send, Loader2, ChevronDown, Zap, Globe, Cpu, Sparkles } from 'lucide-react'

export const Route = createFileRoute('/chat')({
  component: ChatRoute,
})

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

type ModelInfo = {
  id: string;
  name: string;
}

type ProviderInfo = {
  name: string;
  available: boolean;
  requires_api_key: boolean;
  models: ModelInfo[];
}

type ProvidersResponse = {
  providers: Record<string, ProviderInfo>;
  active_provider: string;
  active_model: string;
}

const PROVIDER_META: Record<string, { icon: typeof Zap; label: string; color: string; badge: string }> = {
  ollama: { icon: Cpu, label: 'Ollama (Local)', color: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  groq: { icon: Zap, label: 'Groq', color: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  gemini: { icon: Sparkles, label: 'Gemini', color: 'text-blue-400', badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  openrouter: { icon: Globe, label: 'OpenRouter', color: 'text-purple-400', badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
}

function ChatRoute() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Provider state
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({})
  const [activeProvider, setActiveProvider] = useState("ollama")
  const [activeModel, setActiveModel] = useState("")
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [switchingProvider, setSwitchingProvider] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch providers on mount
  useEffect(() => {
    fetchProviders()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowProviderMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchProviders = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/providers')
      const data: ProvidersResponse = await res.json()
      setProviders(data.providers)
      setActiveProvider(data.active_provider)
      setActiveModel(data.active_model)

      // If active provider is unavailable, auto-switch to first available one
      const activeInfo = data.providers[data.active_provider]
      if (!activeInfo || !activeInfo.available) {
        const firstAvailable = Object.entries(data.providers).find(([, info]) => info.available)
        if (firstAvailable) {
          const [provName, provInfo] = firstAvailable
          const firstModel = provInfo.models[0]?.id || ''
          await switchProvider(provName, firstModel)
        }
      }
    } catch (err) {
      console.error("Failed to fetch providers:", err)
    }
  }

  const switchProvider = async (providerName: string, modelId: string) => {
    setSwitchingProvider(true)
    try {
      const res = await fetch('http://localhost:8000/api/set-model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerName, model_name: modelId }),
      })
      const data = await res.json()
      if (data.status === 'success') {
        setActiveProvider(data.provider)
        setActiveModel(data.model)
      }
    } catch (err) {
      console.error("Failed to switch provider:", err)
    } finally {
      setSwitchingProvider(false)
      setShowProviderMenu(false)
    }
  }

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input }
    setMessages(prev => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    const botId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: botId, role: 'assistant', content: "" }])

    try {
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content })
      })

      if (!response.body) throw new Error("No body")
      
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value)
        setMessages(prev => prev.map(msg => 
          msg.id === botId ? { ...msg, content: msg.content + chunk } : msg
        ))
      }
    } catch (error) {
      console.error(error)
      setMessages(prev => prev.map(msg => 
        msg.id === botId ? { ...msg, content: "Sorry, I encountered an error connecting to the AI provider. Check the backend logs for details." } : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }

  const activeMeta = PROVIDER_META[activeProvider] || PROVIDER_META.ollama
  const ActiveIcon = activeMeta.icon

  // Find the display name for the active model
  const activeModelName = (() => {
    const prov = providers[activeProvider]
    if (!prov) return activeModel
    const found = prov.models.find(m => m.id === activeModel)
    return found ? found.name : activeModel
  })()

  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
      <Card className="w-full max-w-4xl h-full flex flex-col shadow-lg border-primary/10">
        <CardHeader className="border-b bg-card">
          <CardTitle className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" /> RAG Assistant
            </div>

            {/* Provider Selector */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowProviderMenu(!showProviderMenu)}
                disabled={switchingProvider}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all hover:bg-accent/50 ${activeMeta.badge}`}
              >
                <ActiveIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{activeMeta.label}</span>
                <span className="hidden md:inline text-xs opacity-70">· {activeModelName}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showProviderMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {showProviderMenu && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-3 border-b bg-muted/30">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Switch AI Provider</p>
                  </div>
                  <div className="p-2 max-h-96 overflow-y-auto">
                    {Object.entries(providers).map(([name, info]) => {
                      const meta = PROVIDER_META[name] || PROVIDER_META.ollama
                      const Icon = meta.icon
                      const isActive = name === activeProvider

                      if (!info.available) {
                        return (
                          <div key={name} className="px-3 py-2.5 rounded-lg opacity-50 cursor-not-allowed">
                            <div className="flex items-center gap-2.5">
                              <Icon className={`w-4 h-4 ${meta.color}`} />
                              <span className="text-sm font-medium">{meta.label}</span>
                              <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                {info.requires_api_key ? 'No API Key' : 'Offline'}
                              </span>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={name} className="mb-1">
                          <div className={`px-3 pt-2.5 pb-1 flex items-center gap-2.5 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                            <span className="text-sm font-semibold">{meta.label}</span>
                            {name === 'groq' && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded-full">⚡ Fastest</span>}
                            {isActive && <span className="ml-auto text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">Active</span>}
                          </div>
                          <div className="pl-4 pr-2 pb-1.5">
                            {info.models.map(model => (
                              <button
                                key={model.id}
                                onClick={() => switchProvider(name, model.id)}
                                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                                  isActive && activeModel === model.id
                                    ? 'bg-primary/10 text-primary font-medium'
                                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                                }`}
                              >
                                {model.name}
                                {isActive && activeModel === model.id && (
                                  <span className="ml-2 text-[10px] opacity-60">✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="p-2 border-t bg-muted/20">
                    <p className="text-[11px] text-muted-foreground text-center">
                      ☁️ Groq, Gemini, OpenRouter are free — no credit card needed
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-6">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground pt-12">
                  <Bot className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>Ask a question about the indexed papers.</p>
                  <p className="text-xs mt-2 opacity-60">
                    Powered by <span className={activeMeta.color}>{activeMeta.label}</span> · {activeModelName}
                  </p>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div className={`px-4 py-3 rounded-2xl max-w-[80%] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                    {msg.content}
                    {isLoading && msg.role === 'assistant' && msg.content === "" && (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t bg-card">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
              <Input 
                value={input} 
                onChange={e => setInput(e.target.value)} 
                placeholder="Ask about methodology, findings, limitations..." 
                className="flex-1"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

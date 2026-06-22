import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Bot, User, Send, Loader2, ChevronDown, Zap, Globe, Cpu, Sparkles, Upload, 
  Trash2, Search, FileText, Check, Plus, HelpCircle, BookOpen 
} from 'lucide-react'

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
  const [activeProvider, setActiveProvider] = useState("gemini")
  const [activeModel, setActiveModel] = useState("")
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [switchingProvider, setSwitchingProvider] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Paper selection & upload state
  const [papers, setPapers] = useState<Array<{ id: string; filename: string; title?: string; authors?: string[] }>>([])
  const [selectedPaperId, setSelectedPaperId] = useState<string>("all")
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch providers and papers on mount
  useEffect(() => {
    fetchProviders()
    fetchPapers()
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

  const fetchPapers = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:8000/api/papers`)
      const data = await res.json()
      setPapers(data.papers || [])
    } catch (err) {
      console.error("Failed to fetch papers:", err)
    }
  }

  const uploadPaperFile = async (file: File) => {
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`http://${window.location.hostname}:8000/api/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.id) {
        await fetchPapers()
        setSelectedPaperId(data.id)
        
        const systemMsg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `📥 Paper "${data.filename}" successfully uploaded and indexed. You are now chatting specifically based on this paper!`,
        }
        setMessages(prev => [...prev, systemMsg])
      } else {
        alert(data.detail || 'Upload failed.')
      }
    } catch (err) {
      console.error(err)
      alert('Upload failed due to connection error.')
    } finally {
      setUploading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadPaperFile(file)
    e.target.value = ''
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type === "application/pdf") {
        await uploadPaperFile(file)
      } else {
        alert("Please upload a PDF file.")
      }
    }
  }

  const handleDeletePaper = async (paperId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm("Are you sure you want to delete this paper? This will also remove it from the RAG search index.")) return

    try {
      const res = await fetch(`http://${window.location.hostname}:8000/api/papers/${paperId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.status === 'deleted') {
        if (selectedPaperId === paperId) {
          setSelectedPaperId("all")
        }
        await fetchPapers()
      } else {
        alert("Failed to delete paper.")
      }
    } catch (err) {
      console.error(err)
      alert("Delete failed due to connection error.")
    }
  }

  const fetchProviders = async () => {
    try {
      const res = await fetch(`http://${window.location.hostname}:8000/api/providers`)
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
      const res = await fetch(`http://${window.location.hostname}:8000/api/set-model-config`, {
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

  const submitMessage = async (messageText: string) => {
    if (!messageText.trim()) return

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: messageText }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    const botId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, { id: botId, role: 'assistant', content: "" }])

    try {
      const response = await fetch(`http://${window.location.hostname}:8000/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage.content,
          paper_id: selectedPaperId === "all" ? null : selectedPaperId
        })
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

  const handleSend = async () => {
    const text = input
    setInput("")
    await submitMessage(text)
  }

  const handleSuggestedQuestionClick = (question: string) => {
    submitMessage(question)
  }

  const activeMeta = PROVIDER_META[activeProvider] || PROVIDER_META.gemini
  const ActiveIcon = activeMeta.icon

  const activeModelName = (() => {
    const prov = providers[activeProvider]
    if (!prov) return activeModel
    const found = prov.models.find(m => m.id === activeModel)
    return found ? found.name : activeModel
  })()

  const selectedPaper = papers.find(p => p.id === selectedPaperId)

  return (
    <div className="flex h-[calc(100vh-8rem)] items-center justify-center w-full max-w-6xl mx-auto px-2 sm:px-4">
      <div className="flex flex-col md:flex-row gap-6 w-full h-full items-stretch">
        
        {/* Left Sidebar Pane: Context Library */}
        <Card className="w-full md:w-80 shrink-0 flex flex-col shadow-lg border-primary/10 overflow-hidden bg-card/60 backdrop-blur-md">
          {/* Header */}
          <CardHeader className="border-b bg-card/80 py-4 flex flex-row items-center justify-between shrink-0">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <span>Library Context</span>
            </CardTitle>
            <span className="text-xs bg-primary/15 text-primary px-2.5 py-0.5 rounded-full font-bold border border-primary/25">
              {papers.length}
            </span>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col p-4 overflow-hidden gap-4">
            {/* Drag & Drop Upload Zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative ${
                dragActive 
                  ? 'border-primary bg-primary/5 scale-[0.98]' 
                  : 'border-muted hover:border-primary/50 hover:bg-accent/20'
              }`}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="chat-pdf-upload"
                disabled={uploading}
              />
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                  <p className="text-xs font-semibold text-foreground">Uploading & indexing...</p>
                  <p className="text-[10px] text-muted-foreground mt-1 px-2">Extracting text & rebuilding FAISS index</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mb-2 group-hover:text-primary transition-colors" />
                  <p className="text-xs font-semibold text-foreground">Drag & drop PDF here</p>
                  <p className="text-[10px] text-muted-foreground mt-1">or click to browse from device</p>
                </>
              )}
            </div>

            {/* Search filter for papers */}
            {papers.length > 0 && (
              <div className="relative shrink-0">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-2.5" />
                <Input
                  placeholder="Filter papers..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-8 text-xs bg-muted/40 border-primary/5 focus-visible:ring-1"
                />
              </div>
            )}

            {/* List of Papers */}
            <ScrollArea className="flex-1 -mx-2 px-2">
              <div className="space-y-1.5 pb-2">
                {/* All Papers (Global option) */}
                <button
                  onClick={() => setSelectedPaperId("all")}
                  className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between transition-all border ${
                    selectedPaperId === "all"
                      ? 'bg-primary text-primary-foreground font-medium shadow-md shadow-primary/20 border-primary'
                      : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-4 h-4 shrink-0" />
                    <span className="text-xs truncate">🌐 All Papers (Global Search)</span>
                  </div>
                  {selectedPaperId === "all" && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>

                {/* Filtered list of papers */}
                {papers
                  .filter(p => {
                    const title = p.title || p.filename || ""
                    return title.toLowerCase().includes(searchQuery.toLowerCase())
                  })
                  .map(p => {
                    const isSelected = selectedPaperId === p.id
                    const displayTitle = p.title || p.filename
                    
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPaperId(p.id)}
                        className={`group w-full p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-card border-primary/50 text-foreground font-medium shadow-sm shadow-primary/5'
                            : 'bg-card/30 hover:bg-muted/40 border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground/60'}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs truncate font-medium text-foreground">{displayTitle}</p>
                            {p.authors && p.authors.length > 0 && (
                              <p className="text-[10px] text-muted-foreground truncate">{p.authors.join(", ")}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                          <button
                            onClick={(e) => handleDeletePaper(p.id, e)}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                            title="Delete paper"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                
                {papers.length > 0 && papers.filter(p => (p.title || p.filename || "").toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-4">No matching papers</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Pane: Main Chat Area */}
        <Card className="flex-1 flex flex-col shadow-lg border-primary/10 overflow-hidden h-full bg-card/60 backdrop-blur-md">
          {/* Header */}
          <CardHeader className="border-b bg-card/80 py-3 shrink-0">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <CardTitle className="text-sm font-bold truncate">
                    {selectedPaperId === "all" ? (
                      "Global Research Assistant"
                    ) : (
                      `Paper Q&A: ${selectedPaper?.title || selectedPaper?.filename || "Loading paper..."}`
                    )}
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {selectedPaperId === "all" ? (
                      "Searching context across all papers in library"
                    ) : (
                      "Q&A restricted strictly to the contents of the selected paper"
                    )}
                  </p>
                </div>
              </div>

              {/* Provider Selector */}
              <div className="relative shrink-0" ref={menuRef}>
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
                        const meta = PROVIDER_META[name] || PROVIDER_META.gemini
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
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 p-4 sm:p-6">
              <div className="space-y-6">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center min-h-[350px] text-center px-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-6 border border-primary/10 shadow-inner">
                      <Bot className="w-8 h-8 text-primary animate-pulse" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Welcome to Q&A Workspace</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-2">
                      {selectedPaperId === "all" 
                        ? "Ask questions based on your entire collection of research papers."
                        : `Ask questions about "${selectedPaper?.title || selectedPaper?.filename || "this paper"}"`
                      }
                    </p>
                    
                    {/* Suggested questions list */}
                    <div className="mt-8 w-full max-w-lg">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center justify-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-primary" /> Suggested Questions
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {(selectedPaperId === "all" 
                          ? [
                              "Summarize the main methodology across these papers.",
                              "What are the major open problems or research gaps?",
                              "Compare the evaluation metrics and datasets used.",
                              "Give me a consolidated list of key findings."
                            ]
                          : [
                              "What is the main methodology proposed in this paper?",
                              "Summarize the key contributions and findings.",
                              "What are the limitations or future work mentioned?",
                              "What experiments were conducted and what datasets were used?"
                            ]
                        ).map((question, i) => (
                          <button
                            key={i}
                            onClick={() => handleSuggestedQuestionClick(question)}
                            className="text-left text-xs bg-muted/40 hover:bg-primary/5 border hover:border-primary/20 text-foreground p-3 rounded-xl transition-all flex items-center justify-between group"
                          >
                            <span className="truncate pr-4">{question}</span>
                            <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                    )}
                    <div className={`px-4 py-3 rounded-2xl max-w-[80%] whitespace-pre-wrap ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                        : 'bg-muted rounded-tl-sm'
                    }`}>
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
            
            <div className="p-4 border-t bg-card/80 shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                <Input 
                  value={input} 
                  onChange={e => setInput(e.target.value)} 
                  placeholder={
                    selectedPaperId === "all"
                      ? "Ask about methodology, findings, limitations..." 
                      : `Ask about "${selectedPaper?.title || selectedPaper?.filename}"...`
                  }
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
    </div>
  )
}

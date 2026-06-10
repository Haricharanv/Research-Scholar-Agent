import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Upload, FileText, Loader2, Zap, Globe, Cpu, Sparkles, Check, AlertCircle, CircleDot } from 'lucide-react'

export const Route = createFileRoute('/dashboard')({
  component: Dashboard,
})

type ModelInfo = { id: string; name: string }
type ProviderInfo = { name: string; available: boolean; requires_api_key: boolean; models: ModelInfo[] }
type ProvidersResponse = { providers: Record<string, ProviderInfo>; active_provider: string; active_model: string }

const PROVIDER_META: Record<string, { icon: typeof Zap; label: string; color: string; desc: string }> = {
  groq:       { icon: Zap,      label: 'Groq',            color: 'text-amber-400',   desc: 'Ultra-fast inference (free)' },
  gemini:     { icon: Sparkles, label: 'Google Gemini',    color: 'text-blue-400',    desc: 'Multimodal AI (free tier)' },
  openrouter: { icon: Globe,    label: 'OpenRouter',       color: 'text-purple-400',  desc: 'Multi-model gateway (free models)' },
  ollama:     { icon: Cpu,      label: 'Ollama (Local)',   color: 'text-emerald-400', desc: 'Runs on your machine' },
}

function Dashboard() {
  const queryClient = useQueryClient()
  const [activeProvider, setActiveProvider] = useState("")
  const [activeModel, setActiveModel] = useState("")

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8000/api/health')
      return res.json()
    }
  })

  const { data: papersData } = useQuery({
    queryKey: ['papers'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8000/api/papers')
      return res.json()
    }
  })

  const { data: providersData, isLoading: providersLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const res = await fetch('http://localhost:8000/api/providers')
      return res.json() as Promise<ProvidersResponse>
    }
  })

  useEffect(() => {
    if (providersData) {
      setActiveProvider(providersData.active_provider)
      setActiveModel(providersData.active_model)
    }
  }, [providersData])

  const switchMutation = useMutation({
    mutationFn: async ({ provider, model }: { provider: string; model: string }) => {
      const res = await fetch('http://localhost:8000/api/set-model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model_name: model })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.status === 'success') {
        setActiveProvider(data.provider)
        setActiveModel(data.model)
        queryClient.invalidateQueries({ queryKey: ['providers'] })
        queryClient.invalidateQueries({ queryKey: ['health'] })
      }
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('http://localhost:8000/api/upload', {
        method: 'POST',
        body: formData
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    }
  })

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
  }

  const providers = providersData?.providers || {}

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Manage your AI providers, research papers, and system status.</p>
      </div>

      {/* Provider Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" /> AI Provider Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          {providersLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading providers...
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {Object.entries(providers).map(([name, info]) => {
                const meta = PROVIDER_META[name] || PROVIDER_META.ollama
                const Icon = meta.icon
                const isActive = name === activeProvider
                const isAvailable = info.available

                return (
                  <div
                    key={name}
                    className={`rounded-xl border-2 p-4 transition-all ${
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : isAvailable
                          ? 'border-border hover:border-primary/40 cursor-pointer'
                          : 'border-border opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isActive ? 'bg-primary/15' : 'bg-muted'}`}>
                        <Icon className={`w-5 h-5 ${meta.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{meta.label}</span>
                          {isActive && (
                            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold">ACTIVE</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{meta.desc}</p>
                      </div>
                      {!isAvailable && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <AlertCircle className="w-3.5 h-3.5" />
                          {info.requires_api_key ? 'No Key' : 'Offline'}
                        </div>
                      )}
                      {isAvailable && isActive && (
                        <Check className="w-5 h-5 text-primary" />
                      )}
                    </div>

                    {isAvailable && info.models.length > 0 && (
                      <div className="space-y-1 pl-1">
                        {info.models.map(model => {
                          const isModelActive = isActive && activeModel === model.id
                          return (
                            <button
                              key={model.id}
                              onClick={() => switchMutation.mutate({ provider: name, model: model.id })}
                              disabled={switchMutation.isPending}
                              className={`w-full text-left px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-all ${
                                isModelActive
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'hover:bg-accent/60 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <CircleDot className={`w-3 h-3 ${isModelActive ? 'text-primary' : 'text-muted-foreground/40'}`} />
                              {model.name}
                              {isModelActive && switchMutation.isPending && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {switchMutation.isSuccess && (
            <p className="text-sm text-green-600 dark:text-green-400 mt-3 flex items-center gap-1.5">
              <Check className="w-4 h-4" /> Provider switched successfully.
            </p>
          )}
        </CardContent>
      </Card>

      {/* System Status */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <dl className="space-y-1">
              <dt className="text-sm text-muted-foreground">Active Provider</dt>
              <dd className="text-lg font-bold">{PROVIDER_META[activeProvider]?.label || activeProvider}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <dl className="space-y-1">
              <dt className="text-sm text-muted-foreground">Index Size</dt>
              <dd className="text-lg font-bold">{health?.index_size || 0} <span className="text-sm font-normal text-muted-foreground">chunks</span></dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <dl className="space-y-1">
              <dt className="text-sm text-muted-foreground">Papers Indexed</dt>
              <dd className="text-lg font-bold">{papersData?.papers?.length || 0}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Research Library */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Research Library</CardTitle>
          <div>
            <input 
              type="file" 
              id="file-upload" 
              className="hidden" 
              accept="application/pdf"
              onChange={handleUpload}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Button asChild disabled={uploadMutation.isPending}>
                <span>
                  {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload PDF
                </span>
              </Button>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            {papersData?.papers?.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No papers uploaded yet.
              </div>
            ) : (
              <ul className="divide-y">
                {papersData?.papers?.map((paper: any) => (
                  <li key={paper.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{paper.filename}</p>
                        <p className="text-xs text-muted-foreground">ID: {paper.id}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/papers/$paperId" params={{ paperId: paper.id }}>View & Summarize</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

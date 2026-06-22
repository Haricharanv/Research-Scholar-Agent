import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FileText, Loader2, BookOpen, Lightbulb, Copy, Check,
  AlertTriangle, HelpCircle, Compass, Beaker, Database, CheckSquare, Square,
} from 'lucide-react'

export const Route = createFileRoute('/review')({
  component: ReviewRoute,
})

type Paper = {
  id: string
  filename: string
  title?: string
  authors?: string[]
  published?: string
}

function ReviewRoute() {
  const [topic, setTopic] = useState('')
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'review' | 'gaps'>('review')
  const [reviewText, setReviewText] = useState('')
  const [gaps, setGaps] = useState<Record<string, string[]> | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ['papers'],
    queryFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/papers`)
      return res.json()
    }
  })

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/generate-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim() || 'General Research Summary',
          paper_ids: Array.from(selectedPapers),
        })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.review) setReviewText(data.review)
    }
  })

  const gapsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/gap-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim() || 'General Research Summary',
          paper_ids: Array.from(selectedPapers),
        })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.gaps) setGaps(data.gaps)
    }
  })

  const togglePaper = (id: string) => {
    setSelectedPapers(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectAll = () => {
    const allIds = (papersData?.papers || []).map((p: Paper) => p.id)
    setSelectedPapers(new Set(allIds))
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(reviewText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const papers: Paper[] = papersData?.papers || []
  const canGenerate = selectedPapers.size >= 1

  const GAP_ICONS: Record<string, typeof Lightbulb> = {
    'Unexplored Methods': Beaker,
    'Missing Datasets or Domains': Database,
    'Conflicting Findings': AlertTriangle,
    'Open Questions': HelpCircle,
    'Suggested Research Directions': Compass,
  }

  const GAP_COLORS: Record<string, string> = {
    'Unexplored Methods': 'text-purple-400 bg-purple-500/10',
    'Missing Datasets or Domains': 'text-blue-400 bg-blue-500/10',
    'Conflicting Findings': 'text-amber-400 bg-amber-500/10',
    'Open Questions': 'text-cyan-400 bg-cyan-500/10',
    'Suggested Research Directions': 'text-emerald-400 bg-emerald-500/10',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Literature Review & Gap Analysis</h1>
        <p className="text-muted-foreground">Select papers and generate a structured literature review or find research gaps.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Paper Selection */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Select Papers ({selectedPapers.size})</span>
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
                Select All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-4">
              <Input
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="Research topic (e.g. Transformer architectures)"
                className="text-sm"
              />
            </div>
            <ScrollArea className="h-[400px] pr-2">
              {papersLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading papers...
                </div>
              ) : papers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>No papers in library.</p>
                  <p className="text-xs mt-1">Go to Discover or Dashboard to add papers.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {papers.map(paper => {
                    const isSelected = selectedPapers.has(paper.id)
                    return (
                      <button
                        key={paper.id}
                        onClick={() => togglePaper(paper.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-start gap-2.5 transition-all ${
                          isSelected
                            ? 'bg-primary/10 text-foreground'
                            : 'hover:bg-accent/50 text-muted-foreground'
                        }`}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 shrink-0 mt-0.5 opacity-40" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium truncate">{paper.title || paper.filename}</p>
                          {paper.authors && (
                            <p className="text-xs opacity-60 truncate">{paper.authors.slice(0, 2).join(', ')}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>

            <div className="flex gap-2 mt-4 pt-4 border-t">
              <Button
                onClick={() => { setActiveTab('review'); reviewMutation.mutate() }}
                disabled={!canGenerate || reviewMutation.isPending}
                className="flex-1"
                size="sm"
              >
                {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <BookOpen className="w-4 h-4 mr-1" />}
                Generate Review
              </Button>
              <Button
                onClick={() => { setActiveTab('gaps'); gapsMutation.mutate() }}
                disabled={!canGenerate || gapsMutation.isPending}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                {gapsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Lightbulb className="w-4 h-4 mr-1" />}
                Find Gaps
              </Button>
            </div>
            {!canGenerate && (
              <p className="text-xs text-amber-500 mt-2">Select at least 1 paper to generate.</p>
            )}
          </CardContent>
        </Card>

        {/* Right: Output */}
        <div className="lg:col-span-2">
          {/* Tab switcher */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('review')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'review'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="w-4 h-4" /> Literature Review
            </button>
            <button
              onClick={() => setActiveTab('gaps')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'gaps'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Lightbulb className="w-4 h-4" /> Gap Analysis
            </button>
          </div>

          {/* Literature Review Output */}
          {activeTab === 'review' && (
            <Card className="min-h-[500px]">
              {reviewMutation.isPending ? (
                <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                  <p className="font-medium">Generating literature review...</p>
                  <p className="text-xs mt-1">Analyzing {selectedPapers.size} papers on "{topic}"</p>
                </div>
              ) : reviewText ? (
                <>
                  <CardHeader className="flex flex-row items-center justify-between border-b">
                    <CardTitle className="text-base">Generated Literature Review</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleCopy}>
                      {copied ? <><Check className="w-4 h-4 mr-1 text-green-500" /> Copied!</> : <><Copy className="w-4 h-4 mr-1" /> Copy</>}
                    </Button>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
                      {reviewText}
                    </div>
                  </CardContent>
                </>
              ) : reviewMutation.isSuccess && reviewMutation.data?.error ? (
                <div className="flex flex-col items-center justify-center h-[500px] text-red-500">
                  <AlertTriangle className="w-10 h-10 mb-4" />
                  <p className="font-medium">Generation failed</p>
                  <p className="text-xs mt-1">{reviewMutation.data.error}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
                  <BookOpen className="w-16 h-16 opacity-10 mb-4" />
                  <p>Enter a topic, select papers, and click "Generate Review"</p>
                </div>
              )}
            </Card>
          )}

          {/* Gap Analysis Output */}
          {activeTab === 'gaps' && (
            <div className="min-h-[500px]">
              {gapsMutation.isPending ? (
                <Card className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                  <p className="font-medium">Analyzing research gaps...</p>
                  <p className="text-xs mt-1">Scanning {selectedPapers.size} papers for opportunities</p>
                </Card>
              ) : gaps ? (
                <div className="space-y-4">
                  {Object.entries(gaps).map(([category, items]) => {
                    const Icon = GAP_ICONS[category] || Lightbulb
                    const color = GAP_COLORS[category] || 'text-gray-400 bg-gray-500/10'
                    const [textColor, bgColor] = color.split(' ')

                    return (
                      <Card key={category}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bgColor}`}>
                              <Icon className={`w-4 h-4 ${textColor}`} />
                            </div>
                            {category}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {Array.isArray(items) ? (
                            <ul className="space-y-2">
                              {items.map((item: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${textColor.replace('text-', 'bg-')}`} />
                                  {item}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">{String(items)}</p>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              ) : gapsMutation.isSuccess && gapsMutation.data?.error ? (
                <Card className="flex flex-col items-center justify-center h-[500px] text-red-500">
                  <AlertTriangle className="w-10 h-10 mb-4" />
                  <p className="font-medium">Analysis failed</p>
                  <p className="text-xs mt-1">{gapsMutation.data.error}</p>
                </Card>
              ) : (
                <Card className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
                  <Lightbulb className="w-16 h-16 opacity-10 mb-4" />
                  <p>Enter a topic, select papers, and click "Find Gaps"</p>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

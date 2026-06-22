import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FileText, Loader2, BookOpen, CheckSquare, Square, PenTool, Check, Copy, Sparkles
} from 'lucide-react'

export const Route = createFileRoute('/write')({
  component: WriteRoute,
})

type Paper = {
  id: string
  filename: string
  title?: string
  authors?: string[]
}

const SECTIONS = [
  "Abstract",
  "Introduction",
  "Related Work",
  "Methodology",
  "Experimental Setup",
  "Results",
  "Discussion",
  "Conclusion"
]

function WriteRoute() {
  const [topic, setTopic] = useState('')
  const [section, setSection] = useState('Introduction')
  const [notes, setNotes] = useState('')
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ['papers'],
    queryFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/papers`)
      return res.json()
    }
  })

  const draftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/draft-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          section_type: section,
          notes,
          paper_ids: Array.from(selectedPapers),
        })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.draft) setDraft(data.draft)
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

  const handleCopy = () => {
    navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const papers: Paper[] = papersData?.papers || []
  const canGenerate = topic.trim().length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Paper Writing Assistant</h1>
        <p className="text-muted-foreground">Draft sections of your research paper using your library as context.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Input & Configuration */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">1. Paper Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Topic / Working Title</label>
                <Input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. A Novel Attention Mechanism for..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Section to Draft</label>
                <select
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                >
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Instructions / Notes (Optional)</label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Make sure to emphasize the limitations of existing datasets..."
                  rows={3}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">2. Reference Papers (Optional)</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px] pr-2">
                {papersLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading papers...
                  </div>
                ) : papers.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    <p>No papers in library.</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {papers.map(paper => {
                      const isSelected = selectedPapers.has(paper.id)
                      return (
                        <button
                          key={paper.id}
                          onClick={() => togglePaper(paper.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-start gap-2.5 transition-all ${
                            isSelected
                              ? 'bg-primary/10 text-foreground'
                              : 'hover:bg-accent/50 text-muted-foreground'
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-40" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{paper.title || paper.filename}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
              
              <Button
                onClick={() => draftMutation.mutate()}
                disabled={!canGenerate || draftMutation.isPending}
                className="w-full mt-4"
              >
                {draftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Generate Draft
              </Button>
              {!canGenerate && (
                <p className="text-xs text-amber-500 mt-2 text-center">Topic is required.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Output */}
        <div className="lg:col-span-2">
          <Card className="h-full min-h-[600px] flex flex-col">
            {draftMutation.isPending ? (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="font-medium">Drafting {section}...</p>
                <p className="text-xs mt-1">Applying academic style and citations</p>
              </div>
            ) : draft ? (
              <>
                <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                  <CardTitle className="text-base flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-primary" /> Generated {section}
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <><Check className="w-4 h-4 mr-1 text-green-500" /> Copied!</> : <><Copy className="w-4 h-4 mr-1" /> Copy Markdown</>}
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 p-0">
                  <Textarea 
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-full h-full min-h-[500px] border-0 focus-visible:ring-0 rounded-none resize-none p-6 text-sm leading-relaxed"
                  />
                </CardContent>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                <PenTool className="w-16 h-16 opacity-10 mb-4" />
                <p>Fill out the details on the left to start drafting.</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  FileText, Loader2, BookOpen, CheckSquare, Square, Columns, Download
} from 'lucide-react'

export const Route = createFileRoute('/compare')({
  component: CompareRoute,
})

type Paper = {
  id: string
  filename: string
  title?: string
  authors?: string[]
}

type ComparisonItem = {
  id: string
  title: string
  method: string
  dataset: string
  metrics: string
  results: string
  limitations: string
}

function CompareRoute() {
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set())
  const [comparison, setComparison] = useState<ComparisonItem[]>([])

  const { data: papersData, isLoading: papersLoading } = useQuery({
    queryKey: ['papers'],
    queryFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/papers`)
      return res.json()
    }
  })

  const compareMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/compare-papers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_ids: Array.from(selectedPapers),
        })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.comparison) setComparison(data.comparison)
    }
  })

  const togglePaper = (id: string) => {
    setSelectedPapers(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else if (n.size < 5) n.add(id) // Limit to 5 papers max for comparison
      return n
    })
  }

  const exportCSV = () => {
    if (!comparison.length) return
    const headers = ['Title', 'Method', 'Dataset', 'Metrics', 'Results', 'Limitations']
    const rows = comparison.map(c => [
      `"${c.title.replace(/"/g, '""')}"`,
      `"${c.method.replace(/"/g, '""')}"`,
      `"${c.dataset.replace(/"/g, '""')}"`,
      `"${c.metrics.replace(/"/g, '""')}"`,
      `"${c.results.replace(/"/g, '""')}"`,
      `"${c.limitations.replace(/"/g, '""')}"`
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'paper_comparison.csv'
    a.click()
  }

  const papers: Paper[] = papersData?.papers || []
  const canGenerate = selectedPapers.size >= 2 && selectedPapers.size <= 5

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compare Papers</h1>
          <p className="text-muted-foreground">Select 2 to 5 papers to generate a side-by-side comparison matrix.</p>
        </div>
        {comparison.length > 0 && (
          <Button onClick={exportCSV} variant="outline" className="gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left: Paper Selection */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Select Papers ({selectedPapers.size}/5)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-2">
              {papersLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading papers...
                </div>
              ) : papers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p>No papers in library.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {papers.map(paper => {
                    const isSelected = selectedPapers.has(paper.id)
                    const isDisabled = !isSelected && selectedPapers.size >= 5
                    return (
                      <button
                        key={paper.id}
                        onClick={() => togglePaper(paper.id)}
                        disabled={isDisabled}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-start gap-2.5 transition-all ${
                          isSelected
                            ? 'bg-primary/10 text-foreground'
                            : isDisabled
                            ? 'opacity-50 cursor-not-allowed'
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

            <div className="mt-4 pt-4 border-t">
              <Button
                onClick={() => compareMutation.mutate()}
                disabled={!canGenerate || compareMutation.isPending}
                className="w-full"
                size="sm"
              >
                {compareMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Columns className="w-4 h-4 mr-2" />}
                Compare Selected Papers
              </Button>
            </div>
            {!canGenerate && (
              <p className="text-xs text-amber-500 mt-2 text-center">Select between 2 and 5 papers.</p>
            )}
          </CardContent>
        </Card>

        {/* Right: Output */}
        <div className="lg:col-span-3">
          {compareMutation.isPending ? (
            <Card className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="font-medium">Analyzing papers...</p>
              <p className="text-xs mt-1">Extracting comparison metrics</p>
            </Card>
          ) : comparison.length > 0 ? (
            <div className="rounded-lg border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-accent/50 text-muted-foreground text-xs uppercase font-medium">
                    <tr>
                      <th className="px-4 py-3 min-w-[200px]">Paper</th>
                      <th className="px-4 py-3 min-w-[200px]">Methodology</th>
                      <th className="px-4 py-3 min-w-[150px]">Dataset / Domain</th>
                      <th className="px-4 py-3 min-w-[150px]">Metrics</th>
                      <th className="px-4 py-3 min-w-[200px]">Results</th>
                      <th className="px-4 py-3 min-w-[200px]">Limitations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {comparison.map((item, idx) => (
                      <tr key={idx} className="hover:bg-accent/20 transition-colors">
                        <td className="px-4 py-3 font-medium align-top">{item.title}</td>
                        <td className="px-4 py-3 align-top text-muted-foreground">{item.method}</td>
                        <td className="px-4 py-3 align-top text-muted-foreground">{item.dataset}</td>
                        <td className="px-4 py-3 align-top text-muted-foreground">{item.metrics}</td>
                        <td className="px-4 py-3 align-top text-muted-foreground">{item.results}</td>
                        <td className="px-4 py-3 align-top text-muted-foreground">{item.limitations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center h-[500px] text-muted-foreground">
              <Columns className="w-16 h-16 opacity-10 mb-4" />
              <p>Select papers from the left and click Compare</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

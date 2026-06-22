import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Loader2, FileText, LayoutList } from 'lucide-react'

export const Route = createFileRoute('/papers/$paperId')({
  component: PaperRoute,
})

function PaperRoute() {
  const { paperId } = Route.useParams()

  const { data: paperMeta, isLoading: metaLoading } = useQuery({
    queryKey: ['paper', paperId],
    queryFn: async () => {
      // In a real app we'd have a specific GET endpoint, but we can fetch all and filter
      const res = await fetch(`http://${window.location.hostname}:8000/api/papers`)
      const data = await res.json()
      return data.papers.find((p: any) => p.id === paperId)
    }
  })

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`http://${window.location.hostname}:8000/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_id: paperId })
      })
      return res.json()
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paper Analysis</h1>
          <p className="text-muted-foreground">
            {metaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : paperMeta?.filename || paperId}
          </p>
        </div>
        <Button onClick={() => summarizeMutation.mutate()} disabled={summarizeMutation.isPending}>
          {summarizeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LayoutList className="w-4 h-4 mr-2" />}
          Generate Structured Summary
        </Button>
      </div>

      {summarizeMutation.isError || (summarizeMutation.isSuccess && summarizeMutation.data?.error) ? (
        <Card className="p-6 border-red-500 bg-red-50 dark:bg-red-950/20">
          <h2 className="text-xl font-semibold text-red-700 dark:text-red-400 mb-2">Generation Failed</h2>
          <p className="text-sm text-red-600 dark:text-red-300">
            {summarizeMutation.error?.message || summarizeMutation.data?.error}
          </p>
          {summarizeMutation.data?.raw && (
            <div className="mt-4 p-4 bg-black/10 rounded text-xs overflow-auto max-h-40 font-mono whitespace-pre-wrap">
              {summarizeMutation.data.raw}
            </div>
          )}
        </Card>
      ) : summarizeMutation.isSuccess && summarizeMutation.data?.summary ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summarizeMutation.data.summary).map(([key, value]) => (
            <Card key={key} className={key === 'Methodology' || key === 'Key Findings' ? 'md:col-span-2 lg:col-span-3' : ''}>
              <CardHeader className="bg-muted/50 border-b">
                <CardTitle className="text-lg">{key}</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="prose prose-sm dark:prose-invert">
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="min-h-[400px] flex items-center justify-center text-muted-foreground border-dashed">
          {summarizeMutation.isPending ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p>Analyzing paper with AI... This may take a moment.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <FileText className="w-12 h-12 opacity-20" />
              <p>Click "Generate Structured Summary" to analyze this paper.</p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

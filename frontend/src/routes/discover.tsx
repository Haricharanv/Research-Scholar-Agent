import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, Loader2, Download, ExternalLink, BookOpen, Users, Calendar, Quote, ArrowUpDown, Globe2, Library } from 'lucide-react'

export const Route = createFileRoute('/discover')({
  component: DiscoverRoute,
})

type PaperResult = {
  title: string
  authors: string[]
  abstract: string
  published?: string
  year?: number
  citation_count?: number
  arxiv_id?: string
  doi?: string
  pdf_url?: string
  url?: string
  source: string
  primary_category?: string
  venue?: string
}

function DiscoverRoute() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PaperResult[]>([])
  const [activeSource, setActiveSource] = useState<'arxiv' | 'ieee' | 'acm' | 'springer' | 'crossref'>('arxiv')
  const [importing, setImporting] = useState<Set<string>>(new Set())
  const [imported, setImported] = useState<Set<string>>(new Set())
  const [searchError, setSearchError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const searchMutation = useMutation({
    mutationFn: async ({ source, searchQuery }: { source: string; searchQuery: string }) => {
      const apiSource = ['ieee', 'acm', 'springer'].includes(source) ? 'crossref' : source
      const publisher = ['ieee', 'acm', 'springer'].includes(source) ? source : ''
      const res = await fetch(`http://${window.location.hostname}:8000/api/search/${apiSource}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, max_results: 15, publisher })
      })
      return res.json()
    },
    onSuccess: (data) => {
      const raw = data.results || []
      // Filter out error objects from the API
      const errors = raw.filter((r: any) => r.error)
      const valid = raw.filter((r: any) => !r.error && r.title)
      if (errors.length > 0 && valid.length === 0) {
        setResults([])
        setSearchError(errors[0].error)
      } else {
        setResults(valid)
        setSearchError(null)
      }
    }
  })

  const handleSearch = () => {
    if (!query.trim()) return
    searchMutation.mutate({ source: activeSource, searchQuery: query })
  }

  const handleImport = async (paper: PaperResult) => {
    const importId = paper.arxiv_id || paper.title
    if (!paper.arxiv_id) return
    setImporting(prev => new Set(prev).add(importId))
    
    try {
      const res = await fetch(`http://${window.location.hostname}:8000/api/import-paper`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arxiv_id: paper.arxiv_id })
      })
      const data = await res.json()
      if (data.id) {
        setImported(prev => new Set(prev).add(importId))
        queryClient.invalidateQueries({ queryKey: ['papers'] })
      }
    } catch (err) {
      console.error('Import failed:', err)
    } finally {
      setImporting(prev => {
        const n = new Set(prev)
        n.delete(importId)
        return n
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discover Papers</h1>
        <p className="text-muted-foreground">Search arXiv and CrossRef for research papers on any topic.</p>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setActiveSource('arxiv')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSource === 'arxiv'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="w-4 h-4" /> arXiv
            </button>
            <button
              onClick={() => setActiveSource('ieee')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSource === 'ieee'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Library className="w-4 h-4" /> IEEE
            </button>
            <button
              onClick={() => setActiveSource('acm')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSource === 'acm'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Library className="w-4 h-4" /> ACM
            </button>
            <button
              onClick={() => setActiveSource('springer')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSource === 'springer'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Library className="w-4 h-4" /> Springer
            </button>
            <button
              onClick={() => setActiveSource('crossref')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSource === 'crossref'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe2 className="w-4 h-4" /> CrossRef (All)
            </button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleSearch() }} className="flex gap-2">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. transformer attention mechanism, RAG retrieval augmented generation..."
              className="flex-1 text-base"
            />
            <Button type="submit" disabled={searchMutation.isPending || !query.trim()} size="lg">
              {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Results */}
      {searchMutation.isPending && (
        <div className="text-center py-12 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p>Searching {
            activeSource === 'arxiv' ? 'arXiv' :
            activeSource === 'ieee' ? 'IEEE' :
            activeSource === 'acm' ? 'ACM' :
            activeSource === 'springer' ? 'Springer' : 'CrossRef'
          }...</p>
        </div>
      )}

      {results.length > 0 && !searchMutation.isPending && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{results.length} results found</p>
          {results.map((paper, idx) => {
            const importId = paper.arxiv_id || paper.title
            const isImporting = importing.has(importId)
            const isImported = imported.has(importId)

            return (
              <Card key={idx} className="hover:border-primary/30 transition-colors">
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title */}
                      <h3 className="font-semibold text-base leading-tight mb-2">
                        {paper.url ? (
                          <a href={paper.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                            {paper.title}
                            <ExternalLink className="w-3.5 h-3.5 inline ml-1.5 opacity-50" />
                          </a>
                        ) : paper.title}
                      </h3>

                      {/* Metadata row */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3">
                        {paper.authors && paper.authors.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {paper.authors.slice(0, 3).join(', ')}
                            {paper.authors.length > 3 && ` +${paper.authors.length - 3}`}
                          </span>
                        )}
                        {(paper.published || paper.year) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {paper.published || paper.year}
                          </span>
                        )}
                        {paper.citation_count !== undefined && paper.citation_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Quote className="w-3.5 h-3.5" />
                            {paper.citation_count} citations
                          </span>
                        )}
                        {paper.primary_category && (
                          <span className="bg-muted px-2 py-0.5 rounded-full">{paper.primary_category}</span>
                        )}
                        {paper.venue && (
                          <span className="bg-indigo-500/10 text-indigo-500 px-2 py-0.5 rounded-full font-medium max-w-[200px] truncate">
                            {paper.venue}
                          </span>
                        )}
                        {paper.arxiv_id && (
                          <span className="bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full font-medium">
                            arXiv:{paper.arxiv_id}
                          </span>
                        )}
                        {paper.doi && !paper.arxiv_id && (
                          <span className="bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full font-medium">
                            DOI: {paper.doi}
                          </span>
                        )}
                      </div>

                      {/* Abstract */}
                      {paper.abstract && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                          {paper.abstract}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {paper.arxiv_id && (
                        <Button
                          size="sm"
                          onClick={() => handleImport(paper)}
                          disabled={isImporting || isImported}
                          variant={isImported ? "outline" : "default"}
                        >
                          {isImporting ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          ) : isImported ? (
                            <span className="text-green-500">✓ Added</span>
                          ) : (
                            <><Download className="w-4 h-4 mr-1" /> Add to Library</>
                          )}
                        </Button>
                      )}
                      {paper.pdf_url && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={paper.pdf_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="w-4 h-4 mr-1" /> PDF
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {searchError && !searchMutation.isPending && (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">
            <span>⚠️</span> {searchError}
          </div>
          <p className="text-muted-foreground text-sm mt-3">The API might be slow or unreachable. Try again in a moment.</p>
        </div>
      )}

      {results.length === 0 && !searchError && !searchMutation.isPending && searchMutation.isSuccess && (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p>No papers found. Try a different search query.</p>
        </div>
      )}

      {!searchMutation.isSuccess && !searchMutation.isPending && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-16 h-16 mx-auto mb-4 opacity-10" />
          <p className="text-lg">Search for a research topic to get started</p>
          <p className="text-sm mt-2 opacity-60">Try: "attention mechanism", "diffusion models", "large language models"</p>
        </div>
      )}
    </div>
  )
}

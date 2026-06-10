import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpen, Search, FileText, Columns, PenTool, MessageSquare, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/')({
  component: Index,
})

const features = [
  {
    icon: Search,
    title: 'Discover',
    desc: 'Search arXiv and Semantic Scholar for papers on any topic. One-click import to your library.',
    to: '/discover',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
  },
  {
    icon: FileText,
    title: 'Literature Review',
    desc: 'Generate structured, thematic literature reviews with proper in-text citations.',
    to: '/review',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
  },
  {
    icon: Columns,
    title: 'Compare Papers',
    desc: 'Side-by-side comparison matrix of methods, datasets, metrics, and limitations.',
    to: '/compare',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
  },
  {
    icon: PenTool,
    title: 'Write',
    desc: 'Draft sections of your paper with AI assistance grounded in your library.',
    to: '/write',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
  },
  {
    icon: MessageSquare,
    title: 'Q&A Chat',
    desc: 'Ask questions about your papers. The AI retrieves context and answers from your library.',
    to: '/chat',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
  },
]

function Index() {
  return (
    <div className="flex flex-col items-center justify-center space-y-12 py-12">
      {/* Hero */}
      <div className="text-center space-y-4 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 mb-2">
          <Sparkles className="w-3 h-3" /> Powered by Groq, Gemini &amp; OpenRouter
        </div>
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
          Research Scholar Agent
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Your AI-powered research assistant. Discover papers, generate literature reviews, 
          identify research gaps, and draft your next paper — all in one place.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button asChild size="lg">
            <Link to="/discover">
              <Search className="w-4 h-4 mr-2" /> Start Discovering
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/dashboard">
              View Dashboard <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-4xl">
        {features.map((f) => (
          <Link key={f.title} to={f.to}>
            <Card className="group hover:border-primary/30 hover:shadow-lg transition-all duration-300 cursor-pointer h-full">
              <CardContent className="pt-6 space-y-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${f.bg}`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="font-semibold text-base group-hover:text-primary transition-colors">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground/60 text-center max-w-lg">
        Research Scholar Agent uses a custom TF-IDF RAG engine for local document indexing 
        and free cloud LLMs (Groq, Google Gemini, OpenRouter) for AI-powered analysis.
      </p>
    </div>
  )
}

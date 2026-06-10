import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { BookOpen, LayoutDashboard, MessageSquare, Search, FileText, Columns, PenTool } from 'lucide-react'

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-xl font-bold tracking-tight hover:text-primary/80 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Research Scholar Agent
          </Link>
          <nav className="flex gap-1 ml-4">
            <Link to="/dashboard" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors [&.active]:text-foreground [&.active]:bg-accent">
              <LayoutDashboard className="w-4 h-4" /> Dashboard
            </Link>
            <Link to="/discover" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors [&.active]:text-foreground [&.active]:bg-accent">
              <Search className="w-4 h-4" /> Discover
            </Link>
            <Link to="/review" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors [&.active]:text-foreground [&.active]:bg-accent">
              <FileText className="w-4 h-4" /> Lit Review
            </Link>
            <Link to="/compare" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors [&.active]:text-foreground [&.active]:bg-accent">
              <Columns className="w-4 h-4" /> Compare
            </Link>
            <Link to="/write" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors [&.active]:text-foreground [&.active]:bg-accent">
              <PenTool className="w-4 h-4" /> Write
            </Link>
            <Link to="/chat" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors [&.active]:text-foreground [&.active]:bg-accent">
              <MessageSquare className="w-4 h-4" /> Q&A
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </div>
  ),
})

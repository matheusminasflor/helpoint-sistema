import { useState, useMemo } from 'react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, BookOpen, Lightbulb, Sparkles } from 'lucide-react';
import { useActivePOPs, POP, useIncrementPOPViews, useRecordPOPInteraction } from '@/hooks/usePOPs';
import { POPCard } from './POPCard';
import { AISearchInput } from './AISearchInput';
import { cn } from '@/lib/utils';

interface KnowledgePanelProps {
  onPOPSolved?: () => void;
  className?: string;
}

export function KnowledgePanel({ onPOPSolved, className }: KnowledgePanelProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showAISearch, setShowAISearch] = useState(true);
  
  const { data: pops, isLoading } = useActivePOPs();
  const incrementViews = useIncrementPOPViews();
  const recordInteraction = useRecordPOPInteraction();

  const filteredPOPs = useMemo(() => {
    return pops?.filter(pop => {
      const matchesSearch = !search || 
        pop.title.toLowerCase().includes(search.toLowerCase()) ||
        pop.keywords?.some(k => k.toLowerCase().includes(search.toLowerCase())) ||
        pop.content.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = !categoryFilter || pop.category === categoryFilter || pop.category === null;
      return matchesSearch && matchesCategory;
    });
  }, [pops, search, categoryFilter]);

  const handleSelectPOP = (pop: POP) => {
    incrementViews.mutate(pop.id);
    recordInteraction.mutate({ pop_id: pop.id, action: 'viewed' });
    navigate(tenantPath(`/base-conhecimento/${pop.id}`));
  };

  const popCategories = useMemo(() => {
    const cats = new Set<string>();
    pops?.forEach(pop => { if (pop.category) cats.add(pop.category); });
    return Array.from(cats);
  }, [pops]);

  return (
    <div className={cn(
      "bg-card border border-border overflow-hidden flex flex-col",
      className
    )}>
      {/* Header */}
      <div className="bg-muted/40 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Base de Conhecimento</h3>
        </div>
      </div>

      <div className="p-4 space-y-4 flex-1 overflow-hidden">
        {/* AI Search Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Busca Inteligente
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAISearch(!showAISearch)}
              className="text-xs h-7 text-muted-foreground hover:text-foreground"
            >
              {showAISearch ? 'Ocultar' : 'Expandir'}
            </Button>
          </div>
          
          {showAISearch && (
            <AISearchInput 
              onSelectPOP={handleSelectPOP}
              className="pb-2"
            />
          )}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="border-t border-border" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
            ou navegue pelos tutoriais
          </span>
        </div>

        {/* Simple Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar tutoriais..."
            className="pl-9 rounded-xl border-border bg-card placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40"
          />
        </div>

        {/* Category Filters */}
        {popCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={categoryFilter === null ? "default" : "outline"}
              onClick={() => setCategoryFilter(null)}
              className={cn(
                "h-7 text-xs rounded-full",
                categoryFilter === null ? '' : 'border-border text-muted-foreground hover:bg-background'
              )}
            >
              Todos
            </Button>
            {popCategories.map(cat => (
              <Button
                key={cat}
                size="sm"
                variant={categoryFilter === cat ? "default" : "outline"}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  "h-7 text-xs rounded-full",
                  categoryFilter === cat ? '' : 'border-border text-muted-foreground hover:bg-background'
                )}
              >
                {cat}
              </Button>
            ))}
          </div>
        )}

        {/* Tutorial List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredPOPs && filteredPOPs.length > 0 ? (
          <ScrollArea className="h-[300px] pr-3">
            <div className="space-y-2">
              {filteredPOPs.map(pop => (
                <POPCard 
                  key={pop.id} 
                  pop={pop} 
                  onSelect={handleSelectPOP}
                  compact
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <Lightbulb className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'Nenhum tutorial encontrado' : 'Nenhum tutorial disponível'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

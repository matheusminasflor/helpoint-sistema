import { useTenantPath } from '@/hooks/useTenantPath';
import { useQueryState } from '@/hooks/useQueryState';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Printer, 
  Lock, 
  Wifi, 
  Monitor, 
  Mail, 
  HelpCircle,
  Folder,
  ArrowLeft,
  Eye,
  ChevronRight,
  Sparkles,
  Loader2,
  UserPlus,
  UserMinus,
  Shield
} from 'lucide-react';
import { useActivePOPs, POP } from '@/hooks/usePOPs';
import { useSemanticSearch } from '@/hooks/useSemanticSearch';
import { CategorySection } from '@/components/pops/CategorySection';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

// Category icons mapping
const categoryIcons: Record<string, LucideIcon> = {
  'Hardware': Printer,
  'Senhas': Lock,
  'Redes': Wifi,
  'Rede': Wifi,
  'Sistemas': Monitor,
  'Software': Monitor,
  'Email': Mail,
  'Acesso/Permissões': Lock,
  'Admissional': UserPlus,
  'Demissional': UserMinus,
  'Segurança': Shield,
  'Outros': HelpCircle
};

// Category descriptions
const categoryDescriptions: Record<string, string> = {
  'Hardware': 'Impressoras, periféricos, equipamentos',
  'Senhas': 'Reset, troca, recuperação de acesso',
  'Redes': 'VPN, WiFi, conexões de rede',
  'Rede': 'VPN, WiFi, conexões de rede',
  'Sistemas': 'Acessos, erros, instalações',
  'Software': 'Programas, aplicativos, licenças',
  'Email': 'Outlook, configuração, assinatura',
  'Acesso/Permissões': 'Liberações, bloqueios, acessos',
  'Admissional': 'Onboarding, novos colaboradores',
  'Demissional': 'Offboarding, desligamentos',
  'Segurança': 'Boas práticas de segurança da informação',
  'Outros': 'Demais assuntos'
};

// Category display order
const categoryOrder = [
  'Hardware',
  'Senhas',
  'Redes',
  'Rede',
  'Software',
  'Sistemas',
  'Email',
  'Acesso/Permissões',
  'Admissional',
  'Demissional',
  'Segurança',
  'Outros'
];

// Debounce hook
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

export default function Portal() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get('categoria');
  
  const [search, setSearch] = useQueryState<string>('q', '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: pops, isLoading } = useActivePOPs();
  
  // Semantic search
  const { 
    search: semanticSearch, 
    clearResults: clearSemanticResults,
    isSearching: isAISearching, 
    results: aiResults,
    hasResults: hasAIResults 
  } = useSemanticSearch();

  // Trigger AI search on debounced input (min 5 chars)
  useEffect(() => {
    if (debouncedSearch.trim().length >= 5) {
      semanticSearch(debouncedSearch);
    } else {
      clearSemanticResults();
    }
  }, [debouncedSearch, semanticSearch, clearSemanticResults]);

  // Group by category with ordering
  const categories = useMemo(() => {
    const grouped = new Map<string, POP[]>();
    pops?.forEach(pop => {
      const cat = pop.category || 'Outros';
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(pop);
    });
    
    // Sort by predefined order
    const sorted = new Map<string, POP[]>();
    categoryOrder.forEach(cat => {
      if (grouped.has(cat)) {
        sorted.set(cat, grouped.get(cat)!);
      }
    });
    // Add any remaining categories not in the predefined order
    grouped.forEach((articles, cat) => {
      if (!sorted.has(cat)) {
        sorted.set(cat, articles);
      }
    });
    
    return sorted;
  }, [pops]);

  // Popular articles (top 8 by views)
  const popularArticles = useMemo(() => {
    return [...(pops || [])]
      .sort((a, b) => (b.views_count || 0) - (a.views_count || 0))
      .slice(0, 8);
  }, [pops]);

  // Text search filtered articles
  const filteredArticles = useMemo(() => {
    let articles = pops || [];
    
    if (selectedCategory) {
      articles = articles.filter(a => a.category === selectedCategory);
    }
    
    if (debouncedSearch.trim()) {
      const searchLower = debouncedSearch.toLowerCase();
      articles = articles.filter(a => 
        a.title.toLowerCase().includes(searchLower) ||
        a.keywords?.some(k => k.toLowerCase().includes(searchLower)) ||
        a.content.toLowerCase().includes(searchLower)
      );
    }
    
    return articles;
  }, [pops, debouncedSearch, selectedCategory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleCategoryClick = useCallback((cat: string) => {
    navigate(tenantPath(`/base-conhecimento?categoria=${encodeURIComponent(cat)}`));
  }, [navigate]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-muted/30 border-b border-border py-16 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-5 w-48 mx-auto mb-8" />
            <Skeleton className="h-12 w-full max-w-xl mx-auto rounded-full" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Category view
  if (selectedCategory) {
    const Icon = categoryIcons[selectedCategory] || Folder;
    
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-muted/30 border-b border-border py-10 px-4">
          <div className="max-w-5xl mx-auto">
            <Button
              variant="ghost"
              onClick={() => navigate(tenantPath('/base-conhecimento'))}
              className="mb-4 gap-2 text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Icon className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  {selectedCategory}
                </h1>
                <p className="text-muted-foreground">
                  {categoryDescriptions[selectedCategory] || 'Artigos relacionados'}
                </p>
              </div>
            </div>
            
            {/* Search within category */}
            <form onSubmit={handleSearch} className="mt-6 max-w-xl">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Buscar em ${selectedCategory}...`}
                  className="pl-12 h-11"
                />
              </div>
            </form>
          </div>
        </div>

        {/* Articles list */}
        <div className="max-w-5xl mx-auto px-4 py-8">
          {filteredArticles.length === 0 ? (
            <div className="text-center py-12">
              <HelpCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">
                {search ? 'Nenhum artigo encontrado para sua busca.' : 'Nenhum artigo nesta categoria.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredArticles.map((article) => (
                <Link 
                  key={article.id} 
                  to={`/portal/${article.id}`}
                  className="flex items-center justify-between py-4 px-4 rounded-lg hover:bg-muted/50 transition-colors group border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    {article.subcategory && (
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {article.subcategory}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground ml-4">
                    <span className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      {article.views_count || 0}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main view - Hero + Search Results / Categories + Popular
  const showSearchResults = debouncedSearch.trim().length > 0;
  const showAIResults = hasAIResults && !isAISearching;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-muted/30 border-b border-border py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-4 text-foreground">
            Base de Conhecimento
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Encontre respostas para suas dúvidas
          </p>
          
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Descreva seu problema..."
              className="pl-12 h-12 text-base rounded-full border-2 shadow-sm pr-12"
            />
            {isAISearching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </form>
          
          {/* AI Search Hint */}
          {!showSearchResults && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3" />
              Use linguagem natural: "não consigo imprimir" ou "esqueci minha senha"
            </p>
          )}
        </div>
      </div>

      {/* AI Search Results */}
      {showAIResults && (
        <div className="max-w-5xl mx-auto px-4 pt-8 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Sugestões da IA</h2>
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </div>
          
          <div className="border rounded-lg overflow-hidden bg-card divide-y">
            {aiResults.map((result) => (
              <Link
                key={result.id}
                to={`/portal/${result.id}`}
                className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium group-hover:text-primary transition-colors">
                      {result.title}
                    </span>
                    {result.score >= 80 && (
                      <Badge variant="default" className="text-xs">
                        {result.score}% relevante
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {result.reason}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0 ml-4" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Text Search Results */}
      {showSearchResults && (
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">
              {filteredArticles.length} resultado{filteredArticles.length !== 1 ? 's' : ''} para "{debouncedSearch}"
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
              Limpar
            </Button>
          </div>
          
          {filteredArticles.length === 0 && !hasAIResults ? (
            <div className="text-center py-12 border rounded-lg bg-muted/30">
              <HelpCircle className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhum artigo encontrado.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tente outros termos ou{' '}
                <Link to={tenantPath("/nova-solicitacao")} className="text-primary hover:underline">
                  abra um chamado
                </Link>
              </p>
            </div>
          ) : (
            <div className="space-y-1 border rounded-lg overflow-hidden">
              {filteredArticles.map((article) => (
                <Link 
                  key={article.id} 
                  to={`/portal/${article.id}`}
                  className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors group border-b last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <span className="group-hover:text-primary transition-colors">
                      {article.title}
                    </span>
                    {article.category && (
                      <span className="text-xs text-muted-foreground ml-2">
                        em {article.category}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Categories with Articles (Bling style) */}
      {!showSearchResults && (
        <div className="max-w-5xl mx-auto px-4 py-12">
          {Array.from(categories.entries()).map(([cat, articles]) => {
            const Icon = categoryIcons[cat] || Folder;
            return (
              <CategorySection
                key={cat}
                name={cat}
                icon={Icon}
                articles={articles}
                onViewAll={() => handleCategoryClick(cat)}
              />
            );
          })}
        </div>
      )}

      {/* Popular Articles */}
      {!showSearchResults && popularArticles.length > 0 && (
        <div className="max-w-5xl mx-auto px-4 pb-16">
          <h2 className="text-xl font-semibold mb-6">Artigos populares</h2>
          <div className="space-y-1 border rounded-lg overflow-hidden bg-card">
            {popularArticles.map((article) => (
              <Link 
                key={article.id} 
                to={`/portal/${article.id}`}
                className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 transition-colors group border-b last:border-0"
              >
                <span className="group-hover:text-primary transition-colors">
                  {article.title}
                </span>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {article.views_count || 0}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

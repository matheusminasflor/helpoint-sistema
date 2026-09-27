import { useSetBreadcrumbLeaf } from '@/contexts/BreadcrumbContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  BookOpen, 
  Share2,
  Check,
  ThumbsUp,
  ThumbsDown,
  Eye
} from 'lucide-react';
import { usePOP, usePOPs, useIncrementPOPViews, useIncrementPOPSolved, useRecordPOPInteraction } from '@/hooks/usePOPs';
import { POPPreview } from '@/components/pops/POPPreview';
import { MarkdownPreview } from '@/components/pops/MarkdownPreview';
import { POPFeedbackDialog } from '@/components/pops/POPFeedbackDialog';
import { parseContent, isBlockContent } from '@/types/pop-blocks';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Format relative date
function formatRelativeDate(dateString: string | null): string {
  if (!dateString) return '';
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}

export default function TutorialViewer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [showFeedback, setShowFeedback] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<'yes' | 'no' | null>(null);
  
  const { data: pop, isLoading } = usePOP(id);
  useSetBreadcrumbLeaf(pop ? (pop.title.length > 40 ? `${pop.title.slice(0, 40)}…` : pop.title) : null);
  const { data: allPops } = usePOPs();
  const incrementViews = useIncrementPOPViews();
  const incrementSolved = useIncrementPOPSolved();
  const recordInteraction = useRecordPOPInteraction();

  // Detect content type
  const isBlocks = pop ? isBlockContent(pop.content) : false;
  const blocks = pop && isBlocks ? parseContent(pop.content) : [];

  // Get related articles from same category
  const relatedArticles = allPops?.filter(p => 
    p.id !== id && 
    p.category === pop?.category && 
    p.is_active
  ).slice(0, 5) || [];

  // Record view on mount
  useEffect(() => {
    if (id) {
      incrementViews.mutate(id);
      recordInteraction.mutate({ pop_id: id, action: 'viewed' });
    }
  }, [id]);

  const handleHelpful = (helpful: boolean) => {
    if (!pop) return;
    setFeedbackGiven(helpful ? 'yes' : 'no');
    
    if (helpful) {
      incrementSolved.mutate(pop.id);
      recordInteraction.mutate({ pop_id: pop.id, action: 'solved' });
      toast.success('Obrigado pelo feedback');
    } else {
      setShowFeedback(true);
    }
  };

  const handleFeedbackComplete = () => {
    setShowFeedback(false);
    toast.success('Obrigado pelo feedback');
  };

  const handleShare = async () => {
    const url = window.location.href;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: pop?.title || 'Tutorial',
          text: `Confira este artigo: ${pop?.title}`,
          url: url
        });
        return;
      } catch { 
        // User cancelled
      }
    }
    
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar link. Tente novamente ou avise o suporte.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-6 w-48 mb-6" />
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-4 w-32 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12">
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            <Skeleton className="h-[300px] w-full hidden lg:block" />
          </div>
        </div>
      </div>
    );
  }

  if (!pop) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center">
        <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h2 className="text-lg font-medium">Artigo não encontrado</h2>
        <p className="text-muted-foreground text-sm mt-1">
          O artigo que você está procurando não existe ou foi removido.
        </p>
        <Button variant="outline" onClick={() => navigate(tenantPath('/base-conhecimento'))} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Base de Conhecimento
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Main Container */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">
        
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm mb-8">
          <Link 
            to={tenantPath("/base-conhecimento")} 
            className="text-primary hover:underline"
          >
            Base de Conhecimento
          </Link>
          {pop.category && (
            <>
              <span className="text-muted-foreground">{'>'}</span>
              <Link 
                to={`/base-conhecimento?categoria=${encodeURIComponent(pop.category)}`}
                className="text-primary hover:underline"
              >
                {pop.category}
              </Link>
            </>
          )}
          {pop.subcategory && (
            <>
              <span className="text-muted-foreground">{'>'}</span>
              <span className="text-muted-foreground">{pop.subcategory}</span>
            </>
          )}
        </nav>

        {/* 2-Column Layout: Content + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-12">
          
          {/* Main Content */}
          <main>
            {/* Article Header */}
            <header className="mb-8">
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight text-foreground mb-4">
                {pop.title}
              </h1>
              
              {/* Meta line */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {pop.updated_at && (
                  <span className="flex items-center gap-1">
                    Atualizado {formatRelativeDate(pop.updated_at)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {pop.views_count || 0} visualizações
                </span>
                <button 
                  onClick={handleShare}
                  className="text-primary hover:underline flex items-center gap-1 ml-auto"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Compartilhar'}
                </button>
              </div>
            </header>

            {/* Article Body */}
            <div className="prose prose-lg dark:prose-invert max-w-none">
              {isBlocks ? (
                <POPPreview blocks={blocks} />
              ) : (
                <MarkdownPreview content={pop.content} />
              )}
            </div>

            {/* Feedback Section */}
            <div className="mt-12 pt-8 border-t">
              {feedbackGiven === null ? (
                <div className="flex items-center gap-4">
                  <span className="text-base text-muted-foreground">Este artigo foi útil?</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleHelpful(true)}
                      className="gap-2"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      Sim
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleHelpful(false)}
                      className="gap-2"
                    >
                      <ThumbsDown className="h-4 w-4" />
                      Não
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-base text-muted-foreground">
                  Obrigado pelo feedback!
                </p>
              )}

              {/* Contact support link */}
              <div className="mt-6">
                <p className="text-sm text-muted-foreground">
                  Não encontrou o que procurava?{' '}
                  <Link to={tenantPath("/nova-solicitacao")} className="text-primary hover:underline">
                    Abrir um chamado
                  </Link>
                </p>
              </div>
            </div>
          </main>

          {/* Right Sidebar - Articles in this section */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              {/* Section navigation */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-foreground mb-4">
                  Artigos nessa seção
                </h3>
                <nav className="space-y-1">
                  {/* Current article - highlighted */}
                  <div className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">
                    {pop.title.length > 40 ? pop.title.slice(0, 40) + '...' : pop.title}
                  </div>
                  
                  {/* Related articles */}
                  {relatedArticles.map((article) => (
                    <Link
                      key={article.id}
                      to={`/portal/${article.id}`}
                      className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                    >
                      {article.title.length > 40 ? article.title.slice(0, 40) + '...' : article.title}
                    </Link>
                  ))}
                  
                  {relatedArticles.length === 0 && (
                    <p className="text-sm text-muted-foreground/70 px-3 py-2 italic">
                      Nenhum artigo relacionado
                    </p>
                  )}
                </nav>
              </div>

              {/* Back link */}
              <Button
                variant="ghost"
                onClick={() => navigate(tenantPath('/base-conhecimento'))}
                className="w-full justify-start gap-2 text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Ver todos os artigos
              </Button>
            </div>
          </aside>
        </div>
      </div>

      {/* Feedback Dialog */}
      {showFeedback && pop && (
        <POPFeedbackDialog
          popId={pop.id}
          popTitle={pop.title}
          open={showFeedback}
          onOpenChange={setShowFeedback}
          onComplete={handleFeedbackComplete}
        />
      )}
    </div>
  );
}

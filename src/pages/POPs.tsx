import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { WorkOSContainer } from '@/components/workos/WorkOSContainer';
import { WorkOSStatsCard } from '@/components/workos/WorkOSStatsCard';
import { WorkOSCard, WorkOSCardHeader, WorkOSCardTitle, WorkOSCardContent } from '@/components/workos/WorkOSCard';
import { usePOPs, useUpdatePOP, useDeletePOP, POP } from '@/hooks/usePOPs';
import { usePOPEffectivenessMetrics, useAllPOPFeedbacks } from '@/hooks/usePOPFeedback';
import { Plus, Search, FileText, Eye, CheckCircle2, Pencil, Trash2, Tag, Star, MessageSquare, Lightbulb } from 'lucide-react';
import { TemplateSelector } from '@/components/pops/TemplateSelector';
import { TutorialTemplate } from '@/components/pops/tutorialTemplates';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function POPs() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: pops, isLoading } = usePOPs();
  const { data: metrics } = usePOPEffectivenessMetrics();
  const { data: feedbacks } = useAllPOPFeedbacks();
  const updatePOP = useUpdatePOP();
  const deletePOP = useDeletePOP();

  const [search, setSearch] = useQueryState<string>('q', '');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [deletingPOP, setDeletingPOP] = useState<POP | null>(null);
  const [activeTab, setActiveTab] = useQueryState<string>('aba', 'pops');

  const filteredPOPs = pops?.filter(pop => 
    pop.title.toLowerCase().includes(search.toLowerCase()) ||
    pop.category?.toLowerCase().includes(search.toLowerCase()) ||
    pop.keywords?.some(k => k.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  const handleDelete = async () => {
    if (!deletingPOP) return;
    await deletePOP.mutateAsync(deletingPOP.id);
    setDeletingPOP(null);
  };

  const handleToggleActive = async (pop: POP) => {
    await updatePOP.mutateAsync({ id: pop.id, data: { is_active: !pop.is_active } });
  };

  const handleTemplateSelect = (template: TutorialTemplate) => {
    navigate(tenantPath(`/ti/pops/novo?template=${template.id}`));
  };

  const handleViewPOP = (pop: POP) => {
    navigate(tenantPath(`/base-conhecimento/${pop.id}`));
  };

  const handleEditPOP = (pop: POP) => {
    navigate(tenantPath(`/ti/pops/${pop.id}/editar`));
  };

  const suggestionsCount = metrics?.recentSuggestions?.length || 0;

  return (
    <WorkOSContainer>
      {/* Header */}
      <WorkOSPageHeader
        icon={FileText}
        title="Tutoriais"
        description="Guias e procedimentos para resolução de problemas"
        action={
          <Button onClick={() => setShowTemplateSelector(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Tutorial
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="pops" className="gap-2 data-[state=active]:bg-primary/10">
              <FileText className="h-4 w-4" />
              Tutoriais
            </TabsTrigger>
            <TabsTrigger value="feedbacks" className="gap-2 data-[state=active]:bg-primary/10">
              <MessageSquare className="h-4 w-4" />
              Feedbacks
              {suggestionsCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {suggestionsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* POPs Tab */}
          <TabsContent value="pops" className="space-y-6 mt-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por título, categoria ou palavras-chave..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-card border-border"
              />
            </div>

            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-4">
              <WorkOSStatsCard icon={FileText} label="Total de Tutoriais" value={pops?.length || 0} />
              <WorkOSStatsCard icon={Eye} label="Visualizações" value={pops?.reduce((sum, p) => sum + (p.views_count || 0), 0) || 0} />
              <WorkOSStatsCard icon={CheckCircle2} label="Problemas resolvidos" value={pops?.reduce((sum, p) => sum + (p.solved_count || 0), 0) || 0} color="success" />
              <WorkOSStatsCard 
                icon={Star} 
                label="Avaliação média" 
                value={metrics?.avgRating ? metrics.avgRating.toFixed(1) : '—'} 
                color="warning"
              />
            </div>

            {/* POP List */}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-24 w-full bg-card" />
                ))}
              </div>
            ) : filteredPOPs.length === 0 ? (
              <WorkOSCard className="py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-1">Nenhum tutorial encontrado</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {search ? 'Tente outra busca' : 'Crie seu primeiro tutorial'}
                </p>
                {!search && (
                  <Button onClick={() => setShowTemplateSelector(true)} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Criar Tutorial
                  </Button>
                )}
              </WorkOSCard>
            ) : (
              <div className="space-y-1">
                {filteredPOPs.map(pop => (
                  <div 
                    key={pop.id} 
                    className={`bg-card border border-border p-4 workos-hover-highlight ${!pop.is_active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 
                            className="font-medium truncate text-foreground hover:text-primary cursor-pointer transition-colors"
                            onClick={() => handleViewPOP(pop)}
                          >
                            {pop.title}
                          </h3>
                          {!pop.is_active && (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                          {pop.avg_rating && pop.avg_rating > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Star className="h-3 w-3 fill-primary text-primary" />
                              {pop.avg_rating.toFixed(1)}
                            </div>
                          )}
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                          {pop.content.slice(0, 150).replace(/[#*_]/g, '')}...
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          {pop.category && (
                            <Badge variant="outline">{pop.category}</Badge>
                          )}
                          {pop.subcategory && (
                            <Badge variant="outline" className="text-xs">{pop.subcategory}</Badge>
                          )}
                          {pop.keywords?.slice(0, 3).map((keyword, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {keyword}
                            </Badge>
                          ))}
                          {(pop.keywords?.length || 0) > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{pop.keywords!.length - 3}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-lg font-semibold font-mono text-foreground">{pop.views_count || 0}</p>
                          <p className="text-xs text-muted-foreground">views</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-semibold font-mono text-primary">{pop.solved_count || 0}</p>
                          <p className="text-xs text-muted-foreground">resolvidos</p>
                        </div>
                        
                        <div className="flex items-center gap-2 border-l border-border pl-4">
                          <Switch
                            checked={pop.is_active}
                            onCheckedChange={() => handleToggleActive(pop)}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleViewPOP(pop)}
                            title="Visualizar página oficial"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleEditPOP(pop)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeletingPOP(pop)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Feedbacks Tab */}
          <TabsContent value="feedbacks" className="space-y-6 mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Recent Feedbacks */}
              <WorkOSCard noPadding>
                <WorkOSCardHeader>
                  <WorkOSCardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Feedbacks Recentes
                  </WorkOSCardTitle>
                </WorkOSCardHeader>
                <WorkOSCardContent>
                  {feedbacks && feedbacks.length > 0 ? (
                    <ScrollArea className="h-[400px] pr-3">
                      <div className="space-y-4">
                        {feedbacks.map(feedback => {
                          const pop = pops?.find(p => p.id === feedback.pop_id);
                          return (
                            <div key={feedback.id} className="p-3 rounded bg-surface-2 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium truncate text-foreground">
                                  {pop?.title || 'Tutorial Removido'}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map(star => (
                                    <Star
                                      key={star}
                                      className={`h-3 w-3 ${
                                        star <= feedback.rating
                                          ? 'fill-primary text-primary'
                                          : 'text-muted-foreground'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                              {feedback.comment && (
                                <p className="text-sm text-muted-foreground">
                                  "{feedback.comment}"
                                </p>
                              )}
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{(feedback as any).user?.full_name || 'Usuário'}</span>
                                <span className="font-mono">
                                  {format(new Date(feedback.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[200px] text-center">
                      <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum feedback recebido ainda
                      </p>
                    </div>
                  )}
                </WorkOSCardContent>
              </WorkOSCard>

              {/* Suggestions */}
              <WorkOSCard noPadding>
                <WorkOSCardHeader>
                  <WorkOSCardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Sugestões de Melhoria
                    {suggestionsCount > 0 && (
                      <Badge variant="secondary">{suggestionsCount}</Badge>
                    )}
                  </WorkOSCardTitle>
                </WorkOSCardHeader>
                <WorkOSCardContent>
                  {metrics?.recentSuggestions && metrics.recentSuggestions.length > 0 ? (
                    <ScrollArea className="h-[400px] pr-3">
                      <div className="space-y-4">
                        {metrics.recentSuggestions.map((suggestion, index) => (
                          <div key={index} className="p-3 rounded border border-primary/20 bg-primary/5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium truncate text-primary">
                                {suggestion.pop_title}
                              </span>
                            </div>
                            <p className="text-sm text-foreground">
                              "{suggestion.suggestion}"
                            </p>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{suggestion.user_name || 'Usuário'}</span>
                              <span className="font-mono">
                                {format(new Date(suggestion.created_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[200px] text-center">
                      <Lightbulb className="h-10 w-10 text-muted-foreground/50 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhuma sugestão recebida ainda
                      </p>
                    </div>
                  )}
                </WorkOSCardContent>
              </WorkOSCard>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Template Selector Dialog */}
      <TemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        onSelect={handleTemplateSelect}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingPOP} onOpenChange={(open) => !open && setDeletingPOP(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o tutorial "{deletingPOP?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O tutorial sai da base de conhecimento e não pode ser recuperado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir tutorial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkOSContainer>
  );
}

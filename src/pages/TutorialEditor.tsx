import { sanitizeFileName } from '@/lib/utils';
import { useState, useEffect, useMemo } from 'react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Loader2, Tag, Plus, X, Eye, Edit3, History } from 'lucide-react';
import { toast } from 'sonner';

import { RichTextEditor } from '@/components/pops/RichTextEditor';
import { MarkdownPreview } from '@/components/pops/MarkdownPreview';
import { VersionHistory } from '@/components/pops/VersionHistory';
import { VisibilitySelector } from '@/components/pops/VisibilitySelector';
import { usePOPs, useCreatePOP, useUpdatePOP, POPInsert, POPVisibilityType, POPAudience } from '@/hooks/usePOPs';
import { useCreatePOPVersion } from '@/hooks/usePOPVersions';
import { useTICategories } from '@/hooks/useTICategories';
import { supabase } from '@/integrations/supabase/client';
import { isBlockContent, convertBlocksToMarkdown, parseContent } from '@/types/pop-blocks';
import { getTemplateById, applyTemplate } from '@/components/pops/tutorialTemplates';

export default function TutorialEditor() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const prefill = (location.state as { title?: string; content?: string; keywords?: string[]; category?: string } | null) || null;
  const templateId = searchParams.get('template');

  const { data: pops } = usePOPs();
  const { rootCategories, getSubcategories } = useTICategories('tickets');
  const createPOP = useCreatePOP();
  const updatePOP = useUpdatePOP();
  const createVersion = useCreatePOPVersion();

  const isEditing = !!id;
  const existingPOP = isEditing ? pops?.find(p => p.id === id) : null;

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const [visibilityType, setVisibilityType] = useState<POPVisibilityType>('all');
  const [visibilityDepartments, setVisibilityDepartments] = useState<string[]>([]);
  const [audience, setAudience] = useState<POPAudience>('staff');
  const [showPreview, setShowPreview] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize form data
  useEffect(() => {
    if (isInitialized) return;

    if (isEditing && existingPOP) {
      setTitle(existingPOP.title);
      setCategory(existingPOP.category || '');
      setSubcategory(existingPOP.subcategory || '');
      setKeywords(existingPOP.keywords || []);
      setVisibilityType(existingPOP.visibility_type || 'all');
      setVisibilityDepartments(existingPOP.visibility_departments || []);
      setAudience((existingPOP as any).audience || 'staff');
      
      // Convert blocks to markdown if needed
      if (isBlockContent(existingPOP.content)) {
        const blocks = parseContent(existingPOP.content);
        setContent(convertBlocksToMarkdown(blocks));
      } else {
        setContent(existingPOP.content);
      }
      setIsInitialized(true);
    } else if (!isEditing) {
      // Load template if selected
      if (templateId) {
        const template = getTemplateById(templateId);
        if (template) {
          const applied = applyTemplate(template);
          setTitle(applied.title);
          setCategory(applied.category);
          setSubcategory(applied.subcategory);
          setKeywords(applied.keywords);
          setContent(convertBlocksToMarkdown(applied.blocks));
        }
      } else if (prefill) {
        if (prefill.title) setTitle(prefill.title);
        if (prefill.content) setContent(prefill.content);
        if (prefill.keywords?.length) setKeywords(prefill.keywords);
        if (prefill.category) setCategory(prefill.category);
      } else {
        setContent('');
      }
      setIsInitialized(true);
    }
  }, [isEditing, existingPOP, isInitialized, templateId, prefill]);

  // Subcategories based on selected category
  const availableSubcategories = useMemo(() => {
    if (!category) return [];
    const parentCat = rootCategories.find(c => c.name === category);
    if (!parentCat) return [];
    return getSubcategories(parentCat.id);
  }, [category, rootCategories, getSubcategories]);

  // Reset subcategory when category changes
  useEffect(() => {
    if (!isEditing) {
      setSubcategory('');
    }
  }, [category, isEditing]);

  const handleAddKeyword = () => {
    const keyword = newKeyword.trim().toLowerCase();
    if (keyword && !keywords.includes(keyword)) {
      setKeywords([...keywords, keyword]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter(k => k !== keyword));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) throw new Error('User not associated with tenant');

    const fileName = `${profile.tenant_id}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { data, error } = await supabase.storage
      .from('pop-media')
      .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('pop-media')
      .getPublicUrl(data.path);

    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('O título é obrigatório');
      return;
    }

    if (!content.trim()) {
      toast.error('O conteúdo é obrigatório');
      return;
    }

    const data: POPInsert = {
      title: title.trim(),
      content: content,
      category: category || null,
      subcategory: subcategory || null,
      keywords,
      visibility_type: audience === 'customer' ? 'all' : visibilityType,
      visibility_departments: audience === 'customer' ? [] : (visibilityType === 'departments' ? visibilityDepartments : []),
      audience,
    };

    try {
      if (isEditing && id) {
        // Save version before updating
        await createVersion.mutateAsync({
          popId: id,
          data: {
            title: existingPOP?.title || title,
            content: existingPOP?.content || content,
            category: existingPOP?.category,
            subcategory: existingPOP?.subcategory,
            keywords: existingPOP?.keywords,
          },
          changeSummary: changeSummary || 'Atualização do artigo',
        });

        await updatePOP.mutateAsync({ id, data });
        navigate(tenantPath('/ti/pops'));
      } else {
        const created = await createPOP.mutateAsync(data);
        
        // Create initial version
        await createVersion.mutateAsync({
          popId: created.id,
          data: {
            title: data.title,
            content: data.content,
            category: data.category,
            subcategory: data.subcategory,
            keywords: data.keywords,
          },
          changeSummary: 'Versão inicial',
        });

        toast.success('Artigo criado com sucesso', {
          action: {
            label: 'Visualizar',
            onClick: () => navigate(tenantPath(`/portal/${created.id}`)),
          },
        });
        navigate(tenantPath('/ti/pops'));
      }
    } catch (error) {
      console.error('Error saving article:', error);
      toast.error('Erro ao salvar o artigo. Tente novamente ou avise o suporte.');
    }
  };

  const isSubmitting = createPOP.isPending || updatePOP.isPending || createVersion.isPending;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(tenantPath('/ti/pops'))}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">
              {isEditing ? 'Editar Artigo' : 'Novo Artigo'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowPreview(!showPreview)}
              className="gap-2"
            >
              {showPreview ? (
                <>
                  <Edit3 className="h-4 w-4" />
                  Editar
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4" />
                  Preview
                </>
              )}
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar' : 'Publicar'}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {!showPreview ? (
          <div className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-base">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Digite o título do artigo..."
                className="text-xl font-semibold h-12"
              />
            </div>

            {/* Content Editor */}
            <div className="space-y-2">
              <Label className="text-base">Conteúdo *</Label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Escreva seu artigo aqui...

Use a barra de ferramentas acima ou escreva em Markdown:
- **texto** para negrito
- *texto* para itálico
- ## Título para cabeçalhos
- - item para listas"
                onImageUpload={handleImageUpload}
                minHeight="400px"
              />
              <p className="text-xs text-muted-foreground">
                Dica: Use **texto** para negrito, *texto* para itálico, ## para títulos
              </p>
            </div>

            <Separator />

            {/* Metadata */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <Select 
                  value={category || "__none__"} 
                  onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {rootCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Subcategory */}
              {availableSubcategories.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="subcategory">Subcategoria</Label>
                  <Select 
                    value={subcategory || "__none__"} 
                    onValueChange={(v) => setSubcategory(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger id="subcategory">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {availableSubcategories.map((sub) => (
                        <SelectItem key={sub.id} value={sub.name}>
                          {sub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Keywords */}
            <div className="space-y-2">
              <Label>Palavras-chave</Label>
              <div className="flex gap-2">
                <Input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Digite e pressione Enter"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddKeyword}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {keywords.map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="gap-1">
                      <Tag className="h-3 w-3" />
                      {keyword}
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Audience selector */}
            <div className="space-y-2">
              <Label className="font-semibold">Para quem é este conteúdo?</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAudience('staff')}
                  className={`text-left rounded-md border p-3 transition ${audience === 'staff' ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                >
                  <p className="font-medium text-sm">Funcionários (interno)</p>
                  <p className="text-xs text-muted-foreground">Visível apenas para o time, com regras de visibilidade.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('customer')}
                  className={`text-left rounded-md border p-3 transition ${audience === 'customer' ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                >
                  <p className="font-medium text-sm">Clientes (público SAC)</p>
                  <p className="text-xs text-muted-foreground">Aparece no painel do cliente na Base de Conhecimento do SAC.</p>
                </button>
              </div>
            </div>

            {audience === 'staff' && (
              <>
                <Separator />
                {/* Visibility (apenas para conteúdo interno) */}
                <VisibilitySelector
                  visibilityType={visibilityType}
                  visibilityDepartments={visibilityDepartments}
                  onVisibilityTypeChange={setVisibilityType}
                  onDepartmentsChange={setVisibilityDepartments}
                />
              </>
            )}

            {/* Change Summary (only when editing) */}
            {isEditing && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="changeSummary" className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Resumo da alteração
                  </Label>
                  <Textarea
                    id="changeSummary"
                    value={changeSummary}
                    onChange={(e) => setChangeSummary(e.target.value)}
                    placeholder="Descreva brevemente o que foi alterado (opcional)"
                    className="resize-none"
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este resumo será salvo no histórico de versões do artigo.
                  </p>
                </div>
              </>
            )}

            {/* Version History (only when editing) */}
            {isEditing && id && (
              <>
                <Separator />
                <VersionHistory popId={id} currentTitle={title} />
              </>
            )}
          </div>
        ) : (
          /* Preview Mode */
          <div className="border rounded-lg p-8 bg-card min-h-[500px]">
            <article className="prose dark:prose-invert max-w-none">
              <h1 className="text-3xl font-bold mb-6">
                {title || 'Título do artigo'}
              </h1>
              <MarkdownPreview content={content} />
            </article>
          </div>
        )}
      </div>
    </div>
  );
}

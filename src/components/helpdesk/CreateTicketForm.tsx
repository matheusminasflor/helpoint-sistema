import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartmentMembers } from '@/hooks/useDepartmentMembers';
import { AssetSelector } from './AssetSelector';
import { AIRefineButton } from '@/components/ai/AIRefineButton';
import { DynamicFormFields, validateDynamicFields } from './DynamicFormFields';
import { POPSuggestionBanner, POPSuggestionLoading } from '@/components/pops/POPSuggestionBanner';
import { AdmissionAccessEditor } from './AdmissionAccessEditor';
import { PurchaseRequestFields, emptyPurchaseValue, validatePurchaseFields, type PurchaseFieldsValue } from '@/components/financeiro/PurchaseRequestFields';
import { useAbrirPedidoDeCompra } from '@/hooks/usePurchases';
import { Send, ChevronRight, Paperclip, X } from 'lucide-react';
import { enviarAnexosDoChamado } from '@/hooks/useTicketComments';
import { useCreateTicket } from '@/hooks/useHelpdesk';
import { useTICategories, type TICategory } from '@/hooks/useTICategories';
import { useTicketFormFields, useTicketFormResponses } from '@/hooks/useTicketFormFields';
import { useResponsaveisDaCategoria } from '@/hooks/useResponsaveisDaCategoria';
import { usePOPMatcher } from '@/hooks/usePOPMatcher';
import { useBatchCreateAccessGrants, type NewAccessGrant } from '@/hooks/useEmployeeAccessGrants';
import { useAuth } from '@/contexts/AuthContext';
import { normalizarSetor } from '@/lib/setores';
import { toast } from 'sonner';
import type { Asset, TicketPriority } from '@/types/helpdesk';
import type { Department } from '@/config/access-profile-schemas';
import { cn } from '@/lib/utils';

interface CreateTicketFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  module?: string;
}

const MODULE_LABELS: Record<string, { team: string; title: string; subtitle: string }> = {
  tickets: { team: 'equipe de TI', title: 'Novo Chamado', subtitle: 'Descreva seu problema para a equipe de TI' },
  marketing: { team: 'equipe de Marketing', title: 'Nova Solicitação MKT', subtitle: 'Descreva sua necessidade para o Marketing' },
  qualidade: { team: 'equipe de Qualidade', title: 'Novo Chamado de Qualidade', subtitle: 'Descreva sua solicitação para a equipe de Qualidade' },
  rh: { team: 'equipe de RH', title: 'Novo Chamado de RH', subtitle: 'Descreva sua solicitação para o RH' },
  financeiro: { team: 'equipe do Financeiro', title: 'Nova Solicitação Financeira', subtitle: 'Reembolsos, pagamentos e demais pedidos ao Financeiro' },
  compras: { team: 'equipe de Compras', title: 'Nova solicitação de compra', subtitle: 'O produto, o setor que paga e os três orçamentos' },
  comercial: { team: 'equipe Comercial', title: 'Solicitação comercial', subtitle: 'Descreva sua solicitação para a equipe Comercial' },
  educacional: { team: 'equipe do Educacional', title: 'Solicitação ao Educacional', subtitle: 'Descreva sua solicitação para a equipe do Educacional' },
  expedicao: { team: 'equipe da Expedição', title: 'Solicitação à Expedição', subtitle: 'Envio, rastreio, entrega, avaria ou troca' },
  producao: { team: 'equipe da Produção', title: 'Solicitação à Produção', subtitle: 'Ordem de produção, matéria-prima, lote ou manutenção' },
};

const QUALQUER_ATENDENTE = 'qualquer';

// Anexar já na abertura (decisão do dono, 2026-10-02), em todo setor. Mesmas regras da resposta
// (`ReplyComposer`): 10 MB por arquivo e os tipos que o balde aceita.
const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
const ANEXO_ACEITA = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';

const PRIORITIES = [
  { value: 'low' as const, label: 'Baixa', dotClass: 'bg-status-success', selectedClass: 'bg-status-success text-white border-status-success ' },
  { value: 'medium' as const, label: 'Normal', dotClass: 'bg-status-warning', selectedClass: 'bg-status-warning text-white border-status-warning ' },
  { value: 'high' as const, label: 'Alta', dotClass: 'bg-status-warning', selectedClass: 'bg-status-warning text-white border-status-warning ' },
  { value: 'critical' as const, label: 'Crítica', dotClass: 'bg-status-danger', selectedClass: 'bg-status-danger text-white border-status-danger ' },
];

export function CreateTicketForm({ onSuccess, onCancel, module = 'tickets' }: CreateTicketFormProps) {
  const { user, profile } = useAuth();
  const { createTicket, isCreating: criandoChamado } = useCreateTicket();
  const batchCreateGrants = useBatchCreateAccessGrants();
  const abrirPedido = useAbrirPedidoDeCompra();
  const isCreating = criandoChamado || abrirPedido.isPending;
  const categoryModule = module as any;
  const { rootCategories, getSubcategories, isLoading: isLoadingCategories } = useTICategories(categoryModule);
  const labels = MODULE_LABELS[module] || MODULE_LABELS.tickets;
  const { isChecking: isCheckingPOP, matchedPOP, checkForPOP, clearMatch } = usePOPMatcher();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TICategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<TICategory | null>(null);
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>({});
  const [dynamicErrors, setDynamicErrors] = useState<Record<string, string>>({});
  const [popDismissed, setPopDismissed] = useState(false);
  const [admissionGrants, setAdmissionGrants] = useState<NewAccessGrant[]>([]);
  const [anexos, setAnexos] = useState<File[]>([]);
  const anexoInputRef = useRef<HTMLInputElement>(null);
  const escolherAnexos = (lista: FileList | null) => {
    const novos = Array.from(lista ?? []);
    const grandes = novos.filter((f) => f.size > ANEXO_MAX_BYTES);
    if (grandes.length) toast.error(`Arquivo acima de 10 MB: ${grandes.map((f) => f.name).join(', ')}`);
    setAnexos((prev) => [...prev, ...novos.filter((f) => f.size <= ANEXO_MAX_BYTES)]);
    if (anexoInputRef.current) anexoInputRef.current.value = '';
  };
  // Quem vai atender (decisão do dono, 2026-09-30): opcional, em todo setor, só com as pessoas do
  // setor que atende. Sem escolha o chamado cai na fila do setor, como antes; com escolha, o aviso
  // vai só para a pessoa (`20260908020000_chamado_avisa_dos_dois_lados`).
  const setorQueAtende = module === 'tickets' ? 'ti' : module;
  const { members: atendentes } = useDepartmentMembers(setorQueAtende);
  const [atendente, setAtendente] = useState<string>(QUALQUER_ATENDENTE);
  // O setor vem do PERFIL, que é onde o convite e a tela de perfil gravam. Até a
  // leva I isto lia `user_metadata.department`, que nada neste sistema escreve:
  // 5 de 5 pessoas tinham setor no perfil e 0 no metadado, então toda compra
  // nascia sem setor e o teto de gasto por setor nunca podia disparar.
  const [purchase, setPurchase] = useState<PurchaseFieldsValue>(
    () => emptyPurchaseValue(profile?.department),
  );

  // O perfil chega depois do primeiro render (a busca é adiada no AuthContext).
  // Sugere o setor quando ele aparecer, sem pisar em cima de uma escolha já
  // feita — senão trocar o setor à mão seria desfeito pelo perfil ao carregar.
  useEffect(() => {
    const sugerido = normalizarSetor(profile?.department);
    if (!sugerido) return;
    setPurchase(prev => (prev.setor ? prev : { ...prev, setor: sugerido }));
  }, [profile?.department]);

  // A marcação da categoria, e não o nome dela. Com `/compra/i`, renomear
  // "Compra de material" para "Aquisição de material" desligava o formulário de
  // compra inteiro — sumia produto, orçamento e aprovação — sem nada acusar.
  // A coluna `is_purchase` nasceu ligada em quem o teste antigo pegava.
  // `'compras'` desde 2026-09-28: o chamado da compra mudou de módulo junto com as
  // telas (leva N). Era `'financeiro'`, e era por isso que a caixa de entrada do
  // Financeiro continuava mostrando compra.
  const isPurchase =
    module === 'compras'
    && !!(selectedSubcategory?.is_purchase ?? selectedCategory?.is_purchase);

  const isAdmission = module === 'rh' && /^admiss/i.test(selectedSubcategory?.name || '');
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const activeCategoryId = selectedSubcategory?.id || selectedCategory?.id;
  const { fields } = useTicketFormFields(activeCategoryId);
  const { saveResponses } = useTicketFormResponses();
  const subcategories = selectedCategory ? getSubcategories(selectedCategory.id) : [];
  // Quem sempre atende esta categoria (decisão do dono, 2026-10-03; 20261126010000). Com uma pessoa
  // o campo vem preenchido e travado; com várias, só elas aparecem. Já vem com a herança da
  // categoria de cima e só com quem ainda tem o setor.
  const { data: responsaveis = [] } = useResponsaveisDaCategoria(activeCategoryId);
  const responsavelUnico = responsaveis.length === 1 ? responsaveis[0] : null;
  // A categoria que já pede o atendente no formulário dela manda: o campo fixo sai, para não haver
  // dois. Responsável definido manda acima dos dois.
  const categoriaPedeAtendente = responsaveis.length === 0 && fields.some(f => f.field_type === 'assignee_select');

  // Reset subcategory and dynamic values when category changes
  useEffect(() => {
    setSelectedSubcategory(null);
    setDynamicValues({});
    setDynamicErrors({});
  }, [selectedCategory?.id]);

  // Trocar de categoria troca quem pode atender: a escolha anterior não vale mais.
  useEffect(() => {
    setAtendente(QUALQUER_ATENDENTE);
  }, [activeCategoryId]);

  useEffect(() => {
    setDynamicValues({});
    setDynamicErrors({});
  }, [selectedSubcategory?.id]);

  // Debounced POP matching
  useEffect(() => {
    if (popDismissed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (title.trim().length >= 5) {
      debounceRef.current = setTimeout(() => {
        const categoryName = selectedSubcategory?.name || selectedCategory?.name;
        checkForPOP(title, description, categoryName);
      }, 800);
    } else {
      clearMatch();
    }

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [title, description, selectedCategory?.name, selectedSubcategory?.name, popDismissed, checkForPOP, clearMatch]);

  const handleDynamicFieldChange = (fieldId: string, value: string) => {
    setDynamicValues(prev => ({ ...prev, [fieldId]: value }));
    if (value.trim()) {
      setDynamicErrors(prev => { const next = { ...prev }; delete next[fieldId]; return next; });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) { toast.error('Preencha o título e a descrição'); return; }
    if (isPurchase) {
      const purchaseError = validatePurchaseFields(purchase);
      if (purchaseError) { toast.error(purchaseError); return; }
    }
    const errors = validateDynamicFields(fields, dynamicValues);
    if (Object.keys(errors).length > 0) { setDynamicErrors(errors); toast.error('Preencha todos os campos obrigatórios'); return; }

    // Extract special fields from dynamic values
    let dueDate: string | undefined;
    let assignedTo: string | undefined =
      !categoriaPedeAtendente && atendente !== QUALQUER_ATENDENTE ? atendente : undefined;

    for (const field of fields) {
      const val = dynamicValues[field.id];
      if (!val) continue;
      if (field.field_type === 'delivery_datetime') {
        dueDate = val;
      } else if (field.field_type === 'assignee_select' && responsaveis.length === 0) {
        assignedTo = val;
      }
    }

    // Responsável da categoria manda (o banco garante o mesmo, `chamado_vai_para_o_responsavel`).
    if (responsavelUnico) {
      assignedTo = responsavelUnico.id;
    } else if (responsaveis.length > 1 && !responsaveis.some(r => r.id === assignedTo)) {
      toast.error('Escolha quem vai atender entre os responsáveis desta categoria.');
      return;
    }

    try {
      const chamado = {
        title: title.trim(),
        description: description.trim(),
        category_id: selectedSubcategory?.id || selectedCategory?.id,
        category: selectedCategory?.name,
        subcategory: selectedSubcategory?.name,
        priority,
        due_date: dueDate,
        assigned_to: assignedTo,
      };
      // Compra nasce inteira no banco — chamado, pedido e orçamentos juntos (LEVA P). O
      // resto dos chamados segue pelo caminho de sempre.
      const ticket = isPurchase
        ? await abrirPedido.mutateAsync({
            chamado,
            input: {
              product_id: purchase.productId,
              product_name: purchase.productName,
              product_link: purchase.productLink,
              department: purchase.setor || null,
              quotes: purchase.quotes,
            },
          })
        : await createTicket({
            ...chamado,
            asset_id: module === 'tickets' ? selectedAsset?.id : undefined,
            module,
          });

      if (ticket && fields.length > 0) {
        const responses = Object.entries(dynamicValues)
          .filter(([_, value]) => value.trim())
          .map(([fieldId, value]) => ({ ticket_id: ticket.id, field_id: fieldId, value }));
        if (responses.length > 0) await saveResponses.mutateAsync(responses);
      }

      // Admissão: salva acessos liberados ligados ao colaborador (requester = próprio usuário)
      if (ticket && isAdmission && admissionGrants.length > 0 && user) {
        const validGrants = admissionGrants.filter(g => g.name.trim());
        if (validGrants.length > 0) {
          await batchCreateGrants.mutateAsync({
            employeeId: user.id,
            employeeName: user.user_metadata?.full_name || user.email || 'Colaborador',
            ticketId: ticket.id,
            grants: validGrants,
          });
        }
      }

      // Os anexos sobem depois do chamado existir (o caminho do arquivo leva o id dele). Se algum
      // falhar, o chamado já está aberto: dizer isso, e não "erro ao abrir chamado".
      if (ticket && anexos.length > 0 && user) {
        try {
          await enviarAnexosDoChamado(user.id, ticket.id, null, anexos);
        } catch (erroAnexo) {
          console.error('Erro ao anexar na abertura:', erroAnexo);
          toast.error('O chamado foi aberto, mas um anexo não subiu. Anexe de novo pela conversa do chamado.');
          onSuccess();
          return;
        }
      }

      toast.success('Chamado aberto com sucesso');
      onSuccess();
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      const msg = error?.message || error?.error_description || error?.details || 'Erro ao abrir chamado';
      toast.error(`Erro ao abrir chamado: ${msg}`);
    }
  };

  const handlePOPSolved = () => { toast.success('Ótimo! Se tiver outras dúvidas, estamos aqui para ajudar.'); onSuccess(); };
  const handlePOPProceed = () => { setPopDismissed(true); clearMatch(); };

  const handleCategoryClick = (category: TICategory) => {
    setPopDismissed(false);
    setSelectedCategory(selectedCategory?.id === category.id ? null : category);
  };

  const handleSubcategoryClick = (subcategory: TICategory) => {
    setPopDismissed(false);
    setSelectedSubcategory(selectedSubcategory?.id === subcategory.id ? null : subcategory);
  };

  const isSubmitBlocked = !!matchedPOP && !popDismissed;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{labels.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{labels.subtitle}</p>
      </div>

      {/* Category Selection — Interactive Cards */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Categoria *</label>
        {isLoadingCategories ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-14 bg-surface-1 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : rootCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria configurada. Entre em contato com o TI.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {rootCategories.map(cat => {
              const isSelected = selectedCategory?.id === cat.id;
              const hasSubs = getSubcategories(cat.id).length > 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryClick(cat)}
                  className={cn(
                    'flex items-center justify-between p-4 text-sm font-medium text-left rounded-xl border transition-all duration-200',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20 '
                      : 'bg-card border-border text-foreground hover:-translate-y-0.5 hover: hover:border-primary/30'
                  )}
                >
                  <span>{cat.name}</span>
                  {hasSubs && (
                    <ChevronRight className={cn(
                      'w-4 h-4 text-muted-foreground transition-transform duration-200',
                      isSelected && 'rotate-90 text-primary'
                    )} />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Subcategory Selection — Smaller interactive cards */}
      {selectedCategory && subcategories.length > 0 && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <label className="text-sm font-medium text-foreground">Subcategoria</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {subcategories.map(sub => {
              const isSelected = selectedSubcategory?.id === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleSubcategoryClick(sub)}
                  className={cn(
                    'p-3 text-sm text-left rounded-xl border transition-all duration-200',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'bg-card border-border text-muted-foreground hover:-translate-y-0.5 hover: hover:border-primary/30'
                  )}
                >
                  {sub.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dynamic Form Fields */}
      {activeCategoryId && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <DynamicFormFields
            categoryId={activeCategoryId}
            values={dynamicValues}
            onChange={handleDynamicFieldChange}
            errors={dynamicErrors}
            department={module === 'tickets' ? 'ti' : (module as Department)}
          />
        </div>
      )}

      {/* Campos de compra (Financeiro → Compras) */}
      {isPurchase && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <PurchaseRequestFields value={purchase} onChange={setPurchase} />
        </div>
      )}

      {/* Admission Access Editor */}
      {isAdmission && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <AdmissionAccessEditor value={admissionGrants} onChange={setAdmissionGrants} />
        </div>
      )}

      {/* POP Suggestion Banner */}
      {isCheckingPOP && !popDismissed && <POPSuggestionLoading />}
      {matchedPOP && !popDismissed && (
        <POPSuggestionBanner pop={matchedPOP} onProceed={handlePOPProceed} onSolved={handlePOPSolved} />
      )}

      {/* Title */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="title" className="text-sm font-medium text-foreground">
            Título da demanda *
          </label>
          <AIRefineButton text={title} context="ticket_title" onRefine={setTitle} disabled={!title.trim()} />
        </div>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Arte para o post da feira, Computador não liga..."
          className="text-base rounded-xl border-border bg-card placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:border-primary/40"
        />
      </div>

      {/* Priority — Pill Badges */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Urgência</label>
        <div className="flex gap-2 flex-wrap">
          {PRIORITIES.map(p => {
            const isSelected = priority === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium border transition-all duration-200',
                  isSelected
                    ? p.selectedClass
                    : 'bg-card border-border text-muted-foreground hover:border-border hover:bg-background'
                )}
              >
                {!isSelected && <div className={cn('w-2 h-2 rounded-full', p.dotClass)} />}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {responsavelUnico ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Quem vai atender</label>
          <Select value={responsavelUnico.id} disabled>
            <SelectTrigger className="rounded-xl border-border bg-card" aria-label="Quem vai atender">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={responsavelUnico.id}>{responsavelUnico.full_name || 'Responsável da categoria'}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Esta categoria é sempre atendida por esta pessoa.</p>
        </div>
      ) : responsaveis.length > 1 ? (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Quem vai atender *</label>
          {/* Valor vazio mostra o texto de "escolha": ninguém vem marcado por padrão. */}
          <Select value={responsaveis.some(r => r.id === atendente) ? atendente : ''} onValueChange={setAtendente}>
            <SelectTrigger className="rounded-xl border-border bg-card" aria-label="Quem vai atender">
              <SelectValue placeholder="Escolha entre os responsáveis desta categoria" />
            </SelectTrigger>
            <SelectContent>
              {responsaveis.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.full_name || 'Sem nome'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Esta categoria é atendida só por estas pessoas.</p>
        </div>
      ) : !categoriaPedeAtendente && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Quem vai atender</label>
          <Select value={atendente} onValueChange={setAtendente}>
            <SelectTrigger className="rounded-xl border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={QUALQUER_ATENDENTE}>Qualquer pessoa da {labels.team}</SelectItem>
              {atendentes.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Asset Selector — apenas TI */}
      {module === 'tickets' && (
        <AssetSelector
          selectedAsset={selectedAsset}
          onSelect={setSelectedAsset}
          ticketCategory={selectedCategory?.name || ''}
        />
      )}

      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="description" className="text-sm font-medium text-foreground">
            Descrição Detalhada *
          </label>
          <AIRefineButton text={description} context="ticket_description" onRefine={setDescription} disabled={!description.trim()} />
        </div>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva o problema com o máximo de detalhes possível: O que aconteceu? Quando começou? Já tentou alguma solução?"
          className="w-full min-h-[140px] p-4 bg-card border border-border text-sm resize-none rounded-xl placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-colors"
        />
      </div>

      {/* Anexos — já na abertura */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Anexos <span className="font-normal text-muted-foreground">(opcional)</span></label>
        <input ref={anexoInputRef} type="file" multiple accept={ANEXO_ACEITA} className="hidden"
          onChange={(e) => escolherAnexos(e.target.files)} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl"
            onClick={() => anexoInputRef.current?.click()}>
            <Paperclip className="w-4 h-4" aria-hidden="true" /> Anexar arquivo
          </Button>
          <span className="text-[12px] text-muted-foreground">Imagem, PDF, Word, Excel, texto ou ZIP — até 10 MB cada.</span>
        </div>
        {anexos.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {anexos.map((f, i) => (
              <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs">
                <span className="max-w-[200px] truncate">{f.name}</span>
                <button type="button" aria-label={`Tirar ${f.name}`} className="text-muted-foreground hover:text-foreground"
                  onClick={() => setAnexos((prev) => prev.filter((_, j) => j !== i))}>
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1 rounded-xl bg-card border-border hover:bg-background text-foreground"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isCreating || !title.trim() || !description.trim() || !selectedCategory || isSubmitBlocked}
          className={cn(
            'flex-1 gap-2 rounded-xl ',
            isSubmitBlocked && 'opacity-50 cursor-not-allowed'
          )}
          title={isSubmitBlocked ? 'Verifique o tutorial sugerido antes de enviar' : undefined}
        >
          <Send className="w-4 h-4" />
          {isCreating ? 'Enviando...' : 'Abrir Chamado'}
        </Button>
      </div>
    </form>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AssetSelector } from './AssetSelector';
import { AIRefineButton } from '@/components/ai/AIRefineButton';
import { DynamicFormFields, validateDynamicFields } from './DynamicFormFields';
import { POPSuggestionBanner, POPSuggestionLoading } from '@/components/pops/POPSuggestionBanner';
import { AdmissionAccessEditor } from './AdmissionAccessEditor';
import { PurchaseRequestFields, emptyPurchaseValue, validatePurchaseFields, type PurchaseFieldsValue } from '@/components/financeiro/PurchaseRequestFields';
import { useCreatePurchaseRequest } from '@/hooks/usePurchases';
import { Send, ChevronRight } from 'lucide-react';
import { useCreateTicket } from '@/hooks/useHelpdesk';
import { useTICategories, type TICategory } from '@/hooks/useTICategories';
import { useTicketFormFields, useTicketFormResponses } from '@/hooks/useTicketFormFields';
import { usePOPMatcher } from '@/hooks/usePOPMatcher';
import { useBatchCreateAccessGrants, type NewAccessGrant } from '@/hooks/useEmployeeAccessGrants';
import { useAuth } from '@/contexts/AuthContext';
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
  financeiro: { team: 'equipe do Financeiro', title: 'Nova Solicitação Financeira', subtitle: 'Compras, reembolsos e demais pedidos ao Financeiro' },
  comercial: { team: 'equipe Comercial', title: 'Solicitação comercial', subtitle: 'Descreva sua solicitação para a equipe Comercial' },
  educacional: { team: 'equipe do Educacional', title: 'Solicitação ao Educacional', subtitle: 'Descreva sua solicitação para a equipe do Educacional' },
};

const PRIORITIES = [
  { value: 'low' as const, label: 'Baixa', dotClass: 'bg-emerald-500', selectedClass: 'bg-emerald-500 text-white border-emerald-500 ' },
  { value: 'medium' as const, label: 'Normal', dotClass: 'bg-amber-500', selectedClass: 'bg-amber-500 text-white border-amber-500 ' },
  { value: 'high' as const, label: 'Alta', dotClass: 'bg-orange-500', selectedClass: 'bg-orange-500 text-white border-orange-500 ' },
  { value: 'critical' as const, label: 'Crítica', dotClass: 'bg-red-500', selectedClass: 'bg-red-500 text-white border-red-500 ' },
];

export function CreateTicketForm({ onSuccess, onCancel, module = 'tickets' }: CreateTicketFormProps) {
  const { user } = useAuth();
  const { createTicket, isCreating } = useCreateTicket();
  const batchCreateGrants = useBatchCreateAccessGrants();
  const createPurchase = useCreatePurchaseRequest();
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
  const [purchase, setPurchase] = useState<PurchaseFieldsValue>(emptyPurchaseValue);

  const isPurchase =
    module === 'financeiro' && /compra/i.test(selectedSubcategory?.name || selectedCategory?.name || '');

  const isAdmission = module === 'rh' && /^admiss/i.test(selectedSubcategory?.name || '');
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const activeCategoryId = selectedSubcategory?.id || selectedCategory?.id;
  const { fields } = useTicketFormFields(activeCategoryId);
  const { saveResponses } = useTicketFormResponses();
  const subcategories = selectedCategory ? getSubcategories(selectedCategory.id) : [];

  // Reset subcategory and dynamic values when category changes
  useEffect(() => {
    setSelectedSubcategory(null);
    setDynamicValues({});
    setDynamicErrors({});
  }, [selectedCategory?.id]);

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
    let assignedTo: string | undefined;
    
    for (const field of fields) {
      const val = dynamicValues[field.id];
      if (!val) continue;
      if (field.field_type === 'delivery_datetime') {
        dueDate = val;
      } else if (field.field_type === 'assignee_select') {
        assignedTo = val;
      }
    }

    try {
      const ticket = await createTicket({
        title: title.trim(),
        description: description.trim(),
        category_id: selectedSubcategory?.id || selectedCategory?.id,
        category: selectedCategory?.name,
        subcategory: selectedSubcategory?.name,
        priority,
        asset_id: module === 'tickets' ? selectedAsset?.id : undefined,
        due_date: dueDate,
        assigned_to: assignedTo,
        module,
      });

      
      if (ticket && fields.length > 0) {
        const responses = Object.entries(dynamicValues)
          .filter(([_, value]) => value.trim())
          .map(([fieldId, value]) => ({ ticket_id: ticket.id, field_id: fieldId, value }));
        if (responses.length > 0) await saveResponses.mutateAsync(responses);
      }

      // Compras: registra solicitação, orçamentos e anexos
      if (ticket && isPurchase) {
        await createPurchase.mutateAsync({
          ticketId: ticket.id,
          input: {
            product_id: purchase.productId,
            product_name: purchase.productName,
            product_link: purchase.productLink,
            department: (user?.user_metadata as { department?: string } | undefined)?.department || null,
            quotes: purchase.quotes,
          },
        });
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
            Resumo do Problema *
          </label>
          <AIRefineButton text={title} context="ticket_title" onRefine={setTitle} disabled={!title.trim()} />
        </div>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Computador não liga, Erro ao acessar sistema..."
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
                    : 'bg-card border-border text-muted-foreground hover:border-slate-300 hover:bg-background'
                )}
              >
                {!isSelected && <div className={cn('w-2 h-2 rounded-full', p.dotClass)} />}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

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

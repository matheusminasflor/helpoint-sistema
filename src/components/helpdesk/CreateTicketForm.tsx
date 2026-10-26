import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';
import { categoriaVirouPedido } from '@/config/solicitacoes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartmentMembers } from '@/hooks/useDepartmentMembers';
import { AssetSelector } from './AssetSelector';
import { AIRefineButton } from '@/components/ai/AIRefineButton';
import { DynamicFormFields, validateDynamicFields } from './DynamicFormFields';
import { POPSuggestionBanner, POPSuggestionLoading } from '@/components/pops/POPSuggestionBanner';
import { AdmissionAccessEditor } from './AdmissionAccessEditor';
import { Send, ChevronRight, Paperclip, X } from 'lucide-react';
import { enviarAnexosDoChamado } from '@/hooks/useTicketComments';
import { useCreateTicket } from '@/hooks/useHelpdesk';
import { useTICategories, type TICategory } from '@/hooks/useTICategories';
import { useTicketFormFields, useTicketFormResponses } from '@/hooks/useTicketFormFields';
import { useResponsaveisDaCategoria } from '@/hooks/useResponsaveisDaCategoria';
import { usePOPMatcher } from '@/hooks/usePOPMatcher';
import { useBatchCreateAccessGrants, type NewAccessGrant } from '@/hooks/useEmployeeAccessGrants';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Asset, TicketPriority } from '@/types/helpdesk';
import type { Department } from '@/config/access-profile-schemas';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useSLAPolicies, prazoEmTexto, minutosDoDia } from '@/hooks/useSLAPolicies';
import { usePessoasDaEmpresa } from '@/hooks/useProjetos';

interface CreateTicketFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  module?: string;
  /** Avisa a tela quando há texto escrito, para "Voltar" perguntar antes de apagar (defeito 19, 2026-10-24). */
  onRascunhoChange?: (temTexto: boolean) => void;
  /** Vindos do "O que você precisa?" (2026-10-24): a categoria sugerida pelo texto e o próprio texto, na descrição. */
  categoriaInicialId?: string;
  textoInicial?: string;
}

const MODULE_LABELS: Record<string, { team: string; title: string; subtitle: string }> = {
  tickets: { team: 'equipe de TI', title: 'Novo Chamado', subtitle: 'Descreva seu problema para a equipe de TI' },
  marketing: { team: 'equipe de Marketing', title: 'Novo chamado ao Marketing', subtitle: 'Descreva sua necessidade para o Marketing' },
  qualidade: { team: 'equipe de Qualidade', title: 'Novo Chamado de Qualidade', subtitle: 'Descreva o que aconteceu para a equipe de Qualidade' },
  rh: { team: 'equipe de RH', title: 'Novo Chamado de RH', subtitle: 'Descreva o que aconteceu para o RH' },
  financeiro: { team: 'equipe do Financeiro', title: 'Novo chamado ao Financeiro', subtitle: 'Nota fiscal, boleto, pagamento a fornecedor, cobrança' },
  // A compra é pedido (rodada 2): as categorias de Compras levam a Novo › Pedido › Compra (`categoriaVirouPedido`).
  compras: { team: 'equipe de Compras', title: 'Compras', subtitle: 'Compra se pede em Novo › Pedido › Compra' },
  comercial: { team: 'equipe Comercial', title: 'Novo chamado ao Comercial', subtitle: 'Descreva o que aconteceu para a equipe Comercial' },
  educacional: { team: 'equipe do Educacional', title: 'Novo chamado ao Educacional', subtitle: 'Descreva o que aconteceu para a equipe do Educacional' },
  expedicao: { team: 'equipe da Expedição', title: 'Novo chamado à Expedição', subtitle: 'Envio, rastreio, entrega, avaria ou troca' },
  producao: { team: 'equipe da Produção', title: 'Novo chamado à Produção', subtitle: 'Ordem de produção, matéria-prima, lote ou manutenção' },
};

const QUALQUER_ATENDENTE = 'qualquer';

// Anexar já na abertura (decisão do dono, 2026-10-02), em todo setor. Mesmas regras da resposta
// (`ReplyComposer`): 10 MB por arquivo e os tipos que o balde aceita.
const ANEXO_MAX_BYTES = 10 * 1024 * 1024;
const ANEXO_ACEITA = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip';

// Média e Alta tinham a mesma cor (etapa 4 · Chamados, 2026-10-24): Baixa e Média neutras, Alta âmbar, Crítica vermelha.
const PRIORITIES = [
  { value: 'low' as const, label: 'Baixa', dotClass: 'bg-status-muted', selectedClass: 'bg-primary text-primary-foreground border-primary ' },
  { value: 'medium' as const, label: 'Média', dotClass: 'bg-status-muted', selectedClass: 'bg-primary text-primary-foreground border-primary ' },
  { value: 'high' as const, label: 'Alta', dotClass: 'bg-status-warning', selectedClass: 'bg-status-warning text-white border-status-warning ' },
  { value: 'critical' as const, label: 'Crítica', dotClass: 'bg-status-danger', selectedClass: 'bg-status-danger text-white border-status-danger ' },
];

export function CreateTicketForm({ onSuccess, onCancel, module = 'tickets', onRascunhoChange, categoriaInicialId, textoInicial }: CreateTicketFormProps) {
  const { user, tenantId, role } = useAuth();
  // Abrir em nome de outra pessoa (2026-10-15): caixinha própria em "Chamados" desde 2026-10-24 (vale em qualquer
  // setor em que estiver ligada) — a mesma pergunta do banco, `pode_abrir_em_nome_de_outro`.
  const [emNomeDe, setEmNomeDe] = useState('');
  const { data: pessoasDaEmpresa = [] } = usePessoasDaEmpresa();
  const { data: atendoAlgumSetor = false } = useQuery({
    queryKey: ['abro-em-nome-de-outro', tenantId, user?.id, role],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => !!unwrap(await supabase.rpc('pode_abrir_em_nome_de_outro' as never)),
  });
  const { createTicket, isCreating: criandoChamado } = useCreateTicket();
  const batchCreateGrants = useBatchCreateAccessGrants();
  const isCreating = criandoChamado;
  const categoryModule = module as any;
  const tenantPath = useTenantPath();
  const { rootCategories, getSubcategories, isLoading: isLoadingCategories } = useTICategories(categoryModule);
  const labels = MODULE_LABELS[module] || MODULE_LABELS.tickets;
  const { isChecking: isCheckingPOP, matchedPOP, checkForPOP, clearMatch } = usePOPMatcher();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState(textoInicial ?? '');
  const [selectedCategory, setSelectedCategory] = useState<TICategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<TICategory | null>(null);
  // O terceiro nível (dono, 2026-10-13: Software › Forteplus › Correções e Ajustes); obrigatório quando existe.
  const [selectedItem, setSelectedItem] = useState<TICategory | null>(null);
  // A categoria sugerida pelo "O que você precisa?" já vem marcada (uma vez, quando as categorias chegam).
  const [jaSugeriu, setJaSugeriu] = useState(false);
  useEffect(() => {
    if (jaSugeriu || !categoriaInicialId || rootCategories.length === 0) return;
    setJaSugeriu(true);
    const raiz = rootCategories.find((c) => c.id === categoriaInicialId);
    if (raiz) { setSelectedCategory(raiz); return; }
    for (const r of rootCategories) {
      const sub = getSubcategories(r.id).find((c) => c.id === categoriaInicialId);
      if (sub) { setSelectedCategory(r); setSelectedSubcategory(sub); return; }
    }
  }, [jaSugeriu, categoriaInicialId, rootCategories, getSubcategories]);
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

  const isAdmission = module === 'rh' && /^admiss/i.test(selectedSubcategory?.name || '');
  // Admissão e desligamento são de UMA PESSOA, que não é quem abre (dono, 2026-10-20): o desligamento tratava o RH que
  // abria como quem saía. O banco recusa desligamento sem ela (20270129100000).
  const isDesligamento = module === 'rh' && /^desligamento/i.test(selectedSubcategory?.name || '');
  const [colaboradorId, setColaboradorId] = useState('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const activeCategoryId = selectedItem?.id || selectedSubcategory?.id || selectedCategory?.id;
  const itens = selectedSubcategory ? getSubcategories(selectedSubcategory.id) : [];
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

  const { prazos, expediente } = useSLAPolicies(module);
  const tempoDeSolucao = (p: TicketPriority) => {
    const prazo = prazos.find((x) => x.priority === p);
    return (prazo?.doSetor ?? prazo?.padrao)?.resolution_time ?? null;
  };

  // Viagem (dono, 2026-10-08; 20261219020000): quem vai atender — ou a equipe toda — está fora? O banco
  // conta o prazo da volta; aqui só se avisa quem está abrindo.
  const campoDoAtendente = categoriaPedeAtendente ? fields.find(f => f.field_type === 'assignee_select') : undefined;
  // `|| null`: o seletor devolve "" quando a escolha some (troca de categoria), e "" não é uma pessoa — a
  // consulta da viagem recusava com "invalid input syntax for type uuid" (dono, 2026-10-14).
  const atendenteDoChamado = (responsavelUnico?.id
    ?? (campoDoAtendente ? dynamicValues[campoDoAtendente.id] || null : atendente !== QUALQUER_ATENDENTE ? atendente : null)) || null;
  const nomeDeQuemAtende = atendenteDoChamado
    ? (responsavelUnico?.full_name ?? atendentes.find(a => a.id === atendenteDoChamado)?.full_name ?? 'Quem vai atender')
    : null;
  const { data: voltaDaViagem } = useQuery({
    queryKey: ['aviso-de-viagem', tenantId, module, atendenteDoChamado],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.rpc('aviso_de_viagem' as never,
      { p_module: module, p_atendente: atendenteDoChamado } as never)) as string | null,
  });

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
    setSelectedItem(null);
    setDynamicValues({});
    setDynamicErrors({});
  }, [selectedSubcategory?.id]);

  useEffect(() => {
    setDynamicValues({});
    setDynamicErrors({});
  }, [selectedItem?.id]);

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
    if (itens.length > 0 && !selectedItem) { toast.error(`Escolha uma opção dentro de "${selectedSubcategory?.name}".`); return; }
    if ((isAdmission || isDesligamento) && !colaboradorId) {
      toast.error(isDesligamento ? 'Escolha o colaborador que está saindo.' : 'Escolha o colaborador que está entrando.');
      return;
    }
    const errors = validateDynamicFields(fields, dynamicValues);
    if (Object.keys(errors).length > 0) { setDynamicErrors(errors); toast.error('Preencha todos os campos obrigatórios'); return; }

    // Extract special fields from dynamic values
    let dueDate: string | undefined;
    let assignedTo: string | undefined =
      !categoriaPedeAtendente && atendente !== QUALQUER_ATENDENTE ? atendente || undefined : undefined;

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
        category_id: activeCategoryId,
        category: selectedCategory?.name,
        // O caminho abaixo da principal: "Forteplus › Correções e Ajustes" (o banco faz o mesmo ao transferir).
        subcategory: selectedSubcategory ? selectedSubcategory.name + (selectedItem ? ` › ${selectedItem.name}` : "") : undefined,
        priority,
        due_date: dueDate,
        assigned_to: assignedTo,
      };
      // A compra não passa mais por aqui (rodada 2): é pedido, em Novo › Pedido › Compra.
      const ticket = await createTicket({
        ...chamado,
        asset_id: module === 'tickets' ? selectedAsset?.id : undefined,
        module,
        requester_id: emNomeDe || undefined,
        colaborador_id: isAdmission || isDesligamento ? colaboradorId : undefined,
      });

      if (ticket && fields.length > 0) {
        const responses = Object.entries(dynamicValues)
          .filter(([_, value]) => value.trim())
          .map(([fieldId, value]) => ({ ticket_id: ticket.id, field_id: fieldId, value }));
        if (responses.length > 0) await saveResponses.mutateAsync(responses);
      }

      // Admissão: os acessos liberados ficam no nome de quem entra (antes iam para quem abria o chamado).
      if (ticket && isAdmission && admissionGrants.length > 0 && colaboradorId) {
        const validGrants = admissionGrants.filter(g => g.name.trim());
        if (validGrants.length > 0) {
          await batchCreateGrants.mutateAsync({
            employeeId: colaboradorId,
            employeeName: pessoasDaEmpresa.find((p) => p.id === colaboradorId)?.nome || 'Colaborador',
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

  // O que falta para abrir (defeito 18, 2026-10-24): o botão ficava cinza sem dizer por quê, e a pessoa travava.
  const falta = [
    !selectedCategory && 'a categoria',
    itens.length > 0 && !selectedItem && 'o item da subcategoria',
    !title.trim() && 'o título',
    !description.trim() && 'a descrição',
  ].filter(Boolean) as string[];
  const faltaEmTexto = falta.length <= 1 ? falta.join('') : `${falta.slice(0, -1).join(', ')} e ${falta.at(-1)}`;
  const temTexto = !!title.trim() || !!description.trim();
  useEffect(() => { onRascunhoChange?.(temTexto); }, [temTexto, onRascunhoChange]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{labels.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{labels.subtitle}</p>
      </div>

      {/* Abrir em nome de outra pessoa (dono, 2026-10-15): o atendente que recebeu o pedido por telefone abre para
          ela, que passa a ser quem abriu (avisos, acompanhamento e avaliação). */}
      {atendoAlgumSetor && (
        <div className="space-y-1.5">
          <label htmlFor="em-nome-de" className="text-sm font-medium text-foreground">Abrir em nome de</label>
          <select id="em-nome-de" value={emNomeDe} onChange={(e) => setEmNomeDe(e.target.value)}
            className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Eu mesmo(a)</option>
            {[...pessoasDaEmpresa].filter((p) => p.id !== user?.id).sort((a, b) => a.nome.localeCompare(b.nome))
              .map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">
            Para quando alguém pede por telefone ou pessoalmente: a pessoa vira a solicitante, recebe os avisos e avalia o
            atendimento. Fica registrado que você abriu.
          </p>
        </div>
      )}

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
              // A categoria que virou pedido (2026-10-25) leva ao pedido, com etapas, em vez de abrir chamado.
              const pedido = categoriaVirouPedido(categoryModule, cat.name);
              if (pedido) return (
                <Link key={cat.id} to={tenantPath(`/solicitacoes?novo=${pedido}`)}
                  className="flex flex-col justify-center p-4 text-sm font-medium text-left rounded-xl border border-dashed border-border bg-card hover:border-primary/30">
                  <span>{cat.name}</span>
                  <span className="text-[12px] font-normal text-muted-foreground">Agora é pedido, com etapas →</span>
                </Link>
              );
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

      {/* O terceiro nível: obrigatório quando a subcategoria tem itens (dono, 2026-10-13). */}
      {selectedSubcategory && itens.length > 0 && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <label className="text-sm font-medium text-foreground">{selectedSubcategory.name}: qual delas? *</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {itens.map(item => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setPopDismissed(false); setSelectedItem(isSelected ? null : item); }}
                  className={cn(
                    'p-3 text-sm text-left rounded-xl border transition-all duration-200',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'bg-card border-border text-muted-foreground hover:-translate-y-0.5 hover:border-primary/30'
                  )}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        </div>
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

      {/* POP Suggestion Banner */}
      {isCheckingPOP && !popDismissed && <POPSuggestionLoading />}
      {matchedPOP && !popDismissed && (
        <POPSuggestionBanner pop={matchedPOP} onProceed={handlePOPProceed} onSolved={handlePOPSolved} />
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

      {(isAdmission || isDesligamento) && (
        <div className="space-y-1.5">
          <label htmlFor="colaborador-do-rh" className="text-sm font-medium text-foreground">
            {isDesligamento ? 'Colaborador que está saindo *' : 'Colaborador que está entrando *'}
          </label>
          <select id="colaborador-do-rh" value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)}
            className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Escolha…</option>
            {[...pessoasDaEmpresa].sort((a, b) => a.nome.localeCompare(b.nome))
              .map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          {isDesligamento && (
            <p className="text-xs text-muted-foreground">
              A TI recebe um chamado com tudo o que está no nome da pessoa: cada equipamento é conferido e o chamado só
              fecha com o Termo de Devolução assinado.
            </p>
          )}
        </div>
      )}

      {/* Admission Access Editor */}
      {isAdmission && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <AdmissionAccessEditor value={admissionGrants} onChange={setAdmissionGrants} />
        </div>
      )}

      {/* Priority — Pill Badges */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Urgência</label>
        <div className="flex gap-2 flex-wrap">
          {PRIORITIES.map(p => {
            const isSelected = priority === p.value;
            const minutos = tempoDeSolucao(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPriority(p.value)}
                className={cn(
                  'inline-flex flex-col items-center rounded-2xl px-4 py-1.5 text-sm font-medium border transition-all duration-200',
                  isSelected
                    ? p.selectedClass
                    : 'bg-card border-border text-muted-foreground hover:border-border hover:bg-background'
                )}
              >
                <span className="inline-flex items-center gap-2">
                  {!isSelected && <span className={cn('w-2 h-2 rounded-full', p.dotClass)} />}
                  {p.label}
                </span>
                {minutos != null && <span className="text-xs font-normal">até {prazoEmTexto(minutos, minutosDoDia(expediente))}</span>}
              </button>
            );
          })}
        </div>
        {/* Tempo de solução de cada urgência (dono, 2026-10-08): o prazo do setor, ou o padrão da
            empresa — a mesma escolha de `prazo_padrao_do_chamado`. */}
        <p className="text-xs text-muted-foreground">Tempo de solução de cada prioridade, como o setor configurou: conta só no expediente do setor, fora fins de semana e feriados.</p>
        {voltaDaViagem && (
          <div role="status" className="rounded-xl border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm">
            {nomeDeQuemAtende ? `${nomeDeQuemAtende} está` : `A ${labels.team} está`} em viagem até{' '}
            {format(new Date(voltaDaViagem), "dd/MM 'às' HH:mm")}. O prazo deste chamado começa a contar na volta.
          </div>
        )}
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
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {falta.length > 0 && !isCreating ? `Para abrir, falta ${faltaEmTexto}.` : ''}
        {falta.length === 0 && isSubmitBlocked ? 'Veja o tutorial sugerido acima antes de abrir.' : ''}
      </p>
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
          disabled={isCreating || falta.length > 0 || isSubmitBlocked}
          className={cn(
            'flex-1 gap-2 rounded-xl ',
            isSubmitBlocked && 'opacity-50 cursor-not-allowed'
          )}
          title={isSubmitBlocked ? 'Verifique o tutorial sugerido antes de enviar' : undefined}
        >
          <Send className="w-4 h-4" />
          {isCreating ? 'Enviando…' : 'Abrir chamado'}
        </Button>
      </div>
    </form>
  );
}

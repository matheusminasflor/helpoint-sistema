import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DepartmentGrid } from '@/components/request/DepartmentGrid';
import { AssuntosDoSetor } from '@/components/request/AssuntosDoSetor';
import { CreateTicketForm } from '@/components/helpdesk/CreateTicketForm';
import { KnowledgePanel } from '@/components/pops/KnowledgePanel';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useTICategories, type TICategory, type TIModule } from '@/hooks/useTICategories';
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { categoriaVirouPedido } from '@/config/solicitacoes';
import { MODULO_DO_SETOR, type SetorDoPedido } from '@/lib/sugerir-setor';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apagarRascunho } from '@/lib/rascunho-do-novo';

// "Novo", uma porta só (rodada 3, etapa B; aprovado em 2026-10-26, docs/proposta-rodada-3.md): setor → assunto →
// formulário. Sai a escolha "Chamado ou Pedido": o sistema sabe sozinho o que cada assunto é. O passo mora no endereço
// (`?setor=` e `?assunto=`): o "voltar" do celular volta um passo em vez de sair do formulário. Os assuntos que são
// pedido com formulário próprio (reembolso, adiantamento, compra) abrem o formulário deles em Pedidos.

const SETORES: readonly string[] = Object.keys(MODULO_DO_SETOR);

export default function NewRequest() {
  const [params, setParams] = useSearchParams();
  const setor = SETORES.includes(params.get('setor') ?? '') ? (params.get('setor') as SetorDoPedido) : null;
  const modulo = setor ? MODULO_DO_SETOR[setor] : null;
  const assuntoId = params.get('assunto');
  // O texto que a pessoa escreveu no "Do que você precisa?" vai para a descrição.
  const [texto, setTexto] = useState<string | undefined>(undefined);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  // Voltar e Cancelar apagavam a descrição sem perguntar (defeito 19, 2026-10-24).
  const [temRascunho, setTemRascunho] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { user } = useAuth();
  const { rootCategories, categories } = useTICategories((modulo ?? undefined) as TIModule | undefined);

  // Fechar a aba ou atualizar a página com texto escrito: o navegador pergunta antes.
  useEffect(() => {
    if (!temRascunho) return;
    const segura = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', segura);
    return () => window.removeEventListener('beforeunload', segura);
  }, [temRascunho]);

  // O assunto que é pedido com formulário próprio leva a ele (vale também para a sugestão da busca).
  const pedidoDoAssunto = (cat: TICategory | undefined) => {
    if (!cat || !modulo) return null;
    const raiz = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) ?? cat : cat;
    return categoriaVirouPedido(modulo, raiz.name);
  };
  const assunto = assuntoId ? categories.find((c) => c.id === assuntoId) : undefined;
  const pedidoDireto = pedidoDoAssunto(assunto);
  useEffect(() => {
    if (pedidoDireto) navigate(tenantPath(`/solicitacoes?novo=${pedidoDireto}`), { replace: true });
  }, [pedidoDireto, navigate, tenantPath]);

  const irPara = (novo: { setor?: string; assunto?: string }) => {
    const p = new URLSearchParams();
    if (novo.setor) p.set('setor', novo.setor);
    if (novo.assunto) p.set('assunto', novo.assunto);
    setParams(p);
  };

  const escolherSetor = (id: SetorDoPedido, extra?: { categoriaId?: string; texto?: string }) => {
    setTexto(extra?.texto);
    irPara({ setor: id, assunto: extra?.categoriaId });
  };
  const escolherAssunto = (cat: TICategory) => {
    const pedido = pedidoDoAssunto(cat);
    if (pedido) { navigate(tenantPath(`/solicitacoes?novo=${pedido}`)); return; }
    irPara({ setor: setor ?? undefined, assunto: cat.id });
  };

  // O "voltar" do celular guarda o texto (`rascunho-do-novo`); enviar ou descartar de propósito apaga.
  const esquecerRascunho = () => { if (user?.id && assuntoId) apagarRascunho(user.id, assuntoId); };
  const voltarDeVerdade = () => {
    setConfirmarSaida(false);
    setTemRascunho(false);
    esquecerRascunho();
    if (assuntoId) irPara({ setor: setor ?? undefined });
    else if (setor) irPara({});
    else navigate(-1);
  };
  const handleBack = () => {
    if (assuntoId && temRascunho) { setConfirmarSaida(true); return; }
    voltarDeVerdade();
  };

  // Depois de enviar, abre o que acabou de ser criado (Zeigarnik): antes caía na lista.
  const handleSuccess = (id?: string) => {
    setTemRascunho(false);
    esquecerRascunho();
    navigate(tenantPath(id ? `/helpdesk/${id}` : '/meus'));
  };
  const handlePOPSolved = () => {
    esquecerRascunho();
    toast.success('Tutorial marcado como solução. Nada foi aberto.');
    navigate(tenantPath('/meus'));
  };

  const barraDeVoltar = (rotulo: string) => (
    <div>
      <div className="px-4 sm:px-6 lg:px-8 pt-5">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          <span>{rotulo}</span>
        </Button>
      </div>
    </div>
  );

  if (!setor || !modulo) {
    return <div className="min-h-full bg-background"><DepartmentGrid onSelectDepartment={escolherSetor} /></div>;
  }

  if (!assuntoId || pedidoDireto || (!assunto && rootCategories.length > 0 && !categories.some((c) => c.id === assuntoId))) {
    return (
      <div className="min-h-full bg-background">
        {barraDeVoltar('Setores')}
        <AssuntosDoSetor modulo={modulo} onEscolher={escolherAssunto} />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar o que você escreveu?</AlertDialogTitle>
            <AlertDialogDescription>O título e a descrição ainda não foram enviados e se perdem se você voltar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar escrevendo</AlertDialogCancel>
            <AlertDialogAction onClick={voltarDeVerdade}>Descartar e voltar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {barraDeVoltar('Assuntos')}

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Tutoriais — no celular vira bloco recolhido ACIMA do formulário */}
        <div className="lg:hidden mb-4">
          <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
            <CollapsibleTrigger asChild>
              <button type="button"
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" />
                  Tutoriais que podem resolver sem abrir
                </span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${knowledgeOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <KnowledgePanel onPOPSolved={handlePOPSolved} />
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          <div>
            <CreateTicketForm
              key={assuntoId}
              onSuccess={handleSuccess}
              onCancel={handleBack}
              onRascunhoChange={setTemRascunho}
              categoriaInicialId={assuntoId}
              assuntoFixo
              textoInicial={texto}
              module={modulo}
            />
          </div>
          <div className="hidden lg:block">
            <div className="sticky top-6">
              <KnowledgePanel onPOPSolved={handlePOPSolved} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

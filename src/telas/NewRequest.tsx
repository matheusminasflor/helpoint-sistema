import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DepartmentGrid } from '@/components/request/DepartmentGrid';
import { EscolhaDaPorta, PortaDoPedido } from '@/components/request/PortasDoNovo';
import { CreateTicketForm } from '@/components/helpdesk/CreateTicketForm';
import { KnowledgePanel } from '@/components/pops/KnowledgePanel';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';

type DepartmentId = 'ti' | 'marketing' | 'qualidade' | 'rh' | 'financeiro' | 'compras' | 'comercial' | 'educacional' | 'expedicao' | 'producao';

const MODULE_BY_DEPARTMENT: Record<DepartmentId, 'tickets' | 'marketing' | 'qualidade' | 'rh' | 'financeiro' | 'compras' | 'comercial' | 'educacional' | 'expedicao' | 'producao'> = {
  ti: 'tickets',
  marketing: 'marketing',
  qualidade: 'qualidade',
  rh: 'rh',
  financeiro: 'financeiro',
  compras: 'compras',
  comercial: 'comercial',
  educacional: 'educacional',
  expedicao: 'expedicao',
  producao: 'producao',
};

export default function NewRequest() {
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentId | null>(null);
  // O que veio do "O que você precisa?" (etapa 4 · Chamados, 2026-10-24): a categoria sugerida e o texto já escrito.
  const [doPedido, setDoPedido] = useState<{ categoriaId?: string; texto?: string }>({});
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  // Voltar e Cancelar apagavam a descrição sem perguntar (defeito 19, 2026-10-24).
  const [temRascunho, setTemRascunho] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [params] = useSearchParams();
  const porta = params.get('porta');

  // Fechar a aba ou atualizar a página com texto escrito: o navegador pergunta antes.
  useEffect(() => {
    if (!temRascunho) return;
    const segura = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', segura);
    return () => window.removeEventListener('beforeunload', segura);
  }, [temRascunho]);

  const handleDepartmentSelect = (departmentId: string, extra?: { categoriaId?: string; texto?: string }) => {
    setDoPedido(extra ?? {});
    setSelectedDepartment(departmentId as DepartmentId);
  };

  const voltarDeVerdade = () => {
    setConfirmarSaida(false);
    setTemRascunho(false);
    if (selectedDepartment) {
      setSelectedDepartment(null);
    } else {
      navigate(-1);
    }
  };

  const handleBack = () => {
    if (selectedDepartment && temRascunho) { setConfirmarSaida(true); return; }
    voltarDeVerdade();
  };

  const handleSuccess = () => {
    navigate(tenantPath('/helpdesk'));
  };

  const handlePOPSolved = () => {
    toast.success('Tutorial marcado como solução. Nenhum chamado foi aberto.');
    navigate(tenantPath('/helpdesk'));
  };

  // "Novo" (rodada 2, decisão 1): primeiro a porta — chamado ou pedido —, depois o setor do chamado.
  if (!selectedDepartment) {
    if (porta !== 'chamado' && porta !== 'pedido') {
      return <div className="min-h-full bg-background"><EscolhaDaPorta /></div>;
    }
    return (
      <div className="min-h-full bg-background">
        <div className="border-b border-border/60 bg-card">
          <div className="px-4 sm:px-6 lg:px-8 py-3">
            <Button variant="ghost" size="sm" asChild
              className="gap-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-surface-1">
              <Link to={tenantPath('/nova-solicitacao')}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                <span>Chamado ou pedido</span>
              </Link>
            </Button>
          </div>
        </div>
        {porta === 'pedido' ? <PortaDoPedido /> : <DepartmentGrid onSelectDepartment={handleDepartmentSelect} />}
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background">
      <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar o que você escreveu?</AlertDialogTitle>
            <AlertDialogDescription>O título e a descrição deste chamado ainda não foram enviados e se perdem se você voltar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar escrevendo</AlertDialogCancel>
            <AlertDialogAction onClick={voltarDeVerdade}>Descartar e voltar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Back Button */}
      <div className="border-b border-border/60 bg-card">
        <div className="px-6 lg:px-8 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="gap-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-surface-1"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
            <span>Voltar</span>
          </Button>
        </div>
      </div>

      <div className="px-6 lg:px-8 py-6">
        {/* Tutoriais — no mobile vira bloco colapsável ACIMA do formulário */}
        <div className="lg:hidden mb-4">
          <Collapsible open={knowledgeOpen} onOpenChange={setKnowledgeOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" />
                  Tutoriais que podem resolver sem abrir chamado
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${knowledgeOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
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
              onSuccess={handleSuccess}
              onCancel={handleBack}
              onRascunhoChange={setTemRascunho}
              categoriaInicialId={doPedido.categoriaId}
              textoInicial={doPedido.texto}
              module={MODULE_BY_DEPARTMENT[selectedDepartment]}
            />
          </div>

          {/* Knowledge Panel — coluna fixa no desktop */}
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

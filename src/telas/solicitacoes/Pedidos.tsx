// Pedidos (proposta "Helpoint no dia a dia", etapa 4b): o que eu pedi, o que espera a minha aprovação de gestor, e a
// porta para pedir. O chamado é um problema; o pedido tem etapas — aqui cada um mostra em que etapa está e com quem.
// `?novo=<tipo>` abre o formulário direto (a porta "Pedido" do Novo e o Ctrl+K levam para cá).
// Rodada 2 (decisão 2): a compra é um pedido como os outros e entra na mesma lista — saiu a aba "Minhas compras".
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListaDeSolicitacoes } from '@/components/solicitacoes/ListaDeSolicitacoes';
import { NovoPedidoDialog } from '@/components/solicitacoes/NovoPedidoDialog';
import { PedirCompraDialog } from '@/components/solicitacoes/PedirCompraDialog';
import { useMinhasSolicitacoes, useParaEuAprovar } from '@/hooks/useSolicitacoes';
import { useQueryState } from '@/hooks/useQueryState';
import { useTenantPath } from '@/hooks/useTenantPath';
import { TIPOS, TIPOS_DA_PORTA, terminou, type TipoDeSolicitacao } from '@/config/solicitacoes';

export default function Pedidos() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: minhas = [], isLoading } = useMinhasSolicitacoes();
  const { data: paraAprovar = [], isLoading: carregandoAprovar } = useParaEuAprovar();
  const [abaNaUrl, setAba] = useQueryState<string>('aba', 'meus');
  // `?aba=compras` (a aba que existiu até a rodada 2) cai na lista única.
  const aba = abaNaUrl === 'aprovar' ? 'aprovar' : 'meus';
  const [novo, setNovo] = useQueryState<string>('novo', '');
  const [escolhendo, setEscolhendo] = useState(false);
  const tipoNovo = (TIPOS_DA_PORTA as string[]).includes(novo) || novo.startsWith('rh_') ? novo as TipoDeSolicitacao : null;
  const abertas = minhas.filter((s) => !terminou(s.tipo, s.etapa));
  const fechadas = minhas.filter((s) => terminou(s.tipo, s.etapa));
  const abrir = (id: string) => { setNovo(''); navigate(tenantPath(`/solicitacoes/${id}`)); };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Pedidos" icon={ClipboardList}
        description="Compra, arte, acesso, reembolso e adiantamento: o que você pediu, em que etapa está e com quem."
        actions={<Button onClick={() => setEscolhendo(true)}><Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />Novo pedido</Button>} />
      <div className="p-4 lg:p-6 space-y-4">
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList>
            <TabsTrigger value="meus">Meus pedidos{abertas.length ? ` (${abertas.length})` : ''}</TabsTrigger>
            <TabsTrigger value="aprovar">Para eu aprovar{paraAprovar.length ? ` (${paraAprovar.length})` : ''}</TabsTrigger>
          </TabsList>
          <TabsContent value="meus" className="space-y-4 mt-4">
            <ListaDeSolicitacoes linhas={abertas} carregando={isLoading} vazio="Nenhum pedido em aberto" mostrarQuem={false} />
            {fechadas.length > 0 && (
              <details>
                <summary className="cursor-pointer text-[14px] font-medium text-muted-foreground">Encerrados ({fechadas.length})</summary>
                <div className="mt-2"><ListaDeSolicitacoes linhas={fechadas} carregando={false} vazio="" mostrarQuem={false} /></div>
              </details>
            )}
          </TabsContent>
          <TabsContent value="aprovar" className="mt-4">
            <p className="text-[13px] text-muted-foreground mb-2">
              Os pedidos de quem é do seu setor que esperam o seu sim ou não. Antes de aprovar, veja quem estará fora no{' '}
              <Link to={tenantPath('/ausencias')} className="text-primary underline">Calendário de ausências</Link>.
            </p>
            <ListaDeSolicitacoes linhas={paraAprovar} carregando={carregandoAprovar} vazio="Nada esperando a sua aprovação" />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={escolhendo} onOpenChange={setEscolhendo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>O que você quer pedir?</DialogTitle>
            <DialogDescription>Algo quebrou ou precisa de ajuda de um setor? Isso é chamado, em Novo › Chamado.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['compra', ...TIPOS_DA_PORTA] as TipoDeSolicitacao[]).map((t) => (
              <button key={t} type="button" onClick={() => { setEscolhendo(false); setNovo(t); }}
                className="rounded-lg border border-border p-3 text-left min-h-11 hover:bg-muted/40">
                <span className="block text-[14px] font-semibold">{TIPOS[t].rotulo}</span>
                <span className="block text-[13px] text-muted-foreground">{TIPOS[t].descricao}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {novo === 'compra' && <PedirCompraDialog onFechar={() => setNovo('')} onEnviado={abrir} />}

      {tipoNovo && <NovoPedidoDialog tipo={tipoNovo} onFechar={() => setNovo('')} onEnviado={abrir} />}
    </div>
  );
}

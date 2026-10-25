// A fila de solicitações de um setor (etapa 4b): Marketing (arte), TI (acesso), Financeiro (reembolso e adiantamento)
// e RH (os pedidos do Meu RH). "Para fazer" em cima, com o que espera o setor primeiro; o histórico recolhido.
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { ListaDeSolicitacoes } from '@/components/solicitacoes/ListaDeSolicitacoes';
import { useSolicitacoesDoSetor } from '@/hooks/useSolicitacoes';
import { useQueryState } from '@/hooks/useQueryState';
import { ROTULO_DO_SETOR_DA_SOLICITACAO, deQuemEAVez, terminou, type SetorDaSolicitacao } from '@/config/solicitacoes';
import { casaBusca } from '@/lib/tabela';

export default function SolicitacoesDoSetor({ setor }: { setor: SetorDaSolicitacao }) {
  const { data = [], isLoading } = useSolicitacoesDoSetor(setor);
  const [busca, setBusca] = useQueryState<string>('q', '');
  const visiveis = data.filter((s) => casaBusca([s.titulo, s.para?.full_name, s.solicitante?.full_name, String(s.numero)], busca));
  const abertas = visiveis.filter((s) => !terminou(s.tipo, s.etapa));
  // Primeiro o que é a vez do setor; depois o que espera o gestor ou quem pediu.
  const doSetor = (s: (typeof abertas)[number]) => !(deQuemEAVez(s.tipo, s.etapa) ?? '').match(/gestor|você/);
  const paraFazer = [...abertas.filter(doSetor), ...abertas.filter((s) => !doSetor(s))];
  const historico = visiveis.filter((s) => terminou(s.tipo, s.etapa));
  const titulo = ROTULO_DO_SETOR_DA_SOLICITACAO[setor];

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title={titulo} icon={ClipboardList}
        description="Pedidos com etapas: aceitar ou aprovar, recusar com motivo, entregar. Não têm prazo de chamado." />
      <div className="p-4 lg:p-6 space-y-4">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por pedido, pessoa ou número"
          aria-label="Buscar pedido" className="max-w-sm" />
        <section className="space-y-2">
          <h2 className="text-[14px] font-semibold">Para fazer ({paraFazer.length})</h2>
          <ListaDeSolicitacoes linhas={paraFazer} carregando={isLoading} vazio="Nada para fazer" />
        </section>
        {historico.length > 0 && (
          <details>
            <summary className="cursor-pointer text-[14px] font-medium text-muted-foreground">Histórico ({historico.length})</summary>
            <div className="mt-2"><ListaDeSolicitacoes linhas={historico} carregando={false} vazio="" /></div>
          </details>
        )}
      </div>
    </div>
  );
}

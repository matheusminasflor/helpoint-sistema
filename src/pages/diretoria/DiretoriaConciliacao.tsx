// Aba "Conciliação" do Painel Diretor (L6d). Ver
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15: "A planilha de
// metas conta bonificação como faturamento; o restante do painel não. Toda
// geração deve exibir o quadro (...). Não tente fechar a diferença
// ajustando número. Mostre-a e registre no evento."
//
// O valor da apresentação é digitado pelo diretor (ele o tem na planilha) —
// a tela nunca o deriva. Sem ele, a diferença fica nula: "não informou" e
// "diferença zero" nunca se confundem aqui.
import { useState } from 'react';
import { Scale } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConciliacao, useMetasAnosDisponiveis } from '@/hooks/useComercialCarteirasMetas';
import { formatBRL } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

const ANO_ATUAL = new Date().getFullYear();

export default function DiretoriaConciliacao() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const [filial, setFilial] = useState<Filial | null>(null);
  const [textoApresentacao, setTextoApresentacao] = useState('');
  const { data: anosDisponiveis = [ANO_ATUAL] } = useMetasAnosDisponiveis();

  const apresentacao = textoApresentacao.trim() === '' ? null : Number(textoApresentacao.replace(',', '.'));
  const { data, isLoading } = useConciliacao(ano, filial, Number.isFinite(apresentacao) ? apresentacao : null);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Scale}
        title="Conciliação"
        description="A planilha de metas conta bonificação como faturamento; o resto do painel não. A diferença aparece como ela é — nunca arredondada, nunca escondida."
      />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">

      <div className="flex flex-wrap items-end gap-3">
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filial ?? 'todas'} onValueChange={(v) => setFilial(v === 'todas' ? null : (v as Filial))}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Filial" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">As duas filiais</SelectItem>
            <SelectItem value="MF">MF</SelectItem>
            <SelectItem value="INBRAS">INBRAS</SelectItem>
          </SelectContent>
        </Select>
        <div className="space-y-1">
          <Label className="text-xs">Valor da apresentação (planilha)</Label>
          <Input
            value={textoApresentacao}
            onChange={(e) => setTextoApresentacao(e.target.value)}
            type="number"
            step="0.01"
            placeholder="Digite o valor da planilha"
            className="w-56"
          />
        </div>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : data && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-border">
              <LinhaQuadro rotulo="Valor da apresentação (digitado)" valor={apresentacao != null && Number.isFinite(apresentacao) ? apresentacao : null} />
              <LinhaQuadro rotulo="Venda líquida no Forteplus" valor={data.venda_liquida} />
              <LinhaQuadro rotulo="Bonificação" valor={data.bonificacao} />
              <LinhaQuadro rotulo="Soma (venda líquida + bonificação)" valor={data.soma} destaque />
              <tr>
                <td className="py-2.5 px-4 font-medium">Diferença que permanece</td>
                <td className="py-2.5 px-4 text-right font-mono font-semibold">
                  {data.diferenca == null
                    ? <span className="text-muted-foreground font-normal">informe o valor da apresentação</span>
                    : <span className={Math.abs(data.diferenca) < 0.005 ? 'text-status-success' : 'text-status-warning'}>
                        {formatBRL(data.diferenca)}
                      </span>}
                </td>
              </tr>
            </tbody>
          </table>
          {data.diferenca != null && Math.abs(data.diferenca) >= 0.005 && (
            <p className="px-4 py-2.5 text-[12px] text-muted-foreground border-t border-border">
              Esta diferença não é ajustada automaticamente — registre-a no evento do mês, como o documento pede.
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function LinhaQuadro({ rotulo, valor, destaque }: { rotulo: string; valor: number | null; destaque?: boolean }) {
  return (
    <tr className={destaque ? 'bg-secondary/40' : undefined}>
      <td className={`py-2 px-4 ${destaque ? 'font-medium' : ''}`}>{rotulo}</td>
      <td className={`py-2 px-4 text-right font-mono ${destaque ? 'font-medium' : ''}`}>
        {valor == null ? '—' : formatBRL(valor)}
      </td>
    </tr>
  );
}

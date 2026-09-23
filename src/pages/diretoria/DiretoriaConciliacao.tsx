// Aba "Conciliação" do Painel Diretor (L6d). Ver
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15 e
// docs/metas-e-carteiras-fonte-da-verdade.md §6: "Conciliação:
// total_realizado (informado, com bonificação) menos venda líquida do ERP
// no mesmo período (…). Exibir a diferença; não ajustar."
//
// O valor informado já está no banco desde a Frente 2 (metas_ano.
// total_realizado, importado do HISTORICO_METAS.json) — a tela não pede
// mais que o diretor o digite de novo (Frente 5b: digitar de novo abria a
// porta para o digitado discordar do importado, sem ninguém saber qual dos
// dois valia). "Não informou" e "diferença zero" continuam coisas
// diferentes: sem nenhum mês informado no ano, não há quadro — só o aviso.
//
// A comparação cobre só os meses com total_realizado informado, nunca o
// ano inteiro (com_conciliacao devolve meses_comparados) — somar o ano dos
// dois lados quando faltam meses do lado informado produz uma diferença
// grande, convincente e sem erro nenhum aparecer (a mesma família do erro
// dos 129 clientes).
//
// Sem seletor de filial: metas_ano é da empresa inteira (o JSON do diretor
// não separa por filial) — comparar a empresa toda contra uma filial só
// produziria a mesma diferença falsa.
import { useState } from 'react';
import { Scale } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConciliacao, useMetasAnosDisponiveis } from '@/hooks/useComercialCarteirasMetas';
import { formatBRL } from '@/types/financeiro';

const ANO_ATUAL = new Date().getFullYear();

export default function DiretoriaConciliacao() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const { data: anosDisponiveis = [ANO_ATUAL] } = useMetasAnosDisponiveis();
  const { data, isLoading } = useConciliacao(ano);

  const semDado = !isLoading && data != null && data.informado == null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Scale}
        title="Conciliação"
        description="O que a planilha de metas mede contra o que o painel mede."
      />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">

      <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="rounded-lg border border-border bg-secondary/20 p-4 text-[13px] space-y-2">
        <p>
          <strong>Por que os dois números não batem.</strong> A planilha de
          metas do diretor conta a bonificação como faturamento. O resto do
          painel não conta — bonificação é produto que saiu sem cobrança, e
          somá-la à venda faria o faturamento parecer maior do que o que
          entrou em caixa. Por isso os dois números são diferentes de
          propósito. O quadro abaixo mostra os dois lado a lado e a
          diferença que sobra depois de somar a bonificação de volta.{' '}
          <strong>Essa diferença não é ajustada automaticamente</strong> — o
          painel nunca mexe num número para fazer os dois fecharem. Quando
          ela aparecer, anote-a junto com o fechamento do mês.
        </p>
        <p className="text-muted-foreground">
          A conciliação é da empresa inteira — o valor informado pelo
          diretor não é separado por filial.
        </p>
      </div>

      {isLoading ? <Skeleton className="h-40 w-full" /> : semDado ? (
        <p className="text-[13px] text-muted-foreground">
          O ano {ano} ainda não foi informado nas metas.
        </p>
      ) : data && (
        <div className="rounded-lg border border-border overflow-x-auto">
          <p className="px-4 py-2.5 text-[12px] text-muted-foreground border-b border-border">
            Comparando os {data.meses_comparados} {data.meses_comparados === 1 ? 'mês informado' : 'meses informados'} de {ano}.
          </p>
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-border">
              <LinhaQuadro
                rotulo="Valor informado (metas do diretor)"
                explicacao="o que a planilha de metas do diretor registra nos meses informados"
                valor={data.informado}
              />
              <LinhaQuadro
                rotulo="Venda líquida no Forteplus"
                explicacao="venda menos devolução, nos mesmos meses"
                valor={data.venda_liquida}
              />
              <LinhaQuadro
                rotulo="Bonificação"
                explicacao="produto que saiu sem cobrança, nos mesmos meses"
                valor={data.bonificacao}
              />
              <LinhaQuadro
                rotulo="Soma (venda líquida + bonificação)"
                explicacao="o que o painel mede na mesma base da planilha do diretor"
                valor={data.soma}
                destaque
              />
              <tr>
                <td className="py-2.5 px-4">
                  <div className="font-medium">Diferença que permanece</div>
                  <div className="text-[11px] text-muted-foreground">valor informado menos a soma</div>
                </td>
                {/* Sem `?? 0`: trocar "sem dado" por zero é a família de
                    defeito que a Frente 2 existiu para tirar do sistema, e
                    aqui ela diria "as contas fecham" onde não há conta
                    nenhuma. O `semDado` acima já impede este quadro de
                    aparecer com `informado` nulo — mas a defesa fica no
                    ponto que escreve o número, não a duas telas de
                    distância. */}
                <td className="py-2.5 px-4 text-right font-mono font-semibold">
                  {data.diferenca == null ? (
                    <span className="text-muted-foreground font-normal">sem dado</span>
                  ) : (
                    <span className={Math.abs(data.diferenca) < 0.005 ? 'text-status-success' : 'text-status-warning'}>
                      {formatBRL(data.diferenca)}
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          {/* A caixa acima já diz que a diferença não se ajusta; repetir a
              mesma frase aqui era ruído. O que falta no rodapé é o que
              fazer com ela. */}
          {data.diferenca != null && Math.abs(data.diferenca) >= 0.005 && (
            <p className="px-4 py-2.5 text-[12px] text-muted-foreground border-t border-border">
              Anote esta diferença junto com o fechamento do mês: ela é o que separa a base da planilha da base do painel.
            </p>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function LinhaQuadro({ rotulo, explicacao, valor, destaque }: { rotulo: string; explicacao: string; valor: number | null; destaque?: boolean }) {
  return (
    <tr className={destaque ? 'bg-secondary/40' : undefined}>
      <td className={`py-2 px-4 ${destaque ? 'font-medium' : ''}`}>
        {rotulo}
        <div className="text-[11px] text-muted-foreground font-normal">{explicacao}</div>
      </td>
      <td className={`py-2 px-4 text-right font-mono ${destaque ? 'font-medium' : ''}`}>
        {valor == null ? '—' : formatBRL(valor)}
      </td>
    </tr>
  );
}

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
// ── Etapa 4 (2026-09-25) ────────────────────────────────────────────────
// Deixou de ser aba. Cinco linhas não sustentam uma aba própria, e ela só faz
// sentido ao lado das metas que ela concilia — então virou o último bloco de
// "Metas e carteiras", com o ano vindo de lá (o seletor próprio saiu: era mais
// um ano independente na mesma área do painel).
//
// `ResumoConciliacao` é a versão de UMA LINHA, para a visão simplificada:
// fecha ou não fecha, e de quanto. Quem quiser a conta abre o analítico.
import { Skeleton } from '@/components/ui/skeleton';
import { CaixasDoPeriodo } from '@/components/comercial/CaixasDoPeriodo';
import { useConciliacao } from '@/hooks/useComercialCarteirasMetas';
import { useCaixas } from '@/hooks/useComercialPainel';
import { formatBRL } from '@/types/financeiro';

/** O quadro completo — visão analítica de "Metas e carteiras". */
export function BlocoConciliacao({ ano }: { ano: number }) {
  const { data, isLoading } = useConciliacao(ano);
  // O ano inteiro, as duas filiais, todas as caixas — ver o bloco no fim do
  // componente. `p_filial` nulo porque a conciliação é da empresa inteira.
  const { data: caixas } = useCaixas(ano, null);

  const semDado = !isLoading && data != null && data.informado == null;

  return (
      <div className="space-y-4">
      <h3 className="text-[13px] font-semibold text-foreground">Conciliação</h3>

      {/* O texto explicado que o dono pediu vinha ANTES do quadro, em quatro
          linhas, e ele leu como aviso de problema: "mensagem assustadora"
          (2026-09-24). A explicação estava certa e a ordem, errada — ninguém
          quer o porquê de uma diferença antes de saber se ela existe. Agora
          a caixa é uma linha, e o "por quê" abre só para quem quiser.

          O TEXTO MUDOU EM 2026-09-25. Ele dizia que "a planilha de metas
          conta a bonificação como faturamento" — uma premissa que o dado
          negou e que fabricava uma diferença de R$ 3,1 milhões. Ver o
          cabeçalho da migration 20261026020000. */}
      <details className="rounded-lg border border-border bg-secondary/20 p-3 text-[13px]">
        <summary className="cursor-pointer">
          A sua planilha mede a venda com nota fiscal. O sistema mede tudo o que
          saiu, separado por série —{' '}
          <span className="text-muted-foreground">entenda a conta</span>
        </summary>
        <div className="mt-2 space-y-2 text-muted-foreground">
          <p>
            <strong>Série 1</strong> é nota fiscal. <strong>Série 75</strong> é
            sem nota — e é cobrada do mesmo jeito, para o cliente que prefere
            comprar assim. As duas são faturamento.
          </p>
          <p>
            <strong>Bonificação</strong> é tudo que saiu sem cobrança, nas duas
            séries. Cashback e publicidade estão dentro dela e o sistema não
            consegue separá-los: o CFOP de remessa gratuita (5910/6910) diz
            para onde o produto foi, nunca por quê, e a natureza da operação
            não vem no relatório. Nada disso é faturamento, e por isso fica
            fora da conta da diferença.
          </p>
          <p>
            A conciliação é da empresa inteira — o valor informado pelo diretor
            não é separado por filial.
          </p>
        </div>
      </details>

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
                rotulo="Apresentação comercial (sua planilha)"
                explicacao="o que a planilha de metas do diretor registra nos meses informados"
                valor={data.informado}
              />

              <LinhaGrupo rotulo="Faturamento — o que foi cobrado" />
              <LinhaQuadro
                rotulo="Venda com nota (série 1)"
                explicacao="nota fiscal emitida"
                valor={data.venda_com_nota}
                recuada
              />
              <LinhaQuadro
                rotulo="Venda sem nota (série 75)"
                explicacao="sem nota fiscal, mas cobrada do mesmo jeito"
                valor={data.venda_sem_nota}
                recuada
              />
              <LinhaQuadro
                rotulo="Total faturado"
                explicacao="as duas séries somadas"
                valor={data.venda_total}
                destaque
              />

              <LinhaGrupo rotulo="Saiu sem cobrança — não é faturamento" />
              <LinhaQuadro
                rotulo="Bonificação"
                explicacao="as duas séries — cashback e publicidade estão dentro, sem como separar"
                valor={data.bonificacao}
                recuada
              />

              <LinhaDiferenca
                rotulo="Sua planilha × venda com nota"
                explicacao="é isto que a sua planilha mede — serve para confirmar a base, não para agir"
                valor={data.diferenca_com_nota}
                informativa
              />
              <LinhaDiferenca
                rotulo="Sua planilha × total faturado"
                explicacao="a venda sem nota que você cobra e não registra"
                valor={data.diferenca_total}
                destaque
              />
            </tbody>
          </table>
          {/* O rodapé fala da diferença QUE IMPORTA (contra o total), não da
              primeira. Só aparece quando ela existe: instrução que chega sem
              motivo é a que a pessoa aprende a ignorar. */}
          {data.diferenca_total != null && Math.abs(data.diferenca_total) >= 0.005 && (
            <p className="px-4 py-2.5 text-[12px] text-muted-foreground border-t border-border">
              O painel não ajusta esta diferença — ela fica à vista de propósito. Anote-a junto com o fechamento do mês.
            </p>
          )}
          {data.diferenca_total != null && Math.abs(data.diferenca_total) < 0.005 && (
            <p className="px-4 py-2.5 text-[12px] text-status-success border-t border-border">
              As duas bases fecham nos meses comparados.
            </p>
          )}
        </div>
      )}

      {/* O ANO INTEIRO IMPORTADO — leva dos insights, 2026-09-25.

          O quadro acima compara só os meses informados, e faz certo: é a única
          comparação honesta contra a planilha. Mas ele não responde "e o ano
          todo?", e não mostra o que não é venda nem bonificação — a
          industrialização e o CFOP desconhecido não tinham caixa em tela
          nenhuma (R$ 243.989,69 na base de teste, quatro anos). Este bloco é o
          mesmo componente que o Comercial usa em Vendas, lendo `com_caixas`:
          uma conta só, num lugar só, e a linha de fechamento diz o total
          importado para quem quiser somar e conferir.

          Sem filtro de filial e sem filtro de série, de propósito: o número que
          o diretor precisa é o do grupo inteiro, e a série aqui é coluna. */}
      <div className="space-y-2 pt-2">
        <h4 className="text-[13px] font-semibold text-foreground">Tudo o que o ERP importou em {ano}</h4>
        <CaixasDoPeriodo caixas={caixas} janela={`em ${ano}`} />
      </div>
      </div>
  );
}

/**
 * A mesma conciliação em UMA LINHA, para a visão simplificada. Diz só o que
 * o diretor precisa saber sem abrir nada: fecha, não fecha (e de quanto), ou
 * não há o que conciliar. Nunca escreve "R$ 0,00" para "não informado" — a
 * distinção entre as três é a razão de o quadro existir.
 */
export function ResumoConciliacao({ ano }: { ano: number }) {
  const { data, isLoading, isError } = useConciliacao(ano);
  if (isLoading) return <Skeleton className="h-10 w-full" />;

  // FALHA DE LEITURA NÃO É "NÃO INFORMADO". `unwrap` lança quando a RPC
  // recusa (RLS, rede, função quebrada) e o React Query devolve `data`
  // indefinido — indistinguível, aqui, de "o ano não tem metas". A primeira
  // versão desta linha dizia "o ano ainda não foi informado" nos dois casos:
  // o dono leria uma falha de permissão como um fato sobre o negócio dele.
  // É a regra 1 das cinco, um degrau acima do `unwrap` (achado da auditoria
  // de 2026-09-25). `QueryClient` não tem `onError` global (`App.tsx`), então
  // quem olha a tela só vê o que este componente escrever.
  if (isError) {
    return (
      <p className="text-[12px] rounded-md border border-status-danger/40 text-status-danger px-3 py-2">
        <strong>Conciliação:</strong> não consegui ler a apuração de {ano}. Isto não quer dizer que não haja
        o que conciliar — recarregue a página.
      </p>
    );
  }
  if (!data || data.informado == null) {
    return (
      <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
        Conciliação: o ano {ano} ainda não foi informado nas metas.
      </p>
    );
  }
  const meses = `${data.meses_comparados} ${data.meses_comparados === 1 ? 'mês comparado' : 'meses comparados'} de ${ano}`;
  // "Sem dado para comparar" não é "não fecha": recebia a cor de alerta por
  // cair no ramo `else` de `fecha`. Ausência é cinza.
  if (data.diferenca_total == null) {
    return (
      <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
        Conciliação: sem dado para comparar em {ano}.
      </p>
    );
  }
  // A linha resumida mostra a diferença contra o TOTAL FATURADO, que é a que
  // muda uma decisão: quanto ele fatura pela série 75 e não registra. A
  // diferença contra a venda com nota fica no analítico — ela serve para
  // confirmar de onde vem o número da planilha, não para agir.
  const fecha = Math.abs(data.diferenca_total) < 0.005;
  return (
    <p className={`text-[12px] rounded-md border px-3 py-2 ${fecha ? 'border-status-success/40 text-status-success' : 'border-status-warning/40 text-status-warning'}`}>
      <strong>Conciliação:</strong>{' '}
      {fecha
        ? `a sua planilha bate com o total faturado nos ${meses}.`
        : `a sua planilha está ${formatBRL(Math.abs(data.diferenca_total))} ${data.diferenca_total < 0 ? 'abaixo' : 'acima'} do total faturado nos ${meses}. Veja a conta no analítico.`}
    </p>
  );
}

function LinhaQuadro({
  rotulo, explicacao, valor, destaque, recuada,
}: { rotulo: string; explicacao: string; valor: number | null; destaque?: boolean; recuada?: boolean }) {
  return (
    <tr className={destaque ? 'bg-secondary/40' : undefined}>
      <td className={`py-2 px-4 ${destaque ? 'font-medium' : ''} ${recuada ? 'pl-10' : ''}`}>
        {rotulo}
        <div className="text-[11px] text-muted-foreground font-normal">{explicacao}</div>
      </td>
      <td className={`py-2 px-4 text-right font-mono ${destaque ? 'font-medium' : ''}`}>
        {valor == null ? '—' : formatBRL(valor)}
      </td>
    </tr>
  );
}

/** Cabeçalho de grupo — separa "o que foi cobrado" de "o que saiu de graça". */
function LinhaGrupo({ rotulo }: { rotulo: string }) {
  return (
    <tr>
      <td colSpan={2} className="pt-4 pb-1 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </td>
    </tr>
  );
}

/**
 * Uma das duas diferenças. Nunca `?? 0`: trocar "sem dado" por zero é a
 * família de defeito que a Frente 2 existiu para tirar do sistema, e aqui ela
 * diria "as contas fecham" onde não há conta nenhuma. O `semDado` acima já
 * impede o quadro de aparecer com `informado` nulo — mas a defesa fica no
 * ponto que escreve o número, não a duas telas de distância.
 */
function LinhaDiferenca({
  rotulo, explicacao, valor, destaque, informativa,
}: {
  rotulo: string; explicacao: string; valor: number | null;
  destaque?: boolean;
  /**
   * Diferença que DIAGNOSTICA em vez de acusar. A primeira linha existe para
   * mostrar de onde vem o número da planilha (ele é a venda com nota, com
   * meio por cento de folga) — pintá-la de alerta diria que R$ 14 mil em
   * R$ 3 milhões é um problema, e não é. Só a segunda pede ação.
   */
  informativa?: boolean;
}) {
  const fecha = valor != null && Math.abs(valor) < 0.005;
  return (
    <tr className={destaque ? 'bg-secondary/40' : undefined}>
      <td className="py-2.5 px-4">
        <div className="font-medium">{rotulo}</div>
        <div className="text-[11px] text-muted-foreground">{explicacao}</div>
      </td>
      <td className="py-2.5 px-4 text-right font-mono font-semibold">
        {valor == null ? (
          <span className="text-muted-foreground font-normal">sem dado</span>
        ) : (
          <span className={informativa ? 'text-muted-foreground' : fecha ? 'text-status-success' : 'text-status-warning'}>
            {formatBRL(valor)}
          </span>
        )}
      </td>
    </tr>
  );
}

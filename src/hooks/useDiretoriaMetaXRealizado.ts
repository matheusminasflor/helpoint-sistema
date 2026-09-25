// A conta de "Meta × realizado" (§15), extraída de `DiretoriaMetaXRealizado`
// (a aba única de antes da Frente 3) para as duas telas que a leem: o
// **Resumo** (os cinco indicadores + o gráfico) e **Metas e carteiras** (as
// duas tabelas por carteira, que até a etapa 4 eram a aba "Carteiras").
// Mesma conta, duas telas — nunca duplicada, ou as duas divergem no dia em
// que uma mudar e a outra não.
//
// Ver docs/metas-e-carteiras-fonte-da-verdade.md (manda sobre tudo aqui).
// Duas fontes de REALIZADO, nunca fundidas: `metas_ano` (total da EMPRESA,
// olhando pra trás) alimenta o gráfico e os cinco indicadores; `metas_
// carteira` (realizado por carteira) alimenta as duas tabelas. A meta que
// aparece nelas vem de `com_metas`. Peso e cobertura são divisão pura de
// dois números já lidos (`src/lib/metas-carteira-calc.ts`).
import { useMemo, useState } from 'react';
import {
  useCarteiras, useMetasAnoDoAno, useMetasCarteiraDoAno, useMetasAnosDisponiveis, useMetasDoAno,
} from '@/hooks/useComercialCarteirasMetas';
import { MESES, mesesFechados, metaOficialPorMes, realizadoPorMes, somaComAusencia } from '@/lib/comparativoAnos';
import { calcularCobertura, calcularPeso } from '@/lib/metas-carteira-calc';
import { todayISO } from '@/lib/dates';

const ANO_ATUAL = new Date().getFullYear();

/**
 * `anoExterno`/`setAnoExterno` existem por causa da etapa 4 (2026-09-25),
 * que fundiu "Metas" e "Carteiras" numa aba só: dentro dela o ano tem de ser
 * UM, e quem manda é a página. Sem isso, a tela fundida teria dois seletores
 * de ano independentes — que é exatamente o defeito que a auditoria achou na
 * aba "Carteiras" (o seletor dela e o do comparativo embutido podiam ficar em
 * anos diferentes sem a pessoa perceber).
 *
 * Sem argumento, o gancho continua dono do próprio ano, como sempre foi — o
 * estado local nasce em todo caso, porque hook não se chama condicionalmente.
 *
 * O controle externo é UM OBJETO com os dois campos obrigatórios, e não dois
 * parâmetros opcionais: com dois, dava para passar o ano sem o `setAno`, e aí
 * o seletor escreveria no estado local órfão — a tela não mudaria e nada
 * acusaria. Assinatura que permite um estado pela metade é assinatura que vai
 * ser usada pela metade (achado da auditoria de 2026-09-25).
 */
export function useMetaXRealizadoAno(externo?: { ano: number; setAno: (ano: number) => void }) {
  const [anoLocal, setAnoLocal] = useState(ANO_ATUAL);
  const ano = externo?.ano ?? anoLocal;
  const setAno = externo?.setAno ?? setAnoLocal;

  const { data: anosDisponiveis = [ANO_ATUAL] } = useMetasAnosDisponiveis();
  const { data: metasAnoAtual = [], isLoading: l1 } = useMetasAnoDoAno(ano);
  const { data: metasAnoAnterior = [], isLoading: l2 } = useMetasAnoDoAno(ano - 1);
  const { data: metasCarteiraAno = [], isLoading: l3 } = useMetasCarteiraDoAno(ano);
  const { data: carteiras = [], isLoading: l4 } = useCarteiras();
  const { data: comMetasAno = [], isLoading: l5 } = useMetasDoAno(ano);
  const isLoading = l1 || l2 || l3 || l4 || l5;

  const fechados = useMemo(() => mesesFechados(ano, todayISO()), [ano]);

  // Total e meta da empresa, por mês — leitura direta de metas_ano, nunca
  // soma de com_metas_x_realizado (a função saiu: era o erro desta leva).
  const realizadoMesAtual = useMemo(() => realizadoPorMes(metasAnoAtual), [metasAnoAtual]);
  const realizadoMesAnterior = useMemo(() => realizadoPorMes(metasAnoAnterior), [metasAnoAnterior]);
  // A meta importada (metas_ano.meta) e a SOMA das metas por carteira que o
  // diretor DEFINIU no sistema (com_metas, carteira preenchida) —
  // `metaOficialPorMes` decide qual vence (Frente 7c §1: a soma passou a
  // vencer; não existe mais um total digitado à parte). Mês sem NENHUMA
  // carteira com meta fica nulo, nunca zero — mesma regra de `sum()` sobre
  // ausência.
  const metaImportadaPorMes = useMemo(() => {
    const somas = Array<number | null>(12).fill(null);
    for (const m of metasAnoAtual) somas[m.mes - 1] = m.meta;
    return somas;
  }, [metasAnoAtual]);
  const metaPorCarteiraPorMes = useMemo(() => {
    const somas = Array<number | null>(12).fill(null);
    for (const m of comMetasAno) {
      if (m.carteira === null) continue;
      somas[m.mes - 1] = (somas[m.mes - 1] ?? 0) + m.valor;
    }
    return somas;
  }, [comMetasAno]);
  const metaTotalPorMes = useMemo(
    () => metaOficialPorMes(metaImportadaPorMes, metaPorCarteiraPorMes),
    [metaImportadaPorMes, metaPorCarteiraPorMes],
  );

  const dadosGrafico = MESES.map((label, i) => ({
    mes: label,
    realizado: realizadoMesAtual[i],
    meta: metaTotalPorMes[i],
    bate: metaTotalPorMes[i] == null || realizadoMesAtual[i] == null ? null : realizadoMesAtual[i]! >= metaTotalPorMes[i]!,
  }));

  // As cinco indicadores do §15 — `somaComAusencia` é a defesa contra o bug
  // desta leva ("Fechamento de 2025: R$ 0,00"): um ano sem NENHUM dado soma
  // nulo, nunca zero.
  const realizadoDoPeriodo = somaComAusencia(realizadoMesAtual.filter((_, i) => fechados[i]));
  const metaDoPeriodo = somaComAusencia(metaTotalPorMes.filter((_, i) => fechados[i]));
  const metaDoAno = somaComAusencia(metaTotalPorMes);
  const mesmoPeriodoAnoAnterior = somaComAusencia(realizadoMesAnterior.filter((_, i) => fechados[i]));
  const fechamentoAnoAnterior = somaComAusencia(realizadoMesAnterior);

  // Mapas de apoio para as duas tabelas por carteira — uma leitura de cada
  // fonte, nunca uma consulta nova por célula.
  const totalRealizadoAno = useMemo(() => somaComAusencia(metasAnoAtual.map((m) => m.total_realizado)), [metasAnoAtual]);
  const realizadoPorCarteiraEMes = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const l of metasCarteiraAno) m.set(`${l.carteira}-${l.mes}`, l.realizado);
    return m;
  }, [metasCarteiraAno]);
  const metaPorCarteiraEMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of comMetasAno) if (l.carteira) m.set(`${l.carteira}-${l.mes}`, l.valor);
    return m;
  }, [comMetasAno]);

  const carteirasNoAno = useMemo(() => carteiras.map((nome) => {
    const realizadoMeses = Array.from({ length: 12 }, (_, i) => realizadoPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null);
    const realizado = somaComAusencia(realizadoMeses);
    const meta = somaComAusencia(Array.from({ length: 12 }, (_, i) => metaPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null));
    return {
      nome,
      realizado,
      meta,
      cobertura: calcularCobertura(realizado, meta),
      peso: calcularPeso(realizado, totalRealizadoAno),
    };
  }), [carteiras, realizadoPorCarteiraEMes, metaPorCarteiraEMes, totalRealizadoAno]);

  const carteirasMesAMes = useMemo(() => carteiras.map((nome) => ({
    nome,
    porMes: Array.from({ length: 12 }, (_, i) => {
      const realizado = realizadoPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null;
      const meta = metaPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null;
      return {
        peso: calcularPeso(realizado, metasAnoAtual.find((m) => m.mes === i + 1)?.total_realizado ?? null),
        meta,
        cobertura: calcularCobertura(realizado, meta),
      };
    }),
  })), [carteiras, realizadoPorCarteiraEMes, metaPorCarteiraEMes, metasAnoAtual]);

  return {
    ano, setAno, anosDisponiveis, isLoading,
    dadosGrafico, realizadoDoPeriodo, metaDoPeriodo, metaDoAno, mesmoPeriodoAnoAnterior, fechamentoAnoAnterior,
    carteirasNoAno, carteirasMesAMes,
  };
}

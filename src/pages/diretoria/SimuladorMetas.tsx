// O simulador de metas (§15 do docs/instrucoes-painel-comercial.md,
// "Simulador de metas"). Ver .scratch/plano-l6e-simulador-e-tendencia.md §1
// e .scratch/plano-l6e-correcoes.md §1 (correção D1 da auditoria).
//
// O QUE O DOCUMENTO PEDE × O QUE EXISTE AQUI (escrito porque quem ler o §15
// depois vai procurar o botão de copiar JSON e precisa saber por que ele
// não existe): as três ações do documento nasceram porque o painel ANTIGO
// não salvava — o diretor editava no navegador, copiava um JSON e colava
// num arquivo à mão. Aqui a tela salva de verdade em `com_metas`, então:
//
//   Documento                          | Aqui
//   ------------------------------------|----------------------------------
//   restaurar as metas do arquivo       | Restaurar as metas salvas
//   distribuir a meta anual pelos meses | igual
//   copiar as metas em JSON             | Atualizar metas das carteiras escolhidas
//
// A CONTA fica no navegador, de propósito (§1.2 do plano) — é o único lugar
// desta sequência de levas em que isso é correto: aritmética sobre doze
// valores que o diretor está digitando, ainda não salvos. Mas a regra em si
// mora em `src/lib/simulador-metas.ts`, com Vitest — nunca solta aqui.
//
// CORREÇÃO D1 (auditoria): o §15 pede QUATRO coisas recalculando junto —
// "cobertura, total anual, o gráfico e cinco projeções". O plano original
// entregou só total anual e as projeções. Cobertura e gráfico entram aqui:
// o gráfico é o MESMO desenho da visão "Resumo" da Diretoria
// (`DiretoriaResumo.tsx`, via `useMetaXRealizadoAno` — tracejado para meta,
// cheio para realizado, verde quando bate e vermelho quando não), só que
// lendo a meta SIMULADA, não a salva. Doze pontos com um Cell por barra não
// pesa abstração própria — reimplementado aqui, não importado.
//
// FRENTE 7b (.scratch/plano-frente7b-metas-reais-e-simulador.md §2/§3,
// 2026-09-24): o dono reclamou que o simulador "não funciona bem, deveria
// ser antes da meta, e já mostrar em tempo real" — e que só dava para
// simular o total da empresa, nunca uma carteira (por isso "escolher quais
// carteiras atualizar" não existia). Dois modos, um alvo de VISUALIZAÇÃO:
//
//   MANUAL — o diretor escolhe uma carteira no seletor e digita os doze
//   meses à mão, como sempre.
//
//   POR PERCENTUAL — o diretor marca uma ou mais carteiras (caixas de
//   seleção) e digita um percentual por carteira marcada. A meta de cada
//   mês vira aquele percentual sobre o realizado da MESMA carteira no
//   MESMO mês do ano anterior — nunca o ano dividido por doze (a
//   sazonalidade da Minasflor é forte: a INBRAS fez R$ 56 mil em janeiro/
//   2026 e R$ 626 mil em junho). Mês sem base fica NULO — a tela conta
//   quantos.
//
// FRENTE 7c (.scratch/plano-frente7c-total-e-bercario.md §1, 2026-09-24):
// "Total da empresa" saiu como alvo — de visualização e de gravação. A
// meta da empresa deixou de ser um número à parte; é a SOMA das metas por
// carteira (`metaOficialPorMes`, `src/lib/comparativoAnos.ts`), calculada,
// nunca simulada aqui. Simular "o total" sem simular carteira nenhuma não
// tinha mais sentido depois disso — quem quiser ver o efeito no total simula
// carteira a carteira e olha a grade de Meta, que já mostra a soma.
//
// O seletor de carteira (`carteiraSelecionada`) só decide o que o
// gráfico/cobertura/projeções MOSTRAM agora; as caixas de seleção do modo
// percentual decidem o que vai ser GRAVADO — as duas coisas são
// independentes de propósito. Antes de gravar, o resumo
// (`calcularResumoAtualizacao`, `src/lib/simulador-metas.ts`) mostra quantos
// meses, em quais carteiras, e o total antes × depois — doze meses em
// quatro carteiras são 48 escritas, e o diretor tem de ver o tamanho do que
// está mandando antes de clicar em "Atualizar metas das carteiras
// escolhidas" (o botão deixou de se chamar "Salvar").
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  useCarteiras, useMetasCarteiraDoAno, useMetasDoAno, useSalvarMeta,
} from '@/hooks/useComercialCarteirasMetas';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import {
  MESES, mesesFechados, metaDefinidaPorMes, realizadoPorMesDaCarteira,
} from '@/lib/comparativoAnos';
import {
  calcularCoberturaSimulada, calcularMetaPorPercentual, calcularProjecoes, calcularResumoAtualizacao,
  distribuirMetaAnual, type ItemResumoAtualizacao,
} from '@/lib/simulador-metas';
import { interpretarValorDigitado } from '@/lib/valor-celula';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

interface Alvo {
  key: string;
  carteira: string;
  nome: string;
}

/** Converte um número para o texto editável com vírgula decimal — a forma que o diretor digita (item 1 da Frente 7b). `String(number)` do JS sai com ponto. */
function paraTexto(v: number): string {
  return String(v).replace('.', ',');
}

export default function SimuladorMetas({ ano }: { ano: number }) {
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinir = canComoOBanco('metas', 'definir');

  const { data: carteiras = [], isLoading: carregandoCarteiras } = useCarteiras();
  const { data: metasDoAno = [], isLoading: carregandoMetas } = useMetasDoAno(ano);
  const { data: metasCarteiraAtual = [], isLoading: carregandoCarteiraAtual } = useMetasCarteiraDoAno(ano);
  const { data: metasCarteiraAnterior = [], isLoading: carregandoCarteiraAnterior } = useMetasCarteiraDoAno(ano - 1);
  const salvar = useSalvarMeta();

  const isLoading = carregandoCarteiras || carregandoMetas || carregandoCarteiraAtual || carregandoCarteiraAnterior;

  // Frente 7c §1: "Total da empresa" saiu do seletor — não existe mais alvo
  // de gravação (nem de visualização) que não seja uma carteira real.
  const alvos = useMemo<Alvo[]>(
    () => carteiras.map((c): Alvo => ({ key: c, carteira: c, nome: c })),
    [carteiras],
  );

  const [carteiraSelecionada, setCarteiraSelecionada] = useState('');
  const alvoSelecionado = alvos.find((a) => a.key === carteiraSelecionada) ?? alvos[0];
  const targetSelecionado = alvoSelecionado?.carteira ?? null;

  const realizadoAtualDoAlvo = (target: string | null) => (
    target === null ? Array(12).fill(null) : realizadoPorMesDaCarteira(metasCarteiraAtual, target)
  );
  const realizadoAnteriorDoAlvo = (target: string | null) => (
    target === null ? Array(12).fill(null) : realizadoPorMesDaCarteira(metasCarteiraAnterior, target)
  );
  const metaAtualDoAlvo = (target: string | null) => metaDefinidaPorMes(metasDoAno, target);

  const fechados = mesesFechados(ano, todayISO());

  // ─────────────────────────────────────────────────────────────────────
  // Modo MANUAL — doze campos editáveis do alvo selecionado.
  // ─────────────────────────────────────────────────────────────────────
  const [modo, setModo] = useState<'manual' | 'percentual'>('manual');

  const [textos, setTextos] = useState<string[]>(() => metaAtualDoAlvo(targetSelecionado).map(paraTexto));
  // Hidrata uma vez por (ANO, CARTEIRA) — nunca a cada refetch em segundo
  // plano, senão um refetch incidental (foco de janela, invalidação de
  // outra mutação) apagaria uma simulação em andamento que ainda não foi
  // salva. Trocar de carteira também re-hidrata: é uma série que ainda não
  // estava sendo editada.
  const chaveHidratada = useRef<string | null>(null);
  useEffect(() => {
    const chave = `${ano}-${carteiraSelecionada}`;
    if (!isLoading && chaveHidratada.current !== chave) {
      setTextos(metaAtualDoAlvo(targetSelecionado).map(paraTexto));
      chaveHidratada.current = chave;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, carteiraSelecionada, isLoading]);

  // CORREÇÃO 5.3 (auditoria, herdada): texto vazio é um estado válido
  // enquanto o diretor digita — `interpretarValorDigitado('')` devolve
  // `nulo`, e só a leitura para CÁLCULO (`valoresNumericos`) trata isso como
  // zero; o campo continua mostrando vazio, nunca forçando "0" de volta.
  const valoresNumericos = textos.map((t) => {
    const interpretado = interpretarValorDigitado(t);
    return interpretado.tipo === 'numero' ? interpretado.valor : 0;
  });

  const restaurar = () => setTextos(metaAtualDoAlvo(targetSelecionado).map(paraTexto));

  const [totalParaDistribuir, setTotalParaDistribuir] = useState('');
  const distribuir = () => {
    const interpretado = interpretarValorDigitado(totalParaDistribuir);
    if (interpretado.tipo !== 'numero' || interpretado.valor <= 0) {
      // CORREÇÃO 5.4 (auditoria, herdada): saía em silêncio — o diretor
      // clicava e nada visivelmente acontecia, sem dizer por quê.
      toast.error('Informe um total maior que zero para distribuir.');
      return;
    }
    const resultado = distribuirMetaAnual(interpretado.valor, valoresNumericos, fechados);
    if (resultado === null) {
      toast.error('O total pedido já foi alcançado (ou superado) nos meses fechados — nada para distribuir nos meses abertos.');
      return;
    }
    setTextos(resultado.map(paraTexto));
  };

  // ─────────────────────────────────────────────────────────────────────
  // Modo POR PERCENTUAL — uma ou mais carteiras marcadas, cada uma com o
  // próprio percentual sobre o realizado do mesmo mês do ano anterior.
  // ─────────────────────────────────────────────────────────────────────
  const [carteirasEscolhidas, setCarteirasEscolhidas] = useState<Record<string, boolean>>({});
  const [percentuais, setPercentuais] = useState<Record<string, string>>({});

  const calcularParaAlvo = (alvo: Alvo) => {
    const interpretado = interpretarValorDigitado(percentuais[alvo.key] ?? '');
    if (interpretado.tipo !== 'numero') return null;
    const base = realizadoAnteriorDoAlvo(alvo.carteira);
    return { percentualNumero: interpretado.valor, resultado: calcularMetaPorPercentual(interpretado.valor, base) };
  };

  // ─────────────────────────────────────────────────────────────────────
  // O que o gráfico/cobertura/projeções mostram — a série do alvo
  // SELECIONADO no seletor (independente do que está marcado para gravar).
  // ─────────────────────────────────────────────────────────────────────
  const metasSimuladasPreview = modo === 'manual'
    ? valoresNumericos
    : (calcularParaAlvo(alvoSelecionado)?.resultado.metas.map((v) => v ?? 0) ?? Array(12).fill(0));

  const realizadoAtual = realizadoAtualDoAlvo(targetSelecionado);
  const realizadoAnterior = realizadoAnteriorDoAlvo(targetSelecionado);
  const projecoes = calcularProjecoes(metasSimuladasPreview, realizadoAtual, realizadoAnterior, fechados);
  const cobertura = calcularCoberturaSimulada(metasSimuladasPreview, realizadoAtual);

  const dadosGrafico = MESES.map((label, i) => ({
    mes: label,
    realizado: realizadoAtual[i],
    meta: metasSimuladasPreview[i],
    // Mês sem meta simulada (campo zerado) não tem como "bater" — nulo,
    // mesma leitura de `cobertura.mensal[i]`, nunca falso (que pintaria
    // vermelho um mês sem meta nenhuma). Mês sem realizado AINDA IMPORTADO
    // (ausência, não zero) é a mesma regra: `realizadoAtual[i]` nulo nunca
    // se compara como se fosse zero.
    bate: metasSimuladasPreview[i] === 0 || realizadoAtual[i] == null ? null : realizadoAtual[i]! >= metasSimuladasPreview[i],
  }));

  // ─────────────────────────────────────────────────────────────────────
  // O que vai ser gravado, e o resumo antes de gravar (§3 do plano): no
  // modo manual, só o alvo selecionado; no percentual, todas as carteiras
  // marcadas — cada uma com sua própria proposta.
  // ─────────────────────────────────────────────────────────────────────
  const itensParaGravar: ItemResumoAtualizacao[] = modo === 'manual'
    ? [{ carteira: targetSelecionado, atuais: metaAtualDoAlvo(targetSelecionado), propostos: valoresNumericos }]
    : alvos.filter((a) => carteirasEscolhidas[a.key]).map((a) => ({
      carteira: a.carteira,
      atuais: metaAtualDoAlvo(a.carteira),
      propostos: calcularParaAlvo(a)?.resultado.metas ?? Array(12).fill(null),
    }));

  const resumo = calcularResumoAtualizacao(itensParaGravar);

  const atualizarMetas = async () => {
    const escritas = itensParaGravar.flatMap((item) => item.propostos
      .map((proposto, i) => ({ carteira: item.carteira, mes: i + 1, proposto, atual: item.atuais[i] }))
      .filter((m): m is { carteira: string | null; mes: number; proposto: number; atual: number } => m.proposto != null && m.proposto !== m.atual));

    if (escritas.length === 0) {
      toast.info('Nenhum mês foi alterado.');
      return;
    }

    // O `id` de cada meta já existente, por carteira/mês. Linhas históricas
    // de `com_metas` com carteira nula (o total digitado, Frente 7c §1)
    // continuam no banco, mas nunca aparecem em `itensParaGravar` — só
    // chaves de carteira real são consultadas neste mapa.
    const idPorCarteiraMes = new Map(metasDoAno.map((m) => [`${m.carteira}-${m.mes}`, m.id]));

    // CORREÇÃO 5.5 (auditoria, herdada): até 48 `mutateAsync` em série
    // (doze meses × quatro carteiras), cada um com o próprio toast e,
    // falhando no meio, nenhum aviso do que já ficou gravado.
    // `silencioso: true` cala o toast de cada chamada; esta função avisa
    // UMA vez, no fim.
    try {
      for (const e of escritas) {
        await salvar.mutateAsync({
          id: idPorCarteiraMes.get(`${e.carteira}-${e.mes}`),
          ano,
          mes: e.mes,
          carteira: e.carteira,
          valor: e.proposto,
          silencioso: true,
        });
      }
      toast.success(`${escritas.length} ${escritas.length === 1 ? 'mês salvo' : 'meses salvos'}.`);
    } catch (e) {
      toast.error(`Falha ao salvar — parte dos meses pode ter ficado gravada. ${mensagemDeErro(e)}`);
    }
  };

  // `alvos` só fica vazio com zero carteiras conhecidas — não há mais o
  // sentinela "Total da empresa" para garantir pelo menos um item (Frente
  // 7c §1). Sem carteira nenhuma não há o que simular.
  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!alvoSelecionado) {
    return <p className="text-[13px] text-muted-foreground">Nenhuma carteira conhecida ainda — crie uma na grade de Realizado abaixo para simular.</p>;
  }

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5" aria-hidden="true" /> Simulador de metas
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Escolha a carteira, altere os meses ou aplique um percentual — recalcula na hora. Nada é gravado até clicar em "Atualizar metas das carteiras escolhidas".
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] text-muted-foreground">Carteira simulada (só decide o que a tela mostra abaixo)</label>
        {/* `alvoSelecionado?.key` no lugar do estado cru: cobre o instante
            em que `carteiraSelecionada` ainda não bateu com nenhuma
            carteira carregada (primeira renderização) sem deixar o seletor
            aparentando estar vazio enquanto o cálculo já usa a primeira. */}
        <Select value={alvoSelecionado?.key ?? ''} onValueChange={setCarteiraSelecionada}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {alvos.map((a) => <SelectItem key={a.key} value={a.key}>{a.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={modo} onValueChange={(v) => setModo(v as 'manual' | 'percentual')}>
        <TabsList>
          <TabsTrigger value="manual">Manual</TabsTrigger>
          <TabsTrigger value="percentual">Por percentual</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {MESES.map((label, i) => (
              <div key={label} className="space-y-1">
                <label className="text-[11px] text-muted-foreground">{label}</label>
                <CampoMoeda
                  texto={textos[i]}
                  onChangeTexto={(t) => setTextos((v) => v.map((atual, idx) => (idx === i ? t : atual)))}
                  disabled={!podeDefinir}
                />
                {/* Cobertura mês a mês (§15): realizado ÷ meta simulada. Nula
                    (nunca 0%) no mês sem meta simulada — `calcularCoberturaSimulada` já
                    garante isto. */}
                <p className="text-[10px] text-muted-foreground">
                  Cobertura: {cobertura.mensal[i] === null ? '—' : `${Math.round(cobertura.mensal[i]! * 100)}%`}
                </p>
              </div>
            ))}
          </div>

          {podeDefinir && (
            <div className="flex flex-wrap items-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={restaurar}>Restaurar as metas salvas</Button>
              <div className="flex items-end gap-1.5">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Distribuir meta anual pelos meses abertos</label>
                  <Input
                    value={totalParaDistribuir}
                    onChange={(e) => setTotalParaDistribuir(e.target.value)}
                    placeholder="Total do ano"
                    className="h-8 w-36 text-[12px]"
                  />
                </div>
                <Button variant="secondary" size="sm" onClick={distribuir} disabled={!totalParaDistribuir}>Distribuir</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="percentual" className="pt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Marque as carteiras e diga o percentual de cada uma sobre o realizado da MESMA carteira no mesmo mês de {ano - 1} — nunca o ano dividido por doze, por causa da sazonalidade.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {alvos.map((a) => {
              const marcada = !!carteirasEscolhidas[a.key];
              const calculo = marcada ? calcularParaAlvo(a) : null;
              // Item 3 do plano (Berçário): quando a carteira não tem
              // NENHUM realizado no ano anterior, o percentual não tem base
              // nenhuma para calcular — os 12 meses viram nulo por dentro
              // de `calcularMetaPorPercentual`, mas a tela dizia só "12
              // meses sem realizado — ficam sem meta", que soa a defeito.
              // Fala direto o que está faltando.
              const semBaseNenhuma = calculo?.resultado.mesesSemBase === 12;
              return (
                <div key={a.key} className="rounded-md border border-border p-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={marcada}
                      onCheckedChange={(v) => setCarteirasEscolhidas((s) => ({ ...s, [a.key]: v === true }))}
                      disabled={!podeDefinir}
                    />
                    <span className="text-[12px] font-medium flex-1">{a.nome}</span>
                    <Input
                      value={percentuais[a.key] ?? ''}
                      onChange={(e) => setPercentuais((s) => ({ ...s, [a.key]: e.target.value }))}
                      placeholder="Ex.: 120"
                      disabled={!podeDefinir || !marcada}
                      className="h-7 w-20 text-[12px] text-right"
                    />
                    <span className="text-[11px] text-muted-foreground">%</span>
                  </div>
                  {marcada && calculo && semBaseNenhuma && (
                    <p className="text-[10px] text-status-warning">
                      {a.nome} não tem realizado em {ano - 1} — não há base para calcular percentual. Digite a meta em reais.
                    </p>
                  )}
                  {marcada && calculo && !semBaseNenhuma && (
                    <p className="text-[10px] text-muted-foreground">
                      {calculo.percentualNumero}% do que a carteira {a.nome} realizou no mesmo mês de {ano - 1}.
                      {calculo.resultado.mesesSemBase > 0 && ` ${calculo.resultado.mesesSemBase} ${calculo.resultado.mesesSemBase === 1 ? 'mês' : 'meses'} de ${ano - 1} sem realizado — ficam sem meta.`}
                    </p>
                  )}
                  {marcada && !calculo && (
                    <p className="text-[10px] text-muted-foreground">Digite um percentual para calcular.</p>
                  )}
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <div className="rounded-md border border-border p-3">
        <p className="text-[11px] font-semibold text-foreground mb-2">Meta simulada × realizado — {alvoSelecionado.nome}</p>
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={dadosGrafico} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mes" fontSize={11} />
            <YAxis fontSize={11} tickFormatter={(v) => formatBRL(v)} width={70} />
            <Tooltip formatter={(v: number) => formatBRL(v)} />
            <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
              {dadosGrafico.map((d) => (
                <Cell key={d.mes} fill={d.bate === null ? 'hsl(var(--muted-foreground))' : d.bate ? 'hsl(var(--status-success))' : 'hsl(var(--status-danger))'} />
              ))}
            </Bar>
            <Line dataKey="meta" name="Meta simulada" stroke="hsl(var(--foreground))" strokeDasharray="5 5" dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Projecao titulo="Meta do ano" valor={projecoes.metaDoAno} />
        <Projecao titulo="Quanto falta" valor={projecoes.quantoFalta} />
        <Projecao
          titulo="Necessário/mês (meses abertos)"
          valor={projecoes.necessarioPorMesAbertos}
          vazioTexto="ano fechado"
        />
        <Projecao
          titulo="Esforço sobre a média"
          valor={projecoes.esforcoSobreMediaRealizada}
          formatar={(v) => `${v.toFixed(2)}×`}
        />
        <Projecao titulo="Projeção no ritmo atual" valor={projecoes.projecaoRitmoAtual} />
        <Projecao titulo={`Projeção repetindo ${ano - 1}`} valor={projecoes.projecaoRepetindoAnoAnterior} />
        <Projecao
          titulo="Cobertura acumulada no ano"
          valor={cobertura.acumulada}
          vazioTexto="meta do ano zerada"
          formatar={(v) => `${Math.round(v * 100)}%`}
        />
      </div>

      {podeDefinir && (
        <div className="space-y-2 border-t border-border pt-3">
          {/* O tamanho do que vai ser gravado, ANTES de gravar (§3 do plano):
              doze meses em quatro carteiras são 48 escritas, e o diretor
              precisa ver isso, não só descobrir depois. */}
          {resumo.meses > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Vai gravar {resumo.meses} {resumo.meses === 1 ? 'mês' : 'meses'} em {resumo.carteiras.length} {resumo.carteiras.length === 1 ? 'carteira' : 'carteiras'} ({resumo.carteiras.join(', ')}) — total {formatBRL(resumo.totalAntes)} → {formatBRL(resumo.totalDepois)}.
            </p>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={atualizarMetas} disabled={salvar.isPending || resumo.meses === 0}>
              Atualizar metas das carteiras escolhidas
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Um campo de dinheiro do simulador (Frente 7b, item 1): sem foco mostra
 * formatado em reais; com foco, o número cru para digitar — mesmo padrão de
 * `CelulaMeta` (`DiretoriaMetas.tsx`), mas recalculando a CADA tecla (não só
 * no blur), porque aqui "Altere qualquer mês para recalcular na hora" é a
 * promessa da tela desde a leva anterior.
 */
function CampoMoeda({ texto, onChangeTexto, disabled }: { texto: string; onChangeTexto: (texto: string) => void; disabled: boolean }) {
  const [focado, setFocado] = useState(false);
  const interpretado = interpretarValorDigitado(texto);
  const numero = interpretado.tipo === 'numero' ? interpretado.valor : 0;
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={focado ? texto : (texto === '' ? '' : formatBRL(numero))}
      onChange={(e) => onChangeTexto(e.target.value)}
      onFocus={() => setFocado(true)}
      onBlur={() => setFocado(false)}
      disabled={disabled}
      className="h-8 text-[12px]"
    />
  );
}

function Projecao({
  titulo, valor, vazioTexto = '—', formatar = formatBRL,
}: {
  titulo: string;
  valor: number | null;
  vazioTexto?: string;
  formatar?: (v: number) => string;
}) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-[13px] font-semibold text-foreground mt-0.5">
        {valor === null ? <span className="text-muted-foreground font-normal">{vazioTexto}</span> : formatar(valor)}
      </p>
    </div>
  );
}

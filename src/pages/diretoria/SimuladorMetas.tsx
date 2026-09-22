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
//   copiar as metas em JSON             | Salvar (grava em com_metas)
//
// A CONTA fica no navegador, de propósito (§1.2 do plano) — é o único lugar
// desta sequência de levas em que isso é correto: aritmética sobre doze
// valores que o diretor está digitando, ainda não salvos. Mas a regra em si
// mora em `src/lib/simulador-metas.ts`, com Vitest — nunca solta aqui.
//
// CORREÇÃO D1 (auditoria): o §15 pede QUATRO coisas recalculando junto —
// "cobertura, total anual, o gráfico e cinco projeções". O plano original
// entregou só total anual e as projeções. Cobertura e gráfico entram aqui:
// o gráfico é o MESMO desenho da aba "Meta × realizado"
// (`DiretoriaMetaXRealizado.tsx` — tracejado para meta, cheio para
// realizado, verde quando bate e vermelho quando não), só que lendo a meta
// SIMULADA (`valoresNumericos`), não a salva. Doze pontos com um Cell por
// barra não pesa abstração própria — reimplementado aqui, não importado.
import { useEffect, useRef, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useMetasAnoDoAno, useMetasDoAno, useSalvarMeta } from '@/hooks/useComercialCarteirasMetas';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import { MESES, mesesFechados, realizadoPorMes } from '@/lib/comparativoAnos';
import { calcularCobertura, calcularProjecoes, distribuirMetaAnual } from '@/lib/simulador-metas';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

export default function SimuladorMetas({ ano }: { ano: number }) {
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinir = canComoOBanco('metas', 'definir');

  const { data: metasDoAno = [], isLoading: carregandoMetas } = useMetasDoAno(ano);
  const { data: metasAnoAtual = [], isLoading: carregandoRealizado } = useMetasAnoDoAno(ano);
  const { data: metasAnoAnterior = [], isLoading: carregandoRealizadoAnterior } = useMetasAnoDoAno(ano - 1);
  const salvar = useSalvarMeta();

  const metaTotalPorMes = metasDoAno.reduce<number[]>((acc, m) => {
    if (m.carteira === null) acc[m.mes - 1] = m.valor;
    return acc;
  }, Array(12).fill(0));

  // CORREÇÃO 5.3 (auditoria): o estado aceita string vazia enquanto o
  // diretor digita — `Number('') === 0` no `<Input type="number">`
  // controlado não deixava LIMPAR o campo (a tela forçava de volta para
  // "0" a cada tecla apagada). O zero só entra na conta em
  // `valoresNumericos`, nunca aqui.
  const [valores, setValores] = useState<(number | '')[]>(metaTotalPorMes);
  // Hidrata uma vez por ANO — nunca a cada refetch em segundo plano, senão
  // um refetch incidental (foco de janela, invalidação de outra mutação)
  // apagaria uma simulação em andamento que ainda não foi salva.
  const anoHidratado = useRef<number | null>(null);
  useEffect(() => {
    if (!carregandoMetas && anoHidratado.current !== ano) {
      setValores(metaTotalPorMes);
      anoHidratado.current = ano;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, carregandoMetas]);

  const valoresNumericos = valores.map((v) => (v === '' ? 0 : v));

  const isLoading = carregandoMetas || carregandoRealizado || carregandoRealizadoAnterior;
  const fechados = mesesFechados(ano, todayISO());
  const realizadoAtual = realizadoPorMes(metasAnoAtual);
  const realizadoAnterior = realizadoPorMes(metasAnoAnterior);
  const projecoes = calcularProjecoes(valoresNumericos, realizadoAtual, realizadoAnterior, fechados);
  const cobertura = calcularCobertura(valoresNumericos, realizadoAtual);

  const dadosGrafico = MESES.map((label, i) => ({
    mes: label,
    realizado: realizadoAtual[i],
    meta: valoresNumericos[i],
    // Mês sem meta simulada (campo zerado) não tem como "bater" — nulo,
    // mesma leitura de `cobertura.mensal[i]`, nunca falso (que pintaria
    // vermelho um mês sem meta nenhuma). Mês sem realizado AINDA IMPORTADO
    // (ausência, não zero) é a mesma regra: `realizadoAtual[i]` nulo nunca
    // se compara como se fosse zero — senão pintaria vermelho um mês sem
    // dado nenhum (a causa do bug que esta leva corrige).
    bate: valoresNumericos[i] === 0 || realizadoAtual[i] == null ? null : realizadoAtual[i]! >= valoresNumericos[i],
  }));

  const [totalParaDistribuir, setTotalParaDistribuir] = useState('');

  const restaurar = () => setValores(metaTotalPorMes);

  const distribuir = () => {
    const total = Number(totalParaDistribuir.replace(',', '.'));
    if (!Number.isFinite(total) || total <= 0) {
      // CORREÇÃO 5.4 (auditoria): saía em silêncio — o diretor clicava e
      // nada visivelmente acontecia, sem dizer por quê.
      toast.error('Informe um total maior que zero para distribuir.');
      return;
    }
    const resultado = distribuirMetaAnual(total, valoresNumericos, fechados);
    if (resultado === null) {
      toast.error('O total pedido já foi alcançado (ou superado) nos meses fechados — nada para distribuir nos meses abertos.');
      return;
    }
    setValores(resultado);
  };

  const salvarSimulacao = async () => {
    // Só grava os meses cujo valor simulado difere do salvo — o resto não
    // muda no banco. Um `com_metas` por mês (carteira nula = meta total).
    const idPorMes = new Map(metasDoAno.filter((m) => m.carteira === null).map((m) => [m.mes, m.id]));
    const alterados = valoresNumericos
      .map((valor, i) => ({ mes: i + 1, valor, valorSalvo: metaTotalPorMes[i] }))
      .filter((m) => m.valor !== m.valorSalvo);

    if (alterados.length === 0) {
      toast.info('Nenhum mês foi alterado.');
      return;
    }

    // CORREÇÃO 5.5 (auditoria): até doze `mutateAsync` em série, cada um com
    // o próprio toast ("Meta salva." doze vezes) e, falhando no meio,
    // nenhum aviso do que já ficou gravado. `silencioso: true` cala o toast
    // de cada chamada (`useSalvarMeta`) e esta função avisa UMA vez, no fim
    // — sucesso com a contagem, ou erro dizendo que parte pode ter ficado
    // gravada (a escrita já feita nos meses anteriores ao que falhou não
    // se desfaz sozinha).
    try {
      for (const m of alterados) {
        await salvar.mutateAsync({
          id: idPorMes.get(m.mes), ano, mes: m.mes, carteira: null, valor: m.valor, silencioso: true,
        });
      }
      toast.success(`${alterados.length} ${alterados.length === 1 ? 'mês salvo' : 'meses salvos'}.`);
    } catch (e) {
      toast.error(`Falha ao salvar — parte dos meses pode ter ficado gravada. ${mensagemDeErro(e)}`);
    }
  };

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
          <Calculator className="w-3.5 h-3.5" aria-hidden="true" /> Simulador de metas
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Altere qualquer mês para recalcular na hora. Nada é gravado até clicar em "Salvar".
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {MESES.map((label, i) => (
          <div key={label} className="space-y-1">
            <label className="text-[11px] text-muted-foreground">{label}</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={valores[i]}
              onChange={(e) => {
                const texto = e.target.value;
                setValores((v) => v.map((atual, idx) => {
                  if (idx !== i) return atual;
                  if (texto === '') return '';
                  const numero = Number(texto);
                  return Number.isFinite(numero) ? numero : atual;
                }));
              }}
              disabled={!podeDefinir}
              className="h-8 text-[12px]"
            />
            {/* Cobertura mês a mês (§15): realizado ÷ meta simulada. Nula
                (nunca 0%) no mês sem meta simulada — `calcularCobertura` já
                garante isto. */}
            <p className="text-[10px] text-muted-foreground">
              Cobertura: {cobertura.mensal[i] === null ? '—' : `${Math.round(cobertura.mensal[i]! * 100)}%`}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border p-3">
        <p className="text-[11px] font-semibold text-foreground mb-2">Meta simulada × realizado</p>
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
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
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

          <Button size="sm" onClick={salvarSimulacao} disabled={salvar.isPending} className="ml-auto">
            Salvar
          </Button>
        </div>
      )}
    </div>
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

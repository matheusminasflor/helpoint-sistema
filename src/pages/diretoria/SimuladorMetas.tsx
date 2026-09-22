// O simulador de metas (§15 do docs/instrucoes-painel-comercial.md,
// "Simulador de metas"). Ver .scratch/plano-l6e-simulador-e-tendencia.md §1.
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
import { useEffect, useRef, useState } from 'react';
import { Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useMetasDoAno, useMetasXRealizado, useSalvarMeta } from '@/hooks/useComercialCarteirasMetas';
import { MESES, mesesFechados, realizadoPorMes } from '@/lib/comparativoAnos';
import { calcularProjecoes, distribuirMetaAnual } from '@/lib/simulador-metas';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

export default function SimuladorMetas({ ano }: { ano: number }) {
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeDefinir = canComoOBanco('metas', 'definir');

  const { data: metasDoAno = [], isLoading: carregandoMetas } = useMetasDoAno(ano);
  const { data: linhasAno = [], isLoading: carregandoRealizado } = useMetasXRealizado(ano, null);
  const { data: linhasAnoAnterior = [], isLoading: carregandoRealizadoAnterior } = useMetasXRealizado(ano - 1, null);
  const salvar = useSalvarMeta();

  const metaTotalPorMes = metasDoAno.reduce<number[]>((acc, m) => {
    if (m.carteira_id === null) acc[m.mes - 1] = m.valor;
    return acc;
  }, Array(12).fill(0));

  const [valores, setValores] = useState<number[]>(metaTotalPorMes);
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

  const isLoading = carregandoMetas || carregandoRealizado || carregandoRealizadoAnterior;
  const fechados = mesesFechados(ano, todayISO());
  const realizadoAtual = realizadoPorMes(linhasAno);
  const realizadoAnterior = realizadoPorMes(linhasAnoAnterior);
  const projecoes = calcularProjecoes(valores, realizadoAtual, realizadoAnterior, fechados);

  const [totalParaDistribuir, setTotalParaDistribuir] = useState('');

  const restaurar = () => setValores(metaTotalPorMes);

  const distribuir = () => {
    const total = Number(totalParaDistribuir.replace(',', '.'));
    if (!Number.isFinite(total) || total <= 0) return;
    const resultado = distribuirMetaAnual(total, valores, fechados);
    if (resultado === null) {
      toast.error('O total pedido já foi alcançado (ou superado) nos meses fechados — nada para distribuir nos meses abertos.');
      return;
    }
    setValores(resultado);
  };

  const salvarSimulacao = async () => {
    // Só grava os meses cujo valor simulado difere do salvo — o resto não
    // muda no banco. Um `com_metas` por mês (carteira nula = meta total).
    const idPorMes = new Map(metasDoAno.filter((m) => m.carteira_id === null).map((m) => [m.mes, m.id]));
    const alterados = valores
      .map((valor, i) => ({ mes: i + 1, valor, valorSalvo: metaTotalPorMes[i] }))
      .filter((m) => m.valor !== m.valorSalvo);

    for (const m of alterados) {
      await salvar.mutateAsync({ id: idPorMes.get(m.mes), ano, mes: m.mes, carteiraId: null, valor: m.valor });
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
                const numero = Number(e.target.value);
                setValores((v) => v.map((atual, idx) => (idx === i ? (Number.isFinite(numero) ? numero : 0) : atual)));
              }}
              disabled={!podeDefinir}
              className="h-8 text-[12px]"
            />
          </div>
        ))}
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

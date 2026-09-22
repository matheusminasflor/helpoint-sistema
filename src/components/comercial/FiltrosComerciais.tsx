// Os dois <Select> de ano + filial, repetidos em CINCO telas do Insights do
// Comercial (achado 7 da auditoria da L6c): Painel, Curva ABC, Clientes,
// Bonificação e Cashback. Extraído junto com `useAnoComVenda`
// (`src/hooks/useComercialPainel.ts`) — a próxima mudança de regra de ano
// ou filial não erra mais numa cópia esquecida.
//
// Não envolve num `<div>` próprio: quem chama continua dono do layout (cada
// tela pode ter um terceiro `<Select>` — série, critério — na mesma linha),
// então o componente devolve só os dois `<Select>`, e quem chama põe a
// `<div className="flex ...">` em volta, como já fazia antes.
//
// O seletor de período do §14 (achado D2 da auditoria da L6e) é OPCIONAL:
// só aparece quando quem chama passa `periodo`/`onPeriodoChange` — as telas
// cuja RPC só aceita `p_ano` (Vendas, Clientes, Cashback; ver
// `docs/nao-funciona.md`) não passam, e o seletor simplesmente não existe
// ali. Melhor não ter do que ter e não responder.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MESES } from '@/lib/comparativoAnos';
import type { PeriodoComercial } from '@/lib/period';
import type { Filial } from '@/types/comercial';

const PERIODO_LABEL: Record<PeriodoComercial, string> = {
  mes: 'Um mês',
  ultimos3: 'Últimos 3 meses',
  ultimos6: 'Últimos 6 meses',
  ano: 'Ano todo',
};
const OPCOES_PERIODO = Object.keys(PERIODO_LABEL) as PeriodoComercial[];

interface FiltrosComerciaisProps {
  ano: number;
  anos: number[];
  onAnoChange: (ano: number) => void;
  filial: Filial | null;
  onFilialChange: (filial: Filial | null) => void;
  periodo?: PeriodoComercial;
  onPeriodoChange?: (periodo: PeriodoComercial) => void;
  /** Só é lido/mostrado quando `periodo === 'mes'`. 1 = janeiro. */
  mes?: number;
  onMesChange?: (mes: number) => void;
}

export function FiltrosComerciais({
  ano, anos, onAnoChange, filial, onFilialChange, periodo, onPeriodoChange, mes, onMesChange,
}: FiltrosComerciaisProps) {
  return (
    <>
      <Select value={String(ano)} onValueChange={(v) => onAnoChange(Number(v))}>
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={filial ?? 'todas'} onValueChange={(v) => onFilialChange(v === 'todas' ? null : (v as Filial))}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Filial" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">As duas filiais</SelectItem>
          <SelectItem value="MF">MF</SelectItem>
          <SelectItem value="INBRAS">INBRAS</SelectItem>
        </SelectContent>
      </Select>
      {periodo && onPeriodoChange && (
        <>
          <Select value={periodo} onValueChange={(v) => onPeriodoChange(v as PeriodoComercial)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {OPCOES_PERIODO.map((p) => <SelectItem key={p} value={p}>{PERIODO_LABEL[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          {periodo === 'mes' && mes !== undefined && onMesChange && (
            <Select value={String(mes)} onValueChange={(v) => onMesChange(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((label, i) => <SelectItem key={label} value={String(i + 1)}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </>
      )}
    </>
  );
}

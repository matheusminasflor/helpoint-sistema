// O período das telas de meta da Diretoria (Resumo e Metas e carteiras), ao lado do seletor
// de ano: "Ano todo" (o de sempre) ou "Este mês", "Este trimestre", "Este ano",
// "Personalizado" (pedido do dono, 2026-10-03). O estado é de `usePeriodoNaUrl('ano')`, na URL.
//
// Meta e realizado informado são MENSAIS: com um período, valem os meses inteiros que ele toca
// — quem usa este seletor mostra a frase de `avisoDeMesesInteiros`.
import { useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PeriodoPersonalizado } from '@/components/ui/PeriodoPersonalizado';
import { OPCOES_DE_CALENDARIO, PERSONALIZADO, type IntervaloDeDias } from '@/lib/period';

export const ANO_TODO = 'ano' as const;

const OPCOES = [{ value: ANO_TODO, label: 'Ano todo' }, ...OPCOES_DE_CALENDARIO];

interface Props {
  ano: number;
  /** Os anos que o seletor de ano oferece — o ano só acompanha o período quando ele está aqui. */
  anos: number[];
  setAno: (ano: number) => void;
  periodo: string;
  intervalo: IntervaloDeDias | null;
  escolher: (novo: string, inicial?: IntervaloDeDias | null) => void;
  definirIntervalo: (novo: IntervaloDeDias) => void;
}

export function SeletorPeriodoDoAno({ ano, anos, setAno, periodo, intervalo, escolher, definirIntervalo }: Props) {
  // O ano da tela acompanha o ano do FIM do período (o mesmo que `FiltrosComerciais` faz): é
  // dele o gráfico, a meta do ano e as grades — senão a tela mostraria um período de um ano
  // ao lado das grades de outro.
  const anoDoFim = intervalo ? Number(intervalo.ate.slice(0, 4)) : null;
  useEffect(() => {
    if (anoDoFim !== null && anoDoFim !== ano && anos.includes(anoDoFim)) setAno(anoDoFim);
    // Só quando o período muda — trocar o ano à mão, depois, continua valendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anoDoFim]);

  return (
    <>
      <Select value={periodo} onValueChange={(v) => escolher(v, intervalo ?? { de: `${ano}-01-01`, ate: `${ano}-12-31` })}>
        <SelectTrigger className="w-40" aria-label="Período"><SelectValue /></SelectTrigger>
        <SelectContent>
          {OPCOES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {periodo === PERSONALIZADO && intervalo && (
        <PeriodoPersonalizado de={intervalo.de} ate={intervalo.ate} onChange={definirIntervalo} />
      )}
    </>
  );
}

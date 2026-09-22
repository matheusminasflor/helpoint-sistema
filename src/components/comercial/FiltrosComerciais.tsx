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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Filial } from '@/types/comercial';

interface FiltrosComerciaisProps {
  ano: number;
  anos: number[];
  onAnoChange: (ano: number) => void;
  filial: Filial | null;
  onFilialChange: (filial: Filial | null) => void;
}

export function FiltrosComerciais({ ano, anos, onAnoChange, filial, onFilialChange }: FiltrosComerciaisProps) {
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
    </>
  );
}

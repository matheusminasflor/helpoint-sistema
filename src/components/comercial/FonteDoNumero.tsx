// De onde vem o número da tela (dono, 2026-10-14: a vendedora não tinha como saber qual número vale). "Lançado" é o
// que a vendedora registra em Lançamentos; "Faturado" é a nota fiscal importada do Forteplus. Vai no `status` do
// PageHeader, acima do título.
import { Badge } from '@/components/ui/badge';

export type Fonte = 'lancado' | 'faturado' | 'os-dois';

const TEXTO: Record<Fonte, { rotulo: string; dica: string }> = {
  lancado: { rotulo: 'Lançado', dica: 'Números do que as vendedoras registram em Lançamentos.' },
  faturado: { rotulo: 'Faturado (Forteplus)', dica: 'Números das notas fiscais importadas do Forteplus.' },
  'os-dois': { rotulo: 'Lançado × Faturado', dica: 'Compara o que foi lançado com a nota fiscal importada do Forteplus.' },
};

export function FonteDoNumero({ fonte }: { fonte: Fonte }) {
  return (
    <Badge variant="outline" className="border-primary/40 text-primary font-medium" title={TEXTO[fonte].dica}>
      {TEXTO[fonte].rotulo}
    </Badge>
  );
}

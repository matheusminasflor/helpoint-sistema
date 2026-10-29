// O botão "Simplificado | Analítico" da regra da casa — ver
// `src/lib/visao-relatorio.ts` para o porquê e para onde a escolha é
// guardada. Um componente só, para que a décima tela a ganhar as duas
// visões não invente a décima aparência do mesmo botão — e, desde
// 2026-10-29, com as mesmas abas do Novo Visual (`AbasSegmentadas`).
// O gancho que guarda a escolha mora em `@/hooks/useVisaoRelatorio` — este
// arquivo exporta SÓ componente, para não perder o Fast Refresh.
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';
import type { VisaoRelatorio } from '@/lib/visao-relatorio';

const OPCOES: { valor: VisaoRelatorio; rotulo: string }[] = [
  { valor: 'simplificado', rotulo: 'Simplificado' },
  { valor: 'analitico', rotulo: 'Analítico' },
];

export function SeletorVisao({ visao, onChange }: { visao: VisaoRelatorio; onChange: (v: VisaoRelatorio) => void }) {
  return (
    // No celular o relatório é a versão resumida (2026-10-28): o seletor some (`data-so-computador`).
    <div data-so-computador>
      <AbasSegmentadas rotulo="Visão do relatório" valor={visao} onValor={onChange} opcoes={OPCOES} />
    </div>
  );
}

// O farol da atividade com TEXTO e cor (nunca só cor).
import { ROTULO_DO_FAROL, type Farol } from '@/lib/projetos';

const COR: Record<Farol, string> = {
  nao_iniciado: 'bg-muted text-muted-foreground',
  em_andamento: 'badge-warning',
  atrasado: 'badge-danger',
  finalizado: 'badge-success',
};

export function SeloDoFarol({ farol }: { farol: Farol }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${COR[farol]}`}>
      {ROTULO_DO_FAROL[farol]}
    </span>
  );
}

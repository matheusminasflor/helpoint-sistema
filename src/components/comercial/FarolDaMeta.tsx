// A cor do farol do Painel do Gestor (manual de Gestão Comercial §6.2).
//
// A REGRA NÃO MORA AQUI. Verde ≥ meta, amarelo ≥ 70%, vermelho abaixo, e "sem meta" quando a
// meta é zero — isso está em `com_cor_do_farol`, no banco, e chega pronto em cada linha do
// painel. Este componente só pinta. Existiam duas réguas locais parecidas
// (`FichaCliente.tsx` e `ObjetivosEChamados.tsx`), cada uma com a sua; esta não é a terceira
// porque não decide nada.
import { cn } from '@/lib/utils';
import type { CorFarol } from '@/hooks/useComercialLancamentos';

const APARENCIA: Record<CorFarol, { classe: string; rotulo: string; dica: string }> = {
  verde: { classe: 'badge-success', rotulo: 'Na meta', dica: 'Realizado igual ou acima da meta.' },
  amarelo: { classe: 'badge-warning', rotulo: 'Atenção', dica: 'Abaixo da meta, mas em pelo menos 70% dela — exige acompanhamento.' },
  vermelho: { classe: 'badge-danger', rotulo: 'Abaixo', dica: 'Abaixo de 70% da meta — ação corretiva prioritária.' },
  // Meta zero não tem cor (§6.2): pintar de verde quem não tem meta ensina a ignorar o farol.
  sem_meta: { classe: 'bg-muted text-muted-foreground', rotulo: 'Sem meta', dica: 'Não há meta cadastrada — sem referência, o farol não tem sentido.' },
};

export function FarolDaMeta({ cor, className }: { cor: CorFarol; className?: string }) {
  const a = APARENCIA[cor] ?? APARENCIA.sem_meta;
  return (
    <span
      title={a.dica}
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap', a.classe, className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {a.rotulo}
    </span>
  );
}

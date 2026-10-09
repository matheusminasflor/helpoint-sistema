// O farol com TEXTO, cor e a bolinha do desenho aprovado (nunca só cor). Serve à atividade (`farol`) e ao
// conjunto — fase ou projeto — com o texto pronto (`seloDoConjunto`: "2 atrasadas", "Não iniciada"…).
import { ROTULO_DO_FAROL, iniciais, type Farol } from '@/lib/projetos';

const COR: Record<Farol, string> = {
  nao_iniciado: 'bg-muted text-muted-foreground',
  em_andamento: 'badge-warning',
  atrasado: 'badge-danger',
  finalizado: 'badge-success',
};

export function SeloDoFarol({ farol, texto }: { farol: Farol; texto?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${COR[farol]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {texto ?? ROTULO_DO_FAROL[farol]}
    </span>
  );
}

/** As iniciais da equipe, sobrepostas (o "JD GA MO +3" do desenho). */
export function AvataresDaEquipe({ nomes, max = 5 }: { nomes: string[]; max?: number }) {
  const mostrados = nomes.slice(0, max);
  const resto = nomes.length - mostrados.length;
  return (
    <span className="flex" aria-label={`Equipe: ${nomes.join(', ')}`}>
      {mostrados.map((n, i) => (
        <span key={`${n}-${i}`} title={n}
          className="-ml-1.5 first:ml-0 grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-card bg-primary/10 text-[11px] font-extrabold text-primary">
          {iniciais(n)}
        </span>
      ))}
      {resto > 0 && (
        <span className="-ml-1.5 grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-card bg-muted text-[11px] font-extrabold text-muted-foreground">
          +{resto}
        </span>
      )}
    </span>
  );
}

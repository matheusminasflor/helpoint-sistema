// O chip do setor (rodada 3, docs/proposta-rodada-3.md): a cor diz DE QUEM é, nunca como está — e vem sempre com o nome
// (ou a sigla, no quadrado do cartão). Setor desconhecido aparece sem cor, com o texto que veio.
import { cn } from '@/lib/utils';
import { SIGLA_DO_SETOR, corDoSetor, rotuloDoSetor, setorDoModulo } from '@/lib/setores';

interface ChipDoSetorProps {
  /** O setor ou o módulo do chamado (`tickets` = TI). */
  setor: string | null | undefined;
  /** "nome" (o padrão), "sigla" (o quadrado do cartão de setor) */
  forma?: 'nome' | 'sigla';
  className?: string;
}

export function ChipDoSetor({ setor, forma = 'nome', className }: ChipDoSetorProps) {
  const s = setorDoModulo(setor);
  const texto = s ? (forma === 'sigla' ? SIGLA_DO_SETOR[s] : rotuloDoSetor(s)) : rotuloDoSetor(setor);
  if (forma === 'sigla') {
    return (
      <span aria-hidden="true" className={cn('inline-grid place-items-center w-9 h-9 rounded-[9px] text-[12px] font-extrabold shrink-0',
        s ? corDoSetor(s) : 'bg-muted text-muted-foreground', className)}>
        {texto}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap',
      s ? corDoSetor(s) : 'bg-muted text-muted-foreground', className)}>
      {texto}
    </span>
  );
}

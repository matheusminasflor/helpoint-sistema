// Quem tem login no Helpoint e não está na lista do RH (rodada 2, R4): a lista começou com as pessoas que tinham login
// (2026-10-25); quem entrar depois aparece aqui, para o RH incluir com um toque — e nada fica de fora.
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIncluirLoginNaLista, useLoginsForaDaLista } from '@/hooks/useRH';

export function LoginsForaDaLista({ podeIncluir }: { podeIncluir: boolean }) {
  const { data: fora = [] } = useLoginsForaDaLista();
  const incluir = useIncluirLoginNaLista();
  if (fora.length === 0) return null;
  return (
    <section aria-label="Têm login e não estão na lista do RH" className="rounded-lg border border-border bg-card p-3 space-y-2">
      <h2 className="text-[14px] font-semibold">Têm login e não estão na lista do RH ({fora.length})</h2>
      <ul className="divide-y divide-border">
        {fora.map((p) => (
          <li key={p.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="flex-1 min-w-[12rem]">
              <span className="block text-[14px] font-medium">{p.nome}</span>
              <span className="block text-[13px] text-muted-foreground">{p.email}{p.setor ? ` · ${p.setor}` : ''}</span>
            </span>
            {podeIncluir && (
              <Button size="sm" variant="outline" disabled={incluir.isPending} onClick={() => incluir.mutate(p.user_id)}>
                <UserPlus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Incluir
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

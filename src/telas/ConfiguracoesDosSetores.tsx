// Configurações › Setores (LEVA P, 2026-09-29). Uma grade, como a de "Nova solicitação": a pessoa
// escolhe o setor e entra na configuração dele. Eram nove itens soltos no menu.
//
// O cartão fica ATIVO só no setor que a pessoa configura (chave "Configurações do setor" no perfil
// de acesso, ou dono/admin); nos outros ele aparece apagado, com o motivo — ver que o setor existe e
// saber por que não entra é melhor que o setor sumir sem explicação.
import { Link } from 'react-router-dom';
import { Lock, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useSetoresQueConfiguro } from '@/hooks/useSetoresQueConfiguro';
import { cn } from '@/lib/utils';

export default function ConfiguracoesDosSetores() {
  const { setores, isLoading } = useSetoresQueConfiguro();
  const tenantPath = useTenantPath();

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Settings2}
        title="Configurações dos setores"
        description="Escolha o setor. Fica ativo o que você configura; quem define isso é o perfil de acesso de cada pessoa."
      />
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {setores.map((s) => {
            const Icone = s.icone;
            const corpo = (
              <>
                {!s.abre && <Lock className="absolute top-3 right-3 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />}
                <div className={cn('w-12 h-12 flex items-center justify-center rounded-xl',
                  s.abre ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  <Icone className="w-6 h-6" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <span className={cn('text-sm font-semibold', s.abre ? 'text-foreground group-hover:text-primary' : 'text-muted-foreground')}>
                  {s.rotulo}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.abre ? s.descricao : 'Sem acesso às configurações deste setor'}
                </span>
              </>
            );
            const classe = 'group relative h-full p-5 rounded-xl border flex flex-col items-center gap-2 text-center';
            return (
              <li key={s.rota}>
                {s.abre ? (
                  <Link to={tenantPath(s.rota)} className={cn(classe, 'bg-card border-border hover:border-primary/50 transition-colors')}>
                    {corpo}
                  </Link>
                ) : (
                  <div aria-disabled="true" className={cn(classe, 'bg-background border-border opacity-60 cursor-not-allowed')}>
                    {corpo}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

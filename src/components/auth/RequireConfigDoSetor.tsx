import { Navigate, useLocation } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useSetoresQueConfiguro } from '@/hooks/useSetoresQueConfiguro';
import { ROTA_DOS_SETORES } from '@/config/setores-de-configuracao';

/**
 * A tranca de cada configuração de setor (LEVA P, 2026-09-29). O cartão apagado em
 * Configurações › Setores não é fronteira — a URL continua digitável. Quem não abre o setor volta
 * para a grade, onde o cadeado diz por quê.
 *
 * É a tranca da TELA. Quem garante a escrita é o banco (`pode_configurar_setor` na aba Chamados;
 * as abas próprias de cada setor seguem as policies delas).
 */
export function RequireConfigDoSetor({ children }: { children: React.ReactNode }) {
  const { setores, isLoading, isError } = useSetoresQueConfiguro();
  const { pathname } = useLocation();
  const tenantPath = useTenantPath();

  if (isLoading) return null;
  // Falha de leitura não é "não pode" (mesma lição de `RequireComercial`).
  if (isError) {
    return (
      <div className="p-6">
        <p className="text-[13px] rounded-lg border border-status-danger/40 text-status-danger px-3 py-2">
          <strong>Não consegui confirmar o seu acesso a esta configuração.</strong> Isto não quer dizer que você não
          tenha — recarregue a página.
        </p>
      </div>
    );
  }
  const setor = setores.find((s) => pathname.endsWith(s.rota));
  if (!setor?.abre) return <Navigate to={tenantPath(ROTA_DOS_SETORES)} replace />;
  return <>{children}</>;
}

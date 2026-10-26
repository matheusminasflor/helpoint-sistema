// "Exportar para Excel" nas telas de análise do Comercial e da Diretoria (rodada 2, R6; decisão do dono de 2026-10-26:
// só quem tem "Exportar" no perfil — ligado para o Gestor do Comercial e a Diretoria, desligado para a vendedora).
// Exporta as tabelas que a tela está mostrando, sem recalcular nada (`exportarTabelasDaTela`).
import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { exportarTabelasDaTela } from '@/lib/tabela';
import { todayISO } from '@/lib/dates';

export function ExportarATela({ arquivo, setor = 'comercial' }: { arquivo: string; setor?: 'comercial' | 'diretoria' }) {
  const { can } = useDepartmentPermissions(setor);
  const [exportando, setExportando] = useState(false);
  if (!can(setor === 'comercial' ? 'reports' : 'exportar', setor === 'comercial' ? 'export' : 'view')) return null;
  return (
    <Button variant="outline" size="sm" className="print:hidden" disabled={exportando} onClick={async () => {
      setExportando(true);
      try {
        await exportarTabelasDaTela(`${arquivo}-${todayISO()}`, document.querySelector('main') ?? document);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Não exportou.');
      } finally {
        setExportando(false);
      }
    }}>
      <FileDown className="w-4 h-4 mr-1.5" aria-hidden="true" /> {exportando ? 'Exportando…' : 'Exportar para Excel'}
    </Button>
  );
}

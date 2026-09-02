import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistantName } from '@/hooks/useAssistantName';
import { useTenantPath } from '@/hooks/useTenantPath';

interface AIUnavailableNoticeProps {
  className?: string;
  compact?: boolean;
}

/** Estado amigável exibido quando o tenant ainda não configurou um provedor de IA. */
export function AIUnavailableNotice({ className = '', compact = false }: AIUnavailableNoticeProps) {
  const assistantName = useAssistantName();
  const tenantPath = useTenantPath();

  return (
    <div className={`rounded-lg border border-border bg-muted/40 p-4 text-sm ${className}`}>
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="space-y-2">
          <p className="text-foreground">
            Configure um provedor de IA para ativar o(a) {assistantName}.
          </p>
          {!compact && (
            <Button asChild size="sm" variant="outline">
              <Link to={tenantPath('/configuracoes/lyra')}>Configurar provedor de IA</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

import { Shield, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ACCESS_TYPE_LABEL, useEmployeeAccessGrants, useToggleRevokeGrant } from '@/hooks/useEmployeeAccessGrants';

interface Props {
  ticketId: string;
  canEdit: boolean;
}

export function OffboardingAccessPanel({ ticketId, canEdit }: Props) {
  const { data: grants = [], isLoading } = useEmployeeAccessGrants({ revokeTicketId: ticketId });
  const toggle = useToggleRevokeGrant();

  if (isLoading || grants.length === 0) return null;

  const revoked = grants.filter(g => g.revoked_at).length;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Shield className="w-3.5 h-3.5" />
        Acessos a revogar
        <Badge variant="secondary" className="ml-auto text-[10px]">{revoked} / {grants.length}</Badge>
      </h3>
      <div className="space-y-2">
        {grants.map(g => {
          const isRevoked = !!g.revoked_at;
          return (
            <label
              key={g.id}
              className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={isRevoked}
                disabled={!canEdit || toggle.isPending}
                onCheckedChange={(v) => toggle.mutate({ id: g.id, revoke: !!v })}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{ACCESS_TYPE_LABEL[g.access_type]}</Badge>
                  <span className={`text-sm font-medium ${isRevoked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {g.name}
                  </span>
                  {isRevoked && <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />}
                </div>
                {g.details?.note && (
                  <p className="text-xs text-muted-foreground mt-0.5">{g.details.note}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

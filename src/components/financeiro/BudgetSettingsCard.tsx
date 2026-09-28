import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Gauge } from 'lucide-react';
import {
  useBudgetSettings, useSaveBudgetSettings, useDepartmentBudgets, useSaveDepartmentBudget,
} from '@/hooks/usePurchases';
import { SETORES } from '@/lib/setores';
import { formatBRLAmount } from '@/types/purchases';
import { parseAmount } from '@/lib/finance-import';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';

export function BudgetSettingsCard() {
  // `can('budgets','manage')` é EXATAMENTE a expressão da RLS: `is_manager_or_higher
  // (...) or tem_permissao(..., 'financeiro', 'budgets', 'manage')`. `can` devolve
  // true para owner/admin/manager antes de olhar o perfil e, para quem não é gestor,
  // resolve o escopo — os dois lados são a mesma conta.
  //
  // Até a leva I isto era `isAdmin` puro, e o escopo era adorno: a RLS não o
  // conhecia, então marcar a permissão não mudava nada. E até a leva N a permissão
  // era `financeiro:purchases:manage_budget` — mudou de nome quando Compras saiu do
  // Financeiro, porque **o teto ficou aqui**: o dono decidiu que quem paga define o
  // limite e quem gasta obedece.
  const { can } = useDepartmentPermissions('financeiro');
  const podeMexer = can('budgets', 'manage');
  const { data: settings } = useBudgetSettings();
  const saveSettings = useSaveBudgetSettings();
  const { data: budgets = [] } = useDepartmentBudgets();
  const saveBudget = useSaveDepartmentBudget();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const enabled = settings?.mode === 'per_department';

  const limitOf = (dept: string) =>
    budgets.find(b => b.department === dept)?.monthly_limit ?? 0;

  const handleSave = (dept: string) => {
    const raw = drafts[dept];
    if (raw === undefined) return;
    const value = parseAmount(raw) ?? NaN;
    if (!Number.isFinite(value) || value < 0) return;
    saveBudget.mutate({ department: dept, monthly_limit: value });
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <Gauge className="w-4 h-4 mt-0.5 text-primary" aria-hidden="true" />
          <div>
            <h3 className="text-sm font-semibold">Teto de gasto por setor</h3>
            <p className="text-xs text-muted-foreground">
              Quando ativo, aprovar uma compra que ultrapassa o limite mensal do setor exige escrever o
              motivo — e o motivo fica guardado na compra. A regra vive no banco: vale também para quem
              não passa por esta tela.
            </p>
            {!podeMexer && (
              <p className="text-xs text-muted-foreground mt-1">
                Você vê os limites, mas não pode alterá-los: definir teto é de gestor para cima, ou de quem
                tem a permissão "Definir teto de gasto por setor".
              </p>
            )}
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={!podeMexer}
          onCheckedChange={(v) => saveSettings.mutate(v ? 'per_department' : 'none')}
          aria-label="Ativar teto de gasto por setor"
        />
      </div>

      {enabled && (
        <div className="space-y-2 border-t border-border pt-4">
          {/* Os NOVE setores, não os sete módulos com perfil de acesso: o
              convite põe gente em Produção e Expedição, e até a leva I esses
              dois não apareciam aqui — teto que nunca podia ser definido para
              quem existia. */}
          {SETORES.map(({ value: dept, label }) => (
            <div key={dept} className="grid gap-2 sm:grid-cols-[1fr_160px_auto] items-center">
              <span className="text-sm">{label}</span>
              <Input
                value={drafts[dept] ?? (limitOf(dept) ? limitOf(dept).toFixed(2).replace('.', ',') : '')}
                onChange={(e) => setDrafts(prev => ({ ...prev, [dept]: e.target.value }))}
                placeholder="0,00"
                inputMode="decimal"
                className="font-mono"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => handleSave(dept)} disabled={saveBudget.isPending || !podeMexer}>
                  Salvar
                </Button>
                <span className="text-xs text-muted-foreground font-mono">{formatBRLAmount(limitOf(dept))}/mês</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Gauge } from 'lucide-react';
import {
  useBudgetSettings, useSaveBudgetSettings, useDepartmentBudgets, useSaveDepartmentBudget,
} from '@/hooks/usePurchases';
import { DEPARTMENT_SCHEMAS, DEPARTMENT_LIST } from '@/config/access-profile-schemas';
import { formatBRLAmount } from '@/types/purchases';

export function BudgetSettingsCard() {
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
    const value = Number(raw.replace(/\./g, '').replace(',', '.'));
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
              Quando ativo, o aprovador é avisado se a compra ultrapassar o limite mensal do setor. O aviso não bloqueia a aprovação.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => saveSettings.mutate(v ? 'per_department' : 'none')}
          aria-label="Ativar teto de gasto por setor"
        />
      </div>

      {enabled && (
        <div className="space-y-2 border-t border-border pt-4">
          {DEPARTMENT_LIST.map(dept => (
            <div key={dept} className="grid gap-2 sm:grid-cols-[1fr_160px_auto] items-center">
              <span className="text-sm">{DEPARTMENT_SCHEMAS[dept].label}</span>
              <Input
                value={drafts[dept] ?? String(limitOf(dept) || '')}
                onChange={(e) => setDrafts(prev => ({ ...prev, [dept]: e.target.value }))}
                placeholder="0,00"
                inputMode="decimal"
                className="font-mono"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => handleSave(dept)} disabled={saveBudget.isPending}>
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

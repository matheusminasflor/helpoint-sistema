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
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';

export function BudgetSettingsCard() {
  // Quem define o teto é quem altera a aba "Teto de gasto" de Compras no perfil de acesso (LEVA P,
  // parte 7) — a mesma pergunta das policies de `fin_budget_settings` e `fin_department_budgets`.
  // Antes era a permissão `budgets.manage` do Financeiro; nenhum perfil a tinha marcada quando a
  // aba a substituiu (medido em 2026-09-29).
  const podeMexer = useConfiguracaoDosSetores().alteraAba('compras', 'teto');
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
                Você vê os limites, mas não pode alterá-los: é preciso "Configurações › Teto de gasto: Alterar"
                no perfil de acesso de Compras.
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

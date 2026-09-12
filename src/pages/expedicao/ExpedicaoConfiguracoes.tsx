import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { usePickingRule, useSavePickingRule, type PickingRule } from '@/hooks/useExpedicao';

const REGRAS: { value: PickingRule; label: string; hint: string }[] = [
  { value: 'fefo', label: 'Vence primeiro, sai primeiro (FEFO)', hint: 'O sistema separa o lote de validade mais próxima. É o que evita perda em quem trabalha com validade.' },
  { value: 'fifo', label: 'Entrou primeiro, sai primeiro (FIFO)', hint: 'O sistema separa o lote mais antigo pela data de entrada. Para quem não tem validade, ou gira por ordem de chegada.' },
  { value: 'manual', label: 'Quem separa escolhe o lote', hint: 'O sistema não escolhe: a pessoa bipa o código do lote que está tirando da prateleira.' },
];

/** Configurações da Expedição: hoje, uma pergunta só — qual lote sai primeiro. */
export default function ExpedicaoConfiguracoes() {
  // Dono ou administrador: é quem a policy de `tenants` deixa gravar. Com
  // gerente, o rádio abria e o Salvar dava erro (auditoria de 2026-09-12).
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: rule, isLoading } = usePickingRule();
  const save = useSavePickingRule();
  const [draft, setDraft] = useState<PickingRule | null>(null);
  const value = draft ?? rule ?? 'fefo';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={PackageCheck}
        title="Configurações da Expedição"
        description="Como o sistema escolhe o lote na hora de separar."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qual lote sai primeiro</CardTitle>
          <CardDescription>Vale para todo produto que controla lote. Quem separa pode sempre bipar o código do lote e mandar nessa escolha.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <RadioGroup value={value} onValueChange={(v) => setDraft(v as PickingRule)} disabled={!isOwnerOrAdmin}>
                {REGRAS.map((r) => (
                  <div key={r.value} className="flex items-start gap-3 rounded-lg border p-3">
                    <RadioGroupItem value={r.value} id={`picking-${r.value}`} className="mt-1" />
                    <div className="space-y-0.5">
                      <Label htmlFor={`picking-${r.value}`} className="font-medium">{r.label}</Label>
                      <p className="text-xs text-muted-foreground">{r.hint}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>
              {isOwnerOrAdmin ? (
                <Button size="sm" disabled={!draft || draft === rule || save.isPending} onClick={() => save.mutate(value, { onSuccess: () => setDraft(null) })}>
                  Salvar
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Só dono ou administrador muda esta regra.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

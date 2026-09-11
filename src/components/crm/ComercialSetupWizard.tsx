import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCRMSetup, type SetupPriceTable, type SetupSegment } from '@/hooks/useCRMConfig';

const NONE = '__none__';

interface SegmentRow { key: string; name: string; requires_document: boolean; price_table: string }
interface TableRow { key: string; name: string; percent: string }

const newSegment = (): SegmentRow => ({ key: crypto.randomUUID(), name: '', requires_document: false, price_table: NONE });
const newTable = (): TableRow => ({ key: crypto.randomUUID(), name: '', percent: '0' });

/**
 * Assistente de primeira abertura do Comercial (CRM-1b, decisão 3 do dono):
 * aparece quando a empresa ainda não tem funil. Três perguntas — segmentos,
 * quem exige CNPJ, tabelas de preço — e o banco monta tudo de uma vez
 * (`crm_setup`): um funil por segmento com as etapas do modelo. "Pular" cria
 * só o funil de exemplo. Tudo pode ser mudado depois nas Configurações.
 */
export function ComercialSetupWizard({ canConfigure }: { canConfigure: boolean }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [segments, setSegments] = useState<SegmentRow[]>([newSegment()]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const setup = useCRMSetup();

  if (!canConfigure) {
    return (
      <Card className="max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle className="text-base">O Comercial ainda não foi configurado</CardTitle>
          <CardDescription>Peça a um gerente, administrador ou ao dono da empresa para abrir o Funil e responder ao assistente. Leva um minuto.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const validSegments = segments.filter((s) => s.name.trim().length > 0);
  const validTables = tables.filter((t) => t.name.trim().length > 0 && Number.isFinite(Number(t.percent)));
  const duplicateSegment = new Set(validSegments.map((s) => s.name.trim().toLowerCase())).size !== validSegments.length;
  const duplicateTable = new Set(validTables.map((t) => t.name.trim().toLowerCase())).size !== validTables.length;

  const updateSegment = (key: string, patch: Partial<SegmentRow>) => setSegments((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const updateTable = (key: string, patch: Partial<TableRow>) => setTables((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const finish = (skip: boolean) => {
    const payloadSegments: SetupSegment[] = skip ? [] : validSegments.map((s) => ({
      name: s.name.trim(),
      requires_document: s.requires_document,
      price_table: s.price_table === NONE ? undefined : s.price_table,
    }));
    const payloadTables: SetupPriceTable[] = skip ? [] : validTables.map((t, i) => ({ name: t.name.trim(), percent: Number(t.percent), is_default: i === 0 }));
    setup.mutate({ segments: payloadSegments, priceTables: payloadTables });
  };

  return (
    <Card className="max-w-3xl mx-auto mt-6">
      <CardHeader>
        <CardTitle className="text-lg">Vamos montar o seu Comercial</CardTitle>
        <CardDescription>
          Três perguntas. Tudo o que responder aqui pode ser mudado depois em Configurações do Comercial.
        </CardDescription>
        <div className="flex gap-2 pt-2 text-xs text-muted-foreground">
          {['1. Segmentos', '2. Tabelas de preço', '3. Conferir'].map((label, i) => (
            <span key={label} className={`rounded-full border px-2.5 py-1 ${step === i ? 'border-primary text-primary font-medium' : ''}`}>{label}</span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 0 && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Quais segmentos de cliente você atende?</p>
              <p className="text-xs text-muted-foreground">Ex.: consumidor final, salão, distribuidor. Cada segmento ganha o próprio funil. Marque quem precisa de CPF/CNPJ para avançar no funil.</p>
            </div>
            {segments.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <Input value={s.name} onChange={(e) => updateSegment(s.key, { name: e.target.value })} maxLength={60} placeholder="Nome do segmento" className="max-w-xs" />
                <div className="flex items-center gap-2">
                  <Switch checked={s.requires_document} onCheckedChange={(v) => updateSegment(s.key, { requires_document: v })} id={`doc-${s.key}`} />
                  <Label htmlFor={`doc-${s.key}`} className="font-normal">Exige CPF/CNPJ</Label>
                </div>
                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-muted-foreground" aria-label="Tirar" onClick={() => setSegments((prev) => prev.filter((x) => x.key !== s.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSegments((prev) => [...prev, newSegment()])}><Plus className="h-3.5 w-3.5 mr-1" /> Segmento</Button>
            {duplicateSegment && <p className="text-xs text-destructive">Dois segmentos com o mesmo nome.</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Você tem tabelas de preço diferentes por segmento?</p>
              <p className="text-xs text-muted-foreground">Cada tabela é uma porcentagem sobre o preço base do produto (0 = o próprio preço base; −15 = desconto de 15 %). A primeira vira a padrão. Sem tabela, todo pedido usa o preço base.</p>
            </div>
            {tables.map((t) => (
              <div key={t.key} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <Input value={t.name} onChange={(e) => updateTable(t.key, { name: e.target.value })} maxLength={60} placeholder="Nome da tabela" className="max-w-xs" />
                <div className="flex items-center gap-2">
                  <Input type="number" step="0.01" value={t.percent} onChange={(e) => updateTable(t.key, { percent: e.target.value })} className="w-28" />
                  <span className="text-xs text-muted-foreground">% sobre a base</span>
                </div>
                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-muted-foreground" aria-label="Tirar" onClick={() => setTables((prev) => prev.filter((x) => x.key !== t.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setTables((prev) => [...prev, newTable()])}><Plus className="h-3.5 w-3.5 mr-1" /> Tabela</Button>
            {duplicateTable && <p className="text-xs text-destructive">Duas tabelas com o mesmo nome.</p>}

            {validTables.length > 0 && validSegments.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-sm font-medium">Qual tabela cada segmento usa?</p>
                {validSegments.map((s) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="w-48 truncate text-sm">{s.name}</span>
                    <Select value={s.price_table} onValueChange={(v) => updateSegment(s.key, { price_table: v })}>
                      <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Tabela padrão</SelectItem>
                        {validTables.map((t) => <SelectItem key={t.key} value={t.name.trim()}>{t.name.trim()}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3 text-sm">
            <p className="font-medium">O que vai ser criado</p>
            {validSegments.length === 0 ? (
              <p className="text-muted-foreground">Nenhum segmento: um funil de exemplo com as etapas Novo → Em contato → Orçamento enviado → Negociação → Ganho / Perdido.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                {validSegments.map((s) => (
                  <li key={s.key}>
                    Segmento <strong>{s.name.trim()}</strong>: funil "{s.name.trim()}" com as 6 etapas do modelo
                    {s.requires_document ? ', pedindo CPF/CNPJ para sair da primeira etapa' : ''}
                    {s.price_table !== NONE ? `, tabela "${s.price_table}"` : validTables.length > 0 ? ', tabela padrão' : ''}
                  </li>
                ))}
              </ul>
            )}
            {validTables.length > 0 && (
              <p className="text-muted-foreground">Tabelas: {validTables.map((t, i) => `${t.name.trim()} (${Number(t.percent)}%${i === 0 ? ', padrão' : ''})`).join(', ')}.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={() => finish(true)} disabled={setup.isPending}>Pular — só o funil de exemplo</Button>
          <div className="flex gap-2">
            {step > 0 && <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 0 | 1 | 2)} disabled={setup.isPending}>Voltar</Button>}
            {step < 2 ? (
              <Button onClick={() => setStep((s) => (s + 1) as 0 | 1 | 2)} disabled={(step === 0 && duplicateSegment) || (step === 1 && duplicateTable)}>Continuar</Button>
            ) : (
              <Button onClick={() => finish(false)} disabled={setup.isPending || duplicateSegment || duplicateTable}>Configurar</Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

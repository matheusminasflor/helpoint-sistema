import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useCRMPipelines, useCRMStages } from '@/hooks/useCRM';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useCRMImports, useCreateImport, useFinishImport, useImportRows, useUndoImport, type ImportBatchResult } from '@/hooks/useCRMImport';
import { normalizeHeader, readSheet } from '@/lib/finance-import';
import {
  IMPORT_BATCH_SIZE, IMPORT_MAX_ROWS, buildTargets, chunk, findFileDuplicates, previewCustom, rowsFromMatrix,
  stageNamesIn, suggestMapping, validateRows, type TargetId, type ValidatedRow,
} from '@/lib/crm-import';
import { formatBRL } from '@/lib/crm';

type Step = 'upload' | 'map' | 'stages' | 'validate' | 'import' | 'done';
const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Arquivo' },
  { id: 'map', label: 'Colunas' },
  { id: 'stages', label: 'Etapas' },
  { id: 'validate', label: 'Conferir' },
  { id: 'import', label: 'Importar' },
];

const NO_STAGE = '__none__';

/** Primeira linha com pelo menos duas células preenchidas: é o cabeçalho, salvo escolha da pessoa. */
function guessHeaderRow(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    if ((matrix[i] ?? []).filter((c) => String(c ?? '').trim()).length >= 2) return i;
  }
  return 0;
}

function StepBar({ current }: { current: Step }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s.id} className={`flex items-center gap-2 ${i === index ? 'font-semibold' : i < index ? 'text-muted-foreground' : 'text-muted-foreground/60'}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${i <= index ? 'bg-primary text-primary-foreground border-primary' : ''}`}>{i + 1}</span>
          {s.label}
          {i < STEPS.length - 1 && <span aria-hidden>›</span>}
        </li>
      ))}
    </ol>
  );
}

/**
 * Importação de planilha de contatos e negócios (E3, ADR-007): arquivo →
 * colunas → etapas → conferir → importar. O que é regra (contato repetido,
 * validação do valor personalizado, desfazer) fica no banco; aqui só se
 * prepara o lote e se mostra o que vai acontecer antes de acontecer.
 *
 * ponytail: sem edição de célula na grade de conferência — corrige-se na
 * planilha e sobe de novo. O teto é "quando alguém pedir para consertar uma
 * linha sem sair da tela".
 */
const EMPTY: never[] = [];

export default function ComercialImportar() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const inputRef = useRef<HTMLInputElement>(null);

  // Referências estáveis enquanto carrega: `= []` inline alimenta useMemo/useEffect
  // abaixo e vira laço infinito (lista nova a cada render → efeito → setState → render…).
  const { data: pipelines = EMPTY } = useCRMPipelines();
  const { data: allStages = EMPTY } = useCRMStages();
  const { data: technicians = [] } = useTechnicians();
  const { data: contactFields = EMPTY } = useCustomFields('contact');
  const { data: dealFields = EMPTY } = useCustomFields('deal');
  const { data: imports = [] } = useCRMImports();
  const createImport = useCreateImport();
  const importRows = useImportRows();
  const finishImport = useFinishImport();
  const undoImport = useUndoImport();

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [matrix, setMatrix] = useState<unknown[][]>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [reading, setReading] = useState(false);
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [mapping, setMapping] = useState<Record<number, TargetId>>({});
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [defaultStageId, setDefaultStageId] = useState<string | null>(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportBatchResult[]>([]);
  const [importId, setImportId] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const activePipeline = pipelineId ?? pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id;
  const stages = useMemo(() => allStages.filter((s) => s.pipeline_id === activePipeline), [allStages, activePipeline]);
  const targets = useMemo(() => buildTargets(contactFields, dealFields), [contactFields, dealFields]);
  const headers = useMemo(() => (matrix[headerRow] ?? []).map((h) => String(h ?? '').trim()), [matrix, headerRow]);
  const rawRows = useMemo(() => rowsFromMatrix(matrix, headerRow, mapping), [matrix, headerRow, mapping]);
  const stageNames = useMemo(() => stageNamesIn(rawRows), [rawRows]);
  const hasStageColumn = Object.values(mapping).includes('deal.stage');

  useEffect(() => {
    if (headers.length) setMapping(suggestMapping(headers, targets));
  }, [headers, targets]);

  // Etapas da planilha casadas pelo nome com as do funil; a padrão é a primeira aberta.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const name of stageNames) {
      const match = stages.find((s) => normalizeHeader(s.name) === normalizeHeader(name));
      if (match) next[normalizeHeader(name)] = match.id;
    }
    setStageMap(next);
    setDefaultStageId(stages.find((s) => s.kind === 'open')?.id ?? null);
  }, [stageNames, stages]);

  const validated = useMemo<ValidatedRow[]>(
    () => (step === 'validate' || step === 'import' || step === 'done')
      ? validateRows(rawRows, { stages, stageMap, owners: technicians, contactFields, dealFields, defaultStageId })
      : [],
    [step, rawRows, stages, stageMap, technicians, contactFields, dealFields, defaultStageId],
  );
  const duplicates = useMemo(() => findFileDuplicates(validated), [validated]);
  const validRows = validated.filter((r) => r.errors.length === 0);
  const errorRows = validated.length - validRows.length;
  const hasName = Object.values(mapping).some((t) => t === 'contact.name' || t === 'contact.company');
  const tooMany = rawRows.length > IMPORT_MAX_ROWS;

  const handleFile = async (selected: File) => {
    setReading(true);
    try {
      const data = await readSheet(selected);
      setFile(selected);
      setMatrix(data);
      setHeaderRow(guessHeaderRow(data));
    } finally {
      setReading(false);
    }
  };

  const reset = () => {
    setStep('upload'); setFile(null); setMatrix([]); setMapping({}); setResults([]); setImportId(null);
    setProgress({ done: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = '';
  };

  const runImport = async () => {
    if (!file || !activePipeline) return;
    setStep('import');
    cancelRef.current = false;
    const batches = chunk(validRows.map((r) => r.row), IMPORT_BATCH_SIZE);
    setProgress({ done: 0, total: validRows.length });
    setResults([]);
    let id: string;
    try {
      id = await createImport.mutateAsync({ file_name: file.name, pipeline_id: activePipeline, rows_total: validRows.length });
    } catch {
      setStep('validate');
      return;
    }
    setImportId(id);
    const collected: ImportBatchResult[] = [];
    let done = 0;
    for (const batch of batches) {
      if (cancelRef.current) break;
      try {
        const result = await importRows.mutateAsync({ importId: id, rows: batch });
        collected.push(result);
      } catch (e) {
        collected.push({ contacts_created: 0, contacts_reused: 0, deals_created: 0, errors: batch.map((r) => ({ line: r.line, name: r.name, error: e instanceof Error ? e.message : String(e) })) });
      }
      done += batch.length;
      setProgress({ done, total: validRows.length });
      setResults([...collected]);
    }
    await finishImport.mutateAsync({ importId: id, rows_total: done });
    setStep('done');
  };

  const totals = results.reduce(
    (acc, r) => ({ created: acc.created + r.contacts_created, reused: acc.reused + r.contacts_reused, deals: acc.deals + r.deals_created, errors: acc.errors.concat(r.errors) }),
    { created: 0, reused: 0, deals: 0, errors: [] as ImportBatchResult['errors'] },
  );
  const latestImport = imports.find((i) => i.status !== 'undone');
  const groups = [...new Set(targets.map((t) => t.group))];

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Importar planilha"
        description="Contatos e negócios de uma planilha (Excel ou CSV) — por exemplo, a exportação do seu CRM antigo."
        icon={FileSpreadsheet}
        actions={
          <Button variant="outline" onClick={() => navigate(tenantPath('/comercial/contatos'))}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Contatos
          </Button>
        }
      >
        <StepBar current={step === 'done' ? 'import' : step} />
      </PageHeader>

      <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
        {step === 'upload' && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1. Arquivo e funil</CardTitle>
                <CardDescription>A primeira linha com cabeçalhos vira o nome das colunas. Até {IMPORT_MAX_ROWS.toLocaleString('pt-BR')} linhas por vez.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Planilha</Label>
                    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                    <Button variant="outline" className="w-full justify-start" onClick={() => inputRef.current?.click()} disabled={reading}>
                      <Upload className="w-4 h-4 mr-2" /> {reading ? 'Lendo...' : file ? file.name : 'Escolher arquivo'}
                    </Button>
                    {file && <p className="text-xs text-muted-foreground">{matrix.length} linhas lidas.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Funil de destino</Label>
                    <Select value={activePipeline ?? ''} onValueChange={setPipelineId}>
                      <SelectTrigger><SelectValue placeholder="Funil" /></SelectTrigger>
                      <SelectContent>
                        {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_default ? ' (padrão)' : ''}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {matrix.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Linha do cabeçalho</Label>
                    <Select value={String(headerRow)} onValueChange={(v) => setHeaderRow(Number(v))}>
                      <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {matrix.slice(0, 10).map((row, i) => (
                          <SelectItem key={i} value={String(i)}>Linha {i + 1}: {(row ?? []).slice(0, 5).map((c) => String(c ?? '')).join(' | ').slice(0, 80)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {tooMany && <p className="text-sm text-destructive">A planilha tem {rawRows.length} linhas; o máximo é {IMPORT_MAX_ROWS}. Divida o arquivo.</p>}
                <div className="flex justify-end">
                  <Button onClick={() => setStep('map')} disabled={!file || !activePipeline || tooMany}>
                    Colunas <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {imports.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Importações anteriores</CardTitle>
                  <CardDescription>Só a mais recente pode ser desfeita.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {imports.map((i) => (
                      <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                        <span className="font-medium">{i.file_name || 'planilha'}</span>
                        <span className="text-muted-foreground">{new Date(i.created_at).toLocaleString('pt-BR')}</span>
                        <Badge variant="outline">{i.status === 'undone' ? 'desfeita' : i.status === 'done' ? 'concluída' : 'em andamento'}</Badge>
                        <span className="text-xs text-muted-foreground">{i.contacts_created} novos · {i.contacts_reused} reaproveitados · {i.deals_created} negócios · {Array.isArray(i.errors) ? i.errors.length : 0} erros</span>
                        {latestImport?.id === i.id && i.status === 'done' && (
                          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => undoImport.mutate(i.id)} disabled={undoImport.isPending}>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Desfazer
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {step === 'map' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Para onde vai cada coluna</CardTitle>
              <CardDescription>Sugerimos pelo nome do cabeçalho. Ajuste o que estiver errado; "Não importar" ignora a coluna.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b bg-secondary/60 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Coluna na planilha</th>
                      <th className="px-3 py-2 font-semibold">Exemplo</th>
                      <th className="px-3 py-2 font-semibold">Vai para</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2 font-medium">{h || <span className="text-muted-foreground">(coluna {i + 1})</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground truncate max-w-[16rem]">{String(matrix[headerRow + 1]?.[i] ?? '')}</td>
                        <td className="px-3 py-2">
                          <Select value={mapping[i] ?? 'skip'} onValueChange={(v) => setMapping((m) => ({ ...m, [i]: v as TargetId }))}>
                            <SelectTrigger className="h-8 w-64"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="skip">Não importar</SelectItem>
                              {groups.map((g) => (
                                <SelectGroup key={g}>
                                  <SelectLabel>{g}</SelectLabel>
                                  {targets.filter((t) => t.group === g).map((t) => (
                                    <SelectItem key={t.id} value={t.id} disabled={Object.entries(mapping).some(([k, v]) => Number(k) !== i && v === t.id)}>
                                      {t.label}{t.required ? ' *' : ''}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!hasName && <p className="text-sm text-destructive">Escolha a coluna do nome do contato (ou da empresa).</p>}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('upload')}><ArrowLeft className="w-4 h-4 mr-1.5" /> Arquivo</Button>
                <Button onClick={() => setStep('stages')} disabled={!hasName}>Etapas <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'stages' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Etapas do funil</CardTitle>
              <CardDescription>
                {hasStageColumn
                  ? 'Cada etapa que aparece na planilha vira uma etapa do funil escolhido. O que não casar vai para a etapa padrão.'
                  : 'A planilha não tem coluna de etapa: todos os negócios nascem na etapa escolhida.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasStageColumn && stageNames.length > 0 && (
                <div className="space-y-2">
                  {stageNames.map((name) => (
                    <div key={name} className="flex flex-wrap items-center gap-3">
                      <span className="w-56 truncate text-sm font-medium">{name}</span>
                      <span className="text-muted-foreground" aria-hidden>→</span>
                      <Select
                        value={stageMap[normalizeHeader(name)] ?? NO_STAGE}
                        onValueChange={(v) => setStageMap((m) => { const next = { ...m }; if (v === NO_STAGE) delete next[normalizeHeader(name)]; else next[normalizeHeader(name)] = v; return next; })}
                      >
                        <SelectTrigger className="h-8 w-60"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_STAGE}>(etapa padrão)</SelectItem>
                          {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{hasStageColumn ? 'Etapa padrão (linhas sem etapa ou sem correspondência)' : 'Criar os negócios na etapa'}</Label>
                <Select value={defaultStageId ?? NO_STAGE} onValueChange={(v) => setDefaultStageId(v === NO_STAGE ? null : v)}>
                  <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_STAGE}>Não criar negócio (só contatos)</SelectItem>
                    {stages.filter((s) => s.kind === 'open').map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('map')}><ArrowLeft className="w-4 h-4 mr-1.5" /> Colunas</Button>
                <Button onClick={() => setStep('validate')}>Conferir <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'validate' && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">4. Conferir</CardTitle>
                  <CardDescription>
                    {validRows.length} linha(s) prontas{errorRows > 0 ? `, ${errorRows} com erro (ficam de fora)` : ''}{duplicates.size > 0 ? `, ${duplicates.size} repetida(s) no arquivo` : ''}.
                    Contato com e-mail ou telefone já cadastrado é reaproveitado, não duplicado.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Switch checked={onlyErrors} onCheckedChange={setOnlyErrors} id="only-errors" />
                  <Label htmlFor="only-errors">Só linhas com aviso ou erro</Label>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto rounded-lg border max-h-[28rem] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0 bg-secondary">
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-2 py-2 font-semibold">Linha</th>
                      <th className="px-2 py-2 font-semibold">Contato</th>
                      <th className="px-2 py-2 font-semibold">E-mail / telefone</th>
                      <th className="px-2 py-2 font-semibold">Negócio</th>
                      <th className="px-2 py-2 font-semibold">Etapa</th>
                      <th className="px-2 py-2 font-semibold text-right">Valor</th>
                      <th className="px-2 py-2 font-semibold">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validated
                      .filter((r) => !onlyErrors || r.errors.length > 0 || r.warnings.length > 0 || duplicates.has(r.line))
                      .map((r) => (
                        <tr key={r.line} className={`border-b ${r.errors.length ? 'bg-destructive/5' : ''}`}>
                          <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                          <td className="px-2 py-1.5">
                            <p className="font-medium">{r.row.name || '—'}</p>
                            {r.row.company && <p className="text-xs text-muted-foreground">{r.row.company}</p>}
                            {previewCustom(contactFields, r.row.contact_custom) && <p className="text-xs text-muted-foreground">{previewCustom(contactFields, r.row.contact_custom)}</p>}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{[r.row.email, r.row.phone].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="px-2 py-1.5">{r.row.stage_id ? (r.row.deal_title || r.row.name) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-2 py-1.5">{stages.find((s) => s.id === r.row.stage_id)?.name ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right">{r.row.stage_id ? formatBRL(r.row.value) : ''}</td>
                          <td className="px-2 py-1.5">
                            {r.errors.map((e) => <p key={e} className="text-xs text-destructive">{e}</p>)}
                            {r.warnings.map((w) => <p key={w} className="text-xs text-muted-foreground"><AlertTriangle className="inline h-3 w-3 mr-1" />{w}</p>)}
                            {duplicates.has(r.line) && <p className="text-xs text-muted-foreground"><AlertTriangle className="inline h-3 w-3 mr-1" />Repete a linha {duplicates.get(r.line)}: vai cair no mesmo contato</p>}
                            {!r.errors.length && !r.warnings.length && !duplicates.has(r.line) && <CheckCircle2 className="h-4 w-4 text-primary" />}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('stages')}><ArrowLeft className="w-4 h-4 mr-1.5" /> Etapas</Button>
                <Button onClick={runImport} disabled={validRows.length === 0}>
                  Importar {validRows.length} linha(s) <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {(step === 'import' || step === 'done') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{step === 'done' ? 'Importação concluída' : '5. Importando...'}</CardTitle>
              <CardDescription>
                {step === 'done'
                  ? `${totals.created} contato(s) novos, ${totals.reused} reaproveitados, ${totals.deals} negócio(s). ${totals.errors.length ? `${totals.errors.length} linha(s) recusadas pelo banco.` : ''}`
                  : `${progress.done} de ${progress.total} linhas, em lotes de ${IMPORT_BATCH_SIZE}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
              {totals.errors.length > 0 && (
                <div className="rounded-lg border p-3 text-sm space-y-1 max-h-48 overflow-y-auto">
                  {totals.errors.map((e, i) => <p key={i}><span className="text-muted-foreground">Linha {e.line} ({e.name}):</span> {e.error}</p>)}
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                {step === 'import' ? (
                  <Button variant="outline" onClick={() => { cancelRef.current = true; }}>Parar depois deste lote</Button>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={reset}>Nova importação</Button>
                      {importId && (
                        <Button variant="ghost" onClick={() => undoImport.mutate(importId, { onSuccess: reset })} disabled={undoImport.isPending}>
                          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Desfazer esta importação
                        </Button>
                      )}
                    </div>
                    <Button onClick={() => navigate(tenantPath('/comercial/funil'))}>Ver o funil <ArrowRight className="w-4 h-4 ml-1.5" /></Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

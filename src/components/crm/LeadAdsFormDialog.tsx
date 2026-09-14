import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useCRMPipelines, useCRMStages } from '@/hooks/useCRM';
import { useCRMSegments } from '@/hooks/useCRMConfig';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useSalvarLeadAdsForm, type LeadAdsForm } from '@/hooks/useLeadAds';
import {
  limparMapeamento, perguntasDoFormulario,
  DESTINOS_EMBUTIDOS, DESTINO_ANOTACAO, PERGUNTAS_PADRAO,
  type FormularioDaMeta, type PerguntaDaMeta,
} from '@/lib/lead-ads';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pageId: string;
  /** O formulário como está na Meta — dá o nome e as perguntas. */
  daMeta: FormularioDaMeta;
  /** A configuração que já existe, quando é edição. */
  existente?: LeadAdsForm;
}

/**
 * Onde o administrador diz **para onde cai** o lead deste formulário (CRM-4c).
 *
 * É a tela que a decisão do dono exige: o funil não se adivinha, se escolhe. Sem
 * ela o lead fica retido — guardado inteiro, esperando —, e é por isso que ela
 * não tem valor padrão em campo nenhum.
 */
export function LeadAdsFormDialog({ open, onOpenChange, pageId, daMeta, existente }: Props) {
  const { data: funis = [] } = useCRMPipelines();
  const { data: segmentos = [] } = useCRMSegments();
  const { data: pessoas = [] } = useTechnicians();
  const { data: campos = [] } = useCustomFields('contact');
  const salvar = useSalvarLeadAdsForm();

  const [pipelineId, setPipelineId] = useState(existente?.pipeline_id ?? '');
  const [stageId, setStageId] = useState(existente?.stage_id ?? '');
  const [segmentId, setSegmentId] = useState(existente?.segment_id ?? '');
  const [ownerId, setOwnerId] = useState(existente?.owner_id ?? '');
  const [mapa, setMapa] = useState<Record<string, string>>(
    () => ({ ...(existente?.mapeamento as Record<string, string> | null ?? {}) }),
  );

  const { data: etapas = [] } = useCRMStages(pipelineId || undefined);

  // Trocar de funil invalida a etapa escolhida: o banco tem chave composta
  // `(id, tenant_id)` em cada um, mas nada impede etapa de **outro** funil — e
  // um negócio nascendo numa etapa que não é do seu funil some da tela.
  useEffect(() => {
    if (stageId && etapas.length > 0 && !etapas.some(e => e.id === stageId)) setStageId('');
  }, [etapas, stageId]);

  const perguntas = useMemo<PerguntaDaMeta[]>(
    () => perguntasDoFormulario(daMeta).filter(q => !PERGUNTAS_PADRAO.includes(q.key)),
    [daMeta],
  );

  const podeSalvar = !!pipelineId && !!stageId && !salvar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{daMeta.name || 'Formulário do anúncio'}</DialogTitle>
          <DialogDescription>
            Diga onde o lead deste formulário cai. Enquanto não estiver ligado, os leads que
            chegarem ficam guardados aqui e entram no funil assim que você salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Funil *</Label>
              <Select value={pipelineId} onValueChange={setPipelineId}>
                <SelectTrigger><SelectValue placeholder="Escolha o funil" /></SelectTrigger>
                <SelectContent>
                  {funis.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Etapa de entrada *</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                <SelectTrigger><SelectValue placeholder={pipelineId ? 'Escolha a etapa' : 'Escolha o funil antes'} /></SelectTrigger>
                <SelectContent>
                  {etapas.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={segmentId || '__none__'} onValueChange={v => setSegmentId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem segmento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem segmento</SelectItem>
                  {segmentos.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dono (vendedor)</Label>
              <Select value={ownerId || '__none__'} onValueChange={v => setOwnerId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem dono" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem dono</SelectItem>
                  {pessoas.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-foreground">As perguntas do anúncio</p>
              <p className="text-[12px] text-muted-foreground">
                Nome, e-mail e telefone o sistema já reconhece sozinho. Para as outras, escolha
                onde a resposta é guardada. O que ficar como anotação não se perde — aparece
                escrito na linha do tempo do negócio.
              </p>
            </div>

            {perguntas.length === 0 ? (
              <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border p-3">
                Este formulário só tem as perguntas padrão do Facebook. Não há nada para mapear.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {perguntas.map(q => (
                  <li key={q.key} className="px-3 py-2 flex items-center gap-3 flex-wrap">
                    <span className="text-[13px] text-foreground flex-1 min-w-[12rem]">
                      {q.label || q.key}
                    </span>
                    <Select
                      value={mapa[q.key] || DESTINO_ANOTACAO}
                      onValueChange={(v) => setMapa(m => ({ ...m, [q.key]: v }))}
                    >
                      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DESTINO_ANOTACAO}>Anotação no negócio</SelectItem>
                        {DESTINOS_EMBUTIDOS.map(d => (
                          <SelectItem key={d.valor} value={d.valor}>{d.rotulo}</SelectItem>
                        ))}
                        {campos.map(c => (
                          <SelectItem key={c.id} value={`custom:${c.key}`}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* O identificador do formulário na Meta, para conferência. Não se
              digita: ele veio de lá e é a chave que o webhook usa. */}
          <div className="space-y-1.5">
            <Label className="text-[11px]">Identificador na Meta</Label>
            <Input readOnly value={daMeta.id} className="font-mono text-[11px]" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!podeSalvar}
            onClick={() => salvar.mutate(
              {
                id: existente?.id,
                page_id: pageId,
                form_id: daMeta.id,
                form_name: daMeta.name ?? null,
                pipeline_id: pipelineId,
                stage_id: stageId,
                segment_id: segmentId || null,
                owner_id: ownerId || null,
                mapeamento: limparMapeamento(mapa),
              },
              { onSuccess: () => onOpenChange(false) },
            )}
          >
            {existente ? 'Salvar destino' : 'Ligar ao funil'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

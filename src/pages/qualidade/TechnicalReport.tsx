import { sanitizeFileName } from '@/lib/utils';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { todayISO } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Save, CheckCircle2, Upload, FileText, Printer, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ProductAnalysis {
  product_name: string; batch: string; quantity: string;
  ph: string; density: string; viscosity: string;
  appearance: string; color: string; odor: string;
  specification: string; found_values: string;
  evidence_files: any[];
}

interface ReportForm {
  id?: string;
  sac_ticket_product_id: string | null;
  report_number?: string;
  report_date?: string;
  customer_name?: string;
  customer_contact?: string;
  complaint?: string;
  treatment?: string;
  test_location?: string;
  conclusion?: string;
  signed_by_name?: string;
  signed_by_role?: string;
  status: 'draft' | 'completed';
  product: ProductAnalysis;
}

const emptyAnalysis = (): ProductAnalysis => ({
  product_name: '', batch: '', quantity: '',
  ph: '', density: '', viscosity: '',
  appearance: '', color: '', odor: '',
  specification: '', found_values: '', evidence_files: [],
});

export default function TechnicalReport() {
  const { id: ticketId } = useParams();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [ticket, setTicket] = useState<any>(null);
  const [ticketProducts, setTicketProducts] = useState<any[]>([]);
  const [reports, setReports] = useState<ReportForm[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!ticketId) return;
      const { data: t, error: tErr } = await supabase.from('sac_tickets').select('*').eq('id', ticketId).maybeSingle();
      if (tErr) { console.error(tErr); return; }
      setTicket(t);
      if (!t) return;

      const { data: tps, error: tpsErr } = await supabase
        .from('sac_ticket_products')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('sort_order');
      if (tpsErr) { console.error(tpsErr); return; }
      const ticketProds = tps || [];
      setTicketProducts(ticketProds);

      const { data: existing, error: existingErr } = await supabase
        .from('sac_technical_reports')
        .select('*, sac_report_products(*)')
        .eq('ticket_id', ticketId);
      if (existingErr) { console.error(existingErr); return; }
      const existingList = existing || [];

      const baseHeader = {
        customer_name: t.customer_name,
        customer_contact: t.customer_email + (t.customer_phone ? ` · ${t.customer_phone}` : ''),
        complaint: t.description,
        report_number: `LAUDO-${String(t.ticket_number).padStart(5, '0')}`,
        report_date: todayISO(),
      };

      const buildForm = (tp: any | null, idx: number): ReportForm => {
        const found = existingList.find((r: any) =>
          tp ? r.sac_ticket_product_id === tp.id : !r.sac_ticket_product_id
        );
        const analysisRow = found?.sac_report_products?.[0];
        const analysis: ProductAnalysis = analysisRow
          ? {
              product_name: analysisRow.product_name || tp?.product_name || t.product_name || '',
              batch: analysisRow.batch || tp?.product_batch || t.product_batch || '',
              quantity: analysisRow.quantity?.toString() || tp?.quantity?.toString() || t.quantity?.toString() || '',
              ph: analysisRow.ph?.toString() || '',
              density: analysisRow.density?.toString() || '',
              viscosity: analysisRow.viscosity?.toString() || '',
              appearance: analysisRow.appearance || '',
              color: analysisRow.color || '',
              odor: analysisRow.odor || '',
              specification: analysisRow.specification || '',
              found_values: analysisRow.found_values || '',
              evidence_files: Array.isArray(analysisRow.evidence_files) ? analysisRow.evidence_files : [],
            }
          : {
              ...emptyAnalysis(),
              product_name: tp?.product_name || t.product_name || '',
              batch: tp?.product_batch || t.product_batch || '',
              quantity: tp?.quantity?.toString() || t.quantity?.toString() || '',
            };

        return found
          ? {
              id: found.id,
              sac_ticket_product_id: found.sac_ticket_product_id,
              report_number: found.report_number,
              report_date: found.report_date,
              customer_name: found.customer_name,
              customer_contact: found.customer_contact,
              complaint: found.complaint,
              treatment: found.treatment || '',
              test_location: found.test_location || '',
              conclusion: found.conclusion || '',
              signed_by_name: found.signed_by_name || '',
              signed_by_role: found.signed_by_role || '',
              status: (found.status === 'completed' ? 'completed' : 'draft') as 'completed' | 'draft',
              product: analysis,
            }
          : {
              sac_ticket_product_id: tp?.id || null,
              ...baseHeader,
              report_number: `${baseHeader.report_number}${ticketProds.length > 1 ? `-P${idx + 1}` : ''}`,
              treatment: '',
              test_location: '',
              conclusion: '',
              signed_by_name: '',
              signed_by_role: '',
              status: 'draft',
              product: analysis,
            };
      };

      if (ticketProds.length > 0) {
        setReports(ticketProds.map((tp, i) => buildForm(tp, i)));
      } else {
        setReports([buildForm(null, 0)]);
      }
    })();
  }, [ticketId]);

  const current = reports[activeIdx];
  const completedCount = useMemo(() => reports.filter(r => r.status === 'completed').length, [reports]);

  const updateCurrent = (patch: Partial<ReportForm>) =>
    setReports(prev => prev.map((r, i) => i === activeIdx ? { ...r, ...patch } : r));
  const updateProduct = (k: keyof ProductAnalysis, v: any) =>
    setReports(prev => prev.map((r, i) => i === activeIdx ? { ...r, product: { ...r.product, [k]: v } } : r));

  const uploadEvidence = async (files: FileList | null) => {
    if (!files || !ticket) return;
    const { user } = unwrap(await supabase.auth.getUser());
    const newFiles: any[] = [];
    for (const file of Array.from(files)) {
      const path = `${ticket.tenant_id}/reports/${ticket.id}/${user?.id}/${Date.now()}-${sanitizeFileName(file.name)}`;
      const { error } = await supabase.storage.from('sac-attachments').upload(path, file);
      if (!error) newFiles.push({ name: file.name, path, size: file.size, mime: file.type });
    }
    updateProduct('evidence_files', [...current.product.evidence_files, ...newFiles]);
  };

  const save = async (finalize: boolean) => {
    if (!ticket || !current) return;
    if (finalize && !current.conclusion?.trim()) {
      toast.error('Preencha a conclusão antes de concluir o laudo.');
      return;
    }
    setSaving(true);
    try {
      const { user } = unwrap(await supabase.auth.getUser());
      const reportPayload: any = {
        tenant_id: ticket.tenant_id,
        ticket_id: ticket.id,
        sac_ticket_product_id: current.sac_ticket_product_id,
        report_number: current.report_number,
        report_date: current.report_date || todayISO(),
        customer_name: current.customer_name,
        customer_contact: current.customer_contact,
        complaint: current.complaint,
        treatment: current.treatment,
        test_location: current.test_location,
        conclusion: current.conclusion,
        signed_by_name: current.signed_by_name,
        signed_by_role: current.signed_by_role,
        status: finalize ? 'completed' : 'draft',
        created_by: user?.id,
      };

      let reportId = current.id;
      if (reportId) {
        const { error } = await supabase.from('sac_technical_reports').update(reportPayload).eq('id', reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('sac_technical_reports').insert(reportPayload).select('id').single();
        if (error) throw error;
        reportId = data.id;
      }

      await supabase.from('sac_report_products').delete().eq('report_id', reportId);
      const p = current.product;
      const { error: rpErr } = await supabase.from('sac_report_products').insert({
        report_id: reportId, tenant_id: ticket.tenant_id,
        product_name: p.product_name, batch: p.batch || null,
        quantity: p.quantity ? Number(p.quantity) : null,
        ph: p.ph ? Number(p.ph) : null,
        density: p.density ? Number(p.density) : null,
        viscosity: p.viscosity ? Number(p.viscosity) : null,
        appearance: p.appearance || null, color: p.color || null, odor: p.odor || null,
        specification: p.specification || null, found_values: p.found_values || null,
        evidence_files: p.evidence_files, sort_order: 0,
      });
      if (rpErr) throw rpErr;

      updateCurrent({ id: reportId, status: finalize ? 'completed' : 'draft' });

      const finalizedNow = finalize ? completedCount + (current.status === 'completed' ? 0 : 1) : completedCount;
      const total = reports.length;
      if (finalize) {
        if (finalizedNow >= total) {
          toast.success('Todos os laudos concluídos. Já pode encerrar o SAC.');
          navigate(tenantPath(`/qualidade/sacs/${ticket.id}`));
        } else {
          toast.success(`Laudo concluído (${finalizedNow} de ${total}). Faça os demais antes de encerrar.`);
          // pular para o próximo pendente
          const next = reports.findIndex((r, i) => i !== activeIdx && r.status !== 'completed');
          if (next >= 0) setActiveIdx(next);
        }
      } else {
        toast.success('Rascunho salvo.');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!ticket || !current) return <div className="p-8 text-center">Carregando...</div>;

  const multi = reports.length > 1;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={() => navigate(tenantPath(`/qualidade/sacs/${ticket.id}`))}>
          <ArrowLeft className="w-4 h-4 mr-1" />Voltar ao SAC
        </Button>
        <div className="flex items-center gap-2">
          {multi && (
            <Badge variant="outline" className="bg-yellow-50 border-yellow-300 text-yellow-800">
              {completedCount} de {reports.length} laudos concluídos
            </Badge>
          )}
          <Badge>{current.status === 'completed' ? 'Concluído' : 'Rascunho'}</Badge>
        </div>
      </div>

      {multi && (
        <Card className="p-3">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Este SAC tem {reports.length} produtos. É obrigatório concluir um laudo separado para cada um antes de encerrar.
          </p>
          <div className="flex flex-wrap gap-2">
            {reports.map((r, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`px-3 py-1.5 rounded-md text-xs border transition ${
                  i === activeIdx ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 hover:bg-surface-3 border-border'
                }`}
              >
                {r.status === 'completed' && <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-500" />}
                Produto {i + 1}: {ticketProducts[i]?.product_name || r.product.product_name || '—'}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h1 className="text-xl font-bold mb-1">Laudo Técnico {multi ? `— Produto ${activeIdx + 1}` : ''}</h1>
        <p className="text-xs text-muted-foreground mb-4">SAC-{String(ticket.ticket_number).padStart(5, '0')}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Field label="Nº Laudo"><Input value={current.report_number || ''} onChange={e => updateCurrent({ report_number: e.target.value })} /></Field>
          <Field label="Data"><Input type="date" value={current.report_date || ''} onChange={e => updateCurrent({ report_date: e.target.value })} /></Field>
          <Field label="Cliente"><Input value={current.customer_name || ''} onChange={e => updateCurrent({ customer_name: e.target.value })} /></Field>
          <Field label="Contato"><Input value={current.customer_contact || ''} onChange={e => updateCurrent({ customer_contact: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Field label="Reclamação"><Textarea rows={3} value={current.complaint || ''} onChange={e => updateCurrent({ complaint: e.target.value })} /></Field>
          <Field label="Tratativa"><Textarea rows={3} value={current.treatment || ''} onChange={e => updateCurrent({ treatment: e.target.value })} /></Field>
        </div>
        <Field label="Local do teste" className="mt-3"><Input value={current.test_location || ''} onChange={e => updateCurrent({ test_location: e.target.value })} placeholder="Ex.: Laboratório QA" /></Field>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Análise do Produto</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="Nome do produto *"><Input value={current.product.product_name} onChange={e => updateProduct('product_name', e.target.value)} /></Field>
          <Field label="Lote"><Input value={current.product.batch} onChange={e => updateProduct('batch', e.target.value)} /></Field>
          <Field label="Quantidade"><Input type="number" value={current.product.quantity} onChange={e => updateProduct('quantity', e.target.value)} /></Field>
        </div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mt-4 mb-2">Análises físico-químicas</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <Field label="pH"><Input type="number" step="0.01" value={current.product.ph} onChange={e => updateProduct('ph', e.target.value)} /></Field>
          <Field label="Densidade"><Input type="number" step="0.001" value={current.product.density} onChange={e => updateProduct('density', e.target.value)} /></Field>
          <Field label="Viscosidade"><Input type="number" step="0.01" value={current.product.viscosity} onChange={e => updateProduct('viscosity', e.target.value)} /></Field>
          <Field label="Aspecto"><Input value={current.product.appearance} onChange={e => updateProduct('appearance', e.target.value)} /></Field>
          <Field label="Cor"><Input value={current.product.color} onChange={e => updateProduct('color', e.target.value)} /></Field>
          <Field label="Odor"><Input value={current.product.odor} onChange={e => updateProduct('odor', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Field label="Especificação"><Textarea rows={3} value={current.product.specification} onChange={e => updateProduct('specification', e.target.value)} /></Field>
          <Field label="Valores encontrados"><Textarea rows={3} value={current.product.found_values} onChange={e => updateProduct('found_values', e.target.value)} /></Field>
        </div>
        <div className="mt-3">
          <Label className="text-xs mb-1 block">Evidências (anexos)</Label>
          <label className="cursor-pointer inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border text-[13px] hover:bg-surface-2">
            <Upload className="w-4 h-4" /> Adicionar arquivos
            <input type="file" multiple onChange={e => uploadEvidence(e.target.files)} className="hidden" />
          </label>
          {current.product.evidence_files.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {current.product.evidence_files.map((f: any, k: number) => (
                <div key={k} className="flex items-center gap-1 bg-surface-2 rounded px-2 py-1 text-xs">
                  <FileText className="w-3 h-3" />{f.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <Field label="Conclusão do laudo *"><Textarea rows={4} value={current.conclusion || ''} onChange={e => updateCurrent({ conclusion: e.target.value })} /></Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <Field label="Responsável técnico (nome)">
            <Input value={current.signed_by_name || ''} onChange={e => updateCurrent({ signed_by_name: e.target.value })} placeholder="Ex.: Maria Souza" />
          </Field>
          <Field label="Cargo / CRQ">
            <Input value={current.signed_by_role || ''} onChange={e => updateCurrent({ signed_by_role: e.target.value })} placeholder="Ex.: Química Responsável — CRQ 12345" />
          </Field>
        </div>
      </Card>

      <PrintLayout ticket={ticket} report={current} />

      <div className="flex gap-2 sticky bottom-4 print:hidden">
        <Button variant="outline" onClick={() => window.print()} disabled={saving} className="flex-1"><Printer className="w-4 h-4 mr-1" />Imprimir / PDF</Button>
        <Button variant="outline" onClick={() => save(false)} disabled={saving} className="flex-1"><Save className="w-4 h-4 mr-1" />Salvar rascunho</Button>
        <Button onClick={() => save(true)} disabled={saving} className="flex-1"><CheckCircle2 className="w-4 h-4 mr-1" />Concluir laudo</Button>
      </div>
    </div>
  );
}

function PrintLayout({ ticket, report }: { ticket: any; report: ReportForm }) {
  const p = report.product;
  return (
    <div className="hidden print:block fixed inset-0 bg-white p-10 text-[12px] text-black z-50 overflow-visible">
      <header className="border-b-2 border-black pb-3 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">Laudo Técnico</h1>
          <p className="text-[11px] text-gray-700">SAC-{String(ticket.ticket_number).padStart(5, '0')} · {report.report_number}</p>
        </div>
        <div className="text-right text-[11px]">
          <p>Data: {report.report_date}</p>
          <p>Local: {report.test_location || '—'}</p>
        </div>
      </header>
      <section className="mb-4">
        <h2 className="font-bold uppercase text-[11px] mb-1">Cliente</h2>
        <p>{report.customer_name}</p>
        <p className="text-[11px] text-gray-700">{report.customer_contact}</p>
      </section>
      <section className="mb-4">
        <h2 className="font-bold uppercase text-[11px] mb-1">Reclamação</h2>
        <p className="whitespace-pre-wrap">{report.complaint || '—'}</p>
      </section>
      <section className="mb-4">
        <h2 className="font-bold uppercase text-[11px] mb-1">Tratativa</h2>
        <p className="whitespace-pre-wrap">{report.treatment || '—'}</p>
      </section>
      <section className="mb-3 border border-gray-400 p-2">
        <h3 className="font-bold text-[11px] mb-1">Produto: {p.product_name} {p.batch && `· Lote ${p.batch}`}</h3>
        <table className="w-full text-[11px] border-collapse">
          <tbody>
            <tr><td className="border border-gray-400 px-1 font-semibold">pH</td><td className="border border-gray-400 px-1">{p.ph || '—'}</td>
                <td className="border border-gray-400 px-1 font-semibold">Densidade</td><td className="border border-gray-400 px-1">{p.density || '—'}</td>
                <td className="border border-gray-400 px-1 font-semibold">Viscosidade</td><td className="border border-gray-400 px-1">{p.viscosity || '—'}</td></tr>
            <tr><td className="border border-gray-400 px-1 font-semibold">Aspecto</td><td className="border border-gray-400 px-1">{p.appearance || '—'}</td>
                <td className="border border-gray-400 px-1 font-semibold">Cor</td><td className="border border-gray-400 px-1">{p.color || '—'}</td>
                <td className="border border-gray-400 px-1 font-semibold">Odor</td><td className="border border-gray-400 px-1">{p.odor || '—'}</td></tr>
          </tbody>
        </table>
        {p.specification && <p className="mt-1"><strong>Especificação:</strong> {p.specification}</p>}
        {p.found_values && <p><strong>Valores encontrados:</strong> {p.found_values}</p>}
        {p.evidence_files?.length > 0 && (
          <p className="text-[10px] text-gray-700 mt-1">
            Evidências anexadas: {p.evidence_files.map((f: any) => f.name).join(', ')}
          </p>
        )}
      </section>
      <section className="mb-6">
        <h2 className="font-bold uppercase text-[11px] mb-1">Conclusão</h2>
        <p className="whitespace-pre-wrap">{report.conclusion || '—'}</p>
      </section>
      <footer className="mt-12 pt-8 border-t border-gray-500 text-center text-[11px]">
        <div className="inline-block">
          <div className="border-t border-black w-72 mx-auto pt-1">
            <strong>{report.signed_by_name || '—'}</strong>
          </div>
          <p className="text-gray-700">{report.signed_by_role || 'Responsável Técnico'}</p>
        </div>
      </footer>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="text-xs mb-1 block">{label}</Label>{children}</div>;
}

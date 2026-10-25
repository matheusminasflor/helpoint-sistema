// Os campos que a Qualidade configura em Configurações › Campos do formulário (proposta "Helpoint no dia a dia",
// defeito 4, 2026-10-24): gravavam em `sac_form_fields` e o formulário do cliente nunca os lia. Este bloco mostra os
// campos ativos que não são do sistema (os do sistema já estão fixos no formulário), valida os obrigatórios e
// devolve as respostas, que vão para `sac_tickets.dynamic_fields` como { field_key: valor }.
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CampoDoSAC, RespostasDoSAC } from '@/lib/campos-do-sac';

const opcoesDe = (c: CampoDoSAC): string[] => (Array.isArray(c.options) ? (c.options as unknown[]).map(String) : []);

const TIPO_DO_INPUT: Record<string, { type: string; inputMode?: 'numeric' | 'tel' | 'email'; autoComplete?: string }> = {
  text: { type: 'text' }, email: { type: 'email', inputMode: 'email', autoComplete: 'email' },
  phone: { type: 'tel', inputMode: 'tel', autoComplete: 'tel' }, document: { type: 'text', inputMode: 'numeric' },
  number: { type: 'number', inputMode: 'numeric' }, date: { type: 'date' },
};

export function CamposDoFormulario({ campos, respostas, onChange }: {
  campos: CampoDoSAC[]; respostas: RespostasDoSAC; onChange: (r: RespostasDoSAC) => void;
}) {
  const muda = (k: string, v: string | boolean) => onChange({ ...respostas, [k]: v });
  // Anexos têm o envio próprio do formulário (nota fiscal e fotos por produto).
  const visiveis = campos.filter((c) => c.field_type !== 'attachments');
  if (visiveis.length === 0) return null;
  return (
    <div className="space-y-3">
      {visiveis.map((c) => {
        const id = `sac-${c.field_key}`;
        const rotulo = `${c.label}${c.is_required ? ' *' : ''}`;
        const ajuda = c.help_text ? <p id={`${id}-ajuda`} className="text-xs text-muted-foreground mt-1">{c.help_text}</p> : null;
        const desc = c.help_text ? `${id}-ajuda` : undefined;
        if (c.field_type === 'checkbox') {
          return (
            <div key={c.id}>
              <label htmlFor={id} className="flex items-center gap-2 text-sm">
                <input id={id} type="checkbox" checked={respostas[c.field_key] === true} aria-describedby={desc}
                  onChange={(e) => muda(c.field_key, e.target.checked)} className="h-4 w-4" />
                {rotulo}
              </label>
              {ajuda}
            </div>
          );
        }
        if (c.field_type === 'select' || c.field_type === 'radio') {
          return (
            <div key={c.id}>
              <Label htmlFor={id} className="text-xs mb-1 block">{rotulo}</Label>
              <select id={id} value={String(respostas[c.field_key] ?? '')} aria-describedby={desc}
                onChange={(e) => muda(c.field_key, e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm">
                <option value="">Selecione…</option>
                {opcoesDe(c).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              {ajuda}
            </div>
          );
        }
        if (c.field_type === 'textarea') {
          return (
            <div key={c.id}>
              <Label htmlFor={id} className="text-xs mb-1 block">{rotulo}</Label>
              <Textarea id={id} rows={3} value={String(respostas[c.field_key] ?? '')} placeholder={c.placeholder ?? undefined}
                aria-describedby={desc} onChange={(e) => muda(c.field_key, e.target.value)} />
              {ajuda}
            </div>
          );
        }
        const t = TIPO_DO_INPUT[c.field_type] ?? TIPO_DO_INPUT.text;
        return (
          <div key={c.id}>
            <Label htmlFor={id} className="text-xs mb-1 block">{rotulo}</Label>
            <Input id={id} name={c.field_key} type={t.type} inputMode={t.inputMode} autoComplete={t.autoComplete ?? 'off'}
              value={String(respostas[c.field_key] ?? '')} placeholder={c.placeholder ?? undefined} aria-describedby={desc}
              onChange={(e) => muda(c.field_key, e.target.value)} />
            {ajuda}
          </div>
        );
      })}
    </div>
  );
}

/** As respostas do cliente no detalhe do SAC, com o rótulo de cada campo (lado da equipe). */
export function RespostasDoFormulario({ respostas, campos }: { respostas: RespostasDoSAC | null | undefined; campos: Pick<CampoDoSAC, 'field_key' | 'label'>[] }) {
  const linhas = Object.entries(respostas ?? {}).filter(([, v]) => v !== '' && v !== false && v != null);
  if (linhas.length === 0) return null;
  const rotulo = new Map(campos.map((c) => [c.field_key, c.label]));
  return (
    <dl className="grid grid-cols-[minmax(0,40%)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {linhas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{rotulo.get(k) ?? k}</dt>
          <dd className="min-w-0 break-words">{v === true ? 'Sim' : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormPublico, type FormField } from '@/hooks/useCRMForms';

/**
 * A página do formulário do site (CRM-3a). Aberta sem login, em
 * `/f/<empresa>/<formulário>` — a empresa pode linkar essa página ou encaixá-la
 * dentro do site dela com o pedaço de código que a tela de montagem mostra.
 *
 * Não fala com o banco para gravar: manda para `crm-lead-intake`, que é quem
 * sabe reaproveitar contato, escolher a etapa do funil e avisar a equipe.
 */
export default function FormularioPublico() {
  const { slug: tenantSlug, form: formSlug } = useParams();
  const [params] = useSearchParams();
  const embutido = params.get('embed') === '1';
  const { data: form, isLoading } = useFormPublico(tenantSlug, formSlug);

  const [valores, setValores] = useState<Record<string, string>>({});
  const [armadilha, setArmadilha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Sem inventar campo: um formulário sem campos é um formulário sem campos, e
  // o de "só nome" que existia aqui era recusado pelo servidor de qualquer jeito.
  const campos: FormField[] = Array.isArray(form?.fields) ? (form!.fields as FormField[]) : [];

  const podeEnviar = campos.every((c) => !c.required || (valores[c.key] ?? '').trim().length > 0);

  const enviar = async () => {
    if (!form || enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const custom: Record<string, string> = {};
      for (const c of campos) if (c.key.startsWith('custom:')) custom[c.key] = valores[c.key] ?? '';

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-lead-intake`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_slug: tenantSlug, form_slug: formSlug, source: 'site',
          website: armadilha,
          name: valores.name ?? '', email: valores.email ?? '', phone: valores.phone ?? '',
          company: valores.company ?? '', message: valores.message ?? '',
          custom,
        }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || corpo.error) throw new Error(corpo.error ?? 'não foi possível enviar');
      if (form.redirect_url) { window.location.href = form.redirect_url; return; }
      setEnviado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível enviar');
    } finally {
      setEnviando(false);
    }
  };

  if (isLoading) {
    return <div className="max-w-lg mx-auto p-6"><Skeleton className="h-64 w-full" /></div>;
  }
  if (!form) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <p className="text-sm text-muted-foreground">Este formulário não existe ou foi desligado.</p>
      </div>
    );
  }

  return (
    <div className={embutido ? 'p-4' : 'min-h-screen bg-muted/30 py-10 px-4'}>
      <div className="max-w-lg mx-auto bg-card border border-border rounded-xl p-6 space-y-4">
        {!embutido && form.logo_url && (
          <img src={form.logo_url} alt={form.empresa} className="h-10 object-contain" />
        )}
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-foreground">{form.headline || form.name}</h1>
          {form.subhead && <p className="text-sm text-muted-foreground">{form.subhead}</p>}
        </div>

        {enviado ? (
          <div className="flex items-start gap-3 py-4">
            <CheckCircle2 className="h-5 w-5 text-status-success shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">{form.success_message}</p>
          </div>
        ) : (
          <>
            {campos.map((c) => (
              <div key={c.key} className="space-y-1.5">
                <Label>{c.label}{c.required ? ' *' : ''}</Label>
                {c.type === 'textarea' ? (
                  <Textarea rows={3} value={valores[c.key] ?? ''} placeholder={c.placeholder ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))} />
                ) : c.type === 'select' ? (
                  <Select value={valores[c.key] ?? ''} onValueChange={(v) => setValores((x) => ({ ...x, [c.key]: v }))}>
                    <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>
                      {(c.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type={c.type === 'tel' ? 'tel' : c.type === 'email' ? 'email' : c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}
                    value={valores[c.key] ?? ''} placeholder={c.placeholder ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [c.key]: e.target.value }))} />
                )}
              </div>
            ))}

            {/* Armadilha para robô: fica escondida, e humano não preenche. */}
            <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
              className="hidden" value={armadilha} onChange={(e) => setArmadilha(e.target.value)} />

            {erro && <p className="text-xs text-destructive">{erro}</p>}
            <Button className="w-full" onClick={enviar} disabled={!podeEnviar || enviando}>
              {enviando ? 'Enviando…' : form.submit_label}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Seus dados vão para {form.empresa} e servem só para o contato que você pediu.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

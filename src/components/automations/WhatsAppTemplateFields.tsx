import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useModelosWhatsApp } from '@/hooks/useWhatsApp';

/**
 * O passo "mensagem no WhatsApp" (CRM-4b).
 *
 * As lacunas do modelo (`{{1}}`, `{{2}}`…) são preenchidas **campo a campo**,
 * como o dono pediu: cada uma recebe ou um texto fixo, ou um campo do registro
 * escrito como `{{trigger.after.title}}`, que o motor troca pelo valor antes de
 * o passo rodar — exatamente como já acontece no passo de e-mail.
 */
export function WhatsAppTemplateFields({ cfg, set, text }: {
  cfg: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  text: (k: string) => string;
}) {
  const { data: modelos = [], isLoading } = useModelosWhatsApp();
  const aprovados = modelos.filter(m => m.status === 'APPROVED');
  const escolhido = aprovados.find(m => m.name === text('modelo'));
  const vars = Array.isArray(cfg.vars) ? (cfg.vars as unknown[]).map(v => String(v ?? '')) : [];

  function setVar(i: number, valor: string) {
    const novo = [...vars];
    while (novo.length < (escolhido?.variaveis ?? 0)) novo.push('');
    novo[i] = valor;
    set({ vars: novo.slice(0, escolhido?.variaveis ?? 0) });
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando os modelos…</p>;

  if (aprovados.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum modelo aprovado pela Meta ainda. Os modelos são escritos no painel da Meta e
        sincronizados em Configurações do Comercial → WhatsApp.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Modelo</Label>
        <Select
          value={text('modelo')}
          onValueChange={(v) => {
            const m = aprovados.find(x => x.name === v);
            // Trocar de modelo zera as lacunas: a terceira lacuna de um não é a
            // terceira do outro, e reaproveitar manda texto trocado ao cliente.
            set({ modelo: v, idioma: m?.language ?? 'pt_BR', vars: new Array(m?.variaveis ?? 0).fill('') });
          }}
        >
          <SelectTrigger><SelectValue placeholder="Escolha um modelo aprovado" /></SelectTrigger>
          <SelectContent>
            {aprovados.map(m => (
              <SelectItem key={`${m.name}|${m.language}`} value={m.name}>
                {m.name} ({m.language})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {escolhido && (
        <>
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Como o cliente vai ler</p>
            <p className="text-[13px] text-foreground whitespace-pre-wrap">{escolhido.body}</p>
          </div>

          {escolhido.variaveis > 0 ? (
            <div className="space-y-2">
              <Label>O que entra em cada lacuna</Label>
              {Array.from({ length: escolhido.variaveis }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-12 shrink-0 font-mono">{`{{${i + 1}}}`}</span>
                  <Input
                    value={vars[i] ?? ''}
                    onChange={(e) => setVar(i, e.target.value)}
                    placeholder={i === 0 ? '{{trigger.contact.name}}' : 'texto fixo ou {{campo}}'}
                  />
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Escreva um texto fixo, ou um campo entre chaves para o sistema preencher na hora —
                por exemplo <code>{'{{trigger.contact.name}}'}</code> para o nome do cliente e{' '}
                <code>{'{{trigger.after.title}}'}</code> para o título do negócio. Lacuna vazia faz a
                Meta recusar a mensagem inteira.
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Este modelo não tem lacunas para preencher.</p>
          )}
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        Cada envio é cobrado pela Meta. A mensagem fica registrada na conversa do negócio, com quem
        (ou qual fluxo) a disparou.
      </p>
    </div>
  );
}

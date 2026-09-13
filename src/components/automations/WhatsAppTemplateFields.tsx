import { EscolherModelo } from '@/components/crm/EscolherModelo';

/**
 * O passo "mensagem no WhatsApp" (CRM-4b).
 *
 * As lacunas do modelo são preenchidas **campo a campo**, como o dono pediu:
 * cada uma recebe ou um texto fixo, ou um campo do registro entre chaves, que o
 * motor troca pelo valor antes de o passo rodar — como já acontece no passo de
 * e-mail. O contexto do gatilho "negócio parado" traz `after` (o negócio) e
 * `contact` (o cliente).
 */
export function WhatsAppTemplateFields({ cfg, set, text }: {
  cfg: Record<string, unknown>;
  set: (patch: Record<string, unknown>) => void;
  text: (k: string) => string;
}) {
  const vars = Array.isArray(cfg.vars) ? (cfg.vars as unknown[]).map(v => String(v ?? '')) : [];

  return (
    <div className="space-y-3">
      <EscolherModelo
        valor={{ modelo: text('modelo'), idioma: text('idioma') || 'pt_BR', vars }}
        onChange={(v) => set({ modelo: v.modelo, idioma: v.idioma, vars: v.vars })}
        placeholderPrimeira="{{trigger.contact.name}}"
        ajuda={(
          <p className="text-[11px] text-muted-foreground">
            Escreva um texto fixo, ou um campo entre chaves para o sistema preencher na hora —
            <code>{' {{trigger.contact.name}} '}</code> para o nome do cliente,
            <code>{' {{trigger.after.title}} '}</code> para o título do negócio. Lacuna vazia faz a
            Meta recusar a mensagem inteira.
          </p>
        )}
      />
      <p className="text-[11px] text-muted-foreground">
        Cada envio é cobrado pela Meta. A mensagem fica registrada na conversa do negócio, com quem
        (ou qual fluxo) a disparou.
      </p>
    </div>
  );
}

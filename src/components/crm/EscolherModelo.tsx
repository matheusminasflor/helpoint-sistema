import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useModelosWhatsApp, type ModeloRow, type EscolhaDeModelo } from '@/hooks/useWhatsApp';

/**
 * Escolher a mensagem-modelo e preencher as lacunas (CRM-4b).
 *
 * Um componente só, porque isto aparece em dois lugares que parecem diferentes
 * e são a mesma coisa: montando um passo de fluxo, e retomando um cliente à mão
 * quando a janela de 24 h já fechou. A regra de trocar de modelo zerar as
 * lacunas é a que mais custa caro se divergir — a terceira lacuna de um modelo
 * não é a terceira do outro, e reaproveitar manda texto trocado ao cliente.
 */
export function EscolherModelo({ valor, onChange, placeholderPrimeira, ajuda }: {
  valor: EscolhaDeModelo;
  onChange: (v: EscolhaDeModelo) => void;
  /** O que sugerir na primeira lacuna: um nome, ou um campo do registro. */
  placeholderPrimeira?: string;
  ajuda?: React.ReactNode;
}) {
  const { data: modelos = [], isLoading } = useModelosWhatsApp();
  const aprovados = modelos.filter((m: ModeloRow) => m.status === 'APPROVED');
  const escolhido = aprovados.find(m => m.name === valor.modelo);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando os modelos…</p>;

  if (aprovados.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Nenhum modelo aprovado pela Meta ainda. Eles são escritos no painel da Meta e trazidos em
        Configurações do Comercial → WhatsApp.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Select
        value={valor.modelo}
        onValueChange={(v) => {
          const m = aprovados.find(x => x.name === v);
          onChange({ modelo: v, idioma: m?.language ?? 'pt_BR', vars: new Array(m?.variaveis ?? 0).fill('') });
        }}
      >
        <SelectTrigger><SelectValue placeholder="Escolha a mensagem" /></SelectTrigger>
        <SelectContent>
          {aprovados.map(m => (
            <SelectItem key={`${m.name}|${m.language}`} value={m.name}>
              {m.name} ({m.language})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {escolhido && (
        <>
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[11px] font-medium text-muted-foreground mb-0.5">Como o cliente vai ler</p>
            <p className="text-[13px] text-foreground whitespace-pre-wrap">{escolhido.body}</p>
          </div>

          {escolhido.variaveis > 0 ? (
            <div className="space-y-1.5">
              <Label className="text-[12px]">O que entra em cada lacuna</Label>
              {Array.from({ length: escolhido.variaveis }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground w-11 shrink-0 font-mono">{`{{${i + 1}}}`}</span>
                  <Input
                    value={valor.vars[i] ?? ''}
                    onChange={(e) => {
                      const novo = [...valor.vars];
                      while (novo.length < escolhido.variaveis) novo.push('');
                      novo[i] = e.target.value;
                      onChange({ ...valor, vars: novo.slice(0, escolhido.variaveis) });
                    }}
                    placeholder={i === 0 ? placeholderPrimeira ?? 'preencha' : 'preencha'}
                  />
                </div>
              ))}
              {ajuda}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">Este modelo não tem lacunas para preencher.</p>
          )}
        </>
      )}
    </div>
  );
}

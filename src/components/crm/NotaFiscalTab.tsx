import { useState } from 'react';
import { CheckCircle2, FileText, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { BlingTab } from '@/components/crm/BlingTab';
import {
  useNFeStatus, useSaveNFeProvider, useSaveFocus, useTestFocus, useDeleteFocus,
  NFE_PROVIDER_LABELS, type NFeProvider,
} from '@/hooks/useNotaFiscal';

/**
 * Configurações do CRM → "Nota fiscal" (ENC-3, ADR-009): de onde sai a nota.
 * Focus NFe é o padrão do caminho nativo; quem já roda no Bling emite por lá;
 * quem emite por fora escolhe "nenhum". O token fica só no servidor.
 */
export function NotaFiscalTab() {
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: status, isLoading } = useNFeStatus();
  const saveProvider = useSaveNFeProvider();
  const provider = (status?.provider ?? 'nenhum') as NFeProvider;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">De onde sai a nota fiscal</CardTitle>
          <CardDescription>
            Com a Focus NFe o Helpoint monta a nota e ela assina e manda à SEFAZ. Quem já roda no Bling emite por lá,
            e o pedido vai para o ERP pelo fluxo. Quem emite por fora deixa em "nenhum" e nada é tentado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="space-y-1.5 max-w-md">
              <Label>Conector</Label>
              <Select value={provider} onValueChange={(v) => saveProvider.mutate(v as NFeProvider)} disabled={!isOwnerOrAdmin || saveProvider.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(NFE_PROVIDER_LABELS) as NFeProvider[]).map((p) => (
                    <SelectItem key={p} value={p}>{NFE_PROVIDER_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isOwnerOrAdmin && <p className="text-[11px] text-muted-foreground">Só dono ou administrador muda.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {provider === 'focusnfe' && (
        <FocusCard
          key={status?.updated_at ?? 'novo'}
          ligado={!!status?.focus_ligado}
          tokenLast4={status?.token_last4 ?? null}
          ambiente={status?.ambiente ?? 'homologacao'}
          cnpj={status?.cnpj_emitente ?? ''}
          serie={status?.serie ?? 1}
          natureza={status?.natureza_operacao ?? 'Venda de mercadoria'}
          cfop={status?.cfop_padrao ?? '5102'}
          canEdit={isOwnerOrAdmin}
        />
      )}

      {provider === 'bling' && <BlingTab />}

      {provider === 'nenhum' && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">
          O Helpoint não emite nota nesta empresa. O pedido segue normalmente, e a nota é feita por fora.
        </CardContent></Card>
      )}
    </div>
  );
}

function FocusCard({ ligado, tokenLast4, ambiente, cnpj, serie, natureza, cfop, canEdit }: {
  ligado: boolean; tokenLast4: string | null; ambiente: string; cnpj: string;
  serie: number; natureza: string; cfop: string; canEdit: boolean;
}) {
  const save = useSaveFocus();
  const test = useTestFocus();
  const remove = useDeleteFocus();
  const [form, setForm] = useState({
    token: '', ambiente, cnpj_emitente: cnpj, serie: String(serie), natureza_operacao: natureza, cfop_padrao: cfop,
  });
  const [resultado, setResultado] = useState<string | null>(null);

  const payload = () => ({
    ...form,
    ambiente: form.ambiente as 'homologacao' | 'producao',
    serie: Number(form.serie) || 1,
    token: form.token || undefined,
  });
  const preenchido = ligado || (!!form.token && !!form.cnpj_emitente);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Focus NFe
              {ligado && (
                <Badge variant="secondary" className="text-[10px]">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> ligada{tokenLast4 ? ` · token …${tokenLast4}` : ''}
                </Badge>
              )}
              {ligado && ambiente === 'homologacao' && <Badge variant="outline" className="text-[10px]">ambiente de teste</Badge>}
            </CardTitle>
            <CardDescription>
              O certificado A1 fica no painel da Focus, não aqui. O token só entra nesta tela e nunca volta.
            </CardDescription>
          </div>
          {ligado && canEdit && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => remove.mutate()} disabled={remove.isPending}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEdit ? (
          <p className="text-sm text-muted-foreground">Só dono ou administrador liga a Focus NFe.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Token da Focus</Label>
                <Input type="password" autoComplete="off" value={form.token}
                  onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                  placeholder={ligado ? 'deixe vazio para manter' : ''} />
                <p className="text-[11px] text-muted-foreground">Painel da Focus → a empresa → token de produção ou de homologação.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <Select value={form.ambiente} onValueChange={(v) => setForm((f) => ({ ...f, ambiente: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homologacao">Teste (nota sem valor fiscal)</SelectItem>
                    <SelectItem value="producao">Produção (nota de verdade)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Use o token do mesmo ambiente que escolher aqui.</p>
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ que emite</Label>
                <Input value={form.cnpj_emitente} onChange={(e) => setForm((f) => ({ ...f, cnpj_emitente: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Tem que ser um CNPJ já cadastrado no painel da Focus.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Série</Label>
                <Input type="number" min={1} value={form.serie} onChange={(e) => setForm((f) => ({ ...f, serie: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Natureza da operação</Label>
                <Input value={form.natureza_operacao} onChange={(e) => setForm((f) => ({ ...f, natureza_operacao: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>CFOP padrão</Label>
                <Input value={form.cfop_padrao} onChange={(e) => setForm((f) => ({ ...f, cfop_padrao: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">Usado quando o produto não tem CFOP próprio. 5102 é venda dentro do estado.</p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Cada produto precisa de NCM cadastrado, e o cliente precisa de CPF ou CNPJ e endereço completo.
              Sem isso a nota nem é tentada, e a tela diz o que falta.
            </p>
            {resultado && <p className="text-xs">{resultado}</p>}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!preenchido || test.isPending}
                onClick={() => test.mutate(payload(), { onSuccess: (r) => setResultado(r.ok ? `✓ Token aceito${r.empresas ? ` · ${r.empresas} empresa(s) nesse token` : ''}.` : `✗ ${r.error ?? 'não aceitaram'}`) })}>
                Testar conexão
              </Button>
              <Button size="sm" disabled={!preenchido || save.isPending}
                onClick={() => save.mutate(payload(), { onSuccess: (r) => { if (r.ok) { setForm((f) => ({ ...f, token: '' })); setResultado(null); } } })}>
                {ligado ? 'Salvar alterações' : 'Ligar'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { CheckCircle2, Printer, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import {
  useShippingStatus, useSaveLabelProvider, useSaveCorreios, useTestCorreios, useDeleteCorreios,
  LABEL_PROVIDER_LABELS, type LabelProvider, type Remetente,
} from '@/hooks/useEtiqueta';

// Códigos de serviço de contrato dos Correios. São os três que quase todo
// contrato de e-commerce traz; quem tiver outro fala com os Correios e o código
// entra aqui.
const SERVICOS = [
  { value: '03298', label: 'PAC (contrato)' },
  { value: '03220', label: 'SEDEX (contrato)' },
  { value: '03158', label: 'SEDEX 10 (contrato)' },
];

/**
 * Configurações da Expedição → "Etiqueta" (ENC-1, ADR-009): de onde vem a
 * etiqueta. Buscar do Bling ou da Yampi não pede nada novo — a conexão já
 * existe. Os Correios pedem o contrato da empresa, que fica só no servidor.
 */
export function EtiquetaTab() {
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: status, isLoading } = useShippingStatus();
  const saveProvider = useSaveLabelProvider();
  const provider = (status?.provider ?? 'nenhum') as LabelProvider;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">De onde vem a etiqueta</CardTitle>
          <CardDescription>
            Depois de separar, a Expedição imprime a etiqueta sem sair da tela. Quem já emite pelo Bling ou pela Yampi só busca de lá.
            Quem tem contrato próprio com os Correios gera por aqui. Sem contrato, a etiqueta continua saindo por fora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="space-y-1.5 max-w-md">
              <Label>Conector</Label>
              <Select value={provider} onValueChange={(v) => saveProvider.mutate(v as LabelProvider)} disabled={!isOwnerOrAdmin || saveProvider.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_PROVIDER_LABELS) as LabelProvider[]).map((p) => (
                    <SelectItem key={p} value={p}>{LABEL_PROVIDER_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isOwnerOrAdmin && <p className="text-[11px] text-muted-foreground">Só dono ou administrador muda esta escolha.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* A `key` faz o formulário renascer quando o contrato muda no servidor:
          serviço e remetente são estado local e não acompanhariam sozinhos. */}
      {provider === 'correios' && <CorreiosCard key={status?.updated_at ?? 'novo'}
        ligado={!!status?.correios_ligado} cartaoLast4={status?.cartao_last4 ?? null}
        servico={status?.codigo_servico ?? '03298'} remetente={status?.remetente ?? null} canEdit={isOwnerOrAdmin} />}

      {provider === 'bling' && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">
          Nada a configurar aqui: a etiqueta vem da conta do Bling já conectada em Configurações do Comercial → Nota fiscal.
          O pedido precisa ter ido para o Bling — é o que o fluxo "pedido pago → pedido no Bling" faz.
        </CardContent></Card>
      )}
      {provider === 'yampi' && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">
          Nada a configurar aqui: a etiqueta vem da loja Yampi já ligada em Configurações do CRM → Pagamento.
          Vale para pedido que nasceu na loja.
        </CardContent></Card>
      )}
    </div>
  );
}

function CorreiosCard({ ligado, cartaoLast4, servico, remetente, canEdit }: {
  ligado: boolean; cartaoLast4: string | null; servico: string; remetente: Remetente | null; canEdit: boolean;
}) {
  const save = useSaveCorreios();
  const test = useTestCorreios();
  const remove = useDeleteCorreios();
  const [form, setForm] = useState<{ usuario: string; codigo_acesso: string; cartao_postagem: string; contrato: string; codigo_servico: string }>(
    { usuario: '', codigo_acesso: '', cartao_postagem: '', contrato: '', codigo_servico: servico },
  );
  const [rem, setRem] = useState<Remetente>(remetente ?? {});
  const [resultado, setResultado] = useState<string | null>(null);

  const payload = () => ({ ...form, contrato: form.contrato || undefined, remetente: rem });
  const preenchido = ligado || (form.usuario && form.codigo_acesso && form.cartao_postagem);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Printer className="h-4 w-4" /> Contrato dos Correios
              {ligado && <Badge variant="secondary" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" /> ligado{cartaoLast4 ? ` · cartão …${cartaoLast4}` : ''}</Badge>}
            </CardTitle>
            <CardDescription>
              Os dados do seu contrato no portal dos Correios. O código de acesso fica só no servidor e nunca volta para esta tela.
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
          <p className="text-sm text-muted-foreground">Só dono ou administrador liga o contrato.</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Usuário do CWS" hint="O mesmo do portal dos Correios." value={form.usuario} onChange={(v) => setForm((f) => ({ ...f, usuario: v }))} placeholder={ligado ? 'deixe vazio para manter' : ''} />
              <Campo label="Código de acesso" hint="Gerado no portal, em Meu Contrato." value={form.codigo_acesso} onChange={(v) => setForm((f) => ({ ...f, codigo_acesso: v }))} secret placeholder={ligado ? 'deixe vazio para manter' : ''} />
              <Campo label="Cartão de postagem" hint="O número do cartão do contrato." value={form.cartao_postagem} onChange={(v) => setForm((f) => ({ ...f, cartao_postagem: v }))} placeholder={ligado ? 'deixe vazio para manter' : ''} />
              <Campo label="Número do contrato" hint="Opcional." value={form.contrato} onChange={(v) => setForm((f) => ({ ...f, contrato: v }))} />
              <div className="space-y-1.5">
                <Label>Serviço</Label>
                <Select value={form.codigo_servico} onValueChange={(v) => setForm((f) => ({ ...f, codigo_servico: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SERVICOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">O que a etiqueta usa por padrão.</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Remetente (quem aparece na etiqueta)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nome" value={rem.nome ?? ''} onChange={(v) => setRem((r) => ({ ...r, nome: v }))} />
                <Campo label="CNPJ/CPF" value={rem.documento ?? ''} onChange={(v) => setRem((r) => ({ ...r, documento: v }))} />
                <Campo label="Telefone" value={rem.telefone ?? ''} onChange={(v) => setRem((r) => ({ ...r, telefone: v }))} />
                <Campo label="E-mail" value={rem.email ?? ''} onChange={(v) => setRem((r) => ({ ...r, email: v }))} />
                <Campo label="CEP" value={rem.cep ?? ''} onChange={(v) => setRem((r) => ({ ...r, cep: v }))} />
                <Campo label="Logradouro" value={rem.logradouro ?? ''} onChange={(v) => setRem((r) => ({ ...r, logradouro: v }))} />
                <Campo label="Número" value={rem.numero ?? ''} onChange={(v) => setRem((r) => ({ ...r, numero: v }))} />
                <Campo label="Complemento" value={rem.complemento ?? ''} onChange={(v) => setRem((r) => ({ ...r, complemento: v }))} />
                <Campo label="Bairro" value={rem.bairro ?? ''} onChange={(v) => setRem((r) => ({ ...r, bairro: v }))} />
                <Campo label="Cidade" value={rem.cidade ?? ''} onChange={(v) => setRem((r) => ({ ...r, cidade: v }))} />
                <Campo label="UF" value={rem.uf ?? ''} onChange={(v) => setRem((r) => ({ ...r, uf: v.toUpperCase().slice(0, 2) }))} />
              </div>
            </div>

            {resultado && <p className="text-xs">{resultado}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!preenchido || test.isPending}
                onClick={() => test.mutate(payload(), { onSuccess: (r) => setResultado(r.ok ? '✓ Os Correios aceitaram o contrato.' : `✗ ${r.error ?? 'não aceitaram'}`) })}>
                Testar conexão
              </Button>
              <Button size="sm" disabled={!preenchido || save.isPending}
                onClick={() => save.mutate(payload(), { onSuccess: (r) => { if (r.ok) { setForm((f) => ({ ...f, usuario: '', codigo_acesso: '', cartao_postagem: '' })); setResultado(null); } } })}>
                {ligado ? 'Salvar alterações' : 'Ligar'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Os Correios exigem o peso na pré-postagem: cadastre o peso em grama no produto (CRM → Produtos). Sem peso, a etiqueta sai com o mínimo e a tela avisa.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Campo({ label, hint, value, onChange, secret, placeholder }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; secret?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={secret ? 'password' : 'text'} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

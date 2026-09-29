// Solicitações de cadastro de cliente novo — as abas "Cadastro - <vendedor>" da planilha de
// Gestão Comercial (LEVA O, parte 3).
//
// Cada papel vê o que lhe cabe, e quem garante é o banco:
//   * a vendedora pede, acompanha e, quando o gestor devolve para "Ajustar", corrige e reenvia;
//   * o gestor aprova, reprova ou manda ajustar — reprovar e ajustar exigem parecer;
//   * aprovar abre o chamado para quem cadastra no Forteplus, no destino que o gestor escolheu
//     aqui mesmo ("destino é configuração", regra do dono);
//   * aplicar (informar o código do Forteplus) cria o cliente na carteira de quem pediu.
import { useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Plus } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useTenantSettings, useUpdateTenantSettings } from '@/hooks/useTenantSettings';
import { useTICategories } from '@/hooks/useTICategories';
import { MODULE_LABELS, TICKET_MODULES } from '@/lib/automation-flow';
import {
  ROTULO_STATUS, contarSolicitacoes, useAplicarSolicitacao, useDecidirSolicitacao,
  useDocumentoJaCadastrado, usePedirCadastro, useSolicitacoesCadastro,
  type PedidoInput, type Prioridade, type Solicitacao,
} from '@/hooks/useComercialSolicitacoes';
import { formatarDocumento } from '@/lib/documento';
import { formatDateBR } from '@/types/financeiro';

const COR_STATUS: Record<Solicitacao['status'], string> = {
  pendente: 'badge-warning',
  ajustar: 'badge-warning',
  aprovado: 'badge-info',
  reprovado: 'badge-danger',
  aplicado: 'badge-success',
};

/** Módulos em que um chamado pode nascer — os de `tickets.module` (Compras entrou na LEVA N). */
const MODULOS_DE_CHAMADO = new Set<string>([...TICKET_MODULES, 'compras']);

export function SolicitacoesDeCadastro() {
  const { user } = useAuth();
  const geraCarteiras = usePodeGerirCarteiras();
  const { data: lista = [], isLoading } = useSolicitacoesCadastro();
  const [pedindo, setPedindo] = useState<Solicitacao | 'novo' | null>(null);
  const contagem = contarSolicitacoes(lista);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">Solicitações de cadastro de cliente novo</h3>
          <p className="text-[12px] text-muted-foreground max-w-2xl">
            Cliente novo precisa ser cadastrado no Forteplus antes de existir aqui. Peça por esta tela: o gestor aprova, o
            chamado vai para quem cadastra no Forteplus, e quando o código é informado o cliente nasce na sua carteira.
            Para corrigir dados de um cliente que já existe, edite direto no cadastro.
          </p>
        </div>
        <Button size="sm" onClick={() => setPedindo('novo')}>
          <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Pedir cadastro de cliente novo
        </Button>
      </div>

      {geraCarteiras && <DestinoDoChamado />}

      {/* Os quatro números do painel da planilha. */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {[
          ['Pendentes', contagem.pendentes],
          ['Aprovadas a aplicar', contagem.aAplicar],
          ['Aplicadas', contagem.aplicadas],
          ['Reprovadas / ajustar', contagem.reprovadasOuAjustar],
        ].map(([rotulo, n]) => (
          <Card key={rotulo as string} className="p-3">
            <p className="text-[11px] text-muted-foreground">{rotulo}</p>
            <p className="text-[15px] font-semibold">{n}</p>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : lista.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={ClipboardCheck} title="Nenhum pedido de cadastro"
            description="Quando alguém pedir o cadastro de um cliente novo, o pedido aparece aqui." />
        </Card>
      ) : (
        <div className="space-y-2">
          {lista.map((s) => (
            <LinhaSolicitacao key={s.id} s={s} geraCarteiras={geraCarteiras}
              eMinha={s.vendedor_id === user?.id} onEditar={() => setPedindo(s)} />
          ))}
        </div>
      )}

      {pedindo && (
        <PedidoDialog editando={pedindo === 'novo' ? null : pedindo} onFechar={() => setPedindo(null)} />
      )}
    </div>
  );
}

/** Para onde vai o chamado de um pedido aprovado. Sem isto o banco recusa aprovar. */
function DestinoDoChamado() {
  const { data: settings } = useTenantSettings();
  const salvar = useUpdateTenantSettings();
  const { categories } = useTICategories();
  const comercial = settings?.comercial ?? {};
  const atual = comercial.cadastroCategoriaId ?? '';
  const opcoes = useMemo(
    () => categories.filter((c) => c.is_active && MODULOS_DE_CHAMADO.has(c.module)),
    [categories],
  );

  return (
    <Card className={`p-3 flex flex-wrap items-center gap-2 text-[12px] ${atual ? '' : 'badge-warning'}`}>
      <span className="font-medium">Destino do chamado de cadastro:</span>
      <Select value={atual} onValueChange={(v) => salvar.mutate({ settings: { comercial: { ...comercial, cadastroCategoriaId: v } } })}>
        <SelectTrigger className="h-8 w-72"><SelectValue placeholder="Escolha a fila de quem cadastra no Forteplus" /></SelectTrigger>
        <SelectContent>
          {opcoes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {(MODULE_LABELS as Record<string, string>)[c.module] ?? c.module} › {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!atual && <span>Sem isto, nenhum pedido pode ser aprovado.</span>}
    </Card>
  );
}

function LinhaSolicitacao({ s, geraCarteiras, eMinha, onEditar }: {
  s: Solicitacao; geraCarteiras: boolean; eMinha: boolean; onEditar: () => void;
}) {
  const decidir = useDecidirSolicitacao();
  const aplicar = useAplicarSolicitacao();
  const [parecer, setParecer] = useState('');
  const [codigo, setCodigo] = useState('');

  return (
    <Card className="p-3 space-y-2 text-[12px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold">{s.razao_social}</p>
          <p className="text-muted-foreground">
            {[s.documento && formatarDocumento(s.documento), s.cidade && `${s.cidade}${s.uf ? `/${s.uf}` : ''}`, s.telefone]
              .filter(Boolean).join(' · ') || 'Sem documento, cidade ou telefone'}
          </p>
          <p className="text-muted-foreground">
            Pedido por {s.vendedor_nome} em {formatDateBR(s.created_at.slice(0, 10))} · prioridade {s.prioridade}
          </p>
          {s.motivo && <p className="mt-1">{s.motivo}</p>}
          {s.parecer && <p className="mt-1"><span className="text-muted-foreground">Parecer do gestor:</span> {s.parecer}</p>}
          {s.cliente_codigo && <p className="mt-1">Cliente criado com o código <strong>{s.cliente_codigo}</strong>.</p>}
        </div>
        <Badge className={`text-[10px] ${COR_STATUS[s.status]}`}>{ROTULO_STATUS[s.status]}</Badge>
      </div>

      {/* O gestor decide o que está pendente. */}
      {geraCarteiras && s.status === 'pendente' && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <Input className="h-8 flex-1 min-w-[200px]" placeholder="Parecer (obrigatório para reprovar ou pedir ajuste)"
            value={parecer} onChange={(e) => setParecer(e.target.value)} />
          <Button size="sm" className="h-8" disabled={decidir.isPending}
            onClick={() => decidir.mutate({ id: s.id, decisao: 'aprovado', parecer })}>Aprovar</Button>
          <Button size="sm" variant="outline" className="h-8" disabled={!parecer.trim() || decidir.isPending}
            onClick={() => decidir.mutate({ id: s.id, decisao: 'ajustar', parecer })}>Pedir ajuste</Button>
          <Button size="sm" variant="ghost" className="h-8 text-destructive" disabled={!parecer.trim() || decidir.isPending}
            onClick={() => decidir.mutate({ id: s.id, decisao: 'reprovado', parecer })}>Reprovar</Button>
        </div>
      )}

      {/* Aprovado: quem cadastrou no Forteplus informa o código. O banco confere quem pode
          (o gestor, ou quem está com o chamado). */}
      {s.status === 'aprovado' && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="text-muted-foreground">Já cadastrado no Forteplus?</span>
          <Input className="h-8 w-40" placeholder="Código do cliente" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          <Button size="sm" className="h-8" disabled={!codigo.trim() || aplicar.isPending}
            onClick={() => aplicar.mutate({ id: s.id, codigo })}>Aplicar</Button>
        </div>
      )}

      {/* A vendedora corrige o que voltou para ajuste. */}
      {eMinha && (s.status === 'ajustar' || s.status === 'pendente') && (
        <div className="border-t border-border pt-2">
          <Button size="sm" variant="outline" className="h-8" onClick={onEditar}>
            {s.status === 'ajustar' ? 'Corrigir e reenviar' : 'Editar pedido'}
          </Button>
        </div>
      )}
    </Card>
  );
}

function PedidoDialog({ editando, onFechar }: { editando: Solicitacao | null; onFechar: () => void }) {
  const pedir = usePedirCadastro();
  const [p, setP] = useState<PedidoInput>(() => ({
    id: editando?.id,
    razao_social: editando?.razao_social ?? '',
    documento: editando?.documento ?? '',
    uf: editando?.uf ?? '',
    cidade: editando?.cidade ?? '',
    telefone: editando?.telefone ?? '',
    telefone_2: editando?.telefone_2 ?? '',
    email: editando?.email ?? '',
    endereco: editando?.endereco ?? '',
    cep: editando?.cep ?? '',
    inscricao_estadual: editando?.inscricao_estadual ?? '',
    condicao_fiscal: editando?.condicao_fiscal ?? '',
    grupo: editando?.grupo ?? '',
    prioridade: editando?.prioridade ?? 'media',
    motivo: editando?.motivo ?? '',
  }));
  const { data: jaExiste } = useDocumentoJaCadastrado(p.documento ?? '');
  const campo = (k: keyof PedidoInput) => ({
    value: (p[k] as string) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setP((x) => ({ ...x, [k]: e.target.value })),
  });

  const enviar = async () => {
    if (!p.razao_social.trim()) return;
    await pedir.mutateAsync(p);
    onFechar();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Corrigir pedido de cadastro' : 'Pedir cadastro de cliente novo'}</DialogTitle>
        </DialogHeader>
        {editando?.parecer && (
          <p className="text-[12px] badge-warning rounded-md px-2 py-1">Parecer do gestor: {editando.parecer}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ped-razao">Razão social *</Label>
            <Input id="ped-razao" {...campo('razao_social')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-doc">CNPJ / CPF</Label>
            <Input id="ped-doc" {...campo('documento')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-ie">Inscrição estadual</Label>
            <Input id="ped-ie" {...campo('inscricao_estadual')} />
          </div>
          {/* O mesmo reconhecimento que o SAC faz: se o documento já é de alguém, dizer agora,
              e não depois que a TI cadastrar duplicado no Forteplus. */}
          {jaExiste && (
            <p className="sm:col-span-2 flex items-center gap-1.5 text-[12px] badge-warning rounded-md px-2 py-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Este CNPJ/CPF já é do cliente <strong>&nbsp;{jaExiste.codigo} — {jaExiste.razao_social}&nbsp;</strong>
              ({jaExiste.carteira ? `carteira ${jaExiste.carteira}` : 'no Histórico'}). Não é preciso pedir cadastro.
            </p>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ped-end">Endereço</Label>
            <Input id="ped-end" {...campo('endereco')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-cidade">Cidade</Label>
            <Input id="ped-cidade" {...campo('cidade')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ped-uf">UF</Label>
              <Input id="ped-uf" maxLength={2} {...campo('uf')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ped-cep">CEP</Label>
              <Input id="ped-cep" {...campo('cep')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-tel">Telefone</Label>
            <Input id="ped-tel" {...campo('telefone')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-tel2">Telefone 2</Label>
            <Input id="ped-tel2" {...campo('telefone_2')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-email">E-mail</Label>
            <Input id="ped-email" type="email" {...campo('email')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-cond">Condição fiscal</Label>
            <Input id="ped-cond" placeholder="Ex.: 1 - Contribuinte ICMS" {...campo('condicao_fiscal')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-grupo">Cliente de acompanhamento (grupo)</Label>
            <Input id="ped-grupo" placeholder="Se o dono já tem outro CNPJ conosco" {...campo('grupo')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ped-prio">Prioridade</Label>
            <Select value={p.prioridade} onValueChange={(v) => setP((x) => ({ ...x, prioridade: v as Prioridade }))}>
              <SelectTrigger id="ped-prio"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ped-motivo">Motivo / observação</Label>
            <Textarea id="ped-motivo" rows={2} {...campo('motivo')} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!p.razao_social.trim() || pedir.isPending}>
            {editando ? 'Reenviar ao gestor' : 'Enviar ao gestor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

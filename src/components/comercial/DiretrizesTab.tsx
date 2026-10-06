// Comercial › Configurações › Diretrizes (decisão do dono, 2026-10-04): as regras do tipo "comprou
// no mês 36 OX 6 volumes → R$ 100 de cashback na próxima compra". Cada uma mede uma FAMÍLIA ou um
// PRODUTO, com uma quantidade mínima no faturado do mês, e dá cashback em R$, cashback em % do que
// o cliente comprou, ou bonificação. Pode valer só para algumas tabelas de preço.
//
// Os botões só aparecem para quem altera a aba no perfil de acesso — a mesma conta que o banco faz
// (`pode_alterar_aba('comercial', 'diretrizes')`). Esconder aqui é conforto; quem barra é o banco.
// Não há "excluir": desativar guarda a regra que justificou as concessões já feitas.
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useFamilias, useProdutosComFamilia } from '@/hooks/useComercialFamilias';
import { useTabelasBase } from '@/hooks/useComercialPainel';
import { useDiretrizes, useSalvarDiretriz, type Diretriz } from '@/hooks/useComercialDiretrizes';
import {
  TIPOS_DE_BENEFICIO, dataParaMes, descreverBeneficio, erroDaDiretriz, linhaDaDiretriz,
  type FormularioDeDiretriz, type TipoDeBeneficio,
} from '@/lib/diretrizes-comerciais';
import { todayISO } from '@/lib/dates';

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const mesLabel = (data: string) => `${data.slice(5, 7)}/${data.slice(0, 4)}`;

export function DiretrizesTab() {
  const podeAlterar = useConfiguracaoDosSetores().alteraAba('comercial', 'diretrizes');
  const diretrizes = useDiretrizes();
  const { data: familias = [] } = useFamilias();
  const produtos = useProdutosComFamilia();
  const salvar = useSalvarDiretriz();
  const [editando, setEditando] = useState<Diretriz | 'nova' | null>(null);

  const nomeDaFamilia = useMemo(() => new Map(familias.map((f) => [f.id, f.nome])), [familias]);
  const nomeDoProduto = useMemo(() => {
    const mapa = new Map((produtos.data?.linhas ?? []).map((p) => [p.codigo, p.nome]));
    return (codigo: string) => mapa.get(codigo);
  }, [produtos.data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Diretrizes comerciais</CardTitle>
            <CardDescription>
              Ex.: "comprou no mês 36 OX 6 vol → R$ 100 de cashback na próxima compra". Conta o faturado (as notas
              importadas) do mês. Quem atinge aparece em Insights › Diretrizes e na ficha do cliente, para conceder.
            </CardDescription>
          </div>
          {podeAlterar && <Button size="sm" onClick={() => setEditando('nova')}>Nova diretriz</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {diretrizes.isError && <p className="text-[13px] text-destructive">Não consegui carregar as diretrizes.</p>}
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Diretriz</th>
                <th className="px-3 py-1.5 font-semibold">Mede</th>
                <th className="px-3 py-1.5 font-semibold text-right">Mínimo no mês</th>
                <th className="px-3 py-1.5 font-semibold">Benefício</th>
                <th className="px-3 py-1.5 font-semibold">Tabelas</th>
                <th className="px-3 py-1.5 font-semibold">Vigência</th>
                {podeAlterar && <th className="px-3 py-1.5" />}
              </tr>
            </thead>
            <tbody>
              {(diretrizes.data ?? []).map((d) => (
                <tr key={d.id} className={`border-t ${d.ativo ? '' : 'opacity-60'}`}>
                  <td className="px-3 py-1.5">
                    {d.nome}{d.ativo ? '' : ' (desativada)'}
                    {d.condicao && <div className="text-[12px] text-muted-foreground">{d.condicao}</div>}
                  </td>
                  <td className="px-3 py-1.5">
                    {d.familia_id
                      ? `Família ${nomeDaFamilia.get(d.familia_id) ?? '—'}`
                      : `Produto ${nomeDoProduto(d.produto_codigo ?? '') ?? d.produto_codigo}`}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{fmtQtd(d.quantidade_minima)} un.</td>
                  <td className="px-3 py-1.5">{descreverBeneficio(d, nomeDoProduto)}</td>
                  <td className="px-3 py-1.5">{d.tabelas?.length ? d.tabelas.join(', ') : 'Todas'}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {mesLabel(d.vigencia_inicio)} {d.vigencia_fim ? `a ${mesLabel(d.vigencia_fim)}` : 'em diante'}
                  </td>
                  {podeAlterar && (
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(d)}>Editar</Button>
                      <Button size="sm" variant="ghost" disabled={salvar.isPending}
                        onClick={() => salvar.mutate({ id: d.id, ativo: !d.ativo })}>
                        {d.ativo ? 'Desativar' : 'Reativar'}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {!diretrizes.isLoading && (diretrizes.data ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Nenhuma diretriz cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!podeAlterar && (
          <p className="text-xs text-muted-foreground">
            Criar e editar diretriz exige "Configurações › Diretrizes: Alterar" no perfil de acesso do Comercial.
          </p>
        )}
      </CardContent>
      {editando && (
        <DialogoDiretriz diretriz={editando === 'nova' ? null : editando} onFechar={() => setEditando(null)} />
      )}
    </Card>
  );
}

function formularioDe(d: Diretriz | null): FormularioDeDiretriz & { tabelas: string[]; condicao: string; ativo: boolean } {
  return {
    ativo: d?.ativo ?? true,
    nome: d?.nome ?? '',
    medir: d?.produto_codigo ? 'produto' : 'familia',
    familia_id: d?.familia_id ?? '',
    produto_codigo: d?.produto_codigo ?? '',
    quantidade_minima: d ? String(d.quantidade_minima) : '',
    beneficio_tipo: (d?.beneficio_tipo as TipoDeBeneficio) ?? 'cashback_valor',
    beneficio_valor: d?.beneficio_valor != null ? String(d.beneficio_valor) : '',
    bonificacao_produto_codigo: d?.bonificacao_produto_codigo ?? '',
    bonificacao_quantidade: d?.bonificacao_quantidade != null ? String(d.bonificacao_quantidade) : '',
    // Nova diretriz começa no mês de hoje (local — regra 4).
    vigencia_inicio: d ? dataParaMes(d.vigencia_inicio) : todayISO().slice(0, 7),
    vigencia_fim: dataParaMes(d?.vigencia_fim),
    tabelas: d?.tabelas ?? [],
    condicao: d?.condicao ?? '',
  };
}

function DialogoDiretriz({ diretriz, onFechar }: { diretriz: Diretriz | null; onFechar: () => void }) {
  const salvar = useSalvarDiretriz();
  const { data: familias = [] } = useFamilias();
  const produtos = useProdutosComFamilia();
  const { data: tabelasBase = [] } = useTabelasBase();
  const [f, setF] = useState(() => formularioDe(diretriz));
  const [tentou, setTentou] = useState(false);
  const muda = (parcial: Partial<typeof f>) => setF((atual) => ({ ...atual, ...parcial }));

  const erro = erroDaDiretriz(f);
  const gravar = () => {
    setTentou(true);
    if (erro) return;
    salvar.mutate(
      {
        id: diretriz?.id,
        ativo: f.ativo,
        dados: { ...linhaDaDiretriz(f), tabelas: f.tabelas.length ? f.tabelas : null, condicao: f.condicao.trim() || null },
      },
      { onSuccess: onFechar },
    );
  };
  const alternarTabela = (t: string, marcada: boolean) =>
    muda({ tabelas: marcada ? [...f.tabelas, t] : f.tabelas.filter((x) => x !== t) });

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{diretriz ? 'Editar diretriz' : 'Nova diretriz'}</DialogTitle>
        </DialogHeader>
        {/* A lista de produtos dos dois campos de produto — o `datalist` nativo filtra enquanto digita. */}
        <datalist id="diretriz-produtos">
          {(produtos.data?.linhas ?? []).map((p) => <option key={p.id} value={p.codigo}>{p.nome}</option>)}
        </datalist>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="diretriz-nome">Nome</Label>
            <Input id="diretriz-nome" value={f.nome} onChange={(e) => muda({ nome: e.target.value })} placeholder="36 OX 6 vol → R$ 100" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Mede</Label>
              <Select value={f.medir} onValueChange={(v) => muda({ medir: v as 'familia' | 'produto' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="familia">Uma família</SelectItem>
                  <SelectItem value="produto">Um produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.medir === 'familia' ? (
              <div className="space-y-1.5">
                <Label>Família</Label>
                <Select value={f.familia_id || undefined} onValueChange={(v) => muda({ familia_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>
                    {familias.filter((x) => x.ativo || x.id === f.familia_id).map((x) => (
                      <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="diretriz-produto">Produto (código)</Label>
                <Input id="diretriz-produto" list="diretriz-produtos" value={f.produto_codigo}
                  onChange={(e) => muda({ produto_codigo: e.target.value })} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="diretriz-minimo">Quantidade mínima no mês (unidades)</Label>
            <Input id="diretriz-minimo" type="number" min="0" step="any" value={f.quantidade_minima}
              onChange={(e) => muda({ quantidade_minima: e.target.value })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Benefício</Label>
              <Select value={f.beneficio_tipo} onValueChange={(v) => muda({ beneficio_tipo: v as TipoDeBeneficio })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_DE_BENEFICIO.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {f.beneficio_tipo === 'bonificacao' ? (
              <div className="space-y-1.5">
                <Label htmlFor="diretriz-bonif-qtd">Quantas unidades</Label>
                <Input id="diretriz-bonif-qtd" type="number" min="0" step="any" value={f.bonificacao_quantidade}
                  onChange={(e) => muda({ bonificacao_quantidade: e.target.value })} />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="diretriz-valor">{f.beneficio_tipo === 'cashback_valor' ? 'Valor (R$)' : 'Percentual (%)'}</Label>
                <Input id="diretriz-valor" type="number" min="0" step="any" value={f.beneficio_valor}
                  onChange={(e) => muda({ beneficio_valor: e.target.value })} />
              </div>
            )}
          </div>
          {f.beneficio_tipo === 'bonificacao' && (
            <div className="space-y-1.5">
              <Label htmlFor="diretriz-bonif-produto">Produto da bonificação (código)</Label>
              <Input id="diretriz-bonif-produto" list="diretriz-produtos" value={f.bonificacao_produto_codigo}
                onChange={(e) => muda({ bonificacao_produto_codigo: e.target.value })} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tabelas de preço</Label>
            <p className="text-[12px] text-muted-foreground">Nenhuma marcada = vale para todos os clientes.</p>
            <div className="flex flex-wrap gap-3">
              {tabelasBase.map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-[13px]">
                  <Checkbox checked={f.tabelas.includes(t)} onCheckedChange={(v) => alternarTabela(t, v === true)} />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="diretriz-de">Vigência: a partir de (mês)</Label>
              <Input id="diretriz-de" type="month" value={f.vigencia_inicio} onChange={(e) => muda({ vigencia_inicio: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="diretriz-ate">Até (mês, opcional)</Label>
              <Input id="diretriz-ate" type="month" value={f.vigencia_fim} onChange={(e) => muda({ vigencia_fim: e.target.value })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="diretriz-condicao">Condição / observação</Label>
            <Textarea id="diretriz-condicao" rows={2} value={f.condicao} onChange={(e) => muda({ condicao: e.target.value })}
              placeholder="Ex.: vale na próxima compra; não acumula com outra promoção." />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="diretriz-ativa" checked={f.ativo} onCheckedChange={(v) => muda({ ativo: v })} />
            <Label htmlFor="diretriz-ativa" className="text-[13px] font-normal">
              {f.ativo ? 'Ativa — entra na apuração' : 'Desativada — não apura (as concessões feitas continuam)'}
            </Label>
          </div>

          {tentou && erro && <p className="text-[13px] text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={salvar.isPending} onClick={gravar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

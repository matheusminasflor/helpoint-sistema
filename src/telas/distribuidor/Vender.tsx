// Registrar a venda ao salão (etapa 6; decisão 2 do dono: "a venda ao salão ele registra no app"). O salão, os
// produtos e as quantidades; o estoque baixa sozinho e o salão vira cliente.
// R5 (decisões do dono de 2026-10-26): o preço já vem com o último que ele cobrou (`precoSugerido`); vender mais do
// que o estoque mostra avisa e deixa salvar; `?venda=<id>` abre a venda para corrigir (o salão não muda).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useCorrigirVenda, useEstoqueDoPortal, useProdutosDoPortal, useRegistrarVenda, useSaloes, useVendasComPrecos,
} from '@/hooks/usePortalDoDistribuidor';
import { todayISO } from '@/lib/dates';
import { avisoDeEstoque, precoSugerido } from '@/lib/preco-sugerido';
import { formatBRL } from '@/types/financeiro';

interface Linha { produto_codigo: string; produto_nome: string; quantidade: string; valor_unitario: string }
const numero = (s: string) => Number(s.replace(',', '.'));
const texto = (n: number) => String(n).replace('.', ',');

export default function VenderAoSalao() {
  const [search] = useSearchParams();
  const vendaId = search.get('venda');
  const navigate = useNavigate();
  const saloes = useSaloes();
  const produtos = useProdutosDoPortal();
  const estoque = useEstoqueDoPortal();
  const vendas = useVendasComPrecos();
  const registrar = useRegistrarVenda();
  const corrigir = useCorrigirVenda();
  const [salao, setSalao] = useState(search.get('salao') ?? '');
  const [data, setData] = useState(todayISO());
  const [busca, setBusca] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [observacao, setObservacao] = useState('');

  // Corrigir: a venda chega com os itens dela — uma vez só, para uma releitura da lista não apagar o que ele mudou.
  const corrigindo = vendaId ? (vendas.data ?? []).find((v) => v.id === vendaId) : undefined;
  const [carregada, setCarregada] = useState<string | null>(null);
  useEffect(() => {
    if (!corrigindo || carregada === corrigindo.id) return;
    setCarregada(corrigindo.id);
    setSalao(corrigindo.salao_id);
    setData(corrigindo.data);
    setObservacao(corrigindo.observacao ?? '');
    setLinhas(corrigindo.itens.map((i) => ({ produto_codigo: i.produto_codigo, produto_nome: i.produto_nome,
      quantidade: texto(Number(i.quantidade)), valor_unitario: Number(i.valor_unitario) ? texto(Number(i.valor_unitario)) : '' })));
  }, [corrigindo, carregada]);

  // O estoque que importa para o aviso: na correção, o que a própria venda já tirou volta a contar.
  const saldo = useMemo(() => {
    const m = new Map((estoque.data ?? []).map((e) => [e.produto_codigo, Number(e.saldo)]));
    for (const i of corrigindo?.itens ?? []) m.set(i.produto_codigo, (m.get(i.produto_codigo) ?? 0) + Number(i.quantidade));
    return m;
  }, [estoque.data, corrigindo]);
  const termo = busca.trim().toLowerCase();
  // O que ele tem em estoque vem primeiro: é o que ele vende.
  const achados = termo.length < 2 ? [] : (produtos.data ?? [])
    .filter((p) => p.nome.toLowerCase().includes(termo) || p.codigo === termo)
    .filter((p) => !linhas.some((l) => l.produto_codigo === p.codigo))
    .sort((a, b) => Number((saldo.get(b.codigo) ?? 0) > 0) - Number((saldo.get(a.codigo) ?? 0) > 0))
    .slice(0, 8);
  const validas = linhas.filter((l) => numero(l.quantidade) > 0);
  const total = validas.reduce((t, l) => t + numero(l.quantidade) * (numero(l.valor_unitario) || 0), 0);
  const muda = (i: number, k: keyof Linha, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const pondo = (codigo: string, nome: string) => {
    const preco = precoSugerido(vendas.data ?? [], salao, codigo);
    setLinhas((ls) => [...ls, { produto_codigo: codigo, produto_nome: nome, quantidade: '1', valor_unitario: preco ? texto(preco) : '' }]);
    setBusca('');
  };
  const itens = validas.map((l) => ({ produto_codigo: l.produto_codigo, quantidade: numero(l.quantidade), valor_unitario: numero(l.valor_unitario) || 0 }));
  const salvando = registrar.isPending || corrigir.isPending;
  const salvar = () => (corrigindo
    ? corrigir.mutate({ venda_id: corrigindo.id, data, observacao, itens }, { onSuccess: () => navigate(`/distribuidor/saloes/${corrigindo.salao_id}`) })
    : registrar.mutate({ salao_id: salao, data, observacao, itens }, { onSuccess: () => navigate(`/distribuidor/saloes/${salao}`) }));

  if (vendaId && !vendas.isLoading && !corrigindo) {
    return <p className="text-[14px] text-muted-foreground">Venda não encontrada. Ela pode ter sido apagada.</p>;
  }
  return (
    <>
      <h1 className="text-[24px] font-semibold">{vendaId ? 'Corrigir venda' : 'Registrar venda'}</h1>
      <Card className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="v-salao">Salão</Label>
          <select id="v-salao" className="h-11 w-full rounded-md border border-input bg-background px-3 text-base" value={salao}
            disabled={!!vendaId} onChange={(e) => setSalao(e.target.value)}>
            <option value="">Escolha o salão</option>
            {(saloes.data ?? []).filter((s) => s.etapa !== 'perdido' || s.id === salao)
              .map((s) => <option key={s.id} value={s.id}>{s.nome}{s.cidade ? ` · ${s.cidade}` : ''}</option>)}
          </select>
          {vendaId && <p className="text-[13px] text-muted-foreground">Venda no salão errado: apague-a na ficha do salão e registre de novo.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="v-data">Data</Label>
          <Input id="v-data" type="date" className="h-11 text-base" value={data} max={todayISO()} onChange={(e) => setData(e.target.value)} />
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="v-busca">Produto</Label>
          <Input id="v-busca" className="h-11 text-base" placeholder="Digite o nome do produto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {achados.length > 0 && (
          <ul className="rounded-md border border-border divide-y divide-border">
            {achados.map((p) => (
              <li key={p.codigo}>
                <button type="button" className="w-full text-left px-3 py-2.5 min-h-11 text-[15px]" onClick={() => pondo(p.codigo, p.nome)}>
                  {p.nome} <span className="text-[13px] text-muted-foreground">· tenho {saldo.get(p.codigo) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {linhas.map((l, i) => {
          const aviso = numero(l.quantidade) > 0 ? avisoDeEstoque(numero(l.quantidade), saldo.get(l.produto_codigo) ?? 0) : null;
          return (
            <div key={l.produto_codigo} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-[15px]">{l.produto_nome}</p>
                <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={`Tirar ${l.produto_nome}`}
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" aria-hidden="true" /></Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label htmlFor={`q-${i}`}>Quantidade</Label>
                  <Input id={`q-${i}`} inputMode="decimal" className="h-11 text-base" value={l.quantidade} onChange={(e) => muda(i, 'quantidade', e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor={`p-${i}`}>Preço (cada)</Label>
                  <Input id={`p-${i}`} inputMode="decimal" className="h-11 text-base" placeholder="opcional" value={l.valor_unitario} onChange={(e) => muda(i, 'valor_unitario', e.target.value)} /></div>
              </div>
              {aviso && (
                <p className="flex gap-1.5 text-[13px] text-status-warning" role="status">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" /> {aviso}
                </p>
              )}
            </div>
          );
        })}
        {linhas.length === 0 && <p className="text-[14px] text-muted-foreground">Procure e toque no produto para colocar na venda.</p>}
        {linhas.length > 0 && <p className="text-[13px] text-muted-foreground">O preço já vem com o último que você cobrou; troque se mudou.</p>}
      </Card>
      <Card className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="v-obs">Observação</Label>
          <Textarea id="v-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[15px]">Total <b className="tabular-nums">{formatBRL(total)}</b></p>
          <Button className="h-12 text-base" disabled={!salao || validas.length === 0 || salvando} onClick={salvar}>
            {vendaId ? 'Salvar correção' : 'Registrar venda'}
          </Button>
        </div>
      </Card>
    </>
  );
}

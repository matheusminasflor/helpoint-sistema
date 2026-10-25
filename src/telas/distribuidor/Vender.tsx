// Registrar a venda ao salão (etapa 6; decisão 2 do dono: "a venda ao salão ele registra no app"). O salão, os
// produtos e as quantidades; o estoque baixa sozinho e o salão vira cliente.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProdutosDoPortal, useRegistrarVenda, useSaloes, useEstoqueDoPortal } from '@/hooks/usePortalDoDistribuidor';
import { todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';

interface Linha { produto_codigo: string; produto_nome: string; quantidade: string; valor_unitario: string }
const numero = (s: string) => Number(s.replace(',', '.'));

export default function VenderAoSalao() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const saloes = useSaloes();
  const produtos = useProdutosDoPortal();
  const estoque = useEstoqueDoPortal();
  const registrar = useRegistrarVenda();
  const [salao, setSalao] = useState(search.get('salao') ?? '');
  const [data, setData] = useState(todayISO());
  const [busca, setBusca] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [observacao, setObservacao] = useState('');

  const saldo = useMemo(() => new Map((estoque.data ?? []).map((e) => [e.produto_codigo, Number(e.saldo)])), [estoque.data]);
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

  return (
    <>
      <h1 className="text-[24px] font-semibold">Registrar venda</h1>
      <Card className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="v-salao">Salão</Label>
          <select id="v-salao" className="h-11 w-full rounded-md border border-input bg-background px-3 text-base" value={salao}
            onChange={(e) => setSalao(e.target.value)}>
            <option value="">Escolha o salão</option>
            {(saloes.data ?? []).filter((s) => s.etapa !== 'perdido').map((s) => <option key={s.id} value={s.id}>{s.nome}{s.cidade ? ` · ${s.cidade}` : ''}</option>)}
          </select>
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
                <button type="button" className="w-full text-left px-3 py-2.5 min-h-11 text-[15px]"
                  onClick={() => { setLinhas((ls) => [...ls, { produto_codigo: p.codigo, produto_nome: p.nome, quantidade: '1', valor_unitario: '' }]); setBusca(''); }}>
                  {p.nome} <span className="text-[13px] text-muted-foreground">· tenho {saldo.get(p.codigo) ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {linhas.map((l, i) => (
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
          </div>
        ))}
        {linhas.length === 0 && <p className="text-[14px] text-muted-foreground">Procure e toque no produto para colocar na venda.</p>}
      </Card>
      <Card className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="v-obs">Observação</Label>
          <Textarea id="v-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[15px]">Total <b className="tabular-nums">{formatBRL(total)}</b></p>
          <Button className="h-12 text-base" disabled={!salao || validas.length === 0 || registrar.isPending}
            onClick={() => registrar.mutate({ salao_id: salao, data, observacao, itens: validas.map((l) => ({
              produto_codigo: l.produto_codigo, quantidade: numero(l.quantidade), valor_unitario: numero(l.valor_unitario) || 0 })) },
            { onSuccess: () => navigate(`/distribuidor/saloes/${salao}`) })}>
            Registrar venda
          </Button>
        </div>
      </Card>
    </>
  );
}

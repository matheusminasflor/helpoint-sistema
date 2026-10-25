// O estoque do distribuidor (etapa 6; `dist_estoque`): o que entrou pelas notas da Minasflor desde a liberação, o que
// ele vendeu aos salões e o ajuste "tenho X" do responsável. Decisão 2 do dono (2026-10-25).
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useNoPortal } from '@/hooks/useNoPortal';
import { useAjustarEstoque, useEstoqueDoPortal, useProdutosDoPortal, type LinhaDoEstoque } from '@/hooks/usePortalDoDistribuidor';
import { diaCurto } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';

export default function EstoqueDoDistribuidor() {
  const { papel } = useNoPortal();
  const estoque = useEstoqueDoPortal();
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const linhas = (estoque.data ?? []).filter((l) => !termo || l.produto_nome.toLowerCase().includes(termo));
  return (
    <>
      <h1 className="text-[24px] font-semibold">Estoque</h1>
      <p className="text-[14px] text-muted-foreground">O que você compra da Minasflor entra aqui quando a nota é emitida; a venda ao
        salão baixa. {papel === 'dono' ? 'Se a conta não bater com a prateleira, toque em "Tenho" e informe a quantidade.' : ''}</p>
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar produto" aria-label="Procurar produto" className="h-11 text-base" />
      {estoque.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(estoque.error)}</p>}
      <Card className="divide-y divide-border">
        {linhas.map((l) => <LinhaDoProduto key={l.produto_codigo} l={l} ajusta={papel === 'dono'} />)}
        {!estoque.isLoading && linhas.length === 0 && (
          <p className="px-4 py-6 text-[14px] text-muted-foreground">
            {estoque.data?.length ? 'Nenhum produto com esse nome.' : 'Ainda não entrou nenhuma nota desde a liberação do seu acesso.'}
          </p>
        )}
      </Card>
      {papel === 'dono' && termo.length >= 2 && <OutrosProdutos termo={termo} jaTem={new Set((estoque.data ?? []).map((l) => l.produto_codigo))} />}
    </>
  );
}

/** O que ele já tinha antes da liberação (sem nota desde então): procura no catálogo e informa "tenho". */
function OutrosProdutos({ termo, jaTem }: { termo: string; jaTem: Set<string> }) {
  const produtos = useProdutosDoPortal();
  const achados = (produtos.data ?? []).filter((p) => !jaTem.has(p.codigo) && p.nome.toLowerCase().includes(termo)).slice(0, 10);
  if (!achados.length) return null;
  return (
    <>
      <h2 className="text-[16px] font-semibold">Outros produtos da Minasflor</h2>
      <Card className="divide-y divide-border">
        {achados.map((p) => (
          <LinhaDoProduto key={p.codigo} ajusta l={{ produto_codigo: p.codigo, produto_nome: p.nome, entrou: 0, vendeu: 0, ajustou: 0,
            saldo: 0, ultima_entrada: null, vendeu_60_dias: 0 }} />
        ))}
      </Card>
    </>
  );
}

function LinhaDoProduto({ l, ajusta }: { l: LinhaDoEstoque; ajusta: boolean }) {
  const ajustar = useAjustarEstoque();
  const [tenho, setTenho] = useState<string | null>(null);
  const saldo = Number(l.saldo);
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] truncate">{l.produto_nome}</p>
          <p className="text-[13px] text-muted-foreground">
            {l.ultima_entrada ? `última nota ${diaCurto(l.ultima_entrada)} · ` : ''}vendeu {Number(l.vendeu_60_dias)} em 60 dias
          </p>
        </div>
        <span className={saldo <= 0 ? 'text-[16px] tabular-nums text-status-danger' : 'text-[16px] tabular-nums'}>{saldo}</span>
        {ajusta && tenho === null && <Button variant="outline" className="h-11" onClick={() => setTenho(String(Math.max(0, saldo)))}>Tenho</Button>}
      </div>
      {tenho !== null && (
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          ajustar.mutate({ produto: l.produto_codigo, tenho: Number(tenho.replace(',', '.')) }, { onSuccess: () => setTenho(null) });
        }}>
          <Input inputMode="decimal" className="h-11 text-base w-28" aria-label={`Quantos ${l.produto_nome} você tem`} value={tenho}
            onChange={(e) => setTenho(e.target.value)} />
          <Button type="submit" className="h-11" disabled={ajustar.isPending || !(Number(tenho.replace(',', '.')) >= 0) || tenho === ''}>Salvar</Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => setTenho(null)}>Voltar</Button>
        </form>
      )}
    </div>
  );
}

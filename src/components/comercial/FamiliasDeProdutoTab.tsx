// Comercial › Configurações › Famílias de produto (decisão do dono, 2026-10-03): o sistema sugere
// a família pelo nome do produto e o Comercial confirma ou corrige aqui. Produto que chegar numa
// importação nova aparece em "A confirmar", já com a sugestão.
//
// Os botões só aparecem para quem altera a aba no perfil de acesso — a mesma conta que o banco faz
// (`pode_alterar_aba('comercial', 'familias')`). Esconder aqui é conforto; quem barra é o banco.
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import {
  useDefinirFamilia, useFamilias, useProdutosComFamilia, useSalvarFamilia, type Familia,
} from '@/hooks/useComercialFamilias';

type Filtro = 'a_confirmar' | 'todos';

export function FamiliasDeProdutoTab() {
  const podeAlterar = useConfiguracaoDosSetores().alteraAba('comercial', 'familias');
  const { data: familias = [] } = useFamilias();
  const produtos = useProdutosComFamilia();
  const definir = useDefinirFamilia();

  const [filtro, setFiltro] = useState<Filtro>('a_confirmar');
  const [busca, setBusca] = useState('');

  const nomeDaFamilia = useMemo(() => new Map(familias.map((f) => [f.id, f.nome])), [familias]);
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (produtos.data?.linhas ?? []).filter((p) =>
      (filtro === 'todos' || !p.familia_confirmada)
      && (!termo || p.nome.toLowerCase().includes(termo) || p.codigo.toLowerCase().includes(termo)));
  }, [produtos.data, filtro, busca]);
  // "Confirmar sugestões" confirma o que está NA TELA e tem família — sem família não há o que confirmar.
  const sugestoes = lista.filter((p) => !p.familia_confirmada && p.familia_id);
  const aConfirmar = (produtos.data?.linhas ?? []).filter((p) => !p.familia_confirmada).length;

  return (
    <div className="space-y-4">
      <ListaDeFamilias familias={familias} podeAlterar={podeAlterar} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Produtos e suas famílias</CardTitle>
          <CardDescription>
            A família vem sugerida pelo nome do produto ("6.0 LOURO ESCURO" é coloração, "AGUA OXIGENADA … 20 VOLUMES"
            é OX 20 vol). Confira e confirme; corrija quando a sugestão errar. {aConfirmar} produto(s) a confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="a_confirmar">A confirmar</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Input className="w-64" placeholder="Buscar por nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
            {podeAlterar && sugestoes.length > 0 && (
              <Button size="sm" onClick={() => definir.mutate({ ids: sugestoes.map((p) => p.id) })} disabled={definir.isPending}>
                Confirmar sugestões ({sugestoes.length})
              </Button>
            )}
          </div>

          {produtos.isError && <p className="text-[13px] text-destructive">Não consegui carregar os produtos.</p>}
          {produtos.data?.cortou && (
            <p className="text-[13px] text-muted-foreground">Mostrando os primeiros {produtos.data.linhas.length} produtos — use a busca.</p>
          )}

          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Código</th>
                  <th className="px-3 py-1.5 font-semibold">Produto</th>
                  <th className="px-3 py-1.5 font-semibold">Família</th>
                  <th className="px-3 py-1.5 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{p.codigo}</td>
                    <td className="px-3 py-1.5">{p.nome}</td>
                    <td className="px-3 py-1.5">
                      {podeAlterar ? (
                        <Select
                          value={p.familia_id ?? undefined}
                          onValueChange={(v) => definir.mutate({ ids: [p.id], familiaId: v })}
                        >
                          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Sem família" /></SelectTrigger>
                          <SelectContent>
                            {familias.filter((f) => f.ativo || f.id === p.familia_id).map((f) => (
                              <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        (p.familia_id && nomeDaFamilia.get(p.familia_id)) || 'Sem família'
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.familia_confirmada ? (
                        <span className="text-muted-foreground">Confirmada</span>
                      ) : podeAlterar && p.familia_id ? (
                        <Button size="sm" variant="ghost" onClick={() => definir.mutate({ ids: [p.id] })} disabled={definir.isPending}>
                          Confirmar sugestão
                        </Button>
                      ) : (
                        <span className="badge-warning rounded px-1.5 py-0.5">A confirmar</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!produtos.isLoading && lista.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    {filtro === 'a_confirmar' ? 'Nenhum produto a confirmar.' : 'Nenhum produto encontrado.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {!podeAlterar && (
            <p className="text-xs text-muted-foreground">
              Mudar a família exige "Configurações › Famílias de produto: Alterar" no perfil de acesso do Comercial.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** As famílias: criar, renomear e desativar (desativar não apaga — o produto não perde a família). */
function ListaDeFamilias({ familias, podeAlterar }: { familias: Familia[]; podeAlterar: boolean }) {
  const salvar = useSalvarFamilia();
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const proximaOrdem = familias.reduce((m, f) => Math.max(m, f.ordem), 0) + 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Famílias</CardTitle>
        <CardDescription>
          A lista que veio pronta é um ponto de partida: renomeie, crie e desative à vontade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {familias.map((f) => (
            <div key={f.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] ${f.ativo ? '' : 'opacity-60'}`}>
              {editando?.id === f.id ? (
                <>
                  <Input
                    className="h-7 w-40"
                    value={editando.nome}
                    onChange={(e) => setEditando({ id: f.id, nome: e.target.value })}
                  />
                  <Button size="sm" variant="ghost" disabled={salvar.isPending || !editando.nome.trim()}
                    onClick={() => salvar.mutate({ id: f.id, nome: editando.nome }, { onSuccess: () => setEditando(null) })}>
                    Salvar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
                </>
              ) : (
                <>
                  <span>{f.nome}{f.ativo ? '' : ' (desativada)'}</span>
                  {podeAlterar && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditando({ id: f.id, nome: f.nome })}>Renomear</Button>
                      <Button size="sm" variant="ghost" disabled={salvar.isPending}
                        onClick={() => salvar.mutate({ id: f.id, ativo: !f.ativo })}>
                        {f.ativo ? 'Desativar' : 'Reativar'}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        {podeAlterar && (
          <div className="flex items-center gap-2">
            <Input className="w-56" placeholder="Nova família" value={nova} onChange={(e) => setNova(e.target.value)} />
            <Button size="sm" disabled={salvar.isPending || !nova.trim()}
              onClick={() => salvar.mutate({ nome: nova, ordem: proximaOrdem }, { onSuccess: () => setNova('') })}>
              Adicionar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

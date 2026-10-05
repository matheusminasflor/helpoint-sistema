import { useMemo, useState } from 'react';
import { Plus, Tags, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { SupplierTable } from '@/components/mkt/SupplierTable';
import { SupplierForm } from '@/components/mkt/SupplierForm';
import { GerenciarGrupos } from '@/components/mkt/GruposDeFornecedor';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useGruposDeFornecedor, useGruposPorFornecedor } from '@/hooks/useGruposDeFornecedor';
import { useQueryState } from '@/hooks/useQueryState';
import type { Supplier } from '@/types/suppliers';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';

const TODOS = 'todos';
const SEM_GRUPO = 'sem-grupo';

export default function Fornecedores() {
  // A mesma tela abre pelo Marketing e por Compras: vale a caixinha de qualquer um dos dois,
  // como a policy de `suppliers` (20261124010000).
  const { can: noMkt } = useDepartmentPermissions('marketing');
  const { can: emCompras } = useDepartmentPermissions('compras');
  const pode = (acao: string) => noMkt('suppliers', acao) || emCompras('fornecedores', acao);
  // Grupos: quem cria OU edita fornecedor (`pode_editar_fornecedores`, 20261203100000).
  const podeGrupos = pode('create') || pode('edit');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [gerindoGrupos, setGerindoGrupos] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { data: suppliers = [], isLoading } = useSuppliers();
  const { data: grupos = [] } = useGruposDeFornecedor();
  const gruposPorFornecedor = useGruposPorFornecedor();
  // Decisão do dono (2026-10-04): ver "quem são os fornecedores de quê" — a lista agrupada.
  const [visao, setVisao] = useQueryState<'grupos' | 'lista'>('visao', 'grupos');
  const [filtro, setFiltro] = useQueryState<string>('grupo', TODOS);

  const doGrupo = (id: string) => (s: Supplier) =>
    id === SEM_GRUPO ? !gruposPorFornecedor.get(s.id)?.length : !!gruposPorFornecedor.get(s.id)?.some(g => g.id === id);

  const filtrados = useMemo(
    () => (filtro === TODOS ? suppliers : suppliers.filter(doGrupo(filtro))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `doGrupo` lê o mapa listado
    [suppliers, filtro, gruposPorFornecedor],
  );

  // Um fornecedor aparece em cada grupo seu; os sem grupo ficam numa seção própria no fim.
  const secoes = useMemo(() => {
    const comGrupo = grupos
      .filter(g => filtro === TODOS || filtro === g.id)
      .map(g => ({ id: g.id, nome: g.nome, lista: filtrados.filter(doGrupo(g.id)) }))
      .filter(s => s.lista.length > 0);
    const sem = filtro === TODOS || filtro === SEM_GRUPO ? filtrados.filter(doGrupo(SEM_GRUPO)) : [];
    return sem.length > 0 ? [...comGrupo, { id: SEM_GRUPO, nome: 'Sem grupo', lista: sem }] : comGrupo;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `doGrupo` lê o mapa listado
  }, [grupos, filtrados, filtro, gruposPorFornecedor]);

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingSupplier(null);
  };

  const tabela = (lista: Supplier[]) => (
    <SupplierTable
      suppliers={lista}
      isLoading={isLoading}
      onEdit={handleEdit}
      podeEditar={pode('edit')}
      podeExcluir={pode('delete')}
    />
  );

  return (
    <div className="space-y-6">
      <WorkOSPageHeader
        icon={Truck}
        title="Fornecedores"
        description="Um cadastro só, da empresa: o Marketing usa nas cotações e as Compras nos orçamentos"
        action={(podeGrupos || pode('create')) ? (
          <div className="flex gap-2">
            {podeGrupos && (
              <Button variant="outline" onClick={() => setGerindoGrupos(true)}>
                <Tags className="w-4 h-4 mr-2" />
                Grupos
              </Button>
            )}
            {pode('create') && (
              <Button onClick={() => setIsFormOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Fornecedor
              </Button>
            )}
          </div>
        ) : undefined}
      />

      <div className="px-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={visao} onValueChange={v => setVisao(v as 'grupos' | 'lista')}>
            <TabsList>
              <TabsTrigger value="grupos">Por grupo</TabsTrigger>
              <TabsTrigger value="lista">Lista</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger className="w-56" aria-label="Filtrar por grupo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os grupos</SelectItem>
              {grupos.map(g => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
              <SelectItem value={SEM_GRUPO}>Sem grupo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {visao === 'lista' || isLoading || secoes.length === 0 ? (
          tabela(filtrados)
        ) : (
          secoes.map(s => (
            <section key={s.id} className="space-y-2">
              <h2 className="text-sm font-semibold">
                {s.nome} <span className="text-muted-foreground font-normal">· {s.lista.length}</span>
              </h2>
              {tabela(s.lista)}
            </section>
          ))
        )}
      </div>

      <SupplierForm
        open={isFormOpen}
        onClose={handleClose}
        supplier={editingSupplier}
      />
      <GerenciarGrupos open={gerindoGrupos} onOpenChange={setGerindoGrupos} />
    </div>
  );
}

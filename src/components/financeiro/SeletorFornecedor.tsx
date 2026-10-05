import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Check } from 'lucide-react';
import { useActiveSuppliers, useCreateSupplier } from '@/hooks/useSuppliers';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useGruposPorFornecedor } from '@/hooks/useGruposDeFornecedor';

/**
 * Escolhe o fornecedor do orçamento no cadastro da empresa — ou digita um nome
 * que não está lá.
 *
 * Por que aceitar nome digitado: uma compra não pode ficar presa num cadastro.
 * Por que o cadastro existe: sem ele, "Gráfica Silva" e "GRAFICA SILVA LTDA"
 * são dois fornecedores e ninguém consegue perguntar quanto se comprou de cada
 * um. Quando o orçamento aponta para o cadastro, é do cadastro que sai o nome
 * na conta a pagar (`fin_compra_vira_conta_a_pagar`); quando não aponta, sai o
 * texto — e a tela diz qual dos dois é.
 *
 * Desenho copiado do seletor de produto que já existe neste formulário: campo
 * de texto + lista de botões. Não é combobox de biblioteca nenhuma de
 * propósito — o padrão da tela já estava escolhido.
 */

interface Props {
  nome: string;
  fornecedorId: string | null;
  onChange: (patch: { supplier: string; supplierId: string | null }) => void;
  placeholder?: string;
}

export function SeletorFornecedor({ nome, fornecedorId, onChange, placeholder }: Props) {
  const { data: fornecedores = [] } = useActiveSuppliers();
  const criar = useCreateSupplier();
  const [aberto, setAberto] = useState(false);
  // Cadastrar fornecedor é a caixinha "Fornecedores" do Marketing ou de Compras (policy de
  // `suppliers`, 20261125010000). Quem só pede compra digita o nome — o orçamento aceita texto.
  const { can: noMkt } = useDepartmentPermissions('marketing');
  const { can: emCompras } = useDepartmentPermissions('compras');
  const podeCadastrar = noMkt('suppliers', 'create') || emCompras('fornecedores', 'create');

  // O grupo aparece ao lado do nome, e buscar "gráfica" acha os fornecedores do grupo (2026-10-04).
  const gruposPorFornecedor = useGruposPorFornecedor();
  const gruposDe = (id: string) => (gruposPorFornecedor.get(id) ?? []).map(g => g.nome).join(', ');

  const busca = nome.trim().toLowerCase();
  const achados = busca
    ? fornecedores.filter(f => f.name.toLowerCase().includes(busca) || gruposDe(f.id).toLowerCase().includes(busca)).slice(0, 8)
    : fornecedores.slice(0, 8);
  const jaExiste = fornecedores.some(f => f.name.trim().toLowerCase() === busca);

  const escolher = (id: string, nomeDoCadastro: string) => {
    onChange({ supplier: nomeDoCadastro, supplierId: id });
    setAberto(false);
  };

  const cadastrar = async () => {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const novo = await criar.mutateAsync({ name: limpo });
      escolher(novo.id, novo.name);
    } catch {
      // o toast de erro já sai do hook — inclusive o de nome repetido
    }
  };

  return (
    <div className="space-y-1">
      <Input
        value={nome}
        onChange={(e) => {
          // Mexer no texto desfaz a ligação com o cadastro: o nome passa a ser
          // o que está escrito, e não o do fornecedor escolhido antes.
          onChange({ supplier: e.target.value, supplierId: null });
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => window.setTimeout(() => setAberto(false), 150)}
        placeholder={placeholder}
      />

      {fornecedorId && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="w-3 h-3 text-primary" aria-hidden="true" /> do cadastro de fornecedores
        </p>
      )}

      {aberto && (achados.length > 0 || (podeCadastrar && !!busca && !jaExiste)) && (
        <div className="rounded-lg border border-border divide-y divide-border bg-background">
          {achados.map(f => (
            <button
              key={f.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => escolher(f.id, f.name)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60"
            >
              {f.name}
              {gruposDe(f.id) && <span className="ml-2 text-xs text-muted-foreground">{gruposDe(f.id)}</span>}
            </button>
          ))}
          {podeCadastrar && !!busca && !jaExiste && (
            <div className="px-3 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cadastrar}
                disabled={criar.isPending}
              >
                <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                Cadastrar "{nome.trim()}"
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

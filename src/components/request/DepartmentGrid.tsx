import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Monitor, Megaphone, CheckSquare, Users, Banknote, Handshake, GraduationCap, ShoppingCart, PackageCheck, Factory,
  ArrowRight, History,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { MODULO_DO_SETOR, sugerirSetores, type CategoriaDoPedido, type SetorDoPedido } from '@/lib/sugerir-setor';
import { Link } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';
import { TIPOS, categoriaVirouPedido } from '@/config/solicitacoes';
import { useMeuRHLigado } from '@/hooks/useMeuRHLigado';
import { corDoSetor } from '@/lib/setores';

// Decisão 3 do dono (2026-10-24): o card RH sai da grade e o pedido ao RH é só pelo Meu RH — quando o Meu RH ligar
// (o interruptor das Configurações do RH, 20270205010000). Até lá o RH continua recebendo chamado, como hoje.

interface Department {
  id: SetorDoPedido;
  name: string;
  icon: React.ReactNode;
  description: string;
}

const icone = (I: typeof Monitor) => <I strokeWidth={1.5} className="w-6 h-6" aria-hidden="true" />;

// A grade sem a numeração "01…10", o ponto verde e a legenda "Ativo/Em breve" (todos estão ativos): etapa 4 · Chamados,
// 2026-10-24. O RH continua aqui até o Meu RH ser ligado (decisão da 4b, 2026-10-25: liga depois do cadastro do RH).
const departments: Department[] = [
  { id: 'ti', name: 'TI', icon: icone(Monitor), description: 'Computador, sistema, acesso, internet' },
  { id: 'marketing', name: 'Marketing', icon: icone(Megaphone), description: 'Arte, eventos e redes sociais' },
  { id: 'qualidade', name: 'Qualidade', icon: icone(CheckSquare), description: 'SAC e controle de qualidade' },
  { id: 'rh', name: 'RH', icon: icone(Users), description: 'Pessoas, férias, benefícios e folha' },
  { id: 'financeiro', name: 'Financeiro', icon: icone(Banknote), description: 'Nota fiscal, boleto, pagamento a fornecedor, cobrança' },
  // Compras é setor próprio desde a leva N; o pedido de compra nasce aqui, onde todo mundo pede (dono, 2026-09-28).
  { id: 'compras', name: 'Compras', icon: icone(ShoppingCart), description: 'Pedir a compra de um produto ou serviço' },
  { id: 'comercial', name: 'Comercial', icon: icone(Handshake), description: 'Orçamentos, pedidos e pós-venda' },
  { id: 'educacional', name: 'Educacional', icon: icone(GraduationCap), description: 'Treinamentos e certificados' },
  { id: 'expedicao', name: 'Expedição', icon: icone(PackageCheck), description: 'Envio, rastreio, entrega e avarias' },
  { id: 'producao', name: 'Produção', icon: icone(Factory), description: 'Ordens de produção, matéria-prima e lotes' },
];
const NOME = Object.fromEntries(departments.map((d) => [d.id, d.name])) as Record<SetorDoPedido, string>;
const SETOR_DO_MODULO = Object.fromEntries(Object.entries(MODULO_DO_SETOR).map(([s, m]) => [m, s])) as Record<string, SetorDoPedido>;

interface DepartmentGridProps {
  /** O setor escolhido; com a categoria quando a sugestão a achou, e o texto que a pessoa já escreveu. */
  onSelectDepartment: (departmentId: SetorDoPedido, extra?: { categoriaId?: string; texto?: string }) => void;
}

export function DepartmentGrid({ onSelectDepartment }: DepartmentGridProps) {
  const { data: meuRHLigado = false } = useMeuRHLigado();
  const { user, tenantId } = useAuth();
  const [texto, setTexto] = useState('');

  // As categorias ativas de todos os setores, para achar a do pedido pelo nome.
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-para-sugerir', tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => ((unwrap(await supabase.from('ti_categories').select('id, name, module').eq('is_active', true))) ?? [])
      .map((c) => ({ id: c.id, nome: c.name, modulo: c.module ?? 'tickets' })) as CategoriaDoPedido[],
  });
  // Os setores dos meus últimos pedidos (os três mais recentes, sem repetir).
  const { data: ultimos = [] } = useQuery({
    queryKey: ['meus-ultimos-setores', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => {
      // Sem Compras: o chamado da compra é o de baixo do pedido, e escolher "Compras" aqui caía no formulário antigo.
      const linhas = unwrap(await supabase.from('tickets').select('module').eq('requester_id', user!.id).neq('module', 'compras')
        .order('created_at', { ascending: false }).limit(30)) ?? [];
      return [...new Set(linhas.map((l) => SETOR_DO_MODULO[l.module ?? 'tickets']).filter(Boolean))].slice(0, 3) as SetorDoPedido[];
    },
  });

  const sugestoes = useMemo(() => sugerirSetores(texto, categorias), [texto, categorias]);
  // A categoria que virou pedido (2026-10-25) leva ao pedido, não ao chamado.
  const tenantPath = useTenantPath();
  const pedidoDa = (c: CategoriaDoPedido | null) => (c ? categoriaVirouPedido(c.modulo, c.nome) : null);
  const escolher = (id: SetorDoPedido, categoriaId?: string) =>
    onSelectDepartment(id, { categoriaId, texto: texto.trim() || undefined });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Novo chamado</h1>
      <p className="text-sm text-muted-foreground mb-4">O que aconteceu? Escreva com as suas palavras; a gente sugere o setor. Ou escolha abaixo.</p>
      <Input
        // Só com mouse: no celular o teclado subia sozinho e cobria os setores (rodada 3, correção 6).
        autoFocus={typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ex.: a impressora do Comercial não imprime"
        aria-label="O que você precisa"
        className="h-11 text-[16px]"
      />
      {sugestoes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
          {sugestoes.map((s) => {
            const pedido = s.setor === 'compras' ? 'compra' : pedidoDa(s.categoria);
            return pedido === 'compra' ? (
              <Link key={s.setor} to={tenantPath('/solicitacoes?novo=compra')}
                className="inline-flex items-center gap-2 min-h-11 px-3 rounded-md border border-foreground bg-card text-[14px] font-medium hover:bg-secondary">
                Pedir compra<span className="text-muted-foreground font-normal">· é pedido, com etapas</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            ) : pedido ? (
              <Link key={s.setor} to={tenantPath(`/solicitacoes?novo=${pedido}`)}
                className="inline-flex items-center gap-2 min-h-11 px-3 rounded-md border border-foreground bg-card text-[14px] font-medium hover:bg-secondary">
                {TIPOS[pedido].rotulo}<span className="text-muted-foreground font-normal">· é pedido, com etapas</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            ) : (
              <button key={s.setor} type="button" onClick={() => escolher(s.setor, s.categoria?.id)}
                className="inline-flex items-center gap-2 min-h-11 px-3 rounded-md border border-foreground bg-card text-[14px] font-medium hover:bg-secondary">
                {NOME[s.setor]}{s.categoria && <span className="text-muted-foreground font-normal">› {s.categoria.nome}</span>}
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {ultimos.length > 0 && (
        <div className="mt-6">
          <p className="text-[13px] text-muted-foreground flex items-center gap-1.5 mb-2">
            <History className="w-3.5 h-3.5" aria-hidden="true" /> Seus últimos setores
          </p>
          <div className="flex flex-wrap gap-2">
            {ultimos.map((s) => (
              <button key={s} type="button" onClick={() => escolher(s)}
                className="min-h-11 px-3 rounded-md border border-border bg-card text-[14px] hover:bg-secondary">{NOME[s]}</button>
            ))}
          </div>
        </div>
      )}

      {/* Os pedidos (compra, arte, acesso, reembolso, adiantamento) moram na outra porta do "Novo" (rodada 2,
          decisão 1); aqui só o setor do chamado. A sugestão acima ainda leva ao pedido quem escreveu um. */}
      <p className="text-[13px] text-muted-foreground mt-8 mb-2">Todos os setores</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {departments.filter((dept) => dept.id !== 'compras').map((dept) => dept.id === 'rh' && meuRHLigado ? (
          <Link key={dept.id} to={tenantPath('/meu-rh')}
            className="group p-4 rounded-lg border border-border bg-card text-left flex items-center gap-3 hover:border-foreground transition-colors">
            <span className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-[9px] ${corDoSetor(dept.id)}`}>{dept.icon}</span>
            <span className="min-w-0">
              <span className="text-sm font-semibold block text-foreground">{dept.name}</span>
              <span className="text-xs text-muted-foreground block">Férias, atestado, benefício, documento: pelo Meu RH</span>
            </span>
          </Link>
        ) : (
          <button
            key={dept.id}
            type="button"
            onClick={() => escolher(dept.id)}
            className="group p-4 rounded-lg border border-border bg-card text-left flex items-center gap-3 hover:border-foreground transition-colors"
          >
            <span className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-[9px] ${corDoSetor(dept.id)}`}>{dept.icon}</span>
            <span className="min-w-0">
              <span className="text-sm font-semibold block text-foreground">{dept.name}</span>
              <span className="text-xs text-muted-foreground block">{dept.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

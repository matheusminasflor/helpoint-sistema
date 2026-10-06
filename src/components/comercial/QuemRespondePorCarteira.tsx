// "Quem responde por cada carteira" — as pessoas de cada carteira e quem assina as notas.
//
// Morava dentro de `DiretoriaMetas.tsx`. Saiu para cá em 2026-09-28 (LEVA O) porque o
// Comercial passou a precisar do mesmo quadro: ser membro de uma carteira é o que faz alguém
// ser vendedora e ganhar os indicadores sozinha. Duas cópias do mesmo quadro divergiriam na
// primeira mudança.
//
// E ganhou o que faltava: CRIAR CARTEIRA. Carteira não tem tabela própria — ela existe quando
// alguém a usa (`com_carteiras_conhecidas()` junta metas, realizado e membros). Com as tabelas
// vazias, não havia carteira nenhuma para escolher, e portanto nenhum jeito de montar a
// primeira. Criar é pôr a primeira pessoa numa carteira de nome novo.
//
// Sem carteira = serve a lista `carteiras` como vier; o nome é normalizado no banco
// (maiúsculas, sem acento, sem espaço nas pontas), então "Norte" e "NORTE" são a mesma.
import { useMemo, useState } from 'react';
import { Pencil, Plus, Users, X } from 'lucide-react';
import { DialogoRenomearCarteira } from '@/components/comercial/DialogoRenomearCarteira';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useAdicionarMembroCarteira, useCarteiraMembros, useMarcarResponsavelCarteira,
  usePessoasElegiveisParaCarteira, useRemoverMembroCarteira, useRenomearCarteira,
} from '@/hooks/useComercialCarteirasMetas';

/**
 * Uma pessoa pode estar em uma, duas ou mais carteiras (2026-10-01, pedido do dono; o `unique`
 * do banco agora é por pessoa E carteira). O seletor de cada carteira só esconde quem já está nela.
 * Quem está aqui recebe o aviso pelo sino quando a meta da carteira é definida, e — desde a
 * LEVA O — ganha os indicadores do Painel do Gestor.
 */
export function QuemRespondePorCarteira({ carteiras, permiteCriar = false }: { carteiras: string[]; permiteCriar?: boolean }) {
  const { data: membros = [], isLoading } = useCarteiraMembros();
  const { data: pessoas = [] } = usePessoasElegiveisParaCarteira();
  const adicionar = useAdicionarMembroCarteira();
  const remover = useRemoverMembroCarteira();
  const marcarResponsavel = useMarcarResponsavelCarteira();
  const [pessoaEscolhida, setPessoaEscolhida] = useState<Record<string, string>>({});
  const [novaCarteira, setNovaCarteira] = useState('');
  const [pessoaDaNova, setPessoaDaNova] = useState('');
  // Renomear aqui também (2026-10-01, o dono procurou aqui e não achou — só existia em Diretoria ›
  // Metas). A mesma RPC e a mesma trava: quem define metas (`com_renomear_carteira`).
  const renomear = useRenomearCarteira();
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const podeRenomear = useDepartmentPermissions('comercial').canComoOBanco('metas', 'definir');

  // As carteiras que já têm gente entram mesmo se a lista de fora não as trouxer — é o caso
  // de uma carteira acabada de criar, antes de a lista recarregar.
  const todas = useMemo(
    () => [...new Set([...carteiras, ...membros.map((m) => m.carteira)])].sort(),
    [carteiras, membros],
  );

  const criar = () => {
    const nome = novaCarteira.trim();
    if (!nome || !pessoaDaNova) return;
    adicionar.mutate({ carteira: nome, userId: pessoaDaNova }, {
      onSuccess: () => { setNovaCarteira(''); setPessoaDaNova(''); },
    });
  };

  return (
    <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
      <p className="text-[13px] font-medium text-foreground flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5" aria-hidden="true" /> Quem responde por cada carteira
      </p>
      <p className="text-[12px] text-muted-foreground">
        Quem está aqui é <strong>vendedora</strong>: ganha os indicadores no Painel do Gestor e lança para os clientes
        desta carteira. Recebe também o aviso na tela inicial quando a meta da carteira é definida. Uma pessoa pode estar em
        mais de uma carteira. <strong>Quem "assina as notas"</strong> é quem aparece como vendedor dos clientes desta carteira
        quando o Forteplus não manda um vendedor de verdade — uma pessoa por carteira.
      </p>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {todas.map((nome) => {
            const daCarteira = membros.filter((m) => m.carteira === nome);
            return (
              <div key={nome} className="rounded-md border border-border p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-medium">{nome}</p>
                  {podeRenomear && (
                    <button type="button" onClick={() => setRenomeando(nome)}
                      className="text-[12px] text-muted-foreground underline hover:text-foreground flex items-center gap-1">
                      <Pencil className="w-3 h-3" aria-hidden="true" /> Renomear
                    </button>
                  )}
                </div>
                {daCarteira.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Ninguém responde por esta carteira ainda.</p>
                ) : (
                  <ul className="space-y-1">
                    {daCarteira.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{m.nome}</span>
                          {/* A carteira pode ter várias pessoas — todas recebem o aviso da meta —,
                              mas só uma responde pelas notas que o Forteplus assinou como
                              "FINANCEIRO APROVADO". Um índice único no banco garante que seja uma. */}
                          {m.responsavel ? (
                            <Badge className="text-[12px] badge-success shrink-0">assina as notas</Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => marcarResponsavel.mutate({ membroId: m.id, carteira: nome })}
                              disabled={marcarResponsavel.isPending}
                              className="text-[12px] text-muted-foreground underline hover:text-foreground shrink-0"
                            >
                              assinar as notas
                            </button>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => remover.mutate(m.id)}
                          aria-label={`Tirar ${m.nome} da carteira ${nome}`}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-1.5">
                  <Select
                    value={pessoaEscolhida[nome] ?? ''}
                    onValueChange={(v) => setPessoaEscolhida((s) => ({ ...s, [nome]: v }))}
                  >
                    <SelectTrigger className="h-7 text-[12px] flex-1"><SelectValue placeholder="Acrescentar pessoa…" /></SelectTrigger>
                    <SelectContent>
                      {pessoas.filter((p) => !daCarteira.some((m) => m.user_id === p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 text-[12px] px-2"
                    disabled={!pessoaEscolhida[nome] || adicionar.isPending}
                    onClick={() => {
                      const userId = pessoaEscolhida[nome];
                      if (!userId) return;
                      adicionar.mutate({ carteira: nome, userId }, {
                        onSuccess: () => setPessoaEscolhida((s) => ({ ...s, [nome]: '' })),
                      });
                    }}
                  >
                    Adicionar
                  </Button>
                </div>
              </div>
            );
          })}

          {permiteCriar && (
            <div className="rounded-md border border-dashed border-border p-2.5 space-y-2">
              <p className="text-[13px] font-medium flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Nova carteira
              </p>
              <p className="text-[12px] text-muted-foreground">A carteira nasce com a primeira pessoa que responde por ela.</p>
              <Input className="h-7 text-[13px]" placeholder="Nome (ex.: MG, VIP, Outros Estados)" value={novaCarteira}
                onChange={(e) => setNovaCarteira(e.target.value)} />
              <div className="flex items-center gap-1.5">
                <Select value={pessoaDaNova} onValueChange={setPessoaDaNova}>
                  <SelectTrigger className="h-7 text-[12px] flex-1"><SelectValue placeholder="Quem responde por ela…" /></SelectTrigger>
                  <SelectContent>
                    {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-7 text-[12px] px-2" disabled={!novaCarteira.trim() || !pessoaDaNova || adicionar.isPending}
                  onClick={criar}>
                  Criar
                </Button>
              </div>
              {pessoas.length === 0 && (
                <p className="text-[12px] text-muted-foreground">
                  Ninguém tem o módulo Comercial ainda. Conceda o módulo a quem vai vender.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <DialogoRenomearCarteira
        nomeAtual={renomeando}
        pendente={renomear.isPending}
        onOpenChange={(v) => { if (!v) setRenomeando(null); }}
        onConfirmar={(novoNome, lembrar) => {
          if (!renomeando) return;
          renomear.mutate({ de: renomeando, para: novoNome, lembrar }, { onSuccess: () => setRenomeando(null) });
        }}
      />
    </div>
  );
}

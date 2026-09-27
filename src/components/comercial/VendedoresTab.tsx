import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Link2, Unlink } from 'lucide-react';
import {
  useCodigosDeVendedor, useVendedores, useLigarVendedor, useDesligarVendedor,
} from '@/hooks/useComercialVendedores';
import { usePessoasElegiveisParaCarteira } from '@/hooks/useComercialCarteirasMetas';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarComercial } from '@/lib/acesso-comercial';
import { formatBRL, formatDateBR } from '@/types/financeiro';

/**
 * "Quais códigos do Forteplus são vendedor de verdade" (2026-09-26).
 *
 * POR QUE ESTA TELA EXISTE, com o número medido: o código 1638 é "FINANCEIRO
 * APROVADO" e assina **R$ 5.017.738,47** de 168 clientes; o 1637 é "FINANCEIRO
 * CONFERENCIA", com R$ 770.936,66. Juntos, **56% do faturamento do histórico** em
 * etapas do processo financeiro. Qualquer conta por vendedor — comissão, ranking,
 * meta — pagaria mais da metade a ninguém.
 *
 * O dono decidiu ligar quem É gente, em vez de listar quem não é: assim o
 * Forteplus pode criar "FINANCEIRO LIBERADO" amanhã e nada precisa mudar aqui —
 * o código novo simplesmente nasce desligado, e a ficha do cliente passa a
 * apontar para a carteira.
 *
 * A pessoa do sistema (`user_id`) é OPCIONAL, e de propósito: há 23 códigos no
 * histórico e cinco contas no Helpoint. Exigir login deixaria a tabela vazia, que
 * é o mesmo que não existir.
 */
export function VendedoresTab() {
  const { data: codigos = [], isLoading } = useCodigosDeVendedor();
  const { data: ligados = [] } = useVendedores();
  const ligar = useLigarVendedor();
  const desligar = useDesligarVendedor();
  const { data: pessoas = [] } = usePessoasElegiveisParaCarteira();
  const { showComercial, isManagerOrHigher } = useVisibleModules();
  const podeMexer = podeAcessarComercial(showComercial, isManagerOrHigher);

  const [rascunho, setRascunho] = useState<Record<string, { nome: string; userId: string }>>({});

  const porCodigo = new Map(ligados.map((v) => [v.codigo, v]));
  const quantosLigados = codigos.filter((c) => c.ligado).length;
  const valorSolto = codigos.filter((c) => !c.ligado).reduce((s, c) => s + Number(c.valor), 0);

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Quais códigos são vendedor</h3>
        <p className="text-xs text-muted-foreground mt-1">
          O Forteplus assina cada nota com um código. Alguns são pessoas; outros são etapas do processo
          ("FINANCEIRO APROVADO"). Ligue os que são gente — o que ficar de fora não conta como vendedor, e a
          ficha do cliente passa a mostrar o responsável da carteira dele.
        </p>
      </div>

      {!isLoading && (
        <p className="text-[13px]">
          {quantosLigados} de {codigos.length} códigos ligados.
          {valorSolto > 0 && (
            <span className="text-muted-foreground">
              {' '}Ainda sem pessoa: <strong className="font-mono">{formatBRL(valorSolto)}</strong> em notas.
            </span>
          )}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-2">
          {codigos.map((c) => {
            const jaLigado = porCodigo.get(c.vendedor_codigo);
            const draft = rascunho[c.vendedor_codigo] ?? { nome: c.vendedor_nome, userId: '' };
            return (
              <div
                key={c.vendedor_codigo}
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-start"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm truncate">
                    <span className="text-muted-foreground font-mono text-xs">{c.vendedor_codigo}</span>{' '}
                    {c.vendedor_nome}
                    {jaLigado ? (
                      <Badge className="ml-1.5 text-[10px] align-middle badge-success">
                        <Check className="w-3 h-3 mr-0.5" aria-hidden="true" /> {jaLigado.nome}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="ml-1.5 text-[10px] align-middle">não é vendedor</Badge>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{formatBRL(Number(c.valor))}</span> · {c.clientes}{' '}
                    {c.clientes === 1 ? 'cliente' : 'clientes'}
                    {c.ultima_venda && ` · última nota em ${formatDateBR(c.ultima_venda)}`}
                  </p>
                </div>

                {podeMexer && (jaLigado ? (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => desligar.mutate(jaLigado.id)}
                    disabled={desligar.isPending}
                  >
                    <Unlink className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Desligar
                  </Button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={draft.nome}
                      onChange={(e) => setRascunho((p) => ({
                        ...p, [c.vendedor_codigo]: { ...draft, nome: e.target.value },
                      }))}
                      placeholder="Nome da pessoa"
                      className="h-8 w-[180px] text-[13px]"
                    />
                    <Select
                      value={draft.userId || 'nenhum'}
                      onValueChange={(v) => setRascunho((p) => ({
                        ...p, [c.vendedor_codigo]: { ...draft, userId: v === 'nenhum' ? '' : v },
                      }))}
                    >
                      <SelectTrigger className="h-8 w-[200px] text-[13px]">
                        <SelectValue placeholder="Sem login no sistema" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nenhum">— Sem login no sistema —</SelectItem>
                        {pessoas.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => ligar.mutate({
                        codigo: c.vendedor_codigo, nome: draft.nome, userId: draft.userId || null,
                      })}
                      disabled={!draft.nome.trim() || ligar.isPending}
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Ligar
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
          {codigos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma nota importada ainda — os códigos aparecem aqui depois da primeira carga de vendas.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

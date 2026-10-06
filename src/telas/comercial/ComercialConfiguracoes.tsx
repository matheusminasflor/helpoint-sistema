// Configurações do Comercial — a aba Chamados do molde de todo setor (`ConfiguracaoDoSetor`),
// mais as abas próprias: Equipe e carteiras, Indicadores, Cashback (L6c), Famílias de produto
// (2026-10-03) e Diretrizes (2026-10-04).
import { useState } from 'react';
import { Handshake, Layers, ListChecks, Target, Trash2, Users, Wallet } from 'lucide-react';
import { FamiliasDeProdutoTab } from '@/components/comercial/FamiliasDeProdutoTab';
import { DiretrizesTab } from '@/components/comercial/DiretrizesTab';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';
import { VendedoresTab } from '@/components/comercial/VendedoresTab';
import { CarteiraFechadaTab } from '@/components/comercial/CarteiraFechadaTab';
import { CarteirasVendedorasTab } from '@/components/comercial/CarteirasVendedorasTab';
import { IndicadoresCatalogoTab } from '@/components/comercial/IndicadoresCatalogoTab';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTabelasBase } from '@/hooks/useComercialPainel';
import { useApagarFaixaCashback, useFaixasCashback, useSalvarFaixaCashback, type FaixaCashbackInput } from '@/hooks/useComercialCashback';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { formatBRL } from '@/types/financeiro';

export default function ComercialConfiguracoes() {
  return (
    <ConfiguracaoDoSetor
      modulo="comercial"
      label="Comercial"
      icon={Handshake}
      nomeNaFrase="o Comercial"
      // LEVA P (2026-09-28): eram 9 abas, e três delas falavam da mesma coisa — quem é da
      // equipe e o que cada um vê. Viraram uma. A ordem é a de montar o Comercial: a equipe e
      // as carteiras, depois o que se mede delas, depois o cashback.
      abas={[
        { valor: 'carteiras-vendedoras', permissao: 'equipe', rotulo: 'Equipe e carteiras', icone: Users, conteudo: <EquipeECarteiras /> },
        { valor: 'indicadores', permissao: 'indicadores', rotulo: 'Indicadores', icone: ListChecks, conteudo: <IndicadoresCatalogoTab /> },
        { valor: 'cashback', permissao: 'cashback', rotulo: 'Cashback', icone: Wallet, conteudo: <GradeCashbackTab /> },
        // 2026-10-03 (decisão do dono): a família de cada produto, sugerida pelo nome e confirmada aqui.
        { valor: 'familias', permissao: 'familias', rotulo: 'Famílias de produto', icone: Layers, conteudo: <FamiliasDeProdutoTab /> },
        // 2026-10-04 (decisão do dono): "comprou no mês 36 OX 6 vol → R$ 100 de cashback na próxima compra".
        { valor: 'diretrizes', permissao: 'diretrizes', rotulo: 'Diretrizes', icone: Target, conteudo: <DiretrizesTab /> },
      ]}
      apelidos={{ vendedores: 'carteiras-vendedoras', carteiras: 'carteiras-vendedoras' }}
    />
  );
}

/**
 * Equipe e carteiras: as três partes que dizem quem é da equipe comercial e o que cada um vê.
 *
 *   * as carteiras e quem responde por cada uma (LEVA O) — é a carteira que faz alguém ser
 *     vendedora;
 *   * quais códigos de vendedor do Forteplus são gente de verdade (2026-09-26);
 *   * a chave "a vendedora só vê a carteira dela" (2026-09-27) — quem faz valer é o banco.
 */
function EquipeECarteiras() {
  return (
    <div className="space-y-4">
      <CarteirasVendedorasTab />
      <VendedoresTab />
      <CarteiraFechadaTab />
    </div>
  );
}

const FORM_VAZIO = { tabelaBase: '', valorMinimo: '', percentual: '' };

/**
 * A grade de cashback: lista, cria, edita e apaga degraus. O botão de salvar/apagar só aparece
 * para quem altera a aba "Cashback" do perfil de acesso (LEVA P, parte 7) — a mesma conta que a
 * policy de escrita faz no banco (`pode_alterar_aba('comercial', 'cashback')`).
 */
function GradeCashbackTab() {
  const podeConfigurar = useConfiguracaoDosSetores().alteraAba('comercial', 'cashback');

  const { data: faixas, isLoading } = useFaixasCashback();
  const { data: tabelasExistentes } = useTabelasBase();
  const salvar = useSalvarFaixaCashback();
  const apagar = useApagarFaixaCashback();

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [tabelaLivre, setTabelaLivre] = useState(false);

  const iniciarEdicao = (f: { id: string; tabela_base: string; valor_minimo: number; percentual: number }) => {
    setEditandoId(f.id);
    setForm({ tabelaBase: f.tabela_base, valorMinimo: String(f.valor_minimo), percentual: String(f.percentual) });
    setTabelaLivre(!(tabelasExistentes ?? []).includes(f.tabela_base));
  };
  const cancelarEdicao = () => {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setTabelaLivre(false);
  };

  const salvarDegrau = () => {
    const valorMinimo = Number(form.valorMinimo);
    const percentual = Number(form.percentual);
    if (!form.tabelaBase.trim() || !Number.isFinite(valorMinimo) || !Number.isFinite(percentual)) return;
    const input: FaixaCashbackInput = {
      id: editandoId ?? undefined,
      tabela_base: form.tabelaBase.trim(),
      valor_minimo: valorMinimo,
      percentual,
    };
    salvar.mutate(input, { onSuccess: cancelarEdicao });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Grade de cashback</CardTitle>
        <CardDescription>
          O percentual de cashback por tabela de preço, a partir de quanto o cliente comprou no mês. Tabelas com
          sufixo "CONDICAO" usam a grade da tabela base — não é preciso cadastrar as duas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {podeConfigurar && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end rounded-lg border border-dashed p-3">
            <div className="space-y-1">
              <Label className="text-xs">Tabela de preço</Label>
              {tabelaLivre ? (
                <Input value={form.tabelaBase} onChange={(e) => setForm((s) => ({ ...s, tabelaBase: e.target.value }))} placeholder="Nome da tabela" />
              ) : (
                <Select
                  value={form.tabelaBase}
                  onValueChange={(v) => (v === '__outra__' ? setTabelaLivre(true) : setForm((s) => ({ ...s, tabelaBase: v })))}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha a tabela" /></SelectTrigger>
                  <SelectContent>
                    {(tabelasExistentes ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    <SelectItem value="__outra__">Outra (digitar)…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">A partir de (R$)</Label>
              <Input type="number" min="0" step="0.01" value={form.valorMinimo} onChange={(e) => setForm((s) => ({ ...s, valorMinimo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Percentual (%)</Label>
              <Input type="number" min="0.01" max="100" step="0.01" value={form.percentual} onChange={(e) => setForm((s) => ({ ...s, percentual: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={salvarDegrau} disabled={salvar.isPending}>{editandoId ? 'Salvar' : 'Adicionar'}</Button>
              {editandoId && <Button size="sm" variant="ghost" onClick={cancelarEdicao}>Cancelar</Button>}
            </div>
          </div>
        )}

        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Tabela</th>
                <th className="px-3 py-1.5 font-semibold text-right">A partir de</th>
                <th className="px-3 py-1.5 font-semibold text-right">Percentual</th>
                {podeConfigurar && <th className="px-3 py-1.5 font-semibold text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {(faixas ?? []).map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="px-3 py-1.5">{f.tabela_base}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(f.valor_minimo)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{f.percentual}%</td>
                  {podeConfigurar && (
                    <td className="px-3 py-1.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => iniciarEdicao(f)}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => apagar.mutate(f.id)} disabled={apagar.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {!isLoading && (faixas ?? []).length === 0 && (
                <tr><td colSpan={podeConfigurar ? 4 : 3} className="px-3 py-4 text-center text-muted-foreground">Nenhuma grade de cashback cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {!podeConfigurar && (
          <p className="text-xs text-muted-foreground">Mudar a grade exige "Configurações › Cashback: Alterar" no perfil de acesso do Comercial.</p>
        )}
      </CardContent>
    </Card>
  );
}

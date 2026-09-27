import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useSalvarCliente, type ClienteCadastrado } from '@/hooks/useComercialCliente';
import { useTabelasPreco } from '@/hooks/useComercialPainel';
import { useCarteiras } from '@/hooks/useComercialCarteirasMetas';
import { soDigitos, documentoTemForma, formatarDocumento } from '@/lib/documento';

/**
 * Cadastrar cliente novo, ou corrigir o de sempre (leva G, 2026-09-26).
 *
 * DOIS LADOS, E CADA UM MANDA NO QUE É DELE. Os cinco campos do Forteplus
 * (código, razão social, fantasia, tabela, ativo) voltam a cada importação e o
 * formulário avisa isso na cara de quem edita — corrigir a razão social aqui
 * dura até a próxima carga. Documento, telefone, e-mail e endereço nasceram no
 * Helpoint e a importação não os toca.
 *
 * Por que o código não é editável na correção: ele é a chave do upsert da
 * importação. Trocá-lo transformaria o cliente em outro na próxima carga, e o
 * histórico de vendas — que aponta para o código — ficaria órfão.
 */

interface Props {
  /** Ausente = cadastrando um cliente novo. */
  cliente?: ClienteCadastrado;
  onFechar: () => void;
  /** Cadastrou um novo: leva a ficha dele. */
  onCadastrado?: (codigo: string) => void;
}

export function FormularioCliente({ cliente, onFechar, onCadastrado }: Props) {
  const criando = !cliente;
  const salvar = useSalvarCliente();
  const { data: tabelas = [] } = useTabelasPreco();
  const { data: carteiras = [] } = useCarteiras();

  const [codigo, setCodigo] = useState(cliente?.codigo ?? '');
  const [razaoSocial, setRazaoSocial] = useState(cliente?.razao_social ?? '');
  const [fantasia, setFantasia] = useState(cliente?.fantasia ?? '');
  const [tabela, setTabela] = useState(cliente?.tabela_preco ?? '');
  const [ativo, setAtivo] = useState(cliente?.ativo ?? true);
  const [documento, setDocumento] = useState(cliente?.documento ?? '');
  const [telefone, setTelefone] = useState(cliente?.telefone ?? '');
  const [email, setEmail] = useState(cliente?.email ?? '');
  const [endereco, setEndereco] = useState(cliente?.endereco ?? '');
  const [carteira, setCarteira] = useState(cliente?.carteira ?? '');

  const documentoDigitado = soDigitos(documento);
  const documentoRuim = documentoDigitado.length > 0 && !documentoTemForma(documentoDigitado);
  const faltaObrigatorio = !codigo.trim() || !razaoSocial.trim();

  const handleSalvar = async () => {
    if (faltaObrigatorio || documentoRuim) return;
    await salvar.mutateAsync({
      criando,
      cliente: {
        codigo, razao_social: razaoSocial, fantasia, tabela_preco: tabela || null,
        ativo, documento: documentoDigitado || null, telefone, email, endereco,
        carteira: carteira || null,
      },
    });
    if (criando) onCadastrado?.(codigo.trim());
    onFechar();
  };

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{criando ? 'Cadastrar cliente' : `Cadastro de ${cliente!.razao_social}`}</DialogTitle>
          <DialogDescription>
            O código, a razão social, o nome fantasia, a tabela e o ativo/inativo vêm do Forteplus e{' '}
            <strong>voltam ao que está lá na próxima importação</strong>. CNPJ, telefone, e-mail e endereço são
            nossos: a importação não mexe neles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cli-codigo">Código no Forteplus *</Label>
              <Input
                id="cli-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                disabled={!criando}
                placeholder="2010"
              />
              {!criando && (
                <p className="text-[11px] text-muted-foreground">
                  Não muda: é por ele que a importação e o histórico de vendas encontram este cliente.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-doc">CNPJ ou CPF</Label>
              <Input
                id="cli-doc"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                placeholder="08.319.138/0001-60"
                inputMode="numeric"
              />
              {documentoRuim ? (
                <p className="text-[11px] text-status-danger">
                  CNPJ tem 14 dígitos e CPF tem 11 — este tem {documentoDigitado.length}.
                </p>
              ) : documentoDigitado ? (
                <p className="text-[11px] text-muted-foreground">
                  Guardado como {formatarDocumento(documentoDigitado)}. É por ele que os chamados do SAC
                  aparecem na ficha.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Sem ele, os chamados do SAC deste cliente não aparecem na ficha.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cli-razao">Razão social *</Label>
            <Input id="cli-razao" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cli-fantasia">Nome fantasia</Label>
              <Input id="cli-fantasia" value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-tabela">Tabela de preço</Label>
              {/* A lista sai do que EXISTE em `com_clientes` (useTabelasDePreco),
                  não de uma lista fixa no código: as tabelas são dado do dono. */}
              <Select value={tabela || 'nenhuma'} onValueChange={(v) => setTabela(v === 'nenhuma' ? '' : v)}>
                <SelectTrigger id="cli-tabela"><SelectValue placeholder="Sem tabela" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">— Sem tabela —</SelectItem>
                  {tabelas.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                  {tabela && !tabelas.includes(tabela) && (
                    <SelectItem value={tabela}>{tabela}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cli-tel">Telefone</Label>
              <Input id="cli-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(32) 99999-0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-email">E-mail</Label>
              <Input id="cli-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cli-carteira">Carteira</Label>
              {/* A lista sai de `com_carteiras_conhecidas()`, que as descobre das
                  metas do diretor — carteira é dado do dono, e ele renomeia pela
                  tela. Lista fixa aqui quebraria na primeira renomeação. */}
              <Select value={carteira || 'nenhuma'} onValueChange={(v) => setCarteira(v === 'nenhuma' ? '' : v)}>
                <SelectTrigger id="cli-carteira"><SelectValue placeholder="Não atrelado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">— Não atrelado —</SelectItem>
                  {carteiras.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  {carteira && !carteiras.includes(carteira) && (
                    <SelectItem value={carteira}>{carteira} (antiga)</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Quando a nota vem assinada por "FINANCEIRO APROVADO", quem responde pelo cliente é o
                responsável desta carteira.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-end">Endereço</Label>
              <Input id="cli-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número, bairro, cidade" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="cli-ativo" className="text-[13px]">Cliente ativo</Label>
              <p className="text-[11px] text-muted-foreground">
                Inativo continua na base e no histórico — cliente com venda não se apaga.
              </p>
            </div>
            <Switch id="cli-ativo" checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={faltaObrigatorio || documentoRuim || salvar.isPending}>
            {salvar.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
            {criando ? 'Cadastrar' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

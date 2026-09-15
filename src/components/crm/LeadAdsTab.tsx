import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Copy, Check, ExternalLink, Power, RefreshCw, Link2, Pencil, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { LeadAdsFormDialog } from '@/components/crm/LeadAdsFormDialog';
import {
  useEstadoLeadAds, useSalvarLeadAds, useDesligarLeadAds, useFormulariosDaMeta,
  useLeadAdsForms, useRemoverLeadAdsForm, useLeadAdsPendentes, useReprocessarLead,
} from '@/hooks/useLeadAds';
import type { FormularioDaMeta } from '@/lib/lead-ads';
import { useCRMPipelines } from '@/hooks/useCRM';

/**
 * Lead Ads do Facebook (CRM-4c, ADR-006).
 *
 * A ordem desta tela é a decisão do dono, e não é enfeite: primeiro existe o
 * funil, depois o formulário é **ligado** a ele, e só então o lead entra. O que
 * chega antes disso fica retido — aparece no fim da tela, guardado inteiro — e
 * entra sozinho no instante em que alguém salvar o destino.
 */
export function LeadAdsTab() {
  const { data: estado, isLoading, isError, error } = useEstadoLeadAds();
  const salvarConexao = useSalvarLeadAds();
  const desligar = useDesligarLeadAds();
  const { data: funis = [] } = useCRMPipelines();
  const { data: ligados = [] } = useLeadAdsForms();
  const remover = useRemoverLeadAdsForm();
  const { data: pendentes = [] } = useLeadAdsPendentes();
  const reprocessar = useReprocessarLead();

  const [appSecret, setAppSecret] = useState('');
  const [pageId, setPageId] = useState('');
  const [editando, setEditando] = useState<FormularioDaMeta | null>(null);

  // `useMemo` e não `?? []` solto: a lista entra na dependência do efeito
  // abaixo, e um array novo a cada render o faria rodar sem parar.
  const paginas = useMemo(() => estado?.paginas ?? [], [estado]);
  // Uma página só: escolher não é decisão, é digitação.
  useEffect(() => {
    if (!pageId && paginas.length === 1) setPageId(paginas[0].page_id);
  }, [paginas, pageId]);

  const formularios = useFormulariosDaMeta(pageId || undefined);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  // Falha ao perguntar o estado **não** desenha "nada ligado": foi assim que uma
  // edge function que nem subia passou por uma navegação real sem suspeita.
  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 max-w-2xl">
        <p className="text-sm font-medium text-foreground">
          Não foi possível falar com o serviço do Lead Ads.
        </p>
        <p className="text-[13px] text-muted-foreground mt-1">
          Isto não quer dizer que esteja desligado — quer dizer que a pergunta não chegou.
          Recarregue a página; se continuar, é caso de suporte.
        </p>
        <p className="text-[11px] text-muted-foreground mt-2 font-mono">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }

  const conectado = !!estado?.conectado;
  const porFormId = new Map(ligados.map(l => [l.form_id, l]));
  // `=== false` e não `!p.instalada`: enquanto o front for novo e a função ainda
  // for a antiga, o campo vem indefinido — e avisar por não saber seria pior do
  // que esperar o próximo deploy.
  const naoInstaladas = paginas.filter(p => p.instalada === false);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-start gap-3">
        <Megaphone className="w-5 h-5 text-primary mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Leads de anúncio do Facebook</h3>
          <p className="text-[13px] text-muted-foreground">
            Quem preenche o formulário de um anúncio vira negócio no funil que você escolher — com
            as respostas guardadas nos campos certos.
          </p>
        </div>
      </div>

      {/* Conectar a página dá permissão de ler; instalar o aplicativo é o que
          faz ela mandar o lead. Sem este aviso, o administrador configuraria
          tudo certo e ficaria esperando um lead que nunca sai.
          O motivo não é afirmado de propósito: pode ser página conectada antes
          desta funcionalidade, ou permissão que a Meta recusou na hora. A saída
          é a mesma, e chutar a causa é o tipo de texto que faz perder tempo. */}
      {conectado && naoInstaladas.length > 0 && (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 p-4">
          <p className="text-[13px] text-foreground">
            {naoInstaladas.length === 1
              ? <>A página <strong>{naoInstaladas[0].account_name}</strong> está conectada, mas ainda
                  não confirmou que manda os leads dos anúncios.</>
              : <>Estas páginas estão conectadas, mas ainda não confirmaram que mandam os leads dos
                  anúncios: <strong>{naoInstaladas.map(p => p.account_name).join(', ')}</strong>.</>}
            {' '}Vá em <strong>Marketing → Redes sociais</strong> e reconecte, aceitando todas as
            permissões que o Facebook pedir — leva alguns segundos.
          </p>
        </div>
      )}

      {funis.length === 0 && (
        <div className="rounded-lg border border-status-warning/40 bg-status-warning/5 p-4">
          <p className="text-[13px] text-foreground">
            Você ainda não tem funil nenhum. Crie o funil e as etapas na aba <strong>Funil</strong>
            {' '}antes de ligar um formulário — é lá que o lead vai cair.
          </p>
        </div>
      )}

      {/* 1. A conexão */}
      {conectado ? (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-medium text-foreground">Lead Ads ligado</p>
              <p className="text-[12px] text-muted-foreground">
                {estado?.ativo
                  ? 'Recebendo leads dos anúncios.'
                  : 'Desligado — o lead que chegar é recusado, e o Facebook não reenvia depois.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={estado?.ativo ? 'default' : 'secondary'} className="text-[10px]">
                {estado?.ativo ? 'Ligado' : 'Desligado'}
              </Badge>
              {estado?.ativo && (
                <Button variant="ghost" size="sm" onClick={() => desligar.mutate()} disabled={desligar.isPending}>
                  <Power className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  Desligar
                </Button>
              )}
            </div>
          </div>

          {!estado?.assinatura_configurada && (
            <p className="text-[12px] text-destructive">
              Falta a chave secreta do aplicativo. Sem ela o sistema recusa os leads, porque não tem
              como provar que vieram mesmo da Meta.
            </p>
          )}

          <div className="rounded-md bg-muted/40 p-3 space-y-2">
            <p className="text-[12px] font-medium text-foreground">
              Cole estes dois no painel da Meta, em Webhooks, assinando <code>leadgen</code>:
            </p>
            <CampoCopiavel rotulo="Endereço (Callback URL)" valor={estado?.webhook_url ?? ''} />
            <CampoCopiavel rotulo="Chave de verificação (Verify token)" valor={estado?.verify_token ?? ''} />
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
            >
              Abrir o painel da Meta
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="text-[13px] text-muted-foreground">
            Ainda não ligado. A página do Facebook é conectada em <strong>Marketing</strong> — é de lá
            que sai a permissão para ler o conteúdo do lead. Aqui é só ligar a chave.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border p-4">
        <p className="text-sm font-medium text-foreground">
          {conectado ? 'Trocar a chave do aplicativo' : 'Ligar o Lead Ads'}
        </p>
        {estado?.app_da_casa ? (
          <p className="text-[12px] text-muted-foreground">
            O aplicativo da Meta é o do Helpoint — você não precisa de chave nenhuma. Só preencha
            abaixo se a sua empresa usa um aplicativo próprio, registrado no painel da Meta em nome dela.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label>
            Chave secreta do aplicativo (App secret)
            {estado?.app_da_casa ? ' — opcional' : ''}
          </Label>
          <Input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            Guardada fora do alcance da tela e nunca mostrada de volta — nem para você. Para trocar,
            cole uma nova.
          </p>
        </div>
        <Button
          disabled={(!appSecret.trim() && !estado?.app_da_casa) || salvarConexao.isPending}
          onClick={() => salvarConexao.mutate(
            appSecret.trim() || undefined,
            { onSuccess: () => setAppSecret('') },
          )}
        >
          {conectado ? 'Salvar' : 'Ligar Lead Ads'}
        </Button>
      </div>

      {/* 2. Os formulários da página, e onde cada um cai */}
      {conectado && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Formulários dos anúncios</p>
              <p className="text-[12px] text-muted-foreground">
                Criados no Facebook. Aqui você diz onde cai o lead de cada um.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {paginas.length > 1 && (
                <Select value={pageId} onValueChange={setPageId}>
                  <SelectTrigger className="w-56"><SelectValue placeholder="Escolha a página" /></SelectTrigger>
                  <SelectContent>
                    {paginas.map(p => (
                      <SelectItem key={p.page_id} value={p.page_id}>{p.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="outline" size="sm"
                onClick={() => formularios.refetch()}
                disabled={!pageId || formularios.isFetching}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Buscar da Meta
              </Button>
            </div>
          </div>

          {paginas.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Nenhuma página do Facebook conectada. Conecte em <strong>Marketing → Redes sociais</strong>;
              é de lá que sai a permissão para ler o conteúdo do lead.
            </p>
          ) : formularios.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : formularios.isError ? (
            <p className="text-[12px] text-destructive">
              A Meta recusou a leitura: {formularios.error instanceof Error ? formularios.error.message : String(formularios.error)}
              {' '}— normalmente é a página ter sido conectada antes de o Helpoint pedir permissão de
              leads. Reconecte o Facebook em Marketing.
            </p>
          ) : (formularios.data ?? []).length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Esta página não tem formulário de anúncio. Crie um no Gerenciador de Anúncios.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {(formularios.data ?? []).map(f => {
                const cfg = porFormId.get(f.id);
                return (
                  <li key={f.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
                    <div className="flex-1 min-w-[14rem]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-foreground">{f.name || f.id}</span>
                        {cfg ? (
                          <Badge className="text-[10px]">ligado ao funil</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">sem destino</Badge>
                        )}
                        {f.status && f.status !== 'ACTIVE' && (
                          <span className="text-[11px] text-muted-foreground">{f.status.toLowerCase()}</span>
                        )}
                      </div>
                      {!cfg && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Os leads deste formulário ficam guardados até você escolher o funil.
                        </p>
                      )}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setEditando(f)} disabled={funis.length === 0}>
                      {cfg
                        ? <><Pencil className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Editar destino</>
                        : <><Link2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Ligar ao funil</>}
                    </Button>
                    {cfg && (
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => remover.mutate(cfg.id)}
                        disabled={remover.isPending}
                        aria-label={`Desligar ${f.name || f.id}`}
                      >
                        <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* 3. O que chegou e não entrou */}
      {pendentes.length > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Leads guardados ({pendentes.length})</p>
            <p className="text-[12px] text-muted-foreground">
              Chegaram e ainda não viraram negócio. Nada se perde: entram sozinhos quando o
              formulário for ligado a um funil, ou pelo botão aqui.
            </p>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {pendentes.map(l => (
              <li key={l.id} className="px-3 py-2 flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-[14rem]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={l.status === 'erro' ? 'destructive' : 'secondary'} className="text-[10px]">
                      {l.status === 'erro' ? 'erro' : 'esperando destino'}
                    </Badge>
                    <span className="text-[12px] text-foreground">{resumo(l.campos)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(l.created_at).toLocaleString('pt-BR')}
                    {l.form_id ? ` · formulário ${l.form_id}` : ''}
                  </p>
                  {l.erro && <p className="text-[11px] text-destructive mt-0.5">{l.erro}</p>}
                </div>
                <Button
                  variant="outline" size="sm"
                  onClick={() => reprocessar.mutate(l.id)}
                  disabled={reprocessar.isPending}
                >
                  Tentar de novo
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editando && (
        <LeadAdsFormDialog
          open
          onOpenChange={(v) => { if (!v) setEditando(null); }}
          pageId={pageId}
          daMeta={editando}
          existente={porFormId.get(editando.id)}
        />
      )}
    </div>
  );
}

/** Quem é este lead, em uma linha: nome, e-mail ou telefone — o que houver. */
function resumo(campos: unknown): string {
  const c = (campos ?? {}) as Record<string, unknown>;
  const pegar = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const nome = pegar('full_name') || [pegar('first_name'), pegar('last_name')].join(' ').trim();
  return nome || pegar('email') || pegar('phone_number') || pegar('phone') || 'lead sem identificação';
}

function CampoCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{rotulo}</Label>
      <div className="flex gap-2">
        <Input readOnly value={valor} className="font-mono text-[11px]" />
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copiar ${rotulo}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              toast.error('Não foi possível copiar — selecione e copie à mão.');
            }
          }}
        >
          {copiado ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

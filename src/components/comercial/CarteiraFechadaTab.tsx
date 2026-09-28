import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { useTenantSettings, useUpdateTenantSettings } from '@/hooks/useTenantSettings';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useLacunasDoCadastro } from '@/hooks/useComercialCliente';

/**
 * A chave "o vendedor só vê os clientes da carteira dele".
 *
 * PEDIDO DO DONO em 2026-09-27. A regra vive no BANCO (migration
 * `20261109030000`): esconder no front não esconde nada, porque este sistema fala
 * direto com o banco e quem tem a sessão alcança a tabela pela API.
 *
 * ESTA TELA MOSTRA A CONSEQUÊNCIA ANTES DE ALGUÉM LIGAR, e é o ponto dela. Cliente
 * sem carteira fica invisível para o vendedor com a chave ligada — não é efeito
 * colateral, é a regra pedida ("só os seus"). Só que hoje **nenhum dos clientes tem
 * carteira**, então ligar a chave sem saber disso faria todo vendedor ver zero
 * clientes e o Comercial parar. Decidir olhando o número é diferente de descobrir
 * depois, e o número fica ao lado da chave.
 */
export function CarteiraFechadaTab() {
  const { data: settings, isLoading } = useTenantSettings();
  const salvar = useUpdateTenantSettings();
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: lacunas } = useLacunasDoCadastro();

  const comercial = (settings?.comercial ?? {}) as { vendedorSoVeSuaCarteira?: boolean };
  const ligada = comercial.vendedorSoVeSuaCarteira === true;

  const semCarteira = lacunas?.semCarteira ?? 0;
  const total = lacunas?.total ?? 0;

  if (isLoading) return <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quem vê quais clientes</CardTitle>
        <CardDescription>
          Por padrão, quem tem o Comercial vê todos os clientes da empresa. Ligando a chave abaixo, cada
          vendedor passa a ver <strong>somente os clientes das carteiras de que ele é membro</strong> — nas
          listas, na busca, na ficha e em todos os números do painel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
          <div className="space-y-1">
            <Label htmlFor="carteira-fechada" className="text-sm">
              O vendedor só vê os clientes da carteira dele
            </Label>
            <p className="text-[12px] text-muted-foreground max-w-xl">
              Gestores, donos, administradores e quem tem a Diretoria continuam vendo a empresa inteira —
              a pergunta deles é "como vai a empresa", e um total recortado por carteira seria um número
              que mente.
            </p>
          </div>
          <Switch
            id="carteira-fechada"
            checked={ligada}
            disabled={!isOwnerOrAdmin || salvar.isPending}
            onCheckedChange={(v) =>
              salvar.mutate({ settings: { comercial: { ...comercial, vendedorSoVeSuaCarteira: v } } })
            }
          />
        </div>

        {/* O número que muda a decisão. Aparece ligada ou desligada: com a chave
            ligada ele diz quantos clientes estão invisíveis AGORA. */}
        {semCarteira > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-warning/40 badge-warning p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-status-warning shrink-0" aria-hidden="true" />
            <div className="text-[12px] text-foreground space-y-1">
              <p>
                <strong>{semCarteira} de {total} clientes não estão em nenhuma carteira.</strong>{' '}
                {ligada
                  ? 'Com a chave ligada, eles estão invisíveis para os vendedores agora.'
                  : 'Se você ligar a chave agora, eles ficam invisíveis para os vendedores.'}
              </p>
              <p className="text-muted-foreground">
                Atrelar cliente a carteira é feito em <strong>Clientes → Cadastro</strong>, no filtro
                "Sem carteira".
              </p>
            </div>
          </div>
        )}

        {!isOwnerOrAdmin && (
          <p className="text-xs text-muted-foreground">
            Só dono ou administrador muda esta chave — ela decide o que cada vendedor alcança.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

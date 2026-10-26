// O Portal do Distribuidor (etapa 6), parte 1: a porta de entrada. Uma tela que muda com a situação de quem abre —
// sem login, sem cadastro, convidado, esperando a Minasflor, recusado, os termos no primeiro acesso, e o portal.
// A entrada é a mesma do cliente do SAC (código no e-mail): o link leva `?destino=distribuidor` e volta para cá.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, LogOut, Store, UserPlus, Users, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { useSacTenantSlug } from '@/hooks/useSacTenantSlug';
import {
  useAceitarConvite, useAceitarTermos, useConvidarVendedor, useEquipeDoDistribuidor, usePedirCadastroDeDistribuidor,
  useSituacaoDoDistribuidor, useTirarDaEquipe, type MembroDoDistribuidor, type NoPortal, type PedidoDeCadastro, type SituacaoDoDistribuidor,
} from '@/hooks/useDistribuidor';
import { POLITICA_DE_PRIVACIDADE, TERMOS_DE_USO, type SecaoDosTermos } from '@/config/termos-do-distribuidor';
import { mensagemDeErro } from '@/lib/supabase-result';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { AreaDoPortal } from '@/components/distribuidor/AreaDoPortal';
import MeuDiaDoDistribuidor from '@/telas/distribuidor/MeuDia';

const formatarCnpj = (d: string) => d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

export default function PortalDoDistribuidor() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const slug = useSacTenantSlug();
  const { tenant } = useTenantBranding(slug);
  const situacao = useSituacaoDoDistribuidor();
  const qs = `?${slug ? `tenant=${slug}&` : ''}destino=distribuidor`;

  const sair = async () => { await signOut(); navigate(`/distribuidor${slug ? `?tenant=${slug}` : ''}`); };

  // Liberado e com os termos aceitos: a porta de entrada vira o Meu dia, dentro da moldura do portal.
  const s = user ? situacao.data : null;
  if (s && 'termos_ok' in s && s.situacao === 'liberado' && s.termos_ok) {
    return <AreaDoPortal s={s}><MeuDiaDoDistribuidor /></AreaDoPortal>;
  }

  let conteudo: React.ReactNode;
  if (!user) {
    conteudo = !slug ? (
      <Aviso titulo="Link incompleto">Peça à Minasflor o link do Portal do Distribuidor.</Aviso>
    ) : (
      <Card className="p-5 space-y-3">
        <p className="text-[15px]">Organize seus salões, visitas, vendas e estoque, e fale com a Minasflor.</p>
        <Button asChild className="w-full h-12 text-base"><Link to={`/sac/entrar${qs}`}>Entrar</Link></Button>
        <Button asChild variant="outline" className="w-full h-12 text-base"><Link to={`/sac/cadastro${qs}`}>Criar meu cadastro</Link></Button>
        <p className="text-[13px] text-muted-foreground">Você entra com um código enviado ao seu e-mail, sem senha. Foi convidado por um
          distribuidor? Crie o cadastro com o e-mail do convite.</p>
      </Card>
    );
  } else if (situacao.isLoading) {
    conteudo = <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label="Carregando" /></div>;
  } else if (situacao.error || !situacao.data) {
    conteudo = <Aviso titulo="Não carregou">{mensagemDeErro(situacao.error)}</Aviso>;
  } else {
    conteudo = <ConteudoDaSituacao s={situacao.data} cadastroLink={`/sac/cadastro${qs}`} />;
  }

  return (
    <div className="min-h-screen bg-surface-1">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          {tenant?.logo_url
            ? <img src={tenant.logo_url} alt={tenant.name} className="h-8 object-contain" />
            : <Store className="w-6 h-6" aria-hidden="true" />}
          <span className="font-semibold text-[16px] flex-1 truncate">Portal do Distribuidor</span>
          {user && (
            <Button variant="ghost" className="h-11 gap-1.5" onClick={sair}>
              <LogOut className="w-4 h-4" aria-hidden="true" /> Sair
            </Button>
          )}
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">{conteudo}</main>
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 space-y-2">
      <h1 className="text-[16px] font-semibold">{titulo}</h1>
      <div className="text-[15px] text-muted-foreground">{children}</div>
    </Card>
  );
}

function ConteudoDaSituacao({ s, cadastroLink }: { s: SituacaoDoDistribuidor; cadastroLink: string }) {
  switch (s.situacao) {
    case 'sem_login':
    case 'sem_cadastro_de_cliente':
      return (
        <Aviso titulo="Falta o seu cadastro">
          <p className="mb-3">Para usar o portal, faça o cadastro com o seu e-mail.</p>
          <Button asChild className="h-11"><Link to={cadastroLink}>Criar meu cadastro</Link></Button>
        </Aviso>
      );
    case 'convidado':
      return <Convite convite={s.convite} razao={s.distribuidor.razao_social} />;
    case 'sem_pedido':
      return <PedirCadastro inicial={s.cadastro} recusado={s.recusado} />;
    case 'pendente':
      return (
        <Aviso titulo="Pedido com a Minasflor">
          A Minasflor está conferindo o cadastro de <b className="text-foreground">{s.distribuidor.razao_social}</b>. Quando
          liberar, você recebe um e-mail e o portal abre aqui.
        </Aviso>
      );
    case 'recusado':
    case 'suspenso':
      return (
        <Aviso titulo={s.situacao === 'recusado' ? 'Cadastro não liberado' : 'Acesso suspenso'}>
          <p>{s.distribuidor.motivo}</p>
          <p className="mt-2">Dúvidas? <Link to="/sac/meus-chamados" className="underline text-foreground">Fale com a Minasflor</Link>.</p>
        </Aviso>
      );
    case 'liberado':
      return <AceitarTermos />;
  }
}

function Convite({ convite, razao }: { convite: string; razao: string }) {
  const aceitar = useAceitarConvite();
  return (
    <Aviso titulo="Você foi convidado">
      <p className="mb-3"><b className="text-foreground">{razao}</b> convidou você para a equipe no Portal do Distribuidor.</p>
      <Button className="h-11" disabled={aceitar.isPending} onClick={() => aceitar.mutate(convite)}>Entrar na equipe</Button>
    </Aviso>
  );
}

function PedirCadastro({ inicial, recusado }: {
  inicial: Extract<SituacaoDoDistribuidor, { situacao: 'sem_pedido' }>['cadastro'];
  recusado: Extract<SituacaoDoDistribuidor, { situacao: 'sem_pedido' }>['recusado'];
}) {
  const pedir = usePedirCadastroDeDistribuidor();
  const [f, setF] = useState<PedidoDeCadastro>({
    razao_social: inicial.razao_social ?? '', cnpj: inicial.cnpj ? formatarCnpj(inicial.cnpj) : '',
    cidade: inicial.cidade ?? '', uf: inicial.uf ?? '', telefone: inicial.telefone ?? '',
  });
  const muda = (k: keyof PedidoDeCadastro) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const cnpjOk = f.cnpj.replace(/\D/g, '').length === 14;
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h1 className="text-[16px] font-semibold">Pedir acesso de distribuidor</h1>
        <p className="text-[14px] text-muted-foreground mt-1">A Minasflor confere os dados e liga ao seu cadastro de cliente.
          Use o CNPJ com que você compra da Minasflor.</p>
      </div>
      {recusado && <p className="text-[14px] rounded-md border border-border p-3">O pedido anterior não foi liberado: {recusado.motivo}</p>}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); pedir.mutate(f); }}>
        <Campo id="d-razao" rotulo="Razão social" value={f.razao_social} onChange={muda('razao_social')} required />
        <Campo id="d-cnpj" rotulo="CNPJ" value={f.cnpj} onChange={muda('cnpj')} inputMode="numeric" required />
        <div className="grid grid-cols-[1fr_88px] gap-3">
          <Campo id="d-cidade" rotulo="Cidade" value={f.cidade} onChange={muda('cidade')} />
          <Campo id="d-uf" rotulo="UF" value={f.uf} onChange={muda('uf')} maxLength={2} />
        </div>
        <Campo id="d-tel" rotulo="Telefone" value={f.telefone} onChange={muda('telefone')} inputMode="tel" />
        <Button type="submit" className="w-full h-12 text-base" disabled={pedir.isPending || !f.razao_social.trim() || !cnpjOk}>
          Enviar pedido
        </Button>
      </form>
    </Card>
  );
}

function Campo({ id, rotulo, ...rest }: { id: string; rotulo: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} className="h-11 text-base" {...rest} />
    </div>
  );
}

function Secoes({ titulo, secoes }: { titulo: string; secoes: SecaoDosTermos[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[16px] font-semibold">{titulo}</h2>
      {secoes.map((s) => (
        <div key={s.titulo}>
          <h3 className="text-[14px] font-semibold">{s.titulo}</h3>
          {s.paragrafos.map((p) => <p key={p} className="text-[14px] text-muted-foreground mt-1">{p}</p>)}
        </div>
      ))}
    </section>
  );
}

function AceitarTermos() {
  const aceitar = useAceitarTermos();
  const [li, setLi] = useState(false);
  return (
    <Card className="p-5 space-y-5">
      <div>
        <h1 className="text-[16px] font-semibold">Antes de começar</h1>
        <p className="text-[14px] text-muted-foreground mt-1">Leia como o portal funciona e o que fazemos com os dados.</p>
      </div>
      <div className="max-h-[55vh] overflow-y-auto space-y-6 rounded-md border border-border p-4">
        <Secoes titulo="Termos de Uso" secoes={TERMOS_DE_USO} />
        <Secoes titulo="Política de Privacidade" secoes={POLITICA_DE_PRIVACIDADE} />
      </div>
      <label className="flex items-start gap-3 text-[14px] min-h-11 cursor-pointer">
        <Checkbox checked={li} onCheckedChange={(v) => setLi(v === true)} className="mt-0.5" />
        Li e aceito os Termos de Uso e a Política de Privacidade.
      </label>
      <Button className="w-full h-12 text-base" disabled={!li || aceitar.isPending} onClick={() => aceitar.mutate()}>Continuar</Button>
    </Card>
  );
}

export function MinhaEquipe({ distribuidorId }: { distribuidorId: string }) {
  const equipe = useEquipeDoDistribuidor(distribuidorId);
  const convidar = useConvidarVendedor();
  const tirar = useTirarDaEquipe();
  const [novo, setNovo] = useState({ nome: '', email: '' });
  const [tirando, setTirando] = useState<MembroDoDistribuidor | null>(null);
  return (
    <Card className="p-5 space-y-4">
      <h2 className="text-[16px] font-semibold flex items-center gap-2"><Users className="w-4 h-4" aria-hidden="true" /> Minha equipe</h2>
      {equipe.error && <p className="text-[14px] text-status-danger">{mensagemDeErro(equipe.error)}</p>}
      <ul className="divide-y divide-border">
        {(equipe.data ?? []).map((m) => (
          <li key={m.id} className="py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] truncate">{m.nome || m.email}</p>
              <p className="text-[13px] text-muted-foreground truncate">
                {m.papel === 'dono' ? 'Responsável' : 'Vendedor'} · {m.user_id ? m.email : `convite enviado para ${m.email}`}
              </p>
            </div>
            {m.papel !== 'dono' && (
              <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Tirar ${m.nome || m.email} da equipe`}
                onClick={() => setTirando(m)}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        convidar.mutate(novo, { onSuccess: () => setNovo({ nome: '', email: '' }) });
      }}>
        <p className="text-[14px] text-muted-foreground">Convide um vendedor: ele recebe um e-mail e entra com o próprio acesso. Você
          vê tudo o que ele registrar.</p>
        <Campo id="v-nome" rotulo="Nome" value={novo.nome} onChange={(e) => setNovo((p) => ({ ...p, nome: e.target.value }))} />
        <Campo id="v-email" rotulo="E-mail" type="email" value={novo.email} required
          onChange={(e) => setNovo((p) => ({ ...p, email: e.target.value }))} />
        <Button type="submit" variant="outline" className="h-11 gap-1.5" disabled={convidar.isPending || !novo.email.trim()}>
          <UserPlus className="w-4 h-4" aria-hidden="true" /> Convidar
        </Button>
      </form>
      <ConfirmarExclusao aberto={!!tirando} titulo={`Tirar ${tirando?.nome || tirando?.email} da equipe?`} acao="Tirar da equipe"
        descricao="A pessoa deixa de entrar no portal. O que ela registrou continua com você, e os salões e as visitas marcadas dela passam para você."
        enviando={tirar.isPending} onCancelar={() => setTirando(null)}
        onConfirmar={() => tirando && tirar.mutate(tirando.id, { onSuccess: () => setTirando(null) })} />
    </Card>
  );
}

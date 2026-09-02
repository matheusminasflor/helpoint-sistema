import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Ticket, Monitor, Megaphone, ClipboardCheck,
  Sparkles, ArrowRight, CheckCircle2, Shield, Zap,
  BarChart3, Box,
  FileText, BookOpen, Brain, MessageSquare, TrendingUp,
  ChevronDown, Menu, X, HeartHandshake, Users,
  HelpCircle, Headphones, Cloud,
} from 'lucide-react';
import { TicketsBoardPreview, DashboardPreview, LyraChatPreview, QualityPreview } from '@/components/landing/UIPreview';

const solutionsCore = [
  { icon: Monitor, title: 'TI', desc: 'Chamados técnicos, inventário, contratos e licenças', anchor: 'pilar-ti' },
  { icon: ClipboardCheck, title: 'Qualidade e SAC', desc: 'Atendimento ao cliente com laudo e checklist', anchor: 'pilar-qualidade' },
];

const solutionsPeople = [
  { icon: Megaphone, title: 'Marketing', desc: 'Demandas criativas, posts e fornecedores', anchor: 'pilar-mkt' },
  { icon: Users, title: 'RH', desc: 'Solicitações, admissão, benefícios e documentos', anchor: 'pilar-rh' },
];

const solutionsAll = [...solutionsCore, ...solutionsPeople];


export default function Landing() {
  const navigate = useNavigate();
  const { user, isCustomer, isLoading } = useAuth();
  const [showSolutions, setShowSolutions] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    if (isLoading || !user) return;
    if (isCustomer) navigate('/sac/meus-chamados', { replace: true });
    else navigate('/inicio', { replace: true });
  }, [user, isCustomer, isLoading, navigate]);

  const scrollTo = (id: string) => {
    setShowSolutions(false);
    setMobileMenu(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-card font-sans">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary">
              <span className="text-white font-extrabold text-sm font-display">H</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display font-extrabold text-xl tracking-tight text-primary">Helpoint</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-semibold">Gestão sem planilhas</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <div className="relative">
              <button onClick={() => setShowSolutions(!showSolutions)} className="flex items-center gap-1 text-sm font-semibold text-foreground/80 hover:text-primary transition-colors">
                Soluções <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {showSolutions && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSolutions(false)} />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[560px] bg-card rounded-xl shadow-xl z-50 p-6 grid grid-cols-2 gap-6 border border-border">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Monitor className="w-4 h-4 text-accent" />
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Operação e atendimento</span>
                      </div>
                      <div className="space-y-1">
                        {solutionsCore.map(s => (
                          <button key={s.title} onClick={() => scrollTo(s.anchor)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors group">
                            <div className="flex items-center gap-2.5">
                              <s.icon className="w-4 h-4 text-muted-foreground group-hover:text-accent transition-colors" />
                              <div>
                                <div className="text-sm font-semibold text-foreground">{s.title}</div>
                                <div className="text-xs text-muted-foreground">{s.desc}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-monday-purple" />
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pessoas e marketing</span>
                      </div>
                      <div className="space-y-1">
                        {solutionsPeople.map(s => (
                          <button key={s.title} onClick={() => scrollTo(s.anchor)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors group">
                            <div className="flex items-center gap-2.5">
                              <s.icon className="w-4 h-4 text-muted-foreground group-hover:text-monday-purple transition-colors" />
                              <div>
                                <div className="text-sm font-semibold text-foreground">{s.title}</div>
                                <div className="text-xs text-muted-foreground">{s.desc}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                </>
              )}
            </div>
            <button onClick={() => scrollTo('pilares')} className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors">Recursos</button>
            <button onClick={() => scrollTo('lyra')} className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors">IA Lyra</button>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="text-sm font-semibold text-foreground/80 hover:text-primary px-4 py-2 rounded-lg transition-colors">Entrar</button>
            <button onClick={() => navigate('/onboarding/empresa')} className="text-sm font-bold text-white px-5 py-2.5 rounded-full transition-all hover:opacity-90 bg-primary shadow-sm">
              Criar minha conta
            </button>
          </div>

          <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 text-foreground/70">
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {mobileMenu && (
          <div className="md:hidden bg-card px-6 pb-6 border-t border-border">
            <div className="pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Soluções</div>
            <div className="space-y-1">
              {solutionsAll.map(s => (
                <button
                  key={s.title}
                  onClick={() => scrollTo(s.anchor)}
                  className="flex w-full min-h-[44px] items-center gap-3 rounded-lg px-2 text-left hover:bg-secondary"
                >
                  <s.icon className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-semibold text-foreground">{s.title}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t border-border pt-3">
              <button onClick={() => scrollTo('pilares')} className="flex w-full min-h-[44px] items-center px-2 text-sm font-medium text-foreground/80">Recursos</button>
              <button onClick={() => scrollTo('lyra')} className="flex w-full min-h-[44px] items-center px-2 text-sm font-medium text-foreground/80">IA Lyra</button>
              <button onClick={() => navigate('/login')} className="flex w-full min-h-[44px] items-center px-2 text-sm font-medium text-foreground/80">Entrar</button>
            </div>
            <button onClick={() => navigate('/onboarding/empresa')} className="mt-4 w-full text-sm font-bold text-white py-3 rounded-full bg-primary">Criar minha conta</button>
          </div>
        )}
      </nav>

      {/* HERO — GLPI split */}
      <section className="relative overflow-hidden bg-site-1">
        <div className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div className="relative">
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-extrabold text-foreground leading-[1.05] tracking-tight">
              Reinvente sua <br />
              <span className="relative inline-block text-primary">
                gestão de atendimento
                <span className="absolute -bottom-2 left-0 right-0 h-2 rounded-full bg-accent/40" />
              </span>
            </h1>
            <p className="mt-6 text-lg text-foreground/70 max-w-lg leading-relaxed">
              Todo pedido do seu time vira um chamado com responsável, prazo e histórico.
              Sem planilhas, sem cobrança por WhatsApp.
            </p>

            <div className="mt-8 flex items-center gap-4">
              <button onClick={() => navigate('/onboarding/empresa')} className="text-base font-bold text-white px-8 py-4 rounded-full bg-primary hover:bg-primary/90 transition-all flex items-center gap-2 shadow-md">
                Criar minha conta <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-xs text-foreground/50 font-medium">Crie a conta da sua empresa em minutos</span>
            </div>
          </div>
          <div className="relative">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* FEATURE BAND — GLPI style colored band with icons */}
      <section className="bg-accent">
        <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-5 gap-6">
          {[
            { icon: Headphones, label: 'Central de Ajuda' },
            { icon: Cloud,     label: 'Inventário Cloud' },
            { icon: ClipboardCheck, label: 'Qualidade & SAC' },
            { icon: Megaphone, label: 'Marketing & Mídia' },
            { icon: Brain,     label: 'IA Lyra integrada' },
          ].map(item => (
            <div key={item.label} className="flex flex-col items-center text-center gap-2.5 text-white">
              <div className="w-14 h-14 rounded-xl bg-card/15 flex items-center justify-center">
                <item.icon className="w-7 h-7" strokeWidth={1.6} />
              </div>
              <span className="text-sm font-semibold">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* SOBRE — o que é o Helpoint e para quem */}
      <section id="sobre" className="anchor-offset py-20 border-b border-border">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-extrabold text-foreground mb-4">
                O que é o <span className="text-primary">Helpoint</span>?
              </h2>
              <p className="text-foreground/70 leading-relaxed mb-4 text-lg">
                É uma plataforma brasileira de gestão de atendimento e operação interna. Em vez de
                planilhas soltas, grupos de WhatsApp e e-mails perdidos, cada pedido vira um chamado
                com responsável, prazo e histórico completo.
              </p>
              <h3 className="font-bold text-foreground mt-8 mb-3">Para quem é</h3>
              <ul className="space-y-2.5">
                {[
                  'Times de TI que atendem chamados e cuidam de equipamentos, contratos e licenças',
                  'Áreas de Qualidade e SAC que recebem reclamações de clientes e precisam de laudo e checklist',
                  'Equipes de Marketing que gerenciam demandas criativas, posts e fornecedores',
                  'RH que centraliza solicitações, documentos e benefícios dos colaboradores',
                ].map(t => (
                  <li key={t} className="flex items-start gap-3 text-[15px] text-foreground/80">
                    <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />{t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { icon: Ticket, title: 'Chamados por setor', desc: 'TI, Qualidade, Marketing e RH com filas, SLA e prioridade próprias.' },
                { icon: Brain, title: 'IA Lyra', desc: 'Resumo do dia, sugestão de resposta e análise de padrões nos chamados.' },
                { icon: Box, title: 'Inventário', desc: 'Equipamentos, responsáveis, status de uso e histórico de manutenção.' },
                { icon: FileText, title: 'Contratos e licenças', desc: 'Alertas automáticos antes de cada vencimento, com chamado gerado.' },
                { icon: HeartHandshake, title: 'Portal do cliente', desc: 'Seu cliente abre o SAC, acompanha o andamento e avalia o atendimento.' },
                { icon: BookOpen, title: 'Base de conhecimento', desc: 'Tutoriais que evitam chamados repetidos e treinam o time novo.' },
              ].map(card => (
                <div key={card.title} className="rounded-xl border border-border bg-card p-5">
                  <card.icon className="w-5 h-5 text-accent mb-3" aria-hidden="true" />
                  <h4 className="font-bold text-foreground text-[15px] mb-1">{card.title}</h4>
                  <p className="text-sm text-foreground/60 leading-relaxed">{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PILARES — alternating GLPI sections */}
      <section id="pilares" className="anchor-offset py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl md:text-5xl font-extrabold text-foreground mb-4">Tudo que sua empresa precisa.<br /><span className="text-primary">Em um só sistema.</span></h2>
            <p className="text-foreground/60 max-w-2xl mx-auto">Quatro áreas cobertas: TI, Qualidade e SAC, Marketing e RH.</p>
          </div>

          {/* TI */}
          <div id="pilar-ti" className="anchor-offset grid md:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4 bg-accent/10 text-accent">
                <Monitor className="w-3.5 h-3.5" /> Para TI
              </div>
              <h3 className="font-display text-3xl md:text-4xl font-extrabold text-foreground mb-4">Suporte e consertos<br />sem burocracia</h3>
              <ul className="space-y-3 mb-6">
                {['Chamados resolvidos com apoio de IA', 'Inventário: saiba onde cada equipamento está', 'Contratos e licenças sempre em dia', 'Tutoriais para o time resolver sozinho'].map(t => (
                  <li key={t} className="flex items-start gap-3 text-[15px] text-foreground/80"><CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-accent" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-site-1 p-5">
              <TicketsBoardPreview />
            </div>
          </div>

          {/* Qualidade */}
          <div id="pilar-qualidade" className="anchor-offset grid md:grid-cols-2 gap-12 items-center mb-20">
            <div className="md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4 badge-success">
                <ClipboardCheck className="w-3.5 h-3.5" /> Para Qualidade & SAC
              </div>
              <h3 className="font-display text-3xl md:text-4xl font-extrabold text-foreground mb-4">Atenda clientes<br />com excelência</h3>
              <ul className="space-y-3 mb-6">
                {['Portal do cliente para abertura de SACs', 'Checklists obrigatórios por categoria', 'Catálogo de produtos e lotes integrado', 'Indicadores e laudos técnicos profissionais'].map(t => (
                  <li key={t} className="flex items-start gap-3 text-[15px] text-foreground/80"><CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-monday-green" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="md:order-1 rounded-2xl bg-site-2 p-5">
              <QualityPreview />
            </div>
          </div>

          {/* Marketing */}
          <div id="pilar-mkt" className="anchor-offset grid md:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4 badge-purple">
                <Megaphone className="w-3.5 h-3.5" /> Para Marketing
              </div>
              <h3 className="font-display text-3xl md:text-4xl font-extrabold text-foreground mb-4">Demandas de marketing<br />organizadas</h3>
              <ul className="space-y-3 mb-6">
                {['Chamados de marketing com responsável e prazo', 'Cronograma de posts em calendário visual', 'Inventário de materiais e mídia', 'Orçamentos e fornecedores organizados'].map(t => (
                  <li key={t} className="flex items-start gap-3 text-[15px] text-foreground/80"><CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-monday-purple" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-site-3 p-5">
              <LyraChatPreview />
            </div>
          </div>

          {/* RH */}
          <div id="pilar-rh" className="anchor-offset grid md:grid-cols-2 gap-12 items-center">
            <div className="md:order-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4 bg-accent/10 text-accent">
                <Users className="w-3.5 h-3.5" /> Para RH
              </div>
              <h3 className="font-display text-3xl md:text-4xl font-extrabold text-foreground mb-4">Pedidos do time<br />no lugar certo</h3>
              <ul className="space-y-3 mb-6">
                {['Solicitações do colaborador com prazo e responsável', 'Admissão e desligamento com acessos controlados', 'Férias e faltas com aprovação registrada', 'Benefícios, holerites e documentos por pessoa'].map(t => (
                  <li key={t} className="flex items-start gap-3 text-[15px] text-foreground/80"><CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-accent" aria-hidden="true" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="md:order-1 rounded-2xl bg-site-1 p-5">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* LYRA IA */}
      <section id="lyra" className="anchor-offset py-20 bg-site-2">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-4 badge-purple">
                <Brain className="w-3.5 h-3.5" /> Inteligência Artificial
              </div>
              <h2 className="font-display text-3xl md:text-5xl font-extrabold text-foreground mb-4">
                Conheça a <span className="text-monday-purple">Lyra</span>:<br />a secretária que resume seu dia
              </h2>
              <p className="text-foreground/70 leading-relaxed mb-6 text-lg">
                A Lyra analisa seus chamados, identifica padrões e te entrega um resumo claro toda manhã. Sugere respostas, encontra tutoriais e te avisa antes dos prazos estourarem.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { icon: Sparkles, color: 'bg-primary', title: 'Resumo do Dia', desc: 'Briefing automático com o que importa: atrasados, urgentes e pendências.' },
                { icon: TrendingUp, color: 'bg-monday-green', title: 'Insights Automáticos', desc: '"Wi-Fi da sala 3 gerou 12 chamados este mês."' },
                { icon: MessageSquare, color: 'bg-monday-purple', title: 'Respostas Sugeridas', desc: 'Sugere a resposta ideal para cada chamado com base no histórico.' },
              ].map(card => (
                <div key={card.title} className="flex gap-4 bg-card rounded-xl p-5 border border-border shadow-sm">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white ${card.color}`}>
                    <card.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground text-base">{card.title}</h4>
                    <p className="text-sm text-foreground/60 mt-1 leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="grid md:grid-cols-3 gap-6 mb-14">
            {[
              { icon: Shield, label: 'Dados isolados por empresa', desc: 'Cada empresa só vê seus dados. Zero vazamento.' },
              { icon: Zap, label: 'Tudo em tempo real', desc: 'Chamados, status e alertas atualizados na hora.' },
              { icon: BarChart3, label: 'Relatórios com IA', desc: 'A Lyra gera insights que você não pediria.' },
            ].map(item => (
              <div key={item.label} className="bg-card rounded-xl p-6 border border-border text-left">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-3">
                  <item.icon className="w-6 h-6 text-accent" />
                </div>
                <h4 className="font-bold text-foreground mb-1">{item.label}</h4>
                <p className="text-sm text-foreground/60">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="max-w-3xl mx-auto bg-primary rounded-3xl p-12 text-white">
            <h2 className="font-display text-3xl md:text-4xl font-extrabold mb-4">Pronto para reinventar sua gestão?</h2>
            <p className="text-white/80 mb-8 leading-relaxed">Crie a conta da sua empresa e organize as demandas do time — sem planilhas e sem caos.</p>
            <button onClick={() => navigate('/onboarding/empresa')} className="text-base font-bold text-primary bg-card px-8 py-4 rounded-full transition-all hover:bg-card/90 inline-flex items-center gap-2 shadow-lg">
              Criar minha conta <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-xs text-white/60 mt-4">Cadastro da empresa em poucos passos</p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-primary text-white/80">
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <span className="text-white font-extrabold text-sm">H</span>
              </div>
              <span className="font-display font-extrabold text-white text-lg">Helpoint</span>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">Gestão integrada de atendimento, qualidade e marketing.</p>
          </div>
          <div>
            <h5 className="font-bold text-white mb-3 text-sm">Produto</h5>
            <ul className="space-y-2 text-xs">
              <li><button onClick={() => scrollTo('pilares')} className="hover:text-accent">Recursos</button></li>
              <li><button onClick={() => scrollTo('lyra')} className="hover:text-accent">IA Lyra</button></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-white mb-3 text-sm">Empresa</h5>
            <ul className="space-y-2 text-xs">
              <li><button onClick={() => scrollTo('sobre')} className="hover:text-accent">Sobre</button></li>
              <li><a href="mailto:contato@helpoint.com.br" className="hover:text-accent">Contato</a></li>
              <li><Link to="/termos" className="hover:text-accent">Termos de Uso</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-white mb-3 text-sm">Conta</h5>
            <ul className="space-y-2 text-xs">
              <li><button onClick={() => navigate('/login')} className="hover:text-accent">Entrar</button></li>
              <li><button onClick={() => navigate('/sac/acesso')} className="hover:text-accent">Portal do Cliente</button></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-xs text-white/50">
          © {new Date().getFullYear()} Helpoint · Todos os direitos reservados
        </div>
      </footer>
    </div>
  );
}

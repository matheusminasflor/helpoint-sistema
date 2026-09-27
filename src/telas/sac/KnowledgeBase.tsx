import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, BookOpen, Search, LogOut, MessageSquare } from 'lucide-react';
import { MarkdownPreview } from '@/components/pops/MarkdownPreview';
import { POPPreview } from '@/components/pops/POPPreview';
import { isBlockContent, parseContent } from '@/types/pop-blocks';

function Header() {
  const navigate = useNavigate();
  const signOut = async () => { await supabase.auth.signOut(); navigate('/sac/acesso'); };
  return (
    <header className="bg-card border-b sticky top-0 z-10">
      <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/sac/meus-chamados" className="font-bold text-primary">Painel do Cliente</Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link to="/sac/meus-chamados"><Button size="sm" variant="ghost"><MessageSquare className="w-4 h-4 mr-1" />Meus SACs</Button></Link>
          <Link to="/sac/base-conhecimento"><Button size="sm" variant="ghost"><BookOpen className="w-4 h-4 mr-1" />Tutoriais</Button></Link>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
        </nav>
      </div>
    </header>
  );
}

export function CustomerKnowledgeBase() {
  const [pops, setPops] = useState<any[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    supabase.from('pops').select('id, title, category, subcategory, views_count').eq('audience', 'customer').eq('is_active', true).order('title')
      .then(({ data }) => setPops(data || []));
  }, []);

  const list = pops.filter(p => p.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="min-h-screen bg-surface-1">
      <Header />
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h2 className="text-lg font-semibold">Base de Conhecimento</h2>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar tutorial..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {list.length === 0 && <Card className="p-8 text-center text-muted-foreground text-sm">Nenhum tutorial disponível ainda.</Card>}
        <div className="grid gap-2">
          {list.map(p => (
            <Link key={p.id} to={`/sac/base-conhecimento/${p.id}`}>
              <Card className="p-4 hover:bg-surface-2 cursor-pointer">
                <h3 className="font-semibold">{p.title}</h3>
                {p.category && <p className="text-xs text-muted-foreground mt-1">{p.category}{p.subcategory ? ` · ${p.subcategory}` : ''}</p>}
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CustomerKnowledgeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pop, setPop] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from('pops').select('*').eq('id', id).eq('audience', 'customer').maybeSingle()
      .then(({ data }) => setPop(data));
  }, [id]);

  if (!pop) return <div className="min-h-screen bg-surface-1"><Header /><div className="p-8 text-center text-muted-foreground">Carregando...</div></div>;

  return (
    <div className="min-h-screen bg-surface-1">
      <Header />
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Button size="sm" variant="ghost" onClick={() => navigate('/sac/base-conhecimento')}><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-2">{pop.title}</h1>
          {pop.category && <p className="text-xs text-muted-foreground mb-4">{pop.category}{pop.subcategory ? ` · ${pop.subcategory}` : ''}</p>}
          <div className="prose prose-sm max-w-none">
            {isBlockContent(pop.content || '')
              ? <POPPreview blocks={parseContent(pop.content || '')} />
              : <MarkdownPreview content={pop.content || ''} />}
          </div>
        </Card>
      </div>
    </div>
  );
}

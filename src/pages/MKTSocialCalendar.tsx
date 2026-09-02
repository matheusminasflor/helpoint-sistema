import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  Plus, Calendar as CalendarIcon, Instagram, Youtube, Twitter, Linkedin, Facebook,
  MessageSquare, Megaphone, MoreHorizontal, Pencil, Trash2, CheckCircle, Upload, X, Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useMKTSocialPosts, useCreateSocialPost, useDeleteSocialPost, usePublishPost,
} from '@/hooks/useMKTSocialPosts';
import { useMKTSocialAccounts } from '@/hooks/useMKTSocialAccounts';
import {
  SOCIAL_PLATFORM_LABELS, POST_TYPE_LABELS, POST_STATUS_LABELS, POST_STATUS_COLORS,
  PLATFORM_COLORS, type SocialPlatform, type PostType,
} from '@/types/mkt';
import { format, isSameDay, parseISO, startOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PlatformIcon = ({ platform, className }: { platform: SocialPlatform; className?: string }) => {
  const icons: Record<SocialPlatform, React.ReactNode> = {
    instagram: <Instagram className={className} />,
    facebook: <Facebook className={className} />,
    meta_ads: <Megaphone className={className} />,
    whatsapp: <MessageSquare className={className} />,
    youtube: <Youtube className={className} />,
    twitter: <Twitter className={className} />,
    linkedin: <Linkedin className={className} />,
    tiktok: <span className={className}>TT</span>,
  };
  return <>{icons[platform]}</>;
};

export default function MKTSocialCalendar() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<string>('__all__');
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  const [uploading, setUploading] = useState(false);

  const { data: posts, isLoading } = useMKTSocialPosts();
  const { data: accounts = [] } = useMKTSocialAccounts();
  const createPost = useCreateSocialPost();
  const deletePost = useDeleteSocialPost();
  const publishPost = usePublishPost();

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    platform: 'instagram' as SocialPlatform,
    post_type: 'feed' as PostType,
    account_id: '' as string | '',
    scheduled_date: '',
    scheduled_time: '10:00',
    hashtags: '',
    strategy_notes: '',
    media_url: '' as string,
    external_link: '' as string,
  });

  const accountsForPlatform = useMemo(
    () => (accounts || []).filter((a: any) => !formData.platform || a.platform === formData.platform),
    [accounts, formData.platform],
  );

  const filteredPosts = posts?.filter(post => {
    if (platformFilter !== '__all__' && post.platform !== platformFilter) return false;
    if (statusFilter !== '__all__' && post.status !== statusFilter) return false;
    return true;
  });

  const postsForSelectedDate = filteredPosts?.filter(post =>
    post.scheduled_at && selectedDate && isSameDay(parseISO(post.scheduled_at), selectedDate),
  );

  const weekStart = startOfWeek(selectedDate || new Date(), { locale: ptBR });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getPostsForDay = (day: Date) =>
    filteredPosts?.filter(post => post.scheduled_at && isSameDay(parseISO(post.scheduled_at), day)) || [];

  const handleImageUpload = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('A imagem precisa ter no máximo 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `social/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('mkt-media').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('mkt-media').getPublicUrl(path);
      setFormData(p => ({ ...p, media_url: pub.publicUrl }));
      toast.success('Imagem anexada.');
    } catch (e: any) {
      toast.error('Falha no upload: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    const scheduledAt = formData.scheduled_date
      ? `${formData.scheduled_date}T${formData.scheduled_time}:00`
      : undefined;

    const hashtags = formData.hashtags
      .split(/[,\s]+/).map(t => t.replace('#', '').trim()).filter(Boolean);

    await createPost.mutateAsync({
      title: formData.title,
      content: formData.content || undefined,
      platform: formData.platform,
      post_type: formData.post_type,
      scheduled_at: scheduledAt,
      status: scheduledAt ? 'scheduled' : 'draft',
      hashtags,
      account_id: formData.account_id || null,
      external_link: formData.external_link || null,
      strategy_notes: formData.strategy_notes || null,
      media_urls: formData.media_url ? [formData.media_url] : [],
    });

    setIsFormOpen(false);
    setFormData({
      title: '', content: '', platform: 'instagram', post_type: 'feed',
      account_id: '', scheduled_date: '', scheduled_time: '10:00', hashtags: '',
      strategy_notes: '', media_url: '', external_link: '',
    });
  };

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`Excluir "${title}"?`)) await deletePost.mutateAsync(id);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <PageHeader
            className="bg-transparent border-0 px-0 py-0"
            identifier="MKT"
            title="Cronograma social"
            description="Planeje stories, feed, tráfego pago e listas de transmissão."
          />
        </div>

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Novo Post</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Programar publicação</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Título interno *</Label>
                <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="Lançamento campanha verão" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select value={formData.platform} onValueChange={v => setFormData(p => ({ ...p, platform: v as SocialPlatform, account_id: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SOCIAL_PLATFORM_LABELS).map(([k, l]) => (
                        <SelectItem key={k} value={k}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de post</Label>
                  <Select value={formData.post_type} onValueChange={v => setFormData(p => ({ ...p, post_type: v as PostType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(POST_TYPE_LABELS).map(([k, l]) => (
                        <SelectItem key={k} value={k}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Conta / Perfil</Label>
                <Select value={formData.account_id || '__none__'} onValueChange={v => setFormData(p => ({ ...p, account_id: v === '__none__' ? '' : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={accountsForPlatform.length ? 'Selecione a conta' : 'Nenhuma conta conectada para esta plataforma'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem conta vinculada —</SelectItem>
                    {accountsForPlatform.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Conecte mais contas em <a className="text-primary underline" href="/mkt/configuracoes">Configurações MKT</a>.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Conteúdo / legenda</Label>
                <Textarea value={formData.content} onChange={e => setFormData(p => ({ ...p, content: e.target.value }))} rows={3} placeholder="Texto do post..." />
              </div>

              {/* Mídia: upload ou link */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider">Mídia</Label>
                  {formData.media_url && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setFormData(p => ({ ...p, media_url: '' }))}>
                      <X className="w-3 h-3 mr-1" /> Remover
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Anexar imagem (até 5 MB)</Label>
                    <label className="flex items-center justify-center h-10 px-3 rounded-md border border-dashed border-border cursor-pointer hover:border-primary text-xs text-muted-foreground">
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      {uploading ? 'Enviando...' : (formData.media_url ? 'Trocar imagem' : 'Selecionar imagem')}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">… ou link externo (Drive, vídeo, site)</Label>
                    <div className="relative">
                      <LinkIcon className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                      <Input className="pl-8" type="url" placeholder="https://..."
                        value={formData.external_link}
                        onChange={e => setFormData(p => ({ ...p, external_link: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {formData.media_url && (
                  <img src={formData.media_url} alt="preview" className="max-h-40 rounded-md border border-border object-cover mx-auto" />
                )}
              </div>

              <div className="space-y-2">
                <Label>Estratégia / observação interna</Label>
                <Textarea
                  value={formData.strategy_notes}
                  onChange={e => setFormData(p => ({ ...p, strategy_notes: e.target.value }))}
                  rows={3}
                  placeholder="Objetivo do post, público-alvo, gatilho, métrica esperada..."
                />
                <p className="text-xs text-muted-foreground">Visível apenas para a equipe de marketing.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={formData.scheduled_date} onChange={e => setFormData(p => ({ ...p, scheduled_date: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Hora</Label>
                  <Input type="time" value={formData.scheduled_time} onChange={e => setFormData(p => ({ ...p, scheduled_time: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Hashtags</Label>
                <Input value={formData.hashtags} onChange={e => setFormData(p => ({ ...p, hashtags: e.target.value }))} placeholder="#marketing #lancamento" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createPost.isPending || uploading}>
                  {createPost.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Plataforma" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas plataformas</SelectItem>
            {Object.entries(SOCIAL_PLATFORM_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos status</SelectItem>
            {Object.entries(POST_STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Calendário + semana */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Skeleton className="h-80" /><Skeleton className="h-80 lg:col-span-3" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-4">
              <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} locale={ptBR} className="rounded-md" />
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" /> Semana de {format(weekStart, "dd 'de' MMMM", { locale: ptBR })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day, index) => {
                  const dayPosts = getPostsForDay(day);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div key={index}
                      className={`min-h-32 p-2 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5'
                        : isToday ? 'border-primary/50'
                        : 'border-border hover:border-primary/30'
                      }`}
                      onClick={() => setSelectedDate(day)}>
                      <div className="text-center mb-2">
                        <p className="text-xs text-muted-foreground uppercase">{format(day, 'EEE', { locale: ptBR })}</p>
                        <p className={`text-lg font-medium ${isToday ? 'text-primary' : ''}`}>{format(day, 'd')}</p>
                      </div>
                      <div className="space-y-1">
                        {dayPosts.slice(0, 3).map(post => (
                          <div key={post.id} className={`p-1 rounded text-xs truncate ${PLATFORM_COLORS[post.platform]} text-white`}>
                            {post.title}
                          </div>
                        ))}
                        {dayPosts.length > 3 && <p className="text-xs text-muted-foreground text-center">+{dayPosts.length - 3} mais</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Posts do dia */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Posts para {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : 'data selecionada'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {postsForSelectedDate && postsForSelectedDate.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {postsForSelectedDate.map(post => {
                const account = (accounts as any[]).find(a => a.id === post.account_id);
                return (
                  <Card key={post.id} className="relative overflow-hidden">
                    {post.media_urls?.[0] && (
                      <img src={post.media_urls[0]} alt={post.title} className="w-full h-32 object-cover" />
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${PLATFORM_COLORS[post.platform]} text-white`}>
                            <PlatformIcon platform={post.platform} className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-medium">{SOCIAL_PLATFORM_LABELS[post.platform]}</p>
                            <p className="text-xs text-muted-foreground">{POST_TYPE_LABELS[post.post_type]}</p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {post.status === 'scheduled' && (
                              <DropdownMenuItem onClick={() => publishPost.mutate(post.id)}>
                                <CheckCircle className="w-4 h-4 mr-2" /> Marcar publicado
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(post.id, post.title)}>
                              <Trash2 className="w-4 h-4 mr-2" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <h3 className="font-medium text-sm mb-1">{post.title}</h3>
                      {account && <p className="text-xs text-muted-foreground mb-2">@{account.account_name}</p>}
                      {post.content && <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{post.content}</p>}

                      {post.strategy_notes && (
                        <div className="mt-2 p-2 rounded-md bg-amber-50 border border-amber-100 text-[11px] text-amber-900">
                          <b>Estratégia:</b> {post.strategy_notes}
                        </div>
                      )}
                      {post.external_link && (
                        <a href={post.external_link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline">
                          <LinkIcon className="w-3 h-3" /> Link externo
                        </a>
                      )}

                      <div className="flex items-center justify-between mt-3">
                        <Badge variant="outline" className={POST_STATUS_COLORS[post.status]}>
                          {POST_STATUS_LABELS[post.status]}
                        </Badge>
                        {post.scheduled_at && (
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(post.scheduled_at), 'HH:mm')}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum post agendado para esta data.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

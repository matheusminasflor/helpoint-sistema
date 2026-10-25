// Defeito 11 (2026-10-24): o Cronograma do Marketing ganha "Editar" (o hook de atualizar já existia, sem quem chamasse).
import { readFileSync, writeFileSync } from 'node:fs';
const F = 'src/telas/MKTSocialCalendar.tsx';
let s = readFileSync(F, 'utf8');
const troca = (de, para) => { if (!s.includes(de)) throw new Error('não achei: ' + de.slice(0, 70)); s = s.replace(de, para); };
troca('  useMKTSocialPosts, useCreateSocialPost, useDeleteSocialPost, usePublishPost,\n', '  useMKTSocialPosts, useCreateSocialPost, useDeleteSocialPost, usePublishPost, useUpdateSocialPost,\n');
troca('  const createPost = useCreateSocialPost();\n', '  const createPost = useCreateSocialPost();\n  const updatePost = useUpdateSocialPost();\n  // O post aberto para editar (null = post novo).\n  const [editandoId, setEditandoId] = useState<string | null>(null);\n');
troca("  const podeExcluir = can('calendar', 'delete');\n", "  const podeExcluir = can('calendar', 'delete');\n  const podeEditar = can('calendar', 'edit');\n");
troca(`    await createPost.mutateAsync({
      title: formData.title,`, `    const dados = {
      title: formData.title,`);
troca(`      media_urls: formData.media_url ? [formData.media_url] : [],
    });

    setIsFormOpen(false);`, `      media_urls: formData.media_url ? [formData.media_url] : [],
    };
    if (editandoId) {
      // Publicado continua publicado; o resto segue a data, como no post novo.
      const atual = posts?.find((p) => p.id === editandoId);
      await updatePost.mutateAsync({ id: editandoId, ...dados, status: atual?.status === 'published' ? 'published' : dados.status } as never);
    } else {
      await createPost.mutateAsync(dados);
    }

    setIsFormOpen(false);
    setEditandoId(null);`);
troca("  const handleDelete = async (id: string, title: string) => {", `  const abrirParaEditar = (post: NonNullable<typeof posts>[number]) => {
    const quando = post.scheduled_at ? parseISO(post.scheduled_at) : null;
    setFormData({
      title: post.title ?? '', content: post.content ?? '', platform: post.platform, post_type: post.post_type,
      account_id: post.account_id ?? '', scheduled_date: quando ? format(quando, 'yyyy-MM-dd') : '',
      scheduled_time: quando ? format(quando, 'HH:mm') : '10:00', hashtags: (post.hashtags ?? []).map((t: string) => '#' + t).join(' '),
      strategy_notes: post.strategy_notes ?? '', media_url: post.media_urls?.[0] ?? '', external_link: post.external_link ?? '',
    });
    setEditandoId(post.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string, title: string) => {`);
troca('        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>', `        <Dialog open={isFormOpen} onOpenChange={(o) => {
          setIsFormOpen(o);
          if (!o && editandoId) {
            setEditandoId(null);
            setFormData({ title: '', content: '', platform: 'instagram', post_type: 'feed', account_id: '', scheduled_date: '',
              scheduled_time: '10:00', hashtags: '', strategy_notes: '', media_url: '', external_link: '' });
          }
        }}>`);
troca('            <DialogHeader><DialogTitle>Programar publicação</DialogTitle></DialogHeader>', '            <DialogHeader><DialogTitle>{editandoId ? \'Editar publicação\' : \'Programar publicação\'}</DialogTitle></DialogHeader>');
troca("                <Button type=\"submit\" disabled={createPost.isPending || uploading}>\n                  {createPost.isPending ? 'Salvando...' : 'Salvar'}",
  "                <Button type=\"submit\" disabled={createPost.isPending || updatePost.isPending || uploading}>\n                  {createPost.isPending || updatePost.isPending ? 'Salvando…' : 'Salvar'}");
troca("                        {((podePublicar && post.status === 'scheduled') || podeExcluir) && (", "                        {((podePublicar && post.status === 'scheduled') || podeExcluir || podeEditar) && (");
troca(`                            <DropdownMenuContent align="end">
                              {podePublicar && post.status === 'scheduled' && (`, `                            <DropdownMenuContent align="end">
                              {podeEditar && (
                                <DropdownMenuItem onClick={() => abrirParaEditar(post)}>
                                  <Pencil className="w-4 h-4 mr-2" aria-hidden="true" /> Editar
                                </DropdownMenuItem>
                              )}
                              {podePublicar && post.status === 'scheduled' && (`);
writeFileSync(F, s);
console.log('ok');

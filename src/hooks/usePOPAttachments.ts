import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { POPAttachment } from '@/types/pop-blocks';

export function usePOPAttachments(popId: string | undefined) {
  return useQuery({
    queryKey: ['pop-attachments', popId],
    queryFn: async () => {
      if (!popId) return [];
      
      const { data, error } = await supabase
        .from('pop_attachments')
        .select('*')
        .eq('pop_id', popId)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as POPAttachment[];
    },
    enabled: !!popId
  });
}

export function useUploadPOPMedia() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      file, 
      popId 
    }: { 
      file: File; 
      popId?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) throw new Error('Usuário não autenticado');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', userData.user.id)
        .single();
      
      if (!profile) throw new Error('Perfil não encontrado');
      
      // Determine file type
      let fileType: 'image' | 'video' | 'gif';
      if (file.type.startsWith('video/')) {
        fileType = 'video';
      } else if (file.type === 'image/gif') {
        fileType = 'gif';
      } else {
        fileType = 'image';
      }
      
      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.tenant_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('pop-media')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from('pop-media')
        .getPublicUrl(fileName);
      
      return {
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_type: fileType,
        file_size: file.size,
        tenant_id: profile.tenant_id
      };
    },
    onError: (error) => {
      console.error('Upload error:', error);
      toast.error('Erro ao fazer upload do arquivo. Tente novamente ou avise o suporte.');
    }
  });
}

export function useCreatePOPAttachment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (attachment: Omit<POPAttachment, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('pop_attachments')
        .insert(attachment)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pop-attachments', variables.pop_id] });
    },
    onError: (error) => {
      console.error('Create attachment error:', error);
      toast.error('Erro ao salvar anexo. Tente novamente ou avise o suporte.');
    }
  });
}

export function useDeletePOPAttachment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, fileUrl, popId }: { id: string; fileUrl: string; popId: string }) => {
      // Delete from storage
      const path = fileUrl.split('/pop-media/')[1];
      if (path) {
        await supabase.storage.from('pop-media').remove([path]);
      }
      
      // Delete from database
      const { error } = await supabase
        .from('pop_attachments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return popId;
    },
    onSuccess: (popId) => {
      queryClient.invalidateQueries({ queryKey: ['pop-attachments', popId] });
      toast.success('Anexo removido');
    },
    onError: (error) => {
      console.error('Delete attachment error:', error);
      toast.error('Erro ao remover anexo. Tente novamente ou avise o suporte.');
    }
  });
}

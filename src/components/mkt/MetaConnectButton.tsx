import { useState } from 'react';
import { Instagram, Facebook, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { SocialPlatform } from '@/types/mkt';

interface MetaConnectButtonProps {
  platform: 'instagram' | 'facebook';
  onSuccess?: () => void;
}

export function MetaConnectButton({ platform, onSuccess }: MetaConnectButtonProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);

    try {
      // Call edge function to get OAuth URL
      const { data, error } = await supabase.functions.invoke('mkt-meta-oauth', {
        body: { 
          action: 'get_auth_url',
          platform,
          redirect_uri: `${window.location.origin}/mkt/social?oauth_callback=true`
        },
      });

      if (error) throw error;

      if (data?.auth_url) {
        // Open Meta OAuth in a popup or redirect
        const width = 600;
        const height = 700;
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;
        
        const popup = window.open(
          data.auth_url,
          'meta_oauth',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
        );

        // Listen for OAuth callback
        const checkPopup = setInterval(() => {
          try {
            if (popup?.closed) {
              clearInterval(checkPopup);
              setIsConnecting(false);
              // Refresh accounts list
              onSuccess?.();
            }
            
            // Check if popup redirected back to our domain
            if (popup?.location?.href?.includes(window.location.origin)) {
              const url = new URL(popup.location.href);
              const code = url.searchParams.get('code');
              const error = url.searchParams.get('error');
              
              if (code) {
                // Exchange code for token (state validado no servidor)
                handleOAuthCallback(code, platform, url.searchParams.get('state') || '');
                popup.close();
              } else if (error) {
                toast.error('Autorização negada: ' + (url.searchParams.get('error_description') || error));
                popup.close();
              }
              
              clearInterval(checkPopup);
              setIsConnecting(false);
            }
          } catch (e) {
            // Cross-origin error - popup is on Meta's domain, keep waiting
          }
        }, 500);

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(checkPopup);
          setIsConnecting(false);
        }, 5 * 60 * 1000);
      }
    } catch (error: any) {
      console.error('OAuth error:', error);
      toast.error('Erro ao iniciar conexão: ' + (error.message || 'Erro desconhecido'));
      setIsConnecting(false);
    }
  };

  const handleOAuthCallback = async (code: string, platform: string, state: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('mkt-meta-oauth', {
        body: { 
          action: 'exchange_code',
          code,
          state,
          platform,
          redirect_uri: `${window.location.origin}/mkt/social?oauth_callback=true`
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`${platform === 'instagram' ? 'Instagram' : 'Facebook'} conectado com sucesso`);
        onSuccess?.();
      } else {
        throw new Error(data?.error || 'Falha ao trocar código por token');
      }
    } catch (error: any) {
      console.error('Token exchange error:', error);
      toast.error('Erro ao finalizar conexão: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const Icon = platform === 'instagram' ? Instagram : Facebook;
  const label = platform === 'instagram' ? 'Instagram' : 'Facebook';
  const bgColor = platform === 'instagram' 
    ? 'hover:bg-accent hover:text-accent-foreground' 
    : 'hover:bg-blue-600 hover:text-white hover:border-transparent';

  return (
    <Button
      variant="outline"
      onClick={handleConnect}
      disabled={isConnecting}
      className={`gap-2 transition-all ${bgColor}`}
    >
      {isConnecting ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Icon className="w-4 h-4" />
      )}
      {label}
      {!isConnecting && <ExternalLink className="w-3 h-3 opacity-50" />}
    </Button>
  );
}

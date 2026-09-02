import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader2, Play, Film, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useUploadPOPMedia } from '@/hooks/usePOPAttachments';

interface VideoToGifConverterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  onGifCreated: (gifUrl: string) => void;
}

declare global {
  interface Window {
    gifshot: {
      createGIF: (options: any, callback: (obj: { error: boolean; image: string; errorCode?: string; errorMsg?: string }) => void) => void;
    };
  }
}

export function VideoToGifConverter({
  open,
  onOpenChange,
  videoUrl,
  onGifCreated
}: VideoToGifConverterProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [frameInterval, setFrameInterval] = useState([0.3]);
  const [numFrames, setNumFrames] = useState([15]);
  const [gifWidth, setGifWidth] = useState([480]);
  const [previewGif, setPreviewGif] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const uploadMedia = useUploadPOPMedia();

  useEffect(() => {
    // Load gifshot script dynamically
    if (open && !scriptLoaded && !window.gifshot) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/gifshot@0.4.5/dist/gifshot.min.js';
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => toast.error('Erro ao carregar biblioteca de GIF. Tente novamente ou avise o suporte.');
      document.body.appendChild(script);
    } else if (window.gifshot) {
      setScriptLoaded(true);
    }
  }, [open, scriptLoaded]);

  const convertToGif = async () => {
    if (!videoRef.current || !window.gifshot) {
      toast.error('Aguarde o carregamento completo');
      return;
    }

    setIsConverting(true);
    setPreviewGif(null);

    try {
      const video = videoRef.current;
      
      // Calculate aspect ratio
      const aspectRatio = video.videoHeight / video.videoWidth;
      const width = gifWidth[0];
      const height = Math.round(width * aspectRatio);

      window.gifshot.createGIF({
        video: [videoUrl],
        gifWidth: width,
        gifHeight: height,
        interval: frameInterval[0],
        numFrames: numFrames[0],
        progressCallback: (captureProgress: number) => {
          console.log('Progress:', Math.round(captureProgress * 100) + '%');
        }
      }, (obj) => {
        setIsConverting(false);
        
        if (!obj.error) {
          setPreviewGif(obj.image);
          toast.success('GIF criado! Clique em Salvar para adicionar ao POP.');
        } else {
          console.error('GIF error:', obj.errorCode, obj.errorMsg);
          toast.error('Erro ao criar GIF: ' + (obj.errorMsg || 'Erro desconhecido'));
        }
      });
    } catch (error) {
      setIsConverting(false);
      console.error('Conversion error:', error);
      toast.error('Erro na conversão. Tente novamente ou avise o suporte.');
    }
  };

  const saveGif = async () => {
    if (!previewGif) return;

    try {
      // Convert base64 to blob
      const response = await fetch(previewGif);
      const blob = await response.blob();
      const file = new File([blob], `gif_${Date.now()}.gif`, { type: 'image/gif' });
      
      const result = await uploadMedia.mutateAsync({ file });
      onGifCreated(result.file_url);
      onOpenChange(false);
      setPreviewGif(null);
      toast.success('GIF salvo com sucesso');
    } catch (error) {
      console.error('Save GIF error:', error);
      toast.error('Erro ao salvar GIF. Tente novamente ou avise o suporte.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Converter Vídeo para GIF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Video Preview */}
          <div className="rounded-lg overflow-hidden bg-black">
            <video 
              ref={videoRef}
              src={videoUrl}
              controls
              className="w-full max-h-64 object-contain"
            />
          </div>

          {/* Settings */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm">Intervalo entre frames: {frameInterval[0]}s</Label>
              <Slider
                value={frameInterval}
                onValueChange={setFrameInterval}
                min={0.1}
                max={1}
                step={0.1}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Número de frames: {numFrames[0]}</Label>
              <Slider
                value={numFrames}
                onValueChange={setNumFrames}
                min={5}
                max={30}
                step={1}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Largura: {gifWidth[0]}px</Label>
              <Slider
                value={gifWidth}
                onValueChange={setGifWidth}
                min={240}
                max={800}
                step={40}
              />
            </div>
          </div>

          {/* GIF Preview */}
          {previewGif && (
            <div className="space-y-2">
              <Label className="text-sm">Preview do GIF:</Label>
              <div className="rounded-lg overflow-hidden bg-muted flex justify-center p-4">
                <img 
                  src={previewGif} 
                  alt="GIF Preview" 
                  className="max-h-64 object-contain rounded"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {previewGif ? (
            <Button onClick={saveGif} disabled={uploadMedia.isPending} className="gap-2">
              {uploadMedia.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Salvar GIF
            </Button>
          ) : (
            <Button 
              onClick={convertToGif} 
              disabled={isConverting || !scriptLoaded}
              className="gap-2"
            >
              {isConverting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {isConverting ? 'Convertendo...' : 'Gerar GIF'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

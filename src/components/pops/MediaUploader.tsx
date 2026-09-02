import { useState, useCallback } from 'react';
import { Upload, X, Image, Video, Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUploadPOPMedia } from '@/hooks/usePOPAttachments';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface UploadedMedia {
  file_url: string;
  file_name: string;
  file_type: 'image' | 'video' | 'gif';
  file_size: number;
}

interface MediaUploaderProps {
  onUpload: (media: UploadedMedia) => void;
  onConvertToGif?: (videoUrl: string) => void;
  accept?: string;
  maxSize?: number; // MB
  maxImageWidth?: number; // Max width for image resize
  className?: string;
}

// Resize image to optimal width for tutorials
const resizeImage = (file: File, maxWidth: number): Promise<File> => {
  return new Promise((resolve) => {
    const img = document.createElement('img');
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      
      // If already smaller than max width, no need to resize
      if (img.width <= maxWidth) {
        resolve(file);
        return;
      }
      
      const canvas = document.createElement('canvas');
      const ratio = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = Math.round(img.height * ratio);
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      
      // Use high quality resize
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const resizedFile = new File([blob], file.name, { 
              type: file.type,
              lastModified: Date.now()
            });
            resolve(resizedFile);
          } else {
            resolve(file);
          }
        }, 
        file.type, 
        0.9 // Quality for JPEG
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    
    img.src = objectUrl;
  });
};

export function MediaUploader({ 
  onUpload, 
  onConvertToGif,
  accept = 'image/*,video/mp4,video/webm,.gif',
  maxSize = 20,
  maxImageWidth = 800,
  className 
}: MediaUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: string } | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const uploadMedia = useUploadPOPMedia();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFile = async (file: File) => {
    // Validate size
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > maxSize) {
      toast.error(`Arquivo muito grande. Máximo: ${maxSize}MB`);
      return;
    }

    // Validate type
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isGif = file.type === 'image/gif';
    
    if (!isImage && !isVideo) {
      toast.error('Tipo de arquivo não suportado');
      return;
    }

    let processedFile = file;

    // Resize images (but not GIFs, to preserve animation)
    if (isImage && !isGif) {
      setIsResizing(true);
      try {
        const originalSize = file.size;
        processedFile = await resizeImage(file, maxImageWidth);
        
        if (processedFile.size < originalSize) {
          const savedPercent = Math.round((1 - processedFile.size / originalSize) * 100);
          toast.info(`Imagem otimizada (${savedPercent}% menor)`);
        }
      } catch (error) {
        console.error('Error resizing image:', error);
      } finally {
        setIsResizing(false);
      }
    }

    // Show preview
    const previewUrl = URL.createObjectURL(processedFile);
    setPreview({ url: previewUrl, type: processedFile.type });

    try {
      const result = await uploadMedia.mutateAsync({ file: processedFile });
      onUpload(result as UploadedMedia);
      toast.success('Arquivo enviado com sucesso');
      setPreview(null);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const clearPreview = () => {
    if (preview?.url) {
      URL.revokeObjectURL(preview.url);
    }
    setPreview(null);
  };

  return (
    <div className={className}>
      {preview ? (
        <Card className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 z-10 bg-background/80"
            onClick={clearPreview}
          >
            <X className="h-4 w-4" />
          </Button>
          <CardContent className="p-4">
            {preview.type.startsWith('image/') ? (
              <img 
                src={preview.url} 
                alt="Preview" 
                className="max-h-64 w-full object-contain rounded-lg"
              />
            ) : (
              <video 
                src={preview.url} 
                controls 
                className="max-h-64 w-full rounded-lg"
              />
            )}
            {(uploadMedia.isPending || isResizing) && (
              <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isResizing ? 'Otimizando imagem...' : 'Enviando...'}
              </div>
            )}
            {preview.type.startsWith('video/') && onConvertToGif && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-2"
                onClick={() => onConvertToGif(preview.url)}
              >
                <Film className="h-4 w-4" />
                Converter para GIF
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer",
            isDragging 
              ? "border-primary bg-primary/5" 
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          )}
        >
          <Label htmlFor="media-upload" className="cursor-pointer">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="p-3 bg-muted rounded-full">
                <Upload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  Arraste arquivos ou clique para upload
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Imagens são redimensionadas automaticamente (máx. {maxImageWidth}px)
                </p>
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Image className="h-3 w-3" />
                  PNG, JPG
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Video className="h-3 w-3" />
                  MP4, WEBM
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Film className="h-3 w-3" />
                  GIF
                </div>
              </div>
            </div>
          </Label>
          <Input
            id="media-upload"
            type="file"
            accept={accept}
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}

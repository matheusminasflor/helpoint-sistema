import { useState, useEffect } from 'react';
import { POPBlock } from '@/types/pop-blocks';
import { X, ZoomIn, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface POPPreviewProps {
  blocks: POPBlock[];
  title?: string;
  className?: string;
}

export function POPPreview({ blocks, title, className }: POPPreviewProps) {
  const [zoomedImage, setZoomedImage] = useState<{ url: string; caption?: string } | null>(null);

  // Handle ESC key to close zoom
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomedImage(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  if (blocks.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full text-muted-foreground py-16", className)}>
        <div className="text-center">
          <p className="text-lg">Adicione blocos de conteúdo para começar</p>
          <p className="text-sm mt-2">Use o botão "Adicionar Bloco" à esquerda</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <article className={cn("w-full", className)}>
        {/* Document Title */}
        {title && (
          <h1 className="text-2xl md:text-3xl font-bold text-foreground leading-tight mb-6">
            {title}
          </h1>
        )}
        
        {/* Document Body - Clean article style like Bling */}
        <div className="space-y-4">
          {blocks.map((block) => {
            switch (block.type) {
              case 'heading':
                const HeadingTag = block.level === 1 ? 'h1' : block.level === 3 ? 'h3' : 'h2';
                const headingClasses = {
                  1: 'text-2xl md:text-3xl font-bold mt-8 mb-4 first:mt-0',
                  2: 'text-xl md:text-2xl font-bold mt-8 mb-4 first:mt-0',
                  3: 'text-lg md:text-xl font-semibold mt-6 mb-3'
                };
                return (
                  <HeadingTag 
                    key={block.id}
                    className={cn(
                      headingClasses[block.level || 2],
                      "text-foreground"
                    )}
                  >
                    {block.content || <span className="text-muted-foreground/50 italic">Título...</span>}
                  </HeadingTag>
                );

              case 'text':
                // Support for inline links - detect markdown links
                const content = block.content || '';
                const parts = content.split(/(\[.+?\]\(.+?\))/g);
                
                return (
                  <p key={block.id} className="text-base leading-relaxed text-foreground/90">
                    {parts.map((part, i) => {
                      const linkMatch = part.match(/\[(.+?)\]\((.+?)\)/);
                      if (linkMatch) {
                        return (
                          <a 
                            key={i}
                            href={linkMatch[2]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            {linkMatch[1]}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        );
                      }
                      return part || <span key={i} className="text-muted-foreground/50 italic">Parágrafo...</span>;
                    })}
                  </p>
                );

              case 'step':
                // Clean paragraph style - no numbered badges
                return (
                  <p key={block.id} className="text-base leading-relaxed text-foreground/90">
                    {block.content || <span className="text-muted-foreground/50 italic">Descreva o passo...</span>}
                  </p>
                );

              case 'tip':
              case 'alert':
              case 'success':
              case 'error':
                // Simple highlighted text with bold prefix
                const prefixes = {
                  tip: { label: 'Dica:', color: 'text-blue-600 dark:text-blue-400' },
                  alert: { label: 'Atenção:', color: 'text-amber-600 dark:text-amber-400' },
                  success: { label: 'Pronto', color: 'text-green-600 dark:text-green-400' },
                  error: { label: 'Importante:', color: 'text-red-600 dark:text-red-400' }
                };
                const prefix = prefixes[block.type];
                
                return (
                  <p key={block.id} className="text-base leading-relaxed text-foreground/90">
                    <strong className={prefix.color}>{prefix.label}</strong>{' '}
                    {block.content || <span className="text-muted-foreground/50 italic">Conteúdo...</span>}
                  </p>
                );

              case 'image':
                if (!block.imageUrl) {
                  return (
                    <div 
                      key={block.id}
                      className="my-6 border-2 border-dashed border-muted-foreground/20 rounded-lg py-10 text-center"
                    >
                      <p className="text-muted-foreground text-sm">
                        {block.caption || 'Adicione uma imagem ilustrativa'}
                      </p>
                    </div>
                  );
                }
                return (
                  <figure key={block.id} className="my-6">
                    <div 
                      className="rounded-lg overflow-hidden border cursor-zoom-in group relative inline-block"
                      onClick={() => setZoomedImage({ url: block.imageUrl!, caption: block.caption })}
                    >
                      <img 
                        src={block.imageUrl} 
                        alt={block.caption || 'Imagem do tutorial'} 
                        className="max-w-full h-auto transition-opacity group-hover:opacity-95"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                        <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-70 transition-opacity drop-shadow-lg" />
                      </div>
                    </div>
                    {block.caption && (
                      <figcaption className="text-sm text-muted-foreground mt-2">
                        {block.caption}
                      </figcaption>
                    )}
                  </figure>
                );

              case 'video':
                if (!block.videoUrl) {
                  return (
                    <div 
                      key={block.id}
                      className="my-6 border-2 border-dashed border-muted-foreground/20 rounded-lg py-10 text-center"
                    >
                      <p className="text-muted-foreground text-sm">
                        {block.caption || 'Adicione um vídeo instrucional'}
                      </p>
                    </div>
                  );
                }
                return (
                  <figure key={block.id} className="my-6">
                    <div className="rounded-lg overflow-hidden border bg-black inline-block">
                      <video 
                        src={block.videoUrl} 
                        controls 
                        className="max-w-full h-auto"
                        playsInline
                      >
                        Seu navegador não suporta vídeos.
                      </video>
                    </div>
                    {block.caption && (
                      <figcaption className="text-sm text-muted-foreground mt-2">
                        {block.caption}
                      </figcaption>
                    )}
                  </figure>
                );

              case 'code':
                return (
                  <div key={block.id} className="my-6 rounded-lg overflow-hidden border bg-slate-900">
                    <pre className="p-4 overflow-x-auto">
                      <code className="text-sm font-mono text-slate-100">
                        {block.content || <span className="opacity-50">// Código...</span>}
                      </code>
                    </pre>
                  </div>
                );

              case 'quote':
                return (
                  <blockquote 
                    key={block.id}
                    className="my-6 pl-4 border-l-4 border-primary/40 italic text-foreground/80"
                  >
                    <p className="text-base leading-relaxed">
                      {block.content || <span className="opacity-50">Citação...</span>}
                    </p>
                    {block.author && (
                      <footer className="mt-2 text-sm text-muted-foreground not-italic">
                        — {block.author}
                      </footer>
                    )}
                  </blockquote>
                );

              case 'divider':
                return (
                  <hr key={block.id} className="my-8 border-t border-border" />
                );

              case 'list':
                if (!block.listItems || block.listItems.length === 0) {
                  return (
                    <div key={block.id} className="my-4 text-muted-foreground/50 italic">
                      Lista vazia...
                    </div>
                  );
                }
                return (
                  <ul key={block.id} className="my-4 space-y-2 list-disc list-inside">
                    {block.listItems.map((item, i) => (
                      <li key={i} className="text-base text-foreground/90">{item}</li>
                    ))}
                  </ul>
                );

              default:
                return (
                  <p key={block.id} className="text-base leading-relaxed text-foreground/90">
                    {block.content}
                  </p>
                );
            }
          })}
        </div>
      </article>

      {/* Image Zoom Overlay */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center animate-in fade-in duration-200"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-foreground/10 text-foreground/80 hover:bg-foreground/20 hover:text-foreground transition-colors"
            onClick={() => setZoomedImage(null)}
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
          
          <div className="absolute top-4 left-4 text-white/40 text-sm flex items-center gap-2">
            <kbd className="px-2 py-1 bg-white/10 rounded text-xs">ESC</kbd>
            <span>para fechar</span>
          </div>
          
          <div 
            className="max-w-[90vw] max-h-[85vh] flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <img 
              src={zoomedImage.url} 
              alt={zoomedImage.caption || 'Imagem ampliada'} 
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            {zoomedImage.caption && (
              <p className="text-white/80 text-center mt-4 text-base max-w-2xl">
                {zoomedImage.caption}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

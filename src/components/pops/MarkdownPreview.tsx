import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { X, ZoomIn, ExternalLink } from 'lucide-react';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const [zoomedImage, setZoomedImage] = useState<{ url: string; caption?: string } | null>(null);

  // Handle ESC key to close zoom
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomedImage(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  if (!content.trim()) {
    return (
      <div className={cn("text-muted-foreground/50 italic py-8 text-center", className)}>
        O conteúdo aparecerá aqui...
      </div>
    );
  }

  const lines = content.split('\n');
  const elements: JSX.Element[] = [];
  let currentList: { items: string[]; type: 'ul' | 'ol' } | null = null;
  let codeBlock: { lines: string[]; active: boolean } = { lines: [], active: false };

  const flushList = () => {
    if (currentList && currentList.items.length > 0) {
      const ListTag = currentList.type === 'ol' ? 'ol' : 'ul';
      elements.push(
        <ListTag 
          key={`list-${elements.length}`} 
          className={cn(
            "my-4 ml-6 space-y-1",
            currentList.type === 'ol' ? 'list-decimal' : 'list-disc'
          )}
        >
          {currentList.items.map((item, i) => (
            <li key={i} className="text-base text-foreground/90">{formatInlineText(item)}</li>
          ))}
        </ListTag>
      );
      currentList = null;
    }
  };

  const flushCode = () => {
    if (codeBlock.lines.length > 0) {
      elements.push(
        <div key={`code-${elements.length}`} className="my-6 rounded-lg overflow-hidden border bg-slate-900">
          <pre className="p-4 overflow-x-auto">
            <code className="text-sm font-mono text-slate-100">
              {codeBlock.lines.join('\n')}
            </code>
          </pre>
        </div>
      );
      codeBlock = { lines: [], active: false };
    }
  };

  // Só permite http(s) e caminhos relativos; bloqueia javascript:/data:
  function safeUrl(url: string): string {
    const u = (url || '').trim();
    if (/^(https?:)?\/\//i.test(u) || u.startsWith('/')) return u;
    return '#';
  }

  // Format inline text (bold, italic, links)
  function formatInlineText(text: string): React.ReactNode {
    // Process inline formatting
    const parts: React.ReactNode[] = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
      // Check for links [text](url)
      const linkMatch = remaining.match(/^(.*?)\[(.+?)\]\((.+?)\)(.*)$/);
      if (linkMatch) {
        const [, before, linkText, url, after] = linkMatch;
        if (before) parts.push(formatSimpleInline(before, key++));
        parts.push(
          <a 
            key={key++}
            href={safeUrl(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            {linkText}
            <ExternalLink className="h-3 w-3" />
          </a>
        );
        remaining = after;
        continue;
      }

      // No more special patterns, process remaining as simple inline
      parts.push(formatSimpleInline(remaining, key++));
      break;
    }

    return parts;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatSimpleInline(text: string, key: number): React.ReactNode {
    // Escape HTML first to prevent XSS, then apply formatting
    const escaped = escapeHtml(text);
    const formatted = escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>');
    
    return <span key={key} dangerouslySetInnerHTML={{ __html: formatted }} />;
  }

  lines.forEach((line, i) => {
    // Code block handling
    if (line.trim().startsWith('```')) {
      if (codeBlock.active) {
        flushCode();
      } else {
        flushList();
        codeBlock.active = true;
      }
      return;
    }

    if (codeBlock.active) {
      codeBlock.lines.push(line);
      return;
    }

    // Headers
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={i} className="text-lg font-semibold mt-6 mb-3 text-foreground">
          {formatInlineText(line.slice(4))}
        </h3>
      );
      return;
    }
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h2 key={i} className="text-xl font-bold mt-8 mb-4 text-foreground">
          {formatInlineText(line.slice(3))}
        </h2>
      );
      return;
    }
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h1 key={i} className="text-2xl font-bold mt-8 mb-4 text-foreground">
          {formatInlineText(line.slice(2))}
        </h1>
      );
      return;
    }
    
    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
      flushList();
      elements.push(<hr key={i} className="my-8 border-t border-border" />);
      return;
    }
    
    // Tip/Alert/Success markers
    if (line.trim().startsWith('💡 ') || line.trim().startsWith('> **Dica')) {
      flushList();
      const content = line.replace(/^(💡\s*|\>\s*\*\*Dica\*\*:?\s*)/, '');
      elements.push(
        <p key={i} className="text-base leading-relaxed text-foreground/90">
          <strong className="text-blue-600 dark:text-blue-400">Dica:</strong>{' '}
          {formatInlineText(content)}
        </p>
      );
      return;
    }
    if (line.trim().startsWith('⚠️ ') || line.trim().startsWith('> **Atenção')) {
      flushList();
      const content = line.replace(/^(⚠️\s*|\>\s*\*\*Atenção\*\*:?\s*)/, '');
      elements.push(
        <p key={i} className="text-base leading-relaxed text-foreground/90">
          <strong className="text-amber-600 dark:text-amber-400">Atenção:</strong>{' '}
          {formatInlineText(content)}
        </p>
      );
      return;
    }
    if (line.trim().startsWith('✅ ')) {
      flushList();
      const content = line.replace(/^✅\s*/, '');
      elements.push(
        <p key={i} className="text-base leading-relaxed text-foreground/90">
          <strong className="text-green-600 dark:text-green-400">Pronto!</strong>{' '}
          {formatInlineText(content)}
        </p>
      );
      return;
    }
    if (line.trim().startsWith('🚫 ') || line.trim().startsWith('> **Erro')) {
      flushList();
      const content = line.replace(/^(🚫\s*|\>\s*\*\*Erro\*\*:?\s*)/, '');
      elements.push(
        <p key={i} className="text-base leading-relaxed text-foreground/90">
          <strong className="text-red-600 dark:text-red-400">Importante:</strong>{' '}
          {formatInlineText(content)}
        </p>
      );
      return;
    }

    // Quote
    if (line.startsWith('> ')) {
      flushList();
      elements.push(
        <blockquote key={i} className="my-4 pl-4 border-l-4 border-primary/40 italic text-foreground/80">
          {formatInlineText(line.slice(2))}
        </blockquote>
      );
      return;
    }
    
    // Unordered list
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { items: [], type: 'ul' };
      }
      currentList.items.push(line.trim().slice(2));
      return;
    }
    
    // Ordered list
    if (line.trim().match(/^\d+\.\s/)) {
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { items: [], type: 'ol' };
      }
      currentList.items.push(line.trim().replace(/^\d+\.\s/, ''));
      return;
    }
    
    // Images
    const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      flushList();
      elements.push(
        <figure key={i} className="my-6">
          <div 
            className="rounded-lg overflow-hidden border cursor-zoom-in group relative inline-block"
            onClick={() => setZoomedImage({ url: safeUrl(imgMatch[2]), caption: imgMatch[1] })}
          >
            <img 
              src={safeUrl(imgMatch[2])} 
              alt={imgMatch[1] || 'Imagem'} 
              className="max-w-full h-auto transition-opacity group-hover:opacity-95"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-70 transition-opacity drop-shadow-lg" />
            </div>
          </div>
          {imgMatch[1] && (
            <figcaption className="text-sm text-muted-foreground mt-2">
              {imgMatch[1]}
            </figcaption>
          )}
        </figure>
      );
      return;
    }
    
    // Empty line
    if (!line.trim()) {
      flushList();
      return;
    }
    
    // Regular paragraph
    flushList();
    elements.push(
      <p key={i} className="text-base leading-relaxed mb-4 text-foreground/90">
        {formatInlineText(line)}
      </p>
    );
  });
  
  // Flush remaining
  flushList();
  flushCode();

  return (
    <>
      <div className={cn("space-y-0", className)}>{elements}</div>

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

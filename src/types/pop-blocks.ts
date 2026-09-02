export type POPBlockType = 
  | 'text' 
  | 'heading' 
  | 'step' 
  | 'alert' 
  | 'tip' 
  | 'error' 
  | 'success' 
  | 'image' 
  | 'video' 
  | 'code'
  | 'quote'
  | 'divider'
  | 'list';

export interface POPBlock {
  id: string;
  type: POPBlockType;
  content: string;
  level?: 1 | 2 | 3;
  stepNumber?: number;
  imageUrl?: string;
  videoUrl?: string;
  caption?: string;
  listItems?: string[];  // For list type
  author?: string;       // For quote type
}

export interface POPAttachment {
  id: string;
  tenant_id: string;
  pop_id: string;
  file_name: string;
  file_url: string;
  file_type: 'image' | 'video' | 'gif';
  file_size?: number;
  thumbnail_url?: string;
  sort_order: number;
  caption?: string;
  created_at: string;
}

// Convert markdown to blocks
export function convertMarkdownToBlocks(markdown: string): POPBlock[] {
  const lines = markdown.split('\n');
  const blocks: POPBlock[] = [];
  let stepCounter = 1;
  
  lines.forEach((line, index) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    // Divider
    if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
      blocks.push({
        id: `b${index}`,
        type: 'divider',
        content: ''
      });
      return;
    }
    
    // Quote
    if (trimmedLine.startsWith('> ') && !trimmedLine.startsWith('> **')) {
      blocks.push({
        id: `b${index}`,
        type: 'quote',
        content: trimmedLine.slice(2)
      });
      return;
    }
    
    if (line.startsWith('### ')) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'heading', 
        level: 3, 
        content: line.slice(4) 
      });
    } else if (line.startsWith('## ')) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'heading', 
        level: 2, 
        content: line.slice(3) 
      });
    } else if (line.startsWith('# ')) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'heading', 
        level: 1, 
        content: line.slice(2) 
      });
    } else if (trimmedLine.match(/^\d+\.\s/)) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'step', 
        stepNumber: stepCounter++, 
        content: trimmedLine.replace(/^\d+\.\s/, '') 
      });
    } else if (trimmedLine.startsWith('> **Dica**') || trimmedLine.startsWith('💡')) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'tip', 
        content: trimmedLine.replace(/^(> \*\*Dica\*\*:?\s*|💡\s*)/, '') 
      });
    } else if (trimmedLine.startsWith('> **Atenção**') || trimmedLine.startsWith('⚠️')) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'alert', 
        content: trimmedLine.replace(/^(> \*\*Atenção\*\*:?\s*|⚠️\s*)/, '') 
      });
    } else if (trimmedLine.startsWith('> **Erro**') || trimmedLine.startsWith('🚫')) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'error', 
        content: trimmedLine.replace(/^(> \*\*Erro\*\*:?\s*|🚫\s*)/, '') 
      });
    } else if (trimmedLine.startsWith('✅')) {
      blocks.push({ 
        id: `b${index}`, 
        type: 'success', 
        content: trimmedLine.replace(/^✅\s*/, '') 
      });
    } else if (trimmedLine.startsWith('```')) {
      // Skip code blocks for now
    } else if (trimmedLine.startsWith('![')) {
      const match = trimmedLine.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (match) {
        blocks.push({
          id: `b${index}`,
          type: 'image',
          content: '',
          imageUrl: match[2],
          caption: match[1]
        });
      }
    } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      // Check if previous block is a list to append
      const lastBlock = blocks[blocks.length - 1];
      const itemContent = trimmedLine.slice(2);
      if (lastBlock && lastBlock.type === 'list' && lastBlock.listItems) {
        lastBlock.listItems.push(itemContent);
      } else {
        blocks.push({
          id: `b${index}`,
          type: 'list',
          content: '',
          listItems: [itemContent]
        });
      }
    } else {
      blocks.push({ 
        id: `b${index}`, 
        type: 'text', 
        content: trimmedLine 
      });
    }
  });
  
  return blocks;
}

// Convert blocks back to markdown (for backward compatibility)
export function convertBlocksToMarkdown(blocks: POPBlock[]): string {
  return blocks.map(block => {
    switch (block.type) {
      case 'heading':
        return '#'.repeat(block.level || 1) + ' ' + block.content;
      case 'step':
        return `${block.stepNumber}. ${block.content}`;
      case 'tip':
        return `💡 ${block.content}`;
      case 'alert':
        return `⚠️ ${block.content}`;
      case 'error':
        return `🚫 ${block.content}`;
      case 'success':
        return `✅ ${block.content}`;
      case 'image':
        return `![${block.caption || ''}](${block.imageUrl})`;
      case 'video':
        return `[Video](${block.videoUrl})`;
      case 'code':
        return '```\n' + block.content + '\n```';
      case 'quote':
        return `> ${block.content}${block.author ? `\n> — ${block.author}` : ''}`;
      case 'divider':
        return '---';
      case 'list':
        return (block.listItems || []).map(item => `- ${item}`).join('\n');
      default:
        return block.content;
    }
  }).join('\n\n');
}

// Detect if content is JSON blocks or markdown
export function isBlockContent(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length > 0 && parsed[0].type;
  } catch {
    return false;
  }
}

// Parse content to blocks
export function parseContent(content: string): POPBlock[] {
  if (isBlockContent(content)) {
    return JSON.parse(content);
  }
  return convertMarkdownToBlocks(content);
}

// Generate unique ID
export function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

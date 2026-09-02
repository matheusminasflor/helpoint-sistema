// Network Diagram Types
export interface NetworkNodeData {
  ip?: string;
  vlan?: string;
  model?: string;
  location?: string;
  notes?: string;
  asset_id?: string;
}

export interface NetworkNode {
  id: string;
  type: 'device' | 'zone';
  label: string;
  icon?: string;
  position: { x: number; y: number };
  data: NetworkNodeData;
}

export interface NetworkEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'ethernet' | 'fiber' | 'wireless' | 'vpn';
}

export interface NetworkZone {
  id: string;
  label: string;
  color: string;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface NetworkDiagramData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  zones: NetworkZone[];
}

export interface NetworkDiagram {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  status: string;
  data: NetworkDiagramData;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Facility Map Types
export interface MapShape {
  id: string;
  type: 'rect' | 'ellipse' | 'polygon';
  label: string;
  roomType?: string;
  bounds: { x: number; y: number; width: number; height: number };
  fill: string;
  stroke: string;
}

export interface MapDevice {
  id: string;
  position: { x: number; y: number };
  icon: string;
  label: string;
  asset_id?: string;
  rotation?: number;
  size?: number;
}

export interface MapBackground {
  type: 'grid' | 'none';
  spacing: number;
}

export interface FloorBackgroundImage {
  url: string;
  opacity: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface Floor {
  id: string;
  name: string;
  order: number;
  backgroundImage?: FloorBackgroundImage;
  shapes: MapShape[];
  devices: MapDevice[];
}

export interface FacilityMapData {
  floors: Floor[];
  activeFloorId: string;
  background: MapBackground;
}

// Legacy format for migration
export interface LegacyFacilityMapData {
  shapes: MapShape[];
  devices: MapDevice[];
  background: MapBackground;
}

// Room type options
export const ROOM_TYPES = [
  { value: 'server_room', label: 'Sala de Servidores' },
  { value: 'office', label: 'Escritório' },
  { value: 'meeting_room', label: 'Sala de Reunião' },
  { value: 'reception', label: 'Recepção' },
  { value: 'bathroom', label: 'Banheiro' },
  { value: 'kitchen', label: 'Copa/Cozinha' },
  { value: 'storage', label: 'Depósito' },
  { value: 'hallway', label: 'Corredor' },
  { value: 'garage', label: 'Garagem' },
  { value: 'lab', label: 'Laboratório' },
  { value: 'other', label: 'Outro' },
] as const;

export interface FacilityMap {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  status: string;
  data: FacilityMapData;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Device icon options
export const DEVICE_ICONS = [
  { value: 'router', label: 'Roteador' },
  { value: 'switch', label: 'Switch' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'server', label: 'Servidor' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'laptop', label: 'Notebook' },
  { value: 'printer', label: 'Impressora' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'database', label: 'Banco de Dados' },
  { value: 'wifi', label: 'Access Point' },
  { value: 'phone', label: 'Telefone IP' },
  { value: 'camera', label: 'Câmera' },
] as const;

// Zone color presets
export const ZONE_COLORS = [
  { value: '#fef3c7', label: 'Amarelo', border: '#f59e0b' },
  { value: '#dcfce7', label: 'Verde', border: '#22c55e' },
  { value: '#dbeafe', label: 'Azul', border: '#3b82f6' },
  { value: '#fce7f3', label: 'Rosa', border: '#ec4899' },
  { value: '#f3e8ff', label: 'Roxo', border: '#a855f7' },
  { value: '#e0f2fe', label: 'Ciano', border: '#0ea5e9' },
  { value: '#fee2e2', label: 'Vermelho', border: '#ef4444' },
  { value: '#f5f5f4', label: 'Cinza', border: '#78716c' },
] as const;

// Edge type options
export const EDGE_TYPES = [
  { value: 'ethernet', label: 'Ethernet' },
  { value: 'fiber', label: 'Fibra' },
  { value: 'wireless', label: 'Wireless' },
  { value: 'vpn', label: 'VPN' },
] as const;

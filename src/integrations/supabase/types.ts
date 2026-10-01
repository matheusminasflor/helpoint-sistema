export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          department: string
          description: string | null
          id: string
          is_default: boolean
          legacy_ti_profile_id: string | null
          name: string
          permissions: Json
          restrictions: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department: string
          description?: string | null
          id?: string
          is_default?: boolean
          legacy_ti_profile_id?: string | null
          name: string
          permissions?: Json
          restrictions?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string
          description?: string | null
          id?: string
          is_default?: boolean
          legacy_ti_profile_id?: string | null
          name?: string
          permissions?: Json
          restrictions?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenances: {
        Row: {
          asset_id: string
          auto_create_ticket: boolean
          completed_date: string | null
          cost: number | null
          created_at: string
          description: string | null
          external_provider: string | null
          id: string
          maintenance_type: Database["public"]["Enums"]["maintenance_type"]
          notes: string | null
          scheduled_date: string | null
          status: Database["public"]["Enums"]["maintenance_status"]
          technician_id: string | null
          tenant_id: string
          ticket_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          asset_id: string
          auto_create_ticket?: boolean
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          external_provider?: string | null
          id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          notes?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          technician_id?: string | null
          tenant_id: string
          ticket_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string
          auto_create_ticket?: boolean
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          external_provider?: string | null
          id?: string
          maintenance_type?: Database["public"]["Enums"]["maintenance_type"]
          notes?: string | null
          scheduled_date?: string | null
          status?: Database["public"]["Enums"]["maintenance_status"]
          technician_id?: string | null
          tenant_id?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenances_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenances_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenances_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          asset_tag: string
          assigned_to: string | null
          category: Database["public"]["Enums"]["asset_category"]
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          location: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          serial_number: string | null
          specs: Json | null
          status: Database["public"]["Enums"]["asset_status"]
          subcategory: string | null
          tenant_id: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_tag: string
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["asset_category"]
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          specs?: Json | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_tag?: string
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["asset_category"]
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          specs?: Json | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          tenant_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          tenant_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          tenant_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_fired: {
        Row: {
          fired_at: string
          subject_id: string
          workflow_id: string
        }
        Insert: {
          fired_at?: string
          subject_id: string
          workflow_id: string
        }
        Update: {
          fired_at?: string
          subject_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_fired_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          context: Json
          created_at: string
          current_step_ids: string[]
          ended_at: string | null
          error: string | null
          executed_steps: number
          flow: Json
          id: string
          pending_kind: string | null
          pending_step_id: string | null
          resume_at: string | null
          started_at: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          tenant_id: string
          trigger_kind: string
          workflow_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          current_step_ids?: string[]
          ended_at?: string | null
          error?: string | null
          executed_steps?: number
          flow: Json
          id?: string
          pending_kind?: string | null
          pending_step_id?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id: string
          trigger_kind: string
          workflow_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          current_step_ids?: string[]
          ended_at?: string | null
          error?: string | null
          executed_steps?: number
          flow?: Json
          id?: string
          pending_kind?: string | null
          pending_step_id?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          tenant_id?: string
          trigger_kind?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_error: string | null
          last_run_at: string | null
          module: string
          name: string
          next_run_at: string | null
          run_count: number
          status: string
          steps: Json
          tenant_id: string
          trigger: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          module: string
          name: string
          next_run_at?: string | null
          run_count?: number
          status?: string
          steps?: Json
          tenant_id: string
          trigger?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          module?: string
          name?: string
          next_run_at?: string | null
          run_count?: number
          status?: string
          steps?: Json
          tenant_id?: string
          trigger?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          color: string | null
          created_at: string
          description: string | null
          end_at: string | null
          event_type: string
          google_event_id: string | null
          id: string
          is_exception: boolean
          is_recurring: boolean
          occurrence_index: number | null
          original_start_at: string | null
          recurrence_byweekday: number[] | null
          recurrence_count: number | null
          recurrence_end_date: string | null
          recurrence_end_type: string
          recurrence_freq: string
          recurrence_interval: number
          recurrence_rule: string | null
          recurrence_unit: string | null
          reminder_offsets: number[]
          reminders_sent: number[]
          series_id: string | null
          source_id: string | null
          source_type: string | null
          start_at: string
          tenant_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: string
          google_event_id?: string | null
          id?: string
          is_exception?: boolean
          is_recurring?: boolean
          occurrence_index?: number | null
          original_start_at?: string | null
          recurrence_byweekday?: number[] | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_end_type?: string
          recurrence_freq?: string
          recurrence_interval?: number
          recurrence_rule?: string | null
          recurrence_unit?: string | null
          reminder_offsets?: number[]
          reminders_sent?: number[]
          series_id?: string | null
          source_id?: string | null
          source_type?: string | null
          start_at: string
          tenant_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          color?: string | null
          created_at?: string
          description?: string | null
          end_at?: string | null
          event_type?: string
          google_event_id?: string | null
          id?: string
          is_exception?: boolean
          is_recurring?: boolean
          occurrence_index?: number | null
          original_start_at?: string | null
          recurrence_byweekday?: number[] | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_end_type?: string
          recurrence_freq?: string
          recurrence_interval?: number
          recurrence_rule?: string | null
          recurrence_unit?: string | null
          reminder_offsets?: number[]
          reminders_sent?: number[]
          series_id?: string | null
          source_id?: string | null
          source_type?: string | null
          start_at?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channel_members: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          last_read_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          last_read_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          last_read_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channel_members_channel_fkey"
            columns: ["channel_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "chat_channel_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channel_members_user_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          dm_key: string | null
          id: string
          nome: string | null
          privado: boolean
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dm_key?: string | null
          id?: string
          nome?: string | null
          privado?: boolean
          tenant_id: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          dm_key?: string | null
          id?: string
          nome?: string | null
          privado?: boolean
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_autor_fkey"
            columns: ["created_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "chat_channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          author_id: string
          channel_id: string
          conteudo: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          mencionados: string[]
          tenant_id: string
        }
        Insert: {
          author_id: string
          channel_id: string
          conteudo: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mencionados?: string[]
          tenant_id: string
        }
        Update: {
          author_id?: string
          channel_id?: string
          conteudo?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          mencionados?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_author_fkey"
            columns: ["author_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "chat_messages_channel_fkey"
            columns: ["channel_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_bindings: {
        Row: {
          created_at: string
          id: string
          priority: number
          target_id: string
          target_type: string
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          priority?: number
          target_id: string
          target_type?: string
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          priority?: number
          target_id?: string
          target_type?: string
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_bindings_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_template_bindings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_required: boolean
          responsible_sector: string | null
          sort_order: number
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          module: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          module?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      com_carteira_membros: {
        Row: {
          carteira: string
          created_at: string
          id: string
          responsavel: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          carteira: string
          created_at?: string
          id?: string
          responsavel?: boolean
          tenant_id?: string
          user_id: string
        }
        Update: {
          carteira?: string
          created_at?: string
          id?: string
          responsavel?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_carteira_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      com_carteira_renomeacoes: {
        Row: {
          created_at: string
          created_by: string | null
          de: string
          para: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          de: string
          para: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          de?: string
          para?: string
          tenant_id?: string
        }
        Relationships: []
      }
      com_clientes: {
        Row: {
          ativo: boolean
          carteira: string | null
          cep: string | null
          cidade: string | null
          codigo: string
          created_at: string
          documento: string | null
          em_condicao: boolean | null
          email: string | null
          endereco: string | null
          estado: string | null
          fantasia: string | null
          grupo: string | null
          id: string
          origem: string
          razao_social: string
          tabela_base: string | null
          tabela_preco: string | null
          telefone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          carteira?: string | null
          cep?: string | null
          cidade?: string | null
          codigo: string
          created_at?: string
          documento?: string | null
          em_condicao?: boolean | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          fantasia?: string | null
          grupo?: string | null
          id?: string
          origem?: string
          razao_social: string
          tabela_base?: string | null
          tabela_preco?: string | null
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          carteira?: string | null
          cep?: string | null
          cidade?: string | null
          codigo?: string
          created_at?: string
          documento?: string | null
          em_condicao?: boolean | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          fantasia?: string | null
          grupo?: string | null
          id?: string
          origem?: string
          razao_social?: string
          tabela_base?: string | null
          tabela_preco?: string | null
          telefone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      com_clientes_tabela_historico: {
        Row: {
          cliente_codigo: string
          created_at: string
          id: string
          importacao_id: string | null
          tabela_preco: string | null
          tenant_id: string
          vigente_desde: string
        }
        Insert: {
          cliente_codigo: string
          created_at?: string
          id?: string
          importacao_id?: string | null
          tabela_preco?: string | null
          tenant_id?: string
          vigente_desde?: string
        }
        Update: {
          cliente_codigo?: string
          created_at?: string
          id?: string
          importacao_id?: string | null
          tabela_preco?: string | null
          tenant_id?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_clientes_tabela_historico_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "com_vendas_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      com_faixas_cashback: {
        Row: {
          created_at: string
          id: string
          percentual: number
          tabela_base: string
          tenant_id: string
          updated_at: string
          valor_minimo: number
        }
        Insert: {
          created_at?: string
          id?: string
          percentual: number
          tabela_base: string
          tenant_id: string
          updated_at?: string
          valor_minimo: number
        }
        Update: {
          created_at?: string
          id?: string
          percentual?: number
          tabela_base?: string
          tenant_id?: string
          updated_at?: string
          valor_minimo?: number
        }
        Relationships: [
          {
            foreignKeyName: "com_faixas_cashback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      com_indicadores: {
        Row: {
          ativo: boolean
          conta_em_aberto: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          periodo: string
          rotulo_painel: string | null
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conta_em_aberto?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          periodo?: string
          rotulo_painel?: string | null
          tenant_id?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conta_em_aberto?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          periodo?: string
          rotulo_painel?: string | null
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_indicadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      com_interacao_marcas: {
        Row: {
          indicador_id: string
          interacao_id: string
          tenant_id: string
        }
        Insert: {
          indicador_id: string
          interacao_id: string
          tenant_id?: string
        }
        Update: {
          indicador_id?: string
          interacao_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_interacao_marcas_indicador_id_fkey"
            columns: ["indicador_id"]
            isOneToOne: false
            referencedRelation: "com_indicadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_interacao_marcas_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: false
            referencedRelation: "com_interacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_interacao_marcas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      com_interacoes: {
        Row: {
          cliente_codigo: string | null
          created_at: string
          data: string
          fora_da_carteira: boolean
          id: string
          observacoes: string | null
          prazo: string | null
          status: string
          tenant_id: string
          updated_at: string
          valor_venda: number | null
          vendedor_id: string
        }
        Insert: {
          cliente_codigo?: string | null
          created_at?: string
          data: string
          fora_da_carteira?: boolean
          id?: string
          observacoes?: string | null
          prazo?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          valor_venda?: number | null
          vendedor_id?: string
        }
        Update: {
          cliente_codigo?: string | null
          created_at?: string
          data?: string
          fora_da_carteira?: boolean
          id?: string
          observacoes?: string | null
          prazo?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          valor_venda?: number | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_interacoes_tenant_id_cliente_codigo_fkey"
            columns: ["tenant_id", "cliente_codigo"]
            isOneToOne: false
            referencedRelation: "com_clientes"
            referencedColumns: ["tenant_id", "codigo"]
          },
          {
            foreignKeyName: "com_interacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_interacoes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      com_metas: {
        Row: {
          ano: number
          carteira: string | null
          created_at: string
          definida_por: string | null
          id: string
          mes: number
          tenant_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          ano: number
          carteira?: string | null
          created_at?: string
          definida_por?: string | null
          id?: string
          mes: number
          tenant_id?: string
          updated_at?: string
          valor: number
        }
        Update: {
          ano?: number
          carteira?: string | null
          created_at?: string
          definida_por?: string | null
          id?: string
          mes?: number
          tenant_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "com_metas_definida_por_fkey"
            columns: ["definida_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      com_metas_indicador: {
        Row: {
          competencia: string
          definida_por: string | null
          id: string
          meta: number
          metrica: string
          tenant_id: string
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          competencia: string
          definida_por?: string | null
          id?: string
          meta: number
          metrica: string
          tenant_id?: string
          updated_at?: string
          vendedor_id: string
        }
        Update: {
          competencia?: string
          definida_por?: string | null
          id?: string
          meta?: number
          metrica?: string
          tenant_id?: string
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_metas_indicador_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_metas_indicador_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      com_produtos: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nome: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nome: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      com_solicitacoes_cadastro: {
        Row: {
          aplicado_em: string | null
          aplicado_por: string | null
          cep: string | null
          cidade: string | null
          cliente_codigo: string | null
          condicao_fiscal: string | null
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          documento: string | null
          email: string | null
          endereco: string | null
          grupo: string | null
          id: string
          inscricao_estadual: string | null
          motivo: string | null
          parecer: string | null
          prioridade: string
          razao_social: string
          status: string
          telefone: string | null
          telefone_2: string | null
          tenant_id: string
          ticket_id: string | null
          uf: string | null
          updated_at: string
          vendedor_id: string
        }
        Insert: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_codigo?: string | null
          condicao_fiscal?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          grupo?: string | null
          id?: string
          inscricao_estadual?: string | null
          motivo?: string | null
          parecer?: string | null
          prioridade?: string
          razao_social: string
          status?: string
          telefone?: string | null
          telefone_2?: string | null
          tenant_id?: string
          ticket_id?: string | null
          uf?: string | null
          updated_at?: string
          vendedor_id?: string
        }
        Update: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_codigo?: string | null
          condicao_fiscal?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          grupo?: string | null
          id?: string
          inscricao_estadual?: string | null
          motivo?: string | null
          parecer?: string | null
          prioridade?: string
          razao_social?: string
          status?: string
          telefone?: string | null
          telefone_2?: string | null
          tenant_id?: string
          ticket_id?: string | null
          uf?: string | null
          updated_at?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "com_solicitacoes_cadastro_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_solicitacoes_cadastro_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_solicitacoes_cadastro_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_solicitacoes_cadastro_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_solicitacoes_cadastro_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      com_vendas_competencias: {
        Row: {
          competencia: string
          created_at: string
          filial: string
          id: string
          importacao_id: string
          linhas: number
          tenant_id: string
          total_venda: number
        }
        Insert: {
          competencia: string
          created_at?: string
          filial: string
          id?: string
          importacao_id: string
          linhas: number
          tenant_id?: string
          total_venda: number
        }
        Update: {
          competencia?: string
          created_at?: string
          filial?: string
          id?: string
          importacao_id?: string
          linhas?: number
          tenant_id?: string
          total_venda?: number
        }
        Relationships: [
          {
            foreignKeyName: "com_vendas_competencias_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "com_vendas_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      com_vendas_importacoes: {
        Row: {
          cfops_outros: string[]
          competencia_ate: string | null
          competencia_de: string | null
          created_at: string
          descartes: Json
          file_name: string
          filial: string | null
          id: string
          imported_by: string | null
          itens_esperados: number | null
          itens_gravados: number
          linhas_lidas: number
          outros_linhas: number
          outros_valor: number
          status: string
          substituiu: boolean
          tenant_id: string
          tipo: string
          total_impresso: number | null
        }
        Insert: {
          cfops_outros?: string[]
          competencia_ate?: string | null
          competencia_de?: string | null
          created_at?: string
          descartes?: Json
          file_name: string
          filial?: string | null
          id?: string
          imported_by?: string | null
          itens_esperados?: number | null
          itens_gravados?: number
          linhas_lidas: number
          outros_linhas?: number
          outros_valor?: number
          status?: string
          substituiu?: boolean
          tenant_id?: string
          tipo: string
          total_impresso?: number | null
        }
        Update: {
          cfops_outros?: string[]
          competencia_ate?: string | null
          competencia_de?: string | null
          created_at?: string
          descartes?: Json
          file_name?: string
          filial?: string | null
          id?: string
          imported_by?: string | null
          itens_esperados?: number | null
          itens_gravados?: number
          linhas_lidas?: number
          outros_linhas?: number
          outros_valor?: number
          status?: string
          substituiu?: boolean
          tenant_id?: string
          tipo?: string
          total_impresso?: number | null
        }
        Relationships: []
      }
      com_vendas_itens: {
        Row: {
          cfop: string
          classe: string
          cliente_codigo: string
          competencia: string | null
          created_at: string
          desconto: number
          documento: string
          emissao: string
          filial: string
          id: string
          importacao_id: string
          produto_codigo: string
          produto_nome: string
          quantidade: number
          quantidade_curva: number | null
          serie: string
          tenant_id: string
          tipo_documento: string | null
          valor_curva: number | null
          valor_nota: number
          vendedor_codigo: string | null
          vendedor_nome: string | null
        }
        Insert: {
          cfop: string
          classe: string
          cliente_codigo: string
          competencia?: string | null
          created_at?: string
          desconto?: number
          documento: string
          emissao: string
          filial: string
          id?: string
          importacao_id: string
          produto_codigo: string
          produto_nome: string
          quantidade: number
          quantidade_curva?: number | null
          serie: string
          tenant_id?: string
          tipo_documento?: string | null
          valor_curva?: number | null
          valor_nota: number
          vendedor_codigo?: string | null
          vendedor_nome?: string | null
        }
        Update: {
          cfop?: string
          classe?: string
          cliente_codigo?: string
          competencia?: string | null
          created_at?: string
          desconto?: number
          documento?: string
          emissao?: string
          filial?: string
          id?: string
          importacao_id?: string
          produto_codigo?: string
          produto_nome?: string
          quantidade?: number
          quantidade_curva?: number | null
          serie?: string
          tenant_id?: string
          tipo_documento?: string | null
          valor_curva?: number | null
          valor_nota?: number
          vendedor_codigo?: string | null
          vendedor_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_vendas_itens_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "com_vendas_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      com_vendas_itens_espera: {
        Row: {
          cfop: string
          classe: string
          cliente_codigo: string
          cliente_nome: string
          created_at: string
          desconto: number
          documento: string
          emissao: string
          filial: string
          id: string
          importacao_id: string
          produto_codigo: string
          produto_nome: string
          quantidade: number
          serie: string
          tenant_id: string
          tipo_documento: string | null
          valor_nota: number
          vendedor_codigo: string | null
          vendedor_nome: string | null
        }
        Insert: {
          cfop: string
          classe: string
          cliente_codigo: string
          cliente_nome: string
          created_at?: string
          desconto?: number
          documento: string
          emissao: string
          filial: string
          id?: string
          importacao_id: string
          produto_codigo: string
          produto_nome: string
          quantidade: number
          serie: string
          tenant_id?: string
          tipo_documento?: string | null
          valor_nota: number
          vendedor_codigo?: string | null
          vendedor_nome?: string | null
        }
        Update: {
          cfop?: string
          classe?: string
          cliente_codigo?: string
          cliente_nome?: string
          created_at?: string
          desconto?: number
          documento?: string
          emissao?: string
          filial?: string
          id?: string
          importacao_id?: string
          produto_codigo?: string
          produto_nome?: string
          quantidade?: number
          serie?: string
          tenant_id?: string
          tipo_documento?: string | null
          valor_nota?: number
          vendedor_codigo?: string | null
          vendedor_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_vendas_itens_espera_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "com_vendas_importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      com_vendedores: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          id: string
          nome: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          id?: string
          nome: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "com_vendedores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "com_vendedores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_orcamentos: {
        Row: {
          amount: number
          created_at: string
          file_path: string | null
          id: string
          link: string | null
          notes: string | null
          position: number
          request_id: string
          supplier: string
          supplier_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          file_path?: string | null
          id?: string
          link?: string | null
          notes?: string | null
          position?: number
          request_id: string
          supplier: string
          supplier_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          file_path?: string | null
          id?: string
          link?: string | null
          notes?: string | null
          position?: number
          request_id?: string
          supplier?: string
          supplier_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_orcamentos_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "compras_solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_orcamentos_supplier_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      compras_produtos: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      compras_solicitacoes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_quote_id: string | null
          created_at: string
          created_by: string | null
          department: string | null
          estimated_amount: number | null
          executed_at: string | null
          executed_by: string | null
          few_quotes_reason: string | null
          id: string
          over_budget_reason: string | null
          payment_due_date: string | null
          product_id: string | null
          product_link: string | null
          product_name: string
          purchase_file_path: string | null
          purchase_report: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_quote_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          estimated_amount?: number | null
          executed_at?: string | null
          executed_by?: string | null
          few_quotes_reason?: string | null
          id?: string
          over_budget_reason?: string | null
          payment_due_date?: string | null
          product_id?: string | null
          product_link?: string | null
          product_name: string
          purchase_file_path?: string | null
          purchase_report?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_quote_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          estimated_amount?: number | null
          executed_at?: string | null
          executed_by?: string | null
          few_quotes_reason?: string | null
          id?: string
          over_budget_reason?: string | null
          payment_due_date?: string | null
          product_id?: string | null
          product_link?: string | null
          product_name?: string
          purchase_file_path?: string | null
          purchase_report?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compras_solicitacoes_approved_quote_fkey"
            columns: ["approved_quote_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "compras_orcamentos"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "compras_solicitacoes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "compras_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_solicitacoes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          asaas_customer_id: string | null
          bling_contact_id: string | null
          carrier: string | null
          city: string | null
          company: string | null
          complement: string | null
          created_at: string
          created_by: string | null
          custom: Json
          customer_profile_id: string | null
          district: string | null
          document: string | null
          email: string | null
          id: string
          import_id: string | null
          name: string
          notes: string | null
          owner_id: string | null
          phone: string | null
          price_table_id: string | null
          segment_id: string | null
          source: string
          state: string | null
          state_registration: string | null
          street: string | null
          street_number: string | null
          tenant_id: string
          updated_at: string
          whatsapp: string | null
          whatsapp_id: string | null
          zip_code: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          bling_contact_id?: string | null
          carrier?: string | null
          city?: string | null
          company?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          customer_profile_id?: string | null
          district?: string | null
          document?: string | null
          email?: string | null
          id?: string
          import_id?: string | null
          name: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          price_table_id?: string | null
          segment_id?: string | null
          source?: string
          state?: string | null
          state_registration?: string | null
          street?: string | null
          street_number?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp?: string | null
          whatsapp_id?: string | null
          zip_code?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          bling_contact_id?: string | null
          carrier?: string | null
          city?: string | null
          company?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          custom?: Json
          customer_profile_id?: string | null
          district?: string | null
          document?: string | null
          email?: string | null
          id?: string
          import_id?: string | null
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          price_table_id?: string | null
          segment_id?: string | null
          source?: string
          state?: string | null
          state_registration?: string | null
          street?: string | null
          street_number?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp?: string | null
          whatsapp_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_created_by_fkey"
            columns: ["created_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_contacts_customer_profile_id_fkey"
            columns: ["customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "crm_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_owner_id_fkey"
            columns: ["owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_contacts_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "crm_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_custom_fields: {
        Row: {
          created_at: string
          entity: string
          id: string
          is_active: boolean
          key: string
          label: string
          options: Json
          position: number
          required: boolean
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity: string
          id?: string
          is_active?: boolean
          key: string
          label: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity?: string
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          options?: Json
          position?: number
          required?: boolean
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_custom_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deal_activities: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          deal_id: string
          id: string
          kind: string
          meta: Json
          tenant_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          deal_id: string
          id?: string
          kind: string
          meta?: Json
          tenant_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          deal_id?: string
          id?: string
          kind?: string
          meta?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_deal_activities_author_id_fkey"
            columns: ["author_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deal_activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          custom: Json
          expected_close_date: string | null
          form_id: string | null
          id: string
          import_id: string | null
          lost_at: string | null
          lost_reason: string | null
          owner_id: string | null
          position: number
          source: string
          stage_id: string
          tenant_id: string
          title: string
          updated_at: string
          value: number
          won_at: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          custom?: Json
          expected_close_date?: string | null
          form_id?: string | null
          id?: string
          import_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          position?: number
          source?: string
          stage_id: string
          tenant_id: string
          title: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          custom?: Json
          expected_close_date?: string | null
          form_id?: string | null
          id?: string
          import_id?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          owner_id?: string | null
          position?: number
          source?: string
          stage_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
          value?: number
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_created_by_fkey"
            columns: ["created_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_deals_form_id_tenant_id_fkey"
            columns: ["form_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_forms"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_deals_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "crm_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_owner_id_fkey"
            columns: ["owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_forms: {
        Row: {
          created_at: string
          created_by: string | null
          fields: Json
          headline: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          pipeline_id: string | null
          redirect_url: string | null
          segment_id: string | null
          slug: string
          subhead: string | null
          submit_label: string
          success_message: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          headline?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          pipeline_id?: string | null
          redirect_url?: string | null
          segment_id?: string | null
          slug: string
          subhead?: string | null
          submit_label?: string
          success_message?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          headline?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          pipeline_id?: string | null
          redirect_url?: string | null
          segment_id?: string | null
          slug?: string
          subhead?: string | null
          submit_label?: string
          success_message?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_forms_owner_id_tenant_id_fkey"
            columns: ["owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_forms_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_forms_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "crm_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_imports: {
        Row: {
          contacts_created: number
          contacts_reused: number
          created_at: string
          created_by: string | null
          deals_created: number
          errors: Json
          file_name: string
          finished_at: string | null
          id: string
          pipeline_id: string | null
          rows_total: number
          status: string
          tenant_id: string
        }
        Insert: {
          contacts_created?: number
          contacts_reused?: number
          created_at?: string
          created_by?: string | null
          deals_created?: number
          errors?: Json
          file_name?: string
          finished_at?: string | null
          id?: string
          pipeline_id?: string | null
          rows_total?: number
          status?: string
          tenant_id: string
        }
        Update: {
          contacts_created?: number
          contacts_reused?: number
          created_at?: string
          created_by?: string | null
          deals_created?: number
          errors?: Json
          file_name?: string
          finished_at?: string | null
          id?: string
          pipeline_id?: string | null
          rows_total?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_imports_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_imports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_ads_forms: {
        Row: {
          created_at: string
          created_by: string | null
          form_id: string
          form_name: string | null
          id: string
          is_active: boolean
          mapeamento: Json
          owner_id: string | null
          page_id: string
          pipeline_id: string
          segment_id: string | null
          stage_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          form_id: string
          form_name?: string | null
          id?: string
          is_active?: boolean
          mapeamento?: Json
          owner_id?: string | null
          page_id: string
          pipeline_id: string
          segment_id?: string | null
          stage_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          form_id?: string
          form_name?: string | null
          id?: string
          is_active?: boolean
          mapeamento?: Json
          owner_id?: string | null
          page_id?: string
          pipeline_id?: string
          segment_id?: string | null
          stage_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_ads_forms_owner_fkey"
            columns: ["owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_lead_ads_forms_pipeline_fkey"
            columns: ["pipeline_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_lead_ads_forms_segment_fkey"
            columns: ["segment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_segments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_lead_ads_forms_stage_fkey"
            columns: ["stage_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_lead_ads_forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_lead_ads_raw: {
        Row: {
          campos: Json
          created_at: string
          deal_id: string | null
          erro: string | null
          form_id: string | null
          id: string
          leadgen_id: string
          page_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          campos?: Json
          created_at?: string
          deal_id?: string | null
          erro?: string | null
          form_id?: string | null
          id?: string
          leadgen_id: string
          page_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          campos?: Json
          created_at?: string
          deal_id?: string | null
          erro?: string | null
          form_id?: string | null
          id?: string
          leadgen_id?: string
          page_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_ads_raw_deal_fkey"
            columns: ["deal_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_lead_ads_raw_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_messages: {
        Row: {
          body: string | null
          channel: string
          contact_id: string
          created_at: string
          deal_id: string | null
          direction: string
          error: string | null
          id: string
          media_type: string | null
          media_url: string | null
          sent_by: string | null
          status: string
          template_language: string | null
          template_name: string | null
          template_vars: Json | null
          tenant_id: string
          updated_at: string
          wa_message_id: string | null
        }
        Insert: {
          body?: string | null
          channel?: string
          contact_id: string
          created_at?: string
          deal_id?: string | null
          direction: string
          error?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          sent_by?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          template_vars?: Json | null
          tenant_id: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Update: {
          body?: string | null
          channel?: string
          contact_id?: string
          created_at?: string
          deal_id?: string | null
          direction?: string
          error?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          sent_by?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          template_vars?: Json | null
          tenant_id?: string
          updated_at?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_messages_contact_fkey"
            columns: ["contact_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_messages_deal_fkey"
            columns: ["deal_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_messages_sent_by_fkey"
            columns: ["sent_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_order_items: {
        Row: {
          description: string
          id: string
          order_id: string
          position: number
          product_id: string | null
          quantity: number
          tenant_id: string
          total: number | null
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          order_id: string
          position?: number
          product_id?: string | null
          quantity?: number
          tenant_id: string
          total?: number | null
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          order_id?: string
          position?: number
          product_id?: string | null
          quantity?: number
          tenant_id?: string
          total?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "crm_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_product_balances"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "crm_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_orders: {
        Row: {
          accepted_at: string | null
          bling_nfe_id: string | null
          bling_order_id: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          danfe_url: string | null
          deal_id: string | null
          discount: number
          id: string
          link_expires_at: string | null
          link_kind: string | null
          link_url: string | null
          nfe_error: string | null
          nfe_key: string | null
          nfe_number: string | null
          nfe_provider: string | null
          nfe_ref: string | null
          nfe_status: string | null
          nfe_xml_url: string | null
          notes: string | null
          number: number
          paid_at: string | null
          payment_due_date: string | null
          payment_method: string | null
          payment_provider: string | null
          price_table_id: string | null
          proposal_sent_at: string | null
          proposal_valid_until: string | null
          provider_coupon_id: string | null
          provider_link_id: string | null
          provider_order_id: string | null
          public_token: string
          shipping: number
          status: string
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          subtotal: number
          tenant_id: string
          total: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          bling_nfe_id?: string | null
          bling_order_id?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          deal_id?: string | null
          discount?: number
          id?: string
          link_expires_at?: string | null
          link_kind?: string | null
          link_url?: string | null
          nfe_error?: string | null
          nfe_key?: string | null
          nfe_number?: string | null
          nfe_provider?: string | null
          nfe_ref?: string | null
          nfe_status?: string | null
          nfe_xml_url?: string | null
          notes?: string | null
          number: number
          paid_at?: string | null
          payment_due_date?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          price_table_id?: string | null
          proposal_sent_at?: string | null
          proposal_valid_until?: string | null
          provider_coupon_id?: string | null
          provider_link_id?: string | null
          provider_order_id?: string | null
          public_token?: string
          shipping?: number
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tenant_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          bling_nfe_id?: string | null
          bling_order_id?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          danfe_url?: string | null
          deal_id?: string | null
          discount?: number
          id?: string
          link_expires_at?: string | null
          link_kind?: string | null
          link_url?: string | null
          nfe_error?: string | null
          nfe_key?: string | null
          nfe_number?: string | null
          nfe_provider?: string | null
          nfe_ref?: string | null
          nfe_status?: string | null
          nfe_xml_url?: string | null
          notes?: string | null
          number?: number
          paid_at?: string | null
          payment_due_date?: string | null
          payment_method?: string | null
          payment_provider?: string | null
          price_table_id?: string | null
          proposal_sent_at?: string | null
          proposal_valid_until?: string | null
          provider_coupon_id?: string | null
          provider_link_id?: string | null
          provider_order_id?: string | null
          public_token?: string
          shipping?: number
          status?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tenant_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_orders_created_by_fkey"
            columns: ["created_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "crm_orders_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_orders_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_payment_events: {
        Row: {
          event_id: string
          order_id: string | null
          provider: string
          received_at: string
          tenant_id: string | null
          type: string
        }
        Insert: {
          event_id: string
          order_id?: string | null
          provider: string
          received_at?: string
          tenant_id?: string | null
          type: string
        }
        Update: {
          event_id?: string
          order_id?: string | null
          provider?: string
          received_at?: string
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "crm_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_payment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          kind: string
          name: string
          pipeline_id: string
          position: number
          required_fields: string[]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name: string
          pipeline_id: string
          position?: number
          required_fields?: string[]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          pipeline_id?: string
          position?: number
          required_fields?: string[]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_pipeline_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipelines: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_price_table_items: {
        Row: {
          id: string
          price: number
          price_table_id: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          price: number
          price_table_id: string
          product_id: string
          tenant_id: string
        }
        Update: {
          id?: string
          price?: number
          price_table_id?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_price_table_items_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_price_table_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_price_table_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_product_balances"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "crm_price_table_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_price_tables: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          percent: number
          position: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          percent?: number
          position?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          percent?: number
          position?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_price_tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_products: {
        Row: {
          barcode: string | null
          bling_id: string | null
          cfop: string | null
          created_at: string
          description: string | null
          icms_cst: string | null
          icms_origem: number
          id: string
          is_active: boolean
          name: string
          ncm_code: string | null
          price: number
          sku: string | null
          tenant_id: string
          track_lots: boolean
          unit: string
          updated_at: string
          weight_grams: number | null
          yampi_sku_id: string | null
        }
        Insert: {
          barcode?: string | null
          bling_id?: string | null
          cfop?: string | null
          created_at?: string
          description?: string | null
          icms_cst?: string | null
          icms_origem?: number
          id?: string
          is_active?: boolean
          name: string
          ncm_code?: string | null
          price?: number
          sku?: string | null
          tenant_id: string
          track_lots?: boolean
          unit?: string
          updated_at?: string
          weight_grams?: number | null
          yampi_sku_id?: string | null
        }
        Update: {
          barcode?: string | null
          bling_id?: string | null
          cfop?: string | null
          created_at?: string
          description?: string | null
          icms_cst?: string | null
          icms_origem?: number
          id?: string
          is_active?: boolean
          name?: string
          ncm_code?: string | null
          price?: number
          sku?: string | null
          tenant_id?: string
          track_lots?: boolean
          unit?: string
          updated_at?: string
          weight_grams?: number | null
          yampi_sku_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_segments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          pipeline_id: string | null
          position: number
          price_table_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pipeline_id?: string | null
          position?: number
          price_table_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pipeline_id?: string | null
          position?: number
          price_table_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_segments_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "crm_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_segments_price_table_id_fkey"
            columns: ["price_table_id"]
            isOneToOne: false
            referencedRelation: "crm_price_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_whatsapp_templates: {
        Row: {
          body: string | null
          category: string | null
          components: Json
          language: string
          name: string
          status: string
          synced_at: string
          tenant_id: string
          variaveis: number
        }
        Insert: {
          body?: string | null
          category?: string | null
          components?: Json
          language: string
          name: string
          status: string
          synced_at?: string
          tenant_id: string
          variaveis?: number
        }
        Update: {
          body?: string | null
          category?: string | null
          components?: Json
          language?: string
          name?: string
          status?: string
          synced_at?: string
          tenant_id?: string
          variaveis?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_whatsapp_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          blocked_at: string | null
          blocked_by: string | null
          cnpj: string | null
          com_cliente_codigo: string | null
          created_at: string
          document: string | null
          email: string
          full_name: string
          id: string
          is_blocked: boolean
          onboarded_at: string | null
          phone: string | null
          razao_social: string | null
          tenant_id: string
          updated_at: string
          user_id: string
          vinculo_confirmado: boolean
          vinculo_pedido_em: string | null
          whatsapp: string | null
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cnpj?: string | null
          com_cliente_codigo?: string | null
          created_at?: string
          document?: string | null
          email: string
          full_name: string
          id?: string
          is_blocked?: boolean
          onboarded_at?: string | null
          phone?: string | null
          razao_social?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
          vinculo_confirmado?: boolean
          vinculo_pedido_em?: string | null
          whatsapp?: string | null
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          cnpj?: string | null
          com_cliente_codigo?: string | null
          created_at?: string
          document?: string | null
          email?: string
          full_name?: string
          id?: string
          is_blocked?: boolean
          onboarded_at?: string | null
          phone?: string | null
          razao_social?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
          vinculo_confirmado?: boolean
          vinculo_pedido_em?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_com_cliente_fkey"
            columns: ["tenant_id", "com_cliente_codigo"]
            isOneToOne: false
            referencedRelation: "com_clientes"
            referencedColumns: ["tenant_id", "codigo"]
          },
          {
            foreignKeyName: "customer_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_email_otps: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      dashboard_preferences: {
        Row: {
          created_at: string
          default_period: string
          id: string
          module: string
          tenant_id: string
          updated_at: string
          user_id: string
          visible_widgets: string[]
          widget_order: string[]
        }
        Insert: {
          created_at?: string
          default_period?: string
          id?: string
          module?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          visible_widgets?: string[]
          widget_order?: string[]
        }
        Update: {
          created_at?: string
          default_period?: string
          id?: string
          module?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          visible_widgets?: string[]
          widget_order?: string[]
        }
        Relationships: []
      }
      dashboard_view_templates: {
        Row: {
          active_tab: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          selected_period: string
          technician_filter: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_tab?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          selected_period?: string
          technician_filter?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_tab?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          selected_period?: string
          technician_filter?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_view_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_access_grants: {
        Row: {
          access_type: string
          created_at: string
          details: Json | null
          employee_id: string | null
          employee_name: string
          granted_at: string
          granted_by: string | null
          id: string
          name: string
          revoke_ticket_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          tenant_id: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          access_type: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          employee_name: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          name: string
          revoke_ticket_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          access_type?: string
          created_at?: string
          details?: Json | null
          employee_id?: string | null
          employee_name?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          name?: string
          revoke_ticket_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          tenant_id?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_access_grants_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_grants_revoke_ticket_id_fkey"
            columns: ["revoke_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_grants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_access_grants_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_lots: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_on: string | null
          id: string
          notes: string | null
          product_id: string
          received_on: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          notes?: string | null
          product_id: string
          received_on?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          received_on?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_lots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_lots_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_lots_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_product_balances"
            referencedColumns: ["product_id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_lots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_shipment_items: {
        Row: {
          description: string
          id: string
          lot_id: string | null
          order_item_id: string | null
          picked: number
          position: number
          product_id: string | null
          quantity: number
          shipment_id: string
          tenant_id: string
        }
        Insert: {
          description: string
          id?: string
          lot_id?: string | null
          order_item_id?: string | null
          picked?: number
          position?: number
          product_id?: string | null
          quantity: number
          shipment_id: string
          tenant_id: string
        }
        Update: {
          description?: string
          id?: string
          lot_id?: string | null
          order_item_id?: string | null
          picked?: number
          position?: number
          product_id?: string | null
          quantity?: number
          shipment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_shipment_items_lot_id_tenant_id_fkey"
            columns: ["lot_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_lot_balances"
            referencedColumns: ["lot_id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_shipment_items_lot_id_tenant_id_fkey"
            columns: ["lot_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_lots"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_shipment_items_order_item_id_tenant_id_fkey"
            columns: ["order_item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_order_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_shipment_items_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_shipment_items_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_product_balances"
            referencedColumns: ["product_id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_shipment_items_shipment_id_tenant_id_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_shipments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_shipment_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_shipments: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          id: string
          label_provider: string | null
          label_ref: string | null
          label_url: string | null
          notes: string | null
          number: number
          order_id: string
          shipped_at: string | null
          status: string
          tenant_id: string
          tracking_code: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label_provider?: string | null
          label_ref?: string | null
          label_url?: string | null
          notes?: string | null
          number: number
          order_id: string
          shipped_at?: string | null
          status?: string
          tenant_id: string
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label_provider?: string | null
          label_ref?: string | null
          label_url?: string | null
          notes?: string | null
          number?: number
          order_id?: string
          shipped_at?: string | null
          status?: string
          tenant_id?: string
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_shipments_order_id_tenant_id_fkey"
            columns: ["order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_shipments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_stock_moves: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          lot_id: string | null
          order_id: string | null
          product_id: string
          quantity: number
          reason: string | null
          shipment_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          lot_id?: string | null
          order_id?: string | null
          product_id: string
          quantity: number
          reason?: string | null
          shipment_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lot_id?: string | null
          order_id?: string | null
          product_id?: string
          quantity?: number
          reason?: string | null
          shipment_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_stock_moves_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_stock_moves_lot_id_tenant_id_fkey"
            columns: ["lot_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_lot_balances"
            referencedColumns: ["lot_id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_stock_moves_lot_id_tenant_id_fkey"
            columns: ["lot_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_lots"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_stock_moves_order_id_tenant_id_fkey"
            columns: ["order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_orders"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_stock_moves_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_stock_moves_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_product_balances"
            referencedColumns: ["product_id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_stock_moves_shipment_id_tenant_id_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_shipments"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_stock_moves_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_maps: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_budget_settings: {
        Row: {
          created_at: string
          mode: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          mode?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          mode?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_department_budgets: {
        Row: {
          created_at: string
          department: string
          id: string
          monthly_limit: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department: string
          id?: string
          monthly_limit?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department?: string
          id?: string
          monthly_limit?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      fin_entries: {
        Row: {
          amount: number
          category: string | null
          competence: string
          cost_center: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          description: string
          document_number: string | null
          due_date: string
          external_id: string | null
          id: string
          import_id: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          notes: string | null
          payment_method: string | null
          purchase_request_id: string | null
          settled_at: string | null
          source: string
          status: Database["public"]["Enums"]["fin_entry_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category?: string | null
          competence: string
          cost_center?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          document_number?: string | null
          due_date: string
          external_id?: string | null
          id?: string
          import_id?: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          notes?: string | null
          payment_method?: string | null
          purchase_request_id?: string | null
          settled_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["fin_entry_status"]
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          competence?: string
          cost_center?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          document_number?: string | null
          due_date?: string
          external_id?: string | null
          id?: string
          import_id?: string | null
          kind?: Database["public"]["Enums"]["fin_entry_kind"]
          notes?: string | null
          payment_method?: string | null
          purchase_request_id?: string | null
          settled_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["fin_entry_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_entries_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "fin_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_entries_purchase_fkey"
            columns: ["purchase_request_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "compras_solicitacoes"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      fin_imports: {
        Row: {
          competence: string | null
          created_at: string
          file_name: string
          format: string
          id: string
          imported_by: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          row_count: number
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          competence?: string | null
          created_at?: string
          file_name: string
          format?: string
          id?: string
          imported_by?: string | null
          kind: Database["public"]["Enums"]["fin_entry_kind"]
          row_count?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          competence?: string | null
          created_at?: string
          file_name?: string
          format?: string
          id?: string
          imported_by?: string | null
          kind?: Database["public"]["Enums"]["fin_entry_kind"]
          row_count?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      goal_checkins: {
        Row: {
          author_id: string | null
          created_at: string
          goal_id: string
          id: string
          note: string | null
          period_date: string
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          goal_id: string
          id?: string
          note?: string | null
          period_date: string
          tenant_id: string
          updated_at?: string
          value: number
        }
        Update: {
          author_id?: string | null
          created_at?: string
          goal_id?: string
          id?: string
          note?: string | null
          period_date?: string
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "goal_checkins_author_fkey"
            columns: ["author_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "goal_checkins_goal_fkey"
            columns: ["goal_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "goal_checkins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          assigned_to: string | null
          baseline: number | null
          completed_at: string | null
          created_at: string
          created_by: string
          current_value: number | null
          department: string | null
          description: string | null
          direction: string
          end_date: string
          frequency: string
          id: string
          parent_goal_id: string | null
          progress: number | null
          scope: string
          source_config: Json
          source_kind: string | null
          start_date: string
          status: string
          target_value: number
          tenant_id: string
          title: string
          unit: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          baseline?: number | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          current_value?: number | null
          department?: string | null
          description?: string | null
          direction?: string
          end_date: string
          frequency?: string
          id?: string
          parent_goal_id?: string | null
          progress?: number | null
          scope?: string
          source_config?: Json
          source_kind?: string | null
          start_date: string
          status?: string
          target_value?: number
          tenant_id: string
          title: string
          unit?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          baseline?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          current_value?: number | null
          department?: string | null
          description?: string | null
          direction?: string
          end_date?: string
          frequency?: string
          id?: string
          parent_goal_id?: string | null
          progress?: number | null
          scope?: string
          source_config?: Json
          source_kind?: string | null
          start_date?: string
          status?: string
          target_value?: number
          tenant_id?: string
          title?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_assigned_fkey"
            columns: ["assigned_to", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "goals_parent_fkey"
            columns: ["parent_goal_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      license_assignments: {
        Row: {
          asset_id: string | null
          assigned_at: string
          assigned_by: string | null
          assigned_to: string | null
          id: string
          license_id: string
          notes: string | null
          tenant_id: string
        }
        Insert: {
          asset_id?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assigned_to?: string | null
          id?: string
          license_id: string
          notes?: string | null
          tenant_id: string
        }
        Update: {
          asset_id?: string | null
          assigned_at?: string
          assigned_by?: string | null
          assigned_to?: string | null
          id?: string
          license_id?: string
          notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_assignments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_assignments_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "software_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      lyra_security_blocks: {
        Row: {
          blocked_until: string | null
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
          violation_count: number
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          violation_count?: number
        }
        Update: {
          blocked_until?: string | null
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          violation_count?: number
        }
        Relationships: []
      }
      metas_ano: {
        Row: {
          ano: number
          mes: number
          meta: number | null
          meta_total: number | null
          tenant_id: string
          total_realizado: number | null
        }
        Insert: {
          ano: number
          mes: number
          meta?: number | null
          meta_total?: number | null
          tenant_id?: string
          total_realizado?: number | null
        }
        Update: {
          ano?: number
          mes?: number
          meta?: number | null
          meta_total?: number | null
          tenant_id?: string
          total_realizado?: number | null
        }
        Relationships: []
      }
      metas_carteira: {
        Row: {
          ano: number
          carteira: string
          mes: number
          realizado: number | null
          tenant_id: string
        }
        Insert: {
          ano: number
          carteira: string
          mes: number
          realizado?: number | null
          tenant_id?: string
        }
        Update: {
          ano?: number
          carteira?: string
          mes?: number
          realizado?: number | null
          tenant_id?: string
        }
        Relationships: []
      }
      mkt_ai_generations: {
        Row: {
          accepted: boolean | null
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          model_used: string | null
          post_id: string | null
          prompt: string
          result: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["mkt_ai_generation_type"]
        }
        Insert: {
          accepted?: boolean | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          model_used?: string | null
          post_id?: string | null
          prompt: string
          result?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["mkt_ai_generation_type"]
        }
        Update: {
          accepted?: boolean | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          model_used?: string | null
          post_id?: string | null
          prompt?: string
          result?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["mkt_ai_generation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "mkt_ai_generations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ai_generations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mkt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ai_generations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "mkt_social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_ai_generations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_assets: {
        Row: {
          asset_tag: string
          assigned_to: string | null
          category: string
          created_at: string
          created_by: string | null
          department: string | null
          description: string | null
          id: string
          location: string | null
          manufacturer: string | null
          model: string | null
          name: string
          notes: string | null
          purchase_date: string | null
          purchase_value: number | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          subcategory: string | null
          tenant_id: string
          updated_at: string
          warranty_expiry: string | null
        }
        Insert: {
          asset_tag: string
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Update: {
          asset_tag?: string
          assigned_to?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          description?: string | null
          id?: string
          location?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          notes?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          subcategory?: string | null
          tenant_id?: string
          updated_at?: string
          warranty_expiry?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_assets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_events: {
        Row: {
          actual_cost: number | null
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          event_type: Database["public"]["Enums"]["mkt_event_type"]
          id: string
          is_online: boolean
          location: string | null
          notes: string | null
          responsible_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["mkt_event_status"]
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["mkt_event_type"]
          id?: string
          is_online?: boolean
          location?: string | null
          notes?: string | null
          responsible_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["mkt_event_status"]
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["mkt_event_type"]
          id?: string
          is_online?: boolean
          location?: string | null
          notes?: string | null
          responsible_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["mkt_event_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_events_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_quotations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string | null
          id: string
          items: Json | null
          notes: string | null
          purchase_order_ref: string | null
          status: Database["public"]["Enums"]["mkt_quotation_status"]
          supplier_id: string
          tenant_id: string
          title: string
          total_value: number | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          purchase_order_ref?: string | null
          status?: Database["public"]["Enums"]["mkt_quotation_status"]
          supplier_id: string
          tenant_id: string
          title: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          items?: Json | null
          notes?: string | null
          purchase_order_ref?: string | null
          status?: Database["public"]["Enums"]["mkt_quotation_status"]
          supplier_id?: string
          tenant_id?: string
          title?: string
          total_value?: number | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mkt_quotations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quotations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mkt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_quotations_supplier_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "mkt_quotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_account_secrets: {
        Row: {
          access_token: string | null
          account_id: string
          created_at: string
          page_access_token: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id: string
          created_at?: string
          page_access_token?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string
          created_at?: string
          page_access_token?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_account_secrets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "mkt_social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_accounts: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string
          created_at: string
          id: string
          is_active: boolean
          is_connected: boolean
          last_sync_at: string | null
          leads_subscribed_at: string | null
          page_id: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_connected?: boolean
          last_sync_at?: string | null
          leads_subscribed_at?: string | null
          page_id?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_connected?: boolean
          last_sync_at?: string | null
          leads_subscribed_at?: string | null
          page_id?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_social_posts: {
        Row: {
          account_id: string | null
          content: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          external_link: string | null
          hashtags: string[] | null
          id: string
          media_urls: string[] | null
          notes: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          post_type: Database["public"]["Enums"]["social_post_type"]
          published_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["social_post_status"]
          strategy_notes: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          external_link?: string | null
          hashtags?: string[] | null
          id?: string
          media_urls?: string[] | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          post_type?: Database["public"]["Enums"]["social_post_type"]
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          strategy_notes?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          external_link?: string | null
          hashtags?: string[] | null
          id?: string
          media_urls?: string[] | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          post_type?: Database["public"]["Enums"]["social_post_type"]
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["social_post_status"]
          strategy_notes?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_social_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "mkt_social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "mkt_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mkt_social_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      network_diagrams: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          description: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          description?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          payload: Json
          processed_at: string | null
          recipient_email: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          payload?: Json
          processed_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          email_sent: boolean
          id: string
          is_read: boolean
          message: string
          reference_id: string
          reference_type: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email_sent?: boolean
          id?: string
          is_read?: boolean
          message: string
          reference_id: string
          reference_type: string
          tenant_id: string
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          email_sent?: boolean
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string
          reference_type?: string
          tenant_id?: string
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      ped_checklists: {
        Row: {
          cliente_codigo: string
          cliente_nome: string
          contato: string
          criado_em: string
          criado_por: string | null
          editado_em: string | null
          enviado_em: string
          id: string
          interacao_id: string
          observacao: string | null
          protocolo: string
          rota: string | null
          tabela_preco: string | null
          tenant_id: string
          vendedor_id: string
          versao: number
        }
        Insert: {
          cliente_codigo: string
          cliente_nome: string
          contato: string
          criado_em?: string
          criado_por?: string | null
          editado_em?: string | null
          enviado_em?: string
          id?: string
          interacao_id: string
          observacao?: string | null
          protocolo: string
          rota?: string | null
          tabela_preco?: string | null
          tenant_id?: string
          vendedor_id: string
          versao?: number
        }
        Update: {
          cliente_codigo?: string
          cliente_nome?: string
          contato?: string
          criado_em?: string
          criado_por?: string | null
          editado_em?: string | null
          enviado_em?: string
          id?: string
          interacao_id?: string
          observacao?: string | null
          protocolo?: string
          rota?: string | null
          tabela_preco?: string | null
          tenant_id?: string
          vendedor_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_checklists_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_checklists_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: true
            referencedRelation: "com_interacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_checklists_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_colorimetria: {
        Row: {
          categoria: string
          codigo: string
          descricao: string | null
          tenant_id: string
        }
        Insert: {
          categoria: string
          codigo: string
          descricao?: string | null
          tenant_id?: string
        }
        Update: {
          categoria?: string
          codigo?: string
          descricao?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_colorimetria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_decisoes: {
        Row: {
          checklist_id: string
          id: string
          motivos: string[]
          observacao: string | null
          registrado_em: string
          registrado_por: string | null
          seq: number
          snapshot: Json | null
          status: string
          tenant_id: string
          versao: number
        }
        Insert: {
          checklist_id: string
          id?: string
          motivos?: string[]
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          seq?: never
          snapshot?: Json | null
          status: string
          tenant_id?: string
          versao?: number
        }
        Update: {
          checklist_id?: string
          id?: string
          motivos?: string[]
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          seq?: never
          snapshot?: Json | null
          status?: string
          tenant_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_decisoes_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "ped_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_decisoes_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "ped_checklists_situacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_decisoes_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_decisoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_finalizacoes: {
        Row: {
          checklist_id: string
          observacao: string | null
          registrado_em: string
          registrado_por: string | null
          tenant_id: string
        }
        Insert: {
          checklist_id: string
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          tenant_id?: string
        }
        Update: {
          checklist_id?: string
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_finalizacoes_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: true
            referencedRelation: "ped_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_finalizacoes_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: true
            referencedRelation: "ped_checklists_situacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_finalizacoes_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_finalizacoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_itens: {
        Row: {
          ajuda: string | null
          ativo: boolean
          created_at: string
          id: string
          ordem: number
          pede_justificativa: boolean
          regra: string | null
          rotulo: string
          tenant_id: string
        }
        Insert: {
          ajuda?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          pede_justificativa?: boolean
          regra?: string | null
          rotulo: string
          tenant_id?: string
        }
        Update: {
          ajuda?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          pede_justificativa?: boolean
          regra?: string | null
          rotulo?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_itens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_motivos_recusa: {
        Row: {
          ativo: boolean
          id: string
          nome: string
          ordem: number
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          id?: string
          nome: string
          ordem?: number
          tenant_id?: string
        }
        Update: {
          ativo?: boolean
          id?: string
          nome?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_motivos_recusa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_pagamentos: {
        Row: {
          checklist_id: string
          data_pagamento: string | null
          id: string
          observacao: string | null
          registrado_em: string
          registrado_por: string | null
          seq: number
          status: string
          tenant_id: string
        }
        Insert: {
          checklist_id: string
          data_pagamento?: string | null
          id?: string
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          seq?: never
          status: string
          tenant_id?: string
        }
        Update: {
          checklist_id?: string
          data_pagamento?: string | null
          id?: string
          observacao?: string | null
          registrado_em?: string
          registrado_por?: string | null
          seq?: never
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_pagamentos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "ped_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_pagamentos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "ped_checklists_situacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_pagamentos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_pagamentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_pedidos: {
        Row: {
          checklist_id: string
          desconto: number
          espelho_st: number | null
          espelho_total: number | null
          filial: string
          id: string
          importado_em: string | null
          numero: string
          ordem: number
          qtd_coloracao: number | null
          qtd_tonalizante: number | null
          tenant_id: string
          tipo: string
          valor: number
        }
        Insert: {
          checklist_id: string
          desconto?: number
          espelho_st?: number | null
          espelho_total?: number | null
          filial: string
          id?: string
          importado_em?: string | null
          numero: string
          ordem: number
          qtd_coloracao?: number | null
          qtd_tonalizante?: number | null
          tenant_id: string
          tipo: string
          valor: number
        }
        Update: {
          checklist_id?: string
          desconto?: number
          espelho_st?: number | null
          espelho_total?: number | null
          filial?: string
          id?: string
          importado_em?: string | null
          numero?: string
          ordem?: number
          qtd_coloracao?: number | null
          qtd_tonalizante?: number | null
          tenant_id?: string
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ped_pedidos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "ped_checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_pedidos_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "ped_checklists_situacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_pedidos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_respostas: {
        Row: {
          item_id: string
          justificativa: string | null
          pedido_id: string
          resposta: string
          tenant_id: string
        }
        Insert: {
          item_id: string
          justificativa?: string | null
          pedido_id: string
          resposta: string
          tenant_id: string
        }
        Update: {
          item_id?: string
          justificativa?: string | null
          pedido_id?: string
          resposta?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ped_respostas_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "ped_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_respostas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "ped_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_respostas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_attachments: {
        Row: {
          caption: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          pop_id: string
          sort_order: number | null
          tenant_id: string
          thumbnail_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          pop_id: string
          sort_order?: number | null
          tenant_id: string
          thumbnail_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          pop_id?: string
          sort_order?: number | null
          tenant_id?: string
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pop_attachments_pop_id_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_feedbacks: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          is_helpful: boolean | null
          pop_id: string
          rating: number
          suggestion: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_helpful?: boolean | null
          pop_id: string
          rating: number
          suggestion?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          is_helpful?: boolean | null
          pop_id?: string
          rating?: number
          suggestion?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pop_feedbacks_pop_id_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_interactions: {
        Row: {
          action: string
          created_at: string | null
          id: string
          pop_id: string
          tenant_id: string
          ticket_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          pop_id: string
          tenant_id: string
          ticket_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          pop_id?: string
          tenant_id?: string
          ticket_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pop_interactions_pop_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pop_interactions_ticket_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      pop_versions: {
        Row: {
          category: string | null
          change_summary: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          keywords: string[] | null
          pop_id: string
          subcategory: string | null
          tenant_id: string
          title: string
          version_number: number
        }
        Insert: {
          category?: string | null
          change_summary?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          keywords?: string[] | null
          pop_id: string
          subcategory?: string | null
          tenant_id: string
          title: string
          version_number?: number
        }
        Update: {
          category?: string | null
          change_summary?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          keywords?: string[] | null
          pop_id?: string
          subcategory?: string | null
          tenant_id?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "pop_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pop_versions_pop_id_fkey"
            columns: ["pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      pops: {
        Row: {
          audience: string
          avg_rating: number | null
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          keywords: string[] | null
          related_pattern_id: string | null
          solved_count: number | null
          subcategory: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          views_count: number | null
          visibility_departments: string[] | null
          visibility_type: string
        }
        Insert: {
          audience?: string
          avg_rating?: number | null
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          related_pattern_id?: string | null
          solved_count?: number | null
          subcategory?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
          views_count?: number | null
          visibility_departments?: string[] | null
          visibility_type?: string
        }
        Update: {
          audience?: string
          avg_rating?: number | null
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          keywords?: string[] | null
          related_pattern_id?: string | null
          solved_count?: number | null
          subcategory?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          views_count?: number | null
          visibility_departments?: string[] | null
          visibility_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pops_related_pattern_fkey"
            columns: ["related_pattern_id"]
            isOneToOne: false
            referencedRelation: "ticket_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_history: {
        Row: {
          archived_at: string
          archived_by: string | null
          created_at: string
          id: string
          reason: string | null
          restored_at: string | null
          restored_by: string | null
          snapshot: Json
          tenant_id: string
          user_id: string
        }
        Insert: {
          archived_at?: string
          archived_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot: Json
          tenant_id: string
          user_id: string
        }
        Update: {
          archived_at?: string
          archived_by?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          snapshot?: Json
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          job_title: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          job_title?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          goal_id: string | null
          id: string
          name: string
          owner_id: string | null
          start_date: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          goal_id?: string | null
          id?: string
          name: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          goal_id?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          start_date?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_goal_fkey"
            columns: ["goal_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "projects_owner_fkey"
            columns: ["owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qualidade_access_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          permissions: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          permissions?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          permissions?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualidade_access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      qualidade_user_profiles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualidade_user_profiles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualidade_user_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "qualidade_access_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualidade_user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualidade_user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_absences: {
        Row: {
          created_at: string
          date: string
          days: number
          employee_id: string
          hours: number
          id: string
          justified: boolean
          kind: string
          notes: string | null
          reason: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          days?: number
          employee_id: string
          hours?: number
          id?: string
          justified?: boolean
          kind?: string
          notes?: string | null
          reason?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          days?: number
          employee_id?: string
          hours?: number
          id?: string
          justified?: boolean
          kind?: string
          notes?: string | null
          reason?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_benefit_plans: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          monthly_value: number | null
          name: string
          provider: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_value?: number | null
          name: string
          provider?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_value?: number | null
          name?: string
          provider?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_companies: {
        Row: {
          cnpj: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_departments_catalog: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_documents: {
        Row: {
          created_at: string
          document_type: string
          expires_at: string | null
          file_path: string
          id: string
          issue_date: string | null
          notes: string | null
          tenant_id: string
          title: string
          updated_at: string
          uploaded_by: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          document_type: string
          expires_at?: string | null
          file_path: string
          id?: string
          issue_date?: string | null
          notes?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_path?: string
          id?: string
          issue_date?: string | null
          notes?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_employee_benefits: {
        Row: {
          created_at: string
          created_by: string | null
          dependents: Json
          end_date: string | null
          id: string
          notes: string | null
          plan_id: string
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dependents?: Json
          end_date?: string | null
          id?: string
          notes?: string | null
          plan_id: string
          start_date?: string
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dependents?: Json
          end_date?: string | null
          id?: string
          notes?: string | null
          plan_id?: string
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_employee_benefits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rh_benefit_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_employee_benefits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_employee_profiles: {
        Row: {
          access_email: string | null
          admission_date: string | null
          base_salary: number | null
          birth_date: string | null
          company_id: string | null
          contract_type: string | null
          cost_center: string | null
          cpf: string | null
          created_at: string
          department: string | null
          full_name: string | null
          id: string
          job_title: string | null
          last_vacation_end: string | null
          manager_name: string | null
          manager_user_id: string | null
          matricula: string | null
          position: string | null
          probation_45: string | null
          probation_90: string | null
          status: string | null
          tenant_id: string
          termination_date: string | null
          updated_at: string
          user_id: string | null
          vacation_balance_days: number
        }
        Insert: {
          access_email?: string | null
          admission_date?: string | null
          base_salary?: number | null
          birth_date?: string | null
          company_id?: string | null
          contract_type?: string | null
          cost_center?: string | null
          cpf?: string | null
          created_at?: string
          department?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_vacation_end?: string | null
          manager_name?: string | null
          manager_user_id?: string | null
          matricula?: string | null
          position?: string | null
          probation_45?: string | null
          probation_90?: string | null
          status?: string | null
          tenant_id: string
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_balance_days?: number
        }
        Update: {
          access_email?: string | null
          admission_date?: string | null
          base_salary?: number | null
          birth_date?: string | null
          company_id?: string | null
          contract_type?: string | null
          cost_center?: string | null
          cpf?: string | null
          created_at?: string
          department?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_vacation_end?: string | null
          manager_name?: string | null
          manager_user_id?: string | null
          matricula?: string | null
          position?: string | null
          probation_45?: string | null
          probation_90?: string | null
          status?: string | null
          tenant_id?: string
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
          vacation_balance_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_employee_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_fuel_reimbursements: {
        Row: {
          created_at: string
          employee_id: string
          id: string
          km_per_day: number
          price_per_km: number
          reference_month: string
          salary_discount: number
          tenant_id: string
          to_pay: number
          total: number
          updated_at: string
          value_per_day: number
          work_days: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          id?: string
          km_per_day?: number
          price_per_km?: number
          reference_month: string
          salary_discount?: number
          tenant_id: string
          to_pay?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          id?: string
          km_per_day?: number
          price_per_km?: number
          reference_month?: string
          salary_discount?: number
          tenant_id?: string
          to_pay?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_fuel_reimbursements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_meal_vouchers: {
        Row: {
          created_at: string
          days: number
          employee_id: string
          employee_share_20: number
          id: string
          reference_month: string
          tenant_id: string
          total: number
          updated_at: string
          value_per_day: number
        }
        Insert: {
          created_at?: string
          days?: number
          employee_id: string
          employee_share_20?: number
          id?: string
          reference_month: string
          tenant_id: string
          total?: number
          updated_at?: string
          value_per_day?: number
        }
        Update: {
          created_at?: string
          days?: number
          employee_id?: string
          employee_share_20?: number
          id?: string
          reference_month?: string
          tenant_id?: string
          total?: number
          updated_at?: string
          value_per_day?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_meal_vouchers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_medical_certificates: {
        Row: {
          cid_code: string | null
          created_at: string
          days_off: number
          doctor_crm: string | null
          doctor_name: string | null
          file_path: string
          id: string
          issue_date: string
          status: string
          tenant_id: string
          ticket_id: string | null
          updated_at: string
          user_id: string
          validated_at: string | null
          validated_by: string | null
          validation_notes: string | null
        }
        Insert: {
          cid_code?: string | null
          created_at?: string
          days_off?: number
          doctor_crm?: string | null
          doctor_name?: string | null
          file_path: string
          id?: string
          issue_date: string
          status?: string
          tenant_id: string
          ticket_id?: string | null
          updated_at?: string
          user_id: string
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Update: {
          cid_code?: string | null
          created_at?: string
          days_off?: number
          doctor_crm?: string | null
          doctor_name?: string | null
          file_path?: string
          id?: string
          issue_date?: string
          status?: string
          tenant_id?: string
          ticket_id?: string | null
          updated_at?: string
          user_id?: string
          validated_at?: string | null
          validated_by?: string | null
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_medical_certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_monthly_deductions: {
        Row: {
          created_at: string
          employee_id: string
          family_allowance: number
          health_coparticipation: number
          health_plan: number
          id: string
          meal_voucher_discount: number
          mobility: number
          notes: string | null
          payroll_loan: number
          reference_month: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          family_allowance?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          meal_voucher_discount?: number
          mobility?: number
          notes?: string | null
          payroll_loan?: number
          reference_month: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          family_allowance?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          meal_voucher_discount?: number
          mobility?: number
          notes?: string | null
          payroll_loan?: number
          reference_month?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_monthly_deductions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_payroll_entries: {
        Row: {
          advance: number
          company_id: string | null
          created_at: string
          employee_id: string
          family_allowance: number
          gross_salary: number
          health_coparticipation: number
          health_plan: number
          id: string
          inss: number
          irpf: number
          irpf_thirteenth: number
          meal_voucher: number
          mobility: number
          net_salary: number
          notes: string | null
          other_deductions: number
          payroll_loan: number
          reference_month: string
          tenant_id: string
          thirteenth_vacation: number
          total_deductions: number
          transport_voucher: number
          updated_at: string
        }
        Insert: {
          advance?: number
          company_id?: string | null
          created_at?: string
          employee_id: string
          family_allowance?: number
          gross_salary?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          inss?: number
          irpf?: number
          irpf_thirteenth?: number
          meal_voucher?: number
          mobility?: number
          net_salary?: number
          notes?: string | null
          other_deductions?: number
          payroll_loan?: number
          reference_month: string
          tenant_id: string
          thirteenth_vacation?: number
          total_deductions?: number
          transport_voucher?: number
          updated_at?: string
        }
        Update: {
          advance?: number
          company_id?: string | null
          created_at?: string
          employee_id?: string
          family_allowance?: number
          gross_salary?: number
          health_coparticipation?: number
          health_plan?: number
          id?: string
          inss?: number
          irpf?: number
          irpf_thirteenth?: number
          meal_voucher?: number
          mobility?: number
          net_salary?: number
          notes?: string | null
          other_deductions?: number
          payroll_loan?: number
          reference_month?: string
          tenant_id?: string
          thirteenth_vacation?: number
          total_deductions?: number
          transport_voucher?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_payroll_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "rh_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_payroll_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_payroll_settings: {
        Row: {
          advance_pct: number
          company_id: string | null
          created_at: string
          fuel_pct: number
          fuel_price_per_km: number
          id: string
          inss_brackets: Json
          irpf_brackets: Json
          meal_voucher_default_value: number
          meal_voucher_pct: number
          tenant_id: string
          transport_voucher_cap: number
          transport_voucher_pct: number
          updated_at: string
        }
        Insert: {
          advance_pct?: number
          company_id?: string | null
          created_at?: string
          fuel_pct?: number
          fuel_price_per_km?: number
          id?: string
          inss_brackets?: Json
          irpf_brackets?: Json
          meal_voucher_default_value?: number
          meal_voucher_pct?: number
          tenant_id: string
          transport_voucher_cap?: number
          transport_voucher_pct?: number
          updated_at?: string
        }
        Update: {
          advance_pct?: number
          company_id?: string | null
          created_at?: string
          fuel_pct?: number
          fuel_price_per_km?: number
          id?: string
          inss_brackets?: Json
          irpf_brackets?: Json
          meal_voucher_default_value?: number
          meal_voucher_pct?: number
          tenant_id?: string
          transport_voucher_cap?: number
          transport_voucher_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_payroll_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "rh_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_payslips: {
        Row: {
          created_at: string
          file_path: string
          id: string
          reference_month: string
          tenant_id: string
          type: string
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          reference_month: string
          tenant_id: string
          type?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          reference_month?: string
          tenant_id?: string
          type?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_payslips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_transport_vouchers: {
        Row: {
          bus_trips_per_day: number
          created_at: string
          employee_id: string
          id: string
          metro_trips_per_day: number
          previous_balance: number
          reference_month: string
          tenant_id: string
          to_deposit: number
          total: number
          updated_at: string
          value_per_day: number
          work_days: number
        }
        Insert: {
          bus_trips_per_day?: number
          created_at?: string
          employee_id: string
          id?: string
          metro_trips_per_day?: number
          previous_balance?: number
          reference_month: string
          tenant_id: string
          to_deposit?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Update: {
          bus_trips_per_day?: number
          created_at?: string
          employee_id?: string
          id?: string
          metro_trips_per_day?: number
          previous_balance?: number
          reference_month?: string
          tenant_id?: string
          to_deposit?: number
          total?: number
          updated_at?: string
          value_per_day?: number
          work_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "rh_transport_vouchers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "rh_employee_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_vacation_requests: {
        Row: {
          created_at: string
          days_requested: number
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          end_date: string
          id: string
          notes: string | null
          start_date: string
          status: string
          tenant_id: string
          ticket_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_requested: number
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          status?: string
          tenant_id: string
          ticket_id?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_requested?: number
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          status?: string
          tenant_id?: string
          ticket_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_vacation_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_form_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          is_system: boolean | null
          label: string
          options: Json | null
          placeholder: string | null
          sort_order: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          is_system?: boolean | null
          label: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          is_system?: boolean | null
          label?: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_form_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          purpose: string
          tenant_id: string | null
          used: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          purpose: string
          tenant_id?: string | null
          used?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          purpose?: string
          tenant_id?: string | null
          used?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sac_otp_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_product_batches: {
        Row: {
          batch_code: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          manufactured_at: string | null
          product_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          batch_code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          manufactured_at?: string | null
          product_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          batch_code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          manufactured_at?: string | null
          product_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sac_products"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_products: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sku: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sku?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sku?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sac_report_products: {
        Row: {
          appearance: string | null
          batch: string | null
          color: string | null
          created_at: string
          density: number | null
          evidence_files: Json | null
          found_values: string | null
          id: string
          odor: string | null
          ph: number | null
          product_name: string
          quantity: number | null
          report_id: string
          sort_order: number | null
          specification: string | null
          tenant_id: string
          viscosity: number | null
        }
        Insert: {
          appearance?: string | null
          batch?: string | null
          color?: string | null
          created_at?: string
          density?: number | null
          evidence_files?: Json | null
          found_values?: string | null
          id?: string
          odor?: string | null
          ph?: number | null
          product_name: string
          quantity?: number | null
          report_id: string
          sort_order?: number | null
          specification?: string | null
          tenant_id: string
          viscosity?: number | null
        }
        Update: {
          appearance?: string | null
          batch?: string | null
          color?: string | null
          created_at?: string
          density?: number | null
          evidence_files?: Json | null
          found_values?: string | null
          id?: string
          odor?: string | null
          ph?: number | null
          product_name?: string
          quantity?: number | null
          report_id?: string
          sort_order?: number | null
          specification?: string | null
          tenant_id?: string
          viscosity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sac_report_products_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "sac_technical_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_report_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_technical_reports: {
        Row: {
          complaint: string | null
          conclusion: string | null
          created_at: string
          created_by: string | null
          customer_contact: string | null
          customer_name: string | null
          id: string
          report_date: string
          report_number: string
          sac_ticket_product_id: string | null
          signed_by_name: string | null
          signed_by_role: string | null
          status: string
          tenant_id: string
          test_location: string | null
          ticket_id: string
          treatment: string | null
          updated_at: string
        }
        Insert: {
          complaint?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          customer_contact?: string | null
          customer_name?: string | null
          id?: string
          report_date?: string
          report_number: string
          sac_ticket_product_id?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          status?: string
          tenant_id: string
          test_location?: string | null
          ticket_id: string
          treatment?: string | null
          updated_at?: string
        }
        Update: {
          complaint?: string | null
          conclusion?: string | null
          created_at?: string
          created_by?: string | null
          customer_contact?: string | null
          customer_name?: string | null
          id?: string
          report_date?: string
          report_number?: string
          sac_ticket_product_id?: string | null
          signed_by_name?: string | null
          signed_by_role?: string | null
          status?: string
          tenant_id?: string
          test_location?: string | null
          ticket_id?: string
          treatment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_technical_reports_sac_ticket_product_id_fkey"
            columns: ["sac_ticket_product_id"]
            isOneToOne: false
            referencedRelation: "sac_ticket_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_technical_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_technical_reports_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          tenant_id: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          tenant_id: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          tenant_id?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sac_ticket_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_ticket_comments: {
        Row: {
          attachments: Json | null
          author_id: string | null
          author_name: string | null
          author_type: string
          content: string
          created_at: string
          id: string
          is_internal: boolean | null
          notify_status: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json | null
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          notify_status?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          attachments?: Json | null
          author_id?: string | null
          author_name?: string | null
          author_type?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          notify_status?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_ticket_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_ticket_products: {
        Row: {
          attachments: Json
          created_at: string
          description: string | null
          id: string
          product_batch: string | null
          product_batch_id: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          sort_order: number
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          description?: string | null
          id?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          sort_order?: number
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          description?: string | null
          id?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          sort_order?: number
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_ticket_products_product_batch_id_fkey"
            columns: ["product_batch_id"]
            isOneToOne: false
            referencedRelation: "sac_product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sac_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_ticket_products_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "sac_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_tickets: {
        Row: {
          assigned_to: string | null
          category_id: string | null
          closed_at: string | null
          created_at: string
          customer_document: string | null
          customer_email: string
          customer_last_seen_at: string | null
          customer_name: string
          customer_phone: string | null
          customer_user_id: string | null
          description: string
          due_date: string | null
          dynamic_fields: Json | null
          first_response_at: string | null
          id: string
          invoice_attachments: Json
          order_number: string | null
          priority: string
          product_batch: string | null
          product_batch_id: string | null
          product_id: string | null
          product_name: string | null
          purchase_date: string | null
          quantity: number | null
          resolution_notes: string | null
          resolved_at: string | null
          satisfaction_comment: string | null
          satisfaction_rated_at: string | null
          satisfaction_rating: number | null
          satisfaction_resolved: string | null
          sla_due_at: string | null
          status: string
          subject: string | null
          tenant_id: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email: string
          customer_last_seen_at?: string | null
          customer_name: string
          customer_phone?: string | null
          customer_user_id?: string | null
          description: string
          due_date?: string | null
          dynamic_fields?: Json | null
          first_response_at?: string | null
          id?: string
          invoice_attachments?: Json
          order_number?: string | null
          priority?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_date?: string | null
          quantity?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rated_at?: string | null
          satisfaction_rating?: number | null
          satisfaction_resolved?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
          ticket_number?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          customer_document?: string | null
          customer_email?: string
          customer_last_seen_at?: string | null
          customer_name?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          description?: string
          due_date?: string | null
          dynamic_fields?: Json | null
          first_response_at?: string | null
          id?: string
          invoice_attachments?: Json
          order_number?: string | null
          priority?: string
          product_batch?: string | null
          product_batch_id?: string | null
          product_id?: string | null
          product_name?: string | null
          purchase_date?: string | null
          quantity?: number | null
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_comment?: string | null
          satisfaction_rated_at?: string | null
          satisfaction_rating?: number | null
          satisfaction_resolved?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sac_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_product_batch_id_fkey"
            columns: ["product_batch_id"]
            isOneToOne: false
            referencedRelation: "sac_product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "sac_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sac_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          created_at: string
          first_response_time: number
          id: string
          is_active: boolean | null
          module: string | null
          name: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_time: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_response_time: number
          id?: string
          is_active?: boolean | null
          module?: string | null
          name: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_time: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_response_time?: number
          id?: string
          is_active?: boolean | null
          module?: string | null
          name?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_time?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      software_contracts: {
        Row: {
          auto_create_ticket: boolean
          auto_renew: boolean
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contract_number: string | null
          created_at: string
          description: string | null
          document_url: string | null
          end_date: string
          id: string
          name: string
          notes: string | null
          payment_frequency:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          renewal_alert_days: number
          start_date: string
          status: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at: string
          value: number | null
          vendor: string
        }
        Insert: {
          auto_create_ticket?: boolean
          auto_renew?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_number?: string | null
          created_at?: string
          description?: string | null
          document_url?: string | null
          end_date: string
          id?: string
          name: string
          notes?: string | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          renewal_alert_days?: number
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          updated_at?: string
          value?: number | null
          vendor: string
        }
        Update: {
          auto_create_ticket?: boolean
          auto_renew?: boolean
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contract_number?: string | null
          created_at?: string
          description?: string | null
          document_url?: string | null
          end_date?: string
          id?: string
          name?: string
          notes?: string | null
          payment_frequency?:
            | Database["public"]["Enums"]["payment_frequency"]
            | null
          renewal_alert_days?: number
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id?: string
          updated_at?: string
          value?: number | null
          vendor?: string
        }
        Relationships: []
      }
      software_license_keys: {
        Row: {
          created_at: string
          license_id: string
          license_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          license_id: string
          license_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          license_id?: string
          license_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "software_license_keys_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: true
            referencedRelation: "software_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      software_license_renewals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          license_id: string
          new_expiry_date: string | null
          new_purchase_date: string | null
          notes: string | null
          previous_expiry_date: string | null
          previous_purchase_date: string | null
          provider: string | null
          renewal_value: number | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          license_id: string
          new_expiry_date?: string | null
          new_purchase_date?: string | null
          notes?: string | null
          previous_expiry_date?: string | null
          previous_purchase_date?: string | null
          provider?: string | null
          renewal_value?: number | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          license_id?: string
          new_expiry_date?: string | null
          new_purchase_date?: string | null
          notes?: string | null
          previous_expiry_date?: string | null
          previous_purchase_date?: string | null
          provider?: string | null
          renewal_value?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "software_license_renewals_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "software_licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      software_licenses: {
        Row: {
          admin_url: string | null
          auto_create_ticket: boolean
          created_at: string
          domain: string | null
          expiry_date: string | null
          id: string
          internal_owner: string | null
          is_active: boolean
          item_category: string
          license_key: string | null
          license_type: Database["public"]["Enums"]["license_type"]
          name: string
          notes: string | null
          public_url: string | null
          purchase_date: string | null
          purchase_value: number | null
          technical_notes: string | null
          tenant_id: string
          total_quantity: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          admin_url?: string | null
          auto_create_ticket?: boolean
          created_at?: string
          domain?: string | null
          expiry_date?: string | null
          id?: string
          internal_owner?: string | null
          is_active?: boolean
          item_category?: string
          license_key?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          name: string
          notes?: string | null
          public_url?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          technical_notes?: string | null
          tenant_id: string
          total_quantity?: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          admin_url?: string | null
          auto_create_ticket?: boolean
          created_at?: string
          domain?: string | null
          expiry_date?: string | null
          id?: string
          internal_owner?: string | null
          is_active?: boolean
          item_category?: string
          license_key?: string | null
          license_type?: Database["public"]["Enums"]["license_type"]
          name?: string
          notes?: string | null
          public_url?: string | null
          purchase_date?: string | null
          purchase_value?: number | null
          technical_notes?: string | null
          tenant_id?: string
          total_quantity?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          category: Database["public"]["Enums"]["supplier_category"]
          cnpj: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          rating: number | null
          services: string[] | null
          status: Database["public"]["Enums"]["supplier_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["supplier_category"]
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          rating?: number | null
          services?: string[] | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["supplier_category"]
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          rating?: number | null
          services?: string[] | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_ai_suggested: boolean | null
          position: number
          priority: number | null
          project_id: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tenant_id: string
          ticket_id: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_ai_suggested?: boolean | null
          position?: number
          priority?: number | null
          project_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id: string
          ticket_id?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_ai_suggested?: boolean | null
          position?: number
          priority?: number | null
          project_id?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string
          ticket_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_ticket_id_tenant_id_fkey"
            columns: ["ticket_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tasks_user_id_tenant_fkey"
            columns: ["user_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      tenant_ai_credentials: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_last4: string | null
          model: string
          provider: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_last4?: string | null
          model: string
          provider: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_last4?: string | null
          model?: string
          provider?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_ai_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_bling_connections: {
        Row: {
          access_token: string
          company_name: string | null
          connected_by: string | null
          created_at: string
          expires_at: string
          refresh_token: string
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          company_name?: string | null
          connected_by?: string | null
          created_at?: string
          expires_at: string
          refresh_token: string
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          company_name?: string | null
          connected_by?: string | null
          created_at?: string
          expires_at?: string
          refresh_token?: string
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_bling_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_correios_credentials: {
        Row: {
          access_token: string | null
          cartao_postagem: string
          codigo_acesso: string
          codigo_servico: string
          connected_by: string | null
          contrato: string | null
          created_at: string
          remetente: Json
          tenant_id: string
          token_expires_at: string | null
          updated_at: string
          usuario: string
        }
        Insert: {
          access_token?: string | null
          cartao_postagem: string
          codigo_acesso: string
          codigo_servico?: string
          connected_by?: string | null
          contrato?: string | null
          created_at?: string
          remetente?: Json
          tenant_id: string
          token_expires_at?: string | null
          updated_at?: string
          usuario: string
        }
        Update: {
          access_token?: string | null
          cartao_postagem?: string
          codigo_acesso?: string
          codigo_servico?: string
          connected_by?: string | null
          contrato?: string | null
          created_at?: string
          remetente?: Json
          tenant_id?: string
          token_expires_at?: string | null
          updated_at?: string
          usuario?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_correios_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          created_at: string
          hostname: string
          id: string
          is_primary: boolean
          last_check_at: string | null
          last_error: string | null
          tenant_id: string
          updated_at: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          hostname: string
          id?: string
          is_primary?: boolean
          last_check_at?: string | null
          last_error?: string | null
          tenant_id: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          hostname?: string
          id?: string
          is_primary?: boolean
          last_check_at?: string | null
          last_error?: string | null
          tenant_id?: string
          updated_at?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_focusnfe_connections: {
        Row: {
          ambiente: string
          cfop_padrao: string
          cnpj_emitente: string
          connected_by: string | null
          created_at: string
          hook_id: string | null
          hook_secret: string | null
          natureza_operacao: string
          serie: number
          tenant_id: string
          token: string
          updated_at: string
        }
        Insert: {
          ambiente?: string
          cfop_padrao?: string
          cnpj_emitente: string
          connected_by?: string | null
          created_at?: string
          hook_id?: string | null
          hook_secret?: string | null
          natureza_operacao?: string
          serie?: number
          tenant_id: string
          token: string
          updated_at?: string
        }
        Update: {
          ambiente?: string
          cfop_padrao?: string
          cnpj_emitente?: string
          connected_by?: string | null
          created_at?: string
          hook_id?: string | null
          hook_secret?: string | null
          natureza_operacao?: string
          serie?: number
          tenant_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_focusnfe_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_invites: {
        Row: {
          access_profile_id: string | null
          access_profile_overrides: Json | null
          created_at: string
          department: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_send_error: string | null
          last_sent_at: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          send_attempts: number
          send_status: string
          tenant_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          access_profile_id?: string | null
          access_profile_overrides?: Json | null
          created_at?: string
          department?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_send_error?: string | null
          last_sent_at?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          send_attempts?: number
          send_status?: string
          tenant_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          access_profile_id?: string | null
          access_profile_overrides?: Json | null
          created_at?: string
          department?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_send_error?: string | null
          last_sent_at?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          send_attempts?: number
          send_status?: string
          tenant_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invites_access_profile_id_fkey"
            columns: ["access_profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_lead_ads_connections: {
        Row: {
          app_secret: string | null
          connected_by: string | null
          created_at: string
          is_active: boolean
          tenant_id: string
          updated_at: string
          verify_token: string
        }
        Insert: {
          app_secret?: string | null
          connected_by?: string | null
          created_at?: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
          verify_token?: string
        }
        Update: {
          app_secret?: string | null
          connected_by?: string | null
          created_at?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
          verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_lead_ads_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_credentials: {
        Row: {
          alias: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          key_last4: string | null
          provider: string
          secret_key: string
          secret_key_2: string | null
          tenant_id: string
          updated_at: string
          webhook_id: string | null
          webhook_secret: string | null
        }
        Insert: {
          alias?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          key_last4?: string | null
          provider: string
          secret_key: string
          secret_key_2?: string | null
          tenant_id: string
          updated_at?: string
          webhook_id?: string | null
          webhook_secret?: string | null
        }
        Update: {
          alias?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          key_last4?: string | null
          provider?: string
          secret_key?: string
          secret_key_2?: string | null
          tenant_id?: string
          updated_at?: string
          webhook_id?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_credentials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_signup_attempts: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          error_code: string | null
          id: string
          slug: string | null
          success: boolean
          user_id: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          error_code?: string | null
          id?: string
          slug?: string | null
          success?: boolean
          user_id?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          error_code?: string | null
          id?: string
          slug?: string | null
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      tenant_whatsapp_connections: {
        Row: {
          access_token: string
          app_secret: string | null
          connected_by: string | null
          created_at: string
          display_phone: string | null
          is_active: boolean
          phone_number_id: string
          tenant_id: string
          updated_at: string
          verify_token: string
          waba_id: string
        }
        Insert: {
          access_token: string
          app_secret?: string | null
          connected_by?: string | null
          created_at?: string
          display_phone?: string | null
          is_active?: boolean
          phone_number_id: string
          tenant_id: string
          updated_at?: string
          verify_token?: string
          waba_id: string
        }
        Update: {
          access_token?: string
          app_secret?: string | null
          connected_by?: string | null
          created_at?: string
          display_phone?: string | null
          is_active?: boolean
          phone_number_id?: string
          tenant_id?: string
          updated_at?: string
          verify_token?: string
          waba_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_whatsapp_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string
          plan_config: Json | null
          settings: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          plan_config?: Json | null
          settings?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          plan_config?: Json | null
          settings?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ti_access_profiles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          modules: Json
          name: string
          permissions: Json
          tenant_id: string
          ticket_restrictions: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          modules?: Json
          name: string
          permissions?: Json
          tenant_id: string
          ticket_restrictions?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          modules?: Json
          name?: string
          permissions?: Json
          tenant_id?: string
          ticket_restrictions?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ti_access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_purchase: boolean
          module: string
          name: string
          parent_id: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_purchase?: boolean
          module: string
          name: string
          parent_id?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_purchase?: boolean
          module?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ti_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_insight_reports: {
        Row: {
          created_at: string | null
          created_by: string
          frequency: string
          id: string
          is_active: boolean | null
          last_generated_at: string | null
          name: string
          notify_email: boolean | null
          notify_inapp: boolean | null
          target_metrics: string[]
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          name: string
          notify_email?: boolean | null
          notify_inapp?: boolean | null
          target_metrics?: string[]
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          name?: string
          notify_email?: boolean | null
          notify_inapp?: boolean | null
          target_metrics?: string[]
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ti_insight_snapshots: {
        Row: {
          generated_at: string | null
          id: string
          lyra_analysis: string | null
          metrics_data: Json
          report_id: string
          tenant_id: string
        }
        Insert: {
          generated_at?: string | null
          id?: string
          lyra_analysis?: string | null
          metrics_data?: Json
          report_id: string
          tenant_id: string
        }
        Update: {
          generated_at?: string | null
          id?: string
          lyra_analysis?: string | null
          metrics_data?: Json
          report_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ti_insight_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "ti_insight_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ti_user_profiles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          profile_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ti_user_profiles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_user_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "ti_access_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_user_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ti_user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          comment_id: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          tenant_id: string
          ticket_id: string
          uploaded_by: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          tenant_id: string
          ticket_id: string
          uploaded_by?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          tenant_id?: string
          ticket_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "ticket_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string
          id: string
          is_completed: boolean
          is_required: boolean
          responsible_sector: string | null
          sort_order: number
          template_item_id: string | null
          tenant_id: string
          ticket_checklist_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description: string
          id?: string
          is_completed?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_item_id?: string | null
          tenant_id: string
          ticket_checklist_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string
          id?: string
          is_completed?: boolean
          is_required?: boolean
          responsible_sector?: string | null
          sort_order?: number
          template_item_id?: string | null
          tenant_id?: string
          ticket_checklist_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklist_items_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_template_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklist_items_ticket_checklist_id_fkey"
            columns: ["ticket_checklist_id"]
            isOneToOne: false
            referencedRelation: "ticket_checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_checklists: {
        Row: {
          created_at: string
          id: string
          status: string
          template_id: string | null
          tenant_id: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          template_id?: string | null
          tenant_id: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          template_id?: string | null
          tenant_id?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_checklists_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_checklists_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_internal: boolean | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_form_fields: {
        Row: {
          category_id: string
          created_at: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          options: Json | null
          placeholder: string | null
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["form_field_type"]
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          field_type?: Database["public"]["Enums"]["form_field_type"]
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          options?: Json | null
          placeholder?: string | null
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_form_fields_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_form_fields_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_form_responses: {
        Row: {
          created_at: string
          field_id: string
          id: string
          tenant_id: string
          ticket_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          tenant_id: string
          ticket_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          tenant_id?: string
          ticket_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_form_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "ticket_form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_form_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_form_responses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_mentions: {
        Row: {
          created_at: string
          id: string
          mentioned_by: string
          mentioned_user_id: string
          message: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mentioned_by: string
          mentioned_user_id: string
          message?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mentioned_by?: string
          mentioned_user_id?: string
          message?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_mentions_mentioned_by_fkey"
            columns: ["mentioned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_mentions_mentioned_user_id_fkey"
            columns: ["mentioned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_mentions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_mentions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_patterns: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_reviewed: boolean | null
          keywords: string[] | null
          last_occurrence: string | null
          occurrence_count: number | null
          pattern_name: string
          sample_ticket_ids: string[] | null
          suggested_pop_id: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_reviewed?: boolean | null
          keywords?: string[] | null
          last_occurrence?: string | null
          occurrence_count?: number | null
          pattern_name: string
          sample_ticket_ids?: string[] | null
          suggested_pop_id?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_reviewed?: boolean | null
          keywords?: string[] | null
          last_occurrence?: string | null
          occurrence_count?: number | null
          pattern_name?: string
          sample_ticket_ids?: string[] | null
          suggested_pop_id?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_patterns_suggested_pop_fkey"
            columns: ["suggested_pop_id"]
            isOneToOne: false
            referencedRelation: "pops"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          asset_id: string | null
          assigned_to: string | null
          category: string | null
          category_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          first_response_at: string | null
          id: string
          module: string
          origin_step_id: string | null
          origin_subject_id: string | null
          origin_workflow_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          requester_id: string
          resolution_notes: string | null
          resolved_at: string | null
          satisfaction_rating: number | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subcategory: string | null
          tenant_id: string
          ticket_number: number
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          assigned_to?: string | null
          category?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date?: string | null
          first_response_at?: string | null
          id?: string
          module?: string
          origin_step_id?: string | null
          origin_subject_id?: string | null
          origin_workflow_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_rating?: number | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          tenant_id: string
          ticket_number?: number
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          assigned_to?: string | null
          category?: string | null
          category_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          first_response_at?: string | null
          id?: string
          module?: string
          origin_step_id?: string | null
          origin_subject_id?: string | null
          origin_workflow_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          requester_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          satisfaction_rating?: number | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          tenant_id?: string
          ticket_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ti_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tickets_origin_workflow_id_fkey"
            columns: ["origin_workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_requester_id_fkey"
            columns: ["requester_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      training_enrollments: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_profile_id: string | null
          id: string
          notes: string | null
          profile_id: string | null
          session_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_profile_id?: string | null
          id?: string
          notes?: string | null
          profile_id?: string | null
          session_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_profile_id?: string | null
          id?: string
          notes?: string | null
          profile_id?: string | null
          session_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_enrollments_customer_fkey"
            columns: ["customer_profile_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "training_enrollments_profile_fkey"
            columns: ["profile_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "training_enrollments_session_fkey"
            columns: ["session_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "training_sessions"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "training_enrollments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      training_sessions: {
        Row: {
          capacity: number | null
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          instructor_id: string | null
          location: string | null
          modality: string
          notes: string | null
          starts_at: string
          status: string
          tenant_id: string
          training_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          instructor_id?: string | null
          location?: string | null
          modality?: string
          notes?: string | null
          starts_at: string
          status?: string
          tenant_id: string
          training_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          instructor_id?: string | null
          location?: string | null
          modality?: string
          notes?: string | null
          starts_at?: string
          status?: string
          tenant_id?: string
          training_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_sessions_instructor_fkey"
            columns: ["instructor_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "training_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_sessions_training_fkey"
            columns: ["training_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "trainings"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      trainings: {
        Row: {
          audience: string
          created_at: string
          created_by: string | null
          description: string | null
          hours: number | null
          id: string
          is_active: boolean
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          hours?: number | null
          id?: string
          is_active?: boolean
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          hours?: number | null
          id?: string
          is_active?: boolean
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trainings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_access_profiles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          department: string
          id: string
          overrides: Json
          profile_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          department: string
          id?: string
          overrides?: Json
          profile_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          department?: string
          id?: string
          overrides?: Json
          profile_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_access_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "access_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_access_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_module_access: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          module: string
          permissions: Json
          tenant_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module: string
          permissions?: Json
          tenant_id: string
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          module?: string
          permissions?: Json
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_module_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_module_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      exp_lot_balances: {
        Row: {
          balance: number | null
          code: string | null
          expires_on: string | null
          lot_id: string | null
          product_id: string | null
          received_on: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_lots_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "crm_products"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_lots_product_id_tenant_id_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "exp_product_balances"
            referencedColumns: ["product_id", "tenant_id"]
          },
          {
            foreignKeyName: "exp_lots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_balances: {
        Row: {
          balance: number | null
          barcode: string | null
          name: string | null
          next_expiry: string | null
          product_id: string | null
          sku: string | null
          tenant_id: string | null
          track_lots: boolean | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ped_checklists_situacao: {
        Row: {
          cliente_codigo: string | null
          cliente_nome: string | null
          contato: string | null
          criado_em: string | null
          criado_por: string | null
          criado_por_nome: string | null
          editado_em: string | null
          enviado_em: string | null
          finalizado_em: string | null
          finalizado_observacao: string | null
          finalizado_por: string | null
          historico_pagamentos: Json | null
          historico_recusas: Json | null
          id: string | null
          interacao_id: string | null
          observacao: string | null
          pagamento_data: string | null
          pagamento_status: string | null
          protocolo: string | null
          qtd_pedidos: number | null
          recusas: number | null
          retorno_em: string | null
          retorno_motivos: string[] | null
          retorno_observacao: string | null
          retorno_por: string | null
          retorno_status: string | null
          rota: string | null
          situacao: string | null
          tabela_preco: string | null
          tenant_id: string | null
          valor_total: number | null
          vendedor_id: string | null
          vendedor_nome: string | null
          versao: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ped_checklists_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_checklists_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: true
            referencedRelation: "com_interacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ped_checklists_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abas_de_configuracao: { Args: { p_setor: string }; Returns: string[] }
      archive_profile: {
        Args: { _reason?: string; _user_id: string }
        Returns: string
      }
      automation_advance: { Args: { p_run: string }; Returns: undefined }
      automation_cancel_run: { Args: { p_run: string }; Returns: undefined }
      automation_claim_external: {
        Args: { p_limit?: number }
        Returns: {
          config: Json
          kind: string
          run_id: string
          step_id: string
          subject_id: string
          subject_type: string
          tenant_id: string
          workflow_name: string
        }[]
      }
      automation_complete_external: {
        Args: {
          p_error?: string
          p_result?: Json
          p_run: string
          p_step: string
        }
        Returns: undefined
      }
      automation_enqueue: {
        Args: {
          p_entity: string
          p_event: string
          p_module: string
          p_payload: Json
          p_subject: string
          p_tenant: string
        }
        Returns: number
      }
      automation_enrich_payload: {
        Args: { p_after: Json; p_entity: string }
        Returns: Json
      }
      automation_filter_matches: {
        Args: { p_ctx: Json; p_filter: Json }
        Returns: boolean
      }
      automation_manual_for: {
        Args: { p_entity: string }
        Returns: {
          id: string
          module: string
          name: string
        }[]
      }
      automation_mark_skipped: {
        Args: { p_chosen: Json; p_ctx: Json; p_flow: Json; p_step: Json }
        Returns: Json
      }
      automation_next_schedule: {
        Args: { p_after: string; p_trigger: Json }
        Returns: string
      }
      automation_render: {
        Args: { p_ctx: Json; p_text: string }
        Returns: string
      }
      automation_render_config: {
        Args: { p_cfg: Json; p_ctx: Json }
        Returns: Json
      }
      automation_retry_run: { Args: { p_run: string }; Returns: undefined }
      automation_run_manual: {
        Args: { p_subject_id: string; p_workflow: string }
        Returns: string
      }
      automation_run_step: {
        Args: {
          p_step: Json
          r: Database["public"]["Tables"]["automation_runs"]["Row"]
        }
        Returns: Json
      }
      automation_start_run: {
        Args: {
          p_ctx: Json
          p_kind: string
          p_subject_id: string
          p_subject_type: string
          w: Database["public"]["Tables"]["automation_workflows"]["Row"]
        }
        Returns: string
      }
      automation_step: { Args: { p_flow: Json; p_id: string }; Returns: Json }
      automation_subject_row: {
        Args: { p_id: string; p_type: string }
        Returns: Json
      }
      automation_target_user: {
        Args: { p_cfg: Json; p_ctx: Json }
        Returns: string
      }
      automation_tick: { Args: never; Returns: Json }
      automation_tick_deal_idle: { Args: never; Returns: number }
      automation_ticket_do_passo: {
        Args: {
          p_assigned: string
          p_category: string
          p_description: string
          p_due: string
          p_module: string
          p_priority: Database["public"]["Enums"]["ticket_priority"]
          p_requester: string
          p_run: Database["public"]["Tables"]["automation_runs"]["Row"]
          p_step: Json
          p_title: string
          p_workflow: Database["public"]["Tables"]["automation_workflows"]["Row"]
        }
        Returns: string
      }
      automation_validate_flow: {
        Args: { p_steps: Json; p_trigger: Json }
        Returns: boolean
      }
      automation_webhook_fire: {
        Args: { p_body: Json; p_secret: string; p_workflow: string }
        Returns: string
      }
      automation_webhook_secret: {
        Args: { p_workflow: string }
        Returns: string
      }
      chat_abrir_conversa: { Args: { p_outro: string }; Returns: string }
      chat_canal_aberto: { Args: { p_channel: string }; Returns: boolean }
      chat_canal_admin: { Args: { p_channel: string }; Returns: boolean }
      chat_canal_visivel: { Args: { p_channel: string }; Returns: boolean }
      chat_nao_lidas: {
        Args: never
        Returns: {
          channel_id: string
          qtd: number
        }[]
      }
      chat_sou_membro: { Args: { p_channel: string }; Returns: boolean }
      com_acompanhamento_da_carteira: {
        Args: { p_carteira: string; p_competencia: string }
        Returns: {
          codigos: string[]
          contatos_mes: number
          dias_sem_comprar: number
          faturado_12m: number
          grupo_chave: string
          grupo_nome: string
          media_meses_compra: number
          meses_com_compra: number
          observacao: string
          proximo_prazo: string
          recompra: boolean
          situacao: string
          status_ultimo_contato: string
          tabelas: string
          uf_cidade: string
          ultima_compra: string
          ultimo_contato: string
          venda_mes: number
        }[]
      }
      com_anos_com_venda: {
        Args: never
        Returns: {
          ano: number
        }[]
      }
      com_aplicar_solicitacao_cadastro: {
        Args: { p_codigo: string; p_id: string }
        Returns: string
      }
      com_atendimento_do_cliente: {
        Args: { p_codigo: string }
        Returns: {
          carteira: string
          responsavel_id: string
          responsavel_nome: string
          situacao: string
        }[]
      }
      com_atribuir_carteira_em_lote: {
        Args: { p_carteira: string; p_codigos: string[] }
        Returns: Json
      }
      com_bonificacao_farol_clientes: {
        Args: { p_ate: string; p_de: string; p_filial?: string }
        Returns: {
          bonificacao: number
          cliente_codigo: string
          comprado: number
          motivo: string
          nome: string
          percentual: number
          tabela_preco: string
        }[]
      }
      com_bonificacao_farol_produtos: {
        Args: { p_ate: string; p_de: string; p_filial?: string }
        Returns: {
          bonificado: number
          nome: string
          produto_codigo: string
          quantidade_bonificada: number
          quantidade_vendida: number
          vendido: number
          vezes: number
        }[]
      }
      com_bonificacao_por_cliente: {
        Args: {
          p_ate: string
          p_de: string
          p_filial?: string
          p_serie?: string
        }
        Returns: {
          bonificado: number
          cliente_codigo: string
          comprado: number
          nome: string
          percentual: number
          tabela_preco: string
        }[]
      }
      com_caixas: {
        Args: {
          p_ano: number
          p_ate?: string
          p_de?: string
          p_filial?: string
        }
        Returns: {
          bonificacao: number
          clientes_ativos: number
          devolucao: number
          faturamento_liquido: number
          fora_das_caixas: number
          industrializacao: number
          outros: number
          skus_vendidos: number
          total_importado: number
          unidades_bonificadas: number
          unidades_vendidas: number
          venda_com_nota: number
          venda_sem_nota: number
          venda_total: number
        }[]
      }
      com_carteira_mes_a_mes: {
        Args: { p_ano: number; p_carteira: string }
        Returns: {
          cor: string
          mes: number
          meta: number
          venda: number
        }[]
      }
      com_carteiras_com_meses: {
        Args: never
        Returns: {
          carteira: string
          meses_com_valor: number
        }[]
      }
      com_carteiras_conhecidas: {
        Args: never
        Returns: {
          carteira: string
        }[]
      }
      com_cashback_farol_clientes: {
        Args: { p_ano: number; p_filial?: string }
        Returns: {
          cliente_codigo: string
          competencia: string
          comprado_no_ano: number
          comprado_no_mes: number
          comprou_da_faixa: number
          faltou: number
          minimo: number
          motivo: string
          nome: string
          tabela_base: string
        }[]
      }
      com_cashback_farol_tabelas: {
        Args: { p_ano: number; p_filial?: string }
        Returns: {
          clientes: number
          comprado: number
          tabela_base: string
        }[]
      }
      com_cashback_indicadores: {
        Args: { p_ano: number; p_filial?: string }
        Returns: {
          cashback_total: number
          clientes_nao_atingiram: number
          clientes_sem_programa: number
          clientes_sem_tabela: number
          comprado_total: number
          percentual: number
        }[]
      }
      com_cashback_mensal: {
        Args: { p_ano: number; p_codigo?: string; p_filial?: string }
        Returns: {
          cashback: number
          cliente_codigo: string
          competencia: string
          comprado: number
          nome: string
          percentual: number
          sem_programa: boolean
          sem_tabela: boolean
          tabela_base: string
        }[]
      }
      com_cashback_resumo: {
        Args: { p_ano: number; p_codigo?: string; p_filial?: string }
        Returns: {
          cashback: number
          cliente_codigo: string
          comprado: number
          falta_proxima_faixa: number
          menor_distancia: number
          meses_com_direito: number
          meta_para_ativar: number
          nome: string
          sem_programa: boolean
          sem_tabela: boolean
          tabela_base: string
          ultima_competencia: string
          ultima_faixa: number
        }[]
      }
      com_cfop_fora_da_curva: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          cfop: string
          linhas: number
          valor: number
        }[]
      }
      com_chave_do_grupo: {
        Args: { p_codigo: string; p_grupo: string }
        Returns: string
      }
      com_classe_do_cfop: { Args: { p_cfop: string }; Returns: string }
      com_clientes_a_trabalhar: {
        Args: { p_ano: number; p_filial?: string }
        Returns: {
          cliente_codigo: string
          em_condicao: boolean
          nome: string
          tabela_preco: string
          ultima_compra: string
          valor_ultimos_3m: number
        }[]
      }
      com_codigos_de_vendedor: {
        Args: never
        Returns: {
          clientes: number
          ligado: boolean
          ultima_venda: string
          valor: number
          vendedor_codigo: string
          vendedor_nome: string
        }[]
      }
      com_competencias_importadas: {
        Args: { p_filial: string }
        Returns: {
          competencia: string
        }[]
      }
      com_conciliacao: {
        Args: { p_ano: number }
        Returns: {
          bonificacao: number
          diferenca_com_nota: number
          diferenca_total: number
          informado: number
          meses_comparados: number
          venda_com_nota: number
          venda_sem_nota: number
          venda_total: number
        }[]
      }
      com_cor_do_farol: {
        Args: { p_meta: number; p_realizado: number }
        Returns: string
      }
      com_curva_abc: {
        Args: {
          p_ate: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          acumulado: number
          faixa: string
          nome: string
          participacao: number
          produto_codigo: string
          quantidade: number
          valor: number
        }[]
      }
      com_curva_abc_faixas: {
        Args: {
          p_ate: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          faixa: string
          produtos: number
          valor: number
        }[]
      }
      com_decidir_solicitacao_cadastro: {
        Args: { p_decisao: string; p_id: string; p_parecer: string }
        Returns: Json
      }
      com_descartar_importacao: { Args: { p_id: string }; Returns: undefined }
      com_detalhe_produto: {
        Args: {
          p_ate: string
          p_codigo: string
          p_de: string
          p_filial?: string
        }
        Returns: Json
      }
      com_documento_ja_cadastrado: {
        Args: { p_documento: string }
        Returns: {
          carteira: string
          codigo: string
          razao_social: string
        }[]
      }
      com_evolucao_por_faixa: {
        Args: {
          p_ate: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          cliente_codigo: string
          meses: Json
          nome: string
          total: number
        }[]
      }
      com_farol_de_acoes: {
        Args: { p_competencia: string }
        Returns: {
          acao: string
          indicador_id: string
          ordem: number
          quantidade: number
          vendedor_id: string
          vendedor_nome: string
        }[]
      }
      com_faturamento_mensal: {
        Args: {
          p_ano: number
          p_ate?: string
          p_de?: string
          p_filial?: string
          p_serie?: string
        }
        Returns: {
          bonificacao: number
          clientes_ativos: number
          competencia: string
          devolucao: number
          filial: string
          liquido: number
          serie: string
          skus_vendidos: number
          unidades: number
          venda: number
        }[]
      }
      com_faturamento_por_cliente: {
        Args: {
          p_ate: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          bonificacao: number
          cliente_codigo: string
          em_condicao: boolean
          faturamento: number
          meses_ativos: number
          nome: string
          serie_mensal: Json
          skus: number
          tabela_preco: string
        }[]
      }
      com_ficha_bonificado: {
        Args: {
          p_ate: string
          p_codigo: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          nome: string
          produto_codigo: string
          quantidade: number
          valor: number
        }[]
      }
      com_ficha_cliente: {
        Args: {
          p_ate: string
          p_codigo: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: Json
      }
      com_ficha_comprou: {
        Args: {
          p_ate: string
          p_codigo: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          faixa_cliente: string
          faixa_geral: string
          nome: string
          produto_codigo: string
          quantidade: number
          valor: number
        }[]
      }
      com_ficha_evolucao_faixa: {
        Args: {
          p_ant_ate: string
          p_ant_de: string
          p_ate: string
          p_codigo: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: Json
      }
      com_ficha_evolucao_produtos: {
        Args: {
          p_ant_ate: string
          p_ant_de: string
          p_ate: string
          p_codigo: string
          p_de: string
          p_filial?: string
        }
        Returns: Json
      }
      com_ficha_identificacao: {
        Args: { p_codigo: string }
        Returns: {
          codigo: string
          em_condicao: boolean
          nome: string
          tabela_preco: string
        }[]
      }
      com_ficha_indicadores: {
        Args: {
          p_ate: string
          p_codigo: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          bonificacao: number
          faturamento: number
          media_3_anteriores: number
          meses_ativos: number
          skus: number
          ultimo_mes: string
          variacao: number
        }[]
      }
      com_ficha_mensal_do_ano: {
        Args: { p_ate: string; p_codigo: string; p_filial?: string }
        Returns: {
          mes: string
          valor: number
        }[]
      }
      com_ficha_mix_por_faixa: {
        Args: {
          p_ate: string
          p_codigo: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          faixa: string
          participacao: number
          quantidade: number
          valor: number
        }[]
      }
      com_ficha_nunca_comprou: {
        Args: {
          p_ate: string
          p_codigo: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          faixa: string
          nome: string
          produto_codigo: string
          total_da_faixa: number
          valor_outros: number
        }[]
      }
      com_ficha_parou_de_comprar: {
        Args: {
          p_ate: string
          p_codigo: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          nome: string
          produto_codigo: string
        }[]
      }
      com_importar_carteiras: {
        Args: { p_carteiras: Json; p_confirmar?: boolean }
        Returns: Json
      }
      com_importar_clientes: {
        Args: { p_file_name: string; p_linhas: Json }
        Returns: Json
      }
      com_importar_ficha_clientes: {
        Args: { p_file_name: string; p_linhas: Json }
        Returns: Json
      }
      com_importar_modelo_de_clientes: {
        Args: {
          p_confirmar?: boolean
          p_file_name: string
          p_linhas: Json
          p_responsaveis?: Json
        }
        Returns: Json
      }
      com_importar_metas: {
        Args: { p_file_name: string; p_json: Json }
        Returns: Json
      }
      com_importar_metas_do_ano: {
        Args: { p_ano: number; p_metas: number[] }
        Returns: undefined
      }
      com_importar_vendas: {
        Args: {
          p_descartes: Json
          p_file_name: string
          p_filial: string
          p_itens: Json
          p_linhas_lidas: number
          p_substituir?: boolean
        }
        Returns: Json
      }
      com_importar_vendas_fim: {
        Args: { p_importacao_id: string }
        Returns: Json
      }
      com_importar_vendas_inicio: {
        Args: {
          p_competencias: Json
          p_descartes: Json
          p_file_name: string
          p_filial: string
          p_itens_esperados: number
          p_linhas_lidas: number
          p_substituir?: boolean
          p_total_impresso?: number
        }
        Returns: string
      }
      com_importar_vendas_lote: {
        Args: { p_importacao_id: string; p_itens: Json }
        Returns: number
      }
      com_matriz_produto_cliente: {
        Args: {
          p_ate: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          celulas: Json
          maximo: number
          produto_codigo: string
          produto_nome: string
          total: number
        }[]
      }
      com_mes_importado: {
        Args: { p_filial?: string; p_mes: string }
        Returns: boolean
      }
      com_minhas_carteiras: { Args: never; Returns: string[] }
      com_painel_do_gestor: {
        Args: { p_competencia: string }
        Returns: {
          carteira: string
          cor: string
          meta: number
          metrica: string
          ordem: number
          periodo: string
          realizado: number
          rotulo: string
          vendedor_id: string
          vendedor_nome: string
        }[]
      }
      com_painel_totais: {
        Args: {
          p_ano: number
          p_ate?: string
          p_de?: string
          p_filial?: string
          p_serie?: string
        }
        Returns: {
          bonificacao: number
          clientes_ativos: number
          devolucao: number
          liquido: number
          skus_vendidos: number
          unidades: number
          venda: number
        }[]
      }
      com_pedidos_em_condicao: {
        Args: { p_ate: string; p_de: string; p_filial?: string }
        Returns: {
          bonificacao: number
          cliente_codigo: string
          competencia: string
          nome: string
          total: number
          venda: number
        }[]
      }
      com_periodo_anterior: {
        Args: { p_ate: string; p_de: string }
        Returns: {
          ant_ate: string
          ant_de: string
        }[]
      }
      com_periodo_importado: {
        Args: { p_filial?: string }
        Returns: {
          competencia_ate: string
          competencia_de: string
          competencias: number
        }[]
      }
      com_pessoas_do_comercial: {
        Args: never
        Returns: {
          email: string
          nome: string
          user_id: string
        }[]
      }
      com_pode_gerir_carteiras: { Args: never; Returns: boolean }
      com_pode_ver_carteira: { Args: { p_carteira: string }; Returns: boolean }
      com_quem_atende_cliente: {
        Args: {
          p_ate: string
          p_codigo: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          e_vendedor: boolean
          notas: number
          ultima_venda: string
          valor: number
          vendedor_codigo: string
          vendedor_nome: string
        }[]
      }
      com_quem_decide_cadastro: {
        Args: { p_tenant: string }
        Returns: string[]
      }
      com_ranking_clientes: {
        Args: {
          p_ate: string
          p_de: string
          p_filial?: string
          p_limite?: number
          p_serie?: string
        }
        Returns: {
          cliente_codigo: string
          faturamento: number
          nome: string
          participacao: number
          tabela_preco: string
        }[]
      }
      com_renomear_carteira: {
        Args: { p_de: string; p_lembrar?: boolean; p_para: string }
        Returns: Json
      }
      com_resumo_da_carteira: {
        Args: { p_competencia: string }
        Returns: {
          ativos: number
          carteira: string
          compradores: number
          compradores_ativos: number
          compradores_inativos: number
          inativos: number
          media_base_ativa: number
          nunca_compraram: number
          relacionados: number
          relacionados_sem_compra: number
          ticket_ativos: number
          ticket_inativos: number
          total_carteira: number
          valor_vendido: number
          vendas_ativos: number
          vendas_inativos: number
          vendedor_id: string
          vendedor_nome: string
        }[]
      }
      com_sacs_do_cliente: {
        Args: { p_documento: string }
        Returns: {
          created_at: string
          id: string
          status: string
          subject: string
          ticket_number: number
        }[]
      }
      com_salvar_interacao: {
        Args: { p_dados: Json; p_id: string; p_marcas: string[] }
        Returns: string
      }
      com_semear_faixas_cashback: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      com_semear_indicadores: { Args: { p_tenant: string }; Returns: undefined }
      com_situacao_120_dias: {
        Args: { p_ref?: string }
        Returns: {
          carteira: string
          cliente_codigo: string
          dias_sem_comprar: number
          situacao: string
          ultima_compra: string
        }[]
      }
      com_so_a_minha_carteira: { Args: never; Returns: boolean }
      com_tabelas_base: {
        Args: never
        Returns: {
          tabela_base: string
        }[]
      }
      com_tabelas_preco: {
        Args: never
        Returns: {
          tabela_preco: string
        }[]
      }
      com_tendencia_produtos: {
        Args: {
          p_ate: string
          p_criterio?: string
          p_de: string
          p_filial?: string
        }
        Returns: {
          clientes: number
          concentrado: boolean
          faixa: string
          faturamento: number
          meses_com_venda: number
          nome: string
          primeira_metade: number
          produto_codigo: string
          quantidade: number
          segunda_metade: number
          serie_mensal: Json
          situacao: string
          variacao: number
        }[]
      }
      com_vendedoras_do_painel: {
        Args: { p_competencia: string }
        Returns: {
          carteira: string
          vendedor_id: string
          vendedor_nome: string
        }[]
      }
      compras_abrir_pedido: {
        Args: { p_chamado: Json; p_orcamentos: Json; p_pedido: Json }
        Returns: string
      }
      config_por_aba: {
        Args: { p_permissions: Json; p_setor: string }
        Returns: Json
      }
      create_ticket_checklists_for_ticket: {
        Args: { _ticket_id: string }
        Returns: undefined
      }
      crm_agendar_reuniao: {
        Args: {
          p_deal: string
          p_inicio: string
          p_minutos?: number
          p_notas?: string
          p_titulo: string
        }
        Returns: string
      }
      crm_bling_status: {
        Args: never
        Returns: {
          company_name: string
          expires_at: string
          settings: Json
          updated_at: string
        }[]
      }
      crm_delete_stage: {
        Args: { p_move_to?: string; p_stage: string }
        Returns: undefined
      }
      crm_find_or_create_contact: {
        Args: {
          p_company?: string
          p_email?: string
          p_extra?: Json
          p_import?: string
          p_name: string
          p_owner?: string
          p_phone?: string
          p_source?: string
          p_tenant: string
        }
        Returns: {
          contact_id: string
          created: boolean
          owner_id: string
        }[]
      }
      crm_form_publico: {
        Args: { p_form_slug: string; p_tenant_slug: string }
        Returns: {
          empresa: string
          fields: Json
          headline: string
          logo_url: string
          name: string
          redirect_url: string
          subhead: string
          submit_label: string
          success_message: string
        }[]
      }
      crm_gate_keys_valid: { Args: { p_keys: string[] }; Returns: boolean }
      crm_gate_label: {
        Args: { p_key: string; p_tenant: string }
        Returns: string
      }
      crm_import_rows: {
        Args: { p_import: string; p_rows: Json }
        Returns: Json
      }
      crm_lead_ads_aplicar: { Args: { p_raw: string }; Returns: string }
      crm_modelo_bloqueado_ate:
        | { Args: { p_contact: string }; Returns: string }
        | { Args: { p_contact: string; p_tenant: string }; Returns: string }
      crm_modelo_janela_dias: { Args: never; Returns: number }
      crm_nfe_status: {
        Args: never
        Returns: {
          ambiente: string
          cfop_padrao: string
          cnpj_emitente: string
          focus_ligado: boolean
          natureza_operacao: string
          provider: string
          serie: number
          token_last4: string
          updated_at: string
        }[]
      }
      crm_order_transition_allowed: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      crm_payment_providers: {
        Args: never
        Returns: {
          alias: string
          is_default: boolean
          key_last4: string
          provider: string
          updated_at: string
        }[]
      }
      crm_product_price: {
        Args: { p_product: string; p_table: string }
        Returns: number
      }
      crm_products_with_price: {
        Args: { p_table?: string }
        Returns: {
          base_price: number
          id: string
          is_exception: boolean
          name: string
          price: number
          sku: string
          unit: string
        }[]
      }
      crm_public_proposal: { Args: { p_token: string }; Returns: Json }
      crm_resolve_price_table: { Args: { p_contact: string }; Returns: string }
      crm_sales_metrics: {
        Args: { p_from: string; p_pipeline?: string; p_to: string }
        Returns: Json
      }
      crm_seed_pipeline_stages: {
        Args: { p_pipeline: string; p_tenant_id: string }
        Returns: undefined
      }
      crm_set_config: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      crm_setup: {
        Args: { p_price_tables?: Json; p_segments?: Json }
        Returns: Json
      }
      crm_telefone_chave: { Args: { p_telefone: string }; Returns: string }
      crm_undo_import: { Args: { p_import: string }; Returns: Json }
      crm_whatsapp_receber: {
        Args: {
          p_body: string
          p_media_type?: string
          p_media_url?: string
          p_nome: string
          p_phone_number_id: string
          p_wa_id: string
          p_wa_message: string
        }
        Returns: string
      }
      dir_chamados_por_setor: {
        Args: { p_inicio: string }
        Returns: {
          abertos: number
          estourados: number
          horas_medias: number
          modulo: string
          resolvidos: number
          sla: number
        }[]
      }
      dir_indicadores_dos_setores: {
        Args: { p_competencia: string }
        Returns: {
          formato: string
          indicador: string
          ordem: number
          rotulo: string
          setor: string
          valor: number
        }[]
      }
      exp_cancel: {
        Args: { p_reason?: string; p_shipment: string }
        Returns: undefined
      }
      exp_pick_lot: {
        Args: { p_product: string; p_quantity?: number; p_tenant: string }
        Returns: string
      }
      exp_queue: {
        Args: never
        Returns: {
          carrier: string
          contact_name: string
          created_at: string
          items: number
          number: number
          order_id: string
          order_number: number
          paid_at: string
          picked_items: number
          shipment_id: string
          status: string
          tracking_code: string
        }[]
      }
      exp_scan: {
        Args: { p_code: string; p_quantity?: number; p_shipment: string }
        Returns: Json
      }
      exp_set_config: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      exp_ship: {
        Args: { p_carrier?: string; p_shipment: string; p_tracking?: string }
        Returns: undefined
      }
      exp_shipping_status: {
        Args: never
        Returns: {
          cartao_last4: string
          codigo_servico: string
          correios_ligado: boolean
          provider: string
          remetente: Json
          updated_at: string
        }[]
      }
      exp_start: { Args: { p_order: string }; Returns: string }
      fmt_brl: { Args: { p: number }; Returns: string }
      get_auth_user_status: {
        Args: { _email: string }
        Returns: {
          is_confirmed: boolean
          user_id: string
        }[]
      }
      get_customer_tenant_id: { Args: never; Returns: string }
      get_invite_public: {
        Args: { _invite_id: string }
        Returns: {
          department: string
          email: string
          expires_at: string
          id: string
          role: string
          tenant_name: string
          tenant_slug: string
          used_at: string
        }[]
      }
      get_sac_tenant_branding: {
        Args: { _slug: string }
        Returns: {
          id: string
          login_banner_url: string
          logo_url: string
          name: string
          primary_color: string
          slug: string
          welcome_text: string
        }[]
      }
      get_tenant_by_hostname: {
        Args: { _hostname: string }
        Returns: {
          id: string
          login_banner_url: string
          logo_url: string
          name: string
          primary_color: string
          slug: string
          welcome_text: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_tenant_id: { Args: never; Returns: string }
      has_comercial_access: { Args: { _user_id: string }; Returns: boolean }
      has_compras_access: { Args: { _user_id: string }; Returns: boolean }
      has_crm_access: { Args: { _user_id: string }; Returns: boolean }
      has_diretoria_access: { Args: { _user_id: string }; Returns: boolean }
      has_educacional_access: { Args: { _user_id: string }; Returns: boolean }
      has_expedicao_access: { Args: { _user_id: string }; Returns: boolean }
      has_fin_access: { Args: { _user_id: string }; Returns: boolean }
      has_rh_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_igual: { Args: { a: string; b: string }; Returns: boolean }
      increment_pop_solved: { Args: { pop_id: string }; Returns: undefined }
      increment_pop_views: { Args: { pop_id: string }; Returns: undefined }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_or_higher: { Args: { _user_id: string }; Returns: boolean }
      is_allowed_upload_ext: {
        Args: { _bucket: string; _name: string }
        Returns: boolean
      }
      is_customer: { Args: { _user_id: string }; Returns: boolean }
      is_diretor: { Args: { _user_id: string }; Returns: boolean }
      is_email_verified_today: { Args: never; Returns: boolean }
      is_manager_or_higher: { Args: { _user_id: string }; Returns: boolean }
      is_member_or_higher_role: { Args: never; Returns: boolean }
      is_qualidade_tech: { Args: { _user_id: string }; Returns: boolean }
      is_supervisor_or_higher: { Args: { _user_id: string }; Returns: boolean }
      metas_anos_disponiveis: {
        Args: never
        Returns: {
          ano: number
        }[]
      }
      metas_modo: { Args: never; Returns: string }
      metas_set_config: {
        Args: { p_key: string; p_value: Json }
        Returns: undefined
      }
      modulos_de_chamado_visiveis: { Args: never; Returns: string[] }
      normalizar_nome_carteira: { Args: { p_nome: string }; Returns: string }
      notification_team: {
        Args: { p_module: string; p_tenant: string }
        Returns: string[]
      }
      notify_users: {
        Args: {
          p_exclude?: string
          p_message: string
          p_ref_id: string
          p_ref_type: string
          p_tenant: string
          p_title: string
          p_type: Database["public"]["Enums"]["notification_type"]
          p_users: string[]
        }
        Returns: undefined
      }
      ped_carregar_historico: {
        Args: { p_confirmar?: boolean; p_dados: Json; p_pessoas: Json }
        Returns: Json
      }
      ped_decisao_vigente: { Args: { p_checklist: string }; Returns: string }
      ped_em_carga: { Args: never; Returns: boolean }
      ped_indicadores: { Args: { p_ate: string; p_de: string }; Returns: Json }
      ped_pode_decidir: { Args: never; Returns: boolean }
      ped_pode_registrar_pagamento: { Args: never; Returns: boolean }
      ped_salvar_checklist: {
        Args: { p_dados: Json; p_interacao: string }
        Returns: string
      }
      ped_semear_configuracao: {
        Args: { p_tenant: string }
        Returns: undefined
      }
      ped_ultimo_pagamento: { Args: { p_checklist: string }; Returns: string }
      ped_ve_todos: { Args: never; Returns: boolean }
      pode_alterar_aba: {
        Args: { p_aba: string; p_setor: string }
        Returns: boolean
      }
      pode_configurar_setor: { Args: { p_modulo: string }; Returns: boolean }
      pode_responder_sobre: { Args: { _user_id: string }; Returns: boolean }
      posso_no_sac: { Args: { p_ticket: string }; Returns: boolean }
      project_participa: { Args: { p_project: string }; Returns: boolean }
      project_visivel: { Args: { p_project: string }; Returns: boolean }
      restore_profile: { Args: { _user_id: string }; Returns: Json }
      rh_calc_inss: {
        Args: { _company?: string; _salary: number; _tenant: string }
        Returns: number
      }
      rh_calc_irpf: {
        Args: { _base: number; _company?: string; _tenant: string }
        Returns: number
      }
      rh_generate_payroll: {
        Args: { _company: string; _month: string; _tenant: string }
        Returns: number
      }
      rh_link_employee_user: {
        Args: { _email: string; _employee_id: string }
        Returns: Json
      }
      rh_salarios: {
        Args: never
        Returns: {
          base_salary: number
          employee_id: string
        }[]
      }
      sac_confirmar_vinculo: { Args: { p_perfil_id: string }; Returns: Json }
      sac_vincular_ao_cliente: { Args: never; Returns: Json }
      salvar_configuracao_da_aba: {
        Args: { p_parte: string; p_valor: Json }
        Returns: undefined
      }
      seed_categorias_comercial_educacional: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      seed_crm_stages: { Args: { p_tenant_id: string }; Returns: undefined }
      seed_default_access_profiles: {
        Args: { p_department: string; p_tenant_id: string }
        Returns: undefined
      }
      seed_perfis_de_compras: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      setor_do_modulo: { Args: { p_modulo: string }; Returns: string }
      sync_ticket_checklist_status: {
        Args: { _ticket_checklist_id: string }
        Returns: undefined
      }
      tem_permissao: {
        Args: {
          _acao: string
          _departamento: string
          _modulo: string
          _user_id: string
        }
        Returns: boolean
      }
      tenant_set_config: {
        Args: { p_key: string; p_scope: string; p_value: Json }
        Returns: undefined
      }
      training_inscrever: {
        Args: { p_customer?: string; p_profile?: string; p_session: string }
        Returns: string
      }
      user_mentioned_in_ticket: {
        Args: { _ticket_id: string }
        Returns: boolean
      }
      ve_o_sac: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "admin" | "manager" | "member" | "viewer" | "customer"
      asset_category:
        | "hardware"
        | "software"
        | "network"
        | "peripheral"
        | "mobile"
        | "other"
      asset_status:
        | "active"
        | "inactive"
        | "maintenance"
        | "decommissioned"
        | "in_use"
        | "in_stock"
      contract_status: "active" | "expiring" | "expired" | "cancelled"
      deliverable_frequency: "weekly" | "monthly"
      event_participant_role:
        | "palestrante"
        | "artista"
        | "convidado"
        | "patrocinador"
        | "staff"
        | "outro"
      event_participant_status: "invited" | "confirmed" | "declined" | "maybe"
      fin_entry_kind: "payable" | "receivable"
      fin_entry_status: "pending" | "paid" | "overdue" | "cancelled"
      form_field_type:
        | "text"
        | "textarea"
        | "email"
        | "phone"
        | "select"
        | "checkbox"
        | "radio"
        | "date"
        | "file"
        | "delivery_datetime"
        | "assignee_select"
      influencer_category:
        | "artista"
        | "influencer"
        | "criador"
        | "modelo"
        | "outro"
      influencer_status: "active" | "inactive" | "blocked"
      license_type: "perpetual" | "subscription" | "volume" | "oem"
      maintenance_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      maintenance_type: "preventive" | "corrective" | "upgrade" | "cleaning"
      mkt_ai_generation_type: "image" | "caption" | "idea" | "reminder"
      mkt_event_status:
        | "planning"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      mkt_event_type:
        | "show"
        | "feira"
        | "live"
        | "lancamento"
        | "workshop"
        | "reuniao"
        | "outro"
      mkt_quotation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "completed"
        | "cancelled"
      mkt_ugc_media_type: "image" | "video" | "story" | "reel" | "carousel"
      mkt_ugc_status: "pending" | "approved" | "rejected"
      notification_type:
        | "sla_warning"
        | "sla_violation"
        | "contract_expiring"
        | "license_expiring"
        | "mention"
        | "ticket_reply"
        | "ticket_assigned"
        | "card_mention"
        | "card_member"
        | "reminder"
        | "deadline_expired"
        | "ticket_created"
        | "request_decided"
        | "purchase_decided"
        | "sac_customer_reply"
        | "purchase_requested"
        | "sac_customer_rated"
        | "bill_due"
        | "document_available"
        | "post_published"
        | "post_failed"
        | "automation"
        | "crm_new_lead"
        | "order_paid"
        | "order_accepted"
        | "meta_definida"
      payment_frequency: "monthly" | "quarterly" | "yearly" | "one_time"
      social_platform:
        | "instagram"
        | "tiktok"
        | "youtube"
        | "linkedin"
        | "twitter"
        | "facebook"
        | "whatsapp"
        | "meta_ads"
      social_post_status: "draft" | "scheduled" | "published" | "failed"
      social_post_type:
        | "feed"
        | "story"
        | "reel"
        | "live"
        | "short"
        | "post"
        | "paid_ad"
        | "broadcast_list"
      supplier_category:
        | "grafica"
        | "producao"
        | "midia"
        | "eventos"
        | "brindes"
        | "digital"
        | "audiovisual"
        | "outro"
      supplier_status: "active" | "inactive" | "blocked"
      ticket_priority: "critical" | "high" | "medium" | "low"
      ticket_status:
        | "open"
        | "in_progress"
        | "waiting_user"
        | "waiting_parts"
        | "resolved"
        | "closed"
        | "cancelled"
        | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "manager", "member", "viewer", "customer"],
      asset_category: [
        "hardware",
        "software",
        "network",
        "peripheral",
        "mobile",
        "other",
      ],
      asset_status: [
        "active",
        "inactive",
        "maintenance",
        "decommissioned",
        "in_use",
        "in_stock",
      ],
      contract_status: ["active", "expiring", "expired", "cancelled"],
      deliverable_frequency: ["weekly", "monthly"],
      event_participant_role: [
        "palestrante",
        "artista",
        "convidado",
        "patrocinador",
        "staff",
        "outro",
      ],
      event_participant_status: ["invited", "confirmed", "declined", "maybe"],
      fin_entry_kind: ["payable", "receivable"],
      fin_entry_status: ["pending", "paid", "overdue", "cancelled"],
      form_field_type: [
        "text",
        "textarea",
        "email",
        "phone",
        "select",
        "checkbox",
        "radio",
        "date",
        "file",
        "delivery_datetime",
        "assignee_select",
      ],
      influencer_category: [
        "artista",
        "influencer",
        "criador",
        "modelo",
        "outro",
      ],
      influencer_status: ["active", "inactive", "blocked"],
      license_type: ["perpetual", "subscription", "volume", "oem"],
      maintenance_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      maintenance_type: ["preventive", "corrective", "upgrade", "cleaning"],
      mkt_ai_generation_type: ["image", "caption", "idea", "reminder"],
      mkt_event_status: [
        "planning",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      mkt_event_type: [
        "show",
        "feira",
        "live",
        "lancamento",
        "workshop",
        "reuniao",
        "outro",
      ],
      mkt_quotation_status: [
        "pending",
        "approved",
        "rejected",
        "completed",
        "cancelled",
      ],
      mkt_ugc_media_type: ["image", "video", "story", "reel", "carousel"],
      mkt_ugc_status: ["pending", "approved", "rejected"],
      notification_type: [
        "sla_warning",
        "sla_violation",
        "contract_expiring",
        "license_expiring",
        "mention",
        "ticket_reply",
        "ticket_assigned",
        "card_mention",
        "card_member",
        "reminder",
        "deadline_expired",
        "ticket_created",
        "request_decided",
        "purchase_decided",
        "sac_customer_reply",
        "purchase_requested",
        "sac_customer_rated",
        "bill_due",
        "document_available",
        "post_published",
        "post_failed",
        "automation",
        "crm_new_lead",
        "order_paid",
        "order_accepted",
        "meta_definida",
      ],
      payment_frequency: ["monthly", "quarterly", "yearly", "one_time"],
      social_platform: [
        "instagram",
        "tiktok",
        "youtube",
        "linkedin",
        "twitter",
        "facebook",
        "whatsapp",
        "meta_ads",
      ],
      social_post_status: ["draft", "scheduled", "published", "failed"],
      social_post_type: [
        "feed",
        "story",
        "reel",
        "live",
        "short",
        "post",
        "paid_ad",
        "broadcast_list",
      ],
      supplier_category: [
        "grafica",
        "producao",
        "midia",
        "eventos",
        "brindes",
        "digital",
        "audiovisual",
        "outro",
      ],
      supplier_status: ["active", "inactive", "blocked"],
      ticket_priority: ["critical", "high", "medium", "low"],
      ticket_status: [
        "open",
        "in_progress",
        "waiting_user",
        "waiting_parts",
        "resolved",
        "closed",
        "cancelled",
        "rejected",
      ],
    },
  },
} as const

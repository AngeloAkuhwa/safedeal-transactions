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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_change_requests: {
        Row: {
          change_type: string
          created_at: string
          id: string
          payload: Json
          reason: string
          requested_by: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
        }
        Insert: {
          change_type: string
          created_at?: string
          id?: string
          payload: Json
          reason: string
          requested_by: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_user_id: string
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          payload?: Json
          reason?: string
          requested_by?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_change_requests_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      account_verifications: {
        Row: {
          created_at: string
          email_verified: boolean
          id: string
          identity_verified: boolean
          payout_verified: boolean
          phone_verified: boolean
          updated_at: string
          user_id: string
          verification_level: Database["public"]["Enums"]["verification_level_type"]
          verification_notes: string | null
        }
        Insert: {
          created_at?: string
          email_verified?: boolean
          id?: string
          identity_verified?: boolean
          payout_verified?: boolean
          phone_verified?: boolean
          updated_at?: string
          user_id: string
          verification_level?: Database["public"]["Enums"]["verification_level_type"]
          verification_notes?: string | null
        }
        Update: {
          created_at?: string
          email_verified?: boolean
          id?: string
          identity_verified?: boolean
          payout_verified?: boolean
          phone_verified?: boolean
          updated_at?: string
          user_id?: string
          verification_level?: Database["public"]["Enums"]["verification_level_type"]
          verification_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "account_verifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions: {
        Row: {
          action_notes: string | null
          action_type: Database["public"]["Enums"]["admin_action_type"]
          admin_user_id: string
          created_at: string
          dispute_id: string | null
          id: string
          target_user_id: string | null
          transaction_id: string | null
        }
        Insert: {
          action_notes?: string | null
          action_type: Database["public"]["Enums"]["admin_action_type"]
          admin_user_id: string
          created_at?: string
          dispute_id?: string | null
          id?: string
          target_user_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          action_notes?: string | null
          action_type?: Database["public"]["Enums"]["admin_action_type"]
          admin_user_id?: string
          created_at?: string
          dispute_id?: string | null
          id?: string
          target_user_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_actions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      admin_export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          expires_at: string
          export_type: string
          file_path: string | null
          file_size_bytes: number | null
          id: string
          params: Json
          requester_id: string
          row_count: number | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string
          export_type: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          params?: Json
          requester_id: string
          row_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          expires_at?: string
          export_type?: string
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          params?: Json
          requester_id?: string
          row_count?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_investigations: {
        Row: {
          assigned_admin_id: string | null
          created_at: string
          id: string
          last_updated_by: string | null
          opened_at: string
          opened_by_user_id: string
          priority: Database["public"]["Enums"]["admin_investigation_priority"]
          resolved_at: string | null
          status: Database["public"]["Enums"]["admin_investigation_status"]
          tags: string[]
          transaction_id: string
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          created_at?: string
          id?: string
          last_updated_by?: string | null
          opened_at?: string
          opened_by_user_id: string
          priority?: Database["public"]["Enums"]["admin_investigation_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["admin_investigation_status"]
          tags?: string[]
          transaction_id: string
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          created_at?: string
          id?: string
          last_updated_by?: string | null
          opened_at?: string
          opened_by_user_id?: string
          priority?: Database["public"]["Enums"]["admin_investigation_priority"]
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["admin_investigation_status"]
          tags?: string[]
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_investigations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_investigations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_investigations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_investigations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      admin_rate_limits: {
        Row: {
          action_key: string
          admin_user_id: string
          id: number
          occurred_at: string
        }
        Insert: {
          action_key: string
          admin_user_id: string
          id?: number
          occurred_at?: string
        }
        Update: {
          action_key?: string
          admin_user_id?: string
          id?: number
          occurred_at?: string
        }
        Relationships: []
      }
      admin_transaction_notes: {
        Row: {
          admin_user_id: string
          created_at: string
          id: string
          is_pinned: boolean
          note: string
          transaction_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          note: string
          transaction_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          note?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_transaction_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_transaction_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      agent_availability: {
        Row: {
          last_heartbeat: string | null
          status: Database["public"]["Enums"]["agent_availability_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          last_heartbeat?: string | null
          status?: Database["public"]["Enums"]["agent_availability_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          last_heartbeat?: string | null
          status?: Database["public"]["Enums"]["agent_availability_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_capacity: {
        Row: {
          avg_first_action_seconds: number
          current_active: number
          max_active_tasks: number
          overdue_count: number
          resolved_today: number
          tasks_today: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_first_action_seconds?: number
          current_active?: number
          max_active_tasks?: number
          overdue_count?: number
          resolved_today?: number
          tasks_today?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_first_action_seconds?: number
          current_active?: number
          max_active_tasks?: number
          overdue_count?: number
          resolved_today?: number
          tasks_today?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_skills: {
        Row: {
          created_at: string
          id: string
          proficiency: number
          skill: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          proficiency?: number
          skill: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          proficiency?: number
          skill?: string
          user_id?: string
        }
        Relationships: []
      }
      assignment_rule_versions: {
        Row: {
          actor_id: string | null
          approved_at: string | null
          approved_by: string | null
          change_set_id: string | null
          config: Json
          created_at: string
          id: string
          note: string | null
          rule_id: string
          version: number
        }
        Insert: {
          actor_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          change_set_id?: string | null
          config: Json
          created_at?: string
          id?: string
          note?: string | null
          rule_id: string
          version: number
        }
        Update: {
          actor_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          change_set_id?: string | null
          config?: Json
          created_at?: string
          id?: string
          note?: string | null
          rule_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_rule_versions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "assignment_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_rules: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          id: string
          mode: string
          round_robin_state: Json
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          mode?: string
          round_robin_state?: Json
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          mode?: string
          round_robin_state?: Json
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action_type"]
          actor_user_id: string | null
          created_at: string
          description: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          target_user_id: string | null
          transaction_id: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action_type"]
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_user_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action_type"]
          actor_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_user_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_name: string
          job_status: string
          metadata: Json | null
          started_at: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_name: string
          job_status: string
          metadata?: Json | null
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_name?: string
          job_status?: string
          metadata?: Json | null
          started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      buyer_specific_offer_items: {
        Row: {
          condition_summary: string | null
          created_at: string
          currency_code: string
          id: string
          offer_id: string
          position: number
          primary_media_url: string | null
          product_id: string
          product_title: string
          quantity: number
          short_description: string | null
          unit_price_snapshot: number
        }
        Insert: {
          condition_summary?: string | null
          created_at?: string
          currency_code: string
          id?: string
          offer_id: string
          position?: number
          primary_media_url?: string | null
          product_id: string
          product_title: string
          quantity?: number
          short_description?: string | null
          unit_price_snapshot: number
        }
        Update: {
          condition_summary?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          offer_id?: string
          position?: number
          primary_media_url?: string | null
          product_id?: string
          product_title?: string
          quantity?: number
          short_description?: string | null
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "buyer_specific_offer_items_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "buyer_specific_product_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_specific_offer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      buyer_specific_product_offers: {
        Row: {
          buyer_email: string | null
          buyer_id: string | null
          cancelled_at: string | null
          claimed_at: string | null
          created_at: string
          created_via: string
          expired_at: string | null
          expires_at: string | null
          id: string
          linked_at: string | null
          offer_token: string
          previous_tokens: string[]
          product_id: string
          purchased_at: string | null
          seller_id: string
          source_draft_id: string | null
          status: Database["public"]["Enums"]["buyer_specific_offer_status"]
          updated_at: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_id?: string | null
          cancelled_at?: string | null
          claimed_at?: string | null
          created_at?: string
          created_via?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          linked_at?: string | null
          offer_token: string
          previous_tokens?: string[]
          product_id: string
          purchased_at?: string | null
          seller_id: string
          source_draft_id?: string | null
          status?: Database["public"]["Enums"]["buyer_specific_offer_status"]
          updated_at?: string
        }
        Update: {
          buyer_email?: string | null
          buyer_id?: string | null
          cancelled_at?: string | null
          claimed_at?: string | null
          created_at?: string
          created_via?: string
          expired_at?: string | null
          expires_at?: string | null
          id?: string
          linked_at?: string | null
          offer_token?: string
          previous_tokens?: string[]
          product_id?: string
          purchased_at?: string | null
          seller_id?: string
          source_draft_id?: string | null
          status?: Database["public"]["Enums"]["buyer_specific_offer_status"]
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: []
      }
      case_reviews: {
        Row: {
          created_at: string
          dispute_id: string
          id: string
          review_notes: string
          reviewed_by_user_id: string
        }
        Insert: {
          created_at?: string
          dispute_id: string
          id?: string
          review_notes: string
          reviewed_by_user_id: string
        }
        Update: {
          created_at?: string
          dispute_id?: string
          id?: string
          review_notes?: string
          reviewed_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_reviews_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_reviews_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_reviews_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "case_reviews_reviewed_by_user_id_fkey"
            columns: ["reviewed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_session_items: {
        Row: {
          cart_item_id: string | null
          checkout_session_id: string
          created_at: string
          id: string
          line_total: number
          product_id: string
          quantity: number
          seller_id: string
          transaction_id: string | null
          unit_price: number
        }
        Insert: {
          cart_item_id?: string | null
          checkout_session_id: string
          created_at?: string
          id?: string
          line_total: number
          product_id: string
          quantity: number
          seller_id: string
          transaction_id?: string | null
          unit_price: number
        }
        Update: {
          cart_item_id?: string | null
          checkout_session_id?: string
          created_at?: string
          id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          seller_id?: string
          transaction_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkout_session_items_cart_item_id_fkey"
            columns: ["cart_item_id"]
            isOneToOne: false
            referencedRelation: "cart_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_session_items_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          buyer_id: string
          created_at: string
          currency_code: string
          id: string
          payment_reference: string | null
          status: string
          subtotal_amount: number
          total_amount: number
          total_protection_fee: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          currency_code: string
          id?: string
          payment_reference?: string | null
          status?: string
          subtotal_amount?: number
          total_amount?: number
          total_protection_fee?: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          currency_code?: string
          id?: string
          payment_reference?: string | null
          status?: string
          subtotal_amount?: number
          total_amount?: number
          total_protection_fee?: number
          updated_at?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          admin_reply: string | null
          created_at: string
          email: string
          full_name: string
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string
          replied_at: string | null
          replied_by: string | null
          reply_channel: string | null
          status: string
          topic: string
          transaction_reference: string | null
          user_id: string | null
        }
        Insert: {
          admin_reply?: string | null
          created_at?: string
          email: string
          full_name: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message: string
          replied_at?: string | null
          replied_by?: string | null
          reply_channel?: string | null
          status?: string
          topic?: string
          transaction_reference?: string | null
          user_id?: string | null
        }
        Update: {
          admin_reply?: string | null
          created_at?: string
          email?: string
          full_name?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string
          replied_at?: string | null
          replied_by?: string | null
          reply_channel?: string | null
          status?: string
          topic?: string
          transaction_reference?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      delivery_confirmation_tokens: {
        Row: {
          buyer_id: string
          confirmation_url: string | null
          created_at: string
          expires_at: string
          id: string
          seller_id: string
          status: Database["public"]["Enums"]["delivery_confirmation_token_status"]
          token: string
          transaction_id: string
          used_at: string | null
          used_by_phone: string | null
        }
        Insert: {
          buyer_id: string
          confirmation_url?: string | null
          created_at?: string
          expires_at: string
          id?: string
          seller_id: string
          status?: Database["public"]["Enums"]["delivery_confirmation_token_status"]
          token: string
          transaction_id: string
          used_at?: string | null
          used_by_phone?: string | null
        }
        Update: {
          buyer_id?: string
          confirmation_url?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          seller_id?: string
          status?: Database["public"]["Enums"]["delivery_confirmation_token_status"]
          token?: string
          transaction_id?: string
          used_at?: string | null
          used_by_phone?: string | null
        }
        Relationships: []
      }
      delivery_confirmations: {
        Row: {
          buyer_acknowledged_delivery_at: string | null
          created_at: string
          id: string
          seller_marked_delivered_at: string | null
          system_delivery_marked_at: string | null
          transaction_id: string
          updated_at: string
        }
        Insert: {
          buyer_acknowledged_delivery_at?: string | null
          created_at?: string
          id?: string
          seller_marked_delivered_at?: string | null
          system_delivery_marked_at?: string | null
          transaction_id: string
          updated_at?: string
        }
        Update: {
          buyer_acknowledged_delivery_at?: string | null
          created_at?: string
          id?: string
          seller_marked_delivered_at?: string | null
          system_delivery_marked_at?: string | null
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      delivery_proof_files: {
        Row: {
          created_at: string
          file_id: string
          id: string
          proof_type: Database["public"]["Enums"]["delivery_proof_type"]
          transaction_id: string
          uploaded_by_user_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          proof_type: Database["public"]["Enums"]["delivery_proof_type"]
          transaction_id: string
          uploaded_by_user_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          proof_type?: Database["public"]["Enums"]["delivery_proof_type"]
          transaction_id?: string
          uploaded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_proof_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_proof_files_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_proof_files_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_proof_files_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_proof_files_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "delivery_proof_files_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "delivery_proof_files_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking_details: {
        Row: {
          courier_name: string | null
          created_at: string
          delivered_at: string | null
          expected_delivery_at: string | null
          id: string
          shipped_at: string | null
          signature_name: string | null
          tracking_number: string | null
          tracking_url: string | null
          transaction_id: string
          updated_at: string
        }
        Insert: {
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          expected_delivery_at?: string | null
          id?: string
          shipped_at?: string | null
          signature_name?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          transaction_id: string
          updated_at?: string
        }
        Update: {
          courier_name?: string | null
          created_at?: string
          delivered_at?: string | null
          expected_delivery_at?: string | null
          id?: string
          shipped_at?: string | null
          signature_name?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_details_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_details_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_details_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_details_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      delivery_updates: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["delivery_update_status"]
          transaction_id: string
          updated_by_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status: Database["public"]["Enums"]["delivery_update_status"]
          transaction_id: string
          updated_by_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["delivery_update_status"]
          transaction_id?: string
          updated_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_updates_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_updates_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_updates_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_updates_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "delivery_updates_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "delivery_updates_updated_by_user_id_fkey"
            columns: ["updated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          browser_name: string | null
          created_at: string
          device_fingerprint: string | null
          device_name: string | null
          id: string
          is_trusted: boolean
          last_ip: unknown
          last_seen_at: string | null
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_name?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          id?: string
          is_trusted?: boolean
          last_ip?: unknown
          last_seen_at?: string | null
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_name?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_name?: string | null
          id?: string
          is_trusted?: boolean
          last_ip?: unknown
          last_seen_at?: string | null
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          created_at: string
          dispute_id: string
          evidence_type: Database["public"]["Enums"]["dispute_evidence_type"]
          file_id: string
          id: string
          is_active: boolean
          notes: string | null
          replaced_at: string | null
          replaced_by_file_id: string | null
          submitted_by_role: Database["public"]["Enums"]["transaction_actor_role"]
          submitted_by_user_id: string
        }
        Insert: {
          created_at?: string
          dispute_id: string
          evidence_type: Database["public"]["Enums"]["dispute_evidence_type"]
          file_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          replaced_at?: string | null
          replaced_by_file_id?: string | null
          submitted_by_role: Database["public"]["Enums"]["transaction_actor_role"]
          submitted_by_user_id: string
        }
        Update: {
          created_at?: string
          dispute_id?: string
          evidence_type?: Database["public"]["Enums"]["dispute_evidence_type"]
          file_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          replaced_at?: string | null
          replaced_by_file_id?: string | null
          submitted_by_role?: Database["public"]["Enums"]["transaction_actor_role"]
          submitted_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "dispute_evidence_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_outcomes: {
        Row: {
          created_at: string
          decision_summary: string
          dispute_id: string
          id: string
          outcome_type: Database["public"]["Enums"]["dispute_outcome_type"]
          refund_amount: number
          release_amount: number
          resolved_at: string
          resolved_by_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_summary: string
          dispute_id: string
          id?: string
          outcome_type: Database["public"]["Enums"]["dispute_outcome_type"]
          refund_amount: number
          release_amount: number
          resolved_at: string
          resolved_by_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_summary?: string
          dispute_id?: string
          id?: string
          outcome_type?: Database["public"]["Enums"]["dispute_outcome_type"]
          refund_amount?: number
          release_amount?: number
          resolved_at?: string
          resolved_by_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_outcomes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: true
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_outcomes_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: true
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_outcomes_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "dispute_outcomes_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_responses: {
        Row: {
          created_at: string
          dispute_id: string
          edited_at: string | null
          edited_by_user_id: string | null
          id: string
          previous_response_text: string | null
          responded_by_user_id: string
          response_number: number
          response_text: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispute_id: string
          edited_at?: string | null
          edited_by_user_id?: string | null
          id?: string
          previous_response_text?: string | null
          responded_by_user_id: string
          response_number?: number
          response_text: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispute_id?: string
          edited_at?: string | null
          edited_by_user_id?: string | null
          id?: string
          previous_response_text?: string | null
          responded_by_user_id?: string
          response_number?: number
          response_text?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispute_responses_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_responses_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_responses_responded_by_user_id_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "dispute_responses_responded_by_user_id_fkey"
            columns: ["responded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_status_history: {
        Row: {
          changed_at: string
          changed_by_user_id: string | null
          created_at: string
          dispute_id: string
          id: string
          new_status: Database["public"]["Enums"]["dispute_case_status"]
          old_status: Database["public"]["Enums"]["dispute_case_status"] | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by_user_id?: string | null
          created_at?: string
          dispute_id: string
          id?: string
          new_status: Database["public"]["Enums"]["dispute_case_status"]
          old_status?: Database["public"]["Enums"]["dispute_case_status"] | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by_user_id?: string | null
          created_at?: string
          dispute_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["dispute_case_status"]
          old_status?: Database["public"]["Enums"]["dispute_case_status"] | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "dispute_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_status_history_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_status_history_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          created_at: string
          description: string
          id: string
          opened_at: string
          opened_by_user_id: string
          reason: Database["public"]["Enums"]["dispute_reason_type"]
          resolved_at: string | null
          seller_response_due_at: string | null
          status: Database["public"]["Enums"]["dispute_case_status"]
          transaction_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          opened_at?: string
          opened_by_user_id: string
          reason: Database["public"]["Enums"]["dispute_reason_type"]
          resolved_at?: string | null
          seller_response_due_at?: string | null
          status?: Database["public"]["Enums"]["dispute_case_status"]
          transaction_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          opened_at?: string
          opened_by_user_id?: string
          reason?: Database["public"]["Enums"]["dispute_reason_type"]
          resolved_at?: string | null
          seller_response_due_at?: string | null
          status?: Database["public"]["Enums"]["dispute_case_status"]
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_user_id_fkey"
            columns: ["opened_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disputes_opened_by_user_id_fkey"
            columns: ["opened_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      edge_function_errors: {
        Row: {
          created_at: string
          error_code: string | null
          function_name: string
          http_status: number | null
          id: string
          message: string
          request_context: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          function_name: string
          http_status?: number | null
          id?: string
          message: string
          request_context?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          function_name?: string
          http_status?: number | null
          id?: string
          message?: string
          request_context?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      escalation_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          min_priority: Database["public"]["Enums"]["orchestration_task_priority"]
          name: string
          target_queue: string
          trigger_after_seconds: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          min_priority?: Database["public"]["Enums"]["orchestration_task_priority"]
          name: string
          target_queue?: string
          trigger_after_seconds?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          min_priority?: Database["public"]["Enums"]["orchestration_task_priority"]
          name?: string
          target_queue?: string
          trigger_after_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      escrow_ledger_entries: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          entry_type: Database["public"]["Enums"]["escrow_ledger_entry_type"]
          id: string
          idempotency_key: string | null
          is_cash_movement: boolean | null
          metadata: Json | null
          notes: string | null
          payload_fingerprint: string | null
          reference_id: string | null
          reference_type: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code: string
          entry_type: Database["public"]["Enums"]["escrow_ledger_entry_type"]
          id?: string
          idempotency_key?: string | null
          is_cash_movement?: boolean | null
          metadata?: Json | null
          notes?: string | null
          payload_fingerprint?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          entry_type?: Database["public"]["Enums"]["escrow_ledger_entry_type"]
          id?: string
          idempotency_key?: string | null
          is_cash_movement?: boolean | null
          metadata?: Json | null
          notes?: string | null
          payload_fingerprint?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_ledger_entries_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escrow_ledger_entries_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      escrow_reconciliation_results: {
        Row: {
          created_at: string
          delta: number
          detail: Json
          expected_ledger_balance: number
          id: string
          ledger_balance: number
          paystack_collected: number
          paystack_paid_out: number
          paystack_refunded: number
          run_at: string
          run_id: string
          status: Database["public"]["Enums"]["escrow_reconciliation_status"]
          transaction_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          detail?: Json
          expected_ledger_balance: number
          id?: string
          ledger_balance: number
          paystack_collected: number
          paystack_paid_out: number
          paystack_refunded: number
          run_at?: string
          run_id: string
          status: Database["public"]["Enums"]["escrow_reconciliation_status"]
          transaction_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          detail?: Json
          expected_ledger_balance?: number
          id?: string
          ledger_balance?: number
          paystack_collected?: number
          paystack_paid_out?: number
          paystack_refunded?: number
          run_at?: string
          run_id?: string
          status?: Database["public"]["Enums"]["escrow_reconciliation_status"]
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_reconciliation_results_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_reconciliation_results_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_reconciliation_results_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_reconciliation_results_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      escrow_states: {
        Row: {
          created_at: string
          frozen_amount: number
          held_amount: number
          id: string
          last_changed_at: string
          refunded_amount: number
          released_amount: number
          state: Database["public"]["Enums"]["escrow_state"]
          transaction_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          frozen_amount?: number
          held_amount?: number
          id?: string
          last_changed_at?: string
          refunded_amount?: number
          released_amount?: number
          state?: Database["public"]["Enums"]["escrow_state"]
          transaction_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          frozen_amount?: number
          held_amount?: number
          id?: string
          last_changed_at?: string
          refunded_amount?: number
          released_amount?: number
          state?: Database["public"]["Enums"]["escrow_state"]
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_states_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_states_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_states_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_states_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      files: {
        Row: {
          context_type: Database["public"]["Enums"]["file_context_type"]
          created_at: string
          deleted_at: string | null
          deleted_from_provider: boolean
          file_hash: string | null
          file_size_bytes: number | null
          file_url: string
          hash_algorithm: string | null
          id: string
          is_temporary: boolean
          legal_hold: boolean
          metadata_json: Json | null
          mime_type: string | null
          original_file_name: string | null
          provider: Database["public"]["Enums"]["file_provider"]
          provider_asset_id: string
          resource_type: Database["public"]["Enums"]["file_resource_type"]
          retain_until: string | null
          retention_category: Database["public"]["Enums"]["file_retention_category"]
          secure_url: string | null
          updated_at: string
          uploaded_by_user_id: string | null
        }
        Insert: {
          context_type: Database["public"]["Enums"]["file_context_type"]
          created_at?: string
          deleted_at?: string | null
          deleted_from_provider?: boolean
          file_hash?: string | null
          file_size_bytes?: number | null
          file_url: string
          hash_algorithm?: string | null
          id?: string
          is_temporary?: boolean
          legal_hold?: boolean
          metadata_json?: Json | null
          mime_type?: string | null
          original_file_name?: string | null
          provider: Database["public"]["Enums"]["file_provider"]
          provider_asset_id: string
          resource_type: Database["public"]["Enums"]["file_resource_type"]
          retain_until?: string | null
          retention_category: Database["public"]["Enums"]["file_retention_category"]
          secure_url?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
        }
        Update: {
          context_type?: Database["public"]["Enums"]["file_context_type"]
          created_at?: string
          deleted_at?: string | null
          deleted_from_provider?: boolean
          file_hash?: string | null
          file_size_bytes?: number | null
          file_url?: string
          hash_algorithm?: string | null
          id?: string
          is_temporary?: boolean
          legal_hold?: boolean
          metadata_json?: Json | null
          mime_type?: string | null
          original_file_name?: string | null
          provider?: Database["public"]["Enums"]["file_provider"]
          provider_asset_id?: string
          resource_type?: Database["public"]["Enums"]["file_resource_type"]
          retain_until?: string | null
          retention_category?: Database["public"]["Enums"]["file_retention_category"]
          secure_url?: string | null
          updated_at?: string
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "files_uploaded_by_user_id_fkey"
            columns: ["uploaded_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_idempotency_conflicts: {
        Row: {
          actor_user_id: string | null
          correlation_id: string | null
          created_at: string
          entry_type:
            | Database["public"]["Enums"]["escrow_ledger_entry_type"]
            | null
          existing_fingerprint: string
          first_seen: string
          id: string
          idempotency_key: string
          incoming_fingerprint: string
          last_seen: string
          occurrence_count: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entry_type?:
            | Database["public"]["Enums"]["escrow_ledger_entry_type"]
            | null
          existing_fingerprint: string
          first_seen?: string
          id?: string
          idempotency_key: string
          incoming_fingerprint: string
          last_seen?: string
          occurrence_count?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          actor_user_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entry_type?:
            | Database["public"]["Enums"]["escrow_ledger_entry_type"]
            | null
          existing_fingerprint?: string
          first_seen?: string
          id?: string
          idempotency_key?: string
          incoming_fingerprint?: string
          last_seen?: string
          occurrence_count?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      financial_job_leases: {
        Row: {
          acquired_at: string
          created_at: string
          expires_at: string
          heartbeat_at: string
          holder: string | null
          job_name: string
          lease_token: string
          run_count: number
          updated_at: string
        }
        Insert: {
          acquired_at?: string
          created_at?: string
          expires_at: string
          heartbeat_at?: string
          holder?: string | null
          job_name: string
          lease_token: string
          run_count?: number
          updated_at?: string
        }
        Update: {
          acquired_at?: string
          created_at?: string
          expires_at?: string
          heartbeat_at?: string
          holder?: string | null
          job_name?: string
          lease_token?: string
          run_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      financial_remediations: {
        Row: {
          actor_user_id: string | null
          adjustment_amount: number
          after_balance: number
          before_balance: number
          correlation_id: string | null
          created_at: string
          evidence: Json
          finding_key: string
          id: string
          idempotency_key: string
          ledger_entry_id: string | null
          reason_code: string
          rule_code: string
          transaction_id: string
        }
        Insert: {
          actor_user_id?: string | null
          adjustment_amount: number
          after_balance: number
          before_balance: number
          correlation_id?: string | null
          created_at?: string
          evidence?: Json
          finding_key: string
          id?: string
          idempotency_key: string
          ledger_entry_id?: string | null
          reason_code: string
          rule_code: string
          transaction_id: string
        }
        Update: {
          actor_user_id?: string | null
          adjustment_amount?: number
          after_balance?: number
          before_balance?: number
          correlation_id?: string | null
          created_at?: string
          evidence?: Json
          finding_key?: string
          id?: string
          idempotency_key?: string
          ledger_entry_id?: string | null
          reason_code?: string
          rule_code?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_remediations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_remediations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_remediations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_remediations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      identity_submissions: {
        Row: {
          consent_accepted_at: string
          consent_text_version: string
          created_at: string
          date_of_birth: string | null
          document_file_id: string | null
          id: string
          legal_name: string
          masked_identifier: string | null
          previous_submission_id: string | null
          provider_reference: string | null
          rejected_at: string | null
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["identity_submission_status"]
          submitted_at: string
          updated_at: string
          user_id: string
          verification_method: Database["public"]["Enums"]["identity_verification_method"]
        }
        Insert: {
          consent_accepted_at: string
          consent_text_version?: string
          created_at?: string
          date_of_birth?: string | null
          document_file_id?: string | null
          id?: string
          legal_name: string
          masked_identifier?: string | null
          previous_submission_id?: string | null
          provider_reference?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["identity_submission_status"]
          submitted_at?: string
          updated_at?: string
          user_id: string
          verification_method: Database["public"]["Enums"]["identity_verification_method"]
        }
        Update: {
          consent_accepted_at?: string
          consent_text_version?: string
          created_at?: string
          date_of_birth?: string | null
          document_file_id?: string | null
          id?: string
          legal_name?: string
          masked_identifier?: string | null
          previous_submission_id?: string | null
          provider_reference?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["identity_submission_status"]
          submitted_at?: string
          updated_at?: string
          user_id?: string
          verification_method?: Database["public"]["Enums"]["identity_verification_method"]
        }
        Relationships: [
          {
            foreignKeyName: "identity_submissions_document_file_id_fkey"
            columns: ["document_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_submissions_previous_submission_id_fkey"
            columns: ["previous_submission_id"]
            isOneToOne: false
            referencedRelation: "identity_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "identity_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_roles: {
        Row: {
          created_at: string
          description: string
          is_system: boolean
          key: string
          name: string
          protected: boolean
          sort_order: number
        }
        Insert: {
          created_at?: string
          description: string
          is_system?: boolean
          key: string
          name: string
          protected?: boolean
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string
          is_system?: boolean
          key?: string
          name?: string
          protected?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      internal_user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          is_primary: boolean
          role_key: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          is_primary?: boolean
          role_key: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          is_primary?: boolean
          role_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_user_roles_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "internal_roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "internal_user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_users: {
        Row: {
          access_expires_at: string | null
          activated_at: string | null
          created_at: string
          created_by: string | null
          department: string | null
          display_id: string
          email: string
          employee_id: string
          first_name: string | null
          full_name: string
          id: string
          invitation_status: string
          job_title: string | null
          last_active_at: string | null
          last_name: string | null
          reason_for_access: string | null
          reporting_manager_id: string | null
          status: string
          team: string | null
          two_factor_enabled: boolean
          updated_at: string
        }
        Insert: {
          access_expires_at?: string | null
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          display_id: string
          email: string
          employee_id?: string
          first_name?: string | null
          full_name: string
          id: string
          invitation_status?: string
          job_title?: string | null
          last_active_at?: string | null
          last_name?: string | null
          reason_for_access?: string | null
          reporting_manager_id?: string | null
          status?: string
          team?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Update: {
          access_expires_at?: string | null
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          display_id?: string
          email?: string
          employee_id?: string
          first_name?: string | null
          full_name?: string
          id?: string
          invitation_status?: string
          job_title?: string | null
          last_active_at?: string | null
          last_name?: string | null
          reason_for_access?: string | null
          reporting_manager_id?: string | null
          status?: string
          team?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_users_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_recovery_codes: {
        Row: {
          batch_id: string
          code_hash: string
          created_at: string
          id: string
          salt: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          batch_id: string
          code_hash: string
          created_at?: string
          id?: string
          salt: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string
          code_hash?: string
          created_at?: string
          id?: string
          salt?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_verification_attempts: {
        Row: {
          created_at: string
          id: string
          ip: string | null
          kind: string
          success: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip?: string | null
          kind: string
          success: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip?: string | null
          kind?: string
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      money_status_history: {
        Row: {
          changed_at: string
          changed_by_user_id: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["money_status"]
          old_status: Database["public"]["Enums"]["money_status"] | null
          reason: string | null
          transaction_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["money_status"]
          old_status?: Database["public"]["Enums"]["money_status"] | null
          reason?: string | null
          transaction_id: string
        }
        Update: {
          changed_at?: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["money_status"]
          old_status?: Database["public"]["Enums"]["money_status"] | null
          reason?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "money_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "money_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "money_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivery_status: Database["public"]["Enums"]["notification_status"]
          id: string
          notification_id: string
          provider_response: string | null
          sent_at: string | null
        }
        Insert: {
          attempt_count?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivery_status: Database["public"]["Enums"]["notification_status"]
          id?: string
          notification_id: string
          provider_response?: string | null
          sent_at?: string | null
        }
        Update: {
          attempt_count?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["notification_status"]
          id?: string
          notification_id?: string
          provider_response?: string | null
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          delivery_updates: boolean
          dispute_updates: boolean
          id: string
          marketing_messages: boolean
          matrix_alerts: Json
          payment_updates: boolean
          system_alerts: boolean
          updated_at: string
          user_id: string
          verification_reminders: boolean
        }
        Insert: {
          created_at?: string
          delivery_updates?: boolean
          dispute_updates?: boolean
          id?: string
          marketing_messages?: boolean
          matrix_alerts?: Json
          payment_updates?: boolean
          system_alerts?: boolean
          updated_at?: string
          user_id: string
          verification_reminders?: boolean
        }
        Update: {
          created_at?: string
          delivery_updates?: boolean
          dispute_updates?: boolean
          id?: string
          marketing_messages?: boolean
          matrix_alerts?: Json
          payment_updates?: boolean
          system_alerts?: boolean
          updated_at?: string
          user_id?: string
          verification_reminders?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          dedupe_key: string | null
          first_seen_at: string | null
          id: string
          is_read: boolean
          last_seen_at: string | null
          message: string
          metadata: Json | null
          occurrence_count: number
          read_at: string | null
          related_dispute_id: string | null
          related_transaction_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dedupe_key?: string | null
          first_seen_at?: string | null
          id?: string
          is_read?: boolean
          last_seen_at?: string | null
          message: string
          metadata?: Json | null
          occurrence_count?: number
          read_at?: string | null
          related_dispute_id?: string | null
          related_transaction_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          dedupe_key?: string | null
          first_seen_at?: string | null
          id?: string
          is_read?: boolean
          last_seen_at?: string | null
          message?: string
          metadata?: Json | null
          occurrence_count?: number
          read_at?: string | null
          related_dispute_id?: string | null
          related_transaction_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_dispute_id_fkey"
            columns: ["related_dispute_id"]
            isOneToOne: false
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_dispute_id_fkey"
            columns: ["related_dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_transaction_id_fkey"
            columns: ["related_transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          offer_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          offer_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          offer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "buyer_specific_product_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestration_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          task_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          task_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "orchestration_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestration_notification_dedupe: {
        Row: {
          created_at: string
          event: string
          expires_at: string
          first_sent_at: string
          id: string
          key: string
          recipient_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          expires_at: string
          first_sent_at?: string
          id?: string
          key: string
          recipient_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          expires_at?: string
          first_sent_at?: string
          id?: string
          key?: string
          recipient_id?: string | null
        }
        Relationships: []
      }
      orchestration_tasks: {
        Row: {
          amount: number | null
          assigned_agent_id: string | null
          assigned_at: string | null
          assignment_reason: string | null
          buyer_id: string | null
          created_at: string
          currency: string | null
          description: string | null
          dispute_id: string | null
          due_at: string | null
          escalation_level: number
          escalation_reason: string | null
          first_action_at: string | null
          id: string
          priority: Database["public"]["Enums"]["orchestration_task_priority"]
          queue: string
          reassignment_count: number
          required_permissions: string[]
          required_role: string | null
          required_skills: string[]
          resolved_at: string | null
          risk_level: string
          seller_id: string | null
          sla_status: Database["public"]["Enums"]["orchestration_sla_status"]
          source_event_key: string | null
          stage: Database["public"]["Enums"]["orchestration_task_stage"]
          started_at: string | null
          status: Database["public"]["Enums"]["orchestration_task_status"]
          suggested_agent_id: string | null
          tags: string[]
          task_code: string
          team: string | null
          title: string
          transaction_id: string | null
          type: Database["public"]["Enums"]["orchestration_task_type"]
          updated_at: string
          version: number
        }
        Insert: {
          amount?: number | null
          assigned_agent_id?: string | null
          assigned_at?: string | null
          assignment_reason?: string | null
          buyer_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          dispute_id?: string | null
          due_at?: string | null
          escalation_level?: number
          escalation_reason?: string | null
          first_action_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["orchestration_task_priority"]
          queue?: string
          reassignment_count?: number
          required_permissions?: string[]
          required_role?: string | null
          required_skills?: string[]
          resolved_at?: string | null
          risk_level?: string
          seller_id?: string | null
          sla_status?: Database["public"]["Enums"]["orchestration_sla_status"]
          source_event_key?: string | null
          stage?: Database["public"]["Enums"]["orchestration_task_stage"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["orchestration_task_status"]
          suggested_agent_id?: string | null
          tags?: string[]
          task_code?: string
          team?: string | null
          title: string
          transaction_id?: string | null
          type: Database["public"]["Enums"]["orchestration_task_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          amount?: number | null
          assigned_agent_id?: string | null
          assigned_at?: string | null
          assignment_reason?: string | null
          buyer_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          dispute_id?: string | null
          due_at?: string | null
          escalation_level?: number
          escalation_reason?: string | null
          first_action_at?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["orchestration_task_priority"]
          queue?: string
          reassignment_count?: number
          required_permissions?: string[]
          required_role?: string | null
          required_skills?: string[]
          resolved_at?: string | null
          risk_level?: string
          seller_id?: string | null
          sla_status?: Database["public"]["Enums"]["orchestration_sla_status"]
          source_event_key?: string | null
          stage?: Database["public"]["Enums"]["orchestration_task_stage"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["orchestration_task_status"]
          suggested_agent_id?: string | null
          tags?: string[]
          task_code?: string
          team?: string | null
          title?: string
          transaction_id?: string | null
          type?: Database["public"]["Enums"]["orchestration_task_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "orchestration_tasks_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "admin_dispute_summary_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_tasks_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_tasks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_tasks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_tasks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orchestration_tasks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      payment_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
          processed_successfully: boolean
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id: string | null
          provider_reference: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          processed_at?: string | null
          processed_successfully?: boolean
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_event_id?: string | null
          provider_reference?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processed_successfully?: boolean
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_event_id?: string | null
          provider_reference?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          authorized_at: string | null
          captured_at: string | null
          checkout_session_id: string | null
          created_at: string
          currency_code: string
          failed_at: string | null
          failure_reason: string | null
          id: string
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_reference: string
          raw_payload: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          transaction_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          authorized_at?: string | null
          captured_at?: string | null
          checkout_session_id?: string | null
          created_at?: string
          currency_code: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          payment_method_type: Database["public"]["Enums"]["payment_method_type"]
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_reference: string
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          authorized_at?: string | null
          captured_at?: string | null
          checkout_session_id?: string | null
          created_at?: string
          currency_code?: string
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          payment_method_type?: Database["public"]["Enums"]["payment_method_type"]
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_reference?: string
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_accounts: {
        Row: {
          account_name: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          last_verification_error: string | null
          last_verified_at: string | null
          masked_account_number: string
          provider: string | null
          provider_recipient_code: string | null
          provider_recipient_id: string | null
          provider_response: Json | null
          updated_at: string
          user_id: string
          verification_status: string
        }
        Insert: {
          account_name: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          last_verification_error?: string | null
          last_verified_at?: string | null
          masked_account_number: string
          provider?: string | null
          provider_recipient_code?: string | null
          provider_recipient_id?: string | null
          provider_response?: Json | null
          updated_at?: string
          user_id: string
          verification_status?: string
        }
        Update: {
          account_name?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          last_verification_error?: string | null
          last_verified_at?: string | null
          masked_account_number?: string
          provider?: string | null
          provider_recipient_code?: string | null
          provider_recipient_id?: string | null
          provider_response?: Json | null
          updated_at?: string
          user_id?: string
          verification_status?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          currency_code: string
          failed_at: string | null
          failed_attempt_count: number
          failure_reason: string | null
          id: string
          initiated_at: string | null
          last_release_attempt_at: string | null
          last_release_error: string | null
          notes: string | null
          payout_blocked_reason: string | null
          provider_reference: string | null
          release_approved_by_user_id: string | null
          release_blocked: boolean
          released_at: string | null
          retry_allowed: boolean
          seller_id: string
          status: Database["public"]["Enums"]["payout_status"]
          transaction_id: string
          updated_at: string
          watchdog_alerted_at: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          currency_code: string
          failed_at?: string | null
          failed_attempt_count?: number
          failure_reason?: string | null
          id?: string
          initiated_at?: string | null
          last_release_attempt_at?: string | null
          last_release_error?: string | null
          notes?: string | null
          payout_blocked_reason?: string | null
          provider_reference?: string | null
          release_approved_by_user_id?: string | null
          release_blocked?: boolean
          released_at?: string | null
          retry_allowed?: boolean
          seller_id: string
          status?: Database["public"]["Enums"]["payout_status"]
          transaction_id: string
          updated_at?: string
          watchdog_alerted_at?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          currency_code?: string
          failed_at?: string | null
          failed_attempt_count?: number
          failure_reason?: string | null
          id?: string
          initiated_at?: string | null
          last_release_attempt_at?: string | null
          last_release_error?: string | null
          notes?: string | null
          payout_blocked_reason?: string | null
          provider_reference?: string | null
          release_approved_by_user_id?: string | null
          release_blocked?: boolean
          released_at?: string | null
          retry_allowed?: boolean
          seller_id?: string
          status?: Database["public"]["Enums"]["payout_status"]
          transaction_id?: string
          updated_at?: string
          watchdog_alerted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_release_approved_by_user_id_fkey"
            columns: ["release_approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payouts_release_approved_by_user_id_fkey"
            columns: ["release_approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payouts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      permission_change_sets: {
        Row: {
          after: Json
          applied_at: string | null
          applied_by: string | null
          before: Json
          created_at: string
          environment: string
          id: string
          reason: string | null
          requested_by: string | null
          requires_approval: boolean
          review_comments: Json
          status: string
          submitted_at: string | null
          target_key: string
          target_scope: string
        }
        Insert: {
          after?: Json
          applied_at?: string | null
          applied_by?: string | null
          before?: Json
          created_at?: string
          environment?: string
          id?: string
          reason?: string | null
          requested_by?: string | null
          requires_approval?: boolean
          review_comments?: Json
          status?: string
          submitted_at?: string | null
          target_key: string
          target_scope: string
        }
        Update: {
          after?: Json
          applied_at?: string | null
          applied_by?: string | null
          before?: Json
          created_at?: string
          environment?: string
          id?: string
          reason?: string | null
          requested_by?: string | null
          requires_approval?: boolean
          review_comments?: Json
          status?: string
          submitted_at?: string | null
          target_key?: string
          target_scope?: string
        }
        Relationships: []
      }
      permission_conflict_acknowledgements: {
        Row: {
          a_key: string
          actor_id: string
          b_key: string
          created_at: string
          environment: string
          expires_at: string | null
          id: string
          reason: string
          role_key: string
        }
        Insert: {
          a_key: string
          actor_id: string
          b_key: string
          created_at?: string
          environment?: string
          expires_at?: string | null
          id?: string
          reason: string
          role_key: string
        }
        Update: {
          a_key?: string
          actor_id?: string
          b_key?: string
          created_at?: string
          environment?: string
          expires_at?: string | null
          id?: string
          reason?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_conflict_acknowledgements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_conflicts: {
        Row: {
          a_key: string
          b_key: string
          created_at: string
          id: string
          rationale: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          a_key: string
          b_key: string
          created_at?: string
          id?: string
          rationale?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          a_key?: string
          b_key?: string
          created_at?: string
          id?: string
          rationale?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_dependencies: {
        Row: {
          created_at: string
          id: string
          note: string | null
          permission_key: string
          requires_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          permission_key: string
          requires_key: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          permission_key?: string
          requires_key?: string
        }
        Relationships: []
      }
      permission_environments: {
        Row: {
          created_at: string
          environment: string
          permission_key: string
        }
        Insert: {
          created_at?: string
          environment: string
          permission_key: string
        }
        Update: {
          created_at?: string
          environment?: string
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_environments_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      permission_template_items: {
        Row: {
          permission_key: string
          template_id: string
        }
        Insert: {
          permission_key: string
          template_id: string
        }
        Update: {
          permission_key?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_template_items_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "permission_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "permission_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          environment: string
          id: string
          is_system: boolean
          name: string
          role_source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          environment?: string
          id?: string
          is_system?: boolean
          name: string
          role_source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          environment?: string
          id?: string
          is_system?: boolean
          name?: string
          role_source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_templates_role_source_fkey"
            columns: ["role_source"]
            isOneToOne: false
            referencedRelation: "internal_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          approval_required: boolean
          assignable: boolean
          created_at: string
          description: string
          is_system_default: boolean
          key: string
          label: string
          module: string
          owner_role: string | null
          risk_level: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          approval_required?: boolean
          assignable?: boolean
          created_at?: string
          description?: string
          is_system_default?: boolean
          key: string
          label: string
          module: string
          owner_role?: string | null
          risk_level?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          approval_required?: boolean
          assignable?: boolean
          created_at?: string
          description?: string
          is_system_default?: boolean
          key?: string
          label?: string
          module?: string
          owner_role?: string | null
          risk_level?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      phone_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          invalidated_at: string | null
          max_attempts: number
          phone: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          invalidated_at?: string | null
          max_attempts?: number
          phone: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          invalidated_at?: string | null
          max_attempts?: number
          phone?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "phone_otp_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "phone_otp_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          icon_name: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_inventory_logs: {
        Row: {
          balance_after: number
          change_type: Database["public"]["Enums"]["product_inventory_change_type"]
          changed_by_user_id: string | null
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity_delta: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          balance_after: number
          change_type: Database["public"]["Enums"]["product_inventory_change_type"]
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity_delta: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          balance_after?: number
          change_type?: Database["public"]["Enums"]["product_inventory_change_type"]
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity_delta?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_inventory_logs_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "product_inventory_logs_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          created_at: string
          file_id: string
          id: string
          is_primary: boolean
          media_type: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          is_primary?: boolean
          media_type: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_media_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          agreement_terms: string | null
          archived_at: string | null
          brand: string | null
          category_id: string | null
          condition_label: string | null
          created_at: string
          currency_code: string
          delivery_method: string | null
          delivery_scope: string | null
          description: string
          estimated_delivery_days: string | null
          feature_highlights: Json | null
          id: string
          is_active: boolean
          model: string | null
          original_price: number | null
          published_at: string | null
          reserved_quantity: number
          seller_id: string
          seller_notes: string | null
          short_description: string | null
          sku: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          stock_quantity: number
          title: string
          unit_price: number
          updated_at: string
          verification_window_hours: number | null
          visibility_type: Database["public"]["Enums"]["product_visibility_type"]
        }
        Insert: {
          agreement_terms?: string | null
          archived_at?: string | null
          brand?: string | null
          category_id?: string | null
          condition_label?: string | null
          created_at?: string
          currency_code: string
          delivery_method?: string | null
          delivery_scope?: string | null
          description: string
          estimated_delivery_days?: string | null
          feature_highlights?: Json | null
          id?: string
          is_active?: boolean
          model?: string | null
          original_price?: number | null
          published_at?: string | null
          reserved_quantity?: number
          seller_id: string
          seller_notes?: string | null
          short_description?: string | null
          sku?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number
          title: string
          unit_price: number
          updated_at?: string
          verification_window_hours?: number | null
          visibility_type?: Database["public"]["Enums"]["product_visibility_type"]
        }
        Update: {
          agreement_terms?: string | null
          archived_at?: string | null
          brand?: string | null
          category_id?: string | null
          condition_label?: string | null
          created_at?: string
          currency_code?: string
          delivery_method?: string | null
          delivery_scope?: string | null
          description?: string
          estimated_delivery_days?: string | null
          feature_highlights?: Json | null
          id?: string
          is_active?: boolean
          model?: string | null
          original_price?: number | null
          published_at?: string | null
          reserved_quantity?: number
          seller_id?: string
          seller_notes?: string | null
          short_description?: string | null
          sku?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number
          title?: string
          unit_price?: number
          updated_at?: string
          verification_window_hours?: number | null
          visibility_type?: Database["public"]["Enums"]["product_visibility_type"]
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city_name: string | null
          country_code: string
          created_at: string
          default_region_id: string | null
          default_role: Database["public"]["Enums"]["user_role_type"]
          email: string
          extra_photo_slots: number
          featured_until: string | null
          full_name: string
          id: string
          is_region_eligible: boolean
          last_login_at: string | null
          phone: string | null
          public_user_id: string
          state_name: string | null
          status: Database["public"]["Enums"]["profile_status"]
          store_slug: string | null
          updated_at: string
          vendor_plan_code: string
          vendor_plan_expires_at: string | null
          vendor_plan_period: string | null
          vendor_status: Database["public"]["Enums"]["vendor_status_type"]
          vendor_status_changed_at: string | null
          vendor_status_changed_by: string | null
          vendor_status_reason: string | null
        }
        Insert: {
          avatar_url?: string | null
          city_name?: string | null
          country_code?: string
          created_at?: string
          default_region_id?: string | null
          default_role?: Database["public"]["Enums"]["user_role_type"]
          email: string
          extra_photo_slots?: number
          featured_until?: string | null
          full_name: string
          id: string
          is_region_eligible?: boolean
          last_login_at?: string | null
          phone?: string | null
          public_user_id: string
          state_name?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          store_slug?: string | null
          updated_at?: string
          vendor_plan_code?: string
          vendor_plan_expires_at?: string | null
          vendor_plan_period?: string | null
          vendor_status?: Database["public"]["Enums"]["vendor_status_type"]
          vendor_status_changed_at?: string | null
          vendor_status_changed_by?: string | null
          vendor_status_reason?: string | null
        }
        Update: {
          avatar_url?: string | null
          city_name?: string | null
          country_code?: string
          created_at?: string
          default_region_id?: string | null
          default_role?: Database["public"]["Enums"]["user_role_type"]
          email?: string
          extra_photo_slots?: number
          featured_until?: string | null
          full_name?: string
          id?: string
          is_region_eligible?: boolean
          last_login_at?: string | null
          phone?: string | null
          public_user_id?: string
          state_name?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          store_slug?: string | null
          updated_at?: string
          vendor_plan_code?: string
          vendor_plan_expires_at?: string | null
          vendor_plan_period?: string | null
          vendor_status?: Database["public"]["Enums"]["vendor_status_type"]
          vendor_status_changed_at?: string | null
          vendor_status_changed_by?: string | null
          vendor_status_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_region_id_fkey"
            columns: ["default_region_id"]
            isOneToOne: false
            referencedRelation: "serviceable_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_vendor_plan_code_fkey"
            columns: ["vendor_plan_code"]
            isOneToOne: false
            referencedRelation: "vendor_plans"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "profiles_vendor_status_changed_by_fkey"
            columns: ["vendor_status_changed_by"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_vendor_status_changed_by_fkey"
            columns: ["vendor_status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_user_id_mapping: {
        Row: {
          frozen: boolean
          generated_at: string
          public_user_id: string
          user_id: string
        }
        Insert: {
          frozen?: boolean
          generated_at?: string
          public_user_id: string
          user_id: string
        }
        Update: {
          frozen?: boolean
          generated_at?: string
          public_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_user_id_mapping_public_user_id_fkey"
            columns: ["public_user_id"]
            isOneToOne: true
            referencedRelation: "public_user_id_registry"
            referencedColumns: ["public_user_id"]
          },
          {
            foreignKeyName: "public_user_id_mapping_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "public_user_id_mapping_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_user_id_registry: {
        Row: {
          first_assigned_at: string
          public_user_id: string
          retired_at: string | null
        }
        Insert: {
          first_assigned_at?: string
          public_user_id: string
          retired_at?: string | null
        }
        Update: {
          first_assigned_at?: string
          public_user_id?: string
          retired_at?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          buyer_id: string
          completed_at: string | null
          created_at: string
          currency_code: string
          failed_at: string | null
          failed_attempt_count: number
          failure_reason: string | null
          id: string
          initiated_at: string | null
          initiated_by_user_id: string | null
          notes: string | null
          payment_id: string | null
          provider: string
          provider_reference: string | null
          provider_response: Json | null
          reason: string | null
          refund_amount: number
          status: Database["public"]["Enums"]["refund_status"]
          transaction_id: string
          updated_at: string
        }
        Insert: {
          buyer_id: string
          completed_at?: string | null
          created_at?: string
          currency_code: string
          failed_at?: string | null
          failed_attempt_count?: number
          failure_reason?: string | null
          id?: string
          initiated_at?: string | null
          initiated_by_user_id?: string | null
          notes?: string | null
          payment_id?: string | null
          provider?: string
          provider_reference?: string | null
          provider_response?: Json | null
          reason?: string | null
          refund_amount: number
          status?: Database["public"]["Enums"]["refund_status"]
          transaction_id: string
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          completed_at?: string | null
          created_at?: string
          currency_code?: string
          failed_at?: string | null
          failed_attempt_count?: number
          failure_reason?: string | null
          id?: string
          initiated_at?: string | null
          initiated_by_user_id?: string | null
          notes?: string | null
          payment_id?: string | null
          provider?: string
          provider_reference?: string | null
          provider_response?: Json | null
          reason?: string | null
          refund_amount?: number
          status?: Database["public"]["Enums"]["refund_status"]
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "refunds_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      release_review_queue: {
        Row: {
          amount: number | null
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string
          currency_code: string | null
          entered_queue_at: string
          flagged_by_user_id: string | null
          id: string
          notes: string | null
          payout_id: string | null
          queue_type: string
          resolved_at: string | null
          seller_id: string
          status: string
          transaction_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          currency_code?: string | null
          entered_queue_at?: string
          flagged_by_user_id?: string | null
          id?: string
          notes?: string | null
          payout_id?: string | null
          queue_type: string
          resolved_at?: string | null
          seller_id: string
          status?: string
          transaction_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          currency_code?: string | null
          entered_queue_at?: string
          flagged_by_user_id?: string | null
          id?: string
          notes?: string | null
          payout_id?: string | null
          queue_type?: string
          resolved_at?: string | null
          seller_id?: string
          status?: string
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_review_queue_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "release_review_queue_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_review_queue_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_review_queue_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "release_review_queue_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_review_queue_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_review_queue_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_review_queue_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_review_queue_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          environment: string
          permission_key: string
          role_key: string
        }
        Insert: {
          environment?: string
          permission_key: string
          role_key: string
        }
        Update: {
          environment?: string
          permission_key?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "internal_roles"
            referencedColumns: ["key"]
          },
        ]
      }
      saved_products: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      serviceable_regions: {
        Row: {
          city_name: string | null
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          launch_phase: number
          state_name: string
          updated_at: string
        }
        Insert: {
          city_name?: string | null
          country_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          launch_phase?: number
          state_name: string
          updated_at?: string
        }
        Update: {
          city_name?: string | null
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          launch_phase?: number
          state_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string
          id: string
          level: Database["public"]["Enums"]["system_log_level"]
          message: string
          metadata: Json | null
          service_name: string
          stack_trace: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["system_log_level"]
          message: string
          metadata?: Json | null
          service_name: string
          stack_trace?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["system_log_level"]
          message?: string
          metadata?: Json | null
          service_name?: string
          stack_trace?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          auto_release_enabled_at: string | null
          auto_release_enabled_by: string | null
          auto_release_previous_value: string | null
          created_at: string
          id: string
          is_overridable: boolean
          scope: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          auto_release_enabled_at?: string | null
          auto_release_enabled_by?: string | null
          auto_release_previous_value?: string | null
          created_at?: string
          id?: string
          is_overridable?: boolean
          scope?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          auto_release_enabled_at?: string | null
          auto_release_enabled_by?: string | null
          auto_release_previous_value?: string | null
          created_at?: string
          id?: string
          is_overridable?: boolean
          scope?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_settings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "system_settings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          created_at: string
          effective_from: string
          id: string
          new_value: Json
          old_value: Json | null
          reason: string | null
          scope: string
          setting_id: string | null
          setting_key: string
          vendor_id: string | null
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          effective_from?: string
          id?: string
          new_value: Json
          old_value?: Json | null
          reason?: string | null
          scope: string
          setting_id?: string | null
          setting_key: string
          vendor_id?: string | null
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          created_at?: string
          effective_from?: string
          id?: string
          new_value?: Json
          old_value?: Json | null
          reason?: string | null
          scope?: string
          setting_id?: string | null
          setting_key?: string
          vendor_id?: string | null
          version?: number
        }
        Relationships: []
      }
      task_assignment_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_agent_id: string | null
          id: string
          mode: string
          reason: string | null
          task_id: string
          to_agent_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          mode: string
          reason?: string | null
          task_id: string
          to_agent_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_agent_id?: string | null
          id?: string
          mode?: string
          reason?: string | null
          task_id?: string
          to_agent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_assignment_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "orchestration_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "orchestration_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage:
            | Database["public"]["Enums"]["orchestration_task_stage"]
            | null
          from_status:
            | Database["public"]["Enums"]["orchestration_task_status"]
            | null
          id: string
          reason: string | null
          task_id: string
          to_stage:
            | Database["public"]["Enums"]["orchestration_task_stage"]
            | null
          to_status: Database["public"]["Enums"]["orchestration_task_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage?:
            | Database["public"]["Enums"]["orchestration_task_stage"]
            | null
          from_status?:
            | Database["public"]["Enums"]["orchestration_task_status"]
            | null
          id?: string
          reason?: string | null
          task_id: string
          to_stage?:
            | Database["public"]["Enums"]["orchestration_task_stage"]
            | null
          to_status: Database["public"]["Enums"]["orchestration_task_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage?:
            | Database["public"]["Enums"]["orchestration_task_stage"]
            | null
          from_status?:
            | Database["public"]["Enums"]["orchestration_task_status"]
            | null
          id?: string
          reason?: string | null
          task_id?: string
          to_stage?:
            | Database["public"]["Enums"]["orchestration_task_stage"]
            | null
          to_status?: Database["public"]["Enums"]["orchestration_task_status"]
        }
        Relationships: [
          {
            foreignKeyName: "task_status_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "orchestration_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      timeout_rules: {
        Row: {
          created_at: string
          hours_until_trigger: number
          id: string
          is_active: boolean
          rule_type: Database["public"]["Enums"]["timeout_rule_type"]
          scope: string
          updated_at: string
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          hours_until_trigger: number
          id?: string
          is_active?: boolean
          rule_type: Database["public"]["Enums"]["timeout_rule_type"]
          scope?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          hours_until_trigger?: number
          id?: string
          is_active?: boolean
          rule_type?: Database["public"]["Enums"]["timeout_rule_type"]
          scope?: string
          updated_at?: string
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timeout_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "timeout_rules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeout_rules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "timeout_rules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_agreement_snapshots: {
        Row: {
          created_at: string
          id: string
          locked_at: string
          locked_by_user_id: string | null
          snapshot_json: Json
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          locked_at: string
          locked_by_user_id?: string | null
          snapshot_json: Json
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          locked_at?: string
          locked_by_user_id?: string | null
          snapshot_json?: Json
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_agreement_snapshots_locked_by_user_id_fkey"
            columns: ["locked_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transaction_agreement_snapshots_locked_by_user_id_fkey"
            columns: ["locked_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_agreement_snapshots_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_agreement_snapshots_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_agreement_snapshots_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_agreement_snapshots_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_completion_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by_role: Database["public"]["Enums"]["user_role_type"]
          confirmed_by_user_id: string
          created_at: string
          id: string
          notes: string | null
          transaction_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by_role: Database["public"]["Enums"]["user_role_type"]
          confirmed_by_user_id: string
          created_at?: string
          id?: string
          notes?: string | null
          transaction_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by_role?: Database["public"]["Enums"]["user_role_type"]
          confirmed_by_user_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_completion_confirmations_confirmed_by_user_id_fkey"
            columns: ["confirmed_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transaction_completion_confirmations_confirmed_by_user_id_fkey"
            columns: ["confirmed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_completion_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_completion_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_completion_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_completion_confirmations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_delivery_terms: {
        Row: {
          created_at: string
          delivery_address_line1: string | null
          delivery_address_line2: string | null
          delivery_city: string | null
          delivery_country_code: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method_type"]
          delivery_postal_code: string | null
          delivery_state: string | null
          expected_delivery_date: string | null
          id: string
          transaction_id: string
          updated_at: string
          verification_window_hours: number
        }
        Insert: {
          created_at?: string
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_city?: string | null
          delivery_country_code?: string | null
          delivery_method: Database["public"]["Enums"]["delivery_method_type"]
          delivery_postal_code?: string | null
          delivery_state?: string | null
          expected_delivery_date?: string | null
          id?: string
          transaction_id: string
          updated_at?: string
          verification_window_hours: number
        }
        Update: {
          created_at?: string
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_city?: string | null
          delivery_country_code?: string | null
          delivery_method?: Database["public"]["Enums"]["delivery_method_type"]
          delivery_postal_code?: string | null
          delivery_state?: string | null
          expected_delivery_date?: string | null
          id?: string
          transaction_id?: string
          updated_at?: string
          verification_window_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_delivery_terms_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_delivery_terms_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_delivery_terms_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_delivery_terms_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_events: {
        Row: {
          actor_role:
            | Database["public"]["Enums"]["transaction_actor_role"]
            | null
          actor_user_id: string | null
          created_at: string
          event_data: Json | null
          event_type: Database["public"]["Enums"]["transaction_event_type"]
          id: string
          occurred_at: string
          transaction_id: string
        }
        Insert: {
          actor_role?:
            | Database["public"]["Enums"]["transaction_actor_role"]
            | null
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type: Database["public"]["Enums"]["transaction_event_type"]
          id?: string
          occurred_at?: string
          transaction_id: string
        }
        Update: {
          actor_role?:
            | Database["public"]["Enums"]["transaction_actor_role"]
            | null
          actor_user_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type?: Database["public"]["Enums"]["transaction_event_type"]
          id?: string
          occurred_at?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transaction_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_events_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          brand: string | null
          condition_label: Database["public"]["Enums"]["item_condition"]
          created_at: string
          description: string
          id: string
          model: string | null
          quantity: number
          title: string
          transaction_id: string
          updated_at: string
          warranty_info: string | null
        }
        Insert: {
          brand?: string | null
          condition_label: Database["public"]["Enums"]["item_condition"]
          created_at?: string
          description: string
          id?: string
          model?: string | null
          quantity?: number
          title: string
          transaction_id: string
          updated_at?: string
          warranty_info?: string | null
        }
        Update: {
          brand?: string | null
          condition_label?: Database["public"]["Enums"]["item_condition"]
          created_at?: string
          description?: string
          id?: string
          model?: string | null
          quantity?: number
          title?: string
          transaction_id?: string
          updated_at?: string
          warranty_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_links: {
        Row: {
          created_at: string
          expires_at: string | null
          first_opened_at: string | null
          id: string
          is_active: boolean
          last_opened_at: string | null
          opened_count: number
          share_token: string
          transaction_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          is_active?: boolean
          last_opened_at?: string | null
          opened_count?: number
          share_token: string
          transaction_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          first_opened_at?: string | null
          id?: string
          is_active?: boolean
          last_opened_at?: string | null
          opened_count?: number
          share_token?: string
          transaction_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_media: {
        Row: {
          created_at: string
          file_id: string
          id: string
          media_type: Database["public"]["Enums"]["transaction_media_type"]
          sort_order: number
          transaction_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          media_type: Database["public"]["Enums"]["transaction_media_type"]
          sort_order?: number
          transaction_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          media_type?: Database["public"]["Enums"]["transaction_media_type"]
          sort_order?: number
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_media_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_media_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_media_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_media_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_media_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_messages: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message_text: string
          read_at: string | null
          recipient_user_id: string
          sender_user_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message_text: string
          read_at?: string | null
          recipient_user_id: string
          sender_user_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message_text?: string
          read_at?: string | null
          recipient_user_id?: string
          sender_user_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_messages_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transaction_messages_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transaction_messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_messages_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_notes: {
        Row: {
          created_at: string
          id: string
          seller_notes: string | null
          transaction_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          seller_notes?: string | null
          transaction_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          seller_notes?: string | null
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_notes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_participants: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["transaction_party_role"]
          transaction_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          phone?: string | null
          role: Database["public"]["Enums"]["transaction_party_role"]
          transaction_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["transaction_party_role"]
          transaction_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transaction_participants_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_participants_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_participants_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_participants_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "transaction_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transaction_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_pricing: {
        Row: {
          buyer_total_amount: number
          created_at: string
          currency_code: string
          id: string
          is_total_service_fee_capped: boolean
          item_amount: number
          payment_processing_fee_amount: number
          platform_fee_amount: number
          pricing_model_version: string
          seller_payout_amount: number
          transaction_id: string
          updated_at: string
        }
        Insert: {
          buyer_total_amount: number
          created_at?: string
          currency_code: string
          id?: string
          is_total_service_fee_capped?: boolean
          item_amount: number
          payment_processing_fee_amount: number
          platform_fee_amount: number
          pricing_model_version: string
          seller_payout_amount: number
          transaction_id: string
          updated_at?: string
        }
        Update: {
          buyer_total_amount?: number
          created_at?: string
          currency_code?: string
          id?: string
          is_total_service_fee_capped?: boolean
          item_amount?: number
          payment_processing_fee_amount?: number
          platform_fee_amount?: number
          pricing_model_version?: string
          seller_payout_amount?: number
          transaction_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_pricing_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_pricing_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_pricing_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_pricing_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transaction_status_history: {
        Row: {
          changed_at: string
          changed_by_user_id: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["transaction_status"]
          old_status: Database["public"]["Enums"]["transaction_status"] | null
          reason: string | null
          transaction_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["transaction_status"]
          old_status?: Database["public"]["Enums"]["transaction_status"] | null
          reason?: string | null
          transaction_id: string
        }
        Update: {
          changed_at?: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["transaction_status"]
          old_status?: Database["public"]["Enums"]["transaction_status"] | null
          reason?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transaction_status_history_changed_by_user_id_fkey"
            columns: ["changed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_status_history_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      transactions: {
        Row: {
          admin_review_reason: string | null
          agreement_locked_at: string | null
          buyer_confirmed_at: string | null
          buyer_contact_email: string | null
          buyer_contact_phone: string | null
          buyer_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          checkout_session_id: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          delivered_at: string | null
          dispute_status: Database["public"]["Enums"]["dispute_status"]
          id: string
          money_status: Database["public"]["Enums"]["money_status"]
          needs_admin_review: boolean
          needs_release_review: boolean
          payment_received_at: string | null
          region_id: string | null
          release_approved_at: string | null
          release_approved_by: string | null
          release_completed_at: string | null
          release_review_reason: string | null
          search_tsv: unknown
          seller_confirmed_at: string | null
          seller_id: string
          share_link_expires_at: string | null
          share_token: string
          source_offer_id: string | null
          source_product_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_code: string
          updated_at: string
          verification_deadline_at: string | null
        }
        Insert: {
          admin_review_reason?: string | null
          agreement_locked_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_contact_email?: string | null
          buyer_contact_phone?: string | null
          buyer_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checkout_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          delivered_at?: string | null
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: string
          money_status?: Database["public"]["Enums"]["money_status"]
          needs_admin_review?: boolean
          needs_release_review?: boolean
          payment_received_at?: string | null
          region_id?: string | null
          release_approved_at?: string | null
          release_approved_by?: string | null
          release_completed_at?: string | null
          release_review_reason?: string | null
          search_tsv?: unknown
          seller_confirmed_at?: string | null
          seller_id: string
          share_link_expires_at?: string | null
          share_token: string
          source_offer_id?: string | null
          source_product_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_code: string
          updated_at?: string
          verification_deadline_at?: string | null
        }
        Update: {
          admin_review_reason?: string | null
          agreement_locked_at?: string | null
          buyer_confirmed_at?: string | null
          buyer_contact_email?: string | null
          buyer_contact_phone?: string | null
          buyer_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          checkout_session_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          delivered_at?: string | null
          dispute_status?: Database["public"]["Enums"]["dispute_status"]
          id?: string
          money_status?: Database["public"]["Enums"]["money_status"]
          needs_admin_review?: boolean
          needs_release_review?: boolean
          payment_received_at?: string | null
          region_id?: string | null
          release_approved_at?: string | null
          release_approved_by?: string | null
          release_completed_at?: string | null
          release_review_reason?: string | null
          search_tsv?: unknown
          seller_confirmed_at?: string | null
          seller_id?: string
          share_link_expires_at?: string | null
          share_token?: string
          source_offer_id?: string | null
          source_product_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_code?: string
          updated_at?: string
          verification_deadline_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "serviceable_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_release_approved_by_fkey"
            columns: ["release_approved_by"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_release_approved_by_fkey"
            columns: ["release_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          environment: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          mode: string
          permission_key: string
          reason: string
          user_id: string
        }
        Insert: {
          environment?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          mode: string
          permission_key: string
          reason: string
          user_id: string
        }
        Update: {
          environment?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          mode?: string
          permission_key?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "internal_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_region_access_logs: {
        Row: {
          access_result: string
          city_name: string | null
          country_code: string | null
          created_at: string
          id: string
          ip_address: unknown
          reason: string | null
          state_name: string | null
          user_id: string | null
        }
        Insert: {
          access_result: string
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          state_name?: string | null
          user_id?: string | null
        }
        Update: {
          access_result?: string
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          reason?: string | null
          state_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_region_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_region_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          role: Database["public"]["Enums"]["user_role_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role: Database["public"]["Enums"]["user_role_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: Database["public"]["Enums"]["user_role_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
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
      user_sessions: {
        Row: {
          city_name: string | null
          country_code: string | null
          created_at: string
          device_id: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          last_seen_at: string
          revoke_reason: string | null
          revoked_at: string | null
          session_token_hash: string
          state_name: string | null
          user_id: string
        }
        Insert: {
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          session_token_hash: string
          state_name?: string | null
          user_id: string
        }
        Update: {
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_seen_at?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          session_token_hash?: string
          state_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_plan_purchases: {
        Row: {
          activated_at: string | null
          amount_naira: number
          billing_period: string
          created_at: string
          currency_code: string
          expires_at: string | null
          id: string
          metadata: Json
          paid_at: string | null
          plan_code: string | null
          provider: string
          provider_reference: string
          purchase_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          amount_naira: number
          billing_period?: string
          created_at?: string
          currency_code: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          plan_code?: string | null
          provider?: string
          provider_reference: string
          purchase_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          amount_naira?: number
          billing_period?: string
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          paid_at?: string | null
          plan_code?: string | null
          provider?: string
          provider_reference?: string
          purchase_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_plan_purchases_plan_code_fkey"
            columns: ["plan_code"]
            isOneToOne: false
            referencedRelation: "vendor_plans"
            referencedColumns: ["code"]
          },
        ]
      }
      vendor_plans: {
        Row: {
          code: string
          created_at: string
          escrow_fee_rate: number
          featured_placement: boolean
          is_active: boolean
          monthly_price_naira: number
          name: string
          photo_slots: number
          sort_order: number
          tagline: string | null
          updated_at: string
          yearly_price_naira: number
        }
        Insert: {
          code: string
          created_at?: string
          escrow_fee_rate: number
          featured_placement?: boolean
          is_active?: boolean
          monthly_price_naira: number
          name: string
          photo_slots?: number
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          yearly_price_naira: number
        }
        Update: {
          code?: string
          created_at?: string
          escrow_fee_rate?: number
          featured_placement?: boolean
          is_active?: boolean
          monthly_price_naira?: number
          name?: string
          photo_slots?: number
          sort_order?: number
          tagline?: string | null
          updated_at?: string
          yearly_price_naira?: number
        }
        Relationships: []
      }
    }
    Views: {
      admin_dispute_summary_view: {
        Row: {
          id: string | null
          opened_at: string | null
          opened_by_name: string | null
          opened_by_user_id: string | null
          reason: Database["public"]["Enums"]["dispute_reason_type"] | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_case_status"] | null
          transaction_code: string | null
          transaction_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_user_id_fkey"
            columns: ["opened_by_user_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "disputes_opened_by_user_id_fkey"
            columns: ["opened_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "buyer_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "seller_transactions_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "v_pricing_snapshot_audit"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      admin_flagged_users_mv: {
        Row: {
          admin_flag_count: number | null
          auto_detected: boolean | null
          avatar_url: string | null
          blocked_payouts: number | null
          disputes_30d: number | null
          email: string | null
          escalate_count: number | null
          escrow_at_risk: number | null
          flag_user_count: number | null
          flagged_by_admin_id: string | null
          freeze_count: number | null
          frozen_tx_count: number | null
          full_name: string | null
          has_open_investigation: boolean | null
          identity_reason: string | null
          identity_rejected: boolean | null
          is_suspended: boolean | null
          last_clear_at: string | null
          last_signal_at: string | null
          latest_dispute_id: string | null
          latest_tx_code: string | null
          latest_tx_id: string | null
          needs_admin_review_count: number | null
          needs_release_review_count: number | null
          phone: string | null
          reason_keys: string[] | null
          refunds_30d: number | null
          reversed_payouts: number | null
          risk_level: string | null
          role: string | null
          score: number | null
          search_haystack: string | null
          status: string | null
          suspend_count: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_user_id_fkey"
            columns: ["flagged_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_user_directory_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_actions_admin_user_id_fkey"
            columns: ["flagged_by_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_user_directory_view: {
        Row: {
          avatar_url: string | null
          default_role: string | null
          disp_active: number | null
          disp_total: number | null
          email: string | null
          email_verified: boolean | null
          full_name: string | null
          has_investigation: boolean | null
          id_status: string | null
          identity_verified: boolean | null
          is_flagged: boolean | null
          is_suspended: boolean | null
          joined_at: string | null
          last_active_at: string | null
          phone: string | null
          phone_verified: boolean | null
          profile_status: string | null
          roles: string[] | null
          tx_count: number | null
          tx_resolved: number | null
          tx_volume: number | null
          user_id: string | null
        }
        Relationships: []
      }
      buyer_transactions_view: {
        Row: {
          buyer_total_amount: number | null
          completed_at: string | null
          created_at: string | null
          currency_code: string | null
          delivered_at: string | null
          dispute_status: Database["public"]["Enums"]["dispute_status"] | null
          id: string | null
          item_amount: number | null
          money_status: Database["public"]["Enums"]["money_status"] | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          transaction_code: string | null
        }
        Relationships: []
      }
      public_seller_profiles: {
        Row: {
          avatar_url: string | null
          city_name: string | null
          country_code: string | null
          created_at: string | null
          default_role: Database["public"]["Enums"]["user_role_type"] | null
          full_name: string | null
          id: string | null
          state_name: string | null
          store_slug: string | null
        }
        Relationships: []
      }
      seller_transactions_view: {
        Row: {
          completed_at: string | null
          created_at: string | null
          currency_code: string | null
          delivered_at: string | null
          dispute_status: Database["public"]["Enums"]["dispute_status"] | null
          id: string | null
          item_amount: number | null
          money_status: Database["public"]["Enums"]["money_status"] | null
          seller_payout_amount: number | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          transaction_code: string | null
        }
        Relationships: []
      }
      v_payout_account_state: {
        Row: {
          account_id: string | null
          account_state: string | null
          bank_name: string | null
          last_verified_at: string | null
          masked_account_number: string | null
          provider_recipient_code: string | null
          user_id: string | null
          verification_status: string | null
        }
        Relationships: []
      }
      v_pricing_snapshot_audit: {
        Row: {
          created_at: string | null
          money_status: Database["public"]["Enums"]["money_status"] | null
          pricing_model_version: string | null
          snapshot_state: string | null
          transaction_code: string | null
          transaction_id: string | null
        }
        Relationships: []
      }
      v_pricing_snapshot_coverage: {
        Row: {
          last_30d_count: number | null
          last_90d_count: number | null
          snapshot_state: string | null
          total_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_job_lease: {
        Args: { p_holder?: string; p_job_name: string; p_ttl_seconds?: number }
        Returns: Json
      }
      activate_vendor_purchase: {
        Args: { _provider_reference: string }
        Returns: Json
      }
      admin_correct_pricing: {
        Args: {
          p_item_amount: number
          p_processing_fee: number
          p_reason: string
          p_safedeal_fee: number
          p_transaction_id: string
        }
        Returns: Json
      }
      admin_daily_activity_counts: {
        Args: { _days: number }
        Returns: {
          bucket_date: string
          dispute_count: number
          tx_count: number
        }[]
      }
      admin_distinct_active_users: {
        Args: { _since: string; _until?: string }
        Returns: number
      }
      admin_duplicate_ledger_entries: {
        Args: { _since: string }
        Returns: number
      }
      admin_escrow_kpis: {
        Args: never
        Returns: {
          book_currency: string
          distinct_currency_count: number
          pending_release: number
          pending_release_count: number
          released_today: number
          released_today_count: number
          released_week: number
          released_week_count: number
          total_frozen: number
          total_frozen_count: number
          total_held: number
          total_held_count: number
          total_refunded: number
          total_refunded_count: number
        }[]
      }
      admin_escrow_ledger_daily_trend: {
        Args: { _days: number }
        Returns: {
          bucket_date: string
          primary_amount: number
          secondary_amount: number
          tertiary_amount: number
        }[]
      }
      admin_escrow_records_page: {
        Args: {
          _amount_bucket?: string
          _date_range?: string
          _flag?: string
          _page?: number
          _page_size?: number
          _search?: string
          _state?: string
        }
        Returns: {
          frozen_amount: number
          held_amount: number
          last_changed_at: string
          refunded_amount: number
          released_amount: number
          total_count: number
          transaction_id: string
        }[]
      }
      admin_financial_reconciliation: {
        Args: { _only_issues?: boolean; _since?: string }
        Returns: {
          captured: number
          created_at: string
          currency: string
          difference: number
          escrowed: number
          expected_balance: number
          issues: string[]
          ledger_balance: number
          money_status: string
          payout_approved: number
          refunded: number
          released: number
          remaining: number
          status: string
          transaction_code: string
          transaction_id: string
        }[]
      }
      admin_financial_reconciliation_summary: {
        Args: { _since?: string }
        Returns: {
          mismatch: number
          pending_settlement: number
          reconciled: number
          requires_review: number
          total: number
        }[]
      }
      admin_flagged_users_count: { Args: { _since: string }; Returns: number }
      admin_flagged_users_page: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_reason?: string
          p_risk?: string
          p_search?: string
          p_sort?: string
          p_status?: string
        }
        Returns: {
          admin_flag_count: number
          auto_detected: boolean
          avatar_url: string
          blocked_payouts: number
          disputes_30d: number
          email: string
          escrow_at_risk: number
          flagged_by_admin_id: string
          full_name: string
          has_open_investigation: boolean
          identity_reason: string
          identity_rejected: boolean
          is_suspended: boolean
          last_signal_at: string
          latest_dispute_id: string
          latest_tx_code: string
          latest_tx_id: string
          phone: string
          public_user_id: string
          reason_keys: string[]
          refunds_30d: number
          reversed_payouts: number
          risk_level: string
          role: string
          score: number
          status: string
          total_count: number
          user_id: string
        }[]
      }
      admin_flagged_users_summary: {
        Args: never
        Returns: {
          auto_detected: number
          cleared_this_week: number
          critical_risk: number
          high_risk: number
          suspended: number
          today_cleared: number
          today_flagged: number
          today_suspended: number
          total_flagged: number
        }[]
      }
      admin_identity_review_health: {
        Args: { _since_avg: string; _since_spark: string }
        Returns: {
          avg_hours: number
          spark: number[]
        }[]
      }
      admin_orphan_completed_payouts: {
        Args: { _since: string }
        Returns: number
      }
      admin_payout_health: {
        Args: { _since_avg: string; _since_spark: string }
        Returns: {
          avg_hours: number
          spark: number[]
        }[]
      }
      admin_reconciliation_mismatches: {
        Args: { _since: string }
        Returns: number
      }
      admin_search_transaction_ids: {
        Args: { _limit?: number; _query: string }
        Returns: {
          transaction_id: string
        }[]
      }
      admin_users_directory_page: {
        Args: {
          _from?: number
          _role?: string
          _search?: string
          _sort?: string
          _status?: string
          _to?: number
          _verification?: string
        }
        Returns: {
          avatar_url: string
          derived_status: string
          disp_active: number
          disp_total: number
          email: string
          email_verified: boolean
          full_name: string
          has_investigation: boolean
          id_status: string
          identity_verified: boolean
          is_flagged: boolean
          is_suspended: boolean
          joined_at: string
          last_active_at: string
          phone: string
          phone_verified: boolean
          public_user_id: string
          roles: string[]
          total_count: number
          tx_count: number
          tx_resolved: number
          tx_volume: number
          user_id: string
        }[]
      }
      admin_users_directory_summary: {
        Args: never
        Returns: {
          email_verified: number
          flagged_users: number
          fully_verified: number
          id_verified: number
          new_this_month: number
          new_this_week: number
          phone_verified: number
          total_users: number
        }[]
      }
      annotate_setting_version_reason: {
        Args: {
          _reason: string
          _scope: string
          _setting_key: string
          _vendor_id: string
        }
        Returns: undefined
      }
      apply_financial_remediation_atomic: {
        Args: {
          p_actor_user_id?: string
          p_adjustment: number
          p_correlation_id?: string
          p_evidence?: Json
          p_expected_after: number
          p_expected_before: number
          p_finding_key: string
          p_reason_code: string
          p_rule_code: string
          p_transaction_id: string
        }
        Returns: Json
      }
      apply_permission_change_set: {
        Args: { _environment?: string; _id: string; _reason?: string }
        Returns: {
          after: Json
          applied_at: string | null
          applied_by: string | null
          before: Json
          created_at: string
          environment: string
          id: string
          reason: string | null
          requested_by: string | null
          requires_approval: boolean
          review_comments: Json
          status: string
          submitted_at: string | null
          target_key: string
          target_scope: string
        }
        SetofOptions: {
          from: "*"
          to: "permission_change_sets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_task: {
        Args: {
          _actor_id: string
          _agent_id: string
          _mode: string
          _reason: string
          _task_id: string
        }
        Returns: undefined
      }
      canonical_fingerprint_v1: { Args: { p: Json }; Returns: string }
      canonical_payload_v1: { Args: { p: Json }; Returns: string }
      check_admin_rate_limit: {
        Args: { _action_key: string; _admin_id: string; _max_per_hour?: number }
        Returns: {
          allowed: boolean
          cap: number
          used: number
        }[]
      }
      complete_orchestration_task: {
        Args: { _actor_id: string; _resolution: string; _task_id: string }
        Returns: undefined
      }
      complete_payout_atomic: {
        Args: {
          p_amount: number
          p_payout_id: string
          p_provider_event_id?: string
        }
        Returns: Json
      }
      complete_refund_atomic: {
        Args: { p_provider_event_id?: string; p_refund_id: string }
        Returns: Json
      }
      compute_transaction_search_tsv: {
        Args: { _tx_id: string }
        Returns: unknown
      }
      compute_verification_level: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["verification_level_type"]
      }
      count_pending_approvals_for_actor: {
        Args: { _actor: string }
        Returns: number
      }
      create_orchestration_task: {
        Args: {
          _amount: number
          _buyer_id: string
          _currency: string
          _description: string
          _dispute_id: string
          _priority: Database["public"]["Enums"]["orchestration_task_priority"]
          _queue: string
          _required_permissions: string[]
          _seller_id: string
          _source_event_key: string
          _title: string
          _transaction_id: string
          _type: Database["public"]["Enums"]["orchestration_task_type"]
        }
        Returns: string
      }
      derive_target_user_id: {
        Args: { p_dispute_id: string; p_transaction_id: string }
        Returns: string
      }
      dispute_request_more_info_atomic: {
        Args: {
          p_actor: string
          p_dispute_id: string
          p_message: string
          p_new_due_at: string
        }
        Returns: Json
      }
      effective_vendor_plan_code: {
        Args: { _user_id: string }
        Returns: string
      }
      ensure_platform_fee_reversal: {
        Args: {
          p_actor_user_id: string
          p_reference_id?: string
          p_reference_type?: string
          p_required: number
          p_transaction_id: string
        }
        Returns: number
      }
      escalate_task: {
        Args: { _actor_id: string; _reason: string; _task_id: string }
        Returns: undefined
      }
      escrow_available_balance: {
        Args: { _transaction_id: string }
        Returns: number
      }
      escrow_canonical_balance: {
        Args: { _transaction_id: string }
        Returns: number
      }
      escrow_open_commitments: {
        Args: {
          _exclude_payout_id?: string
          _exclude_refund_id?: string
          _transaction_id: string
        }
        Returns: number
      }
      escrow_uncommitted_available: {
        Args: {
          _exclude_payout_id?: string
          _exclude_refund_id?: string
          _transaction_id: string
        }
        Returns: number
      }
      expire_stale_offers: { Args: never; Returns: number }
      expire_vendor_plans: { Args: never; Returns: number }
      fail_payout_atomic: {
        Args: { p_max_retries?: number; p_payout_id: string; p_reason: string }
        Returns: Json
      }
      fail_refund_atomic: {
        Args: { p_reason: string; p_refund_id: string }
        Returns: Json
      }
      financial_acl_violations: {
        Args: never
        Returns: {
          issue: string
          routine: string
        }[]
      }
      financial_lease_ttl_seconds: { Args: never; Returns: number }
      flag_for_release_review: {
        Args: {
          p_actor_user_id: string
          p_notes?: string
          p_reason: string
          p_transaction_id: string
        }
        Returns: string
      }
      freeze_funds_atomic: {
        Args: { p_actor: string; p_reason: string; p_transaction_id: string }
        Returns: Database["public"]["Enums"]["money_status"]
      }
      generate_employee_id: { Args: never; Returns: string }
      generate_public_user_id: { Args: never; Returns: string }
      generate_transaction_code: { Args: never; Returns: string }
      get_effective_setting: {
        Args: { _key: string; _vendor_id: string }
        Returns: Json
      }
      get_effective_settings: {
        Args: { _keys: string[]; _vendor_id: string }
        Returns: {
          resolved_scope: string
          setting_key: string
          setting_value: Json
        }[]
      }
      get_effective_timeout: {
        Args: {
          _rule: Database["public"]["Enums"]["timeout_rule_type"]
          _vendor_id: string
        }
        Returns: number
      }
      get_pricing_settings_at: {
        Args: { _at: string; _vendor_id: string }
        Returns: {
          effective_from: string
          scope: string
          setting_key: string
          setting_value: Json
          version: number
        }[]
      }
      has_any_internal_role: {
        Args: { _role_keys: string[]; _user_id: string }
        Returns: boolean
      }
      has_internal_role: {
        Args: { _role_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role_type"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_job_lease: {
        Args: {
          p_job_name: string
          p_lease_token: string
          p_ttl_seconds?: number
        }
        Returns: boolean
      }
      identity_acl_violations: {
        Args: never
        Returns: {
          grantee: string
          object_kind: string
          object_name: string
          privilege: string
        }[]
      }
      internal_access_active: { Args: { _user_id: string }; Returns: boolean }
      internal_actor_rank: { Args: { _user_id: string }; Returns: number }
      internal_effective_access_level: {
        Args: { _user_id: string }
        Returns: string
      }
      internal_effective_permissions: {
        Args: { _user_id: string }
        Returns: string[]
      }
      internal_role_rank: { Args: { _role_key: string }; Returns: number }
      internal_users_mfa_status: {
        Args: never
        Returns: {
          two_factor_enabled: boolean
          user_id: string
        }[]
      }
      invalidate_old_sessions: {
        Args: { _user_id: string }
        Returns: undefined
      }
      is_finite_money: { Args: { p_amount: number }; Returns: boolean }
      is_internal_admin: { Args: { _user_id: string }; Returns: boolean }
      is_region_serviceable: {
        Args: { _city_name: string; _country_code: string; _state_name: string }
        Returns: boolean
      }
      is_transaction_party: {
        Args: { _transaction_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_region_allowed: { Args: { _user_id: string }; Returns: boolean }
      ledger_write_guarded: {
        Args: {
          p_amount: number
          p_correlation_id?: string
          p_created_by: string
          p_currency: string
          p_entry_type: Database["public"]["Enums"]["escrow_ledger_entry_type"]
          p_idempotency_key: string
          p_metadata: Json
          p_notes: string
          p_payload: Json
          p_reference_id: string
          p_reference_type: string
          p_transaction_id: string
        }
        Returns: Json
      }
      my_mfa_recovery_status: {
        Args: never
        Returns: {
          generated_at: string
          total: number
          unused: number
        }[]
      }
      orch_generate_task_code: { Args: never; Returns: string }
      raise_system_alert: {
        Args: {
          _dedupe_key: string
          _message: string
          _metadata?: Json
          _related_transaction_id?: string
          _title: string
          _type: Database["public"]["Enums"]["notification_type"]
        }
        Returns: {
          inserted_count: number
          updated_count: number
        }[]
      }
      recompute_agent_capacity: {
        Args: { _user_id: string }
        Returns: undefined
      }
      recompute_needs_admin_review: {
        Args: { p_tx_id: string }
        Returns: undefined
      }
      reconcile_all_product_reservations: {
        Args: never
        Returns: {
          new_reserved: number
          old_reserved: number
          product_id: string
        }[]
      }
      record_completion_release_intent_atomic: {
        Args: {
          p_actor: string
          p_amount: number
          p_confirmation_id: string
          p_currency: string
          p_entry_type?: Database["public"]["Enums"]["escrow_ledger_entry_type"]
          p_notes?: string
          p_payout_id: string
          p_transaction_id: string
        }
        Returns: Json
      }
      record_payment_capture_atomic: {
        Args: {
          p_payment_id: string
          p_provider_event_id: string
          p_raw_payload?: Json
        }
        Returns: Json
      }
      refresh_admin_flagged_users_mv: { Args: never; Returns: undefined }
      reject_permission_change_set:
        | {
            Args: { _id: string; _reason?: string }
            Returns: {
              after: Json
              applied_at: string | null
              applied_by: string | null
              before: Json
              created_at: string
              environment: string
              id: string
              reason: string | null
              requested_by: string | null
              requires_approval: boolean
              review_comments: Json
              status: string
              submitted_at: string | null
              target_key: string
              target_scope: string
            }
            SetofOptions: {
              from: "*"
              to: "permission_change_sets"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { _environment?: string; _id: string; _reason?: string }
            Returns: {
              after: Json
              applied_at: string | null
              applied_by: string | null
              before: Json
              created_at: string
              environment: string
              id: string
              reason: string | null
              requested_by: string | null
              requires_approval: boolean
              review_comments: Json
              status: string
              submitted_at: string | null
              target_key: string
              target_scope: string
            }
            SetofOptions: {
              from: "*"
              to: "permission_change_sets"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      release_expired_awaiting_payment: {
        Args: { _cutoff: string }
        Returns: {
          product_id: string
          qty: number
          transaction_id: string
        }[]
      }
      release_job_lease: {
        Args: { p_job_name: string; p_lease_token: string }
        Returns: boolean
      }
      release_payout_atomic: {
        Args: {
          p_actor_user_id: string
          p_notes: string
          p_payout_id: string
          p_transaction_id: string
        }
        Returns: Json
      }
      resolve_dispute_atomic: {
        Args: {
          p_acknowledge_frozen_funds?: boolean
          p_actor: string
          p_also_close_investigation?: boolean
          p_decision_summary: string
          p_dispute_id: string
          p_outcome: Database["public"]["Enums"]["dispute_outcome_type"]
          p_refund_amount: number
          p_release_amount: number
        }
        Returns: Json
      }
      resolve_system_alerts: {
        Args: { _active_keys?: string[]; _key_prefix: string }
        Returns: number
      }
      retry_payout_atomic: {
        Args: { p_actor_user_id: string; p_notes: string; p_payout_id: string }
        Returns: Json
      }
      reverse_payout_atomic: {
        Args: {
          p_amount: number
          p_payout_id: string
          p_provider_event_id?: string
          p_reason: string
        }
        Returns: Json
      }
      selftest_refund_rail: { Args: { p_currency: string }; Returns: Json }
      set_permission_template_items: {
        Args: { _keys: string[]; _template_id: string }
        Returns: {
          permission_key: string
          template_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "permission_template_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_refund_atomic: {
        Args: {
          p_actor_user_id: string
          p_amount: number
          p_notes: string
          p_reason: string
          p_transaction_id: string
        }
        Returns: string
      }
      storefront_seller_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          city_name: string
          country_code: string
          created_at: string
          default_role: Database["public"]["Enums"]["user_role_type"]
          full_name: string
          id: string
          state_name: string
          store_slug: string
        }[]
      }
      timeout_transaction_atomic: { Args: { p_tx_id: string }; Returns: Json }
      touch_internal_user_last_active: { Args: never; Returns: undefined }
      trigger_reconcile_escrow: { Args: never; Returns: number }
      unfreeze_funds_atomic: {
        Args: {
          p_actor: string
          p_reason: string
          p_target: Database["public"]["Enums"]["money_status"]
          p_transaction_id: string
        }
        Returns: Database["public"]["Enums"]["money_status"]
      }
      user_has_verified_mfa: { Args: { _user_id: string }; Returns: boolean }
      validate_dispute_transition: {
        Args: {
          new_status: Database["public"]["Enums"]["dispute_case_status"]
          old_status: Database["public"]["Enums"]["dispute_case_status"]
        }
        Returns: boolean
      }
      validate_money_transition: {
        Args: {
          _new_status: Database["public"]["Enums"]["money_status"]
          _old_status: Database["public"]["Enums"]["money_status"]
        }
        Returns: boolean
      }
      validate_transaction_transition: {
        Args: {
          _new_status: Database["public"]["Enums"]["transaction_status"]
          _old_status: Database["public"]["Enums"]["transaction_status"]
        }
        Returns: boolean
      }
      vendor_photo_slot_limit: { Args: { _user_id: string }; Returns: number }
      vendor_photo_slot_usage: { Args: { _user_id: string }; Returns: number }
      verify_reconcile_cron_secret: {
        Args: { p_secret: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_action_type:
        | "freeze_transaction"
        | "request_evidence"
        | "extend_deadline"
        | "escalate_case"
        | "refund_buyer"
        | "release_funds"
        | "close_case"
        | "flag_user"
        | "unflag_user"
        | "update_setting"
        | "add_internal_note"
        | "flag_for_review"
        | "unfreeze_transaction"
        | "open_investigation"
        | "update_investigation"
        | "export_data"
        | "resolve_dispute"
        | "suspend_user"
        | "unsuspend_user"
        | "clear_flag"
        | "add_note"
        | "toggle_auto_release"
        | "high_value_flag"
        | "set_vendor_status"
        | "user_invited"
        | "invitation_resent"
        | "user_activated"
        | "role_assigned"
        | "role_changed"
        | "permission_override_requested"
        | "permission_override_approved"
        | "permission_override_rejected"
        | "role_change_approved"
        | "role_change_rejected"
        | "user_reactivated"
        | "user_deactivated"
        | "session_revoked"
        | "task_reassigned"
        | "permission_registered"
        | "permission_updated"
        | "permission_status_changed"
        | "permission_deprecated"
        | "retry_payout"
        | "request_more_info"
        | "retry_refund"
      admin_investigation_priority: "low" | "medium" | "high" | "critical"
      admin_investigation_status:
        | "open"
        | "under_review"
        | "escalated"
        | "resolved"
        | "dismissed"
      agent_availability_status:
        | "available"
        | "active"
        | "busy"
        | "at_capacity"
        | "offline"
        | "on_leave"
        | "suspended"
      audit_action_type:
        | "profile_update"
        | "profile_suspend"
        | "profile_activate"
        | "transaction_created"
        | "transaction_cancelled"
        | "payment_received"
        | "payment_failed"
        | "payout_released"
        | "refund_processed"
        | "dispute_opened"
        | "dispute_resolved"
        | "verification_completed"
        | "system_action"
        | "dispute_response_edited"
        | "dispute_evidence_replaced"
        | "admin_freeze"
        | "admin_unfreeze"
        | "admin_flag_review"
        | "admin_escalate_dispute"
        | "admin_internal_note"
        | "admin_resolve_dispute"
      buyer_specific_offer_status:
        | "pending_claim"
        | "linked"
        | "claimed"
        | "purchased"
        | "expired"
        | "cancelled"
      delivery_confirmation_token_status:
        | "active"
        | "used"
        | "expired"
        | "revoked"
      delivery_method_type: "courier" | "pickup" | "meetup" | "hand_delivery"
      delivery_proof_type:
        | "shipping_receipt"
        | "package_photo"
        | "signature_proof"
        | "shipment_video"
        | "other"
        | "dispatch_evidence"
      delivery_update_status: "processing" | "dispatched" | "delivered"
      dispute_case_status:
        | "open"
        | "seller_response_pending"
        | "under_review"
        | "resolved"
      dispute_evidence_type:
        | "buyer_photo"
        | "buyer_video"
        | "seller_receipt"
        | "seller_tracking"
        | "seller_product_photo"
        | "supporting_document"
        | "other"
        | "seller_additional_dispute_evidence"
      dispute_outcome_type:
        | "refund_buyer"
        | "release_funds_to_seller"
        | "close_case_without_resolution"
        | "partial_refund_release"
        | "dismissed_seller_favor"
        | "dismissed_buyer_favor"
      dispute_reason_type:
        | "wrong_item_received"
        | "damaged_item_received"
        | "incomplete_order"
        | "item_not_as_described"
        | "item_not_delivered"
        | "suspected_fake_item"
        | "other"
      dispute_status:
        | "none"
        | "open"
        | "seller_response_pending"
        | "under_review"
        | "resolved"
      escrow_ledger_entry_type:
        | "payment_credit"
        | "escrow_hold"
        | "freeze_hold"
        | "payout_debit"
        | "refund_debit"
        | "fee_record"
        | "adjustment"
        | "payout_awaiting_release"
        | "dispute_refund_reserved"
        | "dispute_release_approved_pending_admin_release"
        | "dispute_no_action"
      escrow_reconciliation_status:
        | "ok"
        | "drift"
        | "missing_ledger"
        | "missing_pricing"
      escrow_state:
        | "awaiting_payment"
        | "held"
        | "frozen"
        | "releasing"
        | "released"
        | "refunded"
      file_context_type:
        | "transaction_media"
        | "delivery_proof"
        | "dispute_evidence"
        | "response_evidence"
        | "system_attachment"
        | "product_evidence"
      file_provider: "cloudinary" | "manual"
      file_resource_type: "image" | "video" | "raw" | "document"
      file_retention_category:
        | "draft_upload"
        | "transaction_media"
        | "delivery_proof"
        | "dispute_evidence"
        | "response_evidence"
        | "system_attachment"
        | "product_evidence"
      identity_submission_status:
        | "not_started"
        | "pending_review"
        | "verified"
        | "rejected"
        | "more_info_needed"
      identity_verification_method: "nin" | "government_id"
      item_condition:
        | "brand_new"
        | "like_new"
        | "excellent"
        | "good"
        | "fair"
        | "used"
      money_status:
        | "not_secured"
        | "payment_pending"
        | "funds_held_in_escrow"
        | "funds_frozen"
        | "funds_pending_release"
        | "funds_releasing"
        | "funds_released"
        | "refund_pending"
        | "refund_issued"
      notification_channel: "in_app" | "email" | "sms" | "push"
      notification_status: "pending" | "sent" | "failed" | "read"
      notification_type:
        | "transaction_update"
        | "payment_update"
        | "delivery_update"
        | "dispute_update"
        | "verification_update"
        | "security_alert"
        | "system_message"
        | "direct_message"
      orchestration_sla_status:
        | "on_track"
        | "at_risk"
        | "overdue"
        | "met"
        | "breached"
      orchestration_task_priority: "low" | "medium" | "high" | "critical"
      orchestration_task_stage:
        | "initial_review"
        | "investigation"
        | "evidence_collection"
        | "buyer_response"
        | "seller_response"
        | "evidence_review"
        | "resolution_preparation"
        | "pending_approval"
        | "final_decision"
        | "completed"
      orchestration_task_status:
        | "unassigned"
        | "assigned"
        | "in_progress"
        | "waiting_on_buyer"
        | "waiting_on_seller"
        | "waiting_on_evidence"
        | "escalated"
        | "pending_approval"
        | "resolved"
        | "closed"
        | "cancelled"
      orchestration_task_type:
        | "new_dispute_review"
        | "buyer_complaint"
        | "seller_complaint"
        | "payment_hold_review"
        | "transaction_review"
        | "evidence_review"
        | "seller_response_review"
        | "buyer_response_review"
        | "refund_request"
        | "escrow_release_review"
        | "flagged_user_review"
        | "compliance_escalation"
        | "general_investigation"
      payment_method_type: "card" | "bank_transfer" | "wallet"
      payment_provider: "paystack" | "flutterwave" | "stripe" | "manual"
      payment_status:
        | "pending"
        | "authorized"
        | "succeeded"
        | "failed"
        | "refunded"
      payout_status:
        | "awaiting_release"
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
        | "blocked"
        | "reversed"
      product_inventory_change_type:
        | "restock"
        | "reserve"
        | "release"
        | "sold"
        | "manual_adjustment"
      product_status: "draft" | "published" | "out_of_stock" | "archived"
      product_visibility_type: "public" | "buyer_specific" | "private_draft"
      profile_status: "active" | "suspended" | "blocked"
      refund_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      system_log_level: "info" | "warning" | "error" | "critical"
      timeout_rule_type:
        | "seller_fulfillment_timeout"
        | "buyer_verification_timeout"
      transaction_actor_role: "buyer" | "seller" | "admin" | "system"
      transaction_event_type:
        | "transaction_created"
        | "transaction_link_opened"
        | "buyer_joined"
        | "payment_received"
        | "agreement_locked"
        | "funds_held"
        | "seller_preparing_delivery"
        | "seller_dispatched"
        | "delivered"
        | "verification_window_opened"
        | "buyer_confirmed"
        | "dispute_opened"
        | "seller_responded"
        | "refund_issued"
        | "payout_released"
        | "auto_cancelled"
        | "auto_released"
        | "handoff_code_verified"
        | "admin_investigation_opened"
        | "admin_investigation_updated"
        | "admin_note_added"
        | "admin_funds_frozen"
        | "admin_funds_unfrozen"
        | "admin_export_generated"
        | "admin_flagged_for_review"
        | "dispute_resolved"
        | "dispute_more_info_requested"
      transaction_media_type: "image" | "video"
      transaction_party_role: "buyer" | "seller"
      transaction_status:
        | "draft"
        | "awaiting_buyer"
        | "awaiting_payment"
        | "payment_secured"
        | "seller_preparing_delivery"
        | "seller_dispatched"
        | "delivered_awaiting_verification"
        | "completed"
        | "disputed"
        | "cancelled"
        | "timed_out"
        | "resolved"
        | "refunded"
      user_role_type: "buyer" | "seller" | "admin"
      vendor_status_type: "active" | "disabled" | "suspended"
      verification_level_type:
        | "unverified"
        | "basic_verified"
        | "trusted_buyer"
        | "high_trust_buyer"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      admin_action_type: [
        "freeze_transaction",
        "request_evidence",
        "extend_deadline",
        "escalate_case",
        "refund_buyer",
        "release_funds",
        "close_case",
        "flag_user",
        "unflag_user",
        "update_setting",
        "add_internal_note",
        "flag_for_review",
        "unfreeze_transaction",
        "open_investigation",
        "update_investigation",
        "export_data",
        "resolve_dispute",
        "suspend_user",
        "unsuspend_user",
        "clear_flag",
        "add_note",
        "toggle_auto_release",
        "high_value_flag",
        "set_vendor_status",
        "user_invited",
        "invitation_resent",
        "user_activated",
        "role_assigned",
        "role_changed",
        "permission_override_requested",
        "permission_override_approved",
        "permission_override_rejected",
        "role_change_approved",
        "role_change_rejected",
        "user_reactivated",
        "user_deactivated",
        "session_revoked",
        "task_reassigned",
        "permission_registered",
        "permission_updated",
        "permission_status_changed",
        "permission_deprecated",
        "retry_payout",
        "request_more_info",
        "retry_refund",
      ],
      admin_investigation_priority: ["low", "medium", "high", "critical"],
      admin_investigation_status: [
        "open",
        "under_review",
        "escalated",
        "resolved",
        "dismissed",
      ],
      agent_availability_status: [
        "available",
        "active",
        "busy",
        "at_capacity",
        "offline",
        "on_leave",
        "suspended",
      ],
      audit_action_type: [
        "profile_update",
        "profile_suspend",
        "profile_activate",
        "transaction_created",
        "transaction_cancelled",
        "payment_received",
        "payment_failed",
        "payout_released",
        "refund_processed",
        "dispute_opened",
        "dispute_resolved",
        "verification_completed",
        "system_action",
        "dispute_response_edited",
        "dispute_evidence_replaced",
        "admin_freeze",
        "admin_unfreeze",
        "admin_flag_review",
        "admin_escalate_dispute",
        "admin_internal_note",
        "admin_resolve_dispute",
      ],
      buyer_specific_offer_status: [
        "pending_claim",
        "linked",
        "claimed",
        "purchased",
        "expired",
        "cancelled",
      ],
      delivery_confirmation_token_status: [
        "active",
        "used",
        "expired",
        "revoked",
      ],
      delivery_method_type: ["courier", "pickup", "meetup", "hand_delivery"],
      delivery_proof_type: [
        "shipping_receipt",
        "package_photo",
        "signature_proof",
        "shipment_video",
        "other",
        "dispatch_evidence",
      ],
      delivery_update_status: ["processing", "dispatched", "delivered"],
      dispute_case_status: [
        "open",
        "seller_response_pending",
        "under_review",
        "resolved",
      ],
      dispute_evidence_type: [
        "buyer_photo",
        "buyer_video",
        "seller_receipt",
        "seller_tracking",
        "seller_product_photo",
        "supporting_document",
        "other",
        "seller_additional_dispute_evidence",
      ],
      dispute_outcome_type: [
        "refund_buyer",
        "release_funds_to_seller",
        "close_case_without_resolution",
        "partial_refund_release",
        "dismissed_seller_favor",
        "dismissed_buyer_favor",
      ],
      dispute_reason_type: [
        "wrong_item_received",
        "damaged_item_received",
        "incomplete_order",
        "item_not_as_described",
        "item_not_delivered",
        "suspected_fake_item",
        "other",
      ],
      dispute_status: [
        "none",
        "open",
        "seller_response_pending",
        "under_review",
        "resolved",
      ],
      escrow_ledger_entry_type: [
        "payment_credit",
        "escrow_hold",
        "freeze_hold",
        "payout_debit",
        "refund_debit",
        "fee_record",
        "adjustment",
        "payout_awaiting_release",
        "dispute_refund_reserved",
        "dispute_release_approved_pending_admin_release",
        "dispute_no_action",
      ],
      escrow_reconciliation_status: [
        "ok",
        "drift",
        "missing_ledger",
        "missing_pricing",
      ],
      escrow_state: [
        "awaiting_payment",
        "held",
        "frozen",
        "releasing",
        "released",
        "refunded",
      ],
      file_context_type: [
        "transaction_media",
        "delivery_proof",
        "dispute_evidence",
        "response_evidence",
        "system_attachment",
        "product_evidence",
      ],
      file_provider: ["cloudinary", "manual"],
      file_resource_type: ["image", "video", "raw", "document"],
      file_retention_category: [
        "draft_upload",
        "transaction_media",
        "delivery_proof",
        "dispute_evidence",
        "response_evidence",
        "system_attachment",
        "product_evidence",
      ],
      identity_submission_status: [
        "not_started",
        "pending_review",
        "verified",
        "rejected",
        "more_info_needed",
      ],
      identity_verification_method: ["nin", "government_id"],
      item_condition: [
        "brand_new",
        "like_new",
        "excellent",
        "good",
        "fair",
        "used",
      ],
      money_status: [
        "not_secured",
        "payment_pending",
        "funds_held_in_escrow",
        "funds_frozen",
        "funds_pending_release",
        "funds_releasing",
        "funds_released",
        "refund_pending",
        "refund_issued",
      ],
      notification_channel: ["in_app", "email", "sms", "push"],
      notification_status: ["pending", "sent", "failed", "read"],
      notification_type: [
        "transaction_update",
        "payment_update",
        "delivery_update",
        "dispute_update",
        "verification_update",
        "security_alert",
        "system_message",
        "direct_message",
      ],
      orchestration_sla_status: [
        "on_track",
        "at_risk",
        "overdue",
        "met",
        "breached",
      ],
      orchestration_task_priority: ["low", "medium", "high", "critical"],
      orchestration_task_stage: [
        "initial_review",
        "investigation",
        "evidence_collection",
        "buyer_response",
        "seller_response",
        "evidence_review",
        "resolution_preparation",
        "pending_approval",
        "final_decision",
        "completed",
      ],
      orchestration_task_status: [
        "unassigned",
        "assigned",
        "in_progress",
        "waiting_on_buyer",
        "waiting_on_seller",
        "waiting_on_evidence",
        "escalated",
        "pending_approval",
        "resolved",
        "closed",
        "cancelled",
      ],
      orchestration_task_type: [
        "new_dispute_review",
        "buyer_complaint",
        "seller_complaint",
        "payment_hold_review",
        "transaction_review",
        "evidence_review",
        "seller_response_review",
        "buyer_response_review",
        "refund_request",
        "escrow_release_review",
        "flagged_user_review",
        "compliance_escalation",
        "general_investigation",
      ],
      payment_method_type: ["card", "bank_transfer", "wallet"],
      payment_provider: ["paystack", "flutterwave", "stripe", "manual"],
      payment_status: [
        "pending",
        "authorized",
        "succeeded",
        "failed",
        "refunded",
      ],
      payout_status: [
        "awaiting_release",
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "blocked",
        "reversed",
      ],
      product_inventory_change_type: [
        "restock",
        "reserve",
        "release",
        "sold",
        "manual_adjustment",
      ],
      product_status: ["draft", "published", "out_of_stock", "archived"],
      product_visibility_type: ["public", "buyer_specific", "private_draft"],
      profile_status: ["active", "suspended", "blocked"],
      refund_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      system_log_level: ["info", "warning", "error", "critical"],
      timeout_rule_type: [
        "seller_fulfillment_timeout",
        "buyer_verification_timeout",
      ],
      transaction_actor_role: ["buyer", "seller", "admin", "system"],
      transaction_event_type: [
        "transaction_created",
        "transaction_link_opened",
        "buyer_joined",
        "payment_received",
        "agreement_locked",
        "funds_held",
        "seller_preparing_delivery",
        "seller_dispatched",
        "delivered",
        "verification_window_opened",
        "buyer_confirmed",
        "dispute_opened",
        "seller_responded",
        "refund_issued",
        "payout_released",
        "auto_cancelled",
        "auto_released",
        "handoff_code_verified",
        "admin_investigation_opened",
        "admin_investigation_updated",
        "admin_note_added",
        "admin_funds_frozen",
        "admin_funds_unfrozen",
        "admin_export_generated",
        "admin_flagged_for_review",
        "dispute_resolved",
        "dispute_more_info_requested",
      ],
      transaction_media_type: ["image", "video"],
      transaction_party_role: ["buyer", "seller"],
      transaction_status: [
        "draft",
        "awaiting_buyer",
        "awaiting_payment",
        "payment_secured",
        "seller_preparing_delivery",
        "seller_dispatched",
        "delivered_awaiting_verification",
        "completed",
        "disputed",
        "cancelled",
        "timed_out",
        "resolved",
        "refunded",
      ],
      user_role_type: ["buyer", "seller", "admin"],
      vendor_status_type: ["active", "disabled", "suspended"],
      verification_level_type: [
        "unverified",
        "basic_verified",
        "trusted_buyer",
        "high_trust_buyer",
      ],
    },
  },
} as const

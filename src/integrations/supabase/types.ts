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
        ]
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
        ]
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
        ]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          currency_code?: string
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
          currency_code?: string
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
          refund_amount?: number
          release_amount?: number
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
      escrow_ledger_entries: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          entry_type: Database["public"]["Enums"]["escrow_ledger_entry_type"]
          id: string
          metadata: Json | null
          notes: string | null
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
          metadata?: Json | null
          notes?: string | null
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
          metadata?: Json | null
          notes?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_id?: string
        }
        Relationships: [
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          read_at: string | null
          related_dispute_id: string | null
          related_transaction_id: string | null
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          read_at?: string | null
          related_dispute_id?: string | null
          related_transaction_id?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          read_at?: string | null
          related_dispute_id?: string | null
          related_transaction_id?: string | null
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
        }
        Relationships: [
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
        ]
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
          currency_code?: string
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
          full_name: string
          id: string
          is_region_eligible: boolean
          last_login_at: string | null
          phone: string | null
          state_name: string | null
          status: Database["public"]["Enums"]["profile_status"]
          store_slug: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city_name?: string | null
          country_code?: string
          created_at?: string
          default_region_id?: string | null
          default_role?: Database["public"]["Enums"]["user_role_type"]
          email: string
          full_name: string
          id: string
          is_region_eligible?: boolean
          last_login_at?: string | null
          phone?: string | null
          state_name?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          store_slug?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city_name?: string | null
          country_code?: string
          created_at?: string
          default_region_id?: string | null
          default_role?: Database["public"]["Enums"]["user_role_type"]
          email?: string
          full_name?: string
          id?: string
          is_region_eligible?: boolean
          last_login_at?: string | null
          phone?: string | null
          state_name?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          store_slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_region_id_fkey"
            columns: ["default_region_id"]
            isOneToOne: false
            referencedRelation: "serviceable_regions"
            referencedColumns: ["id"]
          },
        ]
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
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      timeout_rules: {
        Row: {
          created_at: string
          hours_until_trigger: number
          id: string
          is_active: boolean
          rule_type: Database["public"]["Enums"]["timeout_rule_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          hours_until_trigger: number
          id?: string
          is_active?: boolean
          rule_type: Database["public"]["Enums"]["timeout_rule_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          hours_until_trigger?: number
          id?: string
          is_active?: boolean
          rule_type?: Database["public"]["Enums"]["timeout_rule_type"]
          updated_at?: string
        }
        Relationships: []
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
          expected_delivery_date: string
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
          expected_delivery_date: string
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
          expected_delivery_date?: string
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          payment_processing_fee_amount: number | null
          platform_fee_amount: number
          pricing_model_version: string | null
          processing_fee_amount: number
          seller_net_amount: number
          seller_payout_amount: number | null
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
          payment_processing_fee_amount?: number | null
          platform_fee_amount?: number
          pricing_model_version?: string | null
          processing_fee_amount?: number
          seller_net_amount: number
          seller_payout_amount?: number | null
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
          payment_processing_fee_amount?: number | null
          platform_fee_amount?: number
          pricing_model_version?: string | null
          processing_fee_amount?: number
          seller_net_amount?: number
          seller_payout_amount?: number | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
        ]
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
          seller_net_amount: number | null
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
    }
    Functions: {
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
      complete_payout_atomic: {
        Args: { p_amount: number; p_payout_id: string }
        Returns: Json
      }
      complete_refund_atomic: { Args: { p_refund_id: string }; Returns: Json }
      compute_verification_level: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["verification_level_type"]
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
      expire_stale_offers: { Args: never; Returns: number }
      fail_payout_atomic: {
        Args: { p_max_retries?: number; p_payout_id: string; p_reason: string }
        Returns: Json
      }
      fail_refund_atomic: {
        Args: { p_reason: string; p_refund_id: string }
        Returns: Json
      }
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
      generate_transaction_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["user_role_type"]
          _user_id: string
        }
        Returns: boolean
      }
      invalidate_old_sessions: {
        Args: { _user_id: string }
        Returns: undefined
      }
      is_transaction_party: {
        Args: { _transaction_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_region_allowed: { Args: { _user_id: string }; Returns: boolean }
      recompute_needs_admin_review: {
        Args: { p_tx_id: string }
        Returns: undefined
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
      resolve_dispute_atomic:
        | {
            Args: {
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
        | {
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
      retry_payout_atomic: {
        Args: { p_actor_user_id: string; p_notes: string; p_payout_id: string }
        Returns: Json
      }
      reverse_payout_atomic: {
        Args: { p_amount: number; p_payout_id: string; p_reason: string }
        Returns: Json
      }
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
      timeout_transaction_atomic: { Args: { p_tx_id: string }; Returns: Json }
      unfreeze_funds_atomic: {
        Args: {
          p_actor: string
          p_reason: string
          p_target: Database["public"]["Enums"]["money_status"]
          p_transaction_id: string
        }
        Returns: Database["public"]["Enums"]["money_status"]
      }
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
      admin_investigation_priority: "low" | "medium" | "high" | "critical"
      admin_investigation_status:
        | "open"
        | "under_review"
        | "escalated"
        | "resolved"
        | "dismissed"
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
      ],
      admin_investigation_priority: ["low", "medium", "high", "critical"],
      admin_investigation_status: [
        "open",
        "under_review",
        "escalated",
        "resolved",
        "dismissed",
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
      verification_level_type: [
        "unverified",
        "basic_verified",
        "trusted_buyer",
        "high_trust_buyer",
      ],
    },
  },
} as const

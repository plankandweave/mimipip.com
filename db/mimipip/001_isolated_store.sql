-- UNAPPLIED SCHEMA-COPY PROPOSAL. NO PRODUCT/CUSTOMER/ORDER ROWS ARE COPIED.

-- Read mimipip-schema-copy-review.md and dependency manifest before use.

-- Deliberately refuses execution until missing metadata and review gates are resolved.

BEGIN;


CREATE SCHEMA mimipip;

CREATE SCHEMA mimipip_private;

REVOKE ALL ON SCHEMA mimipip, mimipip_private FROM PUBLIC;

GRANT USAGE ON SCHEMA mimipip TO anon, authenticated, service_role;

GRANT USAGE ON SCHEMA mimipip_private TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mimipip REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA mimipip_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

SET LOCAL search_path = mimipip, mimipip_private, extensions, pg_temp;

SET LOCAL check_function_bodies = off;

-- Extension namespace/type metadata is a precondition, not inferred here.

CREATE TYPE "mimipip"."Channel" AS ENUM ('WHATSAPP', 'INSTAGRAM', 'EMAIL', 'WEBSITE', 'AMAZON');

CREATE TYPE "mimipip"."LeadSegment" AS ENUM ('DESIGNER', 'ARCHITECT', 'HOSPITALITY', 'RENTER', 'COMMERCIAL', 'TRADE_PARTNER', 'CONSUMER', 'UNKNOWN');

CREATE TYPE "mimipip"."LeadStatus" AS ENUM ('NEW', 'QUEUED', 'CONTACTED', 'ENGAGED', 'WON', 'LOST', 'DO_NOT_CONTACT');

CREATE TYPE "mimipip"."cart_status" AS ENUM ('open', 'ordered', 'abandoned');

CREATE TYPE "mimipip"."collection_kind" AS ENUM ('category', 'room', 'color', 'curated', 'other', 'mood', 'series', 'set');

CREATE TYPE "mimipip"."order_item_type" AS ENUM ('custom', 'fixed');

CREATE TYPE "mimipip"."order_status" AS ENUM ('pending', 'paid', 'in_production', 'printed', 'shipped', 'delivered', 'cancelled', 'refunded');

CREATE TYPE "mimipip"."payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded');

CREATE TYPE "mimipip"."print_status" AS ENUM ('pending', 'queued', 'generated', 'sent_to_rip', 'printed', 'failed');

CREATE TYPE "mimipip"."product_status" AS ENUM ('active', 'draft', 'archived');

-- Independent sequence; source current value is intentionally not copied.

CREATE SEQUENCE "mimipip"."auth_otp_requests_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- Independent sequence; source current value is intentionally not copied.

CREATE SEQUENCE "mimipip"."auth_sms_requests_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- Independent sequence; source current value is intentionally not copied.

CREATE SEQUENCE "mimipip"."print_queue_deletions_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;

-- Independent sequence; source current value is intentionally not copied.

CREATE SEQUENCE "mimipip"."search_synonyms_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "mimipip"."DoNotContact" (
  "id" text NOT NULL,
  "leadId" text,
  "email" text,
  "phone" text,
  "instagram" text,
  "reason" text NOT NULL,
  "createdAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE "mimipip"."DoNotContact" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."DoNotContact" OWNER TO "postgres";

CREATE TABLE "mimipip"."Lead" (
  "id" text NOT NULL,
  "brand" text NOT NULL,
  "name" text,
  "company" text,
  "segment" "mimipip"."LeadSegment" NOT NULL,
  "status" "mimipip"."LeadStatus" NOT NULL,
  "fitScore" double precision,
  "leadChannel" "mimipip"."Channel",
  "source" text,
  "email" text,
  "phone" text,
  "whatsapp" text,
  "instagram" text,
  "notes" text,
  "personalNotes" jsonb,
  "createdAt" timestamp(3) without time zone NOT NULL,
  "updatedAt" timestamp(3) without time zone NOT NULL
);

ALTER TABLE "mimipip"."Lead" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."Lead" OWNER TO "postgres";

CREATE TABLE "mimipip"."auth_email_codes" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "email" text NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."auth_email_codes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."auth_email_codes" OWNER TO "postgres";

CREATE TABLE "mimipip"."auth_otp_requests" (
  "id" bigint NOT NULL,
  "email" text NOT NULL,
  "ip" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."auth_otp_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."auth_otp_requests" OWNER TO "postgres";

CREATE TABLE "mimipip"."auth_sms_requests" (
  "id" bigint NOT NULL,
  "phone" text NOT NULL,
  "ip" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."auth_sms_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."auth_sms_requests" OWNER TO "postgres";

CREATE TABLE "mimipip"."board_items" (
  "id" uuid NOT NULL,
  "board_id" uuid NOT NULL,
  "product_id" uuid,
  "image_url" text NOT NULL,
  "crop_data" jsonb,
  "note" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."board_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."board_items" OWNER TO "postgres";

CREATE TABLE "mimipip"."boards" (
  "id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."boards" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."boards" OWNER TO "postgres";

CREATE TABLE "mimipip"."cart_items" (
  "id" uuid NOT NULL,
  "cart_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "material_id" uuid NOT NULL,
  "item_type" "mimipip"."order_item_type" NOT NULL,
  "width_cm" numeric(8,2),
  "height_cm" numeric(8,2),
  "area_sqft" numeric(10,3),
  "unit_price_per_sqft" numeric(10,2),
  "quantity" integer NOT NULL,
  "line_total" numeric(12,2) NOT NULL,
  "custom_image_url" text,
  "crop_data" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "preview_url" text
);

ALTER TABLE "mimipip"."cart_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."cart_items" OWNER TO "postgres";

CREATE TABLE "mimipip"."carts" (
  "id" uuid NOT NULL,
  "customer_id" uuid,
  "session_token" text,
  "status" "mimipip"."cart_status" NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "contact_email" text,
  "contact_phone" text,
  "contact_name" text
);

ALTER TABLE "mimipip"."carts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."carts" OWNER TO "postgres";

CREATE TABLE "mimipip"."character_requests" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "channel" text NOT NULL,
  "character" text NOT NULL,
  "franchise" text,
  "outcome" text NOT NULL,
  "shown_handles" text[] NOT NULL,
  "note" text
);

ALTER TABLE "mimipip"."character_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."character_requests" OWNER TO "postgres";

CREATE TABLE "mimipip"."chat_messages" (
  "id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "products" jsonb,
  "surface" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."chat_messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."chat_messages" OWNER TO "postgres";

CREATE TABLE "mimipip"."chat_sessions" (
  "session_id" uuid NOT NULL,
  "email" text NOT NULL,
  "customer_id" uuid,
  "source" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."chat_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."chat_sessions" OWNER TO "postgres";

CREATE TABLE "mimipip"."checkout_failures" (
  "id" uuid NOT NULL,
  "stage" text NOT NULL,
  "detail" text,
  "email" text,
  "order_number" bigint,
  "order_id" uuid,
  "value_inr" numeric,
  "session_token" text,
  "meta" jsonb NOT NULL,
  "alerted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."checkout_failures" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."checkout_failures" OWNER TO "postgres";

CREATE TABLE "mimipip"."collection_launches" (
  "collection_handle" text NOT NULL,
  "launch_at" timestamp with time zone NOT NULL,
  "window_days" integer NOT NULL,
  "teaser_days" integer NOT NULL,
  "hero_handles" text[] NOT NULL,
  "teaser_handles" text[] NOT NULL,
  "activated_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."collection_launches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."collection_launches" OWNER TO "postgres";

CREATE TABLE "mimipip"."collection_stories" (
  "id" uuid NOT NULL,
  "collection_handle" text NOT NULL,
  "kind" text NOT NULL,
  "title" text,
  "body" text,
  "asset_url" text,
  "poster_url" text,
  "credit" text,
  "ambient" boolean NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."collection_stories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."collection_stories" OWNER TO "postgres";

CREATE TABLE "mimipip"."collections" (
  "id" uuid NOT NULL,
  "handle" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "kind" "mimipip"."collection_kind" NOT NULL,
  "rule_tag" text,
  "image_url" text,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "is_signature" boolean NOT NULL,
  "category_scope" text,
  "parent_handle" text,
  "rule_tags" text[],
  "card_mode" text,
  "hero_product_handle" text
);

ALTER TABLE "mimipip"."collections" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."collections" OWNER TO "postgres";

CREATE TABLE "mimipip"."concept_shop_designs" (
  "concept_slug" text NOT NULL,
  "product_id" uuid NOT NULL,
  "title" text NOT NULL,
  "space" text NOT NULL,
  "reference_url" text NOT NULL,
  "sort_order" integer NOT NULL,
  "requires_preparation" boolean NOT NULL,
  "active" boolean NOT NULL
);

ALTER TABLE "mimipip"."concept_shop_designs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."concept_shop_designs" OWNER TO "postgres";

CREATE TABLE "mimipip"."concierge_events" (
  "id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "turn_id" uuid,
  "event" text NOT NULL,
  "source" text NOT NULL,
  "is_test" boolean NOT NULL,
  "status" integer,
  "duration_ms" integer,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."concierge_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."concierge_events" OWNER TO "postgres";

CREATE TABLE "mimipip"."contact_messages" (
  "id" uuid NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "message" text NOT NULL,
  "topic" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."contact_messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."contact_messages" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_accounts" (
  "id" uuid NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "email_domain" text NOT NULL,
  "rate_per_sqft" numeric(10,2) NOT NULL,
  "gst_pct" numeric(5,2) NOT NULL,
  "logo_path" text,
  "install_contact_name" text,
  "install_contact_phone" text,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "pricing_mode" text NOT NULL,
  "discount_pct" numeric(5,2) NOT NULL,
  "print_gate" text NOT NULL,
  "followup_email" text,
  "followup_active" boolean NOT NULL,
  "ref_prefix" text,
  "proposal_validity_days" integer NOT NULL,
  "approver_email" text,
  "ship_states" text[],
  "design_viewer_emails" text[],
  "legal_name" text,
  "min_order_value_inr" numeric,
  "agreement_required" text,
  "allocation_rules" text,
  "bill_cc_emails" text[],
  "agreement_doc_path" text,
  "agreement_summary_url" text,
  "agreement_signed_on" date,
  "credit_limit_inr" numeric(12,2),
  "credit_terms_days" integer,
  "channel_kind" text NOT NULL,
  "account_type" text NOT NULL,
  "credit_limit_waived" boolean NOT NULL,
  "portfolio_mode" boolean NOT NULL,
  "capabilities" jsonb,
  "domain_self_join" boolean NOT NULL,
  "shortlist_handles" jsonb NOT NULL
);

ALTER TABLE "mimipip"."corporate_accounts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_accounts" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_design_sales" (
  "order_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "customer_key" text NOT NULL,
  "area_sqft" numeric NOT NULL,
  "first_paid_at" timestamp with time zone NOT NULL,
  "order_status" text NOT NULL,
  "payment_status" text NOT NULL
);

ALTER TABLE "mimipip"."corporate_design_sales" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_design_sales" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_designs" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "title" text NOT NULL,
  "design_url" text NOT NULL,
  "design_w_px" integer,
  "design_h_px" integer,
  "status" text NOT NULL,
  "uploaded_by" text NOT NULL,
  "approved_at" timestamp with time zone,
  "approved_by_email" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "design_code" text,
  "series_name" text,
  "concept_note" text,
  "usage" text,
  "city" text,
  "focal_x" real,
  "focal_y" real,
  "focal_note" text,
  "print_type" text NOT NULL,
  "product_handle" text,
  "product_material_slug" text,
  "floor_y" real,
  "subjects" jsonb,
  "geometry_note" text,
  "geometry_measured_at" timestamp with time zone,
  "composition_style" text,
  "content_sha256" text,
  "byte_size" bigint
);

ALTER TABLE "mimipip"."corporate_designs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_designs" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_jobs" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "job_ref" text NOT NULL,
  "site" text,
  "created_at" timestamp with time zone NOT NULL,
  "closed_at" timestamp with time zone
);

ALTER TABLE "mimipip"."corporate_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_jobs" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_orders" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "order_ref" text NOT NULL,
  "placed_by_email" text NOT NULL,
  "print_name" text,
  "po_number" text,
  "design_url" text NOT NULL,
  "design_ref" text,
  "design_w_px" integer,
  "design_h_px" integer,
  "crop_data" jsonb,
  "width_mm" integer NOT NULL,
  "height_mm" integer NOT NULL,
  "area_sqft" numeric(10,3),
  "rate_per_sqft" numeric(10,2),
  "amount" numeric(12,2),
  "gst_pct" numeric(5,2),
  "gst_amount" numeric(12,2),
  "total" numeric(12,2),
  "state" text,
  "gstin" text,
  "ship_address" text,
  "ship_city" text,
  "ship_pincode" text,
  "ship_contact_name" text,
  "ship_contact_phone" text,
  "os_order_id" integer,
  "os_print_order_no" text,
  "os_page_token" text,
  "push_error" text,
  "status" text NOT NULL,
  "cancel_requested_at" timestamp with time zone,
  "repeat_of" uuid,
  "created_at" timestamp with time zone NOT NULL,
  "showroom_id" uuid,
  "showroom_name" text,
  "placement_location" text,
  "frozen_at" timestamp with time zone,
  "proposal_url" text,
  "proposal_valid_until" date,
  "list_amount" numeric(12,2),
  "discount_pct" numeric(5,2),
  "discount_amount" numeric(12,2),
  "po_url" text,
  "po_received_at" timestamp with time zone,
  "product_handle" text,
  "material_slug" text,
  "group_ref" text,
  "openings" jsonb,
  "full_area_sqft" numeric(10,3),
  "excluded_sqft" numeric(10,3) NOT NULL,
  "attention_since" timestamp with time zone,
  "attention_party" text,
  "attention_reason" text,
  "escalated_at" timestamp with time zone,
  "invoice_number" text,
  "invoice_url" text,
  "invoiced_at" timestamp with time zone,
  "tax_mode" text,
  "cgst_amount" numeric(12,2),
  "sgst_amount" numeric(12,2),
  "igst_amount" numeric(12,2),
  "place_of_supply" text,
  "label_url" text,
  "label_at" timestamp with time zone,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "payment_status" text,
  "paid_at" timestamp with time zone,
  "job_id" uuid,
  "print_type" text NOT NULL,
  "min_billable_width_mm" integer,
  "client_name" text,
  "client_ref" text,
  "client_quote_url" text,
  "client_signed_at" timestamp with time zone,
  "cancel_resolved_at" timestamp with time zone,
  "cancel_outcome" text,
  "cancel_resolved_by" text,
  "partner_confirmation_id" uuid,
  "partner_option_id" uuid,
  "wall_photo_path" text,
  "wall_photo_at" timestamp with time zone,
  "source_study_id" uuid,
  "source_study_revision" integer,
  "service_breakdown" jsonb
);

ALTER TABLE "mimipip"."corporate_orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_orders" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_showrooms" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "state" text NOT NULL,
  "city" text NOT NULL,
  "name" text NOT NULL,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."corporate_showrooms" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_showrooms" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_site_areas" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "code" text NOT NULL,
  "floor" text,
  "name" text NOT NULL,
  "sort" integer NOT NULL,
  "brief" text,
  "notes" text,
  "active" boolean NOT NULL,
  "created_by_email" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."corporate_site_areas" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_site_areas" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_site_batch_walls" (
  "id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "seq" integer NOT NULL,
  "name" text NOT NULL,
  "room" text,
  "width_mm" integer NOT NULL,
  "height_mm" integer NOT NULL,
  "photo_path" text,
  "notes" text,
  "context_json" jsonb,
  "design_ids" uuid[] NOT NULL,
  "art_json" jsonb,
  "order_refs" text[] NOT NULL,
  "status" text NOT NULL,
  "warning" text,
  "quad_json" jsonb,
  "compose_attempts" integer NOT NULL,
  "photo_error" text,
  "brief" text,
  "voice_path" text,
  "voice_seconds" integer,
  "voice_transcript" text,
  "voice_error" text,
  "voice_transcribed_at" timestamp with time zone,
  "suggested" boolean NOT NULL,
  "suggestion_reason" text,
  "turns_into_next" boolean NOT NULL
);

ALTER TABLE "mimipip"."corporate_site_batch_walls" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_site_batch_walls" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_site_batches" (
  "id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "account_id" uuid NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL,
  "series_names" text[] NOT NULL,
  "state" text,
  "ship_address" text,
  "ship_city" text,
  "notes" text,
  "source" text NOT NULL,
  "source_ref" text,
  "gps" text,
  "created_by" text,
  "allocation_json" jsonb,
  "proposed_at" timestamp with time zone,
  "approved_by_email" text,
  "approved_at" timestamp with time zone,
  "group_ref" text,
  "error" text,
  "revision" integer NOT NULL,
  "revision_note" text,
  "proposed_revision" integer,
  "email_error" text,
  "store_id" uuid,
  "released_at" timestamp with time zone,
  "released_by_email" text,
  "drive_lease_until" timestamp with time zone,
  "drive_attempts" integer NOT NULL,
  "area_id" uuid,
  "intake_files" jsonb NOT NULL,
  "entrance_in_scope" boolean NOT NULL,
  "hold_proposal" boolean NOT NULL,
  "proposal_to" text[],
  "received_from" text
);

ALTER TABLE "mimipip"."corporate_site_batches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_site_batches" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_stores" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "state" text NOT NULL,
  "city" text,
  "address_line" text,
  "pincode" text,
  "contact_name" text,
  "contact_phone" text,
  "gps" text,
  "floors" integer,
  "series_names" text[] NOT NULL,
  "notes" text,
  "active" boolean NOT NULL,
  "created_by_email" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "floor_line_pct" real
);

ALTER TABLE "mimipip"."corporate_stores" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_stores" OWNER TO "postgres";

CREATE TABLE "mimipip"."corporate_wall_studies" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "wall_id" uuid NOT NULL,
  "design_id" uuid NOT NULL,
  "quad_json" jsonb,
  "render_path" text,
  "render_error" text,
  "status" text NOT NULL,
  "approved_at" timestamp with time zone,
  "approved_by_email" text,
  "sort" integer NOT NULL,
  "note" text,
  "created_by_email" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "configuration" jsonb,
  "revision" integer NOT NULL,
  "product_handle" text,
  "material_slug" text,
  "customisation_required" boolean NOT NULL,
  "room_photo_path" text,
  "room_mids" jsonb
);

ALTER TABLE "mimipip"."corporate_wall_studies" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."corporate_wall_studies" OWNER TO "postgres";

CREATE TABLE "mimipip"."customers" (
  "id" uuid NOT NULL,
  "auth_user_id" uuid,
  "email" text,
  "name" text,
  "phone" text,
  "default_address" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "source" text,
  "marketing_opt_in" boolean NOT NULL,
  "unsubscribed_at" timestamp with time zone,
  "unsubscribe_token" uuid NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "email_bounced_at" timestamp with time zone,
  "taste_token" uuid,
  "segment" text NOT NULL,
  "company" text,
  "optin_notice_sent_at" timestamp with time zone
);

ALTER TABLE "mimipip"."customers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."customers" OWNER TO "postgres";

CREATE TABLE "mimipip"."design_commercial_policy" (
  "product_id" uuid NOT NULL,
  "exclusive_available" boolean NOT NULL,
  "premium_percent" numeric NOT NULL,
  "history_verified" boolean NOT NULL,
  "historical_orders" integer NOT NULL,
  "historical_customers" integer NOT NULL,
  "historical_area_sqft" numeric NOT NULL,
  "history_note" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."design_commercial_policy" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."design_commercial_policy" OWNER TO "postgres";

CREATE TABLE "mimipip"."design_exclusivity" (
  "product_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "project_name" text NOT NULL,
  "terms_version" text NOT NULL,
  "premium_percent" numeric NOT NULL,
  "reserved_at" timestamp with time zone NOT NULL,
  "confirmed_at" timestamp with time zone,
  "prior_orders" integer NOT NULL,
  "prior_customers" integer NOT NULL,
  "history_verified" boolean NOT NULL,
  "state" text NOT NULL,
  "payment_checked_at" timestamp with time zone
);

ALTER TABLE "mimipip"."design_exclusivity" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."design_exclusivity" OWNER TO "postgres";

CREATE TABLE "mimipip"."design_sales" (
  "order_item_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "customer_key" text NOT NULL,
  "area_sqft" numeric NOT NULL,
  "first_paid_at" timestamp with time zone NOT NULL,
  "order_status" text NOT NULL,
  "payment_status" text NOT NULL
);

ALTER TABLE "mimipip"."design_sales" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."design_sales" OWNER TO "postgres";

CREATE TABLE "mimipip"."gift_cards" (
  "id" uuid NOT NULL,
  "code" text NOT NULL,
  "initial_amount" integer NOT NULL,
  "balance" integer NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL,
  "purchaser_email" text,
  "purchaser_name" text,
  "recipient_email" text,
  "recipient_name" text,
  "message" text,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "created_at" timestamp with time zone NOT NULL,
  "activated_at" timestamp with time zone,
  "notified_at" timestamp with time zone,
  "design" text NOT NULL
);

ALTER TABLE "mimipip"."gift_cards" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."gift_cards" OWNER TO "postgres";

CREATE TABLE "mimipip"."identity_link" (
  "visitor_token" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "linked_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."identity_link" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."identity_link" OWNER TO "postgres";

CREATE TABLE "mimipip"."ink_coverage_classes" (
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "ml_per_sqm" numeric(10,3) NOT NULL,
  "position" integer NOT NULL
);

ALTER TABLE "mimipip"."ink_coverage_classes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."ink_coverage_classes" OWNER TO "postgres";

CREATE TABLE "mimipip"."installed_wall_photos" (
  "id" uuid NOT NULL,
  "os_order_id" bigint NOT NULL,
  "product_handle" text NOT NULL,
  "city" text NOT NULL,
  "installed_month" date NOT NULL,
  "r2_key" text NOT NULL,
  "url" text NOT NULL,
  "scope" text[] NOT NULL,
  "status" text NOT NULL,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "withdrawn_at" timestamp with time zone
);

ALTER TABLE "mimipip"."installed_wall_photos" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."installed_wall_photos" OWNER TO "postgres";

CREATE TABLE "mimipip"."marketing_asset_library" (
  "id" uuid NOT NULL,
  "title" text NOT NULL,
  "wallpaper" text NOT NULL,
  "product_url" text NOT NULL,
  "status" text NOT NULL,
  "format" text NOT NULL,
  "media_key" text,
  "cover_key" text,
  "media_sha256" text,
  "notes" text,
  "instagram" jsonb NOT NULL,
  "youtube" jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "width" integer,
  "height" integer,
  "duration_s" numeric(8,2),
  "language" text,
  "posts" jsonb NOT NULL,
  "removed_posts" jsonb NOT NULL,
  "version_group" uuid,
  "clearance" jsonb NOT NULL,
  "site_kind" text,
  "site_handle" text,
  "site_enabled" boolean NOT NULL,
  "site_state" text NOT NULL,
  "site_media_url" text,
  "site_poster_url" text,
  "site_captions_url" text,
  "site_captions_sha256" text,
  "site_published_at" timestamp with time zone,
  "site_error" text,
  "site_attempts" integer NOT NULL,
  "captions_key" text,
  "captions_sha256" text,
  "captions_source" text,
  "captions_error" text,
  "captions_attempts" integer NOT NULL
);

ALTER TABLE "mimipip"."marketing_asset_library" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."marketing_asset_library" OWNER TO "postgres";

CREATE TABLE "mimipip"."materials" (
  "id" uuid NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "default_price_per_sqft" numeric(10,2) NOT NULL,
  "roll_width_mm" integer,
  "icc_profile" text,
  "rip_hotfolder" text,
  "position" integer NOT NULL,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "coming_soon" boolean NOT NULL,
  "swatch_url" text,
  "texture_url" text,
  "install_type" text NOT NULL
);

ALTER TABLE "mimipip"."materials" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."materials" OWNER TO "postgres";

CREATE TABLE "mimipip"."media_reservations" (
  "id" uuid NOT NULL,
  "release_id" text NOT NULL,
  "order_no" text NOT NULL,
  "media_code" text NOT NULL,
  "source_sha256" text NOT NULL,
  "render_identity" text NOT NULL,
  "contract_version" integer NOT NULL,
  "usual_media_code" text NOT NULL,
  "opened_by" text NOT NULL,
  "opened_at" timestamp with time zone NOT NULL,
  "handed_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "closed_by" text,
  "close_reason" text,
  "restored_media_code" text,
  "closed_by_override" boolean NOT NULL
);

ALTER TABLE "mimipip"."media_reservations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."media_reservations" OWNER TO "postgres";

CREATE TABLE "mimipip"."newsletter_signups" (
  "id" uuid NOT NULL,
  "email" text NOT NULL,
  "source" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."newsletter_signups" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."newsletter_signups" OWNER TO "postgres";

CREATE TABLE "mimipip"."order_items" (
  "id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "product_id" uuid,
  "material_id" uuid,
  "product_title" text,
  "material_name" text,
  "item_type" "mimipip"."order_item_type" NOT NULL,
  "width_cm" numeric(8,2),
  "height_cm" numeric(8,2),
  "area_sqft" numeric(10,3),
  "unit_price_per_sqft" numeric(10,2),
  "quantity" integer NOT NULL,
  "line_total" numeric(12,2) NOT NULL,
  "custom_image_url" text,
  "crop_data" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "preview_url" text,
  "ink_coverage_class" text,
  "print_mode" text,
  "zvy" text
);

ALTER TABLE "mimipip"."order_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."order_items" OWNER TO "postgres";

CREATE TABLE "mimipip"."orders" (
  "id" uuid NOT NULL,
  "order_number" bigint GENERATED BY DEFAULT AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "customer_id" uuid,
  "email" text,
  "phone" text,
  "status" "mimipip"."order_status" NOT NULL,
  "payment_status" "mimipip"."payment_status" NOT NULL,
  "razorpay_order_id" text,
  "razorpay_payment_id" text,
  "razorpay_signature" text,
  "currency" text NOT NULL,
  "subtotal" numeric(12,2) NOT NULL,
  "shipping" numeric(12,2) NOT NULL,
  "tax" numeric(12,2) NOT NULL,
  "total" numeric(12,2) NOT NULL,
  "shipping_address" jsonb,
  "placed_via" text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "order_copy_url" text,
  "courier" text,
  "awb" text,
  "tracking_url" text,
  "fulfillment_type" text NOT NULL,
  "label_url" text,
  "gstin" text,
  "billing_name" text,
  "gst_invoice_number" text,
  "gst_invoice_url" text,
  "gst_invoice_at" timestamp with time zone,
  "pending_gift_code" text,
  "access_token" uuid,
  "last_notified_status" text,
  "shipping_speed" text NOT NULL,
  "review_requested_at" timestamp with time zone,
  "discount_code" text,
  "discount" numeric NOT NULL,
  "eligible_sqft" numeric(12,2),
  "contribution_rate" integer NOT NULL,
  "contribution_currency" text NOT NULL,
  "women_contribution" integer,
  "contribution_status" text NOT NULL,
  "trade_partner_id" uuid,
  "markup_total" numeric NOT NULL,
  "payment_link_id" text,
  "payment_link_url" text,
  "visitor_token" uuid,
  "cart_id" uuid,
  "zvy" text,
  "paid_at" timestamp with time zone,
  "ga_client_id" text,
  "ga_session_id" text,
  "ga_purchase_sent_at" timestamp with time zone,
  "parcel_closed_at" timestamp with time zone
);

ALTER TABLE "mimipip"."orders" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."orders" OWNER TO "postgres";

CREATE TABLE "mimipip"."partner_private_confirmations" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "status" text NOT NULL,
  "option_ids" uuid[] NOT NULL,
  "release_policy" jsonb NOT NULL,
  "package" jsonb NOT NULL,
  "shipping" jsonb NOT NULL,
  "confirmed_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "po_number" text,
  "po_path" text,
  "po_sha256" text,
  "po_mime" text,
  "po_accepted_at" timestamp with time zone,
  "po_uploaded_by" text,
  "promised_dispatch_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" text
);

ALTER TABLE "mimipip"."partner_private_confirmations" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."partner_private_confirmations" OWNER TO "postgres";

CREATE TABLE "mimipip"."partner_private_options" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "room_name" text NOT NULL,
  "wall_identifier" text NOT NULL,
  "specification" jsonb NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "supersedes_id" uuid,
  "updated_at" timestamp with time zone,
  "updated_by" text
);

ALTER TABLE "mimipip"."partner_private_options" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."partner_private_options" OWNER TO "postgres";

CREATE TABLE "mimipip"."partner_private_projects" (
  "id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "customer_id" text NOT NULL,
  "customer_name" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."partner_private_projects" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."partner_private_projects" OWNER TO "postgres";

CREATE TABLE "mimipip"."partner_release_outbox" (
  "confirmation_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "state" text NOT NULL,
  "attempts" integer NOT NULL,
  "available_at" timestamp with time zone NOT NULL,
  "lease_token" uuid,
  "lease_until" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."partner_release_outbox" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."partner_release_outbox" OWNER TO "postgres";

CREATE TABLE "mimipip"."popular_designs_cache" (
  "p_days" integer NOT NULL,
  "rank" integer NOT NULL,
  "handle" text NOT NULL,
  "score" numeric NOT NULL,
  "units" bigint NOT NULL,
  "from_sales" boolean NOT NULL,
  "refreshed_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."popular_designs_cache" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."popular_designs_cache" OWNER TO "postgres";

CREATE TABLE "mimipip"."price_tiers" (
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "exclusive" boolean NOT NULL,
  "pins_rate" boolean NOT NULL,
  "position" integer NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."price_tiers" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."price_tiers" OWNER TO "postgres";

CREATE TABLE "mimipip"."print_jobs" (
  "id" uuid NOT NULL,
  "order_item_id" uuid NOT NULL,
  "status" "mimipip"."print_status" NOT NULL,
  "print_file_url" text,
  "icc_profile" text,
  "width_cm" numeric(8,2),
  "height_cm" numeric(8,2),
  "tiles" jsonb,
  "rip_hotfolder" text,
  "error" text,
  "created_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "printed_at" timestamp with time zone
);

ALTER TABLE "mimipip"."print_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."print_jobs" OWNER TO "postgres";

CREATE TABLE "mimipip"."print_modes" (
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "throughput_sqm_per_hr" numeric(10,2) NOT NULL,
  "is_default" boolean NOT NULL,
  "note" text,
  "position" integer NOT NULL
);

ALTER TABLE "mimipip"."print_modes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."print_modes" OWNER TO "postgres";

CREATE TABLE "mimipip"."print_product_types" (
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "overlap_mm" integer NOT NULL,
  "cut_bleed_mm" numeric(4,1),
  "max_panel_mm" integer,
  "nest_across" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "media_width_mm" integer,
  "billing_trim_mm" integer NOT NULL
);

ALTER TABLE "mimipip"."print_product_types" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."print_product_types" OWNER TO "postgres";

CREATE TABLE "mimipip"."print_queue" (
  "id" uuid NOT NULL,
  "order_no" text NOT NULL,
  "panels" jsonb NOT NULL,
  "wall_width_mm" numeric,
  "wall_height_mm" numeric,
  "num_panels" integer,
  "created_at" timestamp with time zone,
  "reprint_m" real,
  "reprint_ml" real,
  "released_at" timestamp with time zone,
  "priority" integer NOT NULL,
  "media_slug" text,
  "wall" jsonb
);

ALTER TABLE "mimipip"."print_queue" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."print_queue" OWNER TO "postgres";

CREATE TABLE "mimipip"."print_queue_deletions" (
  "id" bigint NOT NULL,
  "deleted_at" timestamp with time zone NOT NULL,
  "order_no" text,
  "panels" jsonb,
  "wall_width_mm" numeric,
  "wall_height_mm" numeric,
  "num_panels" integer,
  "queued_at" timestamp with time zone,
  "db_user" text,
  "session_user_name" text,
  "app_name" text,
  "client_addr" inet,
  "backend_pid" integer,
  "stmt" text
);

ALTER TABLE "mimipip"."print_queue_deletions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."print_queue_deletions" OWNER TO "postgres";

CREATE TABLE "mimipip"."print_runs" (
  "order_no" text NOT NULL,
  "num_panels" integer NOT NULL,
  "panels" jsonb NOT NULL,
  "est_panel_min" real,
  "delivered_at" timestamp with time zone NOT NULL,
  "last_event_at" timestamp with time zone,
  "printed_at" timestamp with time zone,
  "error" text,
  "error_at" timestamp with time zone,
  "stalled_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "close_reason" text,
  "closed_by" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "id" uuid NOT NULL,
  "wall" jsonb,
  "reprint_m" double precision,
  "reprint_ml" double precision,
  "consumption_booked_at" timestamp with time zone,
  "printed_proof_at" timestamp with time zone
);

ALTER TABLE "mimipip"."print_runs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."print_runs" OWNER TO "postgres";

CREATE TABLE "mimipip"."product_categories" (
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "pricing_unit" text NOT NULL,
  "fixed_length_m" numeric(6,2),
  "min_order_qty" integer NOT NULL,
  "supports_custom_size" boolean NOT NULL,
  "supports_visualiser" boolean NOT NULL,
  "supports_materials" boolean NOT NULL,
  "supports_samples" boolean NOT NULL,
  "position" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "browse_tag" text NOT NULL,
  "collection_handle" text,
  "measurement_type" text,
  "supports_fixed_sizes" boolean NOT NULL,
  "google_product_category" text,
  "product_type" text,
  "card_label" text,
  "web_material_slug" text,
  "print_type" text
);

ALTER TABLE "mimipip"."product_categories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."product_categories" OWNER TO "postgres";

CREATE TABLE "mimipip"."product_images" (
  "id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "url" text NOT NULL,
  "alt" text,
  "position" integer NOT NULL,
  "is_featured" boolean NOT NULL,
  "is_flat" boolean NOT NULL,
  "furniture_score" numeric,
  "scene_key" text,
  "width" integer,
  "height" integer,
  "content_hash" text
);

ALTER TABLE "mimipip"."product_images" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."product_images" OWNER TO "postgres";

CREATE TABLE "mimipip"."product_materials" (
  "id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "material_id" uuid NOT NULL,
  "price_per_sqft" numeric(10,2) NOT NULL,
  "available" boolean NOT NULL
);

ALTER TABLE "mimipip"."product_materials" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."product_materials" OWNER TO "postgres";

CREATE TABLE "mimipip"."product_tags" (
  "product_id" uuid NOT NULL,
  "tag" text NOT NULL
);

ALTER TABLE "mimipip"."product_tags" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."product_tags" OWNER TO "postgres";

CREATE TABLE "mimipip"."production_jobs" (
  "id" uuid NOT NULL,
  "order_no" text NOT NULL,
  "image_id" text,
  "project_name" text,
  "so_number" text,
  "source" text,
  "customer_name" text,
  "customer_phone" text,
  "notes" text,
  "web_order_num" text,
  "wall_width_mm" numeric,
  "wall_height_mm" numeric,
  "num_panels" integer,
  "source_dpi" numeric,
  "output_dpi" numeric,
  "was_upscaled" boolean,
  "quality_warning" text,
  "panels" jsonb,
  "status" text,
  "queued_for_print" boolean,
  "error" text,
  "processed_at" timestamp with time zone,
  "sent_to_printer_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "files_expire_at" timestamp with time zone,
  "files_deleted" boolean,
  "order_reference" text,
  "printed_at" timestamp with time zone,
  "num_sheets" integer,
  "paper_m" real,
  "ink_ml" real,
  "paper_consumed" boolean,
  "created_by" text,
  "created_at" timestamp with time zone,
  "layout_panels" integer,
  "skipped_panels" jsonb,
  "media_name_printed" text,
  "media_unresolved" boolean,
  "consumed_m" real,
  "consumed_at" timestamp with time zone,
  "consumed_via" text,
  "panel_cut" text,
  "tone_correction" jsonb,
  "panel_sample" boolean NOT NULL,
  "source_sha256" text,
  "render_identity" text
);

ALTER TABLE "mimipip"."production_jobs" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."production_jobs" OWNER TO "postgres";

CREATE TABLE "mimipip"."products" (
  "id" uuid NOT NULL,
  "handle" text NOT NULL,
  "code" text,
  "title" text NOT NULL,
  "description" text,
  "status" "mimipip"."product_status" NOT NULL,
  "vendor" text,
  "print_source_url" text,
  "print_source_dpi" integer,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL,
  "image_embedding" vector(512),
  "flat_verified" boolean NOT NULL,
  "before_url" text,
  "aesthetic_rank" double precision,
  "is_signature" boolean NOT NULL,
  "is_new" boolean NOT NULL,
  "is_showroom_favourite" boolean NOT NULL,
  "is_limited" boolean NOT NULL,
  "is_founders_favourite" boolean NOT NULL,
  "founders_note" text,
  "new_until" timestamp with time zone,
  "ready_sizes" jsonb,
  "is_service" boolean NOT NULL,
  "orientation" text,
  "price_per_metre" numeric(10,2),
  "category" text NOT NULL,
  "border_height_cm" numeric(6,2),
  "supply_format" text,
  "segment_length_m" numeric(6,2),
  "is_seamless" boolean NOT NULL,
  "repeat_width_cm" numeric,
  "edition_limit" integer,
  "price_tier" text NOT NULL,
  "master_status" text NOT NULL,
  "master_built_at" timestamp with time zone,
  "search_tsv" tsvector,
  "master_claimed_at" timestamp with time zone,
  "royalty_partner" text,
  "religion" text,
  "religious_subject" text
);

ALTER TABLE "mimipip"."products" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."products" OWNER TO "postgres";

CREATE TABLE "mimipip"."retag_queue" (
  "product_id" uuid NOT NULL,
  "missing" text[] NOT NULL,
  "status" text NOT NULL,
  "attempts" integer NOT NULL,
  "error" text,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."retag_queue" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."retag_queue" OWNER TO "postgres";

CREATE TABLE "mimipip"."reviews" (
  "id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "rating" integer NOT NULL,
  "author_name" text,
  "body" text,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "verified" boolean NOT NULL,
  "order_id" uuid
);

ALTER TABLE "mimipip"."reviews" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."reviews" OWNER TO "postgres";

CREATE TABLE "mimipip"."room_exclusion_hits" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "product_id" uuid NOT NULL,
  "room_key" text NOT NULL,
  "source" text NOT NULL,
  "at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."room_exclusion_hits" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."room_exclusion_hits" OWNER TO "postgres";

CREATE TABLE "mimipip"."room_exclusions" (
  "product_id" uuid NOT NULL,
  "room_key" text NOT NULL,
  "reason" text NOT NULL,
  "decided_by" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."room_exclusions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."room_exclusions" OWNER TO "postgres";

CREATE TABLE "mimipip"."room_scenes" (
  "room_key" text NOT NULL,
  "tags" text[] NOT NULL,
  "scene_keys" text[] NOT NULL
);

ALTER TABLE "mimipip"."room_scenes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."room_scenes" OWNER TO "postgres";

CREATE TABLE "mimipip"."royalty_partners" (
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "rate" numeric NOT NULL,
  "site_url" text,
  "gstin" text,
  "payout_fund_account_id" text,
  "active" boolean NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "legal_name" text,
  "pan" text,
  "tds_rate" numeric
);

ALTER TABLE "mimipip"."royalty_partners" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."royalty_partners" OWNER TO "postgres";

CREATE TABLE "mimipip"."search_synonyms" (
  "id" integer NOT NULL,
  "cluster" text[] NOT NULL
);

ALTER TABLE "mimipip"."search_synonyms" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."search_synonyms" OWNER TO "postgres";

CREATE TABLE "mimipip"."showcase_pool_cache" (
  "handle" text NOT NULL,
  "title" text,
  "kind" text,
  "rule_tag" text,
  "n" bigint NOT NULL,
  "refreshed_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."showcase_pool_cache" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."showcase_pool_cache" OWNER TO "postgres";

CREATE TABLE "mimipip"."site_events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY (INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE) NOT NULL,
  "token" uuid,
  "event" text NOT NULL,
  "product_handle" text,
  "meta" jsonb,
  "created_at" timestamp with time zone NOT NULL,
  "is_bot" boolean,
  "ua_family" text,
  "event_key" text,
  "schema_version" integer,
  "emitted_by" text NOT NULL,
  "token_presented" boolean,
  "customer_id" uuid,
  "subject" text,
  "value_inr" numeric(12,2)
);

ALTER TABLE "mimipip"."site_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."site_events" OWNER TO "postgres";

CREATE TABLE "mimipip"."size_presets" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "width_cm" numeric(8,2) NOT NULL,
  "height_cm" numeric(8,2) NOT NULL,
  "position" integer NOT NULL,
  "active" boolean NOT NULL
);

ALTER TABLE "mimipip"."size_presets" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."size_presets" OWNER TO "postgres";

CREATE TABLE "mimipip"."taste_profiles" (
  "token" uuid NOT NULL,
  "embedding" vector(512),
  "events" integer NOT NULL,
  "seen" text[] NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."taste_profiles" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."taste_profiles" OWNER TO "postgres";

CREATE TABLE "mimipip"."trade_contacts" (
  "id" uuid NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text,
  "kind" text NOT NULL,
  "firm" text,
  "designation" text,
  "city" text,
  "website" text,
  "mobile" text,
  "email" text,
  "source" text,
  "notes" text,
  "whatsapp_opt_out_at" timestamp with time zone,
  "email_unsubscribed_at" timestamp with time zone,
  "email_bounced_at" timestamp with time zone,
  "unsubscribe_token" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."trade_contacts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."trade_contacts" OWNER TO "postgres";

CREATE TABLE "mimipip"."trade_partners" (
  "id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "status" text NOT NULL,
  "entity_type" text NOT NULL,
  "legal_name" text NOT NULL,
  "pan" text NOT NULL,
  "pan_name" text,
  "pan_verified_at" timestamp with time zone,
  "gstin" text,
  "gst_declared_none" boolean NOT NULL,
  "gstin_verified_at" timestamp with time zone,
  "entity_docs" jsonb NOT NULL,
  "bank_masked" text,
  "rzpx_contact_id" text,
  "rzpx_fund_account_id" text,
  "penny_drop_status" text,
  "penny_drop_verified_name" text,
  "logo_url" text,
  "proof_type" text,
  "proof_ref" text,
  "proof_verdict" jsonb,
  "self_billing_consent_at" timestamp with time zone,
  "tc_accepted_at" timestamp with time zone,
  "commission_pct" numeric NOT NULL,
  "markup_cap_pct" numeric NOT NULL,
  "tds_pct" numeric NOT NULL,
  "rejection_reason" text,
  "created_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."trade_partners" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."trade_partners" OWNER TO "postgres";

CREATE TABLE "mimipip"."wishlist_items" (
  "id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "product_handle" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL
);

ALTER TABLE "mimipip"."wishlist_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "mimipip"."wishlist_items" OWNER TO "postgres";

ALTER SEQUENCE "mimipip"."auth_otp_requests_id_seq" OWNED BY "mimipip"."auth_otp_requests"."id";

ALTER SEQUENCE "mimipip"."auth_sms_requests_id_seq" OWNED BY "mimipip"."auth_sms_requests"."id";

ALTER SEQUENCE "mimipip"."print_queue_deletions_id_seq" OWNED BY "mimipip"."print_queue_deletions"."id";

ALTER SEQUENCE "mimipip"."search_synonyms_id_seq" OWNED BY "mimipip"."search_synonyms"."id";

-- Functions first with body checks off; views may be referenced by function bodies.

-- All are denied default PUBLIC execute; original explicit grants handled below.

CREATE OR REPLACE FUNCTION mimipip_private.capture_corporate_design_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare p uuid;
begin
 select id into p from products where handle=new.product_handle;
 if p is null then return new; end if;
 perform 1 from products where id=any(mimipip_private.design_family(p)) order by id for update;
 if exists(select 1 from design_exclusivity where product_id=any(mimipip_private.design_family(p))) and (tg_op='INSERT' or old.product_handle is distinct from new.product_handle or (coalesce(old.payment_status,'')<>'paid' and new.payment_status='paid')) then raise exception 'This design is reserved or sold exclusively. Contact the studio.'; end if;
 if new.payment_status in ('paid','refunded') then
  insert into corporate_design_sales values(new.id,p,new.id,coalesce(new.account_id::text,lower(new.placed_by_email),new.id::text),coalesce(new.area_sqft,0),coalesce(new.paid_at,now()),new.status, new.payment_status)
   on conflict(order_item_id) do update set order_status=excluded.order_status,payment_status=excluded.payment_status;
 end if;
 update corporate_design_sales set order_status=new.status,payment_status=coalesce(new.payment_status,'unknown') where order_id=new.id;
 return new;
end $function$;

ALTER FUNCTION "mimipip_private"."capture_corporate_design_sale"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip_private.capture_design_sales()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
 if new.payment_status::text in ('paid','refunded') then
  insert into design_sales(order_item_id,product_id,order_id,customer_key,area_sqft,first_paid_at,order_status,payment_status)
   select i.id,i.product_id,new.id,coalesce(new.customer_id::text,nullif(lower(trim(new.email)),''),nullif(new.phone,''),new.id::text),coalesce(i.area_sqft,0)*i.quantity,now(),new.status::text,new.payment_status::text
   from order_items i where i.order_id=new.id and i.product_id is not null
  on conflict(order_item_id) do update set order_status=excluded.order_status,payment_status=excluded.payment_status;
 end if;
 update design_sales set order_status=new.status::text,payment_status=new.payment_status::text where order_id=new.id;
 return new;
end $function$;

ALTER FUNCTION "mimipip_private"."capture_design_sales"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip_private.confirm_design_exclusivity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
 if new.payment_status='paid' and old.payment_status is distinct from new.payment_status then
  perform 1 from products where id in(select product_id from order_items where order_id=new.id) order by id for update;
  if exists(select 1 from order_items i join design_exclusivity e on e.product_id=i.product_id where i.order_id=new.id and e.order_id<>new.id) then raise exception 'This order contains a design reserved for another project. Staff reconciliation required.'; end if;
  update design_exclusivity set state='exclusive',confirmed_at=coalesce(confirmed_at,now()) where order_id=new.id;
  update products set status='archived',updated_at=now() where id in(select product_id from design_exclusivity where order_id=new.id and state='exclusive');
 end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip_private"."confirm_design_exclusivity"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip_private.design_family(p_product uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
 select array(select id from products where id=p_product or id in (select b.product_id from product_images a join product_images b on b.url=a.url and b.is_flat where a.product_id=p_product and a.is_flat) order by id);
$function$;

ALTER FUNCTION "mimipip_private"."design_family"(p_product uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip_private.guard_design_cart()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare c record; base numeric; fee numeric; n_orders integer; n_customers integer;
begin
 perform 1 from products where id=any(mimipip_private.design_family(new.product_id)) order by id for update;
 if exists(select 1 from design_exclusivity where product_id=any(mimipip_private.design_family(new.product_id))) then raise exception 'This design is reserved or purchased exclusively. Please remove it from your cart.'; end if;
 if coalesce((new.crop_data->'exclusivity'->>'requested')::boolean,false) then
  select * into c from design_commercial_policy where product_id=new.product_id;
  if c.product_id is null or not c.exclusive_available then raise exception 'Exclusivity is not available for this design'; end if;
  if not exists(select 1 from concept_shop_designs where product_id=new.product_id and active and concept_slug=new.crop_data->'concept'->>'slug') then raise exception 'Select exclusivity through the concept builder'; end if;
  if new.crop_data->'exclusivity'->>'termsVersion' is distinct from 'future-sales-v1' or length(trim(coalesce(new.crop_data->'exclusivity'->>'projectName',''))) not between 2 and 120 then raise exception 'Name the project and accept the future-sales terms'; end if;
  select c.historical_orders+count(distinct order_id),c.historical_customers+count(distinct customer_key) into n_orders,n_customers from design_sale_history where product_id=any(mimipip_private.design_family(new.product_id));
  if (new.crop_data->'exclusivity'->>'priorOrders')::integer is distinct from n_orders or (new.crop_data->'exclusivity'->>'priorCustomers')::integer is distinct from n_customers or (new.crop_data->'exclusivity'->>'premiumPercent')::numeric is distinct from c.premium_percent then raise exception 'Sales history or exclusivity pricing changed. Refresh and review it again.'; end if;
  if not exists(select 1 from product_materials where product_id=new.product_id and material_id=new.material_id and available and price_per_sqft=new.unit_price_per_sqft) then raise exception 'Design price changed'; end if; base:=round(new.area_sqft*new.unit_price_per_sqft*new.quantity);
  fee:=round(base*c.premium_percent/100);
  new.line_total:=base+fee+coalesce((new.crop_data->'installation'->>'total')::numeric,0)+coalesce((new.crop_data->'personalisation'->>'fee')::numeric,0);
  new.crop_data:=jsonb_set(new.crop_data,'{exclusivity}',(new.crop_data->'exclusivity')||jsonb_build_object('fee',fee,'historyVerified',c.history_verified));
 elsif new.crop_data ? 'exclusivity' then
  new.crop_data:=new.crop_data-'exclusivity';
 end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip_private"."guard_design_cart"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip_private.protect_exclusive_product()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
 if new.status='active' and exists(select 1 from design_exclusivity where product_id=any(mimipip_private.design_family(new.id)) and state='exclusive') then raise exception 'This design has been purchased exclusively and cannot be relisted'; end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip_private"."protect_exclusive_product"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip_private.reserve_design_exclusivity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare c record; e record; n_orders integer; n_customers integer;
begin
 perform 1 from products where id=any(mimipip_private.design_family(new.product_id)) order by id for update;
 select * into e from design_exclusivity where product_id=any(mimipip_private.design_family(new.product_id)) and order_id<>new.order_id limit 1;
 if e.product_id is not null and e.order_id<>new.order_id then raise exception 'This design is reserved or purchased exclusively'; end if;
 if coalesce((new.crop_data->'exclusivity'->>'requested')::boolean,false) then
  select * into c from design_commercial_policy where product_id=new.product_id;
  if c.product_id is null or not c.exclusive_available then raise exception 'Exclusivity unavailable'; end if;
  if new.crop_data->'exclusivity'->>'termsVersion' is distinct from 'future-sales-v1' or length(trim(coalesce(new.crop_data->'exclusivity'->>'projectName',''))) not between 2 and 120 then raise exception 'Exclusive project and terms required'; end if;
  if exists(select 1 from order_items i join orders o on o.id=i.order_id where i.product_id=any(mimipip_private.design_family(new.product_id)) and o.id<>new.order_id and o.payment_status in ('pending','failed')) then raise exception 'Another purchase is awaiting payment. Contact Mimi Pip to arrange exclusivity.'; end if;
  if exists(select 1 from corporate_orders co join products p on p.handle=co.product_handle where p.id=any(mimipip_private.design_family(new.product_id)) and co.razorpay_order_id is not null and co.payment_status is distinct from 'paid') then raise exception 'A corporate purchase is awaiting payment. Contact the studio.'; end if; select c.historical_orders+count(distinct order_id),c.historical_customers+count(distinct customer_key) into n_orders,n_customers from design_sale_history where product_id=any(mimipip_private.design_family(new.product_id));
  if (new.crop_data->'exclusivity'->>'priorOrders')::integer is distinct from n_orders or (new.crop_data->'exclusivity'->>'priorCustomers')::integer is distinct from n_customers or (new.crop_data->'exclusivity'->>'premiumPercent')::numeric is distinct from c.premium_percent then raise exception 'Sales history changed. Review exclusivity again.'; end if;
  if new.line_total < round(new.area_sqft*new.unit_price_per_sqft*new.quantity)+round(round(new.area_sqft*new.unit_price_per_sqft*new.quantity)*c.premium_percent/100) then raise exception 'Exclusivity fee missing'; end if;
  insert into design_exclusivity(product_id,order_id,project_name,terms_version,premium_percent,prior_orders,prior_customers,history_verified)
  select member,new.order_id,new.crop_data->'exclusivity'->>'projectName','future-sales-v1',c.premium_percent,n_orders,n_customers,c.history_verified from unnest(mimipip_private.design_family(new.product_id)) member on conflict(product_id) do nothing;
 end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip_private"."reserve_design_exclusivity"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.apply_autograph_materials(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_material_id uuid;
begin
  select id into v_material_id from materials where slug=autograph_material_slug();
  if v_material_id is null then raise exception 'Autograph stock is missing'; end if;
  update product_materials set available=false where product_id=p_product_id and material_id<>v_material_id;
  insert into product_materials(product_id,material_id,price_per_sqft,available)
  values(p_product_id,v_material_id,autograph_product_rate(p_product_id),true)
  on conflict(product_id,material_id) do update
  set price_per_sqft=autograph_product_rate(p_product_id),available=true;
end $function$;

ALTER FUNCTION "mimipip"."apply_autograph_materials"(p_product_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.apply_gift_card(p_order_id uuid, p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v gift_cards; v_total numeric; v_apply integer;
begin
  select * into v from gift_cards where upper(code)=upper(btrim(p_code)) for update;
  if v.id is null or v.status<>'active' or v.balance<=0 then
    return jsonb_build_object('applied', 0, 'balance', coalesce(v.balance,0), 'valid', false);
  end if;
  select total into v_total from orders where id=p_order_id;
  if v_total is null then return jsonb_build_object('applied', 0, 'valid', false); end if;
  v_apply := least(v.balance, floor(v_total)::integer);
  update gift_cards set balance = balance - v_apply,
    status = case when balance - v_apply <= 0 then 'redeemed' else 'active' end
   where id = v.id;
  update orders set notes = coalesce(notes,'') || ' · gift ' || v.code || ' -' || v_apply
   where id = p_order_id;
  return jsonb_build_object('applied', v_apply, 'balance', v.balance - v_apply, 'valid', true);
end; $function$;

ALTER FUNCTION "mimipip"."apply_gift_card"(p_order_id uuid, p_code text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.archive_sold_out_editions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  update products p
  set status = 'archived'
  where p.id in (select oi.product_id from order_items oi where oi.order_id = new.id)
    and p.edition_limit is not null
    and p.status = 'active'
    and edition_sold(p.handle) >= p.edition_limit;
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."archive_sold_out_editions"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.assert_current_wallpaper_cart(p_session_token text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if exists(
    select 1 from carts c join cart_items ci on ci.cart_id=c.id join products p on p.id=ci.product_id
    where c.session_token=p_session_token and c.status='open' and p.category='wallpaper' and p.handle<>'bespoke-customisation'
    and not exists(select 1 from product_materials pm where pm.product_id=ci.product_id and pm.material_id=ci.material_id and pm.available and pm.price_per_sqft=ci.unit_price_per_sqft)
  ) then
    raise exception 'Wallpaper price or surface changed. Please remove the affected wallpaper from your cart and add it again to review the current price.' using errcode='check_violation';
  end if;
end $function$;

ALTER FUNCTION "mimipip"."assert_current_wallpaper_cart"(p_session_token text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.auto_subscribe(p_email text, p_source text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_email text := nullif(lower(trim(p_email)), '');
        v_source text := left(coalesce(nullif(trim(p_source), ''), 'signup'), 60);
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return;
  end if;
  perform upsert_customer(v_email, null, null, v_source);
  if email_suppressed(v_email) then return; end if;
  update customers
     set marketing_opt_in = true, updated_at = now()
   where lower(email) = v_email
     and marketing_opt_in is not true
     and unsubscribed_at is null
     and email_bounced_at is null;
  insert into newsletter_signups (email, source) values (v_email, v_source)
    on conflict (email) do nothing;
end $function$;

ALTER FUNCTION "mimipip"."auto_subscribe"(p_email text, p_source text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.autograph_material_slug()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$ select 'linen-touch'::text $function$;

ALTER FUNCTION "mimipip"."autograph_material_slug"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.autograph_product_rate(p_product_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select case when exists(select 1 from product_tags where product_id=p_product_id and tag='Stallion Spirit')
    then 300::numeric else autograph_rate() end
$function$;

ALTER FUNCTION "mimipip"."autograph_product_rate"(p_product_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.autograph_rate()
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$ select 400::numeric $function$;

ALTER FUNCTION "mimipip"."autograph_rate"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.build_search_tsv(p_product_id uuid)
 RETURNS tsvector
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select
      setweight(to_tsvector('english', coalesce(p.title, '')), 'A')
    -- The design code is a handle, not prose: index it as a whole word so a
    -- code search stays exact rather than stemming into noise.
    || setweight(to_tsvector('simple', coalesce(p.code, '')), 'A')
    || setweight(to_tsvector('english', coalesce((
         select string_agg(t.tag, ' ') from product_tags t where t.product_id = p.id
       ), '')), 'B')
    -- Descriptions are HTML; strip the tags or every design matches "p".
    || setweight(to_tsvector('english', regexp_replace(coalesce(p.description, ''), '<[^>]*>', ' ', 'g')), 'C')
    -- What the product IS. Lowest weight, so it never outranks a real match.
    || setweight(to_tsvector('english', coalesce((
         select c.title from product_categories c where c.slug = p.category
       ), '')), 'D')
  from products p
  where p.id = p_product_id;
$function$;

ALTER FUNCTION "mimipip"."build_search_tsv"(p_product_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.cart_add_item(p_session_token text, p_product_handle text, p_material_slug text, p_width_cm numeric, p_height_cm numeric, p_area_sqft numeric, p_unit_price numeric, p_quantity integer, p_line_total numeric, p_crop_data jsonb DEFAULT NULL::jsonb, p_preview_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_cart uuid; v_product products%rowtype; v_material materials%rowtype; v_item uuid;
begin
  select * into v_product from products where handle=p_product_handle;
  if not found then raise exception 'unknown product %', p_product_handle; end if;
  if v_product.status <> 'active' then raise exception 'product % not active', p_product_handle; end if;
  select * into v_material from materials where slug=p_material_slug;
  if not found then raise exception 'unknown material %', p_material_slug; end if;

  select id into v_cart from carts where session_token=p_session_token and status='open' limit 1;
  if v_cart is null then
    insert into carts (session_token, status) values (p_session_token,'open') returning id into v_cart;
  end if;

  insert into cart_items (cart_id, product_id, material_id, item_type,
    width_cm, height_cm, area_sqft, unit_price_per_sqft, quantity, line_total,
    crop_data, preview_url)
  values (v_cart, v_product.id, v_material.id, 'custom',
    p_width_cm, p_height_cm, p_area_sqft, p_unit_price, greatest(p_quantity,1), p_line_total,
    p_crop_data, p_preview_url)
  returning id into v_item;

  update carts set updated_at=now() where id=v_cart;
  return v_item;
end; $function$;

ALTER FUNCTION "mimipip"."cart_add_item"(p_session_token text, p_product_handle text, p_material_slug text, p_width_cm numeric, p_height_cm numeric, p_area_sqft numeric, p_unit_price numeric, p_quantity integer, p_line_total numeric, p_crop_data jsonb, p_preview_url text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.cart_checkout_state(p_session_token text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'cart_status', c.status,
    'has_items', exists (select 1 from cart_items ci where ci.cart_id = c.id),
    'order_number', o.order_number,
    'order_status', o.status,
    'order_payment_status', o.payment_status
  )
  from carts c
  left join lateral (
    select o2.order_number, o2.status, o2.payment_status
      from orders o2
     where o2.cart_id = c.id
     order by o2.created_at desc
     limit 1
  ) o on true
  where c.session_token = p_session_token
  order by c.updated_at desc
  limit 1;
$function$;

ALTER FUNCTION "mimipip"."cart_checkout_state"(p_session_token text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.cart_get(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_cart uuid; v_items jsonb;
begin
  select id into v_cart from carts where session_token=p_session_token and status='open' limit 1;
  if v_cart is null then return jsonb_build_object('items', '[]'::jsonb, 'subtotal', 0); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', ci.id, 'handle', p.handle, 'title', p.title,
      'material_slug', m.slug, 'material_name', m.name,
      'price_changed', (p.category='wallpaper' and p.handle<>'bespoke-customisation' and not exists(select 1 from product_materials pm where pm.product_id=ci.product_id and pm.material_id=ci.material_id and pm.available and pm.price_per_sqft=ci.unit_price_per_sqft)),
      'width_cm', ci.width_cm, 'height_cm', ci.height_cm, 'area_sqft', ci.area_sqft,
      'unit_price', ci.unit_price_per_sqft, 'quantity', ci.quantity, 'line_total', ci.line_total,
      'category', p.category,
      'category_title', c.title,
      'pricing_unit', c.pricing_unit,
      'measurement_type', c.measurement_type,
      'min_order_qty', c.min_order_qty,
      'price_per_metre', p.price_per_metre,
      'supply_format', p.supply_format,
      'segment_length_m', p.segment_length_m,
      'border_height_cm', p.border_height_cm,
      'installation', coalesce((ci.crop_data->'installation'->>'total')::numeric, 0),
      'personalisation', coalesce((ci.crop_data->'personalisation'->>'fee')::numeric, 0),
      'child_name', ci.crop_data->'personalisation'->>'childName',
      'text_overlay', ci.crop_data->'textOverlay', 'crop_data', ci.crop_data,
      'bespoke_note', ci.crop_data->'bespoke'->>'note',
      'exclusivity_fee', coalesce((ci.crop_data->'exclusivity'->>'fee')::numeric,0), 'exclusive_project', ci.crop_data->'exclusivity'->>'projectName', 'room_label', ci.crop_data->'concept'->>'roomLabel',
      'concept_slug', ci.crop_data->'concept'->>'slug',
      'requires_preparation', coalesce((ci.crop_data->'concept'->>'requiresPreparation')::boolean,false),
      'image', coalesce((select url from product_images where product_id=p.id and is_flat limit 1),ci.crop_data->'concept'->>'referenceImageUrl'),
      'preview_url', ci.preview_url
    ) order by ci.created_at), '[]'::jsonb)
  into v_items from cart_items ci
    join products p on p.id=ci.product_id
    join materials m on m.id=ci.material_id
    join product_categories c on c.slug=p.category
  where ci.cart_id=v_cart;
  return jsonb_build_object('items', v_items,
    'subtotal', coalesce((select sum(line_total) from cart_items where cart_id=v_cart),0));
end; $function$;

ALTER FUNCTION "mimipip"."cart_get"(p_session_token text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.cart_remove_item(p_session_token text, p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_cart uuid;
begin
  select id into v_cart from carts where session_token=p_session_token and status='open' limit 1;
  if v_cart is null then return; end if;
  delete from cart_items where id=p_item_id and cart_id=v_cart;
  update carts set updated_at=now() where id=v_cart;
end; $function$;

ALTER FUNCTION "mimipip"."cart_remove_item"(p_session_token text, p_item_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.cart_set_contact(p_session_token text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_name text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  update carts set
    contact_email = coalesce(nullif(trim(p_email), ''), contact_email),
    contact_phone = coalesce(nullif(trim(p_phone), ''), contact_phone),
    contact_name = coalesce(nullif(trim(p_name), ''), contact_name),
    updated_at = now()
  where session_token = p_session_token and status = 'open';
end; $function$;

ALTER FUNCTION "mimipip"."cart_set_contact"(p_session_token text, p_email text, p_phone text, p_name text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.cart_strip_installation(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_cart uuid;
begin
  select id into v_cart from carts
  where session_token = p_session_token and status = 'open'
  limit 1;
  if v_cart is null then
    return jsonb_build_object('items', '[]'::jsonb, 'subtotal', 0);
  end if;

  update cart_items ci
  set line_total = greatest(
        0,
        ci.line_total - coalesce((ci.crop_data->'installation'->>'total')::numeric, 0)
      ),
      crop_data = ci.crop_data - 'installation'
  where ci.cart_id = v_cart
    and ci.crop_data ? 'installation';

  return mimipip.cart_get(p_session_token);
end;
$function$;

ALTER FUNCTION "mimipip"."cart_strip_installation"(p_session_token text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.cart_update_qty(p_session_token text, p_item_id uuid, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_cart uuid; v_item cart_items%rowtype; v_unit text; v_ppm numeric;
begin
  select id into v_cart from carts where session_token=p_session_token and status='open' limit 1;
  if v_cart is null then raise exception 'no cart'; end if;
  select * into v_item from cart_items where id=p_item_id and cart_id=v_cart;
  if not found then raise exception 'item not in cart'; end if;

  if p_quantity < 1 then
    delete from cart_items where id=p_item_id;
  else
    select c.pricing_unit, p.price_per_metre into v_unit, v_ppm
    from products p join product_categories c on c.slug = p.category
    where p.id = v_item.product_id;

    if v_unit = 'metre' then
      -- quantity IS the metres
      update cart_items set quantity=p_quantity, line_total=round(coalesce(v_ppm,0) * p_quantity)
      where id=p_item_id;
    else
      -- Per-unit scaling preserves everything the approved line carried:
      -- chargeable-area pricing (openings excluded), installation and
      -- personalisation add-ons. area_sqft stays per-unit and untouched.
      update cart_items set quantity=p_quantity,
        line_total=round(v_item.line_total / greatest(v_item.quantity, 1) * p_quantity)
      where id=p_item_id;
    end if;
  end if;

  update carts set updated_at=now() where id=v_cart;
end; $function$;

ALTER FUNCTION "mimipip"."cart_update_qty"(p_session_token text, p_item_id uuid, p_quantity integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.category_tag_counts(p_category text)
 RETURNS TABLE(tag text, active_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select pt.tag, count(distinct pt.product_id) as active_count
  from product_tags pt
  join products p on p.id = pt.product_id
  where p.status = 'active' and p.category = p_category
  group by pt.tag;
$function$;

ALTER FUNCTION "mimipip"."category_tag_counts"(p_category text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.checkout_cart_v2(p_session_token text, p_email text, p_phone text DEFAULT NULL::text, p_shipping_address jsonb DEFAULT NULL::jsonb, p_express boolean DEFAULT false, p_discount_code text DEFAULT NULL::text, p_discount_pct numeric DEFAULT 0, p_discount_cap_pct numeric DEFAULT 50, p_discount_max_inr numeric DEFAULT NULL::numeric, p_waive_courier boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_cart uuid; v_order uuid; v_order_number bigint; v_subtotal numeric; v_wallpaper_subtotal numeric := 0;
  v_wallpaper_qty integer; v_shipping numeric := 0; v_discount numeric := 0; v_total numeric;
  v_wallpaper_sqft numeric := 0; v_courier numeric := 0;
  v_homecoming boolean := p_discount_code = 'Newly25 + Express8'
    and clock_timestamp() <= timestamptz '2026-11-08 18:29:59.999+00';
  rec record; v_item uuid; v_items jsonb := '[]'::jsonb;
begin
  perform mimipip.assert_current_wallpaper_cart(p_session_token);
  select id into v_cart from carts where session_token=p_session_token and status='open' limit 1 for update;
  if v_cart is null then raise exception 'no open cart'; end if;
  if not exists (select 1 from cart_items where cart_id=v_cart) then raise exception 'cart empty'; end if;
  if exists (
    select 1 from cart_items x join products p on p.id=x.product_id
    where x.cart_id=v_cart and p.status <> 'active'
  ) then raise exception 'a product in the cart is no longer available'; end if;

  select coalesce(sum(line_total),0), coalesce(sum(quantity),0)
    into v_subtotal, v_wallpaper_qty from cart_items where cart_id=v_cart;
  select coalesce(sum(x.area_sqft * x.quantity), 0) into v_wallpaper_sqft
    from cart_items x join products p on p.id=x.product_id
    where x.cart_id = v_cart and p.category = 'wallpaper';
  select coalesce(sum(x.line_total), 0) into v_wallpaper_subtotal
    from cart_items x join products p on p.id=x.product_id
    where x.cart_id = v_cart and p.category = 'wallpaper';

  if v_wallpaper_sqft > 0 and v_wallpaper_sqft < 20 and not (coalesce(p_waive_courier, false) or v_homecoming) then
    v_courier := 1000;
  end if;
  v_shipping := v_courier;
  if p_express and not v_homecoming then
    v_shipping := v_shipping + (v_wallpaper_qty * 1000) + 500;
  end if;

  if v_homecoming then
    v_discount := round(v_wallpaper_subtotal * 25 / 100);
  elsif p_discount_code is not null and p_discount_pct > 0 then
    v_discount := round(v_subtotal * least(p_discount_pct, coalesce(p_discount_cap_pct, 50)) / 100);
    if p_discount_max_inr is not null and p_discount_max_inr > 0 then
      v_discount := least(v_discount, round(p_discount_max_inr));
    end if;
  end if;
  v_total := v_subtotal - v_discount + v_shipping;

  insert into orders (status, payment_status, email, phone, currency, subtotal, shipping, tax, total, shipping_address, placed_via, shipping_speed, discount_code, discount, cart_id)
  values ('pending','pending', p_email, p_phone, 'INR', v_subtotal, v_shipping, 0, v_total, p_shipping_address, 'web',
          case when p_express then 'express' else 'standard' end,
          case when v_discount > 0 then p_discount_code end, v_discount, v_cart)
  returning id, order_number into v_order, v_order_number;

  for rec in
    select x.*, p.title as product_title, p.handle as product_handle, m.name as material_name, m.slug as material_slug,
           m.icc_profile as icc_profile, m.rip_hotfolder as rip_hotfolder
    from cart_items x join products p on p.id=x.product_id join materials m on m.id=x.material_id
    where x.cart_id=v_cart order by x.created_at
  loop
    insert into order_items (order_id, product_id, material_id, product_title, material_name, item_type, width_cm, height_cm, area_sqft, unit_price_per_sqft, quantity, line_total, crop_data, preview_url)
    values (v_order, rec.product_id, rec.material_id, rec.product_title, rec.material_name, 'custom', rec.width_cm, rec.height_cm, rec.area_sqft, rec.unit_price_per_sqft, rec.quantity, rec.line_total, rec.crop_data, rec.preview_url)
    returning id into v_item;
    insert into print_jobs (order_item_id, status, icc_profile, width_cm, height_cm, rip_hotfolder)
    values (v_item, 'pending', rec.icc_profile, rec.width_cm, rec.height_cm, rec.rip_hotfolder);
    v_items := v_items || jsonb_build_object(
      'order_item_id', v_item, 'product_handle', rec.product_handle, 'product_title', rec.product_title,
      'material_slug', rec.material_slug, 'material_name', rec.material_name, 'width_cm', rec.width_cm,
      'height_cm', rec.height_cm, 'area_sqft', rec.area_sqft, 'unit_price', rec.unit_price_per_sqft,
      'quantity', rec.quantity, 'line_total', rec.line_total, 'crop_data', rec.crop_data, 'preview_url', rec.preview_url);
  end loop;

  update carts set status='ordered', updated_at=now() where id=v_cart;
  return jsonb_build_object('order_id', v_order, 'order_number', v_order_number, 'subtotal', v_subtotal,
    'shipping', v_shipping, 'courier', v_courier, 'discount', v_discount,
    'discount_code', case when v_discount > 0 then p_discount_code end, 'total', v_total,
    'express', p_express, 'wallpaper_qty', v_wallpaper_qty, 'items', v_items);
end; $function$;

ALTER FUNCTION "mimipip"."checkout_cart_v2"(p_session_token text, p_email text, p_phone text, p_shipping_address jsonb, p_express boolean, p_discount_code text, p_discount_pct numeric, p_discount_cap_pct numeric, p_discount_max_inr numeric, p_waive_courier boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.claim_order_notification(p_order_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare updated int;
begin
  update orders set last_notified_status = p_status
   where id = p_order_id and coalesce(last_notified_status,'') <> p_status;
  get diagnostics updated = row_count;
  return updated > 0;
end; $function$;

ALTER FUNCTION "mimipip"."claim_order_notification"(p_order_id uuid, p_status text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.collection_facets_v2(p_base_tags text[], p_category text)
 RETURNS TABLE(tag text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select t.tag, count(distinct t.product_id)
  from product_tags t
  where t.product_id in (
    select p.id from products p
    where p.status = 'active'
      and (p_category is null or p.category = p_category)
      and (
        p_base_tags is null or array_length(p_base_tags, 1) is null
        or exists (select 1 from product_tags b where b.product_id = p.id and b.tag = any(p_base_tags))
      )
  )
  group by t.tag;
$function$;

ALTER FUNCTION "mimipip"."collection_facets_v2"(p_base_tags text[], p_category text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.collection_flag_counts_v2(p_base_tags text[], p_category text)
 RETURNS TABLE(signature bigint, new bigint, child bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select
    count(*) filter (where p.is_signature) as signature,
    count(*) filter (where p.is_new) as new,
    count(*) filter (where exists (
      select 1 from product_tags c where c.product_id = p.id and c.tag = 'Child-Safe'
    )) as child
  from products p
  where p.status = 'active'
    and (p_category is null or p.category = p_category)
    and (
      p_base_tags is null or array_length(p_base_tags, 1) is null
      or exists (select 1 from product_tags b where b.product_id = p.id and b.tag = any(p_base_tags))
    );
$function$;

ALTER FUNCTION "mimipip"."collection_flag_counts_v2"(p_base_tags text[], p_category text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.collection_page_v2(p_base_tags text[], p_category text, p_filter_tags text[], p_signature boolean, p_new boolean, p_sort text, p_limit integer, p_offset integer, p_room_key text DEFAULT NULL::text, p_rendered_only boolean DEFAULT true)
 RETURNS TABLE(handle text, total bigint, has_scene boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  with matched as (
    select p.id, p.handle, p.aesthetic_rank, p.created_at,
      (p_room_key is not null and exists (
        select 1 from product_images i
        where i.product_id = p.id and i.scene_key = p_room_key
      )) as has_scene
    from products p
    where p.status = 'active' and p.is_service = false
      and (p_category is null or p.category = p_category)
      and (
        (p.category = 'border' and p_room_key is null)
        or not coalesce(p_rendered_only, true)
        or exists (
          select 1 from product_images i
          where i.product_id = p.id
            and i.is_flat = false
            and (p_room_key is null or i.scene_key = p_room_key)
        )
      )
      and (
        p_base_tags is null or array_length(p_base_tags, 1) is null
        or exists (select 1 from product_tags b where b.product_id = p.id and b.tag = any(p_base_tags))
      )
      and (
        p_filter_tags is null or array_length(p_filter_tags, 1) is null
        or (select count(distinct t.tag) from product_tags t
            where t.product_id = p.id and t.tag = any(p_filter_tags)) = array_length(p_filter_tags, 1)
      )
      and (not coalesce(p_signature, false) or p.is_signature)
      and (not coalesce(p_new, false) or p.is_new)
  )
  select m.handle, count(*) over() as total, m.has_scene
  from matched m
  order by
    (case when p_room_key is not null then (m.has_scene = false) end) asc nulls last,
    (case when p_sort = 'newest' then m.created_at end) desc nulls last,
    m.aesthetic_rank asc nulls last,
    m.created_at desc,
    m.handle asc
  limit p_limit offset p_offset;
$function$;

ALTER FUNCTION "mimipip"."collection_page_v2"(p_base_tags text[], p_category text, p_filter_tags text[], p_signature boolean, p_new boolean, p_sort text, p_limit integer, p_offset integer, p_room_key text, p_rendered_only boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.compute_order_contribution(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_sqft numeric;
  v_amt  integer;
  v_rate integer;
begin
  select coalesce(contribution_rate, 1) into v_rate from orders where id = p_order_id;
  v_rate := coalesce(v_rate, 1);

  select
    coalesce(sum(area_sqft * quantity), 0),
    coalesce(sum(round(area_sqft * quantity * v_rate)), 0)
  into v_sqft, v_amt
  from order_items
  where order_id = p_order_id and area_sqft > 0;

  update orders
  set eligible_sqft      = v_sqft,
      women_contribution = v_amt,
      contribution_status = case
        when contribution_status in ('allocated','reported','included_in_period_report')
          then contribution_status
        else 'calculated'
      end
  where id = p_order_id;
end;
$function$;

ALTER FUNCTION "mimipip"."compute_order_contribution"(p_order_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.concierge_cancel_order(p_order_number bigint, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare o orders;
begin
  if p_order_number is null or p_email is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into o from orders
   where order_number = p_order_number and lower(email) = lower(btrim(p_email))
   for update;
  if o.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'reason', 'already_cancelled', 'order_number', o.order_number);
  end if;
  if o.status not in ('pending','paid') then
    return jsonb_build_object('ok', false, 'reason', 'in_production', 'order_number', o.order_number);
  end if;
  if mimipip.retail_order_at_printer(o.id) then
    return jsonb_build_object('ok', false, 'reason', 'at_printer', 'order_number', o.order_number);
  end if;
  if o.created_at <= now() - interval '12 hours' then
    return jsonb_build_object('ok', false, 'reason', 'window_closed', 'order_number', o.order_number);
  end if;
  update orders set status='cancelled',
    payment_status = case when payment_status='paid' then 'refunded' else payment_status end,
    updated_at=now()
   where id=o.id;
  return jsonb_build_object('ok', true, 'order_id', o.id, 'order_number', o.order_number,
    'was_paid', o.payment_status='paid', 'razorpay_payment_id', o.razorpay_payment_id);
end; $function$;

ALTER FUNCTION "mimipip"."concierge_cancel_order"(p_order_number bigint, p_email text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.concierge_link_session(p_session uuid, p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_email text := nullif(lower(trim(p_email)), '');
begin
  if p_session is null or v_email is null or length(v_email) > 254
     or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return false;
  end if;
  insert into chat_sessions (session_id, email, customer_id, source)
  values (p_session, v_email, (select id from customers where lower(email) = v_email limit 1), 'concierge:account')
  on conflict (session_id) do update
    set email = excluded.email, customer_id = excluded.customer_id, updated_at = now();
  return true;
end $function$;

ALTER FUNCTION "mimipip"."concierge_link_session"(p_session uuid, p_email text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.concierge_order_status(p_order_number bigint, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare o orders; v_items jsonb;
begin
  if p_order_number is null or p_email is null then return jsonb_build_object('found', false); end if;
  select * into o from orders
   where order_number = p_order_number and lower(email) = lower(btrim(p_email));
  if o.id is null then return jsonb_build_object('found', false); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'title', oi.product_title, 'material', oi.material_name,
      'width_cm', oi.width_cm, 'height_cm', oi.height_cm, 'quantity', oi.quantity
    ) order by oi.created_at), '[]'::jsonb)
  into v_items from order_items oi where oi.order_id = o.id;

  return jsonb_build_object(
    'found', true,
    'order_number', o.order_number,
    'status', o.status,
    'payment_status', o.payment_status,
    'placed_via', o.placed_via,
    'created_at', o.created_at,
    'shipping_speed', o.shipping_speed,
    'city', o.shipping_address->>'city',
    'total', o.total,
    'courier', o.courier, 'awb', o.awb, 'tracking_url', o.tracking_url,
    'gst_invoice_url', o.gst_invoice_url, 'order_copy_url', o.order_copy_url,
    'cancellable', (o.status in ('pending','paid') and o.created_at > now() - interval '12 hours'
                    and not mimipip.retail_order_at_printer(o.id)),
    'items', v_items
  );
end; $function$;

ALTER FUNCTION "mimipip"."concierge_order_status"(p_order_number bigint, p_email text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.corporate_accounts_apply_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if new.account_type = 'corporate' then
    new.pricing_mode := 'flat_rate';
    new.discount_pct := 0;
    new.print_gate   := 'credit';
  elsif new.account_type = 'commercial' then
    new.pricing_mode := 'website';
    new.discount_pct := 0;
    new.print_gate   := 'payment_first';
  elsif new.account_type = 'online' then
    new.pricing_mode := 'website';
    new.discount_pct := 40;
    new.print_gate   := 'credit';
  elsif new.account_type = 'offline' then
    -- The furnishings trade: 40 off.
    new.pricing_mode := 'website';
    new.discount_pct := 40;
    new.print_gate   := 'payment_first';
  elsif new.account_type = 'furniture' then
    -- A furniture store coming into wallpaper: 30 off.
    new.pricing_mode := 'website';
    new.discount_pct := 30;
    new.print_gate   := 'payment_first';
  else -- aid, builder: identical terms
    new.pricing_mode := 'website';
    new.discount_pct := 25;
    new.print_gate   := 'payment_first';
  end if;
  new.channel_kind := case when new.account_type = 'online' then 'online' else 'offline' end;
  if new.print_gate = 'credit' and not new.credit_limit_waived then
    new.credit_limit_inr  := coalesce(new.credit_limit_inr, 200000);
    new.credit_terms_days := coalesce(new.credit_terms_days, 30);
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."corporate_accounts_apply_type"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.corporate_designs_vs_auto_approve() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'mimipip', 'pg_temp' AS $mimi$ BEGIN RETURN NEW; END $mimi$;

ALTER FUNCTION "mimipip"."corporate_designs_vs_auto_approve"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.curated_collection_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if new.kind::text = 'curated'
     and (new.category_scope is null or new.category_scope = 'wallpaper') then
    update mimipip.product_materials pm set price_per_sqft = 236
    where pm.price_per_sqft < 236 and exists (
      select 1 from mimipip.products p join mimipip.product_tags pt
      on pt.product_id = p.id
      where p.id = pm.product_id and p.category = 'wallpaper'
      and pt.tag = any(case when cardinality(new.rule_tags) > 0
                      then new.rule_tags else array[new.rule_tag] end));
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."curated_collection_rate_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.curated_material_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare minimum_rate numeric := 236;
begin
 if exists(select 1 from mimipip.products p where p.id=new.product_id and p.handle in (
 'beyond-the-blue-willow-canal','beyond-the-blue-willow-canal-repeat','beyond-the-blue-windmill-meadows','beyond-the-blue-windmill-meadows-repeat','beyond-the-blue-lakeside-chateau','beyond-the-blue-lakeside-chateau-repeat','beyond-the-blue-woodland-stream','beyond-the-blue-woodland-stream-repeat','beyond-the-blue-orchard-pavilion','beyond-the-blue-orchard-pavilion-repeat','beyond-the-blue-harbour-sails','beyond-the-blue-harbour-sails-repeat','beyond-the-blue-heron-wetlands','beyond-the-blue-heron-wetlands-repeat','beyond-the-blue-tulip-country','beyond-the-blue-tulip-country-repeat','beyond-the-blue-mountain-lake','beyond-the-blue-mountain-lake-repeat','beyond-the-blue-italian-terrace','beyond-the-blue-italian-terrace-repeat','beyond-the-blue-moonlit-river','beyond-the-blue-moonlit-river-repeat')) then minimum_rate := 200; end if;
 if (new.price_per_sqft is null or new.price_per_sqft < minimum_rate) and mimipip.is_curated_wallpaper(new.product_id) then new.price_per_sqft := minimum_rate; end if;
 return new;
end; $function$;

ALTER FUNCTION "mimipip"."curated_material_rate_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.curated_product_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if mimipip.is_curated_wallpaper(new.id) then
    update mimipip.product_materials set price_per_sqft = 236
    where product_id = new.id and price_per_sqft < 236;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."curated_product_rate_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.curated_tag_rate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if mimipip.is_curated_wallpaper(new.product_id) then
    update mimipip.product_materials set price_per_sqft = 236
    where product_id = new.product_id and price_per_sqft < 236;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."curated_tag_rate_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.debut_rank_band()
 RETURNS TABLE(lo double precision, hi double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select
    coalesce(percentile_cont(0.20) within group (order by aesthetic_rank), 0)::double precision,
    coalesce(percentile_cont(0.30) within group (order by aesthetic_rank), 1)::double precision
  from products
  where aesthetic_rank is not null
$function$;

ALTER FUNCTION "mimipip"."debut_rank_band"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.deity_free_room(p_room_key text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select p_room_key in ('nursery','toddler','kids','playschool','teen','bedroom','dining','kitchen')
$function$;

ALTER FUNCTION "mimipip"."deity_free_room"(p_room_key text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.derive_child_safe_tag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  insert into product_tags (product_id, tag)
  select new.product_id, 'Child-Safe'
  where not exists (
    select 1 from product_tags t where t.product_id = new.product_id and t.tag = 'Child-Safe'
  );
  return new;
end; $function$;

ALTER FUNCTION "mimipip"."derive_child_safe_tag"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.edition_sold(p_handle text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select coalesce(sum(oi.quantity), 0)::int
  from order_items oi
  join orders o on o.id = oi.order_id
  join products p on p.id = oi.product_id
  where p.handle = p_handle
    and o.status in ('paid','in_production','printed','shipped','delivered');
$function$;

ALTER FUNCTION "mimipip"."edition_sold"(p_handle text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.email_suppressed(p_email text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select exists (
           select 1 from customers c
            where lower(c.email) = lower(trim(p_email))
              and (c.unsubscribed_at is not null or c.email_bounced_at is not null))
      or exists (
           select 1 from "DoNotContact" d
            where d.email is not null and lower(trim(d.email)) = lower(trim(p_email)))
      or exists (
           select 1 from trade_contacts t
            where t.email is not null and lower(t.email) = lower(trim(p_email))
              and (t.email_unsubscribed_at is not null or t.email_bounced_at is not null));
$function$;

ALTER FUNCTION "mimipip"."email_suppressed"(p_email text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.enforce_canvas_wall_art_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  cat product_categories%rowtype;
  bad_material_count integer;
  web_medium_count integer;
begin
  if NEW.status <> 'active' then
    return NEW;
  end if;

  select * into cat from product_categories where slug = NEW.category;
  if not found or cat.web_material_slug is null then
    return NEW;  -- not a single-web-medium category; other rules apply
  end if;

  if NEW.orientation is null then
    raise exception
      '% product % cannot be active without an orientation (vertical/horizontal)', cat.title, NEW.handle
      using errcode = 'check_violation';
  end if;

  -- The declared web medium must actually be orderable, or the product page
  -- has nothing to sell.
  select count(*) into web_medium_count
  from product_materials pm
  join materials m on m.id = pm.material_id
  where pm.product_id = NEW.id and pm.available and m.slug = cat.web_material_slug;

  if web_medium_count = 0 then
    raise exception
      '% product % must have % available to be active', cat.title, NEW.handle, cat.web_material_slug
      using errcode = 'check_violation';
  end if;

  -- Anything beyond the wall-art pair (web medium + the FBA self-adhesive
  -- medium) is a wallpaper stock that must not ride along on a canvas.
  select count(*) into bad_material_count
  from product_materials pm
  join materials m on m.id = pm.material_id
  where pm.product_id = NEW.id and pm.available
    and m.slug not in (cat.web_material_slug, 'self-adhesive-vinyl');

  if bad_material_count > 0 then
    raise exception
      '% product % can only offer % (web) or self-adhesive-vinyl (Amazon FBA)', cat.title, NEW.handle, cat.web_material_slug
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$function$;

ALTER FUNCTION "mimipip"."enforce_canvas_wall_art_rules"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.enforce_category_min_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_min integer;
  v_title text;
begin
  select c.min_order_qty, c.title into v_min, v_title
  from products p join product_categories c on c.slug = p.category
  where p.id = NEW.product_id;

  if v_min is not null and v_min > 1 and NEW.quantity < v_min then
    raise exception
      'This % has a minimum order of %', lower(v_title), v_min
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$function$;

ALTER FUNCTION "mimipip"."enforce_category_min_order"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.enforce_flat_image()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if NEW.status = 'active'
     and exists (select 1 from product_images where product_id = NEW.id)
  then
    if not exists (select 1 from product_images where product_id = NEW.id and is_flat) then
      raise exception
        'Product % cannot be active without a flat (is_flat) pattern image', NEW.handle
        using errcode = 'check_violation';
    end if;
    if not NEW.flat_verified then
      raise exception
        'Product % cannot be active until its flat image is verified (set flat_verified = true after confirming a clean, furniture-free pattern image)', NEW.handle
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$function$;

ALTER FUNCTION "mimipip"."enforce_flat_image"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.enforce_one_wallpaper_finish()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_handle text; v_n int;
begin
  select p.handle into v_handle from products p
   where p.id = new.product_id and p.category = 'wallpaper' and p.handle <> 'custom-wallpaper';
  if v_handle is null then return null; end if;
  select count(*) into v_n from product_materials pm join materials m on m.id = pm.material_id
   where pm.product_id = new.product_id and pm.available and m.slug in ('smooth-matt', 'linen-touch');
  if v_n > 1 then
    raise exception 'Wallpaper % is sold on ONE finish: switch Soft Matte or Linen Textured off before the other goes on', v_handle
      using errcode = 'check_violation';
  end if;
  return null;
end $function$;

ALTER FUNCTION "mimipip"."enforce_one_wallpaper_finish"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.enforce_product_category_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  cat product_categories%rowtype;
  bad_material_count integer;
begin
  if NEW.status <> 'active' then
    return NEW;
  end if;

  select * into cat from product_categories where slug = NEW.category;
  if not found then
    raise exception 'Product % has unknown category %', NEW.handle, NEW.category
      using errcode = 'check_violation';
  end if;

  if cat.pricing_unit = 'metre' and coalesce(NEW.price_per_metre, 0) <= 0 then
    raise exception
      '% product % cannot be active without a per-metre price', cat.title, NEW.handle
      using errcode = 'check_violation';
  end if;

  if cat.pricing_unit <> 'metre' and NEW.price_per_metre is not null then
    raise exception
      'Product % is in % (not sold by the metre) and must not carry a per-metre price', NEW.handle, cat.title
      using errcode = 'check_violation';
  end if;

  if cat.measurement_type = 'length' then
    if NEW.supply_format is null then
      raise exception
        '% product % must declare its supply format (continuous or segmented)', cat.title, NEW.handle
        using errcode = 'check_violation';
    end if;
    if NEW.supply_format = 'segmented' and coalesce(NEW.segment_length_m, 0) <= 0 then
      raise exception
        '% product % is supplied in pieces and must declare the length of one piece', cat.title, NEW.handle
        using errcode = 'check_violation';
    end if;
    if coalesce(NEW.border_height_cm, 0) <= 0 then
      raise exception
        '% product % must declare its height in cm', cat.title, NEW.handle
        using errcode = 'check_violation';
    end if;
  end if;

  if cat.supports_fixed_sizes then
    if NEW.ready_sizes is null or jsonb_array_length(NEW.ready_sizes) = 0 then
      raise exception
        '% product % cannot be active without its fixed sizes', cat.title, NEW.handle
        using errcode = 'check_violation';
    end if;
  elsif not cat.supports_custom_size and NEW.ready_sizes is not null then
    raise exception
      '% product % cannot carry a size ladder', cat.title, NEW.handle
      using errcode = 'check_violation';
  end if;

  if not cat.supports_materials then
    select count(*) into bad_material_count
    from product_materials pm
    where pm.product_id = NEW.id and pm.available;
    if bad_material_count > 0 then
      raise exception
        '% product % cannot offer a material', cat.title, NEW.handle
        using errcode = 'check_violation';
    end if;
  end if;

  if NEW.category <> 'wallpaper' then
    if not exists (
      select 1 from product_tags t where t.product_id = NEW.id and t.tag = cat.browse_tag
    ) then
      raise exception
        '% product % must carry the "%" tag', cat.title, NEW.handle, cat.browse_tag
        using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$function$;

ALTER FUNCTION "mimipip"."enforce_product_category_rules"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.enforce_taash_book_cart_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_book_product uuid;
  v_book_material uuid;
begin
  select id into v_book_product from products where handle = 'taash-keepsake-book';
  if new.product_id is distinct from v_book_product then
    return new;
  end if;

  select id into v_book_material from materials where slug = 'taash-book';
  if new.material_id is distinct from v_book_material then
    raise exception 'TAASH book must use the printed-book order line';
  end if;

  new.width_cm := 24.5;
  new.height_cm := 34.3;
  new.area_sqft := 0;
  new.unit_price_per_sqft := 4950;
  new.quantity := greatest(coalesce(new.quantity, 1), 1);
  new.line_total := 4950 * new.quantity;
  new.crop_data := coalesce(new.crop_data, '{}'::jsonb) || jsonb_build_object(
    'preorder', jsonb_build_object(
      'product', 'TAASH coffee-table book',
      'edition', 'First edition',
      'status', 'pre-order'
    )
  );
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."enforce_taash_book_cart_price"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.enrol_verified_email(p_source text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_uid   uuid := auth.uid();
        v_email text;
begin
  if v_uid is null then return; end if;
  select lower(email) into v_email from customers where auth_user_id = v_uid;
  if v_email is null then return; end if;
  perform auto_subscribe(v_email, coalesce('login:' || p_source, 'login'));
end $function$;

ALTER FUNCTION "mimipip"."enrol_verified_email"(p_source text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.flag_new_on_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if NEW.status = 'active' and (TG_OP = 'INSERT' or OLD.status is distinct from 'active') then
    NEW.is_new := true;
    NEW.new_until := now() + interval '30 days';
  end if;
  return NEW;
end;
$function$;

ALTER FUNCTION "mimipip"."flag_new_on_publish"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.generate_design_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT;
BEGIN
  LOOP
    result := 'ZYVS-';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * 32 + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM corporate_designs WHERE design_code = result);
  END LOOP;
  RETURN result;
END;
$function$;

ALTER FUNCTION "mimipip"."generate_design_code"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.get_order_for_invoice(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_order jsonb; v_items jsonb;
begin
  select to_jsonb(o) - 'razorpay_signature' into v_order from orders o where o.id = p_order_id;
  if v_order is null then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_title', oi.product_title, 'material_name', oi.material_name,
      'quantity', oi.quantity, 'area_sqft', oi.area_sqft,
      'line_total', oi.line_total, 'crop_data', oi.crop_data,
      'preview_url', oi.preview_url,
      'product_handle', p.handle
    ) order by oi.created_at), '[]'::jsonb)
  into v_items
  from order_items oi
  left join products p on p.id = oi.product_id
  where oi.order_id = p_order_id;
  return jsonb_build_object('order', v_order, 'items', v_items);
end; $function$;

ALTER FUNCTION "mimipip"."get_order_for_invoice"(p_order_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.gift_card_status(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v gift_cards;
begin
  select * into v from gift_cards where upper(code)=upper(btrim(p_code));
  if v.id is null then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', v.status='active' and v.balance>0,
    'balance', v.balance, 'status', v.status);
end; $function$;

ALTER FUNCTION "mimipip"."gift_card_status"(p_code text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.guard_ordered_proposal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
 if exists(select 1 from corporate_orders where source_study_id=old.id) then
  if tg_op='DELETE' or new.configuration is distinct from old.configuration or new.status is distinct from old.status or new.revision is distinct from old.revision
    or new.product_handle is distinct from old.product_handle or new.material_slug is distinct from old.material_slug
    or new.customisation_required is distinct from old.customisation_required then
    raise exception 'This version is in checkout. Contact Mimi Pip to revise the order.';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip"."guard_ordered_proposal"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.guard_proposal_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare s corporate_wall_studies;
begin
 if new.source_study_id is null then return new; end if;
 select * into s from corporate_wall_studies where id=new.source_study_id for update;
 if s.id is null or s.account_id<>new.account_id or s.status<>'approved' or s.revision<>new.source_study_revision then
   raise exception 'Proposal changed or is not approved. Reload before checkout.';
 end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip"."guard_proposal_order"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.guard_wallpaper_cart_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if exists(select 1 from products where id=new.product_id and category='wallpaper' and handle<>'bespoke-customisation')
  and not exists(select 1 from product_materials where product_id=new.product_id and material_id=new.material_id and available and price_per_sqft=new.unit_price_per_sqft) then
    raise exception 'Wallpaper price or surface changed. Please remove this wallpaper from your cart and add it again to review the current price.' using errcode='check_violation';
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."guard_wallpaper_cart_price"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.is_curated_wallpaper(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from mimipip.products p
    join mimipip.product_tags pt on pt.product_id = p.id
    join mimipip.collections c on pt.tag = any(
      case when cardinality(c.rule_tags) > 0 then c.rule_tags
           else array[c.rule_tag] end)
    where p.id = p_id and p.category = 'wallpaper'
      and c.kind::text = 'curated'
      and (c.category_scope is null or c.category_scope = 'wallpaper')
  );
$function$;

ALTER FUNCTION "mimipip"."is_curated_wallpaper"(p_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.is_deity_design(p_product_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from products p
     where p.id = p_product_id
       and (
         p.handle like 'dwadasha-%'
         or (coalesce(p.title, '') || ' ' || coalesce(p.description, '')) ~*
            '\m(ganesh|ganesha|ganapati|ganpati|vinayaka|vinayak|gajanana|vighnaharta|lambodara|ekadanta|vakratunda|krishna|shiva|mahadev|vishnu|lakshmi|laxmi|durga|hanuman|saraswati|parvati|balaji|jagannath|nataraja|deity|deities)\M'
       )
  )
$function$;

ALTER FUNCTION "mimipip"."is_deity_design"(p_product_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.is_email_verified()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and (email_confirmed_at is not null or confirmed_at is not null)
  );
$function$;

ALTER FUNCTION "mimipip"."is_email_verified"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.keep_religious_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
 if new.tag ~ '^Religion:(hinduism|buddhism|jainism|sikhism|christianity|islam|zoroastrianism|judaism|bahai)$' then
  update mimipip.products set religion=substr(new.tag,10) where id=new.product_id and religion is distinct from substr(new.tag,10);
 elsif new.tag like 'Deity:%' then
  update mimipip.products set religious_subject=substr(new.tag,7) where id=new.product_id and religious_subject is distinct from substr(new.tag,7);
 end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip"."keep_religious_identity"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.link_auth_customer()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
        v_email text := nullif(lower(auth.jwt() ->> 'email'), '');
        v_id uuid;
begin
  if v_uid is null then return null; end if;
  select id into v_id from customers where auth_user_id = v_uid;
  if v_id is not null then
    begin
      update customers set email = coalesce(email, v_email), updated_at = now() where id = v_id;
    exception when unique_violation then null; end;
    return v_id;
  end if;
  if v_email is not null then
    select id into v_id from customers where lower(email) = v_email;
    if v_id is not null then
      update customers set auth_user_id = v_uid, updated_at = now() where id = v_id;
      return v_id;
    end if;
  end if;
  insert into customers (auth_user_id, email, source) values (v_uid, v_email, 'account') returning id into v_id;
  return v_id;
end $function$;

ALTER FUNCTION "mimipip"."link_auth_customer"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.link_taste_token(p_token uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or p_token is null then return; end if;
  update customers set taste_token = coalesce(taste_token, p_token), updated_at = now()
    where auth_user_id = v_uid;
end $function$;

ALTER FUNCTION "mimipip"."link_taste_token"(p_token uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.link_visitor_identity(p_token uuid, p_customer_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_written boolean := false;
begin
  if p_token is null or p_customer_id is null then return false; end if;
  insert into mimipip.identity_link (visitor_token, customer_id)
  values (p_token, p_customer_id)
  on conflict (visitor_token, customer_id) do nothing;
  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;

ALTER FUNCTION "mimipip"."link_visitor_identity"(p_token uuid, p_customer_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.log_character_request(p_character text, p_outcome text, p_franchise text DEFAULT NULL::text, p_shown_handles text[] DEFAULT '{}'::text[], p_channel text DEFAULT 'chat'::text, p_note text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_id bigint;
begin
  if coalesce(btrim(p_character), '') = '' then
    raise exception 'character is required';
  end if;
  insert into character_requests (channel, character, franchise, outcome, shown_handles, note)
  values (
    case when p_channel = 'voice' then 'voice' else 'chat' end,
    left(btrim(p_character), 80),
    nullif(left(btrim(coalesce(p_franchise, '')), 80), ''),
    p_outcome,
    coalesce((select array_agg(left(h, 120)) from unnest(p_shown_handles[1:8]) h), '{}'),
    nullif(left(btrim(coalesce(p_note, '')), 300), '')
  )
  returning id into v_id;
  return v_id;
end $function$;

ALTER FUNCTION "mimipip"."log_character_request"(p_character text, p_outcome text, p_franchise text, p_shown_handles text[], p_channel text, p_note text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.log_checkout_failure(p_stage text, p_detail text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_order_number bigint DEFAULT NULL::bigint, p_order_id uuid DEFAULT NULL::uuid, p_value_inr numeric DEFAULT NULL::numeric, p_session_token text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_id uuid;
begin
  if p_stage is null or length(trim(p_stage)) = 0 then
    raise exception 'log_checkout_failure requires a stage';
  end if;
  insert into checkout_failures (stage, detail, email, order_number, order_id,
                                 value_inr, session_token, meta)
  values (trim(p_stage), p_detail, nullif(trim(coalesce(p_email,'')),''),
          p_order_number, p_order_id, p_value_inr,
          nullif(trim(coalesce(p_session_token,'')),''), coalesce(p_meta,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end; $function$;

ALTER FUNCTION "mimipip"."log_checkout_failure"(p_stage text, p_detail text, p_email text, p_order_number bigint, p_order_id uuid, p_value_inr numeric, p_session_token text, p_meta jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.log_commercial_event(p_event text, p_subject text, p_token uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid, p_handle text DEFAULT NULL::text, p_value_inr numeric DEFAULT NULL::numeric, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_written boolean := false;
  v_meta    jsonb   := coalesce(p_meta, '{}'::jsonb);
begin
  if p_event not in ('cart_add','checkout_start','order_placed','payment_captured','refund','lead_captured') then
    raise exception 'log_commercial_event: % is not a commercial event', p_event;
  end if;
  if p_subject is null or length(trim(p_subject)) = 0 then
    raise exception 'log_commercial_event requires a subject - the natural key IS the idempotency';
  end if;

  if p_event in ('order_placed','payment_captured') and p_token is not null then
    v_meta := v_meta || jsonb_build_object('first_touch', mimipip.visitor_first_touch(p_token));
  end if;

  insert into mimipip.site_events
    (token, event, product_handle, meta, is_bot, ua_family, event_key,
     schema_version, emitted_by, token_presented, customer_id, subject, value_inr)
  values
    (p_token, p_event, p_handle, v_meta, false, 'server',
     -- pgcrypto is installed into `extensions`, not `public`, and this function
     -- pins search_path to public - so the schema is named rather than searched.
     encode(extensions.digest(p_event || '|' || p_subject, 'sha256'), 'hex'),
     1, 'server', null, p_customer_id, p_subject, p_value_inr)
  on conflict (event_key) where event_key is not null do nothing;

  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;

ALTER FUNCTION "mimipip"."log_commercial_event"(p_event text, p_subject text, p_token uuid, p_customer_id uuid, p_handle text, p_value_inr numeric, p_meta jsonb) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.log_print_queue_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  insert into print_queue_deletions (
    order_no, panels, wall_width_mm, wall_height_mm, num_panels, queued_at,
    db_user, session_user_name, app_name, client_addr, backend_pid, stmt)
  values (
    old.order_no, old.panels, old.wall_width_mm, old.wall_height_mm,
    old.num_panels, old.created_at,
    current_user, session_user,
    current_setting('application_name', true),
    inet_client_addr(), pg_backend_pid(),
    left(current_query(), 2000));
  return old;
end;
$function$;

ALTER FUNCTION "mimipip"."log_print_queue_delete"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.log_server_event(p_event_key text, p_token uuid, p_event text, p_handle text DEFAULT NULL::text, p_is_bot boolean DEFAULT false, p_ua_family text DEFAULT NULL::text, p_schema_version integer DEFAULT 1, p_meta jsonb DEFAULT '{}'::jsonb, p_token_presented boolean DEFAULT NULL::boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_written boolean := false;
begin
  if p_event_key is null or length(trim(p_event_key)) = 0 then
    raise exception 'log_server_event requires an event_key — idempotency is not optional here';
  end if;

  insert into mimipip.site_events (token, event, product_handle, meta, is_bot, ua_family,
                                  event_key, schema_version, emitted_by, token_presented)
  values (p_token, p_event, p_handle, coalesce(p_meta, '{}'::jsonb), coalesce(p_is_bot, false),
          p_ua_family, p_event_key, coalesce(p_schema_version, 1), 'server', p_token_presented)
  on conflict (event_key) where event_key is not null do nothing;

  get diagnostics v_written = row_count;
  return v_written;
end;
$function$;

ALTER FUNCTION "mimipip"."log_server_event"(p_event_key text, p_token uuid, p_event text, p_handle text, p_is_bot boolean, p_ua_family text, p_schema_version integer, p_meta jsonb, p_token_presented boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.login_sync()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
        v_email text := nullif(lower(auth.jwt() ->> 'email'), '');
        v_phone_raw text;
        v_last10 text;
        v_id uuid;
        v_row customers;
begin
  if v_uid is null then return null; end if;
  select phone into v_phone_raw from auth.users where id = v_uid;
  v_last10 := to_indian_mobile(v_phone_raw);
  select id into v_id from customers where auth_user_id = v_uid;
  if v_id is null and v_last10 is not null then
    select id into v_id from customers
      where auth_user_id is null
        and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_last10
      order by created_at limit 1;
    if v_id is not null then
      update customers set auth_user_id = v_uid, updated_at = now() where id = v_id;
    end if;
  end if;
  if v_id is null and v_email is not null then
    select id into v_id from customers
      where auth_user_id is null and lower(email) = v_email order by created_at limit 1;
    if v_id is not null then
      update customers set auth_user_id = v_uid, updated_at = now() where id = v_id;
    end if;
  end if;
  if v_id is null then
    insert into customers (auth_user_id, email, phone, source)
      values (v_uid, v_email, v_last10, 'account') returning id into v_id;
  end if;
  update customers set phone = coalesce(phone, v_last10), updated_at = now() where id = v_id;
  select * into v_row from customers where id = v_id;
  return jsonb_build_object('email', v_row.email, 'phone', v_row.phone, 'needs_email', (v_row.email is null));
end $function$;

ALTER FUNCTION "mimipip"."login_sync"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.mark_order_paid_by_gift(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  update orders set payment_status='paid', status='paid', updated_at=now()
   where id=p_order_id and payment_status='pending';
end; $function$;

ALTER FUNCTION "mimipip"."mark_order_paid_by_gift"(p_order_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.mark_order_paid_free(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_payload jsonb; v_total numeric;
begin
  select total into v_total from orders where id = p_order_id for update;
  if v_total is null then raise exception 'order not found'; end if;
  if v_total > 0 then raise exception 'order % is not free', p_order_id; end if;
  update orders set payment_status='paid', status='paid', paid_at = coalesce(paid_at, now()), updated_at=now()
   where id=p_order_id and payment_status='pending';
  select jsonb_build_object(
    'order_id', o.id, 'order_number', o.order_number,
    'email', o.email, 'phone', o.phone, 'subtotal', o.subtotal,
    'shipping_address', o.shipping_address,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'title', oi.product_title, 'qty', oi.quantity, 'line_total', oi.line_total,
        'area_sqft', oi.area_sqft, 'height_cm', oi.height_cm
      )), '[]'::jsonb) from order_items oi where oi.order_id = o.id)
  ) into v_payload from orders o where o.id = p_order_id;
  return v_payload;
end; $function$;

ALTER FUNCTION "mimipip"."mark_order_paid_free"(p_order_id uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.marketing_library_set_site_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  t record;
begin
  select * into t from mimipip.marketing_site_target(new.product_url);
  new.site_kind := t.kind;
  new.site_handle := t.handle;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."marketing_library_set_site_target"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.marketing_site_target(p_url text)
 RETURNS TABLE(kind text, handle text)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  path text;
  m text[];
begin
  path := regexp_replace(coalesce(p_url, ''), '^https?://(www\.)?mimipip\.com', '');
  path := split_part(split_part(path, '?', 1), '#', 1);
  path := rtrim(path, '/');
  m := regexp_match(path, '^/(products|collections|concepts|projects)/([^/]+)$');
  if m is not null then
    return query select
      case m[1] when 'products' then 'product' when 'collections' then 'collection' else 'concept' end,
      lower(m[2]);
    return;
  end if;
  -- A site page: one path segment, e.g. /installation → ('page', 'installation').
  m := regexp_match(path, '^/([A-Za-z0-9-]+)$');
  if m is not null then
    return query select 'page'::text, lower(m[1]);
  end if;
end $function$;

ALTER FUNCTION "mimipip"."marketing_site_target"(p_url text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.match_products_by_embedding(query_embedding vector, match_count integer DEFAULT 12)
 RETURNS TABLE(handle text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select p.handle, 1 - (p.image_embedding <=> query_embedding) as similarity
  from products p
  where p.image_embedding is not null
    and p.status = 'active'
  order by p.image_embedding <=> query_embedding
  limit least(match_count, 24);
$function$;

ALTER FUNCTION "mimipip"."match_products_by_embedding"(query_embedding vector, match_count integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.order_nos_at_printer(p_nos text[])
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select distinct n
    from unnest(p_nos) as n
   where n is not null and btrim(n) <> ''
     and (
       exists (select 1 from mimipip.production_jobs j
                where j.order_no = n
                   or left(j.order_no, length(n) + 1) in (n || '_', n || '-'))
       or exists (select 1 from mimipip.print_queue q
                   where q.order_no = n
                      or left(q.order_no, length(n) + 1) in (n || '_', n || '-'))
       or exists (select 1 from mimipip.print_runs r
                   where r.order_no = n
                      or left(r.order_no, length(n) + 1) in (n || '_', n || '-'))
     )
$function$;

ALTER FUNCTION "mimipip"."order_nos_at_printer"(p_nos text[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.otp_request_allowed(p_email text, p_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_email text := nullif(lower(trim(p_email)), '');
        v_email_count int;
        v_ip_count int;
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_email');
  end if;

  select count(*) into v_email_count from auth_otp_requests
    where lower(email) = v_email and created_at > now() - interval '1 hour';
  if v_email_count >= 5 then
    return jsonb_build_object('allowed', false, 'reason', 'too_many_for_email');
  end if;

  if p_ip is not null then
    select count(*) into v_ip_count from auth_otp_requests
      where ip = p_ip and created_at > now() - interval '1 hour';
    if v_ip_count >= 20 then
      return jsonb_build_object('allowed', false, 'reason', 'too_many_for_ip');
    end if;
  end if;

  insert into auth_otp_requests (email, ip) values (v_email, p_ip);
  return jsonb_build_object('allowed', true);
end $function$;

ALTER FUNCTION "mimipip"."otp_request_allowed"(p_email text, p_ip text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.panel_sample_lock()
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$ select pg_advisory_xact_lock(7203114001) $function$;

ALTER FUNCTION "mimipip"."panel_sample_lock"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.partner_confirmation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_edit boolean := coalesce(current_setting('partner.order_edit', true), '') = 'on';
        v_po boolean := coalesce(current_setting('partner.po_replace', true), '') = 'on';
begin
  if tg_op = 'DELETE' then raise exception 'Confirmation cannot be deleted'; end if;
  if new.id is distinct from old.id or new.account_id is distinct from old.account_id
     or new.project_id is distinct from old.project_id or new.version is distinct from old.version
     or new.created_at is distinct from old.created_at or new.release_policy is distinct from old.release_policy
     or new.shipping is distinct from old.shipping or new.option_ids is distinct from old.option_ids
     or new.confirmed_by is distinct from old.confirmed_by then
    raise exception 'Confirmation is immutable';
  end if;
  if new.package is distinct from old.package
     and not (v_edit and old.po_accepted_at is not null and mimipip.partner_order_open(old.id)) then
    raise exception 'Confirmation is immutable';
  end if;
  if old.status = 'sent' and new.status <> 'sent' then raise exception 'Sent confirmation cannot move backwards'; end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then raise exception 'A cancelled order stays cancelled'; end if;
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and not (v_edit and mimipip.partner_order_open(old.id)) then
    raise exception '1 hour has passed, and you can no longer edit it. The order is processed and non-cancellable.';
  end if;
  if old.po_accepted_at is not null and (
       new.po_number is distinct from old.po_number or new.po_accepted_at is distinct from old.po_accepted_at
       or new.promised_dispatch_at is distinct from old.promised_dispatch_at
       or new.status not in ('release_pending', 'sent', 'cancelled')) then
    raise exception 'Accepted PO is immutable';
  end if;
  if old.po_accepted_at is not null and (
       new.po_path is distinct from old.po_path or new.po_sha256 is distinct from old.po_sha256
       or new.po_uploaded_by is distinct from old.po_uploaded_by or new.po_mime is distinct from old.po_mime)
     and not (v_po and mimipip.partner_order_open(old.id)) then
    raise exception 'Accepted PO is immutable';
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."partner_confirmation_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.partner_operational_order_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
 if tg_op='UPDATE' and (old.partner_confirmation_id is not null or exists(select 1 from corporate_accounts where id=old.account_id and (slug='homelane' or (capabilities->>'poRequiredRelease')::boolean=true))) and (new.account_id is distinct from old.account_id or new.partner_confirmation_id is distinct from old.partner_confirmation_id or new.partner_option_id is distinct from old.partner_option_id or new.design_url is distinct from old.design_url or new.design_ref is distinct from old.design_ref or new.crop_data is distinct from old.crop_data or new.width_mm is distinct from old.width_mm or new.height_mm is distinct from old.height_mm or new.material_slug is distinct from old.material_slug or new.total is distinct from old.total or new.order_ref is distinct from old.order_ref or new.openings is distinct from old.openings or new.min_billable_width_mm is distinct from old.min_billable_width_mm or new.print_type is distinct from old.print_type or new.rate_per_sqft is distinct from old.rate_per_sqft or new.amount is distinct from old.amount or new.gst_pct is distinct from old.gst_pct or new.gst_amount is distinct from old.gst_amount or new.list_amount is distinct from old.list_amount or new.discount_pct is distinct from old.discount_pct or new.discount_amount is distinct from old.discount_amount or new.state is distinct from old.state or new.gstin is distinct from old.gstin or new.ship_address is distinct from old.ship_address or new.ship_city is distinct from old.ship_city or new.ship_pincode is distinct from old.ship_pincode or new.ship_contact_name is distinct from old.ship_contact_name or new.ship_contact_phone is distinct from old.ship_contact_phone or new.po_url is distinct from old.po_url or new.po_number is distinct from old.po_number or new.po_received_at is distinct from old.po_received_at) then raise exception 'Released specification is immutable'; end if;
 if tg_op='UPDATE' and old.partner_confirmation_id is null and old.account_id=new.account_id then return new; end if;
 if exists(select 1 from corporate_accounts where id=new.account_id and (slug='homelane' or (capabilities->>'poRequiredRelease')::boolean=true)) then
  if new.partner_confirmation_id is null or not exists(select 1 from partner_private_confirmations c where c.id=new.partner_confirmation_id and c.account_id=new.account_id and c.po_accepted_at is not null and new.partner_option_id=any(c.option_ids)) then raise exception 'Accepted immutable PO confirmation required'; end if;
 end if;
 return new;
end $function$;

ALTER FUNCTION "mimipip"."partner_operational_order_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.partner_option_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then raise exception 'Partner specification/history is immutable'; end if;
  if coalesce(current_setting('partner.option_edit', true), '') <> 'on' then
    raise exception 'Partner specification/history is immutable';
  end if;
  if new.id is distinct from old.id or new.account_id is distinct from old.account_id
     or new.project_id is distinct from old.project_id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at or new.supersedes_id is distinct from old.supersedes_id then
    raise exception 'Only the wall''s room, name and specification can change';
  end if;
  if mimipip.partner_option_locked(old.id) then
    raise exception '1 hour has passed, and you can no longer edit it. The order is processed and non-cancellable.';
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."partner_option_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.partner_option_locked(p_option uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from mimipip.partner_private_confirmations c
     where p_option = any(c.option_ids) and c.po_accepted_at is not null
       and c.status <> 'cancelled' and not mimipip.partner_order_open(c.id))
$function$;

ALTER FUNCTION "mimipip"."partner_option_locked"(p_option uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.partner_order_edit_window()
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$ select interval '1 hour' $function$;

ALTER FUNCTION "mimipip"."partner_order_edit_window"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.partner_order_open(p_confirmation uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from mimipip.partner_private_confirmations c
      join mimipip.partner_release_outbox o on o.confirmation_id = c.id
     where c.id = p_confirmation and c.status = 'release_pending'
       and c.po_accepted_at is not null
       and now() < c.po_accepted_at + mimipip.partner_order_edit_window()
       and o.state = 'pending')
$function$;

ALTER FUNCTION "mimipip"."partner_order_open"(p_confirmation uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.phone_signin_route(p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_last10 text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
        v_email text;
        v_local text;
        v_domain text;
        v_at int;
begin
  if v_last10 !~ '^[6-9]\d{9}$' then
    return jsonb_build_object('route', 'invalid');
  end if;

  select c.email into v_email
    from customers c
    where c.auth_user_id is not null
      and c.email is not null
      and right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_last10
    order by c.created_at
    limit 1;

  if v_email is null then
    return jsonb_build_object('route', 'sms');
  end if;

  v_at := position('@' in v_email);
  v_local := left(v_email, v_at - 1);
  v_domain := substr(v_email, v_at);
  -- First character, then two bullets regardless of length: a mask that tracked
  -- the real length would hand back part of the secret it exists to hide.
  return jsonb_build_object(
    'route', 'email',
    'hint', left(v_local, 1) || '••' || v_domain
  );
end $function$;

ALTER FUNCTION "mimipip"."phone_signin_route"(p_phone text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.popular_designs(p_days integer DEFAULT 90, p_limit integer DEFAULT 12)
 RETURNS TABLE(handle text, score numeric, units bigint, from_sales boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if p_days = 90 and exists (
    select 1 from popular_designs_cache c
    where c.p_days = 90 and c.refreshed_at > now() - interval '30 hours'
  ) then
    return query
      select c.handle, c.score, c.units, c.from_sales
      from popular_designs_cache c
      where c.p_days = 90
      order by c.rank
      limit greatest(1, least(p_limit, 100));
  else
    return query select * from popular_designs_live(p_days, p_limit);
  end if;
end;
$function$;

ALTER FUNCTION "mimipip"."popular_designs"(p_days integer, p_limit integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.popular_designs_live(p_days integer DEFAULT 90, p_limit integer DEFAULT 12)
 RETURNS TABLE(handle text, score numeric, units bigint, from_sales boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  with since as (
    select now() - make_interval(days => greatest(1, least(p_days, 365))) as t
  ),
  sold as (
    select oi.product_id, sum(oi.quantity)::bigint as units
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.created_at >= (select t from since) and oi.product_id is not null
    group by 1
  ),
  seen as (
    select e.product_handle as handle,
      count(*) filter (where e.event in ('view', 'page_view'))::numeric as views,
      count(*) filter (where e.event = 'visualize')::numeric as visualised,
      count(*) filter (where e.event in ('cart', 'cart_add'))::numeric as carted,
      count(*) filter (where e.event = 'save')::numeric as saved
    from site_events e
    where e.created_at >= (select t from since)
      and e.product_handle is not null
      and e.is_bot is false
      and e.token_presented is not false
    group by 1
  )
  select p.handle,
    ( coalesce(sold.units, 0) * 100
    + coalesce(seen.carted, 0) * 20
    + coalesce(seen.visualised, 0) * 6
    + coalesce(seen.saved, 0) * 6
    + coalesce(seen.views, 0) )::numeric as score,
    coalesce(sold.units, 0)::bigint as units,
    (sold.units is not null) as from_sales
  from products p
  left join sold on sold.product_id = p.id
  left join seen on seen.handle = p.handle
  where p.status = 'active' and p.religion is null
    and coalesce(p.is_service, false) = false
    and (sold.units is not null or seen.handle is not null)
  order by score desc, p.created_at desc
  limit greatest(1, least(p_limit, 100));
$function$;

ALTER FUNCTION "mimipip"."popular_designs_live"(p_days integer, p_limit integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.populated_collection_tags()
 RETURNS TABLE(tag text, active_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select pt.tag, count(distinct pt.product_id) as active_count
  from product_tags pt
  join products p on p.id = pt.product_id
  where p.status = 'active'
  group by pt.tag;
$function$;

ALTER FUNCTION "mimipip"."populated_collection_tags"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.print_queue_reservation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_release text := nullif(current_setting('panel_sample.release_id', true), '');
  v_recall  text := nullif(current_setting('panel_sample.recall_order', true), '');
  v_open    media_reservations%rowtype;
  v_has_open boolean;
  v_becoming_released boolean;
  v_is_sample boolean;
begin
  perform panel_sample_lock();
  select * into v_open from media_reservations where closed_at is null limit 1;
  v_has_open := found;

  if tg_op = 'DELETE' then
    if v_has_open and old.order_no = v_open.order_no and v_open.handed_at is null
       and v_recall is distinct from old.order_no then
      raise exception 'SAMPLE_RESERVED_ROW: % is reserved and has not been handed to the print PC — recall it by ending the reservation', old.order_no
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.released_at is not null then
    if new.order_no is distinct from old.order_no or new.panels is distinct from old.panels then
      raise exception 'RELEASED_ROW_IMMUTABLE: % is already released — its order and files cannot change', old.order_no
        using errcode = 'P0001';
    end if;
    if v_has_open and new.released_at is distinct from old.released_at then
      raise exception 'MEDIA_RESERVED: the release state of % cannot change while the machine is reserved', old.order_no
        using errcode = 'P0001';
    end if;
  end if;

  select coalesce(bool_or(panel_sample), false) into v_is_sample
    from production_jobs where order_no = new.order_no and status is distinct from 'superseded';
  if v_is_sample and v_release is null
     and (tg_op = 'INSERT' or new.order_no is distinct from old.order_no) then
    raise exception 'PANEL_SAMPLE_GATE: % is a panel sample — it is queued only by its reserved release', new.order_no
      using errcode = 'P0001';
  end if;

  v_becoming_released := new.released_at is not null
    and (tg_op = 'INSERT' or old.released_at is null);
  if v_becoming_released and v_has_open then
    if v_release is not null and v_release = v_open.release_id and new.order_no = v_open.order_no then
      return new;
    end if;
    raise exception 'MEDIA_RESERVED: the machine is reserved for % on % — nothing else is released until the usual roll is back', v_open.order_no, v_open.media_code
      using errcode = 'P0001';
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."print_queue_reservation_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.print_queue_truncate_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  perform panel_sample_lock();
  if exists (select 1 from media_reservations where closed_at is null) then
    raise exception 'MEDIA_RESERVED: print_queue cannot be truncated while the machine is reserved for a panel sample'
      using errcode = 'P0001';
  end if;
  return null;
end $function$;

ALTER FUNCTION "mimipip"."print_queue_truncate_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.product_attributes(p_handle text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  with t as (
    select distinct pt.tag,
      -- Normalise known wording variants onto their collection's exact rule_tag
      -- before matching (case-insensitively) — these are genuine synonyms, not
      -- typos: "Animals"/"Animal", "Kids room"/"Kids", British/American
      -- spelling, and "Textured"/"Textures".
      case lower(btrim(pt.tag))
        when 'animals' then 'animal'
        when 'kids room' then 'kids'
        when 'watercolour' then 'watercolor'
        when 'textured' then 'textures'
        else lower(btrim(pt.tag))
      end as norm_tag
    from product_tags pt join products p on p.id = pt.product_id
    where p.handle = p_handle
  ),
  cat as (
    select t.tag, t.norm_tag,
           (select c.kind from collections c where lower(c.rule_tag) = t.norm_tag order by c.kind limit 1) as kind,
           (select c.title from collections c where lower(c.rule_tag) = t.norm_tag order by c.kind limit 1) as title
    from t
  ),
  -- Internal/operational markers — never a customer-facing "subject".
  system_tags as (
    select unnest(array['child-safe','custom','custom-print','made-to-order','print-your-own','wallpaper']) as tag
  )
  select jsonb_build_object(
    'rooms',    coalesce((select jsonb_agg(distinct title) from cat where kind = 'room'), '[]'::jsonb),
    'colours',  coalesce((select jsonb_agg(distinct title) from cat where kind = 'color'), '[]'::jsonb),
    'styles',   coalesce((select jsonb_agg(distinct title) from cat where kind = 'category'), '[]'::jsonb),
    'moods',    coalesce((select jsonb_agg(distinct initcap(substring(tag from 7))) from cat where tag ilike 'mood:%'), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(distinct tag) from cat
      where kind is null
        and tag not ilike 'mood:%'
        and lower(btrim(tag)) not in (select tag from system_tags)
    ), '[]'::jsonb)
  );
$function$;

ALTER FUNCTION "mimipip"."product_attributes"(p_handle text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.product_embeddings(p_handles text[])
 RETURNS TABLE(handle text, embedding text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select p.handle, p.image_embedding::text
  from products p
  where p.handle = any(p_handles) and p.status = 'active' and p.image_embedding is not null;
$function$;

ALTER FUNCTION "mimipip"."product_embeddings"(p_handles text[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.product_images_set_content_hash()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if new.content_hash is null then
    new.content_hash := mimipip.storage_content_hash(new.url);
  end if;
  return new;
end; $function$;

ALTER FUNCTION "mimipip"."product_images_set_content_hash"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.product_rating(p_handle text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'count', count(*),
    'average', coalesce(round(avg(rating)::numeric, 2), 0)
  )
  from reviews r join products p on p.id = r.product_id
  where p.handle = p_handle and r.status = 'published';
$function$;

ALTER FUNCTION "mimipip"."product_rating"(p_handle text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.related_products_by_embedding(product_handle text, match_count integer DEFAULT 4)
 RETURNS TABLE(handle text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select p.handle, 1 - (p.image_embedding <=> q.image_embedding) as similarity
  from products p,
       (select image_embedding from products where handle = product_handle) q
  where p.image_embedding is not null
    and q.image_embedding is not null
    and p.status = 'active'
    and p.handle <> product_handle
  order by p.image_embedding <=> q.image_embedding
  limit least(match_count, 12);
$function$;

ALTER FUNCTION "mimipip"."related_products_by_embedding"(product_handle text, match_count integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.resume_order_for_cart(p_session_token text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'order_id', o.id,
    'order_number', o.order_number,
    'total', o.total,
    'subtotal', o.subtotal,
    'shipping', o.shipping,
    'discount', o.discount,
    'discount_code', o.discount_code,
    'express', o.shipping_speed = 'express',
    'order_copy_url', o.order_copy_url,
    'razorpay_order_id', o.razorpay_order_id,
    'pending_gift_code', o.pending_gift_code
  )
  from carts c
  join orders o on o.cart_id = c.id
  where c.session_token = p_session_token
    and c.status = 'ordered'
    and o.payment_status = 'pending'
    and o.status = 'pending'
  order by o.created_at desc
  limit 1;
$function$;

ALTER FUNCTION "mimipip"."resume_order_for_cart"(p_session_token text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.retail_order_at_printer(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1 from mimipip.order_nos_at_printer(array(
      select o.zvy from mimipip.orders o where o.id = p_order and o.zvy is not null
      union
      select oi.zvy from mimipip.order_items oi where oi.order_id = p_order and oi.zvy is not null
    ))
  )
$function$;

ALTER FUNCTION "mimipip"."retail_order_at_printer"(p_order uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.room_key_for(p_tag text, p_scene text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select room_key from room_scenes
   where (p_tag is not null and p_tag = any(tags))
      or (p_scene is not null and p_scene = any(scene_keys))
   limit 1
$function$;

ALTER FUNCTION "mimipip"."room_key_for"(p_tag text, p_scene text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.save_customer_email(p_email text, p_marketing boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
        v_email text := nullif(lower(trim(p_email)), '');
        v_id uuid;
begin
  if v_uid is null then return; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;
  select id into v_id from customers where auth_user_id = v_uid;
  if v_id is null then return; end if;
  begin
    update customers set email = coalesce(email, v_email), updated_at = now() where id = v_id;
  exception when unique_violation then null;
  end;
  if p_marketing then
    update customers
       set marketing_opt_in = true, updated_at = now()
     where id = v_id
       and unsubscribed_at is null
       and email_bounced_at is null
       and not email_suppressed(coalesce(email, v_email));
  end if;
end $function$;

ALTER FUNCTION "mimipip"."save_customer_email"(p_email text, p_marketing boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.save_customer_phone(p_phone text, p_marketing boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_uid uuid := auth.uid();
        v_last10 text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
        v_id uuid;
begin
  if v_uid is null then return; end if;
  if v_last10 !~ '^[6-9]\d{9}$' then
    raise exception 'invalid phone';
  end if;
  select id into v_id from customers where auth_user_id = v_uid;
  if v_id is null then return; end if;
  update customers set
    phone = v_last10,
    marketing_opt_in = case
                         when p_marketing is null then marketing_opt_in
                         when p_marketing and unsubscribed_at is null and email_bounced_at is null
                              and not email_suppressed(email) then true
                         when p_marketing then marketing_opt_in
                         else false
                       end,
    unsubscribed_at  = case
                         when p_marketing is false then coalesce(unsubscribed_at, now())
                         else unsubscribed_at
                       end,
    updated_at = now()
  where id = v_id;
end $function$;

ALTER FUNCTION "mimipip"."save_customer_phone"(p_phone text, p_marketing boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.search_lexicon()
 RETURNS TABLE(word text, n integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  with named as (
    select regexp_split_to_table(lower(p.title), '[^a-z0-9]+') as w
      from products p
     where p.status = 'active' and coalesce(p.is_service, false) = false
    union all
    select regexp_split_to_table(lower(t.tag), '[^a-z0-9]+')
      from product_tags t
      join products p on p.id = t.product_id
     where p.status = 'active' and coalesce(p.is_service, false) = false
    union all
    select regexp_split_to_table(lower(c.title), '[^a-z0-9]+') from collections c
    union all
    select regexp_split_to_table(lower(x.w), '[^a-z0-9]+')
      from search_synonyms s, unnest(s.cluster) as x(w)
  ),
  known as (
    select s.word as w
      from ts_stat('select search_tsv from products where status = ''active'' and coalesce(is_service, false) = false') s
  )
  select u.w as word, sum(u.n)::integer as n
    from (
      select w, 1 as n from named
      union all
      select w, 0 from known
    ) u
   where length(u.w) >= 3 and u.w ~ '^[a-z0-9]+$'
   group by u.w;
$function$;

ALTER FUNCTION "mimipip"."search_lexicon"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.search_lexicon_json()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_array(l.word, l.n) order by l.word), '[]'::jsonb)
    from mimipip.search_lexicon() l;
$function$;

ALTER FUNCTION "mimipip"."search_lexicon_json"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.search_products_v1(p_query text, p_limit integer DEFAULT 48)
 RETURNS TABLE(handle text, rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_clean text;
  v_terms text[];
  v_expanded text[];
  v_tsq tsquery;
begin
  v_clean := btrim(regexp_replace(coalesce(p_query, ''), '[^\w\s-]', ' ', 'g'));
  if v_clean = '' then return; end if;

  v_terms := regexp_split_to_array(lower(v_clean), '\s+');

  select array_agg(distinct w) into v_expanded
  from (
    select unnest(v_terms) as w
    union
    select unnest(s.cluster) from search_synonyms s
     where s.cluster && v_terms
  ) x;

  select to_tsquery('english', string_agg(quote_literal(w) || ':*', ' | '))
    into v_tsq
  from unnest(v_expanded) as w
  where length(w) > 1;

  if v_tsq is null then return; end if;

  return query
  select p.handle,
    ( ts_rank(p.search_tsv, v_tsq)
      * case when p.new_until is not null and p.new_until > now() then 1.25 else 1.0 end
    )::real as rank
  from products p
  where p.status = 'active' and p.religion is null
    and coalesce(p.is_service, false) = false
    and p.search_tsv @@ v_tsq
  order by rank desc, p.aesthetic_rank asc nulls last, p.created_at desc
  limit p_limit;
end $function$;

ALTER FUNCTION "mimipip"."search_products_v1"(p_query text, p_limit integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.search_products_v2(p_query text, p_limit integer DEFAULT 48, p_room_tag text DEFAULT NULL::text)
 RETURNS TABLE(handle text, rank real)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_clean text;
  v_terms text[];
  v_scored text[];
  v_expanded text[];
  v_tsq tsquery;
  v_noise text[] := array[
    'wallpaper','wallpapers','wall','walls','paper','papers',
    'mural','murals','design','designs','print','prints','pattern','patterns',
    'buy','online','india','for','my','the'
  ];
begin
  v_clean := btrim(regexp_replace(coalesce(p_query, ''), '[^\w\s-]', ' ', 'g'));
  if v_clean = '' then return; end if;

  v_terms := regexp_split_to_array(lower(v_clean), '\s+');

  select array_agg(t) into v_scored from unnest(v_terms) t where not (t = any(v_noise));
  if v_scored is null or array_length(v_scored, 1) is null then
    v_scored := v_terms;
  end if;

  select array_agg(distinct w) into v_expanded
  from (
    select unnest(v_scored) as w
    union
    select unnest(s.cluster) from search_synonyms s
     where s.cluster && v_scored
  ) x;

  select to_tsquery('english', string_agg(quote_literal(w) || ':*', ' | '))
    into v_tsq
  from unnest(v_expanded) as w
  where length(w) > 1;

  if v_tsq is null then return; end if;

  return query
  select p.handle,
    ( ts_rank(p.search_tsv, v_tsq)
      * case when p.new_until is not null and p.new_until > now() then 1.25 else 1.0 end
      + case
          when p_room_tag is not null and exists (
            select 1 from product_tags t
             where t.product_id = p.id and t.tag = p_room_tag
          ) then 1.0 else 0.0
        end
    )::real as rank
  from products p
  where p.status = 'active' and p.religion is null
    and coalesce(p.is_service, false) = false
    and p.search_tsv @@ v_tsq
  order by rank desc, p.aesthetic_rank asc nulls last, p.created_at desc
  limit p_limit;
end $function$;

ALTER FUNCTION "mimipip"."search_products_v2"(p_query text, p_limit integer, p_room_tag text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.search_products_v3(p_query text, p_limit integer DEFAULT 60, p_offset integer DEFAULT 0, p_room_tag text DEFAULT NULL::text, p_room_key text DEFAULT NULL::text)
 RETURNS TABLE(handle text, rank real, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare
  v_terms text[];
  v_scored text[];
  v_expanded text[];
  v_tsq tsquery;
  v_code text;
  v_is_code boolean;
  v_clean text;
  v_noise text[] := array['wallpaper','wallpapers','wall','walls','paper','papers','mural','murals','design','designs','print','prints','pattern','patterns','buy','online','india','for','my','the'];
begin
  v_clean := btrim(regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:] ]', ' ', 'g'));
  v_code := regexp_replace(lower(coalesce(p_query, '')), '[^[:alnum:]]', '', 'g');
  v_is_code := coalesce(p_query, '') ~* '^[[:alpha:]]+[[:space:]-]*[[:digit:]]+$';
  if v_clean = '' then return; end if;
  v_terms := regexp_split_to_array(v_clean, '\s+');
  select array_agg(t) into v_scored from unnest(v_terms) t where not t = any(v_noise);
  if v_scored is null then v_scored := v_terms; end if;
  select array_agg(distinct w) into v_expanded from (
    select unnest(v_scored) w
    union
    select unnest(s.cluster) from search_synonyms s where s.cluster && v_scored
  ) x;
  select to_tsquery('english', string_agg(quote_literal(w) || ':*', ' | '))
    into v_tsq from unnest(v_expanded) w where length(w) > 1;
  if v_tsq is null and length(v_code) < 2 then return; end if;

  return query
  with matches as (
    select p.handle, p.aesthetic_rank, p.created_at,
      (
        case when length(v_code) > 2 and (
          regexp_replace(lower(coalesce(p.code,'')), '[^[:alnum:]]', '', 'g') = v_code
          or regexp_replace(lower(p.handle), '[^[:alnum:]]', '', 'g') = v_code
        ) then 100 else 0 end
        + case when lower(p.title) = lower(btrim(p_query)) then 50 else 0 end
        + case when lower(p.title) like '%' || lower(btrim(p_query)) || '%' then 8 else 0 end
        + coalesce((select count(*)::real * 3 from unnest(v_scored) t
            where length(t) > 1 and lower(p.title) like '%' || t || '%'),0)
        + coalesce((select count(*)::real * 2 from unnest(v_scored) t
            where length(t) > 1 and exists (
              select 1 from product_tags pt where pt.product_id = p.id and lower(pt.tag) = t
            )),0)
        + coalesce((select count(*)::real * 20 from unnest(v_scored) t
            where length(t) > 1 and (lower(p.title) like '%' || t || '%'
              or exists (select 1 from product_tags pt where pt.product_id = p.id and lower(pt.tag) = t))),0)
        + case when p.new_until is not null and p.new_until > now() then 2 else 0 end
        + case when p_room_tag is not null and exists (
            select 1 from product_tags pt where pt.product_id = p.id and pt.tag = p_room_tag
          ) then 4 else 0 end
        + case when p_room_key is not null and exists (
            select 1 from product_images pi where pi.product_id = p.id
              and pi.scene_key = p_room_key and pi.is_flat = false
          ) then 4 else 0 end
        + coalesce(ts_rank(p.search_tsv, v_tsq),0)
      )::real score
    from products p
    where p.status = 'active' and p.religion is null and coalesce(p.is_service,false) = false
      and ((v_is_code and (
          regexp_replace(lower(coalesce(p.code,'')), '[^[:alnum:]]', '', 'g') = v_code
          or regexp_replace(lower(p.handle), '[^[:alnum:]]', '', 'g') = v_code))
        or (not v_is_code and ((v_tsq is not null and p.search_tsv @@ v_tsq)
          or (length(v_code) > 2 and (
            regexp_replace(lower(coalesce(p.code,'')), '[^[:alnum:]]', '', 'g') = v_code
            or regexp_replace(lower(p.handle), '[^[:alnum:]]', '', 'g') = v_code)))))
  )
  select m.handle, m.score, count(*) over()::bigint
  from matches m
  order by m.score desc, m.aesthetic_rank asc nulls last, m.created_at desc, m.handle
  limit greatest(1,least(coalesce(p_limit,60),100))
  offset greatest(0,coalesce(p_offset,0));
end $function$;

ALTER FUNCTION "mimipip"."search_products_v3"(p_query text, p_limit integer, p_offset integer, p_room_tag text, p_room_key text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.set_order_gst(p_order_id uuid, p_gstin text, p_billing_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  update orders
     set gstin = nullif(btrim(coalesce(p_gstin,'')), ''),
         billing_name = nullif(btrim(coalesce(p_billing_name,'')), '')
   where id = p_order_id;
end; $function$;

ALTER FUNCTION "mimipip"."set_order_gst"(p_order_id uuid, p_gstin text, p_billing_name text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.set_order_pending_gift(p_order_id uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  update orders set pending_gift_code = nullif(btrim(coalesce(p_code,'')), '') where id = p_order_id;
end; $function$;

ALTER FUNCTION "mimipip"."set_order_pending_gift"(p_order_id uuid, p_code text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.set_order_razorpay(p_order_id uuid, p_rzp_order_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  update orders set razorpay_order_id = p_rzp_order_id, updated_at = now()
  where id = p_order_id;
end; $function$;

ALTER FUNCTION "mimipip"."set_order_razorpay"(p_order_id uuid, p_rzp_order_id text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin new.updated_at = now(); return new; end;
$function$;

ALTER FUNCTION "mimipip"."set_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.showcase_pool(p_min_count integer DEFAULT 8)
 RETURNS TABLE(handle text, title text, kind text, rule_tag text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if exists (
    select 1 from showcase_pool_cache c
    where c.refreshed_at > now() - interval '30 hours'
  ) then
    return query
      select c.handle, c.title, c.kind, c.rule_tag, c.n
      from showcase_pool_cache c
      where c.n >= p_min_count
      order by c.n desc;
  else
    return query select * from showcase_pool_live(p_min_count);
  end if;
end;
$function$;

ALTER FUNCTION "mimipip"."showcase_pool"(p_min_count integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.showcase_pool_live(p_min_count integer DEFAULT 8)
 RETURNS TABLE(handle text, title text, kind text, rule_tag text, n bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select c.handle, c.title, c.kind, c.rule_tag, count(distinct p.id) as n
  from collections c
  join product_tags pt on pt.tag = c.rule_tag
  join products p on p.id = pt.product_id and p.status = 'active'
  join product_images pi on pi.product_id = p.id
  where c.kind in ('category', 'curated', 'room')
  group by c.handle, c.title, c.kind, c.rule_tag
  having count(distinct p.id) >= p_min_count
  order by n desc;
$function$;

ALTER FUNCTION "mimipip"."showcase_pool_live"(p_min_count integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.site_films(p_kind text, p_handles text[])
 RETURNS TABLE(id uuid, title text, description text, kind text, handle text, language text, format text, width integer, height integer, duration_s numeric, media_url text, poster_url text, captions_url text, version_group uuid, published_at timestamp with time zone, youtube_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select a.id, a.title, a.wallpaper, a.site_kind, a.site_handle, a.language, a.format,
    a.width, a.height, a.duration_s, a.site_media_url, a.site_poster_url, a.site_captions_url,
    a.version_group, a.site_published_at,
    (select p->>'url' from jsonb_array_elements(coalesce(a.posts, '[]'::jsonb)) p
      where p->>'platform' = 'youtube' and (p->>'verified')::boolean
        and coalesce(p->'evidence'->>'privacyStatus', '') = 'public' limit 1)
  from mimipip.marketing_asset_library a
  where a.site_state = 'live' and a.site_enabled and a.site_media_url is not null
    and (a.site_media_url ~ '^/[^/]' OR a.site_media_url ~ '^https://mimipip\.com/' OR a.site_media_url ~ '^https://qrtznwnhuzkpynjetygg\.supabase\.co/storage/v1/object/public/mimipip-media/')
    and (a.site_poster_url is null or (a.site_poster_url ~ '^/[^/]' OR a.site_poster_url ~ '^https://mimipip\.com/' OR a.site_poster_url ~ '^https://qrtznwnhuzkpynjetygg\.supabase\.co/storage/v1/object/public/mimipip-media/'))
    and (a.site_captions_url is null or (a.site_captions_url ~ '^/[^/]' OR a.site_captions_url ~ '^https://mimipip\.com/' OR a.site_captions_url ~ '^https://qrtznwnhuzkpynjetygg\.supabase\.co/storage/v1/object/public/mimipip-media/'))
    and a.site_kind = p_kind and a.site_handle = any(p_handles)
  order by a.created_at;
$function$;

ALTER FUNCTION "mimipip"."site_films"(p_kind text, p_handles text[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.skip_book_print_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if exists (
    select 1
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.id = new.order_item_id and p.category = 'book'
  ) then
    return null;
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."skip_book_print_job"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.sms_otp_request_allowed(p_phone text, p_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_last10 text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
        v_phone_count int;
        v_ip_count int;
begin
  if v_last10 !~ '^[6-9]\d{9}$' then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_phone');
  end if;

  select count(*) into v_phone_count from auth_sms_requests
    where phone = v_last10 and created_at > now() - interval '1 hour';
  if v_phone_count >= 3 then
    return jsonb_build_object('allowed', false, 'reason', 'too_many_for_phone');
  end if;

  if p_ip is not null then
    select count(*) into v_ip_count from auth_sms_requests
      where ip = p_ip and created_at > now() - interval '1 hour';
    if v_ip_count >= 10 then
      return jsonb_build_object('allowed', false, 'reason', 'too_many_for_ip');
    end if;
  end if;

  insert into auth_sms_requests (phone, ip) values (v_last10, p_ip);
  return jsonb_build_object('allowed', true);
end $function$;

ALTER FUNCTION "mimipip"."sms_otp_request_allowed"(p_phone text, p_ip text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.stamp_retail_paid_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if new.payment_status::text = 'paid'
     and (tg_op = 'INSERT' or old.payment_status::text is distinct from 'paid')
     and new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$function$;

ALTER FUNCTION "mimipip"."stamp_retail_paid_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.storage_content_hash(p_url text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_path text; v_etag text;
begin
  if coalesce(p_url,'') = '' then return null; end if;
  if position('/storage/v1/object/public/mimipip-product-images/' in p_url) = 0 then return null; end if;

  v_path := split_part(p_url, '/storage/v1/object/public/mimipip-product-images/', 2);
  if coalesce(v_path,'') = '' then return null; end if;

  select replace(o.metadata->>'eTag', '"', '') into v_etag
    from storage.objects o
   where o.bucket_id = 'mimipip-product-images' and o.name = v_path
   limit 1;

  if v_etag is null or position('-' in v_etag) > 0 then return null; end if;
  return v_etag;
end; $function$;

ALTER FUNCTION "mimipip"."storage_content_hash"(p_url text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.submit_contact(p_name text, p_email text, p_message text, p_topic text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  if p_message is null or length(trim(p_message)) < 2 then raise exception 'empty message'; end if;
  insert into contact_messages (name, email, message, topic)
  values (p_name, lower(trim(p_email)), p_message, p_topic);
end; $function$;

ALTER FUNCTION "mimipip"."submit_contact"(p_name text, p_email text, p_message text, p_topic text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.submit_verified_review(p_handle text, p_order_number bigint, p_email text, p_rating integer, p_author text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_product uuid; v_order uuid;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating 1-5'; end if;
  select id into v_product from products where handle = p_handle and status = 'active';
  if not found then raise exception 'unknown product'; end if;

  select o.id into v_order
  from orders o
  join order_items oi on oi.order_id = o.id
  where o.order_number = p_order_number
    and lower(o.email) = lower(btrim(p_email))
    and o.payment_status = 'paid'
    and oi.product_id = v_product
  limit 1;
  if v_order is null then
    raise exception 'no_verified_purchase';
  end if;

  if exists (select 1 from reviews where order_id = v_order and product_id = v_product) then
    raise exception 'already_reviewed';
  end if;

  insert into reviews (product_id, rating, author_name, body, status, verified, order_id)
  values (v_product, p_rating, nullif(btrim(coalesce(p_author,'')),''),
          nullif(btrim(coalesce(p_body,'')),''), 'published', true, v_order);
  return jsonb_build_object('ok', true);
end; $function$;

ALTER FUNCTION "mimipip"."submit_verified_review"(p_handle text, p_order_number bigint, p_email text, p_rating integer, p_author text, p_body text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.sync_limited_edition_tag()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if coalesce(new.is_limited, false) then
    insert into product_tags (product_id, tag)
    values (new.id, 'Limited Edition')
    on conflict (product_id, tag) do nothing;
  else
    delete from product_tags
     where product_id = new.id and tag = 'Limited Edition';
  end if;
  return new;
end; $function$;

ALTER FUNCTION "mimipip"."sync_limited_edition_tag"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.taste_get(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v taste_profiles;
begin
  select * into v from taste_profiles where token = p_token;
  if v.token is null then return null; end if;
  return jsonb_build_object('embedding', v.embedding::text, 'events', v.events, 'seen', to_jsonb(v.seen));
end; $function$;

ALTER FUNCTION "mimipip"."taste_get"(p_token uuid) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.taste_set(p_token uuid, p_embedding text, p_seen_add text, p_events integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  insert into taste_profiles (token, embedding, events, seen, updated_at)
  values (p_token, p_embedding::vector, greatest(coalesce(p_events,1),1),
          case when p_seen_add is null then '{}' else array[p_seen_add] end, now())
  on conflict (token) do update set
    embedding = p_embedding::vector,
    events = taste_profiles.events + greatest(coalesce(p_events,1),1),
    seen = (select coalesce(array_agg(x), '{}') from (
              select distinct x from unnest(
                case when p_seen_add is null then taste_profiles.seen
                     else taste_profiles.seen || p_seen_add end) as x
              limit 80) s),
    updated_at = now();
end; $function$;

ALTER FUNCTION "mimipip"."taste_set"(p_token uuid, p_embedding text, p_seen_add text, p_events integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.to_indian_mobile(raw text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare d text;
begin
  d := regexp_replace(coalesce(raw, ''), '\D', '', 'g');
  d := regexp_replace(d, '^0+', '');
  if length(d) = 12 and left(d, 2) = '91' then d := substr(d, 3); end if;
  if d ~ '^[6-9][0-9]{9}$' then return d; end if;
  return null;
end $function$;

ALTER FUNCTION "mimipip"."to_indian_mobile"(raw text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_assign_aesthetic_rank()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_lo double precision; v_hi double precision;
begin
  if new.status = 'active'
     and new.aesthetic_rank is null
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select lo, hi into v_lo, v_hi from debut_rank_band();
    new.aesthetic_rank := (v_lo + v_hi) / 2;
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_assign_aesthetic_rank"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_customer_from_gift()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  perform upsert_customer(new.purchaser_email, null, null, 'gift');
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_customer_from_gift"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_customer_from_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  perform upsert_customer(new.email, new.phone, new.shipping_address ->> 'name', 'order');
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_customer_from_order"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_enqueue_retag_on_publish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    insert into retag_queue (product_id, missing, status)
    select new.id, g.missing, 'queued' from catalogue_gaps g where g.id = new.id
    on conflict (product_id) do update
      set missing = excluded.missing, status = 'queued', claimed_at = null, updated_at = now();
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_enqueue_retag_on_publish"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_order_items_contribution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  perform mimipip.compute_order_contribution(coalesce(new.order_id, old.order_id));
  return null;
end;
$function$;

ALTER FUNCTION "mimipip"."trg_order_items_contribution"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_product_materials_autograph_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_tier text; v_slug text;
begin
  select price_tier into v_tier from products where id=new.product_id;
  if v_tier is distinct from 'autograph' then return new; end if;
  select slug into v_slug from materials where id=new.material_id;
  if v_slug=autograph_material_slug() then
    new.price_per_sqft:=autograph_product_rate(new.product_id);
    new.available:=true;
  else new.available:=false;
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_product_materials_autograph_guard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_product_tags_search_tsv()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_id uuid;
begin
  v_id := coalesce(new.product_id, old.product_id);
  update products set search_tsv = build_search_tsv(v_id) where id = v_id;
  return null;
end $function$;

ALTER FUNCTION "mimipip"."trg_product_tags_search_tsv"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_products_autograph_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  if new.price_tier = 'autograph'
     and (tg_op = 'INSERT' or old.price_tier is distinct from new.price_tier) then
    perform apply_autograph_materials(new.id);
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_products_autograph_pricing"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_products_search_tsv()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
begin
  update products set search_tsv = build_search_tsv(new.id) where id = new.id;
  return null;
end $function$;

ALTER FUNCTION "mimipip"."trg_products_search_tsv"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_room_exclusion_images()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_room text;
begin
  if new.scene_key is null then return new; end if;
  v_room := room_key_for(null, new.scene_key);
  if v_room is not null and deity_free_room(v_room) and is_deity_design(new.product_id) then
    insert into room_exclusions (product_id, room_key, reason, decided_by)
    values (new.product_id, v_room, 'Deity painting; never sold into this room', 'deity guard')
    on conflict (product_id, room_key) do nothing;
  end if;
  if v_room is not null and exists (
    select 1 from room_exclusions e where e.product_id = new.product_id and e.room_key = v_room
  ) then
    insert into room_exclusion_hits (product_id, room_key, source) values (new.product_id, v_room, 'scene:' || new.scene_key);
    return null;
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_room_exclusion_images"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.trg_room_exclusion_tags()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_room text := room_key_for(new.tag, null);
begin
  -- A god is never filed as playful decor: the Playful page is where parents
  -- browse for children's rooms (founder, 4 Oct 2026).
  if new.tag = 'Mood: Playful' and is_deity_design(new.product_id) then
    return null;
  end if;
  if v_room is not null and deity_free_room(v_room) and is_deity_design(new.product_id) then
    insert into room_exclusions (product_id, room_key, reason, decided_by)
    values (new.product_id, v_room, 'Deity painting; never sold into this room', 'deity guard')
    on conflict (product_id, room_key) do nothing;
  end if;
  if v_room is not null and exists (
    select 1 from room_exclusions e where e.product_id = new.product_id and e.room_key = v_room
  ) then
    insert into room_exclusion_hits (product_id, room_key, source) values (new.product_id, v_room, 'tag:' || new.tag);
    return null;
  end if;
  return new;
end $function$;

ALTER FUNCTION "mimipip"."trg_room_exclusion_tags"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.upsert_customer(p_email text, p_phone text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_source text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
declare v_id uuid;
        v_email text := nullif(lower(trim(p_email)), '');
        v_phone text := to_indian_mobile(p_phone);
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return null; end if;
  insert into customers (email, phone, name, source)
  values (v_email, v_phone, nullif(trim(p_name), ''), p_source)
  on conflict (lower(email)) do update set
    phone      = coalesce(customers.phone, excluded.phone),
    name       = coalesce(customers.name, excluded.name),
    source     = coalesce(customers.source, excluded.source),
    updated_at = now()
  returning id into v_id;
  return v_id;
end $function$;

ALTER FUNCTION "mimipip"."upsert_customer"(p_email text, p_phone text, p_name text, p_source text) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION mimipip.visitor_first_touch(p_token uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'mimipip', 'mimipip_private', 'extensions', 'pg_temp'
AS $function$
  select coalesce(
    (select jsonb_build_object(
              'source',   e.meta->>'source',
              'medium',   e.meta->>'medium',
              'campaign', e.meta->>'campaign',
              'landing',  e.meta->>'landing',
              'at',       e.created_at)
       from mimipip.site_events e
      where e.token = p_token
        and coalesce(e.meta->>'source','direct') not in ('internal','direct')
      order by e.created_at
      limit 1),
    (select jsonb_build_object(
              'source',  coalesce(e.meta->>'source','direct'),
              'medium',  coalesce(e.meta->>'medium','none'),
              'landing', e.meta->>'landing',
              'at',      e.created_at)
       from mimipip.site_events e
      where e.token = p_token
      order by e.created_at
      limit 1),
    '{}'::jsonb
  );
$function$;

ALTER FUNCTION "mimipip"."visitor_first_touch"(p_token uuid) OWNER TO "postgres";

ALTER TABLE "mimipip"."DoNotContact" ALTER COLUMN "reason" SET DEFAULT 'opted_out'::text;

ALTER TABLE "mimipip"."DoNotContact" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "mimipip"."Lead" ALTER COLUMN "brand" SET DEFAULT 'mimipip'::text;

ALTER TABLE "mimipip"."Lead" ALTER COLUMN "segment" SET DEFAULT 'UNKNOWN'::"LeadSegment";

ALTER TABLE "mimipip"."Lead" ALTER COLUMN "status" SET DEFAULT 'NEW'::"LeadStatus";

ALTER TABLE "mimipip"."Lead" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "mimipip"."auth_email_codes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."auth_email_codes" ALTER COLUMN "attempts" SET DEFAULT 0;

ALTER TABLE "mimipip"."auth_email_codes" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."auth_otp_requests" ALTER COLUMN "id" SET DEFAULT nextval('mimipip.auth_otp_requests_id_seq'::regclass);

ALTER TABLE "mimipip"."auth_otp_requests" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."auth_sms_requests" ALTER COLUMN "id" SET DEFAULT nextval('mimipip.auth_sms_requests_id_seq'::regclass);

ALTER TABLE "mimipip"."auth_sms_requests" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."board_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."board_items" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."boards" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."boards" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."cart_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."cart_items" ALTER COLUMN "quantity" SET DEFAULT 1;

ALTER TABLE "mimipip"."cart_items" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."carts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."carts" ALTER COLUMN "status" SET DEFAULT 'open'::cart_status;

ALTER TABLE "mimipip"."carts" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."carts" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."character_requests" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."character_requests" ALTER COLUMN "channel" SET DEFAULT 'chat'::text;

ALTER TABLE "mimipip"."character_requests" ALTER COLUMN "shown_handles" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."chat_messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."chat_messages" ALTER COLUMN "surface" SET DEFAULT 'concierge'::text;

ALTER TABLE "mimipip"."chat_messages" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."chat_sessions" ALTER COLUMN "source" SET DEFAULT 'concierge'::text;

ALTER TABLE "mimipip"."chat_sessions" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."chat_sessions" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."checkout_failures" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."checkout_failures" ALTER COLUMN "meta" SET DEFAULT '{}'::jsonb;

ALTER TABLE "mimipip"."checkout_failures" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."collection_launches" ALTER COLUMN "window_days" SET DEFAULT 14;

ALTER TABLE "mimipip"."collection_launches" ALTER COLUMN "teaser_days" SET DEFAULT 7;

ALTER TABLE "mimipip"."collection_launches" ALTER COLUMN "hero_handles" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."collection_launches" ALTER COLUMN "teaser_handles" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."collection_launches" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."collection_stories" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."collection_stories" ALTER COLUMN "ambient" SET DEFAULT false;

ALTER TABLE "mimipip"."collection_stories" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."collection_stories" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."collections" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."collections" ALTER COLUMN "kind" SET DEFAULT 'category'::collection_kind;

ALTER TABLE "mimipip"."collections" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."collections" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."collections" ALTER COLUMN "is_signature" SET DEFAULT false;

ALTER TABLE "mimipip"."concept_shop_designs" ALTER COLUMN "requires_preparation" SET DEFAULT false;

ALTER TABLE "mimipip"."concept_shop_designs" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."concierge_events" ALTER COLUMN "is_test" SET DEFAULT false;

ALTER TABLE "mimipip"."concierge_events" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."contact_messages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."contact_messages" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "rate_per_sqft" SET DEFAULT 254.24;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "gst_pct" SET DEFAULT 18;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "pricing_mode" SET DEFAULT 'flat_rate'::text;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "discount_pct" SET DEFAULT 0;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "print_gate" SET DEFAULT 'credit'::text;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "followup_active" SET DEFAULT false;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "proposal_validity_days" SET DEFAULT 30;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "channel_kind" SET DEFAULT 'online'::text;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "account_type" SET DEFAULT 'offline'::text;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "credit_limit_waived" SET DEFAULT false;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "portfolio_mode" SET DEFAULT false;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "domain_self_join" SET DEFAULT false;

ALTER TABLE "mimipip"."corporate_accounts" ALTER COLUMN "shortlist_handles" SET DEFAULT '[]'::jsonb;

ALTER TABLE "mimipip"."corporate_designs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_designs" ALTER COLUMN "status" SET DEFAULT 'approved'::text;

ALTER TABLE "mimipip"."corporate_designs" ALTER COLUMN "uploaded_by" SET DEFAULT 'studio'::text;

ALTER TABLE "mimipip"."corporate_designs" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_designs" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_designs" ALTER COLUMN "design_code" SET DEFAULT generate_design_code();

ALTER TABLE "mimipip"."corporate_designs" ALTER COLUMN "print_type" SET DEFAULT 'wallpaper'::text;

ALTER TABLE "mimipip"."corporate_jobs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_jobs" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_orders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_orders" ALTER COLUMN "status" SET DEFAULT 'submitted'::text;

ALTER TABLE "mimipip"."corporate_orders" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_orders" ALTER COLUMN "excluded_sqft" SET DEFAULT 0;

ALTER TABLE "mimipip"."corporate_orders" ALTER COLUMN "print_type" SET DEFAULT 'wallpaper'::text;

ALTER TABLE "mimipip"."corporate_showrooms" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_showrooms" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."corporate_showrooms" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_site_areas" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_site_areas" ALTER COLUMN "sort" SET DEFAULT 0;

ALTER TABLE "mimipip"."corporate_site_areas" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."corporate_site_areas" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_site_areas" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_site_batch_walls" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_site_batch_walls" ALTER COLUMN "design_ids" SET DEFAULT '{}'::uuid[];

ALTER TABLE "mimipip"."corporate_site_batch_walls" ALTER COLUMN "order_refs" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."corporate_site_batch_walls" ALTER COLUMN "status" SET DEFAULT 'measured'::text;

ALTER TABLE "mimipip"."corporate_site_batch_walls" ALTER COLUMN "compose_attempts" SET DEFAULT 0;

ALTER TABLE "mimipip"."corporate_site_batch_walls" ALTER COLUMN "suggested" SET DEFAULT false;

ALTER TABLE "mimipip"."corporate_site_batch_walls" ALTER COLUMN "turns_into_next" SET DEFAULT false;

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "status" SET DEFAULT 'collecting'::text;

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "series_names" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "source" SET DEFAULT 'calculator'::text;

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "revision" SET DEFAULT 1;

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "drive_attempts" SET DEFAULT 0;

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "intake_files" SET DEFAULT '{}'::jsonb;

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "entrance_in_scope" SET DEFAULT true;

ALTER TABLE "mimipip"."corporate_site_batches" ALTER COLUMN "hold_proposal" SET DEFAULT false;

ALTER TABLE "mimipip"."corporate_stores" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_stores" ALTER COLUMN "series_names" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."corporate_stores" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."corporate_stores" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_stores" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_wall_studies" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."corporate_wall_studies" ALTER COLUMN "status" SET DEFAULT 'draft'::text;

ALTER TABLE "mimipip"."corporate_wall_studies" ALTER COLUMN "sort" SET DEFAULT 0;

ALTER TABLE "mimipip"."corporate_wall_studies" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_wall_studies" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."corporate_wall_studies" ALTER COLUMN "revision" SET DEFAULT 0;

ALTER TABLE "mimipip"."corporate_wall_studies" ALTER COLUMN "customisation_required" SET DEFAULT false;

ALTER TABLE "mimipip"."customers" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."customers" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."customers" ALTER COLUMN "marketing_opt_in" SET DEFAULT false;

ALTER TABLE "mimipip"."customers" ALTER COLUMN "unsubscribe_token" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."customers" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."customers" ALTER COLUMN "segment" SET DEFAULT 'basic'::text;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "exclusive_available" SET DEFAULT false;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "premium_percent" SET DEFAULT 30;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "history_verified" SET DEFAULT false;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "historical_orders" SET DEFAULT 0;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "historical_customers" SET DEFAULT 0;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "historical_area_sqft" SET DEFAULT 0;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "history_note" SET DEFAULT ''::text;

ALTER TABLE "mimipip"."design_commercial_policy" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."design_exclusivity" ALTER COLUMN "reserved_at" SET DEFAULT now();

ALTER TABLE "mimipip"."design_exclusivity" ALTER COLUMN "state" SET DEFAULT 'reserved'::text;

ALTER TABLE "mimipip"."gift_cards" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."gift_cards" ALTER COLUMN "currency" SET DEFAULT 'INR'::text;

ALTER TABLE "mimipip"."gift_cards" ALTER COLUMN "status" SET DEFAULT 'pending_payment'::text;

ALTER TABLE "mimipip"."gift_cards" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."gift_cards" ALTER COLUMN "design" SET DEFAULT 'general'::text;

ALTER TABLE "mimipip"."identity_link" ALTER COLUMN "linked_at" SET DEFAULT now();

ALTER TABLE "mimipip"."ink_coverage_classes" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."installed_wall_photos" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."installed_wall_photos" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."installed_wall_photos" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "status" SET DEFAULT 'not been posted yet'::text;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "format" SET DEFAULT 'reel'::text;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "instagram" SET DEFAULT '{}'::jsonb;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "youtube" SET DEFAULT '{}'::jsonb;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "posts" SET DEFAULT '[]'::jsonb;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "removed_posts" SET DEFAULT '[]'::jsonb;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "clearance" SET DEFAULT '{"music": {"state": "pending"}, "voice": {"state": "pending"}, "listening": {"state": "pending"}}'::jsonb;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "site_enabled" SET DEFAULT true;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "site_state" SET DEFAULT 'off'::text;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "site_attempts" SET DEFAULT 0;

ALTER TABLE "mimipip"."marketing_asset_library" ALTER COLUMN "captions_attempts" SET DEFAULT 0;

ALTER TABLE "mimipip"."materials" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."materials" ALTER COLUMN "default_price_per_sqft" SET DEFAULT 0;

ALTER TABLE "mimipip"."materials" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."materials" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."materials" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."materials" ALTER COLUMN "coming_soon" SET DEFAULT false;

ALTER TABLE "mimipip"."materials" ALTER COLUMN "install_type" SET DEFAULT 'paste'::text;

ALTER TABLE "mimipip"."media_reservations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."media_reservations" ALTER COLUMN "opened_at" SET DEFAULT now();

ALTER TABLE "mimipip"."media_reservations" ALTER COLUMN "closed_by_override" SET DEFAULT false;

ALTER TABLE "mimipip"."newsletter_signups" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."newsletter_signups" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."order_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."order_items" ALTER COLUMN "quantity" SET DEFAULT 1;

ALTER TABLE "mimipip"."order_items" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."orders" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."orders" ALTER COLUMN "status" SET DEFAULT 'pending'::order_status;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "payment_status" SET DEFAULT 'pending'::payment_status;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "currency" SET DEFAULT 'INR'::text;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "subtotal" SET DEFAULT 0;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "shipping" SET DEFAULT 0;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "tax" SET DEFAULT 0;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "total" SET DEFAULT 0;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "placed_via" SET DEFAULT 'web'::text;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."orders" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."orders" ALTER COLUMN "fulfillment_type" SET DEFAULT 'made_to_order'::text;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "access_token" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."orders" ALTER COLUMN "shipping_speed" SET DEFAULT 'standard'::text;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "discount" SET DEFAULT 0;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "contribution_rate" SET DEFAULT 1;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "contribution_currency" SET DEFAULT 'INR'::text;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "contribution_status" SET DEFAULT 'calculated'::text;

ALTER TABLE "mimipip"."orders" ALTER COLUMN "markup_total" SET DEFAULT 0;

ALTER TABLE "mimipip"."partner_private_confirmations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."partner_private_confirmations" ALTER COLUMN "status" SET DEFAULT 'confirmed_awaiting_po'::text;

ALTER TABLE "mimipip"."partner_private_confirmations" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."partner_private_options" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."partner_private_options" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."partner_private_projects" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."partner_private_projects" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."partner_release_outbox" ALTER COLUMN "state" SET DEFAULT 'pending'::text;

ALTER TABLE "mimipip"."partner_release_outbox" ALTER COLUMN "attempts" SET DEFAULT 0;

ALTER TABLE "mimipip"."partner_release_outbox" ALTER COLUMN "available_at" SET DEFAULT now();

ALTER TABLE "mimipip"."partner_release_outbox" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."popular_designs_cache" ALTER COLUMN "refreshed_at" SET DEFAULT now();

ALTER TABLE "mimipip"."price_tiers" ALTER COLUMN "exclusive" SET DEFAULT false;

ALTER TABLE "mimipip"."price_tiers" ALTER COLUMN "pins_rate" SET DEFAULT false;

ALTER TABLE "mimipip"."price_tiers" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."price_tiers" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_jobs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."print_jobs" ALTER COLUMN "status" SET DEFAULT 'pending'::print_status;

ALTER TABLE "mimipip"."print_jobs" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_modes" ALTER COLUMN "is_default" SET DEFAULT false;

ALTER TABLE "mimipip"."print_modes" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."print_product_types" ALTER COLUMN "overlap_mm" SET DEFAULT 15;

ALTER TABLE "mimipip"."print_product_types" ALTER COLUMN "nest_across" SET DEFAULT false;

ALTER TABLE "mimipip"."print_product_types" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_product_types" ALTER COLUMN "billing_trim_mm" SET DEFAULT 40;

ALTER TABLE "mimipip"."print_queue" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."print_queue" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_queue" ALTER COLUMN "priority" SET DEFAULT 0;

ALTER TABLE "mimipip"."print_queue_deletions" ALTER COLUMN "id" SET DEFAULT nextval('mimipip.print_queue_deletions_id_seq'::regclass);

ALTER TABLE "mimipip"."print_queue_deletions" ALTER COLUMN "deleted_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_runs" ALTER COLUMN "num_panels" SET DEFAULT 1;

ALTER TABLE "mimipip"."print_runs" ALTER COLUMN "panels" SET DEFAULT '[]'::jsonb;

ALTER TABLE "mimipip"."print_runs" ALTER COLUMN "delivered_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_runs" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_runs" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."print_runs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "min_order_qty" SET DEFAULT 1;

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "supports_custom_size" SET DEFAULT true;

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "supports_visualiser" SET DEFAULT true;

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "supports_materials" SET DEFAULT true;

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "supports_samples" SET DEFAULT true;

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."product_categories" ALTER COLUMN "supports_fixed_sizes" SET DEFAULT false;

ALTER TABLE "mimipip"."product_images" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."product_images" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."product_images" ALTER COLUMN "is_featured" SET DEFAULT false;

ALTER TABLE "mimipip"."product_images" ALTER COLUMN "is_flat" SET DEFAULT false;

ALTER TABLE "mimipip"."product_materials" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."product_materials" ALTER COLUMN "available" SET DEFAULT true;

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "source" SET DEFAULT 'website'::text;

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "was_upscaled" SET DEFAULT false;

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "status" SET DEFAULT 'processed'::text;

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "queued_for_print" SET DEFAULT false;

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "processed_at" SET DEFAULT now();

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "files_deleted" SET DEFAULT false;

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "paper_consumed" SET DEFAULT false;

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."production_jobs" ALTER COLUMN "panel_sample" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."products" ALTER COLUMN "status" SET DEFAULT 'active'::product_status;

ALTER TABLE "mimipip"."products" ALTER COLUMN "vendor" SET DEFAULT 'Mimi Pip'::text;

ALTER TABLE "mimipip"."products" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."products" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."products" ALTER COLUMN "flat_verified" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "is_signature" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "is_new" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "is_showroom_favourite" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "is_limited" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "is_founders_favourite" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "is_service" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "category" SET DEFAULT 'wallpaper'::text;

ALTER TABLE "mimipip"."products" ALTER COLUMN "is_seamless" SET DEFAULT false;

ALTER TABLE "mimipip"."products" ALTER COLUMN "price_tier" SET DEFAULT 'standard'::text;

ALTER TABLE "mimipip"."products" ALTER COLUMN "master_status" SET DEFAULT 'none'::text;

ALTER TABLE "mimipip"."retag_queue" ALTER COLUMN "missing" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."retag_queue" ALTER COLUMN "status" SET DEFAULT 'queued'::text;

ALTER TABLE "mimipip"."retag_queue" ALTER COLUMN "attempts" SET DEFAULT 0;

ALTER TABLE "mimipip"."retag_queue" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."retag_queue" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."reviews" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."reviews" ALTER COLUMN "status" SET DEFAULT 'pending'::text;

ALTER TABLE "mimipip"."reviews" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."reviews" ALTER COLUMN "verified" SET DEFAULT false;

ALTER TABLE "mimipip"."room_exclusion_hits" ALTER COLUMN "at" SET DEFAULT now();

ALTER TABLE "mimipip"."room_exclusions" ALTER COLUMN "decided_by" SET DEFAULT 'room-suitability audit'::text;

ALTER TABLE "mimipip"."room_exclusions" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."royalty_partners" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."royalty_partners" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."search_synonyms" ALTER COLUMN "id" SET DEFAULT nextval('mimipip.search_synonyms_id_seq'::regclass);

ALTER TABLE "mimipip"."showcase_pool_cache" ALTER COLUMN "refreshed_at" SET DEFAULT now();

ALTER TABLE "mimipip"."site_events" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."site_events" ALTER COLUMN "emitted_by" SET DEFAULT 'client'::text;

ALTER TABLE "mimipip"."size_presets" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."size_presets" ALTER COLUMN "position" SET DEFAULT 0;

ALTER TABLE "mimipip"."size_presets" ALTER COLUMN "active" SET DEFAULT true;

ALTER TABLE "mimipip"."taste_profiles" ALTER COLUMN "events" SET DEFAULT 0;

ALTER TABLE "mimipip"."taste_profiles" ALTER COLUMN "seen" SET DEFAULT '{}'::text[];

ALTER TABLE "mimipip"."taste_profiles" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."trade_contacts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."trade_contacts" ALTER COLUMN "kind" SET DEFAULT 'designer'::text;

ALTER TABLE "mimipip"."trade_contacts" ALTER COLUMN "unsubscribe_token" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."trade_contacts" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."trade_contacts" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "status" SET DEFAULT 'draft'::text;

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "gst_declared_none" SET DEFAULT false;

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "entity_docs" SET DEFAULT '[]'::jsonb;

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "commission_pct" SET DEFAULT 20;

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "markup_cap_pct" SET DEFAULT 25;

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "tds_pct" SET DEFAULT 2;

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "mimipip"."trade_partners" ALTER COLUMN "updated_at" SET DEFAULT now();

ALTER TABLE "mimipip"."wishlist_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "mimipip"."wishlist_items" ALTER COLUMN "created_at" SET DEFAULT now();

CREATE VIEW "mimipip"."design_sale_history" WITH (security_invoker=true) AS
 SELECT design_sales.order_item_id,
    design_sales.product_id,
    design_sales.order_id,
    design_sales.customer_key,
    design_sales.area_sqft,
    design_sales.first_paid_at,
    design_sales.order_status,
    design_sales.payment_status
   FROM design_sales
UNION ALL
 SELECT corporate_design_sales.order_item_id,
    corporate_design_sales.product_id,
    corporate_design_sales.order_id,
    corporate_design_sales.customer_key,
    corporate_design_sales.area_sqft,
    corporate_design_sales.first_paid_at,
    corporate_design_sales.order_status,
    corporate_design_sales.payment_status
   FROM corporate_design_sales;

ALTER VIEW "mimipip"."design_sale_history" OWNER TO "postgres";

CREATE VIEW "mimipip"."catalogue_health" AS
 SELECT id,
    handle,
    title,
    category,
    created_at,
    (EXISTS ( SELECT 1
           FROM (product_tags t
             JOIN collections c ON ((c.rule_tag = t.tag)))
          WHERE ((t.product_id = p.id) AND (c.kind = 'category'::collection_kind) AND ((c.category_scope IS NULL) OR (c.category_scope = p.category))))) AS has_browse,
    (EXISTS ( SELECT 1
           FROM (product_tags t
             JOIN collections c ON ((c.rule_tag = t.tag)))
          WHERE ((t.product_id = p.id) AND (c.kind = 'color'::collection_kind) AND ((c.category_scope IS NULL) OR (c.category_scope = p.category)) AND (c.rule_tag = ANY (ARRAY['Neutral'::text, 'Black'::text, 'Blue'::text, 'Brown'::text, 'Green'::text, 'Grey'::text, 'Orange'::text, 'Pink'::text, 'Purple'::text, 'Red'::text, 'Turquoise'::text, 'White'::text, 'Yellow'::text]))))) AS has_colour,
    (EXISTS ( SELECT 1
           FROM (product_tags t
             JOIN collections c ON ((c.rule_tag = t.tag)))
          WHERE ((t.product_id = p.id) AND (c.kind = 'room'::collection_kind)))) AS has_room,
    (EXISTS ( SELECT 1
           FROM product_tags t
          WHERE ((t.product_id = p.id) AND (t.tag ~~ 'Mood: %'::text)))) AS has_mood,
    (image_embedding IS NOT NULL) AS has_embedding
   FROM products p
  WHERE ((religion IS NULL) AND ((status = 'active'::product_status) AND (NOT COALESCE(is_service, false))));

ALTER VIEW "mimipip"."catalogue_health" OWNER TO "postgres";

CREATE VIEW "mimipip"."catalogue_gaps" WITH (security_invoker=on) AS
 SELECT id,
    handle,
    title,
    category,
    created_at,
    has_browse,
    has_colour,
    has_room,
    has_mood,
    has_embedding,
    array_remove(ARRAY[
        CASE
            WHEN (NOT has_browse) THEN 'browse'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (NOT has_colour) THEN 'colour'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (NOT has_room) THEN 'room'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (NOT has_mood) THEN 'mood'::text
            ELSE NULL::text
        END,
        CASE
            WHEN (NOT has_embedding) THEN 'embedding'::text
            ELSE NULL::text
        END], NULL::text) AS missing
   FROM catalogue_health h
  WHERE (NOT (has_browse AND has_colour AND has_room AND has_mood AND has_embedding));

ALTER VIEW "mimipip"."catalogue_gaps" OWNER TO "postgres";

ALTER TABLE "mimipip"."size_presets" ADD CONSTRAINT "size_presets_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."collections" ADD CONSTRAINT "collections_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."order_items" ADD CONSTRAINT "order_items_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."cart_items" ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."carts" ADD CONSTRAINT "carts_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."print_jobs" ADD CONSTRAINT "print_jobs_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."boards" ADD CONSTRAINT "boards_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."board_items" ADD CONSTRAINT "board_items_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."contact_messages" ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."product_materials" ADD CONSTRAINT "product_materials_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."product_tags" ADD CONSTRAINT "product_tags_pkey" PRIMARY KEY (product_id, tag);

ALTER TABLE "mimipip"."newsletter_signups" ADD CONSTRAINT "newsletter_signups_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."materials" ADD CONSTRAINT "materials_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."reviews" ADD CONSTRAINT "reviews_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."taste_profiles" ADD CONSTRAINT "taste_profiles_pkey" PRIMARY KEY (token);

ALTER TABLE "mimipip"."chat_messages" ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."site_events" ADD CONSTRAINT "site_events_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."gift_cards" ADD CONSTRAINT "gift_cards_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."trade_partners" ADD CONSTRAINT "trade_partners_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."ink_coverage_classes" ADD CONSTRAINT "ink_coverage_classes_pkey" PRIMARY KEY (slug);

ALTER TABLE "mimipip"."print_modes" ADD CONSTRAINT "print_modes_pkey" PRIMARY KEY (slug);

ALTER TABLE "mimipip"."corporate_showrooms" ADD CONSTRAINT "corporate_showrooms_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."auth_otp_requests" ADD CONSTRAINT "auth_otp_requests_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."product_images" ADD CONSTRAINT "product_images_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."product_categories" ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY (slug);

ALTER TABLE "mimipip"."corporate_jobs" ADD CONSTRAINT "corporate_jobs_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."identity_link" ADD CONSTRAINT "identity_link_pkey" PRIMARY KEY (visitor_token, customer_id);

ALTER TABLE "mimipip"."print_product_types" ADD CONSTRAINT "print_product_types_pkey" PRIMARY KEY (slug);

ALTER TABLE "mimipip"."corporate_stores" ADD CONSTRAINT "corporate_stores_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."checkout_failures" ADD CONSTRAINT "checkout_failures_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."retag_queue" ADD CONSTRAINT "retag_queue_pkey" PRIMARY KEY (product_id);

ALTER TABLE "mimipip"."collection_launches" ADD CONSTRAINT "collection_launches_pkey" PRIMARY KEY (collection_handle);

ALTER TABLE "mimipip"."partner_private_projects" ADD CONSTRAINT "partner_private_projects_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."auth_sms_requests" ADD CONSTRAINT "auth_sms_requests_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."price_tiers" ADD CONSTRAINT "price_tiers_pkey" PRIMARY KEY (slug);

ALTER TABLE "mimipip"."auth_email_codes" ADD CONSTRAINT "auth_email_codes_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."collection_stories" ADD CONSTRAINT "collection_stories_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."royalty_partners" ADD CONSTRAINT "royalty_partners_pkey" PRIMARY KEY (slug);

ALTER TABLE "mimipip"."search_synonyms" ADD CONSTRAINT "search_synonyms_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."corporate_site_areas" ADD CONSTRAINT "corporate_site_areas_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."concept_shop_designs" ADD CONSTRAINT "concept_shop_designs_pkey" PRIMARY KEY (concept_slug, product_id);

ALTER TABLE "mimipip"."corporate_design_sales" ADD CONSTRAINT "corporate_design_sales_pkey" PRIMARY KEY (order_item_id);

ALTER TABLE "mimipip"."design_exclusivity" ADD CONSTRAINT "design_exclusivity_pkey" PRIMARY KEY (product_id);

ALTER TABLE "mimipip"."design_commercial_policy" ADD CONSTRAINT "design_commercial_policy_pkey" PRIMARY KEY (product_id);

ALTER TABLE "mimipip"."design_sales" ADD CONSTRAINT "design_sales_pkey" PRIMARY KEY (order_item_id);

ALTER TABLE "mimipip"."Lead" ADD CONSTRAINT "Lead_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."DoNotContact" ADD CONSTRAINT "DoNotContact_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."print_queue_deletions" ADD CONSTRAINT "print_queue_deletions_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."popular_designs_cache" ADD CONSTRAINT "popular_designs_cache_pkey" PRIMARY KEY (p_days, rank);

ALTER TABLE "mimipip"."showcase_pool_cache" ADD CONSTRAINT "showcase_pool_cache_pkey" PRIMARY KEY (handle);

ALTER TABLE "mimipip"."trade_contacts" ADD CONSTRAINT "trade_contacts_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."orders" ADD CONSTRAINT "orders_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."wishlist_items" ADD CONSTRAINT "wishlist_items_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."room_scenes" ADD CONSTRAINT "room_scenes_pkey" PRIMARY KEY (room_key);

ALTER TABLE "mimipip"."room_exclusions" ADD CONSTRAINT "room_exclusions_pkey" PRIMARY KEY (product_id, room_key);

ALTER TABLE "mimipip"."room_exclusion_hits" ADD CONSTRAINT "room_exclusion_hits_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."print_runs" ADD CONSTRAINT "print_runs_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."print_queue" ADD CONSTRAINT "print_queue_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."production_jobs" ADD CONSTRAINT "production_jobs_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."installed_wall_photos" ADD CONSTRAINT "installed_wall_photos_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."media_reservations" ADD CONSTRAINT "media_reservations_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."character_requests" ADD CONSTRAINT "character_requests_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."chat_sessions" ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY (session_id);

ALTER TABLE "mimipip"."customers" ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."corporate_site_batches" ADD CONSTRAINT "corporate_site_batches_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."corporate_site_batch_walls" ADD CONSTRAINT "corporate_site_batch_walls_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."corporate_designs" ADD CONSTRAINT "corporate_designs_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."partner_private_options" ADD CONSTRAINT "partner_private_options_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."partner_private_confirmations" ADD CONSTRAINT "partner_private_confirmations_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."partner_release_outbox" ADD CONSTRAINT "partner_release_outbox_pkey" PRIMARY KEY (confirmation_id);

ALTER TABLE "mimipip"."corporate_wall_studies" ADD CONSTRAINT "corporate_wall_studies_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."concierge_events" ADD CONSTRAINT "concierge_events_pkey" PRIMARY KEY (id);

ALTER TABLE "mimipip"."collections" ADD CONSTRAINT "collections_handle_key" UNIQUE (handle);

ALTER TABLE "mimipip"."product_materials" ADD CONSTRAINT "product_materials_product_id_material_id_key" UNIQUE (product_id, material_id);

ALTER TABLE "mimipip"."newsletter_signups" ADD CONSTRAINT "newsletter_signups_email_key" UNIQUE (email);

ALTER TABLE "mimipip"."materials" ADD CONSTRAINT "materials_slug_key" UNIQUE (slug);

ALTER TABLE "mimipip"."gift_cards" ADD CONSTRAINT "gift_cards_code_key" UNIQUE (code);

ALTER TABLE "mimipip"."trade_partners" ADD CONSTRAINT "trade_partners_customer_id_key" UNIQUE (customer_id);

ALTER TABLE "mimipip"."corporate_showrooms" ADD CONSTRAINT "corporate_showrooms_account_id_state_city_name_key" UNIQUE (account_id, state, city, name);

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_email_domain_key" UNIQUE (email_domain);

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_slug_key" UNIQUE (slug);

ALTER TABLE "mimipip"."corporate_jobs" ADD CONSTRAINT "corporate_jobs_job_ref_key" UNIQUE (job_ref);

ALTER TABLE "mimipip"."corporate_stores" ADD CONSTRAINT "corporate_stores_account_id_code_key" UNIQUE (account_id, code);

ALTER TABLE "mimipip"."partner_private_projects" ADD CONSTRAINT "partner_private_projects_account_id_customer_id_key" UNIQUE (account_id, customer_id);

ALTER TABLE "mimipip"."corporate_site_areas" ADD CONSTRAINT "corporate_site_areas_store_id_code_key" UNIQUE (store_id, code);

ALTER TABLE "mimipip"."orders" ADD CONSTRAINT "orders_order_number_key" UNIQUE (order_number);

ALTER TABLE "mimipip"."wishlist_items" ADD CONSTRAINT "wishlist_items_customer_handle_key" UNIQUE (customer_id, product_handle);

ALTER TABLE "mimipip"."print_queue" ADD CONSTRAINT "print_queue_order_no_key" UNIQUE (order_no);

ALTER TABLE "mimipip"."production_jobs" ADD CONSTRAINT "production_jobs_order_no_key" UNIQUE (order_no);

ALTER TABLE "mimipip"."installed_wall_photos" ADD CONSTRAINT "installed_wall_photos_os_order_id_key" UNIQUE (os_order_id);

ALTER TABLE "mimipip"."media_reservations" ADD CONSTRAINT "media_reservations_release_id_key" UNIQUE (release_id);

ALTER TABLE "mimipip"."customers" ADD CONSTRAINT "customers_auth_user_id_key" UNIQUE (auth_user_id);

ALTER TABLE "mimipip"."corporate_designs" ADD CONSTRAINT "corporate_designs_design_code_key" UNIQUE (design_code);

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_handle_key" UNIQUE (handle);

ALTER TABLE "mimipip"."partner_private_confirmations" ADD CONSTRAINT "partner_private_confirmations_project_id_version_key" UNIQUE (project_id, version);

ALTER TABLE "mimipip"."corporate_wall_studies" ADD CONSTRAINT "corporate_wall_studies_wall_id_design_id_key" UNIQUE (wall_id, design_id);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_order_ref_key" UNIQUE (order_ref);

ALTER TABLE "mimipip"."collections" ADD CONSTRAINT "collections_card_mode_check" CHECK (((card_mode IS NULL) OR (card_mode = ANY (ARRAY['scene'::text, 'flat'::text, 'scene-preferred'::text]))));

ALTER TABLE "mimipip"."materials" ADD CONSTRAINT "materials_install_type_check" CHECK ((install_type = ANY (ARRAY['paste'::text, 'self_adhesive'::text])));

ALTER TABLE "mimipip"."reviews" ADD CONSTRAINT "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));

ALTER TABLE "mimipip"."chat_messages" ADD CONSTRAINT "chat_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])));

ALTER TABLE "mimipip"."site_events" ADD CONSTRAINT "site_events_emitted_by_check" CHECK ((emitted_by = ANY (ARRAY['client'::text, 'server'::text])));

ALTER TABLE "mimipip"."site_events" ADD CONSTRAINT "site_events_event_check" CHECK ((event = ANY (ARRAY['view'::text, 'visualize'::text, 'save'::text, 'sample'::text, 'cart'::text, 'chat'::text, 'session'::text, 'page_view'::text, 'cart_add'::text, 'checkout_start'::text, 'order_placed'::text, 'payment_captured'::text, 'refund'::text, 'lead_captured'::text, 'configuration_start'::text, 'save_prompt'::text, 'save_identify'::text, 'case_study_download'::text, 'film_play'::text, 'film_sound'::text, 'film_half'::text, 'film_complete'::text, 'film_cta'::text, 'purchase_progress'::text])));

ALTER TABLE "mimipip"."trade_partners" ADD CONSTRAINT "trade_partners_entity_type_check" CHECK ((entity_type = ANY (ARRAY['individual'::text, 'company'::text, 'partnership'::text])));

ALTER TABLE "mimipip"."trade_partners" ADD CONSTRAINT "trade_partners_proof_type_check" CHECK (((proof_type IS NULL) OR (proof_type = ANY (ARRAY['bill'::text, 'document'::text, 'instagram'::text]))));

ALTER TABLE "mimipip"."trade_partners" ADD CONSTRAINT "trade_partners_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'verifying'::text, 'active'::text, 'rejected'::text, 'suspended'::text])));

ALTER TABLE "mimipip"."print_modes" ADD CONSTRAINT "print_modes_throughput_sqm_per_hr_check" CHECK ((throughput_sqm_per_hr > (0)::numeric));

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_account_type_chk" CHECK ((account_type = ANY (ARRAY['online'::text, 'offline'::text, 'furniture'::text, 'aid'::text, 'builder'::text, 'corporate'::text, 'commercial'::text])));

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_channel_kind_chk" CHECK ((channel_kind = ANY (ARRAY['online'::text, 'offline'::text])));

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_credit_limit_chk" CHECK (((credit_limit_inr IS NULL) OR (credit_limit_inr > (0)::numeric)));

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_credit_terms_chk" CHECK (((credit_terms_days IS NULL) OR ((credit_terms_days >= 1) AND (credit_terms_days <= 365))));

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_pricing_mode_chk" CHECK ((pricing_mode = ANY (ARRAY['flat_rate'::text, 'website'::text])));

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_print_gate_chk" CHECK ((print_gate = ANY (ARRAY['credit'::text, 'payment_first'::text])));

ALTER TABLE "mimipip"."corporate_accounts" ADD CONSTRAINT "corporate_accounts_shortlist_handles_array" CHECK ((jsonb_typeof(shortlist_handles) = 'array'::text));

ALTER TABLE "mimipip"."product_images" ADD CONSTRAINT "product_images_dimensions_positive" CHECK ((((width IS NULL) OR (width > 0)) AND ((height IS NULL) OR (height > 0))));

ALTER TABLE "mimipip"."product_categories" ADD CONSTRAINT "product_categories_measurement_type_check" CHECK (((measurement_type IS NULL) OR (measurement_type = ANY (ARRAY['area'::text, 'length'::text, 'fixed'::text]))));

ALTER TABLE "mimipip"."product_categories" ADD CONSTRAINT "product_categories_pricing_unit_check" CHECK ((pricing_unit = ANY (ARRAY['sqft'::text, 'metre'::text, 'piece'::text])));

ALTER TABLE "mimipip"."collection_launches" ADD CONSTRAINT "collection_launches_teaser_days_check" CHECK (((teaser_days >= 0) AND (teaser_days <= 90)));

ALTER TABLE "mimipip"."collection_launches" ADD CONSTRAINT "collection_launches_window_days_check" CHECK (((window_days >= 1) AND (window_days <= 90)));

ALTER TABLE "mimipip"."partner_private_projects" ADD CONSTRAINT "partner_private_projects_customer_id_check" CHECK (((length(TRIM(BOTH FROM customer_id)) >= 1) AND (length(TRIM(BOTH FROM customer_id)) <= 120)));

ALTER TABLE "mimipip"."partner_private_projects" ADD CONSTRAINT "partner_private_projects_customer_name_check" CHECK (((length(TRIM(BOTH FROM customer_name)) >= 1) AND (length(TRIM(BOTH FROM customer_name)) <= 120)));

ALTER TABLE "mimipip"."collection_stories" ADD CONSTRAINT "collection_stories_kind_check" CHECK ((kind = ANY (ARRAY['video'::text, 'image'::text, 'quote'::text])));

ALTER TABLE "mimipip"."royalty_partners" ADD CONSTRAINT "royalty_partners_rate_check" CHECK (((rate > (0)::numeric) AND (rate <= (1)::numeric)));

ALTER TABLE "mimipip"."royalty_partners" ADD CONSTRAINT "royalty_partners_tds_rate_check" CHECK (((tds_rate IS NULL) OR ((tds_rate >= (0)::numeric) AND (tds_rate < (1)::numeric))));

ALTER TABLE "mimipip"."design_exclusivity" ADD CONSTRAINT "design_exclusivity_state_check" CHECK ((state = ANY (ARRAY['reserved'::text, 'exclusive'::text])));

ALTER TABLE "mimipip"."design_commercial_policy" ADD CONSTRAINT "design_commercial_policy_historical_area_sqft_check" CHECK ((historical_area_sqft >= (0)::numeric));

ALTER TABLE "mimipip"."design_commercial_policy" ADD CONSTRAINT "design_commercial_policy_historical_customers_check" CHECK ((historical_customers >= 0));

ALTER TABLE "mimipip"."design_commercial_policy" ADD CONSTRAINT "design_commercial_policy_historical_orders_check" CHECK ((historical_orders >= 0));

ALTER TABLE "mimipip"."design_commercial_policy" ADD CONSTRAINT "design_commercial_policy_premium_percent_check" CHECK (((premium_percent >= (0)::numeric) AND (premium_percent <= (300)::numeric)));

ALTER TABLE "mimipip"."trade_contacts" ADD CONSTRAINT "trade_contacts_email_check" CHECK (((email IS NULL) OR (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)));

ALTER TABLE "mimipip"."trade_contacts" ADD CONSTRAINT "trade_contacts_kind_check" CHECK ((kind = ANY (ARRAY['architect'::text, 'designer'::text, 'client'::text, 'other'::text])));

ALTER TABLE "mimipip"."trade_contacts" ADD CONSTRAINT "trade_contacts_mobile_check" CHECK (((mobile IS NULL) OR (mobile ~ '^[6-9][0-9]{9}$'::text)));

ALTER TABLE "mimipip"."trade_contacts" ADD CONSTRAINT "trade_contacts_reachable" CHECK (((mobile IS NOT NULL) OR (email IS NOT NULL)));

ALTER TABLE "mimipip"."orders" ADD CONSTRAINT "orders_shipping_speed_check" CHECK ((shipping_speed = ANY (ARRAY['standard'::text, 'express'::text])));

ALTER TABLE "mimipip"."installed_wall_photos" ADD CONSTRAINT "installed_wall_photos_installed_month_check" CHECK ((EXTRACT(day FROM installed_month) = (1)::numeric));

ALTER TABLE "mimipip"."installed_wall_photos" ADD CONSTRAINT "installed_wall_photos_site_scope" CHECK (((status <> 'published'::text) OR ('site'::text = ANY (scope))));

ALTER TABLE "mimipip"."installed_wall_photos" ADD CONSTRAINT "installed_wall_photos_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'withdrawn'::text])));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_captions_source_check" CHECK ((captions_source = ANY (ARRAY['auto'::text, 'edited'::text])));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_clearance_check" CHECK ((jsonb_typeof(clearance) = 'object'::text));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_duration_s_check" CHECK (((duration_s IS NULL) OR (duration_s > (0)::numeric)));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_format_check" CHECK ((format = ANY (ARRAY['reel'::text, 'short'::text, 'story'::text, 'ad'::text, 'amazon'::text, 'youtube'::text, 'meeting'::text])));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_height_check" CHECK (((height IS NULL) OR (height > 0)));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_language_check" CHECK (((language IS NULL) OR (language = ANY (ARRAY['english'::text, 'hindi'::text, 'marathi'::text, 'none'::text]))));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_posts_check" CHECK ((jsonb_typeof(posts) = 'array'::text));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_product_url_check" CHECK ((product_url ~ '^https://mimipip[.]com/'::text));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_removed_posts_check" CHECK ((jsonb_typeof(removed_posts) = 'array'::text));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_site_kind_check" CHECK ((site_kind = ANY (ARRAY['product'::text, 'collection'::text, 'concept'::text, 'page'::text])));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_site_state_check" CHECK ((site_state = ANY (ARRAY['off'::text, 'queued'::text, 'live'::text, 'failed'::text])));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_status_check" CHECK ((status = ANY (ARRAY['not been posted yet'::text, 'partly posted'::text, 'posted'::text])));

ALTER TABLE "mimipip"."marketing_asset_library" ADD CONSTRAINT "marketing_asset_library_width_check" CHECK (((width IS NULL) OR (width > 0)));

ALTER TABLE "mimipip"."character_requests" ADD CONSTRAINT "character_requests_channel_check" CHECK ((channel = ANY (ARRAY['chat'::text, 'voice'::text])));

ALTER TABLE "mimipip"."character_requests" ADD CONSTRAINT "character_requests_outcome_check" CHECK ((outcome = ANY (ARRAY['shown_alternatives'::text, 'liked_alternative'::text, 'wants_only_character'::text, 'no_alternative_shown'::text])));

ALTER TABLE "mimipip"."chat_sessions" ADD CONSTRAINT "chat_sessions_email_check" CHECK (((email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text) AND (length(email) <= 254)));

ALTER TABLE "mimipip"."customers" ADD CONSTRAINT "customers_phone_bare_10_digit" CHECK (((phone IS NULL) OR (phone ~ '^[6-9][0-9]{9}$'::text)));

ALTER TABLE "mimipip"."customers" ADD CONSTRAINT "customers_segment_check" CHECK ((segment = ANY (ARRAY['basic'::text, 'b2b'::text, 'trade'::text])));

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_edition_limit_check" CHECK (((edition_limit IS NULL) OR ((edition_limit >= 1) AND (edition_limit <= 500))));

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_master_status_check" CHECK ((master_status = ANY (ARRAY['none'::text, 'building'::text, 'ready'::text, 'manual'::text])));

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_orientation_check" CHECK ((orientation = ANY (ARRAY['vertical'::text, 'horizontal'::text])));

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_religion_check" CHECK ((religion = ANY (ARRAY['hinduism'::text, 'buddhism'::text, 'jainism'::text, 'sikhism'::text, 'christianity'::text, 'islam'::text, 'zoroastrianism'::text, 'judaism'::text, 'bahai'::text])));

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_seamless_repeat_ck" CHECK ((((is_seamless = false) AND (repeat_width_cm IS NULL)) OR ((is_seamless = true) AND (repeat_width_cm IS NOT NULL) AND (repeat_width_cm >= (5)::numeric) AND (repeat_width_cm <= (300)::numeric))));

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_supply_format_check" CHECK (((supply_format IS NULL) OR (supply_format = ANY (ARRAY['continuous'::text, 'segmented'::text]))));

ALTER TABLE "mimipip"."partner_private_options" ADD CONSTRAINT "partner_private_options_room_name_check" CHECK (((length(TRIM(BOTH FROM room_name)) >= 1) AND (length(TRIM(BOTH FROM room_name)) <= 120)));

ALTER TABLE "mimipip"."partner_private_options" ADD CONSTRAINT "partner_private_options_wall_identifier_check" CHECK (((length(TRIM(BOTH FROM wall_identifier)) >= 1) AND (length(TRIM(BOTH FROM wall_identifier)) <= 120)));

ALTER TABLE "mimipip"."partner_private_confirmations" ADD CONSTRAINT "partner_private_confirmations_option_ids_check" CHECK ((cardinality(option_ids) > 0));

ALTER TABLE "mimipip"."partner_private_confirmations" ADD CONSTRAINT "partner_private_confirmations_status_check" CHECK ((status = ANY (ARRAY['confirmed_awaiting_po'::text, 'superseded'::text, 'release_pending'::text, 'sent'::text, 'cancelled'::text])));

ALTER TABLE "mimipip"."partner_release_outbox" ADD CONSTRAINT "partner_release_outbox_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'leased'::text, 'sent'::text, 'cancelled'::text])));

ALTER TABLE "mimipip"."corporate_wall_studies" ADD CONSTRAINT "corporate_wall_studies_status_chk" CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text])));

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_attention_party_check" CHECK (((attention_party IS NULL) OR (attention_party = ANY (ARRAY['mimipip'::text, 'production'::text]))));

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_payment_status_check" CHECK (((payment_status IS NULL) OR (payment_status = ANY (ARRAY['created'::text, 'paid'::text]))));

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_tax_mode_check" CHECK (((tax_mode IS NULL) OR (tax_mode = ANY (ARRAY['intra'::text, 'inter'::text]))));

ALTER TABLE "mimipip"."concierge_events" ADD CONSTRAINT "concierge_events_duration_ms_check" CHECK (((duration_ms >= 0) AND (duration_ms <= 600000)));

ALTER TABLE "mimipip"."concierge_events" ADD CONSTRAINT "concierge_events_event_check" CHECK (((length(event) >= 1) AND (length(event) <= 48)));

ALTER TABLE "mimipip"."concierge_events" ADD CONSTRAINT "concierge_events_source_check" CHECK ((source = ANY (ARRAY['client'::text, 'server'::text])));

ALTER TABLE "mimipip"."concierge_events" ADD CONSTRAINT "concierge_events_status_check" CHECK (((status >= 100) AND (status <= 599)));

ALTER TABLE "mimipip"."collections" ADD CONSTRAINT "collections_category_scope_fkey" FOREIGN KEY (category_scope) REFERENCES product_categories(slug);

ALTER TABLE "mimipip"."order_items" ADD CONSTRAINT "order_items_ink_coverage_class_fkey" FOREIGN KEY (ink_coverage_class) REFERENCES ink_coverage_classes(slug);

ALTER TABLE "mimipip"."order_items" ADD CONSTRAINT "order_items_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."order_items" ADD CONSTRAINT "order_items_print_mode_fkey" FOREIGN KEY (print_mode) REFERENCES print_modes(slug);

ALTER TABLE "mimipip"."order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."cart_items" ADD CONSTRAINT "cart_items_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT;

ALTER TABLE "mimipip"."cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE "mimipip"."carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."print_jobs" ADD CONSTRAINT "print_jobs_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."boards" ADD CONSTRAINT "boards_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."board_items" ADD CONSTRAINT "board_items_board_id_fkey" FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."board_items" ADD CONSTRAINT "board_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."product_materials" ADD CONSTRAINT "product_materials_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT;

ALTER TABLE "mimipip"."product_materials" ADD CONSTRAINT "product_materials_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."product_tags" ADD CONSTRAINT "product_tags_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."reviews" ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "mimipip"."reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."trade_partners" ADD CONSTRAINT "trade_partners_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_showrooms" ADD CONSTRAINT "corporate_showrooms_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."product_categories" ADD CONSTRAINT "product_categories_print_type_fkey" FOREIGN KEY (print_type) REFERENCES print_product_types(slug);

ALTER TABLE "mimipip"."product_categories" ADD CONSTRAINT "product_categories_web_material_slug_fkey" FOREIGN KEY (web_material_slug) REFERENCES materials(slug);

ALTER TABLE "mimipip"."corporate_jobs" ADD CONSTRAINT "corporate_jobs_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_stores" ADD CONSTRAINT "corporate_stores_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."retag_queue" ADD CONSTRAINT "retag_queue_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."collection_launches" ADD CONSTRAINT "collection_launches_collection_handle_fkey" FOREIGN KEY (collection_handle) REFERENCES collections(handle) ON DELETE CASCADE;

ALTER TABLE "mimipip"."partner_private_projects" ADD CONSTRAINT "partner_private_projects_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id);

ALTER TABLE "mimipip"."auth_email_codes" ADD CONSTRAINT "auth_email_codes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."collection_stories" ADD CONSTRAINT "collection_stories_collection_handle_fkey" FOREIGN KEY (collection_handle) REFERENCES collections(handle) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_site_areas" ADD CONSTRAINT "corporate_site_areas_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_site_areas" ADD CONSTRAINT "corporate_site_areas_store_id_fkey" FOREIGN KEY (store_id) REFERENCES corporate_stores(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."concept_shop_designs" ADD CONSTRAINT "concept_shop_designs_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "mimipip"."corporate_design_sales" ADD CONSTRAINT "corporate_design_sales_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES corporate_orders(id);

ALTER TABLE "mimipip"."corporate_design_sales" ADD CONSTRAINT "corporate_design_sales_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "mimipip"."design_exclusivity" ADD CONSTRAINT "design_exclusivity_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "mimipip"."design_exclusivity" ADD CONSTRAINT "design_exclusivity_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "mimipip"."design_commercial_policy" ADD CONSTRAINT "design_commercial_policy_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "mimipip"."design_sales" ADD CONSTRAINT "design_sales_order_id_fkey" FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE "mimipip"."design_sales" ADD CONSTRAINT "design_sales_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES order_items(id);

ALTER TABLE "mimipip"."design_sales" ADD CONSTRAINT "design_sales_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id);

ALTER TABLE "mimipip"."DoNotContact" ADD CONSTRAINT "DoNotContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE "mimipip"."orders" ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id);

ALTER TABLE "mimipip"."orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."orders" ADD CONSTRAINT "orders_trade_partner_id_fkey" FOREIGN KEY (trade_partner_id) REFERENCES trade_partners(id);

ALTER TABLE "mimipip"."wishlist_items" ADD CONSTRAINT "wishlist_items_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."room_exclusions" ADD CONSTRAINT "room_exclusions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."room_exclusions" ADD CONSTRAINT "room_exclusions_room_key_fkey" FOREIGN KEY (room_key) REFERENCES room_scenes(room_key);

ALTER TABLE "mimipip"."chat_sessions" ADD CONSTRAINT "chat_sessions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."corporate_site_batches" ADD CONSTRAINT "corporate_site_batches_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id);

ALTER TABLE "mimipip"."corporate_site_batches" ADD CONSTRAINT "corporate_site_batches_area_id_fkey" FOREIGN KEY (area_id) REFERENCES corporate_site_areas(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."corporate_site_batches" ADD CONSTRAINT "corporate_site_batches_store_id_fkey" FOREIGN KEY (store_id) REFERENCES corporate_stores(id) ON DELETE SET NULL;

ALTER TABLE "mimipip"."corporate_site_batch_walls" ADD CONSTRAINT "corporate_site_batch_walls_batch_id_fkey" FOREIGN KEY (batch_id) REFERENCES corporate_site_batches(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_designs" ADD CONSTRAINT "corporate_designs_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_designs" ADD CONSTRAINT "corporate_designs_print_type_fkey" FOREIGN KEY (print_type) REFERENCES print_product_types(slug);

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_category_fkey" FOREIGN KEY (category) REFERENCES product_categories(slug);

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_price_tier_fkey" FOREIGN KEY (price_tier) REFERENCES price_tiers(slug);

ALTER TABLE "mimipip"."products" ADD CONSTRAINT "products_royalty_partner_fkey" FOREIGN KEY (royalty_partner) REFERENCES royalty_partners(slug);

ALTER TABLE "mimipip"."partner_private_options" ADD CONSTRAINT "partner_private_options_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id);

ALTER TABLE "mimipip"."partner_private_options" ADD CONSTRAINT "partner_private_options_project_id_fkey" FOREIGN KEY (project_id) REFERENCES partner_private_projects(id);

ALTER TABLE "mimipip"."partner_private_options" ADD CONSTRAINT "partner_private_options_supersedes_id_fkey" FOREIGN KEY (supersedes_id) REFERENCES partner_private_options(id);

ALTER TABLE "mimipip"."partner_private_confirmations" ADD CONSTRAINT "partner_private_confirmations_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id);

ALTER TABLE "mimipip"."partner_private_confirmations" ADD CONSTRAINT "partner_private_confirmations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES partner_private_projects(id);

ALTER TABLE "mimipip"."partner_release_outbox" ADD CONSTRAINT "partner_release_outbox_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id);

ALTER TABLE "mimipip"."partner_release_outbox" ADD CONSTRAINT "partner_release_outbox_confirmation_id_fkey" FOREIGN KEY (confirmation_id) REFERENCES partner_private_confirmations(id);

ALTER TABLE "mimipip"."corporate_wall_studies" ADD CONSTRAINT "corporate_wall_studies_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_wall_studies" ADD CONSTRAINT "corporate_wall_studies_design_id_fkey" FOREIGN KEY (design_id) REFERENCES corporate_designs(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_wall_studies" ADD CONSTRAINT "corporate_wall_studies_wall_id_fkey" FOREIGN KEY (wall_id) REFERENCES corporate_site_batch_walls(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_account_id_fkey" FOREIGN KEY (account_id) REFERENCES corporate_accounts(id) ON DELETE CASCADE;

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_job_id_fkey" FOREIGN KEY (job_id) REFERENCES corporate_jobs(id);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_partner_confirmation_id_fkey" FOREIGN KEY (partner_confirmation_id) REFERENCES partner_private_confirmations(id);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_partner_option_id_fkey" FOREIGN KEY (partner_option_id) REFERENCES partner_private_options(id);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_print_type_fkey" FOREIGN KEY (print_type) REFERENCES print_product_types(slug);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_repeat_of_fkey" FOREIGN KEY (repeat_of) REFERENCES corporate_orders(id);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_showroom_id_fkey" FOREIGN KEY (showroom_id) REFERENCES corporate_showrooms(id);

ALTER TABLE "mimipip"."corporate_orders" ADD CONSTRAINT "corporate_orders_source_study_id_fkey" FOREIGN KEY (source_study_id) REFERENCES corporate_wall_studies(id);

CREATE INDEX order_items_order_idx ON mimipip.order_items USING btree (order_id);

CREATE UNIQUE INDEX order_items_zvy_key ON mimipip.order_items USING btree (zvy) WHERE (zvy IS NOT NULL);

CREATE INDEX cart_items_cart_idx ON mimipip.cart_items USING btree (cart_id);

CREATE INDEX print_jobs_status_idx ON mimipip.print_jobs USING btree (status);

CREATE INDEX product_materials_product_idx ON mimipip.product_materials USING btree (product_id);

CREATE INDEX product_tags_tag_idx ON mimipip.product_tags USING btree (tag);

CREATE INDEX reviews_product_idx ON mimipip.reviews USING btree (product_id);

CREATE INDEX chat_messages_session_idx ON mimipip.chat_messages USING btree (session_id, created_at);

CREATE INDEX chat_messages_created_idx ON mimipip.chat_messages USING btree (created_at);

CREATE INDEX site_events_created_idx ON mimipip.site_events USING btree (created_at);

CREATE INDEX site_events_handle_idx ON mimipip.site_events USING btree (product_handle);

CREATE INDEX site_events_session_idx ON mimipip.site_events USING btree (created_at DESC) WHERE (event = 'session'::text);

CREATE UNIQUE INDEX site_events_event_key_key ON mimipip.site_events USING btree (event_key) WHERE (event_key IS NOT NULL);

CREATE INDEX site_events_token_idx ON mimipip.site_events USING btree (token);

CREATE INDEX site_events_subject_idx ON mimipip.site_events USING btree (subject) WHERE (subject IS NOT NULL);

CREATE INDEX site_events_customer_idx ON mimipip.site_events USING btree (customer_id, created_at DESC) WHERE (customer_id IS NOT NULL);

CREATE INDEX site_events_commercial_idx ON mimipip.site_events USING btree (event, created_at DESC) WHERE (event = ANY (ARRAY['cart_add'::text, 'checkout_start'::text, 'order_placed'::text, 'payment_captured'::text, 'refund'::text, 'lead_captured'::text]));

CREATE INDEX site_events_popular_idx ON mimipip.site_events USING btree (created_at, product_handle, event) WHERE ((product_handle IS NOT NULL) AND (is_bot IS FALSE) AND (token_presented IS NOT FALSE));

CREATE INDEX site_events_film_idx ON mimipip.site_events USING btree (((meta ->> 'film_id'::text)), created_at) WHERE (event ~~ 'film_%'::text);

CREATE INDEX gift_cards_rzp_idx ON mimipip.gift_cards USING btree (razorpay_order_id);

CREATE INDEX trade_partners_status_idx ON mimipip.trade_partners USING btree (status);

CREATE INDEX trade_partners_pan_idx ON mimipip.trade_partners USING btree (pan);

CREATE INDEX corporate_showrooms_account_idx ON mimipip.corporate_showrooms USING btree (account_id, state, city);

CREATE INDEX auth_otp_requests_email_time ON mimipip.auth_otp_requests USING btree (lower(email), created_at DESC);

CREATE INDEX auth_otp_requests_ip_time ON mimipip.auth_otp_requests USING btree (ip, created_at DESC);

CREATE INDEX product_images_product_idx ON mimipip.product_images USING btree (product_id);

CREATE UNIQUE INDEX one_flat_per_product ON mimipip.product_images USING btree (product_id) WHERE is_flat;

CREATE INDEX product_images_flat_dimensions_idx ON mimipip.product_images USING btree (product_id) WHERE is_flat;

CREATE INDEX product_images_flat_content_hash_idx ON mimipip.product_images USING btree (content_hash) WHERE (is_flat AND (content_hash IS NOT NULL));

CREATE UNIQUE INDEX corporate_jobs_open_site_idx ON mimipip.corporate_jobs USING btree (account_id, site) WHERE ((site IS NOT NULL) AND (closed_at IS NULL));

CREATE INDEX corporate_jobs_account_idx ON mimipip.corporate_jobs USING btree (account_id);

CREATE INDEX identity_link_customer_idx ON mimipip.identity_link USING btree (customer_id);

CREATE INDEX corporate_stores_account_idx ON mimipip.corporate_stores USING btree (account_id, active, name);

CREATE INDEX corporate_stores_state_idx ON mimipip.corporate_stores USING btree (account_id, state);

CREATE INDEX checkout_failures_created_idx ON mimipip.checkout_failures USING btree (created_at DESC);

CREATE INDEX checkout_failures_email_idx ON mimipip.checkout_failures USING btree (email);

CREATE INDEX retag_queue_status_idx ON mimipip.retag_queue USING btree (status, created_at);

CREATE INDEX collection_launches_launch_at_idx ON mimipip.collection_launches USING btree (launch_at);

CREATE INDEX auth_sms_requests_phone_time ON mimipip.auth_sms_requests USING btree (phone, created_at DESC);

CREATE INDEX auth_sms_requests_ip_time ON mimipip.auth_sms_requests USING btree (ip, created_at DESC);

CREATE INDEX auth_email_codes_user_idx ON mimipip.auth_email_codes USING btree (user_id, created_at DESC);

CREATE INDEX collection_stories_handle_idx ON mimipip.collection_stories USING btree (collection_handle, "position");

CREATE INDEX corporate_site_areas_store_idx ON mimipip.corporate_site_areas USING btree (store_id, active, sort, name);

CREATE INDEX corporate_site_areas_account_idx ON mimipip.corporate_site_areas USING btree (account_id, active);

CREATE INDEX exclusive_payment_pending ON mimipip.design_exclusivity USING btree (payment_checked_at) WHERE (state = 'reserved'::text);

CREATE INDEX design_sales_product ON mimipip.design_sales USING btree (product_id, order_id);

CREATE INDEX "Lead_brand_status_idx" ON mimipip."Lead" USING btree (brand, status);

CREATE INDEX "Lead_segment_idx" ON mimipip."Lead" USING btree (segment);

CREATE INDEX "DoNotContact_email_idx" ON mimipip."DoNotContact" USING btree (email);

CREATE INDEX "DoNotContact_instagram_idx" ON mimipip."DoNotContact" USING btree (instagram);

CREATE UNIQUE INDEX "DoNotContact_leadId_key" ON mimipip."DoNotContact" USING btree ("leadId");

CREATE INDEX "DoNotContact_phone_idx" ON mimipip."DoNotContact" USING btree (phone);

CREATE UNIQUE INDEX trade_contacts_mobile_uniq ON mimipip.trade_contacts USING btree (mobile) WHERE (mobile IS NOT NULL);

CREATE UNIQUE INDEX trade_contacts_email_uniq ON mimipip.trade_contacts USING btree (lower(email)) WHERE (email IS NOT NULL);

CREATE INDEX trade_contacts_source_idx ON mimipip.trade_contacts USING btree (source);

CREATE INDEX orders_status_idx ON mimipip.orders USING btree (status);

CREATE INDEX orders_customer_idx ON mimipip.orders USING btree (customer_id);

CREATE INDEX orders_trade_partner_id_idx ON mimipip.orders USING btree (trade_partner_id) WHERE (trade_partner_id IS NOT NULL);

CREATE INDEX orders_visitor_token_idx ON mimipip.orders USING btree (visitor_token) WHERE (visitor_token IS NOT NULL);

CREATE INDEX orders_cart_id_idx ON mimipip.orders USING btree (cart_id);

CREATE UNIQUE INDEX orders_zvy_key ON mimipip.orders USING btree (zvy) WHERE (zvy IS NOT NULL);

CREATE INDEX orders_paid_at_idx ON mimipip.orders USING btree (paid_at DESC) WHERE (paid_at IS NOT NULL);

CREATE INDEX print_runs_open_idx ON mimipip.print_runs USING btree (delivered_at) WHERE (closed_at IS NULL);

CREATE INDEX print_runs_order_idx ON mimipip.print_runs USING btree (order_no);

CREATE INDEX production_jobs_order_no_idx ON mimipip.production_jobs USING btree (order_no);

CREATE INDEX production_jobs_status_idx ON mimipip.production_jobs USING btree (status);

CREATE INDEX installed_wall_photos_product_published ON mimipip.installed_wall_photos USING btree (product_handle, installed_month DESC) WHERE (status = 'published'::text);

CREATE INDEX marketing_asset_library_created_idx ON mimipip.marketing_asset_library USING btree (created_at DESC);

CREATE INDEX marketing_asset_library_version_group_idx ON mimipip.marketing_asset_library USING btree (version_group) WHERE (version_group IS NOT NULL);

CREATE INDEX marketing_asset_library_site_idx ON mimipip.marketing_asset_library USING btree (site_kind, site_handle) WHERE (site_state = 'live'::text);

CREATE UNIQUE INDEX media_reservations_one_open ON mimipip.media_reservations USING btree ((true)) WHERE (closed_at IS NULL);

CREATE INDEX media_reservations_order_idx ON mimipip.media_reservations USING btree (order_no);

CREATE INDEX character_requests_created_at ON mimipip.character_requests USING btree (created_at DESC);

CREATE INDEX chat_sessions_email_idx ON mimipip.chat_sessions USING btree (email);

CREATE INDEX customers_email_idx ON mimipip.customers USING btree (email);

CREATE UNIQUE INDEX customers_email_lc_uidx ON mimipip.customers USING btree (lower(email));

CREATE UNIQUE INDEX customers_unsub_token_uidx ON mimipip.customers USING btree (unsubscribe_token);

CREATE INDEX customers_taste_token ON mimipip.customers USING btree (taste_token);

CREATE INDEX customers_segment_idx ON mimipip.customers USING btree (segment);

CREATE UNIQUE INDEX customers_email_lower_uniq ON mimipip.customers USING btree (lower(email)) WHERE (email IS NOT NULL);

CREATE INDEX corporate_site_batches_account_idx ON mimipip.corporate_site_batches USING btree (account_id, created_at DESC);

CREATE INDEX corporate_site_batches_status_idx ON mimipip.corporate_site_batches USING btree (status, created_at DESC);

CREATE INDEX corporate_site_batches_store_idx ON mimipip.corporate_site_batches USING btree (store_id, created_at DESC);

CREATE INDEX corporate_site_batches_area_idx ON mimipip.corporate_site_batches USING btree (area_id, created_at DESC);

CREATE UNIQUE INDEX corporate_site_batches_one_open_per_area_idx ON mimipip.corporate_site_batches USING btree (area_id) WHERE ((area_id IS NOT NULL) AND (status = 'collecting'::text));

CREATE UNIQUE INDEX corporate_site_batch_walls_seq_idx ON mimipip.corporate_site_batch_walls USING btree (batch_id, seq);

CREATE INDEX corporate_designs_account_idx ON mimipip.corporate_designs USING btree (account_id, status, created_at DESC);

CREATE INDEX corporate_designs_print_type_idx ON mimipip.corporate_designs USING btree (account_id, print_type);

CREATE INDEX corporate_designs_product_idx ON mimipip.corporate_designs USING btree (account_id, product_handle) WHERE (product_handle IS NOT NULL);

CREATE INDEX corporate_designs_account_sha_idx ON mimipip.corporate_designs USING btree (account_id, content_sha256) WHERE (content_sha256 IS NOT NULL);

CREATE INDEX products_status_idx ON mimipip.products USING btree (status);

CREATE INDEX products_image_embedding_idx ON mimipip.products USING hnsw (image_embedding vector_cosine_ops);

CREATE INDEX products_aesthetic_rank_idx ON mimipip.products USING btree (aesthetic_rank);

CREATE INDEX products_designs_only ON mimipip.products USING btree (status) WHERE (NOT is_service);

CREATE INDEX products_category_idx ON mimipip.products USING btree (category) WHERE (status = 'active'::product_status);

CREATE INDEX products_price_tier_idx ON mimipip.products USING btree (price_tier) WHERE (price_tier <> 'standard'::text);

CREATE INDEX products_master_status_idx ON mimipip.products USING btree (master_status) WHERE (master_status <> 'ready'::text);

CREATE INDEX products_search_tsv_idx ON mimipip.products USING gin (search_tsv);

CREATE INDEX products_royalty_partner_idx ON mimipip.products USING btree (royalty_partner) WHERE (royalty_partner IS NOT NULL);

CREATE INDEX products_religion_active_idx ON mimipip.products USING btree (religion, aesthetic_rank, handle) WHERE ((status = 'active'::product_status) AND (religion IS NOT NULL));

CREATE INDEX corporate_wall_studies_wall_idx ON mimipip.corporate_wall_studies USING btree (wall_id, sort, created_at);

CREATE INDEX corporate_wall_studies_account_idx ON mimipip.corporate_wall_studies USING btree (account_id, status);

CREATE INDEX corporate_orders_account_idx ON mimipip.corporate_orders USING btree (account_id, created_at DESC);

CREATE INDEX corporate_orders_group_idx ON mimipip.corporate_orders USING btree (group_ref) WHERE (group_ref IS NOT NULL);

CREATE INDEX corporate_orders_excluded_idx ON mimipip.corporate_orders USING btree (account_id, created_at DESC) WHERE (excluded_sqft > (0)::numeric);

CREATE INDEX corporate_orders_attention_idx ON mimipip.corporate_orders USING btree (attention_since) WHERE (attention_since IS NOT NULL);

CREATE UNIQUE INDEX corporate_orders_invoice_number_key ON mimipip.corporate_orders USING btree (invoice_number) WHERE (invoice_number IS NOT NULL);

CREATE INDEX corporate_orders_paperwork_idx ON mimipip.corporate_orders USING btree (account_id, invoiced_at, label_at);

CREATE INDEX corporate_orders_razorpay_order_idx ON mimipip.corporate_orders USING btree (razorpay_order_id) WHERE (razorpay_order_id IS NOT NULL);

CREATE INDEX corporate_orders_job_idx ON mimipip.corporate_orders USING btree (job_id) WHERE (job_id IS NOT NULL);

CREATE INDEX corporate_orders_print_type_idx ON mimipip.corporate_orders USING btree (print_type);

CREATE INDEX corporate_orders_group_print_idx ON mimipip.corporate_orders USING btree (group_ref, print_type) WHERE (group_ref IS NOT NULL);

CREATE UNIQUE INDEX corporate_order_partner_release_line ON mimipip.corporate_orders USING btree (partner_confirmation_id, partner_option_id) WHERE (partner_confirmation_id IS NOT NULL);

CREATE UNIQUE INDEX corporate_orders_one_proposal ON mimipip.corporate_orders USING btree (source_study_id) WHERE (source_study_id IS NOT NULL);

CREATE INDEX concierge_events_session_time ON mimipip.concierge_events USING btree (session_id, created_at);

CREATE INDEX concierge_events_time ON mimipip.concierge_events USING btree (created_at);

CREATE TRIGGER products_updated_at BEFORE UPDATE ON mimipip.products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON mimipip.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER carts_updated_at BEFORE UPDATE ON mimipip.carts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER products_require_flat_image BEFORE INSERT OR UPDATE ON mimipip.products FOR EACH ROW EXECUTE FUNCTION enforce_flat_image();

CREATE TRIGGER trg_derive_child_safe AFTER INSERT ON mimipip.product_tags FOR EACH ROW WHEN ((new.tag = ANY (ARRAY['Kids'::text, 'Kids room'::text, 'Teen'::text, 'Nursery'::text]))) EXECUTE FUNCTION derive_child_safe_tag();

CREATE TRIGGER orders_sync_customer AFTER INSERT ON mimipip.orders FOR EACH ROW EXECUTE FUNCTION trg_customer_from_order();

CREATE TRIGGER gift_cards_sync_customer AFTER INSERT ON mimipip.gift_cards FOR EACH ROW EXECUTE FUNCTION trg_customer_from_gift();

CREATE TRIGGER trg_flag_new_on_publish BEFORE INSERT OR UPDATE ON mimipip.products FOR EACH ROW EXECUTE FUNCTION flag_new_on_publish();

CREATE TRIGGER order_items_contribution AFTER INSERT OR DELETE OR UPDATE ON mimipip.order_items FOR EACH ROW EXECUTE FUNCTION trg_order_items_contribution();

CREATE TRIGGER products_canvas_wall_art_rules BEFORE INSERT OR UPDATE ON mimipip.products FOR EACH ROW EXECUTE FUNCTION enforce_canvas_wall_art_rules();

CREATE TRIGGER products_category_rules BEFORE INSERT OR UPDATE ON mimipip.products FOR EACH ROW EXECUTE FUNCTION enforce_product_category_rules();

CREATE TRIGGER cart_items_category_min BEFORE INSERT OR UPDATE ON mimipip.cart_items FOR EACH ROW EXECUTE FUNCTION enforce_category_min_order();

CREATE TRIGGER product_images_content_hash BEFORE INSERT OR UPDATE OF url ON mimipip.product_images FOR EACH ROW EXECUTE FUNCTION product_images_set_content_hash();

CREATE TRIGGER trg_archive_sold_out_editions AFTER UPDATE OF status ON mimipip.orders FOR EACH ROW WHEN (((new.status IS DISTINCT FROM old.status) AND (new.status = ANY (ARRAY['paid'::order_status, 'in_production'::order_status, 'printed'::order_status, 'shipped'::order_status, 'delivered'::order_status])))) EXECUTE FUNCTION archive_sold_out_editions();

CREATE TRIGGER products_autograph_pricing AFTER INSERT OR UPDATE OF price_tier ON mimipip.products FOR EACH ROW EXECUTE FUNCTION trg_products_autograph_pricing();

CREATE TRIGGER product_materials_autograph_guard BEFORE INSERT OR UPDATE ON mimipip.product_materials FOR EACH ROW EXECUTE FUNCTION trg_product_materials_autograph_guard();

CREATE TRIGGER corporate_accounts_apply_type_trg BEFORE INSERT OR UPDATE ON mimipip.corporate_accounts FOR EACH ROW EXECUTE FUNCTION corporate_accounts_apply_type();

CREATE TRIGGER products_enqueue_retag AFTER INSERT OR UPDATE OF status ON mimipip.products FOR EACH ROW EXECUTE FUNCTION trg_enqueue_retag_on_publish();

CREATE TRIGGER products_assign_rank BEFORE INSERT OR UPDATE OF status ON mimipip.products FOR EACH ROW EXECUTE FUNCTION trg_assign_aesthetic_rank();

CREATE TRIGGER products_search_tsv AFTER INSERT OR UPDATE OF title, code, description ON mimipip.products FOR EACH ROW EXECUTE FUNCTION trg_products_search_tsv();

CREATE TRIGGER product_tags_search_tsv AFTER INSERT OR DELETE OR UPDATE ON mimipip.product_tags FOR EACH ROW EXECUTE FUNCTION trg_product_tags_search_tsv();

CREATE TRIGGER trg_sync_limited_edition_tag AFTER INSERT OR UPDATE OF is_limited ON mimipip.products FOR EACH ROW EXECUTE FUNCTION sync_limited_edition_tag();

CREATE TRIGGER capture_design_sales AFTER UPDATE OF payment_status, status ON mimipip.orders FOR EACH ROW EXECUTE FUNCTION mimipip_private.capture_design_sales();

CREATE TRIGGER protect_exclusive_product BEFORE UPDATE OF status ON mimipip.products FOR EACH ROW EXECUTE FUNCTION mimipip_private.protect_exclusive_product();

CREATE TRIGGER guard_design_cart BEFORE INSERT OR UPDATE ON mimipip.cart_items FOR EACH ROW EXECUTE FUNCTION mimipip_private.guard_design_cart();

CREATE TRIGGER reserve_design_exclusivity BEFORE INSERT ON mimipip.order_items FOR EACH ROW EXECUTE FUNCTION mimipip_private.reserve_design_exclusivity();

CREATE TRIGGER confirm_design_exclusivity BEFORE UPDATE OF payment_status ON mimipip.orders FOR EACH ROW EXECUTE FUNCTION mimipip_private.confirm_design_exclusivity();

CREATE TRIGGER capture_corporate_design_sale AFTER INSERT OR UPDATE ON mimipip.corporate_orders FOR EACH ROW EXECUTE FUNCTION mimipip_private.capture_corporate_design_sale();

CREATE TRIGGER cart_items_taash_book_price BEFORE INSERT OR UPDATE ON mimipip.cart_items FOR EACH ROW EXECUTE FUNCTION enforce_taash_book_cart_price();

CREATE TRIGGER print_jobs_skip_books BEFORE INSERT ON mimipip.print_jobs FOR EACH ROW EXECUTE FUNCTION skip_book_print_job();

CREATE TRIGGER trg_print_queue_delete_guard BEFORE DELETE ON mimipip.print_queue FOR EACH ROW EXECUTE FUNCTION log_print_queue_delete();

CREATE TRIGGER orders_stamp_paid_at BEFORE INSERT OR UPDATE ON mimipip.orders FOR EACH ROW EXECUTE FUNCTION stamp_retail_paid_at();

CREATE TRIGGER partner_confirmation_immutable BEFORE DELETE OR UPDATE ON mimipip.partner_private_confirmations FOR EACH ROW EXECUTE FUNCTION partner_confirmation_guard();

CREATE TRIGGER partner_order_po_required BEFORE INSERT OR UPDATE ON mimipip.corporate_orders FOR EACH ROW EXECUTE FUNCTION partner_operational_order_guard();

CREATE TRIGGER room_exclusion_guard BEFORE INSERT OR UPDATE OF tag ON mimipip.product_tags FOR EACH ROW EXECUTE FUNCTION trg_room_exclusion_tags();

CREATE TRIGGER room_exclusion_guard BEFORE INSERT OR UPDATE OF scene_key ON mimipip.product_images FOR EACH ROW EXECUTE FUNCTION trg_room_exclusion_images();

CREATE TRIGGER marketing_library_site_target BEFORE INSERT OR UPDATE OF product_url ON mimipip.marketing_asset_library FOR EACH ROW EXECUTE FUNCTION marketing_library_set_site_target();

CREATE TRIGGER print_queue_reservation_guard BEFORE INSERT OR DELETE OR UPDATE ON mimipip.print_queue FOR EACH ROW EXECUTE FUNCTION print_queue_reservation_guard();

CREATE TRIGGER print_queue_truncate_guard BEFORE TRUNCATE ON mimipip.print_queue FOR EACH STATEMENT EXECUTE FUNCTION print_queue_truncate_guard();

CREATE CONSTRAINT TRIGGER product_materials_one_finish AFTER INSERT OR UPDATE OF available, material_id ON mimipip.product_materials DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (new.available) EXECUTE FUNCTION enforce_one_wallpaper_finish();

CREATE TRIGGER wallpaper_cart_price_guard BEFORE INSERT OR UPDATE OF product_id, material_id, unit_price_per_sqft ON mimipip.cart_items FOR EACH ROW EXECUTE FUNCTION guard_wallpaper_cart_price();

CREATE TRIGGER z_curated_material_rate_guard BEFORE INSERT OR UPDATE ON mimipip.product_materials FOR EACH ROW EXECUTE FUNCTION curated_material_rate_guard();

CREATE TRIGGER curated_tag_rate_guard AFTER INSERT OR UPDATE ON mimipip.product_tags FOR EACH ROW EXECUTE FUNCTION curated_tag_rate_guard();

CREATE TRIGGER curated_collection_rate_guard AFTER INSERT OR UPDATE OF kind, rule_tag, rule_tags, category_scope ON mimipip.collections FOR EACH ROW EXECUTE FUNCTION curated_collection_rate_guard();

CREATE TRIGGER curated_product_rate_guard AFTER UPDATE OF category ON mimipip.products FOR EACH ROW EXECUTE FUNCTION curated_product_rate_guard();

CREATE TRIGGER corporate_designs_vs_auto_approve BEFORE INSERT OR UPDATE OF status ON mimipip.corporate_designs FOR EACH ROW EXECUTE FUNCTION corporate_designs_vs_auto_approve();

CREATE TRIGGER product_tags_religious_identity AFTER INSERT OR UPDATE OF tag ON mimipip.product_tags FOR EACH ROW EXECUTE FUNCTION keep_religious_identity();

CREATE TRIGGER immutable_partner_options BEFORE DELETE OR UPDATE ON mimipip.partner_private_options FOR EACH ROW EXECUTE FUNCTION partner_option_guard();

CREATE TRIGGER corporate_order_proposal_guard BEFORE INSERT ON mimipip.corporate_orders FOR EACH ROW EXECUTE FUNCTION guard_proposal_order();

CREATE TRIGGER corporate_study_order_guard BEFORE DELETE OR UPDATE ON mimipip.corporate_wall_studies FOR EACH ROW EXECUTE FUNCTION guard_ordered_proposal();

CREATE POLICY "public read" ON "mimipip"."materials" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "public read" ON "mimipip"."products" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((status = 'active'::product_status));

CREATE POLICY "public read" ON "mimipip"."product_materials" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "public read" ON "mimipip"."product_images" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "public read" ON "mimipip"."product_tags" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "public read" ON "mimipip"."collections" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "public read" ON "mimipip"."size_presets" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((active = true));

CREATE POLICY "customers self select" ON "mimipip"."customers" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth_user_id = auth.uid()));

CREATE POLICY "customers self insert" ON "mimipip"."customers" AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth_user_id = auth.uid()));

CREATE POLICY "customers self update" ON "mimipip"."customers" AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth_user_id = auth.uid()));

CREATE POLICY "reviews public read" ON "mimipip"."reviews" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((status = 'published'::text));

CREATE POLICY "product_categories public read" ON "mimipip"."product_categories" AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "trade_partners self read" ON "mimipip"."trade_partners" AS PERMISSIVE FOR SELECT TO PUBLIC USING ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.auth_user_id = auth.uid()))));

CREATE POLICY "board_items owner all" ON "mimipip"."board_items" AS PERMISSIVE FOR ALL TO "authenticated" USING ((is_email_verified() AND (board_id IN ( SELECT b.id
   FROM (boards b
     JOIN customers c ON ((c.id = b.customer_id)))
  WHERE (c.auth_user_id = auth.uid())))));

CREATE POLICY "boards owner all" ON "mimipip"."boards" AS PERMISSIVE FOR ALL TO "authenticated" USING ((is_email_verified() AND (customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.auth_user_id = auth.uid())))));

CREATE POLICY "read print product types" ON "mimipip"."print_product_types" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "price_tiers public read" ON "mimipip"."price_tiers" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "collection_launches public read" ON "mimipip"."collection_launches" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "collection_stories public read" ON "mimipip"."collection_stories" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (true);

CREATE POLICY "Public active concept designs" ON "mimipip"."concept_shop_designs" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING (active);

CREATE POLICY "wishlist owner all" ON "mimipip"."wishlist_items" AS PERMISSIVE FOR ALL TO PUBLIC USING ((is_email_verified() AND (customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.auth_user_id = auth.uid())))));

CREATE POLICY "installed_wall_photos_public_read" ON "mimipip"."installed_wall_photos" AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((status = 'published'::text));

CREATE POLICY "religion_deliberate_browsing" ON "mimipip"."products" AS RESTRICTIVE FOR SELECT TO "anon", "authenticated" USING (((religion IS NULL) OR (COALESCE(((NULLIF(current_setting('request.headers'::text, true), ''::text))::jsonb ->> 'x-zyv-religion'::text), ''::text) = 'browse'::text)));

REVOKE ALL ON ALL TABLES IN SCHEMA mimipip FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA mimipip FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mimipip, mimipip_private FROM PUBLIC, anon, authenticated;

-- Restore exact explicit source grants; default PUBLIC routine execution is intentionally not restored.

GRANT DELETE ON "mimipip"."board_items" TO "authenticated";

GRANT DELETE ON "mimipip"."boards" TO "authenticated";

GRANT DELETE ON "mimipip"."wishlist_items" TO "anon";

GRANT DELETE ON "mimipip"."wishlist_items" TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."apply_autograph_materials"(p_product_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."apply_gift_card"(p_order_id uuid, p_code text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."archive_sold_out_editions"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."assert_current_wallpaper_cart"(p_session_token text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."auto_subscribe"(p_email text, p_source text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."auto_subscribe"(p_email text, p_source text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."auto_subscribe"(p_email text, p_source text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."autograph_material_slug"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."autograph_product_rate"(p_product_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."autograph_rate"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."build_search_tsv"(p_product_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."cart_add_item"(p_session_token text, p_product_handle text, p_material_slug text, p_width_cm numeric, p_height_cm numeric, p_area_sqft numeric, p_unit_price numeric, p_quantity integer, p_line_total numeric, p_crop_data jsonb, p_preview_url text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_add_item"(p_session_token text, p_product_handle text, p_material_slug text, p_width_cm numeric, p_height_cm numeric, p_area_sqft numeric, p_unit_price numeric, p_quantity integer, p_line_total numeric, p_crop_data jsonb, p_preview_url text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_add_item"(p_session_token text, p_product_handle text, p_material_slug text, p_width_cm numeric, p_height_cm numeric, p_area_sqft numeric, p_unit_price numeric, p_quantity integer, p_line_total numeric, p_crop_data jsonb, p_preview_url text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."cart_checkout_state"(p_session_token text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_checkout_state"(p_session_token text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_checkout_state"(p_session_token text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."cart_get"(p_session_token text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_get"(p_session_token text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_get"(p_session_token text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."cart_remove_item"(p_session_token text, p_item_id uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_remove_item"(p_session_token text, p_item_id uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_remove_item"(p_session_token text, p_item_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."cart_set_contact"(p_session_token text, p_email text, p_phone text, p_name text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_set_contact"(p_session_token text, p_email text, p_phone text, p_name text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_set_contact"(p_session_token text, p_email text, p_phone text, p_name text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."cart_strip_installation"(p_session_token text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_strip_installation"(p_session_token text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_strip_installation"(p_session_token text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."cart_update_qty"(p_session_token text, p_item_id uuid, p_quantity integer) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_update_qty"(p_session_token text, p_item_id uuid, p_quantity integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."cart_update_qty"(p_session_token text, p_item_id uuid, p_quantity integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."category_tag_counts"(p_category text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."category_tag_counts"(p_category text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."category_tag_counts"(p_category text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."checkout_cart_v2"(p_session_token text, p_email text, p_phone text, p_shipping_address jsonb, p_express boolean, p_discount_code text, p_discount_pct numeric, p_discount_cap_pct numeric, p_discount_max_inr numeric, p_waive_courier boolean) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."claim_order_notification"(p_order_id uuid, p_status text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."collection_facets_v2"(p_base_tags text[], p_category text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."collection_facets_v2"(p_base_tags text[], p_category text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."collection_facets_v2"(p_base_tags text[], p_category text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."collection_flag_counts_v2"(p_base_tags text[], p_category text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."collection_flag_counts_v2"(p_base_tags text[], p_category text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."collection_flag_counts_v2"(p_base_tags text[], p_category text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."collection_page_v2"(p_base_tags text[], p_category text, p_filter_tags text[], p_signature boolean, p_new boolean, p_sort text, p_limit integer, p_offset integer, p_room_key text, p_rendered_only boolean) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."collection_page_v2"(p_base_tags text[], p_category text, p_filter_tags text[], p_signature boolean, p_new boolean, p_sort text, p_limit integer, p_offset integer, p_room_key text, p_rendered_only boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."collection_page_v2"(p_base_tags text[], p_category text, p_filter_tags text[], p_signature boolean, p_new boolean, p_sort text, p_limit integer, p_offset integer, p_room_key text, p_rendered_only boolean) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."compute_order_contribution"(p_order_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."concierge_cancel_order"(p_order_number bigint, p_email text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."concierge_cancel_order"(p_order_number bigint, p_email text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."concierge_cancel_order"(p_order_number bigint, p_email text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."concierge_link_session"(p_session uuid, p_email text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."concierge_order_status"(p_order_number bigint, p_email text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."concierge_order_status"(p_order_number bigint, p_email text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."concierge_order_status"(p_order_number bigint, p_email text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."corporate_accounts_apply_type"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."corporate_designs_vs_auto_approve"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."curated_collection_rate_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."curated_material_rate_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."curated_product_rate_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."curated_tag_rate_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."debut_rank_band"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."deity_free_room"(p_room_key text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."derive_child_safe_tag"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."edition_sold"(p_handle text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."email_suppressed"(p_email text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."enforce_canvas_wall_art_rules"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."enforce_category_min_order"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."enforce_flat_image"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."enforce_one_wallpaper_finish"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."enforce_product_category_rules"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."enforce_taash_book_cart_price"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."enrol_verified_email"(p_source text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."enrol_verified_email"(p_source text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."enrol_verified_email"(p_source text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."flag_new_on_publish"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."generate_design_code"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."get_order_for_invoice"(p_order_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."gift_card_status"(p_code text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."gift_card_status"(p_code text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."gift_card_status"(p_code text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."guard_ordered_proposal"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."guard_proposal_order"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."guard_wallpaper_cart_price"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."is_curated_wallpaper"(p_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."is_deity_design"(p_product_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."is_email_verified"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."is_email_verified"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."keep_religious_identity"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."link_auth_customer"() TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."link_auth_customer"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."link_auth_customer"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."link_taste_token"(p_token uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."link_taste_token"(p_token uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."link_taste_token"(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."link_visitor_identity"(p_token uuid, p_customer_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."log_character_request"(p_character text, p_outcome text, p_franchise text, p_shown_handles text[], p_channel text, p_note text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."log_character_request"(p_character text, p_outcome text, p_franchise text, p_shown_handles text[], p_channel text, p_note text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."log_character_request"(p_character text, p_outcome text, p_franchise text, p_shown_handles text[], p_channel text, p_note text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."log_checkout_failure"(p_stage text, p_detail text, p_email text, p_order_number bigint, p_order_id uuid, p_value_inr numeric, p_session_token text, p_meta jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."log_commercial_event"(p_event text, p_subject text, p_token uuid, p_customer_id uuid, p_handle text, p_value_inr numeric, p_meta jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."log_print_queue_delete"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."log_server_event"(p_event_key text, p_token uuid, p_event text, p_handle text, p_is_bot boolean, p_ua_family text, p_schema_version integer, p_meta jsonb, p_token_presented boolean) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."log_server_event"(p_event_key text, p_token uuid, p_event text, p_handle text, p_is_bot boolean, p_ua_family text, p_schema_version integer, p_meta jsonb, p_token_presented boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."log_server_event"(p_event_key text, p_token uuid, p_event text, p_handle text, p_is_bot boolean, p_ua_family text, p_schema_version integer, p_meta jsonb, p_token_presented boolean) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."login_sync"() TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."login_sync"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."login_sync"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."mark_order_paid_by_gift"(p_order_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."mark_order_paid_free"(p_order_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."marketing_library_set_site_target"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."marketing_site_target"(p_url text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."match_products_by_embedding"(query_embedding vector, match_count integer) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."match_products_by_embedding"(query_embedding vector, match_count integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."match_products_by_embedding"(query_embedding vector, match_count integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."order_nos_at_printer"(p_nos text[]) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."otp_request_allowed"(p_email text, p_ip text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."panel_sample_lock"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."partner_confirmation_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."partner_operational_order_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."partner_option_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."partner_option_locked"(p_option uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."partner_order_edit_window"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."partner_order_open"(p_confirmation uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."phone_signin_route"(p_phone text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."popular_designs"(p_days integer, p_limit integer) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."popular_designs"(p_days integer, p_limit integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."popular_designs"(p_days integer, p_limit integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."popular_designs_live"(p_days integer, p_limit integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."populated_collection_tags"() TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."populated_collection_tags"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."populated_collection_tags"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."print_queue_reservation_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."print_queue_truncate_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."product_attributes"(p_handle text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."product_attributes"(p_handle text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."product_attributes"(p_handle text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."product_embeddings"(p_handles text[]) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."product_embeddings"(p_handles text[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."product_embeddings"(p_handles text[]) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."product_images_set_content_hash"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."product_rating"(p_handle text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."product_rating"(p_handle text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."product_rating"(p_handle text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."related_products_by_embedding"(product_handle text, match_count integer) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."related_products_by_embedding"(product_handle text, match_count integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."related_products_by_embedding"(product_handle text, match_count integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."resume_order_for_cart"(p_session_token text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."resume_order_for_cart"(p_session_token text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."resume_order_for_cart"(p_session_token text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."retail_order_at_printer"(p_order uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."room_key_for"(p_tag text, p_scene text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."save_customer_email"(p_email text, p_marketing boolean) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."save_customer_email"(p_email text, p_marketing boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."save_customer_email"(p_email text, p_marketing boolean) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."save_customer_phone"(p_phone text, p_marketing boolean) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."save_customer_phone"(p_phone text, p_marketing boolean) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."save_customer_phone"(p_phone text, p_marketing boolean) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."search_lexicon"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."search_lexicon_json"() TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."search_lexicon_json"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."search_lexicon_json"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v1"(p_query text, p_limit integer) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v1"(p_query text, p_limit integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v1"(p_query text, p_limit integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v2"(p_query text, p_limit integer, p_room_tag text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v2"(p_query text, p_limit integer, p_room_tag text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v2"(p_query text, p_limit integer, p_room_tag text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v3"(p_query text, p_limit integer, p_offset integer, p_room_tag text, p_room_key text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v3"(p_query text, p_limit integer, p_offset integer, p_room_tag text, p_room_key text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."search_products_v3"(p_query text, p_limit integer, p_offset integer, p_room_tag text, p_room_key text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."set_order_gst"(p_order_id uuid, p_gstin text, p_billing_name text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."set_order_pending_gift"(p_order_id uuid, p_code text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."set_order_razorpay"(p_order_id uuid, p_rzp_order_id text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."set_updated_at"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."showcase_pool"(p_min_count integer) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."showcase_pool"(p_min_count integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."showcase_pool"(p_min_count integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."showcase_pool_live"(p_min_count integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."site_films"(p_kind text, p_handles text[]) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."site_films"(p_kind text, p_handles text[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."site_films"(p_kind text, p_handles text[]) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."skip_book_print_job"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."sms_otp_request_allowed"(p_phone text, p_ip text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."stamp_retail_paid_at"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."storage_content_hash"(p_url text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."submit_contact"(p_name text, p_email text, p_message text, p_topic text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."submit_contact"(p_name text, p_email text, p_message text, p_topic text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."submit_contact"(p_name text, p_email text, p_message text, p_topic text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."submit_verified_review"(p_handle text, p_order_number bigint, p_email text, p_rating integer, p_author text, p_body text) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."submit_verified_review"(p_handle text, p_order_number bigint, p_email text, p_rating integer, p_author text, p_body text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."submit_verified_review"(p_handle text, p_order_number bigint, p_email text, p_rating integer, p_author text, p_body text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."sync_limited_edition_tag"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."taste_get"(p_token uuid) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."taste_get"(p_token uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."taste_get"(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."taste_set"(p_token uuid, p_embedding text, p_seen_add text, p_events integer) TO "anon";

GRANT EXECUTE ON FUNCTION "mimipip"."taste_set"(p_token uuid, p_embedding text, p_seen_add text, p_events integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "mimipip"."taste_set"(p_token uuid, p_embedding text, p_seen_add text, p_events integer) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."to_indian_mobile"(raw text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_assign_aesthetic_rank"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_customer_from_gift"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_customer_from_order"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_enqueue_retag_on_publish"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_order_items_contribution"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_product_materials_autograph_guard"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_product_tags_search_tsv"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_products_autograph_pricing"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_products_search_tsv"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_room_exclusion_images"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."trg_room_exclusion_tags"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."upsert_customer"(p_email text, p_phone text, p_name text, p_source text) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip"."visitor_first_touch"(p_token uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip_private"."capture_corporate_design_sale"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip_private"."capture_design_sales"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip_private"."confirm_design_exclusivity"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip_private"."design_family"(p_product uuid) TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip_private"."guard_design_cart"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip_private"."protect_exclusive_product"() TO service_role;

GRANT EXECUTE ON FUNCTION "mimipip_private"."reserve_design_exclusivity"() TO service_role;

GRANT INSERT ON "mimipip"."board_items" TO "authenticated";

GRANT INSERT ON "mimipip"."boards" TO "authenticated";

GRANT INSERT ON "mimipip"."customers" TO "anon";

GRANT INSERT ON "mimipip"."customers" TO "authenticated";

GRANT INSERT ON "mimipip"."wishlist_items" TO "anon";

GRANT INSERT ON "mimipip"."wishlist_items" TO "authenticated";

GRANT SELECT ON "mimipip"."board_items" TO "authenticated";

GRANT SELECT ON "mimipip"."boards" TO "authenticated";

GRANT SELECT ON "mimipip"."collection_launches" TO "anon";

GRANT SELECT ON "mimipip"."collection_launches" TO "authenticated";

GRANT SELECT ON "mimipip"."collection_stories" TO "anon";

GRANT SELECT ON "mimipip"."collection_stories" TO "authenticated";

GRANT SELECT ON "mimipip"."collections" TO "anon";

GRANT SELECT ON "mimipip"."collections" TO "authenticated";

GRANT SELECT ON "mimipip"."concept_shop_designs" TO "anon";

GRANT SELECT ON "mimipip"."concept_shop_designs" TO "authenticated";

GRANT SELECT ON "mimipip"."customers" TO "anon";

GRANT SELECT ON "mimipip"."customers" TO "authenticated";

GRANT SELECT ON "mimipip"."installed_wall_photos" TO "anon";

GRANT SELECT ON "mimipip"."installed_wall_photos" TO "authenticated";

GRANT SELECT ON "mimipip"."materials" TO "anon";

GRANT SELECT ON "mimipip"."materials" TO "authenticated";

GRANT SELECT ON "mimipip"."price_tiers" TO "anon";

GRANT SELECT ON "mimipip"."price_tiers" TO "authenticated";

GRANT SELECT ON "mimipip"."print_product_types" TO "anon";

GRANT SELECT ON "mimipip"."print_product_types" TO "authenticated";

GRANT SELECT ON "mimipip"."product_categories" TO "anon";

GRANT SELECT ON "mimipip"."product_categories" TO "authenticated";

GRANT SELECT ON "mimipip"."product_images" TO "anon";

GRANT SELECT ON "mimipip"."product_images" TO "authenticated";

GRANT SELECT ON "mimipip"."product_materials" TO "anon";

GRANT SELECT ON "mimipip"."product_materials" TO "authenticated";

GRANT SELECT ON "mimipip"."product_tags" TO "anon";

GRANT SELECT ON "mimipip"."product_tags" TO "authenticated";

GRANT SELECT ON "mimipip"."products" TO "anon";

GRANT SELECT ON "mimipip"."products" TO "authenticated";

GRANT SELECT ON "mimipip"."reviews" TO "anon";

GRANT SELECT ON "mimipip"."reviews" TO "authenticated";

GRANT SELECT ON "mimipip"."size_presets" TO "anon";

GRANT SELECT ON "mimipip"."size_presets" TO "authenticated";

GRANT SELECT ON "mimipip"."trade_partners" TO "anon";

GRANT SELECT ON "mimipip"."trade_partners" TO "authenticated";

GRANT SELECT ON "mimipip"."wishlist_items" TO "anon";

GRANT SELECT ON "mimipip"."wishlist_items" TO "authenticated";

GRANT SELECT ON SEQUENCE "mimipip"."auth_otp_requests_id_seq" TO "service_role";

GRANT SELECT ON SEQUENCE "mimipip"."auth_sms_requests_id_seq" TO "service_role";

GRANT SELECT ON SEQUENCE "mimipip"."character_requests_id_seq" TO "service_role";

GRANT SELECT ON SEQUENCE "mimipip"."orders_order_number_seq" TO "service_role";

GRANT SELECT ON SEQUENCE "mimipip"."print_queue_deletions_id_seq" TO "service_role";

GRANT SELECT ON SEQUENCE "mimipip"."room_exclusion_hits_id_seq" TO "service_role";

GRANT SELECT ON SEQUENCE "mimipip"."search_synonyms_id_seq" TO "service_role";

GRANT SELECT ON SEQUENCE "mimipip"."site_events_id_seq" TO "service_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."DoNotContact" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."Lead" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."auth_email_codes" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."auth_otp_requests" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."auth_sms_requests" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."board_items" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."boards" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."cart_items" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."carts" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."catalogue_gaps" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."catalogue_health" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."character_requests" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."chat_messages" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."chat_sessions" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."checkout_failures" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."collection_launches" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."collection_stories" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."collections" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."concept_shop_designs" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."concierge_events" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."contact_messages" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_accounts" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_design_sales" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_designs" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_jobs" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_orders" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_showrooms" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_site_areas" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_site_batch_walls" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_site_batches" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_stores" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."corporate_wall_studies" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."customers" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."design_commercial_policy" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."design_exclusivity" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."design_sale_history" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."design_sales" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."gift_cards" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."identity_link" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."ink_coverage_classes" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."installed_wall_photos" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."marketing_asset_library" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."materials" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."media_reservations" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."newsletter_signups" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."order_items" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."orders" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."partner_private_confirmations" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."partner_private_options" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."partner_private_projects" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."partner_release_outbox" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."popular_designs_cache" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."price_tiers" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."print_jobs" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."print_modes" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."print_product_types" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."print_queue" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."print_queue_deletions" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."print_runs" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."product_categories" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."product_images" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."product_materials" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."product_tags" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."production_jobs" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."products" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."retag_queue" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."reviews" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."room_exclusion_hits" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."room_exclusions" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."room_scenes" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."royalty_partners" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."search_synonyms" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."showcase_pool_cache" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."site_events" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."size_presets" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."taste_profiles" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."trade_contacts" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."trade_partners" TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON "mimipip"."wishlist_items" TO service_role;

GRANT UPDATE ON "mimipip"."board_items" TO "authenticated";

GRANT UPDATE ON "mimipip"."boards" TO "authenticated";

GRANT UPDATE ON "mimipip"."customers" TO "anon";

GRANT UPDATE ON "mimipip"."customers" TO "authenticated";

GRANT UPDATE ON "mimipip"."wishlist_items" TO "anon";

GRANT UPDATE ON "mimipip"."wishlist_items" TO "authenticated";

GRANT UPDATE ON SEQUENCE "mimipip"."auth_otp_requests_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "mimipip"."auth_sms_requests_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "mimipip"."character_requests_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "mimipip"."orders_order_number_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "mimipip"."print_queue_deletions_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "mimipip"."room_exclusion_hits_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "mimipip"."search_synonyms_id_seq" TO "service_role";

GRANT UPDATE ON SEQUENCE "mimipip"."site_events_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."auth_otp_requests_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."auth_sms_requests_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."character_requests_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."orders_order_number_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."print_queue_deletions_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."room_exclusion_hits_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."search_synonyms_id_seq" TO "service_role";

GRANT USAGE ON SEQUENCE "mimipip"."site_events_id_seq" TO "service_role";

-- Source catalogue_health view has no security_invoker reloption; it remains service-role-only per source ACL. Verify no public grant broadens it.

SET LOCAL check_function_bodies = on;

-- The deliberate guard at top prevents this proposal from applying.

COMMIT;

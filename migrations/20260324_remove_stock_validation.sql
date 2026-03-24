-- Migration: Remove stock validation artifacts
-- Date: 2026-03-24
--
-- Purpose:
-- 1) Drop stock-validation constraints/triggers/procedures (if they exist)
-- 2) Drop obsolete stock columns/config that are no longer used by runtime
--
-- Notes:
-- - This script is intentionally defensive/idempotent using IF EXISTS.
-- - Current primary runtime uses Google Sheets (Apps Script), so SQL objects may not exist.
-- - Execute only on relational deployments that previously implemented stock validation.

BEGIN;

-- 1) Remove check constraints related to stock validation
ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS chk_products_stock_non_negative;
ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS chk_products_stock_qty_non_negative;
ALTER TABLE IF EXISTS order_items DROP CONSTRAINT IF EXISTS chk_order_items_qty_vs_stock;

-- 2) Remove triggers and trigger functions related to stock checks
DROP TRIGGER IF EXISTS trg_validate_stock_before_order_item_insert ON order_items;
DROP TRIGGER IF EXISTS trg_validate_stock_before_order_item_update ON order_items;
DROP TRIGGER IF EXISTS trg_products_stock_guard ON products;

DROP FUNCTION IF EXISTS validate_stock_before_order_item();
DROP FUNCTION IF EXISTS enforce_product_stock_guard();

-- 3) Remove stored procedures related to stock validation
DROP PROCEDURE IF EXISTS sp_validate_stock_for_checkout;
DROP PROCEDURE IF EXISTS sp_validate_stock;

-- 4) Remove obsolete columns/config (only if present)
ALTER TABLE IF EXISTS products DROP COLUMN IF EXISTS stock;
ALTER TABLE IF EXISTS products DROP COLUMN IF EXISTS available_stock;
ALTER TABLE IF EXISTS products DROP COLUMN IF EXISTS reserved_stock;
ALTER TABLE IF EXISTS settings DROP COLUMN IF EXISTS enable_stock_validation;

COMMIT;

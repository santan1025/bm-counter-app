-- ============================================================================
-- Migration: Quick Add shortcuts for the Sales screen.
-- Run once in: Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ============================================================================

alter table products add column if not exists is_quick_add boolean default false;

-- Optional: mark up to 6 of your best-sellers per shop as Quick Add.
-- Example (edit product names + shop name to match yours):
--
-- update products set is_quick_add = true
-- where shop_id = (select id from shops where name = 'BM Ventures - Airoli')
-- and name in ('Walnut Brownie','Chocochip Brownie','Truffle Pastry','Chocochips Pastry','Veg Puff','Lava Cake');

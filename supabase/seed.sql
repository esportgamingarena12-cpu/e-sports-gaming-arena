-- Starter data (runs after migrations on `supabase db reset`). Idempotent enough for repeated resets.

update settings set
  shop_name = 'E-Sports Gaming Arena',
  address = null,  -- shown on receipts, so leave empty until the real address is set in Admin > Settings
  upi_id = null,
  upi_payee_name = 'E-Sports Gaming Arena';

insert into stations (name, type, rate_per_hour, sort_order, online_bookable) values
  ('PC 1',  'pc',  60.00,  1, true),
  ('PC 2',  'pc',  60.00,  2, true),
  ('PC 3',  'pc',  60.00,  3, true),
  ('PS5 1', 'ps5', 120.00, 4, true),
  ('PS5 2', 'ps5', 120.00, 5, true);

insert into packages (name, minutes, price, station_type) values
  ('PC 3 Hours',   180, 150.00, 'pc'),
  ('PC Day Pass',  600, 400.00, 'pc'),
  ('PS5 2 Hours',  120, 200.00, 'ps5');

-- Phase 6 worked example uses Maggi 50 and Coffee 40.
insert into products (name, category, price, stock_qty, low_stock_level) values
  ('Maggi',      'Snacks', 50.00, 30, 5),
  ('Coffee',     'Drinks', 40.00, 40, 5),
  ('Cold Drink', 'Drinks', 30.00, 48, 10),
  ('Chips',      'Snacks', 20.00, 50, 10),
  ('Water 500ml','Drinks', 20.00, 60, 12),
  ('Sandwich',   'Snacks', 60.00, 15, 5);

insert into stock_moves (product_id, move_type, qty, note, user_id)
select id, 'purchase', stock_qty, 'Opening stock', null from products;

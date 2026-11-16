-- Starter data (runs after migrations on `supabase db reset`). Idempotent enough for repeated resets.

update settings set
  shop_name = 'E-Sports Gaming Arena',
  address = null,  -- shown on receipts, so leave empty until the real address is set in Admin > Settings
  upi_id = null,
  upi_payee_name = 'E-Sports Gaming Arena';

-- Stations and prices follow the printed rate card: 5 PC and 3 PS5.
-- Hourly rates are the card's 1-hour prices; they are also what time beyond a package is charged at.
insert into stations (name, type, rate_per_hour, sort_order, online_bookable) values
  ('PC 1',  'pc',  90.00,  1, true),
  ('PC 2',  'pc',  90.00,  2, true),
  ('PC 3',  'pc',  90.00,  3, true),
  ('PC 4',  'pc',  90.00,  4, true),
  ('PC 5',  'pc',  90.00,  5, true),
  ('PS5 1', 'ps5', 110.00, 6, true),
  ('PS5 2', 'ps5', 110.00, 7, true),
  ('PS5 3', 'ps5', 110.00, 8, true);

-- Fixed-price packages from the rate card (PS5 is priced by number of players).
insert into packages (name, minutes, price, station_type) values
  ('PC 30 Minutes',         30,  50.00, 'pc'),
  ('PC 1 Hour',             60,  90.00, 'pc'),
  ('PS5 1 Player 30 Min',   30,  60.00, 'ps5'),
  ('PS5 1 Player 1 Hour',   60, 110.00, 'ps5'),
  ('PS5 2 Players 30 Min',  30,  70.00, 'ps5'),
  ('PS5 2 Players 1 Hour',  60, 150.00, 'ps5'),
  ('PS5 3 Players 30 Min',  30, 100.00, 'ps5'),
  ('PS5 3 Players 1 Hour',  60, 180.00, 'ps5'),
  ('PS5 4 Players 30 Min',  30, 120.00, 'ps5'),
  ('PS5 4 Players 1 Hour',  60, 250.00, 'ps5');

-- Food menu from the printed rate card. Opening stock is a starting guess: change it in Stock.
insert into products (name, category, price, stock_qty, low_stock_level) values
  ('Sweet Corn Pizza', 'Food', 150.00, 20, 5),
  ('Veg Pizza',        'Food', 120.00, 20, 5),
  ('Veg Sandwich',     'Food',  50.00, 20, 5),
  ('Corn Sandwich',    'Food',  60.00, 20, 5),
  ('Samosa',           'Food',  15.00, 20, 5);

insert into stock_moves (product_id, move_type, qty, note, user_id)
select id, 'purchase', stock_qty, 'Opening stock', null from products;

-- Games on the home page: the owner's own list (Admin > Games edits it). The first run of migration 0018 loads a starter
-- list of well-known titles; this replaces it with the games actually played at the studio. GTA VI stays as coming soon.
delete from games
 where status = 'available'
   and lower(btrim(title)) not in ('call of duty: modern warfare ii', 'call of duty: modern warfare iv', 'mortal kombat', 'wwe 2k26',
       'marvel''s spider-man 2', 'fifa 27', 'god of war', 'pubg: battlegrounds', 'valorant', 'free fire', 'asphalt');
insert into games (title, station_type, status, hot, is_new, sort_order, active) values
  ('PUBG: Battlegrounds',             'pc',  'available', false, false, 1, true),
  ('Call of Duty: Modern Warfare II', 'ps5', 'available', false, false, 2, true),
  ('Valorant',                        'pc',  'available', false, false, 3, true),
  ('Call of Duty: Modern Warfare IV', 'ps5', 'available', false, false, 4, true),
  ('Free Fire',                       'pc',  'available', false, false, 5, true),
  ('Mortal Kombat',                   'ps5', 'available', false, false, 6, true),
  ('Asphalt',                         'pc',  'available', false, false, 7, true),
  ('WWE 2K26',                        'ps5', 'available', false, false, 8, true),
  ('Marvel''s Spider-Man 2',          'ps5', 'available', false, false, 9, true),
  ('FIFA 27',                         'ps5', 'available', false, false, 10, true),
  ('God of War',                      'ps5', 'available', false, false, 11, true)
on conflict ((lower(btrim(title)))) do update
  set station_type = excluded.station_type, status = 'available', hot = false, is_new = false,
      sort_order = excluded.sort_order, active = true;

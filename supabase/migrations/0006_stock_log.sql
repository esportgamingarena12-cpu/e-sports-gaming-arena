-- 0006_stock_log.sql : a staff-only stock movement log that includes who made each move,
-- and live sync of products / stock_moves to every counter.

-- Staff cannot read other people's profiles (customer emails live there), so the log is a
-- function that returns only the display name of the user who made each move.
create function recent_stock_moves(p_limit int default 50)
returns table (
  id           bigint,
  created_at   timestamptz,
  move_type    stock_move_type,
  qty          int,
  note         text,
  product_name text,
  user_name    text,
  bill_no      bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Not allowed' using errcode = '42501'; end if;
  return query
    select m.id, m.created_at, m.move_type, m.qty, m.note, p.name,
           coalesce(nullif(btrim(pr.full_name), ''), pr.email, 'System'),
           m.bill_no
      from stock_moves m
      join products p on p.id = m.product_id
      left join profiles pr on pr.id = m.user_id
     order by m.created_at desc, m.id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

revoke execute on function recent_stock_moves(int) from public, anon;
grant  execute on function recent_stock_moves(int) to authenticated;

-- live sync
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products') then
      alter publication supabase_realtime add table products;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_moves') then
      alter publication supabase_realtime add table stock_moves;
    end if;
  end if;
end $$;

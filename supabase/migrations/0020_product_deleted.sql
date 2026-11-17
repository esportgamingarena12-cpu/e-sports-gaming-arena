-- Phase 25: a deleted product that has sales history used to stay on the Stock and Products screens as "inactive".
-- Now delete_product marks it deleted (deleted_at) and the screens leave it out. Bills and history keep pointing at it.
alter table products add column deleted_at timestamptz;

create or replace function delete_product(p_product bigint) returns text
language plpgsql security definer set search_path = public as $$
declare v_used boolean;
begin
  if not is_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  perform 1 from products where id = p_product for update;
  if not found then raise exception 'Product not found'; end if;

  select exists (select 1 from bill_items where product_id = p_product)
      or exists (select 1 from tab_items where product_id = p_product)
      or exists (select 1 from stock_moves where product_id = p_product and move_type <> 'purchase')
    into v_used;

  if v_used then
    update products set active = false, featured = false, deleted_at = now() where id = p_product;
    return 'archived';
  end if;
  delete from stock_moves where product_id = p_product;
  delete from products where id = p_product;
  return 'deleted';
end $$;

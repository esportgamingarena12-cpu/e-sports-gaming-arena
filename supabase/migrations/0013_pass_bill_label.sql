-- 0013_pass_bill_label.sql : a station bill for a session that ran on a pass says so on the gaming line,
-- e.g. "Gaming - PC 1 (Weekly PC pass)". Done in a trigger so checkout_bill stays as it is.

create function bill_item_pass_label() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pass text;
begin
  if new.kind = 'gaming' then
    select s.pass_name into v_pass
      from bills b join sessions s on s.id = b.session_id
     where b.bill_no = new.bill_no;
    if v_pass is not null then new.name := new.name || ' (' || v_pass || ' pass)'; end if;
  end if;
  return new;
end $$;

create trigger bill_items_pass_label before insert on bill_items
  for each row execute function bill_item_pass_label();

revoke execute on function bill_item_pass_label() from public, anon, authenticated;

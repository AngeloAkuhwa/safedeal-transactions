-- Phase F5: notify seller when a product transitions into out_of_stock.
create or replace function public.notify_seller_product_out_of_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if NEW.status = 'out_of_stock'::product_status
     and OLD.status is distinct from 'out_of_stock'::product_status then

    v_reason := case
      when COALESCE(NEW.stock_quantity, 0) - COALESCE(NEW.reserved_quantity, 0) <= 0
        then 'stock_depleted'
      else 'manual_status_change'
    end;

    insert into public.notifications (
      user_id, type, channel, title, message, status, metadata
    ) values (
      NEW.seller_id,
      'system_message'::notification_type,
      'in_app'::notification_channel,
      'Product is now out of stock',
      format('"%s" is now out of stock and is no longer available for new buyers.', NEW.title),
      'pending'::notification_status,
      jsonb_build_object(
        'event', 'product_out_of_stock',
        'product_id', NEW.id,
        'product_slug', NEW.slug,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'reason', v_reason
      )
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_seller_product_out_of_stock on public.products;
create trigger trg_notify_seller_product_out_of_stock
after update of status on public.products
for each row execute function public.notify_seller_product_out_of_stock();

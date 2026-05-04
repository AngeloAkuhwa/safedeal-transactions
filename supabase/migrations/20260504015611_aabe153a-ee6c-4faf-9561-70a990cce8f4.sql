do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions',
    'transaction_events',
    'money_status_history',
    'disputes',
    'payments',
    'payouts',
    'release_review_queue'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when others then null;
    end;
    begin
      execute format('alter table public.%I replica identity full', t);
    exception when others then null;
    end;
  end loop;
end $$;
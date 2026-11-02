-- Bracelet order alerts (2 Nov 2026). Run on STAGING (tested: both texts
-- arrived) and PRODUCTION on 2 Nov 2026.
--
-- Texts Gary when a bracelet is ordered, and again when the customer taps
-- "I've sent the $6.95". send_sms_notification() can't be used here: since
-- item 55 (23 Sep 2026) it only runs for admins/reviewers, and an order is
-- placed by the customer. This function is a trigger only (no RPC access), and
-- a Twilio failure never blocks the customer's order.
--
-- <TWILIO_ACCOUNT_SID> below is a placeholder (GitHub push protection blocks the
-- real value). The function as installed on staging and production has the real
-- Account SID - copy it from public.send_sms_notification() if this is ever
-- re-run. The auth token is read from Vault, never written here.

create or replace function public.notify_bracelet_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  msg   text;
  token text;
  owner_phone constant text := '+19177218269';   -- Gary
begin
  if new.bracelet_requested and (tg_op = 'INSERT' or not coalesce(old.bracelet_requested, false)) then
    msg := '30 Acts: new bracelet order from ' || coalesce(new.ship_name, '?') || ', '
        || coalesce(new.ship_city, '') || ' ' || coalesce(new.ship_state, '')
        || '. Waiting for $6.95.';
  elsif tg_op = 'UPDATE' and new.bracelet_requested
        and old.payment_method is null and new.payment_method is not null then
    msg := '30 Acts: ' || coalesce(new.ship_name, '?') || ' says they sent $6.95 by '
        || new.payment_method || '. Check it, then Mark paid in Recognition Orders.';
  else
    return new;
  end if;

  begin
    select decrypted_secret into token from vault.decrypted_secrets where name = 'twilio_auth_token';
    perform http((
      'POST'::http_method,
      'https://api.twilio.com/2010-04-01/Accounts/<TWILIO_ACCOUNT_SID>/Messages.json',
      array[http_header('Authorization', concat('Basic ', replace(encode(convert_to(concat('<TWILIO_ACCOUNT_SID>:', token), 'UTF8'), 'base64'), chr(10), '')))],
      'application/x-www-form-urlencoded',
      concat('To=', urlencode(owner_phone), '&From=%2B18336996137&Body=', urlencode(msg))
    )::http_request);
  exception when others then
    null;   -- never let an alert failure block the customer's order
  end;
  return new;
end;
$$;

revoke all on function public.notify_bracelet_order() from public, anon, authenticated;

create trigger recognition_orders_notify
after insert or update on public.recognition_orders
for each row execute function public.notify_bracelet_order();

-- "Ubah pembayaran" berlaku juga untuk peserta tambahan admin (source = 'admin'), tidak hanya baris
-- file Kuyy: nominal, status bayar & jalur bayarnya diperlakukan sama — masuk Keuangan setelah activity
-- selesai bila lunas (Via Kuy → Saldo Kuyy, Via Manual → akun bayar manual), koreksi sesudahnya.
-- Baris admin baru tetap nominal 0 → tidak ada yang tercatat sampai admin mengisi nominalnya.

create or replace function participant_payment_editable(p session_participants) returns boolean
language sql immutable as $$ select p.is_kuy_import or p.source = 'admin' $$;

create or replace function finance_sync_participant(p session_participants, p_count boolean, p_session sessions default null, p_settings finance_settings default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s        sessions := p_session;
  st       finance_settings := p_settings;
  ref      text := 'sp:' || p.id;
  due      bigint;
  recorded boolean;
  ch       record;
begin
  if s.id is null then select * into s from sessions where id = p.session_id; end if;
  due := case when p_count and participant_payment_editable(p) and p.payment_status = 'paid' and session_is_finished(s) then p.amount else 0 end;
  recorded := exists (select 1 from finance_transactions where source in ('kuyy_import', 'ticket_manual_paid') and source_ref = ref and deleted_at is null);
  if due = 0 and not recorded then return; end if;
  if st is null then select * into st from finance_settings; end if;
  for ch in
    select * from (values
      ('kuyy_import', 'kuy', st.auto_kuyy, (select id from finance_accounts where system_key = 'kuyy'), 'Tiket Kuyy · '),
      ('ticket_manual_paid', 'manual', st.auto_manual_paid, st.manual_paid_account_id, 'Bayar manual · ')
    ) v(src, channel, enabled, account, label)
  loop
    perform finance_sync_auto(ch.src, ref, case when p.payment_channel = ch.channel then due else 0 end,
      'ticket', ch.account, ch.label || p.full_name, p.session_id, case when recorded then now() else coalesce(s.starts_at, now()) end,
      p_enabled => ch.enabled);
  end loop;
end $$;

drop trigger session_participants_finance_update on session_participants;
create trigger session_participants_finance_update after update of amount, source, kuy_username, payment_status, payment_channel on session_participants
  for each row when ((old.amount, old.is_kuy_import, old.source, old.payment_status, old.payment_channel) is distinct from (new.amount, new.is_kuy_import, new.source, new.payment_status, new.payment_channel))
  execute function finance_on_participant();

create or replace function finance_on_session_finished() returns trigger language plpgsql security definer set search_path = public as $$
declare
  st finance_settings;
begin
  select * into st from finance_settings;
  perform finance_sync_participant(p, true, new, st)
  from session_participants p where p.session_id = new.id and participant_payment_editable(p);
  return null;
end $$;

-- Booking member ikut nominal & status bayar baris pesertanya — juga untuk tambahan admin (booking source admin).
create or replace function session_participant_payment_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update bookings set payment_status = new.payment_status, amount = new.amount
  where session_id = new.session_id and member_id = new.member_id
    and source = (case when new.source = 'admin' then 'admin' else 'kuy' end)::booking_source
    and (payment_status, amount) is distinct from (new.payment_status, new.amount);
  return null;
end $$;
drop trigger session_participants_sync_payment on session_participants;
create trigger session_participants_sync_payment after insert or update of payment_status, amount, member_id on session_participants
  for each row when ((new.is_kuy_import or new.source = 'admin') and new.member_id is not null) execute function session_participant_payment_sync();

-- Peserta tambahan admin dibayar langsung (bukan lewat Kuyy) → jalur bawaan Manual.
update session_participants set payment_channel = 'manual' where source = 'admin' and amount = 0 and payment_channel = 'kuy';

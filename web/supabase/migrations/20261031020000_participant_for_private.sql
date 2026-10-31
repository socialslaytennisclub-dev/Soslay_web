-- session_participant_for tidak mengecek hak akses sendiri (hanya dipanggil dari RPC host), tapi
-- Postgres memberi EXECUTE ke PUBLIC secara default → anon/member bisa memanggilnya langsung dan
-- membuat baris peserta. Cabut dari PUBLIC; RPC host (security definer) tetap bisa memakainya.
revoke execute on function session_participant_for(uuid, uuid) from public, anon, authenticated;

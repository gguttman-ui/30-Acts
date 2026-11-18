// myChildren.js -- load ONLY the signed-in parent's children (item 109, 17 Nov 2026).
//
// family_members has an admin read policy (admin_read_family_members), so an
// unfiltered select returns EVERY family's children to an admin. On 17 Nov the
// Home pills on Gary's (admin) phone showed another user's two children.
// Every app screen that lists "my children" must go through this function,
// which always filters on parent_id = the signed-in user.
import { supabase } from './supabase';

export async function loadMyChildren(columns) {
  const { data: { session } = {} } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return { data: [], error: null };
  return supabase
    .from('family_members')
    .select(columns)
    .eq('parent_id', uid)
    .order('created_at', { ascending: true });
}

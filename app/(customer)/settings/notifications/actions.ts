'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function updatePref(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: member } = await supabase
    .from('members').select('id, org_id').eq('user_id', user.id).eq('status', 'active').single()
  if (!member) redirect('/login')

  const event_type = formData.get('event_type') as string
  const channel = formData.get('channel') as string
  const enabled = formData.get('enabled') === 'true'

  // upsert
  await supabase.from('notification_preferences').upsert({
    org_id: member.org_id,
    member_id: member.id,
    scope: 'member',
    channel,
    event_type,
    enabled,
  }, { onConflict: 'org_id,member_id,channel,event_type' })

  revalidatePath('/settings/notifications')
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

async function getAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')
  const { data: adminUser } = await supabase
    .from('admin_users').select('id, name, role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')
  return { supabase, adminUser }
}

export async function decidePath(formData: FormData) {
  const { supabase, adminUser } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const path_type = formData.get('path_type') as 'fast' | 'full'

  await supabase.from('action_requests').update({
    path_type,
    assigned_to: adminUser.id,
    status: 'in_review',
  }).eq('id', request_id)

  await supabase.from('request_events').insert({
    request_id,
    org_id: (formData.get('org_id') as string),
    event_type: 'path_decided',
    actor_type: 'admin',
    actor_id: adminUser.id,
    event_data: { path_type },
  })

  revalidatePath(`/console/requests/${request_id}`)
}

export async function updateRequestStatus(formData: FormData) {
  const { supabase, adminUser } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const next_status = formData.get('next_status') as string

  const updates: Record<string, unknown> = { status: next_status }
  if (['completed', 'rejected', 'cancelled', 'approved'].includes(next_status)) {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = adminUser.id
  }

  await supabase.from('action_requests').update(updates).eq('id', request_id)
  revalidatePath(`/console/requests/${request_id}`)
  revalidatePath('/console/requests')
}

export async function updateProgressState(formData: FormData) {
  const { supabase } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const key = formData.get('key') as string
  const value = formData.get('value') === 'true'

  const { data: current } = await supabase
    .from('action_requests').select('progress_state').eq('id', request_id).single()

  const progress_state = {
    ...(current?.progress_state as Record<string, unknown> ?? {}),
    [key]: value,
  }

  await supabase.from('action_requests')
    .update({ progress_state }).eq('id', request_id)

  revalidatePath(`/console/requests/${request_id}`)
}

export async function sendAdminMessage(formData: FormData) {
  const { supabase, adminUser } = await getAdmin()
  const request_id = formData.get('request_id') as string
  const org_id = formData.get('org_id') as string
  const body = (formData.get('body') as string).trim()
  if (!body) return

  await supabase.from('request_messages').insert({
    request_id,
    org_id,
    message_type: 'text',
    sender_type: 'admin',
    sender_id: adminUser.id,
    sender_name: adminUser.name,
    body,
  })

  revalidatePath(`/console/requests/${request_id}`)
}

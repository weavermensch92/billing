'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

async function getAdmin(requiredRole?: 'super' | 'finance') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')
  const { data: adminUser } = await supabase
    .from('admin_users').select('id, role').eq('email', user.email ?? '').eq('is_active', true).single()
  if (!adminUser) redirect('/console/login')
  if (requiredRole === 'super' && adminUser.role !== 'super') {
    return { error: 'Super 권한이 필요합니다.' }
  }
  if (requiredRole === 'finance' && !['super', 'finance'].includes(adminUser.role)) {
    return { error: 'Finance 권한이 필요합니다.' }
  }
  return { supabase, adminUser, email: user.email }
}

export async function issueInvoice(formData: FormData) {
  const ctx = await getAdmin('finance')
  if ('error' in ctx) redirect(`/console/invoices/${formData.get('invoice_id')}?error=${encodeURIComponent(ctx.error!)}`)

  const invoice_id = formData.get('invoice_id') as string

  const { data: invoice, error } = await ctx.supabase
    .from('invoices').update({ status: 'issued' })
    .eq('id', invoice_id)
    .eq('status', 'draft')
    .select('org_id, total_due_krw, requires_super_approval, super_approved_at')
    .single()

  if (error || !invoice) {
    redirect(`/console/invoices/${invoice_id}?error=${encodeURIComponent('발행 실패: ' + (error?.message ?? 'unknown'))}`)
  }

  if (invoice.requires_super_approval && !invoice.super_approved_at) {
    redirect(`/console/invoices/${invoice_id}?error=Super 승인이 필요합니다.`)
  }

  await ctx.supabase.from('audit_logs').insert({
    org_id: invoice.org_id,
    actor_type: 'admin',
    actor_id: ctx.adminUser.id,
    actor_email: ctx.email,
    action: 'invoice_issued',
    target_type: 'invoice',
    target_id: invoice_id,
    visibility: 'both',
    detail: { total_due_krw: invoice.total_due_krw },
  })

  revalidatePath(`/console/invoices/${invoice_id}`)
  revalidatePath('/console/invoices')
  redirect(`/console/invoices/${invoice_id}?success=청구서가 발행되었습니다.`)
}

export async function superApprove(formData: FormData) {
  const ctx = await getAdmin('super')
  if ('error' in ctx) redirect(`/console/invoices/${formData.get('invoice_id')}?error=${encodeURIComponent(ctx.error!)}`)

  const invoice_id = formData.get('invoice_id') as string

  const { data: invoice, error } = await ctx.supabase
    .from('invoices')
    .update({ super_approved_at: new Date().toISOString(), super_approved_by: ctx.adminUser.id })
    .eq('id', invoice_id).select('org_id').single()

  if (error || !invoice) {
    redirect(`/console/invoices/${invoice_id}?error=${encodeURIComponent('승인 실패: ' + (error?.message ?? 'unknown'))}`)
  }

  await ctx.supabase.from('audit_logs').insert({
    org_id: invoice.org_id,
    actor_type: 'admin',
    actor_id: ctx.adminUser.id,
    actor_email: ctx.email,
    action: 'invoice_super_approved',
    target_type: 'invoice',
    target_id: invoice_id,
    visibility: 'internal_only',
    detail: {},
  })

  revalidatePath(`/console/invoices/${invoice_id}`)
  redirect(`/console/invoices/${invoice_id}?success=Super 승인 완료. 이제 발행할 수 있습니다.`)
}

export async function approveInvoice(formData: FormData) {
  // alias for clarity
  await issueInvoice(formData)
}

export async function recordTaxInvoice(formData: FormData) {
  const ctx = await getAdmin('finance')
  if ('error' in ctx) redirect(`/console/invoices/${formData.get('invoice_id')}?error=${encodeURIComponent(ctx.error!)}`)

  const invoice_id = formData.get('invoice_id') as string
  const tax_invoice_id = (formData.get('tax_invoice_id') as string).trim()
  if (!tax_invoice_id) {
    redirect(`/console/invoices/${invoice_id}?error=거래번호를 입력하세요.`)
  }

  const { data: invoice, error } = await ctx.supabase
    .from('invoices')
    .update({ tax_invoice_id, tax_invoice_issued_at: new Date().toISOString() })
    .eq('id', invoice_id).select('org_id').single()

  if (error || !invoice) {
    redirect(`/console/invoices/${invoice_id}?error=${encodeURIComponent('기록 실패: ' + (error?.message ?? 'unknown'))}`)
  }

  await ctx.supabase.from('audit_logs').insert({
    org_id: invoice.org_id,
    actor_type: 'admin',
    actor_id: ctx.adminUser.id,
    actor_email: ctx.email,
    action: 'tax_invoice_recorded',
    target_type: 'invoice',
    target_id: invoice_id,
    visibility: 'both',
    detail: { tax_invoice_id },
  })

  revalidatePath(`/console/invoices/${invoice_id}`)
  redirect(`/console/invoices/${invoice_id}?success=세금계산서 거래번호가 기록되었습니다.`)
}

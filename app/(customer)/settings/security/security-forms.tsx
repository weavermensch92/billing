'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  totpFactorId: string | null
  totpStatus: string | null  // 'verified' | 'unverified' | null
}

export function SecurityForms({ totpFactorId, totpStatus }: Props) {
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const hasVerifiedTotp = totpStatus === 'verified'

  const onEnroll = () => {
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error || !data) {
        setMessage({ type: 'error', text: '등록 실패: ' + (error?.message ?? 'unknown') })
        return
      }
      setEnrollData({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      })
    })
  }

  const onVerify = () => {
    if (!enrollData || verifyCode.length !== 6) return
    startTransition(async () => {
      const supabase = createClient()
      const { data: challenge, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrollData.factorId })
      if (chErr || !challenge) {
        setMessage({ type: 'error', text: 'Challenge 실패: ' + (chErr?.message ?? 'unknown') })
        return
      }
      const { error } = await supabase.auth.mfa.verify({
        factorId: enrollData.factorId,
        challengeId: challenge.id,
        code: verifyCode,
      })
      if (error) {
        setMessage({ type: 'error', text: '인증 실패: ' + error.message })
        return
      }
      setMessage({ type: 'success', text: '2FA가 활성화되었습니다.' })
      setEnrollData(null)
      setVerifyCode('')
      setTimeout(() => window.location.reload(), 1200)
    })
  }

  const onDisable = () => {
    if (!totpFactorId) return
    if (!confirm('2FA를 비활성화하시겠습니까? 계정 보안이 약해집니다.')) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.mfa.unenroll({ factorId: totpFactorId })
      if (error) {
        setMessage({ type: 'error', text: '비활성화 실패: ' + error.message })
        return
      }
      setMessage({ type: 'success', text: '2FA가 비활성화되었습니다.' })
      setTimeout(() => window.location.reload(), 1200)
    })
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">2단계 인증 (TOTP)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Google Authenticator, 1Password, Authy 등에서 사용할 수 있습니다.
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded ${
          hasVerifiedTotp ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {hasVerifiedTotp ? '활성화됨' : '비활성화'}
        </span>
      </div>

      {message && (
        <div className={`mb-3 p-3 rounded text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      {/* 비활성 상태 — 등록 시작 */}
      {!hasVerifiedTotp && !enrollData && (
        <button
          onClick={onEnroll}
          disabled={pending}
          className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          {pending ? '등록 중...' : '2FA 설정 시작'}
        </button>
      )}

      {/* QR 코드 표시 + 검증 */}
      {enrollData && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-700 mb-2">
              인증 앱에서 아래 QR 코드를 스캔하거나, 수동 시크릿을 입력하세요.
            </p>
            <div className="flex items-start gap-5">
              <div
                className="w-40 h-40 border border-gray-200 rounded-lg bg-white p-2"
                dangerouslySetInnerHTML={{ __html: enrollData.qrCode }}
              />
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">수동 시크릿</p>
                <code className="block p-2 bg-gray-100 rounded text-xs font-mono break-all">
                  {enrollData.secret}
                </code>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">인증 코드 (6자리)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-center tracking-widest"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onVerify}
              disabled={pending || verifyCode.length !== 6}
              className="bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {pending ? '인증 중...' : '인증 완료'}
            </button>
            <button
              onClick={() => { setEnrollData(null); setVerifyCode('') }}
              className="border border-gray-300 text-gray-700 text-sm px-4 py-2 rounded-lg hover:bg-gray-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 활성화 상태 — 비활성화 옵션 */}
      {hasVerifiedTotp && (
        <div className="flex items-center gap-3">
          <button
            onClick={onDisable}
            disabled={pending}
            className="border border-red-300 text-red-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-50"
          >
            2FA 비활성화
          </button>
        </div>
      )}
    </div>
  )
}

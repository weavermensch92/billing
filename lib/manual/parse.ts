/**
 * docs/console-manual.md 파서.
 *
 * 입력 마크다운은 다음 구조를 따른다 (단일 소스):
 *   # 콘솔 사용 설명서                          (전체 문서 제목, 무시)
 *
 *   ## /console/home {#home}                  ← 페이지 섹션 (slug 필수)
 *   ### 언제 사용
 *   ...
 *
 *   ## /console/orgs {#orgs}
 *   ...
 *
 * - `## ` 헤더 + `{#slug}` 앵커가 섹션 구분자
 * - 각 섹션 안의 마크다운은 marked 로 HTML 변환
 * - 페이지가 빌드 타임에 호출 → 결과를 그대로 dangerouslySetInnerHTML 로 렌더
 *   (마크다운 원본은 신뢰된 저장소 파일이므로 XSS 위험 없음)
 */

import { marked } from 'marked'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ManualSection {
  slug: string
  title: string         // 헤더 raw 텍스트 ("/console/home")
  bodyMarkdown: string  // 섹션 본문 (헤더 제외)
  bodyHtml: string      // marked 변환 결과
}

const MANUAL_PATH = join(process.cwd(), 'docs', 'console-manual.md')

/** "## /console/foo {#foo}" 매칭. group 1 = title, group 2 = slug */
const SECTION_HEADER = /^##\s+(.+?)\s+\{#([a-z0-9-]+)\}\s*$/

export function parseManual(md: string): ManualSection[] {
  const lines = md.split('\n')
  const sections: ManualSection[] = []

  let current: { slug: string; title: string; body: string[] } | null = null

  for (const line of lines) {
    const m = SECTION_HEADER.exec(line)
    if (m) {
      if (current) {
        sections.push(finalize(current))
      }
      current = { title: m[1], slug: m[2], body: [] }
      continue
    }
    if (current) {
      current.body.push(line)
    }
  }
  if (current) {
    sections.push(finalize(current))
  }

  return sections
}

function finalize(s: { slug: string; title: string; body: string[] }): ManualSection {
  const bodyMarkdown = s.body.join('\n').trim()
  const bodyHtml = marked.parse(bodyMarkdown, { async: false }) as string
  return { slug: s.slug, title: s.title, bodyMarkdown, bodyHtml }
}

/** 디스크에서 읽어 파싱 — 서버 컴포넌트에서 호출. */
export function loadManualSections(): ManualSection[] {
  const md = readFileSync(MANUAL_PATH, 'utf8')
  return parseManual(md)
}

/** 특정 slug 의 섹션만 (페이지 내 도움말 토글 등 후속 용). */
export function getManualSection(slug: string): ManualSection | null {
  return loadManualSections().find(s => s.slug === slug) ?? null
}

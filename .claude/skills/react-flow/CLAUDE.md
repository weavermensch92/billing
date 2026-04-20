# Skills — React Flow + Dagre

> 파이프라인 (PW-002~005), 규칙 관계 그래프 (PW-012), 기획서 분석 R1~R7 (PW-009) 공통.
> `@xyflow/react` ≥ 12. Dagre 로 자동 레이아웃.

---

## 기본 구조

```tsx
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export function Pipeline({ nodes, edges }) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable
      nodesConnectable={false}  // 사용자가 임의로 연결 추가 불가
      fitView
      maxZoom={2}
      minZoom={0.3}
    >
      <Background gap={16} />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}
```

---

## 커스텀 노드

### 3종 노드 (PW-003)

```tsx
// nodes/HumanNode.tsx (둥근)
function HumanNode({ data }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-glass)] p-3">
      <div className="flex items-center gap-2">
        <StatusBadge status={data.status} />
        <span>{data.name}</span>
      </div>
      {data.pendingHitl > 0 && (
        <Badge className="mt-2">⚡ {data.pendingHitl}건 대기</Badge>
      )}
    </div>
  );
}

// nodes/AINode.tsx (각진)
function AINode({ data }) {
  return (
    <div className="rounded border-2 border-[var(--border-default)] bg-[var(--bg-glass)] p-3">
      {/* AI 에이전트 세션 배지 + 비용 서브노드 */}
    </div>
  );
}

// nodes/HarnessNode.tsx (각진 + ★)
function HarnessNode({ data }) {
  return (
    <div className="rounded border-2 border-[#09090B] bg-[var(--bg-glass-stronger)] p-3">
      <Star className="absolute top-1 right-1 w-3 h-3" />
      {/* 배정 요약 */}
    </div>
  );
}

const nodeTypes = { human: HumanNode, ai: AINode, harness: HarnessNode };
```

---

## 커스텀 엣지 (4종, PW-004)

```tsx
// edges/HitlEdge.tsx (AI → 사람, 주황)
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

function HitlEdge({ sourceX, sourceY, targetX, targetY, data }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY });
  return (
    <>
      <BaseEdge 
        path={edgePath} 
        style={{ stroke: 'var(--status-hitl)', strokeWidth: 1.5 }} 
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            <Badge>⚡ {data.label}</Badge>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { hitl: HitlEdge, approve: ApproveEdge, aiAi: AiAiEdge, harness: HarnessEdge };
```

### 데이터 흐름 애니메이션 (dashed)

```tsx
<motion.path
  d={edgePath}
  stroke="var(--text-primary)"
  strokeDasharray="5,5"
  fill="none"
  animate={{ strokeDashoffset: [0, -10] }}
  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
/>
```

---

## Dagre 자동 레이아웃 (PW-012 규칙 그래프)

```tsx
import dagre from '@dagrejs/dagre';

function layoutDag(nodes, edges, direction = 'LR') {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, ranksep: 80, nodesep: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(n => g.setNode(n.id, { width: 200, height: 80 }));
  edges.forEach(e => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return {
    nodes: nodes.map(n => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - 100, y: pos.y - 40 } };
    }),
    edges,
  };
}
```

---

## 성능 최적화

### 대량 노드 (500+)

- **Virtualization**: 보이는 영역만 렌더
- **Node memoization**: `React.memo` + `isNodeEquals`
- **Edge skip**: 줌 아웃 시 엣지 숨김 (`zoomLevel < 0.5`)

```tsx
<ReactFlow
  onlyRenderVisibleElements  // ⚠ 공식 옵션 아님, 직접 구현 필요
  fitView
/>
```

### 상태 전이 애니메이션

Framer Motion + React Flow 조합:
```tsx
const { getNode } = useReactFlow();
// 특정 노드 강조 애니메이션
```

---

## 접근성

- `aria-label` 노드마다 (PW-001-10)
- 키보드 네비 (Tab → 노드 순환)
- `prefers-reduced-motion` 체크

---

## 참조

- 파이프라인 구현: `products/wiring/rules/pipeline_view.md` (PW-002~005)
- 규칙 그래프: `products/wiring/rules/rule_graph.md` (PW-012)
- 기획서 분석 R1~R7: `products/wiring/screens/spec_analysis.md` (PW-009)
- 디자인 토큰: `products/wiring/rules/design.md` (PW-001)

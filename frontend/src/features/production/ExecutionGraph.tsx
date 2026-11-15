import { useId } from "react";
import { Empty, theme } from "antd";
import { executionStatuses, type Execution } from "./executionApi";
export function ExecutionGraph({ data }: { data: Execution }) {
  const { token } = theme.useToken(),
    marker = useId().replace(/:/g, "");
  if (!data.stages.length) return <Empty description="Lô chưa có công đoạn" />;
  const levels = new Map<string, number>();
  const level = (id: string, path = new Set<string>()): number => {
    if (levels.has(id)) return levels.get(id)!;
    if (path.has(id)) return 0;
    const stage = data.stages.find((s) => s.step_id === id);
    if (!stage) return 0;
    path.add(id);
    const n = stage.dependencies.length
      ? 1 +
        Math.max(...stage.dependencies.map((dep) => level(dep, new Set(path))))
      : 0;
    levels.set(id, n);
    return n;
  };
  data.stages.forEach((s) => level(s.step_id));
  const rows: Array<typeof data.stages> = [];
  for (const stage of data.stages) {
    const l = levels.get(stage.step_id)!;
    (rows[l] ??= []).push(stage);
  }
  const width = Math.max(1, ...rows.map((row) => row.length)) * 230,
    height = rows.length * 115;
  const positions = new Map(
    data.stages.map((stage) => {
      const l = levels.get(stage.step_id)!,
        row = rows[l];
      return [
        stage.step_id,
        {
          x: (width - row.length * 230) / 2 + row.indexOf(stage) * 230 + 10,
          y: l * 115 + 8,
        },
      ];
    }),
  );
  const color = (status: string) =>
    status === "COMPLETED"
      ? token.colorSuccess
      : status === "IN_PROGRESS"
        ? token.colorPrimary
        : status === "PAUSED"
          ? token.colorWarning
          : token.colorTextSecondary;
  return (
    <div style={{ maxHeight: "50dvh", overflowY: "auto", minWidth: 0 }}>
      <svg
        role="img"
        aria-label="Graph công đoạn và quan hệ phụ thuộc AND-Join"
        viewBox={"0 0 " + width + " " + height}
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        <defs>
          <marker
            id={marker}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill={token.colorPrimary} />
          </marker>
        </defs>
        {data.stages.flatMap((stage) =>
          stage.dependencies.map((dep) => {
            const a = positions.get(dep),
              b = positions.get(stage.step_id);
            return a && b ? (
              <path
                key={dep + "-" + stage.step_id}
                d={
                  "M" +
                  (a.x + 100) +
                  "," +
                  (a.y + 82) +
                  " C" +
                  (a.x + 100) +
                  "," +
                  (a.y + 100) +
                  " " +
                  (b.x + 100) +
                  "," +
                  (b.y - 20) +
                  " " +
                  (b.x + 100) +
                  "," +
                  b.y
                }
                fill="none"
                stroke={token.colorPrimary}
                strokeWidth="1.5"
                markerEnd={"url(#" + marker + ")"}
              />
            ) : null;
          }),
        )}
        {data.stages.map((stage) => {
          const p = positions.get(stage.step_id)!;
          return (
            <g
              key={stage.step_id}
              transform={"translate(" + p.x + "," + p.y + ")"}
            >
              <title>
                {stage.name +
                  " · " +
                  executionStatuses[stage.execution_status] +
                  " · " +
                  stage.completed_quantity +
                  "/" +
                  data.planned_quantity}
              </title>
              <rect
                width="210"
                height="82"
                rx={token.borderRadius}
                fill={token.colorBgContainer}
                stroke={color(stage.execution_status)}
              />
              <text
                x="10"
                y="23"
                fontSize="14"
                fontWeight="600"
                fill={token.colorText}
              >
                {stage.name.length > 22
                  ? stage.name.slice(0, 21) + "…"
                  : stage.name}
              </text>
              <text
                x="10"
                y="44"
                fontSize="12"
                fill={color(stage.execution_status)}
              >
                {executionStatuses[stage.execution_status]}
              </text>
              <text x="10" y="65" fontSize="12" fill={token.colorTextSecondary}>
                {stage.completed_quantity +
                  " / " +
                  data.planned_quantity +
                  " SP"}
              </text>
              <rect
                x="10"
                y="72"
                width={(190 * stage.completed_quantity) / data.planned_quantity}
                height="3"
                fill={color(stage.execution_status)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

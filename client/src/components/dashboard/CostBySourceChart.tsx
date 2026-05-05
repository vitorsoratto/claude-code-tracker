import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSourceLabel, SOURCE_COLORS } from "@/lib/constants";
import { formatUSD } from "@/lib/formatters";
import { TOOLTIP_PROPS } from "@/lib/chartConfig";

interface SourceData {
  source: string;
  cost_usd: number;
}

interface Props {
  data: SourceData[];
}

export function CostBySourceChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.cost_usd, 0);
  const chartData = data.map((d) => ({ ...d, label: getSourceLabel(d.source) }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium">Custo por Fonte</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie data={chartData} dataKey="cost_usd" nameKey="label" innerRadius={50} outerRadius={90} paddingAngle={2}>
              {chartData.map((d) => (
                <Cell key={d.source} fill={SOURCE_COLORS[d.source] || "#6b7280"} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [
                `${formatUSD(Number(value))} (${total > 0 ? ((Number(value) / total) * 100).toFixed(1) : 0}%)`,
                "Custo",
              ]}
              {...TOOLTIP_PROPS}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

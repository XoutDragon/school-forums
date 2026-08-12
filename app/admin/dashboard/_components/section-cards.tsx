import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export function SectionCards({
  stats,
}: {
  stats?: {
    userCount?: number;
    topicCount?: number;
    channelCount?: number;
    threadCount?: number;
  };
}) {
  const items = [
    { label: "Users", value: stats?.userCount },
    { label: "Topics", value: stats?.topicCount },
    { label: "Channels", value: stats?.channelCount },
    { label: "Threads", value: stats?.threadCount },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 px-4 *:data-[slot=card]:shadow-xs lg:grid-cols-4 lg:px-6">
      {items.map((item) => (
        <Card key={item.label} data-slot="card" className="@container/card">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {item.value ?? "–"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
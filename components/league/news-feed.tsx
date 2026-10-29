import type { Snapshot } from "@/lib/schema";
import { dateLabel } from "./format";
import { Empty } from "../ui/primitives";
import { PixelIcon } from "../ui/pixel-icon";
export function NewsFeed({
  items,
  limit,
}: {
  items: Snapshot["news"];
  limit?: number;
}) {
  if (!items.length) return <Empty>No headlines for this selection.</Empty>;
  return (
    <div className="news-feed">
      {items.slice(0, limit).map((item) => (
        <a
          href={item.url}
          key={item.id}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="news-meta">
            <span>{item.source}</span>
            <time dateTime={item.publishedAt ?? undefined}>
              {item.publishedAt ? dateLabel(item.publishedAt) : ""}
            </time>
          </div>
          <h3>
            {item.title}
            <PixelIcon name="external" size={12} />
          </h3>
        </a>
      ))}
    </div>
  );
}

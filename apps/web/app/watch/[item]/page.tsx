import Studio from "../../../src/studio";
import { catalog } from "../../../src/rank";

export function generateStaticParams() { return catalog.map(({ id }) => ({ item: id })); }

export default async function Watch({ params }: { params: Promise<{ item: string }> }) {
  return <Studio view="watch" item={(await params).item} />;
}

import { Reader } from "@/components/Reader";
import { loadSampleData } from "@/pipeline/sample";

export default async function Home() {
  const data = await loadSampleData();
  return <Reader data={data} />;
}

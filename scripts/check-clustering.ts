// Runs story clustering on the starter pack and compares it with the story files:
//   npm run sample:cluster
//   npm run sample:cluster -- --threshold 0.25
// The story files put Launch Desk's Pulse 4 launch article in the Thrushwell recall story on
// purpose, for the X demo. Clustering groups it there too, since it shares the brand and the
// product line, so the demo shows X pulling out a grouping mistake the algorithm really makes.

import { loadSampleData } from "../src/pipeline/sample";
import { DEFAULT_THRESHOLD } from "../src/pipeline/cluster";
import { clusterInputs, scoreClustering } from "../src/pipeline/cluster-check";
import { formatPercent } from "../src/lib/format";

async function main(): Promise<void> {
  const flag = process.argv.indexOf("--threshold");
  const threshold = flag === -1 ? DEFAULT_THRESHOLD : Number(process.argv[flag + 1]);
  const data = await loadSampleData();
  const expected = new Map(data.clusters.flatMap((cluster) => cluster.articleIds.map((id) => [id, cluster.id] as const)));
  const score = scoreClustering(clusterInputs(data), expected, { threshold });
  const short = (id: string) => id.replace("urn:reader-sample:", "");

  console.log(`Threshold ${threshold}: ${score.groups.length} stories (answer key: ${data.clusters.length})`);
  console.log(`Precision ${formatPercent(score.precision)}, recall ${formatPercent(score.recall)}`);
  for (const [a, b] of score.wrongPairs) console.log(`  grouped, but different stories: ${short(a)} + ${short(b)}`);
  for (const [a, b] of score.missedPairs) console.log(`  same story, but kept apart: ${short(a)} + ${short(b)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { DAEMON_DEFAULT_PORT, type UsageSummary, type UsageWindow } from "@reef/shared";

const DAEMON = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}`;

export async function usage(args: string[]): Promise<void> {
  const windowIdx = args.indexOf("--window");
  const windowArg = windowIdx >= 0 ? args[windowIdx + 1] : "week";
  const validWindows: UsageWindow[] = ["day", "week", "month", "all"];
  if (!validWindows.includes(windowArg as UsageWindow)) {
    console.error(`window must be one of: ${validWindows.join(", ")}`);
    process.exit(1);
  }
  const window = windowArg as UsageWindow;

  const url = new URL(`${DAEMON}/api/usage/summary`);
  url.searchParams.set("window", window);
  let summary: UsageSummary;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`daemon returned ${res.status}`);
    summary = (await res.json()) as UsageSummary;
  } catch (err) {
    console.error(`daemon unreachable: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`window:     ${summary.window}`);
  console.log(`runs:       ${summary.runCount}`);
  console.log(`tokens in:  ${summary.tokensIn.toLocaleString()}`);
  console.log(`tokens out: ${summary.tokensOut.toLocaleString()}`);
  console.log(`cost:       $${summary.costUsd.toFixed(4)}`);

  if (summary.byModel.length > 0) {
    console.log("");
    console.log("by model:");
    for (const m of summary.byModel) {
      console.log(
        `  ${m.model.padEnd(40)} ${String(m.runs).padStart(4)} run${m.runs === 1 ? " " : "s"}  ${m.tokensIn.toLocaleString().padStart(8)}↓  ${m.tokensOut.toLocaleString().padStart(8)}↑  $${m.costUsd.toFixed(4)}`,
      );
    }
  }
}

import { DAEMON_DEFAULT_PORT } from "@roost/shared";

export async function stop(args: string[]): Promise<void> {
  const id = args[0];
  if (!id) {
    console.error("usage: roost stop <id>");
    process.exit(1);
  }
  const url = `http://127.0.0.1:${DAEMON_DEFAULT_PORT}/api/runs/${id}`;
  const res = await fetch(url, { method: "DELETE" });
  if (res.ok) {
    console.log(`stopped ${id}`);
  } else if (res.status === 404) {
    console.error(`no such run: ${id}`);
    process.exit(1);
  } else {
    console.error(`stop failed: ${res.status}`);
    process.exit(1);
  }
}

import { start } from "./commands/start.js";
import { status } from "./commands/status.js";
import { stop } from "./commands/stop.js";
import { next } from "./commands/next.js";

const [, , cmd = "start", ...args] = process.argv;

const commands: Record<string, (args: string[]) => Promise<void> | void> = {
  start,
  status,
  stop,
  next,
  help: () => printHelp(),
  "--help": () => printHelp(),
  "-h": () => printHelp(),
};

const handler = commands[cmd];
if (!handler) {
  console.error(`unknown command: ${cmd}\n`);
  printHelp();
  process.exit(1);
}

await handler(args);

function printHelp() {
  console.log(`reef — local AI cockpit

usage:
  reef start         start the daemon + web (foreground) and open the UI
  reef status        list current runs from the daemon
  reef stop <id>     stop a running agent
  reef next          start the highest-priority queued task and print its URL
  reef help          show this message
`);
}

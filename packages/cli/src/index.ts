import { start } from "./commands/start.js";
import { status } from "./commands/status.js";
import { stop } from "./commands/stop.js";
import { next } from "./commands/next.js";
import { dig } from "./commands/dig.js";
import { show } from "./commands/show.js";
import { petrify, fossilize } from "./commands/petrify.js";
import { brief } from "./commands/brief.js";
import { shutdown } from "./commands/shutdown.js";

const [, , cmd = "start", ...args] = process.argv;

const commands: Record<string, (args: string[]) => Promise<void> | void> = {
  start,
  shutdown,
  status,
  stop,
  next,
  dig,
  show,
  petrify,
  fossilize,
  brief,
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
  console.log(`reef — substrate beneath your codebase

workflow:
  reef start [--force]    start the daemon + web (or just open the UI if already up)
  reef shutdown           stop the running daemon gracefully
  reef status             daemon health + list of runs
  reef stop <id>          stop a running agent
  reef next               start the highest-priority queued task

strata:
  reef brief [<repo>]     preview the learnings that would prime an agent run
                          (defaults to cwd)
  reef dig <topic>        show learnings on a topic (bedrock → loam → topsoil)
                          flags: --repo <path> to scope by repo
  reef show <id>          show one learning in full
  reef petrify <id>       promote a learning to bedrock (load-bearing truth)
  reef fossilize <id>     mark a learning as outdated (preserved as history)

misc:
  reef help               show this message
`);
}

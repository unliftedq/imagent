import { Command } from "commander";

/**
 * Registers M3+ command surface as stubs that print "not implemented (Mn)".
 * `generate` and `config` are wired by their own modules at M2; everything
 * else lands in later milestones but is shown in `--help` for surface
 * visibility.
 */
export function registerStubCommands(program: Command): void {
  // video -------------------------------------------------------------
  program
    .command("video <prompt>")
    .description("Submit a video generation job (M3)")
    .option("--provider <id>", "Provider id (default: seedance)", "seedance")
    .option("--duration <sec>", "Clip duration in seconds")
    .option("--ref <paths>", "Comma-separated reference image paths")
    .option("--wait", "Block until job completes, printing progress")
    .action(notImplemented("M3"));

  // job ---------------------------------------------------------------
  const job = program.command("job").description("Inspect or control in-flight jobs (M3)");
  job.command("status <jobId>").description("Print current state and progress").action(notImplemented("M3"));
  job.command("cancel <jobId>").description("Cancel an in-flight job").action(notImplemented("M3"));
  job.command("watch <jobId>").description("Stream progress until terminal").action(notImplemented("M3"));

  // asset -------------------------------------------------------------
  const asset = program.command("asset").description("Manage Characters / Objects / Backgrounds / Styles (M3)");
  asset
    .command("add <kind>")
    .description("Add an asset (character|object|background|style)")
    .option("--name <name>", "Display name")
    .option("--ref <paths...>", "Reference image paths (repeatable)")
    .option("--prompt <snippet>", "Prompt snippet (style only)")
    .action(notImplemented("M3"));
  asset.command("list").description("List assets").action(notImplemented("M3"));
  asset.command("rm <id>").description("Remove an asset").action(notImplemented("M3"));
  asset.command("show <id>").description("Show full asset record").action(notImplemented("M3"));

  // board -------------------------------------------------------------
  const board = program.command("board").description("Manage boards / collections (M3)");
  board.command("create <name>").description("Create a new board").action(notImplemented("M3"));
  board
    .command("add <boardId> <itemId>")
    .description("Add a gallery item to a board")
    .action(notImplemented("M3"));
  board.command("ls").description("List boards").action(notImplemented("M3"));
  board.command("rm <boardId>").description("Delete a board").action(notImplemented("M3"));

  // gallery -----------------------------------------------------------
  const gallery = program.command("gallery").description("Browse and remix prior generations (M3)");
  gallery
    .command("ls")
    .option("--kind <kind>", "image|video")
    .option("--board <boardId>", "Filter by board")
    .description("List gallery items")
    .action(notImplemented("M3"));
  gallery
    .command("remix <itemId>")
    .description("Generate a new item from an existing one")
    .action(notImplemented("M3"));
  gallery.command("rm <itemId>").description("Delete a gallery item").action(notImplemented("M3"));
  gallery
    .command("favorite <itemId>")
    .description("Toggle favorite on a gallery item")
    .action(notImplemented("M3"));
}

function notImplemented(milestone: string): () => void {
  return () => {
    process.stdout.write(`not implemented (${milestone})\n`);
    process.exit(0);
  };
}

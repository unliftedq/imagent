import { Command } from "commander";

/**
 * Registers the rest of the CLI surface (architecture.md §9) as stubs that
 * print "not implemented (Mn)" with the milestone where each one lands.
 * The help text is fully populated so `imagine --help` reflects the v1
 * surface even at M1.
 */
export function registerStubCommands(program: Command): void {
  // generate ----------------------------------------------------------
  program
    .command("generate <prompt>")
    .description("Generate one or more images from a prompt (M2)")
    .option("--provider <id>", "Provider id (openai|azure-openai|google|flux-bfl|seedream)")
    .option("--model <id>", "Model id within the chosen provider")
    .option("--ref <paths>", "Comma-separated reference image paths")
    .option("--character <id>", "Attach a character asset")
    .option("--object <id>", "Attach an object asset")
    .option("--background <id>", "Attach a background asset")
    .option("--style <id>", "Attach a style asset")
    .option("--count <n>", "Number of outputs", "1")
    .option("--out <dir>", "Output directory override")
    .option("--board <id>", "Add result to a board")
    .action(notImplemented("M2"));

  // video -------------------------------------------------------------
  program
    .command("video <prompt>")
    .description("Submit a video generation job (M2)")
    .option("--provider <id>", "Provider id (default: seedance)", "seedance")
    .option("--duration <sec>", "Clip duration in seconds")
    .option("--ref <paths>", "Comma-separated reference image paths")
    .option("--wait", "Block until job completes, printing progress")
    .action(notImplemented("M2"));

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

  // config ------------------------------------------------------------
  const config = program.command("config").description("Inspect and edit ~/.imagine-studio/config.json (M3)");
  config.command("get [key]").description("Print full config or one key").action(notImplemented("M3"));
  config
    .command("set <key> <value>")
    .description("Set a dotted-path key (e.g. openai.apiKey)")
    .action(notImplemented("M3"));
  config.command("path").description("Print the absolute config.json path").action(notImplemented("M3"));
}

function notImplemented(milestone: string): () => void {
  return () => {
    process.stdout.write(`not implemented (${milestone})\n`);
    process.exit(0);
  };
}

import { parseArgs } from "node:util";
import { playGame, type GameOptions } from "./play";
import { addGame, emptyStats, formatStats } from "./stats";

const HELP = `Usage: pnpm sim [options]

  --games N        games to play (default 1000)
  --seed S         base seed; game i uses "<S>-<i>" (default "osg")
  --pack ID        scenario pack (default corentine)
  --variant ID     pack variant (default: the recommended one)
  --as FACTION     the player's faction (default essaveth)
  --turns N        4 to 8 (default: the variant's)
  --strong P       chance of grading an action Strong (default 0.5)
  --offer P        chance of an Offer to each AA per turn (default 0.5)
  --fon            use a Force of Nature whenever one is available
  --json           print the totals as JSON
`;

const { values } = parseArgs({
  // pnpm may pass a literal "--" through from `pnpm sim -- ...`.
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    games: { type: "string", default: "1000" },
    seed: { type: "string", default: "osg" },
    pack: { type: "string", default: "corentine" },
    variant: { type: "string" },
    as: { type: "string", default: "essaveth" },
    turns: { type: "string" },
    strong: { type: "string" },
    offer: { type: "string" },
    fon: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    help: { type: "boolean", default: false }
  }
});

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

const games = Number(values.games);
const options: GameOptions = {
  pack: values.pack,
  player: values.as,
  ...(values.variant ? { variant: values.variant } : {}),
  ...(values.turns ? { turns: Number(values.turns) } : {}),
  policy: {
    ...(values.strong ? { strong: Number(values.strong) } : {}),
    ...(values.offer ? { offer: Number(values.offer) } : {}),
    forceOfNature: values.fon
  }
};

const stats = emptyStats();
for (let i = 0; i < games; i++) addGame(stats, playGame(`${values.seed}-${i}`, options));

const header = `OSG Solo sim: ${games} games, seed "${values.seed}", ${options.pack}${options.variant ? `/${options.variant}` : ""} as ${options.player}`;
process.stdout.write(values.json ? `${JSON.stringify(stats, null, 2)}\n` : `${formatStats(stats, header)}\n`);

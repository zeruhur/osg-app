import { d6Script } from "@osg/dice/testing";
import { APPENDIX_B_DICE, APPENDIX_B_TURN_1 } from "../src/fixtures/appendix-b";
import { Game, appendixBSetup } from "./helpers";

export { APPENDIX_B_DICE, MERANTO_DEAL } from "../src/fixtures/appendix-b";

/** Plays Appendix B's Turn 1 through commands. Returns the game at the end of the turn. */
export function playAppendixBTurn1(rng = d6Script(...APPENDIX_B_DICE)): Game {
  const g = new Game(appendixBSetup(), rng);
  for (const command of APPENDIX_B_TURN_1) g.do(command);
  return g;
}

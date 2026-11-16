import aaActionsJson from "../data/aa-actions-generic.json";
import behaviorRulesJson from "../data/behavior-rules.json";
import coreJson from "../data/core.json";
import dispositionJson from "../data/disposition.json";
import generatorJson from "../data/generator.json";
import inspirationJson from "../data/inspiration.json";
import offerResultsJson from "../data/offer-results.json";
import corentineJson from "../data/packs/corentine.json";
import secretsJson from "../data/secrets-generic.json";
import signalsJson from "../data/signals.json";
import * as S from "./schemas";

// Parsed once at import: invalid data fails loudly here, before any game starts.
export const core: S.Core = S.Core.parse(coreJson);
export const behaviorRules: S.BehaviorRules = S.BehaviorRules.parse(behaviorRulesJson);
export const disposition: S.Disposition = S.Disposition.parse(dispositionJson);
export const offerResults: S.OfferResults = S.OfferResults.parse(offerResultsJson);
export const signals: S.Signals = S.Signals.parse(signalsJson);
export const genericSecrets: S.ByLeverage = S.ByLeverage.parse(secretsJson);
export const genericActions: S.ByLeverage = S.ByLeverage.parse(aaActionsJson);
export const inspiration: S.Inspiration = S.Inspiration.parse(inspirationJson);
export const generator: S.Generator = S.Generator.parse(generatorJson);

export const packs: Readonly<Record<string, S.ScenarioPack>> = {
  corentine: S.ScenarioPack.parse(corentineJson)
};

export * from "./schemas";
export { d66Row, faceRow, rangeRow } from "./lookup";

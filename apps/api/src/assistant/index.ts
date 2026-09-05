/**
 * TARE — L'ASSISTANT QUI PILOTE LE FRONT.
 *
 * REGLE D'OR (voir README.md, et __tests__/honesty.test.ts qui la fait respecter) :
 *   Le modele choisit QUOI interroger et explique CE QUI REVIENT.
 *   IL NE PRODUIT JAMAIS UN NOMBRE.
 *
 * Point d'entree unique du lot. Rien d'autre du depot n'est modifie : l'assistant
 * se monte sur l'API existante en une ligne, ou tourne seul (server.ts).
 */
export * from "./actions.js";
export * from "./flags.js";
export * from "./store.js";
export * from "./graph.js";
export * from "./narrate.js";
export * from "./planner.js";
export * from "./execute.js";
export * from "./session.js";
export * from "./llm.js";
export * from "./ask.js";
export { createAssistantRouter, registerAssistant, type AssistantDeps } from "./router.js";

/**
 * Content script — installs the guard in the page's own world at document_start.
 *
 * Kept deliberately thin: everything that decides anything lives in the library, so the extension
 * and a dapp that imports @tare/guard behave identically.
 */
import { installTareGuard } from "../src/browser.js";

installTareGuard({
  askOn: ["warn", "block"],
  onReport: (report) => {
    // One line per interception, so a user can see the guard working without opening anything.
    console.info("[TARE Guard]", report.verdict, report.hook ?? "(aucun hook mesure)", report.message);
  },
});

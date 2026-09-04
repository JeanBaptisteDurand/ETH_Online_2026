/**
 * docs/dataset/measurements.jsonl est rempli EN DIRECT par le moteur pendant que
 * la suite tourne. On l'ecarte par defaut : les tests s'appuient sur le jeu v1,
 * fige et publie. Un test dedie remet un jsonl (une fixture) pour verifier la
 * priorite des sources.
 */
process.env.TARE_JSONL_PATH = "/tare-tests/aucun-jsonl.jsonl";
process.env.X402_ENABLED = process.env.X402_ENABLED ?? "1";

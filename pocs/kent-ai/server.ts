import { startCustomerPocServer } from "../../src/poc-server.js";
import { kentAiPoc } from "./scenario.js";

startCustomerPocServer(kentAiPoc, { port: Number(process.env.DEMO_PORT ?? 4175) });

import { startCustomerPocServer } from "../../src/poc-server.js";
import { finfindrPoc } from "./scenario.js";

startCustomerPocServer(finfindrPoc, { port: Number(process.env.DEMO_PORT ?? 4174) });

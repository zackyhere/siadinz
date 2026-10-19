
import { httpServerHandler } from "cloudflare:node";
import { createAttendanceApiServer } from "./attendance-api-server.mjs";

const server = createAttendanceApiServer({
  accessToken: process.env.PRESENSI_ACCESS_TOKEN,
  apiSecret: process.env.PRESENSI_API_SECRET,
});

export default httpServerHandler(server);

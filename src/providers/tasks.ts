/**
 * Google Tasks API client
 */

import { google } from "googleapis";
import { auth } from "./gmail.ts";

export const tasks = google.tasks({ version: "v1", auth });

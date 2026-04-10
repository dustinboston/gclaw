/**
 * Google Calendar API client
 */

import { google } from "googleapis";
import { auth } from "./gmail.ts";

export const calendar = google.calendar({ version: "v3", auth });

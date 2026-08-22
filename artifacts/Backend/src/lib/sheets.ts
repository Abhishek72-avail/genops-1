import { google } from "googleapis";
import { logger } from "./logger";

const SHEET_NAME = "All Genset";
const DELIVERY_SHEET_NAME = "Delivery Records";
const HEADERS = ["Date", "Generator ID", "Status", "Rating", "Hours", "Remarks"];
const DELIVERY_HEADERS = ["Date", "Generator ID", "Status", "Rating", "Hours", "Remarks", "Delivery Status", "Delivered To"];

export const PANEL_SHEETS: readonly { id: string; title: string; prefixes: readonly string[] }[] = [];

/** Maps a Generator ID prefix to its C Panel ID, or "Other" if unrecognised. */
export function getGeneratorPanel(generatorId: string): string {
  return "Other";
}

/** Parses the Spreadsheet ID from a standard Google Sheets URL, or returns the raw string if it is already an ID. */
export function extractSpreadsheetId(link: string): string {
  const trimmed = link.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

/** Safely quote a sheet name for use in A1 range notation. */
function q(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

type SheetRow = {
  tDate: string;
  generatorId: string;
  status: string;
  rating?: string | null;
  hours?: number | null;
  remarks?: string | null;
  deliveryStatus?: string | null;
  deliveryTo?: string | null;
};

function cleanRemarks(remarks: string | null | undefined): string {
  if (!remarks) return "";
  try {
    if (remarks.startsWith("{") && remarks.endsWith("}")) {
      const parsed = JSON.parse(remarks);
      if (typeof parsed === "object" && parsed !== null && "text" in parsed) {
        return parsed.text || "";
      }
    }
  } catch (e) {
    // Ignore error, treat as raw string
  }
  return remarks;
}

function toValues(rows: SheetRow[]): string[][] {
  return [
    HEADERS,
    ...rows.map((r) => [
      r.tDate ?? "",
      r.generatorId ?? "",
      r.status ?? "",
      r.rating ?? "",
      r.hours != null ? String(r.hours) : "",
      cleanRemarks(r.remarks),
    ]),
  ];
}

function toDeliveryValues(rows: SheetRow[]): string[][] {
  return [
    DELIVERY_HEADERS,
    ...rows.map((r) => [
      r.tDate ?? "",
      r.generatorId ?? "",
      r.status ?? "",
      r.rating ?? "",
      r.hours != null ? String(r.hours) : "",
      cleanRemarks(r.remarks),
      r.deliveryStatus === "current" ? "Current Delivery" : "Previous Delivery",
      r.deliveryTo ?? "",
    ]),
  ];
}

/** In-memory cache of verified spreadsheetIds so we only check/create missing sub-sheets once per spreadsheet. */
const sheetsReady = new Set<string>();

async function ensureAllSheets(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  dynamicPanels: readonly { id: string; title: string; prefixes: readonly string[] | string[] }[]
): Promise<void> {
  const cacheKey = `${spreadsheetId}:${dynamicPanels.map((p) => p.id).join(",")}`;
  if (sheetsReady.has(cacheKey)) return;
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Set<string>(
    meta.data.sheets?.map((s) => s.properties?.title ?? "") ?? []
  );

  const allNeeded = [
    SHEET_NAME,
    ...dynamicPanels.map((p) => p.id),
    DELIVERY_SHEET_NAME,
  ];
  const toCreate = allNeeded.filter((title) => !existing.has(title));

  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: toCreate.map((title) => ({
          addSheet: { properties: { title } },
        })),
      },
    });
  }
  sheetsReady.add(cacheKey);
}

async function writeSheet(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  title: string,
  values: string[][]
): Promise<void> {
  const rangeRef = title === SHEET_NAME ? SHEET_NAME : q(title);
  const startRef = title === SHEET_NAME ? `${SHEET_NAME}!A1` : `${q(title)}!A1`;
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: rangeRef,
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: startRef,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

/**
 * Fully rebuilds Sheet1, all C Panel sub-sheets, and the Delivery Records sheet
 * from the current DB rows for a specific spreadsheet ID. Sub-sheets are created automatically on first call.
 */
export async function syncSheetFromDb(rows: SheetRow[], spreadsheetId: string, customPanelsJson?: string | null): Promise<void> {
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    // Parse custom panels if any
    let dynamicPanels: readonly { id: string; title: string; prefixes: readonly string[] | string[] }[] = PANEL_SHEETS;
    if (customPanelsJson) {
      try {
        const parsed = JSON.parse(customPanelsJson);
        if (Array.isArray(parsed)) {
          const merged = [...PANEL_SHEETS];
          const seen = new Set(PANEL_SHEETS.map((p) => p.id));
          for (const cp of parsed) {
            if (cp && cp.id && cp.prefixes && !seen.has(cp.id)) {
              merged.push({
                id: cp.id,
                title: cp.label || `${cp.id} - ${cp.prefixes[0]}`,
                prefixes: cp.prefixes,
              });
              seen.add(cp.id);
            }
          }
          dynamicPanels = merged;
        }
      } catch (e) {
        logger.error({ e }, "Failed to parse customPanels JSON");
      }
    }

    await ensureAllSheets(sheets, spreadsheetId, dynamicPanels);

    // Main sheet — all records
    await writeSheet(sheets, spreadsheetId, SHEET_NAME, toValues(rows));

    // C Panel sub-sheets — filtered by Generator ID prefix
    for (const panel of dynamicPanels) {
      const panelRows = rows.filter((r) => {
        const id = (r.generatorId || "").toUpperCase().trim();
        return panel.prefixes.some((prefix) => id.startsWith(prefix.toUpperCase()));
      });
      await writeSheet(sheets, spreadsheetId, panel.id, toValues(panelRows));
    }

    // Delivery Records sheet — only previous delivery rows
    const deliveryRows = rows.filter(
      (r) => r.deliveryStatus === "previous"
    );
    await writeSheet(sheets, spreadsheetId, DELIVERY_SHEET_NAME, toDeliveryValues(deliveryRows));
  } catch (err: any) {
    logger.error({ 
      message: err?.message, 
      status: err?.status, 
      details: err?.response?.data 
    }, "Failed to sync sheet from DB");
  }
}

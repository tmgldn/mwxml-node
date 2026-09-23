import type { Json } from "../json.js";

type JsonDoc = { [key: string]: Json };

function isPlainObject(value: Json): value is JsonDoc {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes `null` values (and the empty objects left behind) from a document
 * recursively.  Mirrors the Python implementation, including its quirk of
 * overwriting the accumulated `changed` flag with each recursive call's
 * return value.
 */
export function trimDict(doc: JsonDoc): boolean {
  let changed = false;
  const keysToDelete: string[] = [];
  for (const [key, value] of Object.entries(doc)) {
    if (value === null) {
      keysToDelete.push(key);
    } else if (isPlainObject(value)) {
      changed = trimDict(value);
      if (Object.keys(value).length === 0) {
        keysToDelete.push(key);
      }
    }
  }
  if (keysToDelete.length > 0) {
    changed = true;
  }
  for (const key of keysToDelete) {
    delete doc[key];
  }
  return changed;
}

/**
 * Converts a stream of revision documents that validated against past
 * schemas into documents that will validate against the latest schema.
 *
 * This operates on the legacy (snake_case) revision document format of the
 * Python `mwxml` ecosystem.
 */
export async function *normalize(
  revDocs: AsyncIterable<JsonDoc>,
  verbose = false,
): AsyncGenerator<JsonDoc, void, void> {
  for await (const revDoc of revDocs) {
    let changed = false;

    if ("page" in revDoc && isPlainObject(revDoc.page)) {
      const page = revDoc.page;

      // Converts page.redirect_title to page.redirect
      if ("redirect_title" in page) {
        page.redirect = page.redirect_title;
        delete page.redirect_title;
        changed = true;
      }

      // Converts page.redirect.title to page.redirect
      if (
        "redirect" in page &&
        isPlainObject(page.redirect) &&
        "title" in page.redirect
      ) {
        page.redirect = page.redirect.title;
        // No deletion necessary since we're replacing the old key
        changed = true;
      }
    }

    if ("contributor" in revDoc) {
      const contributorDoc =
        isPlainObject(revDoc.contributor) ? revDoc.contributor : {};
      const userDoc: JsonDoc = {};
      if ("id" in contributorDoc) {
        userDoc.id = contributorDoc.id;
      }
      if ("user_text" in contributorDoc) {
        userDoc.text = contributorDoc.user_text;
      }

      revDoc.user = userDoc;
      delete revDoc.contributor;
      changed = true;
    }

    changed = trimDict(revDoc) || changed;

    if (verbose) {
      process.stderr.write(changed ? "!" : ".");
    }

    yield revDoc;
  }
}

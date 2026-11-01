// Where an order's wall photograph lives in the private corporate-art store,
// and how the installer's sheet chooses between it and a survey photo.
// Pure, so the route, the sheet and the test agree on one spelling.

/** One photo per order, replaced in place. Derived from the order id only —
 *  never from anything a caller sends. */
export const orderWallPhotoPath = (orderId: string) => `orders/${orderId}/wall.jpg`;

/** Where the browser's upload lands before it has been read. The recorded
 *  photo is written only once the upload proves to be a photo, so a failed
 *  replacement never overwrites the one already on the order. */
export const orderWallPhotoUploadPath = (orderId: string) => `orders/${orderId}/wall.upload`;

/** The photo the sheet shows for one order. The order's own photo wins: it was
 *  taken for THIS print, where a survey photo is matched by wall name and may
 *  be another visit's. */
export function sheetPhotoFor<T>(own: T | undefined, survey: T | undefined): T | undefined {
  return own ?? survey;
}

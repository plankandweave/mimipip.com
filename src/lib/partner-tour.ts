/** Browser-local onboarding; these display roles never grant account permissions. */
export const PORTAL_TOUR_VERSION = "1";
export type TourIdentity = {
  memberKey: string;
  canBuild: boolean;
  canPurchase: boolean;
  isAdmin: boolean;
};
export type TourPage = "projects" | "team" | "documents";
export type TourStep = {
  target: string;
  fallback?: string;
  title: string;
  body: string;
};
export function tourStorageKey(slug: string, identity: TourIdentity): string {
  return `partner-tour:${slug}:${encodeURIComponent(identity.memberKey)}:${Number(identity.canBuild)}${Number(identity.canPurchase)}${Number(identity.isAdmin)}:v${PORTAL_TOUR_VERSION}`;
}
export function tourSteps(page: TourPage, identity: TourIdentity): TourStep[] {
  const navigation: TourStep = {
    target: '[data-portal-tour="navigation"]',
    title: "Your portal shortcuts",
    body: "Projects holds your customer work. Team shows account access. Documents contains the training guide. Take a tour reopens this guide whenever you need it.",
  };
  if (page === "documents")
    return [
      navigation,
      {
        target: '[data-portal-tour="documents"]',
        title: "HomeLane training documents",
        body: "The HomeLane folder holds your team's portal guide. Every active HomeLane member can read it, including colleagues without specifying or purchasing access.",
      },
      {
        target: '[data-portal-tour="download"]',
        fallback: '[data-portal-tour="documents"]',
        title: "Keep the guide handy",
        body: "Download the PDF to read or share with your HomeLane team. Document access does not grant permission to prepare walls or release an order.",
      },
    ];
  if (page === "team")
    return [
      navigation,
      ...(identity.isAdmin
        ? [
            {
              target: '[data-portal-tour="invite"]',
              title: "Give a colleague access",
              body: "Enter their @homelane.com email and name. Choose Member or Admin. Admin manages access; purchasing is a separate permission. This tour never adds anyone.",
            },
            {
              target: '[data-portal-tour="permissions"]',
              fallback: '[data-portal-tour="invite"]',
              title: "Choose the right permissions",
              body: "Specify walls lets a colleague create options and record customer decisions. Purchasing lets them confirm accepted choices and upload a PO. Grant only the permissions their job needs.",
            },
          ]
        : []),
      {
        target: '[data-portal-tour="roster"]',
        title: "Check your team",
        body: identity.isAdmin
          ? "Review each colleague's permissions and shipment emails here. Your own purchasing permission cannot be elevated from this page."
          : "See which colleagues can specify walls or purchase. Ask your HomeLane admin if you need a permission changed.",
      },
    ];
  return [
    navigation,
    {
      target: '[aria-label="Customer"]',
      fallback: '[data-portal-tour="projects"]',
      title: "Keep work under the right customer",
      body: "Choose a customer project before working on a room or wall. Customer IDs keep similar names and separate jobs from getting mixed up.",
    },
    ...(identity.canBuild
      ? [
          {
            target: '[data-portal-tour="create-customer"]',
            fallback: '[data-portal-tour="projects"]',
            title: "Start a customer project",
            body: "Create a project using the customer's ID and name. Each room and wall option belongs to that customer. Existing projects stay available in the customer selector.",
          },
          {
            target: '[aria-label="Search catalogue"]',
            fallback: '[data-portal-tour="projects"]',
            title: "Find a design",
            body: "Start from the look you have in mind — a theme, motif or colour — or just explore. Selecting a design opens its wall controls. HomeLane uses catalogue artwork and the account's eligible materials and pricing.",
          },
          {
            target: '[data-portal-tour="wall"]',
            fallback: "#option-editor",
            title: "Name and measure the wall",
            body: "After choosing a design, enter the room name, wall identifier, width and height in millimetres. Choose the available material. Check your measurements before saving.",
          },
          {
            target: '[aria-label="zoom"]',
            fallback: "#option-editor",
            title: "Adjust the print composition",
            body: "Use zoom and horizontal/vertical position to choose the crop. Flip controls mirror that selected crop. The Print composition preview shows what will be saved; choose a design first to reveal these controls.",
          },
          {
            target: '[data-portal-tour="openings"]',
            fallback: "#option-editor",
            title: "Account for openings",
            body: "Add each door or opening using width, height and offset in millimetres. The outlined area appears on the print composition. Check it against the measured wall.",
          },
          {
            target: '[data-portal-tour="room-photo"]',
            fallback: "#option-editor",
            title: "Preview in the customer's room",
            body: "A room photograph is optional. Place the four wall corners to see the composition in the room. The photograph helps the customer visualise; it does not replace the measured print composition.",
          },
          {
            target: '[data-portal-tour="save"]',
            fallback: "#option-editor",
            title: "Save an exact option",
            body: "Save the option after checking its composition, measurements and material. A revision creates a new option with its own history. Saving keeps work private to HomeLane and does not send it to production.",
          },
          {
            target: '[data-portal-tour="decisions"]',
            title: "Record the customer's decision",
            body: "Accept the exact choice the customer approved, reject an unwanted option, or revise/supersede it. Only accepted, unreleased options can move to purchasing. Acceptance alone does not create a production order.",
          },
        ]
      : []),
    ...(identity.canPurchase
      ? [
          {
            target: '[data-portal-tour="purchasing"]',
            fallback: '[data-portal-tour="projects"]',
            title: "Confirm accepted selections",
            body: "Select the exact accepted options for one PO. Rejected or draft options cannot be selected. Check the shipping contact, address, pincode, GST and billing details before confirming.",
          },
          {
            target: '[data-portal-tour="confirm"]',
            fallback: '[data-portal-tour="purchasing"]',
            title: "Confirmation waits for the PO",
            body: "Confirm selections for PO creates a saved package. It remains 'Order confirmed, however, not sent ahead. Awaiting PO.' Nothing is released until a valid PO is accepted.",
          },
          {
            target: '[data-portal-tour="po"]',
            fallback: '[data-portal-tour="confirmations"]',
            title: "Accept the PO to release",
            body: "Open the confirmed package, enter its PO number and upload the actual PDF, JPEG or PNG. Accepting the PO starts automatic release of the confirmed selections. The portal sends the order automatically after PO acceptance.",
          },
          {
            target: '[data-portal-tour="confirmations"]',
            title: "Follow release and dispatch",
            body: "The saved package shows PO and release status, then dispatch tracking when available. The dispatch promise is seven calendar days from PO acceptance. It is a dispatch promise, not a delivery date.",
          },
        ]
      : []),
    ...(!identity.canBuild && !identity.canPurchase
      ? [
          {
            target: '[data-portal-tour="navigation"]',
            title: "Your current access",
            body: "Your account permissions determine which controls appear. Team and Documents remain available. Ask your HomeLane admin for specifying or purchasing access when your role requires it.",
          },
        ]
      : []),
  ];
}
export function nextTourPage(
  page: TourPage,
  identity: TourIdentity,
): TourPage | null {
  return page === "projects"
    ? identity.isAdmin
      ? "team"
      : "documents"
    : page === "team"
      ? "documents"
      : null;
}
export function tourCardPosition(
  target: { left: number; top: number; width: number; height: number } | null,
  viewport: { width: number; height: number },
  cardHeight = 290,
) {
  const width = Math.min(360, Math.max(0, viewport.width - 24));
  const left = Math.max(
    12,
    Math.min(
      viewport.width - width - 12,
      target
        ? target.left + target.width / 2 - width / 2
        : (viewport.width - width) / 2,
    ),
  );
  const below = target
    ? target.top + target.height + 18
    : viewport.height / 2 - cardHeight / 2;
  const top =
    viewport.width < 640
      ? Math.max(12, viewport.height - cardHeight - 16)
      : Math.max(
          12,
          Math.min(
            viewport.height - cardHeight - 12,
            below + cardHeight < viewport.height
              ? below
              : (target?.top ?? viewport.height / 2) - cardHeight - 18,
          ),
        );
  return { left, top, width };
}

export function canContinueTour(
  raw: string | null,
  page: TourPage,
  now: number,
): boolean {
  try {
    const pending: unknown = JSON.parse(raw || "null");
    if (!pending || typeof pending !== "object") return false;
    const value = pending as { page?: unknown; at?: unknown };
    return (
      value.page === page &&
      typeof value.at === "number" &&
      Number.isFinite(value.at) &&
      value.at <= now &&
      now - value.at < 120000
    );
  } catch {
    return false;
  }
}

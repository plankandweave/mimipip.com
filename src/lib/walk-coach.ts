// What to say to somebody who is mid-walk, holding a phone.
//
// A pure function of how long they have been recording and how many walls they
// have marked, so the recorder can talk them through it without anyone having
// been trained, and so the wording can be tested rather than eyeballed once.
//
// The shape of the coaching matters more than the words:
//
//   · it changes as they go, so it is never a static caption they stop reading;
//   · it asks for ONE thing at a time — speak, then mark, then move on;
//   · it never scolds. Somebody who has recorded a minute without marking
//     anything is not doing it wrong, they are walking to the first wall.
//
// Kept deliberately short. This is read at arm's length, in a lobby, while
// walking.

export type Coach = {
  /** The instruction, imperative, one action. */
  say: string;
  /** True when the person should be pressing the mark button right now — the
   *  recorder makes it the loudest thing on screen when this is set. */
  urging: boolean;
};

/** Long enough to say where you are before being asked to do anything else. */
const SETTLE_S = 8;
/** When the cap is close enough that it should be mentioned. */
const WARN_REMAINING_S = 25;

export function coachWalker(opts: {
  seconds: number;
  marks: number;
  maxSeconds: number;
  /** Seconds since the last mark, when there has been one. */
  sinceMark?: number | null;
}): Coach {
  const { seconds, marks, maxSeconds } = opts;
  const remaining = maxSeconds - seconds;

  if (remaining <= WARN_REMAINING_S) {
    return {
      say: marks === 0
        ? "Nearly out of time — press Mark this wall for the wall in front of you."
        : "Nearly out of time. Press Finish, or keep marking until it stops.",
      urging: marks === 0,
    };
  }

  if (marks === 0) {
    if (seconds < SETTLE_S) {
      return { say: "Say where you are and what this space is for.", urging: false };
    }
    return {
      say: "Now face a wall you want done, and press Mark this wall.",
      urging: true,
    };
  }

  // Just marked: the useful thing is to describe what they have just captured,
  // while they are still standing in front of it.
  if (opts.sinceMark != null && opts.sinceMark < SETTLE_S) {
    return {
      say: `Wall ${marks} marked. Say what it should do — then walk to the next one.`,
      urging: false,
    };
  }

  return { say: "Facing another wall? Press Mark this wall.", urging: true };
}

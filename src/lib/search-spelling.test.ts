import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLexicon, correctSearchQuery, correctWord, editDistance, editBudget } from "./search-spelling";
import { roomQueryVocabulary } from "./rooms";

// A slice of the real shelf: counts are how often titles/tags/collections name
// the word; 0 is a word known only through the index (descriptions).
const lexicon = buildLexicon(
  [
    ["piano", 135], ["rooms", 140], ["room", 900], ["living", 772], ["bedroom", 300],
    ["pooja", 90], ["floral", 200], ["flower", 40], ["wallpaper", 950],
    ["string", 3], ["cypress", 2], ["passage", 4], ["bull", 12], ["cat", 1],
    ["marble", 30], ["peacock", 25], ["rose", 6],
    ["sunset", 0], ["shrine", 0],
  ],
  roomQueryVocabulary(),
);

test("the founder's search: paino → piano, alone and in a phrase", () => {
  assert.deepEqual(correctSearchQuery("paino", lexicon), { query: "piano", changed: true });
  assert.deepEqual(correctSearchQuery("paino room", lexicon), { query: "piano room", changed: true });
  assert.deepEqual(correctSearchQuery("Paino Rooms", lexicon), { query: "piano Rooms", changed: true });
});

test("one edit of every kind is found on a four-to-seven letter word", () => {
  assert.equal(correctWord("bedrom", lexicon), "bedroom");   // missing letter
  assert.equal(correctWord("bedroomm", lexicon), "bedroom"); // extra letter (8 letters, 2 allowed)
  assert.equal(correctWord("pooja", lexicon), undefined);    // already right
  assert.equal(correctWord("pouja", lexicon), "pooja");      // wrong letter
  assert.equal(correctWord("marbel", lexicon), "marble");    // swapped pair
});

test("a word the catalogue knows, or a prefix of one, is never corrected", () => {
  assert.equal(correctWord("piano", lexicon), undefined);
  assert.equal(correctWord("pian", lexicon), undefined);     // prefix search finds pianos already
  assert.equal(correctWord("sunset", lexicon), undefined);   // known via descriptions, n = 0
  assert.equal(correctWord("shrine", lexicon), undefined);   // room vocabulary, not nudged to "string"
  assert.deepEqual(correctSearchQuery("blue peacock", lexicon), { query: "blue peacock", changed: false });
});

test("short words and design codes are left alone", () => {
  assert.equal(editBudget("cat"), 0);
  assert.equal(editBudget("ZW1042"), 0);
  assert.equal(correctWord("cta", lexicon), undefined);
  assert.equal(correctWord("zw1042", lexicon), undefined);
});

test("two edits need eight letters; a six-letter word gets one", () => {
  assert.equal(editBudget("shrine"), 1);
  assert.equal(editBudget("wallpapr"), 2);
  assert.equal(correctWord("wallpapr", lexicon), "wallpaper");
  assert.equal(correctWord("wallppr", lexicon), undefined);  // 7 letters, 2 edits away
});

test("ties go to the closer word, then the more frequent one, then alphabetical", () => {
  // "flowr" is one edit from "flower" (insert e); "floral" is two away.
  assert.equal(correctWord("flowr", lexicon), "flower");
  // "rooms" vs "room": "roos" is one edit from both; "room" is the more frequent.
  assert.equal(correctWord("roos", lexicon), "room");
});

test("a correction target comes only from the shelf, never from the index alone", () => {
  // "sunset" is known (n = 0) but is not reached for: "sunsat" has no target.
  assert.equal(correctWord("sunsat", lexicon), undefined);
});

test("edit distance counts a swap as one and stops early past the budget", () => {
  assert.equal(editDistance("paino", "piano"), 1);
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("kitten", "sitting", 1), 2);
  assert.equal(editDistance("abc", "abcdef", 2), 3);
  assert.equal(editDistance("same", "same"), 0);
});

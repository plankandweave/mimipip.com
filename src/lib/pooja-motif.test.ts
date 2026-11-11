// A puja room is a Hindu shrine, and the scene picker cannot tell that on its
// own — it is asked to read "sacred geometry" as devotional, and a symmetrical
// jewel-toned medallion is sacred geometry to any classifier. That is how a
// Mughal ceiling rose came to be rendered as the wall behind a mandir, and how
// twenty-two Mughal-named designs came to be merchandised into puja rooms.
//
// The half of this that is easy to get wrong is the other direction: the ban is
// matched on names, and naive substring matching bans "Pushpanjali" — a Sanskrit
// offering of flowers, and about the most puja-room name in the catalogue. Both
// directions are pinned here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allowsPoojaScene, stripPoojaForMotif, stripPoojaTags } from "./studio-scenes";

test("designs named for an Indo-Islamic dynasty, court or monument are barred", () => {
  for (const name of [
    "Mughal Medallion",
    "Mughal Medallion V",
    "mughal ceiling",
    "Taj Reverie",
    "Sultan's Arcadia",
    "Nizam Dusk",
    "Arabesque Bloom",
    "Minaret Sky",
    "Mehrab Kamal",
  ]) {
    assert.equal(allowsPoojaScene(name), false, `"${name}" should not be offered as puja imagery`);
  }
});

test("Sanskrit and Hindu names are never caught by a substring", () => {
  // "Pushpanjali" contains "jali"; "Vitaj" would contain "taj". Word boundaries
  // are the whole reason this passes — drop them and the first name here fails.
  for (const name of [
    "Pushpanjali (पुष्पांजलि)",
    "Mandala Yantra",
    "Meenakari Medallion",
    "Chhatri Ceiling",
    "Rajwada Gateway",
    "Vatika Blossom",
    "Amer Garden",
    "Naivedya (नैवेद्य)",
  ]) {
    assert.equal(allowsPoojaScene(name), true, `"${name}" is a legitimate puja-room design`);
  }
});

test("stripping removes only pooja, and leaves an allowed design untouched", () => {
  assert.deepEqual(
    stripPoojaForMotif(["pooja", "closeup", "living"], "Mughal Medallion"),
    ["closeup", "living"],
  );
  assert.deepEqual(
    stripPoojaForMotif(["pooja", "closeup"], "Mandala Yantra"),
    ["pooja", "closeup"],
  );
});

// The second way in, found live: three TAASH designs — a deck of playing cards
// on aged limestone paper — were merchandised into the Pooja Room collection.
// They were never rendered by the Studio, so the scene guard above never saw
// them; the retag repair pass wrote the room tag directly. Cards are a vice in
// exactly the households that keep a mandir, so this is not a near miss.
test("gambling and playing-card names are barred, in Hindi as well as English", () => {
  for (const name of [
    "Ikka — Hukum",
    "Ikka — Paan",
    "Bisaat — Ghisa",
    "Taash Ghar",
    "Joker",
    "Poker Night",
    "Ace of Spades",
  ]) {
    assert.equal(allowsPoojaScene(name), false, `"${name}" should not be offered as puja imagery`);
  }
});

// The one no name rule can ever catch. "Dhoop" is incense — about the most
// puja-room word in the catalogue — printed over a sheet of club symbols. Only
// the collection it belongs to gives it away.
test("a design in a barred collection is barred however devotional its name", () => {
  assert.equal(allowsPoojaScene("Dhoop"), true, "the name alone is innocent, and that is the point");
  assert.equal(allowsPoojaScene("Dhoop", ["TAASH", "Zyvorah × Mati"]), false);
  assert.equal(allowsPoojaScene("Mandala Yantra", ["Indian Ethnic"]), true);
});

test("the tag strip removes the room and the devotional style word, nothing else", () => {
  assert.deepEqual(
    stripPoojaTags(["Brown", "Pooja Room", "Spiritual", "Vintage"], "Ikka — Hukum"),
    ["Brown", "Vintage"],
  );
  // Proposed tags carry browse words; the collection tag lives on the design.
  assert.deepEqual(
    stripPoojaTags(["Pooja Room", "Neutral"], "Dhoop", ["TAASH"]),
    ["Neutral"],
  );
  assert.deepEqual(
    stripPoojaTags(["Pooja Room", "Spiritual"], "Pushpanjali (पुष्पांजलि)"),
    ["Pooja Room", "Spiritual"],
  );
});

test("a barred collection also loses the pooja scene", () => {
  assert.deepEqual(stripPoojaForMotif(["pooja", "closeup"], "Dhoop", ["TAASH"]), ["closeup"]);
  assert.deepEqual(stripPoojaForMotif(["pooja", "closeup"], "Dhoop"), ["pooja", "closeup"]);
});

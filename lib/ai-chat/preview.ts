export const AI_CHAT_PREVIEW_CHARACTERS = 120;
// The list query hands over only this much of the latest message to flatten.
export const AI_CHAT_PREVIEW_SOURCE_CHARACTERS = 600;

const WHITESPACE = /\s/u;

/** Drops ``` fenced blocks (an unterminated fence runs to the end) with one linear pass. */
function dropFencedCode(text: string) {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("```", index);
    if (open < 0) return result + text.slice(index);
    result += `${text.slice(index, open)} `;
    const close = text.indexOf("```", open + 3);
    if (close < 0) return result;
    index = close + 3;
  }
  return result;
}

/** `[label](url)` and `![alt](url)` keep only their label. */
function keepLinkLabels(text: string) {
  let result = "";
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("[", index);
    if (open < 0) break;
    const close = text.indexOf("]", open + 1);
    const closeLink = close >= 0 && text[close + 1] === "(" ? text.indexOf(")", close + 2) : -1;
    if (closeLink < 0) {
      result += text.slice(index, open + 1);
      index = open + 1;
      continue;
    }
    const imageMarker = open > index && text[open - 1] === "!" ? 1 : 0;
    result += text.slice(index, open - imageMarker) + text.slice(open + 1, close);
    index = closeLink + 1;
  }
  return result + text.slice(index);
}

/** Removes a Markdown block marker (heading, quote, list bullet or number) from a line start. */
function stripBlockMarker(line: string) {
  let index = 0;
  while (index < 3 && (line[index] === " " || line[index] === "\t")) index += 1;
  const markerStart = index;
  if (line[index] === "#") {
    while (line[index] === "#" && index - markerStart < 6) index += 1;
  } else if (line[index] === ">" || line[index] === "-" || line[index] === "*" || line[index] === "+") {
    index += 1;
  } else {
    while (line[index] >= "0" && line[index] <= "9") index += 1;
    if (index === markerStart || (line[index] !== "." && line[index] !== ")")) return line;
    index += 1;
  }
  if (line[index] !== " " && line[index] !== "\t") return line;
  while (line[index] === " " || line[index] === "\t") index += 1;
  return line.slice(index);
}

function trimUnderscores(word: string) {
  let start = 0;
  let end = word.length;
  while (start < end && word[start] === "_") start += 1;
  while (end > start && word[end - 1] === "_") end -= 1;
  return word.slice(start, end);
}

/** Collapses every whitespace run to one space and trims the ends. */
function collapseWhitespace(text: string) {
  const words: string[] = [];
  let word = "";
  for (const character of text) {
    if (WHITESPACE.test(character)) {
      if (word) words.push(word);
      word = "";
    } else {
      word += character;
    }
  }
  if (word) words.push(word);
  return words.join(" ");
}

/**
 * Flattens Markdown into one short plain-text line for chat lists: code blocks
 * are dropped, links keep their label, markers and line breaks disappear.
 * Built from linear scans, so hostile input cannot make it slow.
 */
export function toChatPreview(source: string | null | undefined) {
  if (!source) return "";
  const text = keepLinkLabels(dropFencedCode(source.slice(0, AI_CHAT_PREVIEW_SOURCE_CHARACTERS)));
  const flattened = text
    .split("\n")
    .map(stripBlockMarker)
    .join(" ")
    .replaceAll("`", "")
    .replaceAll("*", "")
    .replaceAll("~", "");
  const plain = collapseWhitespace(flattened)
    .split(" ")
    .map(trimUnderscores)
    .filter(Boolean)
    .join(" ");
  const characters = [...plain];
  return characters.length > AI_CHAT_PREVIEW_CHARACTERS
    ? `${characters.slice(0, AI_CHAT_PREVIEW_CHARACTERS - 1).join("").trimEnd()}…`
    : plain;
}

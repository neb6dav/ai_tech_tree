function strictJsonError(label, message) {
  return new Error(`strict-json: ${label} ${message}`);
}

function pointerSegment(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

function assertUniqueKeys(text, label) {
  let index = 0;

  function fail(message) {
    throw strictJsonError(label, `${message} at byte ${Buffer.byteLength(text.slice(0, index), 'utf8')}`);
  }

  function skipWhitespace() {
    while (index < text.length && /[\u0020\u0009\u000a\u000d]/u.test(text[index])) index += 1;
  }

  function parseString() {
    if (text[index] !== '"') fail('contains malformed JSON');
    const start = index;
    index += 1;
    while (index < text.length) {
      const character = text[index];
      if (character === '"') {
        index += 1;
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          fail('contains an invalid JSON string');
        }
      }
      if (character === '\\') {
        index += 1;
        if (index >= text.length) fail('contains an unterminated JSON escape');
        if (text[index] === 'u') {
          const escape = text.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(escape)) fail('contains an invalid JSON Unicode escape');
          index += 5;
          continue;
        }
        if (!/["\\/bfnrt]/u.test(text[index])) fail('contains an invalid JSON escape');
        index += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail('contains an unescaped control character');
      index += 1;
    }
    fail('contains an unterminated JSON string');
  }

  function parseArray(pointer) {
    index += 1;
    skipWhitespace();
    if (text[index] === ']') {
      index += 1;
      return;
    }
    let itemIndex = 0;
    while (index < text.length) {
      parseValue(`${pointer}/${itemIndex}`);
      itemIndex += 1;
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail('contains a malformed JSON array');
      index += 1;
      skipWhitespace();
    }
    fail('contains an unterminated JSON array');
  }

  function parseObject(pointer) {
    index += 1;
    skipWhitespace();
    if (text[index] === '}') {
      index += 1;
      return;
    }
    const keys = new Set();
    while (index < text.length) {
      const key = parseString();
      const childPointer = `${pointer}/${pointerSegment(key)}`;
      if (keys.has(key)) throw strictJsonError(label, `contains duplicate key ${childPointer}`);
      keys.add(key);
      skipWhitespace();
      if (text[index] !== ':') fail('contains a malformed JSON object');
      index += 1;
      parseValue(childPointer);
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return;
      }
      if (text[index] !== ',') fail('contains a malformed JSON object');
      index += 1;
      skipWhitespace();
    }
    fail('contains an unterminated JSON object');
  }

  function parseValue(pointer) {
    skipWhitespace();
    const character = text[index];
    if (character === '{') return parseObject(pointer);
    if (character === '[') return parseArray(pointer);
    if (character === '"') {
      parseString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(index));
    if (number) {
      index += number[0].length;
      return;
    }
    fail('contains an invalid JSON value');
  }

  parseValue('#');
  skipWhitespace();
  if (index !== text.length) fail('contains trailing data');
}

export function parseStrictJson(bytes, label = 'document') {
  if (!Buffer.isBuffer(bytes)) throw strictJsonError(label, 'must be supplied as bytes');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw strictJsonError(label, 'must be valid UTF-8');
  if (text.startsWith('\ufeff')) throw strictJsonError(label, 'must not contain a UTF-8 BOM');
  if (text.includes('\u0000')) throw strictJsonError(label, 'must not contain NUL bytes');
  if (/\r(?!\n)/u.test(text)) throw strictJsonError(label, 'must not contain lone carriage returns');
  assertUniqueKeys(text, label);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw strictJsonError(label, `is not valid JSON: ${error.message}`);
  }
}

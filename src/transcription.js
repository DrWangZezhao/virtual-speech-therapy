import {Converter} from 'opencc-js';

const simplified = Converter({from:'tw', to:'cn'});
const word = /[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu;

function units(value, language) {
  const text = value.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'");
  if (language === 'zh-CN') {
    return [...simplified(text).replace(/[^\p{L}\p{M}\p{N}]/gu, '')];
  }
  return text.match(word) ?? [];
}

function editDistance(reference, heard) {
  let previous = Array.from({length:heard.length + 1}, (_, index) => index);
  for (const [index, expected] of reference.entries()) {
    const next = [index + 1];
    for (const [column, actual] of heard.entries()) {
      next.push(Math.min(next[column] + 1, previous[column + 1] + 1, previous[column] + Number(expected !== actual)));
    }
    previous = next;
  }
  return previous.at(-1);
}

export function compareTranscription(target, heard, language) {
  const expected = units(target, language);
  const actual = typeof heard === 'string' ? units(heard, language) : [];
  if (!expected.length || !actual.length) {
    return {status:typeof heard === 'string' ? 'empty' : 'unavailable', edits:null, errorRate:null, expected, actual};
  }
  const edits = editDistance(expected, actual);
  return {status:edits === 0 ? 'matched' : 'different', edits, errorRate:edits / expected.length, expected, actual};
}
